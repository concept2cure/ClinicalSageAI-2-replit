# DEMO evidence — biotech pack (C2C-101, US IND)

**What this is.** The record of building the biotech demonstration data through the
product's own API, so the founder can walk every launch app with one realistic
program (`docs/demo/biotech-walkthrough.md`). Everything below was produced by
`node scripts/demo/launch-demo/seed.mjs --pack biotech` against a server started with
`ALLOW_DEV_AUTH=1 LAUNCH_SCOPE_ENFORCE=on` on port 5300, signed in as the founder
(user 1, organisation 2 "Concept2Cure Therapeutics"), with the second signer supplied
through `OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD` (oq-signer@validation.local, user 42,
organisation 2). No SQL was written; no server or client code was changed.

**Provenance of the content.** Every document body, protocol element and SOP was
written by the pack's author as a regulatory subject-matter expert for demonstration.
It is seeded demo content: no AI provider is configured and nothing was model-drafted.
The sponsor (Concept2Cure Therapeutics), the molecule (C2C-101, a humanized IgG1
anti-IL-23p19 monoclonal antibody), the study (C2C-101-201), the people and the numbers
are fictional. Every title carries the prefix `[Demo · Biotech]`.

| File | What it is |
|---|---|
| `manifest.json` | Written by the run: every id, the found/created tally, the step notes (findings the run itself observed). Rewritten on every run; the copy here is from the last run (run 8). |
| `transcripts/run-*.log` | The console transcript of each seed run, in order (see "The runs" below). |
| `screenshots/*.png`, `screenshots/index.json` | Headless Chromium captures of each launch surface with the seeded data, and for each the strings the capture script checked for. |

## What the pack creates (per app)

Counts are the manifest's `tally.found` on run 8, i.e. what exists after seeding.

