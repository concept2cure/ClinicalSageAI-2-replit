/**
 * A turn about a Module 2 summary is high-stakes because of what is open, not
 * because of how it is worded (MC-RL-3, AnA reasoning round 7, 2026-10-05).
 *
 * The live turn's risk tier came from the message's words alone: the intent
 * lens (a keyword vote, where "check" counts as audit) or the governed-draft
 * phrasing. "can you check my calendar" was high-stakes. "What SAE rate does
 * this section report?" with the Summary of Clinical Safety open was not: the
 * standard model, not approved for high-risk work, answered it without
 * extended thinking. The open section is a deterministic signal the route
 * already holds.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { HIGH_STAKES_SECTION_ROOTS, planKernelExecution, type KernelRoutingInput } from '../kernel-router';
import { resolveSectionBriefSource } from '../ind/ctd/section-brief';

/** The stream's call for a plainly worded question. */
const plan = (extra: Partial<KernelRoutingInput> & Record<string, unknown> = {}) =>
  planKernelExecution({ route: '/api/ana-ri/stream', messageLength: 59, intentLens: 'general', intentConfidence: 0.9, ...extra } as KernelRoutingInput);

describe('the open section raises the tier', () => {
  it.each([
    ['2.7.4', 'Summary of Clinical Safety'],
    ['m2.5.5', 'Overview of Safety'],
    ['2.6.6', 'Toxicology Written Summary'],
    ['2.3.P.8', 'QOS, drug product stability'],
    ['2.4', 'Nonclinical Overview'],
    ['5.3.5.3', 'integrated analyses (ISS/ISE)'],
  ])('%s (%s) is high-stakes, and the plan says why', (sectionCode) => {
    expect(plan().riskTier).toBe('medium');
    const p = plan({ openSectionCode: sectionCode });
    expect(p.riskTier).toBe('high');
    expect(p.decisionRationale).toMatch(/Open section .* approved model required/);
  });
});

describe('what it may not do', () => {
  it.each([
    ['no section', undefined],
    ['Module 3 manufacture', '3.2.P.3'],
    ['regional Module 1 (labeling in the US, contact details in an EU 1.3.1)', '1.14.1'],
    ['the CTD table of contents', '2.1'],
    ['an individual study report', '5.3.5.1'],
    ['a code that only begins like a listed one', '2.30'],
    ['a CSR heading, not a CTD code', '12.2'],
    ['a list', ['2.7.4']],
    ['a number', 27.4],
    ['an object', { sectionCode: '2.7.4' }],
    ['an overlong string', `2.7.4${' '.repeat(80)}`],
  ])('leaves the tier alone for %s', (_label, openSectionCode) => {
    expect(plan({ openSectionCode }).riskTier).toBe('medium');
  });

  it('never lowers a tier the words already raised', () => {
    expect(plan({ intentLens: 'audit', openSectionCode: '3.2.P.3' }).riskTier).toBe('high');
    expect(plan({ requestsGovernedDraft: true }).riskTier).toBe('high');
    expect(plan({ intentLens: 'risk', openSectionCode: '2.7.4' }).riskTier).toBe('high');
  });

  it('changes the tier and nothing else', () => {
    const without = plan();
    const withSection = plan({ openSectionCode: '2.7.4' });
    for (const k of ['taskType', 'strategy', 'temperature', 'maxTokens'] as const) expect(withSection[k]).toEqual(without[k]);
  });

  it('every listed root is a section the canonical CTD overlay knows', () => {
    expect(HIGH_STAKES_SECTION_ROOTS.length).toBeGreaterThan(0);
    for (const root of HIGH_STAKES_SECTION_ROOTS) expect(resolveSectionBriefSource(root), root).not.toBeNull();
  });

  it("the stream reads no tool cap the tier derives: a high-stakes section must not cost a turn its steps", () => {
    const stream = readFileSync(fileURLToPath(new URL('../../routes/ana-ri/stream.ts', import.meta.url)), 'utf8');
    expect(stream).not.toMatch(/routingPlan\.(allowToolExecution|maxToolCalls|maxToolChainDepth)/);
  });
});
