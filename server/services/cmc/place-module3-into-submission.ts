/**
 * place-module3-into-submission — the CMC → IND submission seam.
 *
 * ── The gap this closes ───────────────────────────────────────────────────────
 * The CMC Module 3 OS compiles §3.2 from canonical sources, takes Part 11
 * approvals, and holds a fail-closed export gate — and then stopped. Nothing
 * ever created `submission_leaves`, so an approved, export-ready Module 3 was
 * structurally unreachable from any IND sequence: the leaf resolver
 * materializes only integer-keyed tables (coauthor_documents,
 * unified_documents, ctd_onboarding_documents), and governed artifacts are
 * string-keyed (see AuthoringPlaceIntoFiling's identity note).
 *
 * ── The derivation (the same one authoring placement states) ─────────────────
 *   1. REFUSE unless the final-export gate passes — evaluateFinalExportGate is
 *      the same function behind POST /guard/final-export, so the placement
 *      refusal IS the gate's verdict, not a second opinion.
 *   2. For each approved, non-stale §3.2 section: file a point-in-time
 *      snapshot of the compiled narrative AND the tables that narrative cites
 *      into `coauthor_documents` (the canonical renderable leaf source,
 *      org-scoped, integer-keyed), with moduleNumber = the m-prefixed eCTD code
 *      the renderer prints as the section header. The snapshot is built by
 *      module3Composer.renderComposedSectionMarkdown — the same renderer the
 *      governed-artifact bridge uses — so the filed leaf and the governed
 *      artifact are the same document.
 *   3. Place that snapshot as a leaf via submission-service `upsertLeaf` — the
 *      same audited write the Submission Center Builder makes. upsertLeaf
 *      re-verifies org scope, refuses locked sequences, and pins the sha256
 *      of the snapshot content.
 *   4. Record a `placed_into_submission` provenance event per section.
 *   5. A run that filed NO leaf is a REFUSAL, not a placement of zero
 *      sections — nothing was written, so nothing may be reported as
 *      filed. The refusal carries each section's own skip reason.
 *
 * Section codes translate '3.2.S.1' → 'm3.2.S.1' (services/regulatory/
 * ind-ectd-sections.ts vocabulary), so the IND checklist assembler, package
 * manifest (M3 — Quality/CMC) and eCTD assembly all see the leaves without
 * any change on their side.
 */
import { db } from '../../db';
import { getPool } from '../../db';
import { coauthorDocuments } from '../../../shared/schema';
import { getSequence, listLeaves, listSequences, upsertLeaf } from '../submission-service/submission-service';
import { evaluateFinalExportGate, type FinalExportGateVerdict } from './final-export-gate';
import { getSectionLabels } from '../module3-convergence-service';
import { renderComposedSectionMarkdown, type GeneratedTable } from '../module3Composer';

/**
 * Wording for the one refusal this seam adds: a section whose stored
 * deterministic_json predates tables being carried at all. Exported so the
 * caller (and its tests) can name the condition instead of matching prose.
 */
export const LEGACY_NO_TABLES_SKIP_REASON =
  'Compiled before section tables were carried; recompile the section before placing.';

/**
 * Read the composed tables back out of a section's stored deterministic_json.
 *
 * Three outcomes, deliberately distinguished:
 *   - `undefined` — the row has NO `tables` key: compiled before the composer's
 *     tables were persisted. We cannot know whether this section had tables, so
 *     it is NOT placed (see the skip below). Never file a narrative that says
 *     "see the table" over a document that may be missing it.
 *   - `[]` — a real "this section composes no tables". Places normally.
 *   - a populated array — the tables get rendered into the snapshot.
 *
 * Rows that carry a `tables` key of the wrong shape are treated as the legacy
 * case (unknown), not silently as "no tables": a malformed payload is a reason
 * to refuse, not to file a thinner document.
 */
