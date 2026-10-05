/**
 * The "Draft from sources" door's turn (turn-record-draft.ts, AnA reasoning
 * round 12, RT-6): what the route cannot show, because nothing it does can
 * make it happen.
 *
 *   - A turn is filed once. Every exit of the route files it, so a fault after
 *     the draft was filed must not file a second, contradicting record.
 *   - A check that could not run is recorded as not run. The draft goes back
 *     with no check, which the panel says was not checked; it is never an
 *     empty check, which would read as nothing found.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { fileFailedDraftTurn, openDraftTurn } from '../turn-record-draft';
import { loadTurnRecord, verifyStoredTurnRecord } from '../turn-record-verify';

const h = vi.hoisted(() => ({ checkThrows: false }));
vi.mock('../turn-verification.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../turn-verification.js')>();
  return {
    ...real,
    verifyTurnAnswer: (...args: Parameters<typeof real.verifyTurnAnswer>) => {
      if (h.checkThrows) throw new Error('the engine failed');
      return real.verifyTurnAnswer(...args);
    },
  };
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const ORG = 63;

let pg: PGlite;
const queryable = {
  query: (sql: string, params?: unknown[]) => pg.query(sql, params as unknown[]) as Promise<{ rows: any[] }>,
};
const pool = { connect: async () => ({ ...queryable, release: () => undefined }) };

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await pg.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;`);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260926_ana_turn_records.sql'), 'utf8'));
});
afterAll(async () => { await pg.close(); });

const open = () =>
  openDraftTurn(pool, {
    orgId: ORG,
    userId: 7,
    sectionId: 's-1',
    request: { tone: 'professional', region: 'FDA' },
    prompt: 'Generate professional FDA regulatory content for: …',
    audit: {},
  })!;
const drafted = (turn: ReturnType<typeof open>) =>
  turn.drafted('The objective response rate was 31%.', {
    label: '2.5.4 Overview of Efficacy',
    authoringDocId: 'd-1',
    shownEvidence: 'The objective response rate was 31% in the 10 mg arm.',
    sectionHeader: 'Module: M2\nSection: 2.5.4 - Overview of Efficacy\nProduct: ABC',
    personWords: '',
    retrievalStatus: 'ok',
  });
const count = async () =>
  (await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM ana_turn_records WHERE organization_id = $1', [ORG]))
    .rows[0].n;

describe('the draft door’s turn', () => {
  it('is filed once: a fault after the draft was filed files no second record', async () => {
    const before = await count();
    const turn = open();
    expect((await drafted(turn)).turnRecord.status).toBe('recorded');
    await fileFailedDraftTurn(turn, 'Drafting failed on the server.');
    expect(await turn.file('failed')).toEqual({ status: 'not_recorded', reason: 'This turn was already filed.' });
    expect(await count()).toBe(before + 1);
  });

  it('a check that could not run is recorded as not run, never as an empty check', async () => {
    h.checkThrows = true;
    try {
      const { check, turnRecord } = await drafted(open());
      expect(check).toBeNull();
      expect(turnRecord.status).toBe('recorded');
      const stored = await loadTurnRecord(queryable, ORG, turnRecord.status === 'recorded' ? turnRecord.id : '');
      expect(verifyStoredTurnRecord(stored!).ok, 'the record verifies whole').toBe(true);
      const body = JSON.parse(stored!.recordText);
      expect(body.verification).toBeNull();
      expect(body.warnings).toContain('The draft could not be checked against its sources.');
    } finally {
      h.checkThrows = false;
    }
  });
});
