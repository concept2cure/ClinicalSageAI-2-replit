/**
 * The four e-signature-tier AnA commands that wrote no signature — each now
 * records one, in the SAME transaction as the governed write it signs.
 * END-TO-END against in-process PGlite.
 *
 * WHAT WAS WRONG (2026-09-28)
 * POST /api/ana-ri/governed-action re-verifies the signer and stamps
 * ctx.signoff with the reason, the declared §11.50 meaning, and when and how
 * the signer was verified. place_in_dossier, create_submission_package,
 * revert_to_version and erase_personal_data are in PART11_ESIGN_COMMANDS, so a
 * person re-authenticated for each of them — and none wrote an
 * electronic_signatures row. No §11.50 manifestation, no §11.70 link between
 * the signature and the record it signed.
 *
 * The erasure had three more defects, pinned here too: its in-transaction
 * `.catch(() => ({ rows: [] }))` calls reported a completed erasure after a
 * failed statement had aborted the transaction; it overwrote regulated artifact
 * content that GDPR Art. 17(3)(b) exempts; and, since the signature is written
 * inside, a self-erasure would have signed as "[ERASED USER n]".
 *
 * Why a real engine: every property here is atomicity or a SQL type rule
 * (json || jsonb, 42P01 under a SAVEPOINT). A mocked pool proves neither.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { extractTableDdl } from '../../../../tests/golden-journeys/harness';
import { GOVERNED_ACTION_LEDGER_PGLITE_DDL } from './governed-action-ledger.fixture';
import { pglitePool } from './pglite-pool.fixture';
import { BINDING_BASIS, sha256CanonicalJson } from '../../part11/signature-persistence';
import type { Part11Signoff } from '../part11-governance';

let pg: PGlite;
const pool = pglitePool(() => pg);
const poolFacade = { query: (...a: Parameters<typeof pool.query>) => pool.query(...a), connect: () => pool.connect() };
vi.mock('../../../db', () => ({ pool: poolFacade, getPool: () => poolFacade, db: {} }));
// artifact-tagger (the revert's persistence) takes its pool from db/runtime.
vi.mock('../../../db/runtime.js', () => ({ getPool: () => poolFacade }));

// The revert runs through executeGovernedAnaOperation. Its evaluator, decision
// lifecycle read and learning-signal emitter are answered clean, exactly as in
// server/services/__tests__/governed-ana-execution.test.ts; the persistence
// under test — artifact-tagger — is real.
const govern = vi.hoisted(() => ({
  evaluate: () => ({
    evaluation: {
      context: { organizationId: '7', projectId: '1', actorId: '42', intendedAction: 'rollback', documentType: 'artifact_revert' },
      decision: { outcome: 'allow', rationale: 'ok', blockerCount: 0, warningCount: 0, consequenceCount: 0 },
      readiness: { level: 'review_ready', score: 80, blockers: [], warnings: [], evaluatedAt: new Date().toISOString(), evaluatedBy: 'test', confidence: 'moderate' },
      placement: { outcome: 'allowed', fallbackAcceptable: false },
      exportGate: { outcome: 'eligible', gateChecks: [], blockingReasons: [], remediationSteps: [] },
      publishGate: { outcome: 'eligible', gateChecks: [], blockingReasons: [], remediationSteps: [], dispatchReady: true },
      consequences: [],
      evaluatedAt: new Date().toISOString(),
    },
    decisionReference: { decisionId: 'dec_1', projectId: '1', intent: 'rollback', outcome: 'allow', actorId: '42', timestamp: new Date().toISOString() },
  }),
}));
vi.mock('../../../src/control-plane/governed-document-evaluator.js', () => ({
  evaluateAndInterceptGovernedDocument: govern.evaluate,
}));
vi.mock('../../governed-decision-repository.js', () => ({
  hasUnresolvedGovernedDecisions: async () => ({ hasUnresolved: false, unresolvedCount: 0, escalatedCount: 0, states: {} }),
}));
vi.mock('../../intelligence/rim-integration.js', () => ({ integrateSignal: () => ({ runId: 'rim_run_1' }) }));

type Row = Record<string, any>;
const q = async (sql: string, params?: unknown[]) => (await pg.query(sql, params as unknown[])).rows as Row[];

const ORG = 7;
const OTHER_ORG = 8;
const PROJECT = 1;
const SIGNER = 42;
const SIGNER_NAME = 'Quinn A. Lead';
const REASON = 'Signed for the IND 30-day safety update package';

// electronic_signatures in its pre-D6 physical shape, then the REAL D6
// migration on top (as governed-sign-esignature.pglite.integration.test.ts).
const ELECTRONIC_SIGNATURES_PRE_D6_DDL = `
CREATE TABLE electronic_signatures (
  id serial PRIMARY KEY, document_id integer NOT NULL, version_id integer NOT NULL,
  signature_type varchar(50) NOT NULL, signature_purpose text NOT NULL, signature_level integer DEFAULT 1,
  signer_id integer NOT NULL, signer_name text NOT NULL, signer_title text, signer_email text NOT NULL,
  authentication_method varchar(50) NOT NULL, authentication_timestamp timestamp NOT NULL,
  second_factor_verified boolean DEFAULT false, signature_hash varchar(256) NOT NULL,
  signature_meaning text, signature_manifest json, is_valid boolean DEFAULT true,
  verification_status varchar(50), verification_date timestamp, compliance_statement text,
  legal_disclaimer text, ip_address varchar(45), device_info json,
  signed_at timestamp DEFAULT now() NOT NULL, created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now(), organization_id integer,
  bound_payload_digest text NOT NULL DEFAULT '', superseded_by integer
);`;
const D6_MIGRATION = fs.readFileSync(
  path.join(__dirname, '../../../../migrations/20260813d_esignature_governed_unification.sql'),
  'utf8',
);
// concept2cure_thread_comments as migrations/phase13_review_threads_tasks.sql
// declares it, less the FKs whose referents are out of scope.
const THREAD_COMMENTS_DDL = `
CREATE TABLE concept2cure_thread_comments (
  id SERIAL PRIMARY KEY, comment_id TEXT NOT NULL UNIQUE, org_id INTEGER NOT NULL,
  thread_id INTEGER NOT NULL, artifact_id INTEGER NOT NULL, version_id INTEGER, parent_comment_id INTEGER,
  author_id INTEGER NOT NULL, author_name TEXT NOT NULL, author_role TEXT, body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'comment', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), edited_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ
);`;
const BASE_DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text, settings jsonb DEFAULT '{}'::jsonb);
CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL, name text);
`;

const signoff = (over: Partial<Part11Signoff> = {}): Part11Signoff => ({
  reasonForChange: REASON,
  signatureVerified: true,
  signaturePurpose: 'approval',
  verifiedAt: new Date(),
  authenticationMethod: 'password+mfa',
  secondFactorVerified: true,
  ...over,
});
const ctxWith = (s?: Part11Signoff) => ({ userId: SIGNER, organizationId: ORG, signoff: s });

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const asJson = (v: unknown): any => (typeof v === 'string' ? JSON.parse(v) : v);

async function signatures() {
  return q(`SELECT * FROM electronic_signatures ORDER BY id`);
}
async function signLedger() {
  return q(`SELECT a.*, l.sha256_chain FROM c2c_ana_actions a JOIN audit_logs l ON l.ana_action_id = a.id WHERE a.command = 'sign'`);
}

/** The signature store refuses writes: the electronic_signatures INSERT fails. */
async function withSignatureStoreDown<T>(fn: () => Promise<T>): Promise<T> {
  await pg.exec('ALTER TABLE electronic_signatures RENAME TO electronic_signatures_down');
  try {
    return await fn();
  } finally {
    await pg.exec('ALTER TABLE electronic_signatures_down RENAME TO electronic_signatures');
  }
}

