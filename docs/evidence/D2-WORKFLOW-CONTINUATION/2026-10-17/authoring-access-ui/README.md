# Authoring current-access UI: canonical reconciliation

W1 / D2 local source and JSDOM qualification after the normal canonical
fast-forward to `45fbf8d8f9ce65da6f67ab805da2551f6621fdc9`. The source pin
manifest records the current integrated tree base, including the lead's later
canonical updates. This evidence does not establish native browser behavior,
tenant/RLS enforcement, provider approval, grounding, deployment or demo signoff.

## Bounded change

The existing current-read/session guard, partial metadata projection, unsaved
status-filter decision, created-section recovery, Vault navigation and in-flight
writer receipts remain composed with the upstream editor. Textual conflicts
retained both the upstream host-back/draft-review/ceremony navigation guards and
the local exact-project/current-session read ownership.

The section-only projection now preserves upstream `access.edit` while refusing
whole-document ceremonies. A server edit refusal remains visible and keeps the
section read-only. The existing assembly control consumes a partial/current-read
refusal before another structural operation. Its saved-document inspection uses
the same canonical project-qualified detail/sections URL builder and refuses an
explicit partial list, detail or sections projection before claiming a complete
saved-document check. Full reads with unavailable provenance still work. The
existing session/project guards, exact receipt validation and sent-write outcomes
remain authoritative; this introduces no policy grant or assembly capability.

Root approved the additional transport and two existing upstream suite files in
`docs/design/AUTHORING_CURRENT_READ_BOUNDARY.md`. `production-files.json` names
the thirteen owned production files. New upstream controller/features remain in
their canonical implementations.

## Evidence

Historical proof stays in the [16 October evidence](../../2026-10-16/authoring-access-ui/README.md).
The interrupted old 49-file run's exact failure is retained there as
`regression-outline-fixture-bail.txt.gz`: 596 passed / one failure, 35 passing
files before bail, with 49 input files selected. Its outline fixture used an
exact unscoped sections URL and missed the required program query. Only that
fixture's route dispatch changed; the create/open/focus assertions remain.
The retained focused `outline-fixture-node22.txt` passed all nine cases.

| Current artifact | Actual result |
| --- | --- |
| `upstream-integration-red.txt.gz` | Two failures / eight passes: section projection dropped `access.edit`, and assembly lacked the current partial-read refusal. |
| `upstream-integration-green.txt.gz` | Ten cases passed after the Workbench integration repair. |
| `regression-before-transport.txt.gz` | All 49 files ran: 47 passed / two failed; 665 passed / two failed cases, zero skips (233.85s). The failures were fixture compatibility, described below. |
| `assembly-transport-red.txt.gz` | Six focused controls: four failed / two passed, twelve unrelated cases name-filtered. The actual transport omitted program queries and accepted explicit partial projections. |
| `assembly-and-fixture-green.txt.gz` | All 47 cases / three suites passed, zero skips, after transport and fixture reconciliation. |
| `regression-runtime-interrupted.txt.gz` | Frozen-source 52-file attempt ended when the execution transport disconnected and the runner was lost. It has 394 passing case lines, no failure marker and no terminal summary; it is not a completed regression claim. All 78 source pins matched before the necessary rerun. |
| `regression-node22.txt.gz` | Final finite 52-file manifest: 52 files and 719 cases passed, zero failures or skips (196.93s). |
| `fixture-type-successor-node22.txt.gz` | After the root compiler found a toast-mock type mismatch, the affected Vault suite ran once: all 15 cases passed, zero skips or failures (4.51s). |

The root's full compiler subsequently found TS2322 in the Vault test fixture's
generic mock callback type. The successor imports `FireToast` as a type, uses it
at the canvas helper boundary, and declares `vi.fn<FireToast>()`. No assertion,
runtime implementation or production file changed. Scoped fixture ESLint has
zero errors and warnings in `fixture-type-successor-lint.json`.
`fixture-type-successor-pins.json` records the before/after fixture hashes and
proves the emitted JavaScript is identical. The 719-case result and its
historical `source-pins.json` remain unchanged; this separate successor does
not claim a second full regression or close the root-owned compiler gate.

The two broad-run fixture failures did not require production changes. The
upstream drafting-panel test replaced the actual authService with a partial
object lacking the canonical session event API. It now keeps the actual service
through the partial module mock. The Review-to-editor test opened the right
document, then asserted the obsolete unscoped sections URL; its assertion now
requires the exact selected-program query. The two reconciled upstream assembly
fixtures dispatch the actual pathname while retaining all original behavior,
receipt, dirty-buffer, current-authority and scope assertions.

`regression-files.json` preserves the finite original 49 inputs;
`upstream-regression-files.json` adds the three direct upstream assembly suites;
`final-regression-files.json` is their 52-file union, with no duplicate or omitted
original input. Commands use the existing `vitest.config.ts`, Node 22.22.0,
Vitest 4.1.7, heap 4096, `maxWorkers:1`, and `fileParallelism:false`. Logs retain
React act warnings and synthetic provider refusals; these are not live-provider
or clean browser evidence. No test assertion or permission negative was removed.

The scoped ESLint comparison is zero errors / 17 warnings versus zero errors /
18 warnings at `45fbf8d8f`. Both sides preserve the repository's ignored-file
warning for EsignModal; these counts do not claim ESLint checked that ignored
file. The current Canvas line-count warning remains visible. Two old Workbench
warnings (unused hook disable and browser `queueMicrotask` global) were retired;
the host-back/filter union dispatch was simplified without altering navigation.
The intermediate 18-warning comparison is retained. No dependency, suppression,
rule threshold, baseline or global lint configuration changed.

`source-pins.json` records SHA-256 for 78 production/test/support inputs on the
frozen integrated tree. `final-pin-verification.json` confirms all 78 inputs matched after the final
run. The root-authorized post-run cleanup removed exactly one extra blank EOF
newline from `authoringCurrentRead.ts`; `post-run-whitespace-normalization.json`
retains before/after hashes, and current pins match the normalized bytes. No
other source byte changed during qualification. Source pin generation first referenced the wrong
authService filename extension; that bookkeeping attempt failed before writing
pins, and the corrected manifest pins the actual `.tsx` source. No test or
production file was changed by that setup error.

Finished proof logs use deterministic gzip (`mtime=0`), preserving exact terminal
bytes including blank final lines.
`archives.json` retains archive and decoded SHA-256 values and decoded byte
counts. Decode with `gzip -cd <artifact>.txt.gz`. The prior broad-run raw log was
removed only after archiving; historical October 14 seals and October 16 proofs
are not duplicated into this phase.

## Limits and handoff

The delegate froze production and test sources for the lead's compiler, build,
global release checks and publication. These mocked-HTTP component checks do not
qualify remaining Authoring GETs, native tenant/RLS admission, the source snapshot
writer, complete grounded AnA authoring, model eligibility, populated CMC,
restart persistence or normal-client navigation. The UI's partial/read guard is
not server authorization. No stage, commit, stash, branch or push was performed
by this delegate.
