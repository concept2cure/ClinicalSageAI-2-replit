/**
 * One row per table, for one organization, written from the catalog: every
 * NOT NULL column gets a value its type and CHECK admit, and every foreign key
 * gets a real parent of the same organization, seeded first. A key into a table
 * the purge deletes is filled even when it is optional, so the row exercises
 * the key it exists to test. Used by tenant-purge-blocking-keys.dbtest.ts.
 *
 * A non-.dbtest sibling (the tests/db/ana-tool-call.ts convention), so vitest
 * does not collect it. It writes as the owner, past RLS, and only into the
 * disposable deploy-shaped database the real-database lane provisions.
 */
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

interface Column {
  name: string;
  type: string;
  notnull: boolean;
  hasdef: boolean;
  generated: boolean;
  typtype: string;
  typid: number;
}
interface ForeignKey {
  parent: string;
  cols: string[];
  pcols: string[];
}
interface TableShape {
  columns: Column[];
  fks: ForeignKey[];
  checks: string[];
  pk: string[];
  tenantKeyed: boolean;
}

/** A written row: its table, its organization, and the key that finds it again. */
export interface SeededRow {
  table: string;
  organizationId: number;
  key: Record<string, string>;
}

const TENANT_COLUMNS = ['organization_id', 'org_id', 'tenant_id'];
const shapes = new Map<string, TableShape>();

/** Schema-qualified, as the catalog names it. */
export const qualified = (t: string): string => (t.includes('.') ? t : `public.${t}`);
const quoteTable = (t: string): string => qualified(t).split('.').map((p) => `"${p}"`).join('.');

async function shapeOf(db: Db, table: string): Promise<TableShape> {
  const hit = shapes.get(table);
  if (hit) return hit;
  const { rows: columns } = await db.query<Column>(
    `SELECT a.attname::text AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS notnull,
            (a.atthasdef OR a.attidentity <> '') AS hasdef, a.attgenerated <> '' AS generated,
            t.typtype::text AS typtype, a.atttypid::int AS typid
       FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
      WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
    [table],
  );
  const { rows: fks } = await db.query<ForeignKey>(
    `SELECT pn.nspname || '.' || p.relname AS parent,
            (SELECT array_agg(a.attname::text ORDER BY k.i) FROM unnest(con.conkey) WITH ORDINALITY k(n, i)
               JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n) AS cols,
            (SELECT array_agg(a.attname::text ORDER BY k.i) FROM unnest(con.confkey) WITH ORDINALITY k(n, i)
               JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.n) AS pcols
       FROM pg_constraint con JOIN pg_class p ON p.oid = con.confrelid JOIN pg_namespace pn ON pn.oid = p.relnamespace
      WHERE con.conrelid = $1::regclass AND con.contype = 'f'`,
    [table],
  );
  const { rows: checks } = await db.query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'c'`,
    [table],
  );
  const { rows: pk } = await db.query<{ name: string }>(
    `SELECT a.attname::text AS name FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary ORDER BY a.attnum`,
    [table],
  );
  const shape: TableShape = {
    columns,
    fks,
    checks: checks.map((c) => c.def),
    pk: pk.map((p) => p.name),
    tenantKeyed: columns.some((c) => TENANT_COLUMNS.includes(c.name)),
  };
  shapes.set(table, shape);
  return shape;
}

let counter = 0;
const token = (): string => `${Date.now().toString(36)}${(counter++).toString(36)}`;

/** The first value a column's CHECK names (`= ANY (ARRAY[…])` / `IN (…)`), or a hex string of its length. */
function checkedValue(c: Column, checks: string[]): string | undefined {
  for (const def of checks) {
    const m = def.match(new RegExp(`\\b${c.name}\\b[^)]*?(?:= ANY \\(\\(?ARRAY\\[|IN \\()'([^']*)'`));
    if (m) return m[1];
    const hex = def.match(new RegExp(`\\b${c.name}\\b \\~ '\\^\\[0-9a-f\\]\\{(\\d+)\\}\\$'`));
    if (hex) return 'a'.repeat(Number(hex[1]));
  }
  return undefined;
}

