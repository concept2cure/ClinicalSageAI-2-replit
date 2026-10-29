/**
 * Withdraw the partly placed CSR files (2026-10-30, D2).
 *
 * A placement refused part-way (or left by a worker that stopped) is finished
 * by placing again into the same sequence. But when the build is edited in
 * between, placing again is refused as stale (csr-assembly-placement.ts
 * staleRefusal), and the files the first attempt placed stay in the open
 * sequence; a new assembly placed there would sit beside them.
 *
 * This removes exactly those files and nothing else:
 *   - only a placement that is partial or interrupted (never one placed in
 *     full: a placed file is withdrawn leaf by leaf in Submission Center);
 *   - only the leaves the placement record names, and of those only the ones
 *     still live in that sequence and still pointing at one of this assembly's
 *     own rendered files (a leaf re-pointed or removed since is left, and said);
 *   - only while that sequence is open: a frozen, dispatched or transmitted
 *     sequence keeps its leaves;
 *   - each through the canonical remover (submission-service removeLeaf), which
 *     takes the sequence lock, soft-deletes, and writes the LEAF_REMOVED audit
 *     row with the user's reason. The withdrawal itself is recorded on the
 *     assembly with who, when, why and what was removed.
 * The withdrawal is claimed on the row first, so two cannot run at once, and a
 * removal refused part-way is recorded as it happened.
 */
import type { Queryable } from '../authoring/authoring-evidence.js';
import { CsrAssemblyRunError, readCsrAssembly, STALL_MINUTES, type CsrAssemblyRunRow } from './csr-assembly-run.js';
import type { CsrPlacementDeps, PlacementSequence } from './csr-assembly-placement.js';

export interface WithdrawCsrPlacementInput { organizationId: number; userId: number; jobId: number; assemblyId: number; reason: unknown }
interface PlacedLeaf { appendix: string; leafId: number; fileName: string }

const OPEN_STATUSES = new Set(['draft', 'assembling', 'validated']);
const TRANSMITTED = new Set(['sent', 'acknowledged']);
const refuse = (code: string, status: number, message: string): never => { throw new CsrAssemblyRunError(code, status, message); };

function notPartialMessage(placement: Record<string, unknown> | null): string {
  if (!placement) return 'This assembly has not been placed, so there is nothing to withdraw. Nothing was withdrawn.';
  if (placement.state === 'placed') {
    return `This assembly was placed in full in sequence ${String(placement.sequenceNumber)}. A placed file is withdrawn leaf by leaf in Submission Center, with its reason. Nothing was withdrawn.`;
  }
  if (placement.state === 'withdrawn') return 'The partly placed files of this assembly have already been withdrawn. Nothing more was withdrawn.';
  return `This assembly is being placed in sequence ${String(placement.sequenceNumber)}. Nothing was withdrawn.`;
}

async function openSequence(deps: CsrPlacementDeps, input: WithdrawCsrPlacementInput, sequenceId: number): Promise<PlacementSequence> {
  let seq: PlacementSequence;
  try { seq = await deps.getSequence(sequenceId, { organizationId: input.organizationId }); } catch {
    return refuse('CSR_PLACEMENT_SEQUENCE_NOT_FOUND', 404, 'The sequence these files were placed in was not found in this organization. Nothing was withdrawn.');
  }
  const transmitted = TRANSMITTED.has(String(seq.dispatchStatus ?? ''));
  if (!OPEN_STATUSES.has(seq.status) || transmitted) {
    refuse('CSR_PLACEMENT_SEQUENCE_LOCKED', 409, `Sequence ${seq.sequenceNumber} is ${transmitted ? 'transmitted' : seq.status}; its leaves cannot change, so the partly placed CSR files stay. Nothing was withdrawn.`);
  }
  return seq;
}

/** Claim the withdrawal: a partial placement, or a placing one left by a stopped worker. */
async function claimWithdrawal(q: Queryable, input: WithdrawCsrPlacementInput): Promise<boolean> {
  const { rows } = await q.query(`UPDATE csr_assembly_runs SET placement = jsonb_set(placement, '{state}', '"withdrawing"'), updated_at = now()
    WHERE id = $1 AND organization_id = $2 AND job_id = $3 AND (placement->>'state' = 'partial'
      OR (placement->>'state' = 'placing' AND updated_at < now() - make_interval(mins => $4::int)))
    RETURNING id`, [input.assemblyId, input.organizationId, input.jobId, STALL_MINUTES]);
  return rows.length === 1;
}

