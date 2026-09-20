/**
 * PDEV → eCTD compile bridge.
 *
 * Honest framing: this is **not** new eCTD publishing. It invokes the
 * CANONICAL package generator (`assembleSubmissionEctd` in
 * `server/services/ectd/assemble-from-core.ts` — the submission spine:
 * submissions → ectd_sequences → submission_leaves, real ICH backbone +
 * MD5 manifest + rendered PDF leaves) once a program's PDEV IND
 * assembly readiness clears a threshold, and records the compilation
 * result against the program.
 *
 * The bridge:
 *   - Tenant-gates by joining regulatory_programs.
 *   - Reads IND assembly readiness via pdev-ind-assembly.
 *   - Refuses to compile when mandatory-document readiness is below
 *     the configured threshold (default 90 %) unless the caller passes
 *     `force: true` (audit-flagged as override).
 *   - Calls assembleSubmissionEctd with the resolved submissionId
 *     (the canonical submissions.id). A submission with no sequence or
 *     placed leaves fails closed — the refusal propagates to the caller,
 *     it is never papered over with a placeholder package.
 *   - Returns the package buffer + filename + stats, plus the
 *     ind-assembly readiness snapshot at compile time.
 *   - Audit-logs the compile through the existing dual-write auditor,
 *     whose OUTCOME is returned (see `PdevEctdCompileResult.audit`) rather
 *     than discarded.
 *
 * @module server/services/pdev/pdev-ectd-compile
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import { assembleSubmissionEctd } from '../ectd/assemble-from-core';
import { pdevIndAssemblyService, type IndAssemblyReport } from './pdev-ind-assembly';
import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';

const logger = createScopedLogger('pdev-ectd-compile');

export interface PdevEctdCompileInput {
  programId: string;
  organizationId: number;
  userId: number;
  /** Required: the CANONICAL submissions.id the eCTD pipeline is keyed by. */
  submissionId: number;
  /** Cross-check only: the sequence's recorded region is authoritative; a
   *  contradicting value makes the compile fail closed (never silently
   *  honored or ignored). */
  region?: string;
  /** Accepted for wire-compat; the submission's RECORDED application type is
   *  what the canonical packager emits — a caller cannot relabel it here. */
  submissionType?: string;
  /** Specific sequence to compile; the submission's latest when omitted. */
  sequenceNumber?: string;
  applicationNumber?: string;
  /** Minimum mandatory-document readiness % to allow the compile.
   *  Default 90 %. */
  readinessThreshold?: number;
  /** Force-compile even if readiness is below the threshold. Will be
   *  recorded in the audit trail as an override. */
  force?: boolean;
}

export interface PdevEctdCompileResult {
  status: 'compiled' | 'refused_low_readiness';
  readinessSnapshot: IndAssemblyReport;
  /** Present only when status === 'compiled'. */
  package?: {
    filename: string;
    sizeBytes: number;
    stats: {
      totalModules: number;
      totalGranules: number;
      totalFiles: number;
      generatedAt: string;
    };
    buffer: Buffer;
  };
  /** Present only when refused. */
  refusalReason?: string;
  thresholdApplied: number;
  forced: boolean;
  /**
   * What happened to the 21 CFR Part 11 §11.10(e) audit row for this call —
   * the refusal row on `refused_low_readiness`, the compile row on `compiled`.
   * Never `undefined` on either of those paths: both of them write a row, so a
   * caller that sees no outcome is looking at a throw, not at a silent success.
   *
   * WO-16C finding 133, follow-up review 2026-09-18. Both writes below were
   * `void auditService.logAction({…})`. `logAction` never rejects when
   * persistence fails — by deliberate policy, an audit-trail outage must not
   * break the action it records — it RESOLVES an AuditWriteResult and reports
   * what happened in `persisted`. Discarding that value meant an eCTD package
   * could be assembled from the canonical submission spine, handed to the
   * caller, and recorded nowhere, with this result object identical to the
   * compile whose record exists. Same for the refusal, which is the audit
   * trail's only evidence that a below-threshold compile was attempted and
   * blocked.
   *
   * The route envelope and the agent tool response were the same way, and this
   * field alone did not change that — a service that reports an outcome its
   * caller drops is the same defect one layer up. A review of this conversion
   * found exactly that, so `pdev-routes.ts` now sends it in the envelope (in
   * `meta` on the 201, in `details` on the 409) and the AnA handler carries it
   * as `ectdAuditTrail`, kept distinct from its own agent-level row.
   *
   * The shape is the one pdev-clearance and pdev-workflow-bridge already carry,
   * from the shared ../audit/audit-write-outcome — not a second copy of it. `chained`
   * separates the retrievable `audit_logs` row from a tamper-proof-only write;
   * the failure arm carries a stable code and a user-safe sentence, never the
   * store's own text (that is in the log line recordAuditRow already wrote).
   */
  audit?: AuditRowOutcome;
}

