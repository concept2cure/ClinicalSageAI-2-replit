/**
 * IND lifecycle → eCTD persistence.
 *
 * Turns the deterministic intents produced by the RA lifecycle services into
 * real, tenant-scoped, audited eCTD rows by routing them through
 * submission-service (ectd_sequences + submission_leaves). This closes the
 * audit's "persist lifecycle intents" follow-up: a 312.32 IND Safety Report or a
 * 312.30/.31 amendment plan becomes an actual amendment SEQUENCE with its leaves
 * placed at the right CTD sections.
 *
 * The adapter is intentionally thin and side-effect-only — all tenant scoping,
 * validation, audit logging and state-machine enforcement live in
 * submission-service. The eCTD sequence NUMBER is a deliberate regulatory
 * decision, so it is a required input here (compute it from listSequences at the
 * call site) rather than guessed.
 *
 * INTEGRATION NOTES (human): exposed at POST /api/ind-lifecycle/safety-report/file
 * and /amendment/file. The leaves are created as metadata (sectionCode / title /
 * lifecycleOp / documentType); attach the rendered PDF bytes (see
 * ind-document-renderer) to each leaf's document reference as a follow-up.
 */

import { createSequence, upsertLeaf } from '../submission-service/submission-service';
import type { IndSafetyReportAmendmentIntent } from './ind-safety-report-service';
import type { IndAmendmentPlan } from './ind-amendment-service';

export type PersistCtx = { organizationId: number; userId: number };

type Sequence = Awaited<ReturnType<typeof createSequence>>;
type Leaf = Awaited<ReturnType<typeof upsertLeaf>>;

export interface PersistedAmendment {
  sequence: Sequence;
  leaves: Leaf[];
}

/** The minimal leaf shape both the safety-report intent and amendment plan share. */
interface LeafIntentLike {
  sectionCode: string;
  title: string;
  lifecycleOp: string;
  documentType: string;
  granularity?: string | null;
}

async function persistLeaves(sequenceId: number, intents: LeafIntentLike[], ctx: PersistCtx): Promise<Leaf[]> {
  const leaves: Leaf[] = [];
  for (const l of intents) {
    leaves.push(
      await upsertLeaf(
        {
          sequenceId,
          sectionCode: l.sectionCode,
          title: l.title,
          granularity: l.granularity ?? 'leaf',
          lifecycleOp: l.lifecycleOp,
          documentType: l.documentType,
        },
        ctx,
      ),
    );
  }
  return leaves;
}

/**
 * Persist a 312.32 IND Safety Report amendment intent as an amendment sequence
 * + its leaves (m1.12.4, and m5.3.5 when an ICSR backs the case).
 */
export async function persistSafetyReportIntent(
  submissionId: number,
  intent: IndSafetyReportAmendmentIntent,
  sequenceNumber: string,
  ctx: PersistCtx,
): Promise<PersistedAmendment> {
  const sequence = await createSequence(
    { submissionId, region: intent.region, sequenceNumber, type: intent.sequenceType },
    ctx,
  );
  const leaves = await persistLeaves(sequence.id, intent.leaves, ctx);
  return { sequence, leaves };
}

/**
 * Persist a 312.30 / 312.31 amendment plan as an amendment sequence + its leaves.
 */
export async function persistAmendmentPlan(
  submissionId: number,
  plan: IndAmendmentPlan,
  sequenceNumber: string,
  ctx: PersistCtx,
): Promise<PersistedAmendment> {
  const sequence = await createSequence(
    { submissionId, region: plan.region, sequenceNumber, type: plan.sequenceType },
    ctx,
  );
  const leaves = await persistLeaves(sequence.id, plan.leaves, ctx);
  return { sequence, leaves };
}
