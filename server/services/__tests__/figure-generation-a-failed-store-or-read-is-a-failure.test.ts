/**
 * A figure that could not be stored is not a generated figure, and Data Room
 * data that could not be read is not data nobody supplied.
 *
 * Until 2026-10-15:
 *   - storeFigure caught a failed INSERT into concept2cure_artifacts, logged a
 *     warning and returned; generateFigure then wrote a `figure_generated`
 *     audit row and answered success: true with a figure that existed nowhere.
 *   - resolveSourceData caught a failed read of the linked Data Room documents
 *     and carried on with no sources, so the request was refused as "No source
 *     data was supplied" — the caller had supplied it; the read had failed.
 *
 * The database, the audit/provenance writers and the model client are replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({
  chat: vi.fn(),
  failInsert: false,
  failDataRoomRead: false,
  inserts: [] as unknown[],
  audits: [] as unknown[],
  provenance: [] as unknown[],
}));

vi.mock('../../db.js', () => ({
  pool: {
    connect: async () => ({
      query: async (sql: string, params: unknown[] = []) => {
        if (/^\s*INSERT/i.test(sql)) {
          if (S.failInsert) throw new Error('SENTINEL-DB-DETAIL: synthetic refused insert');
          S.inserts.push(params);
          return { rows: [{ id: 101 }] };
        }
        return { rows: [] };
      },
      release: () => undefined,
    }),
    query: async (sql: string, params: unknown[] = []) => {
      if (/^\s*INSERT/i.test(sql)) {
        if (S.failInsert) throw new Error('SENTINEL-DB-DETAIL: null value in column "type" violates not-null constraint');
        S.inserts.push(params);
        return { rows: [{ id: 101 }] };
      }
      if (/COUNT\(\*\)/.test(sql)) return { rows: [{ count: '0' }] };
      if (/FROM concept2cure_artifacts/.test(sql)) {
        if (S.failDataRoomRead) throw new Error('SENTINEL-DB-DETAIL: permission denied for table concept2cure_artifacts');
        return { rows: [{ id: 7, title: 'Table 14.2.1', metadata: { extractedData: [{ arm: 'treatment', orr: 0.42 }] } }] };
      }
      return { rows: [] };
    },
  },
}));
vi.mock('../auditService', () => ({ default: { logAction: async (e: unknown) => { S.audits.push(e); } } }));
vi.mock('../provenance/artifact-provenance', () => ({
  recordArtifactProvenance: async (_pool: unknown, e: unknown) => { S.provenance.push(e); },
}));
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

beforeEach(() => {
  S.chat.mockReset();
  S.chat.mockResolvedValue({ content: '{"type":"bar"}', model: 'claude-opus-5' });
  S.failInsert = false;
  S.failDataRoomRead = false;
  S.inserts.length = 0;
  S.audits.length = 0;
  S.provenance.length = 0;
});

describe('generateFigure — a failed store is a failure', () => {
  it('does not report, or audit, a figure that could not be stored', async () => {
    S.failInsert = true;
    const r = await generateFigure({ ...BASE, rawData: [{ arm: 'treatment', orr: 0.42 }] });

    expect(r.success).toBe(false);
    expect(r.storage).toMatchObject({ status: 'not_saved', code: 'FIGURE_NOT_SAVED' });
    // The model draft is preserved for review, while no durable storage is claimed.
    expect(r.figure?.generatedContent).toBe('{"type":"bar"}');
    expect(r.error).toMatch(/not saved/);
    expect(r.error).not.toContain('SENTINEL-DB-DETAIL');
    expect(S.audits).toEqual([]);
    expect(S.provenance).toEqual([]);
  });

  it('stores, records provenance for and audits a figure whose store succeeded', async () => {
    const r = await generateFigure({ ...BASE, rawData: [{ arm: 'treatment', orr: 0.42 }] });

    expect(r.success).toBe(true);
    expect(S.inserts).toHaveLength(1);
    expect(S.provenance).toHaveLength(1);
    expect(S.audits).toHaveLength(1);
  });
});

describe('generateFigure — a failed Data Room read is an error, not absent data', () => {
  it('says the linked documents could not be read, and asks no model', async () => {
    S.failDataRoomRead = true;
    const r = await generateFigure({ ...BASE, sourceDataRefs: ['7'] });

    expect(r.success).toBe(false);
    expect(r.error).not.toMatch(/No source data was supplied/);
    expect(r.error).toMatch(/could not be read/);
    expect(r.error).not.toContain('SENTINEL-DB-DETAIL');
    expect(S.chat).not.toHaveBeenCalled();
    expect(S.inserts).toEqual([]);
  });

  it('draws from the linked documents when the read succeeds', async () => {
    const r = await generateFigure({ ...BASE, sourceDataRefs: ['7'] });

    expect(r.success).toBe(true);
    expect(r.figure!.sourceData[0]).toMatchObject({ sourceType: 'data_room', sourceId: '7', rowsSupplied: 1 });
  });
});
