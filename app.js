import { db } from './db.js';
import { FaceID } from './faceid.js';
import { parseCSV } from './parseCSV.js';
import { createBackup, loadBackup } from './backup.js';
import { num } from './num.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = n => (new Intl.NumberFormat(undefined, {style:'currency', currency:'USD'})).format(Number(n||0));
const todayStr = () => new Date().toLocaleDateString('en-CA');
const monthStart = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA');

// Tiny toast helper
function toast(msg){
  let t = document.getElementById('bt-toast');
  if (!t){
    t = Object.assign(document.createElement('div'), {id:'bt-toast'});
    Object.assign(t.style, {position:'fixed',bottom:'16px',left:'50%',transform:'translateX(-50%)',
      background:'#0f172a',color:'#fff',padding:'10px 14px',border:'1px solid #2d3b66',borderRadius:'10px',zIndex:99,opacity:'0',transition:'opacity .2s'});
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity='1'; setTimeout(()=> t.style.opacity='0', 1400);
}


// Helper: make all Cancel buttons close their parent <dialog>
function wireCancelButtons(scope = document) {
  scope.querySelectorAll('button[value="cancel"]').forEach(btn => {
    if (btn.__btCancelWired) return;
    btn.addEventListener('click', e => {
      e.preventDefault();
      const dlg = btn.closest('dialog');
      if (dlg) dlg.close('cancel');
    });
    btn.__btCancelWired = true;
  });
}

function applyTheme(dark){ document.body.classList.toggle('light', !dark); const meta=document.querySelector('meta[name="theme-color"]'); if(meta) meta.setAttribute('content', dark ? '#111827' : '#ffffff'); }

// Hamburger menu: toggle and event delegation
function attachMenu(){
  const btn = $('#menuBtn');
  const panel = $('#menuPanel');
  if (!btn || !panel) return;

  const closeMenu = () => { panel.classList.add('hidden'); btn.setAttribute('aria-expanded','false'); };
  const openMenu = () => { panel.classList.remove('hidden'); btn.setAttribute('aria-expanded','true'); };

  btn.onclick = () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    open ? closeMenu() : openMenu();
  };

  panel.onclick = (e) => {
    const item = e.target.closest('button[data-tab]');
    if (!item) return;
    showTab(item.dataset.tab);
    closeMenu();
  };

  // Close on Escape / outside click
  document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') closeMenu(); });
  document.addEventListener('click', (e)=>{
    if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closeMenu();
  });
}

const Log = {
  key: 'logs',
  async all(){ return (await db.get('settings', this.key))?.lines || []; },
  async add(msg){ const lines = await this.all(); lines.unshift(`[${new Date().toISOString()}] ${msg}`); await db.put('settings', {id:this.key, lines}); },
  async clear(){ await db.put('settings',{id:this.key, lines:[]}); }
};

const Settings = {
  id: 'settings',
  defaults: {
    faceIdRequired: false,
    lastSyncAt: null,
    monthlyBudget: 2000,
    startDay: 1,
    darkMode: false,
    quiet: true, qStart: 22, qEnd: 7
  },
  async get(){ return (await db.get('settings', this.id)) || {...this.defaults, id:this.id}; },
  async save(patch){ const cur = await this.get(); const s = {...cur, ...patch, id:this.id}; await db.put('settings', s); return s; }
};

async function categories(){ return await db.all('categories'); }
async function upsertCategory(obj){ const id = obj.id || crypto.randomUUID(); await db.put('categories', { id, name: obj.name, cap: num(obj.cap) }); return id; }
async function deleteCategory(id){ await db.del('categories', id); }
async function transactions(){ return (await db.all('transactions')).sort((a,b)=>b.date.localeCompare(a.date)); }
async function addTransaction(t){ t.id=t.id||crypto.randomUUID(); await db.put('transactions', t); }
async function deleteTransaction(id){ await db.del('transactions', id); }
async function expenses(){ return await db.all('expenses'); }
async function upsertExpense(obj){ const id = obj.id || crypto.randomUUID(); await db.put('expenses', { id, name: obj.name, amount: num(obj.amount), paid: !!obj.paid }); return id; }
async function toggleExpensePaid(id, paid){ const e = await db.get('expenses', id); if (e){ e.paid = paid; await db.put('expenses', e); } }
async function deleteExpense(id){ await db.del('expenses', id); }

