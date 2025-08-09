import test from 'node:test';
import assert from 'node:assert/strict';
import { linkBankAccount, fetchBankAccountData, getBankAccountTransactions, listBankAccounts, unlinkBankAccount, getBankAccount } from '../bankAccounts.js';

function makeMockDb(initial = {}){
  const stores = JSON.parse(JSON.stringify(initial));
  return {
    async all(store){ return [...(stores[store] || [])]; },
    async get(store, id){ return (stores[store] || []).find(x => x.id === id) || null; },
    async put(store, value){
      const arr = stores[store] || (stores[store] = []);
      const idx = arr.findIndex(x => x.id === value.id);
      if (idx >= 0) arr[idx] = value; else arr.push(value);
    },
    async del(store, id){
      const arr = stores[store] || (stores[store] = []);
      const idx = arr.findIndex(x => x.id === id);
      if (idx >= 0) arr.splice(idx, 1);
    },
    async index(store, indexName, value){
      const arr = stores[store] || [];
      if(indexName === 'byAccount') return arr.filter(x => x.accountId === value);
      return arr.filter(x => x[indexName] === value);
    },
    async clear(store){ stores[store] = []; },
    _stores: stores
  };
}

test('link and fetch bank account data', async () => {
  const db = makeMockDb();
  const acctId = await linkBankAccount({ name: 'Mock Account', bankApiUrl: 'https://bank.example/api/acct' }, db);
  assert.ok(acctId);

  let calledUrl = null;
  const fetcher = async (url) => {
    calledUrl = url;
    return {
      ok: true,
      json: async () => ({
        balance: 500.25,
        transactions: [
          { id: 'tx1', amount: 100 },
          { amount: 50 }
        ]
      })
    };
  };

  const data = await fetchBankAccountData(acctId, fetcher, db);
  assert.equal(calledUrl, 'https://bank.example/api/acct');
  assert.equal(data.balance, 500.25);

  const accounts = await listBankAccounts(db);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].balance, 500.25);

  const txs = await getBankAccountTransactions(acctId, db);
  assert.equal(txs.length, 2);
  assert.ok(txs.every(t => t.accountId === acctId));
  assert.ok(txs[0].id);
  assert.ok(txs[1].id);
});

test('rejects non-https bank API URL and sanitizes url', async () => {
  const db = makeMockDb();
  await assert.rejects(
    () => linkBankAccount({ name: 'Bad', bankApiUrl: 'http://bank.example' }, db),
    /https/
  );
  const id = await linkBankAccount({ name: 'Good', bankApiUrl: 'https://user:pass@bank.example/path?token=1#frag' }, db);
  const acct = await getBankAccount(id, db);
  assert.equal(acct.bankApiUrl, 'https://bank.example/path');
});

test('dedupe transactions on subsequent fetch and unlink account', async () => {
  const db = makeMockDb();
  const acctId = await linkBankAccount({ name: 'Second Account' }, db);

  const fetcher = async () => ({
    ok: true,
    json: async () => ({
      balance: 200,
      transactions: [
        { id: 't1', amount: 10 },
        { id: 't2', amount: 15 }
      ]
    })
  });

  await fetchBankAccountData(acctId, fetcher, db);
  await fetchBankAccountData(acctId, fetcher, db);

  let txs = await getBankAccountTransactions(acctId, db);
  assert.equal(txs.length, 2);

  await unlinkBankAccount(acctId, db);
  const acct = await getBankAccount(acctId, db);
  assert.equal(acct, null);
  txs = await getBankAccountTransactions(acctId, db);
  assert.equal(txs.length, 0);
});

