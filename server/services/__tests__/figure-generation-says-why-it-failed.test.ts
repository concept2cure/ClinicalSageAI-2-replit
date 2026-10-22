/**
 * generateFigure says why a figure was not generated: a deliberate refusal is
 * marked as one, an internal or model-gateway failure is marked as a failure and
 * carries a fixed sentence, and a linked source that matched nothing is named.
 *
 * Until 2026-10-15:
 *   - every unsuccessful result looked alike, so the route answered 422 for a
 *     failed model call or a failed store as for a refused request;
 *   - the catch-all returned `error.message`, so a model-gateway error's own
 *     text (provider, status, host) went to the caller as the reason;
 *   - a figure reference that matched no Data Room document, or was not a
 *     document id at all, was dropped silently and the request refused as "No
 *     source data was supplied" — the caller had linked a source; it matched
 *     nothing.
 *
 * The database, the audit/provenance writers and the model client are replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({
  chat: vi.fn(),
  dataRoomRows: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../db.js', () => ({
  pool: {
    query: async (sql: string) => {
      if (/^\s*INSERT/i.test(sql)) return { rows: [{ id: 101 }] };
      if (/COUNT\(\*\)/.test(sql)) return { rows: [{ count: '0' }] };
      if (/FROM concept2cure_artifacts/.test(sql)) return { rows: S.dataRoomRows };
      return { rows: [] };
    },
  },
}));
vi.mock('../auditService', () => ({ default: { logAction: async () => undefined } }));
vi.mock('../provenance/artifact-provenance', () => ({ recordArtifactProvenance: async () => undefined }));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: S.chat } }));

import { generateFigure } from '../figureGenerationService';

const BASE = {
  projectId: 5,
  organizationId: 9,
  userId: 1,
  figureType: 'bar_chart' as const,
  title: 'Response rate by arm',
  description: 'Objective response rate, treatment vs placebo',
  targetSection: '2.7.3',
};
const ROWS = [{ arm: 'treatment', orr: 0.42 }];

beforeEach(() => {
  S.chat.mockReset();
  S.chat.mockResolvedValue({ content: '{"type":"bar"}', model: 'claude-opus-5' });
  S.dataRoomRows = [];
});

describe('generateFigure — a gateway failure is a failure, with a fixed sentence', () => {
  it("does not pass the gateway's own error text to the caller", async () => {
    S.chat.mockRejectedValue(new Error('provider 529 overloaded at gw-internal-3.example:8443'));
    const r = await generateFigure({ ...BASE, rawData: ROWS });
    expect(r.success).toBe(false);
    expect(r.error, 'the gateway error text reached the caller').not.toContain('gw-internal-3');
    expect((r as { failure?: string }).failure).toBe('gateway');
  });

  it('marks a deliberate refusal as a refusal', async () => {
    const estimate = await generateFigure({ ...BASE, figureType: 'kaplan_meier', rawData: ROWS });
    expect((estimate as { failure?: string }).failure).toBe('refused');
    const noData = await generateFigure(BASE);
    expect((noData as { failure?: string }).failure).toBe('refused');
  });
});

describe('generateFigure — a figure reference that matched nothing is named', () => {
  it('a document id that matched no Data Room document', async () => {
    const r = await generateFigure({ ...BASE, sourceDataRefs: ['77'] });
    expect(r.error).not.toMatch(/No source data was supplied/);
    expect(r.error).toMatch(/figure reference 77 matched no data source/);
    expect(S.chat).not.toHaveBeenCalled();
  });

  it('a reference that is not a document id', async () => {
    const r = await generateFigure({ ...BASE, sourceDataRefs: ['doc-1'] });
    expect(r.error).not.toMatch(/No source data was supplied/);
    expect(r.error).toMatch(/figure reference "doc-1" is not a Data Room document id/);
  });

  it('a matched document with no extracted data points', async () => {
    S.dataRoomRows = [{ id: 7, title: 'Table 14.2.1', metadata: {} }];
    const r = await generateFigure({ ...BASE, sourceDataRefs: ['7'] });
    expect(r.error).not.toMatch(/No source data was supplied/);
    expect(r.error).toMatch(/Table 14\.2\.1.*no extracted data points/);
  });

  it('control: with nothing linked and no rows, no source data was supplied', async () => {
    const r = await generateFigure(BASE);
    expect(r.error).toMatch(/No source data was supplied/);
  });
});
