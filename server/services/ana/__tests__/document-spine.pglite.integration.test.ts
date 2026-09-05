/**
 * Canonical document spine — the ATOMIC FLOW, END-TO-END against real Postgres.
 *
 * document-spine.test.ts proves the orchestration ordering + rollback with MOCKED
 * deps. This proves the thing mocks cannot: that commitCanonicalRevision's four
 * transactional steps — version write, governed AI-action + Part 11 audit,
 * review-state flip, eCTD placement — actually EXECUTE and COMMIT ATOMICALLY
 * against a real Postgres engine over the canonical concept2cure_artifacts
 * identity, using the REAL dep implementations (only `withTransaction` is
 * re-pointed at the in-process PGlite connection).
 *
 * It is the capstone of the "ONE atomic flow" requirement: a version can never
 * exist without its audit row, nor a status flip without its version. The
 * atomicity test forces the last in-transaction step to throw and asserts that
 * EVERYTHING rolls back — no orphan version, no orphan audit row.
 *
 * It also proves the fix in 20260730_c2c_ana_actions_command_vocab.sql end-to-end
 * from the spine's perspective: commitCanonicalRevision records the AI action
 * with command 'update'/'reaffirm', which the pre-fix CHECK rejected (23514),
 * which would have rolled back the ENTIRE revision. The real migration is applied
 * in setup, so a regression there fails this test too.
 *
 * PGlite is pure-WASM Postgres — no server, no docker, no cloud.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { commitCanonicalRevision, defaultSpineDeps, type SpineDeps } from '../document-spine.js';

const COMMAND_VOCAB_MIGRATION = fs.readFileSync(
  path.join(__dirname, '../../../../db/migrations/20260730_c2c_ana_actions_command_vocab.sql'),
  'utf8',
);

// Canonical identity + versions + the governed ledger pair. concept2cure_artifacts
// mirrors the columns the version store writes and the spine's review/placement
// UPDATEs read (status, ctd_section); c2c_ana_actions starts with the ORIGINAL
// narrow CHECK, then the real fix migration is applied on top.
const ARTIFACTS_DDL = `
CREATE TABLE IF NOT EXISTS concept2cure_artifacts (
  id              SERIAL PRIMARY KEY,
  artifact_id     TEXT NOT NULL,
  project_id      INTEGER,
  organization_id INTEGER NOT NULL,
  type            TEXT NOT NULL,
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  content_hash    TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  ana_thread_id   TEXT,
  title_slug      TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  ctd_section     TEXT,
  created_by_id   INTEGER,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS concept2cure_artifact_versions (
  id                 SERIAL PRIMARY KEY,
  artifact_id        INTEGER NOT NULL,
  organization_id    INTEGER NOT NULL,
  version            INTEGER NOT NULL,
  content            TEXT NOT NULL,
  content_hash       TEXT NOT NULL,
  change_description TEXT,
  created_by_id      INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT c2c_artifact_unique_version UNIQUE (artifact_id, version)
);
CREATE TABLE IF NOT EXISTS concept2cure_provenance_events (
  id                  SERIAL PRIMARY KEY,
  event_id            TEXT NOT NULL UNIQUE,
  artifact_id         INTEGER NOT NULL,
  artifact_version_id INTEGER,
  organization_id     INTEGER NOT NULL,
  event_type          TEXT NOT NULL,
  event_action        TEXT NOT NULL,
  actor_id            INTEGER,
  actor_name          TEXT,
  actor_email         TEXT,
  details             JSONB NOT NULL DEFAULT '{}',
  source_artifact_id  INTEGER,
  source_description  TEXT,
  backend_route       TEXT,
  backend_service     TEXT,
  ip_address          VARCHAR(45),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, tenant_id INTEGER, user_id INTEGER, action TEXT, table_name TEXT,
  record_id TEXT, actor_id INTEGER, target TEXT, target_type TEXT, target_id TEXT, reason TEXT,
  payload_hash TEXT, ana_action_id TEXT, sha256_chain TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), hmac_seal TEXT,
  old_values   JSON,
  new_values   JSON,
  ip_address   TEXT,
  user_agent   TEXT
);
CREATE TABLE IF NOT EXISTS c2c_ana_actions (
  id TEXT PRIMARY KEY, org_id INTEGER NOT NULL, conversation_id TEXT, domain TEXT NOT NULL,
  surface TEXT NOT NULL, command TEXT NOT NULL, target TEXT NOT NULL, risk TEXT NOT NULL DEFAULT 'low',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, agentic_mode TEXT NOT NULL DEFAULT 'suggest',
  state TEXT NOT NULL DEFAULT 'proposed', proposed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  proposed_by INTEGER NOT NULL, decided_at TIMESTAMPTZ, decided_by INTEGER, decision_reason TEXT,
  executed_at TIMESTAMPTZ, audit_row_id UUID, idempotency_key TEXT UNIQUE,
  CONSTRAINT c2c_ana_actions_command_check
    CHECK (command IN ('claim','transition','resolve','sign','accept-ai-suggestion','lock',
                       'unclaim','transition-back','reopen','revoke-signature','reject-ai-suggestion','unlock')),
  CONSTRAINT c2c_ana_actions_risk_check  CHECK (risk IN ('low','med','high')),
  CONSTRAINT c2c_ana_actions_state_check CHECK (state IN ('proposed','approved','modified','skipped','executed','failed','reversed')),
  CONSTRAINT c2c_ana_actions_mode_check  CHECK (agentic_mode IN ('suggest','act_without_asking'))
);
`;

let pg: PGlite;
// Test SpineDeps = the REAL production deps, with withTransaction re-pointed at the
// PGlite connection and the post-commit (best-effort, out-of-transaction) steps
// stubbed so the test is hermetic and observable.
let deps: SpineDeps;
let emitted: unknown[];

const req = () => ({
  organizationId: 3,
  projectId: 21,
  userId: 9,
  anaThreadId: 'thread-spine-1',
  title: 'Clinical Overview',
  content: 'v1 body',
  documentType: 'clinical_overview',
  reasonForChange: 'Initial AnA draft',
  ctdSection: '2.5',
});

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(ARTIFACTS_DDL);
  await pg.exec(COMMAND_VOCAB_MIGRATION); // the real fix, applied on top of the narrow CHECK
  // The lineage gate the artifact writer now enlists (ledger L160): a real
  // organizations row for the FK, the evidence spine and the span-lineage store.
  await pg.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pg.exec(`INSERT INTO organizations (id, name) VALUES (3, 'org-3') ON CONFLICT DO NOTHING;`);
  for (const rel of ['db/migrations/20260724_clinical_regulatory_evidence_spine.sql', 'db/migrations/20260803_document_span_lineage.sql']) {
    await pg.exec(fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf8'));
  }
  const client = { query: (sql: string, params?: unknown[]) => pg.query(sql, params) as Promise<{ rows: any[] }> };
  emitted = [];
  deps = {
    ...defaultSpineDeps(),
    async withTransaction(_organizationId, fn) {
      await pg.query('BEGIN');
      try {
        const r = await fn(client as any);
        await pg.query('COMMIT');
        return r;
      } catch (e) {
        await pg.query('ROLLBACK');
        throw e;
      }
    },
    // Post-commit steps are best-effort and out of the atomic guarantee; stub them
    // so this test does not reach for the real pool / heavy aggregators.
    async persistProvenance() { return 0; },
    async recomputeReadiness() { return 0.5; },
    emitRefresh(event) { emitted.push(event); },
  };
});
afterEach(async () => { await pg.close(); });

describe('commitCanonicalRevision against real Postgres', () => {
  it('runs all seven steps and commits the version + audit + review + placement atomically', async () => {
    const r = await commitCanonicalRevision(req(), deps);

    expect(r.version).toBe(1);
    expect(r.created).toBe(true);
    expect(r.status).toBe('review');       // step 6
    expect(r.ctdSection).toBe('2.5');      // step 7
    expect(r.steps).toEqual(['version', 'ai_action', 'audit', 'review', 'placement', 'readiness', 'ui_refresh']);
    expect(emitted).toHaveLength(1);

    // The canonical artifact row: version 1, in review, placed.
    const art = (await pg.query(`SELECT version, status, ctd_section FROM concept2cure_artifacts WHERE artifact_id = $1`, [r.artifactId])).rows[0] as any;
    expect(art).toMatchObject({ version: 1, status: 'review', ctd_section: '2.5' });

    // Its version-history row exists.
    const vcount = (await pg.query(`SELECT count(*)::int AS n FROM concept2cure_artifact_versions WHERE artifact_id = $1`, [r.artifactPk])).rows[0] as { n: number };
    expect(vcount.n).toBe(1);

    // The governed pair: an AI action (command 'update', which the pre-fix CHECK
    // rejected) + an audit row, mutually backlinked.
    const act = (await pg.query(`SELECT command, state, audit_row_id FROM c2c_ana_actions WHERE id = $1`, [r.actionId])).rows[0] as any;
    const aud = (await pg.query(`SELECT ana_action_id, action FROM audit_logs WHERE id = $1`, [r.auditId])).rows[0] as any;
    expect(act.command).toBe('update');
    expect(act.state).toBe('executed');
    expect(String(act.audit_row_id)).toBe(r.auditId);
    expect(aud.ana_action_id).toBe(r.actionId);
  });

  it('appends a second version on the same thread with its own audit row', async () => {
    await commitCanonicalRevision(req(), deps);
    const r2 = await commitCanonicalRevision({ ...req(), content: 'v2 body', reasonForChange: 'Revised 2.5.4' }, deps);

    expect(r2.version).toBe(2);
    const acts = (await pg.query(`SELECT count(*)::int AS n FROM c2c_ana_actions`)).rows[0] as { n: number };
    const auds = (await pg.query(`SELECT count(*)::int AS n FROM audit_logs`)).rows[0] as { n: number };
    expect(acts.n).toBe(2);
    expect(auds.n).toBe(2);
  });

  it('is ATOMIC — a failure in a later in-transaction step rolls back the version AND the audit row', async () => {
    // Force the last in-transaction step (placement) to throw AFTER version +
    // governed action + review have run inside the same transaction.
    const failing: SpineDeps = {
      ...deps,
      async setPlacementTx() { throw new Error('boom: placement failed'); },
    };

    await expect(commitCanonicalRevision(req(), failing)).rejects.toThrow(/boom/);

    // Nothing persisted: no artifact, no version, no action, no audit row.
    const counts = await Promise.all([
      pg.query(`SELECT count(*)::int AS n FROM concept2cure_artifacts`),
      pg.query(`SELECT count(*)::int AS n FROM concept2cure_artifact_versions`),
      pg.query(`SELECT count(*)::int AS n FROM c2c_ana_actions`),
      pg.query(`SELECT count(*)::int AS n FROM audit_logs`),
    ]);
    expect(counts.map((c) => (c.rows[0] as { n: number }).n)).toEqual([0, 0, 0, 0]);
    expect(emitted).toHaveLength(0); // post-commit steps never ran
  });

  it('keeps the document a draft when trigger_review is false, but still versions + audits it', async () => {
    const r = await commitCanonicalRevision({ ...req(), triggerReview: false }, deps);
    expect(r.status).toBe('draft');
    expect(r.steps).not.toContain('review');
    const act = (await pg.query(`SELECT count(*)::int AS n FROM c2c_ana_actions`)).rows[0] as { n: number };
    expect(act.n).toBe(1); // audit/action still recorded
  });
});