export class PdevEctdCompileService {
  async compile(input: PdevEctdCompileInput): Promise<PdevEctdCompileResult> {
    const threshold = input.readinessThreshold ?? 90;
    const forced = Boolean(input.force);

    // Tenant gate.
    const programRows = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(
        and(
          eq(regulatoryPrograms.id, input.programId),
          eq(regulatoryPrograms.organizationId, input.organizationId)
        )
      )
      .limit(1);
    if (!programRows[0]) {
      throw new Error('PDEV program not found in tenant');
    }

    // Compute readiness snapshot.
    const snapshot = await pdevIndAssemblyService.getReadiness(
      input.programId,
      input.organizationId
    );
    if (!snapshot) {
      throw new Error('PDEV program not found (readiness snapshot)');
    }

    if (snapshot.overallReadiness < threshold && !forced) {
      // WO-16C #133: the refusal row's outcome now travels with the refusal.
      // Nothing is reverted here — there is nothing to revert, the compile did
      // not run — but the caller can no longer be told "blocked, and recorded"
      // when only the first half happened.
      const audit = await recordAuditRow({
        tenantId: input.organizationId,
        userId: input.userId,
        action: 'pdev_ectd_compile_refused',
        resourceType: 'regulatory_program',
        resourceId: input.programId,
        details: {
          overallReadiness: snapshot.overallReadiness,
          threshold,
          blockerCount: snapshot.blockers.length,
        },
      });

      return {
        status: 'refused_low_readiness',
        readinessSnapshot: snapshot,
        refusalReason: `IND assembly readiness ${snapshot.overallReadiness}% < threshold ${threshold}%`,
        thresholdApplied: threshold,
        forced,
        audit,
      };
    }

    // Invoke the canonical eCTD pipeline (submission spine → real packager).
    let pkg: Awaited<ReturnType<typeof assembleSubmissionEctd>>;
    try {
      pkg = await assembleSubmissionEctd({
        submissionId: input.submissionId,
        organizationId: input.organizationId,
        userId: input.userId,
        region: input.region,
        sequenceNumber: input.sequenceNumber,
        applicationNumber: input.applicationNumber,
      });
    } catch (err) {
      logger.error('eCTD compile failed', { err, programId: input.programId });
      throw err instanceof Error ? err : new Error('eCTD compile failed');
    }

    const audit = await recordAuditRow({
      tenantId: input.organizationId,
      userId: input.userId,
      action: 'pdev_ectd_compiled',
      resourceType: 'regulatory_program',
      resourceId: input.programId,
      details: {
        submissionId: input.submissionId,
        applicationNumber: input.applicationNumber,
        sequenceNumber: input.sequenceNumber,
        overallReadiness: snapshot.overallReadiness,
        thresholdApplied: threshold,
        forced,
        sizeBytes: pkg.buffer.length,
        filename: pkg.filename,
        totalGranules: pkg.stats.totalGranules,
        totalFiles: pkg.stats.totalFiles,
      },
    });

    // WO-16C #133: the package is already assembled and the submission spine
    // rows the packager wrote are already committed; throwing the compile away
    // because its audit row was lost would be the worse lie. The compile stands
    // and the caller is told what became of the record — recordAuditRow has
    // already logged the store's own reason against this action and program id.
    if (!audit.persisted) {
      logger.warn('eCTD compile succeeded but its audit row was not persisted', {
        programId: input.programId,
        submissionId: input.submissionId,
        filename: pkg.filename,
      });
    }

    return {
      status: 'compiled',
      readinessSnapshot: snapshot,
      package: {
        filename: pkg.filename,
        sizeBytes: pkg.buffer.length,
        stats: pkg.stats,
        buffer: pkg.buffer,
      },
      thresholdApplied: threshold,
      forced,
      audit,
    };
  }
}

export const pdevEctdCompileService = new PdevEctdCompileService();
