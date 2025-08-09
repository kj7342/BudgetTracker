export const FaceID = {
  async isSupported(){ return !!(window.PublicKeyCredential && navigator.credentials); },
  async register(){
    const rpId = location.hostname;
    const userId = new TextEncoder().encode('budget-user');
    const pubKey = {
      challenge: Uint8Array.from(crypto.getRandomValues(new Uint8Array(32))),
      rp: { name: 'Budget Tracker', id: rpId },
      user: { id: userId, name: 'budget-user', displayName: 'Budget User' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000, attestation: 'none'
    };
    const cred = await navigator.credentials.create({ publicKey: pubKey });
    if (!cred) throw new Error('Registration failed');
    const rawId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
    localStorage.setItem('bt_faceid_cred', rawId);
    sessionStorage.setItem('bt_unlocked', '1');
    return true;
  },
  async authenticate(){
    const raw = localStorage.getItem('bt_faceid_cred');
    const allow = raw ? [{ id: Uint8Array.from(atob(raw), c=>c.charCodeAt(0)), type: 'public-key' }] : [];
    const request = {
      challenge: Uint8Array.from(crypto.getRandomValues(new Uint8Array(32))),
      timeout: 60000, userVerification: 'required', rpId: location.hostname, allowCredentials: allow
    };
    const assertion = await navigator.credentials.get({ publicKey: request });
    if (!assertion) throw new Error('Auth failed');
    sessionStorage.setItem('bt_unlocked', '1'); return true;
  },
  isUnlocked(){ return sessionStorage.getItem('bt_unlocked') === '1'; },
  lock(){ sessionStorage.removeItem('bt_unlocked'); },
  clear(){ localStorage.removeItem('bt_faceid_cred'); }
};
