/**
 * The register row minimum is a number the layout depends on and nobody looks
 * at. These assert the arithmetic AND the thing the arithmetic is for: that
 * both real registers demand more width than a surface pane actually gives.
 * If that ever stops being true the minimum is doing nothing and should go.
 */
import { describe, expect, it } from 'vitest';
import {
  REGISTER_GAP,
  REGISTER_PAD_X,
  TITLE_FLOOR,
  registerRowMinWidth,
} from '../registerGrid';

/** The content box of a v2 surface pane at a 1440px window: 1440 − 264 rail − 380 AnA, less the row's own padding. */
const PANE_CONTENT = 1440 - 264 - 380 - REGISTER_PAD_X * 2;

const SOP_GRID = '110px minmax(0, 1fr) 130px 64px 108px 100px 116px 150px';
const CHANGE_GRID = '112px minmax(0, 1fr) 118px 80px 128px 104px 62px 120px';

describe('registerRowMinWidth', () => {
  it('keeps `minmax(0, 1fr)` whole rather than splitting it on its inner space', () => {
    // Eight tracks, not ten. Split naively this reads as `minmax(0,` + `1fr)`
    // and the row comes out two gaps too wide.
    expect(registerRowMinWidth('10px minmax(0, 1fr) 20px')).toBe(
      10 + 20 + TITLE_FLOOR + 2 * REGISTER_GAP + REGISTER_PAD_X * 2,
    );
  });

  it('gives every flexible track the floor, not just the first', () => {
    expect(registerRowMinWidth('10px 1fr 1fr')).toBe(
      10 + 2 * TITLE_FLOOR + 2 * REGISTER_GAP + REGISTER_PAD_X * 2,
    );
  });

  it('is the sum of fixed tracks, floors, gaps and padding for the SOP register', () => {
    const fixed = 110 + 130 + 64 + 108 + 100 + 116 + 150;
    expect(registerRowMinWidth(SOP_GRID)).toBe(
      fixed + TITLE_FLOOR + 7 * REGISTER_GAP + REGISTER_PAD_X * 2,
    );
  });

  it('does not need a minimum when the tracks already fit', () => {
    expect(registerRowMinWidth('10px 20px')).toBe(10 + 20 + REGISTER_GAP + REGISTER_PAD_X * 2);
  });

  // The reason the minimum exists at all. Without it `minmax(0, 1fr)` resolves
  // the title track to 0px in this pane and the register renders untitled rows.
  it.each([
    ['SOP register', SOP_GRID],
    ['change control', CHANGE_GRID],
  ])('%s asks for more than a surface pane gives, so the title needs the floor', (_label, grid) => {
    expect(registerRowMinWidth(grid)).toBeGreaterThan(PANE_CONTENT);
  });
});
