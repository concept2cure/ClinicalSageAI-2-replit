/**
 * PMCF Plan Generator — the authored DRAFT content is unspecialised scaffold, so
 * it must NOT pass the validatePmcfPlan gate on presence alone; it passes only
 * once the sponsor replaces every field with real content. The generator
 * integrates with the post-market model rather than duplicating it, is
 * device-parameterised, deterministic, and honestly marked DRAFT.
 */

import { describe, it, expect } from 'vitest';
import { buildPmcfPlanContent } from '../pmcf-plan-generator';
import { validateDocument } from '../post-market.service';
import type { PostMarketDocument } from '../../../../shared/schema/gspr-postmarket';

function asPmcfDoc(content: unknown): PostMarketDocument {
  return {
    documentType: 'pmcf_plan',
    content,
    locked: false,
    status: 'draft',
  } as unknown as PostMarketDocument;
}

describe('buildPmcfPlanContent', () => {
  const base = { deviceName: 'Acme Infusion Pump', deviceClass: 'IIb', regulation: 'MDR' as const };

  it('produces all five Annex XIV Part B §6.2 keys with content', () => {
    const c = buildPmcfPlanContent(base);
    for (const key of ['generalMethods', 'specificMethods', 'rationale', 'milestones', 'evaluationCriteria'] as const) {
      expect(c[key].trim().length).toBeGreaterThan(0);
    }
  });

  it('raw generated DRAFT scaffold does NOT pass the gate (fail closed)', () => {
    const result = validateDocument(asPmcfDoc(buildPmcfPlanContent(base)));
    // Every field is present but still DRAFT scaffold — presence is not
    // sufficiency, so the gate must refuse it.
    expect(result.findings.filter(f => f.code === 'PMCFP-001').length).toBeGreaterThan(0);
    expect(result.passesGate).toBe(false);
  });

  it('passes the gate once the sponsor specialises every field (no DRAFT sentinel)', () => {
    const scaffold = buildPmcfPlanContent(base);
    const specialised = Object.fromEntries(
      Object.keys(scaffold).map(k => [k, `Sponsor-specialised final content for ${k}.`])
    );
    const result = validateDocument(asPmcfDoc(specialised));
    expect(result.findings.filter(f => f.code === 'PMCFP-001')).toHaveLength(0);
    expect(result.passesGate).toBe(true);
  });

  it('an EMPTY plan still fails the existing checker (no false pass)', () => {
    const result = validateDocument(asPmcfDoc({}));
    expect(result.passesGate).toBe(false);
    expect(result.findings.some(f => f.code === 'PMCFP-001')).toBe(true);
  });

  it('is device-class parameterised', () => {
    const classIII = buildPmcfPlanContent({ ...base, deviceClass: 'III' });
    const classI = buildPmcfPlanContent({ ...base, deviceClass: 'I' });
    expect(classIII.specificMethods).toMatch(/study|registry/i);
    expect(classI.specificMethods).toMatch(/literature monitoring|justification/i);
    expect(classIII.specificMethods).not.toEqual(classI.specificMethods);
  });

  it('weaves in a CER reference when supplied', () => {
    const c = buildPmcfPlanContent({ ...base, cerReference: 'CER-2026-001' });
    expect(c.rationale).toContain('CER-2026-001');
  });

  it('is honestly marked DRAFT (not a sufficiency determination) and deterministic', () => {
    const a = buildPmcfPlanContent(base);
    const b = buildPmcfPlanContent(base);
    expect(a).toEqual(b);
    expect(Object.values(a).join(' ')).toMatch(/DRAFT/);
    // MDCG 2020-7: generic surveillance alone is not sufficient — must be stated.
    expect(a.specificMethods).toMatch(/not sufficient|MDCG 2020-7/i);
  });
});
