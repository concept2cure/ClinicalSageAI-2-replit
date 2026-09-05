/**
 * Electronic-signature persistence — the SINGLE write path into
 * `electronic_signatures` shared by every signing substrate.
 *
 * Before this module existed there were two parallel e-signature substrates:
 *   - /api/esignature/sign (server/routes/esignature.ts) wrote
 *     electronic_signatures directly with its own inline INSERT;
 *   - /api/c2c/actions/sign (server/routes/c2c/actions.ts) — the governed sign
 *     action every freeze/dispatch chain uses — wrote ONLY the sha256-chained
 *     audit_logs + c2c_ana_actions ledger. A Part 11 inspector querying
 *     electronic_signatures missed every governed sign.
 *
 * This module closes that split:
 *   - `persistElectronicSignature(client, record)` is the one INSERT into
 *     electronic_signatures. It takes any pg-compatible client — the shared
 *     pool for standalone writes, or a transaction client so the signature row
 *     commits/rolls back ATOMICALLY with the caller's other writes.
 *   - `deriveGovernedTargetBinding(client, target, orgId)` derives an HONEST
 *     §11.70-style content digest for a governed typed target where one is
 *     derivable, and says so explicitly (`basis`) when it is not. It never
 *     fabricates a content hash.
 *   - `persistGovernedSignSignature(client, params)` composes the two for the
 *     governed sign action: signer snapshot + binding derivation + manifest +
 *     attribution hash + INSERT, all on the caller's transaction client.
 *   - `persistGovernedActionSignature(client, params)` is the same composition
 *     with a CALLER-SUPPLIED binding, for domain endpoints that already hold
 *     the content digest of what they persisted (FCoI certify, Module 3
 *     section approval).
 *   - `persistGovernedSignatureRevocation(client, params)` closes the §11.70
 *     supersession chain for the governed `revoke-signature` action: it resolves
 *     the live signature on that target (org-scoped), records the revocation as
 *     its own attributable row, and points the revoked row's `superseded_by` at
 *     it. A revocation that cannot resolve what it revokes REFUSES.
 *
 * Ledger L37 folded the LAST remaining second INSERT in.
 * `part11ComplianceService.createElectronicSignature` — the writer behind
 * POST /api/submissions/:id/sign-release — had its own Drizzle
 * `.insert(electronicSignatures)`. It was conforming (it bound content and set
 * the org), but it wrote 20 of this table's 26 columns and could not express
 * `binding_basis` at all, so a release signature and a document signature
 * disagreed about what the row's `bound_payload_digest` was a digest OF. That
 * INSERT is deleted; the service now composes the same record and hands it to
 * `persistElectronicSignature` via `drizzleSignatureClient(tx)`, which keeps the
 * signature on the SAME transaction as its device_audit_trail row.
 *
 * Fail-closed invariants (Part 11 integrity is sacred):
 *   - Every row must be anchored: either (documentId AND versionId) or a
 *     non-empty signedTarget. Refuse to insert an anchorless "signature".
 *   - The §11.200 attribution hash is computed over the EXACT manifest bytes
 *     that are persisted (hash and manifest are the same bytes — the
 *     re-derivation in verifySignatureIntegrity depends on this).
 *   - A derivation failure that is NOT "table absent" propagates, so the
 *     caller's transaction (ledger write included) rolls back rather than
 *     recording a signature with an unverified binding.
 *
 * @module server/services/part11/signature-persistence
 */

import { createHash } from 'crypto';
import type { SQL } from 'drizzle-orm';
import { queryableFromDrizzle } from '../../db/drizzle-queryable.js';
import { resolveSignerIdentity } from './resolve-signer-identity.js';

/** Minimal pg-compatible client: node-pg Pool, PoolClient, or a test shim. */
export interface SignatureDbClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/** A Drizzle runner: the db handle, or a Drizzle transaction. */
export interface DrizzleSignatureRunner {
  execute: (query: SQL) => Promise<unknown>;
}

