/**
 * AnA's CMC knowledge tools are wired: offered, handled, classed read, in
 * launch scope, labelled, reported as deterministic, and named in the prompt
 * she works under (CMC/Module 3 lane, 2026-10-04,
 * docs/evidence/CMC-M3-GA/2026-10-04/03-cmc-knowledge/). The shape follows
 * regulatory-knowledge-registration.test.ts: a partial wiring fails quietly
 * in a different way each time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { getToolHandler } from '../AnaToolExecutor';
import { toolAuthorizationOf } from '../tool-authorization';
import { describeToolPlan } from '../agentic-loop';
import { getToolPedigree } from '../tool-pedigree';
import { buildAnaRISystemPrompt } from '../../ana-ri/persona';

const NAMES = ['find_cmc_guidance', 'get_cmc_requirements', 'explain_cmc_topic'] as const;

describe('the CMC knowledge tools are wired', () => {
  it('are offered to the model', () => {
    const offered = new Set(ALL_ANA_TOOLS.map((t) => t.name));
    for (const n of NAMES) expect(offered.has(n), n).toBe(true);
  });

  it('have a handler', () => {
    for (const n of NAMES) expect(typeof getToolHandler(n), n).toBe('function');
  });

  it('are classed read, so a read never asks the person to confirm', () => {
    for (const n of NAMES) expect(toolAuthorizationOf(n, {}).class, n).toBe('read');
  });

  it('are in launch scope', () => {
    const inv = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'ana-launch-scope.inventory.json'), 'utf8'),
    ) as { tools: { inScope: string[] } };
    for (const n of NAMES) expect(inv.tools.inScope, n).toContain(n);
  });

  it('have a plan label of their own, not a humanised tool name', () => {
    for (const n of NAMES) {
      const [step] = describeToolPlan([{ id: `call-${n}`, name: n, input: { query: 'Q5A' } }] as never);
      expect(step.label, n).toBeTruthy();
      expect(step.label.toLowerCase(), n).not.toContain(n.replace(/_/g, ' '));
    }
  });

  it('report deterministic registry pedigree: no model wrote these answers', () => {
    for (const n of NAMES) expect(getToolPedigree(n).pedigree, n).toBe('deterministic_registry');
  });

  it('are named in the prompt AnA works under, which tells her not to supply requirements from memory', () => {
    const prompt = buildAnaRISystemPrompt();
    for (const n of NAMES) expect(prompt, n).toContain(n);
    expect(prompt).toMatch(/do not supply the requirement from memory/);
  });
});
