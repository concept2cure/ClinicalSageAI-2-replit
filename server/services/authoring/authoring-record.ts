/**
 * What an authoring record needs beyond the trail writer: the hash of a text,
 * and the AnA turn a suggestion came from, verified.
 *
 * AnA's drafts enter a document as tracked suggestions carrying the id of the
 * turn record that produced them (the insertion mark's `data-source-record`,
 * client/src/concept2cure/v2/editor/suggestions.ts). When a reviewer accepts
 * or rejects one, the decision record names that turn — so "who proposed this
 * text" is answered by the retained record of the turn itself
 * (server/services/ana/turn-record.ts), not by a display name the editing
 * client typed. The id arrives from the client, so it is looked up in this
 * tenant's ana_turn_records and recorded as verified only when it is there.
 *
 * 2026-10-05 (AnA reasoning round 10): "there" was not enough. A decision on
 * words the named turn never wrote ("From our turn." against a turn that
 * answered "Draft paragraph for 2.5.4.") was filed as verified, and AnA as its
 * verified proposer. The source is now verified by the canonical claim
 * verifier (machine-claim-verify.ts): the record verifies whole and holds the
 * words decided. A verified source names every model that served the turn,
 * with whether RULE 2 lets its text stand as governed content.
 *
 * @compliance 21 CFR Part 11 §11.10(e); EU Annex 11 §9.
 * @module server/services/authoring/authoring-record
 */

import crypto from 'crypto';

import { qualifyServedModels, type QualifiedServedModel } from '../ai-governance/approved-models';
import type { TurnOutcome } from '../ana/turn-record';
import { listTurnRecords } from '../ana/turn-record-verify';
import { hashPayload } from '../audit/chain.js';
import { verifyAuthoringTrailRow, type StoredTrailRow, type TrailRowVerdict } from './authoring-evidence';
import { MAX_TURN_RECORDS_PER_CHECK, turnServedModels, verifyMachineText, type MachineClaimReason } from './machine-claim-verify';
import { ANA_MACHINE_AUTHOR_ID } from './revision-ledger';

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export const textSha256 = (text: string): string => crypto.createHash('sha256').update(text).digest('hex');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TurnRecordSource =
  | {
      verified: true;
      turnRecordId: string;
      turnRecordSha256: string;
      outcome: string;
      /** Every model that served the turn, and whether RULE 2 lets its text stand. */
      servedBy: QualifiedServedModel[];
    }
  | { verified: false; claimed: string; why: string };

/** Why a named turn does not vouch for the words decided, in the record's words. */
const NOT_VOUCHED: Record<MachineClaimReason, string> = {
  no_turn_record_id: 'not a record id',
  malformed_turn_record_id: 'not a record id',
  turn_record_not_found: 'no such turn record in this organization',
  record_not_intact: 'the turn record does not verify',
  text_not_in_record: 'the turn record does not hold this text',
  /* Only reachable where a caller passes `mayVouch` (the section save's
     governed-write verdict). A decision resolved here passes none, so a
     decision's source is never refused for its model — it NAMES every model
     with RULE 2's verdict instead, which is the record a reviewer reads. */
  model_not_approved: 'the turn was served by a model that is not approved for regulatory drafting',
  too_many_turns: `more AnA turns than one decision verifies (at most ${MAX_TURN_RECORDS_PER_CHECK})`,
};

const STORE_ABSENT = {
  ok: false as const,
  reason: 'turn_record_not_found' as const,
  why: 'the turn record store is not provisioned',
};

/** Whether this deployment has the turn-record store at all. */
async function turnRecordStorePresent(executor: Queryable): Promise<boolean> {
  const present = await executor.query(`SELECT to_regclass('public.ana_turn_records') IS NOT NULL AS present`);
  return Boolean(present.rows[0]?.present);
}

/** What RULE 2 says of the models a turn record names, or why it could not be read. */
export type TurnServedModelsVerdict =
  | { ok: true; turnRecordId: string; turnRecordSha256: string; outcome: TurnOutcome; servedBy: QualifiedServedModel[] }
  | { ok: false; reason: MachineClaimReason; why: string };

/**
 * The models that served a turn, each with RULE 2's verdict — the checked
 * entry point the server doors call (AnA reasoning round 15, SEC-A-7).
 *
 * This is the MODEL half of the record check, separate from the text half on
 * purpose: `resolveTurnRecordSources` above answers "did this turn write these
 * decided words", which needs text, and `POST /docs/from-draft` has none to
 * offer — the whole document is the model's prose. So that door, the section
 * save's model verdict and the revert all need this and only this.
 *
 * Fail closed is the CALLER's job, and there are two cases to refuse, not one:
 * a model the rule does not admit, AND a record that names no model at all.
 * `servedBy.some(m => !m.qualified)` is false for an empty list, so a door
 * that asks only that admits a turn whose record names nothing. Require a
 * non-empty list too, as the client gate does (anaInsertGate.ts,
 * `served.length === 0`).
 *
 * The id's shape is checked here rather than at the store: the column is uuid,
 * so a malformed id would raise 22P02 inside the caller's transaction and
 * abort the write it is being checked for.
 */