async function recordPlacement(q: Queryable, input: WithdrawCsrPlacementInput, placement: Record<string, unknown>): Promise<void> {
  await q.query(`UPDATE csr_assembly_runs SET placement = $3::jsonb, updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [input.assemblyId, input.organizationId, JSON.stringify(placement)]);
}

/** Of the recorded leaves, those still live in the sequence and still pointing at one of this assembly's rendered files. */
async function stillThisAssemblys(q: Queryable, input: WithdrawCsrPlacementInput, run: CsrAssemblyRunRow, seq: PlacementSequence, leaves: PlacedLeaf[]): Promise<Set<number>> {
  const documents = (run.result?.leaves ?? []).map(l => l.renderedLeafFileId);
  const { rows } = await q.query(`SELECT id FROM submission_leaves WHERE organization_id = $1 AND sequence_id = $2 AND id = ANY($3::int[])
      AND document_table = 'rendered_leaf_files' AND document_id = ANY($4::int[]) AND deleted_at IS NULL`,
  [input.organizationId, seq.id, leaves.map(l => Number(l.leafId)), documents]);
  return new Set((rows as Array<Record<string, unknown>>).map(r => Number(r.id)));
}

async function removeEach(q: Queryable, deps: CsrPlacementDeps, input: WithdrawCsrPlacementInput, ctx: { seq: PlacementSequence; placement: Record<string, unknown>; leaves: PlacedLeaf[]; ours: Set<number>; reason: string }) {
  const removed: Array<PlacedLeaf & { auditTrail: unknown }> = [];
  const left: Array<PlacedLeaf & { why: string }> = [];
  for (const leaf of ctx.leaves) {
    if (!ctx.ours.has(Number(leaf.leafId))) { left.push({ ...leaf, why: 'no longer a live leaf of this assembly in the sequence (removed or re-pointed since); not touched' }); continue; }
    try {
      const out = await deps.removeLeaf(Number(leaf.leafId), ctx.seq.id, { organizationId: input.organizationId, userId: input.userId }, ctx.reason);
      removed.push({ ...leaf, auditTrail: out.auditTrail ?? null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const done = new Set(removed.map(r => r.leafId));
      await recordPlacement(q, input, { ...ctx.placement, state: 'partial', leaves: ctx.leaves.filter(l => !done.has(l.leafId)),
        withdrawalError: { at: new Date().toISOString(), failedAt: leaf.fileName, message, removed } });
      refuse('CSR_PLACEMENT_WITHDRAW_REFUSED', 409, `${leaf.fileName} was not withdrawn: ${message} `
        + (removed.length ? `${removed.length} file(s) before it were withdrawn: ${removed.map(r => r.fileName).join(', ')}.` : 'Nothing was withdrawn.'));
    }
  }
  return { removed, left };
}

/** Withdraw the files a partial placement wrote, from its still-open sequence, as the signed-in user. */
export async function withdrawPartialCsrPlacement(q: Queryable, deps: CsrPlacementDeps, input: WithdrawCsrPlacementInput) {
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 8) refuse('CSR_PLACEMENT_REASON_REQUIRED', 400, 'Say why the partly placed CSR files are withdrawn (at least 8 characters). Nothing was withdrawn.');
  const run = await readCsrAssembly(q, input.organizationId, input.jobId, input.assemblyId);
  if (!run) return refuse('CSR_ASSEMBLY_NOT_FOUND', 404, 'Assembly not found.');
  const placement = run.placement;
  if (!placement || (placement.state !== 'partial' && placement.state !== 'interrupted')) return refuse('CSR_PLACEMENT_WITHDRAW_NOT_PARTIAL', 409, notPartialMessage(placement));
  const seq = await openSequence(deps, input, Number(placement.sequenceId));
  if (!await claimWithdrawal(q, input)) refuse('CSR_PLACEMENT_WITHDRAW_NOT_PARTIAL', 409, 'This placement changed while the withdrawal was asked for. Read it again. Nothing was withdrawn.');
  const leaves = (Array.isArray(placement.leaves) ? placement.leaves : []) as PlacedLeaf[];
  const ours = await stillThisAssemblys(q, input, run, seq, leaves);
  const { removed, left } = await removeEach(q, deps, input, { seq, placement, leaves, ours, reason });
  const withdrawn = { ...placement, state: 'withdrawn', leaves: [],
    withdrawal: { withdrawnBy: input.userId, withdrawnAt: new Date().toISOString(), reason, sequenceId: seq.id, sequenceNumber: seq.sequenceNumber, removed, notRemoved: left } };
  await recordPlacement(q, input, withdrawn);
  return withdrawn;
}
