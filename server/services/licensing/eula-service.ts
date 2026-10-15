/**
 * @fileoverview End-User License Agreement (EULA) service
 * @module server/services/licensing/eula-service
 * @version 1.0.0
 *
 * @description
 * Versioned legal agreements (EULA / ToS / DPA / BAA / Privacy) plus an
 * append-only, 21 CFR Part 11-aligned acceptance ledger. Powers the
 * "end-user license" features: surfacing the agreements a user/org must
 * accept, recording acceptances immutably with provenance (ip/ua/hash),
 * and re-prompting when a new version is published.
 *
 * @compliance
 * - Append-only: acceptances are never updated or deleted.
 * - Provenance: each acceptance captures actor, timestamp, ip, user-agent,
 *   and a hash that covers the agreement text; mirrored into audit_logs.
 * - Fail-closed: a read that fails throws. (Until 2026-10-15 every read caught
 *   its error and returned [], so an unreadable store meant "nothing
 *   outstanding" and hasAcceptedAll() answered true.)
 */

import crypto from 'crypto';
import { pool } from '../../db.js';
import auditService from '../auditService.js';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('eula-service');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AgreementScope = 'user' | 'organization';

export interface LicenseAgreement {
  id: string;
  agreementKey: string;
  version: string;
  title: string;
  summary: string | null;
  body: string | null;
  url: string | null;
  scope: AgreementScope;
  required: boolean;
  status: 'draft' | 'active' | 'superseded';
  effectiveAt: string;
}

export interface AcceptanceRecord {
  id: string;
  agreementId: string;
  agreementKey: string;
  agreementVersion: string;
  userId: number;
  organizationId: number | null;
  acceptedAt: string;
  method: string;
}

export interface RecordAcceptanceInput {
  agreementId: string;
  userId: number;
  organizationId?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  method?: 'clickwrap' | 'sso' | 'api';
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (unit-testable, no DB)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given the set of active+required agreements and the agreement IDs the actor
 * has already accepted, return the agreements still outstanding.
 *
 * User-scoped agreements are satisfied by the user's own acceptances; org-scoped
 * agreements are satisfied by any acceptance recorded for the organization.
 */
export function computeOutstanding(
  active: LicenseAgreement[],
  acceptedAgreementIds: Set<string>
): LicenseAgreement[] {
  return active.filter(a => a.required && !acceptedAgreementIds.has(a.id));
}

/**
 * An agreement the system holds no text for — neither a body nor a url. An
 * acceptance of it would record consent to nothing, so it is refused.
 */
export class AgreementTextMissingError extends Error {
  readonly code = 'AGREEMENT_TEXT_MISSING';
  readonly agreementId: string;
  constructor(agreementId: string, title: string, version: string) {
    super(
      `Agreement '${title}' (version ${version}) has no text in the system, neither a body nor a url, so it cannot be accepted.`
    );
    this.name = 'AgreementTextMissingError';
    this.agreementId = agreementId;
  }
}

/**
 * sha256 of the agreement text an acceptance is given against: the inline body
 * and the url, as a labelled pair. null when the agreement holds neither.
 * For a url-only agreement this binds the url, not the document behind it.
 */
export function hashAgreementContent(agreement: {
  body: string | null;
  url: string | null;
}): string | null {
  const body = agreement.body != null && agreement.body.trim() !== '' ? agreement.body : null;
  const url = agreement.url != null && agreement.url.trim() !== '' ? agreement.url.trim() : null;
  if (body == null && url == null) return null;
  return crypto.createHash('sha256').update(JSON.stringify({ body, url })).digest('hex');
}

/**
 * Deterministic hash for an acceptance event (tamper-evidence). 2026-10-15: it
 * now covers the agreement text; before, it covered only user, org, key,
 * version and time, so an edit to the text left every acceptance hash intact.
 */
export function buildAcceptanceHash(parts: {
  userId: number;
  organizationId?: number | null;
  agreementKey: string;
  agreementVersion: string;
  agreementContentHash: string;
  acceptedAt: string;
}): string {
  const canonical = [
    parts.userId,
    parts.organizationId ?? '',
    parts.agreementKey,
    parts.agreementVersion,
    parts.agreementContentHash,
    parts.acceptedAt,
  ].join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema bootstrap (idempotent, runs at most once per process)
// ─────────────────────────────────────────────────────────────────────────────

let ensurePromise: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS license_agreements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agreement_key TEXT NOT NULL,
        version TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        body TEXT,
        url TEXT,
        scope TEXT NOT NULL DEFAULT 'user',
        audience JSONB NOT NULL DEFAULT '{}'::jsonb,
        required BOOLEAN NOT NULL DEFAULT TRUE,
        status TEXT NOT NULL DEFAULT 'active',
        effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        superseded_at TIMESTAMPTZ,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT license_agreements_key_version_uniq UNIQUE (agreement_key, version)
      );
      CREATE TABLE IF NOT EXISTS license_acceptances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agreement_id UUID NOT NULL REFERENCES license_agreements(id),
        agreement_key TEXT NOT NULL,
        agreement_version TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        organization_id INTEGER,
        accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ip_address TEXT,
        user_agent TEXT,
        acceptance_hash TEXT,
        method TEXT NOT NULL DEFAULT 'clickwrap',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_license_acceptances_user ON license_acceptances (user_id);
      CREATE INDEX IF NOT EXISTS idx_license_acceptances_org ON license_acceptances (organization_id);
      CREATE INDEX IF NOT EXISTS idx_license_acceptances_user_agreement ON license_acceptances (user_id, agreement_id);
    `);
    // Seed baseline agreements if absent.
    await pool.query(`
      INSERT INTO license_agreements (agreement_key, version, title, summary, scope, required, status)
      SELECT 'eula', '2026.06', 'End-User License Agreement',
             'Terms governing individual use of the Concept2Cure platform.', 'user', TRUE, 'active'
      WHERE NOT EXISTS (SELECT 1 FROM license_agreements WHERE agreement_key = 'eula');
    `);
    await pool.query(`
      INSERT INTO license_agreements (agreement_key, version, title, summary, scope, required, status)
      SELECT 'tos', '2026.06', 'Terms of Service',
             'Organization-level terms of service.', 'organization', TRUE, 'active'
      WHERE NOT EXISTS (SELECT 1 FROM license_agreements WHERE agreement_key = 'tos');
    `);
  })().catch(err => {
    // Reset so a later call can retry. The caller's read or write fails with it.
    ensurePromise = null;
    logger.warn('Failed to ensure EULA schema', { err: err instanceof Error ? err.message : String(err) });
    throw err;
  });
  return ensurePromise;
}

function mapAgreement(r: any): LicenseAgreement {
  return {
    id: r.id,
    agreementKey: r.agreement_key,
    version: r.version,
    title: r.title,
    summary: r.summary ?? null,
    body: r.body ?? null,
    url: r.url ?? null,
    scope: (r.scope as AgreementScope) ?? 'user',
    required: r.required !== false,
    status: r.status,
    effectiveAt: r.effective_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All currently-active agreements. Throws when they cannot be read — 2026-10-15:
 * it used to return [] from a catch, as did the two reads below.
 */
export async function getActiveAgreements(): Promise<LicenseAgreement[]> {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT * FROM license_agreements WHERE status = 'active' ORDER BY scope, agreement_key`
  );
  return rows.map(mapAgreement);
}

