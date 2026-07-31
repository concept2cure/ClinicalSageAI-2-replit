/**
 * Therapeutic-area coverage contract.
 *
 * Enterprise bar: EVERY therapeutic area in the canonical product vocabulary
 * (shared/constants/domain/therapeutic-areas) must resolve to a real, complete
 * regulatory profile — not just the four originally hand-authored. A profile is
 * "complete" when it carries genuine context rules, guidance references,
 * reviewer expectations, and endpoint/statistical considerations a sponsor can
 * rely on when authoring in that area.
 */
import { describe, it, expect } from 'vitest';
import { THERAPEUTIC_AREAS } from '../../shared/constants/domain/therapeutic-areas';
import {
  getProfile,
  listProfiles,
  listAcceptedSlugs,
  renderProfileForPrompt,
} from '../../server/services/ana/therapeutic-area-profiles/index';

describe('therapeutic-area coverage', () => {
  it('every therapeutic area in the vocabulary resolves to a profile', () => {
    const missing = THERAPEUTIC_AREAS.filter((ta) => !getProfile(ta.value)).map((ta) => ta.value);
    expect(missing, `therapeutic areas with no profile: ${missing.join(', ')}`).toEqual([]);
  });

  it('registers at least the full 25-area vocabulary as distinct profiles', () => {
    // 21 generated + 4 hand-authored (oncology, rare-disease, neurology, immunology).
    expect(listProfiles().length).toBeGreaterThanOrEqual(25);
  });

  it('every vocabulary area passes the set-project-area validation gate', () => {
    // Mirrors setProjectTherapeuticArea's gate: a project can only be set to a
    // slug in listAcceptedSlugs (after _/space -> - normalization). If a real
    // area is rejected here, a user cannot select it.
    const accepted = new Set(listAcceptedSlugs());
    const gate = (slug: string) => accepted.has(slug.trim().toLowerCase().replace(/[\s_]+/g, '-'));
    const rejected = THERAPEUTIC_AREAS.filter((ta) => !gate(ta.value)).map((ta) => ta.value);
    expect(rejected, `set-gate rejects real areas: ${rejected.join(', ')}`).toEqual([]);
  });

  it('every profile is complete and industry-grade', () => {
    for (const ta of THERAPEUTIC_AREAS) {
      const p = getProfile(ta.value);
      expect(p, `no profile for ${ta.value}`).toBeTruthy();
      expect(p!.description.length, `${p!.id} description too thin`).toBeGreaterThan(40);
      expect(p!.contextRules.length, `${p!.id} needs context rules`).toBeGreaterThanOrEqual(4);
      expect(p!.guidanceRefs.length, `${p!.id} needs guidance refs`).toBeGreaterThanOrEqual(4);
      expect(p!.reviewerExpectations.length, `${p!.id} needs reviewer expectations`).toBeGreaterThanOrEqual(3);
      expect(p!.riskFactors.length, `${p!.id} needs risk factors`).toBeGreaterThanOrEqual(3);
      expect(p!.endpointConsiderations.length, `${p!.id} needs endpoint considerations`).toBeGreaterThanOrEqual(2);
      expect(p!.retrievalKeywords.length, `${p!.id} needs retrieval keywords`).toBeGreaterThanOrEqual(4);
      // Guidance refs must carry a real authority and code.
      for (const g of p!.guidanceRefs) {
        expect(['FDA', 'EMA', 'ICH', 'PMDA', 'HC', 'WHO', 'NMPA']).toContain(g.authority);
        expect(g.code.length).toBeGreaterThan(0);
      }
    }
  });

  it('renders a non-empty prompt context block for every area', () => {
    for (const ta of THERAPEUTIC_AREAS) {
      const p = getProfile(ta.value)!;
      const block = renderProfileForPrompt(p, { maxBulletsPerSection: 6 });
      expect(block.length, `${p.id} rendered empty`).toBeGreaterThan(100);
    }
  });

  it('common-gap patterns are lowercase (prefix-match ready) and keyed to CTD sections', () => {
    for (const ta of THERAPEUTIC_AREAS) {
      const p = getProfile(ta.value)!;
      for (const gap of p.commonGaps) {
        expect(gap.ctdSection.length).toBeGreaterThan(0);
        for (const pat of gap.patterns) {
          expect(pat, `${p.id} gap pattern not lowercase: ${pat}`).toBe(pat.toLowerCase());
        }
      }
    }
  });
});
