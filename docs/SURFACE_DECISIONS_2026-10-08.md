# Surface decisions — what is real, where it lives, what waits

**Status: decided, 2026-10-08.** The founder delegated these decisions on 2026-10-07:

> "What isn't, we should scrap or just note that it's coming later. What's real, we should probably consolidate into, you know, far fewer apps … personally, I just think they should be part of natural workflow for clients. Features. But I need you to make these decisions."

They were made by the chief product officer under that delegation (session `…01T2wooCZu46W7msw4TJuuzr`).

This record supersedes `docs/SURFACE_CONSOLIDATION_2026-08.md`, which proposed clusters and was never decided. Where a later document or a session's rule disagrees with this record, this record wins until the founder says otherwise.

It does not change the launch definition. The seven launch apps of row D2 stay: Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS controlled documents, and Reporting & analytics. What changes is which screens make up each app, and where those screens sit in the client's work.

## How each screen was judged

Every one of the 123 routable surfaces was assessed on 2026-10-07 at `19fdc82c4`. One agent read the screen and its backend: routes, mounts, tables, whether the tables are on the deploy path, fixtures and tests. A second agent then tried to overturn that verdict. Where the two disagreed, a third read the code and decided. The skeptic agreed with 118 of the 123 verdicts.

The full assessment of every surface, with file and line evidence, is in `docs/evidence/D2-ONE-ANA/2026-10-08/0-inventory/`.

| Verdict | Meaning | All 123 | The 41 a client could reach |
|---|---|---|---|
| real-complete | does its job end to end on real data | 8 | 8 |
| real-partial | real data and real writes, with named gaps | 82 | 25 |
| duplicate | another surface does the same job | 15 | 3 |
| ui-only | renders, but nothing behind it does the job | 11 | 2 |
| static-explainer | reference text, no work | 5 | 2 |
| fixture-demo | shows only seeded demo data | 2 | 1 |

## The decision in one paragraph

A client's work starts with a project, as the founder put it on 2026-09-26: *"all starts with a project as the beginning of a client's work process, and from there into Vault, data room and beyond."* So the product has a few places, not an app per capability.

- **AnA**: one conversation, with the document it is building on the right. Its design is `docs/design/ONE_ANA_ONE_CANVAS.md`.
- **Projects**: the portfolio, and each project's workspace.
- **Documents**: the Vault, with the editor opening on any document.
- **Submissions**: Submission Center, with compile, validation and transmit inside it.
- **Quality**: controlled documents and change control.
- **Records & reports**: the audit trail, compliance reports and reporting.
- **My work**: tasks.

Settings live in the account menu. Everything else either works as a feature of one of these places, comes later in a named place, or is scrapped because another surface already does the same job.

Each surface carries one of four decisions:

- **place**: it is one of the places above.
- **feature**: it lives inside a place, and its own entry goes once the place carries it.
- **later**: locked as "not in this release". It returns as a feature of the named place, and its code stays behind the launch-scope flag.
- **scrap**: another surface already delivers the same outcome. The code is removed only by a later change that names that surface and the test that proves it can be reached, as the working agreement requires.

## What changed on 2026-10-08

Commit 1 of the lane narrows `shared/constants/launch-scope.ts` from 41 reachable surfaces to 30.

Eleven screens leave the launch scope:

- from Projects: `program-journey`, `filings-catalog`;
- from Authoring: `regulatory-workspace`, `template-library`;
- from Submission Center: `ectd-coauthor`, `dossier-map`, `ectd-publishing`;
- from QMS: `qmp`;
- from the shell: `ana-command`, `ana-memory`, `training`.

None of the eleven does what its place promises for a real organisation; the table below gives the reason for each. The rail already hides any locked surface (`Shell.tsx`, `railVisible`), and the API refuses its routes in production. No launch screen's API call is refused as a result: `ci:launch-scope-api` read 269 paths from launch and shell screens and refused none. Project home no longer offers the locked tools:

