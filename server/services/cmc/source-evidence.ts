/**
 * CMC source evidence: the Vault document a CMC record was taken from
 * (row D2; discovery map 2026-10-04, no-data-room-to-cmc-source-path).
 *
 * A batch's results, a specification and a stability study were typed into the
 * registers and composed into Module 3, while the certificate of analysis, the
 * specification document and the stability report they came from sat in the
 * same program's Vault with nothing recorded between them. The Data Room files
 * its captures into that Vault (vault-data-room-filing.ts), so the Vault is
 * where the program's documents are governed: versioned, hashed, superseded
 * through one family rule. This is the join:
 *
 *   - A person links a CMC record (its cmc_source_objects key under the
 *     program) to a CURRENT, available original Vault version of the same
 *     program, with a reason. Any disposition refuses a new original link.
 *     The link keeps the version's content hash, version label and title as
 *     they were, so what the record was checked against is fixed.
 *   - Linking a later version of a document the record already cites moves the
 *     link: the earlier one is removed in the same transaction, with the same
 *     reason. That is how a person records "re-verified against the reissued
 *     certificate".
 *   - A link is removed, never deleted, and removal needs a reason
 *     (21 CFR 11.10(e)); the table refuses every other change
 *     (migrations/20261005b_cmc_source_evidence.sql).
 *   - Every link and unlink writes a chained audit row on the Vault document's
 *     own history, in the same transaction.
 *   - A linked version that has since been superseded, deleted or had its data
 *     withdrawn (remove_data/supersede) holds every compiled section that read
 *     the record (findEvidenceDrift): approve and final export refuse until a
 *     person re-verifies and moves or removes the link. keep_data preserves
 *     retained extracted-data grounding; its unavailable original is reported
 *     separately and does not by itself create a data-drift hold.
 *
 * Failures are returned, not thrown; only an unexpected error escapes.
 *
 * @module server/services/cmc/source-evidence
 */
import type { PoolClient } from 'pg';
import type { DocumentDispositionChoice } from '../../../shared/document-data-disposition';
import { writeChainedAuditRow } from '../auditService.js';
import { programInOrganization } from '../c2c/program-access';
import { vaultBinaryAvailableSql, vaultDataEligibleSql, vaultDispositionChoiceSql } from '../document-data-disposition/eligibility';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock';
import { requireGovernedReason } from '../../routes/governed-reason';
import { currentVersionLateral, readVersionFamily, supersededSql } from '../vault/vault-version-family.js';
import { type Refusal, refuse, inRefusableTransaction } from '../vault/vault-refusal.js';
import { sectionsFedBy, type SectionDrift } from './section-drift';

export type { Refusal } from '../vault/vault-refusal.js';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_KEY_MAX = 200;

/** Data/version state of a historical link, separate from original availability. */
export type EvidenceState = 'current' | 'superseded' | 'withdrawn';

export interface EvidenceLink {
  id: string;
  sourceKey: string;
  documentId: string;
  /** Title, version and hash as they were when it was linked. */
  title: string | null;
  version: string | null;
  contentHash: string;
  state: EvidenceState;
  /** Original access is separate from eligibility of retained extracted data. */
  originalFileAvailable: boolean;
  disposition: DocumentDispositionChoice | null;
  /** The family's current version label, when a later version replaced this one. */
  currentVersion: string | null;
  reason: string;
  linkedAt: string;
  linkedBy: string | null;
}

export interface EvidenceSource {
  sourceObjectId: string;
  sourceType: string;
  sourceKey: string;
  /** The record as a person names it: its batch number, study, method… */
  label: string;
  evidence: EvidenceLink[];
}

export interface LinkableDocument {
  documentId: string;
  title: string | null;
  version: string | null;
  ctdSection: string | null;
  documentType: string | null;
  /** What the catalogue read the document to be, when it has been catalogued. */
  documentKind: string | null;
  contentHash: string;
  createdAt: string;
}

interface Actor {
  programId: string;
  organizationId: number;
  userId: number;
  ipAddress?: string;
  userAgent?: string;
}

/** The payload fields that name a record, most specific first. */
const LABEL_FIELDS = [
  'batchNumber', 'sampleId', 'lotNumber', 'studyName', 'studyTitle', 'methodName', 'methodCode',
  'assessmentName', 'changeNumber', 'formulationName', 'processName', 'impurityName', 'materialName',
  'productName', 'name', 'inn', 'title',
];

