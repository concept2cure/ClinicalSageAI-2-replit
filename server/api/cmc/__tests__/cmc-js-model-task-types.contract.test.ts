/**
 * Every model call in the JS drafting modules declares the task it performs.
 *
 * These modules called `ai.chat({ model: 'gpt-4o', ... })` with no task type,
 * which the unified client sends as 'general' — a task the gateway's high-risk
 * approval check never applies to — so an unapproved model drafted Module 3
 * content, regional submission rewrites, validation protocols and IND sections
 * (classified 2026-09-23, docs/evidence/MODEL-GOVERNANCE/2026-09-23/). The pins
 * are kept out by scripts/ci/check-unapproved-model-pins.mjs; this pins the
 * other half: each call names a task, and the drafting and review calls name
 * the high-risk ones, so dropping a taskType cannot silently reopen the path.
 *
 * Source-level on purpose: the modules write to disk and read Supabase, and the
 * property under test is the request each call makes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');

/** The object literal passed to each `ai.chat({`, up to its `messages` key. */
function chatCallHeads(rel: string): string[] {
  const src = readFileSync(path.join(ROOT, rel), 'utf8');
  const heads: string[] = [];
  const re = /ai\.chat\(\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const rest = src.slice(m.index, m.index + 600);
    heads.push(rest.slice(0, rest.indexOf('messages')));
  }
  return heads;
}

const taskOf = (head: string) => head.match(/taskType:\s*'([a-z_]+)'/)?.[1] ?? null;

const EXPECTED: Record<string, string[]> = {
  'server/api/cmc/global-compliance.js': [
    'document_drafting',
    'regulatory_review',
    'document_drafting',
    'document_analysis',
    'regulatory_review',
    'regulatory_review',
  ],
  'server/api/cmc/preclinical-translator.js': [
    'document_drafting',
    'document_drafting',
    'document_drafting',
    'document_drafting',
    'document_analysis',
    'document_drafting',
  ],
  'server/api/cmc/change-impact-simulator.js': ['regulatory_review', 'regulatory_review'],
  'server/utils/document-generator.js': ['document_drafting'],
  'server/services/indCopilot.js': [
    'structured_output',
    'regulatory_review',
    'document_drafting',
    'document_drafting',
    'regulatory_review',
    'document_drafting',
    'regulatory_review',
  ],
};

describe.each(Object.entries(EXPECTED))('%s', (rel, expected) => {
  const heads = chatCallHeads(rel);

  it('declares the expected task on every model call, in order', () => {
    expect(heads.map(taskOf)).toEqual(expected);
  });

  it('pins no model by literal', () => {
    for (const h of heads) expect(h).not.toMatch(/model:\s*['"`]/);
  });
});

describe('indCopilot records the model that served', () => {
  const src = readFileSync(path.join(ROOT, 'server/services/indCopilot.js'), 'utf8');

  it('the generation event and the response carry aiResult.model, not a default', () => {
    expect(src).not.toMatch(/model:\s*options\.model\s*\|\|/);
    expect(src.match(/model: aiResult\.model/g)?.length).toBe(3);
  });
});