/**
 * Adapt a Drizzle runner (the db handle, or — the reason this exists — a
 * Drizzle TRANSACTION) to the pg-style `query(text, params)` this module's
 * writer takes.
 *
 * `part11ComplianceService.createElectronicSignature` composes its signature
 * with a `device_audit_trail` row inside one `db.transaction(...)`. Handing the
 * writer a fresh pool client would put the signature on a DIFFERENT connection
 * from its §11.10(e) audit row, and the two would no longer commit or roll back
 * together — so the transaction is adapted rather than escaped.
 *
 * The writer's `$n` placeholders are re-bound as Drizzle parameters; the
 * statement text passes through raw and NO value is ever interpolated into it.
 * `sql.param` rather than a bare interpolation, because Drizzle expands a bare
 * array value into a `(a, b, c)` tuple of separate placeholders.
 */
export function drizzleSignatureClient(runner: DrizzleSignatureRunner): SignatureDbClient {
  // One adapter for every shared writer — see server/db/drizzle-queryable.
  return queryableFromDrizzle(runner);
}

// Postgres SQLSTATE for "undefined_table" (schema not yet migrated in this env).
const PG_UNDEFINED_TABLE = '42P01';

// ── Binding bases (explicit, honest provenance of bound_payload_digest) ──────
//
// Every electronic_signatures row written through this module states WHAT its
// bound_payload_digest is a digest OF. Never guess from context; read the basis.
export const BINDING_BASIS = {
  /** sha256 of the signed document version's content (legacy /api/esignature path). */
  DOCUMENT_VERSION_CONTENT: 'document-version-content-sha256',
  /** sha256 over the eCTD sequence row + its ordered leaf manifest at signing time. */
  ECTD_SEQUENCE_LEAF_MANIFEST: 'ectd-sequence-leaf-manifest-sha256',
  /** sha256 over the c2c document row + its ordered section contents at signing time. */
  C2C_DOCUMENT_SECTIONS: 'c2c-document-sections-sha256',
  /** sha256 over a single c2c document section's content + version at signing time. */
  C2C_DOCUMENT_SECTION: 'c2c-document-section-sha256',
  /** sha256 of the exact bundle bytes handed to the agency gateway (governed transmit). */
  TRANSMITTED_BUNDLE_SHA256: 'transmitted-bundle-sha256',
  /** sha256 over the certified financial-disclosure snapshot (21 CFR 54 Form 3454/3455). */
  FINANCIAL_DISCLOSURE_CONTENT: 'financial-disclosure-content-sha256',
  /**
   * sha256 over the eCTD release package the submission orchestrator assembled:
   * leaf-manifest digest || validator-outcome digest || tenant-scoped submission
   * identity (see submission-package-orchestrator.computeBoundPayloadDigest).
   * A real content digest — re-derivable from the persisted run — of the exact
   * package the signer released.
   */
  SUBMISSION_RELEASE_PAYLOAD: 'submission-release-payload-sha256',
  /** sha256 over the frozen cmc_module3_section_versions snapshot approved at signing time. */
  CMC_MODULE3_SECTION_VERSION: 'cmc-module3-section-version-sha256',
  /**
   * No content digest is derivable for this target type. The digest column
   * carries the governed action's audit sha256 chain hash instead — a
   * tamper-evident link to the ledger row that records the signed act (target
   * identity + payload hash + actor + time). This is an honest record of what
   * IS bound; it is NOT a content hash and must never be presented as one.
   */
  GOVERNED_ACTION_LEDGER: 'governed-action-sha256-chain',
} as const;

/**
 * signature_type of the row a governed `revoke-signature` writes (§11.70
 * supersession, below). Distinct from 'governed-action' so a revocation can
 * never be mistaken for — or itself be revoked as — an applied signature.
 */
export const GOVERNED_REVOCATION_SIGNATURE_TYPE = 'governed-revocation';