const ARTIFACT_EXT = 'artifact_7f3c2a';
const V1 = 'Section 2.7.3 summary of clinical efficacy, version one: primary endpoint met in both pivotal studies with consistent effect sizes.';
const V2 = 'Section 2.7.3 summary of clinical efficacy, version two: primary endpoint met, with the subgroup analysis by region added for reviewers.';
const V3 = 'Section 2.7.3 summary of clinical efficacy, version three: primary endpoint met, subgroup analysis by region, and the sensitivity analyses.';

async function seedArtifact(orgId = ORG) {
  const [a] = await q(
    `INSERT INTO concept2cure_artifacts
       (artifact_id, project_id, organization_id, type, category, title, content, content_hash,
        version, ctd_section, status, created_by_id, metadata)
     VALUES ($1, $2, $3, 'regulatory_document', 'document', 'Summary of Clinical Efficacy', $4, $5, 3, '2.7.3', 'draft', $6, '{"origin":"seed"}')
     RETURNING id`,
    [ARTIFACT_EXT, PROJECT, orgId, V3, sha(V3), SIGNER],
  );
  // One row per version, the artifactVersionStore convention: the current
  // version is recorded too.
  for (const [v, c] of [[1, V1], [2, V2], [3, V3]] as const) {
    await q(
      `INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, content, content_hash, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [a.id, orgId, v, c, sha(c), SIGNER],
    );
  }
  return a.id as number;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(BASE_DDL);
  await pg.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', [
    'users', 'organization_users', 'concept2cure_conversations', 'concept2cure_artifacts', 'concept2cure_artifact_versions',
  ]));
  await pg.exec(extractTableDdl('migrations/0002_phase15_submission_ops.sql', ['c2c_submission_packages']));
  await pg.exec(extractTableDdl('db/migrations/20260317_global_regulatory_compliance.sql', ['gdpr_data_subject_requests']));
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(GOVERNED_ACTION_LEDGER_PGLITE_DDL);
  await pg.exec(ELECTRONIC_SIGNATURES_PRE_D6_DDL);
  await pg.exec(D6_MIGRATION);
  await pg.exec(`INSERT INTO organizations (id, name) VALUES (${ORG}, 'Concept2Cure'), (${OTHER_ORG}, 'Other')`);
  await pg.exec(`INSERT INTO projects (id, organization_id, name) VALUES (${PROJECT}, ${ORG}, 'BX-204')`);
  await import('../command-executor');
}, 60_000);
afterAll(async () => {
  await pg?.close();
});
beforeEach(async () => {
  await pg.exec(`
    DROP TABLE IF EXISTS concept2cure_thread_comments;
    DELETE FROM electronic_signatures; DELETE FROM c2c_ana_actions; DELETE FROM audit_logs;
    DELETE FROM concept2cure_artifact_versions; DELETE FROM concept2cure_artifacts;
    DELETE FROM concept2cure_conversations; DELETE FROM c2c_submission_packages;
    DELETE FROM gdpr_data_subject_requests; DELETE FROM organization_users; DELETE FROM users;
  `);
  await pg.exec(THREAD_COMMENTS_DDL);
  await q(
    `INSERT INTO users (id, email, name, password_hash, title) VALUES ($1, 'qa.lead@acme.test', $2, 'x', 'Director, Regulatory QA')`,
    [SIGNER, SIGNER_NAME],
  );
  await q(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'manager')`, [ORG, SIGNER]);
});

