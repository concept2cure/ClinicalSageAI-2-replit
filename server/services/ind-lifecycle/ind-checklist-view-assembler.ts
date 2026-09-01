/**
 * Assemble the v2 IndLifecycle surface's render contract from the REAL, org-scoped
 * eCTD submission core — the canonical store an actual tenant populates by authoring
 * an IND, NOT a seed-only blob and NOT the legacy pre-IND wizard (ind_* is UUID/
 * project-keyed with no tenant scope and no section/forms model).
 *
 * Data flow (server/services/ind-lifecycle/ind-readiness-service.ts documents it):
 *   submissions (application_type = 'ind')            → the IND application identity
 *   ectd_sequences → submission_leaves (section_code) → doc placement within a filing
 *   coauthor_documents (module_number, status)        → the per-section authoring state
 *   services/regulatory/ind-ectd-sections.ts          → canonical title / module / CFR ref
 *
 * The surface renders one IND (rows[0]) with its Module-1 forms (1571 / 1572 / 3674)
 * and the eCTD sections the team is actually authoring, each with its real status; it
 * recomputes filing readiness itself (indlReadiness) from what we return. So this
 * assembler maps identity + forms + sections only — no blob, no fabricated field. An
 * org with no IND submission returns [] and the surface shows its honest empty state.
 *
 * Section status is sourced from coauthor_documents.status, whose 5-value authoring
 * vocabulary (draft / in-progress / review / approved / finalized) is mapped into the
 * surface's SectionStatus vocabulary; the mapping is deliberately lossy where the real
 * store is coarser (there is no finer per-section status persisted). Sections shown are
 * ONLY the ones actually placed into that submission's filing (its eCTD sequence leaves
 * referencing a coauthor doc). A submission with no placed leaves yet renders an honest
 * "no sections placed" empty state — it does NOT fall back to the org's entire authoring
 * workspace, which would contaminate one submission's readiness with documents authored
 * for other programs. This matches the surface's "sections we're tracking" for THIS
 * filing, not the full 108-section blueprint and not an org-wide document dump.
 */
import { pool } from '../../db';
import { getSectionByCode } from '../../../services/regulatory/ind-ectd-sections.js';
import { compareSectionCode } from '../../../shared/regulatory/section-code';

const MAX_DOCS = 10;

const str = (v: unknown): string => (v == null ? '' : String(v));

/** Module-1 forms the surface renders separately from sections, keyed by their eCTD
 *  section code. A form is "done" when its section is authored to a complete status. */
const FORM_SECTIONS: Array<{ code: string; id: string; title: string; label: string; ref: string }> = [
  { code: 'm1.1.1', id: 'FDA_1571', title: 'Form FDA 1571', label: 'IND Application', ref: '21 CFR 312.23(a)(1)' },
  { code: 'm1.1.2', id: 'FDA_1572', title: 'Form FDA 1572', label: 'Statement of Investigator', ref: '21 CFR 312.53(c)' },
  { code: 'm1.1.3', id: 'FDA_3674', title: 'Form FDA 3674', label: 'Certification of Compliance (ClinicalTrials.gov)', ref: '42 USC 282(j)(5)(B)' },
];
const FORM_CODES = new Set(FORM_SECTIONS.map((f) => f.code));

/** coauthor_documents.status (real, coarse) → the surface's SectionStatus vocabulary. */
const STATUS_MAP: Record<string, string> = {
  draft: 'drafting',
  'in-progress': 'drafting',
  in_progress: 'drafting',
  review: 'qa_review',
  approved: 'approved',
  finalized: 'signed',
  signed: 'signed',
  locked: 'locked',
};
/** A document exists, so the floor is "drafting" — never not_started (that means no doc). */
const mapStatus = (raw: unknown): string => STATUS_MAP[str(raw).toLowerCase()] ?? 'drafting';

/** Ordering used to keep the most-advanced status when two docs land on one section. */
const RANK: Record<string, number> = {
  not_started: 0, data_gathering: 1, drafting: 2, revision: 3, internal_review: 3,
  qa_review: 4, approved: 5, signed: 6, locked: 7,
};
const COMPLETE = new Set(['approved', 'signed', 'locked']);

