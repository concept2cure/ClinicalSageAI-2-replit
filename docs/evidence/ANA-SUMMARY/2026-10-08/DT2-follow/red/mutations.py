#!/usr/bin/env python3
"""DT2 red-first evidence: put each behaviour back the way it was, run its test, restore.

Two kinds of red:
  head-*   every DT2 test against the source as it was before DT2 (HEAD), so
           "red today" is the product as it stands, not a guess.
  m-*      one targeted mutation of the DT2 code at a time: the behaviour a
           test exists to catch is removed, and only that test's file is run.

Every file is restored from an in-memory copy after each run, whatever happens.
Usage: python3 mutations.py [name ...]   (from the repo root; RLS_ENFORCE=off)
"""
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../../..'))
OUT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

HOOK = 'client/src/concept2cure/components/ana/useAnaChat.ts'
MODEL = 'client/src/concept2cure/v2/anaWorkModel.ts'
ROWS = 'client/src/concept2cure/v2/turnSummaryRows.ts'
SIGNOFF = 'client/src/concept2cure/components/ana/GovernedActionSignoff.tsx'
THREAD = 'client/src/concept2cure/v2/surfaces/ConversationThread.tsx'

T_HOOK = 'client/src/concept2cure/components/ana/__tests__/useAnaChat-follow.test.ts'
T_VIEW = 'client/src/concept2cure/v2/__tests__/anaFollowView.test.tsx'
T_SIGNOFF = 'client/src/concept2cure/components/ana/__tests__/governedSignoffDecidedElsewhere.test.tsx'
T_ADMIN = 'client/src/concept2cure/v2/__tests__/conversationThreadAdminFollow.test.tsx'
T_LINES = 'client/src/concept2cure/v2/__tests__/anaFollowLines.test.ts'
T_RECORD = 'client/src/concept2cure/components/ana/__tests__/useAnaChat-turn-record.test.ts'

DT2_SOURCES = [
    HOOK,
    'client/src/concept2cure/components/ana/useAnaChat.types.ts',
    'client/src/concept2cure/components/ana/anaTurnTimeline.ts',
    'client/src/concept2cure/components/ana/useGovernedAction.ts',
    SIGNOFF,
    MODEL,
    ROWS,
    'client/src/concept2cure/v2/TurnSummary.tsx',
    'client/src/concept2cure/v2/AnaActivity.tsx',
    'client/src/concept2cure/v2/AnaWorkSections.tsx',
    THREAD,
]


def head(path):
    return subprocess.run(['git', 'show', f'HEAD:{path}'], capture_output=True, text=True, check=True).stdout


