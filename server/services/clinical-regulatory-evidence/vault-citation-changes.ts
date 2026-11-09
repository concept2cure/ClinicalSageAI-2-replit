/**
 * Sections fed by a Vault version that a later approved version has replaced (S12; founder decisions P-83, P-109;
 * option (A), 2026-11-09). Split from source-usage.service.ts, whose data-room changes it sits beside.
 *
 * A work project's deliverable is a Vault document's version family (P-109 item 3). A filing section is fed by the
 * version it was drafted from. That link already exists: the section's live `vault_document` span lineage
 * (span-lineage-vault.ts, written when a section is drafted from a Vault version), which the Vault's where-used reads
 * (vault-where-used.ts `readVaultSectionCitations`, G7). The Vault showed, on the new version, the sections that still
 * cite an earlier one. The project never did, so a filing section written from version 1 of a CMC deliverable read as
 * current after version 2 was approved.
 *
 * Only an approved later version counts: one whose lifecycle record is at a steady stage (vault-lifecycle.ts
 * STEADY_STAGES). A later draft is not yet a reason to revisit the text. The later versions are the Vault's own answer,
 * read through its existing readers (vault-version-family.ts `readVersionFamily`, `readPredecessorIds`): no Vault file
 * is changed, and no family rule is restated here (P-109, third clarification, 2026-11-09).
 *
 * A REPORT, never a rewrite, as the data-room changes are. Read inside the program: the section's document and the
 * cited version are the same program's (P-109 item 2), and the sections are those the person may read
 * (getCurrentAuthoringReadScope).
 */
import type { RequestSqlClient } from '../../db/requestDb';
import { getCurrentAuthoringReadScope, requireAuthoringReadScopeStillCurrent } from '../authoring/authoring-read-scope';
import { readPredecessorIds, readVersionFamily, type FamilyVersion } from '../vault/vault-version-family';
import { STEADY_STAGES } from '../vault/vault-lifecycle';

export interface ChangedVaultCitation {
  sectionId: string;
  sectionCode: string | null;
  sectionTitle: string | null;
  documentId: string;
  documentTitle: string | null;
  /** The Vault version the section was drafted from. */
  citedVaultId: string;
  citedVersion: string | null;
  vaultTitle: string | null;
  /** The latest approved version after it. */
  approvedVaultId: string;
  approvedVersion: string | null;
  /** Live spans in the section that cite the earlier version. */
  spans: number;
}

interface CitedRow {
  section_id: string; section_code: string | null; section_title: string | null; document_id: string;
  document_title: string | null; cited_id: string; cited_version: string | null; vault_title: string | null; spans: number;
}

/** The program's sections with a live Vault span, and the version each cites, within the person's read scope. */
async function citedVersions(q: RequestSqlClient, orgId: number, programId: string, sectionIds: string[], limit: number): Promise<CitedRow[]> {
  const { rows } = await q.query(
    `SELECT sec.id::text AS section_id, sec.code AS section_code, sec.title AS section_title,
            doc.id::text AS document_id, doc.title AS document_title,
            v.id::text AS cited_id, v.version AS cited_version, v.document_title AS vault_title, count(*)::int AS spans
       FROM document_span_lineage l
       JOIN authoring_sections sec ON sec.id::text = l.document_id AND sec.tenant_id = l.organization_id
       JOIN authoring_documents doc ON doc.id = sec.doc_id AND doc.tenant_id = l.organization_id
       JOIN vault.documents v ON v.id::text = l.reference_id AND v.organization_id = l.organization_id
        AND v.deleted_at IS NULL AND v.program_id = doc.client_program_id
      WHERE l.organization_id = $1 AND l.provenance_kind = 'vault_document' AND l.document_table = 'authoring_sections'
        AND l.deleted_at IS NULL AND doc.client_program_id = $2::uuid AND sec.id = ANY($3::uuid[])
      GROUP BY sec.id, sec.code, sec.title, doc.id, doc.title, v.id, v.version, v.document_title
      ORDER BY doc.title, sec.code, sec.id, v.id
      LIMIT $4`,
    [orgId, programId, sectionIds, limit],
  );
  return rows as unknown as CitedRow[];
}

