import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV } from '../parseCSV.js';

test('plain fields', () => {
  assert.deepStrictEqual(parseCSV('a,b,c'), ['a','b','c']);
});

test('quoted fields', () => {
  assert.deepStrictEqual(parseCSV('"a","b","c"'), ['a','b','c']);
});

test('embedded commas', () => {
  assert.deepStrictEqual(parseCSV('a,"b,c","d,e"'), ['a','b,c','d,e']);
});

test('escaped quotes', () => {
  assert.deepStrictEqual(parseCSV('"a""b""c",d'), ['a"b"c','d']);
});
