/**
 * verifiedSealService — E1, Part 11 "verified-and-sealed" export.
 *
 * `sealVerifiedVersion` is the SERVER side of turning AnA's "verify against my
 * source" verdict into auditable evidence. Given verified content + a §11.50
 * manifestation, it persists — in ONE transaction (mirroring the BEGIN/COMMIT
 * pattern in compute/artifactWriteback.ts) —:
 *
 *   1. a `concept2cure_artifact_versions` row (only when Build 1 has not already
 *      persisted this version — see the Build-1 integration points below),
 *   2. a SealedRecord (SHA-256 contentHash, aiDisclosed, sealedAt, atoms) recorded
 *      as a `concept2cure_signatures` row whose `signature_manifest` carries the
 *      report-os SealedRecord, plus a provenance event, and
 *   3. a `regulatory_audit_logs` entry (§11.10(e)).
 *
 * Sealing is BLOCKED for sample/draft content (guardSampleContent) and for any
 * content that did not verify clean. The §11.50 meaning enum (AUTHOR | REVIEWER
 * | APPROVER) is enforced server-side via validateSealManifestation.
 *
 * ── Build-1 integration (CLOSED in E11) ──
 *   • `input.artifactPk` / `input.artifactExternalId`: Build 1 persists the draft
 *     to the governed artifact tables and surfaces the EXTERNAL id (`artifact_xxx`)
 *     to the client (server `artifact_version_saved` SSE). The client threads that
 *     external id here; we resolve its PK org-scoped and seal the EXISTING row.
 *   • `input.existingVersionId` / `input.existingVersionNumber`: the client knows
 *     the persisted version by NUMBER (not row PK). When the number is supplied we
 *     resolve the `concept2cure_artifact_versions` row PK (org-scoped) and seal it
 *     in place — no second version row.
 *   • The fallback artifact/version insert below only runs when NO persisted row
 *     can be resolved (e.g. an in-session draft that never reached Build 1), so the
 *     seal always has a durable target. The common path is now the persisted row.
 *
 * The pool is injected so the transaction is unit-testable without a live DB.
 */

import crypto from 'node:crypto';
import { resolveSignerIdentity } from '../part11/resolve-signer-identity.js';

import { getPool } from '../../db';
import {
  buildVerifiedSealedRecord,
  guardSampleContent,
  meaningToSignaturePurpose,
  validateSealManifestation,
  type SealManifestationInput,
} from './verifiedSeal/helpers';
import type { SealedRecord } from '../report-os/sealing/types';

/** Minimal transactional client surface we need (matches `pg` PoolClient). */
export interface SealPoolClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
  release: () => void;
}
export interface SealPool {
  connect: () => Promise<SealPoolClient>;
}

export interface SealVerifiedVersionInput {
  organizationId: number;
  projectId: number;
  userId: number;
  /** Printed name of the signer for the manifestation (denormalized). */
  signerName: string;
  signerEmail?: string | null;
  signerRole?: string | null;

  /** The verified document. */
  title: string;
  content: string;
  ctdSection?: string | null;

  /** The §11.50 manifestation (meaning enum enforced server-side). */
  manifestation: SealManifestationInput;

  /**
   * The `verify_docx_against_source` verdict for THIS content. Sealing is
   * refused unless `ok === true`: you may only seal a clean verification.
   */
  verification: { ok: boolean; message?: string };

  /** Caller-asserted sample/draft signals (block sealing). */
  isSample?: boolean;
  isDraft?: boolean;

  /** Optional provenance atoms (e.g. the source the doc was verified against). */
  atoms?: SealedRecord['atoms'];

  // ── Build-1 integration points ──
  /** Build 1: PK of the already-persisted `concept2cure_artifacts` row. */
  artifactPk?: number;
  /** Build 1: external id (`artifact_xxx`) of the persisted artifact. */
  artifactExternalId?: string;
  /** Build 1: PK of the already-persisted `concept2cure_artifact_versions` row. */
  existingVersionId?: number;
  /** Build 1: the version number of the row referenced by `existingVersionId`. */
  existingVersionNumber?: number;

  /** For the audit trail. */
  ipAddress?: string | null;
  /** Set true only after the server verified the signer's re-authentication. */
  signatureVerified?: boolean;
  secondFactorVerified?: boolean;
}

export interface SealVerifiedVersionResult {
  artifactId: string;
  artifactPk: number;
  versionId: number;
  version: number;
  signatureId: string;
  provenanceEventId: string;
  auditId: string;
  sealedRecord: SealedRecord;
}

export class SealBlockedError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400,
  ) {
    super(message);
    this.name = 'SealBlockedError';
  }
}

/**
 * Seal a verified version under a Part 11 §11.50 manifestation. Validates and
 * guards BEFORE opening a transaction, then persists version (if needed) +
 * sealed-record signature + provenance + audit atomically.
 */
