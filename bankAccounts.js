import { db } from './db.js';
import { sanitizeBankApiUrl } from './bankApi.js';

/**
 * Link a bank account by saving basic metadata to the database.
 * @param {{id?:string, name:string, institution?:string, balance?:number, bankApiUrl?:string}} account
 * @param {*} database optional database (for testing)
 * @returns {Promise<string>} id of the stored account
 */
export async function linkBankAccount(account, database = db){
  const id = account.id || crypto.randomUUID();
  const stored = {
    id,
    name: account.name,
    institution: account.institution || '',
    bankApiUrl: sanitizeBankApiUrl(account.bankApiUrl),
    balance: account.balance || 0
  };
  await database.put('bankAccounts', stored);
  return id;
}

/**
 * Fetch balance and transaction history for a linked bank account.
 * The fetcher function should return a Response-like object with a JSON body
 * containing `{ balance:number, transactions:Array }`.
 * @param {string} accountId
 * @param {Function} fetcher fetch-like function
 * @param {*} database optional database
 */
export async function fetchBankAccountData(accountId, fetcher = fetch, database = db){
  const meta = await database.get('bankAccounts', accountId) || { id: accountId };
  const endpoint = meta.bankApiUrl ? sanitizeBankApiUrl(meta.bankApiUrl) : `/api/bankaccounts/${accountId}`;
  const res = await fetcher(endpoint);
  if (!res || !res.ok) throw new Error('Failed to fetch account data');
  const data = await res.json();
  await database.put('bankAccounts', { ...meta, balance: data.balance });
  if (Array.isArray(data.transactions)){
    const current = await getBankAccountTransactions(accountId, database);
    const seen = new Set(current.map(t => t.id));
    for (const tx of data.transactions){
      const txId = tx.id || crypto.randomUUID();
      if (seen.has(txId)) continue;
      await database.put('bankTransactions', { ...tx, id: txId, accountId });
    }
  }
  return data;
}

/**
 * Remove a linked bank account and its transactions from the database.
 * @param {string} accountId
 * @param {*} database optional database
 */
export async function unlinkBankAccount(accountId, database = db){
  const txs = await getBankAccountTransactions(accountId, database);
  for (const tx of txs){
    await database.del('bankTransactions', tx.id);
  }
  await database.del('bankAccounts', accountId);
}

/**
 * Get metadata for a single bank account.
 * @param {string} accountId
 * @param {*} database optional database
 */
export async function getBankAccount(accountId, database = db){
  return await database.get('bankAccounts', accountId);
}

/**
 * Get all transactions for a bank account.
 * @param {string} accountId
 * @param {*} database optional database
 */
export async function getBankAccountTransactions(accountId, database = db){
  return await database.index('bankTransactions', 'byAccount', accountId);
}

/**
 * Return all linked bank accounts.
 * @param {*} database optional database
 */
export async function listBankAccounts(database = db){
  const accounts = await database.all('bankAccounts');
  return accounts.map(({ bankApiUrl, ...rest }) => rest);
}

