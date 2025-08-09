import { db } from './db.js';

const STORES = ['settings', 'categories', 'transactions', 'expenses'];

export async function createBackup(database = db) {
  const [settings, categories, transactions, expenses] = await Promise.all(
    STORES.map(s => database.all(s))
  );
  return { settings, categories, transactions, expenses, timestamp: new Date().toISOString() };
}

export async function loadBackup(data, database = db) {
  if (!data) return;
  for (const store of STORES) {
    await database.clear(store);
    const items = data[store] || [];
    await Promise.all(items.map(item => database.put(store, item)));
  }
}
