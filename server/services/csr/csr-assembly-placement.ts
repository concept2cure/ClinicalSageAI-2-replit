/**
 * Place an assembled CSR's leaves into a sequence of its program (2026-10-30,
 * reach of slice 8).
 *
 * Every leaf goes through the canonical leaf writer, submission-service
 * upsertLeaf, pointing at the rendered_leaf_files row the assembly retained
 * (rendered-leaf-files.ts leafSourceFor), under Module 5.3.5.x with the leaf's
 * study id and Study Tagging File role. That writer already refuses a frozen or
 * dispatched sequence, re-checks the document's organization and pins its
 * digest; this module adds what only a CSR knows, before anything is written:
 *
 *   - the sequence must be open (not frozen, not dispatched, not transmitted)
 *     and belong to a submission anchored to the build's own program;
 *   - no blocking appendix may be missing. A §16 appendix E3 requires is either
 *     supplied, generated, or declared not applicable with a reason; the
 *     declaration is made on the assembly (so the body's §16 list says so) and
 *     recorded with who made it and when, and is carried onto the placement;
 *   - the assembly's own checks (structure, every listing against its source)
 *     must have passed, and every table or listing the body cites must be in it;
 *   - the build must be complete (an assembly of a build still drafting, or a
 *     failed one, is a partial draft);
 *   - the assembly must be of the build as it is now: its job fingerprint (the
 *     import's, over every section, its hash and the gaps) must equal the
 *     job's current one, so a section edited, redrafted or re-approved after
 *     the assembly cannot be filed in its old form (2026-10-30 follow-up);
 *   - no drafted section the body draws may keep a data placeholder
 *     (csr-placeholders.ts). A heading E3 leaves to the sponsor (§15) that is
 *     not supplied stays a listed gap and does not block.
 *
 * A placement is claimed on the assembly row first, so two placements of one
 * assembly cannot both run. Each placed leaf refreshes the claim; a claim with
 * no progress for STALL_MINUTES was left by a worker that stopped, reads as
 * 'interrupted', and is placed again, as a 'partial' one is, into the same
 * sequence only. Placing again is idempotent: the canonical writer returns the
 * live leaf for a document already placed in that section (upsertLeaf
 * sameDocumentLeafInSection), so no file is placed twice. A writer refusal
 * part-way is recorded as it happened, naming the leaves already placed;
 * nothing is claimed that did not happen.
 *
 * Lifecycle (2026-10-30, csr-placement-lifecycle.ts): when an earlier sequence
 * of the same application already holds this study's CSR files, each file is
 * placed as a `replace` of the current one for the same part of the report,
 * naming it as its parent leaf; a part with no predecessor is `new`; an earlier
 * file the assembly no longer has is listed and refused until the user
 * withdraws it in Submission Center or confirms it stays on file (keepOnFile).
 * A placement whose partly placed files were withdrawn
 * (csr-placement-withdraw.ts) may be placed afresh, into any open sequence.
 * The user may instead choose, per earlier file, to withdraw it in this
 * sequence (`withdraw`): after the claim and before any CSR file, each is
 * written as a `delete` naming that leaf as parent and pointing at its
 * document, through upsertLeaf with the user's reason (review fix, 2026-10-30).
 */
import type { Queryable } from '../authoring/authoring-evidence.js';
import { CsrAssemblyRunError, readCsrAssembly, readCsrJobBinding, STALL_MINUTES, type AssemblySummary, type CsrAssemblyRunRow } from './csr-assembly-run.js';
import { lifecycleRefusal, parseKeepOnFile, parseWithdraw, planCsrLifecycle, type CsrLifecycleDecisions, type CsrLifecyclePlan, type PriorCsrStudyLeaf, type PriorStudyLeavesArgs } from './csr-placement-lifecycle.js';
import { csrAssemblyFileTag } from './csr-assembly-plan.js';

