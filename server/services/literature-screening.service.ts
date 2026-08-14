/**
 * Literature screening — the MEDDEV 2.7/1 Rev 4 include/exclude appraisal
 * trail for the organization's literature corpus.
 *
 * This is the SINGLE screening path (ZERO DUPLICATION). It is consumed by
 *
 *   - POST /api/cerv2/literature/screen      (write)
 *   - GET  /api/cerv2/literature/screening   (read)
 *
 * both in server/routes/cerv2-document-routes.ts, and by nothing else. It is
 * the sibling of literature-recording.service.ts: recording puts an article
 * INTO the corpus, screening records what a reviewer DECIDED about it. The two
 * are separate because the decision has its own actor, its own timestamp, its
 * own stage, and its own per-device scope, none of which a bibliographic
 * corpus row can carry.
 *
 * Table: literature_screening_decisions
 * (migrations/20260814b_literature_screening_decisions.sql — that file's header
 * carries the full design rationale; the short version is below.)
 *
 * Contract decisions, in doctrine order:
 *
 *   FAIL CLOSED   The caller hands in a SQL executor (the request-scoped
 *                 client for routes). No executor, no write. An article that
 *                 is not in the org's corpus cannot be screened — the service
 *                 REFUSES with a typed 422 refusal naming the reason, it does
 *                 not conjure a corpus row to hang the decision on. A missing
 *                 table is likewise a typed 422 ("migration not applied"),
 *                 never a swallowed success.
 *
 *   NEVER FABRICATE
 *                 The read path returns exactly the decisions that are stored.
 *                 An article with no stored decision is ABSENT from the
 *                 result — it is not defaulted to 'pending', because "nobody
 *                 has screened this" and "a reviewer explicitly deferred it"
 *                 are different facts and a CER must not confuse them.
 *
 *   TENANCY       Every statement filters on organization_id, and the org
 *                 always comes from the authenticated request — never from a
 *                 payload. The corpus join is filtered on the org a SECOND
 *                 time (on literature_entries) so a decision row can never
 *                 surface another tenant's bibliography even if a decision row
 *                 were somehow mis-keyed.
 *
 *   PART 11       This module persists the CURRENT decision. The immutable
 *                 before/after trail is written by the route through
 *                 `auditService.logAction` — the sanctioned chained+sealed
 *                 writer (docs/AUDIT_STORE_INVENTORY_2026-08.md §2) — which is
 *                 why `recordScreeningDecision` returns the SUPERSEDED
 *                 decision alongside the new one. Nothing here hand-rolls an
 *                 audit INSERT.
 */

import type { SqlExecutor } from './literature-recording.service';
import { LITERATURE_SOURCE_NAME } from './literature-recording.service';

export type { SqlExecutor };

/* ─── Vocabulary ─────────────────────────────────────────────────────── */

/**
 * The two MEDDEV/PRISMA screening passes.
 *
 * NOT invented here: these are the stage names the CER intelligence flow
 * already uses for its own PRISMA counts —
 * `articles_after_title_abstract_screening` and
 * `articles_after_full_text_screening`
 * (server/services/ana/intelligence-questions/flows/cer-report.ts:923,929).
 * Keeping one vocabulary means the stored decisions can be counted straight
 * into those fields without a translation table nobody would maintain.
 */
export const SCREENING_STAGES = ['title_abstract', 'full_text'] as const;
export type ScreeningStage = (typeof SCREENING_STAGES)[number];

/**
 * A reviewer's call.
 *
 * 'pending' is an EXPLICIT deferral ("retrieve the full text before deciding")
 * and is deliberately distinct from the absence of a row, which means the
 * article has never been screened. Collapsing the two would report unscreened
 * articles as actively triaged.
 */
export const SCREENING_DECISIONS = ['included', 'excluded', 'pending'] as const;
export type ScreeningDecision = (typeof SCREENING_DECISIONS)[number];

