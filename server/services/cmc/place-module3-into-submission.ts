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
 *      snapshot of the compiled narrative into `coauthor_documents` (the
 *      canonical renderable leaf source, org-scoped, integer-keyed), with
 *      moduleNumber = the m-prefixed eCTD code the renderer prints as the
 *      section header.
 *   3. Place that snapshot as a leaf via submission-service `upsertLeaf` — the
 *      same audited write the Submission Center Builder makes. upsertLeaf
 *      re-verifies org scope, refuses locked sequences, and pins the sha256
 *      of the snapshot content.
 *   4. Record a `placed_into_submission` provenance event per section.
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
}

export type PlaceModule3Result =
  | {
      placed: false;
      /** The gate's own wording — surfaced verbatim to the caller. */
      error: string;
      data: FinalExportGateVerdict['data'];
    }
  | {
      placed: true;
      submissionId: number;
      sequenceId: number;
      placements: PlacedSection[];
      /** Sections the gate passed but that carry nothing renderable — stated, not hidden. */
      skipped: Array<{ sectionKey: string; reason: string }>;
    };

/** '3.2.S.1' → 'm3.2.S.1' — the eCTD spine's vocabulary. */
export function toLeafSectionCode(sectionKey: string): string {
  return 'm' + sectionKey;
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
    return { placed: false, error: gate.error ?? 'Final export gate refused placement.', data: gate.data };
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
    `SELECT section_key AS "sectionKey", narrative_text AS "narrativeText"
     FROM cmc_module3_sections
     WHERE organization_id = $1 AND project_id = $2
       AND approval_state = 'approved' AND stale = false
     ORDER BY section_key`,
    [orgId, cmcProjectId],
  );

  const labels = getSectionLabels();
  const placements: PlacedSection[] = [];
  const skipped: Array<{ sectionKey: string; reason: string }> = [];

  for (const s of sections as Array<{ sectionKey: string; narrativeText: string | null }>) {
    const narrative = (s.narrativeText ?? '').trim();
    if (!narrative) {
      // An approved section with no compiled narrative has nothing to render
      // into the package. Say so instead of filing an empty leaf whose pin
      // would be NULL and whose PDF would be a title page.
      skipped.push({ sectionKey: s.sectionKey, reason: 'No compiled narrative to place.' });
      continue;
    }

    const label = labels[s.sectionKey] || s.sectionKey;
    const leafSectionCode = toLeafSectionCode(s.sectionKey);
    const title = `Module 3 — ${label} (§${s.sectionKey})`;

    // Point-in-time snapshot into the canonical renderable leaf source. What
    // is filed is what was approved — the snapshot is immutable by convention
    // (nothing edits placement snapshots), and upsertLeaf pins its sha256.
    const [snapshot] = await db
      .insert(coauthorDocuments)
      .values({
        organizationId: orgId,
        title,
        content: `## ${label}\n\n${narrative}`,
        status: 'approved',
        moduleNumber: leafSectionCode,
        createdBy: String(userId),
        metadata: {
          placedFrom: 'cmc-module3-os',
          cmcProjectId,
          sectionKey: s.sectionKey,
        },
      })
      .returning({ id: coauthorDocuments.id });

    const prior = priorBySection.get(leafSectionCode);
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

    await pool.query(
      `INSERT INTO cmc_provenance_events
         (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
       VALUES ($1, $2, 'section', $3, 'placed_into_submission', $4::jsonb, $5)`,
      [
        orgId,
        cmcProjectId,
        s.sectionKey,
        JSON.stringify({
          sectionKey: s.sectionKey,
          leafSectionCode,
          submissionId,
          sequenceId,
          leafId: (leaf as { id: number }).id,
          coauthorDocumentId: snapshot.id,
        }),
        String(userId),
      ],
    );

    placements.push({
      sectionKey: s.sectionKey,
      leafSectionCode,
      title,
      coauthorDocumentId: snapshot.id,
      leafId: (leaf as { id: number }).id,
    });
  }

  return { placed: true, submissionId, sequenceId, placements, skipped };
}