export interface PlacementSequence { id: number; submissionId: number; sequenceNumber: string; status: string; dispatchStatus?: string | null }
export interface CsrPlacementDeps {
  getSequence(id: number, ctx: { organizationId: number }): Promise<PlacementSequence>;
  submissionProgram(submissionId: number, organizationId: number): Promise<{ programId: string | null; title: string } | null>;
  upsertLeaf(input: Record<string, unknown>, ctx: { organizationId: number; userId: number }): Promise<{ id: number }>;
  /** The canonical leaf remover (submission-service removeLeaf): soft delete, sequence lock, LEAF_REMOVED audit row with the reason. */
  removeLeaf(leafId: number, sequenceId: number, ctx: { organizationId: number; userId: number }, reason: string): Promise<{ leafId: number; auditTrail?: unknown }>;
  /** The study's current CSR leaves in earlier sequences of the application (csr-placement-lifecycle.ts readPriorCsrStudyLeaves). */
  priorStudyLeaves(args: PriorStudyLeavesArgs): Promise<PriorCsrStudyLeaf[]>;
}
export interface PlaceCsrAssemblyInput {
  organizationId: number; userId: number; jobId: number; assemblyId: number; sequenceId: number; reason: unknown;
  /** Leaf ids of earlier CSR files this assembly leaves out that the user confirms stay on file. */
  keepOnFile?: unknown;
  /** Leaf ids of earlier CSR files (left out, or of an ambiguous pair) the user chooses to withdraw in this sequence. */
  withdraw?: unknown;
}

/** Statuses a leaf may still be written into; a sent or acknowledged dispatch is transmitted even before its status moves. */
const OPEN_STATUSES = new Set(['draft', 'assembling', 'validated']);
const TRANSMITTED = new Set(['sent', 'acknowledged']);
const refuse = (code: string, status: number, message: string): never => { throw new CsrAssemblyRunError(code, status, message); };

/** The program's sequences a CSR may be placed into: open, in a submission anchored to that program. */
export async function listCsrPlacementTargets(q: Queryable, organizationId: number, jobId: number) {
  const { programId } = await readCsrJobBinding(q, organizationId, jobId);
  const { rows } = await q.query(`SELECT s.id, s.sequence_number, s.status, s.region, s.submission_id, sub.title AS submission_title, sub.application_type
    FROM ectd_sequences s JOIN submissions sub ON sub.id = s.submission_id AND sub.organization_id = s.organization_id
    WHERE s.organization_id = $1 AND sub.program_id = $2 AND s.deleted_at IS NULL AND sub.deleted_at IS NULL
      AND s.status IN ('draft', 'assembling', 'validated') AND (s.dispatch_status IS NULL OR s.dispatch_status NOT IN ('sent', 'acknowledged'))
    ORDER BY sub.title, s.sequence_number, s.id LIMIT 100`, [organizationId, programId]);
  return (rows as Array<Record<string, unknown>>).map(r => ({ sequenceId: Number(r.id), sequenceNumber: String(r.sequence_number), status: String(r.status), region: String(r.region),
    submissionId: Number(r.submission_id), submissionTitle: String(r.submission_title), applicationType: String(r.application_type) }));
}

async function openSequenceOfProgram(deps: CsrPlacementDeps, input: Pick<PlaceCsrAssemblyInput, 'organizationId' | 'sequenceId'>, programId: string): Promise<PlacementSequence> {
  let seq: PlacementSequence;
  try { seq = await deps.getSequence(input.sequenceId, { organizationId: input.organizationId }); } catch {
    return refuse('CSR_PLACEMENT_SEQUENCE_NOT_FOUND', 404, 'That sequence was not found in this organization. Nothing was placed.');
  }
  if (!OPEN_STATUSES.has(seq.status) || TRANSMITTED.has(String(seq.dispatchStatus ?? ''))) {
    const state = TRANSMITTED.has(String(seq.dispatchStatus ?? '')) ? 'transmitted' : seq.status;
    refuse('CSR_PLACEMENT_SEQUENCE_LOCKED', 409, `Sequence ${seq.sequenceNumber} is ${state}; its leaves cannot change. Place the CSR into an open sequence. Nothing was placed.`);
  }
  const submission = await deps.submissionProgram(seq.submissionId, input.organizationId);
  if (!submission?.programId) refuse('CSR_PLACEMENT_UNANCHORED_SUBMISSION', 409, 'This sequence’s submission is not anchored to a project, so a project’s CSR cannot be placed in it. Nothing was placed.');
  if (submission!.programId !== programId) refuse('CSR_PLACEMENT_OTHER_PROJECT', 409, 'This sequence belongs to another project’s submission. A CSR is placed only into its own project’s filing. Nothing was placed.');
  return seq;
}

type Refusal = { code: string; message: string } | null;
interface PlacedLeaf { appendix: string; leafId: number; fileName: string }
/** A placement that may be placed again: refused part-way, or left by a worker that stopped. */
const RESUMABLE = new Set(['partial', 'interrupted']);

