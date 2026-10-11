/** Read-only binding of reviewed official-source keys to one evaluation corpus. */
import type pg from 'pg';
import { assertTenantIsCurrent, isTenantUuid } from '../../db/currentTenant.js';
import { getTenantScope, runWithTenantScope } from '../../db/tenantStore.js';
import { isNegativeControl, type GoldItem } from './rag-metrics.js';
import { EvaluationIntegrityError, safeEvaluationError } from './evaluation-errors.js';

export interface EvaluationScope {
  organizationId: number;
  organizationUuid: string;
  programId: string;
}

export interface GuidanceEntry {
  document_code: string;
  version: string;
  versionScheme: string;
  role: string;
  verified: boolean;
  versionVerified: boolean;
  sourceUrl: string | null;
  date: string | null;
  sha256: string | null;
  redistribution?: { termsOf?: string };
}

export interface GuidanceManifest {
  version: string;
  entries: GuidanceEntry[];
  publishers: Record<string, { termsVerified: boolean; terms: string | null; termsUrl: string | null }>;
}

export interface ResolvedDocument {
  documentId: string;
  contentHash: string;
  embedded: boolean;
}

export interface SourceResolution {
  negativeControl: boolean;
  sourceIds: string[];
  errors: string[];
}

export function requireEvaluationScope(scope: Partial<EvaluationScope>): EvaluationScope {
  if (!Number.isSafeInteger(scope.organizationId) || scope.organizationId! <= 0) throw new EvaluationIntegrityError('A positive evaluation organization id is required (--org-id), bound to the organization UUID.');
  if (!isTenantUuid(scope.organizationUuid)) throw new EvaluationIntegrityError('A usable evaluation organization UUID is required (--org-uuid).');
  if (!isTenantUuid(scope.programId)) throw new EvaluationIntegrityError('A usable evaluation program UUID is required (--program-id).');
  return { organizationId: scope.organizationId!, organizationUuid: scope.organizationUuid, programId: scope.programId };
}

/** Scoped checkout without a role bypass; an existing tenant cannot be overridden. */
export function withEvaluationTenantScope<T>(scope: EvaluationScope, fn: () => T): T {
  requireEvaluationScope(scope);
  const current = getTenantScope();
  if (current && current.tenantId !== '0') {
    if (current.tenantId !== String(scope.organizationId) ||
        (current.orgUuid && current.orgUuid.toLowerCase() !== scope.organizationUuid.toLowerCase())) {
      throw new EvaluationIntegrityError('Evaluation scope does not match the active tenant; no database or provider call was made.');
    }
  }
  return runWithTenantScope({ tenantId: String(scope.organizationId), orgUuid: scope.organizationUuid, role: null, source: 'cli', caller: 'rag-evaluation' }, fn);
}

function reviewedEntryGaps(entry: GuidanceEntry, manifest: GuidanceManifest): string[] {
  const key = `${entry.document_code}@${entry.version}`;
  const gaps: string[] = [];
  if (entry.role !== 'answer-source') gaps.push(`${key} is not an answer-source`);
  if (entry.verified !== true || entry.versionVerified !== true || entry.versionScheme === 'UNPINNED') gaps.push(`${key} is not a verified revision`);
  if (!entry.sourceUrl || !entry.date || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) gaps.push(`${key} lacks verified source URL, date or SHA-256`);
  const terms = manifest.publishers[entry.redistribution?.termsOf ?? ''];
  if (terms?.termsVerified !== true || !terms.terms || !terms.termsUrl) gaps.push(`${key} has no verified publisher reuse terms`);
  return gaps;
}

function goldItemGaps(item: GoldItem): string[] {
  const gaps: string[] = [];
  if (item.openChecks?.length) gaps.push(`${item.id} has unresolved official-text checks`);
  const ev = item.evidence;
  if (!ev?.document_code || !ev.section?.trim() || !ev.quote?.trim()) gaps.push(`${item.id} has no reviewed official-text evidence quote`);
  else if ((item.expectedAnswerContains ?? []).some(s => !ev.quote.toLowerCase().includes(s.toLowerCase()))) gaps.push(`${item.id} expects text not supported by its evidence quote`);
  return gaps;
}

function validSourceKeys(keys: unknown): keys is string[] {
  return Array.isArray(keys) && keys.every(k => typeof k === 'string' && k.trim());
}

