/**
 * The audit-chain verifier, built the way production builds it and run the way
 * production runs it (row D5: "audit-chain verifier run on production and its
 * output filed").
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `npm run ops:verify-audit-chain` is `tsx scripts/ops/verify-audit-chain.mjs`.
 * The production stage of Dockerfile.optimized installs with `--omit=dev` — tsx
 * is a devDependency — copies no scripts/ops, and the script imports TypeScript
 * modules plain Node cannot load. So the one command SOP-SEC-001 §10, the
 * restore and incident policies, and the security questionnaire all name could
 * not run where it is required to. The verifier itself was sound; it simply
 * never reached production.
 *
 * ── What this proves ──────────────────────────────────────────────────────────
 * The verifier is built from scripts/build-server.mjs's productionBuilds(), the
 * list `npm run build` iterates, so it is the shipped entry with the shipped
 * options; only the output directory differs. Drop the verifier from that list
 * and every case here fails.
 *
 *   0. `npm run build` emits it under dist/, which the production stage of
 *      Dockerfile.optimized copies whole.
 *   1. In a plain Node process with no tsx and a clean environment, the bundle
 *      loads, recognises it was invoked directly, and refuses with exit 2 when
 *      there is no database — never a silent success.
 *   2. Against a REAL chain written by the production writer, the bundled
 *      verifier and the source verifier return the same report; after one row
 *      is tampered with, both report it broken, at the same row.
 *
 * Importing the bundle into this process is sound because it contains no
 * `require` (the reason server/services/storage/__tests__/storage-provider-
 * production-bundle.test.ts must use a subprocess); case 1 still runs it in a
 * subprocess, which is the runtime that ships.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
// @ts-expect-error -- an .mjs build script with no type declarations
import { productionBuilds } from '../../../../scripts/build-server.mjs';
// Typed by scripts/ops/verify-audit-chain.d.mts, so (unlike build-server.mjs) no directive.
import { verifyAuditChains as verifySource, type AuditChainReport } from '../../../../scripts/ops/verify-audit-chain.mjs';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { GOVERNED_ACTION_LEDGER_PGLITE_DDL } from '../../ana-ri/__tests__/governed-action-ledger.fixture';
import { recordGovernedAction } from '../../../routes/c2c/actions';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const VERIFIER_ENTRY = path.join(REPO_ROOT, 'scripts/ops/verify-audit-chain.mjs');
// Under the repo so the bundle's external imports (pg, dotenv, …) resolve. The
// bundle loads a .env from two directories above itself: in the image that is
// /app, which holds none; here it is this cache directory, which holds none
// either. That matters: the repository's own .env sets DATABASE_URL, and the
// subprocess case below must see no database, as an unprovisioned container would.
const CACHE_ROOT = path.join(REPO_ROOT, 'node_modules', '.cache', `verifier-bundle-${process.pid}`);

type ProductionBuild = { label: string; options: { entryPoints: string[]; outfile: string } & Record<string, unknown> };
/** The verifier's entry in the list `npm run build` iterates, writing under outDir. */
const verifierBuild = (outDir?: string) =>
  (productionBuilds(outDir) as ProductionBuild[]).find((b) => b.options.entryPoints.includes(VERIFIER_ENTRY));
const BUILD = verifierBuild(path.join(CACHE_ROOT, 'dist'));
const OUT = BUILD?.options.outfile ?? path.join(CACHE_ROOT, 'dist', 'ops', 'verify-audit-chain.mjs');

/** The bundle exports the same function the source does, typed by the same declarations. */
type Verify = typeof verifySource;

let pg: PGlite;
let verifyBundle: Verify;
const client = {
  query: async (text: string, params?: unknown[]) => ({ rows: (await pg.query(text, params as unknown[])).rows as any[] }),
};
const ENV = { NODE_ENV: 'test' };
// The writer below reads this process's environment; the verifiers read ENV. A
// sealing key present here (a .env copied from .env.example) and absent there
// would make them disagree for a reason that is not the one under test.
const savedHmacKey = process.env.AUDIT_HMAC_KEY;
/** Everything but verifiedAt, which is a timestamp. */
const comparable = (r: AuditChainReport) => ({ verdict: r.verdict, exitCode: r.exitCode, tables: r.tables });

