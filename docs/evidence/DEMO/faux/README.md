# Faux Biotech FBT-201 — existing Project Management CSR data seed

**2026-11-02 — Plan: DATA.** Branch: `concept2cure-v2`. This is a fictional **data pack**, not a CSR module or another UI workflow. Project Management selects document type **CSR**; the existing Data Room, Canvas/Editor, AnA, Tasking and governed review remain the system.

## Existing owners (no replacement)

- `scripts/demo/launch-demo/seed.mjs`: the operator-run API seed command. `--pack faux` explicitly opts into this fictional organization; `--pack all` deliberately EXCLUDES it. Mixed packs are refused.
- `scripts/demo/launch-demo/lib.mjs`: validated token/session, account and organization binding, project and Tasking preflight, plan/entitlement check, real API client, SHA-256 utilities, and audit-friendly manifest runner.
- `scripts/demo/launch-demo/packs/faux.mjs`: data-only content and orchestration using that same command. It creates no new route/service/editor. After source upload it now creates/reopens a project-scoped **working CSR document** in the existing one editor, not a separate CSR application.
- `server/routes/c2c/projects.ts`: existing `POST /api/c2c/projects` accepts `programType: 'csr'` with `submissionTypeId: 'ich_csr'`, `productType: 'biologic'`, `primaryAgency: 'ICH / Global'` (see `server/routes/c2c/__tests__/projects-create-market-offer.test.ts`). CSR is a **document type**, not a standalone application. A CSR project does not silently create an IND/BLA submission spine.
- Existing `/api/clients` record is the established internal client/project anchor required by Project Management; it is not another user-facing "biotech workspace".
- `/api/c2c/project-vault/:id/search`, `POST /api/vault/ingest`: the one Data Room/Vault content store with version and hash records. Its intake currently admits `.json` and `.pdf` (shared/constants/document-intake-formats.ts). Upload acceptance does **not** mean schema validation, scientific source approval, CDISC conformity or CSR release.
- `/api/authoring/templates?search=Clinical%20Study%20Report` and `/api/authoring/docs`: the already-existing template picker and project-scoped authoring-document store. The demo requires exactly one `component:clinical_study_report` template (not legacy `registry:ICH_CSR`) with real ICH E3 sections, saves an ordinary working document with its template id, and confirms the document is readable again under the project. That is the existing `DocumentWorkbench.tsx` / `StudyDataBuild.tsx` path for **Build from the study's data**; no second writer or CSR screen is introduced.
- `scripts/demo/launch-demo/packs/work-areas.mjs`: the existing `ensureTasks` writes through the authenticated task board API. This pack creates three **pending** tasks, and the human review task carries `sourceEntityType: authoring_document` and the exact document UUID. The existing TaskBoard document navigation can now reach its authoring draft. A task is NOT a governed authoring review request, an approval, or a signature.

### Stronger preflight and duplicate protection

Before any tenant mutation, `--pack faux` now requires a numeric **target organization ID** (explicit `--organization-id` or `DEMO_EXPECTED_ORGANIZATION_ID`) as well as the matching authenticated Faux Biotech organization name. It also checks the actual compressed and decompressed synthetic source digests against `REVISION_PROVENANCE_v2.json` and resolves exactly one canonical `component:clinical_study_report` template with seeded sections. A missing/duplicated template is a refusal **before project or Vault creation**.

When the same-title project source or CSR working document is already present, the pack refuses ambiguous duplicates; it does not silently take the first row. Existing source bytes are rechecked against the revision digest. The human review task is source-linked to the exact UUID of the canonical working document; revisiting an existing task with a mismatched document reference is refused instead of counted as completed.

These are **seeding safety controls**, not a new product service and not a substitute for browser qualification. The current native Node test suite includes fail-closed cases for missing/duplicate templates, wrong prior template IDs, duplicate source/editor records, missing tenant ID, source digest integrity, source-linked tasks and idempotent replay.

## Fictional source scope

