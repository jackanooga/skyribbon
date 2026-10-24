/* SkyRibbon's static-site configurator. No API keys, logins, servers or external zip libraries. */
'use strict';
const DEFAULT_CITY = Object.freeze({
  name:'Denver', region:'Colorado, United States', latitude:39.7392,
  longitude:-104.9903, timezone:'America/Denver', unit:'fahrenheit'
});
const WEATHER_FILES = [
  'manifest.json','background.js','content.js','weather.css','popup.html','popup.css',
  'popup.js','config.json','icons/icon16.png','icons/icon48.png','icons/icon128.png'
];
const $ = (id) => document.getElementById(id);
const state = { city: {...DEFAULT_CITY}, days: null, units:'fahrenheit', forecastAbort:null, searchAbort:null, searchSerial:0, downloading:false };

function weather(code) {
  const c = Number(code);
  if (c === 0) return ['☀️','Sunny'];
  if (c === 1) return ['🌤️','Mostly sunny'];
  if (c === 2) return ['⛅','Partly cloudy'];
  if (c === 3) return ['☁️','Cloudy'];
  if (c === 45 || c === 48) return ['🌫️','Foggy'];
  if (c >= 51 && c <= 57) return ['🌦️','Drizzle'];
  if (c >= 61 && c <= 67) return ['🌧️','Rain'];
  if (c >= 71 && c <= 77) return ['❄️','Snow'];
  if (c >= 80 && c <= 82) return ['🌧️','Showers'];
  if (c === 85 || c === 86) return ['🌨️','Snow showers'];
  if (c >= 95 && c <= 99) return ['⛈️','Thunderstorms'];
  return ['🌡️','Forecast'];
}
function cityDateParts(timezone, now = new Date()) {
  try {
    const p = new Intl.DateTimeFormat('en-US', {timeZone: timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const m = Object.fromEntries(p.map(x => [x.type, x.value]));
    return [Number(m.year),Number(m.month),Number(m.day)];
  } catch { return [now.getUTCFullYear(),now.getUTCMonth()+1,now.getUTCDate()]; }
}
function thisWeek(timezone) {
  const [y,m,d] = cityDateParts(timezone);
  const today = new Date(Date.UTC(y,m-1,d));
  const sun = new Date(today.getTime()-today.getUTCDay()*86400000);
  return Array.from({length:7},(_,i)=>{
    const date = new Date(sun.getTime()+i*86400000);
    return { iso: date.toISOString().slice(0,10), date, today:date.getTime()===today.getTime() };
  });
}
function setStatus(message, kind='') {
  $('download-status').textContent = message;
  $('download-status').className = `download-status ${kind}`.trim();
}
function paintPreview() {
  const week = thisWeek(state.city.timezone);
  const dict = new Map((state.days||[]).map(d => [d.date,d]));
  const badgeArea = $('preview-weather'), daysArea = $('preview-days'), datesArea = $('preview-dates');
  badgeArea.replaceChildren(); daysArea.replaceChildren(); datesArea.replaceChildren();
  $('preview-city').textContent = state.city.name;
  $('calendar-month').textContent = new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(week[3].date);
  for (const entry of week) {
    const day = dict.get(entry.iso);
    const chip = document.createElement('span');
    chip.className = day ? 'weather-chip':'weather-chip empty';
    chip.title = day ? `${day.label} · Low ${day.low}° / High ${day.high}°` : 'Forecast not available';
    chip.textContent = day ? `${day.emoji} ${day.low}°/${day.high}°` : '–';
    badgeArea.append(chip);
    const label = document.createElement('span');
    label.textContent = new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(entry.date).toUpperCase();
    daysArea.append(label);
    const number = document.createElement('span');
    number.textContent = entry.date.getUTCDate();
    if (entry.today) number.className='today';
    datesArea.append(number);
  }
}
async function refreshForecast() {
  state.forecastAbort?.abort();
  const controller = new AbortController();
  state.forecastAbort = controller;
  state.days = null;
  $('preview-indicator').textContent = 'Loading…';
  $('preview-indicator').style.background = '#fff4d6';
  $('preview-indicator').style.color = '#81651c';
  $('forecast-status').textContent = 'Getting the latest forecast…';
  $('forecast-status').className = 'preview-error';
  paintPreview();
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    for (const [key,value] of Object.entries({
      latitude:state.city.latitude, longitude:state.city.longitude,
      daily:'weather_code,temperature_2m_min,temperature_2m_max',
      temperature_unit:state.units, timezone:state.city.timezone,
      forecast_days:16, past_days:7
    })) url.searchParams.set(key,String(value));
    const response = await fetch(url,{signal:controller.signal});
    if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.daily?.time) || !Array.isArray(data.daily.temperature_2m_min)) throw new Error('Incomplete forecast');
    if (controller.signal.aborted) return;
    state.days = data.daily.time.map((date,i)=>{
      const [emoji,label] = weather(data.daily.weather_code[i]);
      return {date,emoji,label,low:Math.round(data.daily.temperature_2m_min[i]),high:Math.round(data.daily.temperature_2m_max[i])};
    });
    $('preview-indicator').textContent = 'Live weather';
    $('preview-indicator').style.background = '';
    $('preview-indicator').style.color = '';
    $('forecast-status').textContent = 'Live forecast courtesy of Open-Meteo. Temperatures shown low / high.';
    paintPreview();
  } catch(error) {
    if (error.name==='AbortError') return;
    $('preview-indicator').textContent = 'Unavailable';
    $('forecast-status').textContent = 'Forecast preview is unavailable right now. Your extension can still be downloaded.';
    $('forecast-status').className = 'preview-error alert';
    paintPreview();
  }
}
function normalizeResult(place) {
  return {
    name:place.name,
    region:[place.admin1,place.country].filter(Boolean).join(', '),
    latitude:Number(place.latitude),longitude:Number(place.longitude),
    timezone:place.timezone || 'auto',unit:state.units
  };
}
function chooseCity(city) {
  state.city = {...city,unit:state.units};
  $('city-input').value = city.name;
  $('selected-city').textContent = [city.name,city.region].filter(Boolean).join(', ');
  $('city-results').hidden = true;
  $('city-input').setAttribute('aria-expanded','false');
  $('search-loading').hidden = true;
  setStatus('Free to use · Made for desktop Chrome · No account needed');
  refreshForecast();
}
async function performSearch(term, serial) {
  state.searchAbort?.abort();
  const controller = new AbortController(); state.searchAbort=controller;
  $('search-loading').hidden=false;
  try {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({name:term,count:'7',language:'en',format:'json'});
    const response=await fetch(url,{signal:controller.signal});
    if(!response.ok) throw new Error('Search failed');
    const data=await response.json();
    if (serial!==state.searchSerial) return;
    const container=$('city-results');container.replaceChildren();
    const places=(data.results||[]).filter(r=>r.name&&Number.isFinite(r.latitude)&&Number.isFinite(r.longitude));
    if (!places.length) {
      const note=document.createElement('div');note.className='city-option';note.textContent='No matching city. Try a nearby city or a longer name.';container.append(note);
    }
    for(const place of places){
      const opt=document.createElement('button');opt.className='city-option';opt.type='button';opt.setAttribute('role','option');
      const pin=document.createElement('span');pin.className='option-icon';pin.textContent='●';
      const text=document.createElement('span');const title=document.createElement('strong');title.textContent=place.name;
      const sub=document.createElement('small');sub.textContent=[place.admin1,place.country].filter(Boolean).join(', ');
      text.append(title,sub);opt.append(pin,text);
      opt.addEventListener('click',()=>chooseCity(normalizeResult(place)));
      container.append(opt);
    }
    container.hidden=false;$('city-input').setAttribute('aria-expanded','true');
  }catch(error){
    if(error.name==='AbortError') return;
    if(serial===state.searchSerial) setStatus('City lookup is unavailable. You can still download the currently selected city.','error');
  }finally{if(serial===state.searchSerial)$('search-loading').hidden=true;}
}
let searchTimer;
$('city-input').addEventListener('input',()=>{
  const term=$('city-input').value.trim();
  clearTimeout(searchTimer);state.searchSerial++;
  state.searchAbort?.abort();
  $('city-results').hidden=true;$('city-input').setAttribute('aria-expanded','false');
  $('search-loading').hidden=true;
  if(term.length<2)return;
  const serial=state.searchSerial;
  searchTimer=setTimeout(()=>performSearch(term,serial),320);
});
$('city-input').addEventListener('keydown',event=>{
  if(event.key==='Escape'){$('city-results').hidden=true;$('city-input').setAttribute('aria-expanded','false');}
});
document.addEventListener('click',event=>{
  if(!event.target.closest('.location-form')){$('city-results').hidden=true;$('city-input').setAttribute('aria-expanded','false');}
});
$('units').addEventListener('change',()=>{
  state.units=$('units').value;
  state.city.unit=state.units;
  refreshForecast();
});

