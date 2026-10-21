# Registered result bound and native single-result handoff proof

## What already exists

- `server/services/ana/document-passage-tools.ts` registers the real passage
  handler, scope gate, ordinary three-pass fitter and unavailable-result branch.
  Its current fitter leaves one oversized locator; the unavailable/early-return
  envelopes do not pass through a final serialized size guard.
- `document-tools-shared.ts` supplies the actual `withCaughtErrors` wrapper.
  Ordinary unexpected failures already receive a fixed safe-outcome envelope.
  Known source/project errors keep their refusal classification and message.
- `agentic-loop.ts` supplies the actual 8,000-character per-result cap and
  single-result path through the 24,000-character round budget.
  `tool-output-frame.ts` supplies the actual untrusted-data framing and recovery.
- Existing passage/budget suites already exercise normal fitting. This suite
  completes final-guard and native handoff coverage, not a second implementation.
- The parent contract records the current-code/deleted-history investigation.

## Frozen fail-first baseline

Baseline: `4282257ac3da9b1c5d15b8e7db6c7599f2388f28`.
Approved contract: `aef0f66cc`, parent `CONTRACT.md`.
Node 22.23.3, canonical `vitest.config.ts`, one worker, 4 GiB heap.

**6 intended failures / 8 passing controls / 14 tests, exit 1.** Every failure
is the expected serialized-length assertion against the contract's 7,500-character
bound. There are no setup, import, timeout or unexpected harness failures:

| Failing case | Baseline serialized length |
| --- | ---: |
| Plain oversized unavailable diagnostic | 14,225 |
| JSON-escaped unavailable diagnostic | 9,253 |
| Defensive early scope-refusal envelope | 14,058 |
| Known program error through real caught-error wrapper | 14,070 |
| Known project-unavailable error through real wrapper | 14,080 |
| Final oversized locator through the native handoff checks | 13,608 |

The success/miss controls preserve their complete JSON through actual budgeting,
per-result capping, framing and unframing, including literal closing tags and
Japanese/astral source text. Other controls preserve organization/actor gates,
short query and scope refusal, ordinary unavailable output and existing safe
suppression of a huge unexpected error. Oversized policy-error constructors are
defensive fixtures; normal production policy messages inspected are short.

`baseline-command.json` records exact argv/environment/timing and ten unchanged
input hashes before/after the run. `baseline-red.txt` is byte-preserved combined
output. Scoped ESLint `--max-warnings=0` passed (exit 0); command/raw output are
retained. `frozen-test.json` binds the test bytes for root's unchanged green run.

## Boundaries

Only catalog/retrieval seams are synthetic. Registration, shared caught-error
logic, source/project error constructors and cap/budget/frame functions are real.
Canonical test setup mocks PostgreSQL globally; startup diagnostics in the raw
log do not establish a live connection or external database exercise. No live
database, OCR, provider or agency call, compiler, production edit or Git mutation
was performed by this owner.

This proves the registered serialized handler body and its single-result model
handoff. It does not prove crowded aggregate rounds remain uncut or bound framing
overhead. Existing aggregate-round behavior remains outside this completion.
