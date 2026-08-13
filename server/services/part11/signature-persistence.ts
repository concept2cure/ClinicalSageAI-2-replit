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
 *
 * Fail-closed invariants (Part 11 integrity is sacred):
 *   - Every row must be anchored: either (documentId AND versionId) or a
 *     non-empty signedTarget. Refuse to insert an anchorless "signature".
 *   - The §11.200 attribution hash is computed over the EXACT manifest bytes
 *     that are persisted (hash and manifest are the same bytes — the
 *     re-derivation in validateElectronicSignature depends on this).
 *   - A derivation failure that is NOT "table absent" propagates, so the
 *     caller's transaction (ledger write included) rolls back rather than
 *     recording a signature with an unverified binding.
 *
 * @module server/services/part11/signature-persistence
 */

import { createHash } from 'crypto';

/** Minimal pg-compatible client: node-pg Pool, PoolClient, or a test shim. */
export interface SignatureDbClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
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
  /**
   * No content digest is derivable for this target type. The digest column
   * carries the governed action's audit sha256 chain hash instead — a
   * tamper-evident link to the ledger row that records the signed act (target
   * identity + payload hash + actor + time). This is an honest record of what
   * IS bound; it is NOT a content hash and must never be presented as one.
   */
  GOVERNED_ACTION_LEDGER: 'governed-action-sha256-chain',
} as const;

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
 * Persist the electronic_signatures row for a governed `sign` action, on the
 * SAME client/transaction as the ledger write. Throwing here rolls the whole
 * governed sign back — a governed sign either lands in BOTH substrates
 * (ledger + electronic_signatures) or in neither.
 */
export async function persistGovernedSignSignature(
  client: SignatureDbClient,
  params: GovernedSignParams,
): Promise<{ id: number; signedAt: Date }> {
  // Signer snapshot (printed name — §11.50). Read on the caller's client so the
  // lookup participates in the same transaction. Fail closed if unresolvable.
  const signer = await client.query(
    `SELECT name, email, title FROM users WHERE id = $1 LIMIT 1`,
    [params.userId],
  );
  if (signer.rows.length === 0) {
    throw new Error(`governed sign: signer user ${params.userId} not found — cannot attribute signature (§11.100).`);
  }
  const signerName: string = signer.rows[0].name || signer.rows[0].email;
  const signerEmail: string = signer.rows[0].email;
  const signerTitle: string | null = signer.rows[0].title ?? null;

  // Honest content binding for the signed target.
  const binding = await deriveGovernedTargetBinding(client, params.target, params.orgId);
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
    kind: 'governed-sign',
    actionId: params.actionId,
    auditId: params.auditId,
    auditSha256Chain: params.sha256Chain,
    target: params.target,
    command: 'sign',
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
  };
  const signatureHash = sha256Hex(JSON.stringify(signatureManifest));

  return persistElectronicSignature(client, {
    documentId: null,
    versionId: null,
    signedTarget: params.target,
    bindingBasis: binding.basis,
    signatureType: 'governed-action',
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
      'Electronic signature applied via the governed sign action (21 CFR Part 11 §11.50/§11.70/§11.200); ledger-chained to the audit_logs sha256 chain.',
    ipAddress: params.ipAddress ?? null,
    signedAt: params.occurredAt,
    boundPayloadDigest,
    organizationId: params.orgId,
  });
}
