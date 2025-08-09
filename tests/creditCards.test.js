import test from 'node:test';
import assert from 'node:assert/strict';
import { linkCreditCard, fetchCreditCardData, getCreditCardTransactions, listCreditCards, unlinkCreditCard, getCreditCard } from '../creditCards.js';

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
      if(indexName === 'byCard') return arr.filter(x => x.cardId === value);
      return arr.filter(x => x[indexName] === value);
    },
    async clear(store){ stores[store] = []; },
    _stores: stores
  };
}

test('link and fetch credit card data', async () => {
  const db = makeMockDb();
  const cardId = await linkCreditCard({ name: 'Mock Card', bankApiUrl: 'https://bank.example/api/card' }, db);
  assert.ok(cardId);

  let calledUrl = null;
  const fetcher = async (url) => {
    calledUrl = url;
    return {
      ok: true,
      json: async () => ({
        balance: 123.45,
        transactions: [
          { id: 'tx1', amount: 10 },
          { amount: 20 }
        ]
      })
    };
  };

  const data = await fetchCreditCardData(cardId, fetcher, db);
  assert.equal(calledUrl, 'https://bank.example/api/card');
  assert.equal(data.balance, 123.45);

  const cards = await listCreditCards(db);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].balance, 123.45);

  const txs = await getCreditCardTransactions(cardId, db);
  assert.equal(txs.length, 2);
  assert.ok(txs.every(t => t.cardId === cardId));
  assert.ok(txs[0].id);
  assert.ok(txs[1].id);
});

test('rejects non-https bank API URL and sanitizes url', async () => {
  const db = makeMockDb();
  await assert.rejects(
    () => linkCreditCard({ name: 'Bad', bankApiUrl: 'http://bank.example' }, db),
    /https/
  );
  const id = await linkCreditCard({ name: 'Good', bankApiUrl: 'https://user:pass@bank.example/path?token=1#frag' }, db);
  const card = await getCreditCard(id, db);
  assert.equal(card.bankApiUrl, 'https://bank.example/path');
});

test('dedupe transactions on subsequent fetch and unlink card', async () => {
  const db = makeMockDb();
  const cardId = await linkCreditCard({ name: 'Second Card' }, db);

  const fetcher = async () => ({
    ok: true,
    json: async () => ({
      balance: 50,
      transactions: [
        { id: 't1', amount: 5 },
        { id: 't2', amount: 7 }
      ]
    })
  });

  await fetchCreditCardData(cardId, fetcher, db);
  await fetchCreditCardData(cardId, fetcher, db);

  let txs = await getCreditCardTransactions(cardId, db);
  assert.equal(txs.length, 2);

  await unlinkCreditCard(cardId, db);
  const card = await getCreditCard(cardId, db);
  assert.equal(card, null);
  txs = await getCreditCardTransactions(cardId, db);
  assert.equal(txs.length, 0);
});
