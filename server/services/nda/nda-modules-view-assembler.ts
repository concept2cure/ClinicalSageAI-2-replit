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
 * The panel renders one row per CTD module (M1–M5) and derives the overall figure from
 * the rows' counts. So this assembler measures the real per-section authoring state
 * against the application's REQUIRED sections, at the module grain:
 *   required = the module's sections in the canonical required-section profile
 *              (ectd/required-sections.requiredSectionProfileFor — the list the eCTD leaf
 *              validator, the validate-completeness engine and the dispatch gate read),
 *   complete = required sections authored to a complete status (approved / signed /
 *              locked); a required heading ('3.2.S') is satisfied by the sections authored
 *              at or beneath it (sectionMatches) and is only as complete as the least
 *              advanced of them,
 *   open     = required − complete, not-started sections included,
 *   pct      = complete / required, rounded; null when no canonical profile applies,
 *   docs     = distinct sections authored in the module — an inventory, not the denominator,
 *   gate     = the least-advanced open required section (not started first), null when none.
 * All five modules are returned for an org with an NDA/BLA submission; one nobody has
 * started reads 0 of N. An org with no NDA/BLA submission returns [] and the surface
 * renders its honest empty state.
 *
 * 2026-10-15: pct was complete / authored, and modules with no authored section were
 * omitted, so one approved Module 1 section read "M1 100%, module complete" and the
 * cockpit's overall (the mean of the returned rows) read 100% ready.
 *
 * Section status is sourced from coauthor_documents.status, whose coarse 5-value authoring
 * vocabulary (draft / in-progress / review / approved / finalized) is mapped with the same
 * STATUS_MAP the IND assembler uses. Sections are scoped to the NDA/BLA submission through
 * its placed leaves; when a submission has no leaves yet we fall back to the org's authoring
 * workspace MINUS any document already placed under a NON-NDA/BLA (e.g. IND) submission's
 * leaf — so an IND's sections never leak into the NDA view.
 */
import { pool } from '../../db';
import { requiredSectionProfileFor } from '../ectd/required-sections';
import { sectionMatches } from '../ectd/section-code-match';
import { ichHeadingTitle } from '../ind/ctd/ich-m4-headings';
import { canonicalRegionOf } from '../../../shared/regulatory/region-identity';
import { MODELED_JURISDICTIONS, module1Heading, type ModeledJurisdiction } from '../../../shared/regulatory/regional-module1';

/** One CTD module row of the cockpit's "CTD readiness" panel. A type, not an interface,
 *  so a row stays assignable to Record<string, unknown>. */
export type NdaModuleRow = {
  m: string;
  label: string;
  /** complete / required, rounded. Null when not assessed. */
  pct: number | null;
  /** The module's sections in the canonical required-section profile — the denominator. */
  required: number | null;
  /** Required sections authored to a complete status. */
  complete: number | null;
  /** Required sections not complete, not-started ones included. */
  open: number | null;
  /** Distinct sections authored in the module: an inventory, never the denominator. */
  docs: number;
  /** The least-advanced open required section, or null. */
  gate: string | null;
  /** The profile's citation, when assessed. */
  basis: string | null;
  /** Why there is no percentage, when there is none. */
  notAssessed: string | null;
};

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

/* 2026-09-23 (W5/D7, co-author final pass): coauthor 'finalized' maps to
   'locked', not 'signed'. 'finalized' is what a FROZEN authoring document
   files as (services/coauthor/coauthor-snapshot.ts snapshotStatusFor), and
   freezing needs no signature — any org member may freeze. Reporting it as
   'signed' said a Form 1571 had been signed when nobody signed it. 'locked' is
   the surface's own complete-but-unsigned state: the content is sealed and
   locked, and nothing more is claimed. 'signed' is kept only for a stored
   'signed'. Whether an unsigned freeze should count as complete at all was
   left as a founder decision; it was decided 2026-10-01 (DP-35): it does
   not. 'finalized' now maps to 'frozen', ranked with a bare lock and never
   COMPLETE: sealed, not approved. The eCTD resolver refuses to transmit it
   for the same reason (ectd/leaf-source-resolver.ts). */
/** coauthor_documents.status (real, coarse) → the surface's readiness vocabulary. */
const STATUS_MAP: Record<string, string> = {
  draft: 'drafting',
  'in-progress': 'drafting',
  in_progress: 'drafting',
  review: 'qa_review',
  approved: 'approved',
  finalized: 'frozen',
  signed: 'signed',
  locked: 'locked',
};
/** A document exists, so the floor is "drafting" — never not_started (that means no doc). */
const mapStatus = (raw: unknown): string => STATUS_MAP[str(raw).toLowerCase()] ?? 'drafting';

/** Ordering to keep the most-advanced status when two docs land on one section, and to
 *  pick the least-advanced OPEN section as a module's gate. 2026-09-23 (W5/D7, co-author
 *  final pass): a bare lock (coauthor 'locked' / 'finalized', no signature) ranks below
 *  the sign-off states, as in the IND assembler. */
const RANK: Record<string, number> = {
  not_started: 0, drafting: 2, qa_review: 4, frozen: 5, locked: 5, approved: 6, signed: 7,
};
const COMPLETE = new Set(['approved', 'signed', 'locked']);

/** Human label for the open statuses that can gate a module. */
const GATE_STATUS_LABEL: Record<string, string> = {
  not_started: 'not started',
  drafting: 'in drafting',
  qa_review: 'in QA review',
  frozen: 'frozen, not approved',
};

interface CoauthorDoc { id: number; module_number: string | null; status: string; module_name: string | null }

