import test from 'node:test';
import assert from 'node:assert';
import { num } from '../num.js';

test('num parses currency formatted strings', () => {
  assert.strictEqual(num('$1,234.56'), 1234.56);
  assert.strictEqual(num(''), 0);
});