// ZIP writer for small, static archives (STORE method). No remote JS dependency.
const encoder=new TextEncoder();
const crcTable=Array.from({length:256},(_,n)=>{
  let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;
});
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function u16(view,offset,n){view.setUint16(offset,n,true);}
function u32(view,offset,n){view.setUint32(offset,n>>>0,true);}
function makeZip(entries){
  const localParts=[],centralParts=[];let offset=0;const d=new Date();
  const dosDate=((Math.max(1980,d.getFullYear())-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  const dosTime=(d.getHours()<<11)|(d.getMinutes()<<5)|Math.floor(d.getSeconds()/2);
  for(const [filename,content] of entries){
    const name=encoder.encode(filename),bytes=content instanceof Uint8Array?content:encoder.encode(content),crc=crc32(bytes);
    const local=new Uint8Array(30+name.length);const lh=new DataView(local.buffer);
    u32(lh,0,0x04034b50);u16(lh,4,20);u16(lh,6,0x800);u16(lh,8,0);u16(lh,10,dosTime);u16(lh,12,dosDate);
    u32(lh,14,crc);u32(lh,18,bytes.length);u32(lh,22,bytes.length);u16(lh,26,name.length);u16(lh,28,0);local.set(name,30);
    localParts.push(local,bytes);
    const cen=new Uint8Array(46+name.length);const ch=new DataView(cen.buffer);
    u32(ch,0,0x02014b50);u16(ch,4,20);u16(ch,6,20);u16(ch,8,0x800);u16(ch,10,0);u16(ch,12,dosTime);u16(ch,14,dosDate);
    u32(ch,16,crc);u32(ch,20,bytes.length);u32(ch,24,bytes.length);u16(ch,28,name.length);u16(ch,30,0);u16(ch,32,0);
    u16(ch,34,0);u16(ch,36,0);u32(ch,38,0);u32(ch,42,offset);cen.set(name,46);centralParts.push(cen);
    offset+=local.length+bytes.length;
  }
  const centralSize=centralParts.reduce((sum,part)=>sum+part.length,0);
  const end=new Uint8Array(22);const ev=new DataView(end.buffer);
  u32(ev,0,0x06054b50);u16(ev,4,0);u16(ev,6,0);u16(ev,8,entries.length);u16(ev,10,entries.length);
  u32(ev,12,centralSize);u32(ev,16,offset);u16(ev,20,0);
  return new Blob([...localParts,...centralParts,end],{type:'application/zip'});
}
function asciiSlug(name){return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,42)||'Your-City';}
async function downloadExtension(){
  if(state.downloading)return;
  state.downloading=true;
  const btn=$('download');btn.disabled=true;btn.firstElementChild.textContent='Preparing your download…';
  setStatus(`Packaging SkyRibbon for ${state.city.name}…`);
  try{
    const entries=await Promise.all(WEATHER_FILES.map(async path=>{
      const res=await fetch(`extension/${path}`,{cache:'no-store'});
      if(!res.ok)throw new Error(`Missing extension file: ${path}`);
      if(path==='config.json')return ['SkyRibbon/config.json',JSON.stringify({...state.city,unit:state.units},null,2)+'\n'];
      return [`SkyRibbon/${path}`,new Uint8Array(await res.arrayBuffer())];
    }));
    const blob=makeZip(entries);
    const objectURL=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=objectURL;
    a.download=`SkyRibbon_${asciiSlug(state.city.name)}_${state.units==='celsius'?'C':'F'}.zip`;
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(objectURL),5000);
    setStatus(`Ready! Your ${state.city.name} extension ZIP has been downloaded. Follow the steps below to install it.`, 'success');
  }catch(error){
    console.error('SkyRibbon download failed',error);
    setStatus('Could not package the extension. Please refresh the page and try again. If opened as a local file, run it through a web server.', 'error');
  }finally{state.downloading=false;btn.disabled=false;btn.firstElementChild.textContent='Download my extension';}
}
$('download').addEventListener('click',downloadExtension);
paintPreview();
refreshForecast();
