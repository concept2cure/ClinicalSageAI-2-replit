/**
 * Ledger L37 — `electronic_signatures` has ONE writer, and the release path
 * proves it against a real (in-process PGlite) Postgres.
 *
 * WHAT WAS WRONG. Two conforming INSERT sites remained.
 * `services/part11/signature-persistence.persistElectronicSignature` served
 * POST /api/esignature/sign and every governed sign;
 * `part11ComplianceService.createElectronicSignature` — the writer behind
 * POST /api/submissions/:id/sign-release — had its own Drizzle
 * `.insert(electronicSignatures)`. Neither was unsafe: both bound content and
 * both set the org. They had, however, already drifted. The shared writer
 * writes all 26 columns of the table and REFUSES a row with no anchor, no
 * signer identity, no attribution hash, no §11.70 digest or no org. The
 * release builder wrote 20 columns, guarded none of that, and had no way at
 * all to express `binding_basis` — so a release signature's
 * `bound_payload_digest` sat in the same column as a document signature's
 * while being a digest of something else entirely, and nothing on the row
 * said which. That is the difference an inspector's "is this still the content
 * that was signed?" turns on.
 *
 * WHAT IS LOCKED HERE. The release path now composes its record and hands it
 * to the shared writer on its OWN transaction. These tests run the real
 * service against real table shapes, because the claims worth making are
 * about rows that actually landed:
 *
 *   • every column the deleted builder wrote is still written, with the same
 *     value — a shared writer that quietly drops a column is not a migration;
 *   • the row now also states its `binding_basis`, and states a DIFFERENT one
 *     for a caller-supplied release digest than for a version-content digest,
 *     because they are digests of different things;
 *   • the signature and its §11.10(e) device_audit_trail row still commit or
 *     roll back TOGETHER — routing through the shared writer must not move the
 *     INSERT off the caller's transaction;
 *   • the shared writer's fail-closed guards now cover this path too;
 *   • the §11.200 attribution hash re-derives from the persisted manifest bytes
 *     on BOTH call paths, from the one writer;
 *   • (the source-level "no second INSERT" guard lives with its siblings in
 *     signature-write-path-single.test.ts.)
 *
 * @compliance 21 CFR Part 11 §11.10(e), §11.50, §11.70, §11.100, §11.200
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

// `db` is hoisted so the service module and this file share one instance.
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../db', () => ({
  get db() {
    return holder.db;
  },
}));

// The best-effort SECONDARY audit log is a separate concern with its own tests
// and must not need a database here. The DURABLE §11.10(e) row is the
// device_audit_trail write inside the transaction, which is exercised for real.
// The default export's logAction is the best-effort SECONDARY log and is
// stubbed. `writeChainedAuditRow` is NOT stubbed — it is the real chained write
// the signature transaction now performs (L138), and stubbing it would make the
// atomicity test below assert nothing.
vi.mock('../auditService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auditService')>();
  return {
    ...actual,
    default: { logAction: vi.fn(async () => ({ persisted: true })) },
  };
});

import part11ComplianceService from '../part11ComplianceService';
import {
  BINDING_BASIS,
  persistElectronicSignature,
} from '../part11/signature-persistence';
import { buildVersionBindingDigest } from '../part11/version-binding';

// ── Real table shapes (shared/schema.ts). FKs omitted — their referents are
//    out of scope here, exactly as in the sibling governed-sign PGlite suite.
const DDL = `
CREATE TABLE users (
  id                    SERIAL PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  password_hash         TEXT NOT NULL,
  title                 TEXT,
  status                TEXT NOT NULL DEFAULT 'active',
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until          TIMESTAMP,
  last_failed_login     TIMESTAMP
);

CREATE TABLE document_versions (
  id             SERIAL PRIMARY KEY,
  document_id    INTEGER NOT NULL,
  version_number VARCHAR(20) NOT NULL,
  version_label  VARCHAR(50),
  content        TEXT NOT NULL,
  status         VARCHAR(50) NOT NULL DEFAULT 'draft',
  is_published   BOOLEAN DEFAULT false,
  created_by_id  INTEGER NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP DEFAULT now()
);

CREATE TABLE electronic_signatures (
  id                      SERIAL PRIMARY KEY,
  document_id             INTEGER,
  version_id              INTEGER,
  signed_target           TEXT,
  binding_basis           TEXT,
  signature_type          VARCHAR(50) NOT NULL,
  signature_purpose       TEXT NOT NULL,
  signature_level         INTEGER DEFAULT 1,
  signer_id               INTEGER NOT NULL,
  signer_name             TEXT NOT NULL,
  signer_title            TEXT,
  signer_email            TEXT NOT NULL,
  authentication_method   VARCHAR(50) NOT NULL,
  authentication_timestamp TIMESTAMP NOT NULL,
  second_factor_verified  BOOLEAN DEFAULT false,
  signature_hash          VARCHAR(256) NOT NULL,
  signature_meaning       TEXT,
  signature_manifest      JSON,
  is_valid                BOOLEAN DEFAULT true,
  verification_status     VARCHAR(50),
  verification_date       TIMESTAMP,
  compliance_statement    TEXT,
  legal_disclaimer        TEXT,
  ip_address              VARCHAR(45),
  device_info             JSON,
  signed_at               TIMESTAMP NOT NULL DEFAULT now(),
  created_at              TIMESTAMP NOT NULL DEFAULT now(),
  updated_at              TIMESTAMP DEFAULT now(),
  organization_id         INTEGER,
  bound_payload_digest    TEXT NOT NULL DEFAULT '',
  superseded_by           INTEGER,
  CONSTRAINT electronic_signatures_anchor_ck CHECK (
    (document_id IS NOT NULL AND version_id IS NOT NULL) OR signed_target IS NOT NULL
  )
);

CREATE TABLE audit_logs (
  id            TEXT PRIMARY KEY,
  tenant_id     INTEGER,
  user_id       INTEGER,
  action        TEXT,
  table_name    TEXT,
  record_id     TEXT,
  actor_id      INTEGER,
  target        TEXT,
  payload_hash  TEXT,
  sha256_chain  TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  hmac_seal     TEXT,
  old_values    JSONB,
  new_values    JSON,
  ip_address    TEXT,
  user_agent    TEXT
);

CREATE TABLE device_audit_trail (
  id                  SERIAL PRIMARY KEY,
  organization_id     INTEGER NOT NULL,
  entity_type         TEXT NOT NULL,
  entity_id           INTEGER NOT NULL,
  action              TEXT NOT NULL,
  previous_values     JSON,
  new_values          JSON,
  changed_fields      TEXT[],
  change_reason       TEXT,
  user_id             INTEGER NOT NULL,
  user_name           TEXT NOT NULL,
  user_role           TEXT,
  ip_address          TEXT,
  user_agent          TEXT,
  session_id          TEXT,
  electronic_signature TEXT,
  signature_timestamp TIMESTAMP,
  signature_meaning   TEXT,
  compliance_standard TEXT DEFAULT '21 CFR Part 11',
  data_integrity_check TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP DEFAULT now()
);
`;

const ORG = 77;
const SIGNER = 501;
const DOC = 9001;
const PASSWORD = 'correct horse battery staple';
const CONTENT = '<h1>Module 2.5 Clinical Overview</h1><p>Final for release.</p>';

let pg: PGlite;
let versionId: number;

/** json column value → object (drivers may hand back text or a parsed object). */
const asManifest = (v: unknown): any => (typeof v === 'string' ? JSON.parse(v) : v);
/** json column value → the exact persisted bytes (compact JSON round-trips). */
const manifestBytes = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));