/** Extract the CTD module number ('1'..'5') from a section code like 'm3.2.S.4', 'M1.2' or '2.5'. */
function moduleOf(code: string): string | null {
  const m = /^m?(\d)/i.exec(code);
  return m ? m[1] : null;
}

const isModeledJurisdiction = (j: string | undefined): j is ModeledJurisdiction =>
  j !== undefined && (MODELED_JURISDICTIONS as readonly string[]).includes(j);

/** A required heading's title from the canonical records — the region's Module 1 tree,
 *  ICH M4 for Modules 2–5 — or null when neither titles it. */
function headingTitle(code: string, region: string): string | null {
  if (moduleOf(code) !== '1') return ichHeadingTitle(code);
  const j = canonicalRegionOf(region);
  return isModeledJurisdiction(j) ? (module1Heading(j, code)?.title ?? null) : null;
}

type RequiredSet =
  | { codes: Map<string, string | null>; basis: string }
  | { reason: string };

/**
 * The required sections the pooled roll-up is measured against: the union of the canonical
 * profiles of the in-scope submissions, each resolved for its own type and region (an NDA
 * and a BLA pooled together are held to every section either requires). Not assessed when
 * any of them has no profile — an "NDA" recorded against the EU is not held to the FDA list.
 */
function requiredSet(subs: Array<{ application_type: unknown; primary_region: unknown }>): RequiredSet {
  const codes = new Map<string, string | null>();
  const bases: string[] = [];
  for (const s of subs) {
    const type = str(s.application_type);
    const region = str(s.primary_region);
    const profile = requiredSectionProfileFor(type, region || null);
    if (!profile) {
      return {
        reason: `No canonical required-section profile exists for application type '${type.toUpperCase()}' in region '${region || 'unrecorded'}'; completeness was not assessed.`,
      };
    }
    if (!bases.includes(profile.basis)) bases.push(profile.basis);
    for (const code of profile.sections) {
      if (!codes.has(code)) codes.set(code, headingTitle(code, profile.region));
    }
  }
  return { codes, basis: bases.join(' + ') };
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
export async function assembleOrgNdaModules(orgId: number): Promise<NdaModuleRow[]> {
  const subsRes = await pool.query(
    `SELECT id, application_type, primary_region FROM submissions
      WHERE organization_id = $1 AND lower(application_type) IN ('nda','bla') AND deleted_at IS NULL
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT $2`,
    [orgId, MAX_SUBS],
  );
  const subs = subsRes.rows as Array<{ id: number; application_type: unknown; primary_region: unknown }>;
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

  // The deduped authored sections per CTD module — the inventory — and each module
  // measured against its required sections, not against what was authored.
  const authoredByModule = new Map<string, Array<[string, SectionState]>>();
  for (const entry of sectionMap.entries()) {
    const mod = moduleOf(entry[0]);
    if (!mod || !MODULE_LABEL[mod]) continue;
    const list = authoredByModule.get(mod) ?? [];
    list.push(entry);
    authoredByModule.set(mod, list);
  }
  const req = requiredSet(subs);
  return MODULE_ORDER.map((m) => measureModule(m, authoredByModule.get(m) ?? [], req));
}

type SectionState = { status: string; name: string };

/** The least advanced section authored at or beneath a required heading (sectionMatches) —
 *  one approval under 3.2.S must not conceal a draft under it — or null when none was. */
function leastAdvancedBeneath(code: string, authored: Array<[string, SectionState]>): SectionState | null {
  let found: SectionState | null = null;
  for (const [sec, v] of authored) {
    if (!sectionMatches(sec, code)) continue;
    if (!found || (RANK[v.status] ?? 0) < (RANK[found.status] ?? 0)) found = { status: v.status, name: v.name || sec };
  }
  return found;
}

/** "<section> <status>[ · N more open]" for a module's least-advanced open required section. */
function gateText(gate: SectionState, open: number): string {
  const statusText = GATE_STATUS_LABEL[gate.status];
  return `${gate.name}${statusText ? ` ${statusText}` : ''}` + (open > 1 ? ` · ${open - 1} more open` : '');
}

/** One CTD module measured against its required sections; `authored` is its inventory. */
function measureModule(m: string, authored: Array<[string, SectionState]>, req: RequiredSet): NdaModuleRow {
  const unmeasured = (reason: string): NdaModuleRow => ({
    m, label: MODULE_LABEL[m], pct: null, required: null, complete: null, open: null,
    docs: authored.length, gate: null, basis: null, notAssessed: reason,
  });
  if ('reason' in req) return unmeasured(req.reason);
  const required = [...req.codes.keys()].filter((code) => moduleOf(code) === m);
  if (required.length === 0) {
    return unmeasured(`The required-section profile (${req.basis}) lists no Module ${m} section; this module's completeness was not assessed.`);
  }

  let complete = 0;
  let gate: (SectionState & { rank: number }) | null = null;
  for (const code of required) {
    // Nothing authored at or beneath it: not started, named from the canonical record.
    const s = leastAdvancedBeneath(code, authored)
      ?? { status: 'not_started', name: [code, req.codes.get(code)].filter(Boolean).join(' ') };
    if (COMPLETE.has(s.status)) {
      complete += 1;
      continue;
    }
    const rank = RANK[s.status] ?? 0;
    if (!gate || rank < gate.rank) gate = { ...s, rank };
  }

  const open = required.length - complete;
  return {
    m, label: MODULE_LABEL[m],
    pct: Math.round((complete / required.length) * 100),
    required: required.length, complete, open,
    docs: authored.length, gate: gate ? gateText(gate, open) : null, basis: req.basis, notAssessed: null,
  };
}
