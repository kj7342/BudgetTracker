import { db } from './db.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = n => (new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'})).format(Number(n||0));
const todayStr = () => new Date().toISOString().slice(0,10);
const monthStart = (d=new Date()) => new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10);

const Log = { key:'logs',
  async all(){ return (await db.get('settings', this.key))?.lines || []; },
  async add(m){ const l=await this.all(); l.unshift(`[${new Date().toISOString()}] ${m}`); await db.put('settings',{id:this.key, lines:l}); },
  async clear(){ await db.put('settings',{id:this.key, lines:[]}); }
};

const Settings = { id:'settings', defaults:{ monthlyBudget:2000, startDay:1, envEnabled:true, envAuto:true, envRollover:false, envHardBlock:false, quiet:true, qStart:22, qEnd:7 },
  async get(){ return (await db.get('settings', this.id)) || {...this.defaults, id:this.id}; },
  async save(patch){ const cur = await this.get(); const s = {...cur, ...patch, id:this.id}; await db.put('settings', s); return s; }
};

async function categories(){ return await db.all('categories'); }
async function upsertCategory(obj){ const id = obj.id || crypto.randomUUID(); await db.put('categories',{ id, name:obj.name, cap:num(obj.cap), envelope:num(obj.envelope) }); return id; }
async function deleteCategory(id){ await db.del('categories', id); }
async function transactions(){ return (await db.all('transactions')).sort((a,b)=>b.date.localeCompare(a.date)); }
async function addTransaction(t){ t.id=t.id||crypto.randomUUID(); await db.put('transactions', t); }

async function getCarry(month, catId){ const rec = await db.get('carry', `${month}|${catId}`); return rec?.amount || 0; }
async function setCarry(month, catId, amount){ await db.put('carry', {id:`${month}|${catId}`, month, categoryId:catId, amount}); }
async function addEvent(e){ await db.put('events', { id:crypto.randomUUID(), date:new Date().toISOString(), ...e }); }
async function events(){ return (await db.all('events')).sort((a,b)=>b.date.localeCompare(a.date)); }

function num(v){ const n = Number(v); return isFinite(n)?n:null; }
function isQuiet(now, s){ const h=now.getHours(); if(!s.quiet) return false; return (s.qStart<=s.qEnd)?(h>=s.qStart && h<s.qEnd):(h>=s.qStart || h<s.qEnd); }

async function ensureBuffer(){ const cats = await categories(); let existing = cats.find(c=>c.name==='General Buffer'); if (existing) return existing; const id = await upsertCategory({name:'General Buffer'}); return (await categories()).find(c=>c.id===id); }

async function monthInit(now=new Date()){
  const s = await Settings.get(); if (!s.envEnabled || !s.envAuto) return;
  const start = monthStart(now);
  const has = (await db.all('carry')).some(c=>c.month===start); if (has) return;
  const tx = await transactions();
  const buffer = await ensureBuffer(); await setCarry(start, buffer.id, (await getCarry(start, buffer.id)) || 0);
  const cats = await categories();
  if (s.envRollover){
    const prev = monthStart(new Date(now.getFullYear(), now.getMonth()-1, 1));
    for (const c of cats){
      if (c.envelope==null) continue;
      const spent = tx.filter(t=>t.categoryId===c.id && t.date>=prev && t.date<start).reduce((a,b)=>a+Number(b.amount),0);
      const leftover = Math.max(0, Number(c.envelope)-spent);
      await setCarry(start, c.id, leftover);
      if (leftover>0) await addEvent({type:'rollover', fromName:c.name, toName:c.name, amount:leftover, note:'Rollover into new month'});
    }
  } else {
    for (const c of cats) if (c.envelope!=null) await setCarry(start, c.id, 0);
  }
  await Log.add('Month initialized');
}
async function remainingForCategory(catId, now=new Date()){
  const start = monthStart(now), end = monthStart(new Date(now.getFullYear(), now.getMonth()+1, 1));
  const cats = await categories(); const c = cats.find(x=>x.id===catId); if (!c) return 0;
  const carry = await getCarry(start, catId);
  const tx = await transactions();
  const spent = tx.filter(t=>t.categoryId===catId && t.date>=start && t.date<end).reduce((a,b)=>a+Number(b.amount),0);
  const alloc = Number(c.envelope||0); return (alloc + Number(carry||0)) - spent;
}
async function moveFunds(fromId, toId, amount){
  if (fromId===toId) return false;
  const start = monthStart(); const fromRem = await remainingForCategory(fromId); if (amount > fromRem) return false;
  const fromCarry = await getCarry(start, fromId); const toCarry = await getCarry(start, toId);
  await setCarry(start, fromId, fromCarry-amount); await setCarry(start, toId, toCarry+amount);
  const cats = await categories();
  await addEvent({type:'transfer', fromName: cats.find(c=>c.id===fromId)?.name, toName: cats.find(c=>c.id===toId)?.name, amount});
  await Log.add(`Moved ${amount} from ${cats.find(c=>c.id===fromId)?.name} to ${cats.find(c=>c.id===toId)?.name}`);
  return true;
}