function wireCurrencyInputs(scope = document){
  scope.querySelectorAll('input[inputmode="decimal"]').forEach(inp => {
    if (inp.__btCurrencyWired) return;
    const format = () => {
      const raw = inp.value.replace(/[^0-9.]/g, '');
      if (!raw) { inp.value = ''; return; }
      const [intPart, decPart] = raw.split('.');
      const intFormatted = Number(intPart).toLocaleString();
      inp.value = decPart != null ? intFormatted + '.' + decPart : intFormatted;
    };
    inp.addEventListener('input', format);
    inp.addEventListener('focus', () => {
      const n = num(inp.value);
      if (n != null) inp.value = String(n);
    });
    inp.addEventListener('blur', () => {
      const n = num(inp.value);
      if (n != null) inp.value = fmt(n);
    });
    if (inp.value) inp.dispatchEvent(new Event('blur'));
    inp.__btCurrencyWired = true;
  });
}

// PWA install prompt + SW
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  const b = $('#installBtn');
  if (!b) return;
  b.hidden = false;
  b.onclick = async ()=>{ e.prompt(); b.hidden = true; };
});

if ('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'});
  let current = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (current) location.reload();
    current = navigator.serviceWorker.controller;
  });
}

// Boot
document.addEventListener('DOMContentLoaded', async ()=>{
  attachMenu();
  wireCancelButtons();
  const s = await Settings.get();
  applyTheme(s.darkMode);
  await render();
});

async function render(){
  const s = await Settings.get();
  applyTheme(s.darkMode);
  const isiPhone = /iPhone/i.test(navigator.userAgent);
  if (isiPhone && await FaceID.isSupported() && !FaceID.isUnlocked()){
    try {
      if (!localStorage.getItem('bt_faceid_cred')) await FaceID.register();
      else await FaceID.authenticate();
    } catch(e){ console.warn(e); }
  }
  if (s.faceIdRequired && !FaceID.isUnlocked()) return renderLock();
  const current = (document.querySelector('#menuPanel button.active')?.dataset.tab) || 'summary';
  showTab(current, true);
}

async function renderLock(){
  $('#view').innerHTML = document.querySelector('#tpl-lock').innerHTML;
  const msg = $('#lock-msg');
  $('#lock-unlock').onclick = async ()=> {
    try {
      if (!localStorage.getItem('bt_faceid_cred')) await FaceID.register();
      else await FaceID.authenticate();
      await render();
    }
    catch(e){ msg.textContent = e.message || 'Failed.'; }
  };
}

function showTab(name, silent){
  // mark active in menu
  $$('#menuPanel button').forEach(b => b.classList.toggle('active', b.dataset.tab===name));
  const tpl = document.querySelector(`#tpl-${name}`);
  $('#view').innerHTML = tpl.innerHTML;
  wireCurrencyInputs($('#view'));
  if (!silent) history.replaceState({}, '', `#${name}`);
  if (name==='summary') renderSummary();
  if (name==='transactions') renderTx();
  if (name==='categories') renderCats();
  if (name==='expenses') renderExpenses();
  if (name==='settings') renderSettings();
  if (name==='importexport') renderImportExport();
}

