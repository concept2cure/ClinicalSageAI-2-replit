/**
 * A war game audits the interview it is given, and nothing else (D2, 2026-10-22).
 *
 * `runWarGame(category, sourceFlowId, answers)` runs a category's auditor over
 * the answers to that category's question flow. Measured at bc2e3a4a3 before
 * the change, most auditors read answer keys their own flow never asks. The
 * NDA auditor read 42 keys, and 9 of them exist in any flow: it read
 * `application_type`, `cover_letter` and `integrated_summary_safety`, but the
 * NDA interview asks `nda_type` and has no such fields. So on a FULLY answered
 * NDA interview the war game reported "missing" criticals, such as a cover
 * letter or an ISS, about things the client was never asked, and scored the
 * filing on them. The rules that test a value never fired at all. That is a
 * fabricated finding and a fabricated pass (CLAUDE.md working agreement:
 * fail closed, never fabricate).
 *
 * The engine now records which answers each rule reads. A rule that reads a
 * field its source interview does not ask is reported as NOT ASSESSED. It
 * produces no finding and no score, and the report says how many checks
 * could not be assessed from this interview.
 */
import { describe, it, expect } from 'vitest';
import { runWarGame } from '../../server/services/ana/intelligence-questions/war-game/engine';
import { getFlowDefinition } from '../../server/services/ana/intelligence-questions/flows/index';
import type { WarGameCategory } from '../../server/services/ana/intelligence-questions/war-game/types';
import type { FlowCategory, FlowDefinition, QuestionField } from '../../shared/types/intelligence-questions';

const SOURCE_FLOW: Record<WarGameCategory, FlowCategory> = {
  protocol: 'protocol_development', ind: 'ind_submission', csr: 'csr_report', '510k': 'device_510k',
  cer: 'cer_report', sop: 'sop_development', nda: 'nda_submission', bla: 'bla_submission',
  pma: 'device_pma', cmc: 'cmc_specification', risk_management: 'risk_management',
  safety_narrative: 'safety_narrative', labeling: 'labeling', briefing_book: 'briefing_book',
  stability: 'stability_study',
};

function answerFor(f: QuestionField): unknown {
  const first = f.options?.[0]?.value;
  switch (f.type) {
    case 'select': case 'radio': case 'country_select': case 'agency_select': return first ?? 'provided';
    case 'multi_select': return first ? [first] : ['provided'];
    case 'number': return f.validation?.min ?? 1;
    case 'yes_no': case 'checkbox': return true;
    case 'date': return '2026-01-01';
    default: return 'Provided in the submission.';
  }
}

/** Every field of the interview answered. */
function fullyAnswered(flow: FlowDefinition): Record<string, Record<string, unknown>> {
  return Object.fromEntries(flow.nodes.map((n) => [n.id, Object.fromEntries(n.fields.map((f) => [f.id, answerFor(f)]))]));
}

const CASES = (Object.keys(SOURCE_FLOW) as WarGameCategory[]).map((category) => {
  const flow = getFlowDefinition(SOURCE_FLOW[category], {} as never)!;
  const asked = new Set(flow.nodes.flatMap((n) => n.fields.map((f) => f.id)));
  return { category, flow, asked };
});

describe('a war game finds only what its interview could have told it', () => {
  it.each(CASES.map((c) => [c.category, c] as const))('%s: no finding on a fully answered interview rests on a field the interview never asks', (_c, { category, flow, asked }) => {
    const report = runWarGame(category, flow.id, fullyAnswered(flow));
    const invented = report.findings
      .filter((f) => f.relatedFields.some((field) => !asked.has(field)))
      .map((f) => `${f.id}: ${f.relatedFields.filter((field) => !asked.has(field)).join(', ')}`);
    expect(invented).toEqual([]);
  });

  it('the NDA war game says which checks it could not assess, and why', () => {
    const { flow } = CASES.find((c) => c.category === 'nda')!;
    const report = runWarGame('nda', flow.id, fullyAnswered(flow));
    expect(report.notAssessed.length).toBeGreaterThan(0);
    expect(report.notAssessed.every((n) => n.unaskedFields.length > 0)).toBe(true);
    expect(report.executiveSummary).toMatch(/could not be assessed/);
    expect(report.rulesAssessed + report.notAssessed.length).toBe(report.rulesTotal);
  });

  it('an unknown source flow is said, not assumed', () => {
    const report = runWarGame('nda', 'no-such-flow', {});
    expect(report.executiveSummary).toMatch(/source interview/i);
  });
});