const rows = async (sql: string, params: unknown[] = []) =>
  ((await pg.query(sql, params)) as { rows: any[] }).rows;

const signRelease = (over: Record<string, unknown> = {}) =>
  part11ComplianceService.createElectronicSignature({
    userId: SIGNER,
    organizationId: ORG,
    documentId: DOC,
    documentType: 'submission-release',
    signatureReason: 'Release for FDA gateway transmission (reviewed and approved)',
    signatureMeaning: 'approval',
    password: PASSWORD,
    signerRole: 'Head of Regulatory Affairs',
    ...over,
  } as any);

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
  holder.db = drizzle(pg) as any;

  await pg.query(
    `INSERT INTO users (id, email, name, password_hash, title, status)
     VALUES ($1, $2, $3, $4, $5, 'active')`,
    [SIGNER, 'ra.head@sponsor.test', 'Dana R. Head', bcrypt.hashSync(PASSWORD, 4), 'VP, Regulatory Affairs'],
  );
  const [v] = await rows(
    `INSERT INTO document_versions (document_id, version_number, content, created_by_id)
     VALUES ($1, '2.0', $2, $3) RETURNING id`,
    [DOC, CONTENT, SIGNER],
  );
  versionId = Number(v.id);
});

afterEach(async () => {
  await pg.close();
});

