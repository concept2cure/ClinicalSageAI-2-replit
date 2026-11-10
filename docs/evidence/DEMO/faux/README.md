# Faux Biotech FBT-201 — existing Project Management CSR data seed

**2026-11-02 — Plan: DATA.** Branch: `concept2cure-v2`. This is a fictional **data pack**, not a CSR module or another UI workflow. Project Management selects document type **CSR**; the existing Data Room, Canvas/Editor, AnA, Tasking and governed review remain the system.

## Existing owners (no replacement)

- `scripts/demo/launch-demo/seed.mjs`: the operator-run API seed command. `--pack faux` explicitly opts into this fictional organization; `--pack all` deliberately EXCLUDES it. Mixed packs are refused.
- `scripts/demo/launch-demo/lib.mjs`: validated token/session, account and organization binding, project and Tasking preflight, plan/entitlement check, real API client, SHA-256 utilities, and audit-friendly manifest runner.
- `scripts/demo/launch-demo/packs/faux.mjs`: data-only content and orchestration using that same command. It creates no new route/service/editor. After source upload it now creates/reopens a project-scoped **working CSR document** in the existing one editor, not a separate CSR application.
- `server/routes/c2c/projects.ts`: existing `POST /api/c2c/projects` accepts `programType: 'csr'` with `submissionTypeId: 'ich_csr'`, `productType: 'biologic'`, `primaryAgency: 'ICH / Global'` (see `server/routes/c2c/__tests__/projects-create-market-offer.test.ts`). CSR is a **document type**, not a standalone application. A CSR project does not silently create an IND/BLA submission spine.
- Existing `/api/clients` record is the established internal client/project anchor required by Project Management; it is not another user-facing "biotech workspace".
- `/api/c2c/project-vault/:id/search`, `POST /api/vault/ingest`: the one Data Room/Vault content store with version and hash records. Its intake admits `.json`, `.pdf` and `.csv` (shared/constants/document-intake-formats.ts). Upload acceptance does **not** mean schema validation, scientific source approval, CDISC conformity or CSR release.
- `/api/authoring/templates?search=Clinical%20Study%20Report` and `/api/authoring/docs`: the already-existing template picker and project-scoped authoring-document store. The demo requires exactly one `component:clinical_study_report` template (not legacy `registry:ICH_CSR`) with real ICH E3 sections, saves an ordinary working document with its template id, and confirms the document is readable again under the project. That is the existing `DocumentWorkbench.tsx` / `StudyDataBuild.tsx` path for **Build from the study's data**; no second writer or CSR screen is introduced.
- `scripts/demo/launch-demo/packs/work-areas.mjs`: the existing `ensureTasks` writes through the authenticated task board API. This pack creates three **pending** tasks, and the human review task carries `sourceEntityType: authoring_document` and the exact document UUID. The existing TaskBoard document navigation can now reach its authoring draft. A task is NOT a governed authoring review request, an approval, or a signature.

### Stronger preflight and duplicate protection

Before any tenant mutation, `--pack faux` now requires a numeric **target organization ID** (explicit `--organization-id` or `DEMO_EXPECTED_ORGANIZATION_ID`) as well as the matching authenticated Faux Biotech organization name. It also checks the actual compressed and decompressed synthetic source digests against `REVISION_PROVENANCE_v2.json` and resolves exactly one canonical `component:clinical_study_report` template with seeded sections. A missing/duplicated template is a refusal **before project or Vault creation**.

When the same-title project source or CSR working document is already present, the pack refuses ambiguous duplicates; it does not silently take the first row. Existing source bytes are rechecked against the revision digest. The human review task is source-linked to the exact UUID of the canonical working document; revisiting an existing task with a mismatched document reference is refused instead of counted as completed.

These are **seeding safety controls**, not a new product service and not a substitute for browser qualification. The current native Node test suite includes fail-closed cases for missing/duplicate templates, wrong prior template IDs, duplicate source/editor records, missing tenant ID, source digest integrity, source-linked tasks and idempotent replay.

## Fictional source scope

