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
  /**
   * Stable identity of the DOCUMENT this leaf carries. Optional because a
   * history filed before it existed has none — the fold and the diff both fall
   * back to ctdSection/fileName for those, which is why it is not required
   * here and why removing the fallback would re-file every such application.
   */
  leafKey?: string;
  /** The leaf's XML ID and the backbone that carries it (from the sequence
   *  root) — what a later sequence's modified-file names. Absent on history
   *  filed before 2026-09-29 (W5/D7); such a leaf cannot be acted on. */
  leafId?: string;
  backbone?: string;
  /**
   * md5 of the bytes the packager was HANDED, when it changed them (PDF/A
   * normalization). The next sequence's "unchanged" decision compares against
   * this, since the assemble route computes its md5 before the packager runs;
   * `md5` is the checksum of what shipped. Absent when nothing was converted.
   */
  sourceMd5?: string;
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

/**
 * Whether the agency holds a filed sequence. ABSENT reads as 'transmitted':
 * every history written before 2026-10-01 has no state, and all of it is on
 * file. 'rejected' is written only by the governed technical-rejection action
 * (./filed-sequence-rejection) — an entry is never deleted, it is marked.
 */
export type FiledSequenceState = 'transmitted' | 'rejected';

/**
 * The record that took a filed sequence off file: the agency did not load it
 * (a technical rejection — FDA's failed Ack3). There is no Ack3 ingestion, so
 * it is an operator's signed act carrying the agency's evidence, and it states
 * when it was RECORDED and by whom — not an agency rejection time this platform
 * never received. A rollback is not this: the agency still holds those bytes.
 */
export interface FiledSequenceRejection {
  recordedAt: string;
  recordedBy: number;
  reason: string;
  /** The Vault document holding the agency's notice, and its content hash. */
  evidence: { vaultDocumentId: string; contentSha256: string };
  /** The transmittal's status before and after the act. */
  transmittalStatus: { previous: string; current: string };
  /** The governed `sign` ledger row and the electronic signature. */
  actionId: string;
  signatureId: number;
}

/**
 * Whether a filed-history entry has been taken off file. THE predicate: the
 * reader (readFiledSequences) and the writers (recordFiledSequence, the
 * rejection action) all ask it, so they cannot disagree about which entries
 * are on file — the disagreement that let a writer report a filing the reader
 * then dropped (isFiledLeaf, above). Only 'rejected' WITH its evidence and
 * signature counts: a bare or hand-edited state takes nothing off file.
 */
export function isRejectedFiling(e: unknown): boolean {
  const entry = e as { state?: unknown; rejection?: Partial<FiledSequenceRejection> } | null;
  if (!entry || typeof entry !== 'object' || entry.state !== 'rejected') return false;
  const r = entry.rejection;
  return (
    !!r && typeof r === 'object' && typeof r.actionId === 'string' && typeof r.signatureId === 'number' &&
    typeof r.evidence?.vaultDocumentId === 'string' && typeof r.evidence?.contentSha256 === 'string'
  );
}

const SEQUENCE_RE = /^\d{4}$/;

/**
 * The filed entry that holds `sequence` — the first entry on file under that
 * number, whether or not its inventory is readable — or null. The writer asks
 * this before appending and governed transmit asks it before sending, so a
 * second, different bundle under a number already on file is refused before
 * the bytes leave rather than discovered after.
 */
export function filedEntryHolding(
  history: unknown,
  sequence: string,
): { sha256: string; transmittalId: number | null } | null {
  if (!Array.isArray(history)) return null;
  for (const e of history as Array<Record<string, unknown> | null>) {
    if (!e || typeof e !== 'object' || e.sequence !== sequence || isRejectedFiling(e)) continue;
    return {
      sha256: typeof e.sha256 === 'string' ? e.sha256.toLowerCase() : '',
      transmittalId: typeof e.transmittalId === 'number' ? e.transmittalId : null,
    };
  }
  return null;
}

/** Fields a filed leaf MAY carry, each a string when present. A field of any
 *  other type makes the whole entry unreadable, like a missing required one. */
const OPTIONAL_STRING_FIELDS = ['leafKey', 'leafId', 'backbone', 'sourceMd5'] as const;

/**
 * Whether a value is a readable filed-leaf record. Exported because the WRITER
 * must apply it too: a manifest that only the reader rejects is written to the
 * history, reported as recorded, and then dropped when the next sequence reads
 * it — the filing is at the agency and invisible to every subsequent diff.
 */
