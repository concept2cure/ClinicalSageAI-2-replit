/**
 * One verdict on the machine-authorship claims a governed save carries
 * (AnA reasoning round 15, SEC-A-7 door 1).
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * An unadmitted model's text never stands as governed content — not as the
 * model's, and not as a person's. A claim nothing can check is different: its
 * words become the saver's own assertion, disclosed with the reason.
 *
 * That distinction is why this module exists. A section save carries words the person
 * typed, pasted, and accepted from AnA, all mixed; the claim it sends says
 * which of them were AnA's. Three things can be wrong with such a claim:
 *
 *   1. no record vouches for it — no id, an id naming nothing, a record that
 *      does not verify, or words the record does not hold;
 *   2. a record vouches for it, but the turn was served by a model CLAUDE.md
 *      RULE 2 does not admit for regulatory drafting;
 *   3. a record vouches for it and names NO model at all, which is not
 *      approval: `[].some(unqualified)` is false, so a door asking only "is
 *      any model unqualified?" admits a record that names nothing.
 *
 * Case 1 is UNVERIFIABLE and the clause is still saved, recorded as the
 * saver's own assertion, with the claim and its reason on the Part 11 row and
 * on the response. Cases 2 and 3 are VERIFIED and refused: the save is
 * rejected whole, nothing is written, and the person is told which model.
 *
 * ── Why a verified claim RULE 2 refuses stops the save ──────────────────────
 * Because the server has PROOF. For an unverified claim it knows only that it
 * cannot tell, and `machine-claim-verify.ts` is explicit that such a claim is
 * neither refused nor dropped: the words become the saver's own, disclosed,
 * because refusing would block honest saves and could not close the paste
 * route anyway. Both of those reasons are reasons about NOT KNOWING.
 *
 * For a verified claim whose model the rule does not admit, three things have
 * been checked: the record verifies whole, the words are inside what AnA
 * produced, and the serving models are named and unadmitted. Writing that
 * clause as a named person's own assertion would be a positive false statement
 * in a §11.10(e) lineage span AND in the `c2c_document_sections` copy that IS
 * the filing — chosen by the server, with the proof in hand. "Fail closed,
 * never fabricate" (CLAUDE.md working agreement) decides it: the save is
 * refused, nothing is written, and the person is told which model and why.
 *
 * This is also what the rest of the platform already does with the same fact.
 * The governed-write gate refuses a tool that would store an unadmitted
 * model's text (ana/AnaToolExecutor.ts `preHandlerRefusal`,
 * MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE); the gateway refuses high-risk
 * drafting to it; and the two client doors refuse the insert outright
 * (editor/anaInsertGate.ts). A save door that accepted it would be the one
 * place in the product where that text lands in the filing.
 *
 * It bites hardest in production, which is the point rather than an
 * objection: every entry in the approved-model registry is `pq: 'pending'`,
 * and RULE 2 admits only a PASSED performance qualification in production, so
 * in production NO model may author governed content yet. That is exactly what
 * `docs/LAUNCH_DEFINITION_OF_DONE.md` row D4 says and what
 * `startup/ana-readiness-state.ts` already reports to an operator. Had this
 * door credited those claims instead, the filing would have carried AnA's
 * prose attributed wholly to humans, platform-wide.
 *
 * A refusal here is only honest because the attribution SURVIVES it: the
 * editor's claim store is cleared by a save that landed, not by one that was
 * sent (RichSectionEditor.tsx), and the accept itself already filed a verified
 * decision record naming the turn and its models
 * (authoring.router.ts tracked-change-decisions -> resolveTurnRecordSources).
 * Without the first of those, a refusal would destroy the claim and the retry
 * would record the same words with no attribution at all — manufacturing the
 * laundering it exists to prevent.
 *
 * ── Both channels, one verdict ───────────────────────────────────────────────
 * The save sends `acceptedMachineText` (which words) and `acceptedAuthors`
 * (who contributed). The second decided the revision's origin, its
 * `inputs.contributors` and the filing's `draft_source` — with nothing checked
 * and no words to check. {@link contributorsOf} derives it from this verdict
 * instead, so a contributor is named only where a record vouched for at least
 * one of its claims. `settleAcceptedContributions` already guarantees the
 * editor sends no author without its text, so the two channels agree for every
 * current client; a caller that sends an author alone gets no attribution,
 * which is the honest answer to a claim nothing can check.
 *
 * @compliance 21 CFR Part 11 §11.10(a),(e); CLAUDE.md RULE 2.
 * @module server/services/authoring/governed-machine-claims
 */

