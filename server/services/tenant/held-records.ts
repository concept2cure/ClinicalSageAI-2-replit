/**
 * A tenant's held records: the signatures, audit trails, sealed reports,
 * ledgers and signed workflows that were held out of the tenant purge until
 * the founder decided their retention (P-58, D6, 2026-10-29;
 * docs/LAUNCH_DEFINITION_OF_DONE.md, docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/).
 *
 * The decision: every held record is exported, then erased with the tenant,
 * but only after the customer's administrator signs that they received the
 * export and took custody of it (./offboarding-custody.ts). This module is the
 * one list of what "held" means, read by both halves:
 *
 *   - the custody attestation counts each store's records, and lists the ones
 *     still inside the organisation's retention period, which the customer
 *     accepts the obligation to keep;
 *   - the purge counts them again inside its own transaction, refuses without
 *     a custody signature when there are any, and refuses when the counts are
 *     not the ones the customer attested to.
 *
 * The 18 tables of PURGE_REFERRERS_NOT_ERASED as they stood on 2026-10-29, the
 * route members of review_routes (unified_tasks rows carrying review_route_id),
 * and five tables that name a held record with no delete action, so that
 * erasing the held record erases them first: a signed compliance review
 * (compliance_review_records → electronic_signatures), a sealed report's seal
 * events, indemnification attestations and atom provenance (→
 * immutable_report_records), and a legacy agency question's responses (→
 * reg_questions). Each is the same class of record as its parent. And one
 * more, by the lead's decision of 2026-10-29: qc_deviations (P-57), a GxP
 * quality record, counted here so a departing customer's custody attestation
 * names it. Nothing refuses its DELETE, so it needs no door; its close and
 * cancel signatures are electronic_signatures rows, erased with those.
 *
 * A custody signature (signed_target 'tenant-export-custody:<digest>') is not
 * a held record: it is signed after the export it attests to, so it is not in
 * it, and it is the platform's record that custody passed. The purge keeps it,
 * and the offboarding certificate names it (./offboarding-certificate.ts).
 *
 * Every table name and predicate is a fixed string from this frozen list;
 * `$1` is the organization id as an INTEGER and `$2`, where used, the
 * retention period in years. Nothing here is derived from request input.
 *
 * @module server/services/tenant/held-records
 */
import { CUSTODY_TARGET_PREFIX } from '../part11/custody-signature';
import { PURGE_PARENT_SCOPED } from './purge-parent-scope';

export interface HeldRecordStore {
  /** The name a count is reported under: the table, or a qualified name for a subset of one. */
  key: string;
  table: string;
  /** Which of the table's rows are this tenant's held records. */
  where: string;
  /** When each record was made: where the retention clock starts. */
  recordedAt: string;
  /** Every `table.column` the predicate reads: a store is read only where all of them exist. */
  needs: readonly string[];
  /** The store's held records as one fixed subquery (id, recorded_at), built here from the fields above and nothing else. */
  rows: string;
}

const OWN = 'organization_id = $1';
const store = (table: string, where = OWN, recordedAt = 'created_at', key = table, extra: readonly string[] = []): HeldRecordStore =>
  Object.freeze({
    key, table, where, recordedAt,
    needs: Object.freeze([`${table}.id`, `${table}.${recordedAt}`, ...extra]),
    rows: `SELECT id, ${recordedAt} AS recorded_at FROM ${table} WHERE ${where}`,
  });
const own = (table: string, recordedAt = 'created_at') => store(table, OWN, recordedAt, table, [`${table}.organization_id`]);
/** An IVDR history, by its parent's organization (PURGE_PARENT_SCOPED). */
const history = (table: string, key: string, parent: string) =>
  store(table, PURGE_PARENT_SCOPED[table], 'created_at', table, [`${table}.${key}`, `${parent}.id`, `${parent}.organization_id`]);

