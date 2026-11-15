import test from 'node:test';
import assert from 'node:assert/strict';
import { projectVerticalDrag } from '../src/dragGeometry';
const slots = [{ id: 'a', top: 0, height: 60 }, { id: 'b', top: 72, height: 100 }, { id: 'c', top: 184, height: 80 }];
test('lifted cards stay inside the vertical list bounds', () => {
  for (const delta of [-1000, -20, 0, 60, 1000]) { const result = projectVerticalDrag(slots[1], delta, { top: 0, bottom: 300 }, slots, 12); assert.ok(result.top >= 0); assert.ok(result.top + slots[1].height <= 300); }
});
test('crossed rows make room for the complete lifted card and gap', () => {
  const down = projectVerticalDrag(slots[0], 140, { top: 0, bottom: 300 }, slots, 12);
  assert.equal(down.shifts.b, -72); assert.equal(down.shifts.c, 0); assert.equal(down.over, 'b'); assert.equal(down.settleTop, 112);
  const up = projectVerticalDrag(slots[2], -110, { top: 0, bottom: 300 }, slots, 12);
  assert.equal(up.shifts.b, 92); assert.equal(up.over, 'b'); assert.equal(up.settleTop, 72);
});
test('a taller card can move before a short first row without leaving the list', () => {
  const result = projectVerticalDrag(slots[2], -1000, { top: 0, bottom: 300 }, slots, 12); assert.equal(result.top, 0); assert.equal(result.over, 'a'); assert.equal(result.settleTop, 0);
});
test('small movements retain the current slot', () => {
  const result = projectVerticalDrag(slots[1], 3, { top: 0, bottom: 300 }, slots, 12); assert.equal(result.over, null); assert.ok(Object.values(result.shifts).every(value => value === 0));
});
