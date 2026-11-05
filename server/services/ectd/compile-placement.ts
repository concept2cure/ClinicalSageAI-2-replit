/**
 * What a sequence has placed, and which required sections it satisfies: the
 * one read that compile, validate and status share, and the module roll-up
 * GET /api/ectd-compile/:projectIdent/status reports.
 *
 * Moved out of server/routes/ectd-compile.ts unchanged (FILING_SPINE F23 5/9),
 * so the placement measure has one home and the route stays under the 100 kB
 * file ceiling. The compile suites pin it through the route, unchanged.
 *
 * F23 6/9: /status measures placement, for the sequence's own market
 * (measureStatus). With a sequence, what is placed is counted against the
 * required set of the sequence's market (its region and its submission's
 * type), so an EU MAA sequence of an NDA program is measured against EMA's
 * set, and nothing placed is a measured 0. A program with no sequence, which
 * has no section store, has no figure and says so; a project with its own
 * section store and no sequence keeps the approved-section count. A module
 * with nothing required has no figure and is not "ready".
 *
 * @module server/services/ectd/compile-placement
 */
import { pool } from '../../db';
import { sectionMatches } from './section-code-match';
import { formRequirementForDocumentType } from './section-to-ctd';
import { resolveRequiredSections, type RequiredSectionSet } from './required-sections';
import { documentAgencyFor } from '../regulatory/market-support';
import type { SubmissionSpine } from '../cmc/submission-spine';

export interface SpineLeafRow {
  section_code: string | null;
  title: string | null;
  lifecycle_op: string | null;
  document_table: string | null;
  document_id: number | null;
  /** The uuid half of the reference, for uuid-keyed stores (vault.documents);
   *  set instead of document_id. */
  document_uuid?: string | null;
  /** form_<number> for a filed FDA form; how a form proves its requirement. */
  document_type?: string | null;
}

/** The sequence's placed (not deleted) leaves, org-scoped: the one read that
 *  compile, validate and status share.
 *
 *  2026-09-23 (W5/D7, round-2 review): document_uuid is read too. Without it a
 *  vault leaf (document_id NULL) that the assembler packages by its uuid was
 *  reported "could not be materialized" by the compile, shown as
 *  'unresolved-source', and not counted as placed by the status roll-up. */
export async function loadSpineLeaves(sequenceId: number, orgId: number): Promise<SpineLeafRow[]> {
  const leafRes = await pool.query(
    `SELECT section_code, title, lifecycle_op, document_table, document_id, document_uuid, document_type
       FROM submission_leaves
      WHERE sequence_id = $1 AND organization_id = $2 AND deleted_at IS NULL
      ORDER BY section_code`,
    [sequenceId, orgId],
  );
  return leafRes.rows as SpineLeafRow[];
}

/**
 * Does the leaf name a document? A table plus either key: integer-keyed stores
 * carry document_id, uuid-keyed ones (vault.documents) carry document_uuid —
 * the rule the assembler's resolveFile applies. Requiring document_id read
 * every vault leaf as having nothing behind it (2026-09-23, W5/D7, round-2
 * review).
 */
export function namesLeafDocument(l: SpineLeafRow): boolean {
  return !!l.document_table && (!!l.document_id || !!l.document_uuid);
}

/** A declared withdrawal: it acts on a filed leaf and places no content. */
export function isWithdrawal(l: SpineLeafRow): boolean {
  return String(l.lifecycle_op ?? '').trim().toLowerCase() === 'delete';
}

/**
 * Does this placed leaf satisfy a required section? By section (a leaf at or
 * beneath the requirement), or — for an FDA form, which is filed at 1.1 and
 * told apart by type — by the form requirement its document_type proves. A
 * withdrawal satisfies nothing: it takes a document off file.
 */
export function leafSatisfies(l: SpineLeafRow, requiredCode: string): boolean {
  if (isWithdrawal(l)) return false;
  if (sectionMatches(l.section_code, requiredCode)) return true;
  const formRequirement = formRequirementForDocumentType(l.document_type);
  return formRequirement != null && sectionMatches(formRequirement, requiredCode);
}

/** A tracked-section row as /status reads it (project_sections). */
export interface StatusSectionRow {
  section_code: string;
  status: string;
  module?: string | null;
}