export function isFiledLeaf(v: unknown): v is FiledLeaf {
  const l = v as Record<string, unknown> | null;
  return (
    !!l && typeof l === 'object' &&
    typeof l.ctdSection === 'string' && l.ctdSection.length > 0 &&
    typeof l.fileName === 'string' && l.fileName.length > 0 &&
    typeof l.href === 'string' &&
    typeof l.md5 === 'string' &&
    OPTIONAL_STRING_FIELDS.every((f) => l[f] === undefined || typeof l[f] === 'string')
  );
}

/**
 * The package's filed history, read from stored metadata and shape-checked
 * rather than trusted: a malformed entry is DROPPED, because a prior state
 * reconstructed from a half-readable record would compute `new` for a leaf that
 * is already on file. An entry the agency rejected (isRejectedFiling) is
 * skipped too — it stays in the metadata for audit, but nothing it carried is
 * on file. Returned oldest-first.
 */
export function readFiledSequences(metadata: Record<string, unknown> | null | undefined): FiledSequence[] {
  const raw = (metadata ?? {}).filedSequences;
  if (!Array.isArray(raw)) return [];
  const out: FiledSequence[] = [];
  for (const entry of raw) {
    const e = entry as Record<string, unknown> | null;
    if (!e || typeof e !== 'object' || isRejectedFiling(e)) continue;
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
 *
 * A filed leaf acts on the document it was PLANNED against, so the fold matches
 * the way the operator matched when it planned the sequence: on identity where
 * both sides have one, on the path where either side has none. Folding on
 * `leafKey ?? path` alone made the two disagree. Every withdrawal the assemble
 * route filed before 2026-10-01 carried no leafKey while the document it
 * withdrew was folded under one, so the delete removed nothing (W5/D7, sweep
 * F10): the document stayed "on file" for every later sequence, which withdrew
 * it a second time, filed its return as a replace of a deleted leaf, or refused
 * that return as "already on file". Those histories exist and this reads them.
 */
export function foldFiledState(filed: readonly FiledSequence[]): PriorLeaf[] {
  const byKey = new Map<string, PriorLeaf>();
  const keysAtPath = new Map<string, Set<string>>();
  const pathOf = (l: { ctdSection: string; fileName: string }) => `${l.ctdSection}/${l.fileName}`;
  const remove = (key: string) => {
    const p = byKey.get(key);
    if (!p) return;
    byKey.delete(key);
    keysAtPath.get(pathOf(p))?.delete(key);
  };
  for (const seq of [...filed].sort((a, b) => a.sequence.localeCompare(b.sequence))) {
    for (const leaf of seq.leaves) {
      // Folded on the document's own identity where it has one, so a later
      // sequence that re-filed a document under a changed file name supersedes
      // the earlier copy instead of sitting beside it in the prior state.
      const key = leaf.leafKey ?? pathOf(leaf);
      // The document this leaf acted on, found the way the operator found it:
      // its identity first, else what sits at its path — unless both have an
      // identity and the two differ, which makes them two documents.
      const actedOn = byKey.has(key)
        ? key
        : [...(keysAtPath.get(pathOf(leaf)) ?? [])].find((k) => {
            const onFile = byKey.get(k)!.leafKey;
            return !(leaf.leafKey && onFile && onFile !== leaf.leafKey);
          });
      if (actedOn !== undefined) remove(actedOn);
      if (leaf.operation === 'delete') continue;
      keysAtPath.set(pathOf(leaf), (keysAtPath.get(pathOf(leaf)) ?? new Set()).add(key));
      byKey.set(key, {
        leafKey: leaf.leafKey,
        ctdSection: leaf.ctdSection,
        fileName: leaf.fileName,
        md5: leaf.md5,
        ...(leaf.sourceMd5 ? { sourceMd5: leaf.sourceMd5 } : {}),
        href: leaf.href,
        title: leaf.title,
        operation: leaf.operation,
        sequenceNumber: seq.sequence,
        ...(leaf.leafId && leaf.backbone ? { leafId: leaf.leafId, backbone: leaf.backbone } : {}),
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
      | 'SEQUENCE_OUT_OF_ORDER'
      | 'SUBMISSION_TYPE_REQUIRED'
      | 'SUBMISSION_TYPE_UNKNOWN'
      | 'NOTHING_TO_FILE'
      | 'WITHDRAWAL_NOT_ON_FILE'
      | 'WITHDRAWAL_CONTRADICTS_CONTENT',
    message: string,
    /** For SUBMISSION_TYPE_UNKNOWN: the terms the region will accept, so the
     *  caller can offer them rather than making the operator guess again. */
    readonly acceptedSubmissionTypes?: readonly string[],
  ) {
    super(message);
  }
}

export interface SequencePlan {
  /** The operation and modified-file pointer for each leaf that ships. A
   *  withdrawal additionally carries the title and checksum the document was
   *  FILED under: it ships no bytes, so those cannot be recomputed, and the
   *  backbone entry must still name and check the file it withdraws. */
  leaves: Array<{
    ctdSection: string; fileName: string; operation: string; modifiedFile?: string;
    title?: string; md5?: string;
    /** On a withdrawal, the identity of the document it withdraws, so the filed
     *  history records which document left rather than only where it sat. */
    leafKey?: string;
  }>;
  /** Leaves unchanged since the last filing: they do not ship at all. */
  omitted: Array<{ ctdSection: string; fileName: string }>;
  summary: { new: number; replace: number; append: number; delete: number; unchanged: number };
  /** Documents this sequence leaves current at the agency although the package
   *  no longer files them where they sit (see `staleOnFile`). Empty for 0000. */
  staleOnFile: StaleOnFile[];
}

/**
 * A document on file that this sequence leaves current although the package no
 * longer places it there. Withdrawal stays explicit, so the plan does not
 * withdraw it; it names it, as the leaf a `withdraw` entry has to name.
 */
export interface StaleOnFile {
  /** 'relocated': the same artifact is placed at another CTD section now, and
   *  files there as a new document (sweep F12). 'placeholder': a generated
   *  empty-section leaf, filed before an empty section stopped filing one
   *  (sweep F11). */
  reason: 'relocated' | 'placeholder';
  ctdSection: string;
  fileName: string;
  /** The sequence that holds it. */
  sequenceNumber?: string;
  /** For 'relocated': where the artifact is placed now. */
  movedTo?: { ctdSection: string; fileName: string };
}

/**
 * Take this submission's own documents (see planSequence's `perSubmission`) out
 * of the diff. One that is byte for byte the document on file under the same
 * identity is the earlier submission's and does not ship; any other files
 * `new`. Matched the way the operator matches (identity, else the path when
 * either side has none), and compared like with like (`sourceMd5`).
 */
function splitPerSubmission<D extends { ctdSection: string; fileName: string; md5: string; leafKey?: string }>(
  prior: readonly PriorLeaf[],
  desired: readonly D[],
  perSubmission: ((ctdSection: string) => boolean) | undefined,
): { perSubmission: D[]; diffed: D[] } {
  if (!perSubmission) return { perSubmission: [], diffed: [...desired] };
  const byKey = new Map(prior.filter((p) => p.leafKey).map((p) => [p.leafKey!, p]));
  const byPath = new Map(prior.map((p) => [`${p.ctdSection}/${p.fileName}`, p]));
  const own: D[] = [];
  const diffed: D[] = [];
  for (const d of desired) {
    if (!perSubmission(d.ctdSection)) { diffed.push(d); continue; }
    const atPath = byPath.get(`${d.ctdSection}/${d.fileName}`);
    const onFile = (d.leafKey ? byKey.get(d.leafKey) : undefined)
      ?? (atPath && !(d.leafKey && atPath.leafKey && atPath.leafKey !== d.leafKey) ? atPath : undefined);
    if (onFile && (onFile.sourceMd5 ?? onFile.md5) === d.md5) continue; // the earlier submission's, unchanged
    own.push(d);
  }
  return { perSubmission: own, diffed };
}

/** `artifact:<id>@<code>` → the artifact id, or null for any other identity. */
function artifactOf(leafKey: string | undefined): string | null {
  if (!leafKey?.startsWith('artifact:')) return null;
  const at = leafKey.lastIndexOf('@');
  return at > 'artifact:'.length ? leafKey.slice('artifact:'.length, at) : null;
}

/**
 * What this sequence leaves current on file that the package no longer files
 * where it sits. 2026-10-01 (W5/D7, sweep F12): a document whose CTD section
 * was corrected was filed `new` at its new heading — correctly, a move is never
 * a replace across headings — while the copy at its old heading stayed current
 * at the agency with no finding, and every later revision replaced only the
 * new copy. A document deliberately filed at two headings is not a move: it is
 * still desired at its old one. A leaf this sequence withdraws is not stale.
 */
function staleOnFile(
  prior: readonly PriorLeaf[],
  desired: ReadonlyArray<{ ctdSection: string; fileName: string; leafKey?: string }>,
  withdraw: ReadonlyArray<{ ctdSection: string; fileName: string }>,
): StaleOnFile[] {
  const withdrawn = new Set(withdraw.map((w) => `${w.ctdSection}/${w.fileName}`));
  const desiredKeys = new Set(desired.map((d) => d.leafKey).filter(Boolean));
  const placedAt = new Map<string, { ctdSection: string; fileName: string }>();
  for (const d of desired) {
    const id = artifactOf(d.leafKey);
    if (id && !placedAt.has(id)) placedAt.set(id, { ctdSection: d.ctdSection, fileName: d.fileName });
  }
  const stale: StaleOnFile[] = [];
  for (const p of prior) {
    if (withdrawn.has(`${p.ctdSection}/${p.fileName}`) || (p.leafKey && desiredKeys.has(p.leafKey))) continue;
    const at = { ctdSection: p.ctdSection, fileName: p.fileName, ...(p.sequenceNumber ? { sequenceNumber: p.sequenceNumber } : {}) };
    const movedTo = placedAt.get(artifactOf(p.leafKey) ?? '');
    if (movedTo) stale.push({ reason: 'relocated', ...at, movedTo });
    else if (p.leafKey?.startsWith('section:')) stale.push({ reason: 'placeholder', ...at });
  }
  return stale;
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
  desired: Array<{ ctdSection: string; fileName: string; md5: string; title: string; leafKey?: string }>;
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
  /**
   * Documents to WITHDRAW from the application, each named as it sits on file.
   *
   * Withdrawal is explicit and can only be explicit. A leaf missing from an
   * assembly is unchanged and still on file, never withdrawn — inferring it
   * from absence would delete a dossier at the agency the first time somebody
   * assembled a two-document amendment. So this is the only way `delete`
   * happens, and without it `summary.delete` could only ever be 0.
   */
  withdraw?: ReadonlyArray<{ ctdSection: string; fileName: string }>;
  /**
   * Sections whose documents belong to ONE submission — FDA's cover letters
   * (1.2) and forms (1.1, 1.1.x): every sequence carries its own. Such a leaf
   * is never diffed into a `replace` of the one on file (that would tell the
   * agency sequence 0000's letter was superseded); it files `new` when it
   * differs from the one on file, and is left out when it is that same
   * document unchanged, since it is then the earlier submission's (W5/D7,
   * sweep F13, 2026-10-01). Absent: every leaf is diffed alike — true of every
   * region but FDA.
   */
  perSubmission?: (ctdSection: string) => boolean;
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
      staleOnFile: [],
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
  // Sequences are consecutive. A gap and a backfill are both operator errors,
  // and neither is a diff this module can compute honestly: the ONLY ordering it
  // knows is the sequence number, so filing 0001 after 0002 makes the fold treat
  // the higher number as current and points the new sequence's modified-file
  // FORWARD, at a sequence filed after it. Nothing downstream would notice.
  const highest = filed.reduce((max, f) => (f.sequence > max ? f.sequence : max), '0000');
  const expected = String(Number(highest) + 1).padStart(4, '0');
  if (sequence !== expected) {
    throw new SequenceLifecycleRefusal(
      'SEQUENCE_OUT_OF_ORDER',
      `Sequence ${sequence} is not the next one for this package: ${highest} is the highest filed, so the next is ${expected}. ` +
        (sequence < expected
          ? 'A sequence filed out of order would be diffed against filings made after it.'
          : 'A gap would leave the agency without the sequences in between.') +
        ' If a sequence was filed outside this system, its record has to reach this package before a follow-up can be built on it.',
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

  // The canonical operator does the diff. `sourcePath` is a placeholder here:
  // this plan decides operations only, and the assemble route pairs them back
  // onto the leaves whose real bytes it already holds.
  const { perSubmission: ownLeaves, diffed } = splitPerSubmission(prior, desired, params.perSubmission);
  const desiredLeaves: DesiredLeaf[] = diffed.map((d) => ({
    ctdSection: d.ctdSection,
    fileName: d.fileName,
    title: d.title,
    sourcePath: '',
    md5: d.md5,
    ...(d.leafKey ? { leafKey: d.leafKey } : {}),
  }));
  // Withdrawals are appended as desired leaves the operator marks `withdraw`;
  // it emits the delete pointing at the sequence that holds the document.
  const priorByPath = new Map(prior.map((p) => [`${p.ctdSection}/${p.fileName}`, p]));
  for (const w of params.withdraw ?? []) {
    const key = `${w.ctdSection}/${w.fileName}`;
    const onFile = priorByPath.get(key);
    if (!onFile) {
      throw new SequenceLifecycleRefusal(
        'WITHDRAWAL_NOT_ON_FILE',
        `Cannot withdraw ${key}: this package has filed nothing by that name, so there is nothing at the agency to withdraw. ` +
          'Name it exactly as the filed sequence recorded it.',
      );
    }
    if (desired.some((d) => `${d.ctdSection}/${d.fileName}` === key)) {
      throw new SequenceLifecycleRefusal(
        'WITHDRAWAL_CONTRADICTS_CONTENT',
        `Cannot both file and withdraw ${key} in sequence ${sequence}. Unmap the artifact from this package, or drop the withdrawal.`,
      );
    }
    desiredLeaves.push({
      ctdSection: onFile.ctdSection,
      fileName: onFile.fileName,
      title: onFile.title ?? onFile.fileName,
      sourcePath: '',
      md5: onFile.md5,
      withdraw: true,
      ...(onFile.leafKey ? { leafKey: onFile.leafKey } : {}),
    });
  }

  const operated = computeLifecycleOperations(prior, desiredLeaves, {});
  // This submission's own documents file `new`, beside the operator's leaves.
  // The ones they would have superseded stay on file, and the operator already
  // counts each of those as unchanged.
  const leaves: Array<{ ctdSection: string; fileName: string; operation: string; modifiedFile?: string; title?: string; md5?: string }> = [
    ...operated.leaves,
    ...ownLeaves.map((d) => ({ ctdSection: d.ctdSection, fileName: d.fileName, operation: 'new' })),
  ];
  const summary = { ...operated.summary, new: operated.summary.new + ownLeaves.length };

  // A desired leaf that did not ship is unchanged — that is the only outcome
  // the operator does not emit. Keyed on the path because that is what the
  // emitted leaves carry, and what the caller pairs the plan back onto.
  const shipped = new Set(leaves.map((l) => `${l.ctdSection}/${l.fileName}`));
  const omitted = desired
    .filter((d) => !shipped.has(`${d.ctdSection}/${d.fileName}`))
    .map((d) => ({ ctdSection: d.ctdSection, fileName: d.fileName }));

  // Everything the operator asked to file is already on file, unchanged. There
  // is a sequence to build here only in the sense that a zip can be produced:
  // it would carry no leaf, an <ectd:ectd/> with no module element, and an
  // empty regional backbone — and transmitting it would consume a sequence
  // number at the agency to say nothing. Refuse rather than let a filing that
  // files nothing look like a successful assembly.
  if (desired.length > 0 && leaves.length === 0) {
    throw new SequenceLifecycleRefusal(
      'NOTHING_TO_FILE',
      `Sequence ${sequence} would file nothing: all ${omitted.length} of this package's leaves are already on file, byte for byte. ` +
        'Change what you intend to file, or withdraw a document explicitly — a sequence that carries no leaf is not a filing.',
    );
  }

  // The operator does not carry identity on what it emits, so a withdrawal gets
  // it back from the document on file that it names.
  const withdrawnKey = (l: { ctdSection: string; fileName: string }) =>
    priorByPath.get(`${l.ctdSection}/${l.fileName}`)?.leafKey;
  return {
    leaves: leaves.map((l) => ({
      ctdSection: l.ctdSection,
      fileName: l.fileName,
      operation: String(l.operation),
      ...(l.modifiedFile ? { modifiedFile: l.modifiedFile } : {}),
      ...(l.operation === 'delete' ? { title: l.title, md5: l.md5 } : {}),
      ...(l.operation === 'delete' && withdrawnKey(l) ? { leafKey: withdrawnKey(l) } : {}),
    })),
    omitted,
    summary,
    staleOnFile: staleOnFile(prior, desired, params.withdraw ?? []),
  };
}
