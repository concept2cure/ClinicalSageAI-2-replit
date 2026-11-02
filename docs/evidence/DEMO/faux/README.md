# Faux Biotech FBT-201 — existing Project Management CSR data seed

**2026-11-02 — Plan: DATA.** Branch: `concept2cure-v2`. This is a fictional **data pack**, not a CSR module or another UI workflow. Project Management selects document type **CSR**; the existing Data Room, Canvas/Editor, AnA, Tasking and governed review remain the system.

## Existing owners (no replacement)

- `scripts/demo/launch-demo/seed.mjs`: the operator-run API seed command. `--pack faux` explicitly opts into this fictional organization; `--pack all` deliberately EXCLUDES it. Mixed packs are refused.
- `scripts/demo/launch-demo/lib.mjs`: validated token/session, account and organization binding, project and Tasking preflight, plan/entitlement check, real API client, SHA-256 utilities, and audit-friendly manifest runner.
- `scripts/demo/launch-demo/packs/faux.mjs`: data-only content and orchestration using that same command. It creates no new route/service/editor.
- `server/routes/c2c/projects.ts`: existing `POST /api/c2c/projects` accepts `programType: 'csr'` with `submissionTypeId: 'ich_csr'`, `productType: 'biologic'`, `primaryAgency: 'ICH / Global'` (see `server/routes/c2c/__tests__/projects-create-market-offer.test.ts`). CSR is a **document type**, not a standalone application. A CSR project does not silently create an IND/BLA submission spine.
- Existing `/api/clients` record is the established internal client/project anchor required by Project Management; it is not another user-facing "biotech workspace".
- `/api/c2c/project-vault/:id/search`, `POST /api/vault/ingest`: the one Data Room/Vault content store with version and hash records. Its intake currently admits `.json` and `.pdf` (shared/constants/document-intake-formats.ts). Upload acceptance does **not** mean schema validation, scientific source approval, CDISC conformity or CSR release.
- `scripts/demo/launch-demo/packs/work-areas.mjs`: the existing `ensureTasks` writes tasks through the authenticated task board API. This data pack makes all three **pending**, not approved or signed.

## Fictional source scope

FBT-201-2026 is an invented Phase 2 biologic trial with 160 simulated participants (80 per arm), revision-2 source `docs/demo/faux-biotech-csr/FBT201_CSR_SOURCE_SYNTHETIC_v2.json.gz`. The file is decompressed to plain JSON for upload; **do not upload gzip as clinical-source JSON**. Current source checks expect 79 artificial AEs, 74/76 treatment completers, 52/30 PASI75 responders, and a declared end-of-treatment disposition basis. The pack stores source SHA-256 from the actual uploaded bytes.

Other source records created in this one project: a synthetic protocol and synthetic SAP, each rendered from existing Markdown into demonstration PDFs. The pack additionally creates three pending project tasks: source catalog QA, numerical reconciliation, and human CSR review. It does **not** generate a CSR, run AnA, approve a source, forge clinical findings, sign any record, or submit anything.

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

A repeatable **native Node test** was added: `node --test scripts/demo/launch-demo/faux-demo.test.mjs`, exercising the pack and the checked-in binary dataset with API doubles, including source identity/hash, CLI isolation and non-destructive purge. That native test command **has not run in the full repository** in this ChatGPT execution, so it must not be reported passed. The actual gzipped source was independently decompressed and compared byte-for-byte with the retained revision-2 ZIP and matched the declared source SHA-256 `be9993dfa6a8eee53b10d0b18ea642b3c987b2e3df09dd9973040f601669c15a`. Counts independently verified: 80+80 subjects, active/placebo completers 74/76, unique TEAE subjects 42/37, SAE subjects 3/2, withdrawals 2/1.

No full TypeScript/build, native Vitest/PGlite, customer browser, real database or hosted source-ingestion run is claimed. No deployment occurred here.

## Acceptance — still OPEN

1. Actual fictitious organization exists with appropriately admitted demo member; account can sign in and list a Project Management project of type CSR.
2. Run the pack against **that same tenant**; record actual project ID, exact document IDs and SHA-256 from Vault receipts. A GitHub commit is NOT a hosted project.
3. Enter through Demo Access, see the populated project and actual Tasks, open source records in that project's Data Room and confirm lineage/status.
4. Use the existing source review and biostatistics/CSR table path, then the **single** Canvas/Editor and AnA, with source-grounded actual generated text. Missing data stay unknown.
5. Edit/save/reopen, review from task into the exact document, use Communication, verify every advertised rail destination, and record user-facing errors/loading behavior.
6. Actual e-signature and dispatch only when authorized ceremonies and relevant submission context exist; synthetic tasks do not assert either.

**Classification:** code+fixture committed, focused checks executed; hosted environment NOT qualified. No direct live application session was available through the connector, and the browser required an originating authenticated context.
