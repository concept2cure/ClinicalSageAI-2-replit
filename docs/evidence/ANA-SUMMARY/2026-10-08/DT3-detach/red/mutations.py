#!/usr/bin/env python3
"""DT3 red-first evidence: put each behaviour back the way it was, run its test, restore.

Two kinds of red, as DT2 filed them:
  head-*   the DT3 tests against the source as it is at HEAD (every DT3 source
           change reverted, every new DT3 module moved aside): "red today" is
           the product as it stands, not a guess.
  m-*      one targeted mutation of the DT3 code at a time: the behaviour a
           test exists to catch is removed, and only that test is run.

Every file is restored from an in-memory copy after each run, whatever happens,
and a moved-aside module is moved back. Nothing is staged, stashed or checked out.
Usage: python3 mutations.py [name ...]   (from anywhere; RLS_ENFORCE=off)
"""
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../../..'))
OUT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

STREAM = 'server/routes/ana-ri/stream.ts'
RUNS = 'server/routes/ana-ri/runs.ts'
RC = 'server/services/ana/run-control.ts'
HOLD = 'server/services/ana/run-hold.ts'
POLICY = 'server/services/ana/turn-run-policy.ts'
STATUS = 'server/services/ana/run-status.ts'
EMITTER = 'server/services/ana/turn-timeline-emitter.ts'
NOTICE = 'server/services/ana/run-notice.ts'
CLOCK = 'server/services/ana/unattended-clock.ts'
LEASE = 'server/db/requestDbLease.ts'
TARGET = 'server/services/notifications/notification-record-target.ts'
NAV = 'client/src/concept2cure/v2/notificationNavigation.ts'
ROWS = 'client/src/concept2cure/v2/turnSummaryRows.ts'
SCIM = 'server/routes/scim.ts'
MEMBERS = 'server/routes/tenant-users.ts'
STANDING = 'server/services/account-standing.ts'
OFFBOARD = 'server/services/tenant/tenant-offboarding.ts'
SHUTDOWN = 'server/startup/shutdown.ts'
HOOK = 'client/src/concept2cure/components/ana/useAnaChat.ts'
THREAD = 'client/src/concept2cure/v2/surfaces/ConversationThread.tsx'
HOME = 'client/src/concept2cure/v2/surfaces/ProjectHome.tsx'
PROGRESS = 'client/src/concept2cure/components/ana/anaProgress.ts'
WORK = 'client/src/concept2cure/v2/anaWorkModel.ts'
AUTH = 'server/routes/auth.ts'
SUMMARY = 'server/services/ana/turn-summary.ts'
DOSSIER = 'server/services/ana/lineage-dossier.ts'
DOSSIER_HOLDS = 'server/services/ana/lineage-dossier-holds.ts'
GOV = 'server/services/ana-ri/part11-governance.ts'
UTILITY = 'server/routes/ana-ri/utility.ts'
RELEASE = 'server/routes/ana-ri/held-run-release.ts'
TIMELINE = 'client/src/concept2cure/components/ana/anaTurnTimeline.ts'
THREADS = 'client/src/concept2cure/v2/surfaces/projectThreads.ts'
TRACE = 'server/services/ana/tool-trace.ts'
CATEGORIES = 'shared/constants/notifications.ts'
SHUTDOWN_TS = 'server/startup/shutdown.ts'

