/**
 * canonical_documents on real PostgreSQL (VR-03, row D5): two transitions on one
 * document cannot fork its lifecycle record, and the runtime role cannot delete
 * or truncate it.
 *
 * ── Why this cannot be a PGlite test ─────────────────────────────────────────
 * PGlite is one session. Two transactions cannot interleave on it, so a
 * read-then-write race is unrepresentable there, and so is the row lock that
 * closes it. Before VR-03 the advance route read the document, ran the gate and
 * the bound effects, and wrote [...prior, event] in a separate statement with no
 * lock: two concurrent `authoring → in_review` requests both read `authoring`,
 * both passed, both wrote an org-wide audit row, both answered 200, and the
 * per-document trail kept whichever append landed last.
 *
 * The race is made deterministic, not hoped for. The audit binding each
 * transition calls waits (up to BARRIER_MS) for the other request to arrive
 * too. Without the lock both arrive, and both proceed. With it, the second
 * request is still blocked on the row lock, so the first times out alone,
 * commits, and the second then reads `in_review` and is refused by the gate
 * before any effect runs.
 *
 * The migrations are applied by this file (both are idempotent, as the deploy
 * requires), and every row it writes carries this run's organization id, so the
 * cleanup never touches anything else.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { databaseUrl } from '../setup.db';
import { createScratchSchema, type ScratchSchema } from './harness';
import { createDocumentLifecycleRouter } from '../../server/routes/document-lifecycle';
import { buildLifecycleBindings } from '../../server/services/regulatory/lifecycleBindings';
import type { DocumentAuditEvent } from '../../shared/regulatory/document-lifecycle';

const ROOT = path.join(__dirname, '..', '..');
const MIGRATIONS = [
  'migrations/20260731c_canonical_documents.sql',
  'migrations/20260925_canonical_documents_append_only.sql',
];
/** This run's tenant: nothing else in the database carries it. */
const ORG = 900_000 + (process.pid % 90_000);
const BARRIER_MS = 750;

let owner: Pool;
let scratch: ScratchSchema;

async function cleanup(): Promise<void> {
  // The guard refuses DELETE for every role; the owner steps around it for the
  // sweep, exactly as tests/db/part11-audit-store.dbtest.ts does for its trigger.
  await owner.query(
    'ALTER TABLE public.canonical_documents DISABLE TRIGGER canonical_documents_guard_row'
  );
  try {
    await owner.query('DELETE FROM public.canonical_documents WHERE organization_id = $1', [ORG]);
  } finally {
    await owner.query(
      'ALTER TABLE public.canonical_documents ENABLE TRIGGER canonical_documents_guard_row'
    );
  }
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 8 });
  for (const rel of MIGRATIONS) await owner.query(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  await cleanup();
  scratch = await createScratchSchema(databaseUrl);
}, 60_000);

afterAll(async () => {
  await cleanup();
  await scratch?.destroy();
  await owner?.end();
});

/** An app whose every transition waits at the audit binding for a second one. */
function racingApp(captured: DocumentAuditEvent[]) {
  let arrivals = 0;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { tenantContext?: unknown }).tenantContext = { organizationId: ORG };
    (req as express.Request & { user?: unknown }).user = {
      id: 42,
      organizationId: ORG,
      role: 'admin',
      roles: ['admin', 'regulatory-author'],
    };
    next();
  });
  app.use(
    '/docs',
    createDocumentLifecycleRouter({
      db: drizzle(owner) as never,
      reverify: async () => ({
        ok: true,
        authenticationMethod: 'password',
        secondFactorVerified: false,
      }),
      bindingsFactory: deps =>
        buildLifecycleBindings({
          ...deps,
          registerGovernedDocument: async () => {},
          audit: async event => {
            arrivals += 1;
            captured.push(event);
            const deadline = Date.now() + BARRIER_MS;
            while (arrivals < 2 && Date.now() < deadline) await new Promise(r => setTimeout(r, 10));
          },
        }),
    })
  );
  return app;
}

describe('two transitions on one document (real PostgreSQL)', () => {
  it('are serialized: one is recorded, the other is refused by the gate before any effect runs', async () => {
    const captured: DocumentAuditEvent[] = [];
    const app = racingApp(captured);
    const created = await request(app)
      .post('/docs')
      .send({ title: 'Race case', documentType: 'US_IND', hasContent: true, contentHash: 'h' });
    expect(created.status).toBe(201);
    const id: string = created.body.canonicalId;

    const [a, b] = await Promise.all([
      request(app).post(`/docs/${id}/advance`).send({ to: 'in_review' }),
      request(app).post(`/docs/${id}/advance`).send({ to: 'in_review' }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const refused = a.status === 409 ? a : b;
    expect(refused.body.blockedBy).toContain('ILLEGAL_TRANSITION');
    // One org-wide audit row, for the transition that happened.
    expect(captured.map(e => [e.from, e.to])).toEqual([['authoring', 'in_review']]);

    const { rows } = await owner.query<{ stage: string; audit: DocumentAuditEvent[] }>(
      'SELECT stage, audit FROM public.canonical_documents WHERE canonical_id = $1',
      [id]
    );
    expect(rows[0].stage).toBe('in_review');
    expect(rows[0].audit.map(e => [e.from, e.to])).toEqual([['authoring', 'in_review']]);
  }, 30_000);
});

describe('the runtime role (non-superuser, real PostgreSQL)', () => {
  it('cannot DELETE or TRUNCATE a lifecycle record, even holding both privileges', async () => {
    const runtime = await scratch.connectAsRuntimeRole();
    await owner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.canonical_documents TO ${scratch.runtimeRole}`
    );
    await runtime.query(
      `INSERT INTO public.canonical_documents (canonical_id, organization_id, title, document_type)
       VALUES ($1, $2, 'Runtime role case', 'US_IND')`,
      [`dbtest-${ORG}`, ORG]
    );

    await expect(
      runtime.query('DELETE FROM public.canonical_documents WHERE organization_id = $1', [ORG])
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION: canonical document .* cannot be deleted/);
    await expect(runtime.query('TRUNCATE public.canonical_documents')).rejects.toThrow(
      /IMMUTABILITY_VIOLATION: canonical_documents cannot be truncated/
    );
    await expect(
      runtime.query(
        `UPDATE public.canonical_documents SET audit = '[{"actor":"forged"}]'::jsonb, stage = 'approved'
          WHERE organization_id = $1`,
        [ORG]
      )
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  }, 30_000);
});
