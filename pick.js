async function sendMessage(type, payload) {
	return await chrome.runtime.sendMessage({ type, payload });
}

function $(id){ return document.getElementById(id); }

function toIsoUtcLocal(date, time){
	const [y,m,d] = date.split('-').map(x=>parseInt(x,10));
	const [hh,mm] = time.split(':').map(x=>parseInt(x,10));
	const local = new Date(y, m-1, d, hh, mm, 0, 0);
	return new Date(local.getTime() - local.getTimezoneOffset()*60000).toISOString();
}

document.addEventListener('DOMContentLoaded', async () => {
	const settings = await sendMessage('getSettings');
	const now = new Date();
	$('date').valueAsDate = now;
	const hh = String(settings.ok ? settings.data.defaultPickerHour : 8).padStart(2,'0');
	$('time').value = `${hh}:00`;
	$('create').addEventListener('click', async () => {
		const date = $('date').value;
		const time = $('time').value;
		if (!date || !time) return alert('Pick date and time');
		const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
		const url = tab?.url || 'chrome://newtab/';
		const title = tab?.title || 'Tab';
		const fireAtIso = toIsoUtcLocal(date, time);
		const res = await sendMessage('createSnooze', { url, title, fireAtIso, source: { kind: 'custom', customTimeIso: fireAtIso } });
		if (!res.ok) return alert(res.error || 'Failed');
		// Close the current tab after successfully creating the snooze
		if (tab?.id) {
			await chrome.tabs.remove(tab.id);
		}
		window.close();
	});
});
