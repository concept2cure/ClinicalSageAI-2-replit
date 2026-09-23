/**
 * Separation of duties (four-eyes) for review, approval and lock signatures.
 *
 * ── What this is, and what it is not (relabelled 2026-09-22) ─────────────────
 * This file used to call itself "the un-disableable Part 11 invariant". That
 * was wrong. 21 CFR Part 11 does not require the signer to be someone other
 * than the author: 11.50(a)(3) lists "authorship" among the meanings a
 * signature may carry, alongside review, approval and responsibility. The
 * author-is-not-the-approver rule comes from predicate rules and governance —
 * record-specific second-person and quality-unit requirements such as
 * 21 CFR 211.186(a), 211.22, 211.100(a), 211.192 and 58.35(a) — and this
 * platform adopts it as policy for every review/approval/lock. Part 11's role
 * is ENFORCEMENT: this is an authority check (11.10(g)), and it relies on the
 * audit trail (11.10(e)) to know who authored what.
 * Research record: docs/evidence/REGULATORY-SME/2026-09-22/.
 *
 * It stays un-disableable. Admin may only tighten, never loosen.
 *
 * ── The rules ────────────────────────────────────────────────────────────────
 *  1. Scope by meaning. A `lock`, or a `sign` whose declared 11.50(a)(3)
 *     meaning is anything other than authorship — review, approval,
 *     responsibility, release, or no meaning at all — must be independent of
 *     the record's authors. A `sign` whose meaning IS authorship is the author
 *     signing as author, which Part 11 expects; it is not refused.
 *  2. Authorship is a SET drawn from what the record's history shows, not one
 *     mutable column. For a document: everyone in the section version ledger
 *     (`c2c_document_section_versions.author_id`, template scaffolds
 *     excluded), everyone who accepted a drafted section (`accepted_by`), and
 *     the recorded owner. The previous check read only `c2c_documents.owner_id`
 *     — which is whoever SCAFFOLDED the project, NULL on backfilled documents —
 *     and `c2c_document_sections.owner_id`, which nothing writes, so a user who
 *     wrote every section could approve it and every section target was waved
 *     through.
 *  3. Unknown author ⇒ refuse (409). An independent signature asserts that
 *     someone other than the author reviewed the record; with no recorded
 *     author that cannot be shown, and a signature row must never imply a
 *     four-eyes check that did not happen. This used to log and allow.
 *  4. Authorship not modelled for the record type ⇒ refuse (409), for the same
 *     reason. Sign it with meaning "authorship", or model its authorship here.
 *  5. The lookup failed ⇒ refuse (503). The check did not run; a retry may work.
 *
 * @module server/services/governance/separation-of-duties
 */
import { pool } from '../../db.js';

/** The check ran, and the signer is one of the record's authors. → 403 */
export class SeparationOfDutiesError extends Error {
  readonly code = 'SEPARATION_OF_DUTIES';
  constructor(message: string) {
    super(message);
    this.name = 'SeparationOfDutiesError';
  }
}

/**
 * The authorship lookup FAILED, so the check did not run. → 503. Not a
 * subclass of `SeparationOfDutiesError`: that means "you are the author"; this
 * means "we could not look". A caller mapping both to one response tells the
 * user something false either way.
 */
export class SeparationOfDutiesUnverifiedError extends Error {
  readonly code = 'SEPARATION_OF_DUTIES_UNVERIFIED';
  constructor(target: string, cause: string) {
    super(
      `Separation of duties could not be verified for "${target}" (${cause}). ` +
        'Nothing was signed. Retry; if this persists, the owner lookup for this record type is failing.',
    );
    this.name = 'SeparationOfDutiesUnverifiedError';
  }
}

/**
 * The lookup worked, but the record has no recorded author — or its record
 * type has no authorship modelled — so independence cannot be shown. → 409.
 * A retry will not help; the record's attribution has to be established.
 */
export class SeparationOfDutiesAuthorUnresolvedError extends Error {
  readonly code = 'SEPARATION_OF_DUTIES_AUTHOR_UNRESOLVED';
  constructor(message: string) {
    super(message);
    this.name = 'SeparationOfDutiesAuthorUnresolvedError';
  }
}

