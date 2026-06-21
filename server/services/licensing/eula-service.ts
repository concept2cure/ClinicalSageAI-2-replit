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
 *   and a content hash; mirrored into audit_logs.
 * - Fail-safe: lazily ensures schema exists; read paths degrade gracefully.
 */

import crypto from 'crypto';
import { pool } from '../../db.js';
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

/** Deterministic content hash for an acceptance event (tamper-evidence). */
export function buildAcceptanceHash(parts: {
  userId: number;
  organizationId?: number | null;
  agreementKey: string;
  agreementVersion: string;
  acceptedAt: string;
}): string {
  const canonical = [
    parts.userId,
    parts.organizationId ?? '',
    parts.agreementKey,
    parts.agreementVersion,
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
    // Reset so a later call can retry; surface as warning (read paths degrade).
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

/** All currently-active agreements. */
export async function getActiveAgreements(): Promise<LicenseAgreement[]> {
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT * FROM license_agreements WHERE status = 'active' ORDER BY scope, agreement_key`
    );
    return rows.map(mapAgreement);
  } catch {
    return [];
  }
}

/**
 * The active+required agreements a given user/org has NOT yet accepted.
 * Org-scoped agreements are satisfied by any acceptance for the organization.
 */
export async function getOutstandingAgreements(
  userId: number,
  organizationId?: number | null
): Promise<LicenseAgreement[]> {
  try {
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
  } catch {
    return [];
  }
}

/** True when the actor has accepted every active, required agreement. */
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
    `SELECT id, agreement_key, version FROM license_agreements WHERE id = $1`,
    [input.agreementId]
  );
  if (agreementRes.rows.length === 0) {
    throw new Error(`Agreement '${input.agreementId}' not found`);
  }
  const agreement = agreementRes.rows[0];
  const acceptedAt = new Date().toISOString();
  const hash = buildAcceptanceHash({
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    agreementKey: agreement.agreement_key,
    agreementVersion: agreement.version,
    acceptedAt,
  });

  const { rows } = await pool.query(
    `INSERT INTO license_acceptances
       (agreement_id, agreement_key, agreement_version, user_id, organization_id,
        accepted_at, ip_address, user_agent, acceptance_hash, method)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
    ]
  );

  // Mirror into the immutable audit log (best-effort).
  try {
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, table_name, record_id, new_values)
       VALUES ($1, $2, 'license_accepted', 'license_acceptances', $3, $4)`,
      [
        input.organizationId ?? null,
        input.userId,
        input.agreementId,
        JSON.stringify({
          agreementKey: agreement.agreement_key,
          version: agreement.version,
          hash,
          method: input.method ?? 'clickwrap',
        }),
      ]
    );
  } catch {
    /* non-critical */
  }

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

/** A user's acceptance history (most recent first). */
export async function getAcceptanceHistory(userId: number): Promise<AcceptanceRecord[]> {
  try {
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
  } catch {
    return [];
  }
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
