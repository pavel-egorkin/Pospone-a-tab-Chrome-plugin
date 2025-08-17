// Reopen Tab Later MV3 Service Worker
// Minimal, single-file implementation of storage, time rules, scheduling, notifications, badge, and messaging.

// -----------------------------
// Constants & defaults
// -----------------------------
const STORAGE_KEYS = {
  snoozes: 'snoozes',
  recurrences: 'recurrences',
  settings: 'settings',
  meta: 'meta'
};

const CAPACITY_LIMIT = 500; // total snoozes + recurrences

const DEFAULT_SETTINGS = {
  wakeNotificationEnabled: true,
  tomorrowStartHour: 8, // 08:00
  eveningStartHour: 19, // 19:00
  laterTodayOffsetHours: 3,
  somedayMonths: 3,
  defaultPickerHour: 8,
  weekStartsOnMonday: true
};

// Track last-active normal window
let lastActiveNormalWindowId = null;

// -----------------------------
// Utilities
// -----------------------------
function generateId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function clampToFuture(date) {
  const now = new Date();
  if (date <= now) {
    // push one minute in the future to be safe
    return new Date(now.getTime() + 60 * 1000);
  }
  return date;
}

function toIsoUtc(date) {
  return new Date(date.getTime()).toISOString();
}

function fromIsoUtc(iso) {
  return new Date(iso);
}

function setLocalHhMm(date, hour, minute) {
  const d = new Date(date.getTime());
  d.setHours(hour, minute, 0, 0);
  return d;
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.settings], (res) => {
      resolve({ ...DEFAULT_SETTINGS, ...(res[STORAGE_KEYS.settings] || {}) });
    });
  });
}

function setSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings }, resolve);
  });
}

function getAll() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.snoozes, STORAGE_KEYS.recurrences, STORAGE_KEYS.meta], (res) => {
      resolve({
        snoozes: res[STORAGE_KEYS.snoozes] || [],
        recurrences: res[STORAGE_KEYS.recurrences] || [],
        meta: res[STORAGE_KEYS.meta] || {}
      });
    });
  });
}

function setAll({ snoozes, recurrences, meta }) {
  const payload = {};
  if (snoozes) payload[STORAGE_KEYS.snoozes] = snoozes;
  if (recurrences) payload[STORAGE_KEYS.recurrences] = recurrences;
  if (meta) payload[STORAGE_KEYS.meta] = meta;
  return new Promise((resolve) => chrome.storage.local.set(payload, resolve));
}

async function getCounts() {
  const { snoozes, recurrences } = await getAll();
  return { snoozesCount: snoozes.length, recurrencesCount: recurrences.length };
}

async function ensureCapacity(extraItems = 1) {
  const { snoozesCount, recurrencesCount } = await getCounts();
  const total = snoozesCount + recurrencesCount + extraItems;
  if (total > CAPACITY_LIMIT) {
    throw new Error(`Capacity exceeded (${total}/${CAPACITY_LIMIT}). Delete some items first.`);
  }
}

function msUntil(date) {
  return Math.max(0, date.getTime() - Date.now());
}

