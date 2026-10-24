# SkyRibbon · v1.2.0

SkyRibbon is a free Chrome extension that places a weather ribbon in Google Calendar. It works for any city; change your city and °F/°C in the toolbar popup.

## Publish this website for free

1. Extract `SkyRibbon_Website_v1_2.zip`.
2. Visit your public `jackanooga/skyribbon` repository, and upload **all the files inside the extracted folder** to the repository ROOT. Important: `SkyRibbon_Extension.zip` is a **file**, not a folder. It must stay zipped.
3. Choose replace/overwrite when GitHub identifies existing files, then commit the changes.
4. Wait until GitHub Pages deployment is complete and visit https://jackanooga.github.io/skyribbon/.
5. Verify the download button works by opening https://jackanooga.github.io/skyribbon/SkyRibbon_Extension.zip directly.

The old `app.js`, `manifest.json`, `icons`, and other unused files in your root are not required by this release. They can remain for now. The new website does not load app.js or fetch individual extension files.

## Install the extension manually

1. Download `SkyRibbon_Extension.zip` from the site and unzip it.
2. Open `chrome://extensions`, enable Developer mode, and select **Load unpacked**.
3. Select the extracted `SkyRibbon` folder (the one containing `manifest.json`).
4. Pin the extension in Chrome, click it, and search for any city. Select °F or °C.
5. Reload Google Calendar once after installing. City or temperature changes should then update the ribbon automatically.

If you have an older SkyRibbon or Denver Calendar Weather extension installed, **remove or disable the old one** to avoid duplicate ribbons.

## Project files

- `index.html`, `styles.css`, `favicon.svg`: minimal landing page
- `SkyRibbon_Extension.zip`: one universal extension for everyone
- `privacy.html`: transparent privacy explanation

The extension uses the free noncommercial Open-Meteo weather/geocoding APIs, without accounts or a server. Review Open-Meteo terms before scaling or monetizing the site.

## Troubleshooting

- If the download link fails, confirm the root-level `SkyRibbon_Extension.zip` is uploaded and the Pages deployment is complete. File names are case sensitive.
- If Chrome says 'Manifest file is missing or unreadable', open the extracted ZIP and select the inner `SkyRibbon` folder, not the ZIP or its parent folder.
- If weather fails to appear, reload Google Calendar, verify weather is enabled in the popup, and disable any earlier weather-extension installations.
