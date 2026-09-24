/**
 * Package an eCTD sequence FROM the canonical core (backbone unification).
 *
 * Reads the canonical `ectd_sequences` + `submissions` + `submission_leaves`
 * (tenant-scoped), maps them through the pure `core-to-packager` adapter, and
 * drives the live `packageEctdSubmission` publisher. This is the orchestrator
 * that makes the canonical core — not the orphaned `reg_*` model and not
 * hand-supplied leaves — the source of truth for packaging.
 *
 * The one storage-specific concern (resolving a leaf's polymorphic
 * documentTable/documentId to an on-disk file) is INJECTED as `resolveFile`, so
 * this module stays free of storage assumptions and the pure mapping is testable
 * in `core-to-packager.test.ts`. Running it needs a database + a real resolver.
 *
 * @module server/services/ectd/package-from-core
 */

import { eq, and, isNull } from 'drizzle-orm';
import { db, pool } from '../../db';
import { submissions, ectdSequences, submissionLeaves } from '../../../shared/schema';
import { packageEctdSubmission } from '../submission-gateways/regional-packager';
import type { SubmissionBundle } from '../submission-gateways/types';
import { buildPackagerInputFromCore, coreLeafFromSubmissionLeaf, type LeafFileResolver } from './core-to-packager';
import { loadLatestPriorManifestBySubmission } from './prior-sequence-loader';
import { computeLifecycleOperations, type DesiredLeaf, type PriorLeaf } from './lifecycle-operator';
import { computeSequencePrefix } from './sequence-manifest';
import { leafFileCarriesKey, leafSourceKey } from './leaf-source-resolver';
import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';

export interface PackageFromCoreParams {
  sequenceId: number;
  organizationId: number;
  userId: number;
  outputDir: string;
  applicationId: string;
  sponsorId: string;
  sponsorName: string;
  /** Resolves each leaf's document to an on-disk file (storage-specific). */
  resolveFile: LeafFileResolver;
  emitUnzipped?: boolean;
}

export interface PackageFromCoreResult {
  bundle: SubmissionBundle;
  skipped: Array<{ sectionCode: string; reason: string }>;
  /**
   * The newest filed sequence the prior state folds up to — what this
   * sequence's lifecycle acts were bound against. null for an original (0000),
   * and for a follow-up with no filed sequence on record, where every declared
   * act is refused.
   */
  priorSequence: string | null;
  /** Whether this package's §11.10(e) ECTD_PACKAGED_FROM_CORE row was written.
   *  The package stands either way; the caller is told which. */
  auditTrail: AuditRowOutcome;
}

/** The author-declared lifecycle acts: each one acts ON a leaf already filed. */
const DECLARED_ACTS: ReadonlySet<string> = new Set(['replace', 'append', 'delete']);

/**
 * A declared lifecycle act with nothing on record to act on cannot ship. It is
 * left out and reported in `skipped` — which transmit refuses on
 * (assembledTransmitBlockers) — never shipped as an act on nothing.
 *
 * 2026-09-22 (W5/D7): this used to drop only deletes. A declared replace or
 * append passed through and shipped as operation="replace" with NO
 * modified-file — an act on nothing, reported as a clean assembly.
 */
function dropUnbindableLifecycle(
  input: { leaves: Array<{ ctdSection: string; operation?: string }> },
  skipped: Array<{ sectionCode: string; reason: string }>,
  reason: string,
): void {
  const kept = input.leaves.filter((l) => !DECLARED_ACTS.has(String(l.operation)));
  for (const l of input.leaves) {
    if (DECLARED_ACTS.has(String(l.operation))) {
      skipped.push({ sectionCode: l.ctdSection, reason: `declared ${l.operation}: ${reason}` });
    }
  }
  input.leaves = kept as typeof input.leaves;
}

/** Record a leaf's declared replace/append, keyed as the lifecycle operator keys it. */
function recordDeclaredAct(
  declared: Map<string, 'replace' | 'append'>,
  leaf: { ctdSection: string; fileName: string },
  operation: string,
): void {
  if (operation === 'replace' || operation === 'append') declared.set(`${leaf.ctdSection}/${leaf.fileName}`, operation);
}