/** An unresolved positive is an error, never inferred to be a negative control. */
export async function resolveExpectedSources(
  item: GoldItem,
  manifest: GuidanceManifest,
  scope: EvaluationScope,
  readDocument: (scope: EvaluationScope, entry: GuidanceEntry) => Promise<ResolvedDocument>,
): Promise<SourceResolution> {
  requireEvaluationScope(scope);
  const negativeControl = isNegativeControl(item);
  const keys = item.expectedSourceKeys;
  const out: SourceResolution = { negativeControl, sourceIds: [], errors: [] };
  if (!validSourceKeys(keys)) {
    out.errors.push(`${item.id} has no valid expected source-key array`);
    return out;
  }
  if (negativeControl) {
    if (keys.length) out.errors.push(`${item.id} is a negative control but names expected sources`);
    return out;
  }
  out.errors.push(...goldItemGaps(item));
  if (!keys.length) out.errors.push(`${item.id} is a positive item with no expected source key`);
  const entries: GuidanceEntry[] = [];
  for (const key of keys) {
    const matching = manifest.entries.filter(e => `${e.document_code}@${e.version}` === key);
    if (matching.length !== 1) out.errors.push(`${item.id}: source key ${key} resolves to ${matching.length} manifest entries, expected exactly one`);
    else {
      out.errors.push(...reviewedEntryGaps(matching[0], manifest));
      entries.push(matching[0]);
    }
  }
  if (!entries.some(e => e.document_code === item.evidence?.document_code)) out.errors.push(`${item.id}: evidence quote does not name a keyed official source`);
  if (out.errors.length) return out;
  for (const entry of entries) {
    try {
      const doc = await readDocument(scope, entry);
      if (!doc.documentId || doc.contentHash !== entry.sha256) throw new EvaluationIntegrityError('Vault document bytes do not match the reviewed manifest SHA-256');
      if (doc.embedded !== true) throw new EvaluationIntegrityError('The reviewed document has no embedded chunks in the evaluation corpus');
      out.sourceIds.push(doc.documentId);
    } catch (err) {
      out.errors.push(`${item.id}: ${entry.document_code}@${entry.version}: ${safeEvaluationError(err, 'Source binding lookup failed; database details were withheld.')}`);
    }
  }
  // One missing keyed source invalidates the item; a partial binding cannot score it.
  if (out.errors.length) out.sourceIds = [];
  else out.sourceIds = [...new Set(out.sourceIds)];
  return out;
}

/** The existing Vault ingest identity, guarded by both organization and programme. */
export async function readEvaluationDocument(
  pool: Pick<pg.Pool, 'connect'>,
  scope: EvaluationScope,
  entry: GuidanceEntry,
): Promise<ResolvedDocument> {
  requireEvaluationScope(scope);
  return readWithinEvaluationScope(pool, scope, async client => {
    // tenant-isolation-safe: explicit org/program predicates also hold on an owner-role connection.
    const { rows } = await client.query<{ document_id: string; content_hash: string; embedded: boolean }>(
      `SELECT d.id::text AS document_id, d.content_hash,
              EXISTS (SELECT 1 FROM vault.document_chunks c WHERE c.document_id = d.id AND c.embedding IS NOT NULL) AS embedded
         FROM vault.documents d
         JOIN regulatory_programs p ON p.id = d.program_id AND p.organization_id = d.organization_id
         JOIN organizations o ON o.id = d.organization_id
        WHERE o.uuid = $1::uuid AND d.program_id = $2::uuid AND o.id = $5::integer
          AND d.document_code = $3 AND d.version = $4
          AND d.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [scope.organizationUuid, scope.programId, entry.document_code, entry.version, scope.organizationId],
    );
    if (rows.length !== 1) throw new EvaluationIntegrityError(`Reviewed source resolves to ${rows.length} accessible Vault documents in the named organization/program, expected exactly one`);
    return { documentId: rows[0].document_id, contentHash: rows[0].content_hash, embedded: rows[0].embedded };
  });
}

/** Live identity and programme authority, required even on source-less controls. */
export async function verifyEvaluationScope(pool: Pick<pg.Pool, 'connect'>, scope: EvaluationScope): Promise<void> {
  await readWithinEvaluationScope(pool, scope, async client => {
    // tenant-isolation-safe: neither an asserted integer nor a UUID alone establishes the binding.
    const { rows } = await client.query(
      `SELECT o.id FROM organizations o JOIN regulatory_programs p ON p.organization_id = o.id
        WHERE o.id = $1::integer AND o.uuid = $2::uuid AND p.id = $3::uuid AND p.deleted_at IS NULL`,
      [scope.organizationId, scope.organizationUuid, scope.programId],
    );
    if (rows.length !== 1) throw new EvaluationIntegrityError('The evaluation organization id/UUID and live programme binding could not be verified; no retrieval or provider call is permitted.');
  });
}

async function readWithinEvaluationScope<T>(
  pool: Pick<pg.Pool, 'connect'>, scope: EvaluationScope, fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withEvaluationTenantScope(scope, async () => {
    const client = await pool.connect();
    try {
      await assertTenantIsCurrent(client, { organizationUuid: scope.organizationUuid, organizationId: scope.organizationId });
      await client.query('BEGIN READ ONLY');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_org_id', $2, true)", [String(scope.organizationId), scope.organizationUuid]);
      return await fn(client);
    } finally {
      try { await client.query('ROLLBACK'); }
      finally { client.release(); }
    }
  });
}
