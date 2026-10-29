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
/* Who entered the register records a Module 3 section was composed from. The
   reader lives with the CMC registers because the lineage it walks is theirs;
   the rule applied to its answer is this module's. */
import {
  readSectionRecordOperators,
  unattributedRecordsRefusal,
} from '../cmc/register-operators.js';

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
  /**
   * Set when authorship is only PARTLY recorded: some of what the record is
   * built from names its author and some does not. The string is the refusal,
   * written by whoever knows which part is missing.
   *
   * A partial answer is not a negative one. Rule 3 of this module's header —
   * unknown author means refuse — applies to each contributing part, not only
   * to the whole: a signature must never imply a four-eyes check that did not
   * happen for the records it could not see. `assertSignerIsNotAuthor` refuses
   * on this, after the plainer "you wrote it" case.
   */
  incomplete?: string;
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
 * A lifecycle document's authors (VR-12): whoever created the canonical record
 * and, for a document made from a Vault version, whoever uploaded that version.
 * Both are write-once (the canonical append-only guard; the Vault record guard).
 */
async function canonicalDocumentAuthors(db: AuthorshipReader, canonicalId: string, orgId: number): Promise<TargetAuthorship> {
  const set = new AuthorSet();
  const doc = await db.query(
    `SELECT created_by, source_refs->'vault_documents'->>'nativeId' AS vault_id
       FROM canonical_documents WHERE canonical_id = $1 AND organization_id = $2 LIMIT 1`,
    [canonicalId, orgId],
  );
  set.add(doc.rows, 'created_by', 'lifecycle record creator');
  const vaultId = doc.rows[0]?.vault_id;
  if (typeof vaultId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vaultId)) {
    const version = await db.query(
      `SELECT created_by FROM vault.documents WHERE id = $1::uuid AND organization_id = $2 LIMIT 1`,
      [vaultId, orgId],
    );
    set.add(version.rows, 'created_by', 'Vault uploader');
  }
  return set.result();
}

function unresolvedAuthoringHeading():SeparationOfDutiesAuthorUnresolvedError {
  return new SeparationOfDutiesAuthorUnresolvedError(
    'The recorded Authoring heading change cannot be identified reliably. Review independence is unresolved.',
  );
}

function authoringHeadingChanged(raw:unknown):boolean {
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) throw unresolvedAuthoringHeading();
  const change=raw as Record<string,unknown>;
  if (typeof change.field!=='string') throw unresolvedAuthoringHeading();
  if (!['title','code'].includes(change.field)) return false;
  if (![change.from,change.to].every(value=>value===null || typeof value==='string')) throw unresolvedAuthoringHeading();
  return change.from!==change.to;
}

/** RENAME's native from/to facts distinguish visible changes from noops and
 * track-mode-only activity. Incomplete relevant evidence cannot establish independence. */
function authoringHeadingAuditHasChange(metadata:unknown):boolean {
  const changes=metadata && typeof metadata==='object' && !Array.isArray(metadata)
    ? (metadata as Record<string,unknown>).changes : undefined;
  if (!Array.isArray(changes)) throw unresolvedAuthoringHeading();
  // Check the entire recorded set: a valid first change must not hide malformed later facts.
  return changes.map(authoringHeadingChanged).some(Boolean);
}

/** Authoring uses the recorded creator, immutable prose revision actors and
 * existing visible-mutation audit actors. Permissions never rewrite authorship. */
