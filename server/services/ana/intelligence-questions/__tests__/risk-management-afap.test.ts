/**
 * The risk-management flow and its war-game auditor must not teach ALARP as
 * the device risk-acceptability principle.
 *
 * EU MDR/IVDR Annex I §2 requires risks to be reduced as far as possible
 * (AFAP) without adversely affecting the benefit-risk ratio, and EN ISO
 * 14971:2019+A11:2021 Annex ZA rules out economic considerations as a reason
 * to stop (both recall; see risk-management-structure.ts). ISO 14971:2019 does
 * not require ALARP: clause 4.2 NOTE 1 lists ALARP, ALARA and AFAP as
 * approaches the manufacturer's policy can define (recall), and clause 7.4 is
 * the benefit-risk analysis, not an ALARP requirement. Before this change
 * the flow offered "ICH Q9 ALARP Principle", cited "Section 7.4 requires ...
 * the ALARP principle", and the auditor told EU manufacturers to justify
 * stopping on cost-benefit analysis.
 *
 * The EU wording is owned by `riskAcceptabilityPolicy` in
 * server/services/market-specs/risk-management-structure.ts; the flow and the
 * auditor read it from there.
 */
import { describe, it, expect } from 'vitest';

import { createRiskManagementFlow } from '../flows/risk-management.js';
import { createRiskManagementAuditor } from '../war-game/auditors/risk-management-auditor.js';
import { riskAcceptabilityPolicy } from '../../../market-specs/risk-management-structure.js';

const flow = createRiskManagementFlow();
const node = (id: string) => {
  const n = flow.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`node ${id} missing`);
  return n;
};
const field = (nodeId: string, fieldId: string) => {
  const f = node(nodeId).fields.find((x) => x.id === fieldId);
  if (!f) throw new Error(`field ${fieldId} missing`);
  return f;
};

describe('risk-management flow: acceptability principle', () => {
  it('offers AFAP and no ALARP option', () => {
    const opts = field('risk_evaluation', 'risk_acceptability_criteria').options ?? [];
    expect(opts.some((o) => /ALARP/i.test(o.label) || o.value === 'ich_q9_alarp')).toBe(false);
    const afap = opts.find((o) => o.value === 'mdr_ivdr_afap');
    expect(afap?.label).toBe('AFAP — EU MDR/IVDR Annex I §2');
  });

  it('relabels the stale "ISO 14971 Annex D" option to ISO/TR 24971:2020, keeping its stored value', () => {
    const opts = field('risk_evaluation', 'risk_acceptability_criteria').options ?? [];
    const o = opts.find((x) => x.value === 'iso_14971_annex_d');
    expect(o?.label).toBe('ISO/TR 24971:2020 guidance');
  });

  it('does not claim ISO 14971:2019 requires ALARP, and carries the EU policy text', () => {
    const eu = riskAcceptabilityPolicy('EU_MDR').statement;
    for (const id of ['risk_evaluation', 'risk_acceptability']) {
      const n = node(id);
      const text = `${n.question}\n${n.guidance ?? ''}`;
      expect(text).not.toMatch(/ALARP|reasonably practicable/i);
      expect(n.guidance).toContain(eu);
    }
    expect(node('risk_acceptability').guidance).not.toMatch(/7\.4 requires/i);
  });

  it('keeps the alarp_demonstration field id but relabels it, and its issue check, without ALARP', () => {
    const f = field('risk_acceptability', 'alarp_demonstration');
    expect(f.label).toBe('Residual-risk reduction demonstration');
    expect(f.helpText ?? '').not.toMatch(/ALARP|reasonably practicable|disproportionate/i);
    expect(f.helpText ?? '').toMatch(/AFAP/);
    const check = (node('risk_acceptability').issueChecks ?? []).find((c) => c.condition.field === 'alarp_demonstration');
    expect(check).toBeDefined();
    expect(`${check!.title} ${check!.message} ${check!.reference ?? ''}`).not.toMatch(/ALARP|reasonably practicable|7\.4/i);
  });
});

describe('risk-management auditor: EU acceptability language', () => {
  const auditor = createRiskManagementAuditor();
  const run = (answers: Record<string, unknown>) =>
    auditor.rules.map((r) => r.check(answers)).filter((f): f is NonNullable<typeof f> => f !== null);
  const euRule = 'rm_eu_acceptability_not_afap';

  const alarpCost = {
    risk_acceptability_criteria: 'custom_criteria',
    acceptable_risk_threshold: 'Severity x probability index <= 6 is acceptable.',
    alarp_demonstration: 'Residual risks reduced ALARP; further controls were disproportionate in cost.',
  };

  it('raises a critical regulatory_alignment finding for an EU program stating ALARP or cost', () => {
    const f = run({ ...alarpCost, target_markets: ['eu'] }).find((x) => x.id === euRule);
    expect(f).toBeDefined();
    expect(f!.severity).toBe('critical');
    expect(f!.dimension).toBe('regulatory_alignment');
    expect(f!.reference).toMatch(/Annex I §2/);
    expect(f!.reference).toMatch(/Annex ZA/);
    expect(f!.reference).toMatch(/recall/);
    expect(f!.relatedFields).toEqual(expect.arrayContaining(['alarp_demonstration']));
  });

  it('flags a legacy ich_q9_alarp acceptability criterion for an EU program', () => {
    const f = run({
      target_markets: ['us', 'eu'],
      risk_acceptability_criteria: 'ich_q9_alarp',
      acceptable_risk_threshold: 'Defined in RMP-001.',
      alarp_demonstration: 'All risks reduced as far as possible.',
    }).find((x) => x.id === euRule);
    expect(f).toBeDefined();
    expect(f!.relatedFields).toContain('risk_acceptability_criteria');
  });

  it('does not raise the EU finding for a US-only program, or for clean AFAP text', () => {
    expect(run({ ...alarpCost, target_markets: ['us'] }).some((x) => x.id === euRule)).toBe(false);
    expect(
      run({
        target_markets: ['eu'],
        risk_acceptability_criteria: 'mdr_ivdr_afap',
        acceptable_risk_threshold: 'Defined in RMP-001.',
        alarp_demonstration: 'Risks reduced as far as possible without adversely affecting the benefit-risk ratio.',
      }).some((x) => x.id === euRule),
    ).toBe(false);
  });

  it('does not raise the EU device finding for a pharmaceutical programme, whose RMF is not under MDR/IVDR', () => {
    const answers = { ...alarpCost, target_markets: ['eu'], alarp_demonstration: 'Residual risks reduced ALARP per ICH Q9.' };
    expect(run({ ...answers, product_category: 'pharmaceutical' }).some((x) => x.id === euRule)).toBe(false);
    // Device categories, and an unanswered category, stay in scope.
    for (const product_category of ['medical_device', 'samd', 'combination_product', undefined]) {
      expect(run({ ...answers, product_category }).some((x) => x.id === euRule)).toBe(true);
    }
  });

  it('no auditor text says ALARP is central to EU MDR or justifies stopping on cost-benefit', () => {
    const blank = run({});
    const text = blank.map((f) => `${f.title} ${f.question} ${f.observation} ${f.requirement} ${f.recommendation}`).join('\n');
    expect(text).not.toMatch(/ALARP|reasonably practicable|cost-benefit/i);
    // The EU rule names ALARP as the thing it rejects; every other rule must not teach it.
    const titles = auditor.rules.filter((r) => r.id !== euRule).map((r) => `${r.title} ${r.question}`).join('\n');
    expect(titles).not.toMatch(/ALARP|reasonably practicable/i);
  });
});
