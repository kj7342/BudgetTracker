import test from 'node:test';
import assert from 'node:assert/strict';
import { linkCreditCard, fetchCreditCardData, getCreditCardTransactions, listCreditCards } from '../creditCards.js';

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
    async clear(store){ stores[store] = []; },
    _stores: stores
  };
}

test('link and fetch credit card data', async () => {
  const db = makeMockDb();
  const cardId = await linkCreditCard({ name: 'Mock Card' }, db);
  assert.ok(cardId);

  const fetcher = async () => ({
    ok: true,
    json: async () => ({
      balance: 123.45,
      transactions: [
        { id: 'tx1', amount: 10 },
        { amount: 20 }
      ]
    })
  });

  const data = await fetchCreditCardData(cardId, fetcher, db);
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