FBT-201-2026 is an invented Phase 2 biologic trial with 160 simulated participants (80 per arm), revision-2 source `docs/demo/faux-biotech-csr/FBT201_CSR_SOURCE_SYNTHETIC_v2.json.gz`. The file is decompressed to plain JSON for upload; **do not upload gzip as clinical-source JSON**. Current source checks expect 79 artificial AEs, 74/76 treatment completers, 52/30 PASI75 responders, and a declared end-of-treatment disposition basis. The pack stores source SHA-256 from the actual uploaded bytes.

Other source records created in this one project: a synthetic protocol and synthetic SAP, each rendered from existing Markdown into demonstration PDFs. The seed additionally ingests the **existing** synthetic 160-subject QC index and reconciled efficacy/safety TLFs as three separate CSV originals in that same project's Data Room. The ten source entries are: (1) structured CSR-supporting JSON, (2) fictional protocol PDF, (3) fictional SAP PDF, (4) 160-subject QC index CSV, (5) efficacy TLF CSV, (6) safety TLF CSV, (7) revised ADSL-inspired subject-level CSV (160 rows), (8) ADEFF-inspired efficacy observations CSV (320 rows), (9) ADAE-inspired adverse-event observations CSV (79 rows), and (10) ADLB-inspired ALT observations CSV (320 rows). The four full observational CSVs are stored byte-for-byte in the version-2 source bundle `FBT201_ADAM_INSPIRED_SOURCE_CSV_BUNDLE_v2.json.gz`, pinned by gzip SHA-256 `a4d5f423c98f3bd9ef0fe17ce0bb44e8fc05ccd5e6baeeabf479d9bf01d49590` and each embedded file's recorded digest. These are the exact repository bytes with individual Vault SHA-256 receipts. The QC index is NOT a full ADaM ADSL analysis dataset; the descriptive tables are NOT a validated SAP execution, CDISC conformance certification or regulatory evidence. The platform currently admits CSV as UTF-8 text, not verified clinical observations. The pack creates one CSR **working draft with empty ICH E3 template sections**, verified from the existing Authoring list; it is not a written or signed clinical study report. The pack also creates three pending project tasks: source catalog QA, numerical reconciliation, and human CSR review, linking the last to that exact draft UUID. It does **not** run AnA, generate a scientific narrative, approve a source, forge clinical findings, sign any record, or submit anything.

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

## Full fictional observation corpus (2026-11-03)

Beyond the structured CSR JSON, protocol, SAP, QC index and TLFs, the pack now retains the **original four fictional observational CSVs** from the revision-2 archive. Before a single tenant mutation it checks both the immutable bundle digest and each embedded file's SHA-256, then reconciles their subject-level treatment flags, age/sex, baseline and Week-12 PASI status, AE terms/seriousness/outcomes and ALT visits against the structured source and synthetic QC index. A mismatch refuses the seed. The exact validated byte buffers are then uploaded through the existing Vault endpoint; the prior files are not regenerated or overwritten.

The source CSVs are explicitly **ADaM-inspired, not CDISC-conformant ADaM XPT/SDTM exports**. They are admitted as `text/csv` (`OTHER` in the existing Vault document-type vocabulary). Original CSV admission supports Data Room inspection and AnA text retrieval; it is not a scientific data-mapping or biostatistics-analysis qualification. The existing curated CSR supporting JSON remains the selectable source for its current clinical table builder. Source approval, study-data freeze, medical drafting and scientific review still require the real governed client workflow.

The native `scripts/demo/launch-demo/faux-demo.test.mjs` suite now asserts all ten source hashes and classifications and includes negative tests for changed demographics, adverse-event terms, completion flags, efficacy/safety aggregates and malformed CSVs. Local independent checks against the revision-2 ZIP reconciled the 160 distinct subjects, 320 ADEFF visits, 79 ADAE events, and 320 ADLB ALT values. **Do not report the native Node suite as passing until its actual CI test execution completes.**

## November 3 project-detail and paginated Data Room idempotency repairs

Two further concrete disconnects were corrected inside **the existing Faux data pack**, with no extra product route.

