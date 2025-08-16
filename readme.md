# Reopen Tab Later — snooze tabs, get them back exactly on time

**Chromium extension** that hides the current tab and re‑opens it at the date/time you choose — when you’ll actually have time to process it.

---

## Why use it
- "Read‑later" lists pile up. Browser tabs pile up even harder. **Reopen Tab Later** puts pages **out of sight** and **back in your flow** at the right moment.
- Your future self shouldn’t hunt for the right tab — it should reappear **precisely** when needed.

---

## Features at a glance
- **Quick Snooze popup** with fast presets
- **Pick a Date** calendar with time selector.
- **Recurring (Repeatedly)** schedules (e.g., every Wed 9:00).
- **Sleeping Tabs list** to view, reschedule, wake, delete
- **Notifications** (click to open new) and optional **toolbar badge** with total upcoming count.
- **Configurable Keyboard shortcuts** for power use.
- Do not work in Incognito mode
- Manifest V3, minimal permissions, privacy‑first.

> **Design constraint**: On the 3×3 tiles view there are **no icons** except the **Settings** gear. In the Sleeping Tabs window the **floating +** button creates a new to‑do tab.

---

## Color & UI spec ()
High‑contrast grayscale palette. No chroma; rely on typography, spacing, and subtle elevation.

- **Accent / Interactive:** Gray 900 `#0F172A` (hover: Gray 800 `#1F2937`, active: Gray 700 `#374151`)
- **Primary text:** Gray 900 `#0F172A`
- **Secondary text:** Gray 600 `#4B5563`
- **Background:** `#F9FAFB`
- **Surface (cards/modals):** `#FFFFFF`
- **Surface alt:** `#F3F4F6`
- **Borders / dividers:** `#E5E7EB`
- **Focus ring:** `rgba(17, 24, 39, .35)` (3px outline)

### Icon
- **Glyph:** Tab + timer.
- **SVG asset:** [`tab-timer-icon.svg`](assets/tab-timer-icon.svg)

---

## Flows

### 1) Quick Snooze popup
Open from the toolbar button or via keyboard shortcut.

**Grid (text‑only tiles):**
- **Later Today**  
- **This Evening**  
- **Tomorrow**  
- **Next Weekend**  
- **Next Week**  
- **In a Month**  
- **Someday**  
- **Repeatedly**  
- **Pick a Date**

**Footer:**
- **Sleeping Tabs** (opens list window)
- **Settings** (small gear icon, right‑aligned)

**Rules & microcopy**
- Subtitles may show the resolved time, e.g., “Later Today — in 3h”.

### Preset semantics
- Later Today: now + 3 hours (local). If it crosses midnight, schedule for tomorrow at “Tomorrow starts at”.
- This Evening: today at 19:00 local. If after 19:00, schedule for tomorrow at 19:00.
- Tomorrow: tomorrow at “Tomorrow starts at”.
- Next Week: upcoming Monday at the Default time.
- Next Weekend: upcoming Saturday at the Default time.
- In a Month: same day-of-month next month at the Default time (if day doesn’t exist, schedule for the 1st).
- Someday: +3 months at the Default time.
- All computations use the local device time and date; UTC is used for storage.

---

### 2) Pick a Date
**Modal includes:**
- **Calendar** (month switcher)
- **Time dropdown** in 30‑min steps (customizable default)
- Primary button **Snooze**

**Validation:**
- Cannot pick past date/time.
- Normalizes to local timezone; stores UTC.

---

### 3) Repeatedly (recurring)
**Modal includes:**
- Frequency: **Daily / Weekly / Monthly**
- For **Weekly**: weekday checkboxes
- **At this hour** dropdown
- **Snooze** to create the recurrence

**Behavior:**
- Each recurrence re‑opens the tab and then schedules the next run.
- Missed runs (browser closed) fire immediately on startup, then the next run is scheduled.
- Weekly: supports multiple weekdays within a single recurrence; `nextFireAt` is computed to the nearest future selected weekday at the chosen time.
- Monthly: if the selected day does not exist in a month (29–31), the run executes on the 1st of that month.
- Times are stable in local wall‑clock time across DST and travel (always fire at the chosen local time).
- Recurrences can be **Edited** or **Deleted** from the Sleeping Tabs list. Pause/Resume is not supported.

---

### 4) Sleeping Tabs list
Window listing **Upcoming** snoozes.

- Grouping: **Today**, **Tomorrow**, **This Week**, **Later**
- Group boundaries: Week starts on Monday. “Today” = due before end of today; “Tomorrow” = due tomorrow; “This Week” = remainder of current week excluding today/tomorrow; “Later” = beyond this week.
- Sorting: earliest to latest within each group.
- Row: title, scheduled time, actions **Wake**, **Reschedule**, **Delete**
- **FAB +** → **New to‑do tab** (opens a blank tab or notes URL, then snooze it)

---

### 5) Notifications & badge (optional)
- When a tab wakes: desktop notification; clicking the notification opens a new tab to the scheduled URL.
- If multiple tabs wake at once: open all, then show a summary notification like “n tabs re‑opened”.
- **Toolbar badge**: shows total upcoming count; updates on change (create, edit, delete, wake).

