export const db = (() => {
  const DB_NAME = 'budget-db';
  const VER = 1;
  let _db;
  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, VER);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('categories')) d.createObjectStore('categories', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('transactions')) {
          const os = d.createObjectStore('transactions', { keyPath: 'id' });
          os.createIndex('byDate','date');
          os.createIndex('byCategory','categoryId');
        }
        if (!d.objectStoreNames.contains('expenses')) d.createObjectStore('expenses', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(_db = req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function tx(names, mode='readonly') { return open().then(d => d.transaction(names, mode)); }
  async function get(store, key) { const t = await tx([store]); const s = t.objectStore(store); return await new Promise((res, rej)=>{ const r = s.get(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) }); }
  async function put(store, value) { const t = await tx([store],'readwrite'); const s = t.objectStore(store); return await new Promise((res, rej)=>{ const r = s.put(value); r.onsuccess=()=>res(value); r.onerror=()=>rej(r.error) }); }
  async function del(store, key) { const t = await tx([store],'readwrite'); const s = t.objectStore(store); return await new Promise((res, rej)=>{ const r = s.delete(key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error) }); }
  async function all(store) { const t = await tx([store]); const s = t.objectStore(store); return await new Promise((res, rej)=>{ const r = s.getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error) }); }
  async function clear(store) { const t = await tx([store],'readwrite'); const s = t.objectStore(store); return await new Promise((res, rej)=>{ const r = s.clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error) }); }
  return { get, put, del, all, clear };
})();
