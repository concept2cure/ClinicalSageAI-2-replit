/**
 * AnA's regulatory knowledge tools are wired: offered, handled, classed read,
 * in launch scope, labelled, and reported as deterministic (D2, 2026-10-04,
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04/).
 *
 * A tool is reachable only when every shared register names it, and a partial
 * wiring fails quietly in a different way each time (authoring-read-
 * registration.test.ts, whose shape this follows): not offered, "unknown
 * tool", every read asking for a confirmation, hidden by launch scope, a
 * humanised name in the plan, or "model_assisted" pedigree on an answer no
 * model wrote.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler } from '../AnaToolExecutor';
import { toolAuthorizationOf } from '../tool-authorization';
import { describeToolPlan } from '../agentic-loop';
import { getToolPedigree } from '../tool-pedigree';
import { buildAnaRISystemPrompt } from '../../ana-ri/persona';

const NAMES = ['get_document_section_requirements', 'plan_submission_from_database_lock', 'list_fda_technical_rules'] as const;

describe('the regulatory knowledge tools are wired', () => {
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
      const [step] = describeToolPlan([{ id: `call-${n}`, name: n, input: {} }] as never);
      const label = step.label;
      expect(label, n).toBeTruthy();
      expect(label.toLowerCase(), n).not.toContain(n.replace(/_/g, ' '));
    }
  });

  it('report deterministic pedigree: the registry lookups as registry, the Vault read as a query', () => {
    expect(getToolPedigree('get_document_section_requirements').pedigree).toBe('deterministic_registry');
    expect(getToolPedigree('list_fda_technical_rules').pedigree).toBe('deterministic_registry');
    expect(getToolPedigree('plan_submission_from_database_lock').pedigree).toBe('deterministic_query');
  });

  // A tool the model is never told to reach for is selected only by lexical
  // luck; the drafting steps used to say "requirements from your training".
  it('are named in the prompt AnA drafts and audits under, and Elsa is never promised', () => {
    const prompt = buildAnaRISystemPrompt();
    for (const n of NAMES) expect(prompt, n).toContain(n);
    expect(prompt).not.toMatch(/requirements from your training/);
    expect(prompt).toMatch(/never promise that a submission will pass it/);
  });
});
