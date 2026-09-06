/**
 * eCTD sequence lifecycle for a submission PACKAGE.
 *
 * An eCTD application is a sequence of filings: 0000 is the original, and every
 * later sequence says, leaf by leaf, what it does to what is already on file —
 * `new`, `replace`, `append` or `delete`. Until this existed the package path
 * could only ever build 0000: it set no operation on any leaf, so the packager
 * refused every later sequence outright (correctly — filing a changed document
 * as `new` leaves the version it supersedes current at the agency).
 *
 * The diff itself is NOT reimplemented here. `./lifecycle-operator` is the one
 * implementation of "what operation does this leaf carry", and it is pure; this
 * module supplies the two things it needs that are specific to the package
 * model: the FILED history of a package (what previous sequences actually put
 * on file), and the fold of that history into one effective prior state.
 *
 * What "filed" means matters. A bundle that was assembled and never transmitted
 * is not on file at the agency and must not appear in the prior state, so the
 * history is appended at successful transmit, never at assembly.
 *
 * @module server/services/ectd/package-sequence-lifecycle
 */
import { computeLifecycleOperations, type DesiredLeaf, type PriorLeaf } from './lifecycle-operator';

/** One leaf as a filed sequence put it on file. Mirrors the packager's
 *  `SubmissionBundle.leafManifest` entry, which is where it comes from. */
export interface FiledLeaf {
  ctdSection: string;
  fileName: string;
  href: string;
  md5: string;
  operation?: string;
  title?: string;
}

/** One sequence this package actually transmitted. Append-only. */
export interface FiledSequence {
  /** Four digits, e.g. '0000'. */
  sequence: string;
  /** The submission type declared for it (an FDA CL2 term, or a region's own). */
  submissionType: string;
  /** The bundle that was sent, by digest — the tie back to the transmittal. */
  sha256: string;
  transmittalId?: number | null;
  filedAt: string;
  leaves: FiledLeaf[];
}

const SEQUENCE_RE = /^\d{4}$/;

function isFiledLeaf(v: unknown): v is FiledLeaf {
  const l = v as Record<string, unknown> | null;
  return (
    !!l && typeof l === 'object' &&
    typeof l.ctdSection === 'string' && l.ctdSection.length > 0 &&
    typeof l.fileName === 'string' && l.fileName.length > 0 &&
    typeof l.href === 'string' &&
    typeof l.md5 === 'string'
  );
}

/**
 * The package's filed history, read from stored metadata and shape-checked
 * rather than trusted: a malformed entry is DROPPED, because a prior state
 * reconstructed from a half-readable record would compute `new` for a leaf that
 * is already on file. Returned oldest-first.
 */
export function readFiledSequences(metadata: Record<string, unknown> | null | undefined): FiledSequence[] {
  const raw = (metadata ?? {}).filedSequences;
  if (!Array.isArray(raw)) return [];
  const out: FiledSequence[] = [];
  for (const entry of raw) {
    const e = entry as Record<string, unknown> | null;
    if (!e || typeof e !== 'object') continue;
    if (typeof e.sequence !== 'string' || !SEQUENCE_RE.test(e.sequence)) continue;
    if (!Array.isArray(e.leaves)) continue;
    const leaves = e.leaves.filter(isFiledLeaf);
    if (leaves.length !== e.leaves.length) continue; // partial inventory is not an inventory
    out.push({
      sequence: e.sequence,
      submissionType: typeof e.submissionType === 'string' ? e.submissionType : '',
      sha256: typeof e.sha256 === 'string' ? e.sha256 : '',
      transmittalId: typeof e.transmittalId === 'number' ? e.transmittalId : null,
      filedAt: typeof e.filedAt === 'string' ? e.filedAt : '',
      leaves,
    });
  }
  out.sort((a, b) => a.sequence.localeCompare(b.sequence));
  return out;
}

