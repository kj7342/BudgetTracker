import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, loadBackup } from '../backup.js';

function makeMockDb(initial){
  const stores = JSON.parse(JSON.stringify(initial));
  return {
    async all(store){ return [...(stores[store] || [])]; },
    async put(store, value){
      const arr = stores[store] || (stores[store] = []);
      const idx = arr.findIndex(x => x.id === value.id);
      if (idx >= 0) arr[idx] = value; else arr.push(value);
    },
    async clear(store){ stores[store] = []; },
    _stores: stores
  };
}

test('backup and restore data', async () => {
  const initial = {
    settings: [{id:'settings', faceIdRequired:false}],
    categories: [{id:'c1', name:'Food', cap:100}],
    transactions: [{id:'t1', amount:5, date:'2024-01-01', note:'', categoryId:'c1'}],
    expenses: [{id:'e1', name:'Rent', amount:500, paid:false}]
  };
  const db = makeMockDb(initial);
  const backup = await createBackup(db);
  assert.deepStrictEqual(backup.categories, initial.categories);

  // Clear and restore
  for(const store of ['settings','categories','transactions','expenses']){
    await db.clear(store);
  }
  await loadBackup(backup, db);
  assert.deepStrictEqual(await db.all('settings'), initial.settings);
  assert.deepStrictEqual(await db.all('categories'), initial.categories);
  assert.deepStrictEqual(await db.all('transactions'), initial.transactions);
  assert.deepStrictEqual(await db.all('expenses'), initial.expenses);
});