/**
 * The module roll-up /status reports: each required module's required
 * sections, counted as complete when a placed leaf satisfies them (with a
 * sequence that carries leaves) or, without one, when the tracked section is
 * approved, locked or final; and the totals across modules.
 */
export function placementModuleReadiness(
  required: RequiredSectionSet,
  sections: StatusSectionRow[],
  placedLeaves: SpineLeafRow[] | null,
) {
  const moduleReadiness = required.modules.map((def) => {
    const code = def.code;
    const digit = code.replace('m', '');
    const moduleSections = sections.filter(
      s => sectionMatches(s.section_code, digit) || s.module?.toLowerCase() === code
    );
    const totalRequired = def.requiredSections.length;
    const completedRequired = placedLeaves
      ? def.requiredSections.filter((rs) => placedLeaves.some((l) => leafSatisfies(l, rs))).length
      : def.requiredSections.filter(rs =>
          moduleSections.some(
            ms =>
              sectionMatches(ms.section_code, rs) && ['approved', 'locked', 'final'].includes(ms.status)
          )
        ).length;

    return {
      moduleCode: code,
      moduleName: def.name,
      totalSections: placedLeaves
        ? placedLeaves.filter((l) => sectionMatches(l.section_code, digit)).length
        : moduleSections.length,
      requiredSections: totalRequired,
      completedRequired,
      // Nothing required has no figure and is not "ready" (F23 6/9; it read
      // 0% and ready).
      completionPct:
        totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : null,
      ready: totalRequired > 0 ? completedRequired === totalRequired : null,
    };
  });

  const totalRequired = moduleReadiness.reduce((a, m) => a + m.requiredSections, 0);
  const totalCompleted = moduleReadiness.reduce((a, m) => a + m.completedRequired, 0);
  const overallPct = totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : null;
  return { modules: moduleReadiness, totalRequired, totalCompleted, overallPct };
}

/** What /status counted: placement in a sequence, the section store's approved
 *  statuses, or nothing, with the reason. */
export type StatusBasis = 'placed' | 'approved' | 'no-sequence' | 'unavailable';

export const NO_SEQUENCE_NOTE =
  'No sequence exists for this project yet, so nothing is counted as placed. Approved sections are on the project’s Author tab.';

export interface StatusMeasure extends ReturnType<typeof placementModuleReadiness> {
  basis: StatusBasis;
  /** Why there is no figure ('no-sequence', 'unavailable'); null otherwise. */
  note: string | null;
  /** The required set measured against; null when none applies. */
  required: RequiredSectionSet | null;
}

const NOTHING = { modules: [], totalRequired: 0, totalCompleted: 0, overallPct: null };

/**
 * What /status measures, and against which required set. With a sequence:
 * what it has placed, against the required set of the sequence's market (its
 * region and its submission's application type). Without one: a project with
 * its own section store counts its approved sections against the program's
 * set; a program, which has none, has no figure.
 */