/**
 * A declared delete binds to the filed leaf it withdraws. A row that
 * names a document binds by that document's IDENTITY: the filed leaf
 * with its current derived name, else the one filed leaf in the
 * section whose name carries its source key (the label part of a leaf
 * name — module_number or title — can change after filing; the key
 * cannot). Only a row that names no document binds by section, and
 * only when that is unambiguous. Nothing is bound by guessing.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic): the section binding used to be
 * tried only when the row named no document, so a document whose name
 * changed after filing matched no prior leaf and the lifecycle
 * operator threw "nothing on file to delete" out of the whole assembly.
 * 2026-09-23 (W5/D7, round-2 skeptic, second pass): the first repair
 * fell back to the SECTION for a named row too, which bound it to the
 * section's only filed leaf whatever document that was — a withdrawal
 * of a document never filed there, or a stale re-withdrawal of one
 * already withdrawn, filed a transmit-clear delete of a different,
 * still-current document. A named row now binds by identity or not at
 * all; an unbindable one is reported in `skipped` (which blocks
 * transmit) and the rest of the sequence still assembles.
 * 2026-09-23 (W5/D7, residual repair): the source of a document the
 * sequence only withdraws is no longer read (materializeLeafSources),
 * so `leaf.fileName` is empty unless another leaf of this sequence
 * ships the same document. Nothing here needs the source row: the
 * binding is by key against the filed manifest. When the key is
 * carried by no filed leaf, or by more than one, the withdrawal is
 * reported in `skipped` — never guessed, never dropped.
 *
 * Returns the bound filed leaf's name, or null when the withdrawal was
 * reported in `skipped` instead.
 */
function bindWithdrawalToFiledLeaf(
  leaf: { ctdSection: string; fileName: string },
  ref: { key: string | null },
  priorLeaves: readonly PriorLeaf[],
  skipped: Array<{ sectionCode: string; reason: string }>,
): string | null {
  const inSection = priorLeaves.filter((pl) => pl.ctdSection === leaf.ctdSection);
  let fileName = leaf.fileName;
  if (ref.key) {
    const byName = !!fileName && inSection.some((pl) => pl.fileName === fileName);
    if (!byName) {
      const key = ref.key;
      const mine = inSection.filter((pl) => leafFileCarriesKey(pl.fileName, key));
      if (mine.length !== 1) {
        // Named by its source key, the one identity it always has.
        const subject = `withdrawal of ${key}`;
        skipped.push({
          sectionCode: leaf.ctdSection,
          reason:
            mine.length === 0
              ? `${subject}: no filed leaf in ${leaf.ctdSection} is this document — it was never filed ` +
                'there, or has already been withdrawn; no other filed document is withdrawn in its place'
              : `${subject} is ambiguous: ${mine.length} filed leaves in ${leaf.ctdSection} carry document ${key}`,
        });
        return null;
      }
      fileName = mine[0].fileName;
    }
  } else if (inSection.length === 1) {
    fileName = inSection[0].fileName;
  } else {
    skipped.push({
      sectionCode: leaf.ctdSection,
      reason:
        inSection.length === 0
          ? 'withdrawal names a section with no leaf in the prior sequence'
          : `withdrawal is ambiguous: ${inSection.length} prior leaves share section ${leaf.ctdSection}`,
    });
    return null;
  }
  return fileName;
}

/**
 * Assemble + package a sequence's leaves from the canonical core. Tenant-scoped:
 * the sequence, submission, and leaves must all belong to `organizationId`.
 *
 * @throws if the sequence or submission is not found in the organization.
 */
