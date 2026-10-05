/**
 * Machine-text claims, checked against what AnA actually produced.
 *
 * ── The defect this closes ────────────────────────────────────────────────────
 * A save that accepts AnA's text tells the server which words were AnA's (the
 * `acceptedMachineText` of revision-ledger.ts), because accepting a tracked
 * suggestion erases the mark that said so. The server checked the author id
 * against its vocabulary and nothing else, and the lineage recorded every such
 * clause as `accepted_machine_draft`. So a member could record their own words
 * as AnA's, or AnA's words under a model that never wrote them (periodic review
 * 2026-09-28, editor family: SEC-A-7 / SEC-B-7 on the authoring save, and the
 * same door on the eCTD batch-draft accept).
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * A claim is believed only when the server's own record holds the words. The
 * record is AnA's turn record (services/ana/turn-record.ts): immutable,
 * tenant-scoped and hash-checked. A claim names the record by the id the
 * server issued, and it is verified when:
 *
 *   1. the record exists in the caller's organization;
 *   2. the record verifies whole (verifyStoredTurnRecord: its hash, its chain
 *      entry and every text it references);
 *   3. the claimed text is inside something AnA produced in that turn: the
 *      answer as streamed, the answer as stored, or one of its drafts. Both
 *      are compared in the lineage's own form (comparableText in
 *      clinical-regulatory-evidence/machine-attribution.ts), so the two cannot
 *      drift. Each record text is read two ways: as written, for a claim sent
 *      as AnA wrote it (the batch card sends its draft unchanged), and as
 *      markdown shows it (paired emphasis, list markers and thematic breaks
 *      dropped, `\|` and `\*` read as `|` and `*`), for a claim taken from the
 *      editor. Reading the record only as markdown refused an honest, unedited
 *      draft holding `**`, a `*` list or `\|` (periodic review 2026-09-28,
 *      editor family, the batch-draft accept, round 3). Dropping every `*`
 *      verified "510 mg/kg" against a record's "5*10 mg/kg", a dose no reader
 *      of the record is shown (round 4, D8): a lone `*` stays. The claim is
 *      read only as written, so an asterisk the record lacks in both readings
 *      fails it.
 *
 * A verified claim carries the author, the model and the person who asked from
 * the RECORD: an AnA turn record's author is AnA. The author used to be the
 * request's, so "constructor" verified and named the machine (round 4, AUTH).
 * Nothing about a claim is taken from the request but the words and the id.
 *
 * The verdict also says how many times the records that verified a claim hold
 * a text (occurrencesInRecords). The same claim sent three times verified
 * three times, and each credited a repeat of a sentence the record holds once
 * (round 4, DUP); the lineage now credits no more than the records hold.
 *
 * ── What an unverified claim is ──────────────────────────────────────────────
 * Not refused and not dropped: the caller records the words as the saver's own
 * and discloses the claim with its reason. Refusing would block honest saves
 * (turns from before the record existed, a turn whose record was not written),
 * and could not close the other direction anyway: AnA's text pasted without a
 * mark is always possible. So "the saver's own" means "saved and asserted by
 * this person", not "no AI involvement".
 *
 * Reads only. The rows it reads are append-only, so it may run before the
 * caller's transaction opens.
 *
 * @module server/services/authoring/machine-claim-verify
 */

import { isUuid } from '../../middleware/uuidParam';
import { sha256Hex, type Queryable, type TurnRecordBody } from '../ana/turn-record';
import { loadTurnRecord, verifyStoredTurnRecord, type StoredTurnRecord } from '../ana/turn-record-verify';
import { comparableText, occurrencesIn } from '../clinical-regulatory-evidence/machine-attribution';
import { ANA_MACHINE_AUTHOR_ID } from './revision-ledger';

/** Why a claim was not believed. */
export type MachineClaimReason =
  | 'no_turn_record_id'
  | 'malformed_turn_record_id'
  | 'turn_record_not_found'
  | 'record_not_intact'
  | 'text_not_in_record'
  | 'too_many_turns';

/** One claim that `text` was written by a machine author in turn `turnRecordId`. */
export interface MachineTextClaim {
  /** A MACHINE_AUTHOR_IDS key, already checked at the request boundary. */
  authorId: string;
  text: string;
  /** The turn record id the server issued for the turn. Unchecked input. */
  turnRecordId?: unknown;
}

export interface VerifiedMachineClaim {
  /** The record's author: ANA_MACHINE_AUTHOR_ID, whatever the claim said. */
  authorId: string;
  text: string;
  turnRecordId: string;
  /** The model the record names for the turn; null when it names none. */
  model: string | null;
  /** The person who asked AnA, from the record. Not necessarily the saver. */
  turnActorUserId: number | null;
  recordSha256: string;
}

