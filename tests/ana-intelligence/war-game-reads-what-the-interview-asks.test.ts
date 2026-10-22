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
const MIN_ASSESSED: Record<WarGameCategory, number> = {
  protocol: 11, ind: 6, csr: 5, '510k': 8, cer: 2, sop: 4, nda: 4, bla: 33,
  pma: 3, cmc: 2, risk_management: 3, safety_narrative: 4, labeling: 2, briefing_book: 3, stability: 4,
};

describe('assessable checks only rise', () => {
  it.each(CASES.map((c) => [c.category, c] as const))('%s', (_c, { category, flow }) => {
    expect(runWarGame(category, flow.id, {}).rulesAssessed).toBeGreaterThanOrEqual(MIN_ASSESSED[category]);
  });
});