// Summary
async function renderSummary(){
  const s = await Settings.get();
  $('#sum-budget').textContent = fmt(s.monthlyBudget);
  const tx = await transactions();
  const start = monthStart(), end = monthStart(new Date(new Date().getFullYear(), new Date().getMonth()+1, 1));
  const month = tx.filter(t=>t.date>=start && t.date<end);
  const spent = month.reduce((a,b)=>a+Number(b.amount),0);
  $('#sum-spent').textContent = fmt(spent);
  const budget = Number(s.monthlyBudget||0);
  $('#sum-spent').classList.toggle('pos', spent <= budget);
  $('#sum-spent').classList.toggle('neg', spent > budget);
  const pct = Math.min(100, Math.round(100*spent/Number(s.monthlyBudget||1)));
  const prog = $('#sum-progress');
  prog.style.width = pct + '%';
  prog.classList.toggle('pos', spent <= budget);
  prog.classList.toggle('neg', spent > budget);

  const exps = await expenses();
  const allocated = exps.reduce((a,b)=>a+Number(b.amount||0),0);
  const remaining = Number(s.monthlyBudget||0) - allocated;
  $('#exp-allocated').textContent = fmt(allocated);
  const expRemain = $('#exp-remaining');
  expRemain.textContent = fmt(remaining);
  expRemain.classList.toggle('neg', remaining < 0);
  expRemain.classList.toggle('pos', remaining > 0);

  const cats = await categories();
  const warnings = [];
  for (const c of cats){
    if (c.cap!=null){
      const spentCat = month.filter(t=>t.categoryId===c.id).reduce((a,b)=>a+Number(b.amount),0);
      if (spentCat > Number(c.cap)) warnings.push(`${c.name}: ${fmt(spentCat)} over cap (${fmt(c.cap)})`);
    }
  }
  const capBox = $('#cap-warnings');
  if (warnings.length){ capBox.style.display='block'; capBox.querySelector('#cap-list').innerHTML = warnings.map(w=>`<li>${w}</li>`).join(''); }
  else capBox.style.display='none';

  const txList = $('#sum-tx-list');
  if (txList){
    const recent = month.slice(0,5);
    txList.innerHTML = recent.map(t => {
      const name = cats.find(c=>c.id===t.categoryId)?.name || 'Uncategorized';
      return `<li class="row between"><div><b>${name}</b><br><span class="label">${t.date}</span></div><div>${fmt(t.amount)}</div></li>`;
    }).join('') || '<li class="label">No transactions</li>';
    $('#sum-tx-view').addEventListener('click', ()=>showTab('transactions'));
  }

  const budgetBox = $('#sum-budget-box');
  if (budgetBox){
    budgetBox.addEventListener('click', ()=>openEditBudget());
    budgetBox.addEventListener('keydown', e=>{ if (e.key==='Enter' || e.key===' '){ e.preventDefault(); openEditBudget(); } });
  }

  $('#exp-manage').addEventListener('click', ()=>showTab('expenses'));
}

// Transactions
async function renderTx(){
  const list = $('#tx-list'); const tx = await transactions(); const cats = await categories();
  list.innerHTML = tx.map(t => {
    const name = cats.find(c=>c.id===t.categoryId)?.name || 'Uncategorized';
    return `<li class="swipe-item" data-id="${t.id}">
      <div class="swipe-content">
        <div class="row between"><div><b>${name}</b><br><span class="label">${t.date}</span></div><div>${fmt(t.amount)}</div></div>
        ${t.note?`<div class="label">${t.note}</div>`:''}
      </div>
      <button class="trash" aria-label="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
    </li>`;
  }).join('');
  list.querySelectorAll('li[data-id]').forEach(li=>{
    const content = li.querySelector('.swipe-content');
    const del = li.querySelector('.trash');
    const max = 80; // width of delete button
    let startX = null;
    let curX = 0;
    const setX = x => {
      curX = x;
      content.style.transform = `translateX(${x}px)`;
      const show = x !== 0;
      del.style.opacity = show ? '1' : '0';
      del.style.pointerEvents = show ? 'auto' : 'none';
    };
    setX(0);
    li.addEventListener('pointerdown', e=>{ startX = e.clientX - curX; li.setPointerCapture(e.pointerId); });
    li.addEventListener('pointermove', e=>{
      if(startX==null) return;
      let x = e.clientX - startX;
      if(x < -max) x = -max;
      if(x > 0) x = 0;
      setX(x);
    });
    const finish = ()=>{
      if(curX < -max/2) setX(-max); else setX(0);
      startX = null;
    };
    li.addEventListener('pointerup', finish);
    li.addEventListener('pointercancel', finish);
    del.addEventListener('click', async e=>{
      await deleteTransaction(li.dataset.id);
      renderTx();
      renderSummary();
      toast('Transaction deleted');
    });
    content.addEventListener('click', e=>{
      if (e.target.closest('button')) return;
      openEditTx(li.dataset.id);
    });
  });
  $('#tx-add').addEventListener('click', ()=>openAddTx());
}