---

### 6) Keyboard shortcuts (editable at `chrome://extensions/shortcuts`)
**Suggested defaults:**
- **Snooze active tab:** `Alt+S`
- **Open Sleeping Tabs list:** `Alt+L`
- **Repeat last snooze:** `Alt+Shift+S`
- **New to‑do tab:** `Alt+1`

“Repeat last snooze” repeats the last non‑recurring snooze (either a preset or a custom date from Pick a Date).

---

## Settings
### General
- **Wake‑up notification** (enable/disable)

### Presets
- **Tomorrow starts at** `08:00`
- **Evening starts at** `19:00`
- **Week starts on** Monday (fixed)
- **Later Today** offset (e.g., `+3h`)
- **Someday** default (e.g., `+3 months`)
- **Default time** for date picker


- **Danger zone**: Delete all snoozes (confirmation dialog; no undo)

---

## Architecture (MV3, vanilla JS)
- **Service worker** (background): schedules, alarms, storage, notifications.
- **Popup UI**: presets grid, routes to date/recurring modals.
- **Options page**: settings & data management.
- **Sleeping Tabs page**: list and item actions.

### Data model
```ts
export type Snooze = {
  id: string;                 // uuid
  url: string;
  title?: string;
  createdAt: string;          // ISO UTC
  fireAt: string;             // ISO UTC
  recurrenceId?: string;      // link if generated by a recurrence
};

export type Recurrence = {
  id: string;                 // uuid
  kind: 'daily'|'weekly'|'monthly';
  daysOfWeek?: number[];      // 0..6, Sun..Sat (for weekly)
  dayOfMonth?: number;        // 1..31 (for monthly)
  hour: number;               // 0..23
  minute: number;             // 0..59
  url: string;
  title?: string;
  nextFireAt: string;         // computed UTC
};

## Scheduling

- Use one `chrome.alarms.create(id, { when })` per snooze/recurrence instance with UTC timestamps.
- Alarm IDs use namespaces like `snooze:{id}` and `recur:{id}` to avoid collisions.
- On alarm: validate URL, open in the last-active normal window; if none, create a new normal window; focus the tab. Remove the item immediately upon open. If opening fails, keep it and retry on next browser launch.
- On startup/cold start: reconcile storage and create any missing alarms; fire missed alarms immediately.
- System sleep: if time passed while asleep, fire immediately on resume.

## Storage strategy

- Default: `chrome.storage.local` only (no sync).
- Capacity: up to 500 scheduled items (snoozes + recurrences). Exceeding attempts are rejected with user feedback.

## Permissions (minimal)

```json
{
  "permissions": ["tabs", "storage", "alarms", "notifications"],
  "action": { "default_popup": "popup.html" }
}
```

- Avoid content scripts unless strictly needed.

## Security notes

- Treat cross-component messages as untrusted; verify structure and origin.
- Sanitize all user inputs in Settings and custom dates.
- Store only URL + title + schedule; no page content.
- Validate message shapes at runtime (e.g., lightweight schema checks / type guards).

## Manifest (skeleton)

```json
{
  "manifest_version": 3,
  "name": "Reopen Tab Later",
  "version": "0.1.0",
  "description": "Reopen tabs later - hide a tab now and get it back exactly when you want.",
  "action": { "default_title": "Snooze this tab", "default_popup": "popup.html" },
  "background": { "service_worker": "sw.js" },
  "options_page": "options.html",
  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" },
  "permissions": ["tabs", "storage", "alarms", "notifications"]
}
```

## Compliance checklist

- Adhere to MV3 best practices: https://developer.chrome.com/docs/webstore/best-practices#manifest_version_3  
- Request minimal permissions.  
- Validate & sanitize all inputs (settings, custom dates).  
- Verify `runtime.onMessage` senders; ignore unexpected origins.  
- Test across latest Chromium variants (Chrome, Edge, Brave, Vivaldi, Arc).

## Development

- **Stack:** vanilla JS (optionally Vite/ESBuild for bundling; no Node APIs in SW).
- **Run:** Load unpacked at `chrome://extensions` → Developer mode → Load unpacked.
- **Shortcuts:** configure at `chrome://extensions/shortcuts`.
- **Testing matrix:** Chrome, Edge, Brave, Arc, Vivaldi; light/dark.

## Accessibility

- Full keyboard support in popup (arrow keys move the grid; `Enter` confirms).
- Focus outlines visible; contrasts meet WCAG AA.
- Screen-reader labels for tiles and actions.
- Time & date respect user locale (`Intl.DateTimeFormat`).
- Use 24‑hour time in UI; week starts on Monday.

## Privacy

- No analytics.
- All data stays in chrome.storage;

## Known limitations
- Clearing extension data removes schedules.
- Do not work in Incognito mode.

## FAQ

- What happens if the browser is closed at the scheduled time? 
The alarm fires at next startup; Reopen Tab Later opens the tab immediately.
- Do I need host permissions for every site? 
No. The extension uses minimal permissions (`tabs`, `storage`, `alarms`, `notifications`) and does not request host permissions.

License

- MIT

