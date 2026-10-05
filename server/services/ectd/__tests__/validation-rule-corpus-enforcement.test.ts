/**
 * The acceptance corpus and the FDA technical-rules registry must give one
 * answer to "does the platform check this?".
 *
 * AnA reads RULE_CORPUS through list_validation_rules and FDA_TECHNICAL_RULES
 * through list_fda_technical_rules. Before 2026-10-05 the corpus said
 * PDF_NO_SECURITY was 'external' ("the agency validator decides; the product
 * does not reproduce the check") while the FDA registry said 'enforced', and the
 * code agreed with the FDA registry: the v3.2.2 packager, the eCTD v4.0 RPS
 * packager and the transmit guard all refuse a secured PDF leaf. The same
 * question got opposite answers from two tools.
 *
 * This test pins the agreement both ways and ties the corpus's claim to the
 * code it names, so a rationale that cites an enforcement point which no longer
 * refuses anything fails here.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { FDA_TECHNICAL_RULES } from '../../ind/ctd/fda-technical-rules';
import { getRule, ruleView, enforcementStatement } from '../validation-rule-corpus';

/**
 * FDA technical-rule id → the corpus rule that states the same requirement.
 * A row missing here that the FDA registry calls 'enforced' fails the first
 * test: an enforced rule must be answerable from the corpus too.
 */
const FDA_TO_CORPUS: Readonly<Record<string, string>> = {
  'pdf-version': 'PDF_VERSION',
  'pdf-no-security': 'PDF_NO_SECURITY',
  'ectd-file-names': 'FILE_NAMING',
};

/** Repo-relative paths of the code that refuses a secured PDF leaf. */
const PDF_SECURITY_ENFORCERS = [
  'server/services/submission-gateways/regional-packager.ts',
  'server/services/submission-gateways/bundle-leaf-security.ts',
  'server/services/ectd/ectd4/rps-packager.ts',
] as const;

const repoFile = (rel: string): URL => new URL(`../../../../${rel}`, import.meta.url);

describe('acceptance corpus agrees with the FDA technical-rules registry', () => {
  it('every FDA rule the platform enforces maps to a corpus rule that is not "external"', () => {
    const enforced = FDA_TECHNICAL_RULES.filter((r) => r.platform.check === 'enforced');
    expect(enforced.length).toBeGreaterThan(0);
    for (const fda of enforced) {
      const corpusId = FDA_TO_CORPUS[fda.id];
      expect(corpusId, `FDA rule '${fda.id}' is enforced but maps to no corpus rule`).toBeTruthy();
      const rule = getRule(corpusId);
      expect(rule, `corpus has no rule '${corpusId}'`).toBeDefined();
      expect(rule!.regions, `${corpusId} must apply to FDA`).toContain('fda');
      expect(rule!.enforcement, `FDA says '${fda.id}' is enforced; corpus ${corpusId} says '${rule!.enforcement}'`).not.toBe('external');
    }
  });

  it('no corpus rule claims a check the FDA registry says nothing runs', () => {
    for (const [fdaId, corpusId] of Object.entries(FDA_TO_CORPUS)) {
      const fda = FDA_TECHNICAL_RULES.find((r) => r.id === fdaId);
      const rule = getRule(corpusId);
      expect(fda, `FDA registry has no rule '${fdaId}'`).toBeDefined();
      expect(rule, `corpus has no rule '${corpusId}'`).toBeDefined();
      if (fda!.platform.check === 'not-checked') {
        expect(rule!.enforcement, `FDA says '${fdaId}' is not checked; corpus ${corpusId} claims '${rule!.enforcement}'`).toBe('external');
      }
    }
  });

  it('PDF_NO_SECURITY is answered as checked by the platform, not by the agency validator', () => {
    const view = ruleView('PDF_NO_SECURITY');
    expect(view).not.toBeNull();
    expect(view!.enforcement).toBe('packager');
    expect(view!.enforcementStatement).toBe(enforcementStatement('packager'));
    expect(view!.enforcementStatement).not.toMatch(/agency validator/);
  });

  it('PDF_NO_SECURITY names each enforcement point, and each one refuses a secured leaf', () => {
    const rule = getRule('PDF_NO_SECURITY')!;
    for (const rel of PDF_SECURITY_ENFORCERS) {
      const base = rel.split('/').pop()!;
      expect(rule.rationale, `rationale must name ${base}`).toContain(base);
      const src = fs.readFileSync(repoFile(rel), 'utf8');
      expect(src, `${rel} must judge leaves with assessLeafPdfSecurity`).toMatch(/assessLeafPdfSecurity\(/);
      expect(src, `${rel} must act on a 'secured' verdict`).toMatch(/verdict === 'secured'/);
    }
    // The one exception the shared rule makes is stated, so the answer is not overclaimed.
    expect(rule.rationale).toMatch(/FDA form/i);
  });
});