export interface UnverifiedMachineClaim {
  authorId: string;
  text: string;
  /** The id as claimed, bounded; null when none was sent. */
  turnRecordId: string | null;
  reason: MachineClaimReason;
  textSha256: string;
  chars: number;
}

export interface MachineClaimVerdict {
  verified: VerifiedMachineClaim[];
  unverified: UnverifiedMachineClaim[];
  /**
   * How many times the records that verified a claim hold `needle`, a text in
   * comparableText's form: per record, the most any one text it holds does
   * (the answer streamed and stored, or a draft as written and as markdown, are
   * one text read two ways), summed over the records. Zero when none verified.
   */
  occurrencesInRecords: (needle: string) => number;
}

/**
 * Distinct records one check will read. loadTurnRecord reads every text a
 * record references, model inputs and tool results included, so the number of
 * records a single request can make the server read is bounded.
 */
export const MAX_TURN_RECORDS_PER_CHECK = 8;

interface ReadRecord {
  stored: StoredTurnRecord | null;
  intact: boolean;
  /** What AnA produced in the turn, in comparableText's form: each text as
   *  written and read as markdown. */
  outputs: string[];
  model: string | null;
}

/** AnA's own words in a verified record: the answer, streamed and stored, and each draft. */
function outputsOf(stored: StoredTurnRecord): { outputs: string[]; model: string | null } {
  const body = JSON.parse(stored.recordText) as TurnRecordBody;
  const refs = [body.answer?.streamed, body.answer?.stored, ...(body.outputs?.drafts ?? []).map((d) => d.content)];
  const outputs: string[] = [];
  for (const ref of refs) {
    const text = ref ? stored.texts.get(ref.sha256) : undefined;
    if (typeof text === 'string') outputs.push(comparableText(text), comparableText(text, { markdown: true }));
  }
  const model = typeof body.model?.model === 'string' && body.model.model ? body.model.model : null;
  return { outputs, model };
}

async function readRecord(q: Queryable, orgId: number, id: string): Promise<ReadRecord> {
  const stored = await loadTurnRecord(q, orgId, id);
  if (!stored) return { stored: null, intact: false, outputs: [], model: null };
  if (!verifyStoredTurnRecord(stored).ok) return { stored, intact: false, outputs: [], model: null };
  return { stored, intact: true, ...outputsOf(stored) };
}

/**
 * Check each claim against the turn record it names, within one organization.
 * Every claim comes back exactly once, verified or with its reason.
 */
export async function verifyMachineText(
  q: Queryable,
  orgId: number,
  claims: MachineTextClaim[],
): Promise<MachineClaimVerdict> {
  const verdict: MachineClaimVerdict = { verified: [], unverified: [], occurrencesInRecords: () => 0 };
  const records = new Map<string, Promise<ReadRecord>>();
  const vouching = new Set<ReadRecord>();

  for (const claim of claims) {
    const raw = typeof claim.turnRecordId === 'string' ? claim.turnRecordId.trim() : '';
    const refuse = (reason: MachineClaimReason) =>
      verdict.unverified.push({
        authorId: claim.authorId,
        text: claim.text,
        turnRecordId: raw ? raw.slice(0, 64) : null,
        reason,
        textSha256: sha256Hex(claim.text),
        chars: claim.text.length,
      });

    if (!raw) {
      refuse('no_turn_record_id');
      continue;
    }
    // The column is uuid: a malformed id would raise 22P02 and fail the save.
    if (!isUuid(raw)) {
      refuse('malformed_turn_record_id');
      continue;
    }
    const id = raw.toLowerCase();
    let pending = records.get(id);
    if (!pending) {
      if (records.size >= MAX_TURN_RECORDS_PER_CHECK) {
        refuse('too_many_turns');
        continue;
      }
      pending = readRecord(q, orgId, id);
      records.set(id, pending);
    }
    const rec = await pending;
    if (!rec.stored) {
      refuse('turn_record_not_found');
      continue;
    }
    if (!rec.intact) {
      refuse('record_not_intact');
      continue;
    }
    // The claim must be inside what AnA wrote. Never the other way round: a
    // claim that merely contains a recorded draft carries the rest in with it.
    const needle = comparableText(claim.text);
    if (!needle || !rec.outputs.some((o) => o.includes(needle))) {
      refuse('text_not_in_record');
      continue;
    }
    vouching.add(rec);
    verdict.verified.push({
      authorId: ANA_MACHINE_AUTHOR_ID,
      text: claim.text,
      turnRecordId: rec.stored.id,
      model: rec.model,
      turnActorUserId: rec.stored.actorUserId,
      recordSha256: rec.stored.recordSha256,
    });
  }
  const outputs = [...vouching].map((rec) => rec.outputs);
  verdict.occurrencesInRecords = (needle) =>
    outputs.reduce((sum, texts) => sum + Math.max(0, ...texts.map((o) => occurrencesIn(o, needle))), 0);
  return verdict;
}
