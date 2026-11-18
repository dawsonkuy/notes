import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBiometricKey } from '../src/biometricData';

const salt = 'ab'.repeat(16);
const key = 'cd'.repeat(32);
test('Face ID key can only be used with the matching note salt', () => {
  const saved = JSON.stringify({ v: 1, salt, key });
  assert.equal(decodeBiometricKey(saved, salt), key);
  assert.equal(decodeBiometricKey(saved, 'ef'.repeat(16)), null);
});
test('Face ID key parser fails closed for damaged or untrusted metadata', () => {
  for (const payload of [null, '', '{', 'null', '[]', '{}', JSON.stringify({ v: 2, salt, key }),
    JSON.stringify({ v: 1, salt, key: 'aa' }), JSON.stringify({ v: 1, salt, key: 'z'.repeat(64) })]) {
    assert.equal(decodeBiometricKey(payload, salt), null);
  }
});
