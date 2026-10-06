import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ summary: vi.fn(), workflow: vi.fn(), query: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../intelligence/project-intelligence-service.js', () => ({ getProjectIntelligence: h.summary }));
vi.mock('../workflow-orchestration.js', () => ({ buildWorkflowContext: h.workflow }));
import { enrichContextForChat } from '../context-enrichment';

const INPUT = { message: '/claims', projectId: 42, organizationId: 7, submissionType: 'IND' };
const PROFILE = { regulatoryStrategy: 'Retain stability arm', riskFactors: [], openQuestions: [], keyDecisions: [], learnedInsights: [], documentStats: { totalIngested: 2 }, memoryEntryCount: 3 };
const stalled = () => new Promise<never>(() => {});
beforeEach(() => {
  vi.useFakeTimers();
  h.summary.mockReset().mockResolvedValue(PROFILE);
  h.workflow.mockReset().mockResolvedValue('Workflow context');
  h.query.mockReset().mockResolvedValue({ rows: [{ title: 'Evidence memo', content: 'Retain the comparator', category: 'evidence_assessment', confidence: 0.8, confidence_score: 0.8 }] });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
function observe(params = INPUT) {
  const settled = vi.fn();
  const pending = enrichContextForChat(params).then(settled);
  return { settled, pending };
}

describe('optional enrichment sources share a bounded wait', () => {
  it.each(['summary', 'workflow', 'query'] as const)('retains healthy results when %s stalls', async source => {
    h[source].mockImplementation(stalled);
    const { settled, pending } = observe();
    await vi.advanceTimersByTimeAsync(3000);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
    const result = settled.mock.calls[0][0];
    expect(result.block).toContain('Enrichment context unavailable');
    expect(result.block).toContain('Do not infer that missing context or unresolved findings do not exist');
    expect(result.enrichmentMeta.unavailableSources).toHaveLength(1);
    if (source !== 'summary') expect(result.block).toContain('Retain stability arm');
    if (source !== 'workflow') expect(result.block).toContain('Workflow context');
    if (source !== 'query') expect(result.block).toContain('Retain the comparator');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts project, workflow and requested claims reads before the project summary resolves', async () => {
    h.summary.mockImplementation(stalled); h.workflow.mockImplementation(stalled); h.query.mockImplementation(stalled);
    const { settled, pending } = observe();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.summary).toHaveBeenCalledWith(42, 7);
    expect(h.workflow).toHaveBeenCalledWith(42, 'IND', 7);
    expect(h.query).toHaveBeenCalled();
    expect(h.query.mock.calls[0][1]).toEqual([42, 7, 8]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
    expect(settled.mock.calls[0][0].enrichmentMeta.unavailableSources).toHaveLength(3);
  });

  it('preserves slash rewriting when the requested read times out', async () => {
    h.query.mockImplementation(stalled);
    const { settled, pending } = observe({ ...INPUT, message: '/claims Is this drug FDA approved?' });
    await vi.advanceTimersByTimeAsync(3000);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
    const result = settled.mock.calls[0][0];
    expect(result.rewrittenMessage).toBeTruthy();
    expect(result.rewrittenMessage).not.toContain('/claims');
    expect(result.enrichmentMeta.detectedCommand).toBe('claims');
  });

  it('keeps the static claim-grounding guard when natural-language evidence reads time out', async () => {
    h.query.mockImplementation(stalled);
    const { settled, pending } = observe({ ...INPUT, message: 'This drug will be approved. Explain the evidence.' });
    await vi.advanceTimersByTimeAsync(3000);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
    const result = settled.mock.calls[0][0];
    expect(result.sources).toContain('claim-grounding');
    expect(result.block).toContain('Claim-grounding check (NON-NEGOTIABLE)');
    expect(result.block).toContain('Enrichment context unavailable');
  });

  it('keeps an availability notice even under the optional composer budget', async () => {
    h.query.mockImplementation(stalled);
    const settled = vi.fn();
    const pending = enrichContextForChat({ ...INPUT, composeTokenBudget: 30 }).then(settled);
    await vi.advanceTimersByTimeAsync(3000);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
    expect(settled.mock.calls[0][0].block).toContain('Enrichment context unavailable');
  });

  it('keeps the invoked app and rewrites its mention when app context times out', async () => {
    h.query.mockImplementation(stalled);
    const { settled, pending } = observe({ ...INPUT, message: '@safety review these events' });
    await vi.advanceTimersByTimeAsync(3000);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
    const result = settled.mock.calls[0][0];
    expect(result.sources).toContain('app:safety');
    expect(result.rewrittenMessage).toBe('review these events');
    expect(result.enrichmentMeta.unavailableSources).toContain('app:safety/safety');
  });
});

describe('enrichment deadline preserves normal and late-result behavior', () => {
  it.each(['summary', 'workflow'] as const)('reports a failed %s read without discarding healthy enrichment', async source => {
    h[source].mockRejectedValue(new Error('query failed'));
    const result = await enrichContextForChat(INPUT);
    expect(result.enrichmentMeta?.unavailableSources).toHaveLength(1);
    expect(result.block).toContain('Enrichment context unavailable');
    expect(result.block).toContain('Retain the comparator');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains a slow healthy source inside the budget and preserves common-context ordering', async () => {
    h.summary.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(PROFILE), 2500)));
    const { settled, pending } = observe();
    await vi.advanceTimersByTimeAsync(2499);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
    const result = settled.mock.calls[0][0];
    expect(result.sources.slice(0, 3)).toEqual(['project-profile', 'workflow', 'claims']);
    expect(result.enrichmentMeta.unavailableSources).toEqual([]);
    expect(result.block).toContain('Retain stability arm');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves the existing greeting rule when common project context is available', async () => {
    const result = await enrichContextForChat({ ...INPUT, message: 'hello' });
    expect(result.sources).toContain('project-profile');
    expect(result.sources).toContain('workflow');
    expect(h.query).not.toHaveBeenCalled();
    expect(result.sources).not.toContain('proactive-readiness');
  });
  it('does not confuse healthy empty results with unavailable context', async () => {
    h.summary.mockResolvedValue(null); h.workflow.mockResolvedValue(''); h.query.mockResolvedValue({ rows: [] });
    const result = await enrichContextForChat(INPUT);
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
    expect(result.block).not.toContain('Enrichment context unavailable');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not change the returned snapshot when a query resolves after its deadline', async () => {
    let resolve!: (value: { rows: unknown[] }) => void;
    h.query.mockReturnValue(new Promise<{ rows: unknown[] }>(r => { resolve = r; }));
    const { settled, pending } = observe();
    await vi.advanceTimersByTimeAsync(3000);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
    const result = settled.mock.calls[0][0];
    const snapshot = JSON.stringify(result);
    resolve({ rows: [{ title: 'Late evidence', content: 'Late comparator' }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(result.block).not.toContain('Late evidence');
  });

  it('keeps projectless guidance without starting scoped reads', async () => {
    const result = await enrichContextForChat({ message: '/claims' });
    expect(h.summary).not.toHaveBeenCalled(); expect(h.workflow).not.toHaveBeenCalled(); expect(h.query).not.toHaveBeenCalled();
    expect(result.enrichmentMeta?.hasProjectContext).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
