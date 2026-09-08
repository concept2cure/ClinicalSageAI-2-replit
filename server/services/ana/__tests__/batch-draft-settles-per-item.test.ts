/**
 * batchDraft settles per section — one section that cannot be drafted must not
 * discard the drafts of the others.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `batchDraft` ran each slice of the batch through `Promise.all`. One rejection
 * — realistically, a section whose `existingContent` is too large for any model
 * (the gateway now refuses those before dispatch) — rejected the whole call. The
 * route answered a single error for all twenty sections, the client painted the
 * same message on every card, and the nineteen drafts that HAD been generated
 * and paid for were thrown away. The client already reads a per-result `error`
 * (BatchDraft.tsx: "No draft returned for this section."); the server never
 * produced one.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • every request gets a result, in request order;
 *   • a failed section is a failure RESULT carrying the gateway's stable code
 *     and its actionable message — not a raw provider string, not a throw;
 *   • the sections that succeeded are returned exactly as before.
 */

import { describe, it, expect, vi } from 'vitest';
import { AnaDocumentDraftingService, type DocumentDraftRequest, type DocumentDraftResponse } from '../AnaDocumentDraftingService';
import { GatewayContextWindowError, fitsContextWindow } from '../../ai-gateway/context-budget';

const drafted = (sectionType: string): DocumentDraftResponse => ({
  content: `<p>${sectionType}</p>`,
  model: 'claude-opus-4-7',
  usage: { inputTokens: 10, outputTokens: 20, estimatedCostUsd: 0.001 },
  latencyMs: 5,
});

/** The refusal the gateway raises for a request no model can hold. */
function tooLargeForEveryModel(): GatewayContextWindowError {
  const fit = fitsContextWindow(
    { taskType: 'document_drafting', messages: [{ role: 'user', content: 'x'.repeat(1_200_000) }] },
    {
      id: 'claude-opus-4', provider: 'anthropic', model: 'claude-opus-4-8', contextWindow: 200_000,
      qualityScore: 99, costPer1kInput: 0, costPer1kOutput: 0, capabilities: ['document_drafting'], enabled: true,
    },
  );
  return new GatewayContextWindowError([fit]);
}

const req = (sectionType: string): DocumentDraftRequest => ({
  framework: 'ich_clinical',
  sectionType,
  instructions: `Draft ${sectionType}.`,
});

describe('AnaDocumentDraftingService.batchDraft', () => {
  it('returns a result for every section, keeping the successful drafts when one section cannot be drafted', async () => {
    const service = new (AnaDocumentDraftingService as unknown as new () => AnaDocumentDraftingService)();
    vi.spyOn(service, 'draftDocument').mockImplementation(async (r: DocumentDraftRequest) => {
      if (r.sectionType === '§12.2 Adverse Events') throw tooLargeForEveryModel();
      return drafted(r.sectionType);
    });

    const requests = [req('§12.1 Extent of Exposure'), req('§12.2 Adverse Events'), req('§12.6 Safety Conclusions')];
    const results = (await service.batchDraft({ requests, concurrency: 3 })) as unknown as Array<Record<string, unknown>>;

    expect(results, 'one failing section discarded the whole batch').toHaveLength(3);
    expect(results[0].content).toBe('<p>§12.1 Extent of Exposure</p>');
    expect(results[2].content).toBe('<p>§12.6 Safety Conclusions</p>');

    const failed = results[1];
    expect(failed.content, 'a failed section must not carry content').toBeUndefined();
    expect(failed.error).toBe('TOKEN_LIMIT_EXCEEDED');
    expect(String(failed.message)).toMatch(/tokens/);
    expect(String(failed.message)).toMatch(/Reduce the input/);
    expect(failed.sectionType).toBe('§12.2 Adverse Events');
  });

  it('reports a fault that is not the gateway\'s as a failure result too — without leaking the internals', async () => {
    const service = new (AnaDocumentDraftingService as unknown as new () => AnaDocumentDraftingService)();
    vi.spyOn(service, 'draftDocument').mockImplementation(async (r: DocumentDraftRequest) => {
      if (r.sectionType === 'broken') throw new Error('relation "prompt_versions" does not exist');
      return drafted(r.sectionType);
    });

    const results = (await service.batchDraft({
      requests: [req('fine'), req('broken')],
      concurrency: 2,
    })) as unknown as Array<Record<string, unknown>>;

    expect(results).toHaveLength(2);
    expect(results[0].content).toBe('<p>fine</p>');
    expect(results[1].error).toBe('DRAFT_FAILED');
    expect(String(results[1].message)).not.toMatch(/relation|does not exist/);
  });
});
