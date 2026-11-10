/** Selected source context after original-file withdrawal. Existing extraction
 * only: no storage read, OCR, inference, or rewriting of the captured identity. */
import { pool } from '../../db.js';
import { createHash } from 'node:crypto';
import { capturedDataEligibleSql, capturedDispositionChoiceSql } from '../document-data-disposition/eligibility.js';
import { getCurrentReadableSourceScope, requireSourceReadScopeStillCurrent, SourceReadAccessError } from './source-read-access.js';
import { getSource, sourceIdList } from './evidence-spine.service.js';

export interface RetainedSourceContext {
  origin?: 'native_record_snapshot';
  sourceId: number;
  title: string;
  sha256: string;
  textSha256: string;
  text: string;
  truncated: boolean;
  originalFileAvailable: false;
  representationId: string;
}

/** Bind dispatch to the exact native text already admitted for this turn.
 * Legacy retained-only selections keep their existing behavior. Nothing from
 * the caller's mutable selection or context objects is reread by this closure. */
export function nativeSourceDispatchGuard(
  scope: { organizationId: number; programId: string | null; userId: number | undefined },
  contexts: readonly RetainedSourceContext[],
): (() => Promise<void>) | undefined {
  const native = contexts.filter(source => source.origin === 'native_record_snapshot');
  if (!native.length) return undefined;
  const { organizationId, programId, userId } = scope;
  const sourceIds = native.map(source => source.sourceId);
  const admitted = native.map(nativeContextIdentity).sort();
  return async () => {
    const current = (await readRetainedSourceContexts(organizationId, programId, sourceIds, { userId }))
      .filter(source => source.origin === 'native_record_snapshot');
    if (JSON.stringify(current.map(nativeContextIdentity).sort()) !== JSON.stringify(admitted)) {
      throw new SourceReadAccessError(409, 'NATIVE_SOURCE_CHANGED',
        'Selected native Quality sources changed. Refresh the project catalogue.');
    }
  };
}

function nativeContextIdentity(source: RetainedSourceContext): string {
  return JSON.stringify([source.sourceId, source.origin, source.sha256, source.textSha256,
    source.representationId, source.title, source.text, source.truncated, source.originalFileAvailable]);
}

export async function readRetainedSourceContexts(
  organizationId: number,
  programId: string | null,
  sourceIds: unknown,
  actor?: { userId: number | undefined },
): Promise<RetainedSourceContext[]> {
  if (!programId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(programId)) return [];
  const ids = [...new Set(sourceIdList(sourceIds))].slice(0, 20);
  if (!ids.length) return [];
  const native = await nativeSelectedContexts(organizationId, programId, ids, actor);
  const { rows } = await pool.query(
    `SELECT s.id, s.title, s.checksum, text_record.content, text_record.representation_id
       FROM cre_evidence_sources s
       JOIN public.document_data_dispositions dd ON dd.organization_id = s.organization_id
         AND dd.program_id = s.client_program_id AND dd.source_sha256 = s.checksum
         AND dd.choice = 'keep_data'
       JOIN LATERAL (
         SELECT d.extracted_text AS content, 'vault:' || d.id::text AS representation_id, 0 AS priority
           FROM vault.documents d
           JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = s.organization_id
          WHERE (d.organization_id IS NULL OR d.organization_id = s.organization_id) AND d.program_id = s.client_program_id
            AND d.content_hash = s.checksum AND d.deleted_at IS NULL
            AND length(btrim(d.extracted_text)) > 0
            AND dd.linked_ids->'vaultDocumentIds' @> jsonb_build_array(d.id::text)
         UNION ALL
         SELECT a.content, 'artifact:' || a.artifact_id, 1 AS priority
           FROM concept2cure_artifacts a
           JOIN projects p ON p.id = a.project_id AND p.organization_id = a.organization_id
          WHERE a.organization_id = s.organization_id AND p.regulatory_program_id = s.client_program_id
            AND length(btrim(a.content)) > 0
            AND dd.linked_ids->'artifactIds' @> jsonb_build_array(a.artifact_id)
         ORDER BY priority, representation_id LIMIT 1
       ) text_record ON length(btrim(text_record.content)) > 0
      WHERE s.organization_id = $1 AND s.client_program_id = $2 AND s.id = ANY($3::int[])
        AND s.deleted_at IS NULL AND ${capturedDataEligibleSql('s')}
        AND ${capturedDispositionChoiceSql('s')} = 'keep_data'
      ORDER BY s.id`,
    [organizationId, programId, ids],
  );
  let remaining = 64000 - native.reduce((total, source) => total + source.text.length, 0);
  return [...native, ...rows.flatMap((r) => {
    if (remaining <= 0) return [];
    const text = intactPrefix(String(r.content), Math.min(remaining, 16000));
    remaining -= text.length;
    return [{ sourceId: Number(r.id), title: String(r.title ?? 'Retained source'), sha256: String(r.checksum),
      textSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
      text, truncated: text.length < String(r.content).length, originalFileAvailable: false as const,
      representationId: String(r.representation_id) }];
  })];
}

