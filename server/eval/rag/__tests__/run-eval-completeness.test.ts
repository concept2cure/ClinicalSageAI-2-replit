import { describe, expect, it, vi } from 'vitest';
import { parseArgs, runRagEvaluation, type RagEvaluationOptions } from '../run-eval.js';
import type { GoldItem } from '../rag-metrics.js';

const opts: RagEvaluationOptions = {
  model: 'candidate', judgeModel: 'independent-judge', k: 5,
  organizationId: 1,
  organizationUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', programId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};
const item: GoldItem = { id: 'fixture-positive', question: 'What is recorded?', expectedAnswerContains: ['recorded'] };
const source = { id: 'chunk-1', documentId: 'document-1', content: 'Recorded source content.', expandedContent: 'The expanded source window.', title: 'Fixture', atomType: 'vault_chunk', initialScore: 1, finalScore: 1 };
function deps() {
  return {
    verifyScope: vi.fn(async () => undefined),
    resolveSources: vi.fn(async () => ({ negativeControl: false, sourceIds: ['document-1'], errors: [] as string[] })),
    query: vi.fn(async () => ({ answer: 'Recorded source answer.', sources: [source] })),
    judge: vi.fn(async (_prompt: string) => '0.9'),
  };
}

describe('RAG evaluation completeness is measured over every declared gold item', () => {
  it('retains valid diagnostic scores while explicitly withholding unverified model attribution', async () => {
    const d = deps(); const report = await runRagEvaluation([item], opts, d);
    expect(report.complete).toBe(true);
    expect(report.metrics).toMatchObject({ hitRate: 1, faithfulness: 0.9, hitItems: 1, faithfulnessItems: 1 });
    expect(report.usableAsPqEvidence).toBe(false);
    expect(report.items[0]).toMatchObject({ servedModel: null, servedModelVerified: false, judgeServedModel: null });
    expect(report.qualificationGaps.join(' ')).toMatch(/provider-resolved generator identity/);
    expect(d.judge.mock.calls[0][0]).toContain('The expanded source window.');
  });

  it('keeps an unresolved positive and makes no retrieval or model call for it', async () => {
    const d = deps(); d.resolveSources.mockResolvedValue({ negativeControl: false, sourceIds: [], errors: ['Unverified revision'] });
    const report = await runRagEvaluation([item], opts, d);
    expect(report.complete).toBe(false); expect(report.items).toHaveLength(1);
    expect(report.items[0]).toMatchObject({ error: 'Unverified revision', hit: null, faithfulness: null });
    expect(d.query).not.toHaveBeenCalled(); expect(d.judge).not.toHaveBeenCalled();
  });

  it('does not silently omit an item whose judge failed while other items scored', async () => {
    const d = deps(); d.judge.mockResolvedValueOnce('0.9').mockRejectedValueOnce(new Error('Judge unavailable'));
    const report = await runRagEvaluation([item, { ...item, id: 'second-item' }], opts, d);
    expect(report.complete).toBe(false); expect(report.items).toHaveLength(2); expect(report.itemsScored).toBe(1);
    expect(report.items[1].error).toMatch(/execution failed/);
    expect(report.metrics.faithfulnessItems).toBe(1);
    expect(report.reasons.join(' ')).toContain('second-item: Retrieval or faithfulness execution failed');
  });

  it('preserves retrieval failures as errors instead of returning an honest-looking empty hit', async () => {
    const d = deps(); d.query.mockRejectedValue(new Error('Retrieval unavailable'));
    const report = await runRagEvaluation([item], opts, d);
    expect(report.items[0]).toMatchObject({ error: 'Retrieval or faithfulness execution failed; diagnostic details were withheld.', hit: null });
    expect(report.complete).toBe(false);
  });

  it('records a positive grounded refusal as unjudged rather than dropping its hard item', async () => {
    const d = deps(); d.query.mockResolvedValue({ answer: 'I could not find relevant information.', sources: [] });
    const report = await runRagEvaluation([item], opts, d);
    expect(report.items[0]).toMatchObject({ hit: 0, faithfulness: null });
    expect(report.items[0].error).toMatch(/faithfulness was not assessed/);
    expect(report.complete).toBe(false); expect(d.judge).not.toHaveBeenCalled();
  });

  it('does not compare a chunk id to an expected document id', async () => {
    const d = deps(); d.query.mockResolvedValue({ answer: 'Recorded.', sources: [{ ...source, documentId: undefined } as never] });
    const report = await runRagEvaluation([item], opts, d);
    expect(report.items[0].error).toMatch(/chunk ids cannot stand in/);
    expect(report.items[0].hit).toBeNull();
  });

  it('rejects malformed judgment instead of clamping an arbitrary number into a passing score', async () => {
    const d = deps(); d.judge.mockResolvedValue('2026: scored 0.9');
    const report = await runRagEvaluation([item], opts, d);
    expect(report.complete).toBe(false); expect(report.items[0].faithfulness).toBeNull();
    expect(report.items[0].error).toMatch(/bare score/);
  });
  it('retains a failed judge without exporting arbitrary SDK diagnostic content', async () => {
    const d = deps(); d.judge.mockRejectedValue(new Error('fixture-sensitive-prompt fixture-api-secret'));
    const report = await runRagEvaluation([item], opts, d);
    expect(report.complete).toBe(false); expect(report.items[0].error).toMatch(/details were withheld/);
    expect(JSON.stringify(report)).not.toContain('fixture-api-secret');
    expect(JSON.stringify(report)).not.toContain('fixture-sensitive-prompt');
  });

  it('executes a declared negative control only as a reported grounded refusal check', async () => {
    const d = deps(); d.resolveSources.mockResolvedValue({ negativeControl: true, sourceIds: [], errors: [] });
    d.query.mockResolvedValue({ answer: 'I could not find relevant information.', sources: [] });
    const report = await runRagEvaluation([{ id: 'control', question: 'Out of scope?', tags: ['negative-control'] }], opts, d);
    expect(report.items[0]).toMatchObject({ negativeControl: true, negativeControlPass: true, hit: null, faithfulness: null });
    expect(report.usableAsPqEvidence).toBe(false); expect(d.judge).not.toHaveBeenCalled();
  });

  it('refuses absent scope and self-grading before invoking evaluation dependencies', async () => {
    const d = deps();
    await expect(runRagEvaluation([item], { ...opts, organizationUuid: undefined }, d)).rejects.toThrow(/organization/i);
    await expect(runRagEvaluation([item], { ...opts, judgeModel: opts.model }, d)).rejects.toThrow(/grade itself/);
    expect(d.resolveSources).not.toHaveBeenCalled();
  });

  it('refuses unverified live tenant/programme binding before a negative control can retrieve or dispatch', async () => {
    const d = deps(); d.verifyScope.mockRejectedValue(new Error('Live binding could not be verified'));
    await expect(runRagEvaluation([{ id: 'control', question: 'Out of scope', tags: ['negative-control'] }], opts, d)).rejects.toThrow(/Live binding/);
    expect(d.resolveSources).not.toHaveBeenCalled(); expect(d.query).not.toHaveBeenCalled(); expect(d.judge).not.toHaveBeenCalled();
  });

  it('reports zero-item runs as incomplete and rejects duplicate item ids before evaluating', async () => {
    const d = deps();
    expect((await runRagEvaluation([], opts, d)).complete).toBe(false);
    await expect(runRagEvaluation([item, item], opts, d)).rejects.toThrow(/distinct/);
    expect(d.resolveSources).not.toHaveBeenCalled();
  });
});

describe('CLI preflight', () => {
  const scopeArgs = ['--org-id', String(opts.organizationId), '--org-uuid', opts.organizationUuid!, '--program-id', opts.programId!];
  it('accepts explicit scope and finite thresholds', () => {
    expect(parseArgs([...scopeArgs, '--min-hit-rate', '0.6', '--min-faithfulness', '0.7'])).toMatchObject({ ...opts, model: null, judgeModel: null });
  });
  it.each([['--k', 'NaN'], ['--k', '0'], ['--min-hit-rate', 'NaN'], ['--min-faithfulness', '1.5'], ['--unexpected', 'value']])('refuses unusable %s=%s before DB acquisition', (flag, value) => {
    expect(() => parseArgs([...scopeArgs, flag, value])).toThrow();
  });
});