import { qualifyServedModels, type QualifiedServedModel } from '../ai-governance/approved-models';
import type { ServedModel } from '../ana/turn-record-models';
import { MAX_TURN_RECORDS_PER_CHECK, verifyMachineText, type MachineClaimReason, type VerifiedMachineClaim } from './machine-claim-verify';
import { ANA_MACHINE_AUTHOR_ID, MACHINE_AUTHOR_IDS, type AcceptedMachineTextEntry, type MachineContributor } from './revision-ledger';
import { comparableText, MIN_MACHINE_CLAUSE_CHARS } from '../clinical-regulatory-evidence/machine-attribution';
import { clauseSpans } from '../clinical-regulatory-evidence/lineage-gate';
import { assertLineageCoversContent, assertLineageHashesMatchContent, listLiveMachineSpans } from '../clinical-regulatory-evidence/span-lineage.service';
import type { WorkflowGovernanceInput } from './workflow-import-governance';
import { loadTurnRecord, verifyStoredTurnRecord } from '../ana/turn-record-verify';
import type { TurnRecordBody } from '../ana/turn-record';
import { qualifiedPinRefusal } from '../ai-gateway/model-governance';

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** Why a claim was not credited, in the words the record keeps. */
const NOT_CREDITED: Record<MachineClaimReason, string> = {
  no_turn_record_id: 'the claim named no turn record',
  malformed_turn_record_id: 'the claim named no turn record',
  turn_record_not_found: 'no such turn record in this organization',
  record_not_intact: 'the turn record does not verify',
  text_not_in_record: 'the turn record does not hold this text',
  model_not_approved: 'the turn was served by a model that is not approved for regulatory drafting',
  /* The number, because it is the one reason the saver can act on: accepted
     text from more than this many distinct AnA turns in one save loses its
     attribution on the extras, and saving more often keeps it. The bound is
     on RECORD READS — each is a full load of every text a record references —
     not on how many insertions a save may carry (32). */
  too_many_turns: `more AnA turns than one save verifies (at most ${MAX_TURN_RECORDS_PER_CHECK})`,
};

/** Whether this deployment has the turn-record store at all. */
async function turnRecordStorePresent(executor: Queryable): Promise<boolean> {
  const present = await executor.query(`SELECT to_regclass('public.ana_turn_records') IS NOT NULL AS present`);
  return Boolean(present.rows[0]?.present);
}

/** A claim a record vouched for, under models RULE 2 admits. */
export interface CreditedMachineClaim {
  /** The RECORD's author, never the claim's. */
  authorId: string;
  text: string;
  turnRecordId: string;
  servedBy: QualifiedServedModel[];
}

/** A claim that was not credited, and why. The words are in the document. */
export interface RefusedMachineClaim {
  /** The id the claim sent, which is the only thing about it we believed. */
  authorId: string;
  turnRecordId: string | null;
  why: string;
  /**
   * The models the record names, when a record was read and RULE 2 refused
   * them — so the row says WHICH model, not merely that one was refused. Null
   * when no record vouched for the claim at all, because then there is no
   * model to name.
   */
  servedBy: QualifiedServedModel[] | null;
  chars: number;
}

export interface GovernedClaimVerdict {
  credited: CreditedMachineClaim[];
  refused: RefusedMachineClaim[];
  /**
   * How many times the records that CREDITED a claim hold a clause, for the
   * lineage gate's duplicate bound. A record RULE 2 refused contributes
   * nothing to it (see `mayVouch` in machine-claim-verify.ts).
   */
  recordOccurrences: (needle: string) => number;
}

/**
 * RULE 2 applied to the models a turn record names: every one admitted, and at
 * least one named.
 *
 * The second half is not redundant. `[].some(m => !m.qualified)` is false, so
 * a rule written only as "no unqualified model" admits a record that names no
 * model at all — the trap the primitive's own tests pin
 * (turn-served-models.pglite.test.ts) and the client gate already avoids
 * (anaInsertGate.ts, `served.length === 0`).
 */
export function recordMayVouch(servedBy: ReadonlyArray<ServedModel>): boolean {
  const qualified = qualifyServedModels(servedBy);
  /* No separate "and it names a model" test per entry: `approvedEntryFor`
     matches on provider AND model, so an entry with no model name has no
     registry entry and `qualified` is already false for it. A second check
     there would be one that can never fail, which is worse than none — it
     reads as a guard and tests nothing. The LIST being non-empty is a
     different fact and does need its own test, above. */
  return qualified.length > 0 && qualified.every((m) => m.qualified);
}

