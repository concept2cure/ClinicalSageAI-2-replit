/**
 * An unassessed document has no completion figure, on every surface average.
 *
 * This file pinned four layers of one defect in the MDX Document vault: every
 * uploaded file rendered as "draft · 64%", a working copy two-thirds written,
 * for a finished PDF nobody was authoring (server/routes/mdx-vault.ts,
 * hooks/useVault.ts and surfaces/VaultSurface.tsx). Those three left the tree
 * when the device vault folded into the Vault (D2, fold F3, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f3-vault/). The Vault says an
 * upload's completion as not assessed (`pct: null`, vaultSurface tests).
 *
 * What stays is the shared rule the fix put in DocumentsPanel, which the other
 * kit surfaces still average through.
 */

import { describe, it, expect } from 'vitest';
import { averageAssessedCompletion } from '../components/DocumentsPanel';

describe('averageAssessedCompletion — one definition for every surface average', () => {
  const doc = (completion: number | null) => ({ completion }) as never;

  it('leaves unassessed documents out of both the sum and the count', () => {
    // Counting the null as 0 would give 33; the honest mean of what was
    // assessed is 50.
    expect(averageAssessedCompletion([doc(40), doc(60), doc(null)])).toBe(50);
  });

  it('is null — not 0 — when nothing was assessed', () => {
    expect(averageAssessedCompletion([])).toBeNull();
    expect(averageAssessedCompletion([doc(null), doc(null)])).toBeNull();
  });

  it('rounds the mean of assessed values', () => {
    expect(averageAssessedCompletion([doc(64), doc(88), doc(100)])).toBe(84);
  });
});
