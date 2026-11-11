import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const privacy = read('privacy.html'), terms = read('terms.html'), deletion = read('delete-account.html');
const mobile = read('mobile/src/app/(tabs)/settings.tsx'), web = read('index.html'), server = read('server.mjs'), build = read('build.mjs');
test('all required public policy pages are readable, branded, and linked together', () => {
  for (const [name, page] of Object.entries({ privacy, terms, deletion })) {
    assert.match(page, /<!doctype html>/i, name);
    assert.match(page, /Bestpad/);
    assert.match(page, /Effective November 11, 2026/);
    for (const route of ['/privacy.html', '/terms.html', '/delete-account.html']) assert.ok(page.includes('href="' + route + '"'), route);
    assert.match(page, /github\.com\/dawsonkuy\/notes\/issues\/new/);
  }
});
test('privacy policy covers actual data storage, service providers, and deletion', () => {
  for (const term of ['Supabase', 'Cloudflare', 'jsDelivr', 'guest', 'Trash', 'end-to-end encrypted', 'account', 'retention']) {
    assert.ok(privacy.toLowerCase().includes(term.toLowerCase()), term);
  }
  assert.match(deletion, /Settings/);
  assert.match(deletion, /Account/);
  assert.match(deletion, /local/);
});
test('mobile and web Settings expose links and in-app account deletion', () => {
  for (const path of ['/privacy.html','/terms.html','/delete-account.html']) {
    assert.ok(mobile.includes('https://bestpad.app' + path), path);
    assert.ok(web.includes('href="' + path + '"'), path);
  }
  assert.match(mobile, /Account deletion/);
  assert.match(mobile, /functions\.invoke\('delete-account'/);
  assert.match(web, /open-account-settings/);
});
test('development and Cloudflare build serve each public legal URL', () => {
  for (const name of ['privacy.html', 'terms.html', 'delete-account.html', 'legal.css']) {
    assert.ok(build.includes("'" + name + "'"), 'build missing ' + name);
    assert.ok(server.includes("'/" + name + "'"), 'server missing ' + name);
  }
});
