# AnA direct-answer prefetch — W3 / D4

Canonical branch: `concept2cure-v2`. Publication base: `c55fa8d4bca3491c2d821ae84a55a1320ee2e745`.
This batch owns `server/routes/ana-ri/stream.ts`, its existing
`stream-context-latency.test.ts`, and this evidence directory. Other canonical
work is preserved. This batch makes no UI contribution.

## Delivered behavior

The mounted stream route previously started the organization tool-policy,
AI-placement/catalog and requested Live Drive entitlement reads before choosing
the `[INTELLIGENCE_ANSWER]` direct-handler path. That path records the registered
handler's result, ends the stream and returns without using those reads.
Even malformed answers and handler refusals admitted the unused work.

Both promise constructions now start only after that early-return branch.
The six direct-answer regressions reduce each unused resolver's invocation
count from one to zero. Ordinary model turns still start both reads before
project, conversation and optional context assembly, retaining their overlap
and awaiting the same policies before model/tool use.

The direct branch still resolves `answer_intelligence_question` through the
registered handler. Its execution wrapper, launch-scope and record-scope gates
are unchanged. This does not enable an out-of-launch interview or remove a
governance check. Questions, completion summaries, session ids, errors, turn
outcomes and run cleanup keep the existing route behavior. No SQL, model,
tool, entitlement decision, wire format, dependency or public signature changes.
No cache, TTL, alternate path or new capability was added.

## Qualification

| Check | Actual result |
| --- | --- |
| Final fail-first on original source | 6 failed / 7 passed; candidate bytes restored in finally |
| Direct route suite | 13 passed, including seven new cases; six original context cases retained |
| Broader backend qualification | 364 passed / 0 failed across 24 files, exit 0, 42.541 seconds |
| Forced ESLint | Production zero errors, same 23 existing warnings; test zero errors/warnings |
| Production build | Exit 0, 16.388 seconds |
| Full current pre-push hook | Exit 0 and completion banner; TypeScript zero errors (tsc exit 0), 60.942 seconds |

The mounted HTTP regressions cover next question, interview completion,
structured refusal, thrown handler error, invalid result JSON and malformed
input, including requested Live Drive. They preserve handler tenant/project
arguments, SSE output, record-writer outcome and local/run-end invocation.
A deferred ordinary turn proves both reads start while optional route prefetch
is pending, then completes the model call after every blocker is released.
All deferred work is released in finally.

The 24-file qualification also exercises actual registered-handler launch
refusal, governed toolset and chat-path parity, Live Drive, context awareness,
turn records, Stop/disconnect, hold, approval and control lifecycle. Existing
PGlite contracts remain included. The direct route's model, handler and
persistence seams are scripted; it does not prove live authorization execution,
durable database persistence or production latency. The separate execution
suite exercises the real registered launch gate. No external provider or
database was contacted. This is focused qualification, not the full repository
test suite or a deployed benchmark. Existing build notices remain.

An independent scoped read-only review found no material blocker. Routine
policy and entitlement lookup failures are already contained in their helpers;
this delivery claims avoided work, not a previously unhandled rejection.

`typecheck-memory/` records native TypeScript5.6.3 cache preparation in
26 bounded processes, ending with zero unchecked entries and
zero cached diagnostic-error files. It uses the unchanged whole-project config,
actual semantic diagnostics and compiler-owned cache output. Preparation is
not qualification. No compiler option, lint suppression, baseline or repository
gate was weakened. The full current hook passed at `5fe086cd43b13eaacf61c387a0209f109efa15be`
against `c55fa8d4bca3491c2d821ae84a55a1320ee2e745`. `source-files.json` pins both qualified source blobs.
Canonical peer AnA turn handling changes were merged before the final qualification.
`publication-resync.json` records those preserved changes and the merged source
pins. The original fail-first and direct-green records precede that merge; all
13 direct-route tests pass again in the final 364-test qualification. The final
evidence commit changes documentation only.

## Publication boundaries

`ui-scope.json` verifies identical client hashes against the publication base.
Publication uses a non-force GitHub ref update with the expected branch SHA,
checks every uploaded blob and the complete resulting Git tree against local
Git, and separately reports the actual published commit and its CI status.
Source publication is not production deployment; queued CI is not green CI.

The preceding heartbeat commit's actual CI snapshot is retained: browser smoke,
CodeQL and validation/audit passed; Semgrep failed with seven findings outside
that batch's owned source; repository health was cancelled and overall CI was
queued at observation. Those unrelated findings are not fixed or suppressed
here, and this record does not claim that preceding remote CI passed.

Text transcripts trim trailing whitespace only. Lint JSON omits duplicate
source echoes while retaining diagnostics, counts and the omitted-source hash.