**Project Management response contract:** `POST /api/c2c/projects` returns its created program under `data`, but `GET /api/c2c/projects/:id` returns the program **unwrapped**. The seed previously read `.data ?? {}` from the GET, which makes a valid CSR project appear to have no `program_type` and blocks the demo before the Data Room can be populated. It now reads the real unwrapped detail and requires the **same program ID**, correct CSR document type, and the **exact stored client workspace anchor**; a missing client assignment is not treated as success. Six focused executions of the modified actual `ensureProject` code with controlled API doubles passed: new project, existing project, replaced ID refusal, missing client binding refusal, wrong document type refusal, and duplicate project title refusal. Native Node and real database acceptance remain required.

**Data Room source lookup pagination:** The previous code inspected only 50 full-text search results. An existing source on page two could appear absent and trigger another upload. The seed now walks the existing project-scoped `total/offset` contract with bounded progression, refuses malformed/stalled reads, and compares exact source titles across **all** returned pages. Audited metadata corrections also reread via the same complete project search. A second identical FBT-201 project title is an explicit reconciliation error, not a first-match selection. Five focused executions of the actual `sourceCandidates` helper with API doubles passed: second-page exact match, single match, duplicated matches, stalled page and malformed response. The existing Node regression suite was extended for those behaviors.

These 11 focused source-level checks are **not** full native Node execution, CI clearance, hosted app seeding or regulatory qualification. Their purpose is to prevent half-populated or duplicate demonstrations when actual application data exists.

## November 3 — source availability, client admission, and study charter

The existing project Data Room search provides `current`, `contentHash`, `documentType`, `lifecycleStage` and `originalFileAvailable` for each record. A matching hash alone previously caused the Faux seeder to count a source as found even when its original file was unavailable for review, Data Room download or AnA context. **Replay now requires an explicitly current version and `originalFileAvailable === true`.** The same condition is rechecked after any governed protocol/SAP metadata correction. Inaccessible originals require remediation through the existing Vault lifecycle; no substitute or fabricated source is generated.

The internal client anchor is now checked against the **existing** GET/POST `/api/clients` response: exact Faux slug and name, the authenticated organization ID, an active client status, and one matching record. An inactive, renamed, foreign-tenant or ambiguous record is refused before the project or clinical sources are attached. New-client create receipts must confirm the recorded sponsor and organization. This does not create a new UI "biotech workspace": it enforces the parent binding Project Management already requires.

The ordinary Project Management **objective/charter** at project creation now carries the pinned synthetic study's protocol `FBT-201-2026`, Phase 2 randomized double-blind placebo-controlled design, moderate-to-severe plaque psoriasis indication, 160-person planned randomized population, data cut `2026-09-30`, ICH E3 reporting goal and a **clearly fictional hypothesis**: FBT-201 increases Week-12 PASI75 response versus placebo. This hypothesis is NOT a scientific inference from clinical evidence, nor a clinically verified result or a performed trial. Existing charter audit and owner controls remain unchanged; an existing project is not silently re-written.

**Focused source checks executed against retrieved production function bodies and explicit API doubles:** Vault source availability **5/5**, internal client admission **8/8**, and a new-project charter creation verified the protocol, design, comparator, endpoint, data cut and hypothetical status. These checks are *not* the full native Node test suite, live authenticated Data Room, permitted source approval, or a passing full CI. The corresponding existing Node regression fixture was extended. GitHub CI/Tier 5 Browser/CodeQL/Semgrep remained **queued** when the branch was inspected. The hosted demonstration remains **OPEN**, pending the actual Project Management → Data Room → Canvas/Editor with AnA → independent review journey.

## November 3 — governed CSR draft access and linked-task navigation

A project-scoped CSR document is not necessarily an editable working draft merely because the Authoring list returns its ID and a matching ICH E3 template. The same existing `GET /api/authoring/docs` list returns `status` and `readScope`, and `GET /api/authoring/docs/:docId?programId=...` returns the **actual current editor access decision** in `access.edit.allowed`.