beforeAll(async () => {
  delete process.env.AUDIT_HMAC_KEY;
  if (!BUILD) throw new Error('productionBuilds() has no entry for scripts/ops/verify-audit-chain.mjs');
  await build(BUILD.options);
  verifyBundle = (await import(pathToFileURL(OUT).href)).verifyAuditChains as Verify;

  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(fs.readFileSync(path.join(REPO_ROOT, 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await pg.exec(GOVERNED_ACTION_LEDGER_PGLITE_DDL);
  // A real chain, written by the production writer in one transaction per row.
  for (const n of [1, 2, 3]) {
    await pg.query('BEGIN');
    await recordGovernedAction(client, {
      orgId: 7, userId: 5, command: 'update', target: `document:verifier-probe-${n}`,
      reason: null, domain: 'audit', surface: 'test',
    });
    await pg.query('COMMIT');
  }
}, 600_000);

afterAll(async () => {
  if (savedHmacKey === undefined) delete process.env.AUDIT_HMAC_KEY;
  else process.env.AUDIT_HMAC_KEY = savedHmacKey;
  await pg?.close();
  fs.rmSync(CACHE_ROOT, { recursive: true, force: true });
});

describe('the audit-chain verifier ships in a form production can run', () => {
  it('`npm run build` emits it under dist/, which the production stage copies whole', () => {
    const shipped = verifierBuild();
    expect(shipped, 'productionBuilds() no longer builds the verifier').toBeDefined();
    expect(path.relative(REPO_ROOT, shipped!.options.outfile)).toBe(path.join('dist', 'ops', 'verify-audit-chain.mjs'));
    // An operator tool reads the environment it runs in; a baked NODE_ENV would not.
    expect(shipped!.options.define).toBeUndefined();
    const dockerfile = fs.readFileSync(path.join(REPO_ROOT, 'Dockerfile.optimized'), 'utf8');
    expect(dockerfile).toMatch(/RUN npm run build/);
    expect(dockerfile).toMatch(/COPY --from=builder \/app\/dist \.\/dist/);
  });

  it('runs in plain Node with no tsx and a clean environment, and refuses with exit 2 when there is no database', () => {
    let status = 0;
    let output = '';
    try {
      execFileSync(process.execPath, [OUT], {
        env: { PATH: process.env.PATH ?? '' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      status = e.status;
      output = `${e.stdout}${e.stderr}`;
    }
    expect(status, 'no database must be "could not run" (2), never success (0)').toBe(2);
    expect(output).toMatch(/DATABASE_URL is not set/);
  });

  it('agrees with the source verifier on a real chain: audit_logs verified, walk only', async () => {
    const source = await verifySource(client, ENV, {});
    const bundled = await verifyBundle(client, ENV, {});
    expect(comparable(bundled)).toEqual(comparable(source));
    const logs = bundled.tables.find((t) => t.table === 'public.audit_logs');
    expect(logs).toMatchObject({ status: 'ok', rows: 3 });
    // The other two chained stores are not provisioned here, and an absent store
    // is "could not check", never "ok": the overall verdict stays unverifiable.
    expect(bundled.tables.filter((t) => t.table !== 'public.audit_logs').map((t) => t.status)).toEqual(['unverifiable', 'unverifiable']);
    expect(bundled.verdict).toBe('unverifiable');
    expect(bundled.exitCode).toBe(2);
  });

  it('after one row is tampered with, both report the chain broken, at the same row', async () => {
    // Simulates a privileged writer: the table refuses updates, so its guard is lifted first.
    await pg.exec('ALTER TABLE audit_logs DISABLE TRIGGER USER');
    await pg.query(`UPDATE audit_logs SET target = 'document:rewritten' WHERE target = 'document:verifier-probe-2'`);
    await pg.exec('ALTER TABLE audit_logs ENABLE TRIGGER USER');

    const source = await verifySource(client, ENV, {});
    const bundled = await verifyBundle(client, ENV, {});
    expect(bundled.verdict).toBe('broken');
    expect(bundled.exitCode).toBe(1);
    expect(comparable(bundled)).toEqual(comparable(source));
    const logs = bundled.tables.find((t) => t.table === 'public.audit_logs');
    expect(logs?.status).toBe('broken');
  });
});