async function applyRecurring(now=new Date()){
  const s = await Settings.get(); const rec = s.recurring || []; let changed=false;
  for (const r of rec){ while (r.next && r.next <= todayStr()){ await addTransaction({ amount:Number(r.amount), date:r.next, note:r.note||'', categoryId:r.categoryId||null, id:crypto.randomUUID() }); r.next = nextDate(r.next, r.freq); changed=true; } }
  if (changed){ await Settings.save({recurring: rec}); await Log.add('Applied recurring items'); }
}
function nextDate(iso, freq){ const d=new Date(iso); if(freq==='daily') d.setDate(d.getDate()+1); else if(freq==='weekly') d.setDate(d.getDate()+7); else if(freq==='monthly') d.setMonth(d.getMonth()+1); else if(freq==='yearly') d.setFullYear(d.getFullYear()+1); return d.toISOString().slice(0,10); }

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt=e; const b=$('#installBtn'); b.hidden=false; b.onclick=async ()=>{ deferredPrompt.prompt(); deferredPrompt=null; b.hidden=true; }; });
if ('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js'); }

const tabs = $$('.tabbar button');
tabs.forEach(b=> b.addEventListener('click', ()=>showTab(b.dataset.tab)));
document.addEventListener('DOMContentLoaded', async ()=>{
  const ok = await window.AppAuth.requireUnlockIfNeeded(); if (!ok) { document.body.innerHTML = '<div style="padding:24px">Locked.</div>'; return; }
  await monthInit(); await applyRecurring(); await render();
});

async function render(){ const cur = document.querySelector('.tabbar button.active')?.dataset.tab || 'summary'; showTab(cur, true); }
function showTab(name, silent){ tabs.forEach(b=> b.classList.toggle('active', b.dataset.tab===name)); const tpl=document.querySelector(`#tpl-${name}`); $('#view').innerHTML = tpl.innerHTML; if(!silent) history.replaceState({},'',`#${name}`); if(name==='summary') renderSummary(); if(name==='transactions') renderTx(); if(name==='categories') renderCats(); if(name==='envelopes') renderEnvelopes(); if(name==='settings') renderSettings(); if(name==='importexport') renderImportExport(); }