T_DETACH = 'server/routes/ana-ri/__tests__/stream-detach.test.ts'
T_DETACH_REVIEW = 'server/routes/ana-ri/__tests__/stream-detach-review.test.ts'
T_DISC = 'server/routes/ana-ri/__tests__/stream-disconnect.test.ts'
T_ADMIN = 'server/routes/ana-ri/__tests__/stream-admin-cancel.test.ts'
T_STOPPED = 'server/routes/ana-ri/__tests__/stream-stopped-reason.test.ts'
T_RUNS = 'server/routes/ana-ri/__tests__/runs-read.pglite.test.ts'
T_RCD = 'server/services/ana/__tests__/run-control-detach.pglite.test.ts'
T_GATEWAY = 'server/services/ana/__tests__/run-stopped-gateway.test.ts'
T_CLOCK = 'server/services/ana/__tests__/unattended-clock.test.ts'
T_STANDING = 'server/services/ana/__tests__/run-standing.test.ts'
T_NOTICE = 'server/services/ana/__tests__/run-notice.test.ts'
T_POLICY = 'server/services/ana/__tests__/turn-run-policy.test.ts'
T_HOLD = 'server/services/ana/__tests__/run-hold.test.ts'
T_HOLDCANCEL = 'server/services/ana/__tests__/run-hold-cancellation.test.ts'
T_DETACHABLE = 'server/services/ana/__tests__/run-detachable.test.ts'
T_NOTAUTH = 'server/services/ana/__tests__/turn-timeline-not-authorised.test.ts'
T_SHUTDOWN = 'server/startup/__tests__/shutdown-ana-runs.test.ts'
T_ACCOUNT = 'server/services/__tests__/account-standing-stops-runs.test.ts'
T_MASTER = 'server/routes/admin/__tests__/master-admin.test.ts'
T_PASSWORD = 'server/routes/__tests__/passwordResetAuditTrail.test.ts'
T_OFFBOARD = 'server/services/tenant/__tests__/tenant-offboarding.test.ts'
T_SCIM = 'server/__tests__/security/scim-deprovision-stops-runs.test.ts'
T_MEMBERS = 'server/routes/__tests__/tenant-users-audit.test.ts'
T_TARGET = 'server/services/notifications/__tests__/notification-conversation-target.test.ts'
T_SCOPE = 'server/middleware/__tests__/establishRequestTenantScope.test.ts'
T_HOOK = 'client/src/concept2cure/components/ana/__tests__/useAnaChat-detach.test.ts'
T_MARKER = 'client/src/concept2cure/v2/__tests__/projectHomeWorkingMarker.test.tsx'
T_TRAY = 'client/src/concept2cure/v2/__tests__/taskTrayNoticeOpens.test.tsx'
T_ADMINFOLLOW = 'client/src/concept2cure/v2/__tests__/conversationThreadAdminFollow.test.tsx'
T_LINES = 'client/src/concept2cure/v2/__tests__/anaFollowLines.test.ts'
T_ENDING = 'client/src/concept2cure/components/ana/__tests__/turnEndingRowReasons.test.ts'
T_TOKENCLASS = 'server/middleware/__tests__/token-class-every-verifier.test.ts'
T_SUMMARYCONTROLS = 'server/services/ana/__tests__/turn-summary-controls.test.ts'
T_ACTOR = 'client/src/concept2cure/v2/__tests__/turnSummaryControlActor.test.ts'
T_DOSSIERACTOR = 'server/services/ana/__tests__/lineage-dossier-control-actor.test.ts'
T_SUMMARYROUTE = 'server/routes/ana-ri/__tests__/turn-summary.pglite.test.ts'
T_GAENDED = 'server/routes/ana-ri/__tests__/governedActionRunEnded.test.ts'
T_FOLLOW = 'client/src/concept2cure/components/ana/__tests__/useAnaChat-follow.test.ts'
T_CAP = 'server/services/ana/__tests__/tool-trace-detached-cap.test.ts'
T_CAPNOTE = 'client/src/concept2cure/v2/__tests__/anaDetachedCapNote.test.ts'
T_NOTIFCAT = 'server/routes/__tests__/notification-server-only-category.test.ts'
T_SLOTS = 'server/services/ana/__tests__/detach-slots.test.ts'
T_SCREENGONE = 'client/src/concept2cure/v2/__tests__/anaScreenGoneStep.test.tsx'
ACTIVITY = 'client/src/concept2cure/v2/AnaActivity.tsx'


def git(*args):
    return subprocess.run(['git', *args], capture_output=True, text=True, check=True).stdout


def dt3_sources():
    """Every non-test source DT3 changed (to revert to HEAD) and every new one (to move aside)."""
    changed = [p for p in git('diff', '--name-only', 'HEAD').split() if not is_test(p)]
    added = [p for p in git('ls-files', '--others', '--exclude-standard').split() if not is_test(p)]
    return changed, added


def is_test(p):
    return '__tests__' in p or '.test.' in p or '.dbtest.' in p or p.startswith('docs/')


SERVER_TESTS = [T_DETACH, T_DETACH_REVIEW, T_DISC, T_ADMIN, T_STOPPED, T_RCD, T_GATEWAY, T_CLOCK, T_STANDING, T_NOTICE,
                T_POLICY, T_HOLD, T_DETACHABLE, T_NOTAUTH, T_SHUTDOWN]
HOOK_TESTS = [T_ACCOUNT, T_MASTER, T_PASSWORD, T_OFFBOARD, T_SCIM, T_MEMBERS, T_TARGET, T_SCOPE, T_RUNS]
CLIENT_TESTS = [T_HOOK, T_MARKER, T_TRAY, T_ADMINFOLLOW, T_LINES]

