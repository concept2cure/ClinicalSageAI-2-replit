# U7: the production image did not contain the vendored FDA IND forms

Launch row: D1 (hosted production). Date: 2026-09-25. Branch: `concept2cure-v2`.

## Defect

`server/services/ind-forms/template-locations.ts:70` resolves the vendored
official FDA IND forms at `path.join(PACKAGE_ROOT, 'templates', 'forms',
'acroforms')`. `PACKAGE_ROOT` is the nearest directory above the running module
that holds a `package.json`. In the image the module is `/app/dist/index.js`, so
the directory is `/app/templates/forms/acroforms`.

The production stage of `Dockerfile.optimized` copied `dist`, `server`,
`shared`, `migrations`, `db/migrations`, `scripts/db` and `assets`. It did not
copy `templates/`, so the directory did not exist in the image. The ten files in
it (FDA 1571, 1572, 3454, 356h and 3674, each with a `.manifest.json`) are
tracked in git and were present in every checkout, test run and CI job. That is
why nothing failed.

In production `readTemplate()` returned null from its catch. Every IND form
then rendered as a reconstruction or a labeled draft, and the genuine
FDA-secured 1571/3674 was refused as LEAF-ENCRYPTED when the sequence was
packaged. No error was raised. The Submission Center IND path is a
launch-catalog client path.

The defect class had happened once before. `assets/estar-templates` was missing
from the image for the same reason; see the comment above
`COPY --from=builder /app/assets ./assets`. There was no check that compared
the image's COPY set with the paths the server reads, so it happened again.

## Fix

`Dockerfile.optimized:170`, in the production stage, directly after the
`assets` COPY and with a comment in the file's style:

```dockerfile
COPY --from=builder /app/templates/forms/acroforms ./templates/forms/acroforms
```

Only `acroforms/` is copied. No other module in the production bundle reads
`templates/`. The only other `templates` path literals in shipped modules are
`server/templates/m3`, which ships with `server/`, and relative imports under
`server/services/orchestration/templates/`.

## The gate: `scripts/ci/check-image-runtime-assets.mjs`

It is modeled on `check-server-bundle-prod-imports.mjs` and follows the same
conventions: a header that states the defect and why nothing caught it, exit
0/1, a written-exception table, stale-entry detection and a separate self-test
file. The gate works in four steps:

1. **Which code ships.** esbuild bundles `server/index.ts` with
   `SERVER_BUILD_OPTIONS` imported from `scripts/build-server.mjs` and the
   production `define` (`NODE_ENV=production`). The metafile then gives every
   source file that contributes bytes to `dist/index.js`: 2,724 modules today.
   Only those files are scanned. A module the bundle does not contain cannot
   read anything in production, and the repository has many such modules.
2. **What that code reads under the app root.** Comments are stripped
   (`lib/strip-comments.mjs`). The gate then records every path built from
   string literals on an anchor the image resolves under `/app`:
   - `path.join/resolve(process.cwd(), …)`
   - `path.join/resolve(PACKAGE_ROOT, …)`
   - `path.resolve('…')`
   - `fs.readFileSync('…')` and the other fs readers
   - `path.join/resolve(__dirname | import.meta.dirname, …)`. In the image every
     module is `dist/index.js`, so this anchor resolves to `<WORKDIR>/dist`, not
     to the source directory it names in dev.

   Same-file `const X = '…'` segments are resolved. So are assignments chained
   from an anchored path (`const dataDir = path.join(__dirname, '..', 'data')`,
   then `path.join(dataDir, 'x.json')`). A reused name binds to the nearest
   assignment above the use.
3. **Every discovered path is classified** in `RUNTIME_PATHS`, by longest
   prefix, as one of three kinds, each with a written reason:
   - `ship`: the image must contain it.
   - `not-shipped`: the image correctly lacks it.
   - `known-gap`: the image lacks it and should not. This is a decision with an
     owner, and it is printed on every run.

   The gate fails on any of these:
   - an unclassified path
   - a classification that no shipped module produces any more
   - a known gap that the image now covers
   - a classification with no reason
