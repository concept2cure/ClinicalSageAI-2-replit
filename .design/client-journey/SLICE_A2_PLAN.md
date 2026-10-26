<!-- Slice A.2 discovery, 2026-10-26: six read-only readers, each checked by a skeptic, then this synthesis.
     The completeness critic did not run (the session's agent limit was reached), so this plan has had no
     independent review. Line numbers are working-tree numbers from before slice A.1 was committed and will have
     moved. Re-check each cited path before building. -->

# Slice A.2: Projects, one way in and back to the right step

**Continuation review (2026-10-26, base `b3661f72d`).** Independently rechecked before implementation. The original discovery and line references below remain historical; apply these corrections:
- The cited golden journey returns through Home's project card. A2.1 also needs proof through the actual top-bar project chip, including template creation and reload.
- A2.2 reuses the canonical accepted anchor relationship. Any captured anchor/client mapping must be frozen and compared during final scope revalidation, even when program IDs stay unchanged. Keep `meta.count` as page length; expose only minimal active client options derived from accessible anchors. The existing `projects_regulatory_program_idx` suffices; no new index migration is justified.
- A2.3 must update device pathway consumers alongside the shared classifier so IDE, regional and Other rows stay visible.
- A2.4 also retires `create_project` from its command-name union and verifies an honest refusal for old directives.
- A2.6's section data for AnA does not satisfy the visible section-readiness promise in `FUNCTION_PARITY.md`. Before A2.7 deletes a screen, prove those visible functions in ModuleCompletion or a tested reachable Vault destination and reconcile the parity document. Additive enrichment alone is not a deletion authorization.
- Founder-dependent admissions and folds remain pending.

**Implementation status:** A2.1–A2.9 and A2.10a's filing-catalog fold are implemented. Incoming A2.7's alias,
parity and retirement qualification is in
`docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice-A2/A2.7/README.md` and
`A2_7_PARITY_RECONCILIATION.md`. Concurrent A2.7b adds stronger recorded-tracking
identity/unknown/label/placement safeguards; its 163-test/native/build proof
in the adjacent `A2.7b/README.md` qualifies that pre-merge snapshot. The combined tree passed 294 tests in 27 files, both native browser flows and
the production client/server/audit-verifier build. Merged proof is under
`slice-A2/A2.7b/merged/`; mandatory publication gates still apply.
A2.8 resolves `mdx` to Projects with the existing MDX filter, through the same
destination/action owner. Its red/green routing, native portfolio and scope
regression proof is in `slice-A2/A2.8/README.md`. The device-workstream shell,
target and catalogue remain for their own A2.10 parity. A2.9 retirement is
complete. A2.10a carries the filing catalog into the existing Projects wizard
and exact recorded Plan, then retires only that standalone screen/identity;
proof is in `slice-A2/A2.10a/README.md`. The other four folds remain pending
their own per-function and stored-record gates. Revised formal OQ-PROJ-12 is
unexecuted/unsigned; engineering/native evidence is supplemental.
The inventory below describes
discovery-time behavior.

**Launch row:** D2 (launch catalog). **Workstream:** the client journey under D2, IA §8 A item 2, convergence 1 of §7. INFERRED: this is W1, because D2's own evidence lives under `docs/evidence/W1/`. **Evidence folder:** `docs/evidence/D2-CLIENT-JOURNEY/<date>/slice-A2/`, beside `slice0/` and `slice1/`. **Branch:** `concept2cure-v2` only.

**State of the tree.** Read on 2026-10-26 against HEAD `7d1f7f316` plus a working tree that holds uncommitted slice A.1 edits.
- Modified by A.1: Shell.tsx, ProjectHome.tsx, registryModel.ts, routing.ts, shared/navigation/index.ts, surface-actions.ts, AnaToolExecutor.ts, DocumentWorkbench.tsx, Vault.tsx, Insights.tsx, Review.tsx, ProjectMarkets.tsx, ProjectMdxWorkflow.tsx, FilingsCatalog.tsx, project-home-data.tsx, surfaceRouting.test.ts and `db/migrations/20260810_reconcile_module_catalog.sql`.
- Untracked A.1 files: `v2/projectDoors.ts` and `__tests__/clientNamesSlice1.test.tsx`.

Line numbers below are working-tree numbers and will move. ProjectHome.tsx moved two lines while discovery was running. A.2 starts after A.1 is committed.

**What the map asks** (`INFORMATION_ARCHITECTURE.md:1281-1294`):
- **Rows:** `mission-control`, `device-workstream`, `cro-portfolio`, `filings-catalog`, `program-journey`, `dossier`, `dossier-map`, `client-portal`.
- **Work:**
  - creating a project writes the canonical store only
  - a pathway filter and a portfolio summary on Projects ("Not recorded", never 0%)
  - a sponsor key on projects and on `/api/c2c/projects`, with a sponsor filter
  - the picker carries the catalogue's "how you'll build it" copy and its AnA prompt
  - `dossier`'s callers are repointed
  - `dossier-map`'s remainder moves into `ProjectDossier.tsx`, then the route and the screen go together
  - the open step is kept in `shellProject.ts`
  - an alias carries a step and lands on Projects when no project is open
  - `mdx` → `projects`
- **Evidence:** three items, in the last section.

**What discovery found.**
- **Creating.** There is one canonical creator: `POST /api/c2c/projects`. Four live paths bypass it or promise what it does not do.
- **The step.** It is view state and dies on every remount.
- **Aliases.** No alias can carry a step.
- **The sponsor key.** It already exists as `projects.client_workspace_id`, and the list does not project it.
- **The pathway.** Two classifiers exist and they disagree.
- **The picker.** The governed facts for a "how you'll build it" line already arrive in the picker's own read, and nothing renders them.
- **Dossier map.** It shows nothing that `ModuleCompletion` lacks except section names. The section tree already belongs to the Vault.

This slice therefore completes, reaches, fixes and converges. It builds nothing new.

---

## What already exists

This section is mandatory under CLAUDE.md Rule 3. The evidence README carries it too.

### 1. Creating a project

**Canonical creator.**
- **`server/routes/c2c/projects.ts`, POST `/api/c2c/projects`** (handler from :655, header comment :630-653, mounted at `server/bootstrap/register-inline-routes.ts:849-851`).
  - It is the only `INSERT INTO regulatory_programs` in shipped code (:865).
  - Checks before the transaction:
    - `requireProjectCreationAccess` (:666)
    - `VALID_PROGRAM_TYPES` (:707; `project-intake.ts:34-52`)
    - the market offer verdict (:728-729)
    - `checkProgramQuota` (:753)
  - One transaction writes:
    - the program, with `createdVia` 'v2-new-project-wizard' (:843) and `progress_percent` 0 (:872)
    - the scaffold (`scaffold-project-documents.ts:147`, :173). A filing with no outline gets 422 `FILING_NOT_OFFERED` (:950-953).
    - the submission spine for drug types (:965-969)
    - the `projects` anchor carrying the chosen client workspace (`program-project-anchor.ts:197-203`; `requireExplicitWorkspace` :986-990)
    - the audit row `c2c.project.create` (:1028-1032)
  - A code collision is retried (:916-925).
  - It does not take a sponsor.
  - It rebuilds the 201 card from a second, verbatim copy of the list projection (:1048-1062). That copy is not shared with GET (:577-597).
- **`client/src/concept2cure/v2/surfaces/projectIntakeRequest.ts:14-52`** is the only client caller (:34).
  - It reads workspaces from `GET /api/clients?purpose=project-intake` (:19).
  - It sends `clientWorkspaceId` and the `x-client-id` header.
- **`Projects.tsx`, NewProjectWizard** (export :202, session :218, steps :194).
  - Steps: RegistryPicker (:565), the configure step with a required "Client workspace" (:583-615), the review step (:836-939).
  - `doCreate` (:378-456) re-verifies the workspace (:385-401), creates (:428), publishes the shell project (:454) and opens `project-home` (:463).
  - It opens from "New project" (:1405) and from the `window.__C2C_NEW_PROJECT` flag (:1127-1130).
  - It has no AnA action. Projects registers only `projects.open-program` (:1310), `projects.filter` (:1357) and `projects.set-view` (:1366), and refuses all three while the wizard is open (:1307-1308).
  - Its AnA context still advertises "Create a new project through the new-project wizard" (:1276) and "Cancel the wizard" (:1213-1216). No handler exists for either.

**Doors that open the wizard through the flag.**
- `Surfaces.tsx:170-173` (Home; buttons at `HomeSections.tsx:93`, :117)
- `HomeSetup.tsx:82-83`
- `Onboarding.tsx:890-894`

**Doors that land on the Projects index.**
- `programAction.ts:43-88`: label "Choose or create a project" (:46), `OPEN_PROGRAM_SURFACE` = 'projects' (:49, since `a40acd714`). The shell listens at `V2App.tsx:995-998`.
  - Callers: `CmcModule3Build.tsx:361`, `CmcQuality.tsx:246`, `CmcModule.tsx:931`, :1240, :2408, :2870, `cmcAgencyQuestions.tsx:442`, and `mdx/components/DataGate.tsx:149` (every MDX idle panel).
- `Shell.tsx:511` and `LaunchScopeGate.tsx:47`
- `MdxSurfaceHost.tsx:459`, `Vault.tsx:1620` and `CommunicationCenter.tsx:650`
- `CroPortfolio.tsx:449`, `FilingsCatalog.tsx:235` and `ProjectHome.tsx:1694`
- `HomeSections.tsx:137` and `Surfaces.tsx:282`
- `MdxCatalogSolution.tsx:35` (from `WorkflowCatalog.tsx:781`) and `quality/ControlledDocumentDialogs.tsx:94-95`
- the onboarding recommendation 'define-project' (`DiscoveryNextSteps.tsx:11`; `shared/types/onboarding-discovery.ts:227`)

**Live paths that bypass the canonical creator.**
- **The device portfolio's create buttons.** "New program" (`mdx/surfaces/Overview.tsx:150-158`) and "Create your first program" (:230-247) send AnA a sentence (:154, :243). They do not open the wizard. `device-workstream` is in launch scope (`launch-scope.ts:69`).
- **AnA's `create_project` command** (`server/services/ana-ri/command-executor.ts:298-380`; INSERT :344; registry :4844; handler :5445).
  - It is propose-only (:5692-5695) and is in the launch inventory (`ana-launch-scope.inventory.json:1030`).
  - Entry points: `routes/ana-ri/utility.ts:542`, :697; `generate-execute.ts:134`, :170; `AnaToolExecutor.ts:5718`; `ana-guidance-executor.ts:316`.
  - It writes `projects` only: no program, no scaffold, no spine, no audit row.
  - Its project appears in Tasks (`TaskBoard.tsx:480`, :1729, :1936) and in `CollabLauncher.tsx:173` through `GET /api/projects`. It does not appear on Projects or Home.
- **AnA's onboarding guidance** (`server/services/ana/client-journey.ts:142-146`, :154-158; `agentic-workflow-tools.ts:67`; `onboarding-tour.ts:124`) sends a new client to `project_setup`. That interview's commit refuses a session with no programme (`cmc/interview-commit.ts:733-741`), so it creates nothing.

**Mounted creators with no client caller.** None writes `regulatory_programs`.

| Route | Store | Where | Note |
| --- | --- | --- | --- |
| POST /api/mission-control/programs | project_memory_entries | `mission-control.ts:209-236`; `MissionControl.tsx:337-372` | Cannot mount in production (`staticDataGuard.ts:15-26`; `startup/env.ts:200`) |
| POST /api/program-journey, /:id/stages/:stageId | program_journeys | `program-journey.routes.ts:67`, :117; service :153-227 | — |
| POST /api/concept2cure/projects, /:id/duplicate | projects | `concept2cure.ts:1047-1135`, :1934-1990 | Last caller deleted in `2895218b8` |
| POST /api/device-projects | projects | `device-projects.ts:124-235` | The mount line carries no `authenticateToken` |
| POST /api/projects | projects | `projects-management.ts:153` | Also inserts an unmarked default workspace (:202-214); GET stays live for Tasks |
| POST /api/project-hierarchy/:id/children | projects | `project-hierarchy.ts:196`, :260 | The rule action `create_child_project` (`rules-engine/actions/index.ts:524-556`) was not traced |
| POST /api/ana/platform/{projects,onboard,execute} | projects | `ana-platform-controller.ts:377-430` | Owner/admin only (`ana-platform-control.ts:48-51`). INFERRED: fails at insert, because the NOT NULL `client_workspace_id` and `type` are not set |
| inline POST /api/workspace/projects | ind_projects, fda_510k_projects, cer_projects | `register-advanced-platform-routes.ts:246-318` | Writes the body's `clientId` with no org check (:285, :306); fabricates 'TBD' and 'Phase 1' (:289-290) |
| POST /api/ctd/projects | ctd_onboarding_projects | `ctd-onboarding.ts:60-66` | — |
| POST /projects (submissionCenter.routes.ts:97-107) | submission_projects | — | Unmounted on purpose: no tenant column (`register-governance-routes.ts:54-67`) |

**Writers that update `regulatory_programs` but do not create it.**
- `programme-profile-write.ts:445`
- `ind-forms/program-form-facts.ts:218-222`
- `add-project-market.ts:197`
- `pdev-clearance.ts:149` (writes status 'approved')
- `AnaToolExecutor.ts:8398`
- `projects.ts:1975`

`server/routes/regulatory-programs.ts:62-194` is GET only. Laptop seeds also insert programs (`scripts/seed-local-testing.ts:98`; `scripts/seed/ga-demo.d/*`), and they never run on deploy.

### 2. The Projects list and its summary

- **The surface.** `Projects.tsx:1122`, registered at `registryModel.ts:167` and `surfaceViews.ts:341`, :543. It is the default surface for every client type (`registryModel.ts:221`, :241, :267, :289, :333) and is in launch scope (`launch-scope.ts:53`, :68).
  - It reads one page of 50 (`useLiveRows('/api/c2c/projects')` :1139).
  - It says so: `PortfolioPagedNote` (:1049-1056) and `countFloor` (:1045).
- **The summary** (:1178-1184):
  - "Active projects"
  - "Average readiness", from `portfolioMean` (:1095-1100): measured rows only, '—' when none is measured, "N of M measured" when only some are
  - "Filing < 60 days" (:1104-1111)

  `kv()` shows '—' while loading or after an error (:1167). "Blocked" was removed on purpose (:1169-1173).
- **Filters.**
  - Workstream tabs all / MDX / Biotech / Pharma (:1188), filtered on the client (:1155).
  - Status (:1187).
  - Search over title and code (:1146-1160).

  All three run over the page held. The list view's Blocker column is always '—' (:1531-1553).
- **One readiness vocabulary.** `dossierReadiness.ts:17-38` gives 'NN%', 'not measured' or 'unavailable', never 0 for a missing figure. It never says "Not recorded".
- **`GET /api/c2c/projects`** (`projects.ts:561-634`).
  - Params: `limit`, `offset`, `includeArchived` (:565-570).
  - Rows are bound to the access scope in SQL (:573, :593).
  - Fields (:577-597): id, title, ws, code, stage, status, lead, blocker NULL, due, due_date, activity, plus readiness from `homeFigures` → `readDossierFigures` (:343-358; `dossier-read.ts:185`).
  - meta (:613-616); 42P01 returns an empty `pendingStore` (:619-624).
  - Not projected: `program_type`, `product_type`, `regulatory_path`, `client_workspace_id`. There is no server-side filter and no total.
  - `ws` = `workstreamSqlCase` (:443; `shared/constants/domain/product-types.ts:275-283`, :318-336).
  - Other callers a shape change touches: `Surfaces.tsx:71`, `SubmissionCenter.tsx:538`, `AgencyMeetings.tsx:139`, `CompanyProgramPicker.tsx:11`, `quality/ControlledDocumentDialogs.tsx:49`.
- **`projects.filter`** (`shared/navigation/surface-actions.ts:129-150`). It takes workstream and status. Its status enum offers blocked and complete, not approved or archived.
- **Access scope.** `getCurrentAccessibleProgramScope` (`current-program-access.ts:121-150`) already calls `listProgramAnchorCandidates` (`program-project-anchor.ts:313-333`), which selects `client_workspace_id` for every program. It keeps only `programIds` (:31-38). Rule stated at :119-120: bind ids in SQL before counts, ranking or paging.

### 3. Sponsor and client keys (none is on the list today)

- **`projects.client_workspace_id`** (`shared/schema.ts:5704-5706`, NOT NULL).
  - Written for every wizard project through the anchor.
  - It is the value access control uses (`organization-default-workspace.ts:31-36`).
  - Header of that file (:37-38): "A sponsor is its own client; a CRO adds its clients afterwards."
- **`client_workspaces`** (`shared/schema.ts:1157`).
  - `GET /api/clients` (`clients-routes.ts:213`) and `POST /api/clients` (:293, insert :322), mounted at `register-tenant-routes.ts:54`.
  - No client code calls POST, and no concept2cure screen lists or switches workspaces.
  - `TenantContext.tsx:49`, :99 holds `currentClientWorkspace`.
- **`regulatory_programs.applicant_sponsor_id`** (`shared/schema/programs.ts:81` → `ind_sponsors`). This is the FDA applicant of record.
  - Written by IND forms (`program-form-facts.ts:206-229`).
  - Sponsors are created in `IndApplicantIdentity.tsx:107`.
  - Composite FK in `migrations/20261021_regulatory_programs_applicant_sponsor.sql:23-40` (in the set, `migration-set.mjs:2989`).
- **`projects.sponsors` text[]** (`shared/schema.ts:5728`). The canonical path never writes it.
- **The organisation's name.** `PROGRAM_DETAIL_SQL` has `o.name AS sponsor_name` (`projects.ts:462-476`), and Project home prints it as "Sponsor" (`ProjectHome.tsx:1720`). For a CRO that names the CRO itself as every project's sponsor.
- **Others, none linked to programs:**
  - `cro_clients` (`shared/schema.ts:5254`)
  - `report_program_groups` (`shared/schema/report-os.ts:20-62`; `report-os.ts:1418-1445`; no client caller)
  - `program_journeys.sponsor`, free text
  - `identity.org_relationships`: gcc-only, UUID-keyed, no writer
  - legacy free-text columns at `shared/schema.ts:8968`, :10931, :11693, :11908, :12619
  - the company role 'sponsor' in `CompanyFilingIdentityReview.tsx:13`
- **Precedent.** `client-portal.ts:200-223` already lists projects by `client_workspace_id`.

### 4. The device portfolio (`device-workstream`)

- **The host.** `MdxSurfaceHost.tsx:410-444` renders Overview from `useMdxPrograms()` (:196). `openProgram` publishes the project and opens project home (:215-229). A device feature with no project open shows "Open projects" (:444-460).
- **Overview** (`mdx/surfaces/Overview.tsx`).
  - Health strip (`deriveLiveHealth` :30-54): Active projects, Average readiness, Blockers open, Submissions in flight. Average readiness is a plain mean and reads 0 when the list is empty (:37-39).
  - Pathway chips all / k510 / pma / cer with counts (:15, :82-103, :175-185). There is no IVDR chip, although `PATHWAY_LABEL` has ivdr (:14).
  - Status chips.
  - Cards print "{readiness}% ready" (:273) and "No open blockers" (:303, :364).
  - `ClientReviewZone` (:392).
  - `localStorage` is read and written with no try/catch (:58-72).
- **`useMdxPrograms.ts:224`** reads `GET /api/regulatory-programs`.
  - `deriveKitPathway` (:61-73) uses `shared/constants/mdx.ts:24-52`.
  - A row with no pathway is dropped (:161-162): ide, device, hde, mdl, ivd_licence, shonin, ninsho, todokede, ivd_approval, jp_cdx.
  - `readiness = row.progressPercent ?? 0` (:186). The only writer of `progress_percent` is the create's 0, so every device project reads a measured-looking 0%.
- **`listPrograms`** (`regulatory-programs.service.ts:219-237`) has no access scope, no deleted or archived filter and no paging. It returns `progressPercent ?? 0` (:271).
- **The Client Review Room** (`mdx-client-review.ts:95`; `shared/client-visibility.ts:27`, :43). Nothing writes `unified_tasks.client_visibility`: the only hits are the column add (`20260727_unified_tasks_mdx_metadata.sql:47`), the schema (`shared/schema.ts:7619`) and this read.

### 5. Other portfolio lists and summaries

- **Reporting's org rollup.** `GET /api/report-os/portfolio/org` (`report-os.ts:1295`) → `fetchOrgPortfolioSummary` (`report-os/portfolio/fetch.ts:195-239`).
  - Access-scoped, capped at 100, with a null-safe mean (`aggregate.ts:33-36`).
  - It feeds Insights (`insights-canvas-routes.ts:18-20`, :73-78).
  - Not reused for Projects' summary, for three reasons:
    1. It scores with report-os readiness (`computeInitialRun`), not the dossier figure.
    2. It is enterprise-gated (:1301, 'portfolio.board_pack').
    3. It keys on PM-spine `projects.id`.
- **`mdx-analytics.ts:67-98`**: a GROUP BY `regulatory_path` precedent. No access scope, no caller.
- **`ind-lifecycle/submission.routes.ts:69`** and **`biopharma/programs.ts:102`**: no client caller (the latter's own header says so at :56-57).
- **`CroPortfolio.tsx:83`** reads `/api/cro-portfolio` (`cro-portfolio.routes.ts:35` → `cro-portfolio-view-assembler.ts:163-250`).
  - KPI strip (:199-204), action `select-sponsor` (:166-185), "Onboard sponsor" → `POST /api/cro/clients` (:131).
  - `CRO_TYPE` labels device and diagnostic sponsors as Biotech (:28-32).
  - "Open project portfolio" lands on all of Projects (:440-454), with a comment that no sponsor filter exists.
- **`MissionControl.tsx:50`** measures five readiness dimensions and names four as not measured (`mission-control.ts:1124-1136`).

### 6. The filing picker and the filings catalogue

- **RegistryPicker** (`AnaVerbs.tsx:100-375`). Its only production importer is `Projects.tsx:41`/:565.
  - Market offers: `useFilingOffers` (:52-85).
  - Cards (:220-236). The description appears only as a hover title (:222).
  - Tiers (:326-345).
  - The chosen-filing note (:311-323) shows the offer label and reason, with an "unclaimed" variant at :316-323.
  - Not-offered matches with the server's reason (:357-366).
  - Search (:160-163) does not match the description.
- **`RegistryBridge.tsx:77-150`, :194-206.** It drops category descriptions. Its comment still names `EditorAnaCopilot.tsx`, which was deleted in `2895218b8`.
- **Shared catalogue.** `shared/regulatory/filing-catalog.ts:234-271`, :310-330, :381-439.
  - Descriptions come from `global-document-registry.ts` (e.g. US_IND :83). Some carry figures: NDA 10/6 mo, 510(k) 90-day, PMA 180-day, IND 30 days.
  - Category descriptions are in `filing-taxonomy.ts:72-115`.
- **Market support.** `market-support.ts:96-159`, :206-234, served by `GET /api/submissions/market-support` (`submissions.ts:418-447`).
  - The route already returns `outline` {state, pack {version, label}, detail}, `module1` and `channel` (:104-108).
  - `MarketSupportView` (`MarketSupportLine.tsx:19-28`) does not declare them, and nothing renders them.
  - `MarketSupportLine` appears on wizard step 1 (`Projects.tsx:584`).
- **Other wizard pieces.** `ProjectDiscoveryHandoff.tsx:61`, :89 fills blank fields from onboarding answers.
- **FilingsCatalog** (`FilingsCatalog.tsx:34-322`).
  - What it has: description as text (:89, :253, :295), a lifecycle section (:98-113), "How you'll build it" (:115-116, copy :57-59) and an Ask AnA prompt (:120).
  - The `else` branch of the copy can never run: `hasWf` is always true (:313).
  - Start (:214-230) opens a blank editor and reads no offer.
  - Fixture `fixtures/filings-catalog-data.ts:90-168`: `FILING_WF_SURFACE`, `FILING_WF_LABEL`, `FILING_LOOP_ARCHETYPE` (no 'samd') and `FILING_LOOP` with hand-authored clocks.
  - `launch-scope-fixture-allowlist.json:22-26` calls these tables "derived". They are hand-authored.
  - The surface is out of launch scope (`launch-scope.ts:55-60`) and in `NAV_HIDDEN` (`registryModel.ts:183`).
- **`regulatory-registry.ts:40-168`** serves the registry and taxonomy. It has no client caller and is claimed only by filings-catalog.
- **A second, coarser list.** `NewSubmissionForm.tsx` with `SC_APPTYPES` (`fixtures/submission.ts:41-51`), nine entries.

### 7. Module completion, `dossier` and `dossier-map`

- **The canonical read on Author.** `ProjectDossier.tsx`:
  - `useProjectDossier` (:80-86)
  - `DossierReadinessCard` (:104-154), on the Author step's side column (`ProjectSide.tsx:19`; `ProjectHome.tsx:1865`)
  - `ModuleRow` and `ModuleCompletion` (:159-221), rendered at `ProjectHome.tsx:1360`. A row opens the newest document in its module (:1349-1354).
  - `dossierFacts` for AnA (:224-244)
- **`readDossier`** (`dossier-read.ts:308-329`, served by `GET /api/c2c/projects/:id/dossier`, `projects.ts:1163-1172`).
  - `DOSSIER_SECTIONS_SQL` (:157-162) already returns `section_key`, `label` and `status` for every section.
  - `DossierRow` (:67-78) carries counts and `lastUpdated` (:251, :260) but no section list.
  - `moduleRows` (:232-262) sorts by `localeCompare` (:256).
- **The section tree already belongs to the Vault.** `GET /api/c2c/project-vault/:id` (`project-vault.ts:1-42`; `Vault.tsx:708-712`, :762-765). Its header (:22-24) assigns "the tree" to this read and "the figures" to `/dossier` (commit `13337e02a`).
  - Other outline readers: `useFilingOutline.ts:235` and `mdx/hooks/useDossier.ts:130`.
- **DossierMap** (`DossierMap.tsx:83-249`).
  - Module cards, inert section chips (:223-233), a "critical path to filing" prompt (:174-176) and a client-computed `averageCompleteness` (:138-141).
  - Its route `dossier-map.routes.ts:64-133` is mounted at `register-inline-routes.ts:980-988` and has a local `getOrgId` (:42-54).
  - The assembler (`dossier-map-view-assembler.ts:109-164`) reads `project_sections`. No v2 path writes that table, so every v2 project reads empty.
  - Registry entry: `ui-surface-registry.ts:721-740`.
- **Dossier** (`Dossier.tsx:53-201`).
  - Reads `/api/dossier-readiness/:numericId`. A program UUID becomes null, so it idles (:44-51, :149-154).
  - Links to dossier-map (:193).
  - Its route `dossier-readiness.ts:66-140` (mount :279) is claimed by no registry entry, so it is "unmapped" and refused in production.
  - Registry entry `ui-surface-registry.ui-v2.ts:284-298` claims prefixes the screen never calls.
- **Callers of 'dossier'.** All are on out-of-scope surfaces: `AgencyMeetings.tsx:662`, `NdaCockpit.tsx:633`, :684, `Nonclinical.tsx:799`, `BiopharmaJourney.tsx:162`, :169. `CmcModule.tsx:490-497` intercepts its own call.
- **Residue that names dossier or dossier-map.**
  - registryModel.ts: `NAV_GROUP_OF` (:77), `NAV_HIDDEN` (:184, :189), `SURFACE_ACTIONS` (:604), `SEGMENT_MODULES` (:663, :696, :722, :748, :809).
  - `ANA_SURFACE_CTX.dossier` (`registryModel.surfaceCtx.ts:533-557`).
  - AnA navigation: `NAVIGATION_TARGETS` (`shared/navigation/index.ts:120`), `navigationTools.ts:37-44` and `docs/ana-capability-manifest.json:27852`, :27863.
  - `collab-data.ts:83`.
  - "Start Dossier Map" (`concept2cure.ts:1008-1015`; `suggestedActionsCatalog.ts:28-32`, pinned by `concept2cure-project-bootstrap.test.ts:129`).
  - Capability 'dossier-mapping' (`ana-capability-registry.ts:454-463`). The seeder never deactivates a row (:656-700), and the active row reaches AnA's context (`ana-context-router.ts:121-170`).
  - `deferred-capability-inventory.ts:31-33`.
  - Catalogue rows: `20260810_reconcile_module_catalog.sql:256-257`, :334, :356 and `20260823…:220-221`.
  - The comment at `register-document-routes.ts:243`.
  - CSS: `surface-text-ramp.css:251`, :381-382, :594, :727 and `app-v2.css:2571-2572`.
  - Validation documents: URS-004:37, OQ-004:44, :69, TM-001:100, RA-001:108, VMP-001:38, VSR-001:60, and `tests/validation/oq/submission-center/run.mjs:268-283`.
  - Tenant-resolver baseline: `scripts/ci/tenant-resolvers-baseline.json:68-69`.
- **Already done in slice 0.** `CT_LINKMAP.module` → project-home (`conversation-thread-data.ts:210-221`), pinned by `projectHomeLaunchScope.test.tsx:157`.
- **Other readiness definitions, not touched here.**
  - `check_dossier_readiness` (`command-executor.ts:1526-1583`) answers 0% when nothing is counted (:1556).
  - `nda-cockpit` modules, `ectd-compile` `/status` (`ectd-compile.ts:1391`), `getModuleProgress` and `biopharma/programs.ts:45-57`.

### 8. The open project and the open step

- **`shellProject.ts`.**
  - `ShellProject` (:41-53) has no step field, and never had one (`git log -p`).
  - It is mirrored to the per-tab sessionStorage key `c2c.shell-project` (:55).
  - `publishShellProject` replaces the whole object (:94-108, :102).
  - `projectRevision` changes only on an identity change (:95) or a clear (:124).
  - `updateShellProject` is the only merge (:143-149).
  - `restoreShellProject` reads the URL first, then the mirror (:156-180). The URL keeps `?program=` (:201-240).
  - `openProjectHome` (:114-120); `clearShellProject` (:123-128), called from `switchOrganization.ts:36` and `notificationNavigation.ts:24`.
  - Publishers: `Projects.tsx:454`, :1284; `HomeSections.tsx:128`; `MdxSurfaceHost.tsx:226`, :263; `Insights.tsx:1969`, :2054; `TaskBoard.tsx:1332`, :2120; `Review.tsx:171`; `AnaActionChips.tsx:41`; `V2App.tsx:411`; `notificationNavigation.ts:23`.
- **ProjectHome's step.** In `ProjectHome.tsx`:
  - `useState('author')` (:1459); `stageChosen` (:1463); `chooseStage` (:1464-1467).
  - The choice resets per project (:1469).
  - `workId` opens Review (:1470-1473).
  - Zero documents opens Plan (:1474-1476).
  - The code calls it "pure view state" (:1660).
  - `project-home.set-stage` (:1669-1684; `surface-actions.ts:481-498`).
  - `openStage` is published to AnA (:1597-1598, :1656).
  - The no-project state has no action (:1765-1770).
  - The surface remounts on every visit (`V2App.tsx:1124-1126`).
- **The chip.** `Shell.tsx:507-537` calls `nav('project-home')` (:527) and runs no leave guard. ⌘K "This project" opens a chosen step (:759-770).
- **Transient channels that cannot hold the step.**
  - nav params: 2-minute TTL, consumed once (`navParams.ts:43`, :115-130)
  - the pending surface action: 20 seconds (`surfaceActions.ts:222`)
  - `EditorReturnTo`: conversation only (`editorTarget.ts:186-194`, :266-271)
  - the conversation's "Back to" (`ConversationThread.tsx:2102-2118`; origin `V2App.tsx:1083`). It drops the `openStage` the origin carries.
- **Every door back lands on the default step.**
  - `Shell.tsx:527`, `Vault.tsx:1409`, `ConversationThread.tsx:1911`, :2115
  - `Etmf.tsx:463`, `Insights.tsx:1970`, `OnboardingIngest.tsx:279`, `ClientPortal.tsx:128`
  - `MdxSurfaceHost.tsx:228`, :492 ("Return to project workflow" lands on Author)
  - `Projects.tsx:463`, `openProjectHome`, `notificationNavigation.ts:34`
  - server and AnA: `notification-record-target.ts:122-123`, `legal-workflow.ts:93`, `AnaToolExecutor.ts:18545`
- **The Tasks hand-off.** `TaskBoard.tsx:2118-2125` stashes `stage`, `workSource` and `workNativeId`, and only `workId` is read (`ProjectHome.tsx:1471`).
- **Notifications cannot name a step.** `shared/types/notification-navigation.ts:21`.
- **IA §12** (`INFORMATION_ARCHITECTURE.md:1678-1683`): "Steps are not routes … launch needs only the return."

### 9. Aliases, folded ids and the lock

- **`DEEP_LINK_ALIASES`** (`registryModel.ts:949-990`) is `Record<string,string>`, one level, with no step and no fallback.
  - Readers: `routing.ts:11-17`, :27-34; `navParams.ts:57-59`; `surfaceActions.ts:66-77`; `appMentions.tsx:133`; `V2App.tsx:256`; `notificationTarget.ts:35`; `ZenRouter.tsx:183`.
  - CI parses its source text as `key: 'string'` (`check-launch-scope.mjs:116-140`; `check-ana-surface-context.mjs:230-266`, :340-352).
  - Tests: `navigationReachability.test.ts:29-72`; `surfaceRouting.test.ts:53-95` (`mdx` → `device-workstream` at :83); `tests/ui/surface-registry-coverage.test.ts:68-93`. The last forbids an alias source that is still a registry id.
- **An existing "open X, then act" shape.** `RAIL_CORE`'s `target` plus `applies` (`registryModel.ts:158-173`), honoured at `Shell.tsx:131-141`, :753-758, :865-869.
- **`NavigationTarget.scope` and `path`** (`shared/navigation/index.ts:43-72`). `scope` is read only on the server. `path` is never set and never read.
- **AnA's `navigate_to`** (`AnaToolExecutor.ts:18314-18408`).
  - Locked → `not_available` (:18336); unknown → `unknown_target` (:18344); no project → `needs_project` (:18371-18384).
  - `screenActions` is filtered by the raw target id (:18387).
- **The lock.** `LaunchScopeGate.tsx:19-53` shows "not in this release" with "Back to Projects". `applyLaunchScope` is at `navigation-entitlements.ts:194-247`.
- **Per folded id (historical discovery inventory; current A2.7/A2.10a completion is recorded above and below):**

| id | Registered | Launch scope | AnA target | Alias today | Parity (FUNCTION_PARITY.md) |
| --- | --- | --- | --- | --- | --- |
| mission-control | yes | no | `index.ts:181` | none | "To carry" (:331-346); store check first (:332) |
| device-workstream | yes | yes (`launch-scope.ts:69`) | `index.ts:194` | target of `mdx` | "Real today" functions to carry (:299-313) |
| cro-portfolio | yes | no | `index.ts:187` | none | to carry (:316-329) |
| filings-catalog | yes | no | no | none | 10 rows (:285-297) |
| program-journey | yes | no | `index.ts:238` | none (`biopharma` → projects since `a40acd714`) | 16 rows (:211-229) |
| dossier | yes | no | no | none | safe to fold (:204-210) |
| dossier-map | yes | no | `index.ts:120` | none | safe to fold (:231-236) |
| client-portal | yes | no | no | none | founder decision (:245-252) |

- **Existing fold records.** `deferred-capability-inventory.ts:12-74` (read only by its own test) and `docs/SURFACE_DECISIONS_2026-10-08.md:125-192`.
- **The Rule 1 pattern in the catalogue file.** `20260810`'s step 1 deprecates every id not on its keep-list (:216-308), and its upsert clears `deprecated` for every listed id (:400-418). Step 1b (:310-318) is the in-place, dated amendment pattern.

### 10. `client-portal`

- **The screen.** `ClientPortal.tsx:65-242` reads `GET /api/client-portal/overview`.
- **The route.** `client-portal.ts`:
  - `resolveScope` (:91-155).
  - `safeRows` returns `[]` on any error (:157-167).
  - Readiness is `progress ?? 0` (:219) and pathway is `projects.type` (:218).
  - Every query uses the shared pool.
- **The redirect.** `redirectUtils.ts:31`, :159-161 sends client roles to client-portal, pinned by `computeRedirect.test.ts:54-59`. `App.jsx:93-94` fences `/client-portal*`.
- **No production user can reach it.**
  - Client roles are not assignable (`org-roles.ts:33`). The only issuer is the dev SSO mock (`sso.ts:788-799`).
  - `client_access` (`shared/schema.ts:1205-1239`) has no writer.
  - `check-surface-discoverability.mjs:83` exempts the surface as "entered by invitation link". No invitation flow exists.

### 11. Tests and gates that pin today (each must stay green or change red-first)

- **Projects and portfolios:** `projectsHonestCounts`, `projectsPortfolioEmptyMean`, `projectsPortfolioTruncation`, `projectsCardStatusReadiness`, `projectsDirectory`, `registryPickerOffers`, `newProjectWizard*`, `croPortfolioGuards`, `croPortfolioSurfaceContext`, `insightsPortfolioTruncation`, `anaCommandPortfolioHonesty`.
- **Project home:** `projectHomeStages` (:97-170), `projectHomeNextStep` (:94-126), `projectHomeReviewWork` (:101-121), `projectHomePlan`, `projectHomeLaunchScope` (:135-160).
- **Navigation and shell:** `topBarProject` (:53-79), `cmdkPlaces` (:133-152), `anaDrivesWave5` (:229-259), `emptyState.contract` (:82, :95-102), `dataGateContract` (:54, :92), `navigationReachability`, `surfaceRouting`, `registryModel.test` (:72-98), `moduleCatalogReconciliation`, `deferred-capability-inventory.test.ts:8` (expects exactly 14 entries).
- **Server:** `projects-create-anchor.pglite.test.ts:184-191`, `projects-list.test.ts`, `projects-readiness.test.ts`, `projects-dossier.test.ts`, `dossier-read.pglite.test.ts`, `project-tools-use-the-real-projects-schema.test.ts:102-119`, `propose-only-partition.test.ts:86`.
- **E2E:** `tests/e2e/golden-customer-journey.e2e.ts:368-381`, :417-437, :466-471, :506-510. At :506-510 the test returns through Home and clicks Plan by hand, so it steps around the lost step.
- **CI:** `ci:launch-scope`, `ci:ana-surface-context`, `ci:migration-drop-safety`, `ci:migration-set-order`.

### 12. Doc drift to correct in the same changes

- The IA and FUNCTION_PARITY cite `registryModel.ts:963` (or :960) for `mdx`. It is :965 in the working tree and :960 at HEAD.
- IA line 77 says `biopharma` → `program-journey`. It is → `projects` (:980).
- IA §5.1 cites `programAction.ts:47` naming mission-control. It is 'projects' at :49.
- IA §5.8 says "nine-dimension readiness". Five dimensions are measured and four are named not measured.
- IA §12 cites `ProjectHome.tsx:1467-1470`. It is :1470-1473.
- The IA cites `Shell.tsx:486-516`. It is :507-537.
- `programme-profile-write.ts:4-11` says "two writers". Today there is one creator and six updaters.
- `organization-default-workspace.ts:14-17` says "only writer of client_workspaces". `projects-management.ts:202-214` also writes one.
- `projects.ts:555-558` says "No client reads meta". Projects does.
- `projects.ts:334-335` says `progress_percent` is "read nowhere". It is read at `regulatory-programs.service.ts:271` and `useMdxPrograms.ts:186`.
- `useFilingOutline.ts:18-23` names the deleted `authoring/hooks.ts`.
- `RegistryBridge.tsx:194-196` names the deleted `EditorAnaCopilot.tsx`.
- `AnaVerbs.tsx:382` says "7 callers". There is one.
- `CroPortfolio.tsx:95` cites `cro.ts:209`. It is :269.
- `FUNCTION_PARITY.md`: its count table says 18/13 and its sections hold 16/10. The "filing description" row cites `FilingsCatalog.tsx:138-146`, but the description renders at :89, :253 and :295.

---

## What was deleted before

- **Project creation.**
  - `programsV2.ts` was a second writer of `regulatory_programs` (`b6e991501`, 2026-04-04). `projects-create.ts` went in the same commit.
  - `workspace-projects.ts` was deleted in `3cc8547d2` (2026-06-05). Its body lives on inline at `register-advanced-platform-routes.ts:246`.
  - `510k-project.routes.ts` (`e70291f9f`).
  - `pages/NewProjectWizard.tsx` (`bb243dfad`).
  - `510k/ProjectCreationWizard.jsx` was deleted twice (`3ea8cc863`, `7a144fd1e`).
  - `CTDProjectWizard.tsx` (`8ba28dc0d`). Its server route is still mounted.
  - `NewProjectModal.tsx` (`d04381632`). Its `createProject` was client reducer state only (`ProjectContext.tsx`, deleted in `5710191b0`).
  - `NewProjectDialog.tsx` with `useProjectsMutations.ts` (`2895218b8`), the last caller of `POST /api/concept2cure/projects`. `data/regions.ts` went in the same commit; its `NPD_PREVIEWS` (:104) was an earlier per-filing "what you'll build".
  - Mission Control's `ProgramWizard.tsx` and `pages/MissionControl/*` (`77034aa5f`); `useMissionControl.ts` (`440071600`).
  - `server/routes/programs.ts` (`75147a851`).
  - `server/api/cmc/projectRoutes.ts`, the `cmc_projects` store, converged onto `/api/c2c/projects`. `portfolio.ts` went in the same commit (`e073f9a0b`).
- **Portfolios and lists.**
  - `ProjectsList*`, `ProjectsListFilters.tsx`, `ProjectsScreen.tsx` (`2895218b8`). The filters had Type, Status, Agency, Owner and Activity, and search placeholder text named a sponsor, with no stored key behind it.
  - `biopharma/surfaces/Overview.tsx`, with an average readiness line (`2895218b8`).
  - `v2/surfaces/DeviceWorkstream.tsx` (`2895218b8`).
  - `PharmaPortfolioDashboard.tsx` (`c4b7a1a31`); `cmc/PortfolioDashboard.jsx` (`7a144fd1e`); `regulatory.portfolio.router.ts` (`30cc29cfd`); `ProjectsSidebar.tsx` (`d04381632`).
- **Client workspaces.** `ClientWorkspaceSwitcher.tsx` and `ClientWorkspaceSettings.jsx` (`7a144fd1e`), the last workspace UI.
- **Dossier screens.**
  - `workflow/DossierMap.tsx`, `workspace/DossierTree.tsx` and `submission/DossierNavigator.tsx` (`e5a74a4df`).
  - `fixtures/dossier-data.ts` (`2895218b8`).
  - `dossier_routes.ts` (`8e830f6da`).
  - `DossierViewer.tsx` (`7a144fd1e`, `3ea8cc863`).
  - `MissionControl/DossierView.tsx` (`77034aa5f`).
  - `GET /:id/workstreams` (`b660daf1e`) and `GET /:id/vault-structure` (`13337e02a`).
- **Remembering where a person was.** `hooks/useSessionRestore.ts` (`e5a74a4df`). It was cross-session, used localStorage and is pre-v2. It never held a project step. No deleted file implemented a step return or a step-carrying alias.
- **Aliases.** A ZenRouter `<Redirect>` for `/concept2cure/mdx` was added in `2895218b8` and removed in `ddcb8a8de`, because nothing read `?surface=`. The lesson is pinned at `surfaceRouting.test.ts:76-80`. None of the eight ids has ever been an alias source.
- **Client portal generations.**
  - `components/client-portal/*` (`7a144fd1e`)
  - `ClientPortalV2.tsx` (`5d29680f2`)
  - `CROClientPortal.tsx` (`c4b7a1a31`)
  - ClientPortalV3 (`7e615324b`)
  - `clientPortal.js` (`1a71cd496`, `4a87d39a4`)

---

## The work, named for what it is

Every item is a completion, a reach, a fix or a convergence. No item adds a surface, a module, an AnA tool, a model, an integration or a table. The one new AnA handler is an action on the existing launch surface `projects` (A2.4), and it makes an advertised claim true.

### A2.1 Complete `shellProject.ts`'s per-tab channel with the open step, and fix ProjectHome's step to survive a remount

- **Files:** `shellProject.ts`, `surfaces/ProjectHome.tsx`.
- **What changes in `shellProject.ts`:**
  1. `ShellProject` gains an optional `step`, a `PJ_LIFECYCLE` id.
  2. `publishShellProject` keeps the live `step` when the incoming id equals the live id, and drops it when the identity changes (the `projectRevision` rule, :95). Today every publisher but `updateShellProject` replaces the object (:102), so a re-publish of the same project would lose the step.
  3. `clearShellProject` drops it.
  4. `restoreShellProject` keeps the mirror's step only when the URL's program equals the mirror's id.
- **What changes in ProjectHome:**
  1. The initial stage is the remembered step when it is valid for this program.
  2. A restored step counts as a choice (`stageChosen.current = true`), so the zero-documents effect (:1474-1476) does not move it.
  3. Every stage change writes `updateShellProject({ step })`.
  4. On a program change, the stage resets to that program's remembered step or to the default. This fixes the INFERRED stale step on a program change without a remount (:1469 resets only `stageChosen`).
  5. ProjectHome reads the existing `stage` nav param that Tasks already writes (`TaskBoard.tsx:2122`). It validates it, and falls back to Review for a bare `workId`. That makes one spelling of "the step" across both channels.
- **Precedence:** `workId`/`stage` hand-off, then a pending `project-home.set-stage` (AnA, ⌘K), then the remembered step, then zero documents → Plan, then Author.
- **What needs no edit:** the chip, Vault, the conversation's "Back to", notifications, MdxSurfaceHost and the AnA drive. Each lands on project-home, and project-home now restores the step.
- **Store/route:** none. **Rule 1:** no schema change.
- **Ghost globals:** the step rides the existing key, so `tests/ci/no-ghost-globals.contract.test.ts` gains no key.
- **Red first:**
  - New `__tests__/projectHomeStepReturn.test.tsx`. A project with 0 documents opens on Plan. "Create from template" (`IndDocumentLibrary.tsx:103-129`) opens the editor, and ProjectHome unmounts. The documents read now returns 1. The chip (`Shell.tsx:527`) remounts ProjectHome. Expect Plan. **Red today: Author.**
  - Unit cases in a `shellProject` test: same id keeps the step; a new id drops it; clear drops it; a reload restore keeps it.
  - `golden-customer-journey.e2e.ts:506-510` stops clicking Plan and asserts Plan after the chip.
- **Keeps green:** `projectHomeNextStep.test.tsx:94-126` (first-open defaults), `projectHomeStages`, `projectHomeReviewWork`, `topBarProject`, `cmdkPlaces`.

### A2.2 Converge the two list projections in `server/routes/c2c/projects.ts` onto one, and reach `client_workspace_id` as the project's client key

- **Files:** `server/routes/c2c/projects.ts`, `services/c2c/current-program-access.ts`, `surfaces/Projects.tsx`, `shared/navigation/surface-actions.ts`, `surfaces/ProjectHome.tsx`.
- **Fix first:** GET (:577-597) and the POST re-read (:1048-1062) build their rows from one projection constant. A field added to one copy cannot then miss the other.
- **Reach the key:** each list row gains `client_workspace_id` and `client_name`, joined program → anchor `projects` → `client_workspaces` inside the organisation.
- **Why this key:** it is NOT NULL on every anchor, the wizard already writes it, access control uses it, and `organization-default-workspace.ts:37-38` defines it as the client. That settles the open question at `FUNCTION_PARITY.md:317` ("cro_clients versus clients").
  - `applicant_sponsor_id` stays the applicant of record.
  - `cro_clients` stays unlinked. It is outside the catalog, and its SOW and contract fields go to the founder's list (below).
- **Route:**
  - `GET /api/c2c/projects` accepts `clientWorkspaceId`.
  - The workspace is validated as belonging to the organisation, as `report-os/ownership.ts` does.
  - The filter is bound in SQL inside `scope.programIds` before counts and paging (`current-program-access.ts:119-120`).
  - The scope read already loads `client_workspace_id` (`program-project-anchor.ts:313-333`), so it can return it rather than query again.
- **UI:**
  - A client filter on Projects, shown only when the organisation has more than one active workspace (`GET /api/clients`, an existing read).
  - `projects.filter` gains `clientWorkspaceId`.
  - `CroPortfolio`'s door (:446-454) is not changed, because `cro_clients` has no workspace link.
- **Fix:** Project home's "Sponsor" fact (`ProjectHome.tsx:1720`) prints the organisation's name. It reads the client workspace instead, through `PROGRAM_DETAIL_SQL` (`projects.ts:462-476`).
- **Label:** a naming decision for section 9 and A.1's owner, not for the founder. The wizard already says "Client workspace" and "Choose the client that owns this project" (`Projects.tsx:601-615`). One name per job argues for "Client". "Sponsor" already means the applicant of record in IND forms.
- **Rule 1:** no column, no table. If the plan needs an index on `projects.regulatory_program_id` (INFERRED, not checked), it is `CREATE INDEX IF NOT EXISTS` in a new file in `C2C_MIGRATION_FILES` inserted before the final sweep pair (`ci:migration-set-order`).
- **Red first:**
  - `projects-list.test.ts`, two workspaces and 60 programs: `?clientWorkspaceId=A` returns only A's programs, `meta.count` counts only A, and paging holds across pages. Another organisation's workspace id gets 404 or 403. **Red: the parameter is ignored and the field is absent.**
  - A projection-parity test: the 201 card's keys equal a GET row's keys, both including `client_workspace_id`. **Red: absent from both.**
  - A Project home test: a CRO organisation's project shows the client's name, not the CRO's. **Red.**

### A2.3 Complete Projects' workstream tabs with a pathway filter and server counts; fix "Not recorded"; fix the device portfolio's 0%

- **Files:** `shared/constants/domain/product-types.ts`, `shared/constants/mdx.ts`, `server/routes/c2c/projects.ts`, `surfaces/Projects.tsx`, `dossierReadiness.ts`, `shared/navigation/surface-actions.ts`, `mdx/hooks/useMdxPrograms.ts`, `mdx/surfaces/Overview.tsx`, `server/services/regulatory-programs.service.ts`.
- **Converge the classifier** onto one shared pathway map: `shared/constants/mdx.ts:24-55` plus `Overview.tsx:14`'s duplicate `PATHWAY_LABEL`, which is deleted.
  - Add a `pathwaySqlCase(program_type, regulatory_path)` beside `workstreamSqlCase` (`product-types.ts:318-336`).
  - It reads `program_type` when `regulatory_path` is NULL (cer, mdr, ivdr; `device-classification.ts:199-209`).
  - It covers ide, device and the regional docTypes. Unclassified rows go to "Other" and are never dropped.
- **Route:** each row gains `pathway`. GET accepts `ws` and `pathway`, both bound in SQL in scope before counts and paging. `meta.counts` gains `{ total, byWorkstream, byPathway, filingWithin60Days }` in SQL over the scoped set, so the chips count every page.
- **The readiness mean stays per page,** with the existing `PortfolioPagedNote`. `readDossierFigures` over a whole tenant has not been measured. Measure it before widening. Reporting's rollup is not reused, for the reasons in §5.
- **UI:**
  - Pathway chips with counts follow Overview's existing pattern (:82-103, :160-186). They are shown when MDX is chosen or the organisation has device projects.
  - Workstream filtering moves to the server, which fixes miscounts on paged tenants.
  - `projects.filter` gains `pathway`.
- **Fix the wording:** `dossierReadiness.ts:35-38` "not measured" → "Not recorded". `Projects.tsx:1097` '—' for a mean with nothing measured → "Not recorded". "unavailable" stays for a failed read, because an error is never an empty result.
- **Fix the device 0%:**
  - `useMdxPrograms.ts:186` stops reading `progress_percent` as readiness. Readiness is null.
  - Overview prints "Not recorded" and leaves null out of the mean (:37-39, :273).
  - `regulatory-programs.service.ts:271` `?? 0` → null.
  - Nothing writes `progress_percent` except the create's 0 (`projects.ts:872`).
- **Rule 1:** none.
- **Red first:**
  - `projects-list.test.ts`, 60 programs across pathways with `limit=50`: `meta.counts.byPathway` sums to 60, and `?pathway=pma` returns only PMA with the right count. A CER program buckets as CER and an IDE program as IDE. **Red.**
  - `projectsPortfolioEmptyMean.test.tsx`: nothing measured reads "Not recorded". **Red: '—'.**
  - An Overview test: a fresh device project reads "Not recorded", not 0%. **Red.**

### A2.4 Converge every create door onto the Projects wizard, and complete Projects' advertised wizard action

- **Files:** `shared/navigation/surface-actions.ts`, `surfaces/Projects.tsx`, `surfaces/Surfaces.tsx`, `HomeSetup.tsx`, `Onboarding.tsx`, `mdx/surfaces/Overview.tsx`, `server/services/ana-ri/command-executor.ts`, `command-rbac.ts`, `ana-launch-scope.inventory.json`, `server/services/ana/client-journey.ts`, `agentic-workflow-tools.ts`, `ana-ri/onboarding-tour.ts`.
- **Complete the action.** A surface action `projects.new-project` opens the wizard; its handler sits beside :1310-1366. While the wizard is open it answers "already open" and is not refused (wizard guard :1307-1308). This makes the claim at :1276 true. The untrue "Cancel the wizard" claim (:1213-1216) is removed; the person's Cancel button stays.
- **Converge the flag.** `window.__C2C_NEW_PROJECT` (`Surfaces.tsx:171`, `HomeSetup.tsx:82-83`, `Onboarding.tsx:892`, read at `Projects.tsx:1127-1130`) becomes `applySurfaceAction(projects.new-project)`. That is the existing stash-and-navigate channel (`surfaceActions.ts:517-538`), so no third channel is added. If the ghost-globals contract lists the flag, it moves to its eliminated list (INFERRED).
- **Fix the device doors.** Overview's two buttons (:154, :243) apply `projects.new-project` instead of sending AnA a sentence.
- **Converge AnA's create_project onto the wizard.** The command's insert (:298-380) is retired: registry :4844, handler :5445, RBAC `command-rbac.ts:137` and inventory :1030 all go. AnA instead uses `navigate_to projects` plus `act_on_screen projects.new-project`. The person's Create click is the confirmation the propose-only gate gave.
  - Why the wizard and not a second caller of the transaction: the canonical create needs a filing type, a market offer verdict, a verified client workspace and an outline. The wizard already collects and re-verifies those, and the e2e pins it. A second caller would need AnA to collect all of them, which is a second create UI.
  - This deletes a capability. The commit names the replacement (`Projects.tsx` `projects.new-project`, `surface-actions.ts`) and its reachability test, and runs `git log --all --diff-filter=D` on `create_project` and `createProject`.
- **Fix the guidance.** `client-journey.ts:142-146`, :154-158, `agentic-workflow-tools.ts:67` and `onboarding-tour.ts:124` point a new client at New project. `project_setup` stays for configuring an existing programme.
- **Not changed:** 'define-project' and "Choose or create a project" land on the index. That matches their words, which say choose or create.
- **Store/route:** no route change. **Rule 1:** none.
- **Red first:**
  - A door contract test listing every door in §1. Each door either reaches `projects`, or reaches `projects` and opens the wizard.
    - It pins the shell listener's destination (`V2App.tsx:996`), which no test pins today. Shown red on `a40acd714^`, where it was mission-control.
    - **Overview's buttons: red today**, because they call `onAskAna`.
  - A pglite test: the AnA governed-action path no longer writes a `projects` row with no `regulatory_programs` row. **Red today: +1 projects, +0 programs.**
  - A Projects test: `projects.new-project` opens the wizard. **Red: unknown action.**

### A2.5 Complete RegistryPicker's chosen-filing note with "how you'll build it" and the catalogue's AnA prompt

- **Files:** `surfaces/AnaVerbs.tsx`, `MarketSupportLine.tsx`, `surfaces/Projects.tsx`, `shared/regulatory/filing-catalog.ts`, `surfaces/FilingsCatalog.tsx`.
- **Reach the facts already sent.** `MarketSupportView` declares `outline`, `module1` and `channel` (`market-support.ts:104-108`). The note composes a build line from them: the pack it lays out, the Module 1 state, the transmission channel.
  - The literal at `FilingsCatalog.tsx:57-59` is not copied. It claims "validation gates" for every filing, including `author_only` and `not_offered`.
- **The description** becomes visible text in the chosen note. It is labelled as the catalogue's reference wording, because some descriptions carry authored timing figures (Rule 2: shown, never computed from).
- **The AnA prompt.** `NewProjectWizardProps` (:200) gains `onAsk`. The note gets "Ask AnA" with the catalogue's prompt (`FilingsCatalog.tsx:120`). The prompt builder moves to `filing-catalog.ts`, and FilingsCatalog imports it, so there is one copy.
- **AnA context.** The wizard publishes its step and the chosen filing (`Projects.tsx:1206-1218`).
- **Search** matches the description (`AnaVerbs.tsx:160-163`).
- **Not carried here:** the lifecycle loop (`FILING_LOOP`, hand-authored clocks). It goes to A2.10's filings-catalog fold, or to the founder's list.
- **Rule 1:** none.
- **Red first:** `registryPickerOffers.test.tsx`. Choosing US IND shows the description as text, a build line naming the outline pack label from the mocked market-support response, and an "Ask AnA" button that calls `onAsk` with the prompt. **Red: tooltip only, no button.**

### A2.6 Complete ProjectDossier with what `dossier` and `dossier-map` show that it lacks

**Completed 2026-10-26.** The read now carries counted section details in regulatory
order; Author shows read-only section status and module dates, the card shows home
review/draft totals, and the critical-path question uses the existing AnA handoff.
This corrects the original visible-chip exclusion below: a flat read-only detail
list preserves governed-section visibility without recreating Vault's editable tree.
Legacy artifact rollups, artifact counts and per-section dates still require explicit
reconciliation before A2.7 can remove a screen. No deletion is authorized by A2.6.

- **Files:** `server/services/c2c/dossier-read.ts`, `surfaces/ProjectDossier.tsx`.
- **Carry:**
  - `DossierRow` gains the counted sections, `{ key, label, status }`, from the existing `DOSSIER_SECTIONS_SQL`. No new query.
  - `dossierFacts` gives AnA each module's sections. DossierMap's context did this (:150-153).
  - `ModuleRow` renders `lastUpdated` (typed at :41).
  - `DossierReadinessCard` shows in-review and drafted totals (FUNCTION_PARITY.md:208).
  - `ModuleCompletion` gets the "What is the critical path to filing?" prompt (DossierMap :174-176).
  - Rows sort by `compareSectionCode` rather than `localeCompare` (`dossier-read.ts:256`).
- **Not carried:**
  - An editable per-section tree. The tree remains Vault's by design (`project-vault.ts:22-24`); A2.6 now carries visible status through flat read-only details on Author, correcting the discovery-time chip exclusion.
  - Fixed module titles (`MODULE_LABEL`). dossier-read labels each row from the pack's own heading on purpose (:224-231).
  - The client-computed mean (Rule 2).
  - The unanchored state.
  - The three-way tone (cosmetic).
  - The current parity rows distinguish carried governed-section functions from the legacy artifact-rollup reconciliation still required before removal.
- **Rule 1:** none. `d.org_id` (:162) and `programInOrganization` (`projects.ts:1168`) stay.
- **Red first:**
  - `projects-dossier.test.ts`: a row carries its sections with label and status. **Red.**
  - A ProjectDossier test: AnA facts list sections, `lastUpdated` renders, and the card shows in-review. **Red.**

### A2.7 Complete `DEEP_LINK_ALIASES` with a step and the no-project rule, and fold `dossier` and `dossier-map` onto Author

**Fold integrated 2026-10-26; combined regression, native and build checks pass.** The current reconciliation addendum takes precedence
over discovery assumptions below. Author now preserves all three distinct
bases: governed sections, artifact rollups/counts/section dates, and legacy
`project_sections` module completion/labels. Exact accepted access is revalidated.
The old screens and HTTP routes are folded; the existing tracking assembler is
retained internally because it owns the surviving read. Alias stage actions and
no-project destinations share the resolver, with native URL and return proof.
Both the catalog writer and its packaging writer were amended in place: keeping
obsolete packaging references would fail the fresh-database unknown-module guard.
No stored data, subscription, signature or dispatch gate was removed. Validation
docs distinguish historical results from revised URS-SUBC-009a (not formally executed).

**Completed tracking carryover (A2.7b):** reach `project_sections` from Author and AnA
through the existing map assembler and the canonical dossier's verified exact
anchor. Preserve section labels and recorded tracking states, server module
figures, the approved/signed/locked completion rule and project/organisation
isolation. Keep this source separate from governed document sections and
artifact lifecycle status. Missing stores, unknown states and unclassifiable
module data remain explicit. Existing-owner inventory and proof:
`docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice-A2/A2.7b/README.md`.
The carryover alone did not retire a screen. The incoming A2.7 fold now supplies
that coordinated retirement and its prior qualification. The integration keeps one typed
`supportingReadiness.sectionTracking` source, preserving raw records, unknown
observations, null dependent figures and unmapped rows, alongside one canonical
`artifactReadiness`. Supporting-source failures remain explicit unavailable
states with safe fixed reasons/codes; failed scope currentness refuses the whole
response. Both pre-merge snapshots remain historical. The combined tree passed
294 tests across 27 files, two native flows and the production build; proof is in
`A2.7b/merged/`. Mandatory publication gates still apply. A2.8, A2.9 and A2.10a's filing-catalog completion are recorded below; the other four A2.10 folds remain pending.

**The alias, reaching existing pieces.**
- `DEEP_LINK_ALIASES` stays `Record<string,string>`. The two CI parsers and six readers depend on that.
- Beside it in `registryModel.ts`, a table `ALIAS_APPLIES` uses the existing `RAIL_CORE` `applies` type (:158-168). It is the same shape, applied to aliases. No existing place can carry this.
- One resolver in `routing.ts`, `destinationFor(id, projectOpen)`:
  - It applies the alias.
  - It attaches `applies`.
  - When the target is project-scoped (`NavigationTarget.scope`, `shared/navigation/index.ts`) and no project is open, it returns `OPEN_PROGRAM_SURFACE`.
- `nav()` (`V2App.tsx:337-342`) and the URL load (:310) use it. With `applies`, they call `applySurfaceAction` (stash and navigate). An aliased URL that redirects is replaced with the canonical address.
- `features` → `apps` keeps its address (no `applies`).
- **Fix:** ProjectHome's no-project state (:1765-1770) gets the `openProgramAction` door.

**The fold, in one change.** The alias gates force this: an alias source must not be a registry id, and no surface may publish context under one.
- **Aliases:** `dossier` → `project-home` and `dossier-map` → `project-home`, each applying `project-home.set-stage {stage: 'author'}`.
- **Callers:** the out-of-scope callers reach Author through the alias without edits (`AgencyMeetings.tsx:662`, `NdaCockpit.tsx:633`, :684, `Nonclinical.tsx:799`, `BiopharmaJourney.tsx:162`, :169). CmcModule's intercept stays.
- **Delete the screens and routes:**
  - `DossierMap.tsx` and `Dossier.tsx`
  - `surfaceViews.ts:312-313`, :466-467
  - both registry entries
  - `dossier-map.routes.ts` with its mount (`register-inline-routes.ts:980-988`), the assembler and its tests
  - `dossier-readiness.ts` with its mount (:279). `marketing-application.journey.test.ts:160-369` is rewritten against `GET /:id/dossier`.
- **Delete the residue listed in §7:**
  - `NAV_HIDDEN`, `NAV_GROUP_OF`, `SEGMENT_MODULES`, `SURFACE_ACTIONS.dossier` and `ANA_SURFACE_CTX.dossier`
  - `collab-data.ts:83`
  - the navigation target `dossier-map`, with the `navigationTools.ts:37-44` examples changed and the manifest regenerated
  - "Start Dossier Map", with its test
  - the deferred-inventory entry; its test changes from 14 to 13
  - CSS orphans, the comment at `register-document-routes.ts:243`, and the baseline entries `tenant-resolvers-baseline.json:68-69`
- **The capability row.** The seeder writes `is_active = false` for `dossier-mapping`. A code deletion alone leaves the row live.
- **Validation package:** a documented change to URS-004, OQ-004, TM-001, RA-001, VMP-001 and VSR-001, with the OQ step at `run.mjs:268-283` replaced.
- **What stays:** `project_sections` and the laptop seed `105-dossier-map.mjs`. Other readers use the table.
- **Rule 1 (catalogue):** amend `db/migrations/20260810_reconcile_module_catalog.sql` in place. Remove both ids from the keep-list (:256-257) and from VALUES (:334, :356), with a dated header note naming this change.
  - This waits for A.1's uncommitted amendment of the same file to be committed, and adds its own note.
  - Never an appended UPDATE, which 20260810's upsert would revert on every deploy. Never a DELETE, because `organization_modules` cascades.
  - The `20260823` tier rows are inert once deprecated (:325-336).
- **Deletion rule:** the commit names the replacement, `ModuleCompletion` (`ProjectDossier.tsx:187-221`, rendered at `ProjectHome.tsx:1360`), and its reachability test (`projectHomeLaunchScope.test.tsx:135-160`), and cites the history: `e5a74a4df`, `bb243dfad`, `77034aa5f`, `2895218b8`. FUNCTION_PARITY rows :204-210 and :231-236 are ticked in the same change.
- **Red first:**
  - Routing tests: `/concept2cure/dossier-map` with no project → Projects. **Red: the dossier-map screen.**
  - With a project of 0 documents → project home on Author. **Red.**
  - `nav('dossier')` → Author. **Red.**

### A2.8 Converge `mdx` onto Projects, filtered to device projects

Implemented 2026-10-26. Existing-owner inventory and limits:
`A2_8_MDX_PROJECT_DESTINATION.md`. Proof:
`docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice-A2/A2.8/README.md`.
Copied links and imperative navigation apply the existing filter once, with or
without a selected project, preserving later filter choices and project steps.
Concurrent A2.8 implementation `1f6a8bf7c` is reconciled onto the same owners;
398 tests in 30 suites, both complementary native flows and the production build
pass on the combined tree. Proof: `slice-A2/A2.8/merged/`; earlier snapshots stay
separately attributed. Projects retains its existing view-local filter lifetime.

- **Files:** `registryModel.ts` (:965), `ALIAS_APPLIES`, `shared/navigation/index.ts:90`, `surfaceRouting.test.ts:83`.
- **The change:** `mdx` → `projects`, applying `projects.filter {workstream: 'MDX'}`. This is the IA row's "Projects, filtered by pathway". `mdx` is an alias-only id, so no registry row moves.
- **What stays:** `device-workstream`'s shell, target and catalogue row stay until A2.10.
- **Depends on:** A2.3 and A2.7.
- **Red first:** `surfaceRouting.test.ts:83` expects `projects` with the MDX filter. **Red: device-workstream.**

### What already exists (independent A2.8 pre-merge inventory, 2026-10-26)

Checked from `01dbd4eb`; historical discovery wording follows. The parallel
continuation inventory is in `A2_8_MDX_PROJECT_DESTINATION.md`; both extend the
same owners. Current qualification is recorded in the A2.8 evidence README.

- `client/src/concept2cure/v2/registryModel.ts` owns string `DEEP_LINK_ALIASES`
  and typed `ALIAS_APPLIES`. `mdx` currently aliases the retained
  `device-workstream`; it has no standalone registry/view row. Existing dossier
  aliases already request destination actions through this mechanism.
- `client/src/concept2cure/v2/routing.ts` `destinationFor` resolves alias, target
  scope and action. `V2App.tsx` applies that action through the validated bus for
  copied URLs and imperative navigation, then writes one canonical URL. The
  URL effect preserves existing query/hash and does not replay an alias after
  canonicalization.
- `client/src/concept2cure/v2/surfaces/Projects.tsx` owns `projects.filter` and
  the MDX workstream selection. `ProjectPortfolioFilters.tsx` renders it.
  `useLiveRows`/the canonical `/api/c2c/projects` read filter before paging;
  no device portfolio reader or second classifier is needed. Existing filters
  are view-local, not persisted by the current Projects canonical URL.
- `shared/navigation/index.ts` retains the global `mdx` navigation target for
  AnA/old handles; its description still claims a module home and must describe
  the real filtered Projects destination. No new target or commercial grant.
- `surfaces/ProjectMdxWorkflow.tsx` and `ProjectHome.tsx` already reach the
  selected device project's recorded pathway work. `device-workstream`'s
  shell, target, catalogue and feature ids remain until their A2.10 parity work.
- `surfaceRouting.test.ts`, `projectDestination.test.ts`,
  `projectDestinationShell.test.tsx`, `navigationReachability.test.ts`,
  `projectsClientFilter.test.tsx` and `projectsPortfolioTruncation.test.tsx`
  cover routing, the real shell/action bus and existing scoped filters.
  `tests/e2e/projects-client-filter.e2e.ts` supplies the native project-creation
  and filtered portfolio pattern. Old expectations still pin MDX to the kit.
- Deleted-history search: `git log --all --diff-filter=D` over
  `client/**/*Mdx*`, `client/**/*MDX*`, `client/**/*mdx*` returned no deletion
  commits under those narrow path patterns. The broader name/path searches in
  `A2_8_MDX_PROJECT_DESTINATION.md` found earlier kit/template/sample removals
  (`2895218b8`, `0fc2fc294`, `806733231`, `7855b5115`). The kit owner remains.

Reach `mdx` through the existing alias/action pair as Projects plus
`projects.filter {workstream:'MDX'}`. Prove copied links with/without project,
query/hash preservation, imperative navigation, one-shot action behavior and
real filtered portfolio/open-project reachability. Preserve existing Projects
filter lifetime rather than introduce another persistence store or router.

### A2.9 Retire the uncalled creators, and fix the unchecked workspace write by deleting it

Implemented 2026-10-26: 12 enumerated POSTs and three dead AnA controller methods
retired; 50 retained HTTP registrations and 11 retained method bodies remain
byte-identical. Canonical wizard/intake, data and the two explicitly deferred
internal PM writers remain. The source guard runs in CI and normal pre-push,
with red-first actual-source and planted-writer proofs. Qualification: 523
tests in 33 suites, 24 native PostgreSQL audit/role checks, both real Create/refusal
browser flows and production build. Existing-owner inventory and limits:
`A2_9_PROJECT_CREATION_RETIREMENT.md`; evidence:
`docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice-A2/A2.9/README.md`.
After A2.10a's filing-catalog completion, continue the other four A2.10
per-function/store checks, without automatic shell or stored-record removal.

- **Delete these handlers, not their routers:**
  - `concept2cure.ts:1047-1135`, :1934-1990
  - `device-projects.ts:124-235`
  - `projects-management.ts:153` POST; GET stays for Tasks
  - `project-hierarchy.ts:196` POST
  - `register-advanced-platform-routes.ts:246-318`, which writes an unchecked `clientId` and fabricated defaults
  - `ctd-onboarding.ts:66`
  - `ana-platform-control.ts:176`, :252, :296 with `ana-platform-controller.createProject`
  - `program-journey.routes.ts:67`, :117
- **Not in this item:** the rule action `create_child_project` and `atomicQuotaService.js:133` stay until they are traced.
- **For each deletion:** the history search, the replacement named (Projects wizard → `POST /api/c2c/projects`), and the reachability test (`projects-create-anchor.pglite.test.ts:184-191` plus A2.4's door contract). Each route's tests go with it.
- **The gate:** a contract test under `tests/ci/`. The only `INSERT INTO regulatory_programs` in `server/` is in `c2c/projects.ts`, and every `INSERT INTO projects` site is on an allowlist with a reason (the anchor writer). Shown failing on today's ten sites, and on a planted insert.
- **Rule 1:** no store retires. These tables have other readers.

### What already exists (A2.9 continuation, 2026-10-26)

Checked from `1f6a8bf7`, under launch row D2. This continues the accepted
central-service direction; it does not add a project service or store.

- `client/src/concept2cure/v2/surfaces/Projects.tsx` owns the existing wizard and
  `projects.new-project` action. `server/routes/c2c/projects.ts` is the only
  shipped `regulatory_programs` insert and owns the canonical create, scaffold,
  audit and accepted client/project-anchor flow. `program-project-anchor.ts`
  owns the accompanying `projects` insert. A2.4/A2.8 native flows already reach
  the wizard and recorded device/drug project workflows.
- `concept2cure.ts` still has POST `/projects` and `/projects/:id/duplicate`,
  each inserting only a legacy project. Its GET, update, sharing, artifact and
  governed-work routes are live and retained. The old create schema also
  shapes the retained update schema, so it must not be blindly removed.
- `device-projects.ts` POST `/` inserts a legacy device project;
  `projects-management.ts` POST `/` selects/creates a default client workspace
  then calls `atomicQuotaService`; `project-hierarchy.ts` POST `/:id/children`
  inserts a child project. Their read/update/delete routes have other callers
  and remain. Existing route tests must replace old creation expectations
  with retirement/no-write checks and preserve unrelated safeguards.
- `register-advanced-platform-routes.ts` inline POST `/api/workspace/projects`
  writes IND/510(k)/CER stores, accepts a body client id without membership
  verification and invents default sponsor/phase. Its aggregate GET remains.
- `ana-platform-control.ts` POST `/projects`, `/onboard`, `/execute` reach
  `ana-platform-controller.ts.createProject`, directly or through onboarding/
  dispatch. Only that private creation chain is retired; independent settings,
  module/configuration, usage and controlled write safeguards remain.
- `ctd-onboarding.ts` POST `/projects` calls `createCTDProject` in
  `ctd-ingestion-service.ts`. `program-journey.routes.ts` POST `/` and
  `/:id/stages/:stageId` write the separate journey stores. Their GET readers
  and existing stored rows remain. Service writers must be traced for other
  callers before removing them.
- Global shipped-source SQL/ORM search found nine direct insert sites: one
  canonical program insert; five legacy project inserts to retire; and the
  canonical anchor plus `rules-engine/actions/index.ts` and
  `atomicQuotaService.js`. The latter two are explicitly retained by A2.9's
  pre-existing exception pending their own caller/functional trace. They need
  narrow, reasoned ownership entries, not an unscoped exemption.
- Existing proof includes `projects-create-anchor.pglite.test.ts`,
  `projects-create.test.ts`, `projectCreationDoors.contract.test.ts`, canonical
  client/scoped list tests, device/project-management governance tests,
  `ana-platform-control.test.ts`, journey read/service tests and the native
  creation/plan browser flows. No second creator is needed.
- Deleted-history search over all eight route/registrar paths returned no
  deletion commits. The earlier discovery additionally traces the last legacy
  concept2cure create caller to deleted commit `2895218b8`; the canonical wizard
  is its reachable replacement. All current callers will be checked again.

Retire only the listed uncalled HTTP write handlers and unreachable private
creation helpers after caller review. Preserve readers/stores and separately
retained rule/quota owners. Add a source contract that rejects unowned program/
project insert sites, missing owner reasons or extra inserts at an allowed
owner, with deliberately planted failures. Prove removed endpoints cannot write
and prove canonical creation still yields the program, anchor, scaffold and
audit with accepted scope. Route retirement does not confer support for legacy
specialist stores on the canonical wizard or retire their existing records.

### A2.10 Close the remaining folds, each gated by its parity row (A.2's closing step)

No shell is removed and no catalogue row is deprecated until `FUNCTION_PARITY.md` confirms its row (IA §5.8). When a row needs a §5.9 decision, its shell stays.

Each fold, when its row is confirmed, does the same things in one change:
1. Alias the id to its canonical through A2.7's resolver.
2. Remove its registry, view and nav rows.
3. Remove its AnA target, or keep the target as an alias.
4. Retire the catalogue identity through its existing in-place reconciliation, preserving stored rows/subscriptions; add no redundant migration when the keep-list retirement already does it.
5. Name the replacement in the commit.

Per id:
- **mission-control — pending** → `projects`. Check actual tenant records in `project_memory_entries` under category `mission_control`, plus its recorded product/modality facts and readers. A fresh local database is not evidence that no tenant holds records. Its catalogue row's prior deprecation does not complete function/store parity.
- **device-workstream — pending** → `projects` with the MDX filter. Its "Real today" functions carry first (FUNCTION_PARITY.md:299-313): the health strip's in-flight and blocker figures, the Client Review Room, and the two AnA commands' claim on the device project. The current derived in-flight count is not silently promoted to a canonical submission count; the client-review record mapping needs its own accepted project relationship. The demo stops (`demo-scripts.ts:286`, :356) and `MDX_PROJECT_FEATURE_SURFACE_IDS` (pinned by `launch-scope.test.ts:69-78`) move only with completed parity.
- **cro-portfolio — pending** → `projects` with sponsor context. Reconcile the actual `cro_clients` engagement/SOW, study and submission relationships and `POST /api/cro/clients` onboarding owner before reaching them in Projects/Admin. The existing accepted `client_workspaces` filter and `/api/clients` route alone do not carry that record model.
- **filings-catalog — complete (A2.10a)** → Projects' existing New-project wizard and the exact recorded project's Plan. All nine original authored loop tables and workflow labels move unchanged to `shared/regulatory/filing-lifecycle-reference.ts`; strict display guards remain separate from the raw reference data. The old fixture exemption is removed with the fixture; no standalone catalog screen remains.
- **program-journey — pending** → `project-home` on Plan. A2.9 retires only its alternate creation/stage writes; its actual journey/stage readers, store, nine-stage reference and recorded display fields remain. Carry and qualify them before any shell or store retirement; the filing-family guide is not a replacement for recorded journey data.

#### A2.10a — filing-catalog function parity and retirement (2026-10-26)

The thirteen audited functions now have reachable homes in the existing core
workflow. RegistryPicker carries category descriptions, description/workflow
search and cross-segment labels, visible selected filing facts and reference
workflow family, server offer/build limits and explicit failure/Retry states.
Not offered filings remain readable as nonselectable reference. The shared
Ask AnA question is preserved, and the wizard's public context carries actual
browse/selection/reference state without private configuration.

The shared owner retains all nine authored stage/clock/return tables unchanged.
The wizard and Plan label them authored filing-family guidance, not computed
deadlines or eligibility. Plan uses only the program's own exact canonical
`submission_type_id` plus matching recorded type and agency; missing, generic,
malformed, conflicting or excluded identity explicitly withholds a guide.
Existing deliverables, tasks, team, submission and correspondence work stays
with the project's canonical steps. No new store or service is introduced.

The old `filings-catalog` URL now dispatches `projects.new-project` through the
shared alias/action bus, preserving query/hash and working with or without an
open project. The old screen, fixture, registry/view/navigation and deferred
identity are removed. Existing catalogue keep-list reconciliation retires
historical rows without deleting them or their subscriptions; replay proof
preserves metadata. No redundant SQL retirement is needed.

Evidence: `A2_10_FILING_CATALOG_PARITY.md` and
`docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice-A2/A2.10a/README.md`.
Red/green engineering, native browser, regression and build qualification are
recorded there; mandatory publication gates still apply. URS-PROJ-007a and
revised OQ-PROJ-12 v0.10 remain unexecuted/unsigned; historical catalog-render
OQ passes are not transferred to the revised workflow. A2.10 is still open for
mission-control, CRO, device-workstream and program-journey.

---

## Admission and founder decisions

- **Decision 2: external sponsor users (`client-portal`, IA :1491).** Out of this slice. A.2 does not touch `ClientPortal.tsx` or `client-portal.ts`.
  - Slice 0 was to repoint the client-user redirect. That is not in code: `redirectUtils.ts:31` still names client-portal.
  - No production path issues `client_user` or `client_admin` (`org-roles.ts:33`; only `sso.ts:788-799` in dev) or writes `client_access`. So no production user meets the lock today.
  - If decision 2 admits external users, the brief needs:
    - server-side pinning on the request-scoped client, not the shared pool
    - no fail-open `safeRows` (:157-167)
    - readiness from the dossier figure, not `projects.progress`
    - a share-to-client act at Review
    - an invitation flow and a `client_access` writer
    - a corrected `check-surface-discoverability.mjs:83` premise
- **Proposed for the founder's list (§5.9).** Each is a function a folded item shows that its canonical cannot carry as it is. A.2 decides none. Each shell stays until it is decided.
  1. The CRO engagement record: SOW status, contract dates, studies and submissions per sponsor (`cro_*`). It has no home on `client_workspaces`.
  2. The device strip's "Submissions in flight" and "Blockers open". Projects has no recorded source for them: the list returns blocker NULL, and Projects removed "Blocked" on purpose (:1169-1173).
  3. program-journey's review clock, predicted HAQs, contradiction card and day-74 RTF risk. They are stored display columns, not engine output (Rule 2).
  4. FilingsCatalog's lifecycle clocks. They are hand-authored figures.
  5. The Client Review Room. Nothing writes `client_visibility`.
  6. Whether mission-control's readiness engine should score `regulatory_programs`.
- **Not founder decisions:**
  - The client-key label (section 9 naming, A.1's owner).
  - `dmf` belonging to no workspace list. The wizard review shows Biotech while the list shows "Dmf" (`product-types.ts:275-283`; `Projects.tsx:889`). This is a catalogue fix for a later slice.
  - The third readiness definition, `check_dossier_readiness`. It is named in the README as not converged.
- **No widening.** No boundary, catalog or composition scope changes. No new table, so the `organization_id INTEGER NOT NULL` rule is not triggered.

---

## Order of implementation

| # | Sub-slice | Depends on | Closes |
| --- | --- | --- | --- |
| 1 | A2.1 Step kept with the open project | none (client only) | Evidence 1 |
| 2 | A2.2 One projection, then the client key and filter | none | Map work: sponsor key and filter |
| 3 | A2.3 Pathway filter, counts, "Not recorded", device 0% | 2 (shared projection) | Map work: pathway filter and summary |
| 4 | A2.4 Every create door → the wizard; AnA create converged | none | Evidence 2 (doors) |
| 5 | A2.5 The picker's build line and AnA prompt | none | Map work: picker copy |
| 6 | A2.6 ProjectDossier carries the dossier remainder | none | Prerequisite of 7 |
| 7 | A2.7 Step alias and no-project rule; fold dossier and dossier-map | 1, 6; A.1's 20260810 commit | Evidence 3 |
| 8 | A2.8 `mdx` → Projects (MDX) | 3, 7 | Map work: `mdx` |
| 9 | A2.9 Uncalled creators retired, plus the creator gate | 4 | Evidence 2 (store) |
| 10 | A2.10a filing catalog complete; four remaining folds on their own parity/store rows | 2, 3, 5, 7 | Only the filing-catalog row is closed by A2.10a |

Each of 1–6 verifies independently and lands as its own commit on `concept2cure-v2`.

---

## Evidence

The README in `docs/evidence/D2-CLIENT-JOURNEY/<date>/slice-A2/` opens with **"What already exists"** (the section above) and the searches that were run. For each item it records the red run on the pre-change commit and the green run after, with commit hashes and command output.

1. **"A person who starts a document from Plan comes back to Plan by the chip (red today: Author)."**
   - Proof: `__tests__/projectHomeStepReturn.test.tsx` (A2.1), and `golden-customer-journey.e2e.ts:506-510` changed to assert Plan after the chip instead of clicking it.
   - **Red:** on the commit before A2.1, both show Author.
   - **Green:** after A2.1.
   - `projectHomeNextStep.test.tsx` stays green, showing first-open defaults are unchanged.
2. **"'Choose or create a project' from every former door writes one row in `regulatory_programs`."**
   - Proof, three parts:
     - A2.4's door contract test, with every door listed and each reaching Projects or the wizard.
     - The existing `projects-create-anchor.pglite.test.ts:184-191`: one wizard create gives +1 `regulatory_programs`, +1 anchor and +1 audit row.
     - A2.9's creator gate.
   - **Red:**
     - the listener destination on `a40acd714^` (mission-control)
     - Overview's buttons today (`onAskAna`)
     - AnA's governed `create_project` today (+1 `projects`, +0 programs)
     - the creator gate today (ten insert sites) and on a planted insert
   - **Green:** after A2.4 and A2.9.
   - An e2e step added to `golden-customer-journey.e2e.ts` drives the device portfolio's "New project" through the wizard and asserts the `GET /api/c2c/projects` count rises by one.
3. **"A folded alias with no project open lands on Projects."**
   - Proof: A2.7's routing tests, and a `launch-walk-no-lock.e2e.ts` step that opens `/concept2cure/dossier-map` with no project (expects the Projects heading) and with a project (expects Author).
   - **Red:** before A2.7. In production the lock panel shows "Dossier map: not in this release"; in dev the dossier-map screen renders.
   - **Green:** after A2.7.
   - `navigationReachability`, `surface-registry-coverage`, `ci:ana-surface-context` and `ci:launch-scope` are shown green on the same commit.

Every gate added in this slice is shown failing on the case it exists to catch before it is reported as working.