/** A source object as a person names it; its key when no naming field is recorded. */
export function sourceLabel(sourceType: string, sourceKey: string, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  for (const field of LABEL_FIELDS) {
    const v = p[field];
    if (typeof v === 'string' && v.trim()) return `${sourceType.replace(/_/g, ' ')} ${v.trim()}`;
  }
  return sourceKey;
}

const notAProgram = (): Refusal =>
  refuse(409, 'NO_PROGRAM_VAULT', 'This project has no program Vault, so no document can be linked as evidence. Open a program.');

interface DocumentRow {
  id: string;
  content_hash: string;
  version: string | null;
  title: string | null;
  superseded: boolean;
  current_version: string | null;
  original_file_available: boolean;
}

/** A live version of this program, locked for the transaction; null when there is none. */
async function lockDocument(
  client: PoolClient,
  organizationId: number,
  programId: string,
  documentId: string,
): Promise<DocumentRow | null> {
  const { rows } = await client.query(
    `SELECT d.id::text AS id, btrim(d.content_hash) AS content_hash, d.version,
            COALESCE(d.document_title, d.title, d.file_name, d.filename) AS title,
            ${supersededSql('d')} AS superseded, cv.current_version,
            ${vaultBinaryAvailableSql('d')} AS original_file_available
       FROM vault.documents d
       JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $3
       ${currentVersionLateral('d')}
      WHERE d.id = $1 AND d.program_id = $2 AND d.deleted_at IS NULL
      FOR SHARE OF d`,
    [documentId, programId, organizationId],
  );
  return (rows[0] as DocumentRow | undefined) ?? null;
}

async function recordOnDocument(
  client: PoolClient,
  a: Actor,
  action: 'cmc.source_evidence.link' | 'cmc.source_evidence.unlink',
  documentId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await writeChainedAuditRow(client, {
    tenantId: a.organizationId,
    userId: a.userId,
    action,
    resourceType: 'vault_document',
    resourceId: documentId,
    ipAddress: a.ipAddress,
    userAgent: a.userAgent,
    details,
  });
}

/** The request's own refusal, before the database is asked; null when it may proceed. */
function linkRefusal(p: { sourceKey: unknown; documentId: unknown }): Refusal | null {
  if (typeof p.sourceKey !== 'string' || !p.sourceKey.trim() || p.sourceKey.length > SOURCE_KEY_MAX) {
    return refuse(400, 'SOURCE_REQUIRED', 'Name the CMC record the document is evidence for.');
  }
  if (typeof p.documentId !== 'string' || !UUID_RE.test(p.documentId)) {
    return refuse(400, 'DOCUMENT_REQUIRED', 'Choose the Vault document the record was taken from.');
  }
  return null;
}

/** Earlier versions of `doc`'s family that this record still cites, closed with the person's reason. */
async function moveEarlierLinks(client: PoolClient, a: Actor, sourceKey: string, doc: DocumentRow, reason: string): Promise<string[]> {
  const family = await readVersionFamily(client, { programId: a.programId, organizationId: a.organizationId, documentId: doc.id });
  const earlier = (family ?? []).map((v) => v.id).filter((id) => id !== doc.id);
  if (earlier.length === 0) return [];
  const { rows } = await client.query(
    `UPDATE public.cmc_source_evidence
        SET unlinked_at = now(), unlinked_by = $5, unlink_reason = $6
      WHERE organization_id = $1 AND program_id = $2 AND source_key = $3
        AND vault_document_id = ANY($4::uuid[]) AND unlinked_at IS NULL
      RETURNING id::text AS id, vault_document_id::text AS document_id, version_at_link`,
    [a.organizationId, a.programId, sourceKey, earlier, a.userId, reason],
  );
  for (const r of rows) {
    await recordOnDocument(client, a, 'cmc.source_evidence.unlink', r.document_id, {
      description: `No longer evidence for CMC record ${sourceKey}: moved to version ${doc.version ?? '?'}`,
      linkId: r.id,
      sourceKey,
      movedToDocumentId: doc.id,
      reason,
    });
  }
  return rows.map((r) => String(r.id));
}