/**
 * Fold the filed history into the state that is CURRENTLY on file: later
 * sequences supersede earlier ones for the same leaf, and a leaf whose last
 * operation was `delete` has been withdrawn and drops out entirely.
 *
 * Each surviving leaf carries the sequence that actually holds it, so the
 * operator can point `modified-file` at the right sequence folder — the prior
 * state of an application is a fold, not simply "the last sequence".
 */
export function foldFiledState(filed: readonly FiledSequence[]): PriorLeaf[] {
  const byKey = new Map<string, PriorLeaf>();
  for (const seq of [...filed].sort((a, b) => a.sequence.localeCompare(b.sequence))) {
    for (const leaf of seq.leaves) {
      const key = `${leaf.ctdSection}/${leaf.fileName}`;
      if (leaf.operation === 'delete') { byKey.delete(key); continue; }
      byKey.set(key, {
        ctdSection: leaf.ctdSection,
        fileName: leaf.fileName,
        md5: leaf.md5,
        href: leaf.href,
        title: leaf.title,
        operation: leaf.operation,
        sequenceNumber: seq.sequence,
      });
    }
  }
  return [...byKey.values()];
}

/** Why a sequence cannot be assembled, in the operator's own terms. */
export class SequenceLifecycleRefusal extends Error {
  readonly name = 'SequenceLifecycleRefusal';
  constructor(
    readonly code:
      | 'NO_PRIOR_SEQUENCE'
      | 'SEQUENCE_ALREADY_FILED'
      | 'SUBMISSION_TYPE_REQUIRED'
      | 'SUBMISSION_TYPE_UNKNOWN',
    message: string,
    /** For SUBMISSION_TYPE_UNKNOWN: the terms the region will accept, so the
     *  caller can offer them rather than making the operator guess again. */
    readonly acceptedSubmissionTypes?: readonly string[],
  ) {
    super(message);
  }
}

export interface SequencePlan {
  /** The operation and modified-file pointer for each leaf that ships. */
  leaves: Array<{ ctdSection: string; fileName: string; operation: string; modifiedFile?: string }>;
  /** Leaves unchanged since the last filing: they do not ship at all. */
  omitted: Array<{ ctdSection: string; fileName: string }>;
  summary: { new: number; replace: number; append: number; delete: number; unchanged: number };
}

/**
 * Plan a sequence: what operation each of this assembly's leaves carries.
 *
 * Sequence 0000 is an original by definition — every leaf is `new` and no prior
 * state is consulted. Any later sequence is diffed against the filed fold, and
 * refuses when there is nothing on file to be a follow-up TO: a package whose
 * 0000 was never transmitted has no lifecycle, and calling its second assembly
 * "0001" would file every leaf as new against an application the agency has
 * never seen.
 *
 * A leaf whose content is byte-identical to what is already on file is OMITTED:
 * an eCTD sequence carries what changed, not the whole tree. A leaf that is on
 * file but absent from this assembly stays on file, unchanged and unmentioned —
 * withdrawing a document is an explicit act, never inferred from absence.
 */
