/**
 * Assemble the v2 NdaCockpit "CTD readiness" panel's render contract from the REAL,
 * org-scoped eCTD submission core — the SAME canonical store the IND checklist converged
 * onto (submissions + ectd_sequences + submission_leaves + coauthor_documents), NOT the
 * seed-only c2c_nda_modules blob.
 *
 * Data flow (mirrors server/services/ind-lifecycle/ind-checklist-view-assembler.ts):
 *   submissions (application_type IN ('nda','bla'))     → the NDA/BLA application identity
 *   ectd_sequences → submission_leaves (section_code)   → doc placement within the filing
 *   coauthor_documents (module_number, status)          → the per-section authoring state
 *
 * The panel renders one row per CTD module (M1–M5) shaped { m, label, pct, docs, open, gate }
 * and derives the overall "% ready" from these rows. So this assembler rolls the real
 * per-section authoring state up to the module grain:
 *   docs = distinct sections authored in the module (a coauthor_documents row),
 *   open = those not at a complete status (approved / signed / locked),
 *   pct  = complete / total, rounded — a genuine derived readiness, never a stored blob number,
 *   gate = the least-advanced open section's name + status (honest — never a fabricated
 *          blurb), null when every section in the module is complete.
 * Only modules that actually have an authored section are returned — the surface's
 * "modules we're tracking", not a fabricated 5-module scaffold. An org with no NDA/BLA
 * submission returns [] and the surface renders its honest empty state.
 *
 * Section status is sourced from coauthor_documents.status, whose coarse 5-value authoring
 * vocabulary (draft / in-progress / review / approved / finalized) is mapped with the same
 * STATUS_MAP the IND assembler uses. Sections are scoped to the NDA/BLA submission through
 * its placed leaves; when a submission has no leaves yet we fall back to the org's authoring
 * workspace MINUS any document already placed under a NON-NDA/BLA (e.g. IND) submission's
 * leaf — so an IND's sections never leak into the NDA view.
 */
import { pool } from '../../db';

/** Canonical CTD module labels (M1–M5). Fixed structure, not per-org data — the honest
 *  blueprint enrichment equivalent to the IND assembler's section-title lookup. */
const MODULE_LABEL: Record<string, string> = {
  '1': 'Administrative & prescribing (Module 1)',
  '2': 'CTD summaries (Module 2)',
  '3': 'Quality / CMC (Module 3)',
  '4': 'Nonclinical study reports (Module 4)',
  '5': 'Clinical study reports (Module 5)',
};
const MODULE_ORDER = ['1', '2', '3', '4', '5'];

const MAX_SUBS = 10;

const str = (v: unknown): string => (v == null ? '' : String(v));

/** coauthor_documents.status (real, coarse) → the surface's readiness vocabulary. */
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

/** Ordering to keep the most-advanced status when two docs land on one section, and to
 *  pick the least-advanced OPEN section as a module's gate. */
const RANK: Record<string, number> = {
  not_started: 0, drafting: 2, qa_review: 4, approved: 5, signed: 6, locked: 7,
};
const COMPLETE = new Set(['approved', 'signed', 'locked']);

/** Human label for the open statuses that can gate a module. */
const GATE_STATUS_LABEL: Record<string, string> = {
  not_started: 'not started',
  drafting: 'in drafting',
  qa_review: 'in QA review',
};

interface CoauthorDoc { id: number; module_number: string | null; status: string; module_name: string | null }

/** Extract the CTD module number ('1'..'5') from a section code like 'm3.2.S.4' or '2.5'. */
function moduleOf(code: string): string | null {
  const m = /^m?(\d)/.exec(code);
  return m ? m[1] : null;
}

/** Merge a (code → {status,name}) entry, keeping the more-advanced status. */
function put(map: Map<string, { status: string; name: string }>, code: string, status: string, name: string): void {
  if (!code) return;
  const prev = map.get(code);
  if (!prev || (RANK[status] ?? 0) > (RANK[prev.status] ?? 0)) map.set(code, { status, name });
}

/**
 * Assemble the org's CTD module-readiness roll-up. Returns [] when the org has no NDA/BLA
 * submission — the surface renders its honest empty state.
 */