export function readSectionTables(deterministicJson: unknown): GeneratedTable[] | undefined {
  if (!deterministicJson || typeof deterministicJson !== 'object') return undefined;
  const raw = (deterministicJson as Record<string, unknown>).tables;
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const tables: GeneratedTable[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return undefined;
    const t = entry as Record<string, unknown>;
    if (typeof t.title !== 'string') return undefined;
    if (!Array.isArray(t.headers) || !t.headers.every((h) => typeof h === 'string')) return undefined;
    if (!Array.isArray(t.rows) || !t.rows.every((r) => Array.isArray(r))) return undefined;
    tables.push({
      title: t.title,
      headers: t.headers as string[],
      rows: (t.rows as unknown[][]).map((r) => r.map((c) => String(c ?? ''))),
    });
  }
  return tables;
}

export interface PlaceModule3Input {
  orgId: number;
  userId: number;
  /** CMC TEXT project id — program uuid or legacy numeric, as the OS stores it. */
  cmcProjectId: string;
  /** Target submission (verified to own the sequence). */
  submissionId: number;
  /** Target sequence — must be unlocked; upsertLeaf refuses otherwise. */
  sequenceId: number;
}

export interface PlacedSection {
  sectionKey: string;
  leafSectionCode: string;
  title: string;
  coauthorDocumentId: number;
  leafId: number;
  /** How many composed tables were carried into the filed snapshot. */
  tableCount: number;
}

export interface SkippedSection {
  sectionKey: string;
  reason: string;
}

export type PlaceModule3Result =
  | {
      placed: false;
      /** The final-export gate refused before anything was read or written. */
      refusedBy: 'final-export-gate';
      /** The gate's own wording — surfaced verbatim to the caller. */
      error: string;
      data: FinalExportGateVerdict['data'];
    }
  | {
      placed: false;
      /**
       * The gate passed, but every approved section turned out to be
       * unplaceable, so no leaf was written. "Placed nothing" is a refusal,
       * not a placement: a caller that reads only a success flag would
       * otherwise record "Module 3 filed" over a sequence with no Module 3
       * leaves in it. Nothing was written when this is returned.
       */
      refusedBy: 'nothing-placeable';
      error: string;
      skipped: SkippedSection[];
    }
  | {
      placed: true;
      submissionId: number;
      sequenceId: number;
      placements: PlacedSection[];
      /** Sections the gate passed but that carry nothing renderable — stated, not hidden. */
      skipped: SkippedSection[];
    };

/**
 * The wording of the nothing-placeable refusal. It states the count and quotes
 * the sections' own reasons (the first three; the full list travels in
 * `skipped`), so the refusal is actionable without a second request.
 */
function nothingPlaceableError(skipped: SkippedSection[]): string {
  const shown = skipped.slice(0, 3).map((s) => `§${s.sectionKey}: ${s.reason}`).join(' ');
  const more = skipped.length > 3 ? ` (+${skipped.length - 3} more)` : '';
  return `Nothing was placed — all ${skipped.length} approved section(s) were skipped. ${shown}${more}`;
}

/** '3.2.S.1' → 'm3.2.S.1' — the eCTD spine's vocabulary. */
export function toLeafSectionCode(sectionKey: string): string {
  return 'm' + sectionKey;
}