4. **Checking a `ship` path against the image.** The Dockerfile is parsed:
   continuation lines are joined, stages are split on `FROM`, and `WORKDIR` is
   tracked. Each COPY destination is mapped back to its source.
   `--from=builder /app/<p>` maps to context path `<p>`, because the builder
   stage is `COPY . .` into `/app`. A `ship` path must meet all of these:
   - a COPY in the stage named `production` (the pipeline's `--target`) covers
     it
   - the source is tracked in git
   - `.dockerignore` does not exclude it. The gate uses Docker's own semantics:
     whole-path match (`*.md` excludes only root-level `.md` files), any excluded
     parent excludes the child, `**` spans directories, `!` re-includes, and the
     last match wins.
   - for `dist/` paths, `npm run build` actually produces it. That means only
     `dist/public` (vite `outDir`) and `dist/index.js`.

It takes about 4 seconds. `--list` prints the full inventory.

## Proof

### Before the fix: FAIL naming templates/forms/acroforms

The gate was first run against the working-tree Dockerfile before it was edited.
To reproduce it from the committed file:

```
$ git show HEAD:Dockerfile.optimized > $SCRATCH/Dockerfile.optimized.HEAD
$ node scripts/ci/check-image-runtime-assets.mjs --dockerfile $SCRATCH/Dockerfile.optimized.HEAD
[image-runtime-assets] FAIL
…/Dockerfile.optimized.HEAD stage "production" does not contain what the server reads at run time:
  templates/forms/acroforms — read at run time by server/services/ind-forms/template-locations.ts:70; the image must ship it, and no COPY in stage "production" puts anything at /app/templates/forms/acroforms.
Known gaps (written decisions, not failures):
  … (the 8 listed below)
exit 1
```

The failure section names one path, and it is the acroforms directory.

### After the fix: pass, with the written exceptions listed

```
$ node scripts/ci/check-image-runtime-assets.mjs
[image-runtime-assets] ok — Dockerfile.optimized stage "production": 78 app-root paths read by 2724 shipped modules; 17 shipped and covered, 53 correctly not shipped, 8 known gap(s) by written decision:
  .venv/bin/python3 — server/services/unifiedDocumentIngestion.js:93: …
  data/global-regulatory-authorities.json — server/services/regulatory-pathway-intelligence.ts:113: …
  data/ich-guidelines-comprehensive.json — server/services/regulatory-pathway-intelligence.ts:121: …
  data/regulatory-document-requirements-matrix.json — server/services/regulatory-pathway-intelligence.ts:131: …
  dist/rules/manufacturingRules.yaml — server/src/services/ai/manufacturingReviewer.js:15: …
  docs/validation — server/routes/validation-kit.ts:24, :67, :129: …
  ingestion/pdf_extractor.py — server/services/unifiedDocumentIngestion.js:94: …
  workers/artifact-compute/docx-python-runtime.py — server/services/compute/workerClient.ts:20: …
exit 0
```

### Self-test: the gate fails on each constructed case

`node scripts/ci/check-image-runtime-assets.selftest.mjs` builds a synthetic
repository in a temp directory for each case. Each one has a `server/index.ts`
that the gate bundles the production way, plus a Dockerfile, a `.dockerignore`
and a classification. Each cut must produce exit 1 and exactly one finding that
contains the expected text:

```
ok   — intact fixture passes, the unbundled module's unclassified read ignored (exit 0)
ok   — the production stage does not COPY a shipped path (the U7 acroforms defect): exit 1, 1 finding(s)
ok   — the COPY exists, but in another stage than the one that ships: exit 1, 1 finding(s)
ok   — .dockerignore keeps the source out of the build context: exit 1, 1 finding(s)
ok   — the COPY source does not exist in the repository: exit 1, 1 finding(s)
ok   — a new run-time read in a shipped module, unclassified: exit 1, 1 finding(s)
ok   — a bundle-relative __dirname read: dist/ in the image, not the source directory: exit 1, 1 finding(s)
ok   — a classification no shipped module uses any more: exit 1, 1 finding(s)
ok   — a known gap the image now covers, left unreclassified: exit 1, 1 finding(s)
ok   — a classification with no written reason: exit 1, 1 finding(s)

[image-runtime-assets:selftest] the gate fails on all 9 cuts and passes the intact fixture.
```

The intact fixture contains a module that is not imported and that reads an
unclassified path. The intact case passes, which shows that only bundled
modules are scanned.

### Docker

The Docker CLI is installed but no daemon was running, so I started `dockerd`
for the session.

**Full `docker build -f Dockerfile.optimized --target production`: not
completed.** Build steps can reach the network only through the session's
egress proxy. With the proxy CA and `--network host` supplied from a scratch
copy of the Dockerfile, `apt-get update` in the production stage got
`HTTP/1.1 403 Forbidden` from the proxy for `deb.debian.org`. That host is not
allowed from this environment, so the LibreOffice/JRE layer cannot be built
here. This is an environment limit and says nothing about the Dockerfile.

**Docker verification of the COPY set: done.** A scratch Dockerfile used the
real repository as context with the real `.dockerignore`. It ran the builder's
`COPY . .`, then a production stage made of the seven
`COPY --from=builder` lines from `Dockerfile.optimized`'s production stage
(extracted with awk; `dist` was left out because it needs `npm run build`).
Results:

- With the fix: all ten files are at `/app/templates/forms/acroforms/`. Their
  sha256 values are byte-identical to the repository's (`diff` of both
  `sha256sum` listings is empty). `/app/templates` contains nothing else.
