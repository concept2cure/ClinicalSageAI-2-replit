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
 * ── LIFE-01 ──────────────────────────────────────────────────────────────────
 * Callers used to pass a bare md5 per section: the route rendered the PDF,
 * hashed it, and discarded the bytes. The leaf then carried a checksum and NO
 * document reference, so the assembler skipped it entirely — every filed
 * lifecycle sequence assembled with zero leaf files and was permanently
 * dispatch-blocked. The contract is now a leaf SOURCE per section
 * ({documentTable, documentId, checksum}, from storeRenderedLeafFile), so the
 * bytes that were filed can be materialized back into the package. A section
 * with no source still files as metadata — honestly unresolvable, exactly as
 * before — rather than claiming bytes that were never retained.
 *
 * INTEGRATION NOTES (human): exposed at POST /api/ind-lifecycle/safety-report/file
 * and /amendment/file.
 */

import { createSequence, upsertLeaf } from '../submission-service/submission-service';
import type { RenderedLeafSource } from '../ectd/rendered-leaf-files';
import type { IndSafetyReportAmendmentIntent } from './ind-safety-report-service';
import type { IndAmendmentPlan } from './ind-amendment-service';

export type PersistCtx = { organizationId: number; userId: number };

type Sequence = Awaited<ReturnType<typeof createSequence>>;
type Leaf = Awaited<ReturnType<typeof upsertLeaf>>;

export interface PersistedAmendment {
  sequence: Sequence;
  leaves: Leaf[];
  /**
   * Section codes of leaves this filing created with NO document behind them —
   * a placement the sequence requires whose bytes have not been supplied yet.
   * The packager refuses these by name; naming them here means the caller
   * learns it at filing time rather than at transmit.
   */
  leavesAwaitingDocument: string[];
}

/** The minimal leaf shape both the safety-report intent and amendment plan share. */
export interface LeafIntentLike {
  sectionCode: string;
  title: string;
  lifecycleOp: string;
  documentType: string;
  granularity?: string | null;
}

/** Retained rendered bytes per CTD section, keyed exactly as the leaf is. */
export type LeafSourceBySection = Record<string, RenderedLeafSource>;

/**
 * The Module 1 transmittal pair every post-original IND sequence carries:
 * Form FDA 1571 at m1.1 and the cover letter at m1.2.
 *
 * `ind-sequence-validation` requires BOTH on every lifecycle filing type
 * (amendment, safety_report, annual, response, withdrawal) — and nothing placed
 * them. Every sequence this module filed was therefore invalid against the
 * platform's own required-placement set from the moment it was created: a filed
 * 312.32 safety report carried m1.12.4 and nothing else, so the dispatch gate
 * refused a sequence the product had just told the user was filed.
 *
 * A pair member already present (the amendment planner adds its own cover
 * letter) is left alone; matching is on documentType, not section code, so a
 * different m1.2 document does not stand in for the cover letter.
 */
export function withTransmittalPair(
  intents: LeafIntentLike[],
  labels: { indNumber?: string | null; filingLabel: string },
): LeafIntentLike[] {
  const suffix = labels.indNumber ? ` — IND ${labels.indNumber}` : '';
  const out = [...intents];
  if (!out.some((l) => l.documentType === 'cover_letter')) {
    out.unshift({
      sectionCode: 'm1.2',
      title: `Cover Letter — ${labels.filingLabel}${suffix}`,
      granularity: 'leaf',
      lifecycleOp: 'new',
      documentType: 'cover_letter',
    });
  }
  if (!out.some((l) => l.documentType === 'form_1571')) {
    out.unshift({
      sectionCode: 'm1.1',
      title: `Form FDA 1571 — ${labels.filingLabel}${suffix}`,
      granularity: 'leaf',
      lifecycleOp: 'new',
      documentType: 'form_1571',
    });
  }
  return out;
}

/** Section codes of leaves that were written with no document behind them. */
function awaitingDocument(leaves: Leaf[]): string[] {
  return leaves
    .filter((l) => (l as { documentId?: unknown }).documentId == null)
    .map((l) => String((l as { sectionCode?: unknown }).sectionCode ?? ''))
    .filter(Boolean);
}

async function persistLeaves(
  sequenceId: number,
  intents: LeafIntentLike[],
  ctx: PersistCtx,
  sourceBySection?: LeafSourceBySection,
): Promise<Leaf[]> {
  const leaves: Leaf[] = [];
  for (const l of intents) {
    const source = sourceBySection?.[l.sectionCode];
    leaves.push(
      await upsertLeaf(
        {
          sequenceId,
          sectionCode: l.sectionCode,
          title: l.title,
          granularity: l.granularity ?? 'leaf',
          lifecycleOp: l.lifecycleOp,
          documentType: l.documentType,
          ...(source
            ? {
                documentTable: source.documentTable,
                documentId: source.documentId,
                checksum: source.checksum,
              }
            : {}),
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
  sourceBySection?: LeafSourceBySection,
): Promise<PersistedAmendment> {
  const sequence = await createSequence(
    { submissionId, region: intent.region, sequenceNumber, type: intent.sequenceType },
    ctx,
  );
  const leaves = await persistLeaves(
    sequence.id,
    withTransmittalPair(intent.leaves, { filingLabel: 'IND Safety Report' }),
    ctx,
    sourceBySection,
  );
  return { sequence, leaves, leavesAwaitingDocument: awaitingDocument(leaves) };
}

/**
 * Persist a 312.33 IND Annual Report as an `annual` sequence + its m1.13 leaf.
 * (The annual report has no per-event "intent"; it is a single scheduled leaf.)
 */
export async function persistAnnualReport(
  submissionId: number,
  sequenceNumber: string,
  ctx: PersistCtx,
  source?: RenderedLeafSource,
): Promise<PersistedAmendment> {
  const sequence = await createSequence(
    { submissionId, region: 'fda', sequenceNumber, type: 'annual' },
    ctx,
  );
  const leaves = await persistLeaves(
    sequence.id,
    withTransmittalPair(
      [{ sectionCode: 'm1.13', title: 'IND Annual Report', lifecycleOp: 'new', documentType: 'ind_annual_report' }],
      { filingLabel: 'IND Annual Report' },
    ),
    ctx,
    source ? { 'm1.13': source } : undefined,
  );
  return { sequence, leaves, leavesAwaitingDocument: awaitingDocument(leaves) };
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
  const leaves = await persistLeaves(
    sequence.id,
    withTransmittalPair(plan.leaves, { indNumber: plan.indNumber, filingLabel: 'IND amendment' }),
    ctx,
  );
  return { sequence, leaves, leavesAwaitingDocument: awaitingDocument(leaves) };
}

/**
 * Persist a Module 1.4 cross-reference filing (Letter of Authorization, and
 * optionally the Statement of Right of Reference) as an amendment sequence +
 * leaves, with the retained rendered PDF attached per CTD section. Used to file
 * the authorization for a tracked cross-reference dependency.
 */
export async function persistCrossReferenceFiling(
  submissionId: number,
  leafIntents: LeafIntentLike[],
  sequenceNumber: string,
  ctx: PersistCtx,
  sourceBySection?: LeafSourceBySection,
): Promise<PersistedAmendment> {
  const sequence = await createSequence(
    { submissionId, region: 'fda', sequenceNumber, type: 'amendment' },
    ctx,
  );
  const leaves = await persistLeaves(
    sequence.id,
    withTransmittalPair(leafIntents, { filingLabel: 'IND cross-reference authorization' }),
    ctx,
    sourceBySection,
  );
  return { sequence, leaves, leavesAwaitingDocument: awaitingDocument(leaves) };
}
