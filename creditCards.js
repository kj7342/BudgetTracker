import { db } from './db.js';

/**
 * Link a credit card by saving basic metadata to the database.
 * @param {{id?:string, name:string, provider?:string, balance?:number}} card
 * @param {*} database optional database (for testing)
 * @returns {Promise<string>} id of the stored card
 */
export async function linkCreditCard(card, database = db){
  const id = card.id || crypto.randomUUID();
  const stored = { id, name: card.name, provider: card.provider || '', balance: card.balance || 0 };
  await database.put('creditCards', stored);
  return id;
}

/**
 * Fetch balance and transaction history for a linked card.
 * The fetcher function should return a Response-like object with a JSON body
 * containing `{ balance:number, transactions:Array }`.
 * @param {string} cardId
 * @param {Function} fetcher fetch-like function
 * @param {*} database optional database
 */
export async function fetchCreditCardData(cardId, fetcher = fetch, database = db){
  const res = await fetcher(`/api/creditcards/${cardId}`);
  if (!res || !res.ok) throw new Error('Failed to fetch card data');
  const data = await res.json();
  const existing = await database.get('creditCards', cardId) || { id: cardId };
  await database.put('creditCards', { ...existing, balance: data.balance });
  if (Array.isArray(data.transactions)){
    const current = await getCreditCardTransactions(cardId, database);
    const seen = new Set(current.map(t => t.id));
    for (const tx of data.transactions){
      const txId = tx.id || crypto.randomUUID();
      if (seen.has(txId)) continue;
      await database.put('cardTransactions', { ...tx, id: txId, cardId });
    }
  }
  return data;
}

/**
 * Remove a linked credit card and its transactions from the database.
 * @param {string} cardId
 * @param {*} database optional database
 */
export async function unlinkCreditCard(cardId, database = db){
  const txs = await getCreditCardTransactions(cardId, database);
  for (const tx of txs){
    await database.del('cardTransactions', tx.id);
  }
  await database.del('creditCards', cardId);
}

/**
 * Get metadata for a single credit card.
 * @param {string} cardId
 * @param {*} database optional database
 */
export async function getCreditCard(cardId, database = db){
  return await database.get('creditCards', cardId);
}

/**
 * Get all transactions for a credit card.
 * @param {string} cardId
 * @param {*} database optional database
 */
export async function getCreditCardTransactions(cardId, database = db){
  return await database.index('cardTransactions', 'byCard', cardId);
}

/**
 * Return all linked credit cards.
 * @param {*} database optional database
 */
export async function listCreditCards(database = db){
  return await database.all('creditCards');
}
