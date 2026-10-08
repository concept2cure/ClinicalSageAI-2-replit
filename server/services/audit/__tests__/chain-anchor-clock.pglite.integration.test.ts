/** Exercise native case 12 against the real door/verifier with controlled clocks. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as anchor from '../chain-anchor';
import { computeAuditChainSealed, hashPayload, type PoolClient } from '../chain';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const nativeSource = fs.readFileSync(path.join(root, 'server/services/audit/__tests__/chain-anchor.dbtest.ts'), 'utf8');
const parsed = ts.createSourceFile('native.ts', nativeSource, ts.ScriptTarget.Latest, true);
let clock: Date;
let ledgerTime: string;

function compiled<T>(source: string, bindings: Record<string, unknown>, result: string): T {
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(bindings), javascript + `\nreturn ${result};`)(...Object.values(bindings)) as T;
}

function nativeFunction<T>(name: string, bindings: Record<string, unknown>): T {
  const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`native helper missing: ${name}`);
  return compiled<T>(declaration.getText(parsed), bindings, name);
}

function nativeCase(bindings: Record<string, unknown>): () => Promise<void> {
  let callback: ts.Expression | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === 'it'
      && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text.startsWith('12. a head older')) {
      callback = node.arguments[1];
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  if (!callback) throw new Error('native case 12 missing');
  return compiled(`const run = ${callback.getText(parsed)};`, bindings, 'run');
}

let pg: PGlite;
let verifierClient: PoolClient;
let store: anchor.AuditAnchorStore;
let native: () => Promise<void>;

async function alterLedger(assignments: string, values: unknown[] = []): Promise<void> {
  // Owner-only construction of a synthetic timestamp/forgery, not a runtime write.
  await pg.exec("BEGIN; SET LOCAL session_replication_role = 'replica';");
  try {
    await pg.query(`UPDATE public.audit_log_archives SET ${assignments}`, values);
    await pg.exec('COMMIT;');
  } catch (error) {
    await pg.exec('ROLLBACK;');
    throw error;
  }
}

beforeEach(async () => {
  pg = new PGlite();
  verifierClient = { query: async (sql, values) => {
    const result = await pg.query<Record<string, unknown>>(sql, values);
    return { rows: result.rows };
  } };
  const ddl = nativeSource.match(/const AUDIT_LOGS_DDL = `([\s\S]*?)`;/)?.[1];
  if (!ddl) throw new Error('native audit_logs DDL missing');
  await pg.exec(ddl);
  for (const migration of ['db/migrations/20260617_audit_logs_immutability.sql', 'migrations/20260921_audit_logs_chain_seq.sql']) {
    await pg.exec(fs.readFileSync(path.join(root, migration), 'utf8'));
  }
  // Derive the scenario from the engine's current date so the unchanged door
  // cutoff cannot outgrow a fixed calendar fixture. Keep a known fractional part.
  const timing = await pg.query<{ clock: Date }>(`SELECT date_trunc('second', clock_timestamp()) AS clock`);
  clock = timing.rows[0].clock;
  ledgerTime = clock.toISOString().replace('Z', '750Z');
  // Fake only JavaScript Date. Timers and the PostgreSQL engine keep running.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock);
  const pool = {
    connect: async () => ({ query: (sql: string, values?: unknown[]) => pg.query(sql, values), release: () => {} }),
    query: async (sql: string, values?: unknown[]) => {
      const result = await pg.query(sql, values);
      if (sql.includes('SELECT audit_logs_archive_delete(')) {
        // Pin sub-millisecond DB precision just after the anchored JS clock.
        // The real door's deletion, ledger, cutoff and count remain exercised.
        await alterLedger('archived_at = $1::timestamptz', [ledgerTime]);
      }
      return result;
    },
  };
  const memoryStore = nativeFunction<() => { store: anchor.AuditAnchorStore }>('memoryStore', {});
  const writeRow = nativeFunction('writeRow', { pool, computeAuditChainSealed, hashPayload });
  const withClient = nativeFunction('withClient', { pool });
  const loadAnchor = async () => ({ ...anchor, writeAuditChainAnchor: async (client: Parameters<typeof anchor.writeAuditChainAnchor>[0], actualStore: anchor.AuditAnchorStore) => {
    store = actualStore;
    return anchor.writeAuditChainAnchor(client, actualStore);
  } });
  native = nativeCase({ loadAnchor, memoryStore, writeRow, withClient, pool, expect });
});

afterEach(async () => {
  vi.useRealTimers();
  await pg?.close();
});

describe('the archive fixture states verification after the ledger (DP-68)', () => {
  it('the exact native callback passes with a database ledger later within the same JavaScript millisecond', async () => {
    await native();
    const times = await pg.query<{ after_anchor: boolean; after_js: boolean; fractional: string }>(
      `SELECT archived_at > $1::timestamptz AS after_anchor,
              archived_at > $1::timestamptz AS after_js,
              to_char(archived_at AT TIME ZONE 'UTC', 'US') AS fractional
         FROM public.audit_log_archives`, [clock.toISOString()],
    );
    expect(times.rows[0]).toEqual({ after_anchor: true, after_js: true, fractional: '000750' });
    const current = await anchor.verifyAuditChainAnchor(verifierClient, store, clock);
    expect(current).toMatchObject({ status: 'broken', archived: [], breaks: [{ kind: 'head_missing', anchoredRows: 3, currentRows: 0 }] });
  });

  it('a verifier strictly after the ledger yields archived/unverifiable, never verified', async () => {
    await native();
    const result = await anchor.verifyAuditChainAnchor(verifierClient, store, new Date(clock.getTime() + 1));
    expect(result).toMatchObject({ status: 'unverifiable', breaks: [], archived: [{ organizationId: 11, kind: 'head_missing', anchoredRows: 3, currentRows: 0 }] });
  });

  it.each([
    ['at the anchor', 'archived_at = $1::timestamptz', () => clock.toISOString()],
    ['after the verifier', 'archived_at = $1::timestamptz', () => new Date(clock.getTime() + 2).toISOString()],
    ['cutoff in the hot window', 'cutoff = $1::timestamptz', () => clock.toISOString()],
    ['insufficient deletion budget', 'row_count = $1', () => 2],
  ] as const)('unchanged verifier refuses a ledger %s', async (_label, assignment, value) => {
    await native();
    await alterLedger(assignment, [value()]);
    const result = await anchor.verifyAuditChainAnchor(verifierClient, store, new Date(clock.getTime() + 1));
    expect(result).toMatchObject({ status: 'broken', archived: [], breaks: [{ kind: 'head_missing', anchoredRows: 3, currentRows: 0 }] });
  });
});
