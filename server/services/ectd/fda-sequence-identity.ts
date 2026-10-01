/**
 * What an FDA eCTD sequence declares about itself in us-regional.xml: its
 * submission type, its sub-type, and its submission-id — the sequence number of
 * the FIRST sequence of the regulatory activity it belongs to.
 *
 * 2026-10-01 (W5/D7, sweep F04). The package spine could not say any of this.
 * Its assemble body had no sub-type and no submission-id, and the packager
 * defaulted both, so every follow-up was declared the Original of a new
 * regulatory activity: an IND protocol amendment went to FDA as a second
 * Original Application. An IND amendment is submission type Original
 * Application, sub-type Amendment, submission-id 0000 (the IND's first
 * sequence). And nothing checked the submission type against the application:
 * an IND package filed 'Efficacy Supplement', which no IND can have.
 *
 * These rules are enforced at the package spine's assemble boundary. The shared
 * packager keeps its defaults for the other spine's callers (a hand-off in the
 * sweep record), so this module is the one place the package spine decides it.
 *
 * Pure: the caller passes the filed history (readFiledSequences — rejected
 * entries are not on file and are not offered here).
 *
 * @module server/services/ectd/fda-sequence-identity
 */
import {
  fdaSubmissionTypeRefusal,
  resolveSubmissionSubTypeStrict,
  resolveSubmissionTypeStrict,
  submissionSubTypeTerms,
  submissionTypeTerms,
} from './controlled-vocab';
import { SequenceLifecycleRefusal, type FiledSequence } from './package-sequence-lifecycle';

export interface FdaSequenceIdentity {
  /** The submission type, as its `fdastN` code and the canonical term. */
  submissionTypeCode: string;
  submissionType: string;
  /** The sub-type, as its `fdasstN` code and the canonical term. */
  submissionSubTypeCode: string;
  submissionSubType: string;
  /** The first sequence of the regulatory activity this sequence belongs to. */
  submissionId: string;
}

/** What a sub-type says about the regulatory activity a sequence belongs to.
 *  'own': it opens one (submission-id is its own number). 'filed': it continues
 *  one already on file (submission-id names it). 'own-or-filed': either. */
const SUB_TYPE_ACTIVITY: Record<string, 'own' | 'filed' | 'own-or-filed'> = {
  fdasst1: 'own',          // Original
  fdasst2: 'own-or-filed', // Presubmission
  fdasst3: 'own-or-filed', // Application
  fdasst4: 'filed',        // Amendment
  fdasst5: 'filed',        // Resubmission
  fdasst6: 'own-or-filed', // Report
  fdasst7: 'own-or-filed', // Correspondence
};

/** The submission type a filed entry was filed under: the recorded code, else
 *  its declared term read strictly, else — for a 0000 recorded before codes
 *  were (its term the bare word 'original') — Original Application. */
export function filedSubmissionTypeCode(f: FiledSequence): string | null {
  if (f.submissionTypeCode) return f.submissionTypeCode;
  const strict = resolveSubmissionTypeStrict(f.submissionType);
  if (strict) return strict.code;
  return f.sequence === '0000' && /^original\b/i.test(f.submissionType.trim()) ? 'fdast1' : null;
}

/** The regulatory activity a filed entry belongs to: its recorded
 *  submission-id, else its own number — every backbone written before
 *  2026-10-01 declared its own sequence as its submission-id. */
export function filedActivityOf(f: FiledSequence): string {
  return f.submissionId ?? f.sequence;
}

/**
 * Decide, or refuse, the identity an FDA sequence declares. Every refusal is a
 * SequenceLifecycleRefusal the assemble route answers with a 409 carrying the
 * terms or sequences that would work.
 */
export function resolveFdaSequenceIdentity(params: {
  sequence: string;
  /** The package's `fdaatN` application-type code. */
  applicationTypeCode: string | null;
  submissionType?: string | null;
  submissionSubType?: string | null;
  submissionId?: string | null;
  filed: readonly FiledSequence[];
}): FdaSequenceIdentity {
  const { sequence, filed } = params;
  const type = submissionTypeOf(params.submissionType, sequence);
  refuseImpossiblePair(params.applicationTypeCode, type);
  const subType = subTypeOf(params.submissionSubType, sequence);
  const submissionId = activityOf(params.submissionId, sequence, type, subType, filed);
  return {
    submissionTypeCode: type.code,
    submissionType: type.description,
    submissionSubTypeCode: subType.code,
    submissionSubType: subType.description,
    submissionId,
  };
}

function submissionTypeOf(declared: string | null | undefined, sequence: string): { code: string; description: string } {
  if (declared?.trim()) {
    const hit = resolveSubmissionTypeStrict(declared);
    if (hit) return hit;
    const terms = submissionTypeTerms('fda') ?? [];
    throw new SequenceLifecycleRefusal(
      'SUBMISSION_TYPE_UNKNOWN',
      `'${declared.trim()}' is not an FDA submission type. The backbone carries a code from a fixed list, and a word is ` +
        `matched to it exactly, never guessed. Accepted: ${terms.join(', ')}.`,
      terms,
    );
  }
  // Only sequence 0000 may leave it unsaid (planSequence refuses a follow-up that does).
  if (sequence !== '0000') throw new Error(`resolveFdaSequenceIdentity: sequence ${sequence} has no submission type`);
  return resolveSubmissionTypeStrict('fdast1')!;
}