// ─── Scope by signature meaning ──────────────────────────────────────────────

/** 21 CFR 11.50(a)(3) meanings that denote authorship. */
const AUTHORSHIP_MEANINGS = new Set(['authorship', 'author']);

/**
 * Whether this action must be independent of the record's authors. `lock` and
 * every non-authorship meaning do; an undeclared meaning is treated as an
 * approval, which is the fail-closed reading.
 */
export function requiresIndependence(command: 'sign' | 'lock', meaning: unknown): boolean {
  if (command === 'lock') return true;
  return !(typeof meaning === 'string' && AUTHORSHIP_MEANINGS.has(meaning.trim().toLowerCase()));
}

// ─── Authorship ──────────────────────────────────────────────────────────────

export interface TargetAuthorship {
  /** False when no authorship source is modelled for this record type. */
  modelled: boolean;
  /** Distinct user ids of the record's authors, from every source below. */
  authors: number[];
  /** Which sources contributed, for the refusal message and the audit. */
  sources: string[];
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
  return Number.isFinite(n) ? n : null;
}

class AuthorSet {
  private readonly ids = new Set<number>();
  private readonly from = new Set<string>();
  add(rows: Array<Record<string, unknown>>, column: string, source: string): void {
    for (const row of rows) {
      const id = intOrNull(row[column]);
      if (id !== null) {
        this.ids.add(id);
        this.from.add(source);
      }
    }
  }
  result(): TargetAuthorship {
    return { modelled: true, authors: [...this.ids].sort((a, b) => a - b), sources: [...this.from].sort() };
  }
}

const NOT_MODELLED: TargetAuthorship = { modelled: false, authors: [], sources: [] };

/**
 * Where authorship is read. The pool by default; a caller signing inside its own
 * transaction passes that client, so the check neither borrows a second
 * connection while holding one nor reads around its own uncommitted write.
 */
export type AuthorshipReader = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

async function documentAuthors(db: AuthorshipReader, documentId: string, orgId: number, sectionKey: string | null): Promise<TargetAuthorship> {
  const set = new AuthorSet();
  const sectionFilter = sectionKey === null ? '' : 'AND s.section_key = $3';
  const params = sectionKey === null ? [documentId, orgId] : [documentId, orgId, sectionKey];

  // Everyone who wrote a version of the content. Template scaffolds are not
  // authorship: creating an empty section from a rule pack writes no content.
  const versions = await db.query(
    `SELECT DISTINCT v.author_id
       FROM c2c_document_section_versions v
       JOIN c2c_document_sections s ON s.id = v.section_id
       JOIN c2c_documents d ON d.id = s.document_id
      WHERE d.id = $1 AND d.org_id = $2 ${sectionFilter}
        AND v.author_id IS NOT NULL
        AND v.author_kind IS DISTINCT FROM 'template'`,
    params,
  );
  set.add(versions.rows, 'author_id', 'section version ledger');

  // Whoever adopted a drafted section is its human author of record.
  const accepted = await db.query(
    `SELECT DISTINCT s.accepted_by
       FROM c2c_document_sections s
       JOIN c2c_documents d ON d.id = s.document_id
      WHERE d.id = $1 AND d.org_id = $2 ${sectionFilter} AND s.accepted_by IS NOT NULL`,
    params,
  );
  set.add(accepted.rows, 'accepted_by', 'accepted drafts');

  // The recorded owner adds to the set; it is never the only source.
  const owner = sectionKey === null
    ? await db.query(`SELECT owner_id FROM c2c_documents WHERE id = $1 AND org_id = $2 LIMIT 1`, [documentId, orgId])
    : await db.query(
        `SELECT s.owner_id FROM c2c_document_sections s JOIN c2c_documents d ON d.id = s.document_id
          WHERE d.id = $1 AND d.org_id = $2 AND s.section_key = $3 LIMIT 1`,
        params,
      );
  set.add(owner.rows, 'owner_id', 'recorded owner');
  return set.result();
}

