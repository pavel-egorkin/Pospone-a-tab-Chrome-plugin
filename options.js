async function sendMessage(type, payload) {
  return await chrome.runtime.sendMessage({ type, payload });
}

function $(id){ return document.getElementById(id); }

async function load() {
  const res = await sendMessage('getSettings');
  if (!res.ok) return;
  const s = res.data;
  const notif = $('notif');
  if (notif) notif.checked = !!s.wakeNotificationEnabled;
}

async function saveNotif() {
  const notif = $('notif');
  if (!notif) return;
  const res = await sendMessage('saveSettings', { wakeNotificationEnabled: !!notif.checked });
  if (!res.ok) alert(res.error || 'Failed to save');
}

async function deleteAll() {
  if (!confirm('Delete all snoozes? This cannot be undone.')) return;
  const res = await sendMessage('clearAllSnoozes');
  if (res?.ok) alert('All snoozes deleted.');
  else alert('Failed: ' + (res?.error || 'Unknown error'));
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  const notif = $('notif');
  if (notif) notif.addEventListener('change', saveNotif);
  const del = $('deleteAll');
  if (del) del.addEventListener('click', deleteAll);
});