function refuseImpossiblePair(applicationTypeCode: string | null, type: { code: string; description: string }): void {
  const why = fdaSubmissionTypeRefusal(applicationTypeCode, type.code);
  if (!why) return;
  const terms = (submissionTypeTerms('fda') ?? []).filter(
    (t) => !fdaSubmissionTypeRefusal(applicationTypeCode, resolveSubmissionTypeStrict(t)!.code),
  );
  throw new SequenceLifecycleRefusal(
    'SUBMISSION_TYPE_NOT_FOR_APPLICATION',
    `This application cannot file '${type.description}': ${why} Accepted for it: ${terms.join(', ')}.`,
    terms,
  );
}

function subTypeOf(declared: string | null | undefined, sequence: string): { code: string; description: string } {
  const terms = submissionSubTypeTerms();
  if (declared?.trim()) {
    const hit = resolveSubmissionSubTypeStrict(declared);
    if (hit) return hit;
    throw new SequenceLifecycleRefusal(
      'SUBMISSION_SUB_TYPE_UNKNOWN',
      `'${declared.trim()}' is not an FDA submission sub-type. Accepted: ${terms.join(', ')}.`,
      undefined,
      { acceptedSubmissionSubTypes: terms },
    );
  }
  if (sequence === '0000') return resolveSubmissionSubTypeStrict('fdasst1')!;
  throw new SequenceLifecycleRefusal(
    'SUBMISSION_SUB_TYPE_REQUIRED',
    `Sequence ${sequence} must say what it is within its regulatory activity (its sub-type): an amendment to the ` +
      `application, a new original, a report, correspondence. Left unsaid it was declared an Original, starting a new ` +
      `activity, which a follow-up rarely is. Accepted: ${terms.join(', ')}.`,
    undefined,
    { acceptedSubmissionSubTypes: terms },
  );
}

function activityOf(
  declared: string | null | undefined,
  sequence: string,
  type: { code: string; description: string },
  subType: { code: string; description: string },
  filed: readonly FiledSequence[],
): string {
  const rule = SUB_TYPE_ACTIVITY[subType.code] ?? 'own-or-filed';
  const named = declared?.trim() || null;
  if (rule === 'own') {
    if (named && named !== sequence) {
      throw new SequenceLifecycleRefusal(
        'SUBMISSION_ID_WRONG_ACTIVITY',
        `An Original opens a regulatory activity, so its submission-id is its own sequence (${sequence}), not ${named}. ` +
          `To continue the activity ${named} opened, declare the sub-type that does (Amendment, for one).`,
      );
    }
    refuseSecondOriginalApplication(type, sequence, filed);
    return sequence;
  }
  if (!named || (rule === 'own-or-filed' && named === sequence)) {
    if (rule === 'own-or-filed') return sequence;
    const openers = activitiesOfType(type.code, sequence, filed);
    throw new SequenceLifecycleRefusal(
      'SUBMISSION_ID_REQUIRED',
      `A sequence of sub-type ${subType.description} continues a regulatory activity already on file; name it (the ` +
        `submission-id is the activity's first sequence). ${openersSentence(type, openers)}`,
      undefined,
      { filedActivities: openers },
    );
  }
  return filedActivityNamed(named, sequence, type, filed);
}

function activitiesOfType(typeCode: string, sequence: string, filed: readonly FiledSequence[]): string[] {
  return filed
    .filter((f) => f.sequence < sequence && filedActivityOf(f) === f.sequence && filedSubmissionTypeCode(f) === typeCode)
    .map((f) => f.sequence);
}

function openersSentence(type: { description: string }, openers: readonly string[]): string {
  return openers.length > 0
    ? `${type.description} activities on file: ${openers.join(', ')}.`
    : `No ${type.description} activity is on file for this package.`;
}

function filedActivityNamed(named: string, sequence: string, type: { code: string; description: string }, filed: readonly FiledSequence[]): string {
  const entry = filed.find((f) => f.sequence === named);
  if (!entry || named >= sequence) {
    throw new SequenceLifecycleRefusal(
      'SUBMISSION_ID_NOT_FILED',
      `Submission-id ${named} is not a sequence this package filed before ${sequence}. Filed: ${filed.map((f) => f.sequence).join(', ') || 'none'}.`,
      undefined,
      { filedSequences: filed.map((f) => f.sequence) },
    );
  }
  const opened = filedActivityOf(entry) === entry.sequence;
  const entryType = filedSubmissionTypeCode(entry);
  if (!opened || entryType !== type.code) {
    const openers = activitiesOfType(type.code, sequence, filed);
    throw new SequenceLifecycleRefusal(
      'SUBMISSION_ID_WRONG_ACTIVITY',
      (opened
        ? `Sequence ${named} opened a regulatory activity of another submission type, not ${type.description}. `
        : `Sequence ${named} did not open a regulatory activity: it continued ${filedActivityOf(entry)}. `) +
        openersSentence(type, openers),
      undefined,
      { filedActivities: openers },
    );
  }
  return named;
}

function refuseSecondOriginalApplication(type: { code: string }, sequence: string, filed: readonly FiledSequence[]): void {
  if (type.code !== 'fdast1') return;
  const original = filed.find(
    (f) => f.sequence < sequence && filedActivityOf(f) === f.sequence && filedSubmissionTypeCode(f) === 'fdast1',
  );
  if (!original) return;
  throw new SequenceLifecycleRefusal(
    'ORIGINAL_APPLICATION_ALREADY_FILED',
    `Sequence ${original.sequence} already filed this application's Original Application. A follow-up to it is an ` +
      `Original Application of sub-type Amendment (or another sub-type that continues it) with submission-id ${original.sequence}; ` +
      'a second Original would tell the agency this is a new application.',
    undefined,
    { filedActivities: [original.sequence] },
  );
}