// Categories
async function renderCats(){
  const cats = await categories();
  $('#cat-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const f = e.target;
    await upsertCategory({ name:f.name.value.trim(), cap:f.cap.value });
    f.reset(); renderCats();
  });
  const ul = $('#cat-list');
  ul.innerHTML = cats.map(c => `<li class="row between" data-id="${c.id}"><div><b>${c.name}</b><div class="label">Cap: ${c.cap!=null?fmt(c.cap):'—'}</div></div><button data-id="${c.id}" class="ghost">Delete</button></li>`).join('');
  ul.querySelectorAll('li[data-id]').forEach(li=>{
    li.addEventListener('click', e=>{
      if (e.target.closest('button')) return;
      const cat = cats.find(c=>c.id===li.dataset.id);
      if (cat) openEditCategory(cat);
    });
  });
  ul.querySelectorAll('button[data-id]').forEach(b=> b.onclick = async ()=>{ await deleteCategory(b.dataset.id); renderCats(); });
}

async function renderExpenses(){
  const list = $('#expense-list'); const exps = await expenses();
  list.innerHTML = exps.map(e =>
    `<li class="swipe-item${e.paid?' paid':''}" data-id="${e.id}">
       <div class="swipe-content row between">
         <div><b>${e.name}</b></div>
         <div class="row"><div>${fmt(e.amount)}</div><input type="checkbox" data-id="${e.id}" ${e.paid?'checked':''}></div>
       </div>
       <button class="trash" aria-label="Delete">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
           <line x1="10" y1="11" x2="10" y2="17" />
           <line x1="14" y1="11" x2="14" y2="17" />
         </svg>
       </button>
     </li>`).join('');
  list.querySelectorAll('input[type="checkbox"]').forEach(ch=>{
    ch.onchange = async ()=>{ await toggleExpensePaid(ch.dataset.id, ch.checked); renderExpenses(); renderSummary(); };
  });
  list.querySelectorAll('li[data-id]').forEach(li=>{
    const content = li.querySelector('.swipe-content');
    const del = li.querySelector('.trash');
    const max = 80; // width of delete button
    let startX = null;
    let curX = 0;
    const setX = x => {
      curX = x;
      content.style.transform = `translateX(${x}px)`;
      const show = x !== 0;
      del.style.opacity = show ? '1' : '0';
      del.style.pointerEvents = show ? 'auto' : 'none';
    };
    setX(0);
    li.addEventListener('pointerdown', e=>{ startX = e.clientX - curX; li.setPointerCapture(e.pointerId); });
    li.addEventListener('pointermove', e=>{
      if(startX==null) return;
      let x = e.clientX - startX;
      if(x < -max) x = -max;
      if(x > 0) x = 0;
      setX(x);
    });
    const finish = ()=>{
      if(curX < -max/2) setX(-max); else setX(0);
      startX = null;
    };
    li.addEventListener('pointerup', finish);
    li.addEventListener('pointercancel', finish);
    del.addEventListener('click', async e=>{
      await deleteExpense(li.dataset.id);
      renderExpenses();
      renderSummary();
      toast('Expense deleted');
    });
    content.addEventListener('click', e=>{
      if (e.target.closest('input,button')) return;
      openEditExpense(li.dataset.id);
    });
  });
  $('#expense-add').onclick = ()=> openAddExpense();
}