# name -> (files: {path: (old, new)} | 'HEAD', tests, test-name filter or None)
MUTATIONS = {
    # ── Red today: the source before DT2 ──────────────────────────────────────
    'head-hook': ('HEAD', [T_HOOK], None),
    'head-view': ('HEAD', [T_VIEW], None),
    'head-signoff': ('HEAD', [T_SIGNOFF], None),
    'head-admin': ('HEAD', [T_ADMIN], None),
    'head-lines': ('HEAD', [T_LINES], None),
    # ── One behaviour at a time ───────────────────────────────────────────────
    # 1: a reload does not rejoin (the question stands alone).
    'm1-no-rejoin-on-reload': ({HOOK: ("if (run) followRun(run.runId, { status: run.status, runPolicy: run.runPolicy, userMessageId: run.userMessageId });",
                                       "void run;")}, [T_HOOK, T_VIEW], None),
    # 2: the visible page's poll is not merged into the stream's turn.
    'm2-no-visible-merge': ({HOOK: ("      void mergeVisibleTurnRef.current();\n", "")}, [T_HOOK], 'overlapping'),
    # 2: polled rows appended without the seq merge: a row seen twice is two rows.
    'm2-append-not-merge': ({HOOK: ("prev.map((m) => (m.id === sse.messageId ? r.poll.events.reduce((acc, e) => (e ? applyTimelineFrame(acc, e) : acc), m) : m)),",
                                    "prev.map((m) => (m.id === sse.messageId ? { ...m, timeline: [...(m.timeline ?? []), ...r.poll.events.filter((e): e is NonNullable<typeof e> => e !== null)] } : m)),")},
                            [T_HOOK], 'overlapping'),
    # 3: the hand-over keeps the followed turn instead of the stored answer.
    'm3-no-hand-over': ({HOOK: ("        return { ...answer, id: m.id, timeline: m.timeline, turnRecord };",
                                "        return { ...m, streaming: false, recordConfirming: false };")}, [T_HOOK, T_VIEW], 'hands over'),
    # 4: the poll's hold is not read.
    'm4-hold-ignored': ({HOOK: ("setRunHold(poll.status === 'paused' && poll.hold ? readRunHold(poll.hold) : null);", "setRunHold(null);")},
                        [T_VIEW], 'Manual hold'),
    # 5: today's Stop: abort even after a failed cancel.
    'm5-abort-on-failed-cancel': ({HOOK: ("const detachable = stoppedRunId !== null && (stoppedController === null || !turnDriveRequestedRef.current);",
                                          "const detachable = false;")}, [T_HOOK], 'cancel'),
    # 6: a stale owner is not said.
    'm6-no-stale-line': ({MODEL: ("  return staleOwnerLine(f.lastBeatAt, now + f.skewMs);\n}", "  return null;\n}")}, [T_HOOK, T_VIEW], 'stale'),
    # 6: the reader's failing network is not said.
    'm6-no-unreachable-line': ({MODEL: ("  if (f.unreachable) return FOLLOW_LINES.unreachable;\n", "")}, [T_HOOK], 'stale owner says'),
    # 7: "Not recorded" at once, without waiting for released_at or 30 s.
    'm7-no-recording-wait': ({HOOK: ("const done = poll.releasedAt !== null || clientNow - f.terminalAt >= RECORD_WAIT_MS;", "const done = true;")},
                             [T_HOOK, T_VIEW], 'record'),
    # 8: a refusal is never checked against the poll.
    'm8-refusal-not-checked': ({SIGNOFF: ("    if (code && DECIDED_CODES.has(code)) await resolvedElsewhere();", "    void code;")}, [T_SIGNOFF], 'NO_PENDING_APPROVAL|STALE'),
    # 9 / (c): an admin follower is treated as the asker.
    'm9-admin-as-asker': ({THREAD: ("const adminFollowing = anaChat.followScope === 'cancel';", "const adminFollowing = false;")}, [T_ADMIN], None),
    # (a): RUN_IN_PROGRESS is an error, not a rejoin.
    'ma-no-rejoin-on-refusal': ({HOOK: ("            rejoinAfter = { runId: err.runId, keep: [userMsg.id, assistantId] };", "            void err.runId;")}, [T_HOOK], 'RUN_IN_PROGRESS'),
    # §5.3: the run row's reasons are not continuable.
    'mc-not-continuable': ({MODEL: ("    case 'unattended_limit':\n    case 'session_ended':\n    case 'server_shutdown':\n    case 'orphaned':\n      return true;",
                                    "      return true;")}, [T_LINES], 'continuable'),
    # §2.7: the closing row does not count held-back steps.
    'mn-no-not-authorised': ({ROWS: ("  return [notAuthorisedLine(heldBack), opts.notRecorded", "  return [null, opts.notRecorded")}, [T_LINES], 'not authorised'),
    # §3.6: a missing seq is not a gap.
    'mg-no-gap': ({ROWS: ("    holes || missingFromStart || shortOfOwner ? GAP_LINE : null,", "    null,")}, [T_LINES, T_VIEW], 'gap'),
}


def run(name):
    files, tests, flt = MUTATIONS[name]
    paths = DT2_SOURCES if files == 'HEAD' else list(files)
    saved = {p: open(p).read() for p in paths}
    try:
        for p in paths:
            if files == 'HEAD':
                text = head(p)
            else:
                old, new = files[p]
                text = saved[p]
                if old not in text:
                    raise SystemExit(f'{name}: the code to mutate is not in {p}')
                text = text.replace(old, new, 1)
            with open(p, 'w') as f:
                f.write(text)
        cmd = ['npx', 'vitest', 'run', '--config', 'vitest.config.ts', *tests]
        if flt:
            cmd += ['-t', flt]
        env = dict(os.environ, RLS_ENFORCE='off')
        r = subprocess.run(cmd, capture_output=True, text=True, env=env)
        out = (r.stdout + r.stderr).splitlines()
        keep = [l for l in out if any(k in l for k in ('✓', '×', 'FAIL', 'AssertionError', 'Error:', 'expected', 'Tests ', 'Test Files'))]
        with open(os.path.join(OUT, f'{name}.txt'), 'w') as f:
            f.write(f'# {name}: {" ".join(cmd[3:])}\n# exit {r.returncode}\n')
            f.write('\n'.join(keep[:80]) + '\n')
        summary = next((l.strip() for l in out if l.strip().startswith('Tests ')), '?')
        print(f'{name}: exit {r.returncode} | {summary}')
    finally:
        for p, text in saved.items():
            with open(p, 'w') as f:
                f.write(text)


for n in (sys.argv[1:] or MUTATIONS):
    run(n)
