/**
 * What a sequence has placed, and which required sections it satisfies: the
 * one read that compile, validate and status share, and the module roll-up
 * GET /api/ectd-compile/:projectIdent/status reports.
 *
 * Moved out of server/routes/ectd-compile.ts unchanged (FILING_SPINE F23 5/9),
 * so the placement measure has one home and the route stays under the 100 kB
 * file ceiling. The compile suites pin it through the route, unchanged.
 *
 * @module server/services/ectd/compile-placement
 */
import { pool } from '../../db';
import { sectionMatches } from './section-code-match';
import { formRequirementForDocumentType } from './section-to-ctd';
import type { RequiredSectionSet } from './required-sections';

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
      completionPct:
        totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0,
      ready: completedRequired === totalRequired,
    };
  });

  const totalRequired = moduleReadiness.reduce((a, m) => a + m.requiredSections, 0);
  const totalCompleted = moduleReadiness.reduce((a, m) => a + m.completedRequired, 0);
  const overallPct = totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;
  return { modules: moduleReadiness, totalRequired, totalCompleted, overallPct };
}