export async function measureStatus(input: {
  program: { programType: string | null; primaryAgency: string | null; hasSectionStore: boolean };
  spine: SubmissionSpine | null;
  orgId: number;
  sections: StatusSectionRow[];
}): Promise<StatusMeasure> {
  const seq = input.spine?.sequence ?? null;
  if (input.spine && seq) {
    const applicationType = input.spine.applicationType;
    const agency = documentAgencyFor({ market: seq.region, applicationType });
    if (!agency) {
      return {
        basis: 'unavailable',
        note: `Sequence ${seq.sequenceNumber} is for the ${seq.region.toUpperCase()} market, which has no required-section set for a ${applicationType.toUpperCase()} here, so placement is not measured.`,
        required: null,
        ...NOTHING,
      };
    }
    const required = await resolveRequiredSections(pool, { programType: applicationType, primaryAgency: agency });
    const placed = seq.leafCount > 0 ? (await loadSpineLeaves(seq.id, input.orgId)).filter(namesLeafDocument) : [];
    return { basis: 'placed', note: null, required, ...placementModuleReadiness(required, input.sections, placed) };
  }
  const required = await resolveRequiredSections(pool, {
    programType: input.program.programType,
    primaryAgency: input.program.primaryAgency,
  });
  if (!input.program.hasSectionStore) return { basis: 'no-sequence', note: NO_SEQUENCE_NOTE, required, ...NOTHING };
  return { basis: 'approved', note: null, required, ...placementModuleReadiness(required, input.sections, null) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// What stands between a project and a transmissible package (moved out of
// server/routes/ectd-compile.ts unchanged, 2026-11-05, as the placement measure
// was, so the route stays under the 100 kB file ceiling).
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Why a program-spine project compiles against an empty section set. Stated once
 * and returned verbatim as a blocker / validation finding so the caller is told,
 * in so many words, why readiness is 0% — never left to infer it from silence.
 *
 * Client-reaching copy, read by a regulatory person: what is missing and where
 * to act, never the store, the id space or a pending contract behind it (B3,
 * demo walk 2026-11-05: it read "no linked section-tracking store … legacy
 * numeric project id … pending the document-identity contract", ahead of every
 * real reason). Table names must never reach a response body (BP-W0-5).
 */
export const PROGRAM_SECTION_STORE_BLOCKER =
  'No document has been placed in a sequence of this project yet, so the compile has nothing to check and every ' +
  'required section reads as missing. Place approved documents into the sequence in Submission Center (Builder), ' +
  'or with Place into filing from the document.';

/**
 * Why a compile has no leaf files, stated from the ACTUAL state of the
 * submission spine — not from a hardcoded capability flag. Leaf rendering IS
 * implemented (ectd/assemble-from-core renders real PDF leaves from placed
 * submission_leaves); what varies is whether THIS project is connected to it.
 * Every message keeps the words "leaf files" so the surface's blocker panel and
 * the pinned tests read consistently.
 */
const NO_SPINE_LEAF_BLOCKER =
  'No leaf files have been rendered for this compile: this project has no submission with an eCTD ' +
  'sequence yet, so no document is placed and nothing can be sent to an agency gateway. Create the ' +
  'project\'s submission and its sequence in Submission Center, then place approved documents into its ' +
  'eCTD sequence.';

const NO_SEQUENCE_LEAF_BLOCKER =
  'No leaf files have been rendered: the linked submission has no eCTD sequence yet, so there are ' +
  'no placed documents to render and the package cannot be transmitted. Create a sequence and ' +
  'place approved documents into it.';

const NO_PLACED_LEAVES_BLOCKER =
  'No leaf files have been rendered: the submission\'s eCTD sequence has no placed documents, so ' +
  'the package cannot be transmitted. Place approved documents into the sequence to render real ' +
  'PDF leaf files.';

/**
 * What stands between this project and a transmissible submission (draft-path
 * and status-endpoint variant — the spine-backed compile computes its blockers
 * from the actual assembly result instead).
 *
 * `submissionReady` previously meant "content validation raised no blocking
 * errors", and the surface rendered that as the words "Submission-ready" next to
 * a download button. Content completeness is a real and useful signal, but it is
 * not submission readiness: a package with no leaf files cannot be submitted no
 * matter how complete its section text. Telling a regulatory user otherwise is
 * the most consequential thing this route could get wrong.
 *
 * Blockers are returned as text so the surface can say WHY rather than showing a
 * bare negative.
 */
export function submissionBlockers(
  contentErrors: string[],
  anchor?: { numericProjectId: number | null },
  spine?: SubmissionSpine | null,
): string[] {
  const blockers: string[] = [];
  const leavesPlaced = (spine?.sequence?.leafCount ?? 0) > 0;
  if (anchor && anchor.numericProjectId === null && !leavesPlaced) {
    blockers.push(PROGRAM_SECTION_STORE_BLOCKER);
  }
  if (contentErrors.length > 0) {
    blockers.push(
      `${contentErrors.length} blocking content ${contentErrors.length === 1 ? 'issue' : 'issues'} must be resolved.`,
    );
  }
  // The leaf-rendering answer, from the spine's real state.
  if (!spine) {
    blockers.push(NO_SPINE_LEAF_BLOCKER);
  } else if (!spine.sequence) {
    blockers.push(NO_SEQUENCE_LEAF_BLOCKER);
  } else if (spine.sequence.leafCount === 0) {
    blockers.push(NO_PLACED_LEAVES_BLOCKER);
  } else {
    // Documents are placed; rendering + verification happen at compile time.
    blockers.push(
      `${spine.sequence.leafCount} document(s) are placed in the submission's eCTD sequence. ` +
        'Run Compile to render the leaf files and verify the package before it can be considered submission-ready.',
    );
  }
  return blockers;
}