export async function servedModelsForTurn(
  executor: Queryable,
  tenantId: number,
  turnRecordId: unknown,
): Promise<TurnServedModelsVerdict> {
  const raw = typeof turnRecordId === 'string' ? turnRecordId.trim() : '';
  if (!raw) return { ok: false, reason: 'no_turn_record_id', why: NOT_VOUCHED.no_turn_record_id };
  const id = raw.slice(0, 64);
  if (!UUID.test(id)) return { ok: false, reason: 'malformed_turn_record_id', why: NOT_VOUCHED.malformed_turn_record_id };
  /* Never throw into the caller's transaction for want of the store, for the
     reason `resolveTurnRecordSources` states: a failed statement aborts the
     transaction the write is being checked for. */
  if (!(await turnRecordStorePresent(executor))) return STORE_ABSENT;
  const read = await turnServedModels(executor, tenantId, id);
  if (!read.ok) return { ok: false, reason: read.reason, why: NOT_VOUCHED[read.reason] };
  return {
    ok: true,
    turnRecordId: read.turnRecordId,
    turnRecordSha256: read.recordSha256,
    outcome: read.outcome,
    servedBy: qualifyServedModels(read.servedBy),
  };
}

/**
 * The same verdict for a reference that may name a RECORD or the RUN that
 * served it (AnA reasoning round 15).
 *
 * Why both: `POST /docs/from-draft` has two callers and they name different
 * things. The browser sends the record id (`ConversationThread.tsx` sends
 * `m.turnRecord.id`), and the in-process AnA tool sends the RUN id — stream.ts
 * passes `turnId: runId` into the tool context (:2385, :2503, :2619), which
 * `authoring-draft-tool.ts` copies into `provenance.turnId`. Without the run
 * path every document the drafting TOOL creates would read 'unverified'.
 *
 * A run is tried only after the record lookup fails, and `run_id` is TEXT (not
 * uuid), so a reference that is not a record id is safe to try as one — no
 * 22P02. A run naming more than one record is refused rather than guessed at:
 * attributing a document's prose to the models of whichever record sorted
 * first would be a fact nobody checked.
 */
export async function servedModelsForTurnOrRun(
  executor: Queryable,
  tenantId: number,
  ref: unknown,
): Promise<TurnServedModelsVerdict> {
  const direct = await servedModelsForTurn(executor, tenantId, ref);
  if (direct.ok) return direct;
  const raw = typeof ref === 'string' ? ref.trim().slice(0, 200) : '';
  if (!raw) return direct;
  if (!(await turnRecordStorePresent(executor))) return STORE_ABSENT;
  const byRun = await listTurnRecords(executor, tenantId, { runId: raw, limit: 2 });
  if (byRun.length === 0) return direct;
  if (byRun.length > 1) {
    return { ok: false, reason: 'too_many_turns', why: 'more than one turn record names this run' };
  }
  return servedModelsForTurn(executor, tenantId, byRun[0].id);
}

/**
 * The AnA turn record each decided change names, verified against the words
 * decided: one result per change, in order, null where a change names none.
 *
 * One call per decision, so each record is read once and one request reads at
 * most MAX_TURN_RECORDS_PER_CHECK of them (loadTurnRecord reads every text a
 * record references). Never throws inside the caller's transaction for want of
 * the store: its presence is checked first, because a failed statement would
 * abort the transaction the decision is being written in.
 */
export async function resolveTurnRecordSources(
  executor: Queryable,
  tenantId: number,
  changes: ReadonlyArray<{ claimed: unknown; text: string | null }>,
): Promise<Array<TurnRecordSource | null>> {
  const out: Array<TurnRecordSource | null> = changes.map(() => null);
  const named: Array<{ at: number; id: string; text: string }> = [];
  changes.forEach((c, at) => {
    if (typeof c.claimed !== 'string' || !c.claimed) return;
    const id = c.claimed.slice(0, 64);
    if (!UUID.test(id)) out[at] = { verified: false, claimed: id, why: 'not a record id' };
    else if (!c.text) out[at] = { verified: false, claimed: id, why: 'no text was decided' };
    else named.push({ at, id, text: c.text });
  });
  if (named.length === 0) return out;
  const present = await executor.query(`SELECT to_regclass('public.ana_turn_records') IS NOT NULL AS present`);
  if (!present.rows[0]?.present) {
    for (const n of named) out[n.at] = { verified: false, claimed: n.id, why: 'the turn record store is not provisioned' };
    return out;
  }
  const verdict = await verifyMachineText(
    executor,
    tenantId,
    named.map((n) => ({ authorId: ANA_MACHINE_AUTHOR_ID, text: n.text, turnRecordId: n.id })),
  );
  for (const v of verdict.verified) {
    out[named[v.index].at] = {
      verified: true,
      turnRecordId: v.turnRecordId,
      turnRecordSha256: v.recordSha256,
      outcome: v.outcome,
      servedBy: qualifyServedModels(v.servedBy),
    };
  }
  for (const u of verdict.unverified) {
    const n = named[u.index];
    out[n.at] = { verified: false, claimed: n.id, why: NOT_VOUCHED[u.reason] };
  }
  return out;
}

