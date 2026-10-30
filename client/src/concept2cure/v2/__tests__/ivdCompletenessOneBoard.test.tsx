/**
 * The IVDR readiness board is one component with one mount (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f2-ivd-completeness/ and
 * grant-continuity-and-f1c-f2/).
 *
 * The family board moved from v2/surfaces/IvdCompleteness.tsx to
 * v2/surfaces/IvdReadinessBoard.tsx, which IvdSurface (device-diagnostics)
 * draws as its readiness panel. The older screen mounted the same component
 * until it folded into device-diagnostics (fold F2); its read cases went with
 * it: the project read is IvdSurface.readiness.test.tsx's, and the
 * organization-wide read belonged to the retired screen alone. What stays
 * pinned here is that the board's markup lives in the board, not in a copy.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

describe('one board, one mount', () => {
  const src = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');
  it('the family board is drawn by IvdReadinessBoard only, and device-diagnostics mounts it', () => {
    const board = src('v2/surfaces/IvdReadinessBoard.tsx');
    const surface = src('mdx/surfaces/IvdSurface.tsx');
    expect(board).toContain('className="ivd-families"');
    expect(surface).toMatch(/\bIvdReadinessBoard\b[^;]*from '\.\.\/\.\.\/v2\/surfaces\/IvdReadinessBoard'/);
    expect(surface).toContain('<IvdReadinessBoard ');
    for (const markup of ['ivd-families', 'ivd-fam-head', 'ivd-stats', 'ivd-item-title']) expect(surface).not.toContain(markup);
  });
});