/** Native records use their recorded text directly. They cannot impersonate a
 * file upload or a Vault document/read receipt. The caller supplies the actual
 * actor; source/object/current-fact admission precedes private text and is
 * repeated after reading. Any failure refuses the context, never partial success. */
async function nativeSelectedContexts(organizationId: number, programId: string, ids: number[], actor?: { userId: number | undefined }): Promise<RetainedSourceContext[]> {
  if (!actor || !Number.isSafeInteger(actor.userId) || !actor.userId || actor.userId <= 0) return [];
  const identities = await pool.query(`SELECT s.id FROM cre_evidence_sources s
    WHERE s.organization_id=$1 AND s.client_program_id=$2 AND s.id=ANY($3::int[])
      AND s.source_type='client_document' AND s.provenance->>'origin'='native_record_snapshot'
      AND s.is_current IS NOT FALSE AND s.deleted_at IS NULL ORDER BY s.id`, [organizationId,programId,ids]);
  const selected = identities.rows.map(row => Number(row.id));
  if (!selected.length) return [];
  const scope = { organizationId, userId: actor.userId, programId, sourceIds: selected };
  const admitted = await getCurrentReadableSourceScope(pool, scope);
  await requireNativeDataEligible(organizationId, programId, selected);
  const rows = await pool.query(`SELECT s.id,s.title,s.checksum,s.extracted_text AS content
    FROM cre_evidence_sources s WHERE s.organization_id=$1 AND s.client_program_id=$2 AND s.id=ANY($3::int[])
      AND s.source_type='client_document' AND s.provenance->>'origin'='native_record_snapshot'
      AND s.is_current IS NOT FALSE AND s.deleted_at IS NULL
    ORDER BY s.id`, [organizationId,programId,selected]);
  if (rows.rows.length !== selected.length) throw new SourceReadAccessError(409,'NATIVE_SOURCE_CHANGED','Selected native Quality sources changed. Refresh the project catalogue.');
  let remaining = 64000;
  const context = rows.rows.flatMap(row => {
    const content = row.content;
    if (typeof content !== 'string' || !content.trim() || createHash('sha256').update(content,'utf8').digest('hex') !== row.checksum) {
      throw new SourceReadAccessError(409,'NATIVE_SOURCE_IDENTITY_INVALID','Selected native source text does not match its recorded digest.');
    }
    if (remaining <= 0) return [];
    const text = intactPrefix(content, Math.min(remaining,16000)); remaining -= text.length;
    return [{ sourceId: Number(row.id), title: String(row.title ?? 'Quality record'), sha256: String(row.checksum),
      textSha256: createHash('sha256').update(text,'utf8').digest('hex'), text, truncated: text.length < content.length,
      originalFileAvailable: false as const, representationId: `native:${row.id}`, origin: 'native_record_snapshot' as const }];
  });
  await requireSourceReadScopeStillCurrent(pool, scope, admitted);
  await requireNativeDataEligible(organizationId, programId, selected);
  return context;
}

/** UTF-16 budgets must not split the exact UTF-8 text at a surrogate pair. */
function intactPrefix(content: string, maximum: number): string {
  let end = Math.min(content.length, maximum);
  const last = content.charCodeAt(end - 1);
  const next = content.charCodeAt(end);
  if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
  return content.slice(0, end);
}

/** Reuse the spine's canonical disposition reader instead of copying its SQL
 * into another text reader. Authorization has already admitted these exact IDs. */
async function requireNativeDataEligible(organizationId: number, programId: string, ids: number[]): Promise<void> {
  for (const id of ids) {
    const source = await getSource(organizationId, id, pool);
    if (!source || source.organizationId !== organizationId || source.clientProgramId?.toLowerCase() !== programId.toLowerCase()
      || source.sourceType !== 'client_document' || !source.isCurrent || source.dataEligible !== true) {
      throw new SourceReadAccessError(409,'NATIVE_SOURCE_CHANGED','Selected native Quality data is no longer eligible. Refresh the project catalogue.');
    }
  }
}
