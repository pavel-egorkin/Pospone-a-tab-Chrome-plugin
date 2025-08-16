async function sendMessage(type, payload) {
	return await chrome.runtime.sendMessage({ type, payload });
}

function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function formatLocal(iso){
	const d = new Date(iso);
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(d);
}

function groupSnoozes(snoozes){
	const now = new Date();
	const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
	const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 23, 59, 59, 999);
	// Determine week boundaries (start Monday)
	const day = now.getDay(); // 0 Sun .. 6 Sat
	const mondayOffset = (day === 0 ? -6 : 1 - day);
	const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate()+mondayOffset);
	const endOfWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate()+6, 23,59,59,999);
	const groups = { Today: [], Tomorrow: [], 'This Week': [], Later: [] };
	for (const s of snoozes) {
		const t = new Date(s.fireAt);
		if (t <= todayEnd) groups['Today'].push(s);
		else if (t <= tomorrowEnd) groups['Tomorrow'].push(s);
		else if (t <= endOfWeek) groups['This Week'].push(s);
		else groups['Later'].push(s);
	}
	for (const k of Object.keys(groups)) groups[k].sort((a,b)=> new Date(a.fireAt)-new Date(b.fireAt));
	return groups;
}

function renderGroups(groups){
	const lists = document.getElementById('lists');
	lists.innerHTML = '';
	Object.entries(groups).forEach(([name, items]) => {
		if (items.length === 0) return;
		const wrapper = document.createElement('div');
		wrapper.className = 'group';
		const h2 = document.createElement('h2');
		h2.textContent = name;
		wrapper.appendChild(h2);
		items.forEach(item => {
			const row = document.createElement('div');
			row.className = 'card';
			const left = document.createElement('div');
			left.textContent = `${item.title || item.url} — ${formatLocal(item.fireAt)}`;
			const actions = document.createElement('div');
			actions.className = 'actions';
			const wakeBtn = document.createElement('button'); wakeBtn.textContent = 'Wake'; wakeBtn.onclick = () => onWake(item.id);
			const resBtn = document.createElement('button'); resBtn.textContent = 'Reschedule'; resBtn.onclick = () => onReschedule(item.id);
			const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.onclick = () => onDelete(item.id);
			actions.appendChild(wakeBtn); actions.appendChild(resBtn); actions.appendChild(delBtn);
			row.appendChild(left); row.appendChild(actions);
			wrapper.appendChild(row);
		});
		lists.appendChild(wrapper);
	});
}

function renderRecurrences(recurrences){
	if (!recurrences || recurrences.length === 0) return;
	const lists = document.getElementById('lists');
	const wrapper = document.createElement('div');
	wrapper.className = 'group';
	const h2 = document.createElement('h2');
	h2.textContent = 'Recurrences';
	wrapper.appendChild(h2);
	recurrences.sort((a,b)=> new Date(a.nextFireAt)-new Date(b.nextFireAt));
	recurrences.forEach(r => {
		const row = document.createElement('div');
		row.className = 'card';
		const left = document.createElement('div');
		left.textContent = `${r.title || r.url} — Next: ${formatLocal(r.nextFireAt)} (${r.kind})`;
		const actions = document.createElement('div');
		actions.className = 'actions';
		const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.onclick = () => onDeleteRecurrence(r.id);
		actions.appendChild(delBtn);
		row.appendChild(left); row.appendChild(actions);
		wrapper.appendChild(row);
	});
	lists.appendChild(wrapper);
}

async function load(){
	const resS = await sendMessage('listSnoozes');
	if (resS.ok) {
		const groups = groupSnoozes(resS.data);
		renderGroups(groups);
	}
	const resR = await sendMessage('listRecurrences');
	if (resR.ok) renderRecurrences(resR.data);
}

async function onWake(id){
	await sendMessage('wakeSnooze', { id });
	await load();
}

async function onReschedule(id){
	const iso = prompt('Enter new date/time ISO (YYYY-MM-DDTHH:mm) local');
	if (!iso) return;
	const local = new Date(iso);
	if (isNaN(local)) return alert('Invalid date');
	const fireAtIso = new Date(local.getTime() - local.getTimezoneOffset()*60000).toISOString();
	await sendMessage('rescheduleSnooze', { id, fireAtIso });
	await load();
}

async function onDelete(id){
	await sendMessage('deleteSnooze', { id });
	await load();
}

async function onDeleteRecurrence(id){
	await sendMessage('deleteRecurrence', { id });
	await load();
}

document.addEventListener('DOMContentLoaded', () => {
	load();
	document.getElementById('fab').addEventListener('click', async () => {
		await chrome.tabs.create({ url: 'chrome://newtab/' });
	});
});
