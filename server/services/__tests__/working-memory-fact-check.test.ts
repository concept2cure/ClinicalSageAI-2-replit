/**
 * The thread write-back keeps only what a checked answer found (FV-missed, AnA
 * reasoning round 8, 2026-10-05).
 *
 * The real write-back, with the pool, the summarizer's model call and the
 * thread read replaced at their seams. What reaches the row — the rendered
 * summary every later turn reads and the structured fields the consolidation
 * job promotes — is what the round is about.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { checkAnswer } from '../ana/answer-grounding';

const state = {
  /** What the summarizer model writes. */
  summary: {} as unknown,
  /** The thread's stored messages, or an error the read throws. */
  thread: [] as Array<{ role: string; content: string; metadata?: unknown }> | Error,
  threadReads: 0,
  gatewayCalls: 0,
  inserts: [] as unknown[][],
};

vi.mock('../../db', () => ({
  pool: {
    query: async (sql: string, values?: unknown[]) => {
      if (sql.includes('INSERT INTO conversation_working_memory')) state.inserts.push(values ?? []);
      if (sql.includes('information_schema.columns')) return { rows: [{ '?column?': 1 }] };
      return { rows: [] };
    },
  },
}));
vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));
vi.mock('../ai-gateway/gateway.js', () => ({
  getGateway: () => ({
    route: async () => {
      state.gatewayCalls++;
      return { content: JSON.stringify(state.summary) };
    },
  }),
}));
vi.mock('../chat-thread-helpers.js', () => ({
  getThreadMessages: async () => {
    state.threadReads++;
    if (state.thread instanceof Error) throw state.thread;
    return state.thread;
  },
}));

const SEARCH = (content: unknown) => ({ source: 'tool:search_clinical_evidence', content: JSON.stringify(content) });
const ANSWER = 'In NCT01234567 the objective response rate was 45% across 212 patients.';
/** The answer as the stream stored it: its text and its check against what it consulted. */
const STORED = {
  role: 'assistant',
  content: ANSWER,
  metadata: { verification: { check: checkAnswer(ANSWER, [SEARCH({ studies: [{ nctId: 'NCT01234567', orr: '31%', enrolled: 212 }] })]), labels: {} } },
};
const SUMMARY = {
  objective: 'Summarise the pivotal study',
  lockedFacts: ['212 patients were enrolled in NCT01234567', 'The ORR in NCT01234567 was 45%'],
  decisions: ['Cite the 45% ORR in 2.7.3'],
  openQuestions: ['Which data cut-off applies?'],
  nextActions: [],
  createdArtifacts: [],
  exclusions: [],
};
/** Twenty messages: the refresh gate's threshold, with no earlier summary. */
const turns = (last = ANSWER) => [
  ...Array.from({ length: 19 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i}` })),
  { role: 'assistant', content: last },
];
/** What the write stored: the rendered summary and the structured fields. */
const stored = () => {
  const values = state.inserts.at(-1) ?? [];
  const structured = values.map((v) => (typeof v === 'string' && v.startsWith('{') ? JSON.parse(v) : null)).find((v) => v && 'lockedFacts' in v);
  const summary = values.find((v) => typeof v === 'string' && v.startsWith('**')) as string | undefined;
  return { structured, summary };
};

async function writeBack(extra: Record<string, unknown> = {}, messages = turns()) {
  const { summarizeAndStoreWorkingMemoryForThread } = await import('../working-memory.js');
  await summarizeAndStoreWorkingMemoryForThread({ threadId: 't1', organizationId: 7, messages, ...extra });
}

beforeEach(() => {
  vi.resetModules();
  Object.assign(state, { summary: SUMMARY, thread: [STORED], threadReads: 0, gatewayCalls: 0, inserts: [] });
});

describe('the write-back keeps only what a checked answer found', () => {
  it('withholds the figure the stored check did not find, in every field the reader renders', async () => {
    await writeBack();
    const { structured, summary } = stored();
    expect(structured.lockedFacts).toEqual(['212 patients were enrolled in NCT01234567']);
    expect(structured.decisions).toEqual([]);
    expect(structured.openQuestions).toEqual(['Which data cut-off applies?']);
    expect(structured.withheld.lockedFacts).toEqual(['The ORR in NCT01234567 was 45%']);
    expect(structured.withheld.decisions).toEqual(['Cite the 45% ORR in 2.7.3']);
    expect(structured.factCheck).toBe('answer-check/2');
    expect(summary).not.toContain('45%');
    expect(summary).toContain('212 patients');
  });

  it("reads the current answer's check, which may not be stored yet", async () => {
    state.thread = [];
    const now = 'NCT07654321 enrolled 96 patients; its ORR was 12%.';
    const check = checkAnswer(now, [SEARCH({ studies: [{ nctId: 'NCT07654321', enrolled: 96, orr: '33%' }] })]);
    state.summary = { ...SUMMARY, lockedFacts: ['NCT07654321 enrolled 96 patients', 'The ORR in NCT07654321 was 12%'], decisions: [] };
    await writeBack({ answerCheck: check }, turns(now));
    expect(stored().structured.lockedFacts).toEqual(['NCT07654321 enrolled 96 patients']);
  });

  it('fails closed when the thread cannot be read: only what claims nothing stands, and the row is still written', async () => {
    state.thread = new Error('connection reset');
    state.summary = { ...SUMMARY, lockedFacts: ['212 patients were enrolled', 'The sponsor prefers a rolling submission'] };
    await writeBack();
    expect(stored().structured.lockedFacts).toEqual(['The sponsor prefers a rolling submission']);
  });

  it('writes the row when the summarizer returns a malformed shape, never one letter per fact', async () => {
    state.summary = { objective: 'Plan the IND', lockedFacts: 'The sponsor prefers Q3', decisions: [{ x: 1 }, 'File the IND in Q3'] };
    await writeBack();
    const { structured } = stored();
    expect(structured.lockedFacts).toEqual([]);
    expect(structured.decisions).toEqual(['File the IND in Q3']);
  });

  it('below the refresh threshold, neither summarises nor reads the thread', async () => {
    await writeBack({}, turns().slice(0, 10));
    expect(state.gatewayCalls).toBe(0);
    expect(state.threadReads).toBe(0);
    expect(state.inserts).toEqual([]);
  });
});
