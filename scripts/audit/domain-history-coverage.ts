#!/usr/bin/env tsx
/**
 * Domain-history chain-coverage report — read-only.
 *
 * THE INVARIANT THIS MEASURES
 * Every write to a governed domain table should emit one canonical `audit_logs`
 * row naming that table and row (see server/services/audit/domain-history-link.ts),
 * so the sealed hash chain is a complete INDEX of what happened. Coverage is
 * therefore a ratio, not an opinion:
 *
 *     linked rows   = COUNT(audit_logs WHERE table_name = '<domain table>')
 *     domain rows   = COUNT(<domain table>)
 *     coverage      = linked / domain
 *
 * A (b) table whose domain rows grow while its linked rows stay flat has an
 * unwired writer. That is the whole point of running this.
 *
 * SINGLE SOURCE OF TRUTH
 * The table list is imported from DOMAIN_HISTORY_TABLES — the same constant the
 * writers import — so a table can never appear "covered" here without a writer
 * that links it. Do not inline a copy of the list.
 *
 * HONEST REPORTING
 *   - A table that does not exist in this database is reported `absent`, not as
 *     an error: subsystems are provisioned per environment.
 *   - `coverage` is null when the domain table is empty or absent. A ratio over
 *     zero rows is not 100% coverage, and must not be printed as if it were.
 *   - Exit code is always 0. This is a diagnostic, not a gate. Promote it to a
 *     CI ratchet once the orphan list in docs/AUDIT_STORE_INVENTORY_2026-08.md
 *     §1.3 is worked down.
 *
 * Usage:
 *   DATABASE_URL=… npx tsx scripts/audit/domain-history-coverage.ts
 *   DATABASE_URL=… npx tsx scripts/audit/domain-history-coverage.ts --json
 *   … --org 42        restrict the audit_logs side to one tenant
 *
 * Compliance: 21 CFR Part 11 §11.10(e) — completeness of the audit trail.
 */

import { Pool, PoolClient } from 'pg';
import {
  DOMAIN_HISTORY_TABLES,
  type DomainHistoryTable,
} from '../../server/services/audit/domain-history-link';

interface CoverageRow {
  table: string;
  rowSemantics: string;
  owner: string;
  /** Writers are wired to emit a chain link. */
  linked: boolean;
  /** Rows in the domain table; null when the table is absent from this database. */
  domainRows: number | null;
  /** audit_logs rows whose table_name names this domain table. */
  linkedRows: number;
  /** linkedRows / domainRows; null when the domain table is empty or absent. */
  coverage: number | null;
  status: 'absent' | 'empty' | 'orphaned' | 'partial' | 'covered';
}

/** `schema.table` → ['schema','table']; bare name → ['public','name']. */
function splitQualified(name: string): [string, string] {
  const dot = name.indexOf('.');
  return dot === -1 ? ['public', name] : [name.slice(0, dot), name.slice(dot + 1)];
}

function resolveDatabaseUrl(): string {
  for (const name of ['DATABASE_URL', 'DATABASE_NEON_NEW_SECRET', 'NEON_DATABASE_URL']) {
    const v = process.env[name];
    if (v) return v.replace(/^psql\s+'?/i, '').replace(/'?\s*$/, '');
  }
  throw new Error(
    'No database URL in environment (looked for DATABASE_URL, DATABASE_NEON_NEW_SECRET, NEON_DATABASE_URL)',
  );
}

