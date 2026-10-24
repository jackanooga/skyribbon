# SkyRibbon — Weather for Google Calendar

**Free static website + personalized Chrome extension.** A weather strip above Google Calendar's day labels / all-day events. Low/high temperatures, weather emoji, and a user-selected city.

## Publish the free website via GitHub Pages

1. Create a new **public** GitHub repository, for example `skyribbon`.
2. Upload **the contents of this project folder** to the **root** of the repository (not a nested parent folder). This includes `index.html`, `styles.css`, `app.js`, `favicon.svg`, `privacy.html` and the entire `extension` folder.
3. In the repository go to **Settings → Pages → Build and deployment** and choose **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. GitHub gives you a free URL of the form `https://YOUR-USERNAME.github.io/skyribbon/` after publication. No custom domain needed.
5. Test choosing a city, switching units, and downloading the ZIP. Unzip and install using `chrome://extensions` → Developer mode → Load unpacked → select the **SkyRibbon** folder.

**If you already installed the Denver-only extension, disable or remove it before enabling SkyRibbon** to avoid duplicate weather rows.

**Note:** The website must be served over `http://` or `https://`; opening `index.html` directly using `file://` disables some browsers' fetch/download behavior. For local preview, run `python3 -m http.server 8000` from the project folder and open `http://localhost:8000/`.

## How city-specific downloads work

Everything happens locally in the visitor's browser: `app.js` downloads the 11 public extension assets from `/extension/`, replaces `config.json` with selected city coordinates/timezone/°F/°C, and builds a valid uncompressed ZIP using an embedded ZIP writer. No server-side compilation, registration, payments, or API keys are necessary.

After installing, a user can change their location or temperature unit from the extension popup. The extension stores settings only in local Chrome extension storage. Weather comes from Open-Meteo.

## Compatibility

- Desktop Chrome, Google Calendar calendar views. Not mobile Chrome or standalone Google Tasks.
- Original functional ribbon architecture based on Denver Calendar Weather v1.0.3, **including the Tasks overlay fix** (no floating fallback).
- Up to 16 forecast days; beyond that weather badges may not appear.
- Google's calendar UI is undocumented and may change, requiring future adjustments.
- Manual updates for users who installed from a ZIP rather than Chrome Web Store.

## Usage & licenses

SkyRibbon is intended as a **noncommercial** utility. Open-Meteo's free service has usage restrictions; check https://open-meteo.com/en/pricing and attribution requirements before launch and as usage grows. Geocoding includes GeoNames-based location data.

Privacy policy: `privacy.html`. This is independent software, not affiliated with Google. Do not describe it as a Chrome Web Store installation.
