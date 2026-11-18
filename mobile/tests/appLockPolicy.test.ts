import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldLockNotes } from '../src/appLockPolicy';

test('Face ID prompt does not relock the note on a brief inactive transition', () => {
  assert.equal(shouldLockNotes('active', true), false);
  assert.equal(shouldLockNotes('inactive', true), false);
});
test('screen locking, actual background and ordinary interruptions still lock notes', () => {
  assert.equal(shouldLockNotes('inactive', false), true);
  assert.equal(shouldLockNotes('background', true), true);
  assert.equal(shouldLockNotes('background', false), true);
  assert.equal(shouldLockNotes('unknown', true), true);
});