// ─────────────────────────────────────────────────────────────────────────────

describe('place_in_dossier signs the placement it makes', () => {
  it('writes the signature with the artifact target, meaning, content binding and verified factors', async () => {
    await seedArtifact();
    const { placeInDossier } = await import('../command-executor');
    const r = await placeInDossier(ctxWith(signoff()) as never, {
      projectId: PROJECT, artifactId: ARTIFACT_EXT as never, ctdSection: '2.7.3.1',
    });
    expect(r.success).toBe(true);

    const [art] = await q(`SELECT ctd_section FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT_EXT]);
    expect(art.ctd_section).toBe('2.7.3.1');

    const sigs = await signatures();
    expect(sigs).toHaveLength(1);
    const sig = sigs[0];
    expect(sig.signed_target).toBe(`artifact:${ARTIFACT_EXT}`);
    expect(sig.signature_meaning).toBe('approval');
    expect(sig.signature_purpose).toBe(REASON);
    expect(sig.signer_name).toBe(SIGNER_NAME);
    expect(sig.authentication_method).toBe('password+totp');
    expect(sig.second_factor_verified).toBe(true);
    expect(sig.binding_basis).toBe(BINDING_BASIS.C2C_ARTIFACT_VERSION_CONTENT);
    // "This content, at this version, placed here."
    expect(sig.bound_payload_digest).toBe(
      sha256CanonicalJson({ artifactId: ARTIFACT_EXT, version: 3, contentSha256: sha(V3), ctdSection: '2.7.3.1' }),
    );
    expect(asJson(sig.signature_manifest).command).toBe('place_in_dossier');
    expect(r.data?.signatureId).toBe(sig.id);

    const ledger = await signLedger();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].target).toBe(`artifact:${ARTIFACT_EXT}`);
    expect(ledger[0].surface).toBe('ana-governed-action');
  });

  it('without a verified sign-off it places nothing and signs nothing', async () => {
    await seedArtifact();
    const { placeInDossier } = await import('../command-executor');
    for (const s of [undefined, signoff({ signatureVerified: false }), signoff({ verifiedAt: undefined })]) {
      const r = await placeInDossier(ctxWith(s) as never, { projectId: PROJECT, artifactId: ARTIFACT_EXT as never, ctdSection: '2.7.3.1' });
      expect(r.success).toBe(false);
    }
    const [art] = await q(`SELECT ctd_section FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT_EXT]);
    expect(art.ctd_section).toBe('2.7.3');
    expect(await signatures()).toHaveLength(0);
    expect(await signLedger()).toHaveLength(0);
  });

  it('a failed signature write rolls the placement back', async () => {
    await seedArtifact();
    const { placeInDossier } = await import('../command-executor');
    const r = await withSignatureStoreDown(() =>
      placeInDossier(ctxWith(signoff()) as never, { projectId: PROJECT, artifactId: ARTIFACT_EXT as never, ctdSection: '2.7.3.1' }),
    );
    expect(r.success).toBe(false);
    const [art] = await q(`SELECT ctd_section FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT_EXT]);
    expect(art.ctd_section).toBe('2.7.3');
    expect(await signLedger()).toHaveLength(0);
  });

  it("refuses an artifact outside the caller's organization, writing nothing", async () => {
    await seedArtifact(OTHER_ORG);
    const { placeInDossier } = await import('../command-executor');
    const r = await placeInDossier(ctxWith(signoff()) as never, { projectId: PROJECT, artifactId: ARTIFACT_EXT as never, ctdSection: '2.7.3.1' });
    expect(r.success).toBe(false);
    expect(await signatures()).toHaveLength(0);
    expect(await signLedger()).toHaveLength(0);
  });
});

describe('create_submission_package signs the creation decision', () => {
  const params = { projectId: PROJECT, title: 'IND 30-day safety update', packageFamily: 'ind' as const, targetDate: '2026-11-02' };

  it('writes the signature over the ledger, claiming no content hash', async () => {
    const { createSubmissionPackage } = await import('../command-executor');
    const r = await createSubmissionPackage(ctxWith(signoff({ secondFactorVerified: false, authenticationMethod: 'password', signaturePurpose: 'authorship' })) as never, params);
    expect(r.success).toBe(true);
    const [pkg] = await q(`SELECT package_id FROM c2c_submission_packages`);

    const [sig] = await signatures();
    expect(sig.signed_target).toBe(`submission-package:${pkg.package_id}`);
    expect(sig.signature_meaning).toBe('authorship');
    expect(sig.authentication_method).toBe('password');
    expect(sig.second_factor_verified).toBe(false);
    expect(sig.binding_basis).toBe(BINDING_BASIS.GOVERNED_ACTION_LEDGER);
    const [ledger] = await signLedger();
    expect(sig.bound_payload_digest).toBe(ledger.sha256_chain);
    const manifest = asJson(sig.signature_manifest);
    expect(manifest.command).toBe('create_submission_package');
    expect(JSON.stringify(manifest)).not.toMatch(/contentSha256|content_sha256/);
    // The signer attests to the package definition.
    expect(asJson(ledger.payload)).toMatchObject({
      meaning: 'authorship', command: 'create_submission_package',
      projectId: PROJECT, packageFamily: 'ind', title: params.title, targetDate: params.targetDate,
    });
  });

  it('without a verified sign-off creates no package', async () => {
    const { createSubmissionPackage } = await import('../command-executor');
    const r = await createSubmissionPackage(ctxWith(signoff({ signaturePurpose: undefined })) as never, params);
    expect(r.success).toBe(false);
    expect(await q(`SELECT 1 FROM c2c_submission_packages`)).toHaveLength(0);
    expect(await signatures()).toHaveLength(0);
  });

  it('a failed signature write rolls the package back', async () => {
    const { createSubmissionPackage } = await import('../command-executor');
    const r = await withSignatureStoreDown(() => createSubmissionPackage(ctxWith(signoff()) as never, params));
    expect(r.success).toBe(false);
    expect(await q(`SELECT 1 FROM c2c_submission_packages`)).toHaveLength(0);
    expect(await signLedger()).toHaveLength(0);
  });
});

describe('revert_to_version signs the new version in the transaction that writes it', () => {
  const params = { projectId: PROJECT, artifactId: ARTIFACT_EXT as never, targetVersion: 1, confirmed: true };

  it('writes the reverted content as a new version, bound to that content and version', async () => {
    await seedArtifact();
    const { revertToVersion } = await import('../command-executor');
    const r = await revertToVersion(ctxWith(signoff({ signaturePurpose: 'review' })) as never, params);
    expect(r.error ?? r.message).not.toMatch(/failed/i);
    expect(r.success).toBe(true);

    const [art] = await q(`SELECT version, content, ctd_section FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT_EXT]);
    expect(art.version).toBe(4);
    expect(art.content).toBe(V1);

    const [sig] = await signatures();
    expect(sig.signed_target).toBe(`artifact:${ARTIFACT_EXT}`);
    expect(sig.signature_meaning).toBe('review');
    expect(sig.authentication_method).toBe('password+totp');
    expect(sig.second_factor_verified).toBe(true);
    expect(sig.binding_basis).toBe(BINDING_BASIS.C2C_ARTIFACT_VERSION_CONTENT);
    expect(sig.bound_payload_digest).toBe(
      sha256CanonicalJson({ artifactId: ARTIFACT_EXT, version: 4, contentSha256: sha(V1), ctdSection: '2.7.3' }),
    );
    expect(asJson(sig.signature_manifest)).toMatchObject({ command: 'revert_to_version', targetVersion: 1, newVersion: 4 });
  });

  it('without a verified sign-off writes no version', async () => {
    await seedArtifact();
    const { revertToVersion } = await import('../command-executor');
    const r = await revertToVersion(ctxWith(undefined) as never, params);
    expect(r.success).toBe(false);
    const [art] = await q(`SELECT version, content FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT_EXT]);
    expect(art.version).toBe(3);
    expect(art.content).toBe(V3);
    expect(await signatures()).toHaveLength(0);
  });

  it('a failed signature write rolls the new version back', async () => {
    await seedArtifact();
    const { revertToVersion } = await import('../command-executor');
    const r = await withSignatureStoreDown(() => revertToVersion(ctxWith(signoff()) as never, params));
    expect(r.success).toBe(false);
    const [art] = await q(`SELECT version, content FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT_EXT]);
    expect(art.version).toBe(3);
    expect(art.content).toBe(V3);
    expect(await signLedger()).toHaveLength(0);
  });
});

