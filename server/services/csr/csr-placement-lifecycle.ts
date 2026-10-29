/**
 * The eCTD lifecycle of a CSR placed into a later sequence (2026-10-30, D2).
 *
 * A revised CSR is a new assembly: new rendered files, new names (the package
 * name carries the rendered file's id, leaf-file-name.ts). Placed as `new`, it
 * sat beside the earlier report, and both were current at the agency. eCTD
 * wants `replace`, naming the leaf it supersedes.
 *
 * Which earlier leaf a file supersedes is decided by the study and the part of
 * the report, never by file name:
 *   - the study: the leaf's study id (submission_leaves.study_id, which the
 *     placement writes from the job's protocol/study id) and its section;
 *   - the part: the Study Tagging File role (stf_file_tag). Every §16 appendix
 *     has its own role (csr-assembly-plan.ts). The body and the §14 tables share
 *     'study-report', so for those the part is the one the CSR placement that
 *     wrote the leaf recorded (csr_assembly_runs.placement.leaves[].appendix).
 *     A 'study-report' leaf no CSR placement wrote is not identified, and is
 *     listed for the user rather than guessed.
 *
 * Only what is still current counts: an earlier leaf another earlier leaf
 * already replaced or withdrew (parent_leaf_id) is superseded, and a removed
 * leaf or a withdrawal is not a file. Earlier means an earlier sequence of the
 * same application (submission), by sequence number. A delete of an earlier
 * leaf already placed in the target sequence is the user's decision to
 * withdraw it, and it is honoured.
 *
 * What is decided here, before anything is written:
 *   - each part with exactly one current predecessor is a `replace` of it;
 *   - a part with none is `new`;
 *   - a part with more than one current predecessor (two reports placed `new`
 *     beside each other before this existed) is refused: which one this
 *     replaces is not established;
 *   - a current predecessor whose part the new assembly no longer has (or whose
 *     part is not identified) is listed. It is withdrawn only by the user, in
 *     Submission Center; placement is refused until each one is withdrawn there
 *     or confirmed to stay on file (keepOnFile). Nothing is dropped silently,
 *     and nothing is withdrawn on the user's behalf.
 *
 * Review fix (2026-10-30, adversarial review): no Submission Center screen
 * writes a delete that names a parent leaf; a withdrawal written there or by
 * AnA names the document. So a delete in the target (or an earlier) sequence
 * naming the same document is read as that withdrawal too. And the user may
 * choose, on the CSR board, to withdraw such an earlier file in this sequence
 * (`withdraw`): placement then writes the delete, naming the leaf as parent,
 * through upsertLeaf with the user's reason. It is the user's choice per file;
 * nothing is withdrawn that the user did not name. A file left out, or one of
 * an ambiguous pair, is the only thing that may be named.
 */
import type { Queryable } from '../authoring/authoring-evidence.js';
import { CsrAssemblyRunError, type AssemblyLeafSummary } from './csr-assembly-run.js';
import { CSR_BODY_FILE_TAG, CSR_LISTING_APPENDICES, CSR_SUPPLIED_APPENDICES } from './csr-assembly-plan.js';

export interface PriorCsrStudyLeaf {
  leafId: number; sequenceId: number; sequenceNumber: string; title: string; stfFileTag: string;
  /** The part of the report, as the CSR placement that wrote the leaf recorded it; null when none did. */
  appendix: string | null;
  /** A delete of this leaf is already placed in the target sequence. */
  withdrawnHere: boolean;
  /** Where the leaf is and what it points at: what a withdrawal of it names. */
  sectionCode: string; documentTable: string | null; documentId: number | null; studyId: string | null;
}
export interface PriorStudyLeavesArgs {
  organizationId: number; submissionId: number; sequenceId: number; sequenceNumber: string; studyId: string; sectionCodes: string[];
}
export interface LifecycleParent { leafId: number; sequenceNumber: string; title: string }
export interface PlannedLeaf { appendix: string; fileName: string; title: string; operation: 'new' | 'replace'; parent: LifecycleParent | null }
export interface Predecessor { leafId: number; sequenceNumber: string; title: string; part: string }
export interface CsrLifecyclePlan {
  leaves: PlannedLeaf[];
  /** Current earlier files the assembly does not carry, not yet decided. */
  undecided: Predecessor[];
  keptOnFile: Predecessor[];
  /** Current earlier files a delete in the target sequence withdraws. */
  withdrawnHere: Predecessor[];
  /** Current earlier files the user chose to withdraw in this sequence; placement writes each delete. */
  withdrawing: Predecessor[];
  /** Leaf ids the user named to withdraw that are not an earlier file left out or of an ambiguous pair. */
  withdrawInvalid: number[];
  ambiguous: Array<{ part: string; leaves: Predecessor[] }>;
}

/** Each §16 appendix's own STF role, and the part it identifies. */
const ROLE_PART: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(
  [...Object.entries(CSR_SUPPLIED_APPENDICES), ...Object.entries(CSR_LISTING_APPENDICES)].map(([number, tag]) => [tag, number])));
