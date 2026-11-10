# The gate for the `require` class could not see the file that caused it

**Row:** D1 (every gate green, and the gate actually looks) · **Package:** F1 · **Date:** 2026-11-09

`ci:commonjs-require` exists for exactly one defect: a dynamic `require()` in this `"type": "module"`
package, which throws `ReferenceError` the first time its branch runs — a 500 at click time, invisible
until then, and invisible to unit tests because Vitest supplies a working `require`.

This morning that defect broke the only CMC path that reaches a §11.50 signature: batch release
answered `500 ReferenceError: require is not defined` from inside a hash, for every batch
(`docs/evidence/F1/2026-11-09-batch-release-fingerprint/`). The `require` was in
`shared/canonical-json.ts`.

**The gate never looked at that file.**

## What already exists

| Path | What it does today |
|---|---|
| `scripts/ci/check-commonjs-require.mjs` | Lists source files with `git ls-files`, strips comments with the shared string-aware stripper, reports every un-allowlisted `require(` against a baseline that may only shrink. Runs in CI's Lint job |
| `scripts/ci/commonjs-require-baseline.json` | 8 files |
| `scripts/ci/__tests__/commonjs-require-strings.test.mjs` | 21 cases over the comment/string stripping, each running the real gate in a throwaway git repository |
| `scripts/ci/__tests__/helpers/scratch-repo-gate.mjs` | That harness |

Nothing new: the sweep, the baseline and the test harness all already exist. This is a one-line
correction to the sweep, plus the cases that hold it.

## The defect

```
git ls-files 'server/**/*.ts' 'shared/**/*.ts' 'workers/**/*.ts' 'services/**/*.ts'
```

Git's pathspec globs let `*` cross `/`, so `server/*.ts` is **already** the whole recursive tree.
`server/**/*.ts`, by contrast, requires at least one directory level — so nothing directly under
`server/`, `shared/`, `workers/` or `services/` was ever swept. Measured:

```
'server/**/*.ts' 'shared/**/*.ts' 'workers/**/*.ts' 'services/**/*.ts'   8257 files
'server/*.ts'    'shared/*.ts'    'workers/*.ts'    'services/*.ts'      8313 files
```

**56 files invisible**, listed in `01-the-blind-spot.txt`. Among them `shared/schema.ts`,
`server/index.ts`, `server/db.ts`, `server/storage.ts`, `shared/canonical-json.ts` — and exactly one
with a live `require(`.

## What the widened sweep found

`server/openai-service.ts:313`, inside `extractTextFromPdf`:

```ts
if (typeof pdfPathOrBuffer === 'string') {
  const fs = require('fs');
  buffer = fs.readFileSync(pdfPathOrBuffer);
```

The module imports `fs` statically on **line 2**. This `const fs` shadowed it with a `require` that
cannot run in either runtime, so reading a PDF **from a path** threw `ReferenceError` — a 500 at click
time — while reading the same PDF from a Buffer worked. One line removed; the static import was
already there and already used.

That is the whole finding set: no baseline change, and no other file in the blind spot carries a
`require(` at all.

## Verified by making the check fail

`02-the-gate-sees-it-now.txt`: the widened gate on the unfixed tree, reporting
`server/openai-service.ts:313` with its own explanation, then quiet after the one-line fix.

`03-the-cases-refuse-the-old-glob.txt`: four cases added to the existing suite — a `require(` placed in
`shared/canonical-json.ts`, `server/openai-service.ts` and `services/capability-unavailable.ts`, plus a
control one directory deeper. Against the **old** `**` glob, the three top-level cases fail and the
control passes, so the correction is shown to close the hole and to lose nothing.

## Green

- `node --test scripts/ci/__tests__/commonjs-require-strings.test.mjs` — 25 passed (was 21)
- `npm run ci:commonjs-require` — `no new occurrences. 8 baselined across 8 file(s).` over 8313 files
- `eslint server/openai-service.ts` — 0 errors, and one warning fewer than at HEAD (10 → 9)