The Faux seed now refuses to reuse a same-title CSR with an `IN_REVIEW`, `APPROVED`, `FROZEN` or unknown status, or `readScope: 'sections'` rather than full-document access. It also reopens each created/reused CSR through the existing project-scoped detail endpoint and requires an exact document ID, program ID, canonical template ID, `DRAFT` status, whole-document scope **and** `access.edit.allowed === true` before queuing the existing pending review task. No permission grant, signature, review ceremony or new application path is created; an unready record must be resolved through the established Authoring controls.

The existing org-wide Tasking board's **Open linked document in editor** button previously published only a `docId` while the shell could still hold a *different project*, then called navigation in the same React event that closed the drawer. The registered leave guard could still see that open drawer and refuse navigation. The repaired Tasking flow resolves `unified_tasks.project_id` (numeric) through the **already-read** `GET /api/projects` entries to a single `regulatoryProgramId` UUID, validates the task's exact stored `sourceDocumentId`, closes the detail drawer, and only after it closes passes the normal leave guard. It then publishes that **existing** shell project and the one-shot editor target with both project UUID and document UUID, and opens the single editor. An unknown, unreadable or ambiguous link is refused in the existing Tasking error banner; the current project remains unchanged.

**Focused execution:** the updated `ensureCsrWorkingDocument` function was read from the actual GitHub branch and executed against explicit authorized/denied Authoring response doubles: **10/10** cases passed, including new and existing drafts, status locks, section-only access, an edit-denied actor and changed document/program identity. These are isolated source-level checks, NOT native Node/React/Vitest execution and NOT a hosted browser run. Two native/React regression suites were extended in-place: `scripts/demo/launch-demo/faux-demo.test.mjs` and `client/src/concept2cure/v2/__tests__/taskBoardOpenProject.test.tsx`. The latter adds an org-wide task from another project and an unavailable project-link refusal. Those native tests **have not yet been executed in the complete checkout**.

The customer demonstration remains unqualified until an actual authorized FBT-201 account opens the stored document from Tasking, confirms the correct project after refresh, uses AnA in the same editor and completes genuine review actions. Do not call a pending task a completed scientific review.

## November 3 — end-to-end CSR acceptance harness (NOT qualified yet)

The source-code verification now has a **separate operator-run acceptance probe**, `scripts/demo/launch-demo/qualify-csr.mjs`, which uses the same existing authenticated API client and workflow. It is **not** a new CSR application, writer, reviewer or signing endpoint, and it does not run on deployment. Its test is `scripts/demo/launch-demo/qualify-csr.test.mjs`.

The probe reads one exact project, full-document Authoring draft, Vault clinical source and platform approval, and the saved frozen study-data receipt. Optional `--freeze` previews the already-approved source and invokes the EXISTING `POST /api/submission-orchestrator/csr/study-data`, then rereads the actual saved tables under their source version and hash. Optional `--start-draft` uses the EXISTING `POST /api/csr/jobs` with that exact retained evidence and returns **NOT_QUALIFIED** when the job is merely queued; it never silently retries a previous build or claims the job succeeded. After a real build finishes, the probe checks non-demo model identity, persisted section SHA-256 integrity, and the existing Authoring working copy imported from that precise job. The independent review must have current, recorded approvals from actors other than the author: the Tasking card does not count.

With `--export`, the operator invokes the existing Authoring DOCX route as the authenticated actor, downloads the real bytes, checks ZIP CRC and opens `word/document.xml`, verifying that all substantive currently saved CSR sections occur in the delivered file. `--expected-text-file /secure/path/edited-excerpt.txt` also demands that an editor's specifically revised passage is both **saved** in Authoring and **preserved** in the exported Word document. The receipt and DOCX stay in the operator-specified output directory (default `/tmp/concept2cure-csr-acceptance`), not in git. A failed stage is included in `csr-acceptance.json` with stages that actually passed beforehand.

**Use only an authorized, designated demonstration organization and real accounts.** Do not paste or commit the token. An operator first supplies the exact authenticated organization name and number and already recorded UUIDs; this probe does not guess identities, grant permissions, approve sources, sign, change a tier, add a second module or fabricate a reviewer.