// Settings
async function renderSettings(){
  const s = await Settings.get();
  $('#set-faceid').checked = s.faceIdRequired;
  $('#faceid-setup').onclick = async ()=>{
    try{ if (!(await FaceID.isSupported())) return alert('Face ID / WebAuthn not supported'); await FaceID.register(); alert('Face ID registered for this site.'); }
    catch(e){ alert(e.message||'Failed'); }
  };
  $('#set-faceid').onchange = async ()=>{ await Settings.save({faceIdRequired: $('#set-faceid').checked}); };

  $('#set-dark-mode').checked = s.darkMode;
  $('#set-dark-mode').onchange = async ()=>{ const dark = $('#set-dark-mode').checked; applyTheme(dark); await Settings.save({darkMode: dark}); };

  $('#set-budget').value = s.monthlyBudget;
  $('#set-startday').value = s.startDay;
  $('#set-quiet').checked = s.quiet;
  $('#set-qstart').value = s.qStart;
  $('#set-qend').value = s.qEnd;
  $('#set-save').onclick = async ()=>{
    await Settings.save({
      monthlyBudget: num($('#set-budget').value) ?? 0,
      startDay: Number($('#set-startday').value||1),
      quiet: $('#set-quiet').checked,
      qStart: Number($('#set-qstart').value||22),
      qEnd: Number($('#set-qend').value||7)
    });
    await Log.add('Settings saved'); alert('Saved');
  };

  $('#diag-clear').onclick = async ()=>{ await Log.clear(); alert('Logs cleared'); };
  $('#diag-logs').textContent = (await Log.all()).join('\n');

  try {
    const {version} = await fetch('./package.json').then(r=>r.json());
    $('#about-version').textContent = version;
  } catch(e) {
    $('#about-version').textContent = 'n/a';
  }
}

// Import/Export + History
async function renderImportExport(){
  $('#export-csv').onclick = async ()=>{
    const tx = await transactions(); const cats = await categories();
    const header = 'id,amount,date,note,category\n';
    const rows = tx.map(t => `${t.id},${t.amount},${t.date},"${(t.note||'').replaceAll('"','""')}",${cats.find(c=>c.id===t.categoryId)?.name||''}`).join('\n');
    const blob = new Blob([header+rows], {type:'text/csv'}); const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {href:url, download:'transactions.csv'}); document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  $('#import-file').onchange = async (e)=>{
    const file = e.target.files[0]; if (!file) return; const text = await file.text();
    const lines = text.trim().split(/\r?\n/).slice(1); const cats = await categories();
    for (const line of lines){
      const [id, amount, date, noteQuoted, category] = parseCSV(line);
      let catId = null;
      if (category){
        let c = cats.find(x=>x.name===category);
        if (!c){ const newId = await upsertCategory({name:category}); c = (await categories()).find(x=>x.id===newId); }
        catId = c.id;
      }
      await addTransaction({ id: id||crypto.randomUUID(), amount:num(amount) ?? 0, date, note:noteQuoted.replace(/^"|"$/g,'').replaceAll('""','"'), categoryId:catId });
    }
    alert('Imported'); render();
  };

  $('#backup-json').onclick = async ()=>{
    const data = await createBackup();
    const timestamp = data.timestamp.replace(/[:.]/g, '-');
    const filename = `budget_backup_${timestamp}.json`;
    const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } catch (err) {
        /* ignore if user cancels */
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {href:url, download:filename});
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }
  };
  $('#restore-json').onchange = async (e)=>{
    const file = e.target.files[0]; if (!file) return; const text = await file.text();
    const data = JSON.parse(text); await loadBackup(data);
    alert('Backup loaded'); render();
  };
}

// Add/Edit Transaction
async function openAddTx(){ openTxDialog(); }

