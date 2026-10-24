(() => {
  'use strict';
  if (window.__dcwInstalled) return;
  window.__dcwInstalled = true;

  const PREFIX = 'dcw';
  let forecast = null;
  let stale = false;
  let enabled = true;
  let lastDataFetch = 0;
  let redrawTimer = null;
  let inFlight = false;
  let pendingRefetch = false;
  let observedPath = location.pathname;
  let cityName = 'Denver';
  let cityTimezone = 'America/Denver';
  let cityUnit = 'fahrenheit';

  // Calendar's datekey bit-packing is used for calendar date navigation.
  // See the README for known Google Calendar DOM compatibility limitations.
  function decodeDatekey(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 0) return null;
    const day = n & 31;
    const month = (n >> 5) & 15;
    const year = (n >> 9) + 1970;
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
    const verify = new Date(Date.UTC(year, month - 1, day));
    if (verify.getUTCMonth() !== month - 1 || verify.getUTCDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  function dateOf(el) {
    if (!el) return null;
    const holder = el.hasAttribute('data-datekey') ? el : el.querySelector('[data-datekey]');
    return holder ? decodeDatekey(holder.getAttribute('data-datekey')) : null;
  }
  function condition(code) {
    const c = Number(code);
    if (c === 0) return ['☀️', 'Sunny'];
    if (c === 1) return ['🌤️', 'Mostly sunny'];
    if (c === 2) return ['⛅', 'Partly cloudy'];
    if (c === 3) return ['☁️', 'Cloudy'];
    if (c === 45 || c === 48) return ['🌫️', 'Foggy'];
    if (c >= 51 && c <= 57) return ['🌦️', 'Drizzle'];
    if (c >= 61 && c <= 67) return ['🌧️', 'Rain'];
    if (c >= 71 && c <= 77) return ['❄️', 'Snow'];
    if (c >= 80 && c <= 82) return ['🌧️', 'Showers'];
    if (c === 85 || c === 86) return ['🌨️', 'Snow showers'];
    if (c >= 95 && c <= 99) return ['⛈️', 'Thunderstorms'];
    return ['🌡️', 'Forecast'];
  }
  function dailyFor(iso) {
    if (!forecast?.daily?.time) return null;
    const i = forecast.daily.time.indexOf(iso);
    if (i < 0) return null;
    const d = forecast.daily;
    const min = Number(d.temperature_2m_min[i]);
    const max = Number(d.temperature_2m_max[i]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    const pct = Array.isArray(d.precipitation_probability_max) ? Number(d.precipitation_probability_max[i]) : NaN;
    const [emoji, label] = condition(d.weather_code[i]);
    return { low: Math.round(min), high: Math.round(max), emoji, label, precip: Number.isFinite(pct) ? Math.round(pct) : null };
  }
  function makeBadge(iso, placement) {
    const day = dailyFor(iso);
    if (!day) return null;
    const badge = document.createElement('span');
    badge.className = `dcw-weather dcw-weather--${placement}${stale ? ' dcw-weather--stale' : ''}`;
    badge.setAttribute('data-dcw-date', iso);
    badge.setAttribute('data-dcw-placement', placement);
    badge.title = `${cityName} · ${day.label} · Low ${day.low}°${cityUnit === 'celsius' ? 'C' : 'F'} / High ${day.high}°${cityUnit === 'celsius' ? 'C' : 'F'}${day.precip == null ? '' : ` · ${day.precip}% chance of precipitation`}${stale ? ' · Last saved forecast (offline)' : ''}`;
    badge.setAttribute('aria-label', badge.title);
    // The order here is intentional: low / high, as requested.
    const icon = document.createElement('span');
    icon.className = 'dcw-emoji';
    icon.textContent = day.emoji;
    const digits = document.createElement('span');
    digits.className = 'dcw-digits';
    digits.textContent = `${day.low}°/${day.high}°`;
    badge.append(icon, digits);
    return badge;
  }
  // Google Calendar's date headers are not designed for extensions. Instead of
  // fixed top/bottom offsets (which hid weekday or date numbers in earlier builds),
  // measure the text and put each badge ONLY in a free area of its own header.
  function rectForText(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    range.detach?.();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  }
  function nativeDateTextRects(anchor) {
    const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
    const words = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest('.dcw-weather')) continue;
      const word = node.nodeValue?.trim() || '';
      if (!word || word.length > 18) continue;
      const isWeekday = /^(sun(day)?|mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(r(sday)?)?|fri(day)?|sat(urday)?)$/i.test(word);
      const isDate = /^(?:[1-9]|[12]\d|3[01])$/.test(word);
      if (!isWeekday && !isDate) continue;
      const rect = rectForText(node);
      if (rect) words.push({ isWeekday, isDate, rect });
    }
    const weekday = words.find(w => w.isWeekday)?.rect || null;
    const dateCandidates = words.filter(w => w.isDate && (!weekday || w.rect.top >= weekday.top));
    const date = dateCandidates.sort((a,b) => b.rect.height - a.rect.height)[0]?.rect || null;
    return { weekday, date };
  }
  function overlaps(a, b, padding = 0) {
    return a.left < b.right + padding && a.right > b.left - padding &&
      a.top < b.bottom + padding && a.bottom > b.top - padding;
  }
  function fitHeaderBadge(anchor, badge) {
    const header = anchor.getBoundingClientRect();
    const { weekday, date } = nativeDateTextRects(anchor);
    // Never guess an offset when Calendar's own date/weekday cannot be located.
    if (!date || !weekday || header.width < 65 || header.height < 45) return false;
    const width = badge.getBoundingClientRect().width;
    const height = badge.getBoundingClientRect().height;
    if (!width || !height || width > header.width - 8) return false;

    const blocked = [weekday, date];
    // Today's blue date circle can extend well beyond the number glyph.
    for (const button of anchor.querySelectorAll('button, [role="button"]')) {
      if (button.closest('.dcw-weather')) continue;
      const r = button.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 &&
          r.width < header.width * 0.7 && r.height < 90 &&
          (overlaps(r, weekday) || overlaps(r, date))) blocked.push(r);
    }
    const middle = (header.left + header.right) / 2;
    const right = header.right - width - 5;
    const center = middle - width / 2;
    const bottomSlot = Math.max(date.bottom + 3, weekday.bottom + 3);
    const betweenSlot = weekday.bottom + 2;
    const dateSide = date.top + (date.height - height) / 2;
    const weekdaySide = weekday.top + (weekday.height - height) / 2;
    const options = [
      [right, bottomSlot], [center, bottomSlot],
      [right, dateSide], [date.right + 6, dateSide], [date.left - width - 6, dateSide],
      [right, betweenSlot], [center, betweenSlot],
      [right, weekdaySide], [weekday.right + 6, weekdaySide]
    ];
    for (const [left, top] of options) {
      const trial = { left, top, right: left + width, bottom: top + height };
      if (trial.left < header.left + 3 || trial.right > header.right - 3 ||
          trial.top < header.top + 2 || trial.bottom > header.bottom - 3) continue;
      if (blocked.some(rect => overlaps(trial, rect, 3))) continue;
      // Absolute offset relative to padding box, not the viewport.
      badge.style.setProperty('left', `${left - header.left}px`, 'important');
      badge.style.setProperty('top', `${top - header.top}px`, 'important');
      return true;
    }
    return false;
  }
  function putBadge(anchor, iso, placement) {
    if (!anchor || !iso || !anchor.isConnected) return false;
    const day = dailyFor(iso);
    let previous = null;
    for (const e of anchor.children) {
      if (e.classList?.contains('dcw-weather') && e.getAttribute('data-dcw-placement') === placement) {
        previous = e;
        break;
      }
    }
    if (!day) {
      previous?.remove();
      return false;
    }
    const badge = makeBadge(iso, placement);
    const unchanged = previous && previous.getAttribute('data-dcw-date') === iso &&
      previous.title === badge.title && previous.className === badge.className &&
      previous.textContent === badge.textContent;
    if (placement === 'header' || placement === 'month') {
      if (getComputedStyle(anchor).position === 'static') anchor.style.position = 'relative';
    }
    if (!unchanged) {
      if (previous) previous.replaceWith(badge);
      else anchor.appendChild(badge);
    }
    const liveBadge = unchanged ? previous : badge;
    if (placement === 'header') {
      if (!fitHeaderBadge(anchor, liveBadge)) {
        // The rule is strict: if no non-overlapping slot exists, do not paint
        // over Google's date header. The separate forecast fallback is used.
        liveBadge.remove();
        return false;
      }
    }
    return true;
  }
  function view() {
    const segment = location.pathname.match(/\/r\/([a-z]+)/i)?.[1]?.toLowerCase();
    // Google Calendar's Tasks, search, settings and other tabs share our host.
    // An unrecognized /r/ route must NEVER become a weather overlay.
    if (segment && !['month', 'day', 'customday', 'week', 'customweek', 'custom',
                     'agenda', 'schedule', 'year'].includes(segment)) return 'unsupported';
    if (['month'].includes(segment)) return 'month';
    if (['day', 'customday'].includes(segment)) return 'day';
    if (['week', 'customweek', 'custom'].includes(segment)) return 'week';
    if (['agenda', 'schedule'].includes(segment)) return 'schedule';
    if (['year'].includes(segment)) return 'year';
    if (document.querySelector('[role="rowgroup"][data-datekey]')) return 'schedule';
    const headers = [...document.querySelectorAll('[role="columnheader"]')];
    if (headers.length > 1 && headers.some(h => h.querySelector('[data-datekey]'))) return 'week';
    if (headers.length === 1) return 'day';
    if (headers.length >= 7 || document.querySelectorAll('[role="gridcell"][data-datekey]').length >= 7) return 'month';
    return 'unknown';
  }
  function removeRibbon() {
    document.getElementById('dcw-ribbon')?.remove();
  }
  function renderRibbon(dates) {
    if (!dates.length) return 0;
    const banner = document.querySelector('header[role="banner"]');
    const main = document.querySelector('[role="main"]');
    const isVertical = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      return !(style.display.includes('flex') && style.flexDirection === 'row');
    };
    // Prefer a genuine normal-flow sibling below the toolbar; if Calendar's
    // toolbar lives inside a horizontal container, put the strip at the top
    // of the main calendar column instead.
    const afterBanner = Boolean(banner?.parentElement && isVertical(banner.parentElement));
    const insideMain = !afterBanner && main && isVertical(main);
    if (!afterBanner && !insideMain) return 0;
    const parent = afterBanner ? banner.parentElement : main;
    let ribbon = document.getElementById('dcw-ribbon');
    const needsMount = !ribbon || ribbon.parentElement !== parent ||
      (afterBanner ? ribbon.previousElementSibling !== banner : ribbon !== parent.firstElementChild);
    if (needsMount) {
      ribbon?.remove();
      ribbon = document.createElement('div');
      ribbon.id = 'dcw-ribbon';
      ribbon.setAttribute('aria-label', `${cityName} daily weather forecast`);
      if (afterBanner) banner.insertAdjacentElement('afterend', ribbon);
      else main.prepend(ribbon);
    }
    if (!ribbon.querySelector('.dcw-ribbon-label')) {
      const label = document.createElement('span');
      label.className = 'dcw-ribbon-label';
      label.textContent = cityName.toUpperCase();
      ribbon.append(label);
    }
    ribbon.querySelector('.dcw-ribbon-label').textContent = cityName.toUpperCase();
    const keys = new Set();
    let shown = 0;
    const containerRect = ribbon.getBoundingClientRect();
    for (const { header, iso } of dates) {
      const day = dailyFor(iso);
      if (!day || keys.has(iso)) continue;
      keys.add(iso);
      let badge = [...ribbon.querySelectorAll('.dcw-weather--ribbon')]
        .find(b => b.getAttribute('data-dcw-date') === iso);
      const candidate = makeBadge(iso, 'ribbon');
      if (!badge || badge.title !== candidate.title || badge.textContent !== candidate.textContent || badge.className !== candidate.className) {
        if (badge) badge.replaceWith(candidate);
        else ribbon.append(candidate);
        badge = candidate;
      }
      // The ribbon sits in normal page flow. Horizontal positions are derived
      // from the actual Calendar day-column rectangles, including sidebar width.
      const column = header.getBoundingClientRect();
      const width = badge.getBoundingClientRect().width;
      if (column.width < width + 4) { badge.remove(); continue; }
      let left = (column.left + column.right) / 2 - containerRect.left - width / 2;
      left = Math.max(2, Math.min(left, containerRect.width - width - 2));
      const newLeft = `${Math.round(left)}px`;
      if (badge.style.left !== newLeft) badge.style.left = newLeft;
      shown++;
    }
    for (const badge of ribbon.querySelectorAll('.dcw-weather--ribbon')) {
      if (!keys.has(badge.getAttribute('data-dcw-date'))) badge.remove();
    }
    if (!shown) removeRibbon();
    return shown;
  }
  function renderWeek() {
    const dates = [];
    const headers = [...document.querySelectorAll('[role="columnheader"]')];
    const oneColumn = headers.length === 1;
    for (const header of headers) {
      if (header.closest('#dcw-fallback')) continue;
      let iso = dateOf(header);
      if (!iso && oneColumn) {
        const cell = document.querySelector('[role="gridcell"][data-datekey],li[data-datekey]');
        iso = cell ? decodeDatekey(cell.getAttribute('data-datekey')) : null;
      }
      if (iso) dates.push({ header, iso });
    }
    const shown = renderRibbon(dates);
    if (shown) {
      for (const oldBadge of document.querySelectorAll('.dcw-weather--header')) oldBadge.remove();
      return shown;
    }
    // Google may rearrange its toolbar markup; use the safer measured in-header
    // placement ONLY when the independent normal-flow ribbon cannot be mounted.
    let fallbackShown = 0;
    for (const { header, iso } of dates) {
      if (putBadge(header, iso, 'header')) fallbackShown++;
    }
    return fallbackShown;
  }
  function renderMonth() {
    let displayed = 0;
    const seen = new Set();
    const holders = document.querySelectorAll('[role="gridcell"][data-datekey], li[data-datekey]');
    for (const holder of holders) {
      const iso = decodeDatekey(holder.getAttribute('data-datekey'));
      if (!iso || seen.has(iso)) continue;
      const outer = holder.closest('[role="gridcell"]') || holder;
      // Avoid projecting weather on unrelated data-datekey event structures.
      const rect = outer.getBoundingClientRect();
      if (rect.width < 65 || rect.height < 38) continue;
      seen.add(iso);
      if (putBadge(outer, iso, 'month')) displayed++;
    }
    return displayed;
  }
  function renderSchedule() {
    let displayed = 0;
    for (const row of document.querySelectorAll('[role="rowgroup"][data-datekey]')) {
      const iso = decodeDatekey(row.getAttribute('data-datekey'));
      const h2 = row.querySelector('h2');
      if (iso && h2 && putBadge(h2.parentElement || h2, iso, 'schedule')) displayed++;
    }
    return displayed;
  }
  function isoDenverToday() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }
  function clearWeather() {
    // Also clear detached/stale view elements on the Calendar -> Tasks switch.
    removeRibbon();
    for (const el of document.querySelectorAll('.dcw-weather, #dcw-fallback')) el.remove();
  }
  function render() {
    const v = view();
    // Tasks is a full-page tab at /calendar/u/0/r/tasks. Never render or
    // retain weather there, or in any other non-calendar view.
    if (!enabled || !['week', 'day', 'month', 'schedule'].includes(v)) {
      clearWeather();
      return;
    }
    if (!forecast) return;
    if (v === 'week' || v === 'day') renderWeek();
    else if (v === 'month') { removeRibbon(); renderMonth(); }
    else if (v === 'schedule') { removeRibbon(); renderSchedule(); }
    // No floating fallback. It obscured Google Tasks and other interfaces.
    document.getElementById('dcw-fallback')?.remove();
  }
  function schedule() {
    if (redrawTimer) clearTimeout(redrawTimer);
    redrawTimer = setTimeout(() => { redrawTimer = null; render(); }, 150);
  }
  function requestForecast(force = false) {
    if (!enabled) return;
    if (inFlight) { if (force) pendingRefetch = true; return; }
    inFlight = true;
    chrome.runtime.sendMessage({ type: 'DCW_GET_FORECAST', force }, response => {
      inFlight = false;
      if (pendingRefetch) {
        pendingRefetch = false;
        requestForecast(true);
        return;
      }
      if (chrome.runtime.lastError || !response || response.error) {
        console.warn('[SkyRibbon]', response?.error || chrome.runtime.lastError?.message || 'Weather unavailable');
        return;
      }
      forecast = response.data;
      cityName = response.location?.name || 'Your city';
      cityTimezone = response.location?.timezone || 'auto';
      cityUnit = response.location?.unit || 'fahrenheit';
      stale = Boolean(response.stale);
      lastDataFetch = Date.now();
      render();
    });
  }
  chrome.storage.local.get({ dcwEnabled: true }, obj => {
    enabled = obj.dcwEnabled !== false;
    if (enabled) requestForecast();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.dcwEnabled) {
      enabled = changes.dcwEnabled.newValue !== false;
      if (enabled) requestForecast(true);
      else render();
    }
    if (changes.srLocation) {
      // Clear old-city forecast while new coordinates and units load.
      forecast = null;
      clearWeather();
      if (enabled) requestForecast(true);
    }
  });
  const observer = new MutationObserver(records => {
    if (records.every(r => r.target?.closest?.('.dcw-weather, #dcw-fallback, #dcw-ribbon') ||
        (r.addedNodes.length && [...r.addedNodes].every(n =>
          n.nodeType === 1 && (n.matches?.('.dcw-weather, #dcw-fallback, #dcw-ribbon') || n.closest?.('#dcw-fallback, #dcw-ribbon')))))) return;
    schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  // Google Calendar navigates without page reloads. Both URL and DOM changes
  // are observed so navigation, view switching, and day rollover all recover.
  setInterval(() => {
    if (location.pathname !== observedPath) { observedPath = location.pathname; schedule(); }
    if (enabled && Date.now() - lastDataFetch > 60 * 60 * 1000 && !inFlight) requestForecast();
  }, 20000);
})();
