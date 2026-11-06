# J2 human test: the Vault and data room (2026-11-06)

One session walked journey J2 in the running app, as a clinical data manager (Dana Data) and as QA (Rhea Reviewer
signs the review, Ava Approver approves). It drove the app with Playwright at 1440×900 and at 390 wide, and looked
at every screenshot. Every defect a tester would hit was either fixed here, red then green, and checked again in the
app, or handed to the journey that owns the screen.

Session `01QoxbLb…` (J2), started by `011Dpx…`. Plan: F1. There was no model key, so AnA's drafting and cataloguing
are refused by design. That is not counted as a defect.

## What already exists (RULE 3)

Everything walked here already existed. Nothing new was built.

- The Vault: `client/src/concept2cure/v2/surfaces/Vault.tsx` and its `Vault*.tsx` parts.
- The audit-trail reader: `server/routes/audit-trail-ledger.routes.ts`.
- Legal holds: `server/routes/vault-legal-holds.ts` and `surfaces/LegalHoldsCard.tsx`.
- The filing classifier: `server/services/vault/vault-filing.service.ts`.

The fixes changed copy and naming inside those files only.

## What a tester can do now, verified step by step

Project: **[Demo · Biotech] C2C-101** (from `npm run demo:seed`). Files: `data-management-plan.pdf`,
`statistical-analysis-plan.docx`, the CDISC pilot `adsl.xpt` and `define.xml` (`scripts/cre/fetch-cdisc-pilot-adam.mjs`),
and `study-metadata.json`.

| # | Step | Who | Result | Screenshot |
|---|---|---|---|---|
| 1 | Project → Vault opens on the Library: the folder tree, its counts and the filters. | Dana | pass | `01` |
| 2 | **Add files** with 5 files (PDF, DOCX, XPT, define.xml, JSON). Each file can be given a title, type, classification and folder before upload. | Dana | pass | `02` |
| 3 | Upload: 3 files go to the folder chosen for them. The 2 left with no folder land in **Unfiled · needs review**, and the page says so. | Dana | pass | `03` |
| 4 | A file's detail shows its SHA-256, its filing and why it was filed there, and its next step. **Move to…** a folder, with a reason, records "Filed by Dana Data". | Dana | pass | `04`, `05` |
| 5 | **Send for review** names a reviewer and an approver, two due dates and a reason. | Dana | pass | `06`, `10`, `11` |
| 6 | **Sign review**: a Part 11 dialog (meaning, reason, password). Then **Approve**, by a second person. The version reads **Approved**. | Rhea, Ava | pass | `12`–`13b`, `14` |
| 7 | **Versions** shows each signature with its meaning and time, the review route and its history, and **Export signed history**. | Dana | pass | `16` |
| 8 | **History** is the audit chain, verified, with acts named in words (after D2/D8). | Dana | pass | `15` (before the fix) |
| 9 | **Upload new version** creates v2.0. It shows "2 versions", and v2.0 is Not sent for review. | Dana | pass | `17` |
| 10 | Search, the six filters, **Saved views** (save and apply). | Dana | pass | `18`, `19` |
| 11 | **Required documents**: coverage against the IND rule pack, with Upload or File here for each section. | Dana | pass | `20` |
| 12 | **Governed artifacts**: an honest empty state. | Dana | pass | `21` |
| 13 | **Seals & fixity**: **Check stored files** re-read 11 versions and found every one matching its SHA-256. **Seal this Vault…** opens the Part 11 signature. | Dana | pass | `22`, `23` |
| 14 | Admin › Settings › **Legal holds**: place a document hold with a reference and a reason. The list names the person who placed it (after D3). | JM Smith (admin) | pass | `30`, `31` |
| 15 | The Vault shows the hold on the file. **Review file removal** is blocked: "An active legal hold requires governed review". | Dana | pass | `32`, `33` |
| 16 | **Export Module 5 · Clinical**: the folder export is saved and its SHA-256 is checked against the server's record. | Dana | pass | `40` |
| 17 | Data room (lineage): **Captured 1 → Classified 1 → Filed to vault 0**. **File 1 into Vault** moves it to Filed 1. The filed letter shows its classifier note and its hash. | Dana | pass | `80`–`82` |
| 18 | Project → **Evidence** step: the project's files, the data room and the Vault tree. | Dana | pass | `24` |
| 19 | At **390 wide**, Rhea goes Project → Review → **Review documents on the review board** → **Open the version**. The Vault opens on that version. **Sign review**, then Signature applied. The page has no horizontal scroll. | Rhea | pass | `54`–`59`, `70` |
| 20 | Ava approves the ADSL. | Ava | pass | `60`, `61` |

## Defects found

### Fixed in this session

Each fix has a test that failed before the fix and passes after it.

| ID | Step | Expected | Actual | Fix |
|---|---|---|---|---|
| D1 | Library search result row | "Report · Approved" | "Report · Approved **·**": a separator with nothing after it, because a search hit carries no time (`14`) | `9a7ee552`. Checked again in the app (`18`). Test: `vaultSearchFilters.test.tsx` |
| D2 | A version's **History**, read by QA | The acts in words | "C2c Work Sign", "C2c Work Review Route Send", and the registration row named by the document's title (`15`) | `7aadfbeb`: "Version review signed (e-signature)", "Version approved (e-signature)", "Sent for review", "Registered as a controlled document", "Version in review". Test: `audit-trail-ledger.routes.test.ts` |
| D3 | Admin › Legal holds list | Who placed or lifted the hold | "Placed by user #1" | `5b0beaca`, `fe1a8bfa`: named through `public.actor_name`; the account number shows only when no name is available. Checked again in the app: "Placed by JM Smith" (`31`). Tests: `vault-legal-holds-labels.pglite.integration.test.ts`, `adminLegalHolds.test.tsx` |
| D7 | Filing note under "Looks like" | The folder a person sees | "filed to **corresp** for the **biotech view**" (`82`) | `1808666a`: "filed to Agency correspondence". Test: `vault-filing.service.test.ts` |
| D8 | History of an uploaded or filed file | The act in words | "Vault Document Ingest", "Vault Document File" (`82`) | `1808666a`: "Uploaded to the Vault", "Filing recorded", "Downloaded". A row's own description still comes first. Test: `vault-document-history.pglite.test.ts` |