async function authoringDocumentAuthors(db: AuthorshipReader, documentId: string, orgId: number): Promise<TargetAuthorship> {
  const empty: TargetAuthorship = { modelled: true, authors: [], sources: [] };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) return empty;
  const document = await db.query(
    `SELECT d.created_by FROM authoring_documents d WHERE d.id = $1 AND d.tenant_id = $2 LIMIT 1`,
    [documentId, orgId],
  );
  if (document.rows.length !== 1) return empty;
  const actorId = (value: unknown): number => {
    const canonical = typeof value === 'number' || (typeof value === 'string' && /^[1-9]\d*$/.test(value));
    const id = canonical ? Number(value) : NaN;
    if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) {
      throw new SeparationOfDutiesAuthorUnresolvedError(
        'The recorded Authoring creator or content contributor cannot be identified reliably. Review independence is unresolved.',
      );
    }
    return id;
  };
  const authors = new Set<number>([actorId(document.rows[0].created_by)]);
  const sources = ['Authoring document creator'];
  const revisions = await db.query(
    `SELECT DISTINCT r.created_by FROM doc_revisions r
       JOIN authoring_sections s ON s.id = r.section_id AND s.tenant_id = r.tenant_id
       JOIN authoring_documents d ON d.id = s.doc_id AND d.tenant_id = s.tenant_id
      WHERE d.id = $1 AND d.tenant_id = $2`,
    [documentId, orgId],
  );
  for (const row of revisions.rows) authors.add(actorId(row.created_by));
  if (revisions.rows.length) sources.push('Authoring revision ledger');
  const mutations = await db.query(
    `SELECT actor_id, operation_type, metadata FROM authoring_audit_trail
      WHERE doc_id = $1 AND tenant_id = $2 AND (
        (operation_type = 'CREATE' AND section_id IS NOT NULL)
        OR operation_type = 'REORDER_SECTIONS'
        OR (operation_type = 'RENAME' AND metadata->>'source' = 'section-metadata')
      )`,
    [documentId, orgId],
  );
  let visibleMutation = false;
  for (const row of mutations.rows) {
    if (row.operation_type==='RENAME' && !authoringHeadingAuditHasChange(row.metadata)) continue;
    authors.add(actorId(row.actor_id));
    visibleMutation = true;
  }
  if (visibleMutation) sources.push('Authoring visible mutation audit');
  return { modelled: true, authors: [...authors].sort((a, b) => a - b), sources };
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
     UNION SELECT created_by FROM protocol_team_members          WHERE protocol_document_id = $1 AND organization_id = $2`,
    [docId, orgId],
  );
  set.add(content.rows, 'created_by', 'protocol content');
  // Content edits only. On the document itself, 'update' also records review
  // comments (AnA), budget parameters and version snapshots; none of them is
  // authorship, and neither is a version row (finalize writes one under the
  // signer's id). A payload `documentId` counts only on the protocol's own
  // visit and SoA targets: other modules (Other Support) carry a documentId
  // that is their own document's, not this protocol's. Anything unlisted that
  // does land here is counted as authorship, which refuses a signer rather
  // than admitting one.
  const edits = await db.query(
    `SELECT DISTINCT a.proposed_by
       FROM c2c_ana_actions a
      WHERE a.org_id = $2
        AND a.domain = 'protocol_development'
        AND a.command = 'update'
        AND ((a.target = $3
              AND NOT (COALESCE(a.payload, '{}'::jsonb) ?| array['commentId','assignmentId','paramsId','itemId','version']))
             OR ((a.target LIKE 'protocol-visit:%' OR a.target LIKE 'protocol-soa-assessment:%')
                 AND a.payload->>'documentId' = $4)
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
 * Target types whose author is one recorded column on one row, keyed by the
 * target prefix. The id is passed as text; `$1::int` columns are guarded by
 * `numericId`, so a malformed id reads as "no such record" (no authors, refused
 * 409) rather than a failed lookup (503).
 */
const SINGLE_AUTHOR: Record<string, { sql: string; column: string; source: string; numericId?: boolean }> = {
  task: { sql: `SELECT owner_id FROM c2c_project_work_items WHERE id = $1 AND org_id = $2 LIMIT 1`, column: 'owner_id', source: 'recorded owner' },
  blocker: { sql: `SELECT owner_user_id FROM c2c_blockers WHERE blocker_id = $1 AND org_id = $2 LIMIT 1`, column: 'owner_user_id', source: 'recorded owner' },
  // The one target the Part 11 freeze/dispatch/transmit chain signs.
  //
  // Its author is the sequence's CREATOR only — a decision (founder,
  // 2026-10-05), not an oversight. Leaf placers are deliberately not authors:
  //   • Content independence is enforced where content is written. Every
  //     placed document must be approved before freeze or dispatch
  //     (LEAF-UNAPPROVED, submission-service Gate 3), and approving a document
  //     excludes everyone who wrote any version of it (documentAuthors).
  //     Placing an approved document is assembly, not authorship.
  //   • Launch clients are small regulatory teams, often two or three people
  //     for a whole IND. Counting every leaf placer as an author would bar the
  //     colleague who helped publish from releasing it, leaving the team unable
  //     to sign its own submission, with no independence gained over content
  //     the document gate has not already separated.
  // Guarantee: whoever assembled the sequence never releases it. A stricter
  // rule belongs in a per-org tightening (the header's "admin may tighten,
  // never loosen") — NOTE no such setting exists yet; that principle has no
  // mechanism today. Evidence: docs/evidence/D7/2026-09-28-dispatch-reachable/.
  'ectd-sequence': { sql: `SELECT created_by FROM ectd_sequences WHERE id = $1 AND organization_id = $2 LIMIT 1`, column: 'created_by', source: 'sequence creator' },
  // An assembled submission package, transmitted to an agency gateway
  // (executeGovernedTransmit). Its author is the package's creator, on the same
  // reasoning as 'ectd-sequence' above: whoever assembled it never sends it.
  // A package created without one (AnA's create path, until it records the
  // creator) has no author and is refused, never guessed.
  'submission-package': {
    sql: `SELECT created_by_id FROM c2c_submission_packages WHERE id = $1::int AND org_id = $2 LIMIT 1`,
    column: 'created_by_id',
    source: 'package creator',
    numericId: true,
  },
  program: { sql: `SELECT created_by FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`, column: 'created_by', source: 'project creator' },
  // Report finalize is signed (reporting review 2026-10-01). The run's content
  // is computed by the engines; the person who requested it is its author. A
  // run whose requester was removed has none, and is refused.
  'report-run': {
    sql: `SELECT requested_by FROM report_runs WHERE id = $1::int AND organization_id = $2 LIMIT 1`,
    column: 'requested_by',
    source: 'run requester',
    numericId: true,
  },
  // A labeling document and a labeling translation (D5, 2026-10-29): approving
  // one is signed (routes/mdx-labeling.ts), and its author is whoever added it,
  // which the create records (migrations/20261029b). `translator` is a free-text
  // name, not a user, so it is not an author source. A row added before
  // 20261029b records no creator and is refused, never guessed. A later editor
  // of the row is not recorded, so is not counted (the evidence README says so).
  'labeling-document': {
    sql: `SELECT created_by FROM labeling_documents WHERE id = $1::int AND organization_id = $2 LIMIT 1`,
    column: 'created_by',
    source: 'labeling document creator',
    numericId: true,
  },
  'labeling-translation': {
    sql: `SELECT created_by FROM labeling_translations WHERE id = $1::int AND organization_id = $2 LIMIT 1`,
    column: 'created_by',
    source: 'translation creator',
    numericId: true,
  },
};

/**
 * `'<head>:<tail>'`, or null when the rest names only one part. Each two-part
 * target parses its OWN rest (here and in the two helpers below) rather than in
 * `resolveTargetAuthors`, which keeps that function at one branch per prefix —
 * its complexity ceiling is 15 and it is at it.
 */
function twoPartRest(rest: string): { head: string; tail: string } | null {
  const parts = rest.split(':');
  if (parts.length < 2) return null;
  const [head, ...tail] = parts;
  return { head, tail: tail.join(':') };
}

/** One section of a c2c document: `'section:<documentId>:<sectionKey>'`. */
async function documentSectionAuthors(db: AuthorshipReader, rest: string, orgId: number): Promise<TargetAuthorship> {
  const t = twoPartRest(rest);
  if (!t) return NOT_MODELLED;
  return documentAuthors(db, t.head, orgId, t.tail);
}

/** The governed target naming one project's Module 3 section. */
export function cmcModule3SectionTarget(projectId: string, sectionKey: string): string {
  return `cmc-module3-section:${projectId}:${sectionKey}`;
}

/**
 * A Module 3 section's authors are the people who ENTERED the register records
 * it was composed from — read from the `cmc.register.create` rows on the
 * tenant's audit chain (services/cmc/register-audit.ts), through the section's
 * own lineage.
 *
 * Not the person who ran the compile: the compile is deterministic and writes
 * nobody's judgement into the section. What a section says is what its records
 * say, so the data entry is the authorship, and that is the pairing a quality
 * unit's second-person review exists to separate.
 *
 * A section citing nothing has no author and is refused by the caller, as
 * every other unresolved record type is.
 */
async function cmcModule3SectionAuthors(
  db: AuthorshipReader,
  rest: string,
  orgId: number,
): Promise<TargetAuthorship> {
  const target = twoPartRest(rest);
  if (!target) return NOT_MODELLED;
  const { head: projectId, tail: sectionKey } = target;
  const read = await readSectionRecordOperators(db, orgId, projectId, sectionKey);
  const set = new AuthorSet();
  /* The reader says WHERE it found each operator — the audit chain for every
     register created since 2026-10-18, and the change-proposal register's own
     `created_by` column for the one that predates it. The refusal names them,
     so a signer is told what the platform knows about who entered the data. */
  for (const source of read.sources) {
    set.add(read.operators.map((id) => ({ operator_id: id })), 'operator_id', source);
  }
  const result = set.result();
  if (read.cited.length === 0) {
    result.incomplete =
      `§${sectionKey} cites no recorded source, so this approval cannot be shown to be independent of whoever ` +
      'entered its data. Nothing was signed. Compile the section from the project\u2019s records, then approve.';
  } else if (read.unattributed.length > 0) {
    result.incomplete = unattributedRecordsRefusal(sectionKey, read.unattributed);
  }
  return result;
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

  const one = SINGLE_AUTHOR[prefix];
  if (one) {
    if (one.numericId && !/^\d+$/.test(rest)) return new AuthorSet().result();
    return single(db, one.sql, [rest, orgId], one.column, one.source);
  }

  switch (prefix) {
    case 'authoring-document':
      return authoringDocumentAuthors(db, rest, orgId);
    case 'document':
      return documentAuthors(db, rest, orgId, null);
    case 'section':
      return documentSectionAuthors(db, rest, orgId);
    case 'protocol-document':
      return protocolDocumentAuthors(db, rest, orgId);
    case 'canonical_document':
      return canonicalDocumentAuthors(db, rest, orgId);
    case 'cmc-module3-section':
      return cmcModule3SectionAuthors(db, rest, orgId);
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

/**
 * The HTTP answer to a separation-of-duties refusal, or null for any other
 * error. ONE mapping, beside the three errors it maps, so no route can answer
 * the same refusal differently — the governed-action handler, the document
 * lock and the CMC section approval all read it from here. (It lived in
 * routes/c2c/actions.ts until 2026-10-18 and is re-exported from there, so its
 * existing importers are unchanged; a route is not where a rule about three
 * error classes belongs, and the CMC approval would have had to import a
 * 1,000-line route module to get at it.)
 */
export function separationOfDutiesRefusal(
  err: unknown,
  label: string,
): { status: number; body: { error: string; detail: string } } | null {
  if (err instanceof SeparationOfDutiesError) {
    return { status: 403, body: { error: err.code, detail: err.message } };
  }
  if (err instanceof SeparationOfDutiesAuthorUnresolvedError) {
    // The check ran, but the record has no recorded author (or its type has
    // none modelled), so independence cannot be shown. A retry will not fix it.
    return { status: 409, body: { error: err.code, detail: err.message } };
  }
  if (err instanceof SeparationOfDutiesUnverifiedError) {
    // The check did not run, which is not the same as the check refusing.
    // 503, not 403: the user is not the problem, and a retry may succeed.
    // The error's own message carries the failed lookup's cause, which is
    // internal; it goes to the log, and the caller gets an authored
    // sentence (ci:server-error-leaks, 2026-09-23).
    console.error('[%s] %s', label, err.message);
    return {
      status: 503,
      body: {
        error: err.code,
        detail:
          'Separation of duties could not be verified, so nothing was signed. Try again; if this continues, contact your administrator.',
      },
    };
  }
  return null;
}

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
    if (err instanceof SeparationOfDutiesAuthorUnresolvedError) throw err;
    const e = err as { code?: unknown; message?: unknown } | null;
    const cause = typeof e?.code === 'string' ? `database error ${e.code}` : 'owner lookup failed';
    console.error('[governance/SoD] authorship lookup failed for "%s"; refusing to sign:', target, e?.message);
    throw new SeparationOfDutiesUnverifiedError(target, cause);
  }

  if (!authorship.modelled) {
    throw new SeparationOfDutiesAuthorUnresolvedError(
      `Authorship is not recorded for "${target.split(':')[0]}" records, so a review, approval or lock signature cannot be shown ` +
        'to be independent of the author. Nothing was signed. Sign with the meaning "authorship" if you are the author; ' +
        'otherwise this record type needs its authorship modelled before it can be approved.',
    );
  }
  /* The signer being an author is the plainest refusal there is, so it is said
     first — before "authorship is only partly recorded", which is true of the
     same record and tells the signer much less. (An empty author set can never
     reach this branch, so the order below is unchanged for every other
     target.) */
  if (authorship.authors.includes(signerId)) {
    throw new SeparationOfDutiesError(
      `Separation of duties: you are an author of this record (${authorship.sources.join(', ')}) and cannot review, approve ` +
        'or lock it. A different, authorized user must sign.',
    );
  }
  if (authorship.authors.length === 0 || authorship.incomplete) {
    throw new SeparationOfDutiesAuthorUnresolvedError(
      authorship.incomplete ??
        `No author is recorded for "${target}", so a review, approval or lock signature cannot be shown to be independent ` +
          'of the author. Nothing was signed. Establish who authored it through an audited action, then have a different, ' +
          'authorized user sign.',
    );
  }
  return { checked: true, reason: `Signer is not among the record's authors (${authorship.sources.join(', ')}).` };
}

/** What signing this record with an approval meaning would meet at the
 *  separation-of-duties check, asked in advance. */
export type SignerIndependence = 'independent' | 'author' | 'unresolved' | 'unverified';

/**
 * Would assertSignerIsNotAuthor let this user sign this record as review,
 * approval or release?
 *
 * Asked of the enforcing check itself, so a screen that warns in advance (the
 * Submission Center's Dispatch tab: a sequence's creator cannot sign its
 * freeze or dispatch) cannot disagree with what the sign step will do. Before
 * this the route re-derived the rule from resolveTargetAuthors — a second
 * copy, which would have drifted the day the rule changed. The gateway's
 * transmitIndependenceOf asks its own check the same way.
 *
 * A lookup failure is 'unverified', never 'independent': unknown is not
 * permission, and the sign step still decides.
 */
export async function signerIndependenceOf(
  target: string,
  orgId: number,
  signerId: number,
): Promise<SignerIndependence> {
  try {
    await assertSignerIsNotAuthor(target, orgId, signerId, { command: 'sign', meaning: 'approval' });
    return 'independent';
  } catch (err) {
    if (err instanceof SeparationOfDutiesError) return 'author';
    if (err instanceof SeparationOfDutiesAuthorUnresolvedError) return 'unresolved';
    return 'unverified';
  }
}

