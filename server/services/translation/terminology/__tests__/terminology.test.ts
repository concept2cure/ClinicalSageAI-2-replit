/**
 * Terminology corpus integrity tests — structural invariants every domain module
 * must satisfy so the corpus maps cleanly onto the glossary contract and stays
 * trustworthy as domains are added. These are STRUCTURE checks (not linguistic
 * correctness, which is a human reviewer's job); they guard the data contract.
 */

import { describe, it, expect } from 'vitest';

import {
  ALL_TERMINOLOGY,
  DOMAIN_MODULES,
  TERMINOLOGY_DOMAINS,
  getDoNotTranslateTerms,
  getLockedTermPairs,
  corpusSummary,
} from '../index';
import type { GlossaryCategory } from '../types';

const VALID_CATEGORIES: ReadonlySet<GlossaryCategory> = new Set<GlossaryCategory>([
  'regulatory_citation',
  'agency_name',
  'evidence_label',
  'slash_command',
  'json_block',
  'inn_drug_name',
  'meddra_term',
  'code',
  'preferred_term',
]);

describe('terminology corpus', () => {
  it('has entries across at least the two seeded domains', () => {
    expect(DOMAIN_MODULES.length).toBeGreaterThanOrEqual(2);
    expect(ALL_TERMINOLOGY.length).toBeGreaterThan(120);
  });

  it('every entry has a non-empty source and sourceRef', () => {
    for (const e of ALL_TERMINOLOGY) {
      expect(e.source.trim().length, `source for ${JSON.stringify(e)}`).toBeGreaterThan(0);
      expect(e.sourceRef.trim().length, `sourceRef for "${e.source}"`).toBeGreaterThan(0);
    }
  });

  it('DNT entries have a null target; non-DNT entries have a non-empty target', () => {
    for (const e of ALL_TERMINOLOGY) {
      if (e.doNotTranslate) {
        expect(e.target, `DNT "${e.source}" must have null target`).toBeNull();
      } else {
        expect(typeof e.target === 'string' && e.target.length > 0, `non-DNT "${e.source}" needs a target`).toBe(true);
      }
    }
  });

  it('every category is a valid GlossaryCategory', () => {
    for (const e of ALL_TERMINOLOGY) {
      expect(VALID_CATEGORIES.has(e.category), `bad category "${e.category}" on "${e.source}"`).toBe(true);
    }
  });

  it('every verificationStatus is a known value', () => {
    const ok = new Set(['unverified', 'needs_review', 'verified']);
    for (const e of ALL_TERMINOLOGY) {
      expect(ok.has(e.verificationStatus), `bad status on "${e.source}"`).toBe(true);
    }
  });

  it('has no duplicate source terms within a single domain', () => {
    for (const mod of DOMAIN_MODULES) {
      const seen = new Map<string, number>();
      for (const e of mod.entries) {
        const key = e.source.toLowerCase();
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      const dups = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
      expect(dups, `duplicate sources in domain "${mod.domain}"`).toEqual([]);
    }
  });

  it("each entry's domain matches a registered domain key", () => {
    const domains = new Set(TERMINOLOGY_DOMAINS);
    for (const e of ALL_TERMINOLOGY) {
      expect(domains.has(e.domain), `entry "${e.source}" has unregistered domain "${e.domain}"`).toBe(true);
    }
  });

  it('summary counts are internally consistent', () => {
    const s = corpusSummary();
    expect(s.total).toBe(ALL_TERMINOLOGY.length);
    expect(s.doNotTranslate).toBe(getDoNotTranslateTerms().length);
    expect(s.lockedPairs).toBe(getLockedTermPairs().length);
    const byDomainTotal = Object.values(s.byDomain).reduce((a, b) => a + b, 0);
    expect(byDomainTotal).toBe(s.total);
    const byStatusTotal = Object.values(s.byVerificationStatus).reduce((a, b) => a + b, 0);
    expect(byStatusTotal).toBe(s.total);
  });
});
