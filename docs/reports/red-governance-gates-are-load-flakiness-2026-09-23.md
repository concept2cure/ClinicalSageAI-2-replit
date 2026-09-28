# The five red gates on `concept2cure-v2` are flaky under load, not product defects

**Date:** 2026-09-23 · **Branch:** `concept2cure-v2`
**Status:** cause identified as load-induced flakiness. **This file previously
said state pollution and named a hunt for a polluter. That was wrong — see
"What I got wrong".**

## The short version

A run of the governance suite came back red on five fail-closed contracts. They
are **not product defects**: each passes alone, and the whole set now passes
together under the same command. The failures appear when the machine is
contended — they are timing flakiness in a single long-lived fork, not a
deterministic polluter. Do not go looking for one.

## The five

| Test | What it asserts |
|---|---|
| `ectd/__tests__/pdfa-pipeline-ghostscript.test.ts` (×2) | a successful Ghostscript exit is not a conversion |
| `routes/__tests__/markSubmissionReadyFailsClosed.test.ts` | never answers "Artifact marked submission-ready" when the artifact does not resolve |
| `routes/__tests__/authoringAiDraftNoProvider.test.ts` | a provider failure refuses with its classified code — never a template |
| `tests/ui/surface-honesty.contract.test.ts` (×2) | ProtocolDev does not present unpersisted acts as filed; no client-side e-signature |
| `tests/ui/one-shell.test.ts` | only the shell and its named-thread surfaces start a conversation |

## Evidence

| Run | Result |
|---|---|
| Each of the five, alone | green (4/4, 2/2, 5/5, 12/12, 8/8) |
| `server/` entire tree | **1739 files, 18,446 tests, 0 failures** |
| `server/ client/…/v2/__tests__/ tests/ui/` with `--testTimeout=60000` | **2011 files, 21,568 tests, 0 failures** |
| The exact command that went red, re-run on a quiet machine, default timeout | **399 files, 4245 tests, 0 failures** |
| The same command while a dev server and background suites were running | 5 failures |
| The five + `client/…/v2/__tests__/` | the five passed; **a different file failed** (`shadowReviewGateScore.test.tsx`), which also passes alone |

Two things make the load explanation fit and the pollution explanation not:

**The victim moves.** State pollution breaks the same thing every time. This
broke five files in one run and a sixth, unrelated one in the next. That is
contention, not a leaked global.

**The wrong values are what a swallowed async timeout produces.** Not near
misses:

```
markSubmission  expected 200 to be 500   ← fail-closed path did not complete
authoringDraft  expected 500 to be 429   ← classifier fell back to generic
pdfa            'Ghostscript PDF/A conversion failed…' not /no PDF\/A identifier/
surface-honesty read whitespace off disk for an import.meta.url path
```

Each is an operation that did not finish in time being caught and reported as
something else.

There is a precedent already in the tree: `capabilityBrowser.test.tsx` carries
a 30s budget with a note that it "crossed vitest's 10s default under the full
suite's parallel load in CI (run 12105, 2026-09-23)". Same shape, already seen.

## Why the config makes it likely

`vitest.config.ts:93-97`

```js
pool: 'forks',
poolOptions: { forks: { singleFork: true } },
```

One forked process runs every file, sequentially, for the whole suite. One
event loop and one heap absorb 2000 files' worth of work, so a machine doing
anything else pushes per-test latency past the 10s default. `singleFork` is
presumably deliberate (pglite integration tests, memory); this note is not an
argument to remove it.

## What I got wrong

The first version of this file said the cause was `cwd` / `process.env` /
`globalThis` leaking across files under `singleFork`, and told the next person
to bisect ~394 files for the polluter. I had ruled out two candidate polluters
by experiment and inferred the mechanism from the config rather than from
evidence.

Then the same command passed on a quiet machine with no code change, and the
victim moved between runs. Both falsify it. A committed finding that sends
someone hunting something that is not there costs more than no finding, which is
why this is a rewrite rather than an appended correction.

The one thing that survived unchanged, and the thing that matters: **none of the
five is a product defect.**

## What is actually worth doing

1. **Do not mute them and do not chase a polluter.** Treat it as test
   robustness under contention.
2. **Size the budgets to the work**, as `capabilityBrowser.test.tsx` already
   does. The tests that fail are the ones doing real work — a Ghostscript
   subprocess, a directory walk over `client/src`, a route with an async
   fail-closed path.
3. **If CI stays flaky, the lever is the pool**, not the assertions. Sharding,
   or relaxing `singleFork` for the files that do not need it, addresses the
   cause; loosening an assertion hides it.
4. **Never loosen one of these five to make it green.** They are the contracts
   that stop the product telling a regulatory user an artifact is filed,
   submission-ready, PDF/A-conformant or signed when it is not.

## Why it matters beyond CI hygiene

`docs/LAUNCH_DEFINITION_OF_DONE.md` D4 requires "OQ with executed Playwright
evidence" and "a traceability matrix generated from tests". The validation
evidence **is** this output. A suite that goes red under load produces OQ
evidence that varies with what else the runner was doing — and a genuine
regression in one of these five would arrive looking exactly like the flake
everyone has learned to scroll past.
