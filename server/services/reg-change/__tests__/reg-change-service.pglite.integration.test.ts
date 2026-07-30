/**
 * reg-change-service — END-TO-END against in-process PGlite.
 *
 * Proves the GA write+read path: a regulatory change RECORDED through the
 * service persists in the real reg_change_items store and reads back org-scoped
 * in worklist order (sev high → med → low, newest first within a band), with
 * the per-device impact list (affects[]) rehydrated from JSONB — no blob, no
 * fixture. Also locks required-classifier validation, affects-shape validation,
 * soft-delete, and strict tenant scope.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import {
  createRegChange, listRegChanges, getRegChange, deleteRegChange, RegChangeValidationError,
} from '../reg-change-service';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE reg_change_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id int NOT NULL, title text NOT NULL, src text,
  kind text NOT NULL, when_label text, sev text NOT NULL,
  live boolean NOT NULL DEFAULT false, summary text,
  affects jsonb NOT NULL DEFAULT '[]'::jsonb,
  action text, doc text, owner text, due text, created_by int,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
`;

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec(`DELETE FROM reg_change_items;`); });

describe('reg-change-service', () => {
  it('records a change and reads it back with affects[] rehydrated from JSONB', async () => {
    const created = await createRegChange(ORG, {
      title: 'QMSR — 21 CFR 820 harmonized to ISO 13485:2016',
      src: 'FDA · final rule', kind: 'regulation', whenLabel: 'Effective 2 Feb 2026',
      sev: 'high', live: true,
      summary: 'FDA replaces the QSR with the QMSR, incorporating ISO 13485 by reference.',
      affects: [{ dev: 'BX-204 CGM', what: 'DHF terminology in the 510(k)', sub: '510(k) OR-902' }],
      action: 'QMSR transition plan + gap analysis', doc: 'QMSR gap analysis & transition plan',
      owner: 'Quality', due: 'Effective now', createdBy: 42,
    });
    expect(created.id).toBeTruthy();
    expect(created.organization_id).toBe(ORG);
    expect(created.created_by).toBe(42);

    const rows = await listRegChanges(ORG);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.title).toBe('QMSR — 21 CFR 820 harmonized to ISO 13485:2016');
    expect(row.kind).toBe('regulation');
    expect(row.when_label).toBe('Effective 2 Feb 2026');
    expect(row.sev).toBe('high');
    expect(row.live).toBe(true);
    expect(Array.isArray(row.affects)).toBe(true);
    expect(row.affects[0]).toEqual({ dev: 'BX-204 CGM', what: 'DHF terminology in the 510(k)', sub: '510(k) OR-902' });
    expect(row.doc).toBe('QMSR gap analysis & transition plan');
    expect(row.owner).toBe('Quality');
  });

  it('lists in worklist order: sev high → med → low, newest first within a band', async () => {
    const low = await createRegChange(ORG, { title: 'ISO 10993-1 revision', kind: 'standard', sev: 'low' });
    const oldHigh = await createRegChange(ORG, { title: 'QMSR', kind: 'regulation', sev: 'high' });
    const med = await createRegChange(ORG, { title: 'Cybersecurity guidance', kind: 'guidance', sev: 'med' });
    const newHigh = await createRegChange(ORG, { title: 'EU AI Act', kind: 'regulation', sev: 'high' });
    // Deterministic recency within the high band (same-microsecond inserts tie).
    await pglite.query(`UPDATE reg_change_items SET created_at = now() - interval '1 day' WHERE id = $1`, [oldHigh.id]);
    await pglite.query(`UPDATE reg_change_items SET created_at = now() + interval '1 hour' WHERE id = $1`, [newHigh.id]);

    const titles = (await listRegChanges(ORG)).map((r) => r.title);
    expect(titles).toEqual(['EU AI Act', 'QMSR', 'Cybersecurity guidance', 'ISO 10993-1 revision']);
    expect([low.sev, med.sev]).toEqual(['low', 'med']);
  });

  it('rejects a missing title, an invalid classifier, and a malformed affects list', async () => {
    await expect(createRegChange(ORG, { title: '', kind: 'regulation', sev: 'high' }))
      .rejects.toBeInstanceOf(RegChangeValidationError);
    await expect(createRegChange(ORG, { title: 'x', kind: 'not_a_kind', sev: 'high' }))
      .rejects.toBeInstanceOf(RegChangeValidationError);
    await expect(createRegChange(ORG, { title: 'x', kind: 'guidance', sev: 'urgent' }))
      .rejects.toBeInstanceOf(RegChangeValidationError);
    await expect(createRegChange(ORG, { title: 'x', kind: 'guidance', sev: 'med', affects: 'not-a-list' }))
      .rejects.toBeInstanceOf(RegChangeValidationError);
    await expect(createRegChange(ORG, { title: 'x', kind: 'guidance', sev: 'med', affects: [{ dev: 'BX-204' }] }))
      .rejects.toBeInstanceOf(RegChangeValidationError);
    expect(await listRegChanges(ORG)).toEqual([]);
  });

  it('is strictly tenant-scoped and soft-delete aware', async () => {
    const mine = await createRegChange(ORG, { title: 'Mine', kind: 'standard', sev: 'low' });
    await createRegChange(OTHER, { title: 'Theirs', kind: 'standard', sev: 'low' });

    expect((await listRegChanges(ORG)).map((r) => r.title)).toEqual(['Mine']);
    expect(await getRegChange(OTHER, mine.id)).toBeNull();          // no cross-tenant read

    expect(await deleteRegChange(ORG, mine.id)).toBe(true);
    expect(await listRegChanges(ORG)).toEqual([]);                   // soft-deleted excluded
    expect(await getRegChange(ORG, mine.id)).toBeNull();
  });
});