/** Human-facing labels, so route/UI/AnA never each invent their own wording. */
export const SCREENING_STAGE_LABELS: Record<ScreeningStage, string> = {
  title_abstract: 'Title/abstract screening',
  full_text: 'Full-text screening',
};

/**
 * MEDDEV 2.7/1 Rev 4 §8 requires the reason for every exclusion to be part of
 * the record. Enforced here, in the route schema, AND by a CHECK constraint —
 * three layers, because this is the field a notified body reads first.
 */
export const EXCLUSION_REASON_REQUIRED =
  'An exclusion must carry a reason — MEDDEV 2.7/1 Rev 4 §8 requires the rationale for every ' +
  'excluded article to be part of the clinical evaluation record';

/**
 * Screening is a decision ABOUT a corpus entry, so the entry must exist first.
 * Stated once here so the service, the route and the client all refuse in the
 * same words instead of three near-misses.
 */
export const ENTRY_NOT_IN_CORPUS =
  'that article is not in this organization\'s literature corpus — record it to the corpus ' +
  'before screening it, so the decision has something durable to attach to';

/** Postgres "relation does not exist". */
const PG_UNDEFINED_TABLE = '42P01';

const pgCode = (err: unknown): string | undefined =>
  typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code)
    : undefined;

/** True when the failure is "the screening migration has not been applied". */
export function isScreeningStoreAbsent(err: unknown): boolean {
  return pgCode(err) === PG_UNDEFINED_TABLE;
}

export const SCREENING_STORE_ABSENT =
  'the literature screening store is not provisioned on this database — ' +
  'migrations/20260814b_literature_screening_decisions.sql has not been applied';

/* ─── Typed refusals ─────────────────────────────────────────────────── */

export type ScreeningRefusalCode =
  | 'ENTRY_NOT_IN_CORPUS'
  | 'SCREENING_STORE_ABSENT'
  | 'EXCLUSION_REASON_REQUIRED'
  | 'INVALID_SCREENING_INPUT';

/**
 * A refusal the caller can relay verbatim as a 422. Distinguished from a
 * genuine 500 on purpose: "I will not record this, and here is why" is a
 * different fact from "the database broke", and a reviewer needs to be told
 * which one happened.
 */
export class ScreeningRefusal extends Error {
  readonly code: ScreeningRefusalCode;
  readonly statusCode = 422;

  constructor(code: ScreeningRefusalCode, message: string) {
    super(message);
    this.name = 'ScreeningRefusal';
    this.code = code;
  }
}

/* ─── Shapes ─────────────────────────────────────────────────────────── */

export interface ScreeningDecisionInput {
  /** PubMed ID — the same corpus key literature-recording.service is idempotent on. */
  pmid: string;
  stage: ScreeningStage;
  decision: ScreeningDecision;
  /** Required iff decision === 'excluded'; rejected otherwise. */
  exclusionReason?: string | null;
  /** regulatory_programs.id, or null/undefined for an org-corpus-level decision. */
  programId?: string | null;
}

export interface StoredScreeningDecision {
  id: string;
  pmid: string;
  /**
   * The corpus entry's title, carried on the READ path so the stored trail is
   * legible on its own — after a reload the transient PubMed search is gone,
   * and a list of bare PMIDs is not a screening record anyone can review.
   * Empty string on the write path, where the caller already holds the article.
   */
  title: string;
  literatureEntryId: string;
  programId: string | null;
  stage: ScreeningStage;
  decision: ScreeningDecision;
  exclusionReason: string | null;
  decidedBy: number;
  decidedAt: string;
}

export interface ScreeningWriteResult {
  /** The decision now in force. */
  current: StoredScreeningDecision;
  /**
   * The decision this one replaced, or null on a first decision. Carried so
   * the route's audit row records old→new rather than only the new state.
   */
  superseded: Pick<StoredScreeningDecision, 'decision' | 'exclusionReason' | 'decidedBy' | 'decidedAt'> | null;
  outcome: 'created' | 'updated';
}

const PMID_RE = /^\d{1,10}$/;