/** Scientific numbers/operators stay literal while formatting cannot discharge known generated prose. */
export function machineQualificationText(content: string): string {
  return comparableText(content).replace(/[.,;:!?](?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
}
type RetainedMachineGenesisRow = Record<string, any>;
function originalMachineTextRemains(original: string[], sections: WorkflowGovernanceInput['sections']): boolean {
  const current = sections.map(section => machineQualificationText(section.content ?? ''));
  return original.some(content => clauseSpans(content).some(clause => {
    const text = machineQualificationText(clause.text);
    return text.length >= MIN_MACHINE_CLAUSE_CHARS && current.some(saved => saved.includes(text));
  }) || (machineQualificationText(content).length > 0 && current.includes(machineQualificationText(content))));
}
function currentHumanEditRecorded(rows: RetainedMachineGenesisRow[], section: WorkflowGovernanceInput['sections'][number]): boolean {
  return rows.some(row => row.audit_id && String(row.section_id) === section.id && ['CREATE', 'UPDATE'].includes(row.operation_type)
    && row.metadata?.provenance?.source !== 'ana' && row.after_content === (section.content ?? ''));
}
async function currentCallDelivery(q: Queryable, input: WorkflowGovernanceInput, actorId: number,
  projectId: number, call: TurnRecordBody['model']['calls'][number]): Promise<boolean> {
  if (!call || typeof call.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(call.requestId)) return false;
  const result = await q.query(`SELECT provider,model,resolved_model,metadata->'qualifiedModelPin' AS qualified_pin
    FROM ai.gateway_audit_log WHERE request_id=$1::uuid AND organization_id=$2::text AND user_id=$3::text
      AND project_id=$4::text AND success=true AND cached=false AND deterministic=false`,
  [call.requestId, String(input.organizationId), String(actorId), String(projectId)]);
  if (result.rows.length !== 1) return false;
  const row = result.rows[0], pin = row.qualified_pin;
  return Boolean(pin && row.provider === call.provider && row.resolved_model === call.model && row.model === pin.pinnedVersion
    && row.provider === pin.provider && row.resolved_model === pin.pinnedVersion
    && !qualifiedPinRefusal({ qualifiedModelPin: pin, taskType: 'document_drafting', riskTier: 'high' }));
}
/** A legacy model string or a call without its actual gateway receipt cannot qualify release. */
export async function retainedTurnDeliveryQualified(q: Queryable, input: WorkflowGovernanceInput, claim: VerifiedMachineClaim): Promise<boolean> {
  const stored = await loadTurnRecord(q, input.organizationId, claim.turnRecordId);
  if (!stored || stored.recordSha256 !== claim.recordSha256 || !verifyStoredTurnRecord(stored).ok) return false;
  const body = JSON.parse(stored.recordText) as TurnRecordBody, calls = body.model?.calls;
  if (!Array.isArray(calls) || !calls.length || !Number.isSafeInteger(body.turn.actorUserId)) return false;
  if (calls.some(call => !call || typeof call.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(call.requestId))) return false;
  const project = await q.query('SELECT id FROM projects WHERE organization_id=$1 AND regulatory_program_id=$2',
    [input.organizationId, input.doc.client_program_id]);
  if (project.rows.length !== 1 || ![String(project.rows[0].id), String(input.doc.client_program_id)].includes(String(body.turn.projectId))) return false;
  const present = await q.query("SELECT to_regclass('ai.gateway_audit_log') IS NOT NULL AS present");
  if (present.rows[0]?.present !== true) return false;
  for (const call of calls) if (!await currentCallDelivery(q, input, Number(body.turn.actorUserId), project.rows[0].id, call)) return false;
  return true;
}
async function qualifiedMachineGenesis(q: Queryable, input: WorkflowGovernanceInput, genesis: RetainedMachineGenesisRow[]): Promise<boolean> {
  const ordinary = [];
  for (const row of genesis) {
    const provenance = row.metadata.provenance;
    if (provenance.generatedDerivative) {
      const { verifyRetainedDerivativeGeneration } = await import('./authoring-from-draft');
      const qualified = await verifyRetainedDerivativeGeneration(q, { organizationId: input.organizationId, creatorUserId: Number(row.chain_actor_id),
        currentReaderUserId: Number(input.actor?.id), programId: String(input.doc.client_program_id ?? ''),
        genesisHtml: row.after_content, proof: provenance.generatedDerivative });
      if (!qualified) return false;
    } else ordinary.push({ authorId: ANA_MACHINE_AUTHOR_ID, text: row.after_content, turnRecordId: provenance.turnId });
  }
  if (!ordinary.length) return true;
  if (!await turnRecordStorePresent(q)) return false;
  const verified = await verifyMachineText(q, input.organizationId, ordinary, { mayVouch: recordMayVouch });
  if (verified.verified.length !== ordinary.length || verified.unverified.length) return false;
  const checked = new Set<string>();
  for (const claim of verified.verified) {
    if (!checked.has(claim.turnRecordId) && !await retainedTurnDeliveryQualified(q, input, claim)) return false;
    checked.add(claim.turnRecordId);
  }
  return true;
}

/** Caller supplies CREATE/UPDATE rows already reconciled to the immutable tenant audit chain. */
export async function ordinaryMachineGenesisMayRelease(q: Queryable, input: WorkflowGovernanceInput,
  rows: RetainedMachineGenesisRow[]): Promise<boolean> {
  const genesis = rows.filter(row => row.operation_type === 'CREATE' && row.metadata?.provenance?.source === 'ana'
    && typeof row.after_content === 'string' && comparableText(row.after_content));
  const original = genesis.map(row => row.after_content as string);
  let machineRemains = originalMachineTextRemains(original, input.sections);
  for (const section of input.sections) {
    const ref = { documentTable: 'authoring_sections', documentId: section.id }, content = section.content ?? '';
    await assertLineageCoversContent(input.organizationId, ref, content, q);
    await assertLineageHashesMatchContent(input.organizationId, ref, content, q);
    const spans = await listLiveMachineSpans(input.organizationId, ref, q);
    for (const span of spans) {
      machineRemains = true;
      const text = comparableText(content.slice(span.charStart, span.charEnd));
      if (!original.some(saved => comparableText(saved).includes(text))) return false;
    }
  }
  if (!machineRemains) return input.sections.every(section => currentHumanEditRecorded(rows, section));
  if (!genesis.length) return false;
  return qualifiedMachineGenesis(q, input, genesis);
}

/**
 * Check every machine-text claim a save carries, and say of each whether the
 * record vouches for it under RULE 2.
 *
 * Reads only, so a door calls it BEFORE opening its transaction: the rows it
 * reads are append-only, and a failed statement inside the transaction would
 * abort the write it is being checked for.
 */
export async function creditMachineClaims(
  executor: Queryable,
  tenantId: number,
  claims: ReadonlyArray<AcceptedMachineTextEntry>,
): Promise<GovernedClaimVerdict> {
  if (claims.length === 0) return { credited: [], refused: [], recordOccurrences: () => 0 };
  /* A deployment without the turn-record store can verify nothing, and asking
     it to would raise 42P01 out of `loadTurnRecord` and answer 500 to a save
     that is otherwise fine. Every claim is refused as unverifiable instead —
     which is the truth about such a deployment — and never as
     `model_not_approved`, so no save is refused for a model nobody read. The
     same guard `servedModelsForTurn` and `resolveTurnRecordSources` make, for
     the same reason. */
  if (!(await turnRecordStorePresent(executor))) {
    return {
      credited: [],
      refused: claims.map((c) => ({
        authorId: c.authorId,
        turnRecordId: c.turnRecordId,
        why: 'the turn record store is not provisioned',
        servedBy: null,
        chars: c.text.length,
      })),
      recordOccurrences: () => 0,
    };
  }
  const verdict = await verifyMachineText(
    executor,
    tenantId,
    claims.map((c) => ({ authorId: c.authorId, text: c.text, turnRecordId: c.turnRecordId })),
    { mayVouch: recordMayVouch },
  );
  return {
    credited: verdict.verified.map((v) => ({
      authorId: v.authorId,
      text: v.text,
      turnRecordId: v.turnRecordId,
      servedBy: qualifyServedModels(v.servedBy),
    })),
    refused: verdict.unverified.map((u) => ({
      authorId: u.authorId,
      turnRecordId: u.turnRecordId,
      why: NOT_CREDITED[u.reason],
      /* Only the model refusal has a record behind it to name a model from. */
      servedBy: u.servedBy ? qualifyServedModels(u.servedBy) : null,
      chars: u.chars,
    })),
    recordOccurrences: verdict.occurrencesInRecords,
  };
}

/**
 * The machine authors this save may name: those a record vouched for.
 *
 * The NAME comes from the server's own vocabulary, never the request —
 * {@link MACHINE_AUTHOR_IDS} is the one list of ids that may appear as a
 * machine author, and echoing a caller-supplied display name would put
 * unvalidated text in the attribution position of a filed record.
 */
export function contributorsOf(verdict: Pick<GovernedClaimVerdict, 'credited'>): MachineContributor[] {
  const out: MachineContributor[] = [];
  for (const claim of verdict.credited) {
    const name = MACHINE_AUTHOR_IDS[claim.authorId];
    if (!name || out.some((c) => c.id === claim.authorId)) continue;
    out.push({ id: claim.authorId, name });
  }
  return out;
}

/**
 * What the Part 11 row says about the claims — which were credited, and which
 * were not and why. The words themselves are in the document; the row carries
 * their length and, for a refused model, the models the record named.
 *
 * Undefined when the save carried no claim, so a plain human edit's row does
 * not gain a field asserting that nothing was claimed.
 */
export function machineClaimDisclosure(
  verdict: GovernedClaimVerdict,
  /**
   * The machine authors the save also claimed through `acceptedAuthors`. One
   * the verdict does not credit is disclosed as `uncredited`: a claim arrived
   * and was refused, and a row silent about it would read as a save that
   * claimed nothing. For every current client the two channels agree —
   * `settleAcceptedContributions` sends no author without its text — so this
   * is normally empty.
   */
  claimedAuthors: ReadonlyArray<MachineContributor> = [],
) {
  const credited = contributorsOf(verdict);
  const uncredited = claimedAuthors.filter((a) => !credited.some((c) => c.id === a.id)).map((a) => a.id);
  if (verdict.credited.length === 0 && verdict.refused.length === 0 && uncredited.length === 0) return undefined;
  return {
    ...(uncredited.length ? { uncredited } : {}),
    credited: verdict.credited.map((c) => ({
      authorId: c.authorId,
      turnRecordId: c.turnRecordId,
      chars: c.text.length,
    })),
    refused: verdict.refused.map((r) => ({
      authorId: r.authorId,
      turnRecordId: r.turnRecordId,
      why: r.why,
      servedBy: r.servedBy,
      chars: r.chars,
    })),
  };
}

/**
 * What the SAVER is told: how many claims were credited, and the reason for
 * each that was not.
 *
 * Without this the person sees an ordinary "Section saved" while the record
 * now says they asserted words they believed were attributed to AnA — a
 * surface stating the opposite of what it did. No turn record id and no author
 * id: the saver needs the reason, not the record's internals.
 */
export function machineClaimReport(verdict: GovernedClaimVerdict) {
  if (verdict.credited.length === 0 && verdict.refused.length === 0) return undefined;
  return {
    credited: verdict.credited.length,
    refused: verdict.refused.map((r) => ({ why: r.why, chars: r.chars })),
  };
}

/**
 * The claims a record vouches for but RULE 2 will not let author governed
 * content, or null when there are none.
 *
 * The one test a door makes to decide whether to refuse. `servedBy` is
 * non-null for exactly this reason and no other (machine-claim-verify.ts), so
 * the partition needs no second lookup.
 */
export function refusedForModel(verdict: GovernedClaimVerdict): RefusedMachineClaim[] | null {
  const refused = verdict.refused.filter((r) => r.servedBy !== null);
  return refused.length > 0 ? refused : null;
}

/**
 * What the saver is told when a verified claim's model is not admitted: which
 * model, how many passages, and what to do instead.
 *
 * It does not say "ask again with Thorough effort", which is what the
 * governed-write tool refusal says. In production no approved model has passed
 * performance qualification, so that advice ends in a second refusal — the
 * same correction the client insert gate already made to its own copy.
 */
export function governedSaveRefusal(refused: RefusedMachineClaim[]) {
  const named = [
    ...new Set(
      refused
        .flatMap((r) => r.servedBy ?? [])
        .map((m) => (m.model ? `${m.provider ?? 'unknown'}/${m.model}` : 'an unidentified model')),
    ),
  ];
  /* A record that names NO model is refused for that very reason, so there is
     nothing to list — and "drafted by , which is not approved" is the kind of
     sentence a reader quite reasonably reports as a bug. */
  const models = named.length > 0 ? named.join(', ') : 'a model this answer’s record does not name';
  const passages = refused.length === 1 ? 'one passage' : `${refused.length} passages`;
  return {
    code: 'MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE',
    message:
      `This section was not saved, and nothing was changed. ${passages} in it ` +
      `${refused.length === 1 ? 'was' : 'were'} drafted by ${models}, which is not approved for ` +
      'regulatory drafting — so the text cannot be filed as AnA’s work, and the record will not say you ' +
      'wrote it either. Rewrite or remove those passages and save again; what you write is recorded as yours. ' +
      'Your text is still here and still on this device.',
    servedBy: [...new Set(refused.flatMap((r) => (r.servedBy ?? []).map((m) => m.model)).filter(Boolean))],
    turnRecordIds: [...new Set(refused.map((r) => r.turnRecordId).filter(Boolean))],
    passages: refused.length,
  };
}