// -----------------------------
// Time rules (local-time stable)
// -----------------------------
async function resolvePreset(preset) {
  const s = await getSettings();
  const now = new Date();
  let target = new Date(now.getTime());

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime());
  endOfToday.setHours(23, 59, 59, 999);

  function nextMonday(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay(); // 0 Sun .. 6 Sat
    const offset = (8 - day) % 7; // days until Monday
    d.setDate(d.getDate() + (offset === 0 ? 7 : offset));
    return setLocalHhMm(d, s.defaultPickerHour, 0);
  }

  function nextSaturday(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay();
    const offset = (6 - day + 7) % 7; // days until Saturday
    d.setDate(d.getDate() + (offset === 0 ? 7 : offset));
    return setLocalHhMm(d, s.defaultPickerHour, 0);
  }

  switch (preset) {
    case '1-minute': {
      target = new Date(now.getTime() + 60 * 1000); // 60 seconds = 1 minute
      break;
    }
    case 'later-today': {
      target = new Date(now.getTime() + s.laterTodayOffsetHours * 60 * 60 * 1000);
      if (target > endOfToday) {
        const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        target = setLocalHhMm(t, s.tomorrowStartHour, 0);
      }
      break;
    }
    case 'this-evening': {
      target = setLocalHhMm(now, s.eveningStartHour, 0);
      if (target <= now) {
        const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        target = setLocalHhMm(t, s.eveningStartHour, 0);
      }
      break;
    }
    case 'tomorrow': {
      const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      target = setLocalHhMm(t, s.tomorrowStartHour, 0);
      break;
    }
    case 'next-week': {
      target = nextMonday(now);
      break;
    }
    case 'next-weekend': {
      target = nextSaturday(now);
      break;
    }
    case 'in-a-month': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setMonth(d.getMonth() + 1);
      // if day invalid (e.g., 31st not present), push to 1st
      if (d.getDate() !== now.getDate()) {
        d.setDate(1);
      }
      target = setLocalHhMm(d, s.defaultPickerHour, 0);
      break;
    }
    case 'someday': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setMonth(d.getMonth() + s.somedayMonths);
      if (d.getDate() !== now.getDate()) {
        d.setDate(1);
      }
      target = setLocalHhMm(d, s.defaultPickerHour, 0);
      break;
    }
    default:
      throw new Error('Unknown preset');
  }

  target = clampToFuture(target);
  return toIsoUtc(target);
}

function computeNextWeeklyOccurrence(daysOfWeek, hour, minute, fromDate = new Date()) {
  const sorted = [...daysOfWeek].sort((a, b) => a - b);
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  for (let i = 0; i < 14; i++) {
    const d = new Date(start.getTime());
    d.setDate(d.getDate() + i);
    if (sorted.includes(d.getDay())) {
      const candidate = setLocalHhMm(d, hour, minute);
      if (candidate > fromDate) return candidate;
    }
  }
  // fallback next week same first weekday
  const d = new Date(start.getTime());
  d.setDate(d.getDate() + 7);
  const wd = sorted[0] ?? 1;
  while (d.getDay() !== wd) d.setDate(d.getDate() + 1);
  return setLocalHhMm(d, hour, minute);
}

function computeNextMonthlyOccurrence(dayOfMonth, hour, minute, fromDate = new Date()) {
  const current = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  // try this month
  let candidate = new Date(current.getFullYear(), current.getMonth(), Math.min(dayOfMonth, 28));
  if (dayOfMonth >= 29) {
    const tmp = new Date(current.getFullYear(), current.getMonth(), dayOfMonth);
    if (tmp.getMonth() !== current.getMonth()) {
      candidate = new Date(current.getFullYear(), current.getMonth(), 1); // rule: use 1st if 29–31 invalid
    } else {
      candidate = tmp;
    }
  }
  candidate = setLocalHhMm(candidate, hour, minute);
  if (candidate > fromDate) return candidate;
  // next month
  const nextM = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  let cand2 = new Date(nextM.getFullYear(), nextM.getMonth(), Math.min(dayOfMonth, 28));
  if (dayOfMonth >= 29) {
    const tmp2 = new Date(nextM.getFullYear(), nextM.getMonth(), dayOfMonth);
    if (tmp2.getMonth() !== nextM.getMonth()) {
      cand2 = new Date(nextM.getFullYear(), nextM.getMonth(), 1);
    } else {
      cand2 = tmp2;
    }
  }
  return setLocalHhMm(cand2, hour, minute);
}

function computeNextDaily(hour, minute, fromDate = new Date()) {
  const today = setLocalHhMm(fromDate, hour, minute);
  if (today > fromDate) return today;
  const t = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + 1);
  return setLocalHhMm(t, hour, minute);
}

// -----------------------------
// Scheduler & storage operations
// -----------------------------
async function updateBadge() {
  const { snoozes, recurrences } = await getAll();
  const total = (snoozes?.length || 0) + (recurrences?.length || 0);
  await chrome.action.setBadgeBackgroundColor({ color: '#0F172A' });
  await chrome.action.setBadgeText({ text: total > 0 ? String(total) : '' });
}

async function createAlarmForSnooze(snooze) {
  const when = fromIsoUtc(snooze.fireAt).getTime();
  await chrome.alarms.create(`snooze:${snooze.id}`, { when });
}