FBT-201-2026 is an invented Phase 2 biologic trial with 160 simulated participants (80 per arm), revision-2 source `docs/demo/faux-biotech-csr/FBT201_CSR_SOURCE_SYNTHETIC_v2.json.gz`. The file is decompressed to plain JSON for upload; **do not upload gzip as clinical-source JSON**. Current source checks expect 79 artificial AEs, 74/76 treatment completers, 52/30 PASI75 responders, and a declared end-of-treatment disposition basis. The pack stores source SHA-256 from the actual uploaded bytes.

Other source records created in this one project: a synthetic protocol and synthetic SAP, each rendered from existing Markdown into demonstration PDFs. The seed additionally ingests the **existing** synthetic 160-subject QC index and reconciled efficacy/safety TLFs as three separate CSV originals in that same project's Data Room. The six source entries are: (1) structured CSR-supporting JSON, (2) fictional protocol PDF, (3) fictional SAP PDF, (4) 160-subject QC index CSV, (5) efficacy TLF CSV, and (6) safety TLF CSV. These are the exact repository bytes with individual Vault SHA-256 receipts. The QC index is NOT a full ADaM ADSL analysis dataset; the descriptive tables are NOT a validated SAP execution, CDISC conformance certification or regulatory evidence. The platform currently admits CSV as UTF-8 text, not verified clinical observations. The pack creates one CSR **working draft with empty ICH E3 template sections**, verified from the existing Authoring list; it is not a written or signed clinical study report. The pack also creates three pending project tasks: source catalog QA, numerical reconciliation, and human CSR review, linking the last to that exact draft UUID. It does **not** run AnA, generate a scientific narrative, approve a source, forge clinical findings, sign any record, or submit anything.

### Operator-only authenticated command

Only after creating the **Faux Biotech Therapeutics** organization and authorized demo user through existing organization/account management:

```sh
# Never place the token in the repository or command transcript.
export DEMO_BASE_URL="https://THE-ACTUAL-CONCEPT2CURE-DEPLOYMENT"
export DEMO_EXPECTED_ORGANIZATION_ID="THE-NUMERIC-FAUX-ORGANIZATION-ID"
export DEMO_SEED_TOKEN="A-REAL-AUTHORIZED-ACCESS-TOKEN"

node scripts/demo/launch-demo/seed.mjs \
  --pack faux \
  --base-url "$DEMO_BASE_URL" \
  --organization-id "$DEMO_EXPECTED_ORGANIZATION_ID"
```

The seed deliberately fails if the authenticated organization's recorded name is not Faux Biotech Therapeutics, or if project listing cannot be reconciled. It searches the project before creating it, refuses an existing project of another document type, and refuses a same-title Vault source with a different SHA-256 instead of overwriting it. Repeated runs should find the same records, not create duplicates.

`--plan enterprise` is available in the **existing** operator path only when an authenticated platform owner deliberately chooses to change the demo organization's licensed tier through the existing Master licensing API. Do not change plan/entitlements silently or use a development-auth bypass in production.

### Actual verification completed

**Source-level behavior**, executing the current pack fetched from GitHub with explicit API/FS/FormData doubles: **5/5** cases passed (wrong organization refusal, canonical CSR project creation, three source uploads, replay reuse, wrong document type refusal).

A repeatable **native Node test** was added and extended: `node --test scripts/demo/launch-demo/faux-demo.test.mjs`, exercising the pack and the checked-in binary dataset with API doubles, including source identity/hash, CLI isolation, non-destructive purge, the canonical CSR authoring template, editor read-after-create, source-linked review task, replay without duplicate writes, and fail-closed template/source mismatch. That native test command **has not run in the full repository** in this ChatGPT execution, so it must not be reported passed.

**Additional focused source-level execution:** After connecting the authoring document, the fetched `faux.mjs` and existing `work-areas.mjs` function bodies were run with explicit simulated API/FS/FormData doubles in ChatGPT. **5 of 5** scenarios passed: canonical editor document + linked task, replay with no writes, unavailable template refusal, wrong historical template refusal, unrelated tenant refusal. This is not the full native Node test or a real database/hosted browser acceptance. The actual gzipped source was independently decompressed and compared byte-for-byte with the retained revision-2 ZIP and matched the declared source SHA-256 `be9993dfa6a8eee53b10d0b18ea642b3c987b2e3df09dd9973040f601669c15a`. Counts independently verified: 80+80 subjects, active/placebo completers 74/76, unique TEAE subjects 42/37, SAE subjects 3/2, withdrawals 2/1.