/** A value by type: the first matching pattern wins. */
const BY_TYPE: Array<[RegExp, (t: string, tag: string) => unknown]> = [
  [/\[\]$/, () => '{}'],
  [/^(integer|bigint|smallint|numeric|real|double precision)/, () => 1],
  [/^uuid$/, () => randomUUID()],
  [/^(timestamp|date)/, () => new Date().toISOString()],
  [/^time/, () => '00:00:00'],
  [/^interval$/, () => '1 day'],
  [/^boolean$/, () => false],
  [/^jsonb?$/, () => '{}'],
  [/^inet$/, () => '127.0.0.1'],
  [/^bytea$/, () => Buffer.from('seed')],
  [/^tsvector$/, () => ''],
  [/^character\(\d+\)/, (t) => 'x'.repeat(Number(t.match(/\((\d+)\)/)![1]))],
  [/^character varying\(\d+\)/, (t, tag) => `${tag}-${token()}`.slice(-Number(t.match(/\((\d+)\)/)![1]))],
];

/** A value the column's CHECK, enum or type admits. */
async function valueFor(db: Db, c: Column, checks: string[], tag: string): Promise<unknown> {
  const checked = checkedValue(c, checks);
  if (checked !== undefined) return checked;
  if (c.typtype === 'e') {
    const { rows } = await db.query<{ l: string }>(
      'SELECT enumlabel AS l FROM pg_enum WHERE enumtypid = $1 ORDER BY enumsortorder LIMIT 1', [c.typid]);
    return rows[0].l;
  }
  const hit = BY_TYPE.find(([re]) => re.test(c.type));
  return hit ? hit[1](c.type, tag) : `${tag}-${token()}`;
}

/**
 * Seeds rows for one organization. `exercised` is the set of tables the purge
 * deletes (listed, or reached by cascade): an optional key into one of them is
 * filled; an optional key anywhere else is left NULL. A parent with no tenant
 * column that the purge does not delete is reference data: an existing row is
 * reused when there is one.
 */
export class TenantRowSeeder {
  readonly rows: SeededRow[] = [];
  private readonly mine = new Map<string, Record<string, unknown>>();

  private readonly db: Db;
  readonly organizationId: number;
  private readonly userId: number;
  private readonly exercised: ReadonlySet<string>;
  private readonly reference: Map<string, Record<string, unknown>>;
  private readonly tag: string;

  constructor(options: {
    db: Db; organizationId: number; userId: number;
    /** The tables the purge deletes. */
    exercised: ReadonlySet<string>;
    /** Reference rows, shared by every seeder. */
    reference: Map<string, Record<string, unknown>>;
    tag: string;
  }) {
    ({ db: this.db, organizationId: this.organizationId, userId: this.userId,
      exercised: this.exercised, reference: this.reference, tag: this.tag } = options);
  }

  /** The row this seeder holds for `table`, writing it (and its parents) first. */
  async seed(table: string, depth = 0): Promise<Record<string, unknown>> {
    const t = qualified(table);
    const own = this.mine.get(t) ?? this.reference.get(t);
    if (own) return own;
    if (depth > 12) throw new Error(`${t}: parent chain deeper than 12`);
    const shape = await shapeOf(this.db, t);
    const isReference = !shape.tenantKeyed && !this.exercised.has(t);
    if (isReference) {
      const { rows } = await this.db.query(`SELECT * FROM ${quoteTable(t)} LIMIT 1`);
      if (rows.length) {
        this.reference.set(t, rows[0]);
        return rows[0];
      }
    }
    try {
      return await this.write(t, shape, isReference, depth, true);
    } catch (error) {
      // A table whose triggers refuse an optional key at INSERT (a fulfilment
      // written later by its own UPDATE) gets its row without those keys.
      const written = await this.write(t, shape, isReference, depth, false).catch(() => { throw error; });
      this.withoutOptionalKeys.push(`${t}: ${(error as Error).message.slice(0, 120)}`);
      return written;
    }
  }

