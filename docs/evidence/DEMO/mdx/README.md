# MDX demo pack — evidence

**Pack:** `scripts/demo/launch-demo/packs/mdx.mjs` (+ `mdx-content.mjs`,
`mdx-qms.mjs`, `mdx-shared.mjs`) · **Run:**
`DEMO_BASE_URL=http://localhost:5400 node scripts/demo/launch-demo/seed.mjs --pack mdx`
· **Server:** local, `PORT=5400 ALLOW_DEV_AUTH=1 LAUNCH_SCOPE_ENFORCE=on`, no AI
provider (`/readyz` reports `ana: no_provider`) · **Date:** 2026-09-21 ·
**Seed identity:** jonmichaelpsmith@gmail.com (user 1, organisation 2) ·
**Second signer:** oq-signer@validation.local (user 42, org 2 admin) via
`OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD` — the password was never printed or
written anywhere in this folder.

**Story:** Concept2Cure Diagnostics (fictional) · NeuroPanel-Dx Multiplex CNS
Pathogen Panel (fictional IVD; HSV-1/2, VZV, enterovirus, parechovirus, CMV in
CSF) · US 510(k), Class II, product code QNX and 21 CFR 866.3985 (both
fictional, well-formed), predicate K223456 (fictional). Every document carries
the line *"seeded demonstration content … Not model-drafted — no AI provider is
configured."* Nothing was written to a table; every record went through the
public API as the signed-in founder, and the signed steps through the second
identity.

Founder-facing script: `docs/demo/mdx-walkthrough.md`.

## Files in this folder

