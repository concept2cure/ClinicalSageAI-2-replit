# Full-program TypeScript checking on a memory-constrained host

The default `ci:typecheck:no-regression` command still invokes the installed
`npx tsc --noEmit -p tsconfig.json` CLI. CI workflows and the zero-error baseline
are unchanged. An explicit `TYPECHECK_FILES_PER_PROCESS` setting enables fresh,
sequential compiler-API processes for hosts that cannot retain all semantic
checker caches at once. This adds no dependencies and changes no application
runtime or UI behavior.

## Why this was necessary

The current workspace has an 8 GiB memory limit. The ordinary full-project
command was killed with exit 137 at its default 24 GiB heap allowance. A second
attempt with a 7,168 MiB heap reached a V8 out-of-memory failure. Neither attempt
completed typechecking and neither constitutes passing evidence. The canonical
gate correctly rejected both rather than interpreting missing diagnostics as
zero errors.

An independent TypeScript 5.6.3 inventory loaded 7,110 configured root files and
12,171 total program source files, including 5,046 declarations and 7,125 other
files. The complete program used approximately 3.74 GiB RSS before semantic
checking. Reducing the configured roots would lose callers, imported files and
ambient declarations. The optional mode therefore retains every root and every
loaded source in every process, partitioning only calls to the diagnostics API.

## What the optional gate verifies

- The same installed compiler, complete parsed configuration, compiler options,
  root names, project references and `noEmit: true` are present in every worker.
  `--incremental` preserves its exact option/build-info path context, but the
  optional mode reads no cached diagnostics and writes no build-info or output.
- Configuration parsing, options, syntactic and global diagnostics are collected
  once. Every item returned by the full program's `getSourceFiles()` receives a
  semantic diagnostics call exactly once across workers. Declaration diagnostics
  are also collected for every item when effective declaration generation is
  enabled. TypeScript retains its own `skipLibCheck` behavior; declaration files
  still appear in the complete coverage manifest.
- The manifest binds compiler/helper hashes, configuration and options, root and
  reference topology, every loaded source's content hash, and every observed
  compiler-host disk input. Resolution inputs include package descriptors,
  missing file candidates and directory listings. Source, inherited-config or
  dependency changes invalidate the snapshot. Inputs are rechecked after each
  worker, and a final fresh full-program worker verifies the same snapshot.
- Worker exit failures, signals, missing/truncated JSON, invalid result shapes,
  different snapshots, incomplete assignments, duplicate assignments, invalid
  configurations and empty programs fail. Worker completion and exact coverage
  are required before the existing gate evaluates the zero baseline.
- The opt-in accepts only integer settings from 1 through 10,000. It refuses
  baseline writes and any nonzero baseline. No existing gate, security policy or
  release requirement is suppressed.

The compiler API's eager diagnostic union can report more findings than the CLI
on already-invalid programs: the CLI stops later diagnostic phases after some
earlier-phase errors. The optional mode is consequently restricted to the
existing zero baseline. Fixtures compare its complete normalized diagnostic
sets, including related information, against `getPreEmitDiagnostics` from the
same installed compiler. Clean and newly erroneous fixture programs also have
the same acceptance/rejection outcome under the ordinary CLI. This evidence
does not claim byte-identical CLI debt counts on invalid programs.

## Regression evidence

The self-tests use small fixtures and the real installed TypeScript compiler:

```sh
node --test scripts/ci/__tests__/typecheck-memory-bounded.test.mjs \
  scripts/ci/__tests__/typecheck-memory-bounded-gate.test.mjs
```

Coverage includes callers imported outside configured roots, merged globals,
module augmentations, checked and skipped declarations, declaration diagnostics,
missing modules, fileless diagnostics, syntax errors, unused error expectations,
project-reference declarations, deterministic manifests, source/config/dependency
mutation, newly created previously-missing package descriptors, malformed worker
output and incorrect successful-worker assignments.

