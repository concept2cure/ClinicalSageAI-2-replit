/**
 * An artifact whose name matches no DIA TMF Reference Model keyword is
 * unclassified — it is not filed into a zone nobody chose.
 *
 * ── What the code used to do ────────────────────────────────────────────────
 * `classifyArtifact` returned Zone 2 "Central Trial Documents" (confidence
 * 'default') for any name that matched no rule, and the retired store's
 * `addArtifactTx` stored that zone and section on the artifact's row with no
 * marker, `expected` and `completeness_required` by default — so
 * "quarterly-board-deck.pdf" entered Zone 2's completeness denominator, and AnA
 * announced it as "Filed … to TMF zone 2 (auto-classified)", the same words as a
 * keyword match.
 *
 * 2026-11-12 (eTMF convergence E4 step 5): `addArtifactTx` and its three cases
 * went with the retired store. AnA's filing refuses a name that is no record of
 * the reference model and asks which record it is (etmf-tools.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { classifyArtifact } from '../etmf-logic';

describe('classifyArtifact', () => {
  it('says a name that matches no rule is unclassified, with no zone', () => {
    expect(classifyArtifact('quarterly-board-deck.pdf')).toEqual({
      zone: null,
      zoneName: null,
      section: null,
      confidence: 'unclassified',
    });
  });

  it('still classifies a keyword match', () => {
    expect(classifyArtifact('Statistical Analysis Plan v2')).toMatchObject({ zone: 11, confidence: 'matched' });
  });
});