const CSR_ROLES = [CSR_BODY_FILE_TAG, ...Object.keys(ROLE_PART)];

/** The current CSR leaves of a study in the earlier sequences of the target's application. */
export async function readPriorCsrStudyLeaves(q: Queryable, a: PriorStudyLeavesArgs): Promise<PriorCsrStudyLeaf[]> {
  const { rows } = await q.query(`SELECT l.id, l.sequence_id, s.sequence_number, l.title, l.stf_file_tag, l.section_code, l.document_table, l.document_id, l.study_id,
      (SELECT e->>'appendix' FROM csr_assembly_runs r
         CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.placement->'leaves') = 'array' THEN r.placement->'leaves' ELSE '[]'::jsonb END) e
        WHERE r.organization_id = $1 AND e->>'leafId' = l.id::text LIMIT 1) AS appendix,
      EXISTS (SELECT 1 FROM submission_leaves d WHERE d.organization_id = $1 AND d.sequence_id = $3 AND d.lifecycle_op = 'delete' AND d.deleted_at IS NULL
        AND (d.parent_leaf_id = l.id OR (d.document_table = l.document_table AND d.document_id = l.document_id))) AS withdrawn_here
    FROM submission_leaves l JOIN ectd_sequences s ON s.id = l.sequence_id AND s.organization_id = l.organization_id
    WHERE l.organization_id = $1 AND s.submission_id = $2 AND s.sequence_number < $4 AND s.deleted_at IS NULL AND l.deleted_at IS NULL
      AND l.lifecycle_op <> 'delete' AND l.study_id = $5 AND lower(btrim(l.section_code)) = ANY($6::text[]) AND l.stf_file_tag = ANY($7::text[])
      AND NOT EXISTS (SELECT 1 FROM submission_leaves x JOIN ectd_sequences xs ON xs.id = x.sequence_id AND xs.organization_id = x.organization_id
        WHERE x.organization_id = $1 AND x.deleted_at IS NULL AND xs.submission_id = $2 AND xs.sequence_number < $4 AND xs.deleted_at IS NULL
          AND (x.parent_leaf_id = l.id OR (x.lifecycle_op = 'delete' AND xs.sequence_number > s.sequence_number
            AND x.document_table = l.document_table AND x.document_id = l.document_id)))
    ORDER BY s.sequence_number DESC, l.id`,
  [a.organizationId, a.submissionId, a.sequenceId, a.sequenceNumber, a.studyId, a.sectionCodes.map(c => c.trim().toLowerCase()), CSR_ROLES]);
  return (rows as Array<Record<string, unknown>>).map(r => ({ leafId: Number(r.id), sequenceId: Number(r.sequence_id), sequenceNumber: String(r.sequence_number),
    title: String(r.title ?? ''), stfFileTag: String(r.stf_file_tag), appendix: r.appendix == null ? null : String(r.appendix), withdrawnHere: r.withdrawn_here === true,
    sectionCode: String(r.section_code), documentTable: r.document_table == null ? null : String(r.document_table),
    documentId: r.document_id == null ? null : Number(r.document_id), studyId: r.study_id == null ? null : String(r.study_id) }));
}

/** The part of the report a prior leaf is, or null when it is not identified. */
function partOf(p: PriorCsrStudyLeaf): string | null {
  return p.appendix ?? ROLE_PART[p.stfFileTag] ?? null;
}

export function partLabel(part: string): string {
  if (part === 'body') return 'the report body';
  if (part === '14') return 'the Section 14 tables';
  return part.startsWith('16') ? `appendix ${part}` : part;
}

const predecessor = (p: PriorCsrStudyLeaf): Predecessor =>
  ({ leafId: p.leafId, sequenceNumber: p.sequenceNumber, title: p.title, part: partOf(p) ?? `an unidentified ${p.stfFileTag} file` });

/** Each file's operation against the current earlier files, the ambiguous parts, and the earlier files left out. */
function assess(leaves: readonly AssemblyLeafSummary[], current: readonly PriorCsrStudyLeaf[]) {
  const byPart = new Map<string, PriorCsrStudyLeaf[]>();
  for (const p of current) {
    const part = partOf(p);
    if (part) byPart.set(part, [...(byPart.get(part) ?? []), p]);
  }
  const ambiguous: CsrLifecyclePlan['ambiguous'] = [];
  const planned = leaves.map((leaf): PlannedLeaf => {
    const found = byPart.get(leaf.appendix) ?? [];
    if (found.length > 1) ambiguous.push({ part: leaf.appendix, leaves: found.map(predecessor) });
    const parent = found.length === 1 ? { leafId: found[0].leafId, sequenceNumber: found[0].sequenceNumber, title: found[0].title } : null;
    return { appendix: leaf.appendix, fileName: leaf.fileName, title: leaf.title, operation: parent ? 'replace' : 'new', parent };
  });
  const carried = new Set(leaves.map(l => l.appendix));
  const leftOut = current.filter(p => { const part = partOf(p); return !part || !carried.has(part); }).map(predecessor);
  return { planned, ambiguous, leftOut };
}