async function createAlarmForRecurrence(rec) {
  const when = fromIsoUtc(rec.nextFireAt).getTime();
  await chrome.alarms.create(`recur:${rec.id}`, { when });
}

async function openUrlInWindow(url) {
  try {
    let windowId = lastActiveNormalWindowId;
    if (windowId) {
      const win = await chrome.windows.get(windowId).catch(() => null);
      if (!win || win.type !== 'normal') windowId = null;
    }
    if (!windowId) {
      // try to get last focused normal window
      const wins = await chrome.windows.getAll({ populate: false });
      const normal = wins.find(w => w.type === 'normal');
      if (normal) windowId = normal.id;
    }
    if (windowId) {
      await chrome.tabs.create({ windowId, url, pinned: false, active: false });
    } else {
      const win = await chrome.windows.create({ url, focused: false, type: 'normal' });
      lastActiveNormalWindowId = win.id || null;
    }
    return true;
  } catch (e) {
    console.warn('Open failed', e);
    return false;
  }
}

async function handleSnoozeFire(snoozeIds) {
  const { snoozes } = await getAll();
  const toOpen = snoozes.filter(s => snoozeIds.includes(s.id));
  const remaining = snoozes.filter(s => !snoozeIds.includes(s.id));

  const results = [];
  for (const s of toOpen) {
    const ok = await openUrlInWindow(s.url);
    if (ok) {
      results.push(s);
    } else {
      // keep in storage, will retry on next startup
      remaining.push(s);
    }
  }
  await setAll({ snoozes: remaining });
  await updateBadge();

  const settings = await getSettings();
  if (settings.wakeNotificationEnabled) {
    try {
      if (results.length === 1) {
        const s = results[0];
        await chrome.notifications.create(`wake:${s.id}`, {
          type: 'basic',
          iconUrl: 'icons/128.png',
          title: 'Tab re-opened',
          message: s.title || s.url,
          priority: 2,
          silent: false,
          requireInteraction: false
        });
        console.log('Notification created for tab:', s.title || s.url);
      } else if (results.length > 1) {
        await chrome.notifications.create('wake:summary', {
          type: 'basic',
          iconUrl: 'icons/128.png',
          title: 'Tabs re-opened',
          message: `${results.length} tabs re-opened`,
          priority: 2,
          silent: false,
          requireInteraction: false
        });
        console.log('Summary notification created for', results.length, 'tabs');
      }
    } catch (e) {
      console.warn('Failed to create notification:', e);
    }
  } else {
    console.log('Wake notifications are disabled in settings');
  }
}

async function handleRecurrenceFire(recIds) {
  const { recurrences } = await getAll();
  const fired = recurrences.filter(r => recIds.includes(r.id));

  for (const r of fired) {
    await openUrlInWindow(r.url);
    // compute next and reschedule
    let next;
    const now = new Date();
    if (r.kind === 'daily') {
      next = computeNextDaily(r.hour, r.minute, now);
    } else if (r.kind === 'weekly' && Array.isArray(r.daysOfWeek) && r.daysOfWeek.length > 0) {
      next = computeNextWeeklyOccurrence(r.daysOfWeek, r.hour, r.minute, now);
    } else if (r.kind === 'monthly' && typeof r.dayOfMonth === 'number') {
      next = computeNextMonthlyOccurrence(r.dayOfMonth, r.hour, r.minute, now);
    } else {
      // invalid config; skip
      continue;
    }
    r.nextFireAt = toIsoUtc(next);
    await createAlarmForRecurrence(r);
  }

  // persist updated recurrences
  const updated = recurrences.map(r => {
    const u = fired.find(f => f.id === r.id);
    return u ? r : r;
  });
  await setAll({ recurrences: recurrences });
  await updateBadge();
}