/** Blueprint enrichment for a section code; honest fallback when the code is custom. */
function enrichSection(code: string, status: string, name: string) {
  const def = getSectionByCode(code);
  const moduleFromCode = () => {
    const m = /^m?(\d)/.exec(code);
    return m ? (`M${m[1]}` as const) : 'M1';
  };
  return {
    code,
    title: def?.title ?? (name || code),
    module: def?.module ?? moduleFromCode(),
    ref: def?.regulatoryRef ?? '',
    ai: def?.aiDraftable ?? false,
    status,
  };
}

interface CoauthorDoc { id: number; module_number: string | null; status: string; module_name: string | null }

interface ProgramTargetRow {
  name: string | null;
  code: string | null;
  product_name: string | null;
  target_submission_date: Date | string | null;
}

/**
 * The org's IND regulatory programs (regulatory_programs) — the one store that
 * actually records a target submission date. Read org-scoped, newest first, and
 * fail closed to [] when the table isn't provisioned (42P01): a missing store
 * must yield "no target date", never a failed checklist and never an invented
 * offset.
 */
async function readIndProgramTargets(orgId: number): Promise<ProgramTargetRow[]> {
  try {
    const res = await pool.query(
      `SELECT name, code, product_name, target_submission_date
         FROM regulatory_programs
        WHERE organization_id = $1 AND upper(program_type) = 'IND' AND deleted_at IS NULL
        ORDER BY updated_at DESC NULLS LAST`,
      [orgId],
    );
    return res.rows as ProgramTargetRow[];
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') return [];
    throw err;
  }
}

const norm = (v: unknown): string => str(v).trim().toLowerCase();

/**
 * Resolve the submission's regulatory program by identity match (program
 * product_name / name / code vs the submission's product_name / title,
 * case-insensitive) and return its recorded target_submission_date as an ISO
 * string. Null when no program matches or no matching program records a date —
 * the surface renders an honest "no target date set" instead of a projection
 * from an invented offset.
 */