export async function assembleOrgNdaModules(orgId: number): Promise<Record<string, unknown>[]> {
  const subsRes = await pool.query(
    `SELECT id FROM submissions
      WHERE organization_id = $1 AND lower(application_type) IN ('nda','bla') AND deleted_at IS NULL
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT $2`,
    [orgId, MAX_SUBS],
  );
  const subs = subsRes.rows as Array<{ id: number }>;
  if (subs.length === 0) return [];
  const subIds = subs.map((s) => Number(s.id));

  // Sequences for those NDA/BLA submissions + the org's coauthor authoring workspace.
  // All bulk (one query each), org-scoped, soft-delete aware.
  const [seqRes, coauthorRes] = await Promise.all([
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
  ]);
  const seqRows = seqRes.rows as Array<{ id: number; submission_id: number }>;
  const coauthorDocs = coauthorRes.rows as CoauthorDoc[];
  const docById = new Map<number, CoauthorDoc>(coauthorDocs.map((d) => [Number(d.id), d]));

  const seqIds = seqRows.map((r) => Number(r.id));
  const leavesRes = seqIds.length
    ? await pool.query(
        `SELECT section_code, document_table, document_id FROM submission_leaves
          WHERE sequence_id = ANY($1) AND organization_id = $2 AND deleted_at IS NULL`,
        [seqIds, orgId],
      )
    : { rows: [] as Array<Record<string, unknown>> };
  const leaves = leavesRes.rows as Array<{ section_code: string; document_table: string | null; document_id: number | null }>;

  // Placed sections across the org's NDA/BLA submissions: leaf.section_code (authoritative)
  // → the referenced coauthor doc's mapped status. Scoped through NDA/BLA sequences only,
  // so an IND's placed sections are structurally excluded.
  const placed = new Map<string, { status: string; name: string }>();
  for (const l of leaves) {
    if (l.document_table !== 'coauthor_documents' || l.document_id == null) continue;
    const doc = docById.get(Number(l.document_id));
    if (!doc) continue;
    put(placed, str(l.section_code), mapStatus(doc.status), str(doc.module_name));
  }

  let sectionMap: Map<string, { status: string; name: string }>;
  if (placed.size > 0) {
    sectionMap = placed;
  } else {
    // Workspace fallback — the org's authored sections that have NOT been placed into a
    // filing yet, EXCLUDING any doc already placed under a non-NDA/BLA submission so an
    // IND's authoring workspace can never leak into the NDA view.
    const foreignRes = await pool.query(
      `SELECT sl.document_id
         FROM submission_leaves sl
         JOIN ectd_sequences es ON es.id = sl.sequence_id
         JOIN submissions s ON s.id = es.submission_id
        WHERE sl.organization_id = $1 AND sl.document_table = 'coauthor_documents'
          AND sl.document_id IS NOT NULL AND sl.deleted_at IS NULL
          AND es.deleted_at IS NULL AND s.deleted_at IS NULL
          AND lower(s.application_type) NOT IN ('nda','bla')`,
      [orgId],
    );
    const foreign = new Set((foreignRes.rows as Array<{ document_id: number }>).map((r) => Number(r.document_id)));
    sectionMap = new Map();
    for (const d of coauthorDocs) {
      if (foreign.has(Number(d.id))) continue;
      put(sectionMap, str(d.module_number), mapStatus(d.status), str(d.module_name));
    }
  }

  // Roll the deduped sections up to CTD modules.
  interface Roll { total: number; open: number; gateName: string; gateStatus: string; gateRank: number }
  const byModule = new Map<string, Roll>();
  for (const [code, v] of sectionMap.entries()) {
    const mod = moduleOf(code);
    if (!mod || !MODULE_LABEL[mod]) continue;
    const r = byModule.get(mod) ?? { total: 0, open: 0, gateName: '', gateStatus: '', gateRank: Number.POSITIVE_INFINITY };
    r.total += 1;
    if (!COMPLETE.has(v.status)) {
      r.open += 1;
      const rank = RANK[v.status] ?? 0;
      if (rank < r.gateRank) {
        r.gateRank = rank;
        r.gateName = v.name || code;
        r.gateStatus = v.status;
      }
    }
    byModule.set(mod, r);
  }

  return MODULE_ORDER.filter((m) => byModule.has(m)).map((m) => {
    const r = byModule.get(m)!;
    const complete = r.total - r.open;
    const pct = r.total > 0 ? Math.round((complete / r.total) * 100) : 0;
    let gate: string | null = null;
    if (r.open > 0) {
      const statusText = GATE_STATUS_LABEL[r.gateStatus];
      gate =
        `${r.gateName || 'Section'}${statusText ? ` ${statusText}` : ''}` +
        (r.open > 1 ? ` · ${r.open - 1} more open` : '');
    }
    return { m, label: MODULE_LABEL[m], pct, docs: r.total, open: r.open, gate };
  });
}
