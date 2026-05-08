import { describe, it, expect, vi } from 'vitest';
import {
  emit,
  onMetric,
  countCitationMix,
  type SubmissionChatTurnMetric,
} from '../ana/submission-chat-metrics';

describe('submission-chat-metrics', () => {
  it('countCitationMix tallies relationships', () => {
    const mix = countCitationMix([
      { relationship: 'supports' },
      { relationship: 'contradicts' },
      { relationship: 'supports' },
      { relationship: 'gap' },
    ]);
    expect(mix).toEqual({ supports: 2, contradicts: 1, gap: 1 });
  });

  it('emit fans out to subscribed listeners', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const received: any[] = [];
    const unsubscribe = onMetric(m => received.push(m));

    const metric: SubmissionChatTurnMetric = {
      name: 'submission_chat.turn',
      threadId: 't1',
      artifactId: 'a1',
      projectId: 1,
      organizationId: 1,
      intent: 'rewrite',
      retrievalStrategy: 'advanced',
      artifactsInScope: 3,
      chunksRetrieved: 10,
      historyMessages: 4,
      priorCitations: 2,
      citationCount: 3,
      citationMix: { supports: 2, contradicts: 1, gap: 0 },
      rewriteEmitted: true,
      proposalId: 'p1',
      claimStatusCounts: { supported: 2, weak: 1, unsupported: 0 },
      streaming: false,
      model: 'anthropic/claude',
      provider: 'anthropic',
      latencyMs: 1234,
      promptTokens: 1000,
      completionTokens: 500,
    };
    emit(metric);

    expect(received).toHaveLength(1);
    expect(received[0].name).toBe('submission_chat.turn');
    expect(received[0].citationMix).toEqual({
      supports: 2,
      contradicts: 1,
      gap: 0,
    });
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0][0]).toMatch(/^metric: /);

    unsubscribe();
    consoleSpy.mockRestore();
  });

  it('listener failures do not break emit()', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const received: any[] = [];
    const unsubscribeBad = onMetric(() => {
      throw new Error('boom');
    });
    const unsubscribeGood = onMetric(m => received.push(m));

    expect(() =>
      emit({
        name: 'submission_chat.apply',
        artifactId: 'a',
        projectId: 1,
        organizationId: 1,
        threadId: 't',
        proposalId: null,
        previousVersion: 1,
        newVersion: 2,
        signed: false,
        signatureRequired: false,
        acknowledgeUnsupported: false,
        unsupportedRatio: 0,
        linesAdded: 1,
        linesRemoved: 0,
        linesUnchanged: 5,
        hasContradictionsAddressed: false,
      })
    ).not.toThrow();
    expect(received).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalled();

    unsubscribeBad();
    unsubscribeGood();
    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
