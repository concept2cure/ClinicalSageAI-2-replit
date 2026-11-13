# Sales showcase: the Lumen account's run of show, by person and scene (2026-11-10)

**Asked by:** the founder, 2026-11-10: "Keep working to get everything ready for a sales showcase of the entire
platform." The Codespace is the only place the platform is demonstrated today, so this is written for the Codespace.

Every line below was read in the running app on a Codespace-shaped database (`NODE_ENV=development`,
`deploy-migrate`, the Lumen account seeded as the Codespace seeds it, then `--pack all`), on trunk after `34ecd2981`.
That stack had **no model key**, so what AnA writes was not exercised here; see "With and without a model key".

## What already exists (RULE 3)

Nothing new was built for this. The showcase is the demo data and the product as they stand. The presenter's
scripts for the development organisation already exist; this note adds the one that did not: the Lumen account, by
person.

| Piece | Path | What it does |
|---|---|---|
| The Lumen account and its people | `.devcontainer/post-create.sh` `c2c_seed_lumen_accounts`, `c2c_seed_lumen_org` | Created and seeded first on every Codespace start |
| "Demo access" with a choice of person | `client/src/concept2cure/components/concept2cure-auth/DemoAccounts.tsx` | "Sign in as": Lumen's three people, then the development organisation's seven |
| The Lumen story | `scripts/demo/launch-demo/packs/lumen*.mjs` | Four projects; LMN-201 carries the full story |
| The other demo stories | `packs/biotech*.mjs`, `packs/mdx*.mjs`, `packs/faux.mjs` | C2C-101 (antibody IND), C2C-201 (small-molecule IND, Module 3), NeuroPanel-Dx (510(k)) |
| The presenter's scripts | `docs/demo/biotech-walkthrough.md` (C2C-101, with stop 6b for Module 3 on C2C-201), `mdx-walkthrough.md`, `IVD_510K_WALKTHROUGH.md` | The development organisation's stories, stop by stop. Scenes 13 and 14 below point into them |
| The sweep of every screen at head | `docs/evidence/DEMO/2026-11-10-showcase-sweep/` (session `01QoxbLdTrwY…`) | 121 stops over 7 projects as Ana Author, then 180 inside the screens; its findings and fixes |
| An earlier 16-stop tour, no key | `docs/evidence/DEMO/2026-11-09-platform-tour/` | Walked 2026-11-09 |
| The CSR path with a provider | `docs/evidence/D2-CSR/2026-11-10-build-provider-refusals/` | Walked against a strict stand-in for the provider; says what still stands between the CSR and a filed sequence |
| Watching a CSR being written | `docs/evidence/D2-CSR/2026-11-10-live-drafting-view/` | The live drafting view and "Resume build" |

### 2026-11-13 continuation: startup and browser proof

This continuation picks up Claude's canonical `d06fb86ec` and moves W1 / D2 under **F1**, finishing the existing
Codespace and demo verification. It adds no screen, route, service, table, model or production dependency.

**What already exists:** `.devcontainer/post-create.sh` installs and provisions the local database with separate
owner/runtime credentials; `.devcontainer/post-start.sh` starts the current revision and seeds the existing demo.
The first dependency-log redirect previously preceded creation of its private state directory. The existing
`scripts/ops/codespaces-startup.test.mjs` now exercises that actual shell recovery branch. Claude's provider-key
fingerprint/restart checks remain in place. The auto-opened editor handoff now describes the current Lumen chooser,
three synthetic reports, human review and current model qualification boundary.

