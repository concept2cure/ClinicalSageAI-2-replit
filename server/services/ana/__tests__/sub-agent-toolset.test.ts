/**
 * What a sub-agent may be offered (row 74, S5b; brief T3 (b)-(d)).
 *
 * RESEARCH_TOOLS is listed by name. Each entry must be a registered handler the
 * register classes `read` and the launch inventory puts in scope, and the set
 * must never contain a tool that writes, calls a model, reads a file path, or
 * starts more work. A child's tools are that list intersected with what the
 * parent was offered: never more.
 */

import { describe, expect, it } from 'vitest';

import { getToolHandler } from '../AnaToolExecutor';
import { getAllEnabledTools } from '../AnaToolDefinitions';
import { toolAuthorizationOf } from '../tool-authorization';
import { CLASSIFIED_TOOLS, HIDDEN_APP_TOOLS } from '../ana-launch-scope';
import { RESEARCH_TOOLS, childToolsFrom } from '../sub-agent-limits';
import { HARNESS_CHECKS } from '../sub-agent-result';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const research: readonly string[] = RESEARCH_TOOLS;

describe('RESEARCH_TOOLS', () => {
  it.each(research)('%s is registered, classed read, and in launch scope', name => {
    expect(getToolHandler(name), 'registered').toBeTypeOf('function');
    expect(toolAuthorizationOf(name, {}).class, 'register class').toBe('read');
    expect(CLASSIFIED_TOOLS.has(name) && !HIDDEN_APP_TOOLS.has(name), 'launch inScope').toBe(true);
  });

  it.each(HARNESS_CHECKS)('harness check %s is registered, classed read, and in launch scope', name => {
    expect(getToolHandler(name)).toBeTypeOf('function');
    expect(toolAuthorizationOf(name, {}).class).toBe('read');
    expect(CLASSIFIED_TOOLS.has(name) && !HIDDEN_APP_TOOLS.has(name)).toBe(true);
  });

  it('never includes a tool that delegates, calls a model, checks for the agent, or reads a path', () => {
    const NEVER = [
      'run_agent',
      'start_deep_investigation',
      'check_deep_investigation',
      'explain_validation_findings',
      'plan_submission',
      'cross_region_gap_analysis',
      'dispatch_qc_check',
      'reconcile_dossier_numbers',
      'lookup_fda_guidance',
      'read_project_document',
      'rasterize_page',
      'pdf_overlay',
      'validate_cross_references',
      'validate_docx',
      'verify_docx_against_source',
      ...HARNESS_CHECKS,
    ];
    expect(research.filter(n => NEVER.includes(n))).toEqual([]);
  });

  it('no input of any child tool or check names a path, a directory or a folder', () => {
    const defs = new Map(getAllEnabledTools().map(t => [t.name, t]));
    const pathy: string[] = [];
    const walk = (tool: string, props: Record<string, any> | undefined, at: string) => {
      for (const [key, schema] of Object.entries(props ?? {})) {
        if (/path|dir|folder/i.test(key)) pathy.push(`${tool}.${at}${key}`);
        walk(tool, schema?.properties, `${at}${key}.`);
        walk(tool, schema?.items?.properties, `${at}${key}[].`);
      }
    };
    // Hosted (server-side) tools carry no input_schema; none is a child tool.
    const propsOf = (t: unknown) => (t as { input_schema?: { properties?: Record<string, any> } } | undefined)?.input_schema?.properties;
    for (const name of [...research, ...HARNESS_CHECKS]) walk(name, propsOf(defs.get(name)), '');
    expect(pathy).toEqual([]);
  });
});

describe('childToolsFrom', () => {
  const tool = (name: string) => ({ name, description: name, input_schema: { type: 'object' as const, properties: {} } });
  it('is the research tools the parent was offered, and nothing the parent was not', () => {
    const parent = ['search_literature', 'save_document_to_vault', 'run_agent', 'check_grounding', 'lookup_ich_guideline'].map(tool);
    expect(childToolsFrom(parent).map(t => t.name)).toEqual(['search_literature', 'lookup_ich_guideline']);
  });
  it('a tool the tenant denied (absent from the parent set) is absent from the child set', () => {
    expect(childToolsFrom([tool('search_literature')]).map(t => t.name)).not.toContain('search_drug_adverse_events');
  });
});

describe('run_agent itself', () => {
  it('is registered under RUN_AGENT_TOOL, the name the run policy and the toolset read', async () => {
    const { RUN_AGENT_TOOL } = await import('@shared/ana/run-control-limits');
    expect(getToolHandler(RUN_AGENT_TOOL)).toBeTypeOf('function');
    expect(toolAuthorizationOf(RUN_AGENT_TOOL, {}).class).toBe('self');
  });
});

describe('source pins', () => {
  const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
  it('the child never reads the tenant policy, the full tool list or a model override', () => {
    for (const f of ['sub-agent.ts', 'sub-agent-limits.ts', 'sub-agent-shape.ts']) {
      expect(src(f)).not.toMatch(/governedToolsetFor|loadAnaToolPolicy|getAllEnabledTools|model_override|resolvedOverride/);
    }
  });
  it('the host carries no provider or model', () => {
    const host = /export interface SubAgentHost \{([\s\S]*?)\n\}/.exec(src('sub-agent.ts'))?.[1] ?? '';
    expect(host).not.toBe('');
    expect(host).not.toMatch(/^\s*(provider|model)\??:/m);
  });
});
