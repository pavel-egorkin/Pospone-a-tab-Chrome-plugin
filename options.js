async function sendMessage(type, payload) {
	return await chrome.runtime.sendMessage({ type, payload });
}

function $(id){ return document.getElementById(id); }

async function load() {
	const res = await sendMessage('getSettings');
	if (!res.ok) return;
	const s = res.data;
	$('notif').checked = !!s.wakeNotificationEnabled;
	$('tomorrow').value = s.tomorrowStartHour;
	$('later').value = s.laterTodayOffsetHours;
	$('someday').value = s.somedayMonths;
	$('defaultHour').value = s.defaultPickerHour;
}

async function save() {
	const payload = {
		wakeNotificationEnabled: $('notif').checked,
		tomorrowStartHour: parseInt($('tomorrow').value, 10),
		laterTodayOffsetHours: parseInt($('later').value, 10),
		somedayMonths: parseInt($('someday').value, 10),
		defaultPickerHour: parseInt($('defaultHour').value, 10)
	};
	const res = await sendMessage('saveSettings', payload);
	if (!res.ok) alert(res.error || 'Failed to save');
}

async function deleteAll() {
	if (!confirm('Delete all snoozes and recurrences? This cannot be undone.')) return;
	await chrome.storage.local.set({ snoozes: [], recurrences: [] });
	const alarms = await chrome.alarms.getAll();
	await Promise.all(alarms.map(a => chrome.alarms.clear(a.name)));
	alert('Deleted.');
}

document.addEventListener('DOMContentLoaded', () => {
	load();
	$('save').addEventListener('click', save);
	$('deleteAll').addEventListener('click', deleteAll);
	const testBtn = document.getElementById('testNotif');
	if (testBtn) {
		testBtn.addEventListener('click', async () => {
			const res = await sendMessage('testNotification');
			if (!res.ok) alert('Notification failed: ' + (res.error || 'Unknown error'));
		});
	}
});