| File | What |
|---|---|
| `manifest.json` | Written by the last run (run 6, idempotent): every id, the probes' verbatim responses, the findings as notes |
| `transcripts/run-1-partial-authoring-alias-conflict.txt` | First run from an empty state; stopped at the second authoring document (finding F2) |
| `transcripts/run-2-partial-estar-leaf-refused.txt` | Second run; created what was missing, stopped at the first eSTAR-coded leaf (finding F3) |
| `transcripts/run-3-complete.txt` | Third run; created the rest (leaves at CTD codes, readiness, QMS, audit). The pack was complete after this run |
| `transcripts/run-4-idempotent.txt` | Fourth run, nothing to create: every step "existing / already …", 0 leaves placed, 1 ledger entry since run start (the orchestration probe's execution) |
| `transcripts/run-6-idempotent-final-manifest.txt` | Sixth run (the one that wrote `manifest.json`): identical outcome to run 4 |
| `screenshots/*.png`, `screenshots/index.json` | Headless Chromium (playwright-core, `/opt/pw-browsers/chromium-1194`), 1440×900 full-page, login through the **Demo access** button; `index.json` records which expected strings each page contained |

Runs 5 and 6 re-ran after the pack learned to record findings F3b, F5, F7 and
F9 on an idempotent run (run 5 is not filed; run 6 is). The manifest in this
folder is run 6's.

## What the pack creates (counts per launch app)

| App | Records | Ids (this database) |
|---|---|---|
| **Projects** | 1 program: `[Demo · MDX] NeuroPanel-Dx 510(k)`, programType `510k`, productType `ivd`, FDA, priority high, intake scaffolded the k510 governed document (36 eSTAR sections) | program `82d3b729-87a1-4714-9a21-819b538683f3`, code `DMN5` |
| **Vault** | 6 multi-page PDFs (3–4 pages each) ingested and filed into the IVD cabinet folders: Device Description → `k510`; Analytical Performance Study Report → `k510`; Software Description and Level of Concern → `eng`; Risk Management File Summary (ISO 14971) → `eng`; Clinical Performance Study Report → `cer`; Labeling and IFU (Draft) → `udi` | `0bdf94f7-…`, `d0b35c47-…`, `89d0bfce-…`, `8a302d5a-…`, `121d2df3-…`, `1b80ee68-…` (full ids and SHA-256 in `manifest.json` `vault.*`) |
| **Authoring** | 3 documents, 20 sections: **510(k) Summary** (9 sections per 21 CFR 807.92; reviewer comment raised and resolved; review requested from and workflow submitted to the second identity; frozen v1.0; e-signed APPROVER by the second identity, PIN-verified, bound to the frozen hash) · **Substantial Equivalence Discussion** (5 sections with comparison tables; draft; one **open** comment) · **Cybersecurity and Interoperability Summary** (6 sections; draft; review requested) | `28f95d9a-a9c1-49da-8377-56d847a5d8e5` (signature `f88f8d63-…`, comment `cb315bc0-…`), `ecee51ea-a427-4870-9abf-1d8f81cb8e1d` (open comment `301b0174-…`), `883912ab-6cd2-4301-972b-d3c4f420837a` |
| **Submission Center** | 1 submission (`510k` / `ivd` / `fda`, titled with the program name so the platform links it to the program) · 1 sequence `0000` original, moved draft → **assembling** · 6 leaves, one per vault document, `vault_documents` + `documentUuid`, content hash pinned, at CTD codes 3.2.P.1, 3.2.R, 5.3.1.4, 5.3.5.2, 1.16, 1.14 with eSTAR documentType tokens · not frozen, not dispatched | submission `68`, sequence `29`, leaves in `manifest.json` `leaves` |
| **Submission Readiness** | dispatch-readiness assessment recorded (gate **not cleared**, 6 error findings, no Shadow Review) · dispatch-QC recorded (`clearedToDispatch:false`, `verdictSource: assess-dispatch-readiness`, narrative `PROVIDER_UNAVAILABLE`) · one `submission_readiness_review` orchestration execution (completed) | execution ids in `manifest.json` `readinessReview*` |
| **QMS controlled documents** | 4 SOPs with section skeletons: MDX-SOP-101 Design Controls (**effective**, e-signed APPROVED by the second identity, signature 13), MDX-SOP-102 CAPA (**effective**, signature 14), MDX-SOP-103 Complaint Handling and MDR Reporting (**in_review**), MDX-SOP-104 Software Change Control (**draft**) · 1 training acknowledgement of SOP-101 by the founder · 1 change-control record MDX-CC-2026-001 (computer_system, major, medium risk, **under_assessment**) with 3 cross-reference links (SOP-104, the risk file, the software description) · **no CAPA record** (finding F6) | QMS docs `43`, `44`, `45`, `46`; change `8`; training record `9` |
| **Audit trail** | read-only: 1000-row window read (600 rows present), 50 entries reference the pack's records by target token, every one carrying `hash` and `prevHash`; `meta.chain.ok = false` at a legacy row that predates the pack (F8); `/api/c2c/actions/verify-chain` → `ok: true` | — |

Program type decision: `'510k'` rather than `'ivd'`. The filing type is what
intake keys on — it sets `regulatory_path = 510k`, scaffolds the k510 governed
document (the 36-section eSTAR outline) and derives the device product class;
`productType: 'ivd'` then selects the IVD vault view (`standard: ivd`). `'ivd'`
as a *program* type has no US premarket path and no 510(k) scaffold (it is an
EU/product-class bucket), so it would have produced a program the Submission
Center cannot describe as a 510(k).

## The two-run transcript, in short

- Run 3 (`transcripts/run-3-complete.txt`): created submission 68, sequence 29,
  6 leaves, the 4 SOPs, 2 signed approvals, the training record and the change
  record; every earlier record reported "existing".
- Run 4 (`transcripts/run-4-idempotent.txt`): **every step "existing / already
  …"**, `0 placed this run`, `already effective (approver 42)`, `already signed
  by oq-signer@validation.local (APPROVER)`, `already acknowledged`, and the
  ledger grew by exactly one entry — the orchestration probe's execution (the
  one write the pack makes on every run, recorded as such).

## Screenshots (headless Chromium, `screenshots/`)

| # | Surface | Shows |
|---|---|---|
| 01–02 | `/concept2cure/login` → Demo access | login page; the shell after the **Demo access** button (landed on `/concept2cure`) |
| 03 | Projects | the program row `[Demo · MDX] NeuroPanel-Dx 510(k)` |
| 04 | Project home | program open: code DMN5, FDA, indication, priority high, journey rail; **no device class / product code / predicate** (F9) |
| 05 | Vault | `Vault (DMS) · 510(k) · 21 CFR 807`, the six uploaded files each marked **FILED** with its folder, plus the governed k510 document tree |
| 06–07 | Authoring, program open | the 510(k) Summary listed and opened: "approved and frozen" lock banner, section 1 Submitter (807.92(a)(1)), provenance line |
| 08–09 | Authoring, no program open | the SE Discussion and the Cybersecurity Summary listed (F2); SE opened at section 1, section 3 carries the comment marker |
| 10 | Review | the board (empty of the pack's review requests — F4) |
| 11–13 | Submission Center | the submission (type 510(k), client Ivd, FDA); Builder: `0000 · original · Assembling`, six `[Demo · MDX]` leaves at 1.14, 1.16, 3.2.P.1, 3.2.R, 5.3.1.4, 5.3.5.2 with "Source document: unlinked" (F5) |
| 14 | Dispatch readiness | "Cleared to dispatch? — **Dispatch blocked**", sequence 0000 (id 29), 6 leaves, status assembling, 2 blockers, the six `UNRESOLVED_DOCUMENT` errors (F5) |
| 15 | Orchestration | the readiness-review execution |
| 16–17 | Quality | SOP register with the four MDX SOPs (9 effective in the register including the biotech pack's); Change control tab with MDX-CC-2026-001 **Under assessment**, links column 0 (F7) |
| 18 | Audit trail | the ledger (200-row window), server chain verdict banner (F8), pack targets (`authoring_document:28f95d9a…`, QMS/vault entries further down) |

`screenshots/index.json` lists, per page, the strings the script waited for
and whether each was found (all expected strings were found; the one `false`
is "open comment text" on 09, because the editor shows a comment marker, not
the comment body, until the thread is opened).

## Findings (product behaviour observed while seeding; nothing was changed in server/ or client/)

Each is also a `FINDING:` note in `manifest.json`; the probes' full responses
are under `records`.

**F1 — Projects: a 510(k) program gets no canonical submission spine.**
`POST /api/c2c/projects {programType:'510k', productType:'ivd', …}` → 201 with
`meta.submissionId` absent; `server/routes/c2c/project-intake.ts`
`DRUG_APPLICATION_TYPES` covers ind/cta/nda/bla/maa/jnda/anda only. The pack
creates the submission itself with the program name as identity key, which is
how Dispatch Readiness then finds it.

**F2 — Authoring: one bound document per program.**
`POST /api/authoring/docs {title, module:'510k', client_program_id}` for the
second document → **409** `{"error":"DOCUMENT_ALIAS_CONFLICT","message":"c2c_documents
doc_72de18631dd94ef49dfa9e4d73c5a224 is already recorded as a different
document. Nothing was created."}` (transcript run 1). The create binds the new
document to the program's single governed c2c_document, so the SE Discussion
and the Cybersecurity Summary were created without `client_program_id`; the
Authoring surface, which filters by the open program, lists them only when no
program is open (screenshots 06 vs 08).

**F3 — Submission Center: the leaf model is eCTD-only.**
`PUT /api/submissions/sequences/29/leaves {sectionCode:'estar.device-description', documentTable:'vault_documents', documentUuid, documentType:'device_description', lifecycleOp:'new'}`
→ **400** `VALIDATION` "Section code "estar.device-description" does not name
a CTD section a document can be filed at. Use a CTD section code — for example
1.2, 2.7.3 or 3.2.S.4.2 …" (`manifest.json` `estarLeafProbe`). The builder
presents eCTD modules. The pack files the device documents at the closest CTD
codes and carries the eSTAR mapping on `documentType`; no device structure was
faked. An authoring document cannot be placed as a leaf at all
(`authoring_documents` is not in `RESOLVABLE_DOCUMENT_TABLES`).

**F3b — eSTAR pathway readiness never sees a vault leaf as present.**
`GET /api/submissions/sequences/29/pathway-readiness?pathway=estar_510k` → 200,
`ready:false`, all 18 sections missing although six leaves carry eSTAR
documentType tokens: the route maps leaves without the `substantive` flag the
mapper requires (`EstarInputLeaf.substantive` undefined ⇒ not substantive,
fail-closed).

**F4 — Authoring reviews are not on the Review board.**
After `POST /api/authoring/documents/:id/request-review` on two documents,
`GET /api/review/board` → `data.queue: []` (`manifest.json` `reviewBoard`).
Same store split as VSR-001 F-6.

**F5 — Submission Readiness: every vault-backed leaf is an error.**
`GET /api/submissions/sequences/29/dispatch-readiness` → 6 ×
`{"severity":"error","code":"UNRESOLVED_DOCUMENT","message":"Leaf … has no
resolvable document — it cannot be assembled into the package."}` for leaves
the route had accepted with `documentTable:'vault_documents'`,
`documentUuid`, and a pinned `documentContentSha256`.
`documentPointerFindings` (`server/services/ectd/dispatch-readiness.ts`) tests
`!leaf.documentId` — the integer column, null for a uuid-keyed vault document.
The Builder shows the same leaves as "Source document: unlinked". Consequence:
a sequence assembled from uploaded vault documents cannot clear the dispatch
gate on this build. (The gate failing closed is correct; the check it fails on
is the defect.) `POST /api/submissions/68/dispatch-qc` mirrors the same
blockers with `verdictSource: assess-dispatch-readiness` and
`narrativeUnavailable.code: PROVIDER_UNAVAILABLE` — the verdict did not depend
on a model.

**F6 — QMS: no CAPA create route.** `server/routes/mdx-qms.ts` has documents,
training, suppliers, internal audits, management reviews, nonconforming
product and change control; CAPA records are read-only through
`GET /api/mdx/postmarket` (`capa_records`) and can only be *referenced* from a
change link (`linkType: 'capa'`). No CAPA was seeded.

**F7 — QMS: change list rows carry no links.** `GET /api/mdx/qms/changes`
returns rows without a `links` field while `GET /api/mdx/qms/changes/8` carries
3; the Change control log (`ChangeControl.tsx` `c.links?.length ?? 0`) shows
**0** for MDX-CC-2026-001 until the row is expanded (screenshot 17).

**F8 — Audit trail: chain verdict false on this database, before the pack.**
`GET /api/audit-trail/ledger` → `meta.chain: {ok:false, brokenAt:{id:'6633e4a6-0fbc-400f-b9e1-600acd237b02', segment:'legacy'}, rowsChecked:33, legacyRows:152}`
— a legacy row that predates the pack; every entry the pack wrote carries
`hash` and `prevHash` (0 unchained), and `GET /api/c2c/actions/verify-chain`
answers `ok:true`. The surface renders the server's verdict honestly
(screenshot 18). On a fresh database both verdicts are true.

**F9 — Projects: the device taxonomy is stored but not readable.**
`GET /api/c2c/projects/82d3b729-…` returns `program_type`, `indication`,
`intended_use` … but none of `device_class`, `regulatory_path`,
`product_code`, `predicate_devices`, `product_type`, nor the metadata
(`reviewPanel`, `regulationNumber`, `deviceFlags`) intake accepted and stored.
Project home therefore shows no class / product code / predicate (screenshot
04). The shell's segment label also reads "Biotech & Pharma" with a device
program open (all screenshots).

**F10 — Submission Center wording.** With a 510(k) submission selected the
header reads "1 eCTD sequence tracked … Builder · eCTD leaves" (screenshots
11–13); cosmetic, consistent with F3.

## Purge

`node scripts/demo/launch-demo/seed.mjs --pack mdx --purge` retires the four
SOPs (`POST /documents/:id/retire {reason}`) and deletes the change record
(`DELETE /qms/changes/:id`). The program, the six vault documents, the three
authoring documents (`DELETE /api/authoring/docs/:id` needs `ADMIN_TOKEN` and a
`UAT-` product code), the submission and the non-draft sequence have no
delete/archive endpoint in the launch API and stay, titled `[Demo · MDX]`
(recorded in the manifest as `purge.retained`). Purge was not executed on this
database so the records remain for the founder to see.

## Gates (2026-09-21, this working tree)

| Gate | Result |
|---|---|
| `npx eslint --no-ignore scripts/demo/launch-demo` | 0 errors; 0 warnings in `packs/mdx*.mjs` (the remaining warnings are in `packs/biotech.mjs`, worker WG's file) |
| `node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD` | "no file changed its warning count since HEAD" (`scripts/**` is outside `eslint .` scope) |
| `npm run ci:launch-scope` | ✅ 6 apps · 41 surfaces · 21 modules · fixture-free |
| `npm run ci:fixture-fallback` | ✅ 0 ungated, 0 baselined |
| `npm run ci:no-mock-in-prod-routes` | ✅ current=0, baseline=0, new=0 |

## Not done / open

- Purge not executed (records intentionally left for the demo).
- No governed `POST /api/c2c/actions/sign` on the sequence: the only intent the
  route serves for a sequence is freeze/dispatch, which the brief excluded.
- F5 means the Submission Readiness verdict for this (and any vault-built)
  sequence is "blocked" until the integer-vs-uuid pointer check is fixed; the
  demo tells that story honestly rather than working around it.
- Screenshots were taken with `seedAuthenticatedContext` (the OQ harness's
  program selection) after a real Demo-access login; a human clicking through
  the program picker would see the same pages.