/**
 * The active+required agreements a given user/org has NOT yet accepted.
 * Org-scoped agreements are satisfied by any acceptance for the organization.
 * Throws when the agreements or acceptances cannot be read.
 */
export async function getOutstandingAgreements(
  userId: number,
  organizationId?: number | null
): Promise<LicenseAgreement[]> {
  await ensureSchema();
  const active = (await getActiveAgreements()).filter(a => a.required);
  if (active.length === 0) return [];

  // Accepted by the user directly...
  const userAccepted = await pool.query(
    `SELECT DISTINCT agreement_id FROM license_acceptances WHERE user_id = $1`,
    [userId]
  );
  const acceptedIds = new Set<string>(userAccepted.rows.map((r: any) => r.agreement_id));

  // ...plus org-scoped agreements accepted by anyone in the org.
  if (organizationId != null) {
    const orgAccepted = await pool.query(
      `SELECT DISTINCT agreement_id FROM license_acceptances WHERE organization_id = $1`,
      [organizationId]
    );
    for (const r of orgAccepted.rows) acceptedIds.add(r.agreement_id);
  }

  return computeOutstanding(active, acceptedIds);
}

/**
 * True when the actor has accepted every active, required agreement. Throws
 * when that cannot be read; it never answers true by default.
 */
export async function hasAcceptedAll(
  userId: number,
  organizationId?: number | null
): Promise<boolean> {
  const outstanding = await getOutstandingAgreements(userId, organizationId);
  return outstanding.length === 0;
}