/** The `placed_into_submission` provenance event — one per placed section. */
async function recordPlacementProvenance(
  pool: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  orgId: number,
  cmcProjectId: string,
  actorId: string,
  payload: {
    sectionKey: string;
    leafSectionCode: string;
    submissionId: number;
    sequenceId: number;
    leafId: number;
    coauthorDocumentId: number;
    tableCount: number;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO cmc_provenance_events
       (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
     VALUES ($1, $2, 'section', $3, 'placed_into_submission', $4::jsonb, $5)`,
    [orgId, cmcProjectId, payload.sectionKey, JSON.stringify(payload), actorId],
  );
}

/**
 * File ONE placeable section: point-in-time snapshot → leaf → provenance.
 *
 * Nothing here is conditional — the caller has already decided the section is
 * placeable. The snapshot is the canonical renderable leaf source: what is
 * filed is what was approved (nothing edits placement snapshots, and upsertLeaf
 * pins its sha256), rendered by the same renderer the governed-artifact bridge
 * uses so the filed leaf and the governed artifact are the same document.
 */
async function fileSectionAsLeaf(params: {
  pool: { query: (sql: string, p: unknown[]) => Promise<unknown> };
  input: PlaceModule3Input;
  sectionKey: string;
  label: string;
  narrative: string;
  tables: GeneratedTable[];
  /** The same section's leaf in an earlier sequence, when it has one. */
  prior?: { id: number };
}): Promise<PlacedSection> {
  const { pool, input, sectionKey, label, narrative, tables, prior } = params;
  const { orgId, userId, cmcProjectId, submissionId, sequenceId } = input;
  const leafSectionCode = toLeafSectionCode(sectionKey);
  const title = `Module 3 — ${label} (§${sectionKey})`;

  const [snapshot] = await db
    .insert(coauthorDocuments)
    .values({
      organizationId: orgId,
      title,
      content: renderComposedSectionMarkdown(label, narrative, tables),
      status: 'approved',
      moduleNumber: leafSectionCode,
      createdBy: String(userId),
      metadata: {
        placedFrom: 'cmc-module3-os',
        cmcProjectId,
        sectionKey,
      },
    })
    .returning({ id: coauthorDocuments.id });

  const leaf = await upsertLeaf(
    {
      sequenceId,
      sectionCode: leafSectionCode,
      title,
      lifecycleOp: prior ? 'replace' : 'new',
      parentLeafId: prior?.id ?? null,
      documentTable: 'coauthor_documents',
      documentId: snapshot.id,
      documentType: 'cmc_module3_section',
    },
    { organizationId: orgId, userId },
  );

  const placement: PlacedSection = {
    sectionKey,
    leafSectionCode,
    title,
    coauthorDocumentId: snapshot.id,
    leafId: (leaf as { id: number }).id,
    tableCount: tables.length,
  };

  await recordPlacementProvenance(pool, orgId, cmcProjectId, String(userId), {
    sectionKey,
    leafSectionCode,
    submissionId,
    sequenceId,
    leafId: placement.leafId,
    coauthorDocumentId: placement.coauthorDocumentId,
    tableCount: placement.tableCount,
  });

  return placement;
}

/**
 * The most recent Module 3 leaf per section code placed in an EARLIER sequence
 * of the same submission (by sequence number), so a re-placement can be filed
 * as 'replace' of that leaf. Deleted leaves and delete operations do not count.
 */
async function priorModule3Leaves(
  submissionId: number,
  current: { id: number; sequenceNumber?: string | null },
  organizationId: number,
): Promise<Map<string, { id: number }>> {
  const byNumber = (n: string | null | undefined) => String(n ?? '');
  const earlier = (await listSequences(submissionId, { organizationId }))
    .filter((s) => s.id !== current.id && byNumber(s.sequenceNumber) < byNumber(current.sequenceNumber))
    .sort((a, b) => (byNumber(a.sequenceNumber) < byNumber(b.sequenceNumber) ? 1 : -1));
  const prior = new Map<string, { id: number }>();
  for (const seq of earlier) {
    for (const leaf of await listLeaves(seq.id, { organizationId })) {
      if (leaf.documentType !== 'cmc_module3_section' || leaf.lifecycleOp === 'delete') continue;
      if (!prior.has(leaf.sectionCode)) prior.set(leaf.sectionCode, { id: leaf.id });
    }
  }
  return prior;
}

export async function placeModule3IntoSubmission(input: PlaceModule3Input): Promise<PlaceModule3Result> {
  const { orgId, userId, cmcProjectId, submissionId, sequenceId } = input;

  // 1. The gate. Fail closed before any write.
  const gate = await evaluateFinalExportGate({
    orgId,
    projectId: cmcProjectId,
    actorId: String(userId),
  });
  if (!gate.allowed) {
    return {
      placed: false,
      refusedBy: 'final-export-gate',
      error: gate.error ?? 'Final export gate refused placement.',
      data: gate.data,
    };
  }

  // 2. The target sequence must exist in this org AND belong to the stated
  // submission — a leaf placed into someone else's spine because two ids were
  // swapped would corrupt the filing record. upsertLeaf re-checks org scope
  // and lock state on every write (belt and braces).
  const sequence = await getSequence(sequenceId, { organizationId: orgId });
  if (Number((sequence as { submissionId?: number }).submissionId) !== submissionId) {
    throw new Error('NOT_FOUND: The sequence does not belong to the stated submission.');
  }

  // 2b. A section already placed in an earlier sequence of this submission is
  // a revision of that leaf, not a new document. This always filed 'new', so
  // an amendment's m3.2.S.7 was announced to the agency as brand-new content
  // with no lifecycle link to the leaf it replaces.
  const priorBySection = await priorModule3Leaves(submissionId, sequence, orgId);

  // 3. Approved sections with their compiled narrative.
  const pool = getPool();
  const { rows: sections } = await pool.query(
    `SELECT section_key AS "sectionKey", narrative_text AS "narrativeText",
            deterministic_json AS "deterministicJson"
     FROM cmc_module3_sections
     WHERE organization_id = $1 AND project_id = $2
       AND approval_state = 'approved' AND stale = false
     ORDER BY section_key`,
    [orgId, cmcProjectId],
  );

  const labels = getSectionLabels();
  const placements: PlacedSection[] = [];
  const skipped: SkippedSection[] = [];

  for (const s of sections as Array<{
    sectionKey: string;
    narrativeText: string | null;
    deterministicJson: unknown;
  }>) {
    const narrative = (s.narrativeText ?? '').trim();
    if (!narrative) {
      // An approved section with no compiled narrative has nothing to render
      // into the package. Say so instead of filing an empty leaf whose pin
      // would be NULL and whose PDF would be a title page.
      skipped.push({ sectionKey: s.sectionKey, reason: 'No compiled narrative to place.' });
      continue;
    }

    /* The composer writes a narrative that CITES its tables. A section whose
       stored payload predates tables being carried cannot be rendered
       faithfully — placing it would file prose saying "see the change history
       table" into a document with no table in it. Fail closed and name the
       remedy; a plain recompile restores placement. */
    const tables = readSectionTables(s.deterministicJson);
    if (tables === undefined) {
      skipped.push({ sectionKey: s.sectionKey, reason: LEGACY_NO_TABLES_SKIP_REASON });
      continue;
    }

    placements.push(
      await fileSectionAsLeaf({
        pool,
        input,
        sectionKey: s.sectionKey,
        label: labels[s.sectionKey] || s.sectionKey,
        narrative,
        tables,
        // A re-placement of a section already filed in an earlier sequence is a
        // `replace` of that leaf, not a second `new` one.
        prior: priorBySection.get(toLeafSectionCode(s.sectionKey)),
      }),
    );
  }

  /* Every approved section was unplaceable — nothing was snapshotted and no
     leaf was written. Refuse rather than report a placement of zero sections:
     this is exactly the state of a project whose sections were all approved
     before the composed tables were carried, so it is the common answer at
     rollout, and a client reading only a success flag must not read it as a
     filed Module 3. The remedy is in each section's own reason. */
  if (placements.length === 0) {
    return {
      placed: false,
      refusedBy: 'nothing-placeable',
      error: nothingPlaceableError(skipped),
      skipped,
    };
  }

  return { placed: true, submissionId, sequenceId, placements, skipped };
}