describe('release signing goes through the one electronic_signatures writer', () => {
  it('writes exactly one row, carrying every column the deleted builder wrote', async () => {
    const result = await signRelease();
    const sigs = await rows(`SELECT * FROM electronic_signatures`);
    expect(sigs).toHaveLength(1);
    const sig = sigs[0];

    expect(Number(result.signatureId)).toBe(Number(sig.id));

    // Anchor + tenant scope.
    expect(Number(sig.document_id)).toBe(DOC);
    expect(Number(sig.version_id)).toBe(versionId);
    expect(Number(sig.organization_id)).toBe(ORG);

    // §11.50 manifestation: printed name, meaning, reason, date/time.
    expect(Number(sig.signer_id)).toBe(SIGNER);
    expect(sig.signer_name).toBe('Dana R. Head');
    expect(sig.signer_email).toBe('ra.head@sponsor.test');
    expect(sig.signer_title).toBe('VP, Regulatory Affairs');
    expect(sig.signature_meaning).toBe('approval');
    expect(sig.signature_purpose).toBe(
      'Release for FDA gateway transmission (reviewed and approved)',
    );
    expect(sig.signature_type).toBe('submission-release');
    expect(sig.signed_at).toBeTruthy();
    expect(sig.authentication_timestamp).toBeTruthy();

    // §11.200 factors, exactly as this path verifies them.
    expect(sig.authentication_method).toBe('password');
    expect(sig.second_factor_verified).toBe(false);

    // Columns the deleted builder set explicitly — none silently dropped.
    expect(Number(sig.signature_level)).toBe(1);
    expect(sig.verification_status).toBe('valid');
    expect(sig.compliance_statement).toBe('Electronic signature complies with 21 CFR Part 11');
    expect(sig.is_valid).toBe(true);

    // §11.70 content binding: the digest of the version's ACTUAL stored bytes.
    expect(sig.bound_payload_digest).toBe(
      buildVersionBindingDigest({
        documentId: DOC,
        versionId,
        versionNumber: '2.0',
        content: CONTENT,
      }),
    );

    // The signer's role snapshot the caller passed survives on the manifest.
    const manifest = asManifest(sig.signature_manifest);
    expect(manifest.signerRole).toBe('Head of Regulatory Affairs');
    expect(manifest.boundPayloadDigest).toBe(sig.bound_payload_digest);
  });

  it('states the binding basis — the column the deleted builder could not express', async () => {
    await signRelease();
    const [sig] = await rows(`SELECT binding_basis FROM electronic_signatures`);
    expect(sig.binding_basis).toBe(BINDING_BASIS.DOCUMENT_VERSION_CONTENT);
  });

  it('a caller-supplied release digest is recorded under its OWN basis, not the version-content one', async () => {
    // The orchestrator's release digest is a digest of the assembled package,
    // not of the version's bytes. Same column, different question — so the row
    // has to say which, or re-derivation silently checks the wrong thing.
    const releaseDigest = createHash('sha256').update('assembled-release-package').digest('hex');
    await signRelease({ boundPayloadDigest: releaseDigest });

    const [sig] = await rows(`SELECT binding_basis, bound_payload_digest FROM electronic_signatures`);
    expect(sig.bound_payload_digest).toBe(releaseDigest);
    expect(sig.binding_basis).toBe(BINDING_BASIS.SUBMISSION_RELEASE_PAYLOAD);
    expect(sig.binding_basis).not.toBe(BINDING_BASIS.DOCUMENT_VERSION_CONTENT);
  });

  it('§11.200: the attribution hash re-derives from the persisted manifest bytes', async () => {
    await signRelease();
    const [sig] = await rows(`SELECT signature_hash, signature_manifest FROM electronic_signatures`);
    expect(createHash('sha256').update(manifestBytes(sig.signature_manifest)).digest('hex')).toBe(
      sig.signature_hash,
    );
  });

  it('§11.10(e) ATOMIC: if the audit row cannot be written, no signature row survives', async () => {
    // The signature INSERT now happens inside the shared writer. It must still
    // be on the caller's transaction: a signature that commits while its audit
    // event rolls back is a permanent, unaccounted-for signed act.
    await pg.exec(`DROP TABLE device_audit_trail`);

    await expect(signRelease()).rejects.toThrow();
    expect(await rows(`SELECT * FROM electronic_signatures`)).toHaveLength(0);
  });

  it('§11.10(e) ATOMIC, the other way: a refused signature leaves no audit event', async () => {
    // organizationId is not a number → the shared writer refuses the row. The
    // device_audit_trail write must go with it.
    await expect(signRelease({ organizationId: Number.NaN })).rejects.toThrow(/organizationId/i);
    expect(await rows(`SELECT * FROM electronic_signatures`)).toHaveLength(0);
    expect(await rows(`SELECT * FROM device_audit_trail`)).toHaveLength(0);
  });

  it('the signature and its audit event land together on the happy path', async () => {
    const result = await signRelease();
    const audit = await rows(`SELECT * FROM device_audit_trail`);
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe('ELECTRONIC_SIGNATURE_CREATED');
    expect(audit[0].entity_type).toBe('submission-release');
    expect(Number(audit[0].entity_id)).toBe(DOC);
    expect(Number(audit[0].user_id)).toBe(SIGNER);
    expect(audit[0].user_name).toBe('Dana R. Head');
    expect(Number(result.signatureId)).toBeGreaterThan(0);
  });

  it('refuses to sign content that is not there (§11.70 fails closed)', async () => {
    await pg.query(`UPDATE document_versions SET content = '' WHERE id = $1`, [versionId]);
    await expect(signRelease()).rejects.toThrow(/no stored content/i);
    expect(await rows(`SELECT * FROM electronic_signatures`)).toHaveLength(0);
  });
});