# name -> (files {path: [(old, new), ...]} | 'HEAD', tests, test-name filter or None)
MUTATIONS = {
    # ── Red today: the source before DT3 ──────────────────────────────────────
    'head-stream-and-run-control': ('HEAD', SERVER_TESTS, None),
    'head-hooks-reads-notices': ('HEAD', HOOK_TESTS, None),
    'head-client': ('HEAD', CLIENT_TESTS, None),

    # ── The request-pinned DB client (blocking review finding) ───────────────
    'm-lease-released-on-close': ({LEASE: [("  if (lease.holds > 0 || lease.released) return Promise.resolve();",
                                            "  if (lease.released) return Promise.resolve();")]},
                                  [T_SCOPE, T_DETACH, T_DETACH_REVIEW], 'retained|tenant connection'),
    'm-stream-does-not-retain': ({STREAM: [("const releaseTurnDb = retainRequestDbClient(req);",
                                            "const releaseTurnDb = null as null | (() => Promise<void>); void retainRequestDbClient;")]},
                                 [T_DETACH, T_DETACH_REVIEW], 'tenant connection'),

    # ── Detach, and what still stops ──────────────────────────────────────────
    # G-3's red variant: the detach branch still settles the run first.
    'm-detach-settles-first': ({STREAM: [("        detachSlot.release = slot;\n        detachedAt = new Date();",
                                          "        detachSlot.release = slot;\n        runSettled = true;\n        detachedAt = new Date();")]},
                               [T_DISC], 'detaches a durable run'),
    'm-detach-without-conversation': ({STATUS: [("return isHoldable(input) && input.threadResolved;",
                                                 "return isHoldable(input);")]},
                                      [T_DETACHABLE], None),
    'm-no-wait-for-the-thread': ({STREAM: [("        if (detachEligible && !runThreadResolved && !threadSettled) {",
                                            "        if (false && detachEligible && !runThreadResolved && !threadSettled) {"),
                                           ("detachable({ runId, runUserId, threadResolved: runThreadResolved });",
                                            "detachable({ runId, runUserId, threadResolved: true });")]},
                                 [T_DISC], 'could not be stamped'),

    # ── The row's reason, and who it is credited to ───────────────────────────
    'm-failed-does-not-abort': ({RC: [("if ((status === 'cancelled' || status === 'failed') && !local.controller.signal.aborted) {",
                                       "if (status === 'cancelled' && !local.controller.signal.aborted) {")]},
                                [T_RCD], 'reaped owner'),
    'm-abort-carries-no-reason': ({RC: [("local.controller.abort(new RunStopped(reason ?? (status === 'cancelled' ? 'cancelled' : 'orphaned'), detail ?? null));",
                                         "local.controller.abort();")]},
                                  [T_RCD], 'reaped owner|admin'),
    'm-shutdown-writes-cancelled': ({RC: [("  server_shutdown: 'failed',", "  server_shutdown: 'cancelled',")]},
                                    [T_RCD], 'shutdown'),
    'm-step-credited-to-person': ({STREAM: [("toolStatus === 'cancelled' && !toolErrorMessage ? stopCause(runStopReasonOf(runSignal)) : undefined;",
                                             "undefined; void stopCause;")]},
                                  [T_DETACH, T_DETACH_REVIEW], 'credited'),

    # ── Holds ──────────────────────────────────────────────────────────────────
    # The first DT3 build read the row again on a cancelled hold (661a2c93a's rule).
    'm-cancelled-hold-reads-the-row': ({POLICY: [("    if (run.cancelled() || outcome === 'cancelled') return this.endedAtHold(step, ended);\n",
                                                  "    if (run.cancelled()) return this.endedAtHold(step, ended);\n"
                                                  "    if (outcome === 'cancelled') {\n"
                                                  "      const left = await run.status().catch(() => undefined);\n"
                                                  "      return left === 'cancelled' ? this.endedAtHold(step, ended) : this.failClosed(w, round, pending);\n"
                                                  "    }\n")]},
                                       [T_HOLDCANCEL], None),
    'm-ended-hold-carries-on': ({HOLD: [("    return status === 'failed' || status === 'finished' ? 'ended' : 'running';",
                                         "    return 'running';")]},
                                [T_HOLD], 'ended as'),
    # A failed or finished row read as a person's Stop (the first DT3 build's
    # 'cancelled' for every terminal status): filed "stopped", with a cancel frame.
    'm-ended-hold-read-as-a-stop': ({POLICY: [("    if (outcome === 'ended') return this.failClosed(w, round, pending);\n",
                                               "    if (outcome === 'ended') return this.endedAtHold(step, ended);\n")]},
                                    [T_POLICY], 'row failed while AnA held'),
    'm-hold-names-refused-steps': ({POLICY: [("    return this.manualHold({ w, run, round, pending, next: runnable.map(c => w.label(c)) });",
                                              "    return this.manualHold({ w, run, round, pending, next: pending.map(c => w.label(c)) });"),
                                             ("      pending: runnable,\n      demo: w.demo(),", "      pending,\n      demo: w.demo(),")]},
                                   [T_POLICY], "read-only turn's Manual hold"),
    'm-hold-not-written': ({RC: [("`UPDATE ana_runs SET status = 'paused', hold = $2::jsonb, updated_at = now() WHERE id = $1 AND status = 'running'`",
                                  "`UPDATE ana_runs SET status = 'paused', updated_at = now() WHERE id = $1 AND status = 'running' AND $2::jsonb IS NOT NULL`")]},
                           [T_RCD], 'the hold, for a follower'),

    # ── The unattended limit and the session's end ────────────────────────────
    'm-unattended-never-due': ({CLOCK: [("    this.due = d.reason;\n", "")]},
                               [T_CLOCK, T_DETACH, T_DETACH_REVIEW], 'unwatched for 15 minutes|15 minutes with nobody watching'),
    'm-no-round-standing-check': ({STREAM: [("          if (runHandle?.standing && !runHandle.cancelSignal.aborted) {",
                                             "          if (false && runHandle?.standing && !runHandle.cancelSignal.aborted) {")]},
                                  [T_DETACH, T_DETACH_REVIEW], 'session that ended'),
    'm-sign-out-everywhere-stops-nothing': ({STANDING: [("  if (stamped) await stopPersonsRuns(userId, cause);\n", "")]},
                                            [T_ACCOUNT], 'endEverySessionOf'),
    'm-scim-delete-stops-nothing': ({SCIM: [("    // Offboarded here: their live AnA runs in this organisation stop now, with\n"
                                             "    // session_ended (AnA detach §2.9). Never throws.\n"
                                             "    await stopPersonsRuns(id, SCIM_DEPROVISIONED, { organizationId: orgId });\n", "")]},
                                    [T_SCIM], 'DELETE'),
    'm-member-removal-stops-nothing': ({MEMBERS: [("    await stopPersonsRuns(userId, { cause: 'member_removed', byUserId: getCallerId(req) ?? null }, { organizationId });\n", "")]},
                                       [T_MEMBERS], 'stops the removed member'),
    'm-purge-does-not-stop-runs-first': ({OFFBOARD: [("  // AnA's live runs stop FIRST, before any table is purged (AnA detach §2.9):\n"
                                                      "  // a turn still running would go on writing rows the purge is removing.\n"
                                                      "  await stopOrganisationRuns(pool, organizationId, 'purge', purgedByUserId);\n", "")]},
                                         [T_OFFBOARD], 'purge|AnA'),
    'm-shutdown-ends-no-runs': ({SHUTDOWN: [("      settleOwnedRunsForShutdown(ctx.pool).then(() => true),\n", "      Promise.resolve(true),\n")]},
                                [T_SHUTDOWN], None),

    # ── Admin cancel ───────────────────────────────────────────────────────────
    'm-admin-cancel-refused': ({RC: [("  return input.callerIsAdmin === true && input.action === 'cancel' ? 'admin_cancel' : null;",
                                      "  return null;")]},
                               [T_RCD], "admin's cancel"),
    # 'm-admin-audit-outcome-discarded' is superseded (DT3 review, DP-82): the
    # route no longer writes the audit row after the cancel, so there is no
    # outcome to discard; see 'r-admin-cancel-audit-after-the-fact'.

    # ── Watching, and the notice ──────────────────────────────────────────────
    'm-no-watched-stamp': ({RUNS: [("  if (req.query.visible === '1') await stampWatched(pool, access);",
                                    "  if (false && req.query.visible === '1') await stampWatched(pool, access);")]},
                           [T_RUNS], 'watched stamp'),
    'm-notice-when-watched': ({STREAM: [("          if (isWatchedNow(lastWatched, Date.now())) return;\n", "")]},
                              [T_DETACH, T_DETACH_REVIEW], 'watched turn sends none'),
    'm-failed-turn-notice-says-finished': ({STREAM: [("const ended: string | null = rowReason ?? (streamFailed ? 'error' : loopStoppedReason);",
                                                      "const ended: string | null = rowReason ?? loopStoppedReason;")]},
                                           [T_DETACH, T_DETACH_REVIEW], 'strict round-body'),
    'm-notice-names-no-record': ({NOTICE: [("      ...(input.threadId ? { resourceType: ANA_TURN_NOTICE_RESOURCE, resourceId: input.threadId } : {}),\n", "")]},
                                 [T_DETACH, T_DETACH_REVIEW], 'ends: one notice'),
    'm-resolver-has-no-conversation': ({TARGET: [("    case 'chat_thread': return conversationTarget(ctx,ref);\n",
                                                  "    case 'chat_thread': throw new NotificationTargetRefusal(422);\n")]},
                                       [T_TARGET], 'resolves'),
    'm-client-opens-no-conversation': ({NAV: [("    (window as unknown as { C2C_CONVO?: { id: string } }).C2C_CONVO = { id: target.params.threadId };\n", "")]},
                                       [T_TRAY], 'names the conversation'),
    'm-read-only-counted-not-authorised': ({EMITTER: [("    if (notAuthorisedStep(f)) this.heldBackSteps += 1;", "    if (f.heldBack) this.heldBackSteps += 1;")],
                                            ROWS: [("filter((s) => notAuthorisedStep(s.finished)).length;", "filter((s) => s.finished?.heldBack === true).length;")]},
                                           [T_NOTAUTH, T_LINES], 'read-only|heldBackCount'),

    # ── Found in the browser acceptance ───────────────────────────────────────
    'm-attached-row-stop-read-as-error': ({STREAM: [("      if (res.headersSent && stopped) {", "      if (false && res.headersSent && stopped) {")]},
                                          [T_DETACH, T_DETACH_REVIEW], 'still attached'),
    'm-client-drops-row-reasons': ({PROGRESS: [("  'unattended_limit',\n  'session_ended',\n  'server_shutdown',\n  'orphaned',\n  'error',\n  'admin_cancelled',\n]);", "]);")]},
                                   [T_ENDING], None),
    'm-transcript-has-no-row-note': ({WORK: [("  if (fixed || !ROW_STOP_REASONS.has(reason)) return fixed ?? null;", "  return fixed ?? null;")]},
                                     [T_ENDING], "transcript's note"),

    # ── The client ─────────────────────────────────────────────────────────────
    'm-timeout-shows-stopped-responding': ({HOOK: [("        const socketLost = err?.name === 'AbortError' ? didTimeout : !serverRefused;",
                                                    "        const socketLost = false && (err?.name === 'AbortError' ? didTimeout : !serverRefused);")]},
                                           [T_HOOK], 'follows its run'),
    'm-admin-stop-hidden': ({THREAD: [("            onStop={adminFollowing && anaChat.adminStop\n              ? () => { setAdminStopError(null); setAdminStopOpen(true); }\n              : () => void anaChat.stop()}",
                                       "            onStop={adminFollowing ? undefined : () => void anaChat.stop()}")]},
                            [T_ADMINFOLLOW], None),
    'm-no-working-marker': ({HOME: [("working.has(t.id) ? workingMarkerLine(working.get(t.id)!) : 'Resume'", "'Resume'")]},
                            [T_MARKER], "project's conversations"),

    # ── The three independent reviews of the uncommitted DT3 change (2026-10-22) ──
    # Each `r-*` entry puts one reviewed defect back and runs the test written for it.
    'r-stop-then-close-filed-as-detach': ({STREAM: [("const stopLanded = runHandle?.cancelSignal.aborted === true;",
                                                     "const stopLanded = false;"),
                                                    ("if (!detachedAt || detachNoted || !turnRecorder || runHandle?.cancelSignal.aborted) return;",
                                                     "if (!detachedAt || detachNoted || !turnRecorder) return;")]},
                                          [T_DETACH, T_DETACH_REVIEW], 'not a detach'),
    'r-notice-reads-stale-watch': ({STREAM: [("const fresh = await inRunTenant('ana-stream:notice-watched', () => readLastWatched(getPool(), runId)).catch(",
                                              "const fresh = await Promise.resolve(null as number | null).catch(")]},
                                   [T_DETACH, T_DETACH_REVIEW], "clock's last read"),
    'r-answered-over-a-stopped-row': ({STREAM: [("const rowStoppedLate = await settleRunRow('finished', loopStoppedReason);",
                                                 "const rowStoppedLate = null as TurnStoppedReason | null;"),
                                                ("const rowStoppedFirst = stopped ? null : await settleRunRow('failed', 'error');",
                                                 "const rowStoppedFirst = null as TurnStoppedReason | null;")]},
                                      [T_DETACH, T_DETACH_REVIEW], 'another writer before its abort'),
    'r-endrun-says-nothing-of-the-winner': ({RC: [("    return (rowCount ?? 0) > 0 ? 'ended' : 'already_ended';",
                                                   "    void rowCount;\n    return 'ended';")]},
                                            [T_RCD], 'which writer ended'),
    # IAM-34: the sign-out stopped the person's runs on a signature-only reading of any token.
    'r-logout-stops-on-a-signature': ({AUTH: [("      if (liveSession?.sessionId) {\n        await stopPersonsRuns(\n          liveSession.accountId,",
                                                "      const signedOut = Number(auditUserId); void liveSession;\n"
                                                "      if (Number.isInteger(signedOut) && signedOut > 0) {\n        await stopPersonsRuns(\n          signedOut,"),
                                               ("          { cause: 'sign_out', byUserId: liveSession.accountId },\n          { sessionId: liveSession.sessionId },",
                                                "          { cause: 'sign_out', byUserId: signedOut },\n          {},")]},
                                      [T_PASSWORD], 'IAM-34|already revoked'),
    # The cross-device line: a sign-out stopped every device's turns.
    'r-logout-stops-every-device': ({AUTH: [("          { sessionId: liveSession.sessionId },", "          {},")]},
                                    [T_PASSWORD], 'only those'),
    'r-iam23-contract-per-file-only': ({AUTH: [("        // token-class: attribution only.", "        // attribution only.")]},
                                       [T_TOKENCLASS], 'every call site'),
    # INF-39: the person's stop as one statement with an optional organisation predicate.
    'r-stop-optional-org-predicate': ({RC: [("                WHERE user_id = $1\n                  AND status IN ('running','paused','awaiting_approval')\n                  AND ($2::text IS NULL OR started_session_id = $2)",
                                             "                WHERE ($5::integer IS NULL OR organization_id = $5) AND user_id = $1\n                  AND status IN ('running','paused','awaiting_approval')\n                  AND ($2::text IS NULL OR started_session_id = $2)")]},
                                      [T_ACCOUNT], None),
    'r-session-end-names-no-cause': ({RC: [("  const stoppedDetail = JSON.stringify({ cause: detail.cause, byUserId: detail.byUserId ?? null });",
                                            "  const stoppedDetail = JSON.stringify(null); void detail;"),
                                           ("    for (const id of ids) driveLocalRun(id, 'cancelled', reason, detail);",
                                            "    for (const id of ids) driveLocalRun(id, 'cancelled', reason, null);"),
                                           ("    await recordRunsEndedWithSession(stopped, user, detail);\n", "")]},
                                     [T_RCD, T_ACCOUNT], 'session-end cause|ledger|keyed|sign-out'),
    'r-record-names-no-session-cause': ({STREAM: [("        const cause = sessionEndCauseWarning(runStopDetailOf(runHandle?.cancelSignal) ?? rowEndedDetail);",
                                                   "        const cause = null as string | null; void sessionEndCauseWarning; void runStopDetailOf;")]},
                                        [T_DETACH, T_DETACH_REVIEW], 'names what ended it'),
    # ── The review fixes of 2026-10-22, continued (this session) ─────────────────
    # #48 an administrator's cancel (DP-82, the blocker, the admin-cancel gap).
    'r-admin-cancel-no-reason': ({RC: [("  if (!reason) return { ok: false, code: 'REASON_REQUIRED', status: row.status };\n", "")]},
                                 [T_RCD], 'needs a reason'),
    'r-admin-cancel-audit-after-the-fact': ({RC: [("  if (adminCancel) return cancelAsAdministrator(pool, row, input);",
                                                   "  if (adminCancel && false) return cancelAsAdministrator(pool, row, input);")]},
                                            [T_RCD], 'one transaction|is accepted on a colleague'),
    'r-admin-cancel-refusal-unmapped': ({STREAM: [("      case 'AUDIT_REFUSED':\n        return { httpStatus: 503, error: ADMIN_CANCEL_AUDIT_REFUSED };\n", "")]},
                                        [T_ADMIN], 'refused 503'),
    'r-admin-cancel-credited-to-asker': ({ROWS: [("  if (!by) return `You ${done}`;", "  return `You ${done}`;")]},
                                         [T_ACTOR], None),
    'r-controls-carry-no-actor': ({SUMMARY: [("    if (administrator) {\n      if (byUserId !== null && byUserId === viewer)",
                                              "    if (false && administrator) {\n      if (byUserId !== null && byUserId === viewer)")]},
                                  [T_SUMMARYCONTROLS, T_SUMMARYROUTE], 'attributeControls|who took each control'),
    'r-dossier-control-has-no-actor': ({DOSSIER_HOLDS: [("({ ...c, by: actorLabel(names, byUserId ?? null) })", "({ ...c, by: null })")]},
                                       [T_DOSSIERACTOR], None),
    'r-admin-stop-one-click': ({THREAD: [("            onStop={adminFollowing && anaChat.adminStop", "            onStop={false && anaChat.adminStop")]},
                               [T_ADMINFOLLOW], 'asks why first'),
    'r-follower-names-no-asker': ({RUNS: [("    askerName: access.asker ? null : await askerNameOf(row.user_id),", "    askerName: null,")]},
                                  [T_RUNS], 'names whose turn'),
    # D-7, decided 2026-10-22: a Live Drive turn detaches; its later screen actions are refused.
    'r-d7-live-drive-stops-on-close': ({STREAM: [("const canDetach = detachable(",
                                                  "const canDetach = live_drive !== true && detachable(")]},
                                       [T_DETACH, T_DETACH_REVIEW, T_DISC], 'D-7|detaches too'),
    'r-d7-screen-action-runs-after-close': ({STREAM: [("const screenActionRefused = (call: { name: string }): boolean => screenGone() && SCREEN_ACTION_TOOLS.has(call.name);",
                                                       "const screenActionRefused = (call: { name: string }): boolean => false && screenGone() && SCREEN_ACTION_TOOLS.has(call.name);")]},
                                            [T_DETACH, T_DETACH_REVIEW], 'screen action after the close'),
    'r-d7-client-drive-turn-not-followed': ({HOOK: [("          interruptedRunId !== null && !left && !handedOver && socketLost && abortRef.current === abortCtl;",
                                                     "          interruptedRunId !== null && options.liveDrive !== true && !left && !handedOver && socketLost && abortRef.current === abortCtl;")]},
                                            [T_HOOK], 'asked to drive'),
    # #51 approvals.
    'r-follower-approval-without-check': ({GOV: [("    ...(check ? { check } : {}),\n", "")]},
                                          [T_RUNS, T_DETACH, T_DETACH_REVIEW], 'attached approval frame|the follower.s approval is the attached frame'),
    'r-governed-action-after-run-ended': ({RELEASE: [("  if (claim === 'not_waiting') return { message: RUN_ENDED_BEFORE_APPROVAL, code: 'RUN_ENDED' };\n", "")]},
                                          [T_GAENDED], 'had ended'),
    'r-run-ended-during-action-silent': ({RELEASE: [("  if (await releaseWaitingRun(req, held, reasonForChange, { result })) return result;",
                                                      "  if ((await releaseWaitingRun(req, held, reasonForChange, { result })) || true) return result;")]},
                                         [T_GAENDED], 'DURING'),
    'r-stopped-after-approval-says-nobody-decided': ({STREAM: [("              if (await approvalClaimed(getPool(), runId, toolUse.id).catch(() => false)) {",
                                                                "              if (false) {")]},
                                                     [T_DETACH, T_DETACH_REVIEW], 'approved action was being carried out'),
    # #50 the client.
    'r-follow-leaves-running-rows': ({HOOK: [("? { ...m, toolCalls: settleRunningCalls(m.toolCalls, FOLLOWED_STEP_NOTE, Date.now(), 'unconfirmed') }", "? m"),
                                             ("              toolCalls: settleRunningCalls(m.toolCalls, FOLLOWED_STEP_NOTE, clientNow, 'unconfirmed'),\n", "")]},
                                     [T_HOOK], 'no step "running"'),
    'r-handover-shows-an-empty-answer': ({HOOK: [("const answerUnreadable = sealed.assistantMessageId !== null && !answer;", "const answerUnreadable = false;")]},
                                         [T_HOOK], 'cannot read the answer'),
    'r-401-read-as-unreachable': ({TIMELINE: [("    if (res.status === 401) return { ok: false, kind: 'signed_out', message: serverMessage(body) };\n", "")]},
                                  [T_HOOK], '401'),
    'r-codeless-error-read-as-lost-socket': ({HOOK: [("const serverRefused = err?.serverSent === true || ", "const serverRefused = ")]},
                                             [T_HOOK], 'code-less'),
    'r-live-runs-failure-silent': ({HOOK: [("    setLiveRunsUnchecked(runs === null);", "    setLiveRunsUnchecked(false);")]},
                                   [T_FOLLOW], 'could not be made'),
    'r-marker-read-once': ({THREADS: [("    ['ana-working', enabled, tick],", "    ['ana-working', enabled],")]},
                           [T_MARKER], 'read again'),
    'r-marker-waiting-read-as-working': ({WORK: [("  const lead = run.status === 'paused' || run.status === 'awaiting_approval' ? 'Waiting for you' : 'Working';",
                                                  "  const lead = 'Working';")]},
                                         [T_MARKER], 'Waiting for you'),
    'r-marker-failed-read-silent': ({HOME: [("            {workingRead.failed && (", "            {false && workingRead.failed && (")]},
                                    [T_MARKER], 'could not be read says so'),
    'r-marker-local-clock-not-a-bound': ({WORK: [("${utcClock(stoppedByMs(at))}", "${formatClock(at)}")]},
                                         [T_MARKER], 'workingMarkerLine'),
    # The lows.
    'r-detached-cap-worded-as-auto': ({TRACE: [("const detachedCap = reason === 'budget_exhausted' && context?.detached === true && policy !== 'auto';",
                                                "const detachedCap = false;")],
                                       WORK: [("      return runPolicy === 'auto'\n        ?", "      return true\n        ?")]},
                                      [T_CAP, T_CAPNOTE], None),
    'r-ana-turn-mintable-by-anyone': ({CATEGORIES: [("export const SERVER_ONLY_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = ['ana_turn'];",
                                                     "export const SERVER_ONLY_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [];")]},
                                      [T_NOTIFCAT], None),
    'r-notice-never-expires': ({NOTICE: [("      expiresAt: new Date(Date.now() + ANA_TURN_NOTICE_TTL_MS),\n", "")]},
                               [T_NOTICE], 'sendRunNotice'),
    'r-standing-cause-collapsed': ({RC: [("    return reason ? standingEnded(STANDING_CAUSE[reason] ?? 'standing_unreadable') : null;",
                                          "    return reason ? standingEnded('credential_ended') : null;")]},
                                   [T_STANDING], 'organisation unavailable|membership ended'),
    'r-no-standing-check-without-a-row': ({RC: [("    ...(subject ? { standing: () => runStanding(subject) } : {}),\n", "")]},
                                          [T_STANDING], 'local-only'),
    'r-detached-turns-unbounded': ({STREAM: [("const slot = claimDetachSlot(runOrgId);",
                                              "const slot = () => undefined; void claimDetachSlot;")]},
                                   [T_DETACH, T_DETACH_REVIEW], 'ceiling'),
    'r-shutdown-run-writes-unbounded': ({SHUTDOWN_TS: [("        deadline = setTimeout(() => resolve(false), SHUTDOWN_RUN_SETTLE_MS);",
                                                        "        void resolve; void SHUTDOWN_RUN_SETTLE_MS;")]},
                                        [T_SHUTDOWN], 'deadline'),
    # ── Closing the open review items, 2026-10-29 ───────────────────────────────
    # 2.4/2.5 on screen: a settled followed turn with no rows hid its line.
    'r-follow-line-hidden-on-a-settled-turn': ({ACTIVITY: [("      replacedNoteText(a.replacedSteps) ||\n", "      replacedNoteText(a.replacedSteps) || false &&\n")]},
                                               [T_ADMINFOLLOW], 'something to say'),
    # 4.3, continued: the approval window's deny took an approval its person had claimed.
    'r-window-deny-overrides-a-claimed-approval': ({RC: [("       AND ($5::integer IS NOT NULL OR pending_approval ->> 'claimedAt' IS NULL)\n", "")]},
                                                   [T_RCD], 'approval window'),
    'r-window-turn-says-nobody-authorised': ({STREAM: [("windowClosedOnClaim = !denied && (await approvalClaimed(", "windowClosedOnClaim = false && (await approvalClaimed(")]},
                                             [T_DETACH_REVIEW], 'window closes'),
    # D-7 on the client: a step the server never dispatched read as failed.
    'r-d7-trace-not-run-read-as-failed': ({HOOK: [("    } else if (t.status === 'not_run') {", "    } else if (false) {")]},
                                          [T_SCREENGONE], 'reopened'),
    'r-d7-frame-not-run-read-as-failed': ({HOOK: [("status: event.status === 'not_run' ? 'not_run' : failed ? 'error' : 'success',", "status: failed ? 'error' : 'success',")]},
                                          [T_HOOK], 'did not run'),
    'r-d7-folded-line-silent-on-not-run': ({WORK: [("const notRunSummary = (count: number) => count > 0 ? `${count} did not run` : '';", "const notRunSummary = (count: number) => (count > 0 ? '' : '');")]},
                                           [T_SCREENGONE], 'folded line'),
    'r-d7-summary-not-run-read-as-failed': ({ROWS: [("  if (f.status === 'not_run' && !f.heldBack) return 'not_run';\n", "")]},
                                            [T_SCREENGONE], 'Summary'),
}