/** For each cited version, its later versions, newest first: its family less itself and its predecessors. */
async function laterVersions(q: RequestSqlClient, orgId: number, programId: string, citedIds: string[]): Promise<Map<string, FamilyVersion[]>> {
  const out = new Map<string, FamilyVersion[]>();
  for (const documentId of citedIds) {
    const family = await readVersionFamily(q, { programId, organizationId: orgId, documentId });
    if (!family) continue;
    const earlier = new Set([documentId, ...(await readPredecessorIds(q, { organizationId: orgId, documentId }))]);
    out.set(documentId, family.filter((version) => !earlier.has(version.id)));
  }
  return out;
}

/** The versions among `ids` whose lifecycle record in the organization is at a steady (approved, usable) stage. */
async function approvedIds(q: RequestSqlClient, orgId: number, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { rows } = await q.query(
    `SELECT DISTINCT source_refs -> 'vault_documents' ->> 'nativeId' AS vault_id
       FROM canonical_documents
      WHERE organization_id = $1 AND source_refs ? 'vault_documents'
        AND source_refs -> 'vault_documents' ->> 'nativeId' = ANY($2::text[]) AND stage = ANY($3::text[])`,
    [orgId, ids, [...STEADY_STAGES]],
  );
  return new Set((rows as unknown as Array<{ vault_id: string }>).map((r) => r.vault_id));
}

/** A section drafted from a Vault version, and that version's standing (S12 gap 5, the program's map): `current` when no
 *  later version of its document is approved, `replaced` when one is (then named). Not attributed to a work project. */
export interface VaultFedSection {
  sectionId: string; sectionCode: string | null; sectionTitle: string | null;
  documentId: string; documentTitle: string | null;
  citedVaultId: string; citedVersion: string | null; vaultTitle: string | null;
  state: 'current' | 'replaced';
  approvedVaultId: string | null; approvedVersion: string | null;
  spans: number;
}

/** The program's sections with a live Vault citation, each with its standing. One read, the same readers and scope. */
export async function listVaultFedSections(
  q: RequestSqlClient,
  orgId: number,
  opts: { userId: number | undefined; programId: string; limit?: number },
): Promise<VaultFedSection[]> {
  const identity = { organizationId: orgId, userId: opts.userId, programId: opts.programId };
  const access = await getCurrentAuthoringReadScope(q, identity);
  const cited = await citedVersions(q, orgId, opts.programId, access.sectionIds, Math.min(Math.max(opts.limit ?? 100, 1), 500));
  const later = await laterVersions(q, orgId, opts.programId, [...new Set(cited.map((r) => r.cited_id))]);
  const approved = await approvedIds(q, orgId, [...new Set([...later.values()].flat().map((v) => v.id))]);
  await requireAuthoringReadScopeStillCurrent(q, identity, access);
  return cited.map((r) => {
    const latest = (later.get(r.cited_id) ?? []).find((version) => approved.has(version.id)) ?? null;
    return {
      sectionId: r.section_id, sectionCode: r.section_code ?? null, sectionTitle: r.section_title ?? null,
      documentId: r.document_id, documentTitle: r.document_title ?? null, citedVaultId: r.cited_id,
      citedVersion: r.cited_version ?? null, vaultTitle: r.vault_title ?? null, state: latest ? 'replaced' : 'current',
      approvedVaultId: latest?.id ?? null, approvedVersion: latest?.version ?? null, spans: Number(r.spans) || 0,
    };
  });
}

/** The program's sections whose live Vault citation names a version a later approved version has replaced. */
export async function listChangedVaultCitations(
  q: RequestSqlClient,
  orgId: number,
  opts: { userId: number | undefined; programId: string; limit?: number },
): Promise<ChangedVaultCitation[]> {
  return replacedVaultCitations(await listVaultFedSections(q, orgId, opts));
}

/** The replaced half of a program's Vault-fed sections, as the project's changes report it. */
export function replacedVaultCitations(feeds: VaultFedSection[]): ChangedVaultCitation[] {
  return feeds.flatMap(({ state, approvedVaultId, approvedVersion, ...rest }) =>
    state === 'replaced' && approvedVaultId ? [{ ...rest, approvedVaultId, approvedVersion }] : []);
}