function resolveTargetReceiptDate(
  programs: ProgramTargetRow[],
  sub: Record<string, unknown>,
): string | null {
  const keys = new Set([norm(sub.product_name), norm(sub.title)].filter((k) => k !== ''));
  if (keys.size === 0) return null;
  const match = programs.find(
    (p) =>
      p.target_submission_date != null &&
      (keys.has(norm(p.product_name)) || keys.has(norm(p.name)) || keys.has(norm(p.code))),
  );
  if (!match || match.target_submission_date == null) return null;
  const d = new Date(match.target_submission_date as string | Date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Merge a (code → {status,name}) entry, keeping the more-advanced status. */
function put(map: Map<string, { status: string; name: string }>, code: string, status: string, name: string): void {
  if (!code) return;
  const prev = map.get(code);
  if (!prev || (RANK[status] ?? 0) > (RANK[prev.status] ?? 0)) map.set(code, { status, name });
}

/**
 * Assemble every IND checklist for the org, newest submission first. Returns [] when
 * the org has no IND submission — the surface renders its honest empty state.
 */
export async function assembleOrgIndChecklists(orgId: number): Promise<Record<string, unknown>[]> {
  const subsRes = await pool.query(
    `SELECT s.id, s.title, s.product_name, s.application_type, s.updated_at, o.name AS org_name
       FROM submissions s
       JOIN organizations o ON o.id = s.organization_id
      WHERE s.organization_id = $1 AND lower(s.application_type) = 'ind' AND s.deleted_at IS NULL
      ORDER BY s.updated_at DESC NULLS LAST, s.id DESC
      LIMIT $2`,
    [orgId, MAX_DOCS],
  );
  const subs = subsRes.rows as Array<Record<string, unknown>>;
  if (subs.length === 0) return [];
  const subIds = subs.map((s) => Number(s.id));

  // Real linkage submission → sequence → leaf → coauthor doc. The coauthor_documents read
  // resolves the docs a leaf references (docById); it is NOT used as an org-wide section
  // fallback. All bulk (one query each), org-scoped, soft-delete aware. The
  // regulatory_programs read backs the target-date resolution only and fails
  // closed to [] when unprovisioned.
  const [seqRes, coauthorRes, programTargets] = await Promise.all([
    pool.query(
      `SELECT id, submission_id FROM ectd_sequences
        WHERE submission_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL`,
      [subIds, orgId],
    ),
    pool.query(
      `SELECT id, module_number, status, module_name FROM coauthor_documents
        WHERE organization_id = $1 AND module_number IS NOT NULL`,
      [orgId],
    ),
    readIndProgramTargets(orgId),
  ]);
  const seqRows = seqRes.rows as Array<{ id: number; submission_id: number }>;
  const coauthorDocs = coauthorRes.rows as CoauthorDoc[];
  const docById = new Map<number, CoauthorDoc>(coauthorDocs.map((d) => [Number(d.id), d]));

  const seqIds = seqRows.map((r) => Number(r.id));
  const leavesRes = seqIds.length
    ? await pool.query(
        `SELECT sequence_id, section_code, document_table, document_id FROM submission_leaves
          WHERE sequence_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL`,
        [seqIds, orgId],
      )
    : { rows: [] as Array<Record<string, unknown>> };
  const leaves = leavesRes.rows as Array<{ sequence_id: number; section_code: string; document_table: string | null; document_id: number | null }>;

  const seqToSub = new Map<number, number>(seqRows.map((r) => [Number(r.id), Number(r.submission_id)]));

  // Placed sections per submission: leaf.section_code (authoritative) → the referenced
  // coauthor doc's mapped status.
  const placedBySub = new Map<number, Map<string, { status: string; name: string }>>();
  for (const l of leaves) {
    if (l.document_table !== 'coauthor_documents' || l.document_id == null) continue;
    const doc = docById.get(Number(l.document_id));
    if (!doc) continue;
    const subId = seqToSub.get(Number(l.sequence_id));
    if (subId == null) continue;
    const m = placedBySub.get(subId) ?? new Map();
    put(m, str(l.section_code), mapStatus(doc.status), str(doc.module_name));
    placedBySub.set(subId, m);
  }

  return subs.map((s) => {
    const subId = Number(s.id);
    // Only sections actually placed into THIS submission's filing. No org-wide fallback:
    // a submission with nothing placed yet gets an empty section list (the surface renders
    // its honest "no sections placed" state) rather than borrowing other programs' docs.
    const statusByCode = placedBySub.get(subId) ?? new Map<string, { status: string; name: string }>();

    const sections = [...statusByCode.entries()]
      .filter(([code]) => !FORM_CODES.has(code))
      .map(([code, v]) => enrichSection(code, v.status, v.name))
      .sort((a, b) => compareSectionCode(a.code, b.code));

    const forms = FORM_SECTIONS.map((f) => ({
      id: f.id, title: f.title, label: f.label, ref: f.ref,
      done: COMPLETE.has(statusByCode.get(f.code)?.status ?? ''),
    }));

    const productName = s.product_name != null && str(s.product_name).trim() !== '' ? str(s.product_name) : null;
    const title = str(s.title).trim() !== '' ? str(s.title) : null;
    return {
      // The REAL submissions.id this checklist was assembled from — the anchor the
      // lifecycle filing routes (/safety-report/file, /annual-report/file,
      // /amendment/file) need to create an ectd_sequences row. Real data, not an
      // invented handle: every checklist row IS a submissions row.
      submissionId: subId,
      // `code` is the surface's stable key and the drugName fallback; prefer the real
      // product/title, else a stable per-submission code.
      code: productName ?? title ?? `IND-${subId}`,
      drugName: productName ?? title,
      productName: title,
      indication: null, // not a column on submissions — honest null, never fabricated
      sponsorName: str(s.org_name) || null, // the tenant org is the sponsor of record
      submissionType: 'IND',
      // The org's RECORDED target (regulatory_programs.target_submission_date,
      // resolved by identity match) or an honest null — never an invented offset.
      targetReceiptDate: resolveTargetReceiptDate(programTargets, s),
      forms,
      sections,
    };
  });
}
