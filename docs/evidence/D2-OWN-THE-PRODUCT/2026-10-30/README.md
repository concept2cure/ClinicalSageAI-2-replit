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
  output that way, and a real PDF reaches the real extractor. Hop 6 (file to Vault) passes again.
- **The walk's database was smaller than the code it walks.** After hop 6, the walk's own last check named the
  relations the product asked for and the walk lacked. Each is now laid down from the file that creates it:
  - `notification_preferences` and `unified_tasks`, verbatim from the drizzle baseline. A review route reads
    the sender's time zone (RR2), and a Vault approval assigns its review task (RR1a). The task's MDx-metadata
    and soft-delete columns come from their two migrations, ahead of `20261023_review_routes`. Without the
    table, that file had added its route columns to nothing.
  - `submission_filed_baselines` (`20261029g`) and `company_legal_registry` (`20261018`): placement reads both.
  - `mdx_notifications` (`20260510_notifications_and_clinical`). A fresh install lays it down; no deploy
    applies it, and `migration-deploy-path-baseline.json` already records that.
  - **Result.** 15 of 15 pass, against 7 of 15 before (`founder-path-lineage-before.txt`,
    `founder-path-lineage-after.txt`). No baseline entry was added.
- **Two CSR harnesses broke the ALTER-closure contract.** `csr-template-identity` and
  `narrative-reference-write` build the authoring loop's tables, but skipped the two files that alter them
  (`20260730_authoring_comments_router_columns`, `20260817_doc_revisions_immutable_ledger`). Both files are
  now applied. The contract and both suites pass, 17 of 17.
- **The NUL fix met the warning ratchet.** The pre-push ratchet refused one new warning, `no-control-regex` on
  `/\u0000/g`. The extractor now uses `replaceAll('\u0000', …)`, which needs no regex.
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

## Batch 5: shards 2–5, each failing file re-run alone at trunk

Shards 2–5 listed 39 failing files. Re-run together at trunk, 20 still failed. The rest had failed only under load,
while a pre-push typecheck ran beside the shard. Each of the 20 was then run alone and fixed at its cause. None
of these fixes changes product code: each harness had fallen behind a product rule that is correct.

- **The harness was smaller than what the product now reads (6 files).**
  - **Company legal requirements.** Validation, assembly and the dispatch verdict read the tenant's saved legal
    requirements, and refuse a tenant they cannot find (`stored-legal-readiness.ts`). Two harnesses lacked the
    tenant's `organizations` row: `sequence-validated-honesty`, and the program spine plus the row in the two
    ind-lifecycle suites (`dispatch-verdict-parity`, `routes.contract.integration`).
  - **The legal registry.** `leaf-study-tagging` lacked the registry `20261018` creates. It now applies the
    file, as `leaf-cross-project` already did.
- **Fixture PDFs with no catalog or page tree (3 files).** The packager's original-PDF integrity check refuses
  them before anything is packaged, as it should. `ectd-package-integrity`, `fda-filing-identity` and
  `regional-backbone-referenced` now give it real one-page PDFs, built with `pdf-lib`. The validator-only inputs
  keep their header stubs.
- **`transmit-guard-refusal-releases-claim`.**
  - **The project had no primary agency.** The fixture records none, so the market could not resolve (P-44) and
    every transmit refused before the wire. It now records `FDA`.
  - **The sent package.** It is kept in memory, through the same stub as the gateway suites. Its >1 GiB
    descriptor case keeps the package at the size it declares, so the archive's size check passes and the SFTP
    refusal under test is what refuses.
  - **Result.** 13 of 13 pass.
- **`coauthorSnapshotStatus`.** Placement asks whether the source is a CSR, from its retained identity. The
  suite's mock answered that query with a document row, and the product failed closed (503). The mock now
  answers the way the database would for a Clinical Overview. 11 of 11 pass.