The final combined suite passed all **27 tests** under Node 22.23.3 with the
installed TypeScript 5.6.3. The receipt is [self-tests.txt](./self-tests.txt).
An explicit SIGTERM worker test verifies that cancellation is a failure.
Forced ESLint checking with `--no-ignore` completed with **zero errors and 11
warnings**: five complexity warnings in the new helper and six existing
console warnings in the canonical gate. The inherited script ignore patterns
are unchanged; the forced result is recorded in
[forced-eslint.txt](./forced-eslint.txt), rather than treating ignored files as
lint coverage.

An independent agent reviewed the full-program context, source/dependency
snapshot binding, complete assignments, failure handling, baseline restrictions
and preserved default path. It passed the earlier 26-test suite and accepted the
final trivial lint cleanup. The final 27-test receipt above runs against these
reviewed script hashes:

| Script | SHA-256 |
| --- | --- |
| `typecheck-memory-bounded.mjs` | `d19fce416cdd343c4da3f60897342377fabe4b8bc2b9bc4084100c10da3aed4a` |
| `typecheck-no-regression.mjs` | `13df7cc80c7e2c935a8c245b555eac97e7ad5ade59c785258eee63901a5890bd` |

The canonical gate fixture first passes with `transform(number)` and an existing
caller passing `123`. Editing only the API to `transform(string)` makes the gate
reject TS2345 in the byte-unchanged caller. Restoring the API passes again. The
zero baseline remains byte-unchanged, and no incremental cache is produced.
The ordinary installed `tsc` CLI independently accepts the clean fixture and
rejects the same caller error. This is a demonstrated regression rejection,
not an assertion that checking the edited API alone would catch its callers.

Two real-repository probes completed discovery and the first 1,000 and 2,000 of
12,171 diagnostic targets at a 6,144 MiB heap limit. Both were intentionally
stopped with exit 130 before completing all workers, so they are **partial
capacity evidence only**, not passing full-project gates. After the second
probe, module loading was simplified to the literal `require('typescript')`
using the same repository-local resolver and resolved compiler hash; no dynamic
module string, suppression or dependency change was needed. The final
canonical pre-push run had to complete all targets and all required hooks
against the final corrected source. Its completed result is recorded below.

The first complete canonical pre-push run did finish discovery, all 12,171
diagnostic targets and final verification in 15 workers with one unchanged
snapshot. It correctly rejected an actual TS2345 introduced in the optional
section-scoping code, rather than treating complete coverage as success.
The real failure and one-line nullable-argument repair are recorded in
[`pre-push-typecheck-red.txt`](../../D4/2026-10-09-ana-ind-depth-delivery/pre-push-typecheck-red.txt)
and the adjacent delivery record. All workers must run again against the
repaired source; no previous diagnostic result is reused.

The fresh run against local commit
`263c1bc627d9b6b8d0b280a03ab127dfaef80d67` subsequently passed the complete
canonical pre-push hook in 993.40 seconds: all 12,171 files checked exactly once,
15 workers completed, zero errors, unchanged snapshot and exit 0. The snapshot
was `1ddd71e73282f4bc06cde8a8c702d32da462f3cf85c9b872fb40e3294756f518`.
The complete raw output and explicit completion record are
[`pre-push-green.txt`](../../D4/2026-10-09-ana-ind-depth-delivery/pre-push-green.txt)
and [`pre-push-completion.json`](../../D4/2026-10-09-ana-ind-depth-delivery/pre-push-completion.json).
An intermediate corrected-source attempt was interrupted after 5,000 targets;
it is not counted as passing evidence. The successful run was fresh and
complete. Documentation-only evidence additions after that run do not change
the checked code, configuration, dependencies or compiler scripts.

Example explicit invocation on this host:

```sh
TYPECHECK_HEAP_MB=6144 TYPECHECK_FILES_PER_PROCESS=1000 \
  npm run ci:typecheck:no-regression -- --incremental
```

These diagnostics concern code correctness. They do not establish IND scientific
qualification, regulatory applicability, browser journey success, current remote
CI success or overall release clearance.
