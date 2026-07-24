/**
 * Tests — convene_drafting_council wiring: tool definition, executor handler
 * registration, transparency label, pedigree classification, and the
 * provisioning migration's idempotency guarantees (static-text guard, same
 * pattern as the doctrine guard).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, it, expect } from 'vitest';

import { getAllEnabledTools } from '../AnaToolDefinitions.js';
import { getToolHandler } from '../AnaToolExecutor.js';
import { describeToolPlan } from '../agentic-loop.js';
import { getToolPedigree } from '../tool-pedigree.js';

describe('convene_drafting_council — tool definition', () => {
  const tool = getAllEnabledTools().find(t => t.name === 'convene_drafting_council');

  it('is registered in the enabled tool set', () => {
    expect(tool).toBeDefined();
  });

  it('requires section_path and offers requirements + context', () => {
    const schema = (tool as any).input_schema;
    expect(schema.required).toEqual(['section_path']);
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['section_path', 'requirements', 'context']),
    );
  });

  it('tells the model when to use it — and when not to', () => {
    const desc = (tool as any).description as string;
    expect(desc).toContain('HIGH-ASSURANCE');
    expect(desc).toMatch(/for a quick ordinary draft, use the normal drafting tools/i);
    expect(desc).toContain('Nothing is auto-saved');
  });
});

describe('convene_drafting_council — executor handler', () => {
  it('has a registered handler', () => {
    expect(getToolHandler('convene_drafting_council')).toBeTypeOf('function');
  });

  it('rejects a missing section_path without touching the database', async () => {
    const handler = getToolHandler('convene_drafting_council')!;
    const result = JSON.parse(await handler({}, {}));
    expect(result.error).toContain('section_path is required');
  });
});

describe('convene_drafting_council — transparency + pedigree', () => {
  it('gets a calm, input-aware step label', () => {
    const [step] = describeToolPlan([
      { id: '1', name: 'convene_drafting_council', input: { section_path: '2.5' } },
    ]);
    expect(step.label).toBe('Convening the drafting council for "2.5" — draft, verify, critique, synthesize');
  });

  it('classifies as model_assisted (LLM pipeline output — verify before relying)', () => {
    expect(getToolPedigree('convene_drafting_council').pedigree).toBe('model_assisted');
  });
});

describe('council provisioning migration — idempotency guard', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../../migrations/20260724_lumen_council_provisioning.sql'),
    'utf8',
  );

  it('creates the schema and every table the council service queries, idempotently', () => {
    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS lumen');
    for (const table of [
      'lumen.agent_registry',
      'lumen.council_sessions',
      'lumen.agent_executions',
      'lumen.data_verifications',
      'lumen.data_atoms',
      'lumen.data_bindings',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it('seeds all four council roles conflict-safely', () => {
    for (const role of ['DRAFTER', 'STATISTICIAN', 'CRITIC', 'SYNTHESIZER']) {
      expect(sql).toContain(`'${role}'`);
    }
    expect(sql).toContain('ON CONFLICT (agent_code) DO NOTHING');
  });

  it('seeds every placeholder each agent template is rendered with', () => {
    for (const placeholder of [
      '{{section_path}}',
      '{{requirements}}',
      '{{context_documents}}',
      '{{draft_text}}',
      '{{data_bindings}}',
      '{{statistician_report}}',
      '{{statistician_corrections}}',
      '{{critic_feedback}}',
    ]) {
      expect(sql).toContain(placeholder);
    }
  });

  it('is wired into the standard apply script', () => {
    const script = readFileSync(
      resolve(__dirname, '../../../../scripts/db/apply-c2c-migrations.mjs'),
      'utf8',
    );
    expect(script).toContain('20260724_lumen_council_provisioning.sql');
  });
});
