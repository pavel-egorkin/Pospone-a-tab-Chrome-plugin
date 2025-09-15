# Reopen Tab Later

Hide a tab now and get it back exactly when you want. A lightweight Manifest V3 extension for Chromium browsers.

— Snooze the current tab using quick presets or pick an exact date and time. Woken tabs open as background tabs in your last normal window, with an optional desktop notification.

##[Install from chrome store](https://chromewebstore.google.com/detail/reopen-tab-later/llfdlmiaajdjjhdiodddjhmojijkifnp)

## Features
- Quick presets in the popup: In 1 Hour, This Evening, Tomorrow Morning, This Weekend, Next Week
- Custom schedule via a built‑in date/time modal in the popup
- Sleeping Tabs page to view, reschedule, wake, or delete items
- Optional notification on wake and toolbar badge with total count
- Keyboard shortcuts (user‑configurable at `chrome://extensions/shortcuts`)
- Privacy‑first: no network calls; data stays in `chrome.storage.local`

## How It Works
- Each snooze schedules a `chrome.alarms` entry for the chosen time (UTC stored).
- On alarm: the URL opens as a background tab in the last active normal window (or a new one if needed). If opening fails, it will retry after restart.
- On startup/installation: storage is reconciled, missed alarms fire immediately, and future ones are re‑scheduled.
- Badge shows the total number of upcoming items; it updates on create, edit, delete, or wake.

## Presets (local‑time rules)
- In 1 Hour: now + 1 hour
- This Evening: today at 18:00; if that’s past, tomorrow at 18:00
- Tomorrow Morning: tomorrow at 09:00
- This Weekend: upcoming Saturday at 09:00
- Next Week: upcoming Monday at 09:00

Defaults used by presets and the date picker: 09:00 (picker), 09:00 (morning), 18:00 (evening).

## Install (unpacked)
1) Go to `chrome://extensions` and enable Developer mode
2) Click “Load unpacked” and select this folder
3) Optionally set shortcuts at `chrome://extensions/shortcuts`

[or Install from chrome store](https://chromewebstore.google.com/detail/reopen-tab-later/llfdlmiaajdjjhdiodddjhmojijkifnp)

Files to expect:
- `manifest.json` (MV3)
- `sw.js` (service worker)
- `popup.html`, `popup.js`
- `sleeping.html`, `sleeping.js`
- `options.html`, `options.js`
- `icons/16.png`, `icons/48.png`, `icons/128.png`

## Usage
- Click the toolbar icon to open the popup; choose a preset or Pick a Date & Time.
- The current tab closes once scheduled. You can manage items from the Sleeping Tabs page.
- Notification on wake is enabled by default; disable it in Settings.

## Keyboard Shortcuts
Configure at `chrome://extensions/shortcuts`:
- Snooze active tab → command id `snooze-active`
- Open Sleeping Tabs list → `open-sleeping`
- Repeat last snooze → `repeat-last-snooze`
- New to‑do tab → `new-todo-tab`

“Repeat last snooze” repeats the last non‑recurring action (preset or a custom pick).

## Settings
- Wake‑up notification: toggle on/off (Options page)

Notes:
- Preset hours use sensible defaults (09:00 morning, 18:00 evening, 09:00 picker).
- “Delete all snoozes” is available in Options. A “Clear All” button is also present on the Sleeping Tabs page.

## Limits
- Up to 500 scheduled items are supported. If you exceed capacity, creation is rejected with a helpful error.

## Permissions
- `tabs`: read the active tab’s URL/title to save it; open/close tabs on wake
- `storage`: store schedules and settings locally (not synced)
- `alarms`: schedule wake times
- `notifications`: optional desktop notifications when tabs wake

See PRIVACY: `PRIVACY.md`

## Development
- No build step — static HTML/JS/CSS and a service worker
- Load unpacked from this folder to test
- To package for the store: zip the files shown above (exclude `.git`, `.DS_Store`, etc.)

## Troubleshooting
- If the browser was closed or sleeping at the scheduled time, the tab opens on next startup and you may see a summary notification if several opened.
- The extension does not run in Incognito unless you explicitly enable “Allow in incognito”.

## Version
`manifest.json` version: 1.0.0

## License
MIT