async function openEditTx(id){
  const tx = (await transactions()).find(t=>t.id===id);
  if (tx) openTxDialog(tx);
}

async function openTxDialog(tx){
  const dlg = $('#dlg-add-tx'); const f = $('#form-add-tx'); const cats = await categories();
  const select = f.category; select.innerHTML = '<option value="">Uncategorized</option>' + cats.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  dlg.querySelector('h3').textContent = tx ? 'Edit Transaction' : 'Add Transaction';
  f.amount.value = tx?.amount || '';
  f.date.value = tx?.date || todayStr();
  f.note.value = tx?.note || '';
  f.category.value = tx?.categoryId || '';
  const delBtn = $('#tx-delete');
  if (tx){
    delBtn.hidden = false;
    delBtn.onclick = async ()=>{
      await deleteTransaction(tx.id);
      dlg.close('cancel');
      await render();
      toast('Transaction deleted');
    };
  } else {
    delBtn.hidden = true;
    delBtn.onclick = null;
  }
  dlg.showModal();
  wireCancelButtons(dlg);
  wireCurrencyInputs(dlg);

  dlg.onclose = async ()=>{
    if (dlg.returnValue==='ok'){
      const amount = num(f.amount.value) ?? 0; const date = f.date.value; const categoryId = f.category.value || null; const note = f.note.value || '';
      await addTransaction({ id: tx?.id, amount, date, note, categoryId }); await render();
    }
  };
}
async function openAddExpense(){
  openExpenseDialog();
}

async function openEditExpense(id){
  const exp = (await expenses()).find(e=>e.id===id);
  if (exp) openExpenseDialog(exp);
}

async function openExpenseDialog(exp){
  const dlg = $('#dlg-add-expense'); const f = $('#form-add-expense');
  dlg.querySelector('h3').textContent = exp ? 'Edit Expense' : 'Add Expense';
  f.name.value = exp?.name || '';
  f.amount.value = exp?.amount || '';
  const delBtn = $('#exp-delete');
  if (exp){
    delBtn.hidden = false;
    delBtn.onclick = async ()=>{
      await deleteExpense(exp.id);
      dlg.close('cancel');
      renderExpenses();
      renderSummary();
      toast('Expense deleted');
    };
  } else {
    delBtn.hidden = true;
    delBtn.onclick = null;
  }
  dlg.showModal();
  wireCancelButtons(dlg);
  wireCurrencyInputs(dlg);

  dlg.onclose = async ()=>{
    if (dlg.returnValue==='ok'){
      await upsertExpense({ id: exp?.id, name:f.name.value.trim(), amount:f.amount.value, paid: exp?.paid || false });
      renderExpenses(); renderSummary();
    }
  };
}

async function openEditBudget(){
  const dlg = $('#dlg-edit-budget'); const f = $('#form-edit-budget'); const s = await Settings.get();
  f.budget.value = s.monthlyBudget;
  dlg.showModal();
  wireCancelButtons(dlg);
  wireCurrencyInputs(dlg);

  dlg.onclose = async ()=>{
    if (dlg.returnValue==='ok'){
      await Settings.save({ monthlyBudget: num(f.budget.value) ?? 0 });
      renderSummary();
      toast('Budget updated');
    }
  };
}

async function openEditCategory(cat){
  const dlg = $('#dlg-edit-cat'); const f = $('#form-edit-cat');
  f.name.value = cat.name;
  f.cap.value = cat.cap != null ? cat.cap : '';
  dlg.showModal();
  wireCancelButtons(dlg);
  wireCurrencyInputs(dlg);

  dlg.onclose = async ()=>{
    if (dlg.returnValue==='ok'){
      await upsertCategory({ id: cat.id, name: f.name.value.trim(), cap: f.cap.value });
      renderCats();
      renderSummary();
    }
  };
}

// Route on load
if (location.hash){ const t = location.hash.slice(1); const btn = document.querySelector(`#menuPanel button[data-tab="${t}"]`); if (btn) btn.click(); }
