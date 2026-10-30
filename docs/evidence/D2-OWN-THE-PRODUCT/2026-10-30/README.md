# Own the product, batch 1: nine failing CI gates fixed (2026-10-30)

**Founder direction (2026-10-30):** fix every broken or erroring check, whoever introduced it.
**Inventory:** the 125 static `ci:*` gates that `.github/workflows/ci.yml` runs, run at trunk `5311358c74`. Typecheck, lint and coverage
gates run separately.

Thirteen gates failed (`gates-failing-before.tsv`). Three of them need environment that CI provides and this sandbox did not:

- `ci:replay-rebuilds-nothing` and `ci:tables-live-schema` need a provisioned database.
- `ci:server-bundle-prod-imports` needs a built server bundle.

Those three are run next, with that environment. The nine below are fixed (`gates-after.tsv`: all exit 0).

| Gate | Cause | Fix |
|---|---|---|
| `ci:canonicalizers` | `csr-scientific-review-core.ts` had its own canonical-JSON serializer | It still refuses non-finite and non-JSON values, then serialises through `shared/canonical-json.ts` `stableStringify`; one answer to "what does this hash to" |
| `ci:error-envelope` | `CsrAssemblyControl.tsx` rendered a recorded refusal message (`p.error`) raw | It now renders through `redactInternals`, so exception text cannot reach the screen |
| `ci:toast-canonicality` | `RiskRegister.tsx` typed its toast prop `(m: string) => void`, which erases the tone | It uses the exported `FireToast` |
| `ci:validation-traceability` | URS-SUBC-011 cited `PublishingCenter.tsx`, folded into eCTD Compile by `302d632db6` | The URS row cites `EctdCompile.tsx` and `EctdCompileReference.tsx`; OQ-SUBC-14 says `ectd-publishing` is an alias |
| `ci:check-client-reachability` | `mdx/lib/formatRelativeShort.ts` lost its only caller when `0fc2fc294d` deleted `useWorkbenchTemplates.ts` (replaced by Authoring > New document > Start from) | The dead helper and its test are deleted |
| `ci:tenant-entry-points` | `mdx-admin.ts` changed after its justification (`f83fcce036`, `5985619e58`) | Re-read: it is still the one GET /admin, scoped by organisation, with no SCIM or API-key authentication. A dated note is appended and the digest refreshed |
| `ci:check-unrun-tests` | `tests/cortex/*.test.mjs` matched no runner | See below |
| `ci:check-pdf-runtime` | CSR slice 8's `csr-pdf-writer.ts` (a streaming, deterministic pdfkit writer) and `csr-pdf-structure.ts` (it reads pdf-lib outlines and links) | Approved with written reasons, like `leaf-pdf.ts` and `original-pdf-integrity.ts`. `pdf-converter.ts` converts DOCX and buffers whole files |
| `ci:lineage-save-gate` | `csr-narrative-store.ts` was unclassified | Declared not prose, with a reason. It is the narrative job's engine-output store, composed from ADaM facts, with a facts digest and a database-verified SHA-256. Authoring imports §14.3.3 only as a verified reference |

## The CSR cortex tests

The CSR cortex tests had never run, and once run they were failing.

- **Why they failed.** Two of the three files could not load. `cortex-authoring-context.ts` had begun importing
  `shared/authoring/csr-scientific-review`, and their transpile lists did not include it.
- **What loading revealed.** One assertion was stale. It expected the synopsis child "2.8", which the CSR lane deleted
  on 2026-10-29: the E3 synopsis is a single section, §2.
- **The fix.** The module was added to both lists, and the test now pins §2 reading the efficacy tables and "2.8"
  being no section.
- **Result.** 95 of 95 pass (`test-cortex.txt`).
- **Keeping them running.** `npm run test:cortex` is declared in `package.json` and runs as its own CI step.

## Batch 2: the three environment gates, run with their environment

- **`ci:replay-rebuilds-nothing` passes.** It was run against the lane's database after `deploy-migrate` brought it
  to trunk (456/456 files). Its earlier output reacted only to a database a few migrations behind.
- **`ci:server-bundle-prod-imports` passes** after `node scripts/build-server.mjs`: 63 load-time packages are all
  shipped, and the two runtime absences are each covered by a written exception.
