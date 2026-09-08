/**
 * The ONE writer of device-kit section prose on behalf of AnA (ledger L160).
 *
 * `cerv2_510k_sections` is what a 510(k) / PMA / CER is assembled from. Two
 * AnA paths wrote it — the `write_kit_section` tool (transaction, version row,
 * lineage gate) and the AnA-RI `section.update` command (three bare pool
 * statements, no transaction, no lineage) — each inlining its own UPDATE.
 * Four writers of one table is three too many, and the fourth was the one
 * with no provenance. Both now call this, on the caller's transaction client:
 *
 *   1. the prior row is read FOR UPDATE — the `previousValues` snapshot and the
 *      row lock that stops two writers computing the same next version;
 *   2. the content, status and completion are written, the row is marked as an
 *      AnA draft awaiting a person's acceptance (a prior acceptance does not
 *      cover text AnA has since replaced), and `last_edited_by` names the actor;
 *   3. the version row is appended by the shared version writer;
 *   4. the lineage gate runs: verbatim clauses against the cited Data Room
 *      sources, the rest as the actor's assertion — a gap rolls everything back.
 *
 * Attribution is required, never defaulted: prose bound for a regulator is
 * attributed or refused.
 */
import {
  enforceAuthorLineage,
  enforceSourceAndAuthorLineage,
  type SourceAndAuthorLineageResult,
} from '../clinical-regulatory-evidence/lineage-gate';
import type { RetrievedSource } from '../clinical-regulatory-evidence/source-attribution';
import type { Queryable } from '../clinical-regulatory-evidence/span-lineage.service';
import { recordCerv2SectionVersion } from './section-version';

export type KitSectionTarget = { sectionKey: string } | { sectionId: number };

export interface WriteKitSectionInput {
  content: string;
  /** Omitted or null keeps the section's current status. */
  status?: string | null;
  /** Omitted or null keeps the section's current completion. */
  completionPercentage?: number | null;
  /** The caller's own note for the drafted_summary column; empty means none. */
  note?: string | null;
  /** Why the change was made — the version row's change_summary (never defaulted here). */
  changeSummary: string;
  /** Data Room passages the text quoted, already resolved to canonical source ids. */
  sources?: RetrievedSource[];
  /** The identified person AnA is acting for. */
  actorUserId: number;
  changedByName?: string | null;
}

export interface KitSectionBefore {
  id: number;
  section_number: string | null;
  section_title: string | null;
  content: string | null;
  status: string | null;
  completion_percentage: number | null;
}

export interface KitSectionRow {
  id: number;
  section_number: string | null;
  section_title: string | null;
  section_key: string;
  status: string;
  completionPercentage: number;
  draftedAt: string | Date | null;
}

export interface WriteKitSectionResult {
  row: KitSectionRow;
  before: KitSectionBefore;
  versionNumber: number;
  fieldsChanged: string[];
  /** The gate's own count when sources were cited; null for author-only lineage. */
  gate: SourceAndAuthorLineageResult | null;
}

export class KitSectionNotFoundError extends Error {
  readonly code = 'KIT_SECTION_NOT_FOUND';
  constructor(target: KitSectionTarget) {
    super(
      'sectionKey' in target
        ? `No section found for organization with section_key='${target.sectionKey}'. The kit's section taxonomy must be seeded first (run \`npm run db:seed:mdx-sections\`).`
        : `Section ${target.sectionId} not found in your organization.`,
    );
  }
}

export async function writeKitSectionTx(
  client: Queryable,
  orgId: number,
  target: KitSectionTarget,
  input: WriteKitSectionInput,
): Promise<WriteKitSectionResult> {
  if (!Number.isInteger(input.actorUserId) || input.actorUserId <= 0) {
    throw new Error(
      'Kit section prose cannot be attributed without an identified author (21 CFR Part 11): pass actorUserId.',
    );
  }
  const byKey = 'sectionKey' in target;
  const prior = await client.query<KitSectionBefore>(
    `SELECT id, section_number, section_title, content, status, completion_percentage
       FROM cerv2_510k_sections
      WHERE organization_id = $1 AND ${byKey ? 'section_key' : 'id'} = $2
      FOR UPDATE`,
    [orgId, byKey ? target.sectionKey : target.sectionId],
  );
  if (prior.rows.length === 0) throw new KitSectionNotFoundError(target);
  const before = prior.rows[0];
  const status = input.status ?? before.status ?? 'drafting';
  const completionPercentage = input.completionPercentage ?? Number(before.completion_percentage ?? 0);

  const updated = await client.query<KitSectionRow>(
    `UPDATE cerv2_510k_sections
        SET content                = $2,
            status                 = $3,
            completion_percentage  = $4,
            draft_source           = 'ana',
            drafted_at             = NOW(),
            drafted_summary        = NULLIF($5, ''),
            accepted_at            = NULL,
            accepted_by            = NULL,
            last_edited_by         = $6,
            updated_at             = NOW()
      WHERE organization_id = $1 AND id = $7
      RETURNING id, section_number, section_title, section_key, status,
                completion_percentage AS "completionPercentage",
                drafted_at AS "draftedAt"`,
    [orgId, input.content, status, completionPercentage, input.note ?? '', input.actorUserId, before.id],
  );
  const row = updated.rows[0];

  const fieldsChanged = ['content'];
  if (status !== (before.status ?? null)) fieldsChanged.push('status');
  if (completionPercentage !== Number(before.completion_percentage ?? 0)) fieldsChanged.push('completion_percentage');

  const versionNumber = await recordCerv2SectionVersion(client, {
    sectionId: before.id,
    organizationId: orgId,
    changeType: 'edited',
    changeSummary: input.changeSummary,
    content: input.content,
    status,
    completionPercentage,
    previousValues: {
      content: before.content ?? '',
      status: before.status ?? null,
      completion_percentage: before.completion_percentage ?? null,
    },
    newValues: { content: input.content, status, completion_percentage: completionPercentage },
    fieldsChanged,
    changedBy: input.actorUserId,
    changedByName: input.changedByName ?? null,
  });

  const ref = { documentTable: 'cerv2_510k_sections', documentId: String(before.id) };
  let gate: SourceAndAuthorLineageResult | null = null;
  if (input.sources && input.sources.length > 0) {
    gate = await enforceSourceAndAuthorLineage(client, orgId, ref, input.content, String(input.actorUserId), input.sources);
  } else {
    await enforceAuthorLineage(client, orgId, ref, input.content, String(input.actorUserId));
  }

  return { row, before, versionNumber, fieldsChanged, gate };
}
