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
import { hashPayload } from '../audit/chain.js';
import { verifyAuthoringTrailRow, type StoredTrailRow, type TrailRowVerdict } from './authoring-evidence';
import { MAX_TURN_RECORDS_PER_CHECK, verifyMachineText, type MachineClaimReason } from './machine-claim-verify';
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
  too_many_turns: `more AnA turns than one decision verifies (at most ${MAX_TURN_RECORDS_PER_CHECK})`,
};

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
