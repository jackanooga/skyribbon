'use strict';

const CACHE_MS = 45 * 60 * 1000;
let inFlight = null;

function validLocation(raw) {
  return raw && typeof raw.name === 'string' && raw.name.trim() &&
    Number.isFinite(Number(raw.latitude)) && Math.abs(Number(raw.latitude)) <= 90 &&
    Number.isFinite(Number(raw.longitude)) && Math.abs(Number(raw.longitude)) <= 180 &&
    (raw.unit === 'fahrenheit' || raw.unit === 'celsius') &&
    typeof raw.timezone === 'string' && raw.timezone.trim();
}

async function getLocation() {
  const saved = (await chrome.storage.local.get('srLocation')).srLocation;
  if (validLocation(saved)) return saved;
  const response = await fetch(chrome.runtime.getURL('config.json'));
  if (!response.ok) throw new Error('Missing SkyRibbon location configuration.');
  const config = await response.json();
  if (!validLocation(config)) throw new Error('Invalid SkyRibbon location configuration.');
  return config;
}

function validResponse(data) {
  const d = data?.daily;
  return Boolean(d && Array.isArray(d.time) && Array.isArray(d.temperature_2m_min) &&
    Array.isArray(d.temperature_2m_max) && Array.isArray(d.weather_code) &&
    d.time.length > 0 && d.time.length === d.temperature_2m_min.length &&
    d.time.length === d.temperature_2m_max.length && d.time.length === d.weather_code.length);
}

async function loadForecast(force = false) {
  const location = await getLocation();
  const cacheKey = `srForecast_${location.latitude}_${location.longitude}_${location.timezone}_${location.unit}`;
  const cached = (await chrome.storage.local.get(cacheKey))[cacheKey];
  if (!force && cached && validResponse(cached.data) && Date.now() - cached.at < CACHE_MS) {
    return { data: cached.data, location, updatedAt: cached.at, stale: false };
  }
  if (!inFlight || inFlight.key !== cacheKey) {
    const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      daily: 'weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max',
      temperature_unit: location.unit,
      timezone: location.timezone,
      forecast_days: '16',
      past_days: '2'
    });
    const request = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) throw new Error(`Forecast service: HTTP ${res.status}`);
        const data = await res.json();
        if (!validResponse(data)) throw new Error('Weather service returned incomplete daily data');
        const at = Date.now();
        await chrome.storage.local.set({ [cacheKey]: { data, at } });
        return { data, location, updatedAt: at, stale: false };
      } finally {
        clearTimeout(timeout);
      }
    })();
    const task = { key: cacheKey, promise: request };
    inFlight = task;
    request.finally(() => { if (inFlight === task) inFlight = null; }).catch(() => {});
  }
  try {
    return await inFlight.promise;
  } catch (e) {
    if (cached && validResponse(cached.data) && Date.now() - cached.at < 8 * 60 * 60 * 1000) {
      return { data: cached.data, location, updatedAt: cached.at, stale: true };
    }
    throw e;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SR_GET_LOCATION') {
    getLocation().then(location => sendResponse({ location }))
      .catch(e => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (message?.type === 'DCW_GET_FORECAST') {
    loadForecast(message.force === true).then(sendResponse)
      .catch(e => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
});
