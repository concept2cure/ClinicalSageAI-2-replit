# Complete package DTD validation through the existing compile UI

W5/D7; MR-10 Stage 3 integration. Source `cb4065898`.
Contract: [DTD_VALIDATION_COMPLETION_2026-10-21.md](../../../design/DTD_VALIDATION_COMPLETION_2026-10-21.md).
Implementation source: `c424d1f48e025b93e724b823b5fec183526c6793`.
Canonical integration: `567451081bfee8085d94f40cf1e0971d764947ea`.
Renderer extraction: `451232eed5bb9cff1b54b7f8f9d8f2a914249d47`.
Final integration/build anchor: `218e49eb8898015938bf0a6603f077a1543f46af`.
The integration preserves concurrent canonical work through `8c6bd712e`.
The production build, 384 backend checks, 117 UI/guard checks and eight Chromium scenarios passed. The full compiler returned zero errors against baseline zero, and all normal push gates passed. Source was accepted directly on concept2cure-v2 at `218e49eb8898015938bf0a6603f077a1543f46af`.

## What already exists

- `server/services/ectd/xml-validator.ts`: real xmllint engine and capability
  result. No second parser is added.
- `server/services/ectd/qualification/qualify.ts`: existing package-relative
  backbone checks and qualification reports; complete/reach its canonical logic.
- `server/services/ectd/{dtd-bundler,checksum-manifest}.ts`: supportive-file
  requirements, opt-in production gate and integrity checks.
- `server/services/submission-gateways/{regional-packager,types,pre-transmit-check}.ts`
  and `server/services/ectd/regional-backbone-readiness.ts`: existing bundle,
  presence/status projections and gates; extend these, not their replacements.
- `server/routes/ectd-compile.ts` and
  `client/src/concept2cure/v2/surfaces/EctdCompile.tsx`: existing compile/history,
  package viewer, blockers and validation display.
- `client/src/concept2cure/v2/shellProject.ts`: existing project-visit guard;
  numeric/code identifiers accepted by compile need the same revision tracking
  as UUID visits, including a batched departure and return.
- `assets/ectd-dtd/`, `docs/runbooks/ectd-dtd-vendoring.md` and
  `Dockerfile.optimized`: existing drop point, separate agency acquisition
  procedure and declared production xmllint dependency. Agency schemas remain
  absent. Synthetic schemas prove code execution, not agency acceptance.

The design records searches and deleted history. No new store, writer, viewer,
runtime validator or agency asset acquisition is proposed. Human witnessing,
sourced agency DTDs and the remainder of MR-10 stay open.

## Result and boundaries

Normal packaging now reaches the existing real xmllint engine for index.xml,
the regional backbone and every generated STF. The extracted qualification
DOCTYPE check also audits package-local dependencies. Captured supportive bytes
are checked through the existing SHA-256 verifier, and the same captured bytes
are written to the ZIP. Temporary validation trees are private and cleaned.

The existing compile package view and findings show per-file execution,
validity, diagnostics, checksum results and regional gaps. Proof is recorded
with the package SHA-256 inside the existing validation_results JSON; history
reads that record. Missing or malformed historical proof remains unverified.
The existing actor/project guards retire late reads and writes, including a
batched numeric/code program departure and return. No schema migration, second
validator, package store or viewer was introduced.

The existing opt-in production gates now refuse absent, incomplete or failed
proof. Flag defaults are unchanged. Compile can finish in report-only mode
while retaining technical blockers; completion is not submission readiness.
Regional conformance requires current regional validation and integrity proof
as well as the existing builder-gap report.

Only exact UTF-8 XML/DTD text and provable literal package-local dependency
chains are supported by this containment proof. Internal XML subsets,
declaration-building parameter entities, unsupported encodings and unresolved
resources remain unverified. Actual agency-corpus compatibility must be
qualified after its separate acquisition. Synthetic schemas establish engine
and product-path execution only.

## Reproduction and evidence

Use Node 22.23.3, install the canonical lockfile, and put real xmllint on PATH.
Production already declares libxml2-utils; [runtime.json](runtime.json) records
the user-space test binary and package provenance. [ui-inputs.json](ui-inputs.json)
and [backend-inputs.json](backend-inputs.json) contain exact Vitest arguments
and execution input SHA-256 pins. The UI cohort was run over the uncommitted
implementation; its inputs were subsequently verified against the integrated
source. The backend cohort runs at the first canonical integration anchor; all of its inputs also match the final source. Worker logs retain
failing-first and intermediate checks; they are not summed as separate tests.

The [browser harness](browser/check.mjs) opens the actual EctdCompile component
with intercepted synthetic APIs. Four cases load actual normal-packager JSON
and ZIP outputs from [package-examples](package-examples/), checking each ZIP's
SHA-256 before rendering its proof. Missing-runtime, legacy and deliberately
empty-proof variants are explicit intercepted cases. Chromium checks seven
proof states and one batched A→B→A late-response case, with 40 unchanged input
pins and no page errors. It does not exercise a live database or agency API.
Run its Vite host with `node docs/evidence/MR-10/2026-10-21-dtd-validation/browser/server.mjs`,
then the adjacent check.mjs. Stop the host after verification.

[HUMAN_CHECK.md](HUMAN_CHECK.md) remains unwitnessed. Agency assets, sourced
STF grammar/vocabulary, package identity completion, mandatory launch defaults,
transport qualification, agency acceptance and the remainder of MR-10 stay open.
This completes the Stage 3 integration slice; it does not close all of Stage 3
or establish readiness for regulated production use.

The first normal push was refused by the unchanged 100 KB source-size ceiling:
EctdCompile.tsx was 107,078 bytes. Its existing DTD renderer was extracted without
behavior changes, leaving the main surface at 98,191 bytes. The strict size gate
then passed (57 files above 100 KB; 113 above 1,500 lines), and UI, browser and
build checks were repeated. No limit, baseline or hook was relaxed.

Scoped secret scans of both implementation commits passed. A broader ancestry
scan also inspected concurrent authoring evidence and reported four generic-key
matches. Each was verified as the SHA-256 of its named compressed verification
log; the disposition is retained in verification/gitleaks-ancestry-disposition.json.
No credential was found and no scanner configuration was changed.

## Publication

The implementation was pushed directly to concept2cure-v2, without a PR, force
push, hook bypass or baseline change. Client and server builds embed source
218e49eb8898015938bf0a6603f077a1543f46af. The compiler reported zero errors;
ESLint warning growth was -3. The browser fixture host was stopped and port 5199
was verified clear. CI runs are separate from these local/normal push checks.

[artifact-manifest.json](artifact-manifest.json) lists SHA-256 and byte size for
every archived file except itself. Primary input manifests bind the tests and
browser results to the source tree; the final evidence tree is checked after
commit. Human witnessing and agency acceptance are unexecuted.

The evidence-only push caught one checker lint warning for the unqualified
Node structuredClone global. Qualifying it with globalThis removed the warning;
all three checker files then linted with zero errors/warnings and all eight
Chromium scenarios passed again. Product code, test counts, build and source
qualification were unchanged. Browser anchor records the Git base; dated
fixture inputs were qualified before their final evidence commit, and their
exact hashes are verified against the published tree.