`.github/workflows/tier5-browser-smoke.yml` already provisions the real schema and runs four browser suites.
`scripts/run-e2e-smoke.mjs` already seeds its login identity and passes the environment to the browser, while
`tests/e2e/dev-auth-helper.ts` correctly refuses an unnamed identity. The job now supplies the same explicit
fictional seed/browser account; no authentication gate or anonymous negative control is weakened.
The existing authenticated smoke also expected a former person's name; its greeting must instead identify the
current authenticated account, while the anonymous case refuses any personalized Home greeting. The existing
keyboard walk needs accurate visibility/paint observation: Vault's hidden upload inputs are not tab stops, and
RBM's existing composer frame changes its visible border on `:focus-within`. Its checker is extended with bounded
frame observation and positive/negative controls; the product's skip target and focus styling are preserved.
`tests/e2e/golden-customer-journey.e2e.ts` still called the retired project creator and expected a stored title in
AnA's prompt. It now uses the existing canonical creator's UUID and integer-anchor receipt, and verifies the fixed
neutral prompt plus exact saved-section context. Its bounded capture aborts before provider transport and proves
client request preparation only. The retired creator is not restored. Full deletion-history searches of these
existing startup, workflow and journey paths found no deleted replacement to revive.
The existing `tests/e2e/helpers.ts` is also the home for the journey's reusable authenticated browser request;
its unrelated seed-file login helper remains lazy and is not used by this fixture-free path. Current UI checks
scope Vault navigation to the active Command palette. The editor's one-use return link is checked before sending;
the captured send consumes that origin as designed, and a fresh saved editor context is checked independently.

Initial checks: all three private-state regressions fail against the preceding shell branch; the full Codespaces
suite passes **64/64** on Node 22. The smoke identity contract fails four cases before the workflow correction and
passes **6/6** afterward, including the actual helper's refusal before fetch. These are component checks. Fresh
devcontainer startup, actual browser checks, compiler, normal push and remote receipt are recorded below only
after completion; earlier green CI skipped its conditional Codespace rehearsal.

The actual configured devcontainer filesystem/configuration now completes `post-create.sh`: fresh locked
dependencies, all 64 checks on the image's Node 22.16, PostgreSQL 16 + pgvector, canonical provisioning, separate
non-owner runtime credentials, fictional accounts, Chromium, Noto fonts, LibreOffice and `xmllint`. This runner's
VFS layer-copying exhausted its 32 GiB disk on a normal image pull. The rehearsal therefore exports the same
official amd64 image filesystem and imports a single layer with the original runtime configuration; it changes
no repository or Codespace configuration. Original image manifest:
`sha256:a32008c8fa6eaa28f8974577d28dc83e23e2d0fb939cb7b17ce65ed8a9b13f72`.

Actual default startup serves the app with database/schema/storage healthy. Forwarded-origin dev sign-in answers
200; a foreign origin answers 403. The app holds only its `app_service` runtime DSN, with no owner credential;
native PostgreSQL verifies NOSUPER/NOBYPASS. Model readiness truthfully remains unavailable without keys.
Actual authenticated reads find three completed synthetic reports, each with **119 sections and 119 nonempty saved
contents**, frozen study/source hashes and three pending reviewer tasks. This establishes saved demo content, not
scientific approval or model qualification. The complete host compiler passes **0 errors / baseline 0**, and the
changed-source warning count does not grow. These are overlapping checks, not additive totals.

**Completed execution, 2026-11-13:** the default Lumen browser walk passes **13/13** checks with no API or page
errors: the ten-person chooser defaults to Lead and works by keyboard, all three exact completed reports contain
119 nonempty sections, the synthetic-data banner and scientific-review hold remain visible, and Reviewer sees
three tasks and opens LMN-301's exact linked document. Lead and Reviewer also fit the 390-pixel viewport without horizontal
overflow. One actual working-copy PDF is 126,363 bytes, 19 pages, with DRAFT on every page; its SHA-256 is
`f4fd6889ba25dabc5c78f4d3dde6a66e936e0fbaac2856483dc618899dbf63e7`.

The actual browser suites pass all **22 access-boundary cases**, **2 authenticated/anonymous app cases**, and
**10 keyboard page cases** across their focused runs. The keyboard checker separately passes **9 qualification
controls**, including refusal of absent, transparent and zero-width focus paint. The initial combined run exposed
the former-name greeting and two keyboard-observation false positives; these counts describe the corrected runs,
not a sum of the initial and repeat runs. No product focus style, access gate or authentication helper is changed.

