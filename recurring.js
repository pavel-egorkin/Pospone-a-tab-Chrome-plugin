async function sendMessage(type, payload) {
	return await chrome.runtime.sendMessage({ type, payload });
}

function $(id){ return document.getElementById(id); }

function parseTime(value){
	const [h, m] = value.split(':').map(x => parseInt(x,10));
	return { hour: h, minute: m };
}

document.addEventListener('DOMContentLoaded', async () => {
	const now = new Date();
	$('time').value = `${String(now.getHours()).padStart(2,'0')}:${String(Math.floor(now.getMinutes()/30)*30).padStart(2,'0')}`;
	$('kind').addEventListener('change', () => {
		const k = $('kind').value;
		$('weeklyDays').style.display = k === 'weekly' ? '' : 'none';
		$('monthlyDay').style.display = k === 'monthly' ? '' : 'none';
	});
	$('useActive').addEventListener('click', async () => {
		const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
		const url = tab?.url || 'chrome://newtab/';
		const title = tab?.title || 'Tab';
		const k = $('kind').value;
		const { hour, minute } = parseTime($('time').value);
		let payload = { kind: k, hour, minute, url, title };
		if (k === 'weekly') {
			const days = Array.from(document.querySelectorAll('#weeklyDays input[type="checkbox"]:checked')).map(el => parseInt(el.value,10));
			if (days.length === 0) return alert('Pick at least one weekday');
			payload.daysOfWeek = days;
		}
		if (k === 'monthly') {
			payload.dayOfMonth = parseInt($('dom').value,10);
		}
		const res = await sendMessage('createRecurrence', payload);
		if (!res.ok) return alert(res.error || 'Failed');
		window.close();
	});
});
