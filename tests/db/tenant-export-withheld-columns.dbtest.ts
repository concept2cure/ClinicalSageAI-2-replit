/**
 * Every secret-shaped column a tenant export reads has been decided.
 *
 * The export (tenant-full-export.service.ts) reads each tenant-keyed table with
 * SELECT *, so a new table or column holding a token, a key or a credential is
 * returned to whoever downloads the data return unless someone says otherwise.
 * This reads the FULLY MIGRATED schema, the one a deploy produces, and the
 * export's own discovery (discoverTenantTables) for which tables it reads. Any
 * text-like column whose name looks like a secret must sit in
 * EXPORT_WITHHELD_COLUMNS (its value withheld) or EXPORT_COLUMNS_NOT_SECRET
 * (judged not a secret, with the reason). Neither list may name a column the
 * schema does not have, so the record cannot go stale unnoticed.
 *
 * Founder/PM decision 2026-10-05: a data return carries the customer's data,
 * not key material (docs/evidence/D6/2026-10-05-pm-decisions/).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import {
  discoverTenantTables,
  EXPORT_COLUMNS_NOT_SECRET,
  EXPORT_WITHHELD_COLUMNS,
} from '../../server/services/tenant-export/tenant-full-export.service';

const SECRET_SHAPED = /password|passwd|secret|ciphertext|encrypted|token|api_?key|private_?key|credential|otp|salt|hmac|session_key|signing/i;
const TEXT_LIKE = new Set(['text', 'character varying', 'character', 'json', 'jsonb', 'bytea', 'ARRAY']);

let pool: Pool;
let columns: Array<{ label: string; column: string; type: string }> = [];

beforeAll(async () => {
  pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const tables = await discoverTenantTables(pool);
  const { rows } = await pool.query<{ table_schema: string; table_name: string; column_name: string; data_type: string }>(
    `SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = ANY($1)`,
    [[...new Set(tables.map((t) => t.schema))]],
  );
  const exported = new Set(tables.map((t) => `${t.schema}.${t.table}`));
  columns = rows
    .filter((r) => exported.has(`${r.table_schema}.${r.table_name}`))
    .map((r) => ({
      label: r.table_schema === 'public' ? r.table_name : `${r.table_schema}.${r.table_name}`,
      column: r.column_name,
      type: r.data_type,
    }));
}, 120_000);

afterAll(async () => {
  await pool?.end();
});

const listed = (list: Readonly<Record<string, Readonly<Record<string, string>>>>, label: string, column: string) =>
  Object.prototype.hasOwnProperty.call(list, label) && Object.prototype.hasOwnProperty.call(list[label], column);

describe('the tenant export decides every secret-shaped column it reads', () => {
  it('reads a real schema, not an empty one', () => {
    expect(columns.length).toBeGreaterThan(1000);
  });

  it('every text-like secret-shaped column is withheld or recorded as not a secret', () => {
    const undecided = columns
      .filter((c) => TEXT_LIKE.has(c.type) && SECRET_SHAPED.test(c.column))
      .filter((c) => !listed(EXPORT_WITHHELD_COLUMNS, c.label, c.column) && !listed(EXPORT_COLUMNS_NOT_SECRET, c.label, c.column))
      .map((c) => `${c.label}.${c.column} (${c.type})`);
    expect(undecided, 'add each to EXPORT_WITHHELD_COLUMNS or, with a reason, EXPORT_COLUMNS_NOT_SECRET').toEqual([]);
  });

  it('every column either list names exists in an exported table', () => {
    const present = new Set(columns.map((c) => `${c.label}.${c.column}`));
    const stale: string[] = [];
    for (const list of [EXPORT_WITHHELD_COLUMNS, EXPORT_COLUMNS_NOT_SECRET]) {
      for (const [label, cols] of Object.entries(list)) {
        for (const column of Object.keys(cols)) if (!present.has(`${label}.${column}`)) stale.push(`${label}.${column}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('no column is on both lists', () => {
    const both = Object.entries(EXPORT_WITHHELD_COLUMNS).flatMap(([label, cols]) =>
      Object.keys(cols).filter((column) => listed(EXPORT_COLUMNS_NOT_SECRET, label, column)).map((column) => `${label}.${column}`),
    );
    expect(both).toEqual([]);
  });
});
