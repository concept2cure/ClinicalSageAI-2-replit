/**
 * Tests — working-memory pure logic: the semantic-embed gate (the safety
 * decision behind flipping ENABLE_SEMANTIC_WORKING_MEMORY on), the flag reader,
 * the summary prompt + render helpers, and the embeddings migration guard.
 * No database is touched.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, it, expect, afterEach } from 'vitest';

import {
  shouldEmbedWorkingMemory,
  isSemanticWorkingMemoryEnabled,
  buildWorkingMemoryPrompt,
  formatWorkingMemoryForPrompt,
  type WorkingMemory,
} from '../working-memory.js';

describe('shouldEmbedWorkingMemory — safe-to-flip gate', () => {
  it('embeds only when the feature is on AND the column exists', () => {
    expect(shouldEmbedWorkingMemory(true, true)).toBe(true);
  });

  it('never embeds when the embedding column is absent — even with the flag on', () => {
    // This is the footgun guard: flag on before the migration must NOT append
    // the embedding column (which would throw and lose the write).
    expect(shouldEmbedWorkingMemory(true, false)).toBe(false);
  });

  it('never embeds when the feature is off', () => {
    expect(shouldEmbedWorkingMemory(false, true)).toBe(false);
    expect(shouldEmbedWorkingMemory(false, false)).toBe(false);
  });
});

describe('isSemanticWorkingMemoryEnabled — flag reader', () => {
  const original = process.env.ENABLE_SEMANTIC_WORKING_MEMORY;
  afterEach(() => {
    if (original === undefined) delete process.env.ENABLE_SEMANTIC_WORKING_MEMORY;
    else process.env.ENABLE_SEMANTIC_WORKING_MEMORY = original;
  });

  it('is off by default and only true for the exact string "true"', () => {
    delete process.env.ENABLE_SEMANTIC_WORKING_MEMORY;
    expect(isSemanticWorkingMemoryEnabled()).toBe(false);
    process.env.ENABLE_SEMANTIC_WORKING_MEMORY = 'TRUE';
    expect(isSemanticWorkingMemoryEnabled()).toBe(false);
    process.env.ENABLE_SEMANTIC_WORKING_MEMORY = '1';
    expect(isSemanticWorkingMemoryEnabled()).toBe(false);
    process.env.ENABLE_SEMANTIC_WORKING_MEMORY = 'true';
    expect(isSemanticWorkingMemoryEnabled()).toBe(true);
  });
});

describe('buildWorkingMemoryPrompt', () => {
  const messages = [
    { role: 'user', content: 'Draft the 2.5 clinical overview.' },
    { role: 'assistant', content: 'Here is a first pass...' },
  ];

  it('embeds the conversation and asks for the exact JSON shape', () => {
    const prompt = buildWorkingMemoryPrompt(messages);
    expect(prompt).toContain('[user]: Draft the 2.5 clinical overview.');
    expect(prompt).toContain('[assistant]: Here is a first pass...');
    for (const key of ['objective', 'lockedFacts', 'decisions', 'openQuestions', 'nextActions', 'createdArtifacts', 'exclusions']) {
      expect(prompt).toContain(`"${key}"`);
    }
  });

  it('folds a previous summary in for incremental update', () => {
    const prompt = buildWorkingMemoryPrompt(messages, 'Previously: predicate is K123456.');
    expect(prompt).toContain('Previous working memory summary');
    expect(prompt).toContain('K123456');
    expect(prompt).toContain('updating any outdated information');
  });
});

describe('formatWorkingMemoryForPrompt', () => {
  const base: WorkingMemory = {
    conversationId: 1,
    organizationId: 1,
    summary: 'x',
    messageCountAtGeneration: 20,
    generatedAt: '2026-07-24T00:00:00Z',
    structured: {
      objective: 'Get the IND filed by Q4.',
      lockedFacts: ['Predicate is K123456'],
      decisions: ['Go 505(b)(2)'],
      openQuestions: [],
      nextActions: ['Draft 2.5'],
      createdArtifacts: [],
      exclusions: [],
    },
  };

  it('always renders the objective and only the non-empty sections', () => {
    const out = formatWorkingMemoryForPrompt(base);
    expect(out).toContain('**Objective**: Get the IND filed by Q4.');
    expect(out).toContain('**Locked Facts**:');
    expect(out).toContain('- Predicate is K123456');
    expect(out).toContain('**Decisions Made**:');
    expect(out).toContain('**Next Actions**:');
    // Empty sections are omitted entirely.
    expect(out).not.toContain('**Open Questions**');
    expect(out).not.toContain('**Created Artifacts**');
    expect(out).not.toContain('**Deferred/Excluded**');
  });
});

describe('working-memory embeddings migration — guard', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../migrations/20260602_working_memory_embeddings.sql'),
    'utf8',
  );

  it('is idempotent and additive (pgvector + nullable embedding column)', () => {
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS embedding vector\(1536\)/);
  });
});
