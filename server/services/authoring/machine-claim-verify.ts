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
import { sha256Hex, type Queryable, type TurnOutcome, type TurnRecordBody } from '../ana/turn-record';
import { servedModelsOf, type ServedModel } from '../ana/turn-record-models';
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
  | 'model_not_approved'
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
  /** The claim's position in the claims checked. */
  index: number;
  /** The record's author: ANA_MACHINE_AUTHOR_ID, whatever the claim said. */
  authorId: string;
  text: string;
  turnRecordId: string;
  /**
   * The one model that served the turn; null when the record names none, or
   * several (servedBy names them). It was the first call's model, whichever
   * served the rest (AnA reasoning round 10).
   */
  model: string | null;
  /** Every model that served the turn (turn-record-models.ts servedModelsOf). */
  servedBy: ServedModel[];
  /** How the turn ended, as its record says. */
  outcome: TurnOutcome;
  /** The person who asked AnA, from the record. Not necessarily the saver. */
  turnActorUserId: number | null;
  recordSha256: string;
}

export interface UnverifiedMachineClaim {
  /** The claim's position in the claims checked. */
  index: number;
  authorId: string;
  text: string;
  /** The id as claimed, bounded; null when none was sent. */
  turnRecordId: string | null;
  reason: MachineClaimReason;
  /**
   * The models the record names — present only for `model_not_approved`,
   * which is the one reason that HAS an intact record behind it. A door's row
   * has to say which model it refused, not merely that it refused one, and
   * re-reading the record to find out would load every text it references a
   * second time.
   */
  servedBy?: ServedModel[];
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
  servedBy: ServedModel[];
}

/** AnA's own words in a verified record: the answer, streamed and stored, and each draft. */
function outputsOf(stored: StoredTurnRecord): { outputs: string[]; servedBy: ServedModel[] } {
  const body = JSON.parse(stored.recordText) as TurnRecordBody;
  const refs = [body.answer?.streamed, body.answer?.stored, ...(body.outputs?.drafts ?? []).map((d) => d.content)];
  const outputs: string[] = [];
  for (const ref of refs) {
    const text = ref ? stored.texts.get(ref.sha256) : undefined;
    if (typeof text === 'string') outputs.push(comparableText(text), comparableText(text, { markdown: true }));
  }
  return { outputs, servedBy: servedModelsOf(body.model) };
}

async function readRecord(q: Queryable, orgId: number, id: string): Promise<ReadRecord> {
  const stored = await loadTurnRecord(q, orgId, id);
  if (!stored) return { stored: null, intact: false, outputs: [], servedBy: [] };
  if (!verifyStoredTurnRecord(stored).ok) return { stored, intact: false, outputs: [], servedBy: [] };
  return { stored, intact: true, ...outputsOf(stored) };
}

/** What a record says served the turn, read without checking any words. */
export type TurnServedModelsRead =
  | { ok: true; turnRecordId: string; recordSha256: string; outcome: TurnOutcome; servedBy: ServedModel[] }
  | { ok: false; reason: Extract<MachineClaimReason, 'turn_record_not_found' | 'record_not_intact'> };

/**
 * The models a turn record names, with no text to check against it.
 *
 * `verifyMachineText` answers "did THIS turn write THESE words", and three of
 * SEC-A-7's doors need only the first half of that: which models served the
 * turn, so RULE 2 can be applied to them. `POST /docs/from-draft` has no
 * quotable span to offer at all — the whole document is the model's prose — so
 * the text check is not merely skipped there, it does not apply.
 *
 * It shares `readRecord` with `verifyMachineText`, so "read a record, confirm
 * it is intact, and say what served it" has one implementation. A door that
 * also has text to check keeps calling `verifyMachineText`, which still does
 * both.
 *
 * The id is NOT validated here: a caller that has not checked its shape would
 * send a malformed one to a uuid column and raise 22P02 inside its own
 * transaction. `servedModelsForTurn` in authoring-record.ts is the checked
 * entry point, and is what doors should call.
 */