export const HELD_RECORD_STORES: readonly HeldRecordStore[] = Object.freeze([
  own('account_canon_resolution_log'),
  own('account_events'),
  own('ana_outcome_log'),
  own('bundle_execution_receipts', 'executed_at'),
  own('cer_approvals'),
  own('data_lineage_records'),
  own('document_audit_trail'),
  store('electronic_signatures', `${OWN} AND COALESCE(signed_target, '') NOT LIKE '${CUSTODY_TARGET_PREFIX}%'`, 'signed_at',
    'electronic_signatures', ['electronic_signatures.organization_id', 'electronic_signatures.signed_target']),
  own('evidence_chain_records'),
  own('gate_approvals'),
  own('governance_boundary_transitions'),
  own('immutable_report_records'),
  history('ivdr_cdx_status_history', 'workflow_id', 'ivdr_cdx_workflows'),
  history('ivdr_evidence_result_history', 'evidence_id', 'ivdr_clinical_evidence'),
  history('ivdr_validation_parameter_history', 'validation_id', 'ivdr_analytical_validations'),
  own('reg_questions'),
  own('review_routes'),
  store('unified_tasks', `${OWN} AND review_route_id IS NOT NULL`, 'created_at', 'review_route_tasks',
    ['unified_tasks.organization_id', 'unified_tasks.review_route_id']),
  own('rule_execution_log'),
  own('compliance_review_records'),
  own('indemnification_attestations'),
  own('report_atom_provenance'),
  own('report_seal_events'),
  own('reg_responses'),
  own('qc_deviations'),
]);

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/**
 * The stores this database has: every table and column each one reads. Asked
 * once, from the catalog, and never by letting a statement fail: inside the
 * purge's transaction a failed statement would abort it. A store this
 * deployment lacks holds nothing.
 */
async function presentStores(db: Queryable): Promise<HeldRecordStore[]> {
  const needs = [...new Set(HELD_RECORD_STORES.flatMap((s) => s.needs))];
  const { rows } = await db.query(
    `SELECT n FROM unnest($1::text[]) AS t(n)
      WHERE EXISTS (SELECT 1 FROM pg_attribute a
                     WHERE a.attrelid = to_regclass('public.' || split_part(t.n, '.', 1))
                       AND a.attname = split_part(t.n, '.', 2) AND a.attnum > 0 AND NOT a.attisdropped)`,
    [needs],
  );
  const present = new Set(rows.map((r) => String(r.n)));
  return HELD_RECORD_STORES.filter((s) => s.needs.every((n) => present.has(n)));
}

/** How many held records the tenant has in each store present here, by key. */
export async function countHeldRecords(db: Queryable, organizationId: number): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const s of await presentStores(db)) {
    // The store's fixed subquery, from the frozen list above, never from input.
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM (${s.rows}) h`, [organizationId]);
    counts[s.key] = Number(rows[0]?.n ?? 0);
  }
  return counts;
}

export interface RecordsWithinRetention {
  table: string;
  count: number;
  /** Every record, by id: integer ids as runs [first, last] or single ids, uuids as themselves. */
  ids: Array<number | [number, number] | string>;
  /** The first and last day a listed record's retention period ends (YYYY-MM-DD). */
  retainUntil: { first: string | null; last: string | null };
  /** Records with no date, listed because their period cannot be shown to have ended. */
  undated: number;
}

/** Integer ids as runs, so a long contiguous history is listed in full without a long list. */
export function idRuns(ids: readonly string[]): RecordsWithinRetention['ids'] {
  if (!ids.every((id) => /^\d+$/.test(id))) return [...ids];
  const out: Array<number | [number, number]> = [];
  for (const n of ids.map(Number)) {
    const last = out[out.length - 1];
    if (Array.isArray(last) && last[1] + 1 === n) last[1] = n;
    else if (typeof last === 'number' && last + 1 === n) out[out.length - 1] = [last, n];
    else out.push(n);
  }
  return out;
}

/**
 * The tenant's held records whose retention period, counted from when each was
 * made, has not ended: by store, every one by id. A record with no date is
 * listed (its period cannot be shown to have ended).
 */
export async function heldRecordsWithinRetention(db: Queryable, organizationId: number, years: number): Promise<RecordsWithinRetention[]> {
  const out: RecordsWithinRetention[] = [];
  for (const s of await presentStores(db)) {
    // The store's fixed subquery, from the frozen list above, never from input. A record with no
    // date has no end of period (`until` is NULL), so it is listed.
    const { rows } = await db.query(
      `SELECT count(*)::int AS n, array_agg(id::text ORDER BY id) AS ids,
              min(until)::date::text AS first_until, max(until)::date::text AS last_until,
              count(*) FILTER (WHERE until IS NULL)::int AS undated
         FROM (SELECT id, recorded_at + make_interval(years => $2::int) AS until FROM (${s.rows}) r) h
        WHERE until IS NULL OR until > now()`,
      [organizationId, years],
    );
    const r = rows[0];
    if (!r || Number(r.n) === 0) continue;
    out.push({
      table: s.key,
      count: Number(r.n),
      ids: idRuns((r.ids ?? []).map(String)),
      retainUntil: { first: r.first_until ?? null, last: r.last_until ?? null },
      undated: Number(r.undated ?? 0),
    });
  }
  return out;
}