/**
 * A protocol's authors: everyone who wrote its content. That is its creator, the
 * creator of every live content row (sections, objectives, eligibility, visits,
 * schedule-of-assessments rows and cells, team, version snapshots), and everyone
 * who changed that content through a governed edit (protocol_sections and the
 * other content tables record no editor, so the ledger is the edit history).
 * Review activity writes none of these (assignments and comments live in their
 * own tables, a disposition is `sign`), so a reviewer is not made an author.
 */
async function protocolDocumentAuthors(db: AuthorshipReader, documentId: string, orgId: number): Promise<TargetAuthorship> {
  if (!/^\d+$/.test(documentId)) return new AuthorSet().result();
  const docId = Number(documentId);
  const set = new AuthorSet();
  const doc = await db.query(
    `SELECT created_by FROM protocol_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [docId, orgId],
  );
  set.add(doc.rows, 'created_by', 'protocol creator');
  const content = await db.query(
    `SELECT created_by FROM protocol_sections           WHERE protocol_document_id = $1 AND organization_id = $2
     UNION SELECT created_by FROM protocol_objectives            WHERE protocol_document_id = $1 AND organization_id = $2
     UNION SELECT created_by FROM protocol_eligibility_criteria  WHERE protocol_document_id = $1 AND organization_id = $2
     UNION SELECT created_by FROM protocol_schedule_visits       WHERE protocol_document_id = $1 AND organization_id = $2
     UNION SELECT created_by FROM protocol_soa_assessments       WHERE protocol_document_id = $1 AND organization_id = $2
     UNION SELECT created_by FROM protocol_soa_cells             WHERE protocol_document_id = $1 AND organization_id = $2
     UNION SELECT created_by FROM protocol_team_members          WHERE protocol_document_id = $1 AND organization_id = $2
     UNION SELECT created_by FROM protocol_versions              WHERE protocol_document_id = $1 AND organization_id = $2`,
    [docId, orgId],
  );
  set.add(content.rows, 'created_by', 'protocol content');
  const edits = await db.query(
    `SELECT DISTINCT a.proposed_by
       FROM c2c_ana_actions a
      WHERE a.org_id = $2
        AND a.domain = 'protocol_development'
        AND a.command = 'update'
        AND (a.target = $3
             OR a.payload->>'documentId' = $4
             OR a.target IN (SELECT 'protocol-section:' || s.id FROM protocol_sections s
                              WHERE s.protocol_document_id = $1 AND s.organization_id = $2)
             OR a.target IN (SELECT 'protocol-soa-assessment:' || x.id FROM protocol_soa_assessments x
                              WHERE x.protocol_document_id = $1 AND x.organization_id = $2))`,
    [docId, orgId, `protocol-document:${documentId}`, documentId],
  );
  set.add(edits.rows, 'proposed_by', 'protocol edit ledger');
  return set.result();
}

async function single(db: AuthorshipReader, sql: string, params: unknown[], column: string, source: string): Promise<TargetAuthorship> {
  const set = new AuthorSet();
  const r = await db.query(sql, params);
  set.add(r.rows, column, source);
  return set.result();
}

/**
 * Resolve the authors of a governed target, org-scoped. THROWS when a lookup
 * fails — that is not an answer about authorship and must not be read as one.
 */
export async function resolveTargetAuthors(target: string, orgId: number, db: AuthorshipReader = pool): Promise<TargetAuthorship> {
  const colonIdx = target.indexOf(':');
  if (colonIdx === -1) return NOT_MODELLED;
  const prefix = target.slice(0, colonIdx);
  const rest = target.slice(colonIdx + 1);

  switch (prefix) {
    case 'document':
      return documentAuthors(db, rest, orgId, null);
    case 'section': {
      const parts = rest.split(':');
      if (parts.length < 2) return NOT_MODELLED;
      const [docId, ...keyParts] = parts;
      return documentAuthors(db, docId, orgId, keyParts.join(':'));
    }
    case 'task':
      return single(db, `SELECT owner_id FROM c2c_project_work_items WHERE id = $1 AND org_id = $2 LIMIT 1`, [rest, orgId], 'owner_id', 'recorded owner');
    case 'blocker':
      return single(db, `SELECT owner_user_id FROM c2c_blockers WHERE blocker_id = $1 AND org_id = $2 LIMIT 1`, [rest, orgId], 'owner_user_id', 'recorded owner');
    case 'ectd-sequence':
      // The one target the Part 11 freeze/dispatch/transmit chain signs.
      return single(db, `SELECT created_by FROM ectd_sequences WHERE id = $1 AND organization_id = $2 LIMIT 1`, [rest, orgId], 'created_by', 'sequence creator');
    case 'program':
      return single(db, `SELECT created_by FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`, [rest, orgId], 'created_by', 'program creator');
    case 'protocol-document':
      return protocolDocumentAuthors(db, rest, orgId);
    case 'protocol-review-assignment': {
      // A reviewer signs over the protocol, so independence is from its authors.
      if (!/^\d+$/.test(rest)) return new AuthorSet().result();
      const a = await db.query(
        `SELECT protocol_document_id FROM protocol_review_assignments WHERE id = $1::int AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [rest, orgId],
      );
      if (a.rows.length === 0) return new AuthorSet().result();
      return protocolDocumentAuthors(db, String(a.rows[0].protocol_document_id), orgId);
    }
    default:
      // submission (pma_submissions records no creator), specification, batch,
      // correspondence-issue and pointer-only targets: no authorship source.
      return NOT_MODELLED;
  }
}

