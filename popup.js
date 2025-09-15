// Messaging
async function sendMessage(type, payload) { return await chrome.runtime.sendMessage({ type, payload }); }

// Formatting helpers
function fmtTime(d){ return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d); }
function fmtDowTime(d){ return new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(d); }

// Preset helpers
async function computeLabel(preset){ const res = await sendMessage('resolvePreset', { preset }); if (!res.ok) return null; return new Date(res.data); }
async function schedulePreset(preset){
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const url = tab?.url || 'chrome://newtab/';
  const title = tab?.title || 'Tab';
  const res = await sendMessage('resolvePreset', { preset });
  if (!res.ok) return alert(res.error || 'Failed');
  const fireAtIso = res.data;
  const created = await sendMessage('createSnooze', { url, title, fireAtIso, source: { kind: 'preset', preset } });
  if (!created.ok) return alert(created.error || 'Failed');
  if (tab?.id) await chrome.tabs.remove(tab.id);
  window.close();
}

function bindKeyActivate(el, handler){ el.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } }); }

// Modal helpers (custom pick)
function toIsoUtcLocal(date, time){
  const [y,m,d] = date.split('-').map(x=>parseInt(x,10));
  const [hh,mm] = time.split(':').map(x=>parseInt(x,10));
  const local = new Date(y, m-1, d, hh, mm, 0, 0);
  return new Date(local.getTime() - local.getTimezoneOffset()*60000).toISOString();
}
function openModal(){
  const overlay = document.getElementById('sched-overlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  (async ()=>{
    const settings = await sendMessage('getSettings');
    const now = new Date();
    const dateEl = document.getElementById('sched-date');
    const timeEl = document.getElementById('sched-time');
    dateEl.valueAsDate = now;
    const hh = String(settings.ok ? settings.data.defaultPickerHour : 9).padStart(2,'0');
    timeEl.value = `${hh}:00`;
    validateModal();
    timeEl.focus();
  })();
}
function closeModal(){
  const overlay = document.getElementById('sched-overlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}
function validateModal(){
  const date = document.getElementById('sched-date').value;
  const time = document.getElementById('sched-time').value;
  const btn = document.getElementById('btn-schedule');
  if (!date || !time){ btn.disabled = true; return; }
  const iso = toIsoUtcLocal(date, time);
  const when = new Date(iso);
  btn.disabled = !(when.getTime() > Date.now() + 30*1000);
}
function trapFocusIfNeeded(e){
  const overlay = document.getElementById('sched-overlay');
  if (!overlay.classList.contains('open')) return;
  if (e.key !== 'Tab') return;
  const focusables = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}

async function render() {
  // labels
  const hour = await computeLabel('in-1-hour');
  const evening = await computeLabel('this-evening');
  const tomorrow = await computeLabel('tomorrow-morning');
  const weekend = await computeLabel('this-weekend');
  const nextWeek = await computeLabel('next-week');
  if (hour) document.getElementById('meta-hour').textContent = `Today ${fmtTime(hour)}`;
  if (evening) document.getElementById('meta-evening').textContent = `Today ${fmtTime(evening)}`;
  if (tomorrow) document.getElementById('meta-tomorrow').textContent = `${fmtDowTime(tomorrow)}`;
  if (weekend) document.getElementById('meta-weekend').textContent = `${fmtDowTime(weekend)}`;
  if (nextWeek) document.getElementById('meta-next-week').textContent = `${fmtDowTime(nextWeek)}`;

  // actions for presets
  const clickers = [
    ['row-hour', ()=>schedulePreset('in-1-hour')],
    ['row-evening', ()=>schedulePreset('this-evening')],
    ['row-tomorrow', ()=>schedulePreset('tomorrow-morning')],
    ['row-weekend', ()=>schedulePreset('this-weekend')],
    ['row-nextweek', ()=>schedulePreset('next-week')],
  ];
  for (const [id, fn] of clickers){
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('click', fn);
    bindKeyActivate(el, fn);
  }

  // Custom pick opens modal
  const pick = document.getElementById('row-pick');
  if (pick){
    pick.addEventListener('click', openModal);
    bindKeyActivate(pick, openModal);
  }
  document.getElementById('btn-cancel')?.addEventListener('click', closeModal);
  document.getElementById('sched-overlay')?.addEventListener('click', (e)=>{ if (e.target.id==='sched-overlay') closeModal(); });
  document.addEventListener('keydown', (e)=>{
    if (e.key==='Escape' && document.getElementById('sched-overlay')?.classList.contains('open')) closeModal();
    trapFocusIfNeeded(e);
  });
  document.getElementById('sched-date')?.addEventListener('input', validateModal);
  document.getElementById('sched-time')?.addEventListener('input', validateModal);
  document.getElementById('btn-schedule')?.addEventListener('click', async ()=>{
    const date = document.getElementById('sched-date').value;
    const time = document.getElementById('sched-time').value;
    if (!date || !time) return;
    const fireAtIso = toIsoUtcLocal(date, time);
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const url = tab?.url || 'chrome://newtab/';
    const title = tab?.title || 'Tab';
    const res = await sendMessage('createSnooze', { url, title, fireAtIso, source: { kind:'custom', customTimeIso: fireAtIso } });
    if (!res.ok) return alert(res.error || 'Failed');
    if (tab?.id) await chrome.tabs.remove(tab.id);
    window.close();
  });

  // footer links
  const snoozed = document.getElementById('view-snoozed');
  snoozed?.addEventListener('click', async (e)=>{
    e.preventDefault();
    const url = chrome.runtime.getURL('sleeping.html');
    await chrome.tabs.create({ url });
    window.close();
  });
  document.getElementById('settings')?.addEventListener('click', async (e)=>{
    e.preventDefault();
    const url = chrome.runtime.getURL('options.html');
    await chrome.tabs.create({ url });
    window.close();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
else render();