- its module chips open the program's documents instead of the dossier map;
- its lifecycle tools are filtered by the same verdict as its Workspace grid;
- a stage with nothing in this release says so.

Nothing is deleted, and no migration or catalog row changes.

## Build order

The lane's claim is in `docs/work-orders/README.md` §0. Each step is one commit, and each is shown failing first.

1. Launch scope keeps only what is real (above).
2. Remove the false all-clears on launch screens:
   - Projects shows "No open blockers" on every card, because the server returns no blocker column;
   - the Blocked, Complete and "Filing < 60 days" counts can never be non-zero;
   - Artifacts Center shows "E-signed" for a signature on an earlier version.
3. Authoring can send a document to Review. Nothing in the UI calls request-review today, so the Review board is empty for every new organisation.
4. One AnA. The right rail goes, and every "Ask AnA" lands in the one conversation with the screen's context.
5. The canvas becomes the conversation's right-hand column:
   - it opens while AnA builds;
   - it lists the documents built;
   - it downloads a working copy marked "DRAFT — uncontrolled copy";
   - the controlled export stays sealed-only.
6. The rail becomes the places above. The client-type defaults land on Projects: four of the five client types open on a "Not in this release" screen today.

## Every surface

### The screens a client could reach before this decision

| Surface | Assessed | Decision | Where it lives | Now | Why |
|---|---|---|---|---|---|
| `conversation-thread` | real-partial | **place** | AnA | live | The one AnA conversation. Becomes the home of AnA, with the document canvas on its right. |
| `home` | shell | **place** | AnA | live | Landing; its composer starts the same conversation. |
| `projects` | real-partial | **place** | Projects | live | The portfolio. Fix its false "No open blockers" and dead filters. |
| `project-home` | real-partial | **place** | Projects | live | The program workspace and the hub of the workflow: sources, documents, review, submission, tasks. |
| `tasks` | real-complete | **place** | My work | live | Real-complete org-wide board with e-signature steps. |
| `vault` | real-complete | **place** | Documents | live | Real-complete governed library: upload, version, compare, review, e-sign, fixity, place into a sequence. |
| `protocol-dev` | real-partial | **place** | Documents → Protocol (founder decision 2026-09-21) | live | Real protocol workspace. Add a picker: only the newest protocol opens today. |
| `submission-center` | real-partial | **place** | Submissions | live | The hub: submissions, sequences, placement, validation, freeze, dispatch with e-signature. |
| `quality` | real-partial | **place** | Quality | live | Real controlled-document register and change control with e-signatures. Put it on the rail. |
| `audit-trail` | real-complete | **place** | Records & reports | live | Real-complete chained ledger with verdict and signed export. |
| `document-authoring` | real-complete | **feature** | Documents (the editor opened from any document) and the AnA canvas | live | Real-complete editor. Not a separate app: it is what opens when a document is opened. |
| `review` | real-partial | **feature** | Documents → Send for review; reviewer inbox in My work | live | Real board, but nothing in the UI puts a document into review. Build the entry path first. |
| `artifacts-center` | real-partial | **feature** | AnA canvas document list | live | A third document store. Its list of AnA drafts moves into the canvas list; locked when that ships. Its stale e-signed shield is fixed now. |
| `ectd-compile` | real-partial | **feature** | Submissions → Compile | live | Real compile; reached from the sequence. Its own nav entry goes. |
| `gateway-transmittals` | real-partial | **feature** | Submissions → Transmit | live | Real transmit log and ACKs; reached from the sequence. |
| `dispatch-readiness` | duplicate | **feature** | Submissions → Validation | live | Duplicate of Submission Center Validation and Dispatch (same route, same findings). Its nav entry goes; the module stays. |
| `compliance-reports` | real-complete | **feature** | Records & reports | live | Real-complete sealed auditor reports. |
| `insights` | real-partial | **feature** | Records & reports | live | Founder decision 2026-09-26. Its 26 report titles all produce one generic readiness report: cut to the reports that differ. |
| `part11-console` | real-partial | **feature** | Records & reports → Integrity | live | Chain verdicts are real; the §11.10 and SOC 2 tables are hardcoded "not assessed". |
| `admin-console` | real-partial | **feature** | Settings → Members & access | live | Real invites and key revocation; several buttons only type a sentence to AnA. |
| `setup` | real-partial | **feature** | Settings → Organization | live | Real; the Translation card saves a setting nothing reads (remove). |
| `apps` | real-complete | **feature** | Settings → Apps | live | Real-complete; the customer toggle writes no audit row (fix). |
| `access-requests` | real-complete | **feature** | Settings → Members & access | live | Real-complete. |
| `licensing` | real-partial | **feature** | Settings → Plan & billing | live | Real Stripe checkout; Contact sales only sends a chat prompt. |
| `billing` | real-partial | **feature** | Settings → Plan & billing | live | One component with usage; the credit ledger is spent by nothing. |
| `usage` | real-partial | **feature** | Settings → Plan & billing | live | Same component as billing; one menu entry. |
| `identity-console` | real-partial | **feature** | Settings → Security (platform operator) | live | Operator tool; SSO cannot be configured by a client. |
| `master-licensing` | real-complete | **feature** | Platform operator menu | live | Real-complete operator tooling. |
| `onboarding` | real-partial | **feature** | First run | live | Real; paid checkout needs Stripe configured. |
| `onboarding-ingest` | real-partial | **feature** | First run → Fill from a document | live | Real extraction; 7 of 10 fields have no write path. |
| `ana-command` | real-partial | **scrap** | Project home (next actions), Submission Center (go/no-go), Reporting (portfolio) | lock | Enterprise-only; two of its three "Run now" templates say they are recorded to the audit trail and are not; its go/no-go judges every program as an NDA. |
| `filings-catalog` | static-explainer | **scrap** | Projects → New project wizard (RegistryPicker, Projects.tsx) | lock | Static explainer; its Start button drops the choice. The wizard already persists the filing type. |
| `task-board` | duplicate | **scrap** | tasks (deep-link alias kept) | live | Alias of tasks. |
| `regulatory-workspace` | duplicate | **scrap** | document-authoring | lock | Duplicate: a fixed paragraph where the editor should be; its "Open in editor" sends a chat message. |
| `ectd-coauthor` | real-partial | **scrap** | Submission Center Builder (filing copies) + document-authoring (editing) | lock | A second editor over a second store. Its Validate and Compliance tabs report a fixed failure unrelated to the text. |
| `dossier-map` | ui-only | **scrap** | Project home → Dossier readiness | lock | UI-only: reads a store v2 programs never write, so it is always empty. |
| `ectd-publishing` | static-explainer | **scrap** | Submissions → reference help | lock | Static explainer that publishes nothing; it lists a DTD qualification the product has not shown. |
| `ana-memory` | real-partial | **later** | AnA, reading the memory AnA actually loads | lock | Shows a store nothing writes, not the project memory AnA loads each turn, so it tells a client AnA remembers nothing. |
| `program-journey` | fixture-demo | **later** | Project home (stage map from the program record) | lock | Fixture-demo: empty for every real program; appears only after the demo seed. |
| `template-library` | real-partial | **later** | Settings → House style, when export applies a template | lock | A saved template formats no document; Adjust and Apply only send a chat prompt. |
| `qmp` | real-partial | **later** | Quality | lock | Plans have no substance: gates and CTQ factors cannot be authored, and nothing reads them. |
| `training` | ui-only | **later** | Quality → read-and-understood training | lock | UI-only: no paths, lessons or certifications exist; its one button sends a chat prompt. |