The first image startup finished its ordinary demo seeds but did not finish CDISC preparation: Node 22.16's fetch
did not use this managed runner's HTTPS proxy. The unchanged existing public-CDISC fetcher was therefore run with
Node 22.23.4's environment-proxy support and the runner's trusted CA. All ten existing source hashes verified;
unchanged bytes were copied to the private cache outside Git and verified again inside the image. This is a
runner adaptation, not a product or hosted Codespace network change. The subsequent regular `post-start.sh`
completes with exit 0 and **7/7 actual preparation steps**: canonical project, fictional IND identity, seven Vault
uploads, three-person review/signature/approval, New document, Build from the study's data, and eleven table
previews frozen into the document. Demo/Lumen cache and CSR-ready markers are present.

For the golden browser journeys only, that second startup supplied the existing CI launcher's
`EXPORT_REVIEW_GATE=enforce` in the process environment. This preserves the pre-review 403 assertion. Ordinary
development Codespaces permit a labelled uncontrolled DRAFT preview; production enforces the review gate. The
final regular startup must restore the ordinary default, and no product export policy is amended for a test.

This rehearsal uses the configured official-image filesystem locally; it is not a claim that this session created
a hosted GitHub Codespace. No provider key, paid model call, real client credential, agency submission, model PQ
pass or scientific approval was exercised. The attached architecture is already mapped in the current plan's
Anna epic (P-104/P-105); its remaining model qualification gates (P-118) stay pending.

The canonical `cd5f9c95a` changes are also integrated: the existing CSR browser bootstrap now repairs incomplete
Chromium installations, Lumen report selection verifies LMN-201's canonical project scope, and the AnA verifier
requires an actual completed provider receipt. The combined checkout passes **71/71** `codespaces:doctor:test`
checks, **49/49** focused demo regressions and **31/31** verifier checks. These test fixtures establish control
behavior; they do not establish live provider generation. Their original source/evidence packets are preserved at
`docs/evidence/F1/2026-11-13-codespaces-demo-recovery/` and `docs/evidence/F1/2026-11-13-openai-ana-verifier/`.
The subsequent `b0300fe5c` integration also preserves its existing document-runtime and portfolio handover repairs.
The latest combined startup suite passes **81/81**, superseding the earlier 71-case result; portfolio checks pass
**46/46**, and the changed validation harness's explicit-identity checks pass **3/3**. Independent source reviews
found no blocking interaction. These overlapping fixture sets are not added together. Actual default startup and
report-scope acceptance follow at the merged revision; no earlier runtime observation is relabelled as that check.

Both full golden journeys now pass across focused strict-policy browser runs. The governed-record journey proves
canonical project creation, source/provenance links, saved edits, stale-version refusal, a pre-review export 403,
independent reviewer assignment/decision and a review-bound DOCX still marked draft and not agency validated.
The first-session UI journey proves IND creation, source upload, assignment, the exact neutral AnA request and
same-document return, a reasoned saved revision, review to a second person with a required future deadline, and
that person's real Home task. Its actual review POST answers 200 and records the selected UTC due day on one route
task. Current toolbar/receipt selectors and the required due field replace stale test assumptions; no review gate
is weakened. The first journey passed twice unchanged; the final second-only run passes in 24.2 seconds. All
browser workers are closed. The prepared AnA send was deliberately aborted before provider transport.

## Before the room

1. **Codespaces secrets** (GitHub, Settings, Codespaces, Secrets, for this repository). Never typed into a chat.
   - `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`: without them AnA cannot write or answer.
   - Optional, for real names on the Lumen people: `C2C_FOUNDER_EMAIL`, `C2C_FOUNDER_NAME`,
     `C2C_LUMEN_REVIEWER_NAME`, `C2C_LUMEN_APPROVER_NAME`. Without them the people are Lumen Lead, Lumen Reviewer and
     Lumen Approver.
2. In the Codespace: `git pull`, then stop and start the Codespace. The demo data re-seeds itself whenever
   `scripts/demo` changed.
3. Wait for the terminal line **"Lumen account seeded"**. The Lumen account comes first; the development
   organisation's data follows and takes 7 to 8 minutes more. Start at least 15 minutes before the room.