describe('both call paths write through the same writer, into the same shape', () => {
  it('the document path and the release path produce rows with the same stated columns', async () => {
    // Release path: through part11ComplianceService.
    await signRelease();

    // Document path: /api/esignature/sign calls persistElectronicSignature on a
    // pg-style client directly. Same writer, same table, same column set.
    const signedAt = new Date();
    const boundPayloadDigest = buildVersionBindingDigest({
      documentId: DOC,
      versionId,
      versionNumber: '2.0',
      content: CONTENT,
    });
    const manifest = {
      documentId: DOC,
      versionId,
      signerId: SIGNER,
      boundPayloadDigest,
      signedAt: signedAt.toISOString(),
    };
    await persistElectronicSignature(
      { query: (sql: string, params?: unknown[]) => pg.query(sql, params) as Promise<{ rows: any[] }> },
      {
        documentId: DOC,
        versionId,
        bindingBasis: BINDING_BASIS.DOCUMENT_VERSION_CONTENT,
        signatureType: 'approval',
        signaturePurpose: 'Approve Module 2.5 for release',
        signerId: SIGNER,
        signerName: 'Dana R. Head',
        signerTitle: 'VP, Regulatory Affairs',
        signerEmail: 'ra.head@sponsor.test',
        authenticationMethod: 'password+totp',
        authenticationTimestamp: signedAt,
        secondFactorVerified: true,
        signatureHash: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
        signatureMeaning: 'approval',
        signatureManifest: manifest,
        isValid: true,
        signedAt,
        boundPayloadDigest,
        organizationId: ORG,
      },
    );

    const all = await rows(`SELECT * FROM electronic_signatures ORDER BY id`);
    expect(all).toHaveLength(2);
    for (const sig of all) {
      // Every row from the one writer answers the same questions.
      expect(sig.binding_basis).toBeTruthy();
      expect(sig.bound_payload_digest).toMatch(/^[0-9a-f]{64}$/);
      expect(Number(sig.organization_id)).toBe(ORG);
      expect(sig.signer_name).toBe('Dana R. Head');
      expect(sig.signer_email).toBe('ra.head@sponsor.test');
      expect(
        createHash('sha256').update(manifestBytes(sig.signature_manifest)).digest('hex'),
      ).toBe(sig.signature_hash);
    }
  });
});

describe('the release audit event commits WITH the signature, or not at all (L138)', () => {
  const releaseEvent = {
    tenantId: ORG,
    userId: SIGNER,
    action: 'release_signature_created',
    resourceType: 'submission_release',
    resourceId: 'run-123',
  };

  it('writes the route-level event on the signature transaction', async () => {
    await signRelease({ transactionalAuditEvent: releaseEvent });
    const [audit] = await rows(
      `SELECT action, tenant_id, actor_id, target, sha256_chain FROM audit_logs WHERE action = $1`,
      ['release_signature_created'],
    );
    expect(audit, 'the release event must be persisted').toBeDefined();
    expect(Number(audit.tenant_id)).toBe(ORG);
    expect(Number(audit.actor_id)).toBe(SIGNER);
    expect(audit.target).toBe('submission_release:run-123');
    // Chained, not a bare row — §11.10(e) links each entry to the previous.
    expect(audit.sha256_chain).toEqual(expect.any(String));
  });

  it('REGRESSION: an unwritable audit row leaves NO signature behind', async () => {
    // The property L138 exists for, and the only test here that fails if the
    // write leaves the transaction. The route used to log this event after the
    // signature had already committed on another connection, so an audit outage
    // produced a committed signature with no route-level event and a 200.
    //
    // Break the audit table specifically — the signature's own INSERT and its
    // device_audit_trail row are untouched, so if the two are not atomic the
    // signature commits and this assertion finds it.
    await pg.exec('ALTER TABLE audit_logs RENAME COLUMN sha256_chain TO sha256_chain_moved');

    await expect(signRelease({ transactionalAuditEvent: releaseEvent })).rejects.toThrow();

    const sigs = await rows(`SELECT id FROM electronic_signatures`);
    expect(sigs, 'a signature that could not be audited must not exist').toHaveLength(0);
    // And nothing half-landed on the way there either.
    const trail = await rows(`SELECT id FROM device_audit_trail`);
    expect(trail, 'the device_audit_trail row rolls back with it').toHaveLength(0);
  });
});