function placementStateRefusal(placement: Record<string, unknown> | null): Refusal {
  if (!placement || RESUMABLE.has(String(placement.state)) || placement.state === 'withdrawn') return null;
  if (placement.state === 'placing') return { code: 'CSR_PLACEMENT_ALREADY_PLACED', message: `This assembly is being placed in sequence ${String(placement.sequenceNumber)}. Nothing more was placed.` };
  return { code: 'CSR_PLACEMENT_ALREADY_PLACED', message: 'This assembly has already been placed. Assemble again to place a new version.' };
}

/** The body's own fitness: what it cites must be in the assembly, and no drafted section may keep a data placeholder. */
function bodyRefusal(result: AssemblySummary): Refusal {
  // A reference the body cites (a §14 table, a §16 listing) that names nothing in the assembly is left as unlinked text; filed, it cites a file the reader cannot find.
  const unlinked = [...new Set(result.unresolvedReferences.map(r => r.reference))];
  if (unlinked.length) {
    return { code: 'CSR_PLACEMENT_UNRESOLVED_REFERENCE', message: `The report body cites ${unlinked.slice(0, 10).join(', ')}${unlinked.length > 10 ? ` and ${unlinked.length - 10} more` : ''}, `
      + 'which this assembly does not contain. Correct the section text or supply the file, and assemble again. Nothing was placed.' };
  }
  if (!Array.isArray(result.placeholderSections)) {
    return { code: 'CSR_PLACEMENT_ASSEMBLY_STALE', message: 'This assembly was made before its sections were checked for data placeholders. Assemble again. Nothing was placed.' };
  }
  if (result.placeholderSections.length) {
    const named = result.placeholderSections.map(c => `Section ${c}`).join(', ');
    return { code: 'CSR_PLACEMENT_BODY_PLACEHOLDER', message: `${named} still ${result.placeholderSections.length === 1 ? 'holds' : 'hold'} a data placeholder (text in square brackets, such as [DATA TO BE INSERTED]), `
      + 'which the body prints as written. Supply the data, redraft or edit the section, and assemble again. Nothing was placed.' };
  }
  return null;
}

/** A retained assembly keeps the roles it was made with; never relabel it at placement. */
function stfRoleRefusal(result: AssemblySummary): Refusal {
  const outdated = result.leaves.filter(leaf => {
    const expected = typeof leaf.appendix === 'string' ? csrAssemblyFileTag(leaf.appendix) : undefined;
    return expected === undefined || leaf.fileTag !== expected;
  });
  if (!outdated.length) return null;
  return { code: 'CSR_PLACEMENT_STF_ROLE_STALE', message: `The assembled Study Tagging File roles do not match the current CSR plan for ${outdated.map(leaf => String(leaf.appendix)).join(', ')}. `
    + 'Assemble again to apply the current CSR roles. Existing assembled files are preserved. Nothing was placed.' };
}

/** The assembly must be finished, not already placed or being placed, free of blocking gaps, and its own checks must have passed. */
export function placementRefusal(run: CsrAssemblyRunRow): Refusal {
  if (run.status !== 'assembled' || !run.result) return { code: 'CSR_PLACEMENT_NOT_ASSEMBLED', message: 'This assembly has not finished. Nothing was placed.' };
  const state = placementStateRefusal(run.placement);
  if (state) return state;
  const result: AssemblySummary = run.result;
  const blocking = result.missing.filter(m => m.blocking);
  if (blocking.length) {
    return { code: 'CSR_PLACEMENT_BLOCKING_APPENDIX', message: `${blocking.map(m => `Appendix ${m.number} (${m.title})`).join('; ')} ${blocking.length === 1 ? 'is' : 'are'} missing. `
      + 'Supply each one, or declare it not applicable with a reason and assemble again. Nothing was placed.' };
  }
  if (!result.structure.ok) return { code: 'CSR_PLACEMENT_STRUCTURE_FAILED', message: `The assembled files failed their bookmark and link check (${result.structure.findings.length} finding(s)). Nothing was placed.` };
  const unverified = result.listings.filter(l => !l.verified).map(l => l.number);
  if (unverified.length) return { code: 'CSR_PLACEMENT_LISTING_UNVERIFIED', message: `Listing ${unverified.join(', ')} does not agree with its source. Nothing was placed.` };
  const body = bodyRefusal(result);
  if (body) return body;
  const roles = stfRoleRefusal(result);
  if (roles) return roles;
  if (!result.leaves.length) return { code: 'CSR_PLACEMENT_NO_LEAVES', message: 'The assembly produced no file to place. Nothing was placed.' };
  return null;
}