// -----------------------------
// Messaging API
// -----------------------------
async function handleMessage(request, sender) {
  const { type, payload } = request || {};
  try {
    switch (type) {
      case 'testNotification': {
        try {
          await chrome.notifications.create('test:notif', {
            type: 'basic',
            iconUrl: 'icons/128.png',
            title: 'Reopen Tab Later',
            message: 'Test notification',
            priority: 2
          });
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e?.message || String(e) };
        }
      }
      case 'getSettings': {
        const s = await getSettings();
        return { ok: true, data: s };
      }
      case 'saveSettings': {
        const merged = { ...(await getSettings()), ...(payload || {}) };
        await setSettings(merged);
        return { ok: true };
      }
      case 'listAll': {
        const data = await getAll();
        return { ok: true, data };
      }
      case 'listSnoozes': {
        const { snoozes } = await getAll();
        return { ok: true, data: snoozes };
      }
      case 'listRecurrences': {
        const { recurrences } = await getAll();
        return { ok: true, data: recurrences };
      }
      case 'deleteSnooze': {
        const { id } = payload;
        const { snoozes } = await getAll();
        const remaining = snoozes.filter(s => s.id !== id);
        await setAll({ snoozes: remaining });
        await chrome.alarms.clear(`snooze:${id}`);
        await updateBadge();
        return { ok: true };
      }
      case 'wakeSnooze': {
        const { id } = payload;
        const { snoozes } = await getAll();
        const s = snoozes.find(x => x.id === id);
        if (!s) return { ok: false, error: 'Not found' };
        const ok = await openUrlInWindow(s.url);
        if (ok) {
          const remaining = snoozes.filter(x => x.id !== id);
          await setAll({ snoozes: remaining });
          await chrome.alarms.clear(`snooze:${id}`);
          await updateBadge();
        }
        return { ok };
      }
      case 'rescheduleSnooze': {
        const { id, fireAtIso } = payload;
        const { snoozes } = await getAll();
        const idx = snoozes.findIndex(s => s.id === id);
        if (idx === -1) return { ok: false, error: 'Not found' };
        snoozes[idx].fireAt = fireAtIso;
        await setAll({ snoozes });
        await createAlarmForSnooze(snoozes[idx]);
        await updateBadge();
        return { ok: true };
      }
      case 'createSnooze': {
        const { url, title, fireAtIso, source } = payload;
        await ensureCapacity(1);
        const s = { id: generateId(), url, title, createdAt: toIsoUtc(new Date()), fireAt: fireAtIso };
        const store = await getAll();
        store.snoozes.push(s);
        // remember last non-recurring
        store.meta = store.meta || {};
        store.meta.lastNonRecurring = { kind: source?.kind || 'custom', preset: source?.preset || null, hour: source?.hour || null, minute: source?.minute || null, customTimeIso: source?.customTimeIso || null };
        await setAll(store);
        await createAlarmForSnooze(s);
        await updateBadge();
        return { ok: true, data: s };
      }
      case 'createRecurrence': {
        const { kind, daysOfWeek, dayOfMonth, hour, minute, url, title } = payload;
        await ensureCapacity(1);
        const now = new Date();
        let next;
        if (kind === 'daily') next = computeNextDaily(hour, minute, now);
        else if (kind === 'weekly') next = computeNextWeeklyOccurrence(daysOfWeek || [], hour, minute, now);
        else if (kind === 'monthly') next = computeNextMonthlyOccurrence(dayOfMonth, hour, minute, now);
        else throw new Error('Invalid recurrence kind');
        const r = { id: generateId(), kind, daysOfWeek, dayOfMonth, hour, minute, url, title, nextFireAt: toIsoUtc(next) };
        const store = await getAll();
        store.recurrences.push(r);
        await setAll(store);
        await createAlarmForRecurrence(r);
        await updateBadge();
        return { ok: true, data: r };
      }
      case 'deleteRecurrence': {
        const { id } = payload;
        const store = await getAll();
        store.recurrences = store.recurrences.filter(r => r.id !== id);
        await setAll(store);
        await chrome.alarms.clear(`recur:${id}`);
        await updateBadge();
        return { ok: true };
      }
      case 'resolvePreset': {
        const { preset } = payload;
        const iso = await resolvePreset(preset);
        return { ok: true, data: iso };
      }
      case 'repeatLast': {
        const store = await getAll();
        const last = store.meta?.lastNonRecurring;
        if (!last) return { ok: false, error: 'Nothing to repeat' };
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const url = activeTab?.url || 'chrome://newtab/';
        const title = activeTab?.title || 'Tab';
        let fireAtIso;
        if (last.kind === 'preset' && last.preset) {
          fireAtIso = await resolvePreset(last.preset);
        } else if (last.kind === 'custom') {
          // repeat custom: schedule same local time tomorrow
          const when = fromIsoUtc(last.customTimeIso || toIsoUtc(new Date()));
          const t = new Date();
          t.setDate(t.getDate() + 1);
          const d = setLocalHhMm(t, when.getHours(), when.getMinutes());
          fireAtIso = toIsoUtc(clampToFuture(d));
        } else {
          fireAtIso = await resolvePreset('later-today');
        }
        return await handleMessage({ type: 'createSnooze', payload: { url, title, fireAtIso, source: last } });
      }
      default:
        return { ok: false, error: 'Unknown message type' };
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const result = await handleMessage(message, sender);
    sendResponse(result);
  })();
  return true;
});