export async function sealVerifiedVersion(
  input: SealVerifiedVersionInput,
  pool: SealPool = getPool() as unknown as SealPool,
): Promise<SealVerifiedVersionResult> {
  // ── Fail-closed gates (no DB work until these pass) ──
  if (!input.verification || input.verification.ok !== true) {
    throw new SealBlockedError(
      'Only a document that has verified clean against its source can be sealed.',
      'NOT_VERIFIED',
    );
  }

  const guard = guardSampleContent({
    title: input.title,
    content: input.content,
    isSample: input.isSample,
    isDraft: input.isDraft,
  });
  if (guard.blocked) {
    throw new SealBlockedError(guard.reason ?? 'This content cannot be sealed.', 'SAMPLE_BLOCKED');
  }

  const validated = validateSealManifestation(input.manifestation);
  if (!validated.ok || !validated.manifestation) {
    throw new SealBlockedError(validated.error ?? 'Invalid signature manifestation.', validated.code ?? 'INVALID_MANIFESTATION');
  }
  const manifestation = validated.manifestation;
  const signaturePurpose = meaningToSignaturePurpose(manifestation.meaning);

  const now = new Date();
  const sealedAt = now.toISOString();
  const sealedRecord = buildVerifiedSealedRecord({
    content: input.content,
    atoms: input.atoms,
    sealedAt,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Resolve / create the artifact (Build-1 integration point) ──
    let artifactPk = input.artifactPk;
    let artifactExternalId = input.artifactExternalId;

    // Build 1 (E11): the client knows the persisted artifact only by its
    // external id (`artifact_xxx`), not its PK. When the external id is supplied
    // (and the PK is not), resolve the PK org-scoped so we seal the EXISTING
    // persisted artifact row — never a fallback. Tenant isolation: the lookup is
    // bound to organizationId, so a foreign external id resolves to nothing and
    // falls through to the guarded fallback insert below.
    if (!artifactPk && artifactExternalId) {
      const found = await client.query(
        `SELECT id FROM concept2cure_artifacts
          WHERE artifact_id = $1 AND organization_id = $2
          LIMIT 1`,
        [artifactExternalId, input.organizationId],
      );
      if (found.rows.length > 0) {
        artifactPk = found.rows[0].id as number;
      }
    }

    if (!artifactPk || !artifactExternalId) {
      // TODO(build-1): When Build 1 persists the artifact, this fallback insert
      // is removed and `artifactPk`/`artifactExternalId` are required inputs.
      artifactExternalId = `artifact_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const artifactInsert = await client.query(
        `INSERT INTO concept2cure_artifacts (
          artifact_id, project_id, organization_id, type, category, title, content,
          content_hash, version, ctd_section, status, created_by_id, metadata, created_at, updated_at
        ) VALUES ($1,$2,$3,'regulatory_document','document',$4,$5,$6,1,$7,'draft',$8,$9,$10,$10)
        RETURNING id`,
        [
          artifactExternalId,
          input.projectId,
          input.organizationId,
          input.title,
          input.content,
          sealedRecord.contentHash,
          input.ctdSection ?? null,
          input.userId,
          JSON.stringify({ source: 'ana_verified_seal', governed: true, sealedPresent: true }),
          now,
        ],
      );
      artifactPk = artifactInsert.rows[0].id;
    }

    // ── Resolve / create the version (Build-1 integration point) ──
    let versionId = input.existingVersionId;
    let versionNumber = input.existingVersionNumber ?? 1;

    // Build 1 (E11): the client knows the persisted version by its number, not
    // its row PK. When we have a resolved artifact PK and a version number (but
    // no version-row PK), bind to the EXISTING `concept2cure_artifact_versions`
    // row so the seal points at the persisted version — not a fresh insert.
    // Org-scoped for tenant isolation; a miss falls through to the guarded
    // fallback insert below.
    if (!versionId && artifactPk && input.existingVersionNumber != null) {
      const foundVersion = await client.query(
        `SELECT id, version FROM concept2cure_artifact_versions
          WHERE artifact_id = $1 AND organization_id = $2 AND version = $3
          LIMIT 1`,
        [artifactPk, input.organizationId, input.existingVersionNumber],
      );
      if (foundVersion.rows.length > 0) {
        versionId = foundVersion.rows[0].id as number;
        versionNumber = Number(foundVersion.rows[0].version);
      }
    }

    if (!versionId) {
      // TODO(build-1): When Build 1 persists the version, pass `existingVersionId`
      // (+ `existingVersionNumber`) and this insert is skipped.
      const versionInsert = await client.query(
        `INSERT INTO concept2cure_artifact_versions (
          artifact_id, organization_id, version, content, content_hash, change_description, created_by_id, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
        RETURNING id, version`,
        [
          artifactPk,
          input.organizationId,
          versionNumber,
          input.content,
          sealedRecord.contentHash,
          'Sealed verified version (verified against source)',
          input.userId,
          now,
        ],
      );
      versionId = versionInsert.rows[0].id;
      versionNumber = versionInsert.rows[0].version;
    }

    // ── The SealedRecord, recorded as an append-only signature row ──
    // §11.50 printed name — resolved from the membership record on THIS
    // transaction, not taken from the caller. `manifestation.printedName` is
    // whatever the client sent, and `input.signerEmail ?? ''` used to put an
    // empty string into a NOT NULL column that an inspector reads as the
    // signer's own identification. The signature hash below covers the printed
    // name, so hashing a caller-supplied one means the hash attests to a claim
    // the server never verified.
    const signer = await resolveSignerIdentity(
      client,
      input.userId,
      input.organizationId,
      'verified_seal',
    );
    // A client-declared name that disagrees with the record is preserved in the
    // manifest rather than erased — a discrepancy an inspector can see beats one
    // silently overwritten — but the resolved name is what the row asserts.
    const declaredPrintedName =
      manifestation.printedName && manifestation.printedName !== signer.name
        ? manifestation.printedName
        : null;
    const signatureId = `sig_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const signatureHash = crypto
      .createHash('sha256')
      .update(`${signatureId}:${sealedRecord.contentHash}:${signer.name}:${sealedAt}`)
      .digest('hex');
    await client.query(
      `INSERT INTO concept2cure_signatures (
        signature_id, artifact_id, artifact_version_id, organization_id,
        signature_type, signature_purpose, signature_meaning,
        signer_id, signer_name, signer_email, signer_role,
        authentication_method, authentication_timestamp, second_factor_verified,
        signature_hash, signature_manifest, ip_address, status, signed_at, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'active',$18,$18,$18
      )`,
      [
        signatureId,
        artifactPk,
        versionId,
        input.organizationId,
        signaturePurpose,
        signaturePurpose,
        manifestation.reasonForChange,
        input.userId,
        signer.name,
        signer.email,
        input.signerRole ?? null,
        'password' + (input.secondFactorVerified ? '+mfa' : ''),
        now,
        input.secondFactorVerified === true,
        signatureHash,
        JSON.stringify({
          part: '21 CFR Part 11 §11.50',
          meaning: manifestation.meaning,
          printedName: signer.name,
          declaredPrintedName,
          dateTimeUtc: sealedAt,
          reasonForChange: manifestation.reasonForChange,
          sealedRecord,
        }),
        input.ipAddress ?? null,
        now,
      ],
    );

    // ── Provenance event (append-only lineage) ──
    const provenanceEventId = `prov_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await client.query(
      // No `updated_at` — the table has none, in any lineage or Drizzle model,
      // and the comment above is the reason: an append-only lineage row records
      // a moment, so `created_at` IS its only time. Postgres rejects an unknown
      // column at PLAN time (42703), so naming it failed this seal write on
      // EVERY execution. Found by ci:insert-columns-declared after the same
      // defect was fixed by hand in exportGovernance.ts and artifactWriteback.ts
      // and this third site was missed — which is the argument for the guard.
      `INSERT INTO concept2cure_provenance_events (
        event_id, artifact_id, artifact_version_id, organization_id, event_type, event_action,
        actor_id, actor_name, actor_email, details, source_description, backend_route, backend_service, ip_address, created_at
      ) VALUES ($1,$2,$3,$4,'approval','verified_seal',$5,$6,$7,$8,$9,$10,'ana-verified-seal',$11,$12)`,
      [
        provenanceEventId,
        artifactPk,
        versionId,
        input.organizationId,
        input.userId,
        signer.name,
        signer.email,
        JSON.stringify({
          sealedAt,
          contentHash: sealedRecord.contentHash,
          aiDisclosed: sealedRecord.aiDisclosed,
          atomCount: sealedRecord.atomCount,
          meaning: manifestation.meaning,
          verificationMessage: input.verification.message ?? null,
        }),
        'Verified-and-sealed export (verify_docx_against_source clean)',
        '/api/ana-ri/seal-verified-version',
        input.ipAddress ?? '127.0.0.1',
        now,
      ],
    );

    // ── §11.10(e) audit log ──
    const auditId = `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await client.query(
      `INSERT INTO regulatory_audit_logs (
        audit_id, organization_id, entity_type, entity_id, action, action_category,
        previous_value, new_value, user_id, user_name, user_role, ip_address,
        is_gxp_relevant, timestamp, metadata, created_at, updated_at
      ) VALUES ($1,$2,'artifact_version',$3,'SEAL_VERIFIED','signature',NULL,$4,$5,$6,$7,$8,TRUE,$9,$10,$9,$9)`,
      [
        auditId,
        input.organizationId,
        String(versionId),
        JSON.stringify({
          title: input.title,
          meaning: manifestation.meaning,
          contentHash: sealedRecord.contentHash,
          signatureId,
        }),
        input.userId,
        manifestation.printedName,
        input.signerRole ?? 'signer',
        input.ipAddress ?? '127.0.0.1',
        now,
        JSON.stringify({
          source: 'ana_verified_seal',
          reasonForChange: manifestation.reasonForChange,
          sealedAt,
          aiDisclosed: sealedRecord.aiDisclosed,
        }),
      ],
    );

    await client.query('COMMIT');

    return {
      artifactId: artifactExternalId!,
      artifactPk: artifactPk!,
      versionId: versionId!,
      version: versionNumber,
      signatureId,
      provenanceEventId,
      auditId,
      sealedRecord,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
