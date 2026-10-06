# Native incremental cache preparation evidence

These temporary scripts are pinned to the inspected TypeScript **5.6.3** implementation. They use the repository selected by `C2C_REPO_DIR`, or the current working directory when that variable is absent. They do not edit production scripts, tsconfig, or typecheck baselines. Cache preparation does not establish a project typecheck verdict.

## What the toy regression proves

`seed-batches.cjs` copies the repository compiler options and include/exclude patterns into independent toy projects, with the installed normal libraries/types and unchanged `skipLibCheck`. Actual source roots are the toy fixture files, and the repository `server/types` augmentation tree is not copied. The proof therefore exercises cache API behavior under matching option patterns, not the repository’s complete source roots or augmentations. It creates a unique temporary directory under the operating system temporary directory and prints that path. It uses no narrowed include, `noCheck`, `noLib`, or changed type options.

The compiler drains native invalidation/signature bookkeeping with `getSemanticDiagnosticsOfNextAffectedFile(undefined, () => true)`. Ignored files remain genuinely unchecked. Native `emitBuildInfo()` serializes their numeric missing-diagnostic IDs. Once the affected queue is empty, each `getSemanticDiagnostics(sourceFile)` call records that file’s actual diagnostics and native build-info emission preserves the remaining unchecked files. No build-info records are synthesized or marked clean manually.

The original run passed these safeguards:

- Never-checked erroneous toy files still fail the subsequent toy-project `tsc` CLI check.
- A cached error in an untouched file remains a failure after a safe edit elsewhere.
- Correcting the erroneous toy file passes only after the toy-project `tsc` CLI checks the changed state.
- An exported signature change fails an untouched dependent.
- A global declaration change invalidates affected consumers despite `skipLibCheck`; an untouched dependent still fails.
- Real one-file diagnostic batches reduced native unchecked entries from 397 to 396 to 395 in the fixture environment.

Ordinary affected-file iteration interrupted mid-group can repeat that group across processes and stall. The signature-only seed drains that queue first. The toy-project `tsc` CLI subsequently checks its configuration, syntax, options, globals, pending source diagnostics, and cached diagnostics. These toy CLI checks are distinct from the repository’s canonical typecheck gate.

## Commands

Run these commands from the repository root, replacing `/path/to/evidence` with the directory containing these copies. Alternatively, set `C2C_REPO_DIR` to the absolute repository path.

```sh
node /path/to/evidence/seed-batches.cjs
node --max-old-space-size=6144 /path/to/evidence/c2c-ts-prewarm.cjs seed
node --max-old-space-size=6144 /path/to/evidence/c2c-ts-prewarm.cjs batch 3000 6200
```

An optional Node garbage-collection benchmark can be enabled for a batch:

```sh
node --expose-gc --max-old-space-size=6144 /path/to/evidence/c2c-ts-prewarm.cjs batch 3000 6200
```

At the soft RSS boundary, an exposed GC function causes the helper to emit a native checkpoint first, invoke GC, and record RSS and heap usage before and after in its JSON `gcEvents` log. It still stops if RSS remains above the boundary. Without `--expose-gc`, it stops at the boundary without attempting GC. The benchmark does not change compiler state, options, or native cache semantics, and does not establish a typecheck result or guarantee memory recovery.

The preparation helper writes only the normal native incremental cache under `node_modules/.cache/typecheck-no-regression/tsconfig.tsbuildinfo`. It validates the config, compiler version, drained signature queue, and expected output path, then writes compiler-produced content atomically. The batch arguments are maximum checked files and a soft RSS boundary in MB. A soft boundary is evaluated between files; it cannot bound memory consumed within one file. Repeat batches as appropriate for the host. Avoid concurrent cache writers.

After any preparation of the actual repository cache, the unchanged repository gate over its complete source roots and augmentations is still required:

```sh
TYPECHECK_HEAP_MB=6656 node scripts/ci/typecheck-no-regression.mjs --incremental
```

Choose a heap cap appropriate to the host. A killed compiler or failed gate is not a typecheck success. Running the preparation scripts alone does not establish a project verdict or guarantee that preparation fits every host; the completed gate result is recorded below.

## Completed repository validation

The full repository configuration contained 6,751 root files and 11,810 compiler source files. Thirteen bounded native batches performed 11,814 semantic-diagnostic calls across all 11,810 sources. Four changed test files were checked again after type corrections; remaining unchecked entries were always preserved by native compiler output. The configured `skipLibCheck` remained unchanged, so declaration-file calls follow that existing option.

The final native checkpoint had zero pending entries and zero cached diagnostic-error files. The unchanged repository gate then completed with TypeScript exit 0 and zero errors against the unchanged zero-error baseline:

```sh
TYPECHECK_HEAP_MB=6656 node scripts/ci/typecheck-no-regression.mjs --incremental
```

`canonical-gate.txt` is the exact gate transcript. `project-batches.json` records each actual batch, including the temporarily cached errors, later native invalidation, and the optional GC measurements. Neither compiler configuration, typecheck gate, nor typecheck baseline was changed.

`toy-seed-batches.txt` records the original toy-project proof execution; its paths reflect that original temporary environment. `toy-affected-batch-stall.txt` records why simply interrupting affected-file iteration was discarded. The portable toy script uses a new temporary directory when rerun. These toy checks establish the cache API safeguards; the repository gate above establishes the final project verdict.

The two portable `.cjs` evidence scripts were separately scanned with the same `p/default` and `p/ci` configurations, unchanged baseline `e78869eec43301b44f2e1af01e630f0278b3d360`, and 30-second rule timeout: exit 0, 200 rules run, two targets, zero findings, zero warnings, and 100% parsed lines. The transcript, exact JSON result, and target manifest are `semgrep-evidence-scripts.txt`, `semgrep-evidence-scripts.json`, and `semgrep-evidence-scripts-targets.txt`. Semgrep text transcripts remove trailing terminal padding; the JSON results are unchanged.

The portable copies use `console.info` with literal format strings and a `const` binding for the toy skipped-file array to satisfy repository lint. Their stdout values and compiler procedure are unchanged. Node syntax checks and ESLint with `--max-warnings 0` passed for both files; `syntax-and-lint.json` records the commands and exit status. Heavy toy/compiler runs were not repeated for these stdout/declaration adjustments.