/**
 * The assembly must be of the build as it is now. The fingerprint is the
 * import's (workflow-source-import.ts), over every saved section, its content
 * hash, the job's status and the gaps, re-read now as the signed-in user.
 */
async function staleRefusal(q: Queryable, input: PlaceCsrAssemblyInput, binding: { programId: string; projectId: number }, run: CsrAssemblyRunRow): Promise<Refusal> {
  let current: string;
  try {
    // Loaded here, as the assembler loads it (csr-assembly-source.ts): the import's own checks re-read the sections as this user.
    const { materializeCsrAssemblySource } = await import('../authoring/workflow-source-import.js');
    current = (await materializeCsrAssemblySource({ organizationId: input.organizationId, userId: input.userId,
      target: { programId: binding.programId, projectId: binding.projectId }, source: { kind: 'csr', jobId: input.jobId } }, q)).fingerprint;
  } catch (err) {
    return { code: 'CSR_PLACEMENT_SOURCE_UNVERIFIED', message: `The build’s sections could not be re-read to confirm this assembly is current: ${err instanceof Error ? err.message : String(err)} Nothing was placed.` };
  }
  if (run.result?.jobFingerprint === current) return null;
  return { code: 'CSR_PLACEMENT_ASSEMBLY_STALE', message: 'The build’s sections have changed since this assembly was made (a section was edited, redrafted or re-reviewed). '
    + 'Assemble again so the filed report is the build as it is now. Nothing was placed.' };
}

/** Placing again goes into the sequence the earlier attempt wrote into, or nowhere: its leaves may already be there. */
function resumeRefusal(run: CsrAssemblyRunRow, seq: PlacementSequence): Refusal {
  const earlier = run.placement;
  if (!earlier || earlier.state === 'withdrawn' || Number(earlier.sequenceId) === seq.id) return null;
  return { code: 'CSR_PLACEMENT_RESUME_SEQUENCE', message: `This assembly was partly placed in sequence ${String(earlier.sequenceNumber)}. Place it again into that sequence to finish, `
    + 'or assemble again to place a new version elsewhere. Nothing was placed.' };
}

/** Claim the placement: a fresh one, or one refused part-way or left by a stopped worker in this same sequence. */
async function claimPlacement(q: Queryable, input: PlaceCsrAssemblyInput, seq: PlacementSequence, claim: Record<string, unknown>): Promise<boolean> {
  const { rows } = await q.query(`UPDATE csr_assembly_runs SET placement = $4::jsonb, updated_at = now()
    WHERE id = $1 AND organization_id = $2 AND job_id = $3 AND status = 'assembled' AND (placement IS NULL OR placement->>'state' = 'withdrawn' OR (
      placement->>'sequenceId' = $5 AND (placement->>'state' = 'partial'
        OR (placement->>'state' = 'placing' AND updated_at < now() - make_interval(mins => $6::int)))))
    RETURNING id`, [input.assemblyId, input.organizationId, input.jobId, JSON.stringify(claim), String(seq.id), STALL_MINUTES]);
  return rows.length === 1;
}