4. Open the app, and on the sign-in page choose a person under **"Sign in as"**, then **Demo access**.

## Who to sign in as

| Person ("Sign in as") | Account | Use for |
|---|---|---|
| Lumen Lead (or the founder's name) | Lumen Bioscience (demo) | Scenes 1 to 8, 10 to 12: the whole LMN-201 story |
| Lumen Reviewer | Lumen Bioscience (demo) | Scene 9: "Waiting on you 1", the Investigator's Brochure; scene 8b: the three CSRs' evidence check |
| Lumen Approver | Lumen Bioscience (demo) | Scene 9: approval and signature; sealed the Vault |
| Cal CMC | Concept2Cure Therapeutics (demo) | Scene 13: Module 3 for C2C-201, a small molecule |
| Ana Author | Concept2Cure Therapeutics (demo) | Scene 14: NeuroPanel-Dx 510(k), a diagnostic |
| Mo Monitor, Quinn Quality, Sam Statistician, Rhea Reviewer, Ava Approver | Concept2Cure Therapeutics (demo) | The same screens from each role, if asked |

## The scenes

Scenes 1 to 12 are one project, LMN-201, in the Lumen account. Each scene names what is on screen.

| # | Where | What is on screen | Say or do |
|---|---|---|---|
| 1 | Home, then **LMN-201** | "Good morning"; four Lumen projects, LMN-201 first, and no setup list. The project: its objective from the public trial listing, AnA's box, the six steps (Plan, Evidence, Author, Review, Submit, Respond), and on the right About (IND number 194021, fictional), Filing ("Dispatch blocked · 3 blockers"), Team (three people with their open work), Work areas | One project, one goal. Everything else hangs off it |
| 2 | **Plan**, then **Tasks** | What an initial IND needs, with target Mar 10, 2027; tasks by due date. Tasks: "5 tasks stand between you and Database lock readiness checklist, and 2 tasks are overdue" | Work comes from the plan, quality records and agency letters, in one board |
| 3 | **Evidence**, then **Vault** | Data room: 45 sources. Vault: 16 uploads, "Required sections: 5 of 36 have a confirmed document", 3 governed artifacts, 1 seal "by Lumen Approver · 16 documents · SHA-256 …" with **Verify** | Give Evidence a few seconds to load. Open Required documents, then Seals & fixity and press Verify: "Intact: every sealed document is recorded with its sealed hash, and each stored file was read again and matches" |
| 4 | Author, **Write the protocol in the protocol workspace** | Protocol LMN-201-CDI-02 (synthetic): 10 sections, 5 objectives, 10 eligibility criteria, 8 assessments by 7 visits, 6 risks, amendment 2, 2 deviations with a CAPA. Statistics: "375 planned subjects · 80% power · 0.05 alpha". Compliance: 28 rules assessed, 5 unmet, 17 not assessed | Show Schedule of assessments, Statistics, then Compliance: three counts, never one score |
| 5 | **Biostatistics** | The bound study design and its statistical read | "No governed statistical documents yet" is true: none has been written |
| 6 | **Risk-based monitoring** | Overall risk High; 6 critical factors; KRIs 1 red and 2 amber of 8; 0 QTLs breached, 1 approaching; 5 open signals; "8 sites — 12 subjects scored". Site risk: site 104 at 100, Enhanced, with its two red indicators and their limits; site 106 Standard. Site oversight: each site with its open signals and scheduled visit | Overview, RACT, Key risk indicators, Patient profiles, then Site risk and Site oversight. On Central monitoring press **Run central monitoring**: two Critical signals for site 104, each with the reading and the study median (since 2026-11-11; see `docs/evidence/SPINE/S8/2026-11-11-site-risk-from-study-data/`) |
| 7 | **Quality** | 3 controlled documents, 2 in force, each "Approved by Lumen Reviewer · Meaning: Approval"; 1 change in implementation; 3 open CAPAs; 3 open deviations; 5 suppliers; 4 audits; 2 management reviews | Open SOP-201; show "Read and acknowledge" |
| 8 | **Author**, open **LMN-201 RePreve Part B Clinical Study Report — SYNTHETIC**, then "Build from the study's data" | Study data frozen: "DEMO-LMN201-PARTB-001 … SYNTHETIC, NOT CLINICAL EVIDENCE". **Build CSR draft** is ready; no build has run | The headline. Press Build CSR draft (needs the model key). The page shows the heading being written and its prose, "N of 69 headings written". Do not promise a filed CSR: see below |
| 8b | **Author** in LMN-201, LMN-801 or LMN-301 (added 2026-11-12) | Three synthetic CSRs written in full, 119 ICH E3 sections each, every number computed from the study's frozen synthetic source: LMN-301's primary result 3/20 vs 12/20, −45.0 points (95% CI −71.6 to −18.4), p = 0.0079. "Needs its scientific review first" beside Freeze | Show the synopsis, then 11.4.1 and 12.2.2. Then sign in as **Lumen Reviewer**: Tasks lists the three reviews; the evidence check maps each number to its table cell before anyone can approve. `docs/evidence/DEMO/2026-11-12-three-completed-csrs/` |
| 9 | Sign in as **Lumen Reviewer**, LMN-201, **Review** | "Waiting on you 1": 1.14.4.1 Investigator's Brochure, "Awaiting your review" | Open the document and review it. Then sign in as Lumen Approver for approval and signature |
| 10 | **Submit**, then **Submission Center** | Sequence 0000, Assembling, 5 leaves. Builder lists them. Validation: 7 errors, each naming the missing section. Dispatch: "Not yet. Three things stand between sequence 0000 and dispatch" | The platform refuses to dispatch an incomplete sequence and says exactly why. "Compile and download" builds the package as it stands (index.xml, the US regional file, a Study Tagging File per study) and lists the required sections that have no document |
| 11 | **Respond**, or **Communication** | "1 agency communication needs a response": an FDA information request (fictional demo), IND 194021, three questions. Also a fictional approval letter with its commitments | "Draft response with AnA" (needs the model key). Every letter says it is fictional and not issued by FDA |
| 12 | **Reporting & analytics** | "LMN-201 scores 0% on submission readiness, with 23 critical gaps". Run history: 4 computed reports. Schedules: 2. Bundles: "LMN-201 monthly governance pack", 4 reports | Open a run; export its PDF, or the bundle's. Numbers are computed, not estimated |
| 13 | Sign in as **Cal CMC**, project **C2C-201**, **CMC / Module 3** | "21 sections in CTD §3.2 · 0 of 21 approved · 18 ready to compile"; each section with its completeness and what is missing | Module 3 build, then Overview. The script is stop 6b of `docs/demo/biotech-walkthrough.md` |
| 14 | Sign in as **Ana Author**, project **NeuroPanel-Dx 510(k)** | A diagnostic on its own pathway: "Assemble the eSTAR"; sequence 0000 with 7 leaves; the Vault binder is eSTAR, not eCTD | One product for pharma, biotech, device and diagnostic. The script is `docs/demo/mdx-walkthrough.md` |

## What is true and should be said, not hidden

- **A model-drafted CSR can be reviewed, and cannot yet be approved, frozen or filed.** The founder approved the
  qualification protocol on 2026-11-10 (P-118), and no model is qualified under it yet, so the server refuses those
  steps (`WORKFLOW_MODEL_QUALIFICATION_REQUIRED`). Scene 8 shows the drafting and the review. It does not end in a
  filed CSR (from the CSR-path session, `01QoxbLZ…`, which is walking the build in the Lumen account).
- **Module 3 is not composed for LMN-201, or for any Lumen project.** Each is a biologic, and Module 3 is composed
  here only for a small-molecule US IND (decision P-28). The screen says so. Show Module 3 on C2C-201 (scene 13).
- **Compile says the backbone's DTD check is unverified.** The ICH and FDA DTD files are not in the package, so
  the check cannot complete. With `xmllint` installed the screen no longer also says "xmllint not available".
- **Validation shows 7 errors on sequence 0000.** That is the state of an IND whose Module 1 forms and Module 3 are
  not placed yet, and it is the point of scene 10.
- **Site risk is scored by a stated rule that clinical operations has not confirmed.** A study's sites are scored
  from its own site-level indicator readings: red counts 100, amber 50, green 0, averaged over the site's
  indicators. The rule is written under the table. (Until 2026-11-11 these two tabs read "0 sites".)
- **Of LMN-201's three governed artifacts, one is approved, one is in review and one is a draft.** A placed
  artifact needs two independent reviewers (decision P-95), and the Lumen account has one besides its author and
  approver, so the placed one stays in review.
- **The data room lists quality training records first** ("Training assignment: 4 …"). Use its search, or open the
  Vault for the documents.
- **A Codespace that pulled and restarted on 2026-11-10 between 06:45 and 07:15 UTC** has a second protocol on
  LMN-201 titled "SET ASIDE, do not use". It carried another demo study's eligibility criteria because of a seed
  defect, now fixed (`34ecd2981`), and the product cannot remove it. The workspace opens the correct protocol first.
  A Codespace that did not restart in that half hour has one protocol.

## With and without a model key

| | With `ANTHROPIC_API_KEY` | Without |
|---|---|---|
| AnA's box, suggestion buttons, "Draft with AnA" | Not exercised on this stack | "No AI provider is configured for this deployment, so AnA cannot answer" (read on the 2026-11-09 tour) |
| Scene 8, Build CSR draft | Walked by the CSR-path session (`01QoxbLZ…`) in the Lumen account with a stand-in provider, not a real key: "complete · 100%", 69 headings drafted, then review by the approver, import and assembly (`docs/evidence/DEMO/2026-11-10-showcase-walk/`). Not yet run with a real key | Not pressed on this stack; the earlier walks stopped at "no model key" |
| Shadow review (Submission Center) | Not exercised on this stack | A failed run is listed, with "no AI provider is configured" |
| Everything else in the 14 scenes | Same | Works: it is recorded data and deterministic engines |

**From the CSR-path session (`01QoxbLZ…`), not seen by this one:** on the kit's first study data the LMN-201 build
ended "failed · 98%", because §12.5 is written over a vital-signs table that data did not have. The seed now freezes
a second version of the synthetic study data with exposure, laboratory shifts, vital signs and concomitant
medications (`b0fce0ab9`), and with it that session's build read "complete · 100%", with review, import and assembly
working as the lead and the approver. Its walk is `docs/evidence/DEMO/2026-11-10-showcase-walk/` and its presenter's
script is `docs/demo/lumen-showcase.md` (both on trunk, `ee1eb0c0fd`). That script is the script for scene 8, step
by step; where it and this note differ on the CSR, it is the one to follow.

**Not verified here, and worth five minutes before the room:** scene 8 with the real key, in the Codespace. If a
build stops part-way, "Resume build N" continues it. The synthetic LMN-201 study data now carries a table for every
results heading from §10.1 to §12.5 (`server/services/csr/__tests__/lmn201-showcase-source.test.ts`; answered by the
CSR-path session, which ran the build). It holds no subject-level dates, so "Build narratives" composes none and
says why.

## How this was checked

- **Three sweeps of the Lumen account** (lead, reviewer, approver): home, the project's six steps, every rail
  destination and every tab, and the protocol workspace. 70 stops as the lead and 76 as each of the others. No page
  error. The only failed requests were the two Module 3 refusals for a biologic.
- **A content read** of each stop as the lead, of the reviewer's and approver's home, Review step, Tasks and
  Quality, of C2C-101 and C2C-201 as the development organisation's people, and of NeuroPanel-Dx.
- **The seed from zero, as a fresh Codespace runs it:** a new database, provisioned, the three Lumen people created
  by `seed-admin.mjs`, the reviewer designated QMS approver by the Codespace's own function, then `--pack lumen` at
  trunk `52d1c629c`. Run 1: exit 0, "created 419, found 2", about seven minutes. Run 2: "created 0, found 328". On
  that database: one protocol with its own 10 criteria, Compile "completed", a document's PDF and Word working
  copies and the bundle PDF all delivered.
- **The exports with the production image's tools hidden** (a PATH without LibreOffice, `xmllint`, poppler and
  pandoc), which is how the PDF refusal and "xmllint not available" were found.

