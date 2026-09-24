/**
 * AnA's declared plan and the turn's context_used record.
 *
 * The plan is the only source of a "Step 2 of 5" count, so the contract is
 * that nothing reaches the client that the server did not validate, and the
 * server never completes or invents a step. context_used may list only what
 * actually reached the model: an upload says whether its content or only its
 * name was given, and a memory read that failed is not "nothing matched".
 */
import { describe, it, expect, vi } from 'vitest';

const mem = vi.hoisted(() => ({
  project: vi.fn(async () => ({ entries: [] as Array<Record<string, unknown>>, totalCount: 0, query: '' })),
  client: vi.fn(async () => ({ entries: [] as Array<Record<string, unknown>>, totalCount: 0, query: '' })),
}));

vi.mock('../../working-memory', async importOriginal => {
  const original = await importOriginal<typeof import('../../working-memory')>();
  return {
    ...original,
    getLatestWorkingMemoryByThread: vi.fn(async () => null),
    searchWorkingMemorySemantic: vi.fn(async () => []),
  };
});
vi.mock('../../client-intelligence-memory', () => ({
  searchMemoryEntriesSemantic: mem.client,
  searchProjectMemoryEntriesSemantic: mem.project,
}));
vi.mock('../../../db', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) }, db: {} }));

import {
  handleUpdatePlan,
  normalizePlan,
  planEventFromToolResult,
  MAX_PLAN_STEPS,
  UPDATE_PLAN,
} from '../turn-plan';
import { buildContextUsedEvent, memoryStatusOf } from '../turn-context-used';
import { ALWAYS_ON_TOOLS, selectToolsForTurn } from '../tool-selection';
import { describeToolPlan } from '../agentic-loop';
import { buildMemoryContextForChat } from '../../memory-context-assembler';

const steps = (...s: Array<[string, string]>) => s.map(([title, status]) => ({ title, status }));

describe('update_plan validates and never invents', () => {
  it('normalises titles and keeps the declared order and statuses', () => {
    const out = normalizePlan({
      steps: steps(['  Read the   protocol synopsis ', 'completed'], ['Draft section 2.7.3', 'in_progress'], ['Check citations', 'pending']),
    });
    expect(out).toEqual([
      { title: 'Read the protocol synopsis', status: 'completed' },
      { title: 'Draft section 2.7.3', status: 'in_progress' },
      { title: 'Check citations', status: 'pending' },
    ]);
  });

  it.each([
    ['no steps', {}],
    ['an empty list', { steps: [] }],
    ['a step with no title', { steps: steps(['  ', 'pending']) }],
    ['an unknown status', { steps: steps(['Read', 'done']) }],
    ['duplicate titles', { steps: steps(['Read', 'pending'], ['read', 'completed']) }],
    ['more than the cap', { steps: Array.from({ length: MAX_PLAN_STEPS + 1 }, (_, i) => ({ title: `S${i}`, status: 'pending' })) }],
  ])('refuses %s', (_label, input) => {
    expect(() => normalizePlan(input as Record<string, unknown>)).toThrow();
  });

  it('clips an over-long title rather than overflowing the panel', () => {
    const [s] = normalizePlan({ steps: [{ title: 'x'.repeat(300), status: 'pending' }] });
    expect(s.title.length).toBe(100);
    expect(s.title.endsWith('…')).toBe(true);
  });

  it('the handler reports the plan as recorded, with no completion it was not given', async () => {
    const out = JSON.parse(await handleUpdatePlan({ steps: steps(['A', 'in_progress'], ['B', 'pending']) }));
    expect(out).toMatchObject({ ok: true, total: 2, completed: 0 });
  });
});

