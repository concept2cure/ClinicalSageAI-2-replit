/**
 * The 21 CFR Part 11 §11.10(e) audit row for a governed action: recorded, or
 * not — never assumed.
 *
 * `auditService.logAction` does not reject when a persistence attempt fails.
 * That is deliberate policy — an audit-trail outage must not break the user
 * action it records — so it RESOLVES an `AuditWriteResult` and says what
 * happened in `persisted`, and in `chained`, which distinguishes the
 * retrievable `audit_logs` row from a tamper-proof-only write.
 *
 * `void auditService.logAction({...})` discards that value, leaving the call
 * with two possible outcomes and one observable result: the caller, its caller,
 * the HTTP envelope and the surface are byte-identical whether the §11.10(e)
 * record exists or does not. `recordAuditRow` is the one shape this repository
 * uses instead, and `ci:discarded-audit-write` is the gate that keeps the
 * population of unconverted sites shrinking.
 *
 * HISTORY. This began as a private helper inside pdev-workflow-bridge
 * (WO-16C #133), moved to server/services/pdev/pdev-audit-record.ts when
 * pdev-clearance needed the same shape, and lives here now that callers outside
 * PDEV need it too. It was never PDEV-specific — only its first caller was —
 * and a second copy under another directory is exactly what the zero-duplication
 * rule exists to prevent. The type lost its `Pdev` prefix in the same move.
 *
 * @module server/services/audit/audit-write-outcome
 */

import { createScopedLogger } from '../../utils/logger';
import auditService from '../auditService';

const logger = createScopedLogger('audit-write-outcome');

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether the 21 CFR Part 11 §11.10(e) audit row for a governed action
 * actually reached a durable store.
 *
 * WO-16C finding 133. Every audit write in the PDEV bridge used to be
 * `void auditService.logAction({…})`. That is not fire-and-forget with a
 * guarantee behind it: `logAction` never rejects on a persistence failure —
 * by deliberate policy, "an audit-trail outage must not break the user action
 * it records" — it resolves `AuditWriteResult` and says so in `persisted`.
 * Discarding that value meant the bridge could not tell a recorded approval
 * from an unrecorded one, and neither could the route: the response was
 * byte-identical either way, while the checkpoint, the workflow run and the
 * activity state had all committed. The only trace of the missing record was
 * one `logger.error` line in the server log.
 *
 * So the outcome is carried, in the third state this repo already uses for
 * "the thing did not happen" (`VerificationOutcome`'s `{ran}/{reason}` in
 * server/lib/verification-outcome.ts), spoken in `AuditWriteResult`'s own
 * word: `persisted`. A caller cannot read `reason` off the success arm and
 * cannot claim success without the flag.
 *
 * This does NOT make the write transactional — the governed rows are already
 * committed by the time the audit row is attempted, and a path that needs the
 * row to EXIST before its mutation lands must use
 * `writeChainedAuditRow(client, …)` on its own transaction. What it removes is
 * the silence.
 *
 * Two corrections from an adversarial review of the first version of this:
 *
 *  - the failure arm carried `reason`, copied from `AuditWriteResult.error`,
 *    whose own docstring reads "Why it failed, for the caller's own log line.
 *    Never surfaced to a user." Both routes forward this envelope whole to an
 *    authenticated tenant client, so a raw Postgres message went on the wire.
 *    It now carries a stable code and a sentence, the containment WO-16B
 *    settled on for 503s; the store's text stays in the log line below.
 *  - the success arm said only `persisted`, but `logAction` computes
 *    `persisted = chained || tamperProof`. The tamper-proof store alone can
 *    satisfy it while the chained `audit_logs` row — the one a customer can
 *    read back or export — is lost. `chained` says which, so "the record
 *    exists" and "the record is retrievable" are not conflated.
 */
export type AuditRowOutcome =
  | { persisted: true; chained: boolean }
  | { persisted: false; code: 'AUDIT_ROW_NOT_PERSISTED'; message: string };

/** What the caller may show a user. The detail goes to the log, never here. */
const AUDIT_NOT_PERSISTED_MESSAGE =
  'The 21 CFR Part 11 audit entry for this transition could not be written. The action itself completed. This has been logged for follow-up.';

/** The object call form of `auditService.logAction` (its entry type is not exported). */
type AuditEntry = Extract<Parameters<typeof auditService.logAction>[0], object>;

/** What `auditService.logAction` (and `logAuditEvent`, which forwards to it) resolves. */
type AuditWriteResultLike = Awaited<ReturnType<typeof auditService.logAction>>;

/**
 * Turn an already-resolved audit write into the outcome a caller carries, and
 * log a lost or tamper-proof-only row the same way `recordAuditRow` does.
 *
 * For writers that cannot go through `recordAuditRow` because they add their
 * own envelope before forwarding to `logAction` — `logAuditEvent`
 * (services/audit/auditLogger.ts) records `<category>.<action>` with category
 * and severity details, and switching such a site to `recordAuditRow` would
 * change the action string its existing rows are queried by. Pass what it
 * resolved; `thrown` is for a caller that caught a rejection itself.
 */
export function auditRowOutcomeFrom(
  result: AuditWriteResultLike | undefined,
  context: { action: string; resourceType?: string; resourceId?: unknown; thrown?: string },
): AuditRowOutcome {
  const { action, resourceType, resourceId, thrown } = context;
  if (result?.persisted) {
    // `persisted` is `chained || tamperProof`. Carry which, because only the
    // chained audit_logs row is the one a customer reads back or exports.
    if (!result.chained) {
      logger.warn(
        'Audit row persisted to the tamper-proof log only — the chained audit_logs row a reader can retrieve does not exist',
        { action, resourceType, resourceId },
      );
    }
    return { persisted: true, chained: result.chained };
  }

  const reason =
    thrown ??
    result?.error ??
    'auditService.logAction reported no durable store; the audit row cannot be shown to exist';
  logger.error(
    'Audit row NOT persisted — the 21 CFR Part 11 §11.10(e) record for this transition does not exist',
    { action, resourceType, resourceId, reason },
  );
  // `reason` is deliberately NOT returned: it is the store's own text and the
  // envelope is forwarded to a tenant client. Find it by the log line above,
  // keyed on the action and resource id repeated here.
  return { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: AUDIT_NOT_PERSISTED_MESSAGE };
}

/**
 * Write one audit row and REPORT what happened to it. Never throws: an
 * audit-trail outage must not break the transition it records, which is the
 * same policy `logAction` holds — the difference is that the caller is now
 * told, and tells its own caller.
 */
export async function recordAuditRow(entry: AuditEntry): Promise<AuditRowOutcome> {
  let result: AuditWriteResultLike | undefined;
  let thrown: string | undefined;
  try {
    result = await auditService.logAction(entry);
  } catch (err) {
    // Documented never to happen; if it ever does, it is still not a reason to
    // report an audit row that does not exist.
    thrown = err instanceof Error ? err.message : String(err);
  }
  return auditRowOutcomeFrom(result, {
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    thrown,
  });
}