No full TypeScript/build, native Vitest/PGlite, customer browser, real database or hosted source-ingestion run is claimed. No deployment occurred here.

## November 3 CI-confirmed fixes and source-catalog correction

GitHub CI for `d692dc8` exposed **46 failed Node tests** and **three TypeScript errors**. The failures were attributable to two test blockers and an undefined variable, not a completed end-to-end product test:

- `faux.mjs` mistakenly called `canonicalCsrTemplate(api)` from `seed(ctx)`, where `api` did not exist. It now calls **`ctx.api`**, using the current authorized session's existing API client. The earlier Faux project runner was unable to proceed past this call.
- The isolated existing biotech recovery test fixture omitted new imports of `biotech-work-content.mjs` and `work-areas.mjs`. Its fixture now supplies the existing named exports and returns a synthetic protocol ID, so module loading reaches the assertions.
- Three `TS7031` implicit-any destructuring errors in `devLoginUsesConfiguredIdentity.test.tsx` were corrected without changing runtime authentication.
- Tier 5 Browser Smoke failed **before running a browser test** because Playwright 1.55 would not install Chromium on GitHub's Ubuntu 26.04 image. The existing workflow is pinned to `ubuntu-24.04`; no smoke test was bypassed.

The existing Data Room ingest vocabulary includes **`PROTOCOL`** and **`SAP`**, but no regulatory-scientific-dataset type. This seed now stores the synthetic protocol and SAP under those existing types, while its supporting JSON remains `OTHER` rather than claiming a CDISC-validated dataset. If previous versions of exactly those two **unapproved** synthetic source files were miscatalogued as `OTHER`, the seed corrects their type through the existing, reasoned, Part 11-audited `POST /api/c2c/project-vault/:id/documents/:documentId/details` API and rereads the source and hash. It refuses approved, conflicting, foreign or unverifiable records; no original bytes or scientific observations change.

The production source-level metadata-correction branch was executed against explicit simulated existing Vault API behavior: **5 cases passed**, including audited correction, clean replay, approved-record refusal, conflicting-type refusal and source-hash mismatch refusal. The native Node tests were extended but were not executed in this session's full checkout.

**Not implied:** These commits have not yielded a new passing full CI result, real hosted provisioned organization, live Data Room import, authorized source approval, AnA-authored CSR or browser-qualified demonstration. CI/security jobs on new commits were queued at the last inspection; the older Semgrep workflow also lacked a passing baseline and the older Security Scan/Secret Scan reported failures unrelated to evidence of a successful demo.

## Acceptance — still OPEN

1. Actual fictitious organization exists with appropriately admitted demo member; account can sign in and list a Project Management project of type CSR.
2. The seeded authoring document appears in the **same** project, with `templateSource.entryId === 'component:clinical_study_report'`, seeded section count and the existing **Build from the study's data** control; it reopens after refresh.
2. Run the pack against **that same tenant**; record actual project ID, exact document IDs and SHA-256 from Vault receipts. A GitHub commit is NOT a hosted project.
3. Enter through Demo Access, see the populated project and actual Tasks, open **all six** source records in that project's Data Room and confirm exact original hashes, types, lineage and current review status. Verify the subject QC index and TLFs are labeled synthetic/unqualified; mere CSV admission is not CDISC mapping or biostatistical validation.
4. Use the existing source review and biostatistics/CSR table path, then the **single** Canvas/Editor and AnA, with source-grounded actual generated text. Missing data stay unknown.
5. Edit/save/reopen, review from task into the exact document, use Communication, verify every advertised rail destination, and record user-facing errors/loading behavior.
6. Actual e-signature and dispatch only when authorized ceremonies and relevant submission context exist; synthetic tasks do not assert either.

**Classification:** code+fixture committed, focused checks executed; hosted environment NOT qualified. No direct live application session was available through the connector, and the browser required an originating authenticated context.