| App | Records | Ids |
|---|---|---|
| Projects | 1 program (IND, FDA, priority high, indication "Moderate-to-severe plaque psoriasis in adults") | program `5ac45b38-a1d8-4a41-9488-fac39a57b852`, code `CAMA`; canonical submission #67 created by intake |
| Vault | 6 multi-page PDFs ingested (SHA-256 verified against the server's contentHash) and filed, placement confirmed | IB v3.0 `a59481b8…` → module-1 · Protocol C2C-101-201 v1.0 `c4411315…` → module-5 · SAP v1.0 `3b4b1518…` → module-5 · CMC Quality Summary `4f6c55f9…` → module-2 · Nonclinical Toxicology Summary `93d8cd98…` → module-2 · Pre-IND Meeting Minutes `13c026e1…` → module-1 (full ids in `manifest.json` → `vault.documents`) |
| Authoring | 3 documents, 16 sections, 3 comments (2 resolved, 1 open), 2 review requests, 1 approval workflow, 1 freeze, 1 e-signature | Protocol Synopsis `b10152d8-b474-4661-aa3d-b699ae216c7d` (frozen v1.0, content hash `4246bc60…`, REVIEWER e-signature `c9b9aca2…` by oq-signer covering that hash) · Module 2.5 Clinical Overview `0363ad11-01f1-490f-a248-4674eeb74a51` (review requested, QA workflow PENDING) · IB Summary of Data and Guidance `c5f339b8-c54f-4762-ba35-4b830701c84b` (draft, open comment `f28ffb44…` on 7.3) |
| Protocol development | 1 clinical protocol document, 10 sections written, 6 objectives, 8 + 8 eligibility criteria, 9 visits, 10 assessments × 9 visits = 51 SoA cells, 6 risks, 5 milestones, 6 team members, 1 amendment (with 1 change), 1 version snapshot | protocol document #2; amendment #1; `GET /api/protocol-dev` returns it with objectives 6 / risks 6 / milestones 5 / amendments 1 |
| Submission Center | the program's canonical submission; sequence 0000 (original, FDA); 6 leaves; status `assembling` | submission #67; sequence #28; leaves #39–#44 (m1.14.4.1, m1.6.3, m2.3, m2.6.6, m5.3.5.1 ×2) |
| Submission Readiness | deterministic dispatch-readiness read; dispatch QC verdict; readiness-review orchestration execution | gate.cleared=false with 3 blockers (see findings); dispatch-qc clearedToDispatch=false, verdictSource `assess-dispatch-readiness`, narrative null (`PROVIDER_UNAVAILABLE`); execution `8f145d8d-5552-4a42-a8e5-023594d99fab` completed |
| QMS | 4 SOPs (2 effective by the second signer's electronic signature, 1 in review, 1 draft); 1 change-control record linked to SOP-002; 1 training attestation on SOP-001 | C2C-SOP-001 #39 effective · C2C-SOP-002 #40 effective (approver user 42, Part 11 signature rows in `electronic_signatures`) · C2C-SOP-003 #41 in_review · C2C-SOP-004 #42 draft · change C2C-CC-001 #9 (proposed, minor) |
| Audit trail | every governed write above is on `GET /api/audit-trail/ledger` with record and previous hashes | run 1 (the creating run): 12 chained entries in the newest-500 window at the moment of the check, the rest of that run's writes had already scrolled out of the window (the ledger is newest-first, limit 500) — see "Audit trail" below |

## The runs (idempotency proof)

The pack is idempotent by title: it looks each record up before creating it. The
transcripts are kept in order and unedited; the first seeding was not one clean run,
because the product refused things along the way and the pack was corrected to record
each refusal instead of hiding it.

| Transcript | What happened | Created / found |
|---|---|---|
| `run-1-seed.log` | The completing run of the first seeding. Earlier partial invocations (not kept as transcripts; their effects are in this log as "found") had created the program, the six vault documents, the three authoring documents and the protocol document before stopping on a refusal that the pack then learned to record: 409 `DOCUMENT_ALIAS_CONFLICT` on the second program-bound authoring document, the SoA matrix shape, and dispatch-qc's required fields. | 11 / 174 |
| `run-2-seed.log` | Second run, unchanged code. | **0 / 185** |
| `run-3-seed-after-placement-confirm.log` | After teaching the pack to confirm an auto-suggested Vault placement (the SAP had been auto-filed to Module 5 but showed "AUTO-FILED · CONFIRM"), one filing confirmation. | 1 / 183 |
| `run-4-seed-idempotent.log` | Re-run. | **0 / 184** |
| `run-5-seed-refactored.log` | First run of the refactored pack (split into `biotech-*.mjs` modules for the lint gates). | 0 / 184 |
| `run-6-seed-idempotent.log` | Re-run. | **0 / 184** |
| `run-7-seed-recreates-leaves-and-change.log` | The six leaves and the change record were deleted through the API (`DELETE …/leaves/:id`, `DELETE /api/mdx/qms/changes/:id`) so the refactored create path could be exercised for the records that CAN be removed; the run re-placed 6 leaves and re-created the change and its link. | 8 / 176 |
| `run-8-seed-idempotent.log` | Re-run. | **0 / 184** |

The two entries a no-op run still writes to the ledger are `Authoring Section View
Frozen` — the product audits a read of a frozen document. Nothing else is written.

`--purge` was **not** executed against this data: its only effective actions are
deleting leaves, deleting the change record and retiring the two effective SOPs, and a
retired SOP cannot be re-approved under the same number (`/retire` is terminal; a new
number would be needed), so purging would leave the founder's register with retired
demonstration SOPs. The purge path is implemented and honest about what it cannot remove
(see findings 9–10); the leaf and change deletions it performs are exactly what run 7
exercised.

## Screenshots (what the founder will see)

All taken headless at 1440×900 with the program selected in the shell the way the OQ
runners do; `screenshots/index.json` lists for each the strings the capture checked.

| File | Surface | Checked |
|---|---|---|
| `00-login-demo-access.png` | `/concept2cure/login` → "Demo access" → shell home | landed in the shell |
| `01-projects.png` | Projects | program title present |
| `02-project-home.png` | Project home | program title, sponsor, product, indication, "IND number: not assigned" |
| `03-vault.png` | Vault (DMS) | six uploaded files with their Module 1/2/5 filing, "FILED" |
| `04-authoring.png` | Document editor | Protocol Synopsis S.1 rendered with the frozen banner ("sealed under a content hash") |
| `04b-authoring-all-status.png` | Document editor, status filter "all" | **the two unbound documents are NOT listed** — finding 2 |
| `05-review-board.png` | Review | queue renders |
| `06-protocol-dev.png` | Protocol development | **"not in this release"** gate — finding 3 |
| `06b-protocol-dev-LAUNCH_SCOPE_ENFORCE-off.png` | Protocol development with enforcement OFF (server restarted for this one capture) | the seeded protocol renders — see the note under finding 3 |
| `07-submission-center.png` | Submission center | biotech submission listed; **the picker defaulted to the MDX pack's submission** — finding 4 |
| `07b-submission-center-sequence-0000.png` | Submission center → biotech submission → Sequences | sequence 0000 "ASSEMBLING" with the Validated / Draft transitions offered |
| `08-dispatch-readiness.png` | Dispatch readiness | the program's sequence 0000, "Dispatch blocked", 3 blockers, 6 `UNRESOLVED_DOCUMENT` errors — finding 1 |
| `09-quality-sop-register.png` | Quality → SOP register | C2C-SOP-001 and C2C-SOP-002 Effective 1.0 |
| `09b-quality-change-control.png` | Quality → Change control | C2C-CC-001 Proposed, Minor, Document |
| `10-audit-trail.png` | Audit trail | entries with actor/event/target; **"Chain verification failed"** banner — finding 5 |

## Findings (product behaviour observed while seeding; nothing was fixed in the product)

1. **Vault-placed leaves are permanent dispatch blockers.** `PUT /api/submissions/sequences/28/leaves {sectionCode, title, documentTable:"vault_documents", documentUuid, lifecycleOp:"new"}` answers 200 and stores the leaf with `document_uuid` (the type's own comment: a leaf carries `documentUuid` OR `documentId`). `GET /api/submissions/sequences/28/dispatch-readiness` then reports one `UNRESOLVED_DOCUMENT` error per leaf ("has no resolvable document — it cannot be assembled into the package") because `server/services/ectd/dispatch-readiness.ts` `documentPointerFindings` tests `!leaf.documentId` and `server/services/ectd/assess-dispatch-readiness.ts:316` passes only `documentId`. Consequence for the demo: sequence 0000 cannot honestly be moved to `validated`, so it is left at `assembling` and the founder can show the gate refusing, but not the freeze. The Dispatch readiness surface displays the six errors verbatim (`08-dispatch-readiness.png`).
2. **One program-bound authoring document per program.** `POST /api/authoring/docs {title, module, client_program_id}` for the second document answered `409 {"error":"DOCUMENT_ALIAS_CONFLICT","message":"c2c_documents doc_827e… is already recorded as a different document. Nothing was created."}` (`authoring.router.ts` resolveGovernedDocument → DocumentAliasConflictError). The pack created the Clinical Overview and the IB Summary unbound (no `client_program_id`) and recorded the refusal. Consequence: the Document editor, which is scoped to the open program's governed document tree, lists only the Protocol Synopsis (`04b-authoring-all-status.png`); the other two exist (GET `/api/authoring/docs?status=all` lists them; the Review board queue carries the Clinical Overview's request) but the founder cannot open them from the editor.
3. **Protocol development is outside the launch scope.** `GET /api/module-subscriptions/navigation` → `{"id":"protocol-dev","entitled":false,"source":"launch-scope"}`; `/concept2cure/protocol-dev` shows "not in this release" (`06-protocol-dev.png`). The APIs (`/api/protocol-development`, `/api/protocol-soa`, `/api/protocol-risks`, `/api/protocol-milestones`, `/api/protocol-amendments`, `/api/protocol-dev`) all work and the seeded protocol is complete; it is visible only with `LAUNCH_SCOPE_ENFORCE=off` (`06b-…png`, captured on a separate server start for evidence only). The read model exposes team members as `pi`, not `team`.
4. **Submission center's portfolio picker does not follow the open program.** With the biotech program selected in the shell, the surface opened on the first submission in the organisation (the MDX pack's) (`07-submission-center.png`); the founder must pick the biotech submission in the dropdown (`07b-…png`). Dispatch readiness DOES resolve the open program's sequence (VSR-001 F-8 fix). Also: `GET /api/submissions` has no PATCH, so the submission keeps intake's title (the program name) and "IND 0000 — Original IND" is carried by the sequence.
5. **Audit ledger chain verdict is `ok:false` on this database.** `GET /api/audit-trail/ledger` → `meta.chain = {store:"audit_logs", ok:false, rowsChecked:33, legacyRows:152, brokenAt:{id:"6633e4a6-0fbc-400f-b9e1-600acd237b02", segment:"legacy", …}}`; the surface shows "Chain verification failed … (legacy segment, content does not derive from any predecessor)". Every entry this pack wrote carries record and previous hashes (`unchainedThisRun: 0`); the break is in a pre-existing legacy row, not in the demo's rows. The task asked to record `meta.chain.ok` is true; it is not, and the manifest says so.
6. **Shadow Review cannot run without a provider.** `POST /api/submissions/sequences/28/shadow-review {lens:"fda_filing"}` → HTTP 502, and it left a `shadow_review_runs` row with `status:"failed", model:null`. The pack does not retry (each attempt writes another failed row); the readiness gate lists "No completed Shadow Review" as a blocker.
7. **Program intake has no description / sponsor / phase inputs.** `POST /api/c2c/projects` accepts name, productName, programType, primaryAgency, indication, applicationNumber, priority, targetSubmissionDate, teamMembers (`server/routes/c2c/projects.ts:478-495`); phase is `planning` at creation. Project home shows the sponsor as the organisation name, which for this org happens to be "Concept2Cure Therapeutics".
8. **The QMS has no deviation entity.** `/api/mdx/qms` offers documents, changes (with a `deviation` *link type* by reference), nonconforming products, suppliers, internal audits, management reviews and training. SOP-003 describes deviation management; no deviation record was created and none was simulated. QMS documents also have no content field — the SOP prose is stored in `metadata.body` (`z.record(z.unknown())`) and the register shows number/title/type/version/status only.
9. **No delete or archive routes for most of what the pack creates.** Programs (`/api/c2c/projects`), vault documents (`/api/c2c/project-vault` — file/unfile only), protocol documents, submissions and sequences have none; `DELETE /api/authoring/docs/:id` requires `ADMIN_TOKEN` (not a signed-in author). `purge` therefore removes leaves, deletes the change record and retires effective/in-review SOPs, and says what it left.
10. **Rate limiting shapes long seeds.** The platform limiter (100 req/min per IP) returned 429 several times during the ~230-request protocol build; the harness client waits and retries (`(429 on POST … waiting 46s, retry 1)` in the transcripts). Harmless, but a seed of this size takes 6–8 minutes.
11. **Authoring e-signature is PIN-based, not password-based.** `POST /api/authoring/docs/:id/e-sign {pin, meaning, intent}` verifies a PIN enrolled through `POST /api/authoring/users/pin`. The second signer's PIN was enrolled the way OQ-003 step 12 does (`VALIDATION_SIGNING_PIN`, default the OQ value); the account password is used only by the QMS approval (`POST /api/mdx/qms/documents/:id/approve {password, meaning, reason, effectiveDate}`), never printed or stored. The `REVIEWER` meaning was used (as OQ-003 step 14 does) because the `APPROVER` path also auto-freezes and the document was already frozen.
12. **Vault ingest auto-files.** Ingest suggested Module 5 for the SAP on its own (`placementStatus: suggested`, shown as "AUTO-FILED · CONFIRM"); the pack now confirms every placement so the register shows FILED for all six.

## Gates (final code)

| Gate | Result |
|---|---|
| `npx eslint --no-ignore scripts/demo/launch-demo` | 0 errors, 0 warnings |
| `node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD` | none of the pack files appear (the only line is another worker's `DocumentAuthoring.tsx`, −14) |
| `npm run ci:launch-scope` | ✅ 6 apps · 41 surfaces · 21 modules |
| `npm run ci:fixture-fallback` | ✅ 0 new |
| `npm run ci:no-mock-in-prod-routes` | ✅ current=0 |

## How to re-run

```
set -a; source .env; set +a
ALLOW_DEV_AUTH=1 PORT=5300 SKIP_DB_STARTUP_TEST=true LAUNCH_SCOPE_ENFORCE=on npx tsx server/index.ts &
# second signer (optional; without it the signed steps are recorded "not executed — signer credential not supplied")
export OQ_SIGNER_EMAIL=… OQ_SIGNER_PASSWORD=… OQ_AUTHOR_EMAIL=jonmichaelpsmith@gmail.com
DEMO_BASE_URL=http://localhost:5300 node scripts/demo/launch-demo/seed.mjs --pack biotech
```