export async function turnServedModels(q: Queryable, orgId: number, turnRecordId: string): Promise<TurnServedModelsRead> {
  const read = await readRecord(q, orgId, turnRecordId);
  if (!read.stored) return { ok: false, reason: 'turn_record_not_found' };
  if (!read.intact) return { ok: false, reason: 'record_not_intact' };
  return {
    ok: true,
    turnRecordId: read.stored.id,
    recordSha256: read.stored.recordSha256,
    outcome: read.stored.outcome,
    servedBy: read.servedBy,
  };
}

export interface VerifyMachineTextOptions {
  /**
   * Whether a record that holds the words may vouch for them AT ALL — CLAUDE.md
   * RULE 2 at a governed-write door (round 15, SEC-A-7). Given `servedBy`, it
   * returns true to admit the record and false to refuse it, and a refused
   * claim comes back `model_not_approved`.
   *
   * It is a parameter of the ONE pass rather than a filter afterwards for two
   * reasons. The reason it reports: a caller filtering `verified` itself would
   * have to invent its own reason for each dropped claim, and the reason is
   * what the Part 11 row and the refusal sentence carry. And the COUNT: a
   * record that may not vouch for a claim must not vouch for
   * `occurrencesInRecords` either — two claims of the same sentence, one from
   * an admitted turn and one from a turn the rule refuses, would otherwise
   * raise the cap to two and let a lineage gate credit the sentence twice on
   * the word of one record. The closure is built here, so filtering afterwards
   * cannot fix that and a second pass would read every record twice.
   *
   * The count matters to a door that CARRIES ON after a refused claim. The
   * section save refuses the whole save instead, so only unverifiable claims
   * reach its gate — but that is that door's choice, not this contract's.
   *
   * Absent means every intact record that holds the words vouches for them,
   * which is what a door with no governed-write rule to apply wants.
   */
  mayVouch?: (servedBy: ServedModel[]) => boolean;
}

/**
 * Check each claim against the turn record it names, within one organization.
 * Every claim comes back exactly once, verified or with its reason.
 */
export async function verifyMachineText(
  q: Queryable,
  orgId: number,
  claims: MachineTextClaim[],
  opts: VerifyMachineTextOptions = {},
): Promise<MachineClaimVerdict> {
  const verdict: MachineClaimVerdict = { verified: [], unverified: [], occurrencesInRecords: () => 0 };
  const records = new Map<string, Promise<ReadRecord>>();
  const vouching = new Set<ReadRecord>();

  for (const [index, claim] of claims.entries()) {
    const raw = typeof claim.turnRecordId === 'string' ? claim.turnRecordId.trim() : '';
    const refuse = (reason: MachineClaimReason, servedBy?: ServedModel[]) =>
      verdict.unverified.push({
        index,
        authorId: claim.authorId,
        text: claim.text,
        turnRecordId: raw ? raw.slice(0, 64) : null,
        reason,
        ...(servedBy ? { servedBy } : {}),
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
    /* RULE 2, before the record vouches for anything: a turn served by a model
       the rule does not admit for regulatory drafting wrote words this person
       may still save — but not as MACHINE-AUTHORED governed content. Refused
       after the text check on purpose: a claim of words the record does not
       hold is a false claim, and answering it with the model's approval would
       imply the words were AnA's. */
    if (opts.mayVouch && !opts.mayVouch(rec.servedBy)) {
      refuse('model_not_approved', rec.servedBy);
      continue;
    }
    vouching.add(rec);
    verdict.verified.push({
      index,
      authorId: ANA_MACHINE_AUTHOR_ID,
      text: claim.text,
      turnRecordId: rec.stored.id,
      model: rec.servedBy.length === 1 ? rec.servedBy[0].model : null,
      servedBy: rec.servedBy,
      outcome: rec.stored.outcome,
      turnActorUserId: rec.stored.actorUserId,
      recordSha256: rec.stored.recordSha256,
    });
  }
  const outputs = [...vouching].map((rec) => rec.outputs);
  verdict.occurrencesInRecords = (needle) =>
    outputs.reduce((sum, texts) => sum + Math.max(0, ...texts.map((o) => occurrencesIn(o, needle))), 0);
  return verdict;
}