- Without the new line (the pre-fix set):
  `ls: cannot access '/app/templates/forms/acroforms': No such file or directory`.
- Nested `README.md` files under `/app/assets/*/` are present in the image. This
  confirms that `.dockerignore`'s `*.md` excludes only root-level files, which is
  the semantics the gate implements. The existing Dockerfile comment on the
  assets COPY (".dockerignore excludes only *.md here") suggests otherwise. It is
  harmless, but it is not accurate.

`.dockerignore` was read in full. Nothing in it matches `templates/` or
`templates/forms/acroforms/*`: the PDFs are `.pdf` and the manifests are
`.pdf.manifest.json`.

## Runtime-path inventory (from the gate, `--list`)

There are 78 distinct paths, read by 2,724 shipped modules. They are grouped
here by classification key. `--list` prints every path with its call sites.

### Shipped: the image must contain these, and it does

| Path | Covered by | Read by |
|---|---|---|
| `templates/forms/acroforms` | `COPY … /app/templates/forms/acroforms` (**this fix**) | `ind-forms/template-locations.ts:70` |
| `assets/estar-templates` | `COPY … /app/assets` | `pathway-engines/estar/estar-template-registry.ts:140` |
| `assets/ectd-dtd` | `COPY … /app/assets` | `ectd/dtd-bundler.ts:101` |
| `assets/ectd-schema` | `COPY … /app/assets` | `ectd/schema-bundler.ts:41` |
| `assets/fda-recognized-standards` | `COPY … /app/assets` | `fda-recognized-standards/recognized-standards-dataset.ts:116` |
| `server/services/ai-gateway/prompts` | `COPY … /app/server` | `ai-gateway/prompts-dir.ts:20` |
| `server/export/stylePacks` (+4 files) | `COPY … /app/server` | `export/stylePacks/config.ts:24–42` |
| `server/templates/m3` | `COPY … /app/server` | `routes/authoring.router.ts:4668` |
| `server/scripts/docx_pdf_pipeline.py` | `COPY … /app/server` (the file ships; see the Python gap) | `docx-pdf-pipeline.ts:33` |
| `migrations` | `COPY … /app/migrations` | `db/runtime.ts:264` |
| `dist/public` (+`assets`, `index.html`) | `COPY … /app/dist` (vite outDir) | `server/vite.ts:97–121` |

### Known gaps: the image lacks these and should not (each a written decision)

