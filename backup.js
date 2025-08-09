import { db as realDb } from './db.js';

export async function createBackup(database = realDb){
  const settings = await database.all('settings');
  const categories = await database.all('categories');
  const transactions = await database.all('transactions');
  const expenses = await database.all('expenses');
  return { settings, categories, transactions, expenses, timestamp: new Date().toISOString() };
}

export async function loadBackup(data, database = realDb){
  if(!data) return;
  for(const store of ['settings','categories','transactions','expenses']){
    await database.clear(store);
    for(const item of data[store] || []){
      await database.put(store, item);
    }
  }
}