// ── Reading a document's authoring record back, verified ─────────────────────

export interface AuthoringTrailEvent extends StoredTrailRow {
  doc_id: string | null;
  section_id: string | null;
  actor_email: string;
  actor_id: string | null;
  actor_role: string | null;
  created_at: string;
}

export interface AuthoringChainEntry {
  auditLogId: string;
  chainSeq: string | null;
  sha256Chain: string | null;
  payloadHash: string | null;
  occurredAt: string;
  details: Record<string, unknown>;
}

export interface AuthoringEventVerdict extends TrailRowVerdict {
  /** The chain entry's details still hash to the payload hash its link was computed over. */
  chainPayloadIntact: boolean | null;
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

/**
 * A document's trail rows, each with its chained entry and a verdict computed
 * now from the row as stored. Rows written before the chain carried a trail id
 * (2026-09-26), or on the standalone path that writes an index row instead,
 * verify as `chained: false` — unknown, never intact.
 */
export async function loadAuthoringRecord(
  executor: Queryable,
  tenantId: number,
  docId: string,
  opts: { limit?: number; order?: 'asc' | 'desc' } = {},
): Promise<{
  events: AuthoringTrailEvent[];
  chain: Map<string, AuthoringChainEntry>;
  verdicts: Map<string, AuthoringEventVerdict>;
}> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 1000), 1), 10000);
  const order = opts.order === 'asc' ? 'ASC' : 'DESC';
  const { rows } = await executor.query(
    `SELECT id, doc_id, section_id, operation_type, actor_email, actor_id, actor_role,
            before_content, after_content, content_hash_before, content_hash_after,
            change_reason, metadata, created_at
       FROM authoring_audit_trail
      WHERE doc_id = $1 AND tenant_id = $2
      ORDER BY created_at ${order}
      LIMIT $3`,
    [docId, tenantId, limit],
  );
  const events: AuthoringTrailEvent[] = rows.map((r) => ({ ...r, created_at: iso(r.created_at) }));
  const resourceIds = [...new Set([docId, ...events.map((e) => e.section_id).filter((x): x is string => !!x)])];
  const chain = new Map<string, AuthoringChainEntry>();
  if (events.length > 0) {
    // chain_seq read through to_jsonb: the column comes from
    // migrations/20260921_audit_logs_chain_seq.sql, and a store without it
    // (a legacy or test database) must still be readable — it only locates
    // the row in the chain, it verifies nothing.
    const chained = await executor.query(
      `SELECT a.id, to_jsonb(a) ->> 'chain_seq' AS chain_seq, a.sha256_chain, a.payload_hash,
              a.occurred_at, a.new_values
         FROM audit_logs a
        WHERE tenant_id = $1
          AND table_name IN ('authoring_section', 'authoring_document')
          AND record_id = ANY($2::text[])
          AND action LIKE 'authoring.section.%'`,
      [tenantId, resourceIds],
    );
    for (const c of chained.rows) {
      const entry = chainEntryOf(c);
      if (entry) chain.set(entry.trailId, entry.entry);
    }
  }
  const verdicts = new Map<string, AuthoringEventVerdict>();
  for (const e of events) verdicts.set(e.id, verdictOf(e, chain.get(e.id) ?? null));
  return { events, chain, verdicts };
}

/** One chained audit_logs row, keyed by the trail row it names; null when it names none. */
function chainEntryOf(c: Record<string, any>): { trailId: string; entry: AuthoringChainEntry } | null {
  const details = typeof c.new_values === 'string' ? JSON.parse(c.new_values) : c.new_values;
  const trailId = details?.trailId;
  if (typeof trailId !== 'string') return null;
  return {
    trailId,
    entry: {
      auditLogId: String(c.id),
      chainSeq: c.chain_seq == null ? null : String(c.chain_seq),
      sha256Chain: c.sha256_chain ?? null,
      payloadHash: c.payload_hash ?? null,
      occurredAt: iso(c.occurred_at),
      details,
    },
  };
}

/** A trail row's verdict against its chain entry, including the entry's own payload hash. */
function verdictOf(e: AuthoringTrailEvent, entry: AuthoringChainEntry | null): AuthoringEventVerdict {
  const v = verifyAuthoringTrailRow(e, entry?.details ?? null);
  const chainPayloadIntact = entry ? hashPayload(entry.details) === entry.payloadHash : null;
  return {
    ...v,
    chainPayloadIntact,
    intact: v.intact === null ? null : v.intact && chainPayloadIntact !== false,
    mismatches: chainPayloadIntact === false ? [...v.mismatches, 'chain_payload'] : v.mismatches,
  };
}