async function renderSummary(){
  const s = await Settings.get(); $('#sum-budget').textContent = fmt(s.monthlyBudget);
  const tx = await transactions(); const start=monthStart(), end=monthStart(new Date(new Date().getFullYear(), new Date().getMonth()+1, 1));
  const month = tx.filter(t=>t.date>=start && t.date<end); const spent = month.reduce((a,b)=>a+Number(b.amount),0);
  $('#sum-spent').textContent = fmt(spent); $('#sum-progress').style.width = Math.min(100, Math.round(100*spent/Number(s.monthlyBudget||1))) + '%';
  const cats = await categories(); let allocated=0, remaining=0;
  for (const c of cats){ if (c.envelope!=null){ const rem = await remainingForCategory(c.id); remaining+=rem; allocated+=Number(c.envelope||0); } }
  $('#env-allocated').textContent = fmt(allocated); $('#env-remaining').textContent = fmt(remaining);
  const warnings=[]; for (const c of cats){ if (c.cap!=null){ const spentCat = month.filter(t=>t.categoryId===c.id).reduce((a,b)=>a+Number(b.amount),0); if (spentCat>Number(c.cap)) warnings.push(`${c.name}: ${fmt(spentCat)} over cap (${fmt(c.cap)})`); } }
  const capBox = $('#cap-warnings'); if (warnings.length){ capBox.style.display='block'; capBox.querySelector('#cap-list').innerHTML = warnings.map(w=>`<li>${w}</li>`).join(''); } else capBox.style.display='none';
  $('#add-tx-btn').addEventListener('click', ()=>openAddTx());
}
async function renderTx(){ const list=$('#tx-list'); const tx = await transactions(); const cats = await categories();
  list.innerHTML = tx.map(t=>{ const name = cats.find(c=>c.id===t.categoryId)?.name || 'Uncategorized'; return `<li><div class="row between"><div><b>${name}</b><br><span class="label">${t.date}</span></div><div>${fmt(t.amount)}</div></div>${t.note?`<div class="label">${t.note}</div>`:''}</li>`; }).join('');
  $('#tx-add').addEventListener('click', ()=>openAddTx());
}
async function renderCats(){ const cats = await categories(); $('#cat-form').addEventListener('submit', async (e)=>{ e.preventDefault(); const f=e.target; await upsertCategory({ name:f.name.value.trim(), cap:f.cap.value, envelope:f.env.value }); f.reset(); renderCats(); });
  const ul=$('#cat-list'); ul.innerHTML = cats.map(c=> `<li class="row between"><div><b>${c.name}</b><div class="label">Cap: ${c.cap!=null?fmt(c.cap):'—'} • Envelope: ${c.envelope!=null?fmt(c.envelope):'—'}</div></div><button data-id="${c.id}" class="ghost">Delete</button></li>`).join('');
  ul.querySelectorAll('button[data-id]').forEach(b=> b.onclick = async ()=>{ await deleteCategory(b.dataset.id); renderCats(); });
}
async function renderEnvelopes(){ const list=$('#env-list'); const cats=await categories(); const tx=await transactions(); const start=monthStart(); const end=monthStart(new Date(new Date().getFullYear(), new Date().getMonth()+1,1));
  const rows = await Promise.all(cats.map(async c=>{ const alloc=Number(c.envelope||0); const carry=await getCarry(start,c.id); const spent=tx.filter(t=>t.categoryId===c.id && t.date>=start && t.date<end).reduce((a,b)=>a+Number(b.amount),0); const remaining=alloc+Number(carry||0)-spent; return {id:c.id,name:c.name,alloc,spent,remaining}; }));
  list.innerHTML = rows.map(r=> `<li class="row between"><div><b>${r.name}</b><div class="label">Allocated: ${fmt(r.alloc)} • Spent: ${fmt(r.spent)}</div></div><div class="${r.remaining<0?'neg':''}">${fmt(r.remaining)}</div></li>`).join('');
  $('#move-funds').onclick = async ()=> openMoveFunds(); $('#history-btn').onclick = async ()=> openHistory();
}
async function renderSettings(){ const s = await Settings.get(); $('#set-budget').value=s.monthlyBudget; $('#set-startday').value=s.startDay; $('#set-env-enabled').checked=s.envEnabled; $('#set-env-auto').checked=s.envAuto; $('#set-env-roll').checked=s.envRollover; $('#set-env-hard').checked=s.envHardBlock; $('#set-quiet').checked=s.quiet; $('#set-qstart').value=s.qStart; $('#set-qend').value=s.qEnd;
  $('#set-lock-enabled').checked = !!(JSON.parse(localStorage.getItem('auth-settings')||'{}').enabled);
  $('#set-lock-setup').onclick = async ()=>{ const ok = await window.AppAuth.registerPasskey(); alert(ok?'Face ID set up':'Face ID not available'); };
  $('#set-pin').onclick = async ()=>{ const p = prompt('Enter new PIN (digits only, blank to clear):',''); const as = JSON.parse(localStorage.getItem('auth-settings')||'{}'); as.pin = (p||'').trim()||null; as.enabled = as.enabled || !!as.pin; localStorage.setItem('auth-settings', JSON.stringify(as)); alert('PIN updated'); };
  $('#set-ck-enabled').checked = !!(await db.get('settings','ck-enabled'))?.value;
  $('#set-ck-sync').onclick = async ()=>{ if (await window.CloudSync.init()) { const r = await window.CloudSync.syncAll({}); alert('Synced (scaffold).'); } else { alert('CloudKit not configured'); } };
  $('#set-save').onclick = async ()=>{ const ns = await Settings.save({ monthlyBudget:Number($('#set-budget').value||0), startDay:Number($('#set-startday').value||1), envEnabled:$('#set-env-enabled').checked, envAuto:$('#set-env-auto').checked, envRollover:$('#set-env-roll').checked, envHardBlock:$('#set-env-hard').checked, quiet:$('#set-quiet').checked, qStart:Number($('#set-qstart').value||22), qEnd:Number($('#set-qend').value||7) });
    const as = JSON.parse(localStorage.getItem('auth-settings')||'{}'); as.enabled = $('#set-lock-enabled').checked; localStorage.setItem('auth-settings', JSON.stringify(as));
    await db.put('settings', {id:'ck-enabled', value: $('#set-ck-enabled').checked}); await Log.add('Settings saved'); alert('Saved'); };
  $('#diag-run').onclick = async ()=>{ await monthInit(); alert('Month initialized'); };
  $('#diag-clear').onclick = async ()=>{ await Log.clear(); alert('Logs cleared'); };
  $('#diag-logs').textContent = (await Log.all()).join('\n');
}
async function renderImportExport(){ $('#export-csv').onclick = async ()=>{ const tx=await transactions(); const cats=await categories(); const header='id,amount,date,note,category\n'; const rows=tx.map(t=> `${t.id},${t.amount},${t.date},"${(t.note||'').replaceAll('"','""')}",${cats.find(c=>c.id===t.categoryId)?.name||''}`).join('\n'); const blob = new Blob([header+rows],{type:'text/csv'}); const url = URL.createObjectURL(blob); const a=Object.assign(document.createElement('a'),{href:url,download:'transactions.csv'}); document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); };
  $('#import-file').onchange = async (e)=>{ const file=e.target.files[0]; if(!file) return; const text=await file.text(); const lines=text.trim().split(/\r?\n/).slice(1); const cats=await categories(); for(const line of lines){ const [id, amount, date, noteQuoted, category] = parseCSV(line); let catId=null; if(category){ let c=cats.find(x=>x.name===category); if(!c){ const newId=await upsertCategory({name:category}); c=(await categories()).find(x=>x.id===newId); } catId=c.id; } await addTransaction({ id:id||crypto.randomUUID(), amount:Number(amount), date, note:noteQuoted.replace(/^"|"$/g,'').replaceAll('""','"'), categoryId:catId }); } alert('Imported'); render(); };
  const h = await events(); $('#hist-list').innerHTML = h.map(e=> `<li>${histTitle(e)} <span class="label">${new Date(e.date).toLocaleString()}</span></li>`).join('');
}
function parseCSV(line){ const r=[]; let cur='', q=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(ch==='"'){ if(q && line[i+1]==='"'){ cur+='"'; i++; } else q=!q; } else if(ch===',' && !q){ r.push(cur); cur=''; } else cur+=ch; } r.push(cur); return r; }
function histTitle(e){ if(e.type==='transfer') return `Moved ${fmt(e.amount)} from ${e.fromName} to ${e.toName}`; if(e.type==='rollover') return `Rolled over ${fmt(e.amount)} in ${e.fromName}`; if(e.type==='adjust') return `Adjusted ${fmt(e.amount)} — ${e.note||''}`; return `${e.type} ${fmt(e.amount)}`; }