### Handed to the journey that owns the screen

These are not fixed here, because the screens belong to other journeys. Each has a → note in
`.design/claude-convergence/COORDINATION.md`.

| ID | Step | Expected | Actual | Owner |
|---|---|---|---|---|
| D4 | Tasks → open "Review: ADSL…" (a Vault review-route task) | A way to open the version and sign it | The drawer offers only Advance and Archive; there is no link to the document. The server correctly refuses Advance on a route task with 409 (`ROUTE_TASK_OWNED_BY_ROUTE`), so a reviewer who starts from Tasks is stuck (`51`). The task row has `source_entity_type = canonical_document` and `review_route_id`, so the drawer can link to `vault?program=…&documentId=…`, as the review board's "Open the version" does. | → **J5** (`TaskBoard.tsx`) |
| D5 | Project → **Review** step | Lists what is out for review | "Nothing in this project is out for review" while ADSL v1.0 was in review. `ProjectReviewsBody` reads only `queue` from `/api/review/board`, not `vaultReviews`. It could reuse `ReviewVaultQueue`. An empty state that is not true. | → **J1** / **J3** (`ProjectHome.tsx`) |
| D6 | Bell → "Review: ADSL…" | Opens the version | It lands on Projects: "The review board opens inside a project" (`53`). Two more clicks reach it. | → **J3** (`OpenWork.tsx` routes every route task to `review` with no project) |
| D9 | Tasks at 390 wide | A compact header | About 250 px of blank space above "Start workflow / New task" (`50`) | → **J5** |

### Environment, not code

The removal preview answered **503 `PREVIEW_SIGNING_UNAVAILABLE`** while `SESSION_SECRET` was under 32 characters. The
disposition token needs at least 32 (`document-data-disposition/tokens.ts`). The 2026-10-13 runbook's value
`dev-session-secret` is too short. Use a secret of 32 characters or more, or set `DOCUMENT_DISPOSITION_PREVIEW_SECRET`.

## Known limits

- **Removal of a file is not active.** The panel says "Document disposition enforcement is awaiting verified
  activation", so removal is blocked for every file, held or not.
- **Holding an earlier version.** The legal-hold dialog offers only each document's current version, so an approved
  v1.0 cannot be held once v2.0 exists.
- **Saved view names.** Two saved views may share a name.
- **The Uploads list.** It shows 8 rows sorted by folder, then "Show all N". A file just uploaded may be below the cut.
- **Catalog record.** It needs AnA, so with no model key it stays empty, by design.
- **The Vault header at 390.** Its meta line wraps with a leading "·". This is deliberate: each part keeps its
  separator (UI walk, 2026-10-31).

## Test accounts and setup

```
# Postgres 16 + pgvector (apt-get install postgresql-16-pgvector)
createdb c2c_j2
DATABASE_URL=postgresql://postgres@127.0.0.1:5432/c2c_j2?sslmode=disable APP_SERVICE_DB_PASSWORD=<12+ chars> SEED_DEMO_USER=1 node scripts/db/install-fresh.mjs
DATABASE_URL=… APP_SERVICE_DB_PASSWORD=<same> node scripts/db/deploy-migrate.mjs
for u in "jm.smith@concept2cure.pro|JM Smith" "dana.data@concept2cure.pro|Dana Data" \
         "rhea.reviewer@concept2cure.pro|Rhea Reviewer" "ava.approver@concept2cure.pro|Ava Approver"; do
  ADMIN_EMAIL=${u%%|*} ADMIN_NAME="${u##*|}" ADMIN_PASSWORD=<signer password> ADMIN_ORG_SLUG=concept2cure node scripts/seed-admin.mjs
done
# server, as the runtime role
DATABASE_URL=… APP_DATABASE_URL=postgresql://app_service:<pw>@127.0.0.1:5432/c2c_j2 \
RLS_ENFORCE=on LAUNCH_SCOPE_ENFORCE=on EXPORT_REVIEW_GATE=enforce NODE_ENV=development ALLOW_DEV_AUTH=1 \
PORT=5202 ALLOWED_ORIGINS=http://127.0.0.1:5202 SESSION_SECRET=<32+ chars> JWT_SECRET=<32+> REFRESH_TOKEN_SECRET=<32+> \
CONCEPT2CURE_SIGNER_MODE=dev npx tsx server/index.ts
DEMO_SEED_EMAIL=jm.smith@concept2cure.pro npm run demo:seed -- --pack all --base-url http://127.0.0.1:5202 --plan enterprise
```

| Account | Role in the walk |
|---|---|
| `dana.data@concept2cure.pro` | Clinical data manager: uploads, files, sends for review |
| `rhea.reviewer@concept2cure.pro` | QA reviewer: signs the review (e-signature password: the seed's `ADMIN_PASSWORD`) |
| `ava.approver@concept2cure.pro` | QA approver: approves |
| `jm.smith@concept2cure.pro` | Administrator: places legal holds; the demo seed's owner |

All four are organisation administrators, which is what `seed-admin` creates. A walk with narrower roles is still to
be done.