### Found and fixed during this pass (commits on `concept2cure-v2`)

| Found | Fix |
|---|---|
| The protocol workspace was empty for LMN-201 | `lumen-protocol.mjs`, through the biotech pack's `ensureProtocol` (`7d9112e60`) |
| Submission Center's Builder said "No leaves in sequence 0000 yet" | The approved Vault documents are placed as 5 leaves (`7d9112e60`) |
| The Team card listed the lead alone: "16 open items assigned to someone not on this list" | Each Lumen project is shared with the reviewer and the approver (`80f5b7c41`) |
| Home opened on "Set up your organisation · Record your company details · To do" | The Lumen account's company details are recorded, fictional, through Administration's own route, and only in the Lumen account (`aaa8595e9`) |
| Reporting's Schedules and Bundles were empty | A bundle of the four runs and two in-platform schedules (`80f5b7c41`) |
| Every report and bundle PDF export answered 503, "Reporting PDF fonts are unavailable on this deployment" | The Codespace installs the Noto fonts the PDF writer embeds, on every start (`4a473cffe`). After it, both exports answer with a PDF |
| A document's "Download, PDF" answered 503, "The formatted PDF could not be completed", and Compile said "xmllint not available" (found by running the app with the production image's tools hidden, as a Codespace is) | The Codespace also installs LibreOffice and `xmllint` (`01a5f04db`) |
| "Compile and download" on LMN-201 failed on the demo data: no IND number, sponsor, D-U-N-S or FDA contact, and three study files in no Study Tagging File | The fictional applicant identity and the study tagging are seeded through Submission Center's own routes (`52d1c629c`). Compile now completes |
| **The Lumen protocol's Eligibility tab listed the psoriasis study's criteria** | A defect in `7d9112e60`, found by reading the screen. Fixed, with a repair for a copy already seeded (`34ecd2981`) |