def apply_edits(path, edits):
    with open(path) as f:
        text = f.read()
    for old, new in edits:
        if text.count(old) != 1:
            raise SystemExit(f'{path}: the anchor for this mutation is not unique or not found:\n{old}')
        text = text.replace(old, new)
    with open(path, 'w') as f:
        f.write(text)


def run_tests(tests, flt):
    env = dict(os.environ, RLS_ENFORCE='off')
    cmd = ['npx', 'vitest', 'run', *tests]
    if flt:
        cmd += ['-t', flt]
    return subprocess.run(cmd, capture_output=True, text=True, env=env)


def main(names):
    for name in names or MUTATIONS:
        files, tests, flt = MUTATIONS[name]
        saved = {}
        moved = {}
        aside = tempfile.mkdtemp(prefix='dt3-mut-')
        try:
            if files == 'HEAD':
                changed, added = dt3_sources()
                for p in changed:
                    with open(p) as f:
                        saved[p] = f.read()
                    with open(p, 'w') as f:
                        f.write(git('show', f'HEAD:{p}'))
                for p in added:
                    dest = os.path.join(aside, p.replace('/', '__'))
                    shutil.move(p, dest)
                    moved[p] = dest
            else:
                for p, edits in files.items():
                    with open(p) as f:
                        saved[p] = f.read()
                    apply_edits(p, edits)
            r = run_tests(tests, flt)
        finally:
            for p, text in saved.items():
                with open(p, 'w') as f:
                    f.write(text)
            for p, dest in moved.items():
                shutil.move(dest, p)
            shutil.rmtree(aside, ignore_errors=True)
        out = r.stdout + r.stderr
        lines = [l for l in out.splitlines() if any(k in l for k in ('✓', '×', '→', 'FAIL', 'Test Files', 'Tests ', 'Error:'))]
        with open(os.path.join(OUT, f'{name}.txt'), 'w') as f:
            f.write(f'# {name}: exit {r.returncode} (non-zero = red)\n# tests: {" ".join(tests)}{"  -t " + flt if flt else ""}\n')
            f.write('\n'.join(lines) + '\n')
        print(f'{name}: exit {r.returncode}', flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