// -----------------------------
// Commands
// -----------------------------
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-sleeping') {
    const url = chrome.runtime.getURL('sleeping.html');
    await openUrlInWindow(url);
  } else if (command === 'snooze-active') {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const url = tab?.url || 'chrome://newtab/';
    const title = tab?.title || 'Tab';
    const fireAtIso = await resolvePreset('later-today');
    const result = await handleMessage({ type: 'createSnooze', payload: { url, title, fireAtIso, source: { kind: 'preset', preset: 'later-today' } } });
    // Close the tab after successfully creating the snooze
    if (result.ok && tab?.id) {
      await chrome.tabs.remove(tab.id);
    }
  } else if (command === 'repeat-last-snooze') {
    await handleMessage({ type: 'repeatLast' });
  } else if (command === 'new-todo-tab') {
    await openUrlInWindow('chrome://newtab/');
  }
});

// -----------------------------
// Notifications: click opens a new tab to the URL (handled via wake event notification id mapping)
// For simplicity, we do not persist mapping beyond immediate open actions here.
// -----------------------------
chrome.notifications.onClicked.addListener(async (notificationId) => {
  // no-op; per wake we already opened the tab. Could route to sleeping list.
  const url = chrome.runtime.getURL('sleeping.html');
  await openUrlInWindow(url);
});

// -----------------------------
// Window tracking
// -----------------------------
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId).catch(() => null);
  if (tab && tab.windowId) {
    const win = await chrome.windows.get(tab.windowId).catch(() => null);
    if (win && win.type === 'normal') lastActiveNormalWindowId = win.id;
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const win = await chrome.windows.get(windowId).catch(() => null);
  if (win && win.type === 'normal') lastActiveNormalWindowId = win.id;
});

// -----------------------------
// Alarms
// -----------------------------
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (!alarm?.name) return;
    if (alarm.name.startsWith('snooze:')) {
      const id = alarm.name.split(':')[1];
      await handleSnoozeFire([id]);
    } else if (alarm.name.startsWith('recur:')) {
      const id = alarm.name.split(':')[1];
      await handleRecurrenceFire([id]);
    }
  } catch (e) {
    console.error('onAlarm error', e);
  }
});

// -----------------------------
// Startup reconciliation
// -----------------------------
async function reconcile() {
  const store = await getAll();
  const now = new Date();

  // Snoozes: open missed; schedule future
  const missedSnoozes = [];
  const futureSnoozes = [];
  for (const s of store.snoozes) {
    const t = fromIsoUtc(s.fireAt);
    if (t <= now) missedSnoozes.push(s);
    else futureSnoozes.push(s);
  }
  // open missed immediately
  if (missedSnoozes.length > 0) {
    await handleSnoozeFire(missedSnoozes.map(s => s.id));
  }
  // schedule remaining
  for (const s of futureSnoozes) await createAlarmForSnooze(s);

  // Recurrences: fire missed once, then schedule next
  const firedRecIds = [];
  for (const r of store.recurrences) {
    const t = fromIsoUtc(r.nextFireAt);
    if (t <= now) firedRecIds.push(r.id);
  }
  if (firedRecIds.length > 0) await handleRecurrenceFire(firedRecIds);
  for (const r of store.recurrences) await createAlarmForRecurrence(r);

  await updateBadge();
}

chrome.runtime.onStartup.addListener(() => { reconcile().catch(console.error); });
chrome.runtime.onInstalled.addListener(() => { reconcile().catch(console.error); });