async function openAddTx(){ const dlg=$('#dlg-add-tx'); const f=$('#form-add-tx'); const cats=await categories(); const s=await Settings.get(); const select=f.category; select.innerHTML = '<option value="">Uncategorized</option>' + cats.map(c=>`<option value="${c.id}">${c.name}</option>`).join(''); f.amount.value=''; f.date.value=todayStr(); f.note.value=''; dlg.showModal(); dlg.onclose = async ()=>{ if(dlg.returnValue==='ok'){ const amount=Number(f.amount.value||0), date=f.date.value, categoryId=f.category.value||null, note=f.note.value||''; if(categoryId){ const rem=await remainingForCategory(categoryId); if(amount>rem){ if(s.envHardBlock){ alert('This would overspend the envelope. Move funds first.'); return openMoveFunds(categoryId); } else if (!isQuiet(new Date(), s) && !confirm('This will put the envelope below zero for this month. Proceed?')) { return; } } } await addTransaction({amount,date,note,categoryId}); await render(); } }; }
async function openMoveFunds(fromId){ const dlg=$('#dlg-move'); const f=$('#form-move'); let cats=await categories(); await ensureBuffer(); cats=await categories(); const options = cats.filter(c=> c.envelope!=null || c.name==='General Buffer').map(c=>`<option value="${c.id}">${c.name}</option>`).join(''); f.from.innerHTML=options; f.to.innerHTML=options; if(fromId) f.from.value=fromId; f.amount.value=''; dlg.showModal(); dlg.onclose = async ()=>{ if(dlg.returnValue==='ok'){ const from=f.from.value, to=f.to.value, amount=Number(f.amount.value||0); if(!from || !to || from===to || !(amount>0)) return; const ok = await moveFunds(from,to,amount); if(!ok) alert('Not enough remaining in source envelope.'); await render(); } }; }
async function openHistory(){ const dlg=$('#dlg-history'); const ul=$('#dlg-hist-list'); const h=await events(); ul.innerHTML = h.map(e=> `<li>${histTitle(e)} <span class="label">${new Date(e.date).toLocaleString()}</span></li>`).join(''); dlg.showModal(); $('#dlg-history-close').onclick = ()=> dlg.close(); }

if (location.hash){ const t = location.hash.slice(1); const btn = document.querySelector(`.tabbar button[data-tab="${t}"]`); if(btn) btn.click(); }
