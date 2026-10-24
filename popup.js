'use strict';
const toggle = document.getElementById('enabled');
const refresh = document.getElementById('refresh');
const today = document.getElementById('today');
const status = document.getElementById('status');
const cityLabel = document.getElementById('city-label');
const cityInput = document.getElementById('city-search');
const cityResults = document.getElementById('city-results');
const unitInput = document.getElementById('unit');
let currentLocation = null;
let searchTimer = null;
let searchSeq = 0;

function dateAtTimezone(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}`;
  } catch { return new Date().toISOString().slice(0, 10); }
}
function description(code) {
  if (code === 0) return '☀️ Sunny';
  if (code === 1) return '🌤️ Mostly sunny';
  if (code === 2) return '⛅ Partly cloudy';
  if (code === 3) return '☁️ Cloudy';
  if (code === 45 || code === 48) return '🌫️ Foggy';
  if (code >= 51 && code <= 57) return '🌦️ Drizzle';
  if (code >= 61 && code <= 67) return '🌧️ Rain';
  if (code >= 71 && code <= 77) return '❄️ Snow';
  if (code >= 80 && code <= 82) return '🌧️ Showers';
  if (code === 85 || code === 86) return '🌨️ Snow showers';
  if (code >= 95 && code <= 99) return '⛈️ Thunderstorms';
  return '🌡️ Forecast';
}
function getWeather(force = false) {
  refresh.disabled = true;
  chrome.runtime.sendMessage({ type: 'DCW_GET_FORECAST', force }, response => {
    refresh.disabled = false;
    if (chrome.runtime.lastError || response?.error || !response?.data) {
      today.textContent = 'Unable to load weather';
      status.textContent = response?.error || chrome.runtime.lastError?.message || 'Please try again.';
      return;
    }
    currentLocation = response.location;
    unitInput.value = currentLocation.unit;
    cityLabel.textContent = `${currentLocation.name.toUpperCase()} · WEATHER`;
    const d = response.data.daily;
    const i = d.time.indexOf(dateAtTimezone(currentLocation.timezone));
    if (i < 0) { today.textContent = 'Forecast unavailable for today'; return; }
    const low = Math.round(d.temperature_2m_min[i]);
    const high = Math.round(d.temperature_2m_max[i]);
    const deg = currentLocation.unit === 'celsius' ? '°C' : '°F';
    today.textContent = `${description(d.weather_code[i])} · ${low}° / ${high}°`;
    const small = document.createElement('small');
    small.textContent = `Today in ${currentLocation.name} · Low / High ${deg}${response.stale ? ' · Saved forecast' : ''}`;
    today.append(small);
    status.textContent = 'Forecast updated.';
  });
}
chrome.storage.local.get({ dcwEnabled: true }, result => {
  toggle.checked = result.dcwEnabled !== false;
});
toggle.addEventListener('change', () => {
  chrome.storage.local.set({ dcwEnabled: toggle.checked });
  status.textContent = toggle.checked ? 'Weather enabled.' : 'Weather hidden.';
});
refresh.addEventListener('click', () => getWeather(true));
unitInput.addEventListener('change', async () => {
  if (!currentLocation) return;
  currentLocation = { ...currentLocation, unit: unitInput.value };
  await chrome.storage.local.set({ srLocation: currentLocation });
  getWeather(true);
});
cityInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const term = cityInput.value.trim();
  cityResults.hidden = true;
  cityResults.replaceChildren();
  const seq = ++searchSeq;
  if (term.length < 2) return;
  searchTimer = setTimeout(async () => {
    try {
      const url = 'https://geocoding-api.open-meteo.com/v1/search?' + new URLSearchParams({ name: term, count:'5', language:'en', format:'json' });
      const response = await fetch(url);
      if (!response.ok) throw new Error('City search unavailable');
      const data = await response.json();
      if (seq !== searchSeq) return;
      cityResults.replaceChildren();
      for (const city of data.results || []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = [city.name, city.admin1, city.country].filter(Boolean).join(', ');
        button.addEventListener('click', async () => {
          const next = {
            name: city.name, region: [city.admin1, city.country].filter(Boolean).join(', '),
            latitude: city.latitude, longitude: city.longitude,
            timezone: city.timezone || 'auto', unit: unitInput.value
          };
          currentLocation = next;
          cityInput.value = next.name;
          cityResults.hidden = true;
          await chrome.storage.local.set({ srLocation: next });
          getWeather(true);
        });
        cityResults.append(button);
      }
      cityResults.hidden = !cityResults.childElementCount;
    } catch { status.textContent = 'City search unavailable. Try again.'; }
  }, 300);
});
getWeather();
