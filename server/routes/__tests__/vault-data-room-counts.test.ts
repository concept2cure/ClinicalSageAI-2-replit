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
 *
 * Since 2026-10-08 (Data Room catalog S2) the counts are one aggregate over
 * every current source of the project (countDataRoomStages), not the 200 rows
 * the lane lists. Here the aggregate's answer is mocked; its definitions are
 * proven on PostgreSQL in tests/db/data-room-processing.dbtest.ts.
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

let stageCounts = { captured: 0, classified: 0, filed: 0, needs_review: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  stageCounts = { captured: 0, classified: 0, filed: 0, needs_review: 0 };
  query.mockImplementation(async (sql: string) => {
    const q = String(sql);
    if (/AS needs_review/.test(q)) return { rows: [stageCounts] };
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

  it('a full window says so and lists only the window, while the counts cover the whole project', async () => {
    listClientDocuments.mockResolvedValue(Array.from({ length: 201 }, (_, i) => source(i + 1)));
    stageCounts = { captured: 250, classified: 0, filed: 0, needs_review: 0 };
    const room = await dataRoom();
    expect(room.window).toEqual({ shown: 200, truncated: true });
    expect(room.sources).toHaveLength(200);
    expect(room.captured).toBe(250);
    const counted = query.mock.calls.find(([sql]) => /AS needs_review/.test(String(sql)));
    expect(counted?.[1]).toEqual([PROGRAM, 7]);
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
    stageCounts = { captured: 3, classified: 1, filed: 0, needs_review: 1 };
    const counted = await dataRoom();
    expect(counted.classified).toBe(1);
    expect(counted.needsReview).toBe(1);
    expect(counted.captured).toBe(3);
  });
});

describe('data room — "filed" names the Vault version (VR-16)', () => {
  it('a filed source says which version its bytes are, and which version replaced it', async () => {
    listClientDocuments.mockResolvedValue([source(1), source(2), source(3)]);
    const base = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/content_hash = ANY\(\$3::text\[\]\)/.test(String(sql))) {
        return {
          rows: [
            { content_hash: 'sha256-1', version: '1.0', superseded: true, current_version: '2.0' },
            { content_hash: 'sha256-2', version: '3.0', superseded: false, current_version: '3.0' },
          ],
        };
      }
      return base(sql, params);
    });
    const room = await dataRoom();
    const by = (id: number) => room.sources.find((s: { id: number }) => s.id === id);
    expect(by(1)).toMatchObject({ stage: 'filed', filedAs: { version: '1.0', supersededBy: '2.0' } });
    expect(by(2)).toMatchObject({ stage: 'filed', filedAs: { version: '3.0', supersededBy: null } });
    expect(by(3)).toMatchObject({ stage: 'captured', filedAs: null });
  });
});
