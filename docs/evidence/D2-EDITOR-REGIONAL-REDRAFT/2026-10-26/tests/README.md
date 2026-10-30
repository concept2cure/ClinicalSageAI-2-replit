# Retained regional drafting inputs: focused panel evidence

W1 / D2; local/Codespaces only. Contract:
`docs/design/EDITOR_REGIONAL_REDRAFT_2026-10-26.md`.

## What already exists

`AuthoringAiDraft.tsx` provides the one section review panel and its existing
Tone, Region, Context, Requirements, Draft again, Discard and Accept controls.
`useAuthoringDraftReview.ts` owns review buffers, generation, failures and
acceptance/currentness holds. `authoringDraftTransport.ts` owns canonical
requests and source-aware reviewed acceptance. The assembly coordinator already
retains controlled review sessions across section changes.

The new `v2/__tests__/authoringDraftInputs.test.tsx` renders that actual panel
through its existing public exports and uses the real hook and transport. Only
HTTP replies are synthetic. Its coordinator fixture retains the existing
review-session state; it does not reproduce generation or option-merging logic.
Structural fixture typing allows the pre-fix run to exercise the existing
exports without importing a production symbol that does not yet exist.

## Meaningful pre-fix reproduction

A retained candidate carries explicit PMDA, EMA, Health Canada or FDA inputs.
Choosing Draft again sends the panel's mount-local fallback values instead of
the retained tone/region/context/requirements. Explicitly edited options also
reset after the retained panel closes or changes section. Discard exposes the
same incorrect defaults for a seeded candidate.

`RED.txt` records eleven behavioral failures and nine passing controls across
twenty cases, with exit code 1. Every failure is an actual HTTP payload or UI
value mismatch. `RED-result.json` records command, time, duration and unchanged
pinned inputs. Root edited production only after this archived RED.

`GREEN.txt` records all twenty cases passing against the patched production
owners and the unchanged test file. `LINT.txt` is intentionally empty: strict
ESLint `--max-warnings=0` exits 0 with no warnings or errors. Both phase result
files confirm their pinned source/configuration/test inputs still matched after
execution. No test changes were needed between RED and GREEN.

Root then changed only the panel's default-expression form to
`{ ...defaults, ...review.state.generationInputs }`, preserving the existing
lint-complexity metric. The original GREEN epoch remains unchanged above.
`SETTLED-GREEN.txt` qualifies the exact final source bytes: twenty of twenty
tests pass. `SETTLED-LINT.txt` is empty with exit 0 and zero warnings.
`settled-inputs.json` and both settled result files record the final input hashes
and verify that those inputs remained unchanged during execution. The test file
is identical across RED, GREEN and settled GREEN.

The cases cover exact regional payloads; standalone and legacy defaults;
conflicting optional provider metadata; Discard and controlled Close/reopen;
section isolation; synchronous multi-field edits; transport, truncation and
provider failures; unknown acceptance; stale retained sessions; and delayed
session, project round-trip, section-switch and unmount transitions. Assertions
exclude automatic acceptance and preserve reviewed text and its stated reason.

A bounded read-only review of the four production changes also confirmed that
the option buffer remains separate from candidate provenance. It changes no
PendingAiDraft metadata, source check, turn record or acceptance payload. The
panel selects only the four option fields; selected-source authority remains
on the existing owned `reviewSession.sources`. Failed requests preserve the
reviewed candidate while retaining the next-draft option buffer.

## Integrity and limits

The phase input manifests pin SHA-256 hashes for the exact panel, hook,
transport, queue, assembly coordinator, shell-project guard, test, configuration,
setup, package metadata and approved contract used. Source/test snapshots are
gzip archives whose decompressed bytes match those hashes. The unchanged
lockfile is pinned by hash only. Phase result metadata records whether pinned
inputs still matched after execution.

`final-inputs.json` records final current inputs, their agreement with the
settled epoch and the one panel-source change since the first GREEN.
`ARTIFACTS-SHA256.json` hashes every other packet file. Every gzip
snapshot was decompressed and checked against its phase manifest.

The coordinator and evidence fixtures are synthetic. This packet does not
qualify a human browser session, durable page-reload retention, live providers,
agency submission or deployment. This test worker runs no compiler, production
build, repository-wide gate, Git mutation or live provider call.
