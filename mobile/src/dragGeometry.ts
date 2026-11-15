export type DragSlot = { id: string; top: number; height: number };
export function projectVerticalDrag(source: DragSlot, delta: number, bounds: { top: number; bottom: number }, slots: DragSlot[], gap: number) {
  const top = Math.max(bounds.top, Math.min(source.top + delta, Math.max(bounds.top, bounds.bottom - source.height)));
  const center = top + source.height / 2, original = source.top + source.height / 2;
  const atTop = top <= bounds.top + .5, atBottom = top + source.height >= bounds.bottom - .5;
  const direction = center >= original ? 1 : -1;
  const shifts: Record<string, number> = {};
  let over: string | null = null, settleTop = source.top;
  for (const slot of slots) {
    if (slot.id === source.id) continue;
    const crosses = direction > 0 ? slot.top >= source.top + source.height && (center > slot.top + slot.height / 2 || atBottom && slot.top + slot.height <= bounds.bottom) : slot.top + slot.height <= source.top && (center < slot.top + slot.height / 2 || atTop && slot.top >= bounds.top);
    shifts[slot.id] = crosses ? -direction * (source.height + gap) : 0;
    if (crosses && (over === null || (direction > 0 ? slot.top > settleTop : slot.top < settleTop))) {
      over = slot.id; settleTop = direction > 0 ? slot.top + slot.height - source.height : slot.top;
    }
  }
  return { top, delta: top - source.top, shifts, over, direction, settleTop };
}