export interface CsrLifecycleDecisions { keepOnFile: readonly number[]; withdraw?: readonly number[] }

/** The operation of each file, and what is left for the user to decide. Pure. */
export function planCsrLifecycle(leaves: readonly AssemblyLeafSummary[], prior: readonly PriorCsrStudyLeaf[], { keepOnFile, withdraw = [] }: CsrLifecycleDecisions): CsrLifecyclePlan {
  const current = prior.filter(p => !p.withdrawnHere);
  // What the user may withdraw here: an earlier file left out, or one of an ambiguous pair.
  const before = assess(leaves, current);
  const eligible = new Set([...before.leftOut, ...before.ambiguous.flatMap(a => a.leaves)].map(p => p.leafId));
  const already = new Set(prior.filter(p => p.withdrawnHere).map(p => p.leafId));
  const chosen = new Set(withdraw.filter(id => eligible.has(id)));
  const { planned, ambiguous, leftOut } = assess(leaves, current.filter(p => !chosen.has(p.leafId)));
  const kept = new Set(keepOnFile);
  return { leaves: planned, ambiguous, undecided: leftOut.filter(p => !kept.has(p.leafId)), keptOnFile: leftOut.filter(p => kept.has(p.leafId)),
    withdrawnHere: prior.filter(p => p.withdrawnHere).map(predecessor),
    withdrawing: current.filter(p => chosen.has(p.leafId)).map(predecessor),
    withdrawInvalid: withdraw.filter(id => !eligible.has(id) && !already.has(id)) };
}

function parseLeafIds(raw: unknown, code: string, what: string): number[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some(v => !Number.isInteger(v) || Number(v) <= 0)) {
    throw new CsrAssemblyRunError(code, 400, `Name each earlier file that ${what} by its leaf id. Nothing was placed.`);
  }
  return [...new Set(raw as number[])];
}

/** keepOnFile from the request: absent, or leaf ids. */
export function parseKeepOnFile(raw: unknown): number[] {
  return parseLeafIds(raw, 'CSR_PLACEMENT_KEEP_ON_FILE_INVALID', 'stays on file');
}

/** withdraw from the request: absent, or leaf ids the user chose to withdraw in this sequence. */
export function parseWithdraw(raw: unknown): number[] {
  return parseLeafIds(raw, 'CSR_PLACEMENT_WITHDRAW_INVALID', 'is withdrawn in this sequence');
}

const named = (p: Predecessor) => `${partLabel(p.part)} (${p.title}), sequence ${p.sequenceNumber}, leaf ${p.leafId}`;

/** Why this plan cannot be placed, or null. Checked before anything is written. */
export function lifecycleRefusal(plan: CsrLifecyclePlan, studyId: string, keepOnFile: readonly number[]): { code: string; status: number; message: string } | null {
  const both = plan.withdrawing.filter(p => keepOnFile.includes(p.leafId)).map(p => p.leafId);
  if (plan.withdrawInvalid.length || both.length) {
    return { code: 'CSR_PLACEMENT_WITHDRAW_INVALID', status: 400, message: both.length
      ? `Leaf ${both.join(', ')} is named both to stay on file and to be withdrawn. Choose one. Nothing was placed.`
      : `Leaf ${plan.withdrawInvalid.join(', ')} is not an earlier CSR file of study ${studyId} that this assembly leaves out or that shares a part with another, `
        + 'so it cannot be withdrawn by this placement. Nothing was placed.' };
  }
  const leftOut = new Set([...plan.undecided, ...plan.keptOnFile].map(p => p.leafId));
  const stray = keepOnFile.filter(id => !leftOut.has(id));
  if (stray.length) {
    return { code: 'CSR_PLACEMENT_KEEP_ON_FILE_INVALID', status: 400, message: `Leaf ${stray.join(', ')} is not an earlier CSR file of study ${studyId} that this assembly leaves out, `
      + 'so it cannot be kept on file by this placement. Nothing was placed.' };
  }
  if (plan.ambiguous.length) {
    const each = plan.ambiguous.map(a => `${partLabel(a.part)}: ${a.leaves.map(l => `leaf ${l.leafId} in sequence ${l.sequenceNumber}`).join(' and ')}`).join('; ');
    return { code: 'CSR_PLACEMENT_PREDECESSOR_AMBIGUOUS', status: 409, message: `Study ${studyId} has more than one current file for the same part of its report in earlier sequences (${each}). `
      + 'Which one this file replaces is not established. Choose to withdraw the one that is no longer current in this sequence, then place again. Nothing was placed.' };
  }
  if (plan.undecided.length) {
    return { code: 'CSR_PLACEMENT_PREDECESSOR_UNDECIDED', status: 409, message: `Earlier CSR files of study ${studyId} are not in this assembly: ${plan.undecided.map(named).join('; ')}. `
      + 'Each stays current at the agency unless it is withdrawn. Choose, for each, to withdraw it in this sequence or that it stays on file, then place again. Nothing was placed.' };
  }
  return null;
}