describe('erase_personal_data', () => {
  async function seedSubjectData() {
    const artifactPk = await seedArtifact();
    await q(
      `INSERT INTO concept2cure_conversations (conversation_id, project_id, organization_id, title, summary, created_by_id)
       VALUES ('conv_1', $1, $2, 'Call with the FDA project manager', 'Discussed my availability', $3)`,
      [PROJECT, ORG, SIGNER],
    );
    await q(
      `INSERT INTO concept2cure_thread_comments (comment_id, org_id, thread_id, artifact_id, author_id, author_name, body)
       VALUES ('cmt_1', $1, 1, $2, $3, $4, 'I will be on leave next week')`,
      [ORG, artifactPk, SIGNER, SIGNER_NAME],
    );
  }
  const erase = async (s?: Part11Signoff) => {
    const { erasePersonalData } = await import('../command-executor');
    return erasePersonalData(ctxWith(s) as never, { dataSubjectId: SIGNER });
  };
  const userRow = async () => (await q(`SELECT name, email FROM users WHERE id = $1`, [SIGNER]))[0];

  it('signs first: a self-erasure is signed under the pre-erasure name, bound to the ledger', async () => {
    await seedSubjectData();
    const r = await erase(signoff());
    expect(r.success).toBe(true);

    const [sig] = await signatures();
    expect(sig.signed_target).toBe(`data-subject:${SIGNER}`);
    expect(sig.signature_meaning).toBe('approval');
    expect(sig.signer_name).toBe(SIGNER_NAME);
    expect(sig.signer_email).toBe('qa.lead@acme.test');
    expect(sig.authentication_method).toBe('password+totp');
    expect(sig.binding_basis).toBe(BINDING_BASIS.GOVERNED_ACTION_LEDGER);
    const [ledger] = await signLedger();
    expect(sig.bound_payload_digest).toBe(ledger.sha256_chain);
    expect(asJson(ledger.payload)).toMatchObject({ dataSubjectId: SIGNER, command: 'erase_personal_data' });
    expect(asJson(ledger.payload).scope).toEqual(expect.arrayContaining(['users', 'concept2cure_conversations', 'concept2cure_thread_comments']));

    // The erasure itself happened.
    expect((await userRow()).name).toBe(`[ERASED USER ${SIGNER}]`);
    expect((await q(`SELECT summary FROM concept2cure_conversations`))[0].summary).toBe('[REDACTED PER GDPR ART.17]');
    expect((await q(`SELECT body FROM concept2cure_thread_comments`))[0].body).toBe('[REDACTED PER GDPR ART.17]');
    expect(await q(`SELECT 1 FROM gdpr_data_subject_requests WHERE data_subject_id = $1 AND status = 'completed'`, [String(SIGNER)])).toHaveLength(1);
  });

  // 2026-09-28: CHANGED from redaction to retention, deliberately. The erasure
  // used to overwrite concept2cure_artifacts title and content. Those are
  // regulated records (GxP retention; 21 CFR 11.10(c)) that GDPR Art. 17(3)(b)
  // exempts from erasure; the subject's identity on them is pseudonymised by
  // the users-row redaction instead.
  it('retains regulated artifact content and reports it with the legal basis', async () => {
    await seedSubjectData();
    const r = await erase(signoff());
    expect(r.success).toBe(true);
    const [art] = await q(`SELECT title, content FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT_EXT]);
    expect(art.title).toBe('Summary of Clinical Efficacy');
    expect(art.content).toBe(V3);
    expect(r.data?.retainedRegulatedArtifacts).toBe(1);
    expect(String(r.data?.retentionLegalBasis)).toMatch(/17\(3\)\(b\)/);
    expect(r.message).toMatch(/retained/i);
  });

  it('without a verified sign-off erases nothing', async () => {
    await seedSubjectData();
    const r = await erase(signoff({ signatureVerified: false }));
    expect(r.success).toBe(false);
    expect((await userRow()).name).toBe(SIGNER_NAME);
    expect(await signatures()).toHaveLength(0);
    expect(await q(`SELECT 1 FROM gdpr_data_subject_requests`)).toHaveLength(0);
  });

  it('a failed signature write rolls the whole erasure back', async () => {
    await seedSubjectData();
    const r = await withSignatureStoreDown(() => erase(signoff()));
    expect(r.success).toBe(false);
    expect((await userRow()).name).toBe(SIGNER_NAME);
    expect((await q(`SELECT summary FROM concept2cure_conversations`))[0].summary).toBe('Discussed my availability');
    expect(await q(`SELECT 1 FROM gdpr_data_subject_requests`)).toHaveLength(0);
  });

  it('a failing redaction statement returns failure with nothing committed', async () => {
    await seedSubjectData();
    // 42703 on the comments UPDATE: a real failure, not an absent table.
    await pg.exec(`ALTER TABLE concept2cure_thread_comments RENAME COLUMN body TO body_moved`);
    const r = await erase(signoff());
    expect(r.success).toBe(false);
    expect((await userRow()).name).toBe(SIGNER_NAME);
    expect((await q(`SELECT summary FROM concept2cure_conversations`))[0].summary).toBe('Discussed my availability');
    expect(await signatures()).toHaveLength(0);
    expect(await q(`SELECT 1 FROM gdpr_data_subject_requests`)).toHaveLength(0);
  });

  it('an absent table is reported as not applicable, not as zero, and the erasure completes', async () => {
    await seedSubjectData();
    await pg.exec(`DROP TABLE concept2cure_thread_comments`);
    const r = await erase(signoff());
    expect(r.success).toBe(true);
    expect(r.data?.redactedComments).toBeNull();
    expect(r.data?.notApplicable).toEqual(['concept2cure_thread_comments']);
    expect((await userRow()).name).toBe(`[ERASED USER ${SIGNER}]`);
    expect(await signatures()).toHaveLength(1);
  });

  it('the erasure record is not optional: a missing request table fails the erasure', async () => {
    await seedSubjectData();
    await pg.exec(`ALTER TABLE gdpr_data_subject_requests RENAME TO gdpr_data_subject_requests_down`);
    try {
      const r = await erase(signoff());
      expect(r.success).toBe(false);
      expect((await userRow()).name).toBe(SIGNER_NAME);
      expect(await signatures()).toHaveLength(0);
    } finally {
      await pg.exec(`ALTER TABLE gdpr_data_subject_requests_down RENAME TO gdpr_data_subject_requests`);
    }
  });
});

/* 2026-09-28. tagArtifact's "this section already has an artifact" branch
   merged metadata with `metadata || $7::jsonb`; concept2cure_artifacts.metadata
   is json, which has no `||`, so every write down that branch failed at plan
   time — the same defect the revert work fixed on the artifact-id branch. */
describe('tagArtifact into a section that already has an artifact', () => {
  it('updates that artifact, merging its metadata', async () => {
    await seedArtifact();
    const { tagArtifact } = await import('../../artifact-tagger');
    await tagArtifact({
      projectId: PROJECT,
      organizationId: ORG,
      userId: SIGNER,
      sectionCode: '2.7.3',
      title: 'Summary of Clinical Efficacy',
      content: 'Section 2.7.3, revised by the section write.',
      metadata: { revisedBy: 'section-write' },
    });
    const [row] = await q(`SELECT content, version, metadata FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT_EXT]);
    expect(row.content).toBe('Section 2.7.3, revised by the section write.');
    expect(Number(row.version)).toBe(4);
    expect(asJson(row.metadata)).toMatchObject({ origin: 'seed', revisedBy: 'section-write' });
  });
});
