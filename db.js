export const db = (() => {
  const DB_NAME = 'budget-db';
  // Bump the version whenever the database schema changes
  const VER = 2;
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
        // New stores for linked credit cards and their transactions
        if (!d.objectStoreNames.contains('creditCards')) d.createObjectStore('creditCards', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('cardTransactions')) d.createObjectStore('cardTransactions', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(_db = req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function transaction(names, mode = 'readonly') {
    const d = await open();
    return d.transaction(names, mode);
  }
  function wrapRequest(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function get(store, key) {
    const t = await transaction([store]);
    return wrapRequest(t.objectStore(store).get(key));
  }
  async function put(store, value) {
    const t = await transaction([store], 'readwrite');
    await wrapRequest(t.objectStore(store).put(value));
    return value;
  }
  async function del(store, key) {
    const t = await transaction([store], 'readwrite');
    await wrapRequest(t.objectStore(store).delete(key));
  }
  async function all(store) {
    const t = await transaction([store]);
    return (await wrapRequest(t.objectStore(store).getAll())) || [];
  }
  async function clear(store) {
    const t = await transaction([store], 'readwrite');
    await wrapRequest(t.objectStore(store).clear());
  }
  return { get, put, del, all, clear };
})();