const toIsoString = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value);

const asStage = (value: unknown): ScreeningStage => {
  const stage = String(value);
  if (!(SCREENING_STAGES as readonly string[]).includes(stage)) {
    // A row whose stage is outside the vocabulary means the CHECK constraint is
    // missing (partially applied migration). Surfacing it beats silently
    // widening the type the CER counts are computed from.
    throw new ScreeningRefusal(
      'SCREENING_STORE_ABSENT',
      `stored screening stage "${stage}" is outside the known vocabulary (${SCREENING_STAGES.join(', ')}) — the screening store's CHECK constraints are not in place`,
    );
  }
  return stage as ScreeningStage;
};

const asDecision = (value: unknown): ScreeningDecision => {
  const decision = String(value);
  if (!(SCREENING_DECISIONS as readonly string[]).includes(decision)) {
    throw new ScreeningRefusal(
      'SCREENING_STORE_ABSENT',
      `stored screening decision "${decision}" is outside the known vocabulary (${SCREENING_DECISIONS.join(', ')}) — the screening store's CHECK constraints are not in place`,
    );
  }
  return decision as ScreeningDecision;
};

function rowToDecision(row: Record<string, unknown>): StoredScreeningDecision {
  return {
    id: String(row.id),
    pmid: String(row.pmid ?? ''),
    title: row.title == null ? '' : String(row.title),
    literatureEntryId: String(row.literature_entry_id),
    programId: row.program_id == null ? null : String(row.program_id),
    stage: asStage(row.stage),
    decision: asDecision(row.decision),
    exclusionReason: row.exclusion_reason == null ? null : String(row.exclusion_reason),
    decidedBy: Number(row.decided_by),
    decidedAt: toIsoString(row.decided_at),
  };
}

/**
 * Normalize + validate the reason against the decision.
 *
 * Exported and pure so the rule is unit-testable and so the route can apply
 * the identical check at the schema layer without restating it.
 */
export function normalizeExclusionReason(
  decision: ScreeningDecision,
  reason: string | null | undefined,
): string | null {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (decision === 'excluded') {
    if (trimmed.length === 0) {
      throw new ScreeningRefusal('EXCLUSION_REASON_REQUIRED', EXCLUSION_REASON_REQUIRED);
    }
    return trimmed;
  }
  // An included/pending decision must not carry a rationale: a stale exclusion
  // reason left on an included article is exactly the kind of contradiction an
  // auditor picks up. The DB CHECK enforces the same rule.
  return null;
}

/* ─── Write ──────────────────────────────────────────────────────────── */

/**
 * Record (or supersede) one screening decision.
 *
 * Resolves the PMID to a corpus entry INSIDE the caller's organization first —
 * that resolution is both the tenancy guard and the honesty guard: an article
 * the org has not recorded cannot be screened, and the refusal says so.
 *
 * Idempotent per (organization, entry, program, stage): re-deciding UPDATEs the
 * decision in place. The superseded values are read immediately before the
 * upsert on the SAME connection and returned so the caller can chain an
 * old→new audit row.
 *
 * Throws `ScreeningRefusal` (422-shaped) for anything the caller could fix, and
 * lets genuine database errors propagate — callers must not report a decision
 * as recorded when it was not.
 */