```sh
export DEMO_BASE_URL="https://ACTUAL-DEPLOYMENT"
export DEMO_SEED_TOKEN="AUTHORIZED-BEARER-TOKEN"  # store securely, never in a shared transcript

# Stage 1: requires a previously approved source; optional --freeze performs
# the existing governed document-bound freeze (not source approval).
node scripts/demo/launch-demo/qualify-csr.mjs \
  --base-url "$DEMO_BASE_URL" \
  --organization-id YOUR_NUMERIC_ORG_ID \
  --organization-name "EXACT AUTHENTICATED DEMO ORGANIZATION NAME" \
  --program-id YOUR_EXISTING_PROGRAM_UUID \
  --document-id YOUR_EXISTING_CANONICAL_CSR_DOCUMENT_UUID \
  --source-id YOUR_APPROVED_VAULT_SOURCE_UUID \
  --freeze

# Stage 2 (separate, deliberate paid-model action): add --start-draft.
# It returns a job ID and NOT_QUALIFIED; queued != drafted.
# Let the actual provider model run through the existing governed gateway.

# Stage 3: once AnA/CSR drafting, import and authorized independent scientific
# review occurred in the one editor, qualify the real saved approved copy.
node scripts/demo/launch-demo/qualify-csr.mjs \
  --base-url "$DEMO_BASE_URL" \
  --organization-id YOUR_NUMERIC_ORG_ID \
  --organization-name "EXACT AUTHENTICATED DEMO ORGANIZATION NAME" \
  --program-id YOUR_EXISTING_PROGRAM_UUID \
  --document-id YOUR_EXISTING_CANONICAL_CSR_DOCUMENT_UUID \
  --source-id YOUR_APPROVED_VAULT_SOURCE_UUID \
  --job-id YOUR_RECORDED_BUILD_NUMBER \
  --reviewed-document-id YOUR_EXISTING_APPROVED_IMPORT_UUID \
  --expected-text-file /secure/path/edited-excerpt.txt \
  --export
```

### Real AnA drafting in the **same** DocumentWorkbench editor

The CSR batch-builder path verifies that a real model wrote the saved report sections. A second, narrower acceptance probe covers the existing editor's AnA **section-draft / governed-accept** route itself: `scripts/demo/launch-demo/qualify-ana-editor.mjs` with `qualify-ana-editor.test.mjs`. It uses `POST /api/authoring/sections/:id/ai/draft` and `POST /api/authoring/sections/:id/ai/draft/accept`, **not** another editor or document-writer service.

Generation requires a DRAFT full-document edit grant, real frozen approved study data, non-demo model output, project Data Room retrieval, a persistent candidate ID and recorded AnA turn. It writes the proposed words to a private local file but **does not save** them to Authoring or treat them as a reviewer decision. The operator reviews and, where necessary, edits the file. The second, explicit acceptance command requires the exact candidate ID, a human-inspected file, its SHA-256, a change reason and, if the original section already had content, the overt `--replace-existing-content` flag. The existing accept route then records model/author/source lineage, a revision, and the governed filing write, and the probe rereads the exact saved section. This is a guarded operator test: normal users accept drafts from the existing editor UI.

```sh
# Both commands also require a real DEMO_SEED_TOKEN supplied securely.
node scripts/demo/launch-demo/qualify-ana-editor.mjs \
  --base-url "$DEMO_BASE_URL" --organization-id YOUR_NUMERIC_ORG_ID \
  --organization-name "EXACT AUTHENTICATED DEMO ORGANIZATION NAME" \
  --program-id YOUR_EXISTING_PROGRAM_UUID \
  --document-id YOUR_EXISTING_CANONICAL_CSR_DOCUMENT_UUID \
  --section-id YOUR_EXISTING_EDITABLE_SECTION_UUID \
  --generate

# Inspect the generated text, record the draft-id from
# /tmp/concept2cure-ana-editor-acceptance/ana-draft-receipt.json.
# Any change to the inspected text requires computing its new SHA-256.
# Acceptance intentionally requires a distinct, explicit operator action:
node scripts/demo/launch-demo/qualify-ana-editor.mjs \
  --base-url "$DEMO_BASE_URL" --organization-id YOUR_NUMERIC_ORG_ID \
  --organization-name "EXACT AUTHENTICATED DEMO ORGANIZATION NAME" \
  --program-id YOUR_EXISTING_PROGRAM_UUID \
  --document-id YOUR_EXISTING_CANONICAL_CSR_DOCUMENT_UUID \
  --section-id YOUR_EXISTING_EDITABLE_SECTION_UUID \
  --accept --draft-id RECORDED_CANDIDATE_UUID \
  --approved-text-file /secure/path/inspected-ana-draft.txt \
  --expected-sha256 COMPUTED_SHA256_OF_THAT_FILE \
  --change-reason "Human reviewed source-grounded medical narrative"
# Add --replace-existing-content only if the saved section already contains
# text and the authorized author intends to replace it.
```

