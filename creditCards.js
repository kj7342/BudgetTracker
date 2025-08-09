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
    for (const tx of data.transactions){
      const txId = tx.id || crypto.randomUUID();
      await database.put('cardTransactions', { ...tx, id: txId, cardId });
    }
  }
  return data;
}

/**
 * Get all transactions for a credit card.
 * @param {string} cardId
 * @param {*} database optional database
 */
export async function getCreditCardTransactions(cardId, database = db){
  const all = await database.all('cardTransactions');
  return all.filter(tx => tx.cardId === cardId);
}

/**
 * Return all linked credit cards.
 * @param {*} database optional database
 */
export async function listCreditCards(database = db){
  return await database.all('creditCards');
}
