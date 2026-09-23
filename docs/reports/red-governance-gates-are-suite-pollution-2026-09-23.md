# The five red gates on `concept2cure-v2` are not product defects

**Date:** 2026-09-23 · **Branch:** `concept2cure-v2` · **Status:** characterised, root polluter NOT found

## Why this file exists

A full suite run on `concept2cure-v2` is red on five tests, and every one of them
is a *fail-closed / anti-fabrication* contract — the class of test this product
most depends on. Read as failures they say the product tells a regulatory user
untrue things about governed artifacts. **They do not. Each one passes on its
own.** Filed so the next person does not spend the afternoon I spent finding
that out, and does not ship a "fix" for a defect that is not there.

## The five

| Test | What it asserts | Isolated |
|---|---|---|
| `ectd/__tests__/pdfa-pipeline-ghostscript.test.ts` (×2) | a successful Ghostscript exit is not a conversion | **4/4 pass** |
| `routes/__tests__/markSubmissionReadyFailsClosed.test.ts` | does not answer "Artifact marked submission-ready" when the artifact does not resolve | **2/2 pass** |
| `routes/__tests__/authoringAiDraftNoProvider.test.ts` | a provider failure refuses with its classified code — never a template | **5/5 pass** |
| `tests/ui/surface-honesty.contract.test.ts` (×2) | ProtocolDev does not present unpersisted actions as filed; no client-side e-signature | **12/12 pass** |
| `tests/ui/one-shell.test.ts` | only the shell and its named-thread surfaces start a conversation | **8/8 pass** |

Run each alone and it is green. Run the suite and these five go red.

## What the failures actually look like

They are not near-misses. The values are wrong in ways that say state leaked:

```
pdfa            expected 'Ghostscript PDF/A conversion failed…' to match /no PDF\/A identifier/
pdfa            expected false to be true
markSubmission  expected 200 to be 500        ← the fail-closed path did not fire
authoringDraft  expected 500 to be 429        ← the classifier lost its classification
surface-honesty expected '        …' to match /<ProtocolRegisterForm/   ← read whitespace off disk
one-shell       expected [ Array(1) ] to deeply equal []
```

`markSubmissionReady` getting **200 where it must give 500** is the one to note:
in the polluted run the product appears to claim an artifact is submission-ready
when it could not be resolved. That is only a test artefact — but it is exactly
the assertion you would want to trust, which is the argument for fixing this
rather than muting it.

## Mechanism

`vitest.config.ts:93-97`

```js
pool: 'forks',
poolOptions: { forks: { singleFork: true } },
```

Every file runs in **one** forked process, sequentially. `isolate` is not set, so
the module registry does reset per file — but process state does not. `cwd`,
`process.env`, `globalThis` and anything a module wrote at import time all
persist for the whole run.

The config also sets none of `restoreMocks`, `clearMocks`, `mockReset`,
`unstubEnvs`, `unstubGlobals`.

## Ruled out

Tested directly, not reasoned about:

- **The `process.chdir` callers** — `securityHealth.test.ts`,
  `ind-form-fill-honesty.test.ts`, `form-asset-cwd-parity.test.ts`. Run all three
  ahead of all five failing files: **67/67 pass**. (Worth noting anyway that
  `securityHealth.test.ts:192` restores with `process.chdir(ORIGINAL_ENV.PWD || '/')`
  — if `PWD` is ever unset that lands the process at `/`. It is not today's
  cause; it is a trap for tomorrow.)
- **The two files immediately preceding the first failure.** From the verbose
  log the order begins `biostats-signal-engine/scenarios` →
  `config/environment` → `pdfa-pipeline-ghostscript`. Running those three in that
  order: **68/68 pass**. `environment.test.ts` was the obvious suspect for
  `process.env` leakage and is not it.
- **`surface-honesty` being cwd-sensitive.** Its `REPO_ROOT` derives from
  `import.meta.url`, not `cwd`, so a stray `chdir` cannot explain it reading
  whitespace. A leaked `fs` mock would; 8+ files `vi.mock('node:fs')` at module
  scope.

## Not found

The specific polluting file. Narrowing it needs bisection over the ~394 files
vitest actually includes, at roughly ten minutes per full run — about nine runs.
That work is worth doing and I did not do it.

## Why it matters beyond tidiness

`docs/LAUNCH_DEFINITION_OF_DONE.md` D4 requires "OQ with executed Playwright
evidence" and "a traceability matrix generated from tests". **The validation
evidence is executed test output.** A suite whose governance contracts fail
depending on what ran before them undermines that evidence directly — and a
genuine regression in one of these five would be indistinguishable from the
noise everyone has learned to scroll past.

## For whoever picks this up

1. Bisect for the polluter. Halve the include set ahead of the five; keep the
   half that reproduces.
2. Resist the quick fix. Adding `restoreMocks: true` / `unstubEnvs: true` /
   `unstubGlobals: true` to `vitest.config.ts` would plausibly fix it, but it
   changes behaviour for every test in the repo — anything relying on a spy
   persisting across `it` blocks breaks. Find the cause first; then decide
   whether the hygiene settings are the right general fix.
3. Whatever the fix, **prove it by making it fail**: re-introduce the pollution
   and watch the five go red again. A green suite that was never seen red proves
   only that it is green today.