### Open, for whoever continues

- **The Codespace's document tools are installed by its start script, and that install has not run in a real
  Codespace yet.** Fonts, LibreOffice and `xmllint` (`4a473cffe`, `01a5f04db`): the first start after the pull is
  slower by a download of some hundreds of megabytes, after the Lumen account is seeded. Before the room, press
  "Download, PDF" on a document and export a report PDF once. Not installed, on purpose: Ghostscript, veraPDF and
  `ocrmypdf` (PDF/A is not required in development). Not checked: python-docx and lxml, which AnA's Word tools use.
- **The data room lists quality training records first** ("Training assignment: 4 …"). Use its search, or open the
  Vault for the documents.
- **A Codespace that pulled and restarted on 2026-11-10 between 06:45 and 07:15 UTC** has a second protocol on
  LMN-201 titled "SET ASIDE, do not use". It carried another demo study's eligibility criteria because of a seed
  defect, now fixed (`34ecd2981`), and the product cannot remove it. The workspace opens the correct protocol first.
  A Codespace that did not restart in that half hour has one protocol.

## With and without a model key

| | With `ANTHROPIC_API_KEY` | Without |
|---|---|---|
| AnA's box, suggestion buttons, "Draft with AnA" | Not exercised on this stack | "No AI provider is configured for this deployment, so AnA cannot answer" (read on the 2026-11-09 tour) |
| Scene 8, Build CSR draft | Walked by the CSR-path session (`01QoxbLZ…`) in the Lumen account with a stand-in provider, not a real key: "complete · 100%", 69 headings drafted, then review by the approver, import and assembly (`docs/evidence/DEMO/2026-11-10-showcase-walk/`). Not yet run with a real key | Not pressed on this stack; the earlier walks stopped at "no model key" |
| Shadow review (Submission Center) | Not exercised on this stack | A failed run is listed, with "no AI provider is configured" |
| Everything else in the 14 scenes | Same | Works: it is recorded data and deterministic engines |