- **`ci:tables-live-schema` had three phantom findings, now gone.** It reported the tables `missing`, `that` and
  `conversation`:
  - **Where they came from.** AnA skill and labeling guidance prose, for example "…derived from missing…".
  - **Why.** The shared extractor (`check-migration-reachability.mjs`) treated any string literal containing a SQL
    verb in any case as SQL, and "select" is an English word.
  - **The new rule (`isSqlish`).** A string counts if it has an upper-case verb anywhere, or if it starts like a
    query in any case (leading comments and a parenthesis are allowed).
  - **Measured.** Of 788 referenced relations, exactly those three phantoms are lost, and no real table.
  - **Pinned.** `migration-reachability-guard.contract.test.ts` holds both directions: real queries count, prose
    does not. Restoring the old rule turns 4 of its tests red.
  - **Result.** The gate passes, with 33 absent tables, all baselined. `ci:migration-reachability` and
    `ci:column-reachability` still pass.

## Batch 3: the rest of CI's checks

- **ESLint, errors only:** `npx eslint . --quiet` reports 0 errors across the tree.
- **Typecheck:** the whole-program `ci:typecheck:no-regression` ran on every push today and reported 0 errors
  (baseline 0).
- **jest:** the first half of `npm test` passes 30 of 30.
- **`test:ci-scripts`:** 1 of 478 failed, a regression I introduced in batch 1.
  - **Cause.** `csr-scientific-review-core.ts` began importing `shared/canonical-json`. The guard's own build
    (`scripts/ci/csr-scientific-review/build.mjs`) did not transpile that module, and the import lacked the `.js`
    specifier the plain-Node build needs.
  - **Fix.** The module is now in the build, and the specifier matches the file's other runtime import.
  - **Result.** 517 of 517 pass, and `ci:canonicalizers` still passes.

## Batch 4: the first vitest shard's failures, each fixed at its cause

The full vitest suite (about 6,100 files) runs as 8 serial shards. Shard 1 had 18 failing tests in 6 files.

- **Vault ingest failed on a NUL byte (`server/services/ocr/extractDocumentText.ts`).**
  - **Cause.** PostgreSQL refuses U+0000 in a text column. A PDF text layer or a DOCX run that carries one made
    File to Vault, the Vault sweep and Data Room processing record nothing (`invalid byte sequence for encoding
    "UTF8": 0x00`).
  - **Fix.** Every format's text now leaves the one extractor with each NUL replaced by U+FFFD. One UTF-16 unit
    replaces one, so every page span still addresses the same characters.
  - **Proof.** `extracted-text-nul.test.ts` was red first (`nul-red.txt`). It is green now, and so are the other
    OCR suites: 71 of 71 (`nul-green.txt`).
- **The founder-path lineage test read a real PDF as text.** Filing renders through the canonical Word converter
  since `34942873db`. The test's extraction stub still read every PDF as the HTML its own engine had written, so
  it passed compressed streams, NULs included, into `vault.documents`. The stub now reads only its own engine's
  output that way, and a real PDF reaches the real extractor. Hop 6 (file to Vault) passes again. Hops 6b–8 fail
  for a separate cause, still open.
- **`cross-reference-packaging.test.ts`** built its fixture PDFs by hand, and the packager's parse refused them.
  It now builds them with `pdf-lib`. 5 of 5 pass.
- **`mdx-client-review.ts` (`admitRoom`)** resolved a program's project with its own subquery, beside the
  canonical reader. The one-program-anchor-reader contract refused that. It now calls `readProgramAnchorRow`,
  and a failed read answers "verification unavailable" instead of an empty room. The route test's `projects`
  table gained the two columns the reader selects. 13 of 13 pass.
- **`launch-reproof-narrowing.test.ts`** listed `/api/submission-ops/blockers`, which `041880cbdf` deleted. The
  entry is removed, with that commit cited. 204 of 204 pass.
- **`memory-context-assembler-presents-no-confidence-percent.test.ts`** expected an organization atom while a
  project was open. The assembler scopes to the project, by design. It is now two tests, one per scope. Both fail
  when a confidence suffix is put back.
- **Passes alone:** `processing-timestamp`. Watched for flakiness, not changed.
