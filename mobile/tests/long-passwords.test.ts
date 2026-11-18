import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { newNote } from '../src/model';
import { protectNote, unlockNote } from '../src/security';

test('long unicode note passwords have no application maximum length', async () => {
  const password = '🌙 Secure bestpad passphrase 🔑'.repeat(200);
  assert.ok(password.length > 4096);
  const original = { ...newNote('long-passphrase'), text: 'Still encrypted and readable after unlock.' };
  const encrypted = await protectNote(original, password, length => new Uint8Array(randomBytes(length)));
  assert.equal(encrypted.note.text, '');
  const recovered = await unlockNote(encrypted.note, password);
  assert.equal(recovered.note.text, original.text);
  encrypted.key.fill(0); recovered.key.fill(0);
});
