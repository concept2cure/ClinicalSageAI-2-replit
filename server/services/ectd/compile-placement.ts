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
