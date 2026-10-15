/**
 * A generated figure records how many source rows the model was given, and a
 * figure number nobody could assign is an error.
 *
 * Until 2026-10-15:
 *   - every figure carried `confidence`, "0-1 confidence in data accuracy",
 *     scored from a 0.5 base plus points for the output containing '{',
 *     'graph' or '<svg'. Nothing checked any datum. It was stored in the
 *     figure's metadata, its provenance event and its audit entry.
 *   - the source rows were serialized and cut at 3000 characters, so the model
 *     could see a fragment of the data and nothing said how many rows it saw.
 *   - when the existing figures could not be counted, the figure was numbered
 *     `Figure <section>-1` anyway.
 *
 * The database, the audit/provenance writers and the model client are replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({
  chat: vi.fn(),
  countFails: false,
  inserts: [] as Array<{ sql: string; params: unknown[] }>,
  audits: [] as Array<{ details: Record<string, unknown> }>,
  provenance: [] as Array<{ details: Record<string, unknown> }>,
}));

vi.mock('../../db.js', () => ({
  pool: {
    query: async (sql: string, params: unknown[] = []) => {
      if (/^\s*INSERT/i.test(sql)) {
        S.inserts.push({ sql, params });
        return { rows: [{ id: 101 }] };
      }
      if (/COUNT\(\*\)/.test(sql)) {
        if (S.countFails) throw new Error('SENTINEL-DB-DETAIL: relation "concept2cure_artifacts" does not exist');
        return { rows: [{ count: '0' }] };
      }
      return { rows: [] };
    },
  },
}));
vi.mock('../auditService', () => ({ default: { logAction: async (e: { details: Record<string, unknown> }) => { S.audits.push(e); } } }));
vi.mock('../provenance/artifact-provenance', () => ({
  recordArtifactProvenance: async (_pool: unknown, e: { details: Record<string, unknown> }) => { S.provenance.push(e); },
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
  S.countFails = false;
  S.inserts.length = 0;
  S.audits.length = 0;
  S.provenance.length = 0;
});

describe('generateFigure', () => {
  it('records the source rows supplied and sent to the model, and no confidence score', async () => {
    S.chat.mockResolvedValue({ content: '{"type":"bar"}', model: 'claude-opus-5' });
    const r = await generateFigure({ ...BASE, rawData: [{ arm: 'treatment', orr: 0.42 }, { arm: 'placebo', orr: 0.18 }] });
    expect(r.success).toBe(true);
    expect(r.figure).not.toHaveProperty('confidence');
    expect(r.figure!.sourceData[0]).toMatchObject({ rowsSupplied: 2, rowsSentToModel: 2 });

    const stored = JSON.parse(S.inserts[0].params[9] as string);
    expect(stored).not.toHaveProperty('confidence');
    expect(stored.sourceData[0]).toMatchObject({ rowsSupplied: 2, rowsSentToModel: 2 });
    expect(S.provenance[0].details).not.toHaveProperty('confidence');
    expect(S.audits[0].details).not.toHaveProperty('confidence');
    expect(S.audits[0].details).toMatchObject({ rowsSupplied: 2, rowsSentToModel: 2 });
  });

  it('sends whole rows only, and says how many of them the model saw', async () => {
    S.chat.mockResolvedValue({ content: '{"type":"line"}', model: 'claude-opus-5' });
    const rows = Array.from({ length: 200 }, (_, i) => ({ visit: i, value: i * 1.5, unit: 'ng/mL' }));
    const r = await generateFigure({ ...BASE, figureType: 'line_chart', rawData: rows });
    expect(r.success).toBe(true);
    const sent = r.figure!.sourceData[0].rowsSentToModel;
    expect(sent).toBeGreaterThan(0);
    expect(sent).toBeLessThan(200);

    const user = S.chat.mock.calls[0][0].messages.find((m: { role: string }) => m.role === 'user').content as string;
    expect(user).toContain(`first ${sent} of 200 rows`);
    expect(JSON.parse(user.slice(user.indexOf('['), user.lastIndexOf(']') + 1))).toHaveLength(sent);
  });

  it('generates nothing when no whole source row fits in the prompt', async () => {
    const r = await generateFigure({ ...BASE, rawData: [{ note: 'x'.repeat(5000) }] });
    expect(r.success).toBe(false);
    expect(S.chat).not.toHaveBeenCalled();
    expect(S.inserts).toEqual([]);
  });

  it('refuses when the figure number cannot be assigned, instead of numbering it -1', async () => {
    S.countFails = true;
    S.chat.mockResolvedValue({ content: '{"type":"bar"}', model: 'claude-opus-5' });
    const r = await generateFigure({ ...BASE, rawData: [{ arm: 'treatment', orr: 0.42 }] });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/figure number could not be assigned/i);
    expect(r.error).not.toContain('SENTINEL-DB-DETAIL');
    expect(S.chat).not.toHaveBeenCalled();
    expect(S.inserts).toEqual([]);
  });
});