/** verification_status stamped on a signature a governed revocation supersedes. */
export const REVOKED_VERIFICATION_STATUS = 'revoked';

export type BindingBasis = (typeof BINDING_BASIS)[keyof typeof BINDING_BASIS];

// ── Canonical JSON (deterministic bytes for digests) ─────────────────────────

/** Deterministic stringify: object keys sorted recursively, Dates → ISO. */
export function canonicalJson(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(normalize);
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = normalize((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(normalize(value));
}

const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex');

/**
 * The §11.200 attribution hash of a signature manifest — THE recipe, used by the
 * writer and by every verifier.
 *
 * It is JSON.stringify over the manifest object as built, NOT canonicalJson:
 * the writer has always hashed the manifest's own bytes, and a verifier that
 * re-serialised with sorted keys would fail every row ever written. Exported so
 * the verifier calls the same function the writer does. Two hand-copied
 * recipes drifted once — the live verify endpoint hashed an identifier payload
 * no writer ever produced, and reported every genuine signature as COMPROMISED.
 */
export const manifestSignatureHash = (manifest: unknown): string =>
  sha256Hex(JSON.stringify(manifest ?? {}));

/**
 * sha256 over the canonical JSON of `value` — the ONE way a caller-supplied
 * §11.70 binding digest is computed, so every basis in BINDING_BASIS is
 * re-derivable by an inspector the same way (keys sorted, Dates → ISO).
 */
export const sha256CanonicalJson = (value: unknown): string => sha256Hex(canonicalJson(value));

// ── The single INSERT ────────────────────────────────────────────────────────

export interface ElectronicSignatureRecord {
  /** Anchor A: a documents/document_versions pair (legacy document signing). */
  documentId?: number | null;
  versionId?: number | null;
  /** Anchor B: a governed typed target pointer, e.g. 'ectd-sequence:42'. */
  signedTarget?: string | null;
  /** Explicit provenance of boundPayloadDigest. */
  bindingBasis?: string | null;

  signatureType: string;
  signaturePurpose: string;
  signatureLevel?: number;

  signerId: number;
  signerName: string;
  signerTitle?: string | null;
  signerEmail: string;

  authenticationMethod: string;
  authenticationTimestamp: Date;
  secondFactorVerified: boolean;

  /** §11.200 attribution hash — sha256 over the persisted manifest bytes. */
  signatureHash: string;
  signatureMeaning?: string | null;
  /** Persisted verbatim as signature_manifest (JSON). */
  signatureManifest: Record<string, unknown>;

  isValid: boolean;
  verificationStatus?: string | null;
  complianceStatement?: string | null;
  legalDisclaimer?: string | null;

  ipAddress?: string | null;
  deviceInfo?: Record<string, unknown> | null;
  signedAt: Date;
  /** §11.70 binding digest (see bindingBasis for what it digests). */
  boundPayloadDigest: string;
  organizationId: number;
}

/**
 * Insert ONE electronic_signatures row on the supplied client. When the client
 * is a transaction client, the row commits/rolls back with the transaction.
 *
 * Fail-closed: throws on a missing anchor, missing signer identity, or a
 * missing attribution hash. Database errors propagate untouched (callers
 * decide how to map 42P01 etc. — this function never swallows them).
 */
export async function persistElectronicSignature(
  client: SignatureDbClient,
  record: ElectronicSignatureRecord,
): Promise<{ id: number; signedAt: Date }> {
  const hasDocAnchor = record.documentId != null && record.versionId != null;
  const hasTargetAnchor =
    typeof record.signedTarget === 'string' && record.signedTarget.length > 0;
  if (!hasDocAnchor && !hasTargetAnchor) {
    throw new Error(
      'electronic_signatures: refusing anchorless signature — need (documentId AND versionId) or a signedTarget (§11.70).',
    );
  }
  if (!Number.isFinite(record.signerId)) {
    throw new Error('electronic_signatures: signerId is required (§11.100).');
  }
  if (!record.signerName || !record.signerEmail) {
    throw new Error('electronic_signatures: signer name and email are required (§11.50).');
  }
  if (!record.signatureHash) {
    throw new Error('electronic_signatures: attribution signatureHash is required (§11.200).');
  }
  if (!record.boundPayloadDigest) {
    // The §11.70 content-binding digest links the signature to the exact bytes
    // signed. This module is the single fail-closed guarantor for every current
    // and future caller, and the digest is the one required field the guards had
    // omitted — an empty binding must be refused, not persisted.
    throw new Error('electronic_signatures: boundPayloadDigest is required (§11.70 content binding).');
  }
  if (!Number.isFinite(record.organizationId)) {
    throw new Error('electronic_signatures: organizationId is required (tenant scope).');
  }

  const result = await client.query(
    `INSERT INTO electronic_signatures (
       document_id, version_id, signed_target, binding_basis,
       signature_type, signature_purpose, signature_level,
       signer_id, signer_name, signer_title, signer_email,
       authentication_method, authentication_timestamp, second_factor_verified,
       signature_hash, signature_meaning, signature_manifest,
       is_valid, verification_status, compliance_statement, legal_disclaimer,
       ip_address, device_info, signed_at, bound_payload_digest, organization_id
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7,
       $8, $9, $10, $11,
       $12, $13, $14,
       $15, $16, $17,
       $18, $19, $20, $21,
       $22, $23, $24, $25, $26
     ) RETURNING id, signed_at`,
    [
      record.documentId ?? null,
      record.versionId ?? null,
      record.signedTarget ?? null,
      record.bindingBasis ?? null,
      record.signatureType,
      record.signaturePurpose,
      record.signatureLevel ?? 1,
      record.signerId,
      record.signerName,
      record.signerTitle ?? null,
      record.signerEmail,
      record.authenticationMethod,
      record.authenticationTimestamp,
      record.secondFactorVerified,
      record.signatureHash,
      record.signatureMeaning ?? null,
      JSON.stringify(record.signatureManifest),
      record.isValid,
      record.verificationStatus ?? null,
      record.complianceStatement ?? null,
      record.legalDisclaimer ?? null,
      record.ipAddress ?? null,
      record.deviceInfo ? JSON.stringify(record.deviceInfo) : null,
      record.signedAt,
      record.boundPayloadDigest,
      record.organizationId,
    ],
  );
  return { id: result.rows[0].id as number, signedAt: result.rows[0].signed_at as Date };
}

// ── Governed-target content-binding derivation ───────────────────────────────

export interface GovernedBinding {
  /** Derived content digest, or null when no content digest is derivable. */
  digest: string | null;
  basis: BindingBasis;
  /** Honest human-readable note recorded in the signature manifest. */
  note: string;
}

/**
 * Derive an honest §11.70-style content binding for a governed typed target.
 *
 * Derivable target types digest the ACTUAL persisted content at signing time,
 * read on the SAME client (so the digest sees the transaction's view):
 *   - ectd-sequence:<id>  → sequence row + ordered submission_leaves manifest
 *   - document:<id>       → c2c_documents row + ordered section contents
 *   - section:<doc>:<key> → that section's content + version
 *
 * Everything else — and any target whose backing table is absent in this
 * environment (42P01) or whose row cannot be read — falls back to the
 * governed-action-ledger basis: NO content hash is claimed, and the caller
 * records the audit chain hash with that explicit basis instead. A non-42P01
 * database error propagates (fail closed).
 */
export async function deriveGovernedTargetBinding(
  client: SignatureDbClient,
  target: string,
  orgId: number,
): Promise<GovernedBinding> {
  const colonIdx = target.indexOf(':');
  const prefix = colonIdx === -1 ? target : target.slice(0, colonIdx);
  const rest = colonIdx === -1 ? '' : target.slice(colonIdx + 1);

  const ledgerFallback = (why: string): GovernedBinding => ({
    digest: null,
    basis: BINDING_BASIS.GOVERNED_ACTION_LEDGER,
    note: `No content digest derivable for target '${target}': ${why}. ` +
      'bound_payload_digest carries the governed action audit sha256 chain hash (target identity + payload hash + actor + time), not a content hash.',
  });

  try {
    switch (prefix) {
      case 'ectd-sequence': {
        const seq = await client.query(
          `SELECT id, submission_id, region, sequence_number, type, status
             FROM ectd_sequences
            WHERE id = $1::int AND organization_id = $2 AND deleted_at IS NULL
            LIMIT 1`,
          [rest, orgId],
        );
        if (seq.rows.length === 0) return ledgerFallback('sequence row not readable at signing time');
        const leaves = await client.query(
          `SELECT id, section_code, lifecycle_op, document_table, document_id, checksum, title
             FROM submission_leaves
            WHERE sequence_id = $1::int AND organization_id = $2 AND deleted_at IS NULL
            ORDER BY section_code, id`,
          [rest, orgId],
        );
        const payload = canonicalJson({ sequence: seq.rows[0], leaves: leaves.rows });
        return {
          digest: sha256Hex(payload),
          basis: BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST,
          note: `sha256 over the ectd_sequences row and its ${leaves.rows.length} submission_leaves row(s) (ordered by section_code, id) at signing time.`,
        };
      }
      case 'document': {
        const doc = await client.query(
          `SELECT id, doc_type, agency, rule_pack_version, title, status
             FROM c2c_documents
            WHERE id = $1 AND org_id = $2
            LIMIT 1`,
          [rest, orgId],
        );
        if (doc.rows.length === 0) return ledgerFallback('document row not readable at signing time');
        const sections = await client.query(
          `SELECT s.section_key, s.version, s.status, s.content
             FROM c2c_document_sections s
            WHERE s.document_id = $1
            ORDER BY s.path_order, s.section_key`,
          [rest],
        );
        const payload = canonicalJson({ document: doc.rows[0], sections: sections.rows });
        return {
          digest: sha256Hex(payload),
          basis: BINDING_BASIS.C2C_DOCUMENT_SECTIONS,
          note: `sha256 over the c2c_documents row and its ${sections.rows.length} section content row(s) (ordered by path_order, section_key) at signing time.`,
        };
      }
      case 'section': {
        // format: section:<docId>:<sectionKey> (same convention as resolveTarget).
        const parts = rest.split(':');
        if (parts.length < 2) return ledgerFallback('malformed section pointer');
        const [docId, ...keyParts] = parts;
        const sectionKey = keyParts.join(':');
        const row = await client.query(
          `SELECT s.section_key, s.version, s.status, s.content
             FROM c2c_document_sections s
             JOIN c2c_documents d ON d.id = s.document_id
            WHERE s.document_id = $1 AND s.section_key = $2 AND d.org_id = $3
            LIMIT 1`,
          [docId, sectionKey, orgId],
        );
        if (row.rows.length === 0) return ledgerFallback('section row not readable at signing time');
        const payload = canonicalJson({ documentId: docId, section: row.rows[0] });
        return {
          digest: sha256Hex(payload),
          basis: BINDING_BASIS.C2C_DOCUMENT_SECTION,
          note: 'sha256 over the section content + version at signing time.',
        };
      }
      default:
        return ledgerFallback(`no content-digest derivation implemented for target type '${prefix}'`);
    }
  } catch (err: any) {
    // Table absent in this environment (pre-migration) — the target's content is
    // genuinely unreadable here; record that honestly rather than failing the sign.
    if (err?.code === PG_UNDEFINED_TABLE) {
      return ledgerFallback('backing table not present in this environment');
    }
    // Any other DB error is real — fail closed (roll back the whole sign).
    throw err;
  }
}

// ── Governed sign composition ────────────────────────────────────────────────

export interface GovernedSignParams {
  orgId: number;
  userId: number;
  /** Typed target pointer as recorded on the ledger (e.g. 'ectd-sequence:42'). */
  target: string;
  /** Reason-for-signing from the action envelope (≥ 8 chars, route-enforced). */
  reason: string;
  /** Action payload (may carry the §11.50 meaning declared in the sign modal). */
  payload: Record<string, unknown>;
  /** Ledger identifiers from recordGovernedAction (same transaction). */
  actionId: string;
  auditId: string;
  sha256Chain: string;
  /** How the signer re-authenticated for this sign (verifyReauth already passed). */
  authenticationMethod: string;
  secondFactorVerified: boolean;
  ipAddress?: string | null;
  occurredAt: Date;
}

/**
 * A governed signature whose §11.70 binding the CALLER supplies, because the
 * caller — not this module — is the only place the signed content is known.
 * Domain endpoints that govern their own write in place (e.g. FCoI certify,
 * Module 3 section approval) pass the digest they already computed over the
 * exact bytes they persisted, with an explicit basis. Never pass a digest whose
 * provenance you cannot state.
 */
export interface GovernedActionSignatureParams extends GovernedSignParams {
  /** Explicit, honest binding. `digest: null` ⇒ the audit chain hash is bound. */
  binding: GovernedBinding | { digest: string | null; basis: string; note: string };
  /** electronic_signatures.signature_type. Default 'governed-action'. */
  signatureType?: string;
  /** manifest `kind` discriminator. Default 'governed-sign'. */
  manifestKind?: string;
  /** manifest `command`. Default 'sign'. */
  command?: string;
  /** Overrides the default §11 compliance statement. */
  complianceStatement?: string;
  /**
   * Extra manifest members, APPENDED after the shared ones. Appending (never
   * interleaving) keeps the persisted manifest bytes — and therefore the
   * §11.200 attribution hash — byte-identical for callers that pass none.
   */
  extraManifest?: Record<string, unknown>;
}

/**
 * Compose + persist ONE governed electronic_signatures row on the caller's
 * client/transaction: signer snapshot + declared meaning + manifest +
 * attribution hash + INSERT. Throwing rolls the caller's whole governed write
 * back — the signature lands with the ledger or not at all.
 */
export async function persistGovernedActionSignature(
  client: SignatureDbClient,
  params: GovernedActionSignatureParams,
): Promise<{ id: number; signedAt: Date }> {
  const command = params.command ?? 'sign';

  // Signer snapshot (printed name — §11.50), on the caller's client so the
  // lookup participates in the same transaction. Fails closed if unresolvable.
  // The lookup itself lives in resolve-signer-identity, shared with the
  // concept2cure_signatures writers so the two substrates cannot drift on the
  // question of who signed — they had, and one of them was inventing names.
  const { name: signerName, email: signerEmail, title: signerTitle } =
    await resolveSignerIdentity(client, params.userId, params.orgId, `governed ${command}`);

  const binding = params.binding;
  const boundPayloadDigest = binding.digest ?? params.sha256Chain;

  // §11.50 meaning: only what the signer actually declared (the sign modal sends
  // payload.meaning). Never fabricate a meaning that was not declared.
  const declaredMeaning =
    typeof params.payload?.meaning === 'string' && params.payload.meaning.length > 0
      ? (params.payload.meaning as string)
      : null;

  const signedAtIso = params.occurredAt.toISOString();

  // The manifest IS the attributed record; the §11.200 attribution hash is
  // computed over these exact bytes (hash and manifest must be the same bytes).
  const signatureManifest: Record<string, unknown> = {
    kind: params.manifestKind ?? 'governed-sign',
    actionId: params.actionId,
    auditId: params.auditId,
    auditSha256Chain: params.sha256Chain,
    target: params.target,
    command,
    reason: params.reason,
    meaning: declaredMeaning,
    signerId: params.userId,
    signerName,
    signerEmail,
    organizationId: params.orgId,
    signedAt: signedAtIso,
    boundPayloadDigest,
    bindingBasis: binding.basis,
    bindingNote: binding.note,
    ...(params.extraManifest ?? {}),
  };
  const signatureHash = manifestSignatureHash(signatureManifest);

  return persistElectronicSignature(client, {
    documentId: null,
    versionId: null,
    signedTarget: params.target,
    bindingBasis: binding.basis,
    signatureType: params.signatureType ?? 'governed-action',
    signaturePurpose: params.reason,
    signerId: params.userId,
    signerName,
    signerTitle,
    signerEmail,
    authenticationMethod: params.authenticationMethod,
    authenticationTimestamp: params.occurredAt,
    secondFactorVerified: params.secondFactorVerified,
    signatureHash,
    signatureMeaning: declaredMeaning,
    signatureManifest,
    isValid: true,
    complianceStatement:
      params.complianceStatement ??
      'Electronic signature applied via the governed sign action (21 CFR Part 11 §11.50/§11.70/§11.200); ledger-chained to the audit_logs sha256 chain.',
    ipAddress: params.ipAddress ?? null,
    signedAt: params.occurredAt,
    boundPayloadDigest,
    organizationId: params.orgId,
  });
}

/**
 * Persist the electronic_signatures row for a governed `sign` action, on the
 * SAME client/transaction as the ledger write. Throwing here rolls the whole
 * governed sign back — a governed sign either lands in BOTH substrates
 * (ledger + electronic_signatures) or in neither.
 */
export async function persistGovernedSignSignature(
  client: SignatureDbClient,
  params: GovernedSignParams,
): Promise<{ id: number; signedAt: Date }> {
  // Honest content binding for the signed target, derived on the caller's client.
  const binding = await deriveGovernedTargetBinding(client, params.target, params.orgId);
  return persistGovernedActionSignature(client, { ...params, binding });
}

// ── §11.70 supersession (governed revoke-signature) ──────────────────────────

/**
 * A governed revocation could not identify the signature it revokes. Fail
 * closed: a revocation that cannot name what it revokes revokes nothing, and
 * recording it would leave the supersession chain claiming an act that never
 * landed.
 */
export class SignatureRevocationUnresolvedError extends Error {
  readonly code = 'REVOCATION_TARGET_UNRESOLVED';
  constructor(message: string) {
    super(message);
    this.name = 'SignatureRevocationUnresolvedError';
  }
}

/**
 * Persist the §11.70 supersession for a governed `revoke-signature` action, on
 * the SAME client/transaction as the revocation's ledger write.
 *
 * SUPERSESSION CONVENTION — reused, not invented. `superseded_by` is set on the
 * row that HAS BEEN superseded and points at the row that replaced it; a row
 * with `superseded_by IS NULL` is the live one. That is the convention the
 * existing readers already encode:
 *   - migrations/20260629_orchestrator_awaiting_signature_status.sql builds the
 *     resume-path index `WHERE superseded_by IS NULL` and calls the excluded
 *     rows "every superseded row … dead weight for this query";
 *   - submission-package-orchestrator.findActiveReleaseSignature selects
 *     `… AND superseded_by IS NULL` to return "the current, non-rolled-back
 *     signature".
 * Pointing the NEW row backwards instead would make every replacement
 * invisible to those lookups, so this direction is the only one consistent
 * with the shipped readers.
 *
 * WHY A ROW IS INSERTED. `superseded_by` is an FK to electronic_signatures(id),
 * so supersession is only expressible against a successor row — and §11.70
 * append-only history is the documented rule for rollback ("never deletes a
 * row; it inserts a new row"). The revocation is itself an attributable act:
 * `revoke-signature` is a HIGH_RISK command, so the revoker re-authenticated
 * under §11.200 exactly as a signer does. Persisting it records WHO revoked,
 * WHEN, WHY and under WHICH factors — which a bare UPDATE could never carry.
 *
 * WHAT IS MUTATED ON THE REVOKED ROW. Nothing the signer attested: signer
 * identity, signature_hash, signature_manifest, bound_payload_digest and
 * binding_basis are left byte-identical. Only the Verification column group
 * (`is_valid`, `verification_status`, `verification_date`) and the supersession
 * pointer change — `verification_status = 'revoked'` states WHY `is_valid` is
 * false, so the row can never be misread as "the signing factors failed".
 *
 * The revocation row binds to its OWN governed-action chain hash, never to the
 * revoked target's content digest — otherwise it would collide with the
 * (organization_id, bound_payload_digest, superseded_by IS NULL) lookup and a
 * revoked release would read as freshly signed.
 */
export async function persistGovernedSignatureRevocation(
  client: SignatureDbClient,
  params: GovernedSignParams,
): Promise<{ revocationId: number; revokedSignatureId: number }> {
  // Resolve the signature under revocation: org-scoped, anchored on the same
  // governed target the ledger records, still live. Revocation rows themselves
  // are excluded — a revocation is not a signature that can be revoked.
  const found = await client.query(
    `SELECT id, signature_hash, signature_type, signed_at, signer_id
       FROM electronic_signatures
      WHERE organization_id = $1
        AND signed_target = $2
        AND signature_type <> $3
        AND superseded_by IS NULL
      ORDER BY signed_at DESC, id DESC
      LIMIT 1`,
    [params.orgId, params.target, GOVERNED_REVOCATION_SIGNATURE_TYPE],
  );
  if (found.rows.length === 0) {
    throw new SignatureRevocationUnresolvedError(
      `revoke-signature: no active electronic signature is anchored to target '${params.target}' in organization ${params.orgId} — refusing to record a revocation of nothing (§11.70).`,
    );
  }
  const revoked = found.rows[0];
  const revokedId = Number(revoked.id);

  const revocation = await persistGovernedActionSignature(client, {
    ...params,
    binding: {
      digest: null,
      basis: BINDING_BASIS.GOVERNED_ACTION_LEDGER,
      note:
        `Revocation of electronic signature ${revokedId}. bound_payload_digest carries this revocation's ` +
        'governed action audit sha256 chain hash (target identity + payload hash + actor + time), not a content hash. ' +
        'The revoked signature keeps its own binding unchanged.',
    },
    signatureType: GOVERNED_REVOCATION_SIGNATURE_TYPE,
    manifestKind: 'governed-revoke-signature',
    command: 'revoke-signature',
    complianceStatement:
      'Revocation of a previously applied electronic signature via the governed revoke-signature action ' +
      '(21 CFR Part 11 §11.50/§11.70/§11.200); the superseded signature is retained unaltered and linked via superseded_by.',
    extraManifest: {
      revokedSignatureId: revokedId,
      revokedSignatureHash: revoked.signature_hash ?? null,
      revokedSignatureType: revoked.signature_type ?? null,
      revokedSignatureSignerId: revoked.signer_id == null ? null : Number(revoked.signer_id),
    },
  });

  // Mark the superseded row. The `superseded_by IS NULL` predicate makes this a
  // compare-and-set: two concurrent revocations cannot both claim the same
  // signature, and the loser fails closed rather than orphaning a revocation row.
  const marked = await client.query(
    `UPDATE electronic_signatures
        SET superseded_by = $1,
            is_valid = false,
            verification_status = $2,
            verification_date = $3,
            updated_at = now()
      WHERE id = $4 AND organization_id = $5 AND superseded_by IS NULL
      RETURNING id`,
    [revocation.id, REVOKED_VERIFICATION_STATUS, params.occurredAt, revokedId, params.orgId],
  );
  if (marked.rows.length === 0) {
    throw new SignatureRevocationUnresolvedError(
      `revoke-signature: electronic signature ${revokedId} was superseded concurrently — refusing to leave a revocation without a superseded signature (§11.70).`,
    );
  }

  return { revocationId: revocation.id, revokedSignatureId: revokedId };
}