### The 81 screens already locked in production

**Coming later**, as a feature of the named place (code stays behind the flag):

| Family (where it returns) | Surfaces |
|---|---|
| Device filings (Projects + Submissions + Quality) | `device-510k` (real-partial), `device-pma` (real-partial), `device-presub` (real-partial), `design-controls` (real-partial), `human-factors` (real-partial), `risk` (real-partial), `device-software` (real-partial), `device-udi` (real-partial), `labeling` (real-partial), `device-postmarket` (real-partial), `device-clinical-studies` (real-partial), `device-cer` (real-partial), `device-diagnostics` (real-partial), `ivd-completeness` (real-partial), `device-engineering` (real-partial), `device-validation` (real-partial) |
| IND / NDA / MAA filing kits (Submissions) | `ind-checklist` (real-partial), `nda-cockpit` (real-partial), `maa-cockpit` (real-partial) |
| Drug development workstreams (Project home) | `pdev` (real-partial), `pdev-clinical` (real-partial), `pdev-cmc` (real-partial), `pdev-nonclinical` (real-partial), `pdev-regulatory` (real-partial), `pdev-ind-assembly` (real-partial), `pdev-fda-interactions` (real-partial), `cmc` (real-partial), `nonclinical` (real-partial), `lifecycle-mgmt` (real-partial) |
| Agency correspondence (Project home) | `agency-meetings` (real-partial), `communication-center` (ui-only), `haq-manager` (ui-only) |
| Labeling and registrations (Documents) | `labeling-pi` (real-partial), `labeling-smpc` (real-partial), `registrations` (real-partial) |
| Safety (post-market) | `pv-cockpit` (real-partial), `safety-narrative` (real-partial) |
| Clinical operations | `clinical-ops` (real-partial), `rbm` (real-partial), `etmf` (real-partial), `cro-portfolio` (real-partial), `research-admin` (real-partial), `biostat-workbench` (real-partial) |
| AnA research tools (in the conversation, not screens) | `deep-research` (real-partial), `precedent-intelligence` (real-partial), `global-ri` (real-partial), `reg-change` (real-partial), `inconsistency` (real-partial) |
| Other markets and programs | `client-portal` (real-partial), `market-access` (real-partial), `pediatric` (ui-only), `orphan` (ui-only), `filing-strategy` (ui-only), `change-assessment` (fixture-demo) |

