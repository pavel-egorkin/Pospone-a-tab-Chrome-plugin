// Reopen Tab Later MV3 Service Worker
// Minimal, single-file implementation of storage, time rules, scheduling, notifications, badge, and messaging.

// -----------------------------
// Constants & defaults
// -----------------------------
const STORAGE_KEYS = {
  snoozes: 'snoozes',
  settings: 'settings',
  meta: 'meta'
};

const CAPACITY_LIMIT = 500; // total snoozes

const DEFAULT_SETTINGS = {
  wakeNotificationEnabled: true,
  tomorrowStartHour: 9, // 09:00
  eveningStartHour: 18, // 18:00
  defaultPickerHour: 9
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
    chrome.storage.local.get([STORAGE_KEYS.snoozes, STORAGE_KEYS.meta], (res) => {
      resolve({
        snoozes: res[STORAGE_KEYS.snoozes] || [],
        meta: res[STORAGE_KEYS.meta] || {}
      });
    });
  });
}

function setAll({ snoozes, meta }) {
  const payload = {};
  if (snoozes) payload[STORAGE_KEYS.snoozes] = snoozes;
  if (meta) payload[STORAGE_KEYS.meta] = meta;
  return new Promise((resolve) => chrome.storage.local.set(payload, resolve));
}

async function getCounts() {
  const { snoozes } = await getAll();
  return { snoozesCount: snoozes.length };
}

async function ensureCapacity(extraItems = 1) {
  const { snoozesCount } = await getCounts();
  const total = snoozesCount + extraItems;
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
    case 'in-1-hour': {
      target = new Date(now.getTime() + 60 * 60 * 1000);
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
    case 'tomorrow-morning': {
      const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      target = setLocalHhMm(t, s.tomorrowStartHour, 0);
      break;
    }
    case 'next-week': {
      target = nextMonday(now);
      break;
    }
    case 'this-weekend': {
      target = nextSaturday(now);
      break;
    }
    default:
      throw new Error('Unknown preset');
  }

  target = clampToFuture(target);
  return toIsoUtc(target);
}

// Recurrence helpers removed

// -----------------------------
// Scheduler & storage operations
// -----------------------------
async function updateBadge() {
  const { snoozes } = await getAll();
  const total = (snoozes?.length || 0);
  await chrome.action.setBadgeBackgroundColor({ color: '#0F172A' });
  await chrome.action.setBadgeText({ text: total > 0 ? String(total) : '' });
}

async function createAlarmForSnooze(snooze) {
  const when = fromIsoUtc(snooze.fireAt).getTime();
  await chrome.alarms.create(`snooze:${snooze.id}`, { when });
}

// Recurrence alarms removed

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

// Recurrence handling removed

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
      case 'clearAllSnoozes': {
        const { snoozes } = await getAll();
        // Clear all related alarms
        for (const s of snoozes) {
          try { await chrome.alarms.clear(`snooze:${s.id}`); } catch (e) { /* ignore */ }
        }
        await setAll({ snoozes: [] });
        await updateBadge();
        return { ok: true };
      }
      // Recurrences removed
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
      // Recurrence creation/deletion removed
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
          fireAtIso = await resolvePreset('in-1-hour');
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
    const fireAtIso = await resolvePreset('in-1-hour');
    const result = await handleMessage({ type: 'createSnooze', payload: { url, title, fireAtIso, source: { kind: 'preset', preset: 'in-1-hour' } } });
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

  await updateBadge();
}

chrome.runtime.onStartup.addListener(() => { reconcile().catch(console.error); });
chrome.runtime.onInstalled.addListener(() => { reconcile().catch(console.error); });