**Not verified here, and worth five minutes before the room:** scene 8 with the real key, in the Codespace. If a
build stops part-way, "Resume build N" continues it. The synthetic LMN-201 study data now carries a table for every
results heading from §10.1 to §12.5 (`server/services/csr/__tests__/lmn201-showcase-source.test.ts`; answered by the
CSR-path session, which ran the build). It holds no subject-level dates, so "Build narratives" composes none and
says why.

## How this was checked

- **Three sweeps of the Lumen account** (lead, reviewer, approver): home, the project's six steps, every rail
  destination and every tab, and the protocol workspace. 70 stops as the lead and 76 as each of the others. No page
  error. The only failed requests were the two Module 3 refusals for a biologic.
- **A content read** of each stop as the lead, of the reviewer's and approver's home, Review step, Tasks and
  Quality, of C2C-101 and C2C-201 as the development organisation's people, and of NeuroPanel-Dx.
- **The seed, run twice** in the Lumen account: the second run "created 0, found 324".

### Found and fixed during this pass (commits on `concept2cure-v2`)

| Found | Fix |
|---|---|
| The protocol workspace was empty for LMN-201 | `lumen-protocol.mjs`, through the biotech pack's `ensureProtocol` (`7d9112e60`) |
| Submission Center's Builder said "No leaves in sequence 0000 yet" | The approved Vault documents are placed as 5 leaves (`7d9112e60`) |
| The Team card listed the lead alone: "16 open items assigned to someone not on this list" | Each Lumen project is shared with the reviewer and the approver (`80f5b7c41`) |
| Reporting's Schedules and Bundles were empty | A bundle of the four runs and two in-platform schedules (`80f5b7c41`) |
| Every report and bundle PDF export answered 503, "Reporting PDF fonts are unavailable on this deployment" | The Codespace installs the Noto fonts the PDF writer embeds, on every start (`4a473cffe`). After it, both exports answer with a PDF |
| A document's "Download, PDF" answered 503, "The formatted PDF could not be completed", and Compile said "xmllint not available" (found by running the app with the production image's tools hidden, as a Codespace is) | The Codespace also installs LibreOffice and `xmllint` (`01a5f04db`) |
| "Compile and download" on LMN-201 failed on the demo data: no IND number, sponsor, D-U-N-S or FDA contact, and three study files in no Study Tagging File | The fictional applicant identity and the study tagging are seeded through Submission Center's own routes (`52d1c629c`). Compile now completes |
| **The Lumen protocol's Eligibility tab listed the psoriasis study's criteria** | A defect in `7d9112e60`, found by reading the screen. Fixed, with a repair for a copy already seeded (`34ecd2981`) |