AnA **generation** is not a completed save. **Governed acceptance** is not independent scientific review, an e-signature or release. Neither acceptance probe has executed in a provisioned hosted demonstration in this ChatGPT session; the production model's performance-qualification gate remains operative.

The result `QUALIFIED_API_PATH_ONLY_BROWSER_REQUIRED` is deliberately **not** a hosted browser pass, regulatory validation, new source approval or filing approval. It demands a real browser walk with the same authorized test users and saved records before anyone can call the demonstration ready. In particular, the production model PQ remains pending for high-risk text; missing provider configuration, unavailable source, reviewer denial or export mismatch must remain visible blockers. CI jobs for these changes also require actual completion.

## November 3 — Tasking identity and read-after-create verification

The shared demo Tasking helper (`scripts/demo/launch-demo/packs/work-areas.mjs`) previously treated a partially readable board as an empty inventory and collapsed duplicate project task titles into one `Map` entry. It could therefore create a second task or silently reuse the wrong task in the same project. It now requires the existing Task Board's real `{success,data,meta:{partial:false,unreadSources:[]}}` response and a unique, nonblank title per existing project card; no task is created on an incomplete or ambiguous read.

Task creation now validates the actual API's `{success:true,data:{taskId}}` acknowledgement rather than equating HTTP 200/201 with saved identity. After new tasks have been created, the helper rereads the same authenticated board and verifies **exactly one card with the expected title, task ID, project and authoring-document origin** for each new task. A task not visible after creation is reported as unverified; existing governed rows are **not** deleted, fabricated or marked approved. The Faux human-review task remains a **pending work item**, not a human review completed, a signature or a generated clinical report.

The existing `scripts/demo/launch-demo/faux-demo.test.mjs` was extended for partial/unread boards, duplicate titles, missing POST receipts, missing reread tasks and exact document links. The actual modified Tasking helper's JavaScript control flow was executed with controlled API doubles: **9 of 9 focused scenarios passed**, including the normal create and idempotent replay. This is **not** a native repository `node --test` verdict, a database test, a deployed UI session or a regulated-source approval. GitHub CI and authenticated browser smoke still require complete results.

## Acceptance — still OPEN

1. Actual fictitious organization exists with appropriately admitted demo member; account can sign in and list a Project Management project of type CSR.
2. The seeded authoring document appears in the **same** project, with `templateSource.entryId === 'component:clinical_study_report'`, seeded section count and the existing **Build from the study's data** control; it reopens after refresh.
3. Run the pack against **that same tenant**; record actual project ID, exact document IDs and SHA-256 from Vault receipts. A GitHub commit is NOT a hosted project.
4. Enter through Demo Access, see the populated project and actual Tasks, open **all ten** source records in that project's Data Room and confirm exact original hashes, types, lineage and current review status. Verify the subject QC index and TLFs are labeled synthetic/unqualified; mere CSV admission is not CDISC mapping or biostatistical validation.
5. Use the existing source review and biostatistics/CSR table path, then the **single** Canvas/Editor and AnA, with source-grounded actual generated text. Missing data stay unknown.
6. Edit/save/reopen, review from task into the exact document, use Communication, verify every advertised rail destination, and record user-facing errors/loading behavior.
7. Actual e-signature and dispatch only when authorized ceremonies and relevant submission context exist; synthetic tasks do not assert either.

**Classification:** code+fixture committed, focused checks executed; hosted environment NOT qualified. No direct live application session was available through the connector, and the browser required an originating authenticated context.
