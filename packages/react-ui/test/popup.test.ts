import { describe, expect, it } from 'vitest';
import { computePlacement, type Rect } from '../src/Popup.tsx';

const VP = { width: 1000, height: 700 };
const rect = (left: number, top: number, width = 200, height = 32): Rect => ({ left, top, right: left + width, bottom: top + height, width });

describe('popup placement', () => {
  it('opens below the trigger when there is room, matching its width by default', () => {
    const p = computePlacement(rect(100, 100), VP, { contentHeight: 200 });
    expect(p).toMatchObject({ placement: 'below', left: 100, width: 200, top: 136 });
    expect(p.maxHeight).toBeGreaterThanOrEqual(200);
  });

  it('flips above when the content does not fit below and there is more room above', () => {
    const p = computePlacement(rect(100, 560), VP, { width: 400, contentHeight: 300 });
    expect(p.placement).toBe('above');
    expect(p.bottom).toBe(VP.height - 560 + 4);
    expect(p.maxHeight).toBeLessThanOrEqual(560);
  });

  it('stays below, limited to the room it has, when above is no better', () => {
    const p = computePlacement(rect(100, 20), { width: 1000, height: 200 }, { contentHeight: 400 });
    expect(p.placement).toBe('below');
    expect(p.maxHeight).toBeGreaterThanOrEqual(96); // never collapses to nothing
  });

  it('never leaves the viewport horizontally', () => {
    const right = computePlacement(rect(900, 100, 80), VP, { width: 400, contentHeight: 100 });
    expect(right.left + right.width).toBeLessThanOrEqual(VP.width - 8);
    const left = computePlacement(rect(-50, 100, 80), VP, { width: 300, contentHeight: 100 });
    expect(left.left).toBeGreaterThanOrEqual(8);
  });

  it('aligns to the end of the trigger and is capped to the viewport width', () => {
    const p = computePlacement(rect(700, 100, 100), VP, { width: 416, align: 'end', contentHeight: 100 });
    expect(p.left).toBe(800 - 416);
    const narrow = computePlacement(rect(10, 100, 100), { width: 320, height: 700 }, { width: 600, contentHeight: 100 });
    expect(narrow.width).toBe(320 - 16);
  });

  it('honours a minimum width wider than the trigger (the type picker)', () => {
    const p = computePlacement(rect(100, 100, 300), VP, { width: 'anchor', minWidth: 448, contentHeight: 100 });
    expect(p.width).toBe(448);
  });
});