describe('the plan event is built from the validated result only', () => {
  const ok = JSON.stringify({ ok: true, steps: steps(['A', 'completed'], ['B', 'in_progress']) });

  it('emits for a successful update_plan call', () => {
    expect(planEventFromToolResult('update_plan', 'success', ok, 2)).toEqual({
      type: 'plan',
      round: 2,
      steps: [
        { title: 'A', status: 'completed' },
        { title: 'B', status: 'in_progress' },
      ],
    });
  });

  it.each([
    ['another tool', 'search_literature', 'success', ok],
    ['a failed call', 'update_plan', 'error', ok],
    ['a cancelled call', 'update_plan', 'cancelled', ok],
    ['a result that is not ok', 'update_plan', 'success', JSON.stringify({ ok: false, steps: [] })],
    ['an unparseable result', 'update_plan', 'success', 'not json'],
  ])('emits nothing for %s', (_l, name, status, result) => {
    expect(planEventFromToolResult(name, status, result, 1)).toBeNull();
  });
});

describe('update_plan is always offered and has a calm label', () => {
  it('survives relevance trimming', () => {
    expect(ALWAYS_ON_TOOLS.has('update_plan')).toBe(true);
    const many = Array.from({ length: 200 }, (_, i) => ({ name: `tool_${i}`, description: 'unrelated' }));
    const offered = selectToolsForTurn([...many, UPDATE_PLAN], 'draft the CSR', { maxTools: 20 });
    expect(offered.map((t: { name?: string }) => t.name)).toContain('update_plan');
  });

  it('names drafting and project search by what they act on', () => {
    const [d, q, bare] = describeToolPlan([
      { id: 'a', name: 'draft_authoring_document', input: { title: 'CSR synopsis' } },
      { id: 'b', name: 'project_knowledge_search', input: { query: 'estimand' } },
      { id: 'c', name: 'draft_authoring_document', input: {} },
    ]);
    expect(d.label).toBe('Drafting "CSR synopsis"');
    expect(q.label).toBe('Searching the project\'s documents for "estimand"');
    expect(bare.label).toBe('Drafting the document');
  });

  it('labels the step by its size, not as a raw tool name', () => {
    const [p] = describeToolPlan([{ id: 't', name: 'update_plan', input: { steps: [{}, {}, {}] } }]);
    expect(p.label).toBe('Updating the plan · 3 steps');
  });
});

describe('context_used states only what reached the model', () => {
  it('counts unresolved uploads and keeps the content/name distinction', () => {
    const ev = buildContextUsedEvent({
      requestedUploads: 3,
      uploads: [
        { fileId: 'f1', fileName: 'Protocol v3.pdf', mimeType: 'application/pdf', read: 'content' },
        { fileId: 'f2', fileName: 'SAP.docx', mimeType: 'application/vnd.openxmlformats', read: 'name_only' },
      ],
      memory: { memoryBlock: '', atoms: [], diagnostics: null },
    });
    expect(ev.unresolvedUploads).toBe(1);
    expect(ev.uploads.map(u => u.read)).toEqual(['content', 'name_only']);
  });

  it('a failed memory read is unavailable, never "none"', () => {
    expect(memoryStatusOf({ memoryBlock: '', atoms: [], diagnostics: null })).toBe('unavailable');
  });

  it('lists the memory items the assembler rendered, and drops what the budget cut', async () => {
    mem.project.mockResolvedValueOnce({
      entries: [
        { id: 1, title: 'Estimand decision', content: 'Treatment policy estimand agreed.', similarity: 0.9, sourceDocumentName: 'Type B minutes' },
        { id: 2, title: 'Stability arm', content: 'x'.repeat(390), similarity: 0.8 },
        { id: 3, title: 'Dissolution method', content: 'y'.repeat(390), similarity: 0.75 },
        { id: 4, title: 'Late item', content: 'z'.repeat(390), similarity: 0.7 },
      ],
      totalCount: 4,
      query: '',
    });
    const result = await buildMemoryContextForChat({
      threadId: 'thread_plan',
      organizationId: 9,
      projectId: 42,
      query: 'estimand',
      maxChars: 1000,
    });
    const titles = (result.read ?? []).map(r => r.title);
    expect(titles).toContain('Estimand decision');
    expect(result.read?.find(r => r.title === 'Estimand decision')?.documentName).toBe('Type B minutes');
    // The block is capped at 1000 characters; the fourth item's line starts
    // past that, so it did not reach the model and is not reported as read.
    expect(titles).not.toContain('Late item');
    expect(result.diagnostics.trimmed).toBe(true);
    expect(memoryStatusOf(result)).toBe('read');
  });
});