| Path | Read by | What happens in production | Owner / fix |
|---|---|---|---|
| `workers/artifact-compute` | `compute/workerClient.ts:20`, `compute/scriptWorker.ts` (paths passed as arguments) | The python DOCX tools fail. The scripts are not copied, python-docx is not installed, and python3 is present only as ocrmypdf's dependency. | **Founder decision** on shipping a Python runtime. Python was not added here. |
| `ingestion/pdf_extractor.py`, `.venv/bin/python3` | `unifiedDocumentIngestion.js:93–94` | The fallback when the FastAPI extractor is unreachable fails. | Same Python decision. |
| `docs/validation` | `routes/validation-kit.ts:24` (AdminSurfaces) | The GAMP 5 validation-kit catalog returns an empty list for documents that exist. `docs` is in `.dockerignore` and no COPY names it. | Launch lead. A fix needs a `.dockerignore` re-include plus a COPY, and `.dockerignore` was outside this change's file set. |
| `data/global-regulatory-authorities.json`, `data/ich-guidelines-comprehensive.json`, `data/regulatory-document-requirements-matrix.json` | `regulatory-pathway-intelligence.ts:110–131` | `path.join(__dirname, '..', 'data')` means `server/data` in source but `/app/data` in the bundle. The public-API pathway engine loads an empty knowledge base with no error. | Code fix, the same pattern as U8 and `prompts-dir.ts`: anchor on `process.cwd()` + `server/data`. Then reclassify as `ship`. |
| `dist/rules/manufacturingRules.yaml` | `src/services/ai/manufacturingReviewer.js:15` | The file is at `server/src/services/ai/rules/`, but the bundle looks in `dist/rules`, so `RULES` stays `[]`. | Code fix (cwd anchor). CMC manufacturing review is outside the launch catalog. |

### Not shipped, correctly

| Key | Reason |
|---|---|
| `uploads`, `tmp`, `storage`, `generated_documents`, `logs`, `output`, `exports`, `temp`, `temp_documents`, `qualification-reports`, `test-results/beta-telemetry`, `server/.cache`, `data/cer_reports`, `data/cache`, `data/exports`, `data/sap`, `vault`, `attached_assets`, `processed_documents` | Created or written by the process at run time (`mkdir -p` at module load or on first write). `/app/storage/vault` is created by the Dockerfile and mounted as a volume. |
| `data` | An allow-list root for `pdf-compression-service` inputs, not a read. The reads under it are classified one by one. |
| `csrs`, `ectd` | Allow-list roots for caller-supplied paths (`utils/document-file-roots.ts`), not reads. `ectd` is not in the repository. `csrs` is a public-synopsis reference corpus outside the launch catalog. |
| `regulatory_data` | The loader accepts only `{indication, guidance[]}` objects. Both tracked files are arrays and are skipped even from a checkout. |
| `data/guidelines`, `data/processed_csrs`, `trialsage/*.py` | Not in the repository at all, so these are not image gaps. The call sites fall back or are outside the launch catalog. |
| `../data/user_preferences` | Per-user preference state in `notification_routes.ts`, resolved from `__dirname`. In the image it is `/data/user_preferences`, outside `/app`, where the non-root user cannot create a directory, so saving preferences fails there. A missing file returns defaults. This is a runtime-state defect, not a vendored asset. It is noted here and was not fixed. |
| `vite.config.ts`, `client/index.html` | Used only by `setupVite()`, the dev server. |
| `assets/tessdata`, `server/assets/tessdata`, `dist/server/assets/tessdata` | Optional tessdata candidates probed with `existsSync`. None is vendored. |

## What the gate does not see

The gate does not see a path built only from a runtime value, such as
`path.resolve(process.cwd(), runtimeRelPath)` in `compute/scriptWorker.ts`
where the literal is passed in from a caller. It also does not see a path
assembled by string concatenation instead of `path.join/resolve`. The
`workers/artifact-compute` known gap is reached through `workerClient.ts`'s
literal, so that directory is covered by the inventory. The gate also does not
check that a shipped interpreter or binary exists. `check-pdfa-toolchain.sh`
does that for the PDF/A tools, and nothing does it for Python.

## Files

- `Dockerfile.optimized`: one COPY and its comment, in the production stage.
- `scripts/ci/check-image-runtime-assets.mjs`: new, the gate.
- `scripts/ci/check-image-runtime-assets.selftest.mjs`: new, the self-test.
- This file.

`package.json` and `.github/workflows/*` were not edited. The npm scripts and CI
step are left to the lead:

```json
"ci:image-runtime-assets": "node scripts/ci/check-image-runtime-assets.mjs",
"ci:image-runtime-assets:selftest": "node scripts/ci/check-image-runtime-assets.selftest.mjs",
```
