import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeleteAccountHandler } from '../../supabase/functions/delete-account/handler';
function fixture() {
  const deleted: string[] = [];
  const handler = createDeleteAccountHandler({ authenticate: async token => token === 'valid' ? 'verified-user' : null, deleteUser: async id => { deleted.push(id); } });
  const request = (token = 'valid', body: object = { confirmation: 'DELETE' }) => new Request('https://example.com/delete-account', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { handler, deleted, request };
}
test('account deletion rejects missing or invalid sessions', async () => {
  const f = fixture();
  assert.equal((await f.handler(new Request('https://example.com', { method: 'POST' }))).status, 401);
  assert.equal((await f.handler(f.request('invalid'))).status, 401);
  assert.deepEqual(f.deleted, []);
});
test('account deletion requires explicit confirmation', async () => {
  const f = fixture(); assert.equal((await f.handler(f.request('valid', {}))).status, 400); assert.deepEqual(f.deleted, []);
});
test('account deletion uses only the verified identity, ignoring a supplied user ID', async () => {
  const f = fixture(); const response = await f.handler(f.request('valid', { confirmation: 'DELETE', user_id: 'someone-else' }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { deleted: true }); assert.deepEqual(f.deleted, ['verified-user']);
});
test('account deletion rejects GET and permits browser preflight without deleting', async () => {
  const f = fixture(); assert.equal((await f.handler(new Request('https://example.com'))).status, 405);
  assert.equal((await f.handler(new Request('https://example.com', { method: 'OPTIONS' }))).status, 204); assert.deepEqual(f.deleted, []);
});
test('account deletion does not report success or leak details on backend failure', async () => {
  const f = fixture(); const handler = createDeleteAccountHandler({ authenticate: async () => 'verified-user', deleteUser: async () => { throw new Error('secret database detail'); } });
  const response = await handler(f.request()); assert.equal(response.status, 500); assert.doesNotMatch(await response.text(), /secret/);
});
