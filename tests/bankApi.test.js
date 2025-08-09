import test from 'node:test';
import assert from 'node:assert';
import { lookupBankApi } from '../bankApi.js';

const goodFetcher = async () => ({
  ok: true,
  json: async () => ({ api: 'https://api.example.com/path?foo=1#bar' })
});

const badFetcher = async () => ({ ok: false });

const invalidJsonFetcher = async () => ({
  ok: true,
  json: async () => { throw new Error('no json'); }
});

test('lookupBankApi returns sanitized url when well-known file present', async () => {
  const url = await lookupBankApi('example.com', goodFetcher);
  assert.strictEqual(url, 'https://api.example.com/path');
});

test('lookupBankApi returns null when request fails', async () => {
  const url = await lookupBankApi('example.com', badFetcher);
  assert.strictEqual(url, null);
});

test('lookupBankApi returns null on invalid json', async () => {
  const url = await lookupBankApi('example.com', invalidJsonFetcher);
  assert.strictEqual(url, null);
});

test('lookupBankApi throws on invalid domain', async () => {
  await assert.rejects(() => lookupBankApi('::::', goodFetcher));
});