  /** Tables seeded without their optional keys, and why (the first INSERT's refusal). */
  readonly withoutOptionalKeys: string[] = [];

  /** A value for each foreign key it fills: a parent of this organization, seeded first. */
  private async keyValues(t: string, shape: TableShape, depth: number, optionalKeys: boolean) {
    const row: Record<string, unknown> = {};
    for (const fk of shape.fks) {
      // Required: a column of the key other than the tenant column is NOT NULL.
      const required = fk.cols.some((c) => !TENANT_COLUMNS.includes(c) && shape.columns.find((x) => x.name === c)?.notnull);
      const fixed = fk.parent === 'public.users' ? this.userId : fk.parent === 'public.organizations' ? this.organizationId : null;
      if (fixed !== null) {
        if (required) fk.cols.forEach((c) => { row[c] = fixed; });
        continue;
      }
      const wanted = required || (optionalKeys && this.exercised.has(fk.parent));
      if (fk.parent === t || !wanted || fk.cols.some((c) => row[c] !== undefined && !TENANT_COLUMNS.includes(c))) continue;
      const parent = await this.seed(fk.parent, depth + 1);
      fk.cols.forEach((c, i) => {
        if (row[c] === undefined || TENANT_COLUMNS.includes(c)) row[c] = parent[fk.pcols[i]];
      });
    }
    return row;
  }

  /** The tenant column, and a value for every other NOT NULL column without a default. */
  private async columnValues(row: Record<string, unknown>, shape: TableShape): Promise<void> {
    for (const c of shape.columns) {
      if (row[c.name] !== undefined || c.generated) continue;
      if (TENANT_COLUMNS.includes(c.name) && /^(integer|bigint)/.test(c.type)) row[c.name] = this.organizationId;
      else if (c.notnull && !c.hasdef) row[c.name] = await valueFor(this.db, c, shape.checks, this.tag);
    }
  }

  private async write(t: string, shape: TableShape, isReference: boolean, depth: number, optionalKeys: boolean) {
    const row = await this.keyValues(t, shape, depth, optionalKeys);
    await this.columnValues(row, shape);
    const names = Object.keys(row);
    const { rows } = await this.db.query(
      `INSERT INTO ${quoteTable(t)} (${names.map((n) => `"${n}"`).join(', ')})
       VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      names.map((n) => row[n]),
    );
    const written = rows[0];
    (isReference ? this.reference : this.mine).set(t, written);
    const keyCols = shape.pk.length ? shape.pk : names;
    this.rows.push({
      table: t,
      organizationId: this.organizationId,
      key: Object.fromEntries(keyCols.map((k) => [k, String(written[k])])),
    });
    return written;
  }
}

/** Whether `row` is still in its table. */
export async function stillThere(db: Db, row: SeededRow): Promise<boolean> {
  const cols = Object.keys(row.key);
  const { rows } = await db.query(
    `SELECT 1 FROM ${quoteTable(row.table)} WHERE ${cols.map((c, i) => `"${c}"::text = $${i + 1}`).join(' AND ')} LIMIT 1`,
    cols.map((c) => row.key[c]),
  );
  return rows.length > 0;
}

/** Remove what a seeder wrote, newest first, past triggers and keys (teardown only). */
export async function removeSeeded(pool: Pool, rows: readonly SeededRow[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SET session_replication_role = 'replica'");
    for (const row of [...rows].reverse()) {
      const cols = Object.keys(row.key);
      await client.query(
        `DELETE FROM ${quoteTable(row.table)} WHERE ${cols.map((c, i) => `"${c}"::text = $${i + 1}`).join(' AND ')}`,
        cols.map((c) => row.key[c]),
      ).catch(() => undefined);
    }
  } finally {
    await client.query("SET session_replication_role = 'origin'").catch(() => undefined);
    client.release();
  }
}
