/**
 * The engine's check of an answer is the one AnA reports (2026-10-04, AnA
 * reasoning; founder: "Enhance the reasoning layer of ANA").
 *
 * Before: the trust strip was built from AnA's own [KNOWN]/[INFERRED] labels
 * ("3 of 3 claims grounded · 2 sources"); the deterministic comparison with
 * the turn's tool results ran only when a tool ran, went to `post_done` where
 * no client reads it, and was not in the sealed turn record. Pinned here:
 *   - the strip carries the engine's check, beside the labels, on every
 *     answered turn, tools or not;
 *   - `post_done`, the stored message and the sealed record carry the same
 *     check the person was shown;
 *   - the record is sealed with it before `post_done`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const saved = vi.hoisted(() => ({ calls: [] as any[] }));
vi.mock('../../../services/chat-thread-helpers.js', () => ({
  saveChatMessage: async (...args: any[]) => {
    saved.calls.push(args);
    return 41;
  },
}));
vi.mock('../../../services/evidence/persist-provenance.js', () => ({ persistProvenance: async () => undefined }));
vi.mock('../../../services/working-memory.js', () => ({ summarizeAndStoreWorkingMemoryForThread: async () => undefined }));
vi.mock('../../../services/intelligence/learning-loop-service.js', () => ({ getCachedSignalReliability: async () => null }));
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: () => undefined }));
vi.mock('../../../services/ana/artifactVersionStore.js', () => ({ upsertDocumentArtifactVersion: async () => ({ saved: false }) }));
vi.mock('../../../db.js', () => ({ getPool: () => ({}), pool: {} }));

import { runStreamPostProcessing, type StreamPostProcessingContext } from '../post-processing';
import { TurnRecorder } from '../../../services/ana/turn-record';
import { ANSWER_CHECK_VERSION, toolEvidence } from '../../../services/ana/answer-grounding';

// Long enough for the label check to assess it (over 200 characters).
const ANSWER =
  'In NCT01234567 the ORR was 47% in 212 patients [KNOWN: registry]. The comparator study NCT09999999 ' +
  'reported 31% [INFERRED: indirect]. The design and conduct of both studies are described in their ' +
  'protocols and amendments. The submission is ready to file.';

function run(over: Partial<StreamPostProcessingContext> = {}) {
  const events: any[] = [];
  const res = {
    write: (chunk: string) => {
      for (const line of String(chunk).split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
      return true;
    },
    end: () => undefined,
    writableEnded: false,
  } as any;
  const recorder = new TurnRecorder();
  recorder.setTurn({ organizationId: 61, threadId: 'th_1', actorUserId: 7 });
  recorder.setRequest('Summarise the pivotal study.');
  const sealedAtFiling: any[] = [];
  const fileTurnRecord = vi.fn(async (outcome: 'answered' | 'stopped' | 'failed') => {
    sealedAtFiling.push(recorder.seal(outcome).body);
    return { status: 'recorded' as const, id: 'rec-1', sha256: 'a'.repeat(64) };
  });
  // As the registry search returns a hit: the request echoed, the record in a list.
  const entry = toolEvidence('search_clinical_evidence', {
    status: 'success',
    input: { query: 'NCT01234567' },
    content: '{"query":"NCT01234567","resultCount":1,"studies":[{"nctId":"NCT01234567","orr":"47%","enrolled":212}]}',
    generated: { calls: 0, texts: [], overflow: false },
  })!;
  const c: StreamPostProcessingContext = {
    res,
    fullContent: ANSWER,
    persistenceFailed: false,
    streamProjectId: undefined,
    orgId: 61,
    userId: 7,
    threadId: 'th_1',
    userName: 'Rita',
    effectiveRole: 'regulatory_lead' as any,
    sectionCode: undefined,
    toolTrace: [],
    humanControls: [],
    toolEvidenceCorpus: [entry, { source: 'person', content: 'Summarise the pivotal study.' }],
    collectedProvenance: [],
    collectedDrafts: [],
    messages: [],
    model: 'm',
    provider: 'anthropic',
    enrichment: { sources: [] },
    turnRecorder: recorder,
    fileTurnRecord,
    ...over,
  };
  return { c, events, sealedAtFiling };
}

beforeEach(() => {
  saved.calls = [];
});

describe('the answer check AnA reports', () => {
  it('the strip leads with the engine\'s check, beside the labels', async () => {
    const { c, events } = run();
    await runStreamPostProcessing(c);
    const strip = events.find((e) => e.type === 'grounding_strip');
    expect(strip.check.engine).toBe(ANSWER_CHECK_VERSION);
    expect(strip.check.basis).toBe('sources');
    expect(strip.check.notFound).toEqual([
      { kind: 'nct', text: 'NCT09999999' },
      { kind: 'figure', text: '31%' },
    ]);
    expect(strip.check.found).toBe(3);
    expect(strip.check.verdicts.map((v: any) => v.text)).toEqual(['is ready to file']);
    expect(strip.evidence.attempted).toBe(true);
    expect(strip.trust_summary).toMatch(/^⚠ Of 5 claims: 3 found in this turn's sources; 2 not found\./);
  });

  it('post_done, the stored message and the sealed record carry the same check', async () => {
    const { c, events, sealedAtFiling } = run();
    await runStreamPostProcessing(c);
    const strip = events.find((e) => e.type === 'grounding_strip');
    const done = events.find((e) => e.type === 'post_done');
    expect(done.check).toEqual(strip.check);
    const metadata = saved.calls[0][5];
    expect(metadata.verification.check).toEqual(strip.check);
    expect(sealedAtFiling).toHaveLength(1);
    expect(sealedAtFiling[0].schema).toBe('ana-turn-record/4');
    expect(sealedAtFiling[0].verification.check).toEqual(strip.check);
    expect(sealedAtFiling[0].verification.labels).toEqual(strip.evidence);
  });

  it('with no tool run, a turn still says what was checked: claims unchecked, not grounded', async () => {
    const { c, events } = run({ toolEvidenceCorpus: [{ source: 'person', content: 'Summarise the pivotal study.' }] });
    await runStreamPostProcessing(c);
    const strip = events.find((e) => e.type === 'grounding_strip');
    expect(strip.check.basis).toBe('no_sources');
    expect(strip.check.found).toBe(0);
    expect(strip.check.unchecked.length).toBe(5);
    expect(strip.trust_summary).toMatch(/No source consulted/);
  });

  it('a short answer the labels do not assess is still checked', async () => {
    const { c, events } = run({ fullContent: 'NCT09999999 enrolled 212 patients.' });
    await runStreamPostProcessing(c);
    const strip = events.find((e) => e.type === 'grounding_strip');
    expect(strip.evidence.attempted).toBe(false);
    expect(strip.check.notFound).toEqual([{ kind: 'nct', text: 'NCT09999999' }]);
    expect(strip.check.found).toBe(1);
  });
});