export async function packageSequenceFromCore(params: PackageFromCoreParams): Promise<PackageFromCoreResult> {
  const { sequenceId, organizationId, userId } = params;

  const [sequence] = await db
    .select()
    .from(ectdSequences)
    .where(
      and(
        eq(ectdSequences.id, sequenceId),
        eq(ectdSequences.organizationId, organizationId),
        isNull(ectdSequences.deletedAt)
      )
    )
    .limit(1);
  if (!sequence) {
    throw new Error('Sequence not found for this organization.');
  }

  const [submission] = await db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.id, sequence.submissionId),
        eq(submissions.organizationId, organizationId),
        isNull(submissions.deletedAt)
      )
    )
    .limit(1);
  if (!submission) {
    throw new Error('Submission not found for this organization.');
  }

  const leafRows = await db
    .select()
    .from(submissionLeaves)
    .where(
      and(
        eq(submissionLeaves.sequenceId, sequenceId),
        eq(submissionLeaves.organizationId, organizationId),
        isNull(submissionLeaves.deletedAt)
      )
    );

  const coreLeaves = leafRows.map(coreLeafFromSubmissionLeaf);
  // The document each declared delete names, in row order —
  // buildPackagerInputFromCore carries every delete row through, in that
  // order, so the i-th delete leaf of `input` is the i-th entry here (checked
  // below). null: the row names no document.
  const deleteRefs = coreLeaves
    .filter((l) => String(l.lifecycleOp ?? '').trim().toLowerCase() === 'delete')
    .map((l) => ({
      sectionCode: l.sectionCode,
      key: l.documentTable && (l.documentId || l.documentUuid)
        ? leafSourceKey(l.documentTable, l.documentId, l.documentUuid)
        : null,
    }));

  const { input, skipped } = buildPackagerInputFromCore({
    sequence: { sequenceNumber: sequence.sequenceNumber, region: sequence.region, type: sequence.type },
    submission: { applicationType: submission.applicationType, productName: submission.productName },
    // 2026-09-22 (W5/D7): the projection must carry the uuid half of the
    // reference. Without it every vault-backed leaf reached resolveFile with
    // documentId null and no uuid, resolved to nothing and landed in `skipped` —
    // AFTER materialization had staged it, so it was never `unresolved` either,
    // and transmit (which read only unresolvedLeaves) sent the sequence without
    // the document. 2026-09-23 (W5/D7, round-2 review): the row is read through
    // the one shared projection, so this packager and the device technical-file
    // assembler cannot drift apart on it again.
    leaves: coreLeaves,
    resolveFile: params.resolveFile,
    applicationId: params.applicationId,
    sponsorId: params.sponsorId,
    sponsorName: params.sponsorName,
    outputDir: params.outputDir,
    emitUnzipped: params.emitUnzipped,
  });

  // Lifecycle: for a FOLLOW-UP sequence (not 0000), diff the leaves against the
  // prior sequence's published manifest so each leaf carries a REAL operator
  // (new/replace/append/delete) + ICH modified-file pointer — instead of the
  // all-`new` set that submission_leaves.lifecycle_op yields. Keyed on the stable
  // submission id (application_number was not reliable across sequences). Absent a
  // prior manifest (first sequence, or none persisted yet) leaves declared `new`
  // stay new, and a declared replace/append/delete is refused — there is nothing
  // on record for it to act on.
  let priorSequence: string | null = null;
  if (sequence.sequenceNumber !== '0000') {
    const prior = await loadLatestPriorManifestBySubmission(pool, {
      organizationId,
      submissionId: submission.id,
      currentSequence: sequence.sequenceNumber,
    });
    // A filed sequence can be on record with nothing left on file (every leaf
    // it filed since withdrawn); it is still the state these acts meet.
    priorSequence = prior.priorSequenceNumber || null;
    if (prior.leaves.length > 0) {
      const desired: DesiredLeaf[] = [];
      // What the author declared for each non-delete leaf, keyed as the
      // lifecycle operator keys it. 2026-09-22 (W5/D7): the declaration used to
      // be thrown away before the diff, so a declared append was filed as a
      // replace, and a declared replace the diff could not bind was filed as
      // 'new' — the superseded version stayed current at the agency.
      const declared = new Map<string, 'replace' | 'append'>();
      let deleteIndex = 0;
      for (const leaf of input.leaves) {
        // The operator computes new/replace/append from the checksum diff. The
        // one operation it cannot compute is a WITHDRAWAL, which is the author's
        // declared intent — that used to be thrown away here with the rest of
        // the placeholder operation, so submission_leaves.lifecycle_op='delete'
        // was decorative. md5 is the diff input — when unknown a leaf present in
        // prior conservatively becomes `replace` (re-ships content).
        const { operation, ...rest } = leaf;
        if (operation !== 'delete') {
          desired.push({ ...rest, md5: leaf.md5 ?? '', ...(operation === 'append' ? { appendOnChange: true } : {}) });
          recordDeclaredAct(declared, leaf, operation);
          continue;
        }
        const ref = deleteRefs[deleteIndex++];
        if (!ref || ref.sectionCode !== leaf.ctdSection) {
          throw new Error(
            `Internal: declared withdrawal in section ${leaf.ctdSection} does not line up with its submission_leaves row ` +
              '— refusing to bind a withdrawal to an unknown document.',
          );
        }
        const fileName = bindWithdrawalToFiledLeaf(leaf, ref, prior.leaves, skipped);
        if (fileName === null) continue;
        if (desired.some((d) => d.withdraw && d.ctdSection === leaf.ctdSection && d.fileName === fileName)) {
          // Two declared deletes bound to the same filed leaf — the operator
          // would throw on the duplicate identity.
          skipped.push({
            sectionCode: leaf.ctdSection,
            reason: `withdrawal of ${fileName} is declared twice in this sequence`,
          });
          continue;
        }
        // A withdrawal ships no bytes: computeLifecycleOperations drops the
        // resolved sourcePath from every delete it emits (2026-09-23, W5/D7).
        desired.push({ ...rest, fileName, md5: '', withdraw: true });
      }
      const life = computeLifecycleOperations(prior.leaves, desired, {
        priorSequencePrefix: computeSequencePrefix(prior.priorSequenceNumber),
      });
      // life.leaves carries the declared withdrawals as backbone-only `delete`
      // leaves and OMITS unchanged leaves — exactly the delta the packager ships.
      // A prior leaf this sequence does not mention is still on file, unchanged.
      //
      // Every act ON a filed leaf must say which one (modified-file), and a
      // declared act must come out as that act. Anything else is left out and
      // reported — which blocks transmit — rather than filed as something the
      // author did not declare.
      const emitted = new Set<string>();
      const shippable: typeof life.leaves = [];
      for (const l of life.leaves) {
        const key = `${l.ctdSection}/${l.fileName}`;
        emitted.add(key);
        const intent = declared.get(key);
        if (intent && l.operation === 'new') {
          skipped.push({
            sectionCode: l.ctdSection,
            reason:
              `declared ${intent}: no filed leaf named ${l.fileName} in this section to ${intent === 'replace' ? 'supersede' : 'append to'} ` +
              '(filing it as new would leave the filed version current) — bind it to the filed file, or declare it new',
          });
          continue;
        }
        if (DECLARED_ACTS.has(l.operation) && !l.modifiedFile) {
          skipped.push({
            sectionCode: l.ctdSection,
            reason: `${l.operation} of ${l.fileName}: the filed leaf it acts on has no recorded path, so the act cannot name it (no modified-file)`,
          });
          continue;
        }
        shippable.push(l);
      }
      for (const [key, intent] of declared) {
        if (emitted.has(key)) continue;
        skipped.push({
          sectionCode: key.slice(0, key.lastIndexOf('/')),
          reason: `declared ${intent}: the content is identical to the filed version, so there is nothing to ${intent === 'replace' ? 'supersede' : 'append'}`,
        });
      }
      input.leaves = shippable;
    } else {
      dropUnbindableLifecycle(
        input,
        skipped,
        priorSequence
          ? `nothing is on file after sequence ${priorSequence} to act on`
          : 'no filed prior sequence is on record to act on',
      );
    }
  } else {
    dropUnbindableLifecycle(input, skipped, 'a first sequence has nothing on file to act on');
  }

  const bundle = await packageEctdSubmission(input);

  // WO-16C: was `await auditService.logAction(…)` with its outcome discarded.
  const auditTrail = await recordAuditRow({
    organizationId,
    userId,
    action: 'ECTD_PACKAGED_FROM_CORE',
    resourceType: 'ectd_sequence',
    resourceId: sequenceId,
    details: {
      region: input.region,
      sequence: input.sequence,
      leafCount: input.leaves.length,
      skipped: skipped.length,
    },
  });

  return { bundle, skipped, priorSequence, auditTrail };
}

export default { packageSequenceFromCore };