/** SQL identifier quoting: wrap in double quotes, doubling any embedded quote. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function tableExists(client: PoolClient, qualified: string): Promise<boolean> {
  const [schema, table] = splitQualified(qualified);
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table],
  );
  return rows.length > 0;
}

async function countRows(client: PoolClient, qualified: string): Promise<number> {
  const [schema, table] = splitQualified(qualified);
  // Identifiers come from DOMAIN_HISTORY_TABLES (a compile-time constant), never
  // from user input; quoteIdent keeps that safe even if the list gains an odd name.
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM ${quoteIdent(schema)}.${quoteIdent(table)}`,
  );
  return Number(rows[0]?.n ?? 0);
}

async function countLinks(
  client: PoolClient,
  domainTable: string,
  orgId: number | null,
): Promise<number> {
  const params: unknown[] = [domainTable];
  let sql = `SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1`;
  if (orgId !== null) {
    params.push(orgId);
    sql += ` AND tenant_id = $2`;
  }
  const { rows } = await client.query(sql, params);
  return Number(rows[0]?.n ?? 0);
}

function classify(domainRows: number | null, linkedRows: number): CoverageRow['status'] {
  if (domainRows === null) return 'absent';
  if (domainRows === 0) return 'empty';
  if (linkedRows === 0) return 'orphaned';
  return linkedRows >= domainRows ? 'covered' : 'partial';
}

async function measure(
  client: PoolClient,
  spec: DomainHistoryTable,
  orgId: number | null,
): Promise<CoverageRow> {
  const exists = await tableExists(client, spec.table);
  const domainRows = exists ? await countRows(client, spec.table) : null;
  const linkedRows = await countLinks(client, spec.table, orgId);
  return {
    table: spec.table,
    rowSemantics: spec.rowSemantics,
    owner: spec.owner,
    linked: spec.linked,
    domainRows,
    linkedRows,
    coverage: domainRows && domainRows > 0 ? linkedRows / domainRows : null,
    status: classify(domainRows, linkedRows),
  };
}

function renderTable(rows: CoverageRow[]): void {
  const pad = (s: string, n: number) => s.padEnd(n);
  const w = Math.max(28, ...rows.map(r => r.table.length));
  console.log(
    `${pad('DOMAIN TABLE', w)}  ${pad('WIRED', 6)}  ${pad('DOMAIN', 8)}  ${pad('LINKED', 8)}  ${pad('COVER', 7)}  STATUS`,
  );
  console.log('-'.repeat(w + 45));
  for (const r of rows) {
    const cover = r.coverage === null ? '—' : `${(r.coverage * 100).toFixed(1)}%`;
    console.log(
      `${pad(r.table, w)}  ${pad(r.linked ? 'yes' : 'no', 6)}  ` +
        `${pad(r.domainRows === null ? '—' : String(r.domainRows), 8)}  ` +
        `${pad(String(r.linkedRows), 8)}  ${pad(cover, 7)}  ${r.status}`,
    );
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const orgFlag = argv.indexOf('--org');
  const orgId = orgFlag !== -1 && argv[orgFlag + 1] ? Number(argv[orgFlag + 1]) : null;
  if (orgId !== null && !Number.isFinite(orgId)) {
    throw new Error('--org expects a numeric tenant id');
  }

  const connectionString = resolveDatabaseUrl();
  const pool = new Pool({
    connectionString,
    ssl: /localhost|127\.0\.0\.1|\/\.s\.PGSQL/.test(connectionString)
      ? undefined
      : { rejectUnauthorized: true },
  });

  const client = await pool.connect();
  try {
    const rows: CoverageRow[] = [];
    for (const spec of DOMAIN_HISTORY_TABLES) {
      rows.push(await measure(client, spec, orgId));
    }

    const summary = {
      tables: rows.length,
      wired: rows.filter(r => r.linked).length,
      covered: rows.filter(r => r.status === 'covered').length,
      partial: rows.filter(r => r.status === 'partial').length,
      orphaned: rows.filter(r => r.status === 'orphaned').length,
      empty: rows.filter(r => r.status === 'empty').length,
      absent: rows.filter(r => r.status === 'absent').length,
    };

    if (asJson) {
      console.log(
        JSON.stringify({ generatedAt: new Date().toISOString(), orgId, tables: rows, summary }, null, 2),
      );
    } else {
      renderTable(rows);
      console.log(
        `\n${summary.tables} tables · wired ${summary.wired} · covered ${summary.covered} · ` +
          `partial ${summary.partial} · orphaned ${summary.orphaned} · empty ${summary.empty} · absent ${summary.absent}`,
      );
      if (summary.orphaned > 0 || summary.wired < summary.tables) {
        console.log(
          'Follow-up list (ordered by writer count): docs/AUDIT_STORE_INVENTORY_2026-08.md §1.3',
        );
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  // Diagnostic, not a gate: report and exit 0 so a missing database in a
  // sandbox does not read as a failing invariant.
  console.error(`domain-history-coverage: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(0);
});
