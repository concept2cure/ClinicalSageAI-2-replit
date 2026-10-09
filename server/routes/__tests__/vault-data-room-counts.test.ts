/**
 * The Vault's data-room lane counts what it says it counts.
 *
 * Found by the 2026-09-24 Vault-against-Veeva mapping (workflow wf_7221b784-39b):
 *   - the lane read listClientDocuments with its default 200-row cap and said
 *     nothing when a program held more, so Captured / Classified / Filed
 *     stopped at 200 — and AnA was told those as facts;
 *   - it did not pass currentOnly, so a re-upload counted twice: the retired
 *     revision (is_current = false) and its successor;
 *   - "Classified" meant "the classifier ran", including its fail-closed answer
 *     (no folder proposed, needsReview), so a source the classifier refused to
 *     place was reported as classified.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query, connect: vi.fn() } }));

const { listClientDocuments } = vi.hoisted(() => ({ listClientDocuments: vi.fn() }));
vi.mock('../../services/clinical-regulatory-evidence/evidence-spine.service.js', () => ({
  listClientDocuments,
}));

import createProjectVaultRoutes from '../c2c/project-vault';

const PROGRAM = '11111111-1111-4111-8111-111111111111';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: 7, id: 3 };
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

function source(n: number, dossier: Record<string, unknown> | null = null) {
  return {
    id: n,
    title: `Source ${n}`,
    checksum: `sha256-${n}`,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    metadata: { mimeType: 'application/pdf', fileSize: 2048, ...(dossier ? { dossier } : {}) },
    extractionStatus: 'extracted',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  query.mockImplementation(async (sql: string) => {
    const q = String(sql);
    if (/COUNT\(\*\)::int AS total/.test(q)) return { rows: [{ total: 0, unfiled: 0 }] };
    if (/SELECT id, name, product_type/.test(q)) return { rows: [{ id: PROGRAM, name: 'P', product_type: null }] };
    return { rows: [] };
  });
});

const dataRoom = async () => (await request(app()).get(`/api/c2c/project-vault/${PROGRAM}`)).body.data.dataRoom;

describe('data room — the window', () => {
  it('asks for current sources only, one past the window', async () => {
    listClientDocuments.mockResolvedValue([]);
    await dataRoom();
    const [, opts] = listClientDocuments.mock.calls[0];
    expect(opts).toMatchObject({ programId: PROGRAM, currentOnly: true, limit: 201 });
  });

  it('a full window says so, and shows only the window', async () => {
    listClientDocuments.mockResolvedValue(Array.from({ length: 201 }, (_, i) => source(i + 1)));
    const room = await dataRoom();
    expect(room.window).toEqual({ shown: 200, truncated: true });
    expect(room.sources).toHaveLength(200);
    expect(room.captured).toBe(200);
  });

  it('a window with room to spare is not truncated', async () => {
    listClientDocuments.mockResolvedValue([source(1), source(2)]);
    const room = await dataRoom();
    expect(room.window).toEqual({ shown: 2, truncated: false });
  });
});

describe('data room — what "classified" means', () => {
  it('a folder proposal is classified; the classifier\'s refusal is needs-review, not classified', async () => {
    listClientDocuments.mockResolvedValue([
      source(1, { suggestedFolder: 'module-3', evidenceKind: 'report', confidence: 'high', needsReview: false }),
      source(2, { suggestedFolder: null, evidenceKind: null, confidence: null, needsReview: true }),
      source(3),
    ]);
    const room = await dataRoom();
    const byId = Object.fromEntries(room.sources.map((s: { id: number; stage: string }) => [s.id, s.stage]));
    expect(byId[1]).toBe('classified');
    expect(byId[2]).toBe('needs_review');
    expect(byId[3]).toBe('captured');
    expect(room.classified).toBe(1);
    expect(room.needsReview).toBe(1);
    expect(room.captured).toBe(3);
  });
});