/** Link a CMC record to an available current original of the same program. */
export async function linkSourceEvidence(
  pool: Queryable,
  a: Actor & { sourceKey: unknown; documentId: unknown; reason: unknown },
): Promise<{ ok: true; id: string; moved: string[] } | Refusal> {
  const early = linkRefusal(a);
  if (early) return early;
  const reason = requireGovernedReason(a.reason);
  if (!reason.ok) return refuse(422, 'REASON_REQUIRED', reason.error);
  if (!(await programInOrganization(pool, a.programId, a.organizationId))) return notAProgram();
  const sourceKey = (a.sourceKey as string).trim();
  const documentId = a.documentId as string;

  return inRefusableTransaction(async (client) => {
    // Serialize with canonical withdrawal before taking impact-table/row locks.
    // Reserve both write tables before reading eligibility or moving a link.
    await lockDocumentDispositionProgram(client, a.organizationId, a.programId);
    await client.query('LOCK TABLE public.cmc_source_evidence, vault.documents IN ROW EXCLUSIVE MODE');
    const src = await client.query(
      `SELECT source_type FROM cmc_source_objects
        WHERE organization_id = $1 AND project_id = $2 AND source_key = $3
        ORDER BY version DESC LIMIT 1`,
      [a.organizationId, a.programId, sourceKey],
    );
    if (src.rows.length === 0) return refuse(404, 'SOURCE_NOT_FOUND', 'No such CMC record in this program.');
    const sourceType = String(src.rows[0].source_type);
    const doc = await lockDocument(client, a.organizationId, a.programId, documentId);
    if (!doc) return refuse(404, 'DOCUMENT_NOT_FOUND', 'That document is not in this program’s Vault.');
    if (!doc.original_file_available) {
      return refuse(409, 'DOCUMENT_WITHDRAWN', 'The original document has been withdrawn and cannot be linked as new CMC evidence. Nothing was saved.');
    }
    if (doc.superseded) {
      return refuse(
        409,
        'DOCUMENT_SUPERSEDED',
        `A later version of that document is in the Vault (version ${doc.current_version ?? '?'}). Link the current version.`,
      );
    }
    const moved = await moveEarlierLinks(client, a, sourceKey, doc, reason.reason);
    const ins = await client.query(
      `INSERT INTO public.cmc_source_evidence
         (organization_id, program_id, source_type, source_key, vault_document_id,
          content_hash_at_link, version_at_link, title_at_link, reason, linked_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (organization_id, program_id, source_key, vault_document_id) WHERE unlinked_at IS NULL DO NOTHING
       RETURNING id::text AS id`,
      [a.organizationId, a.programId, sourceType, sourceKey, doc.id, doc.content_hash, doc.version, doc.title, reason.reason, a.userId],
    );
    if (ins.rows.length === 0) return refuse(409, 'ALREADY_LINKED', 'That version is already linked as evidence for this record.');
    const id = String(ins.rows[0].id);
    await recordOnDocument(client, a, 'cmc.source_evidence.link', doc.id, {
      description: `Linked as evidence for CMC record ${sourceKey}`,
      linkId: id,
      sourceKey,
      sourceType,
      contentHash: doc.content_hash,
      version: doc.version,
      reason: reason.reason,
      ...(moved.length ? { movedFromLinkIds: moved } : {}),
    });
    return { ok: true as const, id, moved };
  });
}