/*
 * How much of each auditor its interview can feed. Measured after the engine
 * change at bc2e3a4a3+: 94 of 435 rules were assessable. The floor may only
 * rise. Converging an auditor onto its interview's real field ids raises it;
 * a rule left below it means its interview does not ask what it checks.
 */
/* 2026-10-22, after converging the auditors onto their interviews' real field
   ids: 299 of 435 (from 94). The rest read questions no interview asks. */
const MIN_ASSESSED: Record<WarGameCategory, number> = {
  protocol: 22, ind: 22, csr: 21, '510k': 24, cer: 22, sop: 23, nda: 15, bla: 33,
  pma: 22, cmc: 15, risk_management: 17, safety_narrative: 14, labeling: 17, briefing_book: 11, stability: 21,
};

describe('assessable checks only rise', () => {
  it.each(CASES.map((c) => [c.category, c] as const))('%s', (_c, { category, flow }) => {
    expect(runWarGame(category, flow.id, {}).rulesAssessed).toBeGreaterThanOrEqual(MIN_ASSESSED[category]);
  });
});

describe('a yes/no answer means the same from the interview UI and from AnA', () => {
  it.each(CASES.map((c) => [c.category, c] as const))('%s: "yes"/"no" strings and booleans give the same findings', (_c, { category, flow }) => {
    const asBool = fullyAnswered(flow);
    const asText = Object.fromEntries(Object.entries(asBool).map(([node, fields]) => [node, Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 'yes' : 'no') : v]))]));
    const ids = (r: ReturnType<typeof runWarGame>) => r.findings.map((f) => f.id).sort();
    expect(ids(runWarGame(category, flow.id, asText))).toEqual(ids(runWarGame(category, flow.id, asBool)));
  });
});

/* Rules that fired, or stayed silent, against the answers given. Measured on
   the pre-change tree: the NDA, protocol and yes/no cases fail there; the
   510(k) case passes there too and pins the new is_sterile gate. */
describe('a converged rule fires on the case it names, and only then', () => {
  const ids = (category: WarGameCategory, flowCase: FlowCategory, answers: Record<string, unknown>) =>
    runWarGame(category, getFlowDefinition(flowCase, {} as never)!.id, { n: answers }).findings.map((f) => f.id);

  it('NDA: patent certifications are asked of a 505(b)(2), not a 505(b)(1)', () => {
    expect(ids('nda', 'nda_submission', { nda_type: '505b1' })).not.toContain('nda_missing_patent_certifications');
    expect(ids('nda', 'nda_submission', { nda_type: '505b2' })).toContain('nda_missing_patent_certifications');
    expect(ids('nda', 'nda_submission', { nda_type: '505b2', patent_certifications: 'not_applicable' })).not.toContain('nda_missing_patent_certifications');
  });

  it('protocol: a single arm against a historical control is not a contradiction', () => {
    expect(ids('protocol', 'protocol_development', { number_of_arms: 1, control_type: 'historical' })).not.toContain('protocol_arms_vs_control');
    expect(ids('protocol', 'protocol_development', { number_of_arms: 1, control_type: 'placebo' })).toContain('protocol_arms_vs_control');
  });

  it('510(k): a non-sterile device is not missing its sterilization validation', () => {
    expect(ids('510k', 'device_510k', { is_sterile: false })).not.toContain('510k_sterilization_missing');
  });

  it('a "No" to a required yes/no draws its finding (it read as answered before)', () => {
    expect(ids('nda', 'nda_submission', { cover_letter_prepared: false })).toContain('nda_missing_cover_letter');
    expect(ids('nda', 'nda_submission', { cover_letter_prepared: 'yes' })).not.toContain('nda_missing_cover_letter');
  });
});