export async function recordScreeningDecision(
  dbc: SqlExecutor,
  organizationId: number,
  decidedBy: number,
  input: ScreeningDecisionInput,
): Promise<ScreeningWriteResult> {
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new ScreeningRefusal(
      'INVALID_SCREENING_INPUT',
      'A positive integer organizationId is required to record a screening decision',
    );
  }
  if (!Number.isInteger(decidedBy) || decidedBy <= 0) {
    // An unattributed decision is not Part 11 evidence, so this is a refusal
    // rather than a nullable column.
    throw new ScreeningRefusal(
      'INVALID_SCREENING_INPUT',
      'A screening decision must be attributable to a user — no authenticated user id is present',
    );
  }

  const pmid = String(input?.pmid ?? '').trim();
  if (!PMID_RE.test(pmid)) {
    throw new ScreeningRefusal(
      'INVALID_SCREENING_INPUT',
      `Invalid pmid "${input?.pmid}" — a numeric PubMed ID is required`,
    );
  }
  if (!(SCREENING_STAGES as readonly string[]).includes(String(input?.stage))) {
    throw new ScreeningRefusal(
      'INVALID_SCREENING_INPUT',
      `Invalid screening stage "${input?.stage}" — expected one of ${SCREENING_STAGES.join(', ')}`,
    );
  }
  if (!(SCREENING_DECISIONS as readonly string[]).includes(String(input?.decision))) {
    throw new ScreeningRefusal(
      'INVALID_SCREENING_INPUT',
      `Invalid screening decision "${input?.decision}" — expected one of ${SCREENING_DECISIONS.join(', ')}`,
    );
  }

  const stage = input.stage as ScreeningStage;
  const decision = input.decision as ScreeningDecision;
  const exclusionReason = normalizeExclusionReason(decision, input.exclusionReason);
  const programId = input.programId?.trim() ? input.programId.trim() : null;

  // ── 1. Resolve the corpus entry inside the org (tenancy + honesty guard) ──
  const entryResult = await dbc.query(
    `SELECT id, title
       FROM literature_entries
      WHERE organization_id::text = $1::text
        AND source_name = $2
        AND source_id   = $3
      LIMIT 1`,
    [String(organizationId), LITERATURE_SOURCE_NAME, pmid],
  );
  if (entryResult.rows.length === 0) {
    throw new ScreeningRefusal('ENTRY_NOT_IN_CORPUS', `PMID ${pmid} — ${ENTRY_NOT_IN_CORPUS}`);
  }
  const literatureEntryId = String(entryResult.rows[0].id);
  const entryTitle = entryResult.rows[0].title == null ? '' : String(entryResult.rows[0].title);

  try {
    // ── 2. Read the decision being superseded, on this same connection ──────
    const priorResult = await dbc.query(
      `SELECT decision, exclusion_reason, decided_by, decided_at
         FROM literature_screening_decisions
        WHERE organization_id     = $1
          AND literature_entry_id = $2
          AND program_id IS NOT DISTINCT FROM $3::uuid
          AND stage               = $4
        LIMIT 1`,
      [organizationId, literatureEntryId, programId, stage],
    );
    const priorRow = priorResult.rows[0];
    const superseded = priorRow
      ? {
          decision: asDecision(priorRow.decision),
          exclusionReason:
            priorRow.exclusion_reason == null ? null : String(priorRow.exclusion_reason),
          decidedBy: Number(priorRow.decided_by),
          decidedAt: toIsoString(priorRow.decided_at),
        }
      : null;

    // ── 3. Upsert ───────────────────────────────────────────────────────────
    // Two ON CONFLICT targets because the uniqueness is expressed as two
    // PARTIAL indexes: Postgres treats NULL program_id values as distinct, so a
    // single index would permit unlimited duplicate org-level decisions for the
    // same entry+stage. The inference clause must match the index predicate.
    const conflictTarget =
      programId === null
        ? '(organization_id, literature_entry_id, stage) WHERE program_id IS NULL'
        : '(organization_id, literature_entry_id, program_id, stage) WHERE program_id IS NOT NULL';

    const upsertResult = await dbc.query(
      `INSERT INTO literature_screening_decisions
         (organization_id, literature_entry_id, program_id, stage, decision,
          exclusion_reason, decided_by, decided_at, updated_at)
       VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT ${conflictTarget}
       DO UPDATE SET decision         = EXCLUDED.decision,
                     exclusion_reason = EXCLUDED.exclusion_reason,
                     decided_by       = EXCLUDED.decided_by,
                     decided_at       = NOW(),
                     updated_at       = NOW()
       RETURNING id, literature_entry_id, program_id, stage, decision,
                 exclusion_reason, decided_by, decided_at, (xmax = 0) AS inserted`,
      [
        organizationId,
        literatureEntryId,
        programId,
        stage,
        decision,
        exclusionReason,
        decidedBy,
      ],
    );

    const row = upsertResult.rows[0];
    if (!row) {
      // An upsert that returns nothing has persisted nothing. Say so.
      throw new Error('screening decision upsert returned no row — nothing was persisted');
    }

    return {
      current: rowToDecision({ ...row, pmid, title: entryTitle }),
      superseded,
      outcome: row.inserted === true || row.inserted === 't' ? 'created' : 'updated',
    };
  } catch (error) {
    if (isScreeningStoreAbsent(error)) {
      throw new ScreeningRefusal('SCREENING_STORE_ABSENT', SCREENING_STORE_ABSENT);
    }
    throw error;
  }
}