export function planSequence(params: {
  sequence: string;
  submissionType?: string | null;
  filed: readonly FiledSequence[];
  desired: Array<{ ctdSection: string; fileName: string; md5: string; title: string }>;
  /**
   * The region's submission-type vocabulary, when it has one. Supply it and an
   * unfilable term is refused HERE, with the list of what would work, instead
   * of throwing out of the packager three steps later as an unexplained
   * failure. `undefined`/`null` means the region takes free text — true of
   * every region but FDA.
   *
   * The caller passes the matcher rather than the module reaching for it: this
   * plan is region-agnostic, and `accepts` must stay the canonical resolver
   * (which matches labels loosely — 'supplement' resolves to 'Efficacy
   * Supplement') rather than a second, stricter copy of it here.
   */
  submissionTypeVocabulary?: { readonly terms: readonly string[]; accepts(value: string): boolean } | null;
}): SequencePlan {
  const { sequence, filed, desired } = params;

  // A declared submission type is checked against the region's vocabulary
  // before anything else, 0000 included: a term the backbone cannot carry is
  // an unfilable sequence whatever it diffs to.
  const declaredType = params.submissionType?.trim();
  const vocab = params.submissionTypeVocabulary;
  if (declaredType && vocab && !vocab.accepts(declaredType)) {
    throw new SequenceLifecycleRefusal(
      'SUBMISSION_TYPE_UNKNOWN',
      `'${declaredType}' is not a submission type this region can file. The backbone carries a ` +
        `code from a fixed list, so a term outside it has no code to become. Accepted: ` +
        `${vocab.terms.join(', ')}.`,
      vocab.terms,
    );
  }

  if (sequence === '0000') {
    if (filed.some((f) => f.sequence === '0000')) {
      throw new SequenceLifecycleRefusal(
        'SEQUENCE_ALREADY_FILED',
        'Sequence 0000 has already been transmitted for this package; a follow-up must carry the next sequence number.',
      );
    }
    return {
      leaves: desired.map((d) => ({ ctdSection: d.ctdSection, fileName: d.fileName, operation: 'new' })),
      omitted: [],
      summary: { new: desired.length, replace: 0, append: 0, delete: 0, unchanged: 0 },
    };
  }

  if (filed.length === 0) {
    throw new SequenceLifecycleRefusal(
      'NO_PRIOR_SEQUENCE',
      `Sequence ${sequence} is a follow-up, but nothing has been transmitted for this package yet. ` +
        'File sequence 0000 first: without it every leaf here would be filed as new against an application the agency has no record of.',
    );
  }
  if (filed.some((f) => f.sequence === sequence)) {
    throw new SequenceLifecycleRefusal(
      'SEQUENCE_ALREADY_FILED',
      `Sequence ${sequence} has already been transmitted for this package. Use the next unused sequence number.`,
    );
  }
  if (!declaredType) {
    throw new SequenceLifecycleRefusal(
      'SUBMISSION_TYPE_REQUIRED',
      `Sequence ${sequence} must declare what is being filed (its submission type). ` +
        'Only sequence 0000 is an original by definition; the backbone has to say what a follow-up is.' +
        // Named from the region's own vocabulary, never from ordinary English:
        // suggesting 'amendment' sent operators to a term no FDA backbone can
        // carry, and the packager then failed with no way back to a term that
        // works.
        (vocab ? ` Accepted: ${vocab.terms.join(', ')}.` : ''),
      vocab?.terms,
    );
  }

  const prior = foldFiledState(filed);
  const priorByKey = new Map(prior.map((p) => [`${p.ctdSection}/${p.fileName}`, p]));

  // The canonical operator does the diff. `sourcePath` is a placeholder here:
  // this plan decides operations only, and the assemble route pairs them back
  // onto the leaves whose real bytes it already holds.
  const desiredLeaves: DesiredLeaf[] = desired.map((d) => ({
    ctdSection: d.ctdSection,
    fileName: d.fileName,
    title: d.title,
    sourcePath: '',
    md5: d.md5,
  }));
  const { leaves, summary } = computeLifecycleOperations(prior, desiredLeaves, {});

  const shipped = new Set(leaves.map((l) => `${l.ctdSection}/${l.fileName}`));
  const omitted = desired
    .filter((d) => !shipped.has(`${d.ctdSection}/${d.fileName}`) && priorByKey.has(`${d.ctdSection}/${d.fileName}`))
    .map((d) => ({ ctdSection: d.ctdSection, fileName: d.fileName }));

  return {
    leaves: leaves.map((l) => ({
      ctdSection: l.ctdSection,
      fileName: l.fileName,
      operation: String(l.operation),
      ...(l.modifiedFile ? { modifiedFile: l.modifiedFile } : {}),
    })),
    omitted,
    summary,
  };
}