### Open, for whoever continues

- **The Codespace lacks other system packages the production image installs** (`Dockerfile.optimized`): LibreOffice
  (DOCX to PDF), Ghostscript and veraPDF (PDF/A), `libxml2-utils` (`xmllint`, the eCTD backbone's DTD check),
  `ocrmypdf`, and python-docx with lxml (AnA's DOCX tools). The fonts were the one found failing in front of a
  person. The others were not exercised here, because this container has most of them and a Codespace does not.
  Before a showcase, press the editor's PDF export and Submit's "Compile and download" in the real Codespace.
- **The data room lists quality training records first**, each saying "The original file is unavailable, so a
  working copy cannot be created". That is the product's ordering, not the data.
- **Risk-based monitoring's sites** are scored from the study's own data since 2026-11-11. The separate Site
  Intelligence register stays unreached and outside the launch catalog; reaching or retiring it is the founder's.
- **A presenter's rehearsal of the whole platform with the launch gate on** is another session's (`01T2woo…`), under
  `docs/evidence/DEMO/2026-11-10-sales-rehearsal/`. This note is the Lumen account in the Codespace, where launch
  scope is off.

### Not done

- HawkScan could not run: no `HAWK_API_KEY` in this environment. The changes are seed scripts and this note.
- The development organisation's `--pack all` was not re-run by this session after `34ecd2981`. The one changed line there reads the
  same content object as before.