/* ─── Read ───────────────────────────────────────────────────────────── */

export interface ScreeningReadQuery {
  /** null = org-corpus-level decisions. A program id returns only that program's. */
  programId?: string | null;
  /** Optional PMID filter — typically the PMIDs currently on screen. */
  pmids?: string[];
  /** Hard cap; the route supplies its own. */
  limit?: number;
}

export interface ScreeningReadResult {
  /**
   * False only when the screening store is not provisioned. The workbench then
   * says the trail is unavailable and WHY, rather than rendering every article
   * as unscreened — which would look identical to a reviewer who has screened
   * nothing yet.
   */
  available: boolean;
  unavailableReason?: string;
  decisions: StoredScreeningDecision[];
}

/**
 * Read back the stored decisions for a scope.
 *
 * Articles with no stored decision are simply absent from `decisions` — see the
 * NEVER FABRICATE note at the top of this file.
 */
export async function getScreeningDecisions(
  dbc: SqlExecutor,
  organizationId: number,
  query: ScreeningReadQuery = {},
): Promise<ScreeningReadResult> {
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new ScreeningRefusal(
      'INVALID_SCREENING_INPUT',
      'A positive integer organizationId is required to read screening decisions',
    );
  }

  const programId = query.programId?.trim() ? query.programId.trim() : null;
  const pmids = (query.pmids ?? []).map((p) => String(p).trim()).filter((p) => PMID_RE.test(p));
  const limit = Number.isInteger(query.limit) && query.limit! > 0 ? query.limit! : 500;

  // organization_id is bound TWICE, deliberately: once as an integer for the
  // decision row and once as text for the corpus row, whose column type differs
  // across schema lineages (INTEGER canonically, TEXT in the quarantined
  // _consolidated tree). Both sides are filtered so neither table alone can
  // widen the tenant scope.
  const params: unknown[] = [organizationId, String(organizationId), programId, LITERATURE_SOURCE_NAME];
  let pmidClause = '';
  if (pmids.length > 0) {
    params.push(pmids);
    pmidClause = ` AND le.source_id = ANY($${params.length}::text[])`;
  }
  params.push(limit);
  const limitParam = `$${params.length}`;

  try {
    const result = await dbc.query(
      `SELECT d.id,
              d.literature_entry_id,
              d.program_id,
              d.stage,
              d.decision,
              d.exclusion_reason,
              d.decided_by,
              d.decided_at,
              le.source_id AS pmid,
              le.title     AS title
         FROM literature_screening_decisions d
         JOIN literature_entries le
           ON le.id = d.literature_entry_id
        WHERE d.organization_id = $1
          AND le.organization_id::text = $2::text
          AND d.program_id IS NOT DISTINCT FROM $3::uuid
          AND le.source_name = $4${pmidClause}
        ORDER BY d.decided_at DESC
        LIMIT ${limitParam}`,
      params,
    );
    return { available: true, decisions: result.rows.map(rowToDecision) };
  } catch (error) {
    if (isScreeningStoreAbsent(error)) {
      return { available: false, unavailableReason: SCREENING_STORE_ABSENT, decisions: [] };
    }
    throw error;
  }
}
