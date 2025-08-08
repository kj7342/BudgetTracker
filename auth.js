window.AppAuth = (function(){
  const KEY = 'auth-settings';
  async function getSettings(){ try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
  async function saveSettings(s){ localStorage.setItem(KEY, JSON.stringify(s)); }
  async function registerPasskey(){
    if (!window.PublicKeyCredential) return false;
    try{
      const publicKey = { challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Budget Tracker' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'user', displayName: 'Budget User' },
        pubKeyCredParams: [{type:'public-key', alg:-7}], authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required' } };
      const cred = await navigator.credentials.create({ publicKey });
      if (cred && cred.rawId){ const s = await getSettings(); s.credId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId))); await saveSettings(s); return true; }
    }catch(e){ console.warn(e); }
    return false;
  }
  async function verifyPasskey(credIdB64){
    if (!window.PublicKeyCredential) return false;
    try{
      const allow = credIdB64 ? [Uint8Array.from(atob(credIdB64), c=>c.charCodeAt(0))] : [];
      const publicKey = { challenge: crypto.getRandomValues(new Uint8Array(32)), userVerification:'required', allowCredentials: allow.length?[{id:allow[0], type:'public-key'}]:[] };
      const assertion = await navigator.credentials.get({ publicKey }); return !!assertion;
    }catch(e){ console.warn(e); return false; }
  }
  async function requireUnlockIfNeeded(){
    const s = await getSettings(); if (!s.enabled) return true;
    const dlg = document.getElementById('dlg-lock'); const form = document.getElementById('form-lock'); const bioBtn=document.getElementById('biometricBtn');
    return new Promise((resolve)=>{
      dlg.showModal();
      bioBtn.onclick = async (ev)=>{ ev.preventDefault(); const ok = await verifyPasskey(s.credId); if (ok) dlg.close('ok'); else document.getElementById('lock-msg').textContent='Face ID failed. Enter PIN or try again.'; };
      form.onsubmit = (ev)=>{ const pin = form.pin.value; if (s.pin && pin !== s.pin){ ev.preventDefault(); document.getElementById('lock-msg').textContent='Incorrect PIN. Try again.'; } };
      dlg.onclose = ()=> resolve(dlg.returnValue==='ok');
    });
  }
  return { getSettings, saveSettings, registerPasskey, verifyPasskey, requireUnlockIfNeeded };
})();