- **Roles come from the membership row, not the token (IAM-10; the authoring router since P-72 slice 1a,
  `ae12195a56`).**
  - **`authoringSourceImport`.** Its "viewer" was the author with a viewer claim, so the claim decided nothing.
    The 403 assertion is kept. Its viewer is now a second person whose membership row says `viewer`.
    Seeding that person as `member` turns the assertion red: 201, against an expected 403.
  - **`authoring-auth-parity`.** Its member held the row role `member` and a `QA` claim. The template gate
    admits only ADMIN, RA_CMC or QA, and among the assignable roles only `admin` reaches it. The fixture
    now seeds `admin`, so a revoked membership, not the gate, is what refuses (AUTH_009). 7 of 7 pass.
- **Environment.** `run-pdf` (15 tests) needs `fonts-noto-core`, which CI and the production image install.
  Installed here, it passes.

## Batch 6: the last 13 files from shards 1–5

Each was run alone at trunk. In every case, a correct change elsewhere had moved under the test.

| File | What moved | The test now |
|---|---|---|
| `node-status-follows-work`, `filing-lock-write-through` (shared `_filing-write-harness`) | A signature reads its review-route standing (RR1a), and roles come from the membership row (P-72 1a) | applies `20261023_review_routes`, and seeds the independent approver's row as `approver` |
| `governed-signed-act.request-context` | The authority read admits only an active organization's signers (`59cb0f54c4`) | pins all four arguments, the restriction included |
| `smoke` | The router's `POST /projects` was retired onto canonical intake (`fb73f05f81`) | asserts it stays retired, and that `/api/c2c/projects` creates |
| `ana-ri` | AnA's `create_project` was retired onto the Projects wizard (`f9c84bdf1f`) | asserts the command stays retired |
| `notification-category-schema` | `task_*` and `ana_turn` became server-only (RR1b M4, `2dd1861602`) | asserts AnA is not offered them, one by one; making `task_assigned` creatable turns it red |
| `provision-app-role-append-only` | `concept2cure_artifact_versions` refuses UPDATE and TRUNCATE by trigger, and keeps DELETE for the tenant purge (`20261029k`) | records why provisioning must not revoke DELETE there |
| `verify-audit-chain-production-bundle` | The production stage copies with `--chown` (OPS-19) | matches the flag |
| `coverage-report-verdict` | The need is spelled "expanded-access" | matches either spelling |
| `connector-results…source-rank` (EMA EPAR) | The client reads EMA's JSON feeds (`0a07f49d7c`) | serves that shape |
| `ana-ri-health`, `engineChoices` | Whole-module mocks lacked new exports | keep the real module, and override only what they stand in for |

**Result.** 325 of 325 across the 10 files, and 25 of 25 across the two harness users.

## Still open at this push

- **`ci:dependency-risk` is red, with six unreviewed findings.**
  - **Safe upgrades:**
    - dompurify 3.4.17 (critical, DOM XSS);
    - multer 2.5.0 or later;
    - undici 7.30.1 or later;
    - body-parser 2.4 or later, through Express.
  - **`@figma/code-connect`.** A devDependency that was never configured (placeholder team and file keys, no
    `*.figma.tsx`), and whose only "fix" is a downgrade. Remove it with `client/figma.config.json`.
  - **zod (GHSA-mrhx-c7xc-m3w5): measured, not mitigated.** One 2 MB body, inside the `/api` limit, makes
    zod 3.25.76 build 1,000,001 issues and grow the heap by about 268 MB. zod 4.6.7 builds one issue, with no
    growth. Its `zod/v3` compatibility path is still vulnerable (`zod-memory-probe.txt`, `zod-memory-probe.cjs`).
    - **What fixes it.** A real v4 migration, with drizzle-zod 0.8.3, which accepts zod 4. About 40 files read
      `ZodError.errors`, which becomes `.issues` (already valid in v3), plus a handful of `required_error`,
      `errorMap`, `ZodTypeAny` and `ZodEffects`.
    - **Why it isn't recorded as "mitigated".** That would be false.
  - **Not done yet.** None of these upgrades was run here: they change `node_modules`, and the vitest shards
    were still running.
- **Vitest shards 5–8 at `86b0fa6f70`.** Shard 5 was stopped partway, at this push, with one failure seen:
  `server/services/ana/__tests__/submission-center-tools.test.ts`. Shards 6–8 have not run at this head.
- **`test:db`** has not been run against the lane database.
- **HawkScan** was not run, because there is no `HAWK_API_KEY`.