**Scrap as a place**: the named surface already delivers the outcome. The code goes in a later change that names that surface, as the working agreement requires.

| Surface | Assessed | Its outcome is delivered by |
|---|---|---|
| `evidence-search` | duplicate | AnA (conversation) |
| `intelligence-catalog` | static-explainer | AnA help |
| `shadow-review` | duplicate | Submission Center → shadow-review workspace |
| `authoring-engine` | static-explainer | document-authoring |
| `device-analytics` | duplicate | insights |
| `device-tasks` | duplicate | tasks |
| `device-submission` | duplicate | submission-center / gateway-transmittals |
| `device-vault` | duplicate | vault |
| `device-workstream` | duplicate | projects |
| `pdev-contradictions` | duplicate | inconsistency |
| `report-engine` | ui-only | insights |
| `report-governance` | duplicate | insights |
| `coverage` | static-explainer | apps (and CI) |
| `mission-control` | ui-only | projects |
| `doc-journey` | duplicate | document-authoring (history) |
| `pharmacovigilance` | duplicate | pv-cockpit |
| `ind-lifecycle` | duplicate | ind-checklist (alias kept) |
| `dossier` | ui-only | project-home → Dossier readiness |
| `csr-workflow` | real-partial | document-authoring (CSR) |
| `investigator-brochure` | real-partial | document-authoring (IB) |
| `source-tracer` | real-partial | document-authoring → Sources rail |
| `decision-lineage` | real-partial | audit-trail + document history |
| `batch-draft` | real-partial | AnA drafting into document-authoring |
| `pyramid` | real-partial | tasks (workflow templates) |
| `orchestration` | real-partial | submission-center → Validation |
| `submission-twin` | real-partial | submission-center |
| `crl-library` | ui-only | AnA (evidence graph tools) |
| `biostatistics` | real-partial | biostat-workbench (server engine) |
