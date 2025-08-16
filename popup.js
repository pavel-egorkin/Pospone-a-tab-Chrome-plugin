const PRESETS = [
	{ id: 'later-today', label: 'Later Today' },
	{ id: 'this-evening', label: 'This Evening' },
	{ id: 'tomorrow', label: 'Tomorrow' },
	{ id: 'next-weekend', label: 'Next Weekend' },
	{ id: 'next-week', label: 'Next Week' },
	{ id: 'in-a-month', label: 'In a Month' },
	{ id: 'someday', label: 'Someday' },
	{ id: 'repeatedly', label: 'Repeatedly' },
	{ id: 'pick-a-date', label: 'Pick a Date' }
];

async function sendMessage(type, payload) {
	return await chrome.runtime.sendMessage({ type, payload });
}

function render() {
	const grid = document.getElementById('grid');
	grid.innerHTML = '';
	PRESETS.forEach(p => {
		const btn = document.createElement('button');
		btn.className = 'tile';
		btn.textContent = p.label;
		btn.addEventListener('click', () => onTile(p.id));
		grid.appendChild(btn);
	});
	document.getElementById('sleeping').addEventListener('click', async (e) => {
		e.preventDefault();
		const url = chrome.runtime.getURL('sleeping.html');
		await chrome.tabs.create({ url });
	});
	document.getElementById('settings').addEventListener('click', async (e) => {
		e.preventDefault();
		const url = chrome.runtime.getURL('options.html');
		await chrome.tabs.create({ url });
	});
}

async function onTile(id) {
	if (id === 'repeatedly') {
		const url = chrome.runtime.getURL('recurring.html');
		await chrome.tabs.create({ url });
		return;
	}
	if (id === 'pick-a-date') {
		const url = chrome.runtime.getURL('pick.html');
		await chrome.tabs.create({ url });
		return;
	}
	// preset
	const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
	const url = tab?.url || 'chrome://newtab/';
	const title = tab?.title || 'Tab';
	const res = await sendMessage('resolvePreset', { preset: id });
	if (!res.ok) return alert(res.error || 'Failed');
	const fireAtIso = res.data;
	const created = await sendMessage('createSnooze', { url, title, fireAtIso, source: { kind: 'preset', preset: id } });
	if (!created.ok) return alert(created.error || 'Failed');
	window.close();
}

document.addEventListener('DOMContentLoaded', render);