// ─── The check ───────────────────────────────────────────────────────────────

export interface SeparationOfDutiesResult {
  /** True when independence was verified; false only for an authorship signature. */
  checked: boolean;
  reason: string;
}

/**
 * Enforce independence of review/approval/lock from the record's authors.
 * Returns when the action may proceed; throws one of the three errors above
 * when it may not. See the module note for the rules.
 */
export async function assertSignerIsNotAuthor(
  target: string,
  orgId: number,
  signerId: number,
  opts: { command?: 'sign' | 'lock'; meaning?: unknown; client?: AuthorshipReader } = {},
): Promise<SeparationOfDutiesResult> {
  if (!requiresIndependence(opts.command ?? 'sign', opts.meaning)) {
    return {
      checked: false,
      reason: 'Authorship signature (21 CFR 11.50(a)(3)): the author signing as author is not a separation-of-duties case.',
    };
  }

  let authorship: TargetAuthorship;
  try {
    authorship = await resolveTargetAuthors(target, orgId, opts.client);
  } catch (err: unknown) {
    const e = err as { code?: unknown; message?: unknown } | null;
    const cause = typeof e?.code === 'string' ? `database error ${e.code}` : 'owner lookup failed';
    console.error(`[governance/SoD] authorship lookup failed for "${target}"; refusing to sign:`, e?.message);
    throw new SeparationOfDutiesUnverifiedError(target, cause);
  }

  if (!authorship.modelled) {
    throw new SeparationOfDutiesAuthorUnresolvedError(
      `Authorship is not recorded for "${target.split(':')[0]}" records, so a review, approval or lock signature cannot be shown ` +
        'to be independent of the author. Nothing was signed. Sign with the meaning "authorship" if you are the author; ' +
        'otherwise this record type needs its authorship modelled before it can be approved.',
    );
  }
  if (authorship.authors.length === 0) {
    throw new SeparationOfDutiesAuthorUnresolvedError(
      `No author is recorded for "${target}", so a review, approval or lock signature cannot be shown to be independent ` +
        'of the author. Nothing was signed. Establish who authored it through an audited action, then have a different, ' +
        'authorized user sign.',
    );
  }
  if (authorship.authors.includes(signerId)) {
    throw new SeparationOfDutiesError(
      `Separation of duties: you are an author of this record (${authorship.sources.join(', ')}) and cannot review, approve ` +
        'or lock it. A different, authorized user must sign.',
    );
  }
  return { checked: true, reason: `Signer is not among the record's authors (${authorship.sources.join(', ')}).` };
}