async function recordPlacement(q: Queryable, input: PlaceCsrAssemblyInput, placement: Record<string, unknown> | null): Promise<void> {
  await q.query(`UPDATE csr_assembly_runs SET placement = $3::jsonb, updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [input.assemblyId, input.organizationId, placement === null ? null : JSON.stringify(placement)]);
}

/** Every leaf placed so far, the earlier attempt's included, once each. */
function mergePlaced(earlier: unknown, placed: PlacedLeaf[]): PlacedLeaf[] {
  const all = new Map<number, PlacedLeaf>();
  for (const leaf of [...(Array.isArray(earlier) ? earlier as PlacedLeaf[] : []), ...placed]) all.set(leaf.leafId, leaf);
  return [...all.values()];
}

async function writeLeaves(q: Queryable, deps: CsrPlacementDeps, input: PlaceCsrAssemblyInput, run: CsrAssemblyRunRow, { claim, plan }: { claim: Record<string, unknown>; plan: CsrLifecyclePlan }) {
  const placed: PlacedLeaf[] = [];
  const earlier = run.placement?.state === 'withdrawn' ? [] : run.placement?.leaves;
  for (const [i, leaf] of run.result!.leaves.entries()) {
    const { operation, parent } = plan.leaves[i];
    try {
      const written = await deps.upsertLeaf({ sequenceId: claim.sequenceId, sectionCode: `m${leaf.ctdSection}`, title: leaf.title, lifecycleOp: operation, parentLeafId: parent?.leafId ?? null,
        documentTable: 'rendered_leaf_files', documentId: leaf.renderedLeafFileId, checksum: leaf.md5, studyId: leaf.studyId, stfFileTag: leaf.fileTag, reason: claim.reason },
      { organizationId: input.organizationId, userId: input.userId });
      placed.push({ appendix: leaf.appendix, leafId: written.id, fileName: leaf.fileName });
      // Progress on the claim: a worker that stops mid-way leaves a record of what it placed, and a live claim does not expire.
      await recordPlacement(q, input, { ...claim, leaves: mergePlaced(earlier, placed) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const leaves = mergePlaced(earlier, placed);
      const withdrew = Array.isArray(claim.withdrawals) ? claim.withdrawals as Array<{ parentLeafId: number }> : [];
      await recordPlacement(q, input, leaves.length || withdrew.length ? { ...claim, state: 'partial', placedAt: new Date().toISOString(), leaves, failedAt: leaf.fileName, error: message } : null);
      const before = withdrew.length ? ` The withdrawal of leaf ${withdrew.map(w => w.parentLeafId).join(', ')} chosen for this sequence was written.` : '';
      refuse('CSR_PLACEMENT_REFUSED', 409, `${leaf.fileName} was not placed: ${message} ${leaves.length ? `${leaves.length} file(s) before it were placed: ${leaves.map(p => p.fileName).join(', ')}.` : withdrew.length ? 'No CSR file was placed.' : 'Nothing was placed.'}${before}`);
    }
  }
  return mergePlaced(earlier, placed);
}

/** Each file's operation against the study's current files in the application's earlier sequences. */
async function lifecyclePlan(deps: CsrPlacementDeps, input: { organizationId: number }, run: CsrAssemblyRunRow, seq: PlacementSequence, decisions: CsrLifecycleDecisions) {
  const leaves = run.result?.leaves ?? [];
  const studyId = run.result?.studyId || leaves[0]?.studyId || '';
  const prior = studyId ? await deps.priorStudyLeaves({ organizationId: input.organizationId, submissionId: seq.submissionId, sequenceId: seq.id,
    sequenceNumber: seq.sequenceNumber, studyId, sectionCodes: [...new Set(leaves.map(l => `m${l.ctdSection}`))] }) : [];
  return { studyId, prior, plan: planCsrLifecycle(leaves, prior, decisions) };
}

/** The claim, with the withdrawals written for it when there were any. */
const withWithdrawals = (claim: Record<string, unknown>, withdrawals: unknown[]) => (withdrawals.length ? { ...claim, withdrawals } : claim);

/** Write the delete of each earlier file the user chose to withdraw here; a refusal part-way says which were written. */
async function writeWithdrawals(q: Queryable, deps: CsrPlacementDeps, input: PlaceCsrAssemblyInput, run: CsrAssemblyRunRow, ctx: { claim: Record<string, unknown>; prior: PriorCsrStudyLeaf[]; plan: CsrLifecyclePlan }) {
  const chosen = new Set(ctx.plan.withdrawing.map(p => p.leafId));
  const written: Array<{ leafId: number; parentLeafId: number }> = [];
  for (const p of ctx.prior.filter(x => chosen.has(x.leafId))) {
    try {
      const out = await deps.upsertLeaf({ sequenceId: ctx.claim.sequenceId, sectionCode: p.sectionCode, title: p.title, lifecycleOp: 'delete', parentLeafId: p.leafId,
        documentTable: p.documentTable, documentId: p.documentId, studyId: p.studyId, stfFileTag: p.stfFileTag, reason: ctx.claim.reason },
      { organizationId: input.organizationId, userId: input.userId });
      written.push({ leafId: out.id, parentLeafId: p.leafId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const earlier = run.placement?.state !== 'withdrawn' && Array.isArray(run.placement?.leaves) ? run.placement!.leaves as PlacedLeaf[] : [];
      await recordPlacement(q, input, earlier.length ? { ...ctx.claim, state: 'partial', placedAt: new Date().toISOString(), leaves: earlier, withdrawals: written, error: message } : null);
      refuse('CSR_PLACEMENT_REFUSED', 409, `Leaf ${p.leafId} (${p.title}) was not withdrawn in this sequence: ${message} `
        + (written.length ? `The withdrawal of leaf ${written.map(w => w.parentLeafId).join(', ')} was written before it. No CSR file was placed.` : 'Nothing was placed.'));
    }
  }
  return written;
}

/** What the record says the lifecycle did: each replace and its parent, and the user's decisions on files left out. */
function lifecycleRecord(plan: CsrLifecyclePlan) {
  return { replaced: plan.leaves.filter(l => l.parent).map(l => ({ appendix: l.appendix, parentLeafId: l.parent!.leafId, parentSequenceNumber: l.parent!.sequenceNumber })),
    keptOnFile: plan.keptOnFile, withdrawnHere: plan.withdrawnHere, withdrawing: plan.withdrawing };
}

/** Before placing: each file's operation and the leaf it replaces, and the earlier files left for the user to decide. Writes nothing. */
export async function previewCsrPlacementLifecycle(q: Queryable, deps: CsrPlacementDeps, input: Omit<PlaceCsrAssemblyInput, 'reason'>): Promise<CsrLifecyclePlan & { studyId: string }> {
  const run = await readCsrAssembly(q, input.organizationId, input.jobId, input.assemblyId);
  if (!run?.result) return refuse('CSR_ASSEMBLY_NOT_FOUND', 404, 'Assembly not found, or not finished.');
  const binding = await readCsrJobBinding(q, input.organizationId, input.jobId);
  const seq = await openSequenceOfProgram(deps, input, binding.programId);
  const { studyId, plan } = await lifecyclePlan(deps, input, run, seq, { keepOnFile: parseKeepOnFile(input.keepOnFile), withdraw: parseWithdraw(input.withdraw) });
  return { ...plan, studyId };
}

/** Place every leaf of an assembly into an open sequence of its program, as the signed-in user. */
export async function placeCsrAssembly(q: Queryable, deps: CsrPlacementDeps, input: PlaceCsrAssemblyInput) {
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 8) refuse('CSR_PLACEMENT_REASON_REQUIRED', 400, 'Say why these files are placed in this sequence (at least 8 characters). Nothing was placed.');
  const keepOnFile = parseKeepOnFile(input.keepOnFile);
  const withdraw = parseWithdraw(input.withdraw);
  const run = await readCsrAssembly(q, input.organizationId, input.jobId, input.assemblyId);
  if (!run) return refuse('CSR_ASSEMBLY_NOT_FOUND', 404, 'Assembly not found.');
  const binding = await readCsrJobBinding(q, input.organizationId, input.jobId);
  // An assembly of a build still drafting, or one that failed, is a partial draft: it can be read on the board, never filed.
  if (binding.status !== 'complete') refuse('CSR_PLACEMENT_BUILD_INCOMPLETE', 409, `This CSR build is ${binding.status}, so its assembly is a partial draft. Place it once the build is complete. Nothing was placed.`);
  const seq = await openSequenceOfProgram(deps, input, binding.programId);
  const refusal = placementRefusal(run) ?? resumeRefusal(run, seq) ?? await staleRefusal(q, input, binding, run);
  if (refusal) refuse(refusal.code, 409, refusal.message);
  const { studyId, prior, plan } = await lifecyclePlan(deps, input, run, seq, { keepOnFile, withdraw });
  const undecided = lifecycleRefusal(plan, studyId, keepOnFile);
  if (undecided) refuse(undecided.code, undecided.status, undecided.message);
  const claim = { state: 'placing', sequenceId: seq.id, sequenceNumber: seq.sequenceNumber, placedBy: input.userId, startedAt: new Date().toISOString(), reason,
    declarations: run.notApplicable, lifecycle: lifecycleRecord(plan),
    leaves: run.placement?.state !== 'withdrawn' && Array.isArray(run.placement?.leaves) ? run.placement!.leaves : [] };
  if (!await claimPlacement(q, input, seq, claim)) refuse('CSR_PLACEMENT_ALREADY_PLACED', 409, 'This assembly is already being placed or has been placed. Nothing more was placed.');
  const written = withWithdrawals(claim, await writeWithdrawals(q, deps, input, run, { claim, prior, plan }));
  const leaves = await writeLeaves(q, deps, input, run, { claim: written, plan });
  const placement = { ...written, state: 'placed', placedAt: new Date().toISOString(), leaves };
  await recordPlacement(q, input, placement);
  return placement;
}
