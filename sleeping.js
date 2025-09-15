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

let SNOOZE_BY_ID = new Map();
let CURRENT_RESCHEDULE_ID = null;
let LAST_COUNT = 0;

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
            const text = document.createElement('div');
            text.className = 'text';
            const title = document.createElement('div');
            title.className = 'title';
            title.textContent = item.title || item.url;
            const meta = document.createElement('div');
            meta.className = 'meta';
            meta.textContent = formatLocal(item.fireAt);
            text.appendChild(title);
            text.appendChild(meta);
            const actions = document.createElement('div');
            actions.className = 'actions';
            const wakeBtn = document.createElement('button'); wakeBtn.textContent = 'Wake'; wakeBtn.onclick = () => onWake(item.id);
            const resBtn = document.createElement('button'); resBtn.textContent = 'Reschedule'; resBtn.onclick = () => onReschedule(item.id);
            const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.onclick = () => onDelete(item.id);
            actions.appendChild(wakeBtn); actions.appendChild(resBtn); actions.appendChild(delBtn);
            row.appendChild(text); row.appendChild(actions);
            wrapper.appendChild(row);
        });
        lists.appendChild(wrapper);
    });
    // Empty state
    if (!lists.children.length){
        const empty = document.createElement('div');
        empty.style.cssText = 'margin:18px 12px 6px; color:rgba(255,255,255,.6); font:500 14px/20px Inter, system-ui;';
        empty.textContent = 'No snoozed tabs.';
        lists.appendChild(empty);
    }
}

async function load(){
    const resS = await sendMessage('listSnoozes');
    if (resS.ok) {
        // keep an id -> item map for rescheduling
        SNOOZE_BY_ID = new Map(resS.data.map((s) => [s.id, s]));
        const groups = groupSnoozes(resS.data);
        renderGroups(groups);
        applyButtonClasses();
        LAST_COUNT = resS.data.length;
        const clearBtn = document.getElementById('btn-clear-all');
        if (clearBtn){ clearBtn.disabled = LAST_COUNT === 0; }
    }
}

async function onWake(id){
	await sendMessage('wakeSnooze', { id });
	await load();
}

// ---------- Reschedule modal (parity with popup) ----------
function toIsoUtcLocal(date, time){
    const [y,m,d] = date.split('-').map(x=>parseInt(x,10));
    const [hh,mm] = time.split(':').map(x=>parseInt(x,10));
    const local = new Date(y, m-1, d, hh, mm, 0, 0);
    return new Date(local.getTime() - local.getTimezoneOffset()*60000).toISOString();
}

function openRescheduleModal(item){
    CURRENT_RESCHEDULE_ID = item.id;
    const overlay = document.getElementById('resched-overlay');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    (async () => {
        const settings = await sendMessage('getSettings');
        const dateEl = document.getElementById('resched-date');
        const timeEl = document.getElementById('resched-time');
        let d = new Date(item.fireAt);
        if (isNaN(d)) d = new Date();
        // Prefill controls with the item's scheduled local date/time
        const toDateStr = (x)=> `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
        const toTimeStr = (x)=> `${String(x.getHours()).padStart(2,'0')}:${String(x.getMinutes()).padStart(2,'0')}`;
        dateEl.value = toDateStr(d);
        timeEl.value = toTimeStr(d);
        // Fallback to defaultPickerHour only if time is empty for any reason
        if (!timeEl.value){
            const h = String(settings.ok ? settings.data.defaultPickerHour : 9).padStart(2,'0');
            timeEl.value = `${h}:00`;
        }
        // Update helper text with current scheduled time
        const desc = document.getElementById('resched-desc');
        if (desc) desc.textContent = `Currently: ${formatLocal(item.fireAt)}`;
        validateModal();
        timeEl.focus();
    })();
}

function closeRescheduleModal(){
    const overlay = document.getElementById('resched-overlay');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    CURRENT_RESCHEDULE_ID = null;
}

function validateModal(){
    const date = document.getElementById('resched-date').value;
    const time = document.getElementById('resched-time').value;
    const btn = document.getElementById('btn-reschedule');
    if (!date || !time){ btn.disabled = true; return; }
    const iso = toIsoUtcLocal(date, time);
    const when = new Date(iso);
    btn.disabled = !(when.getTime() > Date.now() + 30*1000);
}

function trapFocusIfNeeded(e){
    const overlay = document.getElementById('resched-overlay');
    if (!overlay || !overlay.classList.contains('open')) return;
    if (e.key !== 'Tab') return;
    const focusables = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}

async function onReschedule(id){
    const item = SNOOZE_BY_ID.get(id);
    if (!item) return;
    openRescheduleModal(item);
}

async function onDelete(id){
    await sendMessage('deleteSnooze', { id });
    await load();
}

async function onClearAll(){
    const n = LAST_COUNT || SNOOZE_BY_ID.size;
    if (!n) return;
    const ok = confirm(`Delete all ${n} snoozed tab${n===1?'':'s'}? This cannot be undone.`);
    if (!ok) return;
    const res = await sendMessage('clearAllSnoozes');
    if (!res.ok){ alert(res.error || 'Failed to clear'); return; }
    await load();
}

function applyButtonClasses(){
    const btns = document.querySelectorAll('.actions button');
    btns.forEach((b)=>{
        if (!b.classList.contains('btn')) b.classList.add('btn');
        const t = (b.textContent || '').toLowerCase();
        b.classList.remove('primary','warn');
        if (t.includes('wake')) b.classList.add('primary');
        else if (t.includes('delete')) b.classList.add('warn');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    load();
    const fab = document.getElementById('fab');
    if (fab) fab.addEventListener('click', async () => {
        await chrome.tabs.create({ url: 'chrome://newtab/' });
    });
    document.getElementById('btn-cancel')?.addEventListener('click', closeRescheduleModal);
    document.getElementById('resched-overlay')?.addEventListener('click', (e)=>{ if (e.target.id==='resched-overlay') closeRescheduleModal(); });
    document.addEventListener('keydown', (e)=>{
        if (e.key==='Escape' && document.getElementById('resched-overlay')?.classList.contains('open')) closeRescheduleModal();
        trapFocusIfNeeded(e);
    });
    document.getElementById('resched-date')?.addEventListener('input', validateModal);
    document.getElementById('resched-time')?.addEventListener('input', validateModal);
    document.getElementById('btn-reschedule')?.addEventListener('click', async ()=>{
        if (!CURRENT_RESCHEDULE_ID) return;
        const date = document.getElementById('resched-date').value;
        const time = document.getElementById('resched-time').value;
        if (!date || !time) return;
        const fireAtIso = toIsoUtcLocal(date, time);
        const res = await sendMessage('rescheduleSnooze', { id: CURRENT_RESCHEDULE_ID, fireAtIso });
        if (!res.ok){ alert(res.error || 'Failed'); return; }
        closeRescheduleModal();
        await load();
    });
    document.getElementById('btn-clear-all')?.addEventListener('click', onClearAll);
});