/** Record an acceptance (append-only) and mirror to the audit log. */
export async function recordAcceptance(input: RecordAcceptanceInput): Promise<AcceptanceRecord> {
  await ensureSchema();

  const agreementRes = await pool.query(
    `SELECT id, agreement_key, version, title, body, url FROM license_agreements WHERE id = $1`,
    [input.agreementId]
  );
  if (agreementRes.rows.length === 0) {
    throw new Error(`Agreement '${input.agreementId}' not found`);
  }
  const agreement = agreementRes.rows[0];
  // 2026-10-15: an acceptance used to be recorded for an agreement with no text
  // at all (the seeded 'eula' and 'tos' rows have neither body nor url), i.e.
  // consent to nothing. That is refused, and the hash now binds the text.
  const contentHash = hashAgreementContent({ body: agreement.body ?? null, url: agreement.url ?? null });
  if (contentHash == null) {
    throw new AgreementTextMissingError(input.agreementId, agreement.title, agreement.version);
  }
  const acceptedAt = new Date().toISOString();
  const hash = buildAcceptanceHash({
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    agreementKey: agreement.agreement_key,
    agreementVersion: agreement.version,
    agreementContentHash: contentHash,
    acceptedAt,
  });

  const { rows } = await pool.query(
    `INSERT INTO license_acceptances
       (agreement_id, agreement_key, agreement_version, user_id, organization_id,
        accepted_at, ip_address, user_agent, acceptance_hash, method, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     RETURNING id, agreement_id, agreement_key, agreement_version, user_id,
               organization_id, accepted_at, method`,
    [
      input.agreementId,
      agreement.agreement_key,
      agreement.version,
      input.userId,
      input.organizationId ?? null,
      acceptedAt,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      hash,
      input.method ?? 'clickwrap',
      JSON.stringify({ agreementContentHash: contentHash }),
    ]
  );

  // Mirror into the canonical audit log. Routed through auditService rather
  // than a raw INSERT: the raw form wrote a row with NULL sha256_chain /
  // payload_hash / hmac_seal, i.e. a row that SITS IN audit_logs BUT OUTSIDE
  // the hash chain — invisible to the chain verifier and therefore not
  // tamper-evident. auditService computes the chain link and HMAC seal inside
  // its own transaction (§11.10(e), §11.70).
  await auditService.logAction({
    organizationId: input.organizationId ?? undefined,
    userId: input.userId,
    action: 'license_accepted',
    resourceType: 'license_acceptances',
    resourceId: input.agreementId,
    details: {
      agreementKey: agreement.agreement_key,
      version: agreement.version,
      hash,
      contentHash,
      method: input.method ?? 'clickwrap',
    },
  });

  const r = rows[0];
  return {
    id: r.id,
    agreementId: r.agreement_id,
    agreementKey: r.agreement_key,
    agreementVersion: r.agreement_version,
    userId: r.user_id,
    organizationId: r.organization_id ?? null,
    acceptedAt: r.accepted_at,
    method: r.method,
  };
}

/** A user's acceptance history (most recent first). Throws when it cannot be read. */
export async function getAcceptanceHistory(userId: number): Promise<AcceptanceRecord[]> {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT id, agreement_id, agreement_key, agreement_version, user_id,
            organization_id, accepted_at, method
     FROM license_acceptances WHERE user_id = $1 ORDER BY accepted_at DESC`,
    [userId]
  );
  return rows.map((r: any) => ({
    id: r.id,
    agreementId: r.agreement_id,
    agreementKey: r.agreement_key,
    agreementVersion: r.agreement_version,
    userId: r.user_id,
    organizationId: r.organization_id ?? null,
    acceptedAt: r.accepted_at,
    method: r.method,
  }));
}

/**
 * Publish a new agreement version (admin). Supersedes the prior active version
 * with the same key. Existing acceptances of the prior version remain valid
 * history, but the new version becomes outstanding for everyone.
 */
export async function publishAgreement(input: {
  agreementKey: string;
  version: string;
  title: string;
  summary?: string;
  body?: string;
  url?: string;
  scope?: AgreementScope;
  required?: boolean;
  createdBy?: string;
}): Promise<LicenseAgreement> {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE license_agreements SET status = 'superseded', superseded_at = NOW()
       WHERE agreement_key = $1 AND status = 'active'`,
      [input.agreementKey]
    );
    const { rows } = await client.query(
      `INSERT INTO license_agreements
         (agreement_key, version, title, summary, body, url, scope, required, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
       RETURNING *`,
      [
        input.agreementKey,
        input.version,
        input.title,
        input.summary ?? null,
        input.body ?? null,
        input.url ?? null,
        input.scope ?? 'user',
        input.required !== false,
        input.createdBy ?? null,
      ]
    );
    await client.query('COMMIT');
    return mapAgreement(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
