/**
 * Rule 2 S7 (2026-11-09): `assess_benefit_risk` is retired onto `assess_benefit_risk_balance`.
 *
 * Two AnA tools answered the same question: is this product's benefit-risk balance favourable? The duplicate,
 * `assess_benefit_risk` (`deepeningTools.ts`, engine `regulatory/benefit-risk.ts`, whose only caller it was), is
 * deleted. The one that stays is `assess_benefit_risk_balance` (`benefitRiskTools.ts`, engine
 * `benefit-risk/benefit-risk-knowledge.ts`), reached through the same executor. MCDA swing weights are
 * `design_value_tree`'s.
 *
 * This pins the retirement: the tool, its handler, its authorization entry, its launch-scope entry and its engine
 * are gone; the replacement is defined, registered and computes; and requests the old tool was offered for still
 * offer the replacement within the selector's 50.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, type Mock } from 'vitest';
import { mockPool } from '../../../../tests/setup';

// As deepening-tools.test.ts: the executor's graph instruments the shared pool, so its client answers empty rows.
(mockPool.connect as unknown as Mock).mockResolvedValue({
  query: () => Promise.resolve({ rows: [], rowCount: 0 }),
  release: () => undefined,
});
const { ALL_ANA_TOOLS } = await import('../AnaToolDefinitions.js');
const { getToolHandler } = await import('../AnaToolExecutor.js');
const { selectToolsForTurn } = await import('../tool-selection.js');

const names = ALL_ANA_TOOLS.map((t) => t.name);
const read = (rel: string): string => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('assess_benefit_risk is retired onto assess_benefit_risk_balance', () => {
  it('is no longer defined, registered, authorised or in the launch scope', () => {
    expect(names).not.toContain('assess_benefit_risk');
    expect(getToolHandler('assess_benefit_risk')).toBeUndefined();
    expect(Object.keys(JSON.parse(read('../tool-authorization.register.json')))).not.toContain('assess_benefit_risk');
    expect(read('../ana-launch-scope.inventory.json')).not.toMatch(/"assess_benefit_risk"/);
  });

  it('its engine, which had no other caller, is gone', () => {
    expect(fs.existsSync(fileURLToPath(new URL('../../regulatory/benefit-risk.ts', import.meta.url)))).toBe(false);
  });

  it('the replacement is defined and registered', () => {
    expect(names).toContain('assess_benefit_risk_balance');
    expect(typeof getToolHandler('assess_benefit_risk_balance')).toBe('function');
  });

  it('the replacement computes a balance from stated benefits and risks', async () => {
    const out = JSON.parse(await getToolHandler('assess_benefit_risk_balance')!({
      productName: 'P',
      indication: 'I',
      conditionSeverity: 'serious',
      unmetMedicalNeed: false,
      benefits: [{ name: 'Overall survival', magnitude: 'high', endpointType: 'mortality', uncertainty: 'low' }],
      risks: [{ name: 'Neutropenia', severity: 'moderate', reversibility: 'fully_reversible', frequency: 'common', uncertainty: 'low', mitigated: true }],
    }));
    expect(out.status).toBe('computed');
    expect(out.result.verdict).toEqual(expect.any(String));
  });

  it.each([
    'run a structured benefit-risk assessment weighing the benefits against the risks',
    'BRAT weighted benefit risk score with an importance weight for each benefit and risk',
    'compute the net benefit and favorability from weighted benefits and risks',
    'structured benefit-risk decision aid for the clinical overview 2.5.6',
  ])('"%s" still offers the replacement', (prompt) => {
    const offered = selectToolsForTurn(ALL_ANA_TOOLS, prompt, { maxTools: 50 }).map((t) => t.name);
    expect(offered).toContain('assess_benefit_risk_balance');
    expect(offered).not.toContain('assess_benefit_risk');
  });
});