/** Remove a link, with the person's reason. The row stays, marked removed. */
export async function unlinkSourceEvidence(
  pool: Queryable,
  a: Actor & { linkId: string; reason: unknown },
): Promise<{ ok: true } | Refusal> {
  const reason = requireGovernedReason(a.reason);
  if (!reason.ok) return refuse(422, 'REASON_REQUIRED', reason.error);
  if (!UUID_RE.test(a.linkId)) return refuse(404, 'LINK_NOT_FOUND', 'No such evidence link.');
  if (!(await programInOrganization(pool, a.programId, a.organizationId))) return notAProgram();

  return inRefusableTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id::text AS id, source_key, vault_document_id::text AS document_id, unlinked_at
         FROM public.cmc_source_evidence
        WHERE id = $1 AND organization_id = $2 AND program_id = $3
        FOR UPDATE`,
      [a.linkId, a.organizationId, a.programId],
    );
    const link = rows[0];
    if (!link) return refuse(404, 'LINK_NOT_FOUND', 'No such evidence link in this program.');
    if (link.unlinked_at) return refuse(409, 'ALREADY_UNLINKED', 'That evidence link was already removed.');
    await client.query(
      `UPDATE public.cmc_source_evidence
          SET unlinked_at = now(), unlinked_by = $2, unlink_reason = $3
        WHERE id = $1 AND organization_id = $4`,
      [link.id, a.userId, reason.reason, a.organizationId],
    );
    await recordOnDocument(client, a, 'cmc.source_evidence.unlink', link.document_id, {
      description: `No longer evidence for CMC record ${link.source_key}`,
      linkId: link.id,
      sourceKey: link.source_key,
      reason: reason.reason,
    });
    return { ok: true as const };
  });
}

/** Every live link of the program, with what became of each linked version. */
async function readLinks(q: Queryable, organizationId: number, programId: string): Promise<EvidenceLink[]> {
  const { rows } = await q.query(
    `SELECT e.id::text AS id, e.source_key, e.vault_document_id::text AS document_id,
            e.title_at_link, e.version_at_link, e.content_hash_at_link, e.reason, e.linked_at,
            (d.deleted_at IS NOT NULL OR NOT ${vaultDataEligibleSql('d')}) AS withdrawn,
            ${supersededSql('d')} AS superseded, cv.current_version,
            (d.deleted_at IS NULL AND ${vaultBinaryAvailableSql('d')}) AS original_file_available,
            ${vaultDispositionChoiceSql('d')} AS disposition,
            COALESCE(u.name, u.email) AS linked_by
       FROM public.cmc_source_evidence e
       JOIN vault.documents d ON d.id = e.vault_document_id
       ${currentVersionLateral('d')}
       LEFT JOIN LATERAL public.actor_name(e.linked_by) u ON TRUE
      WHERE e.organization_id = $1 AND e.program_id = $2 AND e.unlinked_at IS NULL
      ORDER BY e.linked_at, e.id`,
    [organizationId, programId],
  );
  return rows.map((r) => ({
    id: r.id,
    sourceKey: r.source_key,
    documentId: r.document_id,
    title: r.title_at_link ?? null,
    version: r.version_at_link ?? null,
    contentHash: r.content_hash_at_link,
    state: r.withdrawn ? 'withdrawn' : r.superseded ? 'superseded' : 'current',
    originalFileAvailable: r.original_file_available,
    disposition: r.disposition ?? null,
    currentVersion: r.superseded ? (r.current_version ?? null) : null,
    reason: r.reason,
    linkedAt: new Date(r.linked_at).toISOString(),
    linkedBy: r.linked_by ?? null,
  }));
}

/**
 * The CMC records that feed a section (or every record of the program), each
 * with its live evidence. A record feeds a section when the section's compile
 * read it, or when its type feeds the section by the write-through's own impact
 * map — the records a person would link before the next compile.
 */
export async function listSourceEvidence(
  q: Queryable,
  p: { organizationId: number; programId: string; sectionKey?: string },
): Promise<{ ok: true; sources: EvidenceSource[] } | Refusal> {
  if (!(await programInOrganization(q, p.programId, p.organizationId))) return notAProgram();
  const [sourcesRes, lineageRes, links] = await Promise.all([
    q.query(
      `SELECT DISTINCT ON (source_key) id::text AS id, source_type, source_key, source_payload
         FROM cmc_source_objects
        WHERE organization_id = $1 AND project_id = $2
        ORDER BY source_key, version DESC`,
      [p.organizationId, p.programId],
    ),
    p.sectionKey
      ? q.query(
          `SELECT l.source_object_id::text AS id
             FROM cmc_module3_sections s
             JOIN cmc_section_lineage l ON l.section_id = s.id AND l.organization_id = s.organization_id
            WHERE s.organization_id = $1 AND s.project_id = $2 AND s.section_key = $3`,
          [p.organizationId, p.programId, p.sectionKey],
        )
      : Promise.resolve({ rows: [] as any[] }),
    readLinks(q, p.organizationId, p.programId),
  ]);
  const read = new Set(lineageRes.rows.map((r) => String(r.id)));
  const feeds = (s: any) =>
    !p.sectionKey ||
    read.has(String(s.id)) ||
    sectionsFedBy({ sourceType: s.source_type, sourcePayload: s.source_payload }).includes(p.sectionKey);
  const sources = sourcesRes.rows.filter(feeds).map((s) => ({
    sourceObjectId: String(s.id),
    sourceType: String(s.source_type),
    sourceKey: String(s.source_key),
    label: sourceLabel(String(s.source_type), String(s.source_key), s.source_payload),
    evidence: links.filter((l) => l.sourceKey === s.source_key),
  }));
  sources.sort((x, y) => x.sourceType.localeCompare(y.sourceType) || x.label.localeCompare(y.label));
  return { ok: true, sources };
}

/** Available current originals a record could newly cite, Module 3 placements first. */
export async function listLinkableDocuments(
  q: Queryable,
  p: { organizationId: number; programId: string },
): Promise<{ ok: true; documents: LinkableDocument[] } | Refusal> {
  if (!(await programInOrganization(q, p.programId, p.organizationId))) return notAProgram();
  const { rows } = await q.query(
    `SELECT d.id::text AS id, COALESCE(d.document_title, d.title, d.file_name, d.filename) AS title,
            d.version, d.ctd_section, d.document_type, c.document_kind, btrim(d.content_hash) AS content_hash,
            d.created_at
       FROM vault.documents d
       JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $2
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id
      WHERE d.program_id = $1 AND d.deleted_at IS NULL AND NOT ${supersededSql('d')}
        AND ${vaultBinaryAvailableSql('d')}
      ORDER BY (d.ctd_section LIKE '3.%' OR d.ctd_section LIKE 'm3%') DESC NULLS LAST, d.ctd_section NULLS LAST,
               d.created_at DESC
      LIMIT 500`,
    [p.programId, p.organizationId],
  );
  return {
    ok: true,
    documents: rows.map((r) => ({
      documentId: r.id,
      title: r.title ?? null,
      version: r.version ?? null,
      ctdSection: r.ctd_section ?? null,
      documentType: r.document_type ?? null,
      documentKind: r.document_kind ?? null,
      contentHash: r.content_hash,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  };
}

/** At most this many reasons are named per section; the rest are counted. */
const NAMED_REASONS = 5;

/**
 * Compiled sections that read a record whose linked Vault version has since
 * been superseded, deleted or had its data withdrawn (remove_data/supersede).
 * keep_data withdraws only original access and preserves retained-data
 * grounding, so it does not alone hold a section. For actual data/version
 * drift a person re-verifies and moves the link, corrects/recompiles the record,
 * or removes the link with a reason.
 */
export async function findEvidenceDrift(
  q: Queryable,
  orgId: number,
  projectId: string,
  opts: { sectionKey?: string } = {},
): Promise<SectionDrift[]> {
  if (!UUID_RE.test(projectId)) return []; // a legacy project has no Vault, so no evidence
  const sectionFilter = opts.sectionKey ? 'AND s.section_key = $3' : '';
  const params: unknown[] = opts.sectionKey ? [orgId, projectId, opts.sectionKey] : [orgId, projectId];
  const { rows } = await q.query(
    `SELECT DISTINCT s.section_key, e.source_key, e.title_at_link, e.version_at_link,
            (d.deleted_at IS NOT NULL OR NOT ${vaultDataEligibleSql('d')}) AS withdrawn, cv.current_version
       FROM cmc_module3_sections s
       JOIN cmc_section_lineage l ON l.section_id = s.id AND l.organization_id = s.organization_id
       JOIN cmc_source_objects o ON o.id = l.source_object_id AND o.organization_id = s.organization_id
       JOIN public.cmc_source_evidence e
         ON e.organization_id = s.organization_id AND e.program_id::text = s.project_id
        AND e.source_key = o.source_key AND e.unlinked_at IS NULL
       JOIN vault.documents d ON d.id = e.vault_document_id
       ${currentVersionLateral('d')}
      WHERE s.organization_id = $1 AND s.project_id = $2 ${sectionFilter}
        AND (d.deleted_at IS NOT NULL OR NOT ${vaultDataEligibleSql('d')} OR ${supersededSql('d')})
      ORDER BY s.section_key, e.source_key`,
    params,
  );
  const bySection = new Map<string, string[]>();
  for (const r of rows) {
    const doc = `"${r.title_at_link ?? 'untitled'}" version ${r.version_at_link ?? '?'}`;
    const fate = r.withdrawn
      ? 'which has been withdrawn from the Vault'
      : `which version ${r.current_version ?? '?'} has superseded`;
    const reasons = bySection.get(r.section_key) ?? [];
    reasons.push(`${r.source_key} was taken from ${doc}, ${fate}`);
    bySection.set(r.section_key, reasons);
  }
  return [...bySection].map(([sectionKey, reasons]) => {
    const named = reasons.slice(0, NAMED_REASONS);
    const more = reasons.length - named.length;
    return { sectionKey, reasons: more > 0 ? [...named, `and ${more} more`] : named };
  });
}
