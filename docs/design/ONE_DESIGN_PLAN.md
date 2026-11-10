# One design, one plan — Concept2Cure is Claude for life sciences

**Decided by the founder, 2026-10-31 (P-78). Absolute.** It binds every developer, every Claude Code session, every
Codex, Copilot or Cursor agent, every subagent, workflow, cron job and automation, from any tool. Nobody builds
outside this plan, and nobody breaches it. `CLAUDE.md` RULE 5, `AGENTS.md` and the Copilot instructions point here.
`npm run ci:one-design-plan` in `.husky/pre-push` enforces it, with no bypass.

> The founder: "This platform should look like Anthropic built this. It should match how Claude is designed
> entirely, from projects to the canvas to the editor to the details. This is basically Claude for life sciences."
> And: "everyone must work from the same design and goals and never breach your plans. Never build anything outside
> of the plans and to bring the code base beneath the UI fully to life inside this new UI framework."

---

## 1. The goal

1. **It looks and works like Claude.** Concept2Cure looks and works like Claude (claude.ai): projects, the project,
   the conversation, the canvas, the editor and every detail, as if Anthropic built it for regulatory affairs in
   life sciences.
2. **The whole codebase lives in that UI.** Every capability the server, engines and data already provide is
   reachable, usable and honest in the new UI. Nothing built beside it, nothing left unreachable beneath it. A
   capability with no UI caller is reached by its package (R1) or retired by a founder decision. It is never
   duplicated.
3. **Nothing is built outside the plan.** A new screen, API mount or table exists only when this plan's ledger
   approves it. Everything else is converging, completing, reaching or repairing what exists (CLAUDE.md RULE 3 and
   RULE 4).

## 1a. What the product is: the spine (founder decision P-79, 2026-11-01)

> The founder: "The system should be obviously centered around document building, ECTD, filing, formatting it
> correctly, like ECTD 4.0 … with the Viva parity tools, our DMS, and Anna's ability to do all of this, just like
> Claude." "A project is where everything starts." (Full record: `docs/LAUNCH_DEFINITION_OF_DONE.md` P-79.)

**The centre of the product** is the document and its filing. A document is built, formatted correctly and filed in
eCTD (3.2.2 and 4.0). Vault is the document management system, built to compete with Veeva. AnA does the work in
conversation, as Claude does. Every package in §3 serves that path. Nothing beside it is built.

**The spine, in the order a person meets it:**

1. **The project and its goal.** Every piece of work starts in a project. The project states what it is for: the
   application and the question it must answer. An example is "show that the small molecule meets its primary
   endpoint, and file the IND".
2. **The data room.** This is the project's catalog of everything: historical records, study data, documents and
   sources. Items get in by upload, from AnA's paperclip, from Vault, and from study-conduct capture. Each item is
   immutable once captured. A change is a new version, never an overwrite. Its lineage (who, what, when, from where,
   superseding what) is kept in perpetuity.
3. **The protocol.** It holds the hypothesis, the primary, secondary and tertiary endpoints, and the estimands. The
   data room reads its items against the protocol and the goal.
4. **The evidence.** Biostatistics and the safety profile are computed by deterministic engines from the catalog's
   data, against the protocol's endpoints (RULE 2).
5. **AnA writes.** AnA is the medical and regulatory writer. It narrates the evidence into the document (a CSR,
   Module 2.5 and 2.7, an IB, a briefing book and others), citing each figure's source. A person reads what AnA
   wrote, edits it, or directs AnA to strengthen it. When the data do not support a request, **AnA pushes back**: it
   says so, says what the data do support, and cites the engine result or source behind its answer. AnA's expertise
   covers:
   - regulatory affairs and medical writing;
   - clinical science and safety, including pharmacovigilance;
   - EDC and ePRO data;
   - data management.
6. **The one editor** (RULE 4). Review, comments, versions and signatures happen here, for every document type and
   every client type.
7. **eCTD and filing.** The document is assembled, formatted, validated and dispatched in eCTD 3.2.2 and 4.0, with
   each region's Module 1.
8. **Vault, throughout.** Vault holds every document and version with its lifecycle, seals, fixity and audit
   trail.

**Featured work areas.** Two work areas are profiled beside the spine:
- **CMC.** Module 3 composition for the IND, plus a data-capture environment used during study conduct.
- **Risk-based monitoring.** It runs over the project's study data.

Biostatistics is the project's evidence, reached from the project, not from the rail.

**Clients and regions.**
- Clients: medical device and diagnostics, biotech, and big pharma. Each is a document-type catalog (RULE 4).
- Regions: the United States, Europe, Japan, Canada and Australia.
- China is not now. The NMPA code that exists stays as it is and is not extended.

### What already exists (RULE 3), by spine step

Read at HEAD on 2026-11-01. "Unverified" marks what the search found but did not run.

| Step | What exists, by path | What it does not do yet |
|---|---|---|
| 1. Project and goal | Projects and the project page: `client/src/concept2cure/v2/surfaces/Projects.tsx` and `Project*.tsx`. The project's "Start work in this project": `ProjectCoreWork.tsx`. The project-anchoring principle: `docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md` §0. A `projectGoal` pathway value (`first_ind`, `cmc`) filters templates in `server/routes/concept2cure.ts`. | The project does not hold a stated goal (the question it must answer) that the data room, the protocol and AnA read. Unverified whether New project asks for one. |
| 2. Data room | Capture, with a sha256 source record and a supersede chain: `server/services/clinical-regulatory-evidence/`. Processing status: `shared/data-room-processing-status.ts`. Retrieval: `server/services/data-room-retrieval.ts`. Data origins and attribution: `client/src/concept2cure/lineage/`. In the editor: `editor/DataRoomSourcesPanel.tsx`. Lineage routes: `server/routes/data-lineage.ts`, `decision-lineage.ts`. Design: `docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md`. Lineage plan: `LINEAGE_END_TO_END_PLAN_2026-09-25.md`. | Lineage does not hold end to end. The plan's own verified hops show the break: Vault upload drops lineage (hop A2), and extraction carries no extractor version (A3). Their LX and PF fixes are this step's work. The `.xpt`, `.sas7bdat` and Dataset-JSON readers were deferred on 2026-10-08, so EDC and ePRO data are not read as data. |
| 3. Protocol | Study design and protocol: `server/services/study-design/`, `server/services/protocol-development/`, `surfaces/ProtocolDev*.tsx`. Amendments and deviations: `server/services/protocol-amendments/`, `protocol-deviations/`. Study data in the editor: `editor/StudyDataSource.tsx`, `StudyDataBuild.tsx`, `server/services/csr/csr-study-data.ts`. | The data room does not read its items against the protocol's endpoints and the goal. |
| 4. Evidence | Biostatistics engines: `server/services/biostatistics-bridge/`, `ana-biostats/`, `biostatistics-judgment/`. Screens: `surfaces/Biostatistics.tsx`, `BiostatWorkbench.tsx`. CDISC conformance: `server/services/cdisc/`. Safety: `surfaces/SafetyNarrative.tsx`, `server/services/pharmacovigilance/`, `shared/schema/ind-safety-reports.ts`. | Endpoint results are not computed from the catalog's study data for the protocol's endpoints in one path. |
| 5. AnA writes | AnA: `server/services/ana/`. Defensibility assessment (`assess_defensibility`, in scope since 2026-10-31): `server/services/ana/ana-launch-scope.inventory.json`. Amendments in the editor: `docs/design/EDITOR_ANA_AMENDMENTS_2026-10-26.md`, `editor/DraftAlternatives.tsx`. Citations: `editor/citationNode.ts`. The CSR path: `docs/design/CSR_END_TO_END_2026-10-29.md`. | Push-back is not one stated behaviour: refusing a claim the data do not support, saying what they do support, and citing the source. |
| 6. The one editor | `client/src/concept2cure/v2/editor/DocumentCanvas.tsx`, `DocumentWorkbench.tsx`. Its design is package D4. | See D4. |
| 7. eCTD and filing | eCTD services: `server/services/ectd/`. The eCTD 4.0 (RPS) message builder, packager and validator: `server/services/ectd/ectd4/`. eCTD 4.0 routes (`/v4/validate`, `/v4/forward-compat`, controlled vocabularies): `server/routes/ectd-v4.ts`. Compile: `server/routes/ectd-compile.ts`. Regional rules: `server/services/ectd/ectd-regional-rules.ts`. Gateways: `server/services/submission-gateways/`. Screens: `surfaces/SubmissionCenter.tsx`, `EctdCompile.tsx`, `EctdFiledState.tsx`. Design: `docs/design/FILING_SPINE.md`. | Regional depth is uneven. In `ectd-regional-rules.ts`, FDA appears 48 times, PMDA 28, EMA 16, Health Canada 3 and TGA once. Unverified whether Canada's and Australia's Module 1 can be built. Transmit is wired but not proven (launch row D7). |
| 8. Vault | Services: `server/services/vault/` (66 files), `shared/schema/vault.ts`. About 40 `surfaces/Vault*.tsx` screens: versions, lifecycle, seals, fixity, relationships, review routes, annotations, the data-room filing. A Veeva Vault connector: `server/integrations/veeva-vault/`. | The 2026-07 competitive audit scored Vault 1.7/5 against Veeva's 4.9/5 (`docs/audit-2026-07/13-competitive/etmf-and-regulated-document-management-vault-dms.md`). That audit's gaps are this step's parity list. |
| CMC | Services and API: `server/services/cmc/` (60 files), `server/api/cmc/`, `shared/schema/cmc-os.ts`. Composition boundary: `server/services/cmc/composition-scope.ts` (P-28). Screens: `surfaces/CmcModule.tsx`, `CmcModule3Build.tsx`, `CmcPlaceIntoSubmission.tsx`. Professional-tier licensing: `db/migrations/20260824_cmc_professional_tier.sql`. | The study-conduct data capture is not presented as its own half of the work area. Licensing is a founder question. |
| Risk-based monitoring | Services: `server/services/rbm/`. Routes: `server/routes/mdx-rbm*.ts`. Screens: `surfaces/Rbm*.tsx`, `RbmIngest.tsx`. Decision P-76. Design: `docs/design/RBM_NAVIGATION_PROJECT_SETUP_2026-10-30.md`. | It is not on the one work-area pattern (D7). |

**S1: where the project's objective lives** (decided 2026-11-01 under P-80 and P-82, after RULE 3 found three
existing stores):

| Store | What it is | Role |
|---|---|---|
| `project_charters` and its `objectives` section in `charter_sections` (`shared/schema/project-charter.ts`, `server/routes/charters.ts`) | The program charter. Each section is versioned and content-hashed (21 CFR 11.70(b)), with its status transitions logged. | **The objective of record.** It is immutable with a whole history, as the founder asked, and it is P-82's charter. |
| `project_intelligence_profiles` (`server/services/client-intelligence-memory.ts`) | AnA's understanding of the project: strategy, indication, population, primary endpoints, decisions, open questions. Read on every turn (`server/services/lumen-context/intelligence-prefix.ts`). | **AnA's catalogue.** It gains the charter's objective in the same per-turn project block. |
| `ana_client_objectives` (`server/routes/client-intelligence.ts`) | The organisation's goals tracker. Project-admitted since `edcbf4f3da`. | Stays the company-goals tracker. |

To finish:
1. The charter route reads a project's charter, and records a new version of its objectives section, with the
   source of each objective: the protocol section, the trial registry entry or the sponsor's release.
2. The project page's "About this project" card shows the objective and its source.
3. New project asks for the objective.
4. AnA proposes the objective from the protocol and the public record, and a person confirms it. Unverified: that
   `charter_sections` is on every applier.

**Open for the founder** (P-79 does not decide these):
1. Is CMC licensed separately?
2. Does the CMC composition boundary widen beyond small-molecule Module 3 for a US IND?
3. Do the clinical-dataset readers come back for EDC and ePRO data?

## 1b. The significance of a project (founder decision P-81, 2026-11-01)

> The founder: "It's her job to bring their science to life, to reality, and to get approved and to be used. We are a
> major bridge from concept to the idea to cure."

A project is the whole regulatory life of a product, worked in one place:
- by a team;
- with AnA growing in it;
- through assembly, publishing and submission;
- with the agency's answers coming back into it.

| Part | What already exists, by path | What is to finish |
|---|---|---|
| AnA knows the project and the person | Memory: `server/services/memory/`, `memory-orchestrator.ts`, `memory-context-assembler.ts`, `memory-consolidation-job.ts`, `server/services/client-intelligence-memory.ts`. Project intelligence: `server/services/intelligence/project-intelligence-service.ts`. The user profile and interactions: `server/services/ana-context-router.ts` (`buildUserContext`, `recordUserInteraction`). Memory acceptance: `server/services/ana-ri/memory-acceptance.ts`. Memory routes: `server/routes/mdx-ana-memory.ts`. Question flows: `server/services/ana/intelligence-questions/`. | One AnA that carries each project's knowledge and the person's preferences into every turn. It asks the questions that find what is missing, and pushes back (S4). |
| The team on licensed seats | Seats: `server/services/seat-licensing.ts`, `server/services/licensing/`. Sharing: `server/routes/c2c/project-sharing.ts`, `server/services/project-sharing-access.ts`, `shared/project-sharing.ts`. Screens: `surfaces/ProjectTeamSharing.tsx`, `ProjectTeamResponsibilities.tsx`. | Seats and the team shown and used in the project page (S9, on D3's layout). |
| Tasks: what is due, and what is mine | Tasking: `server/services/tasking/`, `server/routes/c2c/tasks.ts`. Screens: `surfaces/TaskBoard.tsx`, `TaskAssignmentControls.tsx`, `v2/TaskTray.tsx`. Deadlines: `server/services/ana/deadline-radar.ts`. | Each person's due work for the project, by date, in the project and in Tasks (S9). |
| Extract commitments | The capability, registered with no handler: `server/services/ana-capability-registry.ts` (`extract-commitments`). The risk tier: `server/services/ai-governance/risk-tiers.ts`. Fulfilment: `server/services/ha-interactions/commitment-fulfilment.ts`, `server/routes/commitment-fulfil-route.ts`, `surfaces/CommitmentFulfilment.tsx`, `CommitmentRow.tsx`. AnA's commitment tools (`create_regulatory_commitment`, `review_commitment_portfolio`, `fulfill_regulatory_commitment`) are held for `lifecycle-mgmt` in `ana-launch-scope.inventory.json`. Proposing an agency letter's questions: G3. | The handler: AnA proposes, a person confirms, each commitment lands with its source, owner and due date, and shows as due work (S9). |
| The plan, its schedule and its goals | `surfaces/ProjectPlan.tsx`, `PlanAssign.tsx`. Milestones: `server/routes/protocol-milestones.ts`. Schedule of events: `server/routes/project-schedule-of-events.ts`. The milestone and progress columns of `regulatory_programs`. The objective: S1. | The project's goals and schedule, with progress against them visible on the project (S9, S1). |
| Assembly, publishing and submission | The editor's assembly: `editor/AuthoringAssemblyBuild.tsx`, `assemblyBuild*.ts`. eCTD: S5. | See S5. |
| The agency's communications come back | `surfaces/AgencyInbox.tsx`, `CommunicationCenter.tsx`, `HaqManager.tsx`, `ProjectRespond.tsx`. Correspondence: `server/routes/regulatory-correspondence.ts`, `server/services/company-documents/`. Agency responses: `server/routes/c2c/agency-responses.ts`. Design: `docs/design/CORRESPONDENCE_CONVERGENCE_2026-10-29.md`. | Each letter lands in the project. Its questions go to Respond, and its commitments go to tasks (S10, S9). |

## 1c. The project is the program (founder decision P-82, 2026-11-01)

A major filing is run as a program. The study of how a program manager does it, and of how a project becomes that
from what exists, is `docs/design/THE_PROGRAM_2026-11-01.md`. It binds with this plan. In short:
- the charter (the objective, target label, pathways, region order, agency interactions, scope, governance);
- the work breakdown (the CTD modules crossed with the functions);
- workstreams as sections of the one project;
- the integrated schedule backwards from the target date, with its critical path;
- a RACI and a content plan per leaf;
- the logs;
- the review cycle;
- a global schedule and portfolio.

It is finished from:
- the submission pyramid engine (`services/regulatory/SubmissionPyramidEngine.ts`);
- the charter (`project_charters`);
- tasking, the team, the timelines and Submission Center's leaves.

It is shown in the project's Plan step. Package S11.

Work projects (CMC, biostatistics, risk-based monitoring and others) are projects of their own under the product
program. Their deliverables are mapped to the downstream documents they feed (P-83, the study's §7a). Package S12.

## 1d. Anna runtime — extend the existing product (founder decisions P-104, 2026-11-06, and P-105, 2026-11-08)

The founder supplied **Multi-Agent Architecture Spec v0.5, 2026-11-06**, §§1–32
(`docs/design/MULTI-AGENT-ARCHITECTURE-SPEC-20261106-v0.5.pdf`, in the repository from 2026-11-08), and directed:

> "Study the attached document, align to the current roadmap, and add the attached plan to the current roadmap,
> and you own this end to end. This is your assignment to build all of this in a very sophisticated way, not by
> building new files, but extending what we already have done. Extend and bring to life. Build this out."

This is one epic across the open spine packages below. It extends the existing Anna runtime, evidence, Vault,
one editor and sequence lifecycle; it does not establish a second architecture or backlog. The current instruction
supersedes the attachment's §15 plan-only handoff. Implementation is authorized; passing each acceptance gate is
still required before its downstream phase starts. Existing packages remain open for their other work. No new
file, service, tool, screen, route, mount, table, dependency or model is approved by this decision. If a requirement
cannot be met by extending the existing objects, record that precise dependency in this epic before implementing
it. No work silently weakens isolation, signatures, launch scope, model qualification or a fail-closed gate.

**The current specification and one owner (P-105, 2026-11-08).**

- **The specification.** On 2026-11-08 the founder first supplied v0.4 (2026-11-05, §§1–15), then corrected it:
  *"there's a newer version … v0.5, from November 6 … supersedes v0.4 … this is the current plan."* The source of
  record is now in the repository: `docs/design/MULTI-AGENT-ARCHITECTURE-SPEC-20261106-v0.5.pdf` (52 pages,
  sha256 `4564aff5d1da81520ed187abf5d5f20be11f74c7d407244bba33d685229b36c4`). Its change note says §§1–15 are
  unchanged from v0.4. v0.4 is superseded and is not a second backlog.
- **The owner.** The founder: *"you own all of the attached alone."*
  - The epic has one owner: the Claude Code session `session_01KZK3jgtmQBgNepqLjXjS3k`.
  - It replaces the 2026-11-06 Anna architecture lead, and no other session takes an epic slice.
  - Other packages' holders keep their file holds for their own work (§4.6). An epic slice asks for a held file in
    `COORDINATION.md`.
- **Coverage.** The table below maps every section of v0.5 onto this epic. The owner read the whole PDF to build it,
  §§16–32 included.

| v0.5 section | Where it lives in this epic |
|---|---|
| §1 principles (provenance, deterministic/LLM split, drafter ≠ checker, stateless workers, escalation) | RULE 2; the audit below; "Where the code corrects the spec": the workers stay read-only, not writable sandboxes |
| §§2–3 data model, worker contracts, roster, orchestrator loop | Mapped onto the existing tenant keys, artifact versions, lineage and task records, and onto `sub-agent*.ts` and `agentic-workflow-tools.ts`; no duplicate Project/Atom/Task store |
| §4 document factories | Phases 2 and 8; a document type is data in the one editor (RULE 4) |
| §5 biostatistics, §6 CMC / Module 3, §7 lab/QNS and RBM | Phases 3, 4 and 5. P-101 keeps the SAP in the editor, and P-28's composition boundary holds |
| §8 canvas, audit and Part 11 | Phase 2, in the one editor |
| §9 QMS | Phase 6 |
| §10 publishing, submission and correspondence | Phase 7, on the one sequence path (P-103) |
| §11 stack and build order | The milestones below, phases 0–8. The stack is a suggestion, not an admission (RULE 6) |
| §12 topology (Vault, RIM, LIMS, tasking, communications, reporting) | The existing S6, S5, S3/S8, S9 and S10 packages and Reporting (D7): one object model, the existing one |
| §13.1 runtime components, §13.5 decision rights | The six-component audit below; P-104's decision rights |
| §§13.2–13.4 build vs leverage | Suggested vendors only: no new integration without an `approvedAdditions` entry |
| §§14.1–14.2 options A, B and C | Go/no-go below: A is the target, C the honest fallback, and B the integration surface (the D8 connector) |
| §14.3 audit, §14.4 spike | The audit below, and check 1 of the expanded spike |
| §14.5 risks and open questions | Isolation is spike check 4, and the fixture gates are the evaluation harness. **Decided by P-107 (2026-11-08):** internal first, with customer reach per capability after its phase gate and PQ; cost and latency caps per document type from measured spike runs (2× p95, stop and ask at the cap; until measured, 60 s interactive and 30 min background); internal dispositions inside the validation package by risk (GAMP 5 / CSA) |
| §15 plan-only hand-off | Superseded by P-104's build instruction |
| §16 the AnA pattern: vault cards, scoped connectors, approval cards, discretion, decision rights and audit | "Trust (§§16–19)" below |
| §17 custody with the client: tenant isolation, client-owned authority accounts, credential delegation, exact-content approval, client-visible audit, roles and offboarding, one vault for many authorities | "Account decision reconciled" below; phase 6 (support access, offboarding export) and phase 7 (authority onboarding, exact-byte approval). §17's verify-before-external-use notes on ESG, eSTAR and CDER Direct stand: no authority is enabled by a label |
| §18 why it wins | Rationale, nothing to build |
| §19 trust build implications | Spike checks 2 (custody canary), 3 (one-byte approval invalidation) and 4 (tenant-scoped audit) |
| §20 how AnA learns: typed memory, correction → rule, L1/L2/L3 escalation, alignment synthesis, trust repair | "Continuous evolution (§§20–23)" below |
| §21 rules at user, tenant and project scope: RuleRecord, precedence, the visible ledger, the digest, isolation, repair as Deviation/CAPA | "Continuous evolution" below; phase 6 |
| §22 why it wins | Rationale, nothing to build |
| §23 evolution build implications | Spike check 5; the conflict resolver, digest, correspondence-derived project rules and ledger edit/revoke follow in phase 6 |
| §24 data locality: tiers T0–T3, lanes A/B/C, the tenant policy ceiling, evaluation-gated routing | "Locality (§§24–26)" below |
| §25 why it wins | Rationale, nothing to build |
| §26 locality build implications | Spike checks 6 (tier tagging and routing) and 7 (derivative round-trip) |
| §27 three kinds of learning: client content never crosses, de-identified patterns cross through a cohort gate, craft compounds globally; the promotion pipeline and its invariant | "Learning boundaries (§§27–29)" below |
| §28 why it wins | Rationale, nothing to build |
| §29 learning build implications | Phase 6, after the spike's walls |
| §30 agency feedback: the corpus, objective vs subjective coding, the clean-file review, the three-scope loop, source discipline | "Agency feedback (§§30–32)" below; phase 7 |
| §31 why it wins | Rationale, nothing to build |
| §32 feedback build implications | Phase 7: human-confirmed coding, the clean-file review as a ready-state gate ("insufficient pattern history" when sparse), deficiency and RTF/RTA metrics |

**Account decision reconciled.** `server/services/submission-gateways/gateway-accounts.ts` implements the founder's
2026-10-01 choice of platform or client accounts, with no row defaulting to platform. The supplied §17.2 now directs
client-owned accounts only for client filings. P-104 makes that the target for this epic: no silent fallback to a
house identity. Existing accounts and historical transmissions are not migrated, rewritten or claimed compliant by
this roadmap entry. S5 must explicitly handle old selections, missing client setup and authority-specific support,
and retain historical sender identity. A record-only authority must continue to refuse transmission.

### What already exists — §14.3 audit

Read from `concept2cure-v2` on 2026-11-06. **PARTIAL** means implementation exists but the complete v0.5 acceptance
contract has not been demonstrated; it does not mean absent, production-qualified or newly built.

| Runtime component (§13.1) | Status and file evidence | Smallest completion |
|---|---|---|
| Persistent matter memory | **PARTIAL.** `server/services/memory-context-assembler.ts`, `server/services/working-memory.ts`, `server/services/ana-session-bootstrap.ts`, `server/services/client-intelligence-memory.ts` load durable user/client/project context and grounded summaries. | Extend the same records with sourced correction/rule semantics, user/tenant/project precedence, visible reasons and client-confirmed repair closure. Demonstrate next-task behavior and cross-tenant denial. |
| Controlled skill library | **PARTIAL.** `server/services/ana/skills/types.ts` has version/hash/review state; `server/services/account-skill-bundles.ts` governs tenant changes; `server/services/ana/skills/history.ts` reads audit history. | Require the effective reviewed skill/template version for governed execution; a change reruns the applicable golden fixtures and remains traceable through existing QMS controls. |
| Stateless spawner | **PARTIAL.** `server/services/ana/sub-agent.ts`, `server/services/ana/sub-agent-limits.ts`, `server/services/ana/sub-agent-result.ts`, `server/services/ana/agentic-workflow-tools.ts` implement isolated briefs, bounded read-only research/verification workers, tenant matching and inherited tool intersection. | Preserve this narrower capability boundary; add independent evidence checking and Anna disposition with an auditable basis. Do not create writable workers to imitate the specification. |
| Tool and connector layer | **PARTIAL.** `server/services/connectors/connector-registry.ts`, `server/services/security/credential-cipher.ts`, `server/services/submission-gateways/gateway-accounts.ts` provide scoped integration and encrypted capture; client FDA ESG transmit exists while other authorities are record-only. | Extend deterministic credential use with scoped, expiring/revocable grants and reference-only custody. Prove canary secrets absent from model bundles, traces and audit exports. |
| Scheduler/watchers | **PARTIAL.** `server/services/ana/submission-chat-sweep-scheduler.ts` has managed start/stop, RLS and heartbeat; `server/services/sentinel/scheduler.ts` supplies scheduled work. | Attach owner, stop condition and idempotent WorkTasks to ACK/deadline checks; clocks require confirmed source spans and surface on the existing task ledger. |
| Approval gates | **PARTIAL.** `server/services/ana/governed-tool-gate.ts` fails closed on command authorization/input; `server/services/ana/run-approval-claim.ts` atomically binds org/user/run/tool-use. `server/services/submission-gateways/governed-transmit.ts` checks staged-byte SHA-256, validation, leaf approvals and signing authority. | Complete decision-basis coverage and the combined tenant/canary/mutation fixture; approval must cover the exact final bytes, identity and action, with refusal audited. |

**Where the code corrects the spec.** §§3/14.4 describe writable task sandboxes. Existing child agents are read-only
and cannot lock, sign or transmit; preserve that stronger boundary. The parent drafts through the existing governed
writer and an independent child checks it. §§2/12 name conceptual objects: map them onto the current tenant keys,
artifact versions, lineage and task records rather than creating duplicate Project/Atom/Task stores. §§11/13 name
suggested vendors, not permission to replace current integrations. Keep the current model abstraction and the
approved-model/PQ gates (`docs/adr/0015-ana-autonomy-sub-agents-and-model-governance.md`).

**Further audit findings.** `server/services/intelligence/learning-loop-service.ts` and
`server/services/intelligence/ana-failure-learning.ts` capture corrections/outcomes. The failure-learning path could activate shared patterns
from raw correction text after a cohort count, without local abstraction or named human promotion. That is a
§27.4 violation to contain before any shared-learning claim; neither a cohort count nor model phrasing establishes
anonymization. `server/services/concept2cure/rules/ruleResolver.ts` routes document-class/persona tracks, and is not the learned
RuleRecord precedence runtime. Existing correspondence pre-submission checks can consume human-confirmed blocking
issues, but do not provide the objective/subjective coding and package-bound clean-file review of §§30–32.

**First implementation scope, acceptance pending.** Complete bounded controls in the existing files: exact
source-quotation checking for `run_agent` verification; persisted Vault sensitivity carried to the canonical model
gateway; content-free connector failures; fail-closed shared failure-learning; context-rule precedence; and
human-confirmed correspondence blockers in the current pre-submission verdict. The S4 ledger includes the existing
AI gateway/connector/classification paths; S10 includes the existing orchestration verdict paths. These are repairs
and extensions, not a declaration that the seven spike checks passed. Semantic claim verification, classification
coverage for legacy/unassessed inputs, a durable RuleRecord/hard-gate runtime, scoped credential-grant migration,
local derivative round-trip and full clean-file review remain unresolved acceptance dependencies.

**Continuation component evidence (P-104).** The existing homes now contain three verified extensions.
**F1, `852eb1287`:** `server/services/account-canon.ts` commits a canon mutation and its immutable event together;
15 component tests pass. **F1, `026c0e96f`:** `server/services/submission-gateways/gateway-accounts.ts` and `index.ts`
recheck the current organization/gateway/environment authority fingerprint after `archiveSentPackage` awaits and
immediately before transport; changed mode, sender, rotated or deleted credentials refuse without fallback.
54 tests pass. This is authority-credential freshness, separate from account-canon memory. **S4, `4852aa78b`:**
sourced mandatory `policy_bindings` are enforced through the existing skill store, governed runtime and Skills
administration/studio; 78 runtime tests and 10 UI tests pass. The project-mandatory tool envelope is specifically
`check_dossier_consistency`; no broader tool class, full RuleRecord store or complete §23 fixture is inferred.
These statuses mean **implemented component verified**, not complete v0.5 acceptance.

**Hard dependencies remain unresolved.** The `local-default` approved-model entry still pins a placeholder rather
than concrete weights, is not high-risk approved and has no passed PQ (`server/services/ai-governance/approved-models.ts`).
There is no established reversible tenant-local token-map custody or approved derivative policy for the §26
round-trip. Existing redaction does not supply that derivative contract. These limitations keep the expanded spike
**acceptance pending**; no model is enabled, provider terms verified or external retention/residency assurance made
by this update. Record actual evidence before changing those statuses.

### Continuing founder direction — concrete model pins and credential custody

The founder further directed on 2026-11-06: **“We need the ability to have pinned to qualified models, not
placeholders.”** Extend the controlled registry and existing qualification verifier with an exact provider/model
snapshot or local weights digest, intended use, executed PQ record reference and content hash. A strict pin never
silently changes model or falls back to an unqualified one. Missing, altered, wrong-scope or incomplete evidence
refuses execution. A source-code change or customer key is not a qualification pass; existing pending entries stay
pending. The existing nonstream drafting endpoint and model catalog expose this capability; unsupported streaming
must refuse before releasing any text. Runtime packaging includes only verified registry-referenced records and
canonical qualification assets, never an entire evidence directory or customer trace collection.

The founder also requested a **secure vault-type card in Client Administration** for client-owned third-party
accounts (Veeva Vault, ClinicalTrials.gov and FDA) and client-owned Claude/OpenAI/Kimi keys. Extend the existing
connector-credential store and agency-account card rather than duplicate them. Capture is write-only to the UI:
current tenant administration authority, fresh authentication, stated reason, encrypted credentials, scoped
versioned grants, expiry, rotation/revocation and an atomic audit are required. Saved secrets never return in API
metadata, AnA context, browser persistence, audit or errors. Revocation preserves a tombstone so a client-owned
credential cannot silently fall back to a platform key. Model SDKs and embeddings use fresh request-scoped tenant
credentials and retain all placement, model/PQ and approval gates. Provider availability cannot depend solely on a
platform environment key. Registry/portal accounts without a verified adapter are identified as storage-only,
never “connected” or transmission-ready. FDA ESG certificates remain in the existing authority-account card.

These instructions continue P-104 within the existing files. No new source file, screen, mount, table, dependency,
provider/model entry or fabricated qualification is approved. The ledger lists the exact additional existing
implementation and build paths. Full v0.5 acceptance remains pending until its fixture gates pass.

### Continued execution — finish the remaining controls (P-104)

The founder reaffirmed the end-to-end assignment after publication of `9c7a618981c53b79e8fd66ba51970d91f65c326a`:
all completed work belongs on the canonical branch, and implementation must continue. The prior release is
verified in canonical history. Missing real model qualification does not prevent finishing deterministic code,
tenant-bound qualification plumbing, governed evidence, source-bound correspondence review or custody controls.

**What already exists.** `server/services/security/field-encryption.ts` supplies encryption primitives;
`server/services/observability/redaction.ts` supplies irreversible telemetry redaction; existing tenant storage
supplies organization-scoped immutable bytes; `org-placement-writer.ts` and `routes/ai-placement-policy.ts` own the
placement setting and its governed transaction; `tenant-settings-writer.ts` owns generic settings isolation.
Extend these with a separate typed derivative contract, never treating ordinary redaction or a public label as an
attestation. Existing `AdminSettings.tsx`, the nonstream drafting endpoint and `AnaDocumentDraftingService.ts`
reach the workflow. No new source file, table, route mount, model entry or dependency is approved.

**Active slices.** F1 repairs bind every PQ phase to its verified tenant/programme, invalidate verification when
material evidence changes, and join exact letter spans/current human review to blocker open/resolve/reopen. S4
implements explicit-span/minimal-template derivatives, tenant-key/AAD encrypted map custody in existing storage,
managed settings metadata, fresh human reauthentication over the exact residual payload hash, policy/source/actor
rechecks, buffered derivative-only gateway dispatch and deterministic local token reinjection verification. Raw
Tier 3 remains local. Unknown/missing/duplicate tokens, stale or revoked approvals, changed source/policy and foreign
scope refuse. This is a deterministic path; no heuristic certifies arbitrary prose and no model certifies itself.

The prototype must be callable through the existing API and Administration cards, not only test helpers. Actual
customer KMS grants, deployed locality, provider terms, model PQ and semantic document verification retain their
own evidence gates. Component and integration results are recorded after execution; no phase is marked accepted
merely by declaring a dependency or implementing an interface.

**Existing owner and digest homes.** `user_intelligence_profiles` and `ana_relational_profiles` already hold
personal context; their current creator migrations are replayed on canonical deployment. The owner boundary is
repaired there and in the existing authenticated tenant/account scope, rather than storing personal rules in the
organization directory. Private-rule CRUD follows that native proof. Existing `proactive-digest.ts`,
`digest-heartbeat.ts`, `scheduled-jobs.ts` and `create-task.ts` receive verified rule-version snapshots, atomic
content-minimal notices and explicitly system-attributed review tasks. A scheduled job never borrows a human's
identity. Existing Skills administration remains the human ledger; runtime source authority extends the existing
model-call scope and readers instead of trusting a caller's declared tier.

### Project team, immutable coordination and visible oversight (P-104 continuation)

The founder further directs that AnA acts as player-coach over specialized workers and the whole project's
objectives, including CSR, CTD, IND and registration workstreams. Extend the current project objectives/task graph,
`run_agent`, turn timeline/record and existing conversation work view. Do not create a second project manager.
Workers need scoped peer awareness and bounded communications so they can coordinate inside their authorized
assignment; AnA still assesses results, reconciles dependencies and escalates the required human decisions.

The existing canonical charter objective reader gains a caller-owned SQL executor adapter so the schedule monitor
reads the same admitted snapshot as its task/dependency checks. Aggregate-learning review reaches the existing
QMS change approval body and dialog: a named current curator explicitly reviews the exact generic artifact and
invariant under the existing signature ceremony. The managed contribution setting has no generic settings door;
server-only system reads return fixed aggregate classes/counts or verified public-artifact receipts, never tenant
source text or an arbitrary privileged query. Legacy wisdom remains quarantined.

The existing conversation gains a subtle **Show team** toggle, **off by default**. Opening it shows worker
assignments, real status/blockers, measurable completed/total steps and AnA's actual assessment against the project
goal. Unknown totals have no invented percentage; completion estimates require an execution basis and otherwise
say unavailable. Hiding the panel affects presentation only. The live view, reload and another authorized device
must agree with immutable records, including failure, interruption, rework and supersession.

**What already exists.** `shared/ana/turn-timeline.ts`, `turn-timeline-emitter.ts`, `run-events.ts`, the sealed turn
recorder and the conversation's activity/work/summary components already describe and replay AnA's work. The live
mirror is intentionally lossy and the recorder seals at turn end, so neither alone can authorize immutable peer
decisions before broadcast. Extend existing append-only chained audit and record blobs as the durable authority;
keep wire/mirror/UI as projections. Every explicit operational decision must name its assignment, source/finding
basis, controlled rule and actual model, with attributable revisions rather than overwrite. Child workers cannot
lock, sign, transmit, approve themselves or turn an unverified proposal into a filing fact. Models remain fallible;
source validation and independent/human approval are the control, not a promise of zero hallucinations.

The existing `chat-thread-helpers.ts`, AnA history/record handlers, legacy chat handlers and
`cortex-unified.ts` share the same permanent owner-private boundary. Generic model-context readers receive
private placeholders; only an authenticated owner history read or a privately issued model capsule may decrypt.
Private context activates encrypted run/thread capture before message persistence and enters model payloads only
at the final governed boundary, with fresh owner, source, key and project admission. Unprotected external tool
queries and governed write proposals remain held until their exact payload has an encrypted approval/egress path.
These existing paths are included in S4; no route, table, screen or source file is added.

The next bounded extensions finish the remaining reachable controls in these same packages:

- **S5 exact final-package approval:** the existing governed precheck prepares and retains immutable ZIP bytes;
  the current signature ceremony resolves the preparation receipt and binds its actual byte hash, destination,
  application, source heads and current actor. Transmission reuses those bytes, rechecks current authority and
  integrity after awaits, and consumes one claimed attempt. The current dry-run assembly retains its contract.
- **S4 private proposals:** the existing pending approval, conversation signoff and authoring transaction store the
  entire proposal/check/rationale encrypted, provide a fresh-owner exact preview, and require explicit exact-content
  sharing. A successful actual gateway output/tool-argument receipt with current drafting qualification authorizes
  machine genesis. Consent, fixed document ID, required ownership and execution receipt commit together; uncertain
  commits reconcile that exact identity before release or retry. Read-only intent, cancellation, current source/key,
  hard gates and independent review remain enforced.
- **S9 client-confirmed repair:** the current task ledger, both task APIs, board, source/task writers and reminder
  sweep preserve an immutable opening marker and transition chain. A real current affected client confirms an exact
  proposal bound to current QMS/CAPA, signed fix version and verified tenant/project rule evidence. Generic closure,
  mirror writes, stale metadata replacement and generic reopen cannot bypass this history. Existing Part 11 signoff
  remains a separate requirement where the task requires it.
- **S10 feedback source continuity:** existing agency question proposals carry source/checksum/extracted-text and
  exact-span proof into the current Record action. The same governed transaction admits the current linked source
  and actor before storing a source-backed question. Manual edits remain explicitly manual. Reuse the current
  retained-source guard for every retained source kind and all descendant model calls. Human clock confirmation,
  reviewed objective/subjective coding, denominator-aware metrics and exact-package clean-file review follow in
  the existing correspondence/submission paths, with insufficient history stated explicitly.

These scope extensions add no source file, screen, mount, table, tool or dependency. Their implementation stays
pending until its own tests and real browser checks pass; the reviewed-learning and privacy components above do
not imply that these later gates have already passed.

### Milestones in the existing roadmap — §11 build order

Each row is **queued for v0.5 acceptance** until its stated fixture is run and recorded. A file's existence or an
older local test does not mark this row green. The two-week spike is a maximum investigation window, not a delay
before coding; a failed check is a Finding with a named dependency. The epic's owner (P-105) owns sequencing and
integration, package owners retain their current file holds, and independent review checks each merged slice.

| §11 phase / milestone | Existing packages and implementation home | Required acceptance evidence |
|---|---|---|
| **0 — Runtime spine and expanded §14.4 spike** (§§13–14,19,23,26) | **S4**, with **S9/S11** task/project graph and **S5/S6** trust seams. Existing `ana/`, memory, tasking, gateways and audit; one synthetic project. | Instruction → governed parent draft → independent verifier → Anna disposition. Bounded/idempotent work survives retry. Worker lock attempt fails and is logged; every disposition names atoms/findings/rule and model/version. All seven spike checks below pass. |
| **1 — Evidence and atom verification** (§§2–3) | **S2/S4/S6**: `clinical-regulatory-evidence/`, `data-room-retrieval.ts`, `ana/drafting-source-lineage.ts`, Vault and citation services. | Provenance survives ingest/retrieval/draft; seeded incorrect citation fails exact document/page/span check. Deterministic outputs pin code/data hashes and can be recomputed. No unverified atom is presented as verified. |
| **2 — Canvas and one CSR, full gate flow** (§§4,8) | **D4/S4/S6**, existing editor, CSR and governed artifact lifecycle. | Locked protocol contract and effective template precede drafting; unverified claims/open blocker prevent lock. Human accept/reject hunks, version hashes, review/signature segregation and provenance cards work in the existing editor. |
| **3 — Deterministic biostatistics** (§5) | **S3/S4**, `biostatistics-bridge/`, `ana-biostats/`, `csr/`, `cdisc/`; P-101 keeps SAP in the one editor. | Synthetic ADaM + SAP reproduces TLF cell-for-cell; independently programmed QC catches a seeded cell change; protocol/SAP estimand mismatch raises a Finding. Narrative uses only verified computed values. |
| **4 — CMC / Module 3** (§6) | **S7/S12**, existing `cmc/` and downstream provenance. | Fixture batch/stability tables match expected cells; OOS is explicitly flagged; QOS and Module 3 share atoms and method references. Existing US small-molecule IND composition boundary stays enforced until separately changed. **Phase 4's acceptance was met 2026-11-08 (`6e7ed6073`, `05adc9e78`); the module's remaining CMC scope is §6a below, under P-113.** |
| **5 — Lab/QNS and RBM** (§7) | **S8/S3/S9**, existing lab/study data and `rbm/`, tasking. | Immutable feed/versioned LOINC/UCUM normalization; QNS recollection/SLA/escalation; seeded deteriorating site crosses QNS/query-aging thresholds in the correct periods. Repeated reports reproduce identical numbers. |
| **6 — QMS, inspection and governed learning** (§§9,17,20–23,27–29) | **S6/S4/S9**, existing Vault controlled documents, audit, QMS and tenant export/purge paths. | Ineffective template and untrained approver refused; inspection pack exports audit/training/deviation/CAPA/provenance. Support access is approved/logged; offboarding exports open-format client content without secrets and revokes grants under the contractual retention schedule. Rule conflict/edit/revoke/promotion and alignment digest are auditable. Cohort/promotion checks below precede shared learning. |
| **7 — Publishing, client-account transmission, correspondence and clean-file review** (§§10,17,30–32) | **S5/S10/S9**, existing eCTD/sequence, gateways, agency responses and task clocks. | Clean sequence passes external validation seam; broken link blocks. Exact-byte approval and client-owned scoped grant required to transmit; missing ACK3 creates a Watch task. Full-letter classification extracts all items/dates with spans; humans confirm clocks/subjective coding. Clean-file report is required before ready; confirmed objective deficiencies block, sparse subjective history says “insufficient pattern history”. Track deficiencies/submission, RTF/RTA and review rounds per tenant. |
| **8 — Device factories on the proven spine** (§4.3) | Existing device/CER capabilities, **D4/S2/S4/S5/S10**, reached under the existing catalog/launch packages. | Synthetic 510(k) predicate cells retain provenance, eSTAR mapping/attachment completeness and version are checked; CER search/screen/appraisal and Annex XIV evidence assemble from the same records. No unqualified type is Anna-enabled. |

The later-phase QMS work prepares cohort controls before phase 7 feedback intelligence; it does not allow letters or
reviewer identities into a shared pool. Existing launch rows D1–D10 remain the deployment criteria. Vendor onboarding,
agency test accounts, customer IQ/OQ and model PQ remain explicit dependencies; this epic claims no certification.

### 6a. All of CMC in the CMC module (founder decision P-113, 2026-11-09)

The founder, in the CMC session: *"All possible CMC data and tests and studies and needs and more across all of
chemical, manufacturing and controls; must be part of this special module. Using all types of AI and machine learn
and testing … study what all advanced current market offerings are doing in this exact space and add that to their
roadmap for cmc. And I think there should be a sub-project management feature dedicated just for cmc but connected
to the parent project management module."*

**The study is `docs/evidence/S7/2026-11-09-cmc-scope-market-and-roadmap/`**: the inventory by path of what exists
(57 CMC services, 19 canonical record kinds, 9 signed registers, 15 composed sections), the external study of
QbDVision, Weave Bio, DDi, Veeva Vault RIM, the CPV platforms, the Rockwell-led Digital CMC Consortium and the
published ML work, with its sources and the caution that almost all vendor material is marketing. **P-113** in
`docs/LAUNCH_DEFINITION_OF_DONE.md` is the decision. Nothing below is a new screen, rail entry, card or editor
(RULES 4 and 5); each item names the existing file it completes (RULE 6).

**What already exists, so the roadmap is not read as new.** On specification control, stability with ICH Q1E and
poolability, batch analyses, process capability (Cpk/Ppk), change classification, cross-register contradictions,
Module 3 composition with lineage-derived drift, the 2.3 sharing Module 3's atoms, and a §11.50 signed-act layer
with outcomes, this module is at or ahead of what the vendor material describes. The roadmap is what it does
**not** hold.

| Tier | Work | Completes |
|---|---|---|
| **A** — extends an existing register; no addition | Nitrosamine risk assessment; ICH Q3D elemental impurities; ICH Q3C residual solvents; photostability (Q1B); in-use and reconstitution stability; post-approval stability commitments; method transfer and co-validation; extractables and leachables as studies; cleaning and shipping validation as validation kinds; supplier qualification; batch genealogy; the OOS/OOT investigation lifecycle | `cmc/impurity-assessment.ts`, `cmc/stability-source.ts`, `cmc/analytical-method-source.ts`, `cmc/contradiction-lifecycle.ts`, the material-spec, container-closure, batch and process-validation registers |
| **B** — compose what is already judged | **3.2.A.1** facilities and equipment; **3.2.A.2** adventitious agents (from `substance-modality.ts`); **3.2.A.3** novel excipients (from `materialSpec.novelExcipient`); **3.2.R** US regional (from `us-ind-regional.ts`) | `module3Composer.ts` — the judgements exist and no section composes from them |
| **C** — three new records, each needing its own `approvedAdditions` entry and design | 1. **Manufacturing sites and equipment** — today a free-text `manufacturingSite`, named in every 3.2.S.2.1 and 3.2.P.3.1. 2. **QTPP, CQA and CPP as records** — `qbd-analyzer.ts` derives them at read time and QTPP exists nowhere, so the control strategy has no governed object at its centre. 3. **Established conditions and the PACMP (ICH Q12)** — nothing records what was filed as an established condition | the register family; `cmc/qbd-analyzer.ts` reads records and keeps deriving where none is recorded; `cmc/supac-classifier.ts` and `cmc-change-control-service.ts` |
| **AI/ML** — inside RULE 2, which is unchanged | 1. **Document and instrument intake** (a CoA, an executed batch record, a stability table, a validation report) as *proposed* records a person confirms — the founder's "data entry points", and the largest practical win. 2. **"What a reviewer will ask"** — a ranking layer over the deterministic contradiction sweep, showing its basis and corpus, never a verdict. 3. **Early degradation signal** beside `stability-trending.ts`, which stays the sole authority on shelf life. 4. **Specification-setting proposals** from batch history, with `process-capability.ts` keeping the arithmetic. 5. **Narrative drafting** — exists | the existing extraction path, `cmc-impact-contradiction-engine.ts`, `cmc/stability-trending.ts`, `cmc/process-capability.ts`, `cmc/module3-narrative-builder.ts` |
| **Strategic** | **FDA PQ/CMC alignment.** Its Phase 1 domains — drug product, drug substance, quality specification, batch analysis, stability — are this module's five strongest registers, which already hold that data as records with lineage. The work is a mapping to the HL7 FHIR Implementation Guide, not a data project. Not an operational requirement yet, so it is an export beside the existing composition | `cmc/module3-compile.ts` and the register readers |
| **Designed for, not built against** | **ICH M4Q(R2)** — a January 2026 FDA draft, Level 1, not for implementation, 2027 adoption reported and disputed. Two consequences: a Description–Manufacture–Control–Storage projection beside the composer's section-per-CTD-node shape, and QTPP/CQA-as-records becoming a filing requirement rather than an improvement | — |
| **S12** | The CMC work project's **own plan**: a deliverable's owner, due date and dependencies, which have nowhere to live today because a CMC deliverable is the set of records of one source type in one project (`docs/evidence/S12/2026-11-09-deliverable-feeds/`). This is what makes the critical path to a filing date answerable. The task list itself is **P-111**, already decided and routed to S12, with this lane holding the CMC area's screens | `cmc/section-drift.ts` `projectDeliverableFeeds`, `ProjectCoreWork.tsx`, `unified_tasks` |

**Not approved** (P-113): formulation or molecular ML (ZoomLab, Schrödinger, digital twins), outside P-28 and the
spine; and matching the AI-authoring vendors feature for feature, because they draft prose into documents while
this module composes Module 3 from governed records with lineage — which is the direction FDA's own programme is
moving, and the wrong advantage to spend.

### Expanded spike — executable acceptance contract

1. **Independent verification and decision rights (§14.4).** Draft/check are distinct; a deliberate unsupported
   claim is rejected. Only the governed parent merge reaches lock; a child lock/sign/transmit/clock mutation fails.
   Reconstruct accept/reject/rework/sequence/lock from the decision audit without conversation text.
2. **Credential custody (§19.1).** Capture a fixture canary in the existing secure surface; deterministic scoped use
   succeeds while model context, captured outbound requests, traces, ordinary logs and tenant exports contain no
   canary. Credential-use events name grant/action/submission without the value. Expired/revoked scope fails.
3. **Exact-byte approval (§19.2).** Approve a fixture package, change one byte, then transmit: approval is invalid
   and transmission fails before the wire. Audit both approval invalidation and refusal; reapproval covers new bytes.
4. **Tenant isolation (§19.3).** Tenant A cannot read tenant B's memory/rules/atoms/audit or invoke B's worker/grant,
   both through normal requests and as the deployed non-superuser database role with forced RLS.
5. **Correction and hard gate (§23).** A sourced correction appears in the existing rules view and changes the next
   applicable task. “Never again” promotes a runtime approval block; a model cannot demote it. Project > tenant >
   user for soft/standing rules, hard gates at every scope prevail; genuine conflicts produce a decision package.
6. **Classification and routing (§26.1).** Classify locally; unknown sensitivity tiers up. Highest input tier plus
   the approved tenant policy authorizes every primary/fallback/embedding call. Raw T3 cannot reach frontier;
   denial and policy version are logged without source content. Tenant-derived labels alone never relax the floor.
7. **Derivative round-trip (§26.2).** Local tokenization/minimization removes every fixture secret from captured
   frontier payload; tokens remain. The mapping stays tenant-local; deterministic merge restores the exact seeded
   text and local verification checks the result. Missing attestation/map, wrong tenant or policy blocks the call.

**Go/no-go.** Native Anna remains the implementation target (Option A). The epic's owner records each check's command,
fixture, result and unresolved Finding in this plan's progress log, linked to the actual test output/commit. No
fabricated green status, provider call or fixture coverage. If the spike fails, keep the existing copilot experience
honestly limited (Option C); do not market orchestration as qualified. External MCP (Option B) stays an integration
surface and cannot replace in-product decision enforcement. No human must carry state between spike components.

### v0.5 controls that finish after the spike

- **Trust (§§16–19).** Tenant-scoped content/memory/audit; client-admin credential capture, reference-only grants,
  immediate revoke/rotation and deterministic use; human approval binds final content; client-visible audit and
  export. Authority-specific onboarding verifies current mechanics before enablement; an unknown authority is not
  enabled merely by adding a label.
- **Continuous evolution (§§20–23).** Typed preference/decision/person/commitment/correction memory with source and
  supersession; visible user/tenant/project rules; correction → fix → general rule → future behavior. Repeated or
  severe corrections promote guards, human-only demotion; digest and open repair WorkTasks tie into Deviation/CAPA,
  with client confirmation required to close repairs.
- **Locality (§§24–26).** T0 public/T1 internal/T2 confidential/T3 restricted; policy ceiling, residency, approved
  providers and dated no-training/no-retention terms gate the existing model gateway. Lane A local, B approved
  frontier, C attested derivative then local reinjection/verification. Tenant/task-class evaluations earn lane use;
  missing local infrastructure or a policy-permitted qualified model escalates rather than leaking raw content.
- **Learning boundaries (§§27–29).** Client content/rules/strategy never cross tenants. Shared pattern candidates
  require local irreversible abstraction, distinct-tenant cohort minimum, contribution opt-in policy, named human
  invariant review and QMS change control. Reviewer-level observations stay tenant-local. Only content-free craft
  ships through controlled skill/template versions; opt-out tenants still receive craft. Reports show contribution
  classes/counts, never candidate content. Tokenization alone is not proof of anonymization.
- **Agency feedback (§§30–32).** Existing correspondence feeds sourced objective/subjective feedback records tagged
  by agency/division/product/application. Humans confirm inference before it drives behavior; objective checks are
  deterministic. The clean-file report joins validation/diff in the exact-package approval bundle. Project/customer
  learning remains scoped; division-level shared patterns use the cohort/promotion gates. No promise of faster
  approval substitutes for measured tenant outcomes.

## 2. The design (binding)

The colour, type and spacing tokens already exist in `design-system/colors_and_type.css`, and they are Claude's
palette. Keep them. This section decides how they are used.

**Character.** The product is calm, typographic and conversation-first, with generous whitespace and almost no
chrome. The content leads and the frame stays quiet:
- one primary action per view;
- sentence case everywhere;
- status colour only for meaning;
- Claude orange (`--accent-main-100`) used sparingly: the send button, the spark, focus, and one primary action.

**Type.** The system sans is the UI face, at 14–15 px for body text. Lora is the reading serif. It sets:
- the greeting;
- page titles where Claude uses them;
- assistant prose;
- documents.

No display sizes inside content. Anthropic's own typefaces are proprietary and are not used; this pairing is the
licensed equivalent.

**Sidebar.** The sidebar is collapsible and holds, in order:
1. the brand and the primary "New conversation" action;
2. the places: Home, Projects, Tasks, Communication, Vault and Submission Center;
3. the work areas: CMC / Module 3, Risk-based monitoring, Quality, Reporting & analytics (Biostatistics is reached
   from the project, §1a; RULE 4 admits no new rail entry);
4. Recents: recent conversations and projects, as Claude lists them;
5. the account, at the bottom.

The active item takes a soft fill.

**Home.** A compact serif greeting and one large rounded composer (radius about 20 px, a hairline border, a soft
shadow, attach, and an orange send button), with a few quiet starter suggestions. Beneath them, and visible at
1440×900 without scrolling, are the person's projects and their due tasks (P-122).

**Projects.** The page holds the title, a search field, one "New project" button, the portfolio figures (active
projects, average readiness, filings due within 60 days) and a grid of calm cards. Each card shows the name, a
one-line description, its readiness, stage, lead and status, and when it was updated. These are shown by default, in
grid and list, and the figures come from the server. Filters stay quiet. "Which projects are at risk this week?" is
one click, answered by the server's risk engines (P-122).

**A project.** This is Claude's project page:
- **Main column:** the name, a one-line description, the composer ("How can I help with this project?") and the
  project's conversations.
- **Right column (about 320 px), "Project knowledge":** the project's documents, sources, team and key facts, each as
  a quiet card.
- **The regulatory work:** Plan, Evidence, Author, Review, Submit and Respond, documents, filing state and the work
  areas. All of it stays one click away, in a quiet segmented control and sections below the composer, never as
  banners above it.
- **Shown, not hidden (P-122):**
  - the open step says what to do next;
  - Records and Activity are open sections;
  - the Review step lists its approvals and the server's readiness;
  - section owners, deadlines and milestones are on the Plan step.

**Conversation.** A centred reading column. AnA's prose is set in the serif, the person's turns are quiet, and
artifacts and citations appear inline.

**Canvas.** This is Claude's artifact: the conversation on the left, the document on the right in an artifact panel.
The panel has a slim header (title, version, copy/download/share, close) and renders the document with reading
margins in the serif. Every way of opening a document opens this view.

**Editor.** There is one editor, `client/src/concept2cure/v2/editor/` (RULE 4). It is a quiet, centred writing
surface:
- the toolbar is minimal and the outline appears on demand;
- review, comments, versions, signatures, filing and export live in an inspector that slides in, not in permanent
  panels.

**A work area.** CMC, Biostatistics (opened from the project), Tasks, Vault, Submission Center, Communication,
Quality, RBM and Reporting share one page pattern:
- a header with the title, one line of description, one primary action and quiet secondary actions;
- content in the canonical list, table and card styles;
- guidance in AnA and in the composer's suggestions, not on the page.

**Details.**
- Buttons have radius 8 px, are 32–36 px tall and are ghost by default. Cards have radius 12 px and a hairline
  border, with no heavy shadows. Inputs have radius 8–10 px. Icons are 16–18 px with a thin stroke.
- Motion is 150–200 ms ease-out, with no bounce.
- An empty state is one sentence and one action.
- Numbers are formatted. Copy is calm and plain.

**Retired patterns.** Nobody adds these. Each package removes them from its own screens:
- uppercase coloured eyebrow labels ("CMC — MODULE 3 OPERATING SYSTEM", "PROJECT — COLLABORATION");
- "What to do now / NEXT STEP" guidance boxes, which move into AnA and the composer;
- "THIS WORK FLOWS INTO" destination chip rows;
- a large serif answer banner on every screen; at most one remains, where the answer is the screen;
- stat tiles and percentages as permanent chrome;
- ids, enum values, table or function names and snake_case on screen;
- "Coming later" roadmap text;
- per-document-type cards or screens, and a second editor or canvas (RULE 4).

**Zero capability loss.** This is not negotiable (`.claude/skills/claude-ui-design-principles.md`). Every metric,
workflow, verdict and action a removed element gave stays reachable: through the conversation, an inspector, a quiet
section or ⌘K. Each package files a ledger of every removed element and where it now lives.

**Enforced since P-122 (2026-11-10).** A ledger entry is not enough. Nothing a screen showed is removed, hidden, moved
below the fold or put behind a closed disclosure without a founder decision. A fold is admitted only with a test
that opens the target and shows the same outcome.

## 3. The work packages

There is one ledger, `docs/design/one-design-plan.json`, and the gate reads it. A package's **status** decides
whether work may be committed under it:
- `open`: commits are accepted;
- `queued`: it waits for the packages it depends on;
- `closed`: it is done and accepts no more work;
- `parked`: the founder parked it.

| ID | Package | Depends on | Status |
|---|---|---|---|
| D0 | **Foundations.** The canonical page header, card, button set, segmented control, empty state, inspector, artifact panel and composer, built from the tokens. The retired classes are removed from the shared CSS. | — | open |
| D1 | **Shell, Home and the conversation.** The sidebar with Recents, the greeting and composer, the conversation thread, the top bar, ⌘K, the task tray and notifications. | — | open |
| D2 | **Projects.** The grid of cards, search, quiet filters, and the New project flow. | — | open |
| D3 | **The project page.** The main column and composer, Project knowledge, the quiet stages, documents, filing state and work-area doors. | — | open |
| D4 | **The canvas and the editor.** The artifact panel beside the conversation, and the quiet editor with the inspector. One editor. | — | open |
| D5 | **Work areas I.** CMC / Module 3 and Biostatistics on the one page pattern. | — | open |
| D6 | **Work areas II.** Tasks, Communication and Vault. | — | open |
| D7 | **Work areas III.** Submission Center, Quality, Risk-based monitoring, and Reporting & analytics. | — | open |
| R1 | **Reach.** Every server capability with no UI caller is reached in its package's screen, or retired by a founder decision. The inventory and each reach are filed under `docs/evidence/DESIGN/R1/`. | — | open |
| F1 | **Repairs.** Defects in shipped behaviour, such as the 2026-10-31 running-app audit findings. Repairs add no screen, mount or table. | — | open |
| L1 | **Launch rows** D1–D10 of `docs/LAUNCH_DEFINITION_OF_DONE.md`, as defined there. | — | open |
| DATA | **Demo data.** `scripts/demo/**`, `data/seeds/**` and their evidence. | — | open |
| PLAN | **This plan and its gate.** It changes only by founder decision. | — | open |
| S1 | **Project and goal.** The project states its goal: the application and the question it must answer. The data room, the protocol and AnA read it. | — | open |
| S2 | **Data room catalog and lineage.** Immutable capture, versions never overwritten, and lineage kept in perpetuity: the LX and PF fixes of `LINEAGE_END_TO_END_PLAN_2026-09-25.md`, and the catalog of `DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md`. | — | open |
| S3 | **Protocol to evidence.** Hypothesis, endpoints and estimands from the protocol. The engines compute biostatistics and safety from the catalog's data. | — | open |
| S4 | **AnA the writer and runtime.** Cited drafting, project/person memory, independent read-only workers, controlled skills and runtime decision gates; Anna epic §1d (P-104). | — | open |
| S5 | **eCTD and filing.** eCTD 3.2.2 and 4.0 assembly, validation and dispatch. Module 1 for the US, EU, Japan, Canada and Australia. | — | open |
| S6 | **Vault, at Veeva parity.** The 2026-07 audit's gaps, closed on the existing Vault. | — | open |
| S7 | **CMC.** Module 3 composition and study-conduct data capture, as one work area. | — | open |
| S8 | **Risk-based monitoring.** It runs over the project's study data. | — | open |
| S9 | **Team, tasks, commitments and schedule** (P-81). The team on licensed seats. Each person's due work. Extract commitments. The project's goals and schedule, and progress against them. | — | open |
| S10 | **The agency's communications back into the project** (P-81). Each letter lands in the project, its questions go to Respond, and its commitments go to tasks. | — | open |
| S11 | **The program plan** (P-82). The project's pyramid gets per-project progress, owners and back-scheduled due dates. It joins the content plan, has its critical path, and appears in the Plan step. The portfolio and the global schedule. | — | open |
| S12 | **Work projects and their downstream deliverables** (P-83). CMC, biostatistics, RBM and the other work projects under the product program. Each deliverable is versioned with lineage and mapped to the downstream sections it feeds. A new version flags the sections that used the old one. | — | open |

Each spine package (S1–S8) starts with its "What already exists" section (RULE 3), built from §1a and extended by its
own searches, filed under `docs/evidence/SPINE/<ID>/`. Its UI work is done on the §2 design. When a screen is in a
queued design package's files, the S package changes only behaviour there, never the layout.

Each design package (D0–D7) runs its own work in this order:
1. **Spec.** Append `## <ID> spec` to `.design/claude-convergence/<ID>.md`. For each screen it says what the screen
   is today, Claude's pattern, the change (by file), the capabilities kept, and the acceptance checks.
2. **Build.**
3. **Evidence.** File before-and-after screenshots at 1440 px and 390 px of the running app, in light and dark, under
   `docs/evidence/DESIGN/<ID>/`, with the capability-kept ledger.
4. **Review.** The six-lens design review: design, accessibility (WCAG 2.2 AA), microcopy, motion, design system and
   honest state.
5. **Close.** The founder or the lead marks it `closed` in the ledger, under `Plan: PLAN`.

### 3a. Progress log (founder decision P-100, 2026-11-05)

Each session records what it delivered here, under its package, while the coordinator is unavailable. An entry is
facts only: commits by SHA, evidence by path, what was found, and what is next. It changes no package's scope,
status or ownership; closing a package stays §3 step 5.

#### S2 — the data catalog across projects, graded, used in a project (2026-11-06 to 2026-11-10)

The founder, 2026-11-06: see the data room as a catalog organized into folders and buckets, graded, and subscribed
to by a project; AnA in control of it. 2026-11-10: "I can not see the data catalog / data room from anywhere in the
UI": the 2026-11-06 commits had been refused by the pre-push gates and never pushed, and the catalog sat four clicks
deep. Evidence and the "What already exists" survey: `docs/evidence/SPINE/S2/2026-11-06/README.md`.

| Step | Commits | Where a person sees it |
|---|---|---|
| 1. The catalog across projects | `7a2cfe34` (S2: `data-room-search.ts` reads the person's accessible projects of the open project's sponsor, with facets by project, study, kind, CTD section, Vault folder), `1b4d3c12` (R1: `GET /api/c2c/projects/:id/sources?scope=catalog`) | Vault → **Data catalog** (`cef3d557`, S6); the project page's Data room → **Open the data catalog** (`08927463`, R1); Project files → Data room → All my projects |
| 2. The grade | `7a2cfe34` (`data-room-grade.ts`: provenance, integrity with the Vault copy's fixity, currency, processing, verification by a person, CDISC conformance for datasets; stored on the capture, `migrations/20261106_data_room_grade.sql`), `c04ba737` (a native record graded by its snapshot and its register) | each item's *Grade A–D · score*, its basis criterion by criterion |
| 3. Use in this project | `1b4d3c12` (the pinned-evidence routes take `data_room`, checked against the person's catalog, audited), `c04ba737` (the panel) | **Use in this project** / **Remove**; the project's Data room lists **Used in this project** first |
| 3b. Used data feeds the CSR | "S3: the CSR's study-data chooser lists first the data this project uses" (S3: the CSR document's study-data chooser lists the Vault source of a used capture first, "used in this project"; walked on the CDISC pilot CSR) | the CSR editor's "Build from the study's data" chooser |
| 4. AnA over it | "S4: AnA reads the data catalog with its grades, and files a data-room capture into the Vault" (S4: `list_project_documents` with `catalog: true` reads the catalog, its grades and what the project uses; `file_chat_upload_to_vault` with `source_id` files a capture through the data room's filing; AnA proposes "Use in this project", the person confirms). Not run in a live conversation: no model key where it was built | in AnA's answers |

**Next** (the README's "Not done yet"): AnA's step 4 walked in a conversation with a model key; whether a used
capture of another project may be assembled into, or filed for, this project's documents (a governance decision for
the founder); a sponsor chooser for the Data catalog with no project open (S6's open item). Evidence of 2026-11-10:
"S2: the walk of the CSR example and AnA's tools, recorded".

#### S4 / S10 — Anna runtime v0.5, first bounded controls (2026-11-06, P-104)

**What already exists.** The six-component audit and completion contracts are in §1d. These changes extend those
same services and tests; they do not add a second runtime, tables, routes, tools or files.

| Slice | Commit / existing-file evidence | Verification and limit |
|---|---|---|
| Roadmap integration | `7edec20d`: this plan §1d, existing ledger, P-104 and roadmap pointer | Phases 0–8 mapped; full expanded spike remains **acceptance pending**. |
| Context precedence | `93b6f1a5`: `server/services/ana-context-router.ts` and existing test | 3 context cases pass. Project instructions outrank tenant/user context; this is not a durable RuleRecord/conflict/hard-gate runtime. |
| Correspondence blocker verdict | `91dcd2ea`: `server/routes/orchestration.ts`, `server/services/orchestration/pre-submission-gate-verdict.ts`, existing `pre-submission-gate-honest.test.ts` / `pre-submission-gate-verdict.test.ts` | 37 tests pass: confirmed open blocking correspondence holds; pending review is conditional; failed scoped read holds. No learned subjective-fit or exact-package clean-file claim. |
| Connector error custody | `1033d183`: `server/services/connectors/` existing registry and four providers; `connector-tenant-isolation.test.ts` | 40 tests pass, including reflected-secret canaries. Upstream response bodies and arbitrary exception messages cannot become agent-facing errors. Full credential-grant/capture/transmission acceptance is still owed. |
| Source-aware locality boundary | Existing `server/services/ai-gateway/`, `server/services/ana/draft-project-sources.ts`, `AnaDocumentDraftingService.ts`, and Vault document-catalog readers; `af8723e7` | Agent verification: 12 suites / 238 tests pass. The root's narrower boundary set: 5 files / 123 tests pass (overlapping coverage, not additive). Private-issued selected Vault classifications enforce highest tier, T2/T3 raw frontier refusal and content-free audit, independent of PII mode. Legacy/unclassified caller coverage, ingest classification, approved derivatives/local merge and local hosting remain incomplete. |
| Independent exact quotation check | Existing `server/services/ana/sub-agent*.ts`, `agentic-workflow-tools.ts` and the existing sub-agent, toolset, verifiers, hostable and passage-staging test suites; `c08aba5c` | 5 suites / 149 tests pass (`/workspace/scratch/runtime-tests.log`, local session output). Source-span comparison is deterministic and isolated from the drafter; missing/malformed source results fail closed. Exact matching does not establish semantic claim support or full spike verification. |
| Shared-learning containment | Existing `server/services/intelligence/ana-failure-learning.ts`, `counterfactual-replay.ts`, existing tenant fixture tests; `3ad2bb07` | 31 preliminary targeted tests pass. Unsafe shared correction extraction/reads are held rather than promoting tenant text. This does not implement de-identification, contribution policy, human/QMS promotion or a RuleRecord ledger. |
| Writer-tenant agency requirements and raw-pattern quarantine | Existing creator `db/migrations/20260520_ana_failure_learning.sql`, amended in place under RULE 1; `server/routes/__tests__/ri-agency-requirements-unvalidated-visible-only-to-writer-org.pglite.test.ts`; `3ad2bb07` | 11 PGlite cases pass, including direct SQL as NOSUPERUSER/NOBYPASSRLS, foreign validated-row refusal, own-row access, missing-tenant refusal, and replay twice over the prior permissive policy. The creator also ENABLEs/FORCEs RLS on ownerless legacy `intelligence.failure_patterns` with no runtime policies: A/B/missing-tenant reads are denied, including after replay over disabled RLS. Rows are preserved for privileged maintenance; reviewed cross-tenant promotion remains held. |

**Fresh-upload completion (`a717cfe4`, S6).** The existing Vault ingest now defaults an undeclared fresh upload to
CONFIDENTIAL/T2. Existing version classifications and same-byte retries are preserved, and the existing upload
control shows the same default while allowing an explicit Internal choice. Seven server/UI suites, 182 tests,
pass. Historical classifications are unchanged; content-aware ingest classification remains an acceptance gap.

**Consolidated validation.** Nineteen targeted suites, 434 tests, passed together after integration, covering source
checks, last-mile routing, tenant SQL policies, connector canaries, correspondence blockers, upload persistence,
worker decision rights and package-byte integrity. The full TypeScript no-regression gate reports zero errors.
Additional component-suite counts above overlap this run and are not additive. Validation uses synthetic fixtures
and mocked provider transport; no live model/gateway call or real-PostgreSQL deployment is claimed.

**Next.** Resolve the model/deployment and derivative-custody dependencies, then execute the expanded fixture
contract. Exact quotation checks cannot establish semantic claim support.
No provider call, live transmission, authority-account transition, full derivative round-trip, production rollout,
customer IQ/OQ or complete spike pass is asserted by these component checks. Phases 1–8 stay queued behind their
stated gates.

#### F1 / S4 — Anna runtime continuation (2026-11-06, P-104)

| Slice | Commit and component evidence | Status / boundary |
|---|---|---|
| Atomic account canon | `852eb1287`; existing `server/services/account-canon.ts` and confidence/audit test, 15 passing cases | **Implemented component verified.** Fact and immutable event commit or roll back together. |
| Authority freshness at the wire | `026c0e96f`; existing gateway accounts/dispatch services, 54 passing tests | **Implemented component verified.** Recheck authority after archive awaits; changed sender/mode/rotation/deletion refuses. Historical account ownership migration is not asserted. |
| Sourced mandatory approval rules | `4852aa78b`; existing `policy_bindings`, Skills store/runtime and administration/studio, 78 runtime + 10 UI tests | **Implemented component verified.** Project-mandatory scope is `check_dossier_consistency`; broader tool permissions and full §23 acceptance remain gated. |
| Qualified model pin capability | `e6a7c391c`; existing controlled registry, gateway, draft endpoint/catalog, PQ verifier and build adapter | **Implemented component verified.** Exact immutable identity and task-scoped PQ content hash are checked before dispatch and output release; substitution, unverified streaming and demo output refuse. Eight packaging checks pass; plain-Node claim read reports 16 pending and zero passed. No pending entry becomes qualified. |
| Client administration credential vault | `e6a7c391c`; existing encrypted connector store, gateway account card, Admin Settings capture and fresh tenant SDK/embedding seams | **Implemented component verified.** Fourteen cards: all nine existing credential-required connectors, three LLM providers, and PRS/FDA portal storage-only. Client-admin re-authentication, scope/expiry/rotation/revocation, atomic audit, metadata-only reads and tenant-specific SDK use with no platform fallback. Actual database audit-trigger fixtures revoke membership during use and prove no send occurs. |

The new capture surface reuses existing files/cards/dialogs. PEM capture is paste-only: exact multiline text stays
in ephemeral form state and the password input contains a fixed mask, with clear/replace controls. LLM keys use
password inputs. Submission, cancellation, session/org changes and late receipts are fenced; secrets do not enter
AnA context, browser persistence, errors or audit. Storage is not connection validation: PRS/FDA portal actions are
explicitly not connected, and a stored client model key does not qualify a model. Current grants are checked for
scope/expiry/revocation and bound to their tenant/provider immediately before deterministic SDK use.

**Existing connector compatibility.** `5992db35e` carries all eight other authenticated connectors into the same
administration workflow: Google Drive, Box, SharePoint, OneDrive, Medidata, FHIR, SAM.gov and Ellucian. Existing
catalog field schemas remain the authority; Microsoft tenant IDs map explicitly to adapter headers and Google PEM
capture preserves exact bytes. Only the five existing upload adapters receive an upload-purpose option. All 51
connector compatibility cases and 22 administration cases pass, including capture/rotate/revoke, real adapter execution against mocked
Google OAuth/search transport, and secret-free audit reasons for four PEM whitespace/newline representations.

**Agency account reasons.** `1458f32d3` also removes new and previously held credential values from stored FDA/agency
account change reasons and uses that same safe writer result in the chained audit. The 21 service and eight route
tests include actual database capture/rotation/platform-revert canaries, multiline variants and safely clearing
unreadable prior credentials. Credential bytes and the last-mile transmission authority fingerprint are preserved.

**Consolidated integration checks.** After merging shared-branch work, all 28 changed existing Vitest suites pass
with 599 tests, and all eight offline packaging checks pass. The production client/server build succeeds and its
plain-Node qualification verifier reads the packaged assets. The plan and committed-secret gates pass; changed
files have no ESLint errors and zero net warning growth. These counts overlap component runs above and are not
additive. Canonical TypeScript checking reports zero errors against a zero baseline. The mandatory pre-push gate
rechecks the published commit and refuses compiler, plan, lint or security regressions.

Promotion of a future passed model must ship its exact registered, verified record as well as the four canonical
qualification assets. The current Docker context excludes `docs/evidence`; a record registered there requires a
single-file inclusion or an existing shipped source-owned evidence path. Do not include an entire PQ/trace tree.

These components extend the same §1d epic without new files, tables, routes, tools or model entries. The expanded
spike stays **acceptance pending**;
local qualified weights/PQ, the joined seven-prototype spike and customer deployment evidence remain unresolved.
Reversible custody, explicit attestation and local reinjection are now implemented and component tested below;
actual tenant KMS grants, deployed locality and provider/model qualification retain their own gates. Component
suite counts overlap earlier runs and are not additive. No external provider terms or live service result is
claimed. This lane's completed file holds are released to the lead; other sessions' holds are unaffected.

#### P-104 continuation — implementation evidence

`649303b43` binds evidence review and correspondence blocker lifecycle to exact current source and human review.
`fd0421456` repairs the database owner boundary for private profiles; 167 targeted tests and 49 native RLS tests
pass under a non-superuser/non-bypass role. The canonical 462-file deploy set replayed twice without failures;
restrictive owner policies survive the later generic sweeps. Private RuleRecord management is the next slice.

`b8cee0745` and `e464ee0ce` join tenant-bound qualification, sourced rule lifecycle, encrypted derivative custody,
private source authority, nested generation provenance, durable independent checks and review UI. Real browser
checks cover the administration/rule lifecycle and independent-check dialog (22 checks), with nine native controls.
Alignment digest/task/audit proof passes 111 cases and uses an explicit system actor; it does not close a repair.
Ordinary sourced prose now carries exact original/extraction/classification pins through release, not only figures.

`e464ee0ce` also closes a separate legacy global-wisdom path. Promotion/read/reinforcement is held before queries;
ownerless historical rows are quarantined by FORCE RLS/no policies. All 59 focused tests pass. A full canonical
replay preserves that quarantine; native runtime read/write denial holds even with the platform-role string and
enforcement switch disabled. Tenant-local learning remains available. Cohort size alone authorizes no sharing.

These counts overlap component runs and are not additive. Synthetic model/KMS/transport boundaries are identified
in their fixtures; no real model PQ, customer KMS grant, provider terms approval or scientific correctness is
asserted. The built plain-Node qualification verifier reports all 16 registry entries pending. The production
client/server build and all eight packaging tests pass. The final merged consolidation passes 1,195 tests in
54 existing suites; changed-file lint has zero errors and 14 fewer warnings, with no baseline increase. The
committed-secret gate passes. The canonical full-program compiler completes with zero errors against a zero
baseline on the merged tree. Publication still requires all mandatory pre-push gates; the full expanded spike
remains acceptance pending.

#### P-104 team, private custody and reviewed-learning component evidence

`a2f9264a5` extends the existing conversation and runtime. The team toggle is off by default; 18 actual browser
checks and 121 UI checks cover measured progress, AnA disposition and hidden-view behavior. Registered parallel
workers, durable coordination/refusals, cancellation, private tool holds and safe wire projections pass 20 runtime
checks. The canonical objective/task/dependency monitor passes 158 focused checks. Its filing observation is
explicitly non-authorizing and bracketed by current heads, rather than claimed to be an atomic release decision.

Personal rules now have owner-only correction/version/conflict/revoke controls. The existing-table owner-index
convergence and native owner CRUD/RLS suite pass 30 cases; generic private-context omission passes 11. The actual
browser adds 10 private-rule checks. Current private UI and telemetry pass 45 cases. Whole private turn/message
custody, owner-only history/record reads, revoked-rule history, malicious peer data and key rotation pass the latest
34-case SQL/AES fixture. Final SDK-only private expansion, exact prepared payload hash, opaque child lineage,
revoked authority, floor T3 and no streaming/cache/demo pass 24 gateway tests with SDK transport substituted.
These are separate boundaries, not a claim of live model qualification or one joined full-spike pass.

Reviewed shared learning passes 260 focused cases and 16 native QMS cases: audited explicit opt-in, server cohort,
closed-vocabulary generic classes/counts, exact immutable artifact plus current human signatures, explicit tenant
Skills installation and fresh approval checks. Post-deploy native RLS passes 49 cases and the canonical 462-file
migration replay passes. Existing global raw wisdom stays quarantined. Automatic private reflection, historical
pre-boundary immutable exposure remediation, final ZIP pre-wire byte approval and joined authoring qualification
acceptance remain separately tracked; no incomplete path is described as accepted.

`5c5b89836` adds private HTTP body suppression, safe existing owner-index convergence and immutable pre-wire
`TRANSMIT_BLOCKED` evidence. Exact one-byte signed-manifest mutation and canonical transmit/QMS regressions pass
107 cases. This approval binds the signed leaf manifest; it does not establish approval of a final ZIP bitstream.
The new batch is committed locally and merged with canonical work; publication and final merged gates follow.
Counts in this section overlap broader suites and must not be summed. All 16 real model PQ entries remain pending.

#### S4 / F1 — Anna runtime: the epic's own red on trunk (2026-11-08, P-105 owner `session_01KZK3jgtmQBgNepqLjXjS3k`)

Evidence: `docs/evidence/SPINE/S4/2026-11-08-anna-trunk-red/README.md`.

- **Found.** Since `4852aa78`/`a2f9264a`, every AnA tool reads standing rules and fails closed. Old fixtures cannot
  answer that read, so 144 of the 366 suites reaching AnA's tools refused before their subject ran. A local probe
  recorded the swallowed errors: 906 non-member, 273 owner-scope and 241 project-not-found.
- **Delivered.** All commits are on `concept2cure-v2`.
  - `e739190890`: the stub pool gets the real gate's empty-rule snapshot, and there is one shared declaration for
    hand-built stubs.
  - `fd52dceb45`: every loop round dispatches with its tenant (`ci:ai-tenant-binding` green).
  - `02d0bad57a`: one declaration, not four copies.
  - `c55704def0`: production serves the credential vault, the placement setting and the private-rule ledger
    (`ci:launch-scope-api` green).
  - `df385e5984`: a project AnA cannot use is refused as that, and eight real-database suites meet the independent
    check.
- **Result.** Of the 144 gate-refused suites, 127 pass on the merged tree. No suite moved from passing to failing, and
  the gate's own suites pass unchanged.
- **Delivered later the same day.**
  - `ci:step-presentation` is green. Two import cuts were made and no tool was reclassified: `b7eec7bf34` (the
    statistical document save) and `b4c57f5a27` (the run stopper). `run-control.ts` then went over the size ceiling,
    and its session-end half was split, inside `ana/`, into `run-session-end.ts` (`0525fb31ae`).
  - Two product regressions, each proven red then green: AnA drive kept the Vault's program and stopped searching a
    Vault with none open (`105a28e291`); a missing embedding key is now reported as such (`271838332f`).
  - Harnesses the product had left behind, each update keeping the suite's intent:
    - the executor and tools, 17 suites (`0d6e906a3a`);
    - the stream route, 16 suites (`e1e672f400`);
    - group E, 6 suites (`41d32ca4b4`);
    - figure reconciliation (`4a98f8d330`);
    - upload tenancy (`bae9a11ef2`).
  - The release-gate fixtures (group B) now build `audit_logs` as production does, and no gate was loosened
    (`fb7be60ea1`).
  - Proof tier: `chat-thread-access` (`5944bf4275`) and `authoring-review-audit-comment` (`fb7be60ea1`).
  - A parallel merge broke two drive cases, and they were reconciled with the product (`0da9fae4b8`). `documents`, now
    global, keeps a named program as `vault` does, and a Vault search with none open still asks first, because
    `Vault.tsx` refuses it.
  - Secret scan: all eight hits are test canaries, placeholder DSNs or a local probe's key, each recorded in
    `.gitleaksignore` with its reason (`887c4d9402`). The full-history scan, run as CI runs it, finds none.
- **Next.** The expanded §14.4 spike (Phase 0).

#### S4 — Anna runtime Phase 0: the expanded spike, joined run (2026-11-09, P-105 owner `session_01KZK3jgtmQBgNepqLjXjS3k`)

Evidence: `docs/evidence/SPINE/S4/2026-11-09-spike-joined-run/README.md`, with `results.json`.

- **Run.** All seven checks were run together on `64e3346363`, and nothing failed.
  - Ordinary config: 32 files, 768 tests.
  - Real database: 6 files, 97 tests.
  - `poolInstrumentation` on the real database: 30 tests.

  The real database was built as CI builds it: a blank database, then `install-fresh` and `deploy-migrate`, then
  `app_service` as the runtime role.
- **Added**, each shown failing first:
  - check 4: the rules and memory stores isolate tenants as the runtime role (`ec177edd06`);
  - check 1: rework and rejection are rebuilt from the decision audit (`d4b82abc94`);
  - check 2: a credential use is audited by grant, revision and purpose, never its value (`64e3346363`);
  - check 2: the tenant's export carries a vault-captured card but neither its key nor the stored ciphertext
    (`4d99bddc52`);
  - check 1: a child's transmit, signature, filing and version overwrite are refused by name (`ce1451297c`).
  - check 2: one canary makes one real model request through the tenant's own client, and is only in that request's
    Authorization header: not its body, the result, a refused key's error, the log, the audit or the export
    (`2c54da8f34`).
- **Verdict: acceptance pending.** Every check has named open items in the evidence. Some are test-only, for S4. One
  is RIM's (check 3, reapproval after the one-byte change). Some are product decisions for the founder:
  - a "never again" trigger;
  - a version for the placement policy;
  - content-aware classification;
  - automatic de-identification;
  - qualified local weights.

  No check is marked passed in full.
- **Next.** Two S4 test-only items remain: a joined child → parent merge → lock case, and the canary in a whole turn (the
  assembled prompt bundle and the turn record). Then the founder's decisions on the product items.

#### R1 — Reach (session `session_01QoxbLdKp1MgbXvCfgSkkJr`)

**Delivered**

- **Inventory**, `df6d18838` and `73ff95ac3`, `docs/evidence/DESIGN/R1/2026-11-01-inventory/`.
  - **Method.** The server's own route table, traced at boot. Every route is matched against the client's API path
    literals (an exact pass and a base-constant pass), then given the production gate's own verdict
    (`launchScopeApiVerdict`).
  - **Size.** 3,923 handlers under `/api`. 1,230 are called by a screen (exact) and 510 probably are. 2,183 have no
    caller found by either pass.
  - **Served but not called: 341.** These are the reach candidates. S3 69, S5 29, S4 26, S10 8, others smaller;
    209 sit in files no package claims.
  - **Called but refused in production: 182.** 148 are out-of-scope and 34 unattributed. Most callers are locked
    screens; any that are launch screens are F1.
  - **No caller at all: 171 route files.** These are retirement candidates, for the founder to decide.
- **Reach: protocol review comments**, `cd7777ec6` and `d914c2618`,
  `docs/evidence/DESIGN/R1/2026-11-01-protocol-review-comments/`. The Reviews tab now leaves a comment and resolves
  one, through the existing governed routes:
  - `POST /api/protocol-reviews/documents/:id/comments`;
  - `PATCH /api/protocol-reviews/comments/:id/resolve`.

  It was used in the running app: a project created through New project, protocol CDI02 started, a comment left and
  resolved (201, 201), with no failed request. Three new tests fail without the change and pass with it.
- **F1 repair**, `059c0fa07`. The protocol view assembler copied every review comment onto every reviewer. With two
  reviewers each comment showed twice; with none, no comment showed. It now returns them once, as `reviewComments`.

- **F1 repair** (2026-11-05), `adae369de`. Amendments showed a status derived from their dates: under review read as
  submitted, and approved, rejected and implemented all read as "decided". The declared risk impact was never read,
  so "no impact" showed as "not declared". The assembler now reads both, and returns `nextStatuses` from the
  service's own transition table.
- **Reach: amendment changes and status** (2026-11-05), `606ebfd03`,
  `docs/evidence/DESIGN/R1/2026-11-05-protocol-amendments/`.
  - "Add a change" while the amendment is a draft, and "Change status" offering only the moves the server allows,
    through `POST …/amendments/:id/changes` and `PATCH …/amendments/:id/status`.
  - Used in the running app: Draft → Submitted → Under review → Approved, each 201.
- **F1 repair** (2026-11-05), `d3b5d7721`. Each CAPA action carried its deviation's id, so no action could be
  addressed and two actions collided. Each now has its own id. Deviations also carry `closeBlockers`, the server
  closure gate's own reasons. The register mappers moved to `pdev-view-registers.ts`, in the same folder (a split,
  not an addition).
- **Reach: CAPA and the signed deviation close** (2026-11-05), `0c8e8e45f`,
  `docs/evidence/DESIGN/R1/2026-11-05-protocol-deviations/`.
  - New on the deviation card: "Add a CAPA action", "Update status" on each action, and "Close deviation" through
    the platform's one signing ceremony. While the gate would refuse, the close is held and the gate's reasons are
    shown.
  - Used in the running app: the close was signed (201). Its `electronic_signatures` row records meaning approval,
    the reason and password authentication.
  - The first walk caught a request-shape error: the shared ceremony takes `password` at the top level. The unit
    test had encoded my assumption, and now asserts the ceremony's contract.
- **F1 repair** (2026-11-05), `72e36cb06`. The view assembler:
  - derived a milestone's status from its dates, so missed and cancelled read as pending;
  - ran a second urgency rule beside the timeline engine;
  - printed DATE columns as `Date.toString()`.

  It now reads the recorded status, uses `milestoneBucket` (and the second rule is deleted), and prints
  YYYY-MM-DD.
- **Reach: milestone status** (2026-11-05), `6bbd1bafe`, `docs/evidence/DESIGN/R1/2026-11-05-protocol-milestones/`.
  "Update status" on each milestone, with the engine's buckets and the recorded status. Used in the running app:
  First patient in recorded as Met (201).
- **Reach: the protocol's engine reads** (2026-11-05), `docs/evidence/DESIGN/R1/2026-11-05-protocol-engine-reads/`.
  - **Risk register:** the `summarizeRiskRegister` line; the screen's own "extreme" threshold is deleted.
  - **Deviation trends:** `trendDeviations` signals.
  - **EU substantiality:** per amendment, the engine's own sentence, never "non-substantial".

  All three were used in the running app. The trend read's shape was wrong in the first test, and the running app
  caught it.
- **Reach: the stored sizing run and its reproduction** (2026-11-06), `583b96271`,
  `docs/evidence/DESIGN/R1/2026-11-06-sizing-run-reproduction/`.
  - `GET /api/biostat-bridge/computation-runs/:runId/reproduce` had no caller. The design assessment now names the
    run behind the planned N (`sizingRun`).
  - The protocol's Statistics tab says "Stored run #1, 2026-11-06, computed 314 subjects." It offers "Check it
    reproduces" and shows the four facts one by one.
  - **F1, found by the reach:** with RLS enforced, the route answered 404 for the organization's own run. It
    queried a `pool.connect()` client outside a transaction, and the scope layer sets the tenant only after
    `BEGIN`. It reads through `pool.query` now, with a test over the real scope layer.
  - **F1, found walking it:** the protocol workspace gave the shell's `.page-full` row two roots, so at 1440 px the
    protocol had 325 px beside its selection bar. It has one column root now.
  - Used in the running app, with RLS and launch scope on: before the fix, 404; after it, intact, intact,
    reproduced, same engine version.
- **Handed to D4** (2026-11-05). Informed consent exists twice: the `informed_consent` document type, and
  `/api/protocol-consent`, whose 7 routes have no caller. Its element checklist, completeness and signed approval
  are that document type's validation. Under Rule 4 they belong in the one editor, not a protocol panel. Whether
  the two records converge is the D4 owner's or the founder's decision.

**L1 (row D2): the founder's CSR demo** (2026-11-05 and 11-06)

- **Rehearsal**, `4c38889a4`, `docs/evidence/D2-CSR/2026-11-05-lmn201-demo-rehearsal/`.
  - The CSR path walked in the running app as author, reviewer and approver, on the Lumen LMN-201 demonstration pack.
  - It ran from the Vault source's signed approval to assembly's gap list.
  - Found R-1 to R-4 and handed them to the CSR lane (`011Dpx…`).
- **R-1 and R-3 closed** (2026-11-06), `78ce793a7`. The lane fixed them (`b3c176b34d`, `0180e0eec2`). The re-walk on
  trunk confirmed both and wrote nothing.
  - The run-of-show lost its two workarounds.
  - It gained a verified way to show §11.1 and §11.4 live without freezing.
- **Blocked**: drafting, the scientific review of drafted text, e-sign and placement. They need a model key, which
  this environment does not have.

- **Demo-day UI sweep** (2026-11-06), `f05919e54`, `docs/evidence/D2-CSR/2026-11-06-demo-day-ui-sweep/`.
  - Every screen was walked as author, reviewer and approver, with no page error.
  - The AI paths reach the provider.
  - The founder's "model not approved" in the Codespace was a key that never reached the app. The Codespace
    session fixed its start script (`11b191038`).
  - The docked composer's overflow was fixed by the design lead.

**DATA: the Lumen demonstration data** (2026-11-06 to 11-10, at the founder's request: "faux seeded demo examples …
RBM, QMS and more; Vault … and tasking too")

- **Tasks, review, information request, sequence and reports**, `4fad016a5`:
  - LMN-201's board has 16 tasks across every column, with a critical path;
  - the Investigator's Brochure is out for review;
  - a FICTIONAL FDA information request sits in Communication and Respond;
  - LMN-201 has sequence 0000;
  - four computed reports have run.
- **Quality** `dff867c6f`, **risk-based monitoring** `91d6a97da`, **Vault** `893451f02`:
  - every Quality register;
  - RBM: RACT, KRIs, QTLs, signals, the plan and site actions;
  - 25 synthetic documents filed, reviewed, approved and sealed.

  All through the screens' own routes, and idempotent.
- **Task owners by role and a third person**, `893451f02`; **a named demonstration organisation** in
  `seed-admin.mjs`, `98e664c40`.
- **Not finished, handed over:**
  - the founder's Lumen account in the Codespace (design agreed with the Codespace session: identities only from
    secrets);
  - the Vault re-filing on each run;
  - the QMS approver designation;
  - the biotech/mdx QMS signer 409;
  - two RBM product defects;
  - the CSR study's package identity.

  Each is in `docs/evidence/DEMO/2026-11-10-lumen-data-handoff/README.md`.
- **The Lumen account in the Codespace** (2026-11-10, the founder: "Make sure it's set up in the Codespace"),
  `92f589838`.
  - The Codespace creates "Lumen Bioscience (demo)" with its lead, reviewer and approver. The people come from
    Codespaces secrets, with fictional defaults.
  - It seeds the Lumen pack there first, and "Demo access" lands on it.
  - The Vault seed now records an artifact's review before its approval (P-95).
  - Run end to end against a fresh local database; `codespaces:doctor:test` 50/50.
- **"Demo access" chooses who** (2026-11-10, the founder: "a selection of users … tied to demo accounts and various
  scenarios and according to role … this must work in Codespace"), `2a3cb63a6`.
  - The login's existing button gains "Sign in as": every demo person, grouped by account and labelled by role.
  - The Codespace supplies the list from its two rosters (`VITE_DEMO_ACCOUNTS`).
  - Signed in through it in the running app as two people, one in each account.
- **The Vault seed no longer re-files on each run** (2026-11-10): it reads each document's own filing record.
- **The showcase pass on the Lumen account** (2026-11-10, the founder: "get everything ready for a sales showcase of
  the entire platform"). Record: `docs/evidence/DEMO/2026-11-10-sales-showcase/README.md`.
  - Swept as the lead, the reviewer and the approver: every step, rail destination and tab. No failed request except
    the Module 3 refusals for a biologic.
  - Completed through the screens' own routes: the protocol workspace and the sequence's 5 leaves (`7d9112e60`); the
    project teams, a report bundle and two in-platform schedules (`80f5b7c41`).
  - Its own defect, found by reading the screen: the Lumen protocol carried the psoriasis study's eligibility
    criteria. Fixed, with a repair for a copy already seeded (`34ecd2981`).
  - L1: the Codespace installs the fonts report PDFs embed (`4a473cffe`). Before, every PDF export in Reporting
    answered 503 there.
  - Open: the other system packages a Codespace lacks beside the production image (LibreOffice, Ghostscript,
    veraPDF, `xmllint`, python-docx). Not exercised.

**Finding shared with the design lead**

In production `LAUNCH_SCOPE_ENFORCE` defaults to on (`server/services/entitlements/launch-scope.ts:42-45`). So
screens outside the launch scope show "not in this release", and their APIs answer 403. Local runs in development do
not show this. The design lead now walks the demo with enforcement on.

**Earlier, before this plan (now D1's)**

`4a5cc0d22` (2026-10-31): Home leads with the greeting and the composer, and the sidebar gained Search and Recents.
The D1 spec was written on top of it, and D1 owns those files.

**Next**

S3's protocol records are reached:
- review comments;
- amendments: changes, status and substantiality;
- deviations: CAPA and the signed close, and trends;
- milestones;
- the risk summary.

Informed consent is with D4.

Correction to the line written here at first: S5's behaviour is held by RIM (`COORDINATION.md`). So R1's S5
reaches go to RIM as route, caller and test; they are not built here. S3's remaining candidates (the statistics
thread and the SAP's versions, comments and lock in `biostatPlatform.ts`) are a statistical analysis plan, which is a
document type. Under Rule 4 they are a convergence with the one editor, which is D4's or the founder's call, as
informed consent was.

#### F1 — Repairs, for spine step 2: the data room's lineage (session `session_01QoxbLcnW5jPvJSjjKQtvTA`)

**Delivered** (2026-11-05)

- **The founder-path walk is green again**, `e0e32d099`. LX-00 (`tests/lineage/founder-path-lineage.pglite.test.ts`)
  had been red on trunk since 2026-11-01, failing 6 of its 15 cases. Two product changes of that day were right, and
  the walk had not followed them:
  - `3cacf2e15`: a Shadow Review covers only the leaves it read, so the walk's database needed
    `20261025_shadow_review_run_coverage.sql`, and its seeded run needed to name its leaves;
  - `a58029e99`: archiving needs a reason. The walk now states one, and checks the audit row records it.

  It is 15 of 15 after the change. No baseline entry changed.
- **A Data Room upload's bytes survive a deploy and are read from every API task**, `fbc2a1773` (LX-02, the bytes
  half), `docs/evidence/SPINE/S2/2026-11-05-capture-bytes-durable/`.
  - **Before.** Every upload lived only on the serving Fargate task's own disk (`STORAGE_PROVIDER=s3`, up to two
    tasks, no volume). So the other task could not read it, and each deploy erased it.
  - **Now.** The bytes go to the byte store first. The store and object are recorded in
    `file_uploads.storage_provider` and `storage_object_id` (`migrations/20261105_file_uploads_durable_object.sql`),
    and `loadUploadedFile` reads them, for its 30 callers.
  - **Kept.** `storage_path` stays the tenancy key, and the working copy stays for the path-based tools.
  - **Evidence.** Red without the fix and green with it. The walk's baseline went from 13 to 12, and its ceiling
    from 15 to 12.

- **The migration set completes on a non-superuser applier**, `a3d874ae5`,
  `docs/evidence/D1/2026-11-05-schema-create-grants/`.
  - **Before.** `review_route_writer` (`20261023_review_routes.sql`) and `tenant_record_purger`
    (`20261029k_tenant_offboarding_custody.sql`) own SECURITY DEFINER functions but were granted only `USAGE` on
    public. Changing a function's owner needs `CREATE` there. On PostgreSQL 15+ applied as the RDS master (not a
    superuser), every deploy halted at 432, then 454, of 462.
  - **Now.** Each is amended in place (RULE 1), as its three sibling owner roles already were. The set applies 462
    of 462 and replays clean.
- **The Data Room says a refusal as itself**, `b61a8b345`, `docs/evidence/SPINE/S2/2026-11-05-data-room-refusals/`.
  - Not licensed, not in this release, a role, an unconfirmed organization, a project not found and an expired
    session each read as themselves, with no retry, through the one read classifier, as the Vault's read does.
    Only a failure to answer keeps the retry.
  - Used in the running app at 1440 and 390 wide, with the gate's own 403 bodies. The upload change was used there
    too: an adopt after the server's working copy was deleted succeeds from the durable copy, and an upload written
    the old way answers 410.

- **The walk follows the sent package where it is kept**, `131aa7d0c`,
  `docs/evidence/SPINE/S2/2026-11-05-walk-follows-sent-package/`. LX-12's bytes half was fixed on 2026-10-29
  (`3cab286e12`, the kept copy in the byte store, named by `metadata.sentPackage`). The walk still read the staging
  file the send removes by design, so it stayed red. The check now follows the recorded key. It fails on a missing
  package and passes as written. The baseline went from 12 to 11.

**Delivered** (2026-11-06)

- **The local database the repository provisions can run the migration set**, `70d52cc76`,
  `docs/evidence/D1/2026-11-06-local-db-applier-rights/`.
  - **Before.** `scripts/setup-local-db.sh` (run at every session start) gave its applier role `CREATEDB` only. On
    a fresh cluster, `deploy-migrate` stopped at 214 of 462.
  - **Now.** The role gets `CREATEROLE NOSUPERUSER` and owns its database, as the RDS master does. Two fresh
    clusters: trunk's script halts at 214, the fixed one completes (1,023 tables). Every session that must open the
    running app (RULE 4) needs this.
- **The editor's citation catalogue says a refusal as itself**, `f0809d977`,
  `docs/evidence/SPINE/S2/2026-11-06-citation-catalogue-refusals/`. The **Cite a source** picker showed "Module access
  denied" with **Try again** for a plan without the feature. Through the one read classifier, a refusal is now
  worded and not retryable, and the picker offers no retry for it. This completes the D4 hand-off of 2026-11-05.
  All 36 suites that render the editor pass (511).

- **One rule for a refused read, in the panel every screen shares** (D0), `605f9deb5`, and the two editor callers
  converged onto it, `85b401722`. `docs/evidence/D0/2026-11-06-refused-read-one-rule/`.
  - `ErrorState` and `EmptyState tone="error"` take the failed read (`read`, its `{ status, code }`). When the
    read was refused (not licensed, not in this release, a role, an unconfirmed organization, not found, an expired
    session), the panel shows the classifier's words and no retry. A failure to answer keeps the caller's words
    and retry. A call site that passes nothing is untouched.
  - This replaces three per-screen copies of the rule. Two are converged here; the Vault's is handed to its holder.
    The Data Room walk passed again in the running app on the shared rule.
  - **Open, for each screen's owner:** 117 screens still collapse refusals (`03-adoption-list.txt`). Each adopts it
    with one attribute, `read={state} readWhat="…"`. The browser walk caught one of them live: the project page's
    own Data room section (`ProjectHome.tsx:507`), "couldn't load this project's sources", for a refused read.

**Found**

- A fresh machine also needs `postgresql-16-pgvector` and `npm ci` before the session-start hook runs. That is a
  cloud-environment setup script, not a repository change. A personal environment that does this was proposed on
  2026-11-06. The request could not be shown in the Claude mobile app version in use, so nothing was saved.
- `ci:canvas-path` read green all four days the walk was red. Its founder-walk link is static by design; the walk's
  result exists only in CI's Test job. That job can be red for days while every push lands.
- `server/routes/__tests__/authoringSelectedSources.pglite.test.ts` fails 12 cases at trunk, before this change.
- `ctd_onboarding_documents` (`server/routes/ctd-onboarding.ts`, read by `readLocalUploadBuffer`) keeps its bytes on
  local disk, the same class of defect.
- ~~A path-based AnA tool on the other task finds no working copy of an upload.~~ Corrected 2026-11-05: no prompt,
  context builder or tool result gives the model an upload's path (searched `server/services/ana`,
  `server/routes/ana-ri`, the context builders). The only stream read of an upload goes through `loadUploadedFile`,
  which is durable now. The tools' refusal already steers uploads to the file-id tools. Nothing to repair.
- Bytes already erased in production cannot be backfilled. Rows written before this change read as before.
- **LX-06 is half-built under another name.** `draft_authoring_document` takes `sourceReferences` (Vault-document
  receipts). They are verified inside the save transaction and recorded in `provenance.projectSourceReferences`
  with figure and claim checks (`server/services/authoring/authoring-from-draft.ts`). They are not recorded as
  sentence-level spans. The walk passes a differently shaped `sources[]`, so its two `ana-draft` notes are stale.
  Recording spans, and walking the Data Room → Vault → receipt → document path, is S4's work with S2.
- **Handed on.**
  - ~~D3: the Evidence step's "What to do now" box is a retired pattern.~~ Done 2026-11-06 in D3-1 (`a9819177d`):
    the step band is deleted on every step.
  - ~~D4: `editor/useProjectSourceCatalog.ts` does not classify refusals.~~ Done here 2026-11-06 (`f0809d977`).
  - D0: a refusal is drawn in the error tone.
  - R1: the CTD onboarding routes (`/api/ctd/*`) have no caller.
- **The local database.** Running the migration set needs pgvector created by a superuser, `CREATEROLE` on the
  applier, and the applier owning the database, as the RDS master does. `scripts/setup-local-db.sh` does not yet
  set these up.

**Next**

Two items listed here earlier were already done, as found on 2026-11-05: a failed Data Room record refuses with
503, and the client keeps `sourceId`. What remains, file list first:
1. LX-06's span half, with S4: verified receipts recorded as sentence-level spans, and the walk following the
   Data Room → Vault → receipt → document path;
2. LX-12's other half, with RIM, which holds the submission service: a transmittal names its sequence (no
   `sequence_id` on `submission_transmittals`);
3. LX-10's seal half, for the lane working on Authoring's filing path. `633822c083` records each filed section's
   revision. Nothing on the Vault side yet names the seal: neither the Vault row nor its chained audit row carries
   `frozen_documents.content_hash`. That gap is the walk's `file-to-vault/filing-names-sealed-version` and
   `walk-back/vault-leaf-to-seal`.

#### F1 — Repairs: the unverified repair commits, run natively (session `session_01QoxbLb8fV1RgQvaa8JHYku`)

**Delivered** (2026-11-05)

- **The repairs written without dependencies were run for real.** About 45 F1 and CSR commits (2026-11-02 to 11-04,
  author `concept2cure`) were made with no `node_modules` and no network. Their evidence called their tests "pending".
  - **Run.** `npm ci`, then Vitest over the 29 test files they added or changed.
  - **Result.** 555 of 560 at `ccc797bd`.
  - **Passed natively:** the shared-platform repairs, namely the export render snapshot, workspace config and its
    isolation, regional applicability, the submission resolver, navigation entitlements and AnA's context cache;
    and the CSR server checks.
  - **Typecheck.** `typecheck-no-regression`: 0 errors.
  - **Evidence.** `docs/evidence/F1/2026-11-05-unverified-repairs-run-natively/`.
- **The CSR screen's tests**, `7048ea80`. Five were out of date with the screen, not wrong about it: Approve now needs
  the saved text read first (F9); the editor mounts other reads; the board read carries an AbortSignal. The CSR lane
  fixed the same suites on trunk the same day (`9eb24c87`), and its version was kept at the merge.
- **Every launch app is reachable by name**, `57eef8e8`.
  - **Risk-based monitoring.** It is in the catalog and the rail (P-76) but had no navigation target, so AnA's
    navigate, the @ menu and the product tour could not open it. It gets one, for the existing `rbm` surface. The
    tour now stops at it and at Biostatistics.
  - **The calculators' label.** "Biostat workbench" broke the client-copy rule; it reads "Design calculators", as
    the page's own heading does. The old name stays an alias.
  - **The account-menu tests.** Their mocked user had no id, so since `0fc881c1` they never read the navigation
    verdicts.
- **Project home's CSS gates**, `3b04e2e3`.
  - `--danger-000` does not exist, so a failed quality count rendered grey. It is `--error` now, and the phantom-token
    baseline shrinks from 9 to 8.
  - The generated text ramp was stale and is regenerated.
  - One shared action row is no longer counted as a stage-CSS clash.
- **Two more test files red on trunk**, `c0476109`: capabilityBrowser (the same id-less mock user), and
  clientCopyNoProgram ("the program's" study designs, now "the project's").
- Pushed through every pre-push gate (`ca751574..80914b5b`).

**Found**

- `0fc881c1` made the navigation read require a signed-in account with an id. Any test that mocks `useAuth` with an
  id-less user and expects the verdicts is red for that reason, not for a product defect. Two files were found and
  fixed; others may exist.
- The whole v2 client and shared suite (1,253 files) does not finish in 50 minutes with `maxWorkers: 1`. Running it
  in parallel shards beside the pre-push typecheck runs the container out of memory.

**Delivered, second round** (2026-11-05)

- **The whole v2 client and shared suite, run natively**: 1,253 files, 14,017 tests, in three shards. 185 tests failed
  in 31 files. All 31 are resolved on trunk:
  - **8 files**, `721aaf8c`: they mocked a signed-in user with no id (the same cause found above);
  - **16 files**, `968759fd`: they pinned a live read as `('GET', path)`, but it now carries its abort signal. Four
    were also fixed by the parallel sweep (`011Dpx…`) and taken from it at the merge;
  - **3 files**, `8c178e79`: each was out of date with a deliberate change. The template read's signal; the claims
    line derived from the current read; approved-only CSR import (`940098aa`);
  - **2 files**, `24dff50f`: the Apps switch fails closed without a catalog; De Novo is its own pathway;
  - **1 file**, `authoringConversationScopeLive`, fixed by the parallel sweep (`565377a1`);
  - **1 file**, `moduleCatalogReconciliation`, a product defect, `5c2a80f2`. The catalog still seeded
    `agency-meetings` after its surface retired (P-39 step 4), so it advertised a toggle for a screen nobody can
    open, and listed Communication twice. The creating migrations were amended in place (RULE 1). The row and its
    subscriptions are kept and deprecated, and a live grant carries to `communication-center`
    (`folded-module-successors.ts`). This is proven on the PGlite replay (`folded-module-grant-continuity`).
- **`ci:launch-scope` was red in CI** ("expected 8 launch apps, parsed 9"). Biostatistics joined by P-77, so the pin
  reads nine, `5c2a80f2`.
- **Reach and copy.** The Vault's "Ask AnA" row is a named group (`94bc12da`), red before and green after. The launch
  screens' registry notes say what each screen does, not "partially built" or "see ui_kits/" (`7a1d1a45`); every
  launch surface is now held to that.
- **Found to be already done**, with no change needed: AnA's `create_labeling_document` project admission (it is
  pinned by `device-tools-admit-program.test.ts`); `advise_device_readiness` carrying `filedCopyDiverged`; the empty
  state's grey box.

**Found, second round**

- The CSR workflow board (not a launch surface) offers a preview on a draft row. The server refuses it as "approvals
  changed", because the row is approved-only since `940098aa`. Handed to the CSR lane in COORDINATION.md.
- Two sessions swept the same suites at once. The hold in COORDINATION.md stopped it for the last six files.

**Next**

1. The server suites, run natively the same way. This run covered the v2 client and shared suites only.
2. The export repair's open acceptance (`docs/evidence/D2-DOCUMENTS/2026-11-04-render-snapshot/`): real Word and
   PDF output, HTTP refusal mapping and a browser walk.

#### S6 — Vault at Veeva parity, with its F1 repairs (session `session_01KnUGoX3g4R4FWKWGc2sTbN`)

The coordinating session is out of tokens. This session works on with the founder's permission of 2026-11-05 ("proceed
with founder permission but note this in the roadmap and your work") and records its work here under P-100. Its holds
are in `.design/claude-convergence/COORDINATION.md`, in the row "Vault parity (`01KnUG…`)". Since the founder's "use
multiple sub agents", slices are built by agents this session briefs, reviews, re-tests and commits; each evidence
README says which checks the lead ran.

**Delivered** (2026-11-05). Each item was shown red first, then green, on real PostgreSQL where the server changed and
in the running app where a screen changed. Where either was not possible, its README says so.

- **The Vault tells its refusals apart** (S6, `3c84ddc6ac`; `docs/evidence/SPINE/S6/2026-11-05-v1-refusals/`). Not
  licensed, not in this release, the person's role, and not found are each said as themselves, through the one read
  classifier (`readFailureFor`). Only a real failure offers a retry. Before, a plan without the Vault read "You don't
  have access … ask an administrator".
- **A CRO's sponsors never mix in the library** (F1, `7d7e2e3b50`; `…/2026-11-05-v2-sponsors/`). Inside a project,
  "All my projects" is that project's sponsor's projects. The sponsor is read from the project's verified anchor,
  never from the request. Every hit names its sponsor, and the relationship finder stays inside the sponsor.
- **No relationship across sponsors** (S6, `64f33aa859`; `…/2026-11-05-v3-relationship-sponsor/`). The server refuses
  one (409 `OTHER_CLIENT`). One recorded before that is now named in its row as another client's, and can be removed
  (S6 V8, `4b9012b842`; `…/2026-11-05-v8-legacy-relationship-sponsor/`).
- **The organisation's governed artifacts stay inside the open project's sponsor** (F1, `1e83af2c96`;
  `…/2026-11-05-v4-artifact-sponsors/`), and name it.
- **AnA reads only what the person can open** (F1, `ae14ab27b0`; `docs/evidence/F1/2026-11-05-ana-vault-tools-scope/`).
  `read_vault_document`, `list_vault_documents`, `compare_vault_versions`, `get_document_versions`,
  `list_governed_documents`, `read_governed_document` and `global_search` filtered by organisation alone. They now read
  the projects the sharing policy admits the person to and, inside a project, that project's sponsor's, by the Vault's
  own narrowing (`narrowToSponsorOf`, moved into the registry read so there is one copy). An id outside reads as a
  missing id, and a check that cannot run is an error, never an empty list.
- **The project's settings select the Vault's words and proposals.**
  - The header names a 510(k), De Novo, EU MDR or IVDR filing through the portfolio's one alias map (F1, `828626a217`;
    `…/2026-11-05-v6-filing-region/`, part A). The seeded 510(k) read "IVD / Diagnostics".
  - Module 1 proposals follow the project's region (S6 V6, `40af70d8b6`; same folder, part B). An EU or JP project is
    given its own heading from the regional Module 1 record, or none and marked for review, never a US heading. US
    proposals are unchanged.
  - A device or diagnostic filing's Required documents names the filing and points to its outline in the Library,
    with no count, and says why (S6 V7 `8e96c86ed2`, F1 `c0c53d40a4`; `…/2026-11-05-v7-device-coverage/`). It said the
    filing had no required-section list.
- **A device project's Vault offers its own vocabulary** at upload and in the filters: its own evidence kinds, and no
  CTD section for a filing that is not CTD-numbered (S6 V9, `c2d6a9774c`; `…/2026-11-05-v9-device-vocabulary/`).
- **A seal shows what it holds** (S6 V5, `4c00273d06`; `…/2026-11-05-v5-seal-binder/`): each sealed version, read from
  the signed record only, opened through the Vault's audited download. This is D6 §8's "binders as a view".
- **AnA writes only where the person may change the project** (F1, `99666f51b8`;
  `docs/evidence/F1/2026-11-05-ana-vault-write-assemble-scope/`). `update_vault_document` wrote a new version of any
  artifact of the organization. It now writes only within the person's scope (inside a project, its sponsor's), and
  only with the project's edit right, asked on the write's own connection as the Vault's writes ask it.
  `assemble_ectd_module_from_artifacts` read the artifacts of any project the model named; it is held to the same
  scope. The shared SQL fragments of the reads were written out, so SQL text carries no interpolation (F1,
  `67e6d2da94`).
- **The Data Room's filing proposal reads the project's region,** as the Vault's ingest does (F1, `0f583e995b`;
  `docs/evidence/F1/2026-11-05-data-room-region/`). So do the CTD filename detector's Module 1 documents: an EMA
  project's cover letter is proposed at 1.0 and its RMP at 1.8.2, a J-NDA's patent status at 1.4, and an FDA form
  number never another region's heading (F1, `303485d77d`; `docs/evidence/F1/2026-11-05-ctd-detector-region/`).
- **Every other read door an audit found admitting another project's records** (2026-11-05, five slices built by agents
  and re-tested by this session; evidence under `docs/evidence/F1/2026-11-05-*`):
  - AnA's 26 citation routes, including run, batch-run and prune (F1, `11877757f0`; `…-ana-citations-scope/`);
  - MDX search, project sections, the artifacts summary and MCP `c2c_list_projects` (F1, `48c819ebff`;
    `…-listing-doors-scope/`);
  - the governed-documents route's reads, with the project's edit right on its five writes (F1, `2d15e84d5b`;
    `…-c2c-documents-scope/`);
  - evidence retrieval: `searchHybrid` now requires a project scope, so Evidence ask, cortex query and deep-research
    generate rank only the person's projects (F1, `fb1b02634c`; `…-evidence-retrieval-scope/`; real PostgreSQL 23 of
    23);
  - AnA's platform-command executor, `search_all_documents` and `validate_cross_references`, sharing one scope helper
    (F1, `02ae648720`; `…-ana-command-executor-scope/`).
  - `update_vault_document`'s stated reason is read on its own path again (F1, `3d9eae7298`); an earlier refactor
    here had broken `governed-reason-not-invented.test.ts`, which no pre-push gate runs.
- **Trunk red fixed:** `catalog-actor-scope-wrapper.test.ts` (7 of 11) had a stale mock (S6, `81fbd0702b`;
  `…/2026-11-05-catalog-actor-scope-mock/`).

**Found**

- **Retrieval no longer reaches atoms of no project.** Derived evidence learnings, chat uploads and project memory
  were ranked organization-wide; scoping them by program is the next step. The command executor's `list_projects`,
  `load_user_context` and `list_milestones`, the citation health route and `search_all_documents`' TMF arm are still
  organization-wide (each slice's "Not done here").
- **A pharma "Risk management plan" is left unfiled.** The device risk-file rule claims the name first and has no
  pharma folder; "RMP" reaches the CTD detector. An ISO 14971 plan and a Module 1 RMP share the name, so which rule
  claims it is a classifier decision, not a one-line fix.
- **The Vault cannot place a document at an eSTAR section** (`filingVocabularyRefusal` accepts CTD codes only), so a
  device filing's outline has no count. This is the MDX journey's lane.
- **Founder questions:**
  - Should the cross-sponsor view with no project open, which today is labelled by sponsor, exist at all for a CRO?
  - Should device coverage follow the rule pack's mandatory flags or the eSTAR mapper's per-device slots? They
    disagree on D4 and D6.
  - Should a seal say when a sealed version has since been superseded? Today it says only what was sealed and whether
    that is intact.
  - Renditions, editable binders and per-client-type retention stay founder decisions (MR-08 Stage 6 step 4,
    `VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`, FD3).

**Next**

1. Answers to the founder questions above, which decide this lane's next slices.

**2026-11-10: P-107 item 3, and what this lane withdrew.** The coordinating session decided this lane's six
questions as P-107 item 3 (2026-11-08). While this lane built them, the session holding the Vault's folders
(`…01QoxbLZMS`) landed three of the same decisions on trunk: the page asks which sponsor first (`47a306700`), a seal
says when a version was superseded (`0a65d9191`), and a Word version's PDF rendition (`ed9f5d36d`, `b5bb39ce8`). One
implementation stands: this lane withdrew its own copies before they reached trunk (`e2c4162ec`) and kept only what
trunk did not have.

- **The server refuses a read that would span clients** (F1, `6dac0b836`; S6, `cc1af9221`;
  `docs/evidence/SPINE/S6/2026-11-10-p107-sponsor-first/`). A governed-artifacts listing or a library search with no
  project is one client's, or `409 CLIENT_REQUIRED` with the clients named. The document picker asks which client;
  a refused listing says why. Red on real PostgreSQL first.
- **One rule for which sections a 510(k) or De Novo requires** (F1, `9cff33fe4`;
  `…/2026-11-10-p107-device-coverage-estar/`). The Library asks the eSTAR mapper, as filing readiness does, with the
  project's device answers. The D4 and D6 disagreement is gone on the read side; the pack's data is not changed.
- **The converter does not request what a Word file links to** (F1, `4cc352ccf`;
  `…/2026-11-10-p107-renditions/`). Measured with the real converter: an uploaded Word file made the server call an
  address. Trunk's rendition hands uploads to it, so this is its only protection (P-121 item 4, open).
- **A Risk management plan in a drug project is the dossier's** (S6, `8e5f7cd0b`; `…/2026-11-10-rmp-classifier/`).
  P-121 item 1.
- **Assessed, not built.** Retention (P-107, FD3 (c)) holds today: the database refuses to delete or re-point a
  version, and the sweep only tombstones. Nothing names who may delete stored bytes; the smallest pin is the writers
  gate (`scripts/ci/check-vault-document-writers.mjs`) listing the six `delete` call sites. Binders: folders and the
  cabinet meet three of the decision's four properties; a version-pinned view is the seal, which could group what it
  holds by folder.

**Next: the TMF inside the Vault.** The founder, 2026-11-10: "I don't see the TMF on the vault UI anywhere." It was
decided on 2026-10-30 (P-74, P-75: the eTMF lives inside the Vault and files against the project's study) and
designed (`docs/design/ETMF_CONVERGENCE_2026-10-30.md`, slices E1 to E6). Only E1 landed (`3fa2b6febc`). No session
holds it. This lane takes E2 on, with the screen brought into the Vault's own views (RULE 4) and not admitted as a
screen of its own.

#### S6 — The Vault's folders and filing binders, like Veeva's (session `session_01QoxbLZMScz1c2iFESBLn9J`, 2026-11-06)

Started by the lead (`011Dpx…`) for the founder's ask of 2026-11-06: *"a Vault user interface, files, folders … just
like Veeva … templates and folders for the full IND pyramid of potential filing types across all the therapeutic areas
and regions … Anna needs to have autonomous control over all of this, agentically."* Evidence:
`docs/evidence/SPINE/S6/2026-11-06/` (README with "What already exists", before/after screenshots, walks, audit rows).

**Delivered 2026-11-06: step 1 of 4, plus most of step 2** (S6 `b3abbe5b`, `daaaae1d`; R1 `061fc4a8`, `3c7cd5eb`).

- **Folders a person makes.** `public.document_folders` (it existed, reached only by the uncalled legacy `/api/folders`)
  gains `program_id` and `parent_key` (`migrations/20261106_document_folders_project_scope.sql`, additive, in the set
  before the sweep pair). `server/services/vault/vault-folders.ts` holds the project's folder index and the governed
  writers; POST `/api/c2c/project-vault/:id/folders` and `/:id/folders/:folderId/rename`. Each change writes a chained
  audit row with who, when and the reason (required). The Vault's header has **New folder** (made in the folder open
  in the tree) beside **Upload a folder** (the old "Add a folder", which uploads); a person's folder has **Rename**;
  "Move to…" lists every folder at its depth. Placement, upload-into-a-folder and folder export accept any folder of
  the index. Walked in the CSR study's Vault: made in 5.3, renamed, `adsl.xpt` moved in, three audit rows.
- **The cabinet is the filing's binder.** It is the active rule pack of the project's document class (the
  scaffolder's own resolution, `document-class.ts` + `rule-pack-lookup.ts`): a US IND gets FDA Module 1 and CTD to
  section; an NDA, MAA (EU Module 1), 510(k) (eSTAR A–G), EU MDR and IVDR (Annex II) each get their own pack.
  Folder ids: preset (`module-3`), binder heading (`bn:3.2.S.4`, which also records its CTD section), a person's
  (`uf:12`). A row filed to a module preset shows at its CTD heading. With no pack, the folders stop at module level
  and the cabinet says why (`note`).

**Continued 2026-11-10: steps 2–4 landed, and a multi-tenant repair** (the founder: "the UI doesn't reflect all the
Vault features yet … this is a multi tenant environment").

- **Step 2, walked** (`walk-binders.cjs`): an IND, NDA, MAA, 510(k), EU MDR and EU IVDR project each open on their own
  binder, now **first in the tree** (it was below every authored document's draft outline), with the outline and its
  version named. An EU MDR file no longer lists the empty US "510(k) submissions" and "PMA submissions" folders.
  The record pane names a binder or person's folder, not its id. (R1 `844b7de191`, S6 `d208ba8f68`.)
- **Step 3, the pyramid in Vault** (S6 `d208ba8f68`, R1 `844b7de191`, S11 `a36449dd90`): a binder folder lists the plan
  tasks bound to it with their status (`VaultPlanWork.tsx`, from `GET /api/v1/pyramids/by-project/:id`); a plan task's
  CTD binding opens its binder folder in the Vault (`vault.open-folder` takes an exact `folderId`). Walked both ways.
- **Step 4, AnA** (S6 `c80d21ae3b`, S4 `7d918fe90e`): `list_project_documents` returns the project's folders;
  `place_project_document` files into any of them and can make a folder first (`new_folder`), through the Vault's
  governed writer with AnA's provenance. Her filing stays a suggestion a person confirms. Run live on the database
  under RLS (`ana-step4-live.txt`); not walked through a conversation here, which has no model key.
- **Multi-tenant repair** (F1 `9d01cdb37b`): the organization-wide `/api/folders` route listed, renamed and deleted
  folders by organization alone, so once projects had folders a CRO member (a viewer included) could see another
  sponsor's project folder names, or rename or delete one with no audit row. It now never reaches a project's folders.
  Shown red first. Project folders are reached only through the project's Vault route, under that project's access.

**Continued 2026-11-10, second pass** (the founder: "Fix all and then prepare for GA"):

- **A person's folder is moved and removed**: Move and Remove beside Rename; POST
  `/:id/folders/:folderId/move` and `/remove`. Remove takes only an empty folder. Found live: with no person in the
  database scope, row security hid a folder's file and it counted as empty; removal now refuses unless the database
  confirms the session can read the project's documents. Walked (`walk-folder-moves.cjs`).
- **Search's folder filter** takes binder headings and people's folders; it refused all but presets.
- **Two trunk reds repaired** (F1): `.qms-rowacts` declared twice (`ci:check-css-selector-shadowing`);
  `project-settings.pglite.test.ts` injected its failures on a connection the route no longer takes (38 of 38 now).
- **Readiness for GA** is written down in `docs/evidence/SPINE/S6/2026-11-06/GA-READINESS.md`: what is proven in this
  lane (154 server files / 2,683 tests, 76 client files / 850 tests, the two-tenant row-security check on
  `document_folders`), and the 18 blockers `ga-readiness-report.mjs` reports (8 of 42 ready), none of which this lane
  can close: deploy secrets and switches, licences, model qualification, and the founder's rows D1, D9, D10.

**Continued 2026-11-10, third pass: the Vault decisions of P-107 item 3** (`docs/evidence/SPINE/S6/2026-11-10/`):

- **A seal says when its version has been superseded**: "Superseded by version n on date", read from the version
  chain beside the seal's signed record, never in place of it. Red first; walked.
- **With no project open, the Vault asks which sponsor first**; nothing of any sponsor is listed or read until then,
  and afterwards the server narrows from the verified sponsor. Red first; walked. Found walking: the list's `ws` is
  the segment, not the sponsor.
- **Retention (FD3 c) already holds** (`retentionCron.ts` refuses destruction); **binders** are the folders above.
- **A Word version is viewed as a PDF rendition** through the one converter, bound to the source's SHA-256, audited
  with both hashes, made on request and never stored, so it is never filed in place of its source. Red first; walked.
- **Open, not held:** device coverage converged onto the eSTAR mapper; renditions of formats other than Word.

**Open, for the next session:**

1. AnA over folders walked in a conversation, once a model key is present.
2. A J-NDA or Health Canada NDS project is refused at intake, so those binders cannot be shown in a project.
3. Org-level folders (`/api/folders`) have no UI and no caller: keep or retire is a founder decision.
4. Search selects send one value per filter (several arrive through a saved view); the library search's project
   filter (`programId=`) is never sent.
5. Stop the app before `git push` (the full typecheck runs out of memory beside it on 15 GB).

#### L1 (row D2) — CSR drafting with the person in control, and the running-app walk of its screens (session `session_01T2wooCZu46W7msw4TJuuzr`)

Design: `docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md`. **Handed off on 2026-11-08.** The note for whoever
picks this up is `docs/evidence/D2-CSR-DRAFT-CONTROL/HANDOFF.md`: what landed, the open work in order, the blockers, how
to verify and walk, and what was handed on. Its row in COORDINATION.md holds no file.

**Delivered** (2026-11-06)

- **CSR slice 2, the server half** (spine step 5; RULE 2), `7799a5b0a`,
  `docs/evidence/D2-CSR-DRAFT-CONTROL/2026-11-06/slice-2/`.
  - In a CSR results section, a figure in AnA's draft that the study's engine did not produce can no longer be
    accepted.
  - Each draft, alternative, revision and passage alternative carries its figures, from the saved-CSR verdict's own
    figure step. That step (`planSections` in `csr-saved-evidence.ts`) is exported, not copied.
  - The accept re-runs the check on the text the person accepts. In §2 and §10–13 it refuses with 422
    `CSR_FIGURE_NOT_FROM_ENGINE`, naming each figure, and writes nothing.
  - A results section with no receipts says "not checked", never "passed".
  - The accept's audit row names the option set ("alternative 2 of 3, concise").
  - Proof: red 10 of 11, then green 11 of 11; 6 of 6 mutations killed.
- **CSR slice 2, the panel half**, `199f1cd28` and `d8330538b`, in the same evidence folder:
  - each draft names its figures;
  - the accept, a chosen paragraph or a passage replacement is held while a figure the engine did not produce still
    stands in the text;
  - with no receipts, the panel says "not checked against the study's engine output";
  - the accept sends the option set.

  Proof: red 12, then green 70 of 70; regression 53 files and 728 tests; 8 of 8 mutations killed.
- **The running-app walk, finished except what needs a model key**, `891e1884b` and `aa211c406`, in the same walk folder.
  - Works: the drafting panel opens and refuses honestly with no provider, at 1440 and 390. Reporting's device section
    (F4), Projects' activity line and the device Client Review Room (F6) work, and both retired ids resolve.
  - Fixed, then re-walked: focus now returns after a draft request; the panel shows no internal section id.
  - Handed on:
    - every section of the seeded C2C-101 Quality Overall Summary reads `draftingRegionState: unavailable`, which holds
      drafting there;
    - five workbench suites are red since `53b179b99`;
    - two D4 layout issues, at 1440 and 390.
- **The running-app walk, started**, `468ee75a5`, `docs/evidence/D2-CSR-DRAFT-CONTROL/2026-11-06/walk/`. P-72 slice 1a
  re-owned the pre-auth lookups (`ae12195a5`). Sign-in and the reset request work through them in the running app, as
  the runtime role with RLS and the launch gate enforced, at 1440 and 390 px. The wrong-password and wrong-code
  refusals read as themselves.

**Earlier, before this plan** (2026-10-29 to 10-31, launch rows D1, D2 and D6):
- CSR drafting slices 1 (`7b4a16cf8`) and 3–4 (`0f4bc4f2c`);
- P-72 slices 1a and 1b (`ae12195a5`, `a06ae96c8`);
- folds F4 and F6 (`970bc3637`).

All were proven by tests. Until this walk, none was opened in the running app.

**Found**

- `ci:launch-scope-api` is red on two client paths outside this lane: `ReviewThreads.tsx`'s
  `/api/concept2cure/:p/:p/reopen`, and `/api/biostat-bridge/computation-runs/:p/reproduce` (`583b96271`).
- `ci:lineage-save-gate` is red on the CSR lane's `server/services/csr/csr-section-review.ts`.
- The sign-in pages render the light page under the dark scheme. Whether they should follow it is D1's to decide.
- Real drafting needs a model key, and this environment has none.
- The account's monthly spend limit stopped this session's agents on 2026-11-06.

**Next** (in order; details, files and the binding decisions are in the hand-off note)

1. With a model key, walk the figure gate live on an imported CSR's §11.4.1, with revise and passage alternatives. No
   cloud environment here has a key; the Codespace lane runs with the founder's.
2. Slice 4b, adding a paragraph after an existing one: a block-boundary insert in `editor/suggestions.ts`, which is
   D4's editor.
3. Slices 5 (review by keyboard, after an accessibility review of the keys), 6 (progressive arrival) and 7 (citations
   for chosen paragraphs).
4. P-72 slices 2–7. Before slice 6, the tenant chain verdict must walk in the tenant's own scope.
5. The purge-residue classification (design only), and the independent re-checks of P-72 slice 1a and CSR slices
   3–4.

**Handed on, open at hand-off** (re-check first):
- the seeded C2C-101 QOS drafting hold (`authoring-draft-region-projection.ts`);
- five workbench suites red since `53b179b99`, 46 tests at `f9631c065`;
- D4's two layout issues and `onReviewSection`.

At `f9631c065`, every suite of this lane passes.

#### D3 — The project page (session `session_01QoxbLcnW5jPvJSjjKQtvTA`, from 2026-11-06)

The founder asked this session to take over and finish the project page's work. The spec is
`.design/claude-convergence/D3.md`, in four steps (D3-1 to D3-4).

**Delivered** (2026-11-06)

- **D3-1, the page's frame**, `a9819177d`, `docs/evidence/DESIGN/D3/D3-1/`.
  - The main column holds the header, AnA's composer, the project's conversations, the steps and the step body.
    The side column is "Project knowledge". The main column is 764px on every step.
  - The header is the name with a settings button, a byline of the filing, region and indication, and the
    objective of record (S1) under it.
  - The composer offers the open step's suggestion. A suggestion fills the box and never sends.
  - The steps are D0's segmented control. The step band ("What to do now", "Next step") is deleted, and its
    guidance is the step's suggestion.
  - Project settings opens as D0's drawer, with focus held and returned. Its governed save and archive are
    unchanged. This is the settings half of D3-3.
  - Nothing lost: the byline's client type, code, phase and ordinary status or priority are facts in Project
    knowledge. The ledger is in the README.
  - Walked at 1440 and 390, light and dark. The walk found three defects, fixed in the same commit:
    - at 390 the name was squeezed to 0px wide beside the settings button;
    - a page opened by its address said "Client type: not recorded" for an IND;
    - the empty composer was 229px tall, because its spacer carried the page class `.sp` (also on trunk).
  - 79 of 80 project suites pass. The remaining failure is `projectHomeStageCss`'s clash case, which fails on
    trunk too; this change leaves one clash fewer. The retired-name ratchet is at 0 for `pj-stageband` and
    "What to do now".

- **D3-3, the team and the settings request**, `6cd6d7c92`, `docs/evidence/DESIGN/D3/D3-3/`.
  - The team was a section of Plan only. It is now a Team card in Project knowledge on every step. "Manage" opens
    a Team drawer with the same roster, sharing controls and refusals, and the authority note once.
  - The drawer closes on a project, account or organization change, so no sharing control from a previous scope
    stays on screen.
  - Project settings opens on the field a request names. About's "Edit" opens it on the description.
  - The card and drawer reuse the one team read and the existing components, in their own file. Three unused
    `.pj-team` rules became the card's.
  - 10 cases were red against D3-1 and are green here; 80 of 81 project suites pass, the remaining failure as on
    trunk. Walked at 1440 and 390, light and dark.

- **D3-2a, Project knowledge on every step**, `8225e3075`, `docs/evidence/DESIGN/D3/D3-2a/`.
  - The side column is the same on all six steps: About, Filing, Team, Work areas, What AnA knows, Skills,
    Records. The readiness card, Skills, Memory and Instructions were on Author only, and Records was a section of
    Author.
  - Filing carries the readiness figure, which opens Author, and each market's line, which opens Submit.
  - Work areas and Reports are rows of one card. What AnA knows and Records are cards of closed disclosures.
  - No read is added. 36 cases were red against D3-3 and are green here; 80 of 81 project suites pass, the
    remaining failure as on trunk. Walked at 1440 and 390, light and dark.

- **D3-2b, one read for several readers (work and agency inbox)**, `900e6eb44`, `docs/evidence/DESIGN/D3/D3-2b/`.
  - The project's unified work and agency inbox are each read once by the page. They were read again on every
    step change: per task panel, and only inside Respond.
  - The Filing card says the open agency letters and the next response due. The Team card says each person's open
    work and next due date, with work no one on the team holds; a failed read is said once.
  - 4 cases were red against D3-2a and are green here; 82 of 83 project suites pass, the remaining failure as on
    trunk. In the running app eight step changes made no read of either, counted at the network.

- **D3-2b, second half**, `e84c4f1ef`, `docs/evidence/DESIGN/D3/D3-2b/`. The Filing card says the project's
  commitments to the agency: open, overdue and next due. They are read once, by the verified integer project id.
  The audit feed is the Records card's last disclosure, "Activity", on every step. The records read is lifted with
  its second reader in D3-4. Walked: "Commitments: None open" from the real route, and three acts under Activity.
  - Found, not D3's: `projectCreationDoors.contract` (Vault.tsx's Projects index door) and `projectDestination` fail
    on trunk. They follow the Vault session's `adb1c00cba` and `5144702d21`.

**Hand-off** (2026-11-08). This session leaves D3 here and holds no file. The note for whoever continues is
`docs/evidence/DESIGN/D3/README.md`: what is done, D3-4's exact starting points, the three suite failures that are
not D3's, and what tripped this session. S12 (work projects), offered to this session by the lead on 2026-11-06, was
not taken and is unassigned. It runs through the same files, so whoever takes D3-4 or S12 holds `Project*.tsx`
first.

**Not done in D3-1, for the lead**

- The objective as a composer suggestion (D3.md §4.4 item 5.1). S1's objective already offers "Ask AnA to propose
  it" on every read, so it was not offered twice.

**Next**

1. D3-4: the step bodies (§4.7). Plan holds Tasks and approvals (sorted by due date), and a Tasks handoff opens
   Plan. Evidence gains Protocol, lifting the records read. Author shows Module completion without the ring. Submit
   and Respond use the calm section pattern, and Respond lists Commitments from the page's one read. This includes Tasks and approvals on Plan, the Tasks handoff opening Plan, and
   Module completion without the ring.

#### F1 — the project page's walk findings, closed (session `session_01QoxbLcnW5jPvJSjjKQtvTA`, 2026-11-10)

The D3-4 session's acceptance walk handed four findings to other owners. None of their files is held, so this
session took them under F1.
- **The inbox's "Draft response with AnA" is a quiet button**, `d4a3934b7`,
  `docs/evidence/F1/2026-11-10-inbox-draft-button-quiet/`. The list is one component in Communication, the HAQ
  manager and Respond, and it put a filled orange button on every open letter. It is now `cc-btn sm` like its
  neighbours. It was red on trunk and is green (42 tests); in the running app each view keeps one orange.
- **"install-fresh refuses `ctd_cross_references`" does not reproduce on trunk.**
  `docs/evidence/F1/2026-11-10-install-fresh-ctd-cross-references/`: on an empty database the install and then
  deploy-migrate both exit 0, and the table is policied through `csr_studies`. The report fits a partial install
  with pgvector absent. No code change.
- **Already fixed on trunk, by others:** Tasks hands a project task to Plan (`stage: 'plan'` in
  `TaskBoard.tsx` `publishNativeTaskHome`), and the `documents` alias follows Vault (`projectDestination`,
  `projectCreationDoors.contract`: 32 of 32 pass).
- **Left with its owner:** the demo seed's Lumen pack recorded on other projects' data rooms (DATA).

#### L1 (row D4) — the validation package re-executed at head for GA (session session_01QoxbLcnW5jPvJSjjKQtvTA, 2026-11-10)

Record: `docs/evidence/W3/2026-11-10/README.md`; dispositions: `docs/validation/VSR-001-VALIDATION-SUMMARY-REPORT.md`
§21. Nothing was added to the product and no product file was changed.
- **Executed on a fresh installation** (`c2c_oq_w3_20261110`), RLS enforced as `app_service`, launch scope enforced,
  unattributed API paths refused as in production, no AI provider, a development build. IQ-001: 12 pass, 0 fail,
  3 deviation.
- **First execution**, at `83e61866d3` (`673987be66`): OQ 99 pass, 26 fail, 6 deviation, 31 not executed of 162.
  Every failure classified (`cea8c9976f`).
- **Whole-package re-execution**, server at `97a0fec5cf` (`1907e5c241`): 143 / 8 / 8 / 3. The eight classified, four
  protocols revised and re-run (`cf2706d5cf`).
- **Final: 170 pass, 0 fail, 8 deviation, 2 not executed, of 180 steps**, over eight protocols. All 34 failures of the
  two executions were a step overtaken by a recorded decision or a runner defect. No product regression was found.
- **OQ-007, Reporting & analytics**, the seventh launch app, which had no URS or protocol (`445c79bf90`):
  `docs/validation/URS-008-REPORTING-ANALYTICS.md`, `docs/validation/OQ-007-REPORTING-ANALYTICS.md`,
  `tests/validation/oq/reporting/`. 17 pass, 0 fail, 1 deviation.
- **TM-001** regenerated: 132 requirements, 120 pass, 4 partial, 0 fail, 6 open, 2 uncovered. RA-001 v0.25 assesses
  Reporting (`4c7ded950c`).
- **D4 stays red.** The package is unsigned and is not ready for signature. It still needs: execution on a production
  build with the audit signing, seal and anchor keys; an AI provider (PQ-passed) for two steps; three fixtures (a
  critical CMC contradiction, a Module 3 whose every section can be approved, an organisation on a lower plan); the
  URS revisions for the requirements withdrawn from this release (URS-PROJ-007, URS-AUTH-014's organisation store,
  URS-SRDY-004 and -005, URS-QMS-011 and URS-QMS-012's plan half), through change control; PQ; review and the system
  owner's signature.

#### F1 — the founder path's seal hop: what blocks it, and the citation the check now counts (session `session_01QoxbLcnW5jPvJSjjKQtvTA`, 2026-11-10)

The founder-path walk (`tests/lineage/founder-path-lineage.pglite.test.ts`) is 6 of 15 at head. Its seal hop is
refused 409 `INDEPENDENT_CHECK_REQUIRED`, and the seven cases behind it do not run. Read from the code and run, not
inferred:

- **No model has passed PQ, so nothing AnA writes can be released.** Every entry of
  `server/services/ai-governance/approved-models.ts` reads `pq: { status: 'pending' }`. A document holding
  machine-written text is signed for review, frozen or approved only with a gateway receipt naming a PQ-passed model
  pin (`governed-machine-claims.ts` `ordinaryMachineGenesisMayRelease`, RULE 2). Production refuses high-risk
  drafting for the same reason. This is the gate working, not a defect.
- **What stands before a PQ run**, from `npx tsx server/eval/pq/run-pq.ts --preflight`:
  - `PROTOCOL_NOT_APPROVED`: PQ-DRAFT-001 needs the founder's signature (P-31);
  - the RAG bank holds 18 of 30 positive items, none with reviewed source evidence, and 5 open gold checks;
  - 18 source versions and 4 publishers' terms are unverified;
  - a product provider key.
- **The source review is blocked on network access.** `server/eval/rag/guidance-corpus-manifest.json` verifies a
  source by downloading the issuer's own file. Every issuer host is refused from a cloud session, by curl (403 on
  CONNECT) and by web-fetch (seen again 2026-11-10 for `database.ich.org`, `www.ich.org`, `www.fda.gov`,
  `www.ema.europa.eu`). The hosts are `database.ich.org`, `www.ich.org`, `www.fda.gov`, `www.govinfo.gov`,
  `www.ecfr.gov`, `uscode.house.gov`, `eur-lex.europa.eu`, `www.ema.europa.eu`, `ema.europa.eu` and `ask.gpo.gov`.
  The session's environment must allow them, or the review is done from a machine that reaches them.

**Delivered**

- **A registered citation grounds the figure it is cited for** (`eee0aaa0be`,
  `docs/evidence/F1/2026-11-10-registered-citation-grounds/`). The independent check reads a citation as
  `[citation: <name>, <locator>]`. No pattern matched it, and the sentence splitter cut the label apart, so the
  product's own citation grounded nothing while a typed `[1]` did. The figure stayed a hard finding nobody could
  resolve. Red first (5 cases), then 61 of 61; 686 pass across the 26 suites that use the checker. A citation in
  another sentence, an empty label, and a citation not registered to its section still ground nothing.

- **A person can replace a machine-written sentence in a section that holds a citation** (`f3567a6f03`,
  `docs/evidence/F1/2026-11-10-cited-section-rewrite/`). A cited section let no machine sentence be rewritten or
  deleted, and a sentence could not be rewritten and cited in one save: the lineage gate refused each with
  "unsupported markup". It now accepts a prior machine span whose words are gone or still the machine's. Red first
  (4 cases), then 24 of 24; 557 pass across the 30 suites around the gate.

**Found, not fixed here**

- A person still cannot put a citation into a sentence AnA wrote and keep the sentence (422
  `MACHINE_LINEAGE_FORMATTING_UNVERIFIED`). That is deliberate and is pinned by five tests: the machine's words do
  not become a person's by a citation.
- A deletion that leaves an unchanged machine sentence of the same span unmatched is still refused (the pinned limit
  in the same evidence).
- The check does not read the figure spans `draft_authoring_document` records from its Vault receipts
  (`sourceReferences`), so a figure AnA verified against its source still reads as uncited (LX-06's remaining half).
- `server/services/ana/__tests__/sub-agent-toolset.test.ts` "no input of any child tool or check names a path" fails
  on trunk. **→ Anna runtime (`01KZK3…`).**

**Next, in order**

1. The founder: approve PQ-DRAFT-001 or say what it still lacks; supply the provider key; allow the issuer hosts.
2. D4: finish the RAG bank and the source review once the hosts are reachable, then run the PQ.
3. The walk follows the path a person can take before a model is qualified: rewrite AnA's text, cite the source,
   run the check, review, sign, seal, file. That restores the seven cases behind the seal hop.

#### D3 — The project page, D3-4 (session `session_01FTWcmXm7At3ZXBE5VWn6oS`, from 2026-11-08, P-107 item 7)

- **D3-4, the step bodies**, `d50c5f07e`, `docs/evidence/DESIGN/D3/D3-4/`. It completes the six items of the
  hand-off by path; nothing new.
  - Plan holds the one Tasks and approvals, by due date, with the status in words. A Tasks handoff opens Plan.
  - Evidence gains Protocol from the lifted records read.
  - Author's Module completion is led by the figure line, with no ring.
  - Submit's doors are small, and "Add a market" is ghost.
  - Respond lists the commitments to the agency, and its Fulfil opens the existing dialog.
- 36 cases were red on trunk's source and are green. 918 of 919 project tests pass; the failure is trunk's own
  `projectHomeStageCss`.
- D3 §6 was walked whole in the running app: C2C-101 and the NeuroPanel-Dx 510(k), at 1440 and 390, light and dark,
  every step, with no failed request.
- The walk found and fixed:
  - a Tasks handoff dropped under React.StrictMode;
  - module rows whose count was cut off;
  - overflow and sub-44px touch targets at 390;
  - the Filing card's broken label.
- Also fixed in D3's tests, both red on trunk: the Vault-door tests now follow the founder's `5144702d21`, and a
  biotech-plan fixture follows `3d9879dfc`.
- **Found, for other owners** (COORDINATION.md row):
  - `install-fresh.mjs` refuses `ctd_cross_references` (no RLS policy);
  - the demo seed writes the Lumen pack's GMP deviations into other projects' data rooms;
  - `AgencyInbox.tsx`'s orange draft button;
  - `TaskBoard.tsx`'s `stage: 'review'`;
  - the `documents` alias still sends a no-project visit to Projects.

**Next:** S12, work projects (P-83, §1c), in the same files.

#### F1 — saved conversation handoffs (Codex continuation, 2026-11-06)

**Delivered**

- `931e287429`, with nullable-writer type correction `ae825ca1b7`,
  `docs/evidence/F1/2026-11-06-recent-conversation-handoff/`.
  D1's existing sidebar/palette could select B while A was open without loading B;
  it dropped the saved-thread URL and parked the selection for a later visit.
  The shell now delivers the choice through its existing conversation identity
  and canonical URL. Selecting the current thread preserves its composer and
  unsent text. The existing active-answer refusal is shared with shell preflight,
  before a remount can discard a follow-up. Refused requests do not replay.
  The type-only correction uses the existing nullable handoff contract without
  touching D3's held global declaration; its emitted JavaScript is identical.
- 178 focused tests and the production build pass, with no new lint errors or
  warnings. The running app was used at 1440 and 390 px, light and dark, with
  project context retained. Separate, explicitly synthetic SSE checks verify
  pending-answer refusal and fresh retry; no provider/model drafting was exercised.
- No new screen, card, editor, canvas, route, service, table, tool or dependency.
  The changes finish `V2App.tsx`, with the existing refusal factored into
  `routing.ts` and reused by `ConversationThread.tsx`. File holds are released.

**Next**

Plain generic navigation to the conversation, with no saved-thread selection,
can still drop its saved-thread URL suffix. It is a separate D1/F1 repair;
the saved-selection slice does not change it. Other packages retain their owners
and holds in `COORDINATION.md`; no package is marked closed here.

#### R1 / S2 — Quality through the project evidence workflow (Codex, 2026-11-06)

The existing Quality work area already sits beside RBM, CMC and Biostatistics. Its native records now feed the
existing project source catalogue, shared document builds and Compliance & Audit Assurance Pack, with current
project/object access, immutable snapshot lineage and truthful lifecycle/approval qualifications. The existing
TaskBoard retains native Quality source links and canonical project placement, including training readers,
delegated periodic approvers and same-date numeric CAPA/action reassignment.

Source: `1e904a0550`, `b25fd60fb7`, `98661f418b`, `11e4252671`, `f92b2be3f7`, `f4c230dfac`, `bb79304fa2`.
Merged with origin `7d771e124a` in `b97d50039d`. Node 22 merged checks: tasking 18 suites / 302 tests,
source boundaries 8 / 83, reporting 10 / 118; full compiler zero and production builds pass. Actual project
catalogue → task/Quality and catalogue → one editor flows were used on desktop/mobile; a structure-only build
retained its native source receipt. The reporting flow passed 27 live checks, including readable PDF and complete
sealed native data/provenance. No model generation, signing, approval, filing or external delivery is claimed.

Evidence and the pre-implementation “What already exists” inventory:
`docs/evidence/DESIGN/R1/2026-11-06-quality-core-workflow/README.md`;
`docs/design/QUALITY_CORE_WORKFLOW_2026-11-06.md`. No app, screen, table, API mount, editor, generator, AnA tool or
dependency was added. Quality's register project filter/QP3 and the observed mobile tab overflow remain with the
current Quality/Project holders in `COORDINATION.md`; their held files were not edited. The same source/task/build/report
contract is the completion pattern for the existing CMC, RBM and Biostatistics owners; parity is not claimed.

#### L1 (rows D1/D2) — the founder's Codespace sets itself up (session `session_01QoxbLaF89iYd7wC96owa7t`, 2026-11-06 to 2026-11-08)

**What already exists.** `.devcontainer/` (image, `post-create.sh`, `post-start.sh`), `scripts/db/provision.mjs`,
`scripts/seed-admin.mjs`, `scripts/ops/codespaces-doctor.mjs`, `scripts/demo/launch-demo/`,
`scripts/cre/fetch-cdisc-pilot-adam.mjs`, the CSR walk in `docs/evidence/DEMO/2026-11-05-csr-lifecycle/`, and the
Codespaces doc `docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md`. Each was completed, not replaced. Holds:
COORDINATION.md, row "Codespace setup".

**Delivered**

- **The Codespace installs, provisions and starts itself**, `67ed113e`, `6cbe22d4`, `6c3104c0`, `020af067`.
  - post-create: `npm ci`; PostgreSQL 16 + pgvector, from the distribution or else PGDG; a UTF8 cluster on localhost;
    `npm run db:provision`; fictional demo accounts through `seed-admin.mjs`.
  - post-start:
    - re-provisions, which applies new migrations;
    - starts `npm run dev` on 5000 as `app_service` only, behind the unchanged doctor/boot gate;
    - reports "serving" vs "ready" from `/readyz` itself;
    - seeds the demo packs;
    - prepares the CDISC pilot CSR study up to frozen study data, stopping before the build that spends the
      founder's key.
  - The owner credential lives only in `~/.concept2cure-codespace/owner.env` (0600, outside the repository). It is
    read only inside `c2c_with_owner_env`, which `codespaces-startup.test.mjs` pins.
  - Evidence: `docs/evidence/HUMAN-TEST/CODESPACE/2026-11-06/`, with a clean run, a Chromium walk and screenshots.
- **The founder's Anthropic key is checked against the approved drafting versions**, `dc47119b`. post-start runs the
  doctor's no-charge model list and names which of `approved-models.ts`'s drafting versions the key can see. A key
  that sees none is `ANTHROPIC_DRAFTING_MODELS_NOT_VISIBLE`.
- **CI runs the Codespace as GitHub builds it**, `0282619e`, `5c7a61e0` in `.github/workflows/ci.yml` (job
  `codespace`, plus `workflow_dispatch`). The job runs the devcontainer image, post-create and post-start, then checks:
  - `/readyz`;
  - the forwarded-origin sign-in;
  - that no owner credential is in the app;
  - that every connection is `app_service`;
  - that a second start keeps the app.
- **Defects found and fixed** (all in `.devcontainer`):
  - `4c49406c`: an app started before the key arrived kept running keyless, which is the founder's "model not
    approved". post-start now compares its keys with the server process's own environment and restarts the app.
  - `4c49406c`: without `OPENAI_API_KEY`, search (Vault, knowledge base, project memory) is down. The doc asks for
    both keys.
  - `daec6680`: after the zod 3→4 lockfile change, an existing Codespace crashed at boot. `npm ci` now re-runs when
    `package-lock.json` changes.
  - `daec6680`: seven fictional people instead of three. The demo seed re-runs when `scripts/demo` changes.
  - `fe3bdced`: the demo organisation's idle sign-out is 120 minutes, set through the governed
    `PATCH /api/tenant-config/:id/settings`. Real tenants keep their own setting.

**Not done, with the reason**

1. **The image's PostgreSQL install has not run end to end anywhere.** In the image, post-create passed `npm ci` and
   the 39 tests, then stopped at `deb.debian.org`, which this session's proxy refuses.
   - Two routes remain. The founder can allow `deb.debian.org`, `security.debian.org`, `apt.postgresql.org` and
     `www.postgresql.org` for a cloud session from claude.ai on a computer; the mobile app cannot show the request.
   - Or CI run `42182651894` executes. On 2026-11-06, Actions was about 21 hours behind.
2. **The second signer is not passed to `--pack all`.** `scripts/demo/launch-demo/packs/biotech-qms.mjs`
   `settleStatus` approves a draft without first routing it to review. The server refuses that with 409
   `QMS_INVALID_STATE`; mdx is the same. Once the DATA owner fixes it, add
   `OQ_SIGNER_EMAIL="$DEMO_REVIEWER_EMAIL" OQ_SIGNER_PASSWORD="$DEMO_SIGNER_PASSWORD"` to the seed line in
   `post-start.sh`.
3. **R1's Lumen organisation for the founder** is R1's change in these files, not yet pushed as of this entry. Agreed:
   - identities only from Codespaces secrets: `C2C_FOUNDER_EMAIL` (required, or the step is skipped),
     `C2C_FOUNDER_NAME`, `C2C_LUMEN_REVIEWER_NAME` and `C2C_LUMEN_APPROVER_NAME`;
   - addresses on `@lumen-demo.example`;
   - the owner credential stays inside `c2c_with_owner_env`.

   When it lands, set the Lumen organisation's idle window too: `c2c_set_idle_window <founder email> 120`.
4. **No real model output has been seen in a Codespace.** No session had a key. The founder's first run, with both
   keys, is the qualification.

#### D7-D — Reporting & analytics on the work-area pattern, with its F1 repairs (session `session_011HLkYCajohxJ4HxpcfSiU6`, lane L11)

**What already exists.** The surfaces are `client/src/concept2cure/v2/surfaces/Insights.tsx` (`insights`),
`InsightsCatalogPanel.tsx`, `insightsLibraryShared.tsx` and `ComplianceReports.tsx` (`compliance-reports`), with
`styles/insights-v2.css`. The digest renderer is `server/services/report-os/render/render.ts`. Nothing new was added:
no screen, route, service, table or component file.

- **D7-D steps 1–9, as `.design/claude-convergence/D7.md` §D.4 lists them** (2026-11-02):
  - `f58089a336`: steps 1–2, one column and the page header;
  - `209a8964bf`: steps 3 and 5, the find row on `.c2c-input` (a plain search field, not the composer's look, P-91)
    and a quiet result;
  - `fc9dbb57a7` and `81faf1bda2`: steps 6–7, Preview plan as a `.seg` in the Catalog, and `.tabs`;
  - `002ab41e13`: steps 4 and 8, starters, the HS-1008-1 facts as the sub's second sentence, packs as `.pj-card`s,
    and the not-computed list as a disclosure;
  - `44f574f70e`: step 9, Audit & compliance reports' back link.

  Dated notes in D7.md §D.4 record each place where the build differs from the spec: steps 3, 4, 6 and 10.
- **Running-app evidence** (`e124af0812`, `a9dbe72512`): `docs/evidence/DESIGN/D7/2026-11-02-reporting/`. It is a
  git-archive copy of `9bd593c346` on its own port, captured at 1440 and 390, light and dark: 16 captures with
  probes. §D.6 holds:
  - one column;
  - the find field after the header;
  - one orange fill;
  - no page overflow and no script errors;
  - the readiness sentence never says "ready" with a gap open.
- **What the running app found, fixed:**
  - `9bd593c346`: an unnamed back link, Find dropping under the field at 390, 19 orange Run buttons in the
    Catalog, and a basis tag widening Audit & compliance reports by 4px at 390;
  - `7ce21a6c8f`: Export PDF was a second primary;
  - `854bceccd5` (F1): packs are offered by the project's filing type, so an IND is no longer offered the BLA pack,
    and the page says why;
  - `4f9966c841` (F1): the digest printed a raw `not_ready` and made its own wording. It now speaks through
    `shared/regulatory/readiness-statement` and shows a "Critical gaps" tile.
- **ProjectBack convergence** (2026-11-08):
  - `23238cd9ad` (D0): `ProjectBack` takes the `name` its screen read, rebuilding the coordinator's unpushed
    `c4fcb90a7`. `dataConnect.tsx` is the coordinator's hold ("change only through D0"), so the change is D0's,
    as that session designed and approved it, and the release is noted in COORDINATION.md;
  - `eac4aaff16`: ReportingHead now uses it, with insightsOpenProgram red before and green after.

  This closes Reporting's half of D0-7.
- **Other repairs:**
  - `ef94805978` (F1): finalize's signing-authority test;
  - `66819a2460` (F1): the lineage-trace test's stale argument list;
  - `66ce445d7b`: D6 evidence corrected, five loose queries and not a regression;
  - `f49c747814`: P-91 recorded.
- **Found, and handed on:**
  - The device readiness scorecard (`server/services/market-specs/device-readiness-scorecard.ts:58`) uses the same
    five words with no critical-gap rule, and AnA receives its level raw (`AnaToolExecutor.ts:10594`). Routed to
    the MDX journey session (`01P6GW…`).
  - CMC's `CmStarters` puts `aria-label` on a role-less `div`.
- **Next:**
  - C-3, the report-pack register tables (P-91, `Plan: L1`). They need `scripts/db/migration-set.mjs` and the RULE 1
    replay and drop-safety work, shown red first. It is not started, because the coordinator's file hold can't be
    asked for while it is unavailable.
  - Re-walk Reporting in the running app at the current head. The ProjectBack switch has jsdom evidence only.
- **Update, 2026-11-08 (later the same day):**
  - **C-3 landed** (`Plan: L1`, P-91): `aadca02cc7` and `17315d82fd`, with evidence
    `docs/evidence/L1-C3-REPORT-BUNDLE-REGISTER/2026-11-08/`.
    - `public.report_bundles`, `report_bundle_runs` and `report_bundle_projects` replace the `bundle:<uuid>`
      memory path, which is deleted.
    - A blank database built by install-fresh plus deploy-migrate applies it twice, and
      `tests/db/report-pack-export.dbtest.ts` passes 8 of 8 as `app_service`.
    - **Missed, and fixed by the coordinator:** the three tables were not in the tenant purge list
      (`PURGE_CHILD_TABLES`), so `ci:purge-coverage` went red. The fix is `360d4de53d`, pushing at the time of
      writing. A new org-keyed table goes into that list in the same commit, and `ci:purge-coverage` is run on a
      blank database before the push.
  - **Running-app re-walk** (`aaec73f581`, `docs/evidence/DESIGN/D7/2026-11-08-reporting-rewalk/`). The shared
    back link and the Bundles tab hold. It **found** the page saying "4 critical gaps outstanding" beside a digest
    that said 23. That is fixed in `c37e5c8f6b` (F1, red first): the orchestrator cut the critical list to four
    before it was counted. All 24 captures at `c9e45ef009` pass.
  - **Two stale tests, red on trunk since `98661f418b`** (the assurance pack gained an engine):
    - `b29a5b1d66`, suggestion-service;
    - `e67f9fe798`, insights-canvas-catalog.

    Each is shown red with the engine removed.
  - **Next:**
    - Nothing open in D7-D's steps.
    - The Bundles screen's "Choose legal companions for ZIP" is reached but was not walked to an export.
- **Update, 2026-11-09:**
  - **The Bundles actions, walked in the running app** (`docs/evidence/DESIGN/D7/2026-11-09-bundles-zip-walk/`).
    - It **found** five buttons that `9bd593c346` had left unstyled: the two Export PDFs, the legal-companion
      chooser and the two stationery buttons. They are fixed in `f4c27a3495` (D7, red first), each now
      `btn ghost rl-card-run`.
    - At 390 the open chooser pushed the page sideways by 10px. Its one-line primary ZIP button was the cause. Fixed
      in `61498ef0bf` (D7): the chooser's fieldset may shrink, and a button in it may wrap. The walk at that commit
      measures 0 at 1440 and 390, with no script errors.
  - **Next:**
    - Nothing open in D7-D's steps.
    - A ZIP export with a legal original selected is not walked: this database has no legal original to select.
      `tests/db/report-pack-export.dbtest.ts` covers the export on real PostgreSQL.
  - **S11 step 6b, the global schedule in Reporting & analytics** (`Plan: S11`: `c0729896d7`, `3707064475`; evidence
    `docs/evidence/SPINE/S11/2026-11-09-global-schedule/`).
    - One row per project the reader can open, on one shared axis, sorted by target date: the work, the filing, the
      agency's clock dashed to its goal, the next phase, and today.
    - It is read from the portfolio line's batch read, which now also carries the filing, start and clock. Nothing is
      computed in Reporting.
    - It is reached by "When does each project file?" and the find field, on every plan.
    - Red first: the route test 2 of 28, and the new client test 9 of 9. Green: 62 files, 633 tests. Type check 0.
    - Walked at 1440 and 390, light and dark, over five projects (four created through the API). It **found** the
      review clock painted solid, in the Plan step too, and fixed it in `3707064475`.
  - **Reporting used in the running app** (`docs/evidence/DESIGN/D7/2026-11-09-reporting-use-walk/`). The walk ran a
    report from the Catalog, exported, finalized, opened Run history, bundled a pack and scheduled. It found five defects,
    each fixed red first:
    1. Finalize was offered on a run the gate always refuses, and refused only after the password. `b2d51f911c` (F1):
       the rendered read returns `finalEligibility`, and the reason stands in Finalize's place.
    2. Run history answered 500 on a database installed before 2026-10-13: `0014_report_os_foundation.sql` was on no
       deploy path. `22256c6750` and `76c6f63c3a` (L1) put it in the set. It was proved on the earlier-installed
       database and on a blank one, each replayed.
    3. A schedule showed a type id and a database id. `e710bc3d3f` (D7).
    4. Twenty Catalog buttons were each named "Run", and the same for Open and Pause. `8a1feba597` (D7).
    5. Run history and Schedules overflowed the page at 390. `2135d3f9dd` (D7).
  - **A finalize that succeeds, walked** (the Research Administration Scorecard, the one report here a finalize admits).
    It found two more defects:
    6. The signature's meaning was a stored token on the screen and in the PDF, with a raw ISO time in the PDF.
       `39d5f74d32` (D7) and `0e5706a308` (F1): the dialog's meaning names, and the canonical manifestation time.
    7. A reopened sealed run showed no seal line. `e8e3c63093` (D7): it shows the line when its seal verifies.
    8. Opening your own Account panel reset Reporting with an "original account" notice. `52f0b562b9` (D7) fixes the
       words. The same-account reload belongs to the shared session hook and `authService.refreshUser`, and is routed
       to their holders.
  - **The pack ZIP's legal chooser, walked with a registered original:** it refuses a letter whose Vault version is not
    yet approved, and says why. Approving it through Vault and the ZIP with it are not walked.
  - **The production pre-deploy step** for 0014 is written into the evidence and pointed at from
    `docs/runbooks/protected-release-setup.md` (`3964cb4b64`, `f681dfb1a8`).
  - **Held, not pushed:** all of the above, at the coordinating session's request, until its demo freeze lifts after
    23:00 UTC. 0014's preflight would stop a Codespace start on a group membership whose group and project disagree.

#### L1 (rows D7, D6) — prior filings read back as filed state, and archive names checked where they are read (session `session_01Gx2fiwvxaXi6mQgddPqMaG`, 2026-11-01 to 2026-11-02)

**Delivered**

- **A sequence filed elsewhere reads back as filed state** (MR-10 Stage 9, slice 1). `90f1c747`, with three
  consumer tests repaired in `013250f8`. `server/services/legacy-importer/filed-sequence-reader.ts` reads an eCTD
  3.2.2 sequence from its bytes: `index.xml`, the regional backbone, `index-md5.txt` and every checksum. It produces
  the leaf manifest the platform's own compiles store (`SequenceLeafManifestEntry`). A round-trip test shows that
  manifest folds through `loadFiledStateBySubmission` into the same filed state as the platform's own sequences.
  `detector.ts` was converged onto it, and filename guesses stay suggestions. Evidence:
  `docs/evidence/MR-10/2026-11-01-filed-sequence-reader/`; design:
  `docs/design/FILED_SEQUENCE_READER_2026-11-01.md`.
- **Three independent reviews, and every finding fixed.**
  - First round: 35 findings, fixed in `7e7fae33` (33 of 37 new cases failed first).
  - Second round: fixed in `24694d13`. 16 of 18 cases failed first; one hung until killed.
  - Draft review: the last of 24 confirmed issues fixed in `be491687`. A grouped-form pointer
    (`../../nda999999/…`) must climb through this application's own folder.

  Each new guard was removed in turn and turned a test red.
- **The upload guard checks each zip name where its readers read it** (row D6, SEC-17 follow-up), `ab29caae`.
  `server/services/archive/safeZip.ts` checked the central directory's name, but JSZip reads the local header's
  name and a Unicode Path field's. So a crafted zip naming `/x` passed. It is now refused at every caller. Evidence:
  `docs/evidence/D6/2026-11-02-zip-names-checked-where-read/`.

**Found, for other owners**

- **P-99 (RIM).** `readFiledSequenceArchive` already re-derives a sequence's leaf manifest from its exact bytes,
  deterministically, refusing what it cannot verify. Re-deriving an unrecorded sent sequence from its kept bytes can
  reach it rather than build a second reader (RULE 3).
- **Trunk is red on 2026-11-08** (CI run `42515637919` at `c88d89239`):
  - 20 Lint guardrails;
  - every test shard;
  - integration tests;
  - the secret scan;
  - the tenant-purge ratchet.

  Among them, `ci:audit-logs-fixture` names four fixtures whose `audit_logs` lacks the audit writer's columns, so
  their governed writes roll back:
  - `rbm-approval-signature.pglite.test.ts`;
  - `regulatory-correspondence-project-scope.test.ts`;
  - `governedActionApprovalTenantPinned.test.ts`;
  - `ana-vault-tools-project-scope.pglite.test.ts`.

**Next, and what it waits on**

- **Stage 9's next steps wait on founder decisions:**
  - where an imported prior filing is recorded (a migration);
  - whether the Vault admits `.zip` (decided 2026-11-09: it does, P-112);
  - whether the ICH and regional DTDs are vendored for validation.

  The reader holds no file now.
- **Not examined:** duplicate names in a zip directory (`safeZip.ts`, "Not done here").

#### F1 / S10 / S5 — RIM: what the agency holds is what was sent, and the queued filing work (session `session_011e42DEAR2U6W51Mjvgfgbt`, 2026-11-01 to 2026-11-09; updated after repairs A to C)

**Delivered**

- **What the agency holds is what was sent** (F1 slice 1, rows D7 and D2). `090f62af1`, with `72f2a942d`. It was pushed
  as `33aa3f08a..72f2a942d` with every pre-push gate passing.
  - The transmit guard (`server/services/submission-gateways/index.ts`) stamps the dispatch binding and the leaf
    manifest of the package it sends, server-side and before the wire, on the transmittal row it already writes.
  - The fold (`server/services/ectd/prior-sequence-loader.ts`) reads each filed sequence from the one transmittal its
    attempt binds.
  - A caller can no longer put a forged binding or manifest on a row.
  - Older sends read from their compiles, labelled as such. A sent sequence with neither record is refused, by name, on
    the filing path.
  - No migration and no new file. Evidence: `docs/evidence/D7-ECTD-FILED-STATE-VIEW/2026-11-01-filed-is-what-was-sent/`.
- **A stale Submission Center test** (F1). `28b287602`: it now pins the market-support read's method and path. It had
  been stale since `c3794c8fe`. Evidence: `docs/evidence/D7-SUBMISSION-CENTER-NEW-FROM-PROJECT-TEST/2026-11-02/`.
- **S10, the blind second reading** of the letter splitter's 177 questions in 49 letters.
  - The package is `a0b2b6701` (`docs/evidence/S10/2026-11-02-blind-reading-package/`).
  - The coordinating session's reading is `3bc851c5b` (`docs/evidence/S10/2026-11-02-blind-reading/`).
- **Founder decision P-106 recorded:** the ten uncalled IND lifecycle routes are retired.
- **The designs for the work queued below** are filed in `docs/evidence/RIM/2026-11-08-designs/`. Each was critiqued
  and revised, with the founder's and the coordinator's answers appended.
- **A send to the agency's test environment is not a filing** (F1 slice 2, row D7). `eac69256c`, pushed as
  `3b246e848..8b8052539` with every pre-push gate passing.
  - A staging send or a staging MDN leaves the sequence 'pending'. The production send of that sequence files it with
    a fresh signature, and the fold reads the production transmittal.
  - A staging failure after the wire voids its signature and only then releases the claim.
  - The client names where the package goes, in words, and says a test send is not a filing.
  - Four review lenses ran on 2026-11-08. One fail-closed defect was fixed: a void that failed still released the
    claim.
  - No migration and no new non-test file. Evidence: `docs/evidence/D7-TEST-ENVIRONMENT-SEND/2026-11-01/`.
- **A transmit signature names the environment it was given for** (F1, row D7). `facc62cba`. A signature given for a
  test send can no longer authorize a filing, and one naming no environment is refused (21 CFR 11.50, 11.70).
  Evidence: `docs/evidence/D7-TEST-ENVIRONMENT-SEND/2026-11-08-signature-environment/`.
- **3b slice 3 (b) and (c)** (the filing-types session's edits, applied by RIM). (b) `63e51b02e`: a regional device
  project is refused at the submission creators. (c) `61ab17676`, with `7429f6391` for the size ceiling: compile,
  status and validate refuse a project that is not an application with 422 `ECTD_NOT_APPLICABLE`, and a project that
  filed keeps its filed-state view, read-only (P-97). Evidence: `docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/
  increment-3/s3b-creators/` and `s3c-doors/`.
- **Repairs A to C** (F1, row D7), each red first with mutations:
  - A, one live sequence per number. `2c0b4c8fe`, with `8b77f2dd3`. `createSequence` locks the submission in a
    transaction and refuses a number a live sequence holds, and a removed sequence no longer moves through a
    transition. Proved on real PostgreSQL under RLS, races included. Evidence: `docs/evidence/D7-SEQUENCE-NUMBER-ONCE/2026-11-08/`.
  - B, readiness only for a live sequence. `cec19b461`. A removed sequence is answered not found, by its number, never
    as ready. Evidence: `docs/evidence/D7-READINESS-LIVE-SEQUENCE/2026-11-08/`.
  - C, the IND routes answer the service's own status. `0f5db6192`. `fail` maps through `SUBMISSION_ERROR_STATUS`;
    its four-code copy, which answered 16 refusals 500, is deleted. Evidence: `docs/evidence/D7-IND-ROUTE-STATUS/2026-11-09/`.
  - Every one was pushed with every pre-push gate passing (`3bf14573d..1744ec925`, `1744ec925..0f5db6192`).

**Found**

- **No git hooks in this session's container (2026-10-18 to 2026-11-02).** `core.hooksPath` was empty, so pushes from
  it skipped `.husky/pre-push`. Hooks were installed on 2026-11-02. The seven ungated commits, `0308ee257` to
  `408b0b481`, were checked by the coordinating session: nothing broken.
- **A compile of a sequence already sent silently lifts slice 1's refusal.** `server/routes/ectd-compile.ts` has no
  check that the sequence was sent. The P-99 design's first commit closes it.
- **The corrected R1 inventory's two "probable" callers of the IND diff and manifest PDF routes are false matches.**
  `IndLifecycle.tsx` posts only letter and report PDFs. The record is
  `docs/evidence/RIM/2026-11-08-designs/p87-p106-ind-routes-caller-check.txt`.
- **The splitter.** An oracle run of trunk's G3 over 1,261 inputs found 3,288 violations of its verbatim contract. The
  blind reading found four classes for S10 to fix red first.
- **A void kept only in the tamper-proof log was reported as 'voided'.** Gate 1 reads only the chained row, so such a
  signature stayed in force. This was fixed in slice 2 for every refused step.
- **A transmit signature was not bound to its environment.** The sign payload carried `{intent, meaning}` only. Fixed
  in `facc62cba` (above).
- **The project monitor counts a removed sequence as a filing head** (`server/services/projects/schedule-of-events/
  service.ts`, `projectFilingHeads`). After repair B such a project reads 'unavailable' rather than "no filing
  target". The one-line patch is with the coordinating session.
- **`gateway-selection.test.ts` has been red on trunk since `5c5b89836`.** Its pool mock refuses `connect()`. This is
  reported to the coordinating session.

**Next, in order** (the coordinating session's order of 2026-11-02, with P-103 and P-106 added; slice 2 is done)

1. F1, in the coordinating session's order of 2026-11-08: P-93, P-94, P-86, P-92 with P-99, then P-96. P-93's four
   open questions went to the coordinating session on 2026-11-09; the build proceeds on its design's defaults.
   - P-86 is carried under L1, as the founder's record files it (launch row D7). Its C1, the signed retirement and
     the database's removal guard, landed on 2026-11-09, and so did C2 (the door and its precheck) and C3 (on screen,
     at the foot of the Dispatch tab), after D7-A2 (`docs/evidence/D7-SEQUENCE-RETIREMENT/2026-11-09/`). Owed: C1b,
     and a walk of a test-sent 0000 where staging credentials exist.
2. P-87 with P-106 (R1).
3. P-103, the submission-ops package routes.
4. S10.

3b slice 3 and repairs A to C are done (above).
7. S9 with P-88.
8. P-104's client-owned authority accounts for S5.

Several decided designs still have open questions with the founder and the coordinator; each design lists them.

#### D5 / S7 / F1 — CMC and Biostatistics work areas; the figure engines measured (session `session_01GJidg5q1KFNfFT2VZyjcqw`, 2026-11-01 to 2026-11-02)

**What already exists (RULE 3).** `CmcModule.tsx` with its nine tabs and 21 register forms, `Biostatistics.tsx`,
`BiostatWorkbench.tsx` with 29 deterministic engines, `biostatBridge.tsx`, `biostatEngineResult.tsx`, the §WA
work-area pattern (D5-0) and the labelled-figure lexicon with its seven consumers. Nothing below is a new screen,
route, service, table or AnA tool; one file was split and one shared component adopted.

| Slice | Commit / evidence | Verification and limit |
|---|---|---|
| D5-0, D5-1, D5-2 | `943b78cb7`, `94f24dba0`, `97c66423f`; `docs/evidence/DESIGN/D5/2026-11-01/` | The work-area pattern in CSS, then CMC onto it: tile groups retired, one state vocabulary (`cmcStateWord`), halves and starters. |
| D5-3a | `cac363bfb`; `docs/evidence/DESIGN/D5/2026-11-01/` | Biostatistics' frame and the document as an artifact. Measured at 1440: orange fills 4 → 1, uppercase 81 → 0, sideways scroll +8px → 0. |
| D5-3b | `e0534a80f`; `docs/evidence/DESIGN/D5/2026-11-02-d5-3b/` | The design assessment and the governed documents. Walked against a REAL design seeded through `POST /api/study-design/persist`: 137 subjects, 90% power, "Inadequate", 4 of 10 checks; gates EST-001/PWR-003/PWR-006/MTH-001/MIS-002/POP-001 moved from printed text into each row's `title`, the input record likewise. Both governed writes still open their reason form. |
| D5-4 | `2505ca402`; `docs/evidence/DESIGN/D5/2026-11-02-d5-4/` | The design calculators as a work area. Filled primaries 4 → 1 (the chosen engine of 29 was one of them); `.pj-card` inside the work area 4 → 0; one input height. Assurance computed 0.771146 live. |
| D5 shared back link and ask-row name | `428795100` | `ProjectBack` (D0-7) replaces two private copies; `role="group"` on CMC's and Biostatistics' ask rows — an `aria-label` on a role-less div has no accessible name. Each shown red on exactly that mutation. |
| F1 — the labelled-figure lexicon | `docs/evidence/F1/2026-11-01-labelled-figure-lexicon/` | Recall over 15 PubMed phase-III abstracts, on a committed re-runnable corpus: 20% → 47% of governed sentences. One false positive removed (`\bOR\b` under `/i` read the English "or" as an odds ratio). The table split to `intelligence/labelled-figures.ts`; all seven consumers unmoved. |
| F1 — two figure engines, measured not converged | `dac3acbbc`; `docs/evidence/F1/2026-11-02-two-figure-engines/` | The arm/event frame the lexicon lacks already exists: `truth-engine/clinical-claims/` (8,476 lines) models study, population, arm, measure, scope, endpoint, effect type, scale, interval. Three callers reach it; `POST /api/submissions/:id/consistency` does not, and reads the narrow lexicon over the same input. Per sentence the lexicon labels 47%, the claims engine frames 0% and SEES 91%; fed whole documents, 3 framed and 428 unframed. **Routing the check at the claims engine today would report LESS, not more** — it refuses without a frame, correctly. Convergence is a RULE 3 decision and was not taken. |

**Found, not fixed.**
1. **A GxP screen promises a refusal that does not happen.** The Specifications tab says "A limit whose method is
   not validated cannot be approved" and renders a banner saying the same. `POST /api/cmc/specifications/:id/approve`
   checks not-found, already-approved, signing authority, re-authentication, reason and the ledger — never method
   validation; the banner disables nothing. `noMethod` is `!method`, i.e. "no method name was typed", not "the named
   method is not validated": a specification naming a method whose register row is still `development` passes.
2. **The spec → method → result chain is joined by free text**, not by reference: `qc_testing.test_method` is text,
   `qc_testing.specifications` is JSON, `qc_specifications.testParameters[].testMethod` is a string. Hence the
   capability engine must refuse when criterion *strings* disagree, and a spec revision does not flag the results
   judged against the old limit.
3. **No CMC data is read out of a document.** No extraction, LIMS, ELN or instrument integration;
   `certificate_of_analysis` is a text reference. `source-evidence.ts` records provenance to a Vault version, it does
   not ingest. Every register row is typed, or committed from AnA's guided interview.
4. **This container was a week stale**, so 18 CMC suites failed to load on `z.string().guid` (a zod 4 API) against an
   installed zod 3.25.76 while the lockfile said 4.6.7 (`76adba84d`). `npm ci` fixed it; the repository was never
   broken. 1,714 server and 374 client CMC/biostat tests pass at `bc5a34030`.

**Continued 2026-11-08/09 — found item 1 fixed, and roadmap phase 4 accepted.**

| Slice | Commit / evidence | Verification and limit |
|---|---|---|
| F1 — the method gate the screen promised (found item 1 above) | `7092a0b80`; `docs/evidence/F1/2026-11-08-specification-method-gate/` | `POST /api/cmc/specifications/:id/approve` now refuses a limit whose analytical procedure is not shown fit, **before** the signer's password. `specificationMethodVerdict` refuses only what it knows is unfit: `METHOD_NOT_NAMED`, `METHOD_NOT_FIT` (a status in neither `METHOD_VALIDATED` nor `METHOD_SUITABLE`, named with its status), `METHOD_NOT_IN_REGISTER`, `METHOD_NOT_VERIFIABLE` (an unreadable register is an outage, not the signer's data being wrong). The ICH Q2 vocabulary moved to the module that owns the field it reads, so the Q2 check and the approval gate cannot disagree about what "validated" means. Two screen strings corrected: the banner counted "no validated method" over a condition that is "no method recorded". Shown red on the route with the gate removed — **all three refusals returned 200**, the defect exactly as shipped. |
| F1 — the ceremony stays at the signed write | in `7092a0b80` | `ci:sign-ceremony` refused two attempts to extract the approve handler's preamble, and it was right to: `checkSigningAuthority` and `verifyReauth` are both in the handler, authority first, with only the approvability read extracted. Two tests pin the order a status code cannot — the approvability check back inside the transaction still answers 409, and authority after the password still answers 403; only those assertions go red. The complexity the extraction was buying came from naming the handler's tenant read instead (`signingTenantOf`, which keeps this route's deliberate `Number()`-not-`parseInt` reading: a malformed tenant `'7abc'` is refused, not read as tenant 7). |
| S7 — the 2.3 cites Module 3's records and procedures (phase 4 clause 3) | `05adc9e78`; `docs/evidence/S7/2026-11-08-qos-shares-module3-atoms/` | `ComposedSection` carries the atoms (`lineage`) and the `method` register rows (`structuredPayload.sourceObjects`); the QOS builder received the sections and dropped both, keeping only `inputSectionKeys`, which names sections rather than records. So a figure in 3.2 could be traced and the same figure in 2.3 could not, and the QOS closed with "Full data and analytical methods are provided in Module 3" — printed whether or not a procedure was recorded, naming none, while the composed *Analytical Methods* table reached the 2.3 by no route at all. Both are now **derived from the sections the builder is given, never read again**, so the 2.3's records are the 3.2's by construction; `loadProjectAnalyticalMethods` was deliberately not used, because two reads that agree today are two sources of truth. Six mutations, including the two shipped rules themselves. |
| S7 — phase 4's acceptance fixture (clauses 1, 2 and 4) | `6e7ed6073`; `docs/evidence/S7/2026-11-08-phase4-acceptance-fixture/` | One named small-molecule US IND, payloads built by the **real write-through mappers**, with every cell of both batch and both stability tables asserted whole-table by equality. OOS is flagged in the tables (`declared pass — the recorded result is OUTSIDE its recorded acceptance criterion`; `out of specification (computed)`; `OUTSIDE`) and in all four narratives, which count the comparisons, name the failing point, withhold the stability conclusion, file the 24-month claim as unsigned, and decline to report a trend from three points. The QOS shares that fixture's eleven atoms and its one procedure under both headings. The P-28 boundary is admitted once and refused four ways. Five mutations red. |

**Found, 2026-11-08/09.**
5. **A hand-written canonical payload is not what the registers write.** The acceptance fixture's first draft recorded
   `storageCondition` and `timePoints` directly and §3.2.S.7 came back 0% complete, missing
   `drugSubstanceTimePoints` and `drugSubstanceStorageCondition` — side-scoped keys only `mapStabilityPayload` emits,
   and only for a study whose recorded scope covers that side. Every fixture payload now goes through the real
   mapper, so a mapper that stops emitting a key fails the acceptance run too.
6. **A reference-standard qualification is excluded from the batch series twice**, at the write
   (`mapQcTestingPayload` stores `isBatchAnalysis: false`) and at the read (`isBatchAnalysisFor`'s vocabulary check).
   Either alone suffices for this fixture, so removing only the read-time check leaves the acceptance run green. The
   read-time check governs rows written before the write-time rule existed, so both are kept; recorded rather than
   presented as a passing mutation.

**Continued 2026-11-09 — the demo seeded and walked, and four defects the running product showed.**

The three demo slices and the D0 adoption were tested against the real engines and not against a running product.
They then were: `npm run dev` on this container, the real database, the real seed as the signed-in account, and the
screens opened at 1440 and 390.

| Slice | Commit / evidence | Verification and limit |
|---|---|---|
| S7 — the D0 refused-read rule in CMC | `b672bc5b6`; `docs/evidence/D0/2026-11-09-cmc-refused-read/` | Six panels, the export-readiness chip and the Overview meta line (which said "could not be read" above a panel saying "not enabled for your organization"), plus `CmcRegisterLinks.tsx`. Two panels deliberately unchanged: `meta.sectionsUnreadable` / `portfolioUnreadable` arrive on a **200** board, so there is no refused read to classify. 47 cases; 25 red before. **Found, not fixed:** these panels carry no retry CONTROL — a real retry needs a refetch on `DataState`, which is D0's shared primitive. |
| DATA — the demo records what the sections read | `2480efeb7`, `179dcac46`, `5e5ad0a01`, `67e590b44`; `docs/evidence/S7/2026-11-09-demo-cmc-*` | The analytical procedures its specifications name (without which every demo specification became unapprovable the moment the morning's gate landed), the drug substance and drug product, the release results that ARE §3.2.S.4.4 / §3.2.P.5.4, and C2C-201 — a fictional small molecule, the one demo programme whose Module 3 this product composes. |
| S7 / F1 — what the live run found | `aa4ba6461`, `67e590b44`, `1f0cca737`; `docs/evidence/S7/2026-11-09-demo-cmc-live-run/`, `…-specification-per-attribute/`, `…-cmc-walk-c2c201/` | Four defects, two mine and two shipped; the two shipped ones are fixed. See below. |
| PLAN — P-113, all of CMC in the CMC module | `018981146`; `docs/evidence/S7/2026-11-09-cmc-scope-market-and-roadmap/` | The founder's direction of 2026-11-09, recorded with the study it rests on: the inventory by path (57 CMC services, 19 record kinds, 9 signed registers, 15 composed sections), the external study of QbDVision, Weave Bio, DDi, Veeva Vault RIM, the CPV platforms, the Rockwell-led Digital CMC Consortium and the published ML work, and the three-tier gap list. The roadmap is §6a above. **Two inventory findings it turns on:** CQAs and CPPs are *inferred* by `qbd-analyzer.ts` at read time and QTPP exists nowhere, so the control strategy has no governed object at its centre; and no section outside 3.2.S and 3.2.P is composed although the judgements behind 3.2.A.1, A.2, A.3 and 3.2.R all exist. **The strategic finding:** FDA PQ/CMC's Phase 1 domains are this module's five strongest registers, already held as records with lineage, so alignment is a mapping rather than a data project. |
| F1 — a capability index read as a tail probability it did not carry | `b66a12868`; `docs/evidence/F1/2026-11-09-capability-presumes-normality/` | Found by P-113's market study. `(USL − x̄) / 3σ` is a tail probability only for an approximately normal series, and the presumption was unstated — while the CMC case where it fails is the common one: an impurity with a one-sided upper limit, bounded at zero, right-skewed near the limit of quantitation, where the index is **optimistic** and the number reaches §3.2.S.4.5 / §3.2.P.5.6 and the CPV report. The shape is measured and stated now: skewness is called material only when \|G1\| exceeds twice its own standard error, which self-scales with n, and a series too short to estimate it is reported as **not assessed** rather than as normal. The note names the **direction**, which is the actionable half — a tail toward the limit is optimistic, away from it conservative. **The index and the verdict are unchanged**; moving to ISO 22514-2's non-normal percentile families would change filed values and is in §6a's roadmap instead. Five mutations red. A second suite proves the caveat reaches §3.2.S.4's narrative, because the first draft of that claim rested on reading `module3Composer.ts` rather than on a test. |
| S12 — a work project's deliverables, read by deliverable (P-83) | `1b370577e`, `bbe7dfd60`; `docs/evidence/S12/2026-11-09-deliverable-feeds/` | `projectDeliverableFeeds` answers, per deliverable: records held, when one last changed, the §3.2 sections they feed (from `sectionsFedBy`, the write-through's own impact map) and which are out of date **because of that deliverable**. **RULE 3 correction:** `THE_PROGRAM_2026-11-01` §7a's "what is missing" list is wrong for CMC on one of its four items — the stale flag exists and is stronger than a flag (`cmc_section_lineage` + `findSectionDrift`, derived, not a flag). Attribution needed drift reasons to carry their source type, so a reader is never told their specifications are stale because a batch record changed; `describeDrift` and both its callers are unchanged byte for byte. A failed read reports itself. 8 cases, 3 mutations red. `ci:sql-interpolation` refused the first shape and the fix was tighter than the baseline: the lineage read is a function whose filter is typed as the two literals it may be, so the gate's "fixed allowlist in code" is the compiler's now, and the file went 1 → 0. **Not supplied, each needing a decision rather than a commit:** the owner and due date per deliverable (no column for either — a CMC deliverable is the set of records of one source type in one project, so recording them is a new table, which RULE 6 reserves), and the program's map across projects (`project-rollup-service.ts`'s). The API handler lands with its caller; the project page is another session's file. |
| F1 — a register edit answered 200 for a field it does not record | `c900e79c6`; `docs/evidence/F1/2026-11-09-register-edit-unrecorded-field/` | Finding 7 below, answered: this lane owns the register routes. All 15 edits in `api/cmc/routes.ts` refuse such a body **400**, naming the fields they could not record and the ones they do, before the record is read and with nothing written. 400 and not 409 because a misspelled field is a wrong request, not a conflict with the record's state. The guard throws the refusal `respondWriteError` already understands, so no handler gained a branch. 32 cases in 3 files; four mutations red, including the shipped 200 reproduced (*"expected 200 to be 400"*). **Still open in the same shape:** the creates (seven are service functions shared with the interview commit projector, so the guard belongs inside `createX`), `comparability-studies` (reads `req.body.*` with no schema at all), and `batchRecordRoutes.ts` / `specificationRoutes.ts`, which build their own UPDATE from a field map and refuse only the all-unknown case. |
| J5-13 — closed | `1f0cca737`; `docs/evidence/S7/2026-11-09-cmc-walk-c2c201/` | "21 section(s) composed, 13 with recorded data", then the screens: the build board refusing the export gate in its own words and saying "Not swept yet — no count is claimed"; the Specifications table listing six attributes each with its own procedure; and the morning's approval gate refusing a real §11.50 signature with `409 METHOD_NOT_FIT`, named on screen in the server's words. No console errors, no horizontal scroll at either width. |

**Found by running it, 2026-11-09.**
7. **A write reported as made, and not made.** The seeder sent `shelfLifeClaim`, the name the COMPOSER reads; the
   register's column is `shelf_life`. The route parses its body with a Zod schema that strips unknown keys, so it
   answered 200 having changed nothing, three times. The step now reads its write back and fails if the value is not
   there. **For the register's owner:** every register body is parsed `.partial().parse()`, so no caller can tell an
   applied edit from an ignored one. *2026-11-09, answered in this lane (`c900e79c6`): the register routes are this
   lane's files, and all 15 edits now refuse such a body 400. The creates and two other routes remain, listed above.*
8. **§3.2.S.4 filed the drug PRODUCT's limit as the drug substance's** (fixed, `aa4ba6461`'s parent). It read the
   first specification source carrying a criteria object, whatever material it was for. My own phase 4 acceptance
   fixture was passing this by source order, so the case asserts both orders.
9. **The register records one row per ATTRIBUTE; both sections read one criteria object** (fixed, `aa4ba6461`).
   Six recorded attributes, one filed, labelled `release`/`shelf`. Each row now carries its own procedure and that
   procedure's recorded status, or says `not in the method register`.
10. **Completeness is not material-scoped** (NOT fixed). One generic collector over every matched source, so
    §3.2.S.4 reads `acceptanceCriteria` as available when only a drug-product specification exists. Closing it needs
    a side-scoped mapper field (which would report every specification already on file as missing it) or a per-type
    scope on `SectionRule`. Recorded in the test rather than asserted away.

**What is next.** S12 — work projects and their deliverables mapped downstream with lineage and change flags
(P-83) — is this lane's remaining named package. The D0 adoption and J5-13 are done (above).

**Open for the founder**, three, all written up with options in the evidence: the free-text spec → method → result
chain (found item 2); that **no form can record a method as suitable**, so the `METHOD_SUITABLE` branch
`q2Expectation` relies on is unreachable and only a validated method lets a limit be approved
(`docs/evidence/S7/2026-11-09-demo-cmc-methods/`); and that **a terse manufacturing route reads as a small
molecule**, so an under-described biologic is admitted into small-molecule composition
(`docs/evidence/S7/2026-11-09-demo-cmc-materials/`). Also: the free-text spec → method → result chain (found item 2 above), written up with options in
`docs/evidence/F1/2026-11-08-specification-method-gate/`; the recommendation is to reference the register row by id,
which is additive and needs no backfill to be correct.

#### F1 / L1 — the MDX journey: the device and diagnostics client's path (session `session_01P6GWSvLLKKNQMXXpyki7Yq`, 2026-11-01 to 2026-11-09)

**What already exists.** The study and its order of work are in `.design/client-journey/MDX_JOURNEY_2026-11-01.md`
(`68bbca15c4`), which lists every existing device screen, route, engine and outline by path, and records defects
M1–M22. Each repair below extends an existing file; none adds a screen, mount or table.

- **Delivered**, all on `concept2cure-v2`, evidence under `docs/evidence/MDX-JOURNEY/`:
  - **The device screens keep their promises.** M1 and M2 (`4bef8ac4f5`), M5 (`be46895c97`), M6(c) (`8d4aef6de5`)
    and M10 (`f96370ece4`). M11 (`9d4e87c70d`), which also found M12 not to be a defect. M8 (`67e23b8cd1`) and M17
    (`1322eddcee`).
  - **Every eSTAR and EU exit asks whether the filing holds the document's text (P-29.3).** Slice 3 (`8c30fa2c97`)
    covers `/build`, the official eSTAR's attachments, and the readiness and assembly verdicts. M3's server half
    (`e05eb3d4ac`) covers the EU technical file.
  - **A new project's home filing can get its editing copy again**, found walking the journey (`bda1d5aed1`). Since
    `31a5453861` no screen could create it, for any client type.
  - **The journey walked in the running app.** The 510(k) journey (`afd222802e`) and the PMA and EU IVDR journeys
    (`2e53a15c9f`): from New project to a section written into each filing, and the package exported with the filing
    compared.
  - **M18** (`d2d2750ca5`, `71417d75ac`). The PMA screen's modules are the project's own PMA document, scored by the
    PMA mapper. They had been the organization's legacy 510(k) sections, so a project with no PMA document showed
    every module "complete".
  - **M19** (`2a84c3d268`). The PMA mapper places a lettered leaf by its 814.20 key, never by its title. An approved
    SSED had counted modules 2, 4 and 5 present with C, F and G empty, in every verdict that reads the mapper.
  - **M20** (`ae5483338b`, `f06b6de374`, `2b4e32d9bd`). The PMA trial cards read only the project's linked study. They
    had bound another product's study by name. The card that counted protocol deviations as "AE rate" is now
    "Serious deviations".
- **Re-walked on the merged trunk**, 2026-11-09. 510(k): New project (201), the doors, the editing copy, B1 saved into
  the filing, and the export (200, `filingAgreement.compared: true`). The device lane's suites, 107 files and 1,099
  tests, pass (`docs/evidence/MDX-JOURNEY/2026-11-02-m20-pma-trial-cards-linked-study/green/device-lane-on-trunk.txt`).
- **Found, and left where it belongs.**
  - M3's UI half: the IVDR door's screen asks AnA to assemble, and offers only an FDA 510(k) eSTAR. It needs a
    sequence a device project does not have (R1, founder question 1).
  - M7 (De Novo has no door) and M13 (the CDRH Portal) are founder questions.
  - M14, M15 and M22 are the editor's and the project home's.
  - The 390 px clipping is the coordinator's.
  - M16 is P-60's question.
  - M21: the draft package is named after its class and type, not its project.
  - Without `REVIEW_ADMIN_TOKEN`, the 510(k) screen's predicate and SE panels read "Could not load", because
    predicate intelligence answers 503 "not configured".
- **Delivered later the same day** (2026-11-09):
  - **The device readiness scorecard** (`3995432d01`, `docs/evidence/F1/2026-11-09-device-scorecard-nothing-shown-is-not-nearly-ready/`),
    the coordinator's F1 item of 2026-11-02. An applicable dimension that is not started or not assessed caps the
    level at `in_progress`. Before, one module of six not started scored 90, `nearly_ready`, which AnA's
    `build_device_blueprint` returned as is. Open for the founder: whether "nearly ready" may be said while a
    required set is only partial.
  - **Two device panels say what the server said** (`3630a6e136`,
    `docs/evidence/MDX-JOURNEY/2026-11-09-demo-device-panels-say-what-the-server-said/`). Found by seeding the demo's
    `mdx` pack (NeuroPanel-Dx) on the merged trunk and opening its seven screens. Predicate intelligence "not
    configured" (503, now with a code) and "no GSPR assessment yet" (404 `IVDR_GSPR_NOT_FOUND`) had each read
    "Could not load", with a retry that could not help. Re-walked live, no such panel is left.
- **P-114** (`0875ddf041`), decided under the founder's delegation of 2026-11-09:
  - item 1 landed: a partly present required set caps the scorecard at `in_progress` (`d3cc97ded2`);
  - M21 landed: device packages are named after the project (`062f76960f`, with live evidence on the demo's
    NeuroPanel-Dx).
- **Found:** the demo's `mdx` pack authors its 510(k) documents unbound to the project's filing, so the seeded export
  refuses (422) until a section is written into the filing. The live path works (editing copy, then B1, then export:
  200).
- **Next**, after the demo:
  - the `mdx` pack writes into the filing;
  - P-114's items 2–5: the design file's records (M16), the EU technical file per project (M3), the De Novo doors
    (M7), and the IVD 510(k) outline (M6(a)).

#### L1 / F1 — The lead: the CSR demo path, the Codespace click-through, and the founder's rail and Vault decisions; D2's click-through (session `session_011DpxUyQmE1enma4gTjcfBy`, 2026-11-06 to 2026-11-10)

Facts only; no package's scope, status or ownership changes here. Committed under P-100, as P-107 item 6 allows.

**Where testers run it (L1).**
- `docker-compose.beta.yml` and the self-host `docker-compose.yml` now run:
  - TLS on their database;
  - a provision step;
  - the self-hosted embeddings lane;
  - `SETUP_TOKEN` for the first administrator;
  - loopback-only ports (`27720c8221`, `1847807cb0`).
- `scripts/db/provision.mjs` skips install-fresh over a complete database.
- Walked from empty volumes in production mode, through sign-in with an emailed code
  (`docs/evidence/HUMAN-TEST/2026-11-06-beta-stack/`).

**AnA's CSR path, up to the model** (`docs/evidence/HUMAN-TEST/ANA-CSR/2026-11-06/`). No model key reached the
session, so no model output was produced or claimed.

| Commit | What it does |
|---|---|
| `1d129897b4` | The conversation pins `draft_authoring_document`, so a drafted document reaches the canvas. |
| `9d7624d9fd` | The CSR builder's title page and synopsis print one field per line (the PDF's title page ran on). |
| `0e18147b2b` | A refused key, an account with no credit or quota, and a model the account cannot use each say so: `PROVIDER_KEY_REFUSED`, `PROVIDER_ACCOUNT_REFUSED`. |
| `5aa8aae4d3` | With only an OpenAI key, the refusal names the providers approved for drafting. |
| `ad3d977314` | A refused turn offers no next steps. |
| `dbc080553c` | The conversation docked beside the CSR fits its column. |
| `c0181112ad`, `839efe9471` | Two layout fixes: the editor's filings line, and the protocol head at 390 px. |

**The founder's decisions of 2026-11-06, as said in the session.**
- Vault is reachable from the rail at all times. With no project open, it lists the projects' Vaults. The editor's
  "Project files" is "Vault".
- Biostatistics is a rail work area. The founder's words are recorded in `scripts/ci/one-product-baseline.json`
  `founderDecisions` as `rail:biostatistics` (`5144702d21`, `adb1c00cba`). P-107 item 1 confirms it.
- The Vault change broke two contract tests, `projectCreationDoors.contract` and `projectDestination`. The project
  page's session repaired them (`d50c5f07e9`, `aeedd1b86e`). All 46 pass on trunk at 2026-11-10.

**The Codespace click-through** (`docs/evidence/HUMAN-TEST/CLICK-THROUGH/2026-11-06/`, with its rerun scripts,
`0a617f4cd4`, `0ca1f5f4`).
- **Ran on:** the founder's Codespace data, built here by `.devcontainer`'s own scripts. The CSR study preparation
  passed.
- **Fixed:** Manage billing (`1f97ae5495`, `3a473d045e`).
- **Landed elsewhere:** the demo organisation now signs out after 120 idle minutes, not 15 (`fe3bdced33`, the
  Codespace session). The Lumen organisation follows when R1's founder-organisation change lands.
- **Open:**
  - the CSR study's filing identity, for the inspection copy (sent to R1's DATA; no change for it found on trunk at
    2026-11-10);
  - RBM's "Generate from RACT" 409, not yet checked.
- **Coverage is incomplete.** The last run's results were lost when the container was replaced. Rerun it to the end.

**Started for the founder's Vault and data request** (2026-11-06; the surveys' "What already exists" is in each
session's brief). Each records its own progress here; as reported to this session:
- `session_01QoxbLZMScz1c2iFESBLn9J`, **S6**: step 1 landed (`b3abbe5b`, `daaaae1d`; R1 `061fc4a8`, `3c7cd5eb`).
  A project's Vault has "New folder", Rename and "Move to…", each audited. Its cabinet is the filing's binder from the
  active rule pack. Steps 2 to 4 landed 2026-11-10 (`d208ba8f68`, `844b7de191`, `a36449dd90`, `c80d21ae3b`,
  `7d918fe90e`, `f9643421e9`, `84004c287e`): IND, NDA, MAA, 510(k), EU MDR and EU IVDR each open on their own binder; a
  binder folder lists the plan tasks that feed it; AnA files into folders as suggestions a person confirms (not walked
  in a conversation: no model key). With it, `9d01cdb37b` stops `/api/folders` reaching another sponsor's project
  folders.
- `session_01QoxbLdTrwYyiaSgLDxgHQJ`, **S2**: landed (`c15afd47`..`07a1c645`). Vault has a "Data catalog" tab with
  a grade A to D per item and its basis, and "Use in this project". Open: the CSR study-data chooser putting used items
  first (S3), and AnA over the catalog.
- **S12** (work projects) was declined by `01QoxbLcnW…`. Under P-107 item 7 it is with a project-page session, after
  D3-4 (`d50c5f07e9`).

**2026-11-10, launch row D2: the Codespace click-through's second run**
(`docs/evidence/HUMAN-TEST/CLICK-THROUGH/2026-11-10/README.md`). The founder's Codespace was rebuilt from an empty
database with trunk's own `.devcontainer` scripts, then clicked through as Ana Author and as the Lumen lead.

| Commit | What it does |
|---|---|
| `8c4a9e5a8a`, `912ec3cf35` | Approving a controlled document no longer makes every project Vault in the organisation answer 500. The Vault checks only its own project's sources and refreshes its captured Quality records first. The data room no longer counts those records as files awaiting a classifier. |
| `11aa491184`, `ff49ebed77` | The Codespace's demo seed signs its two-person steps: the approver is the second signer, designated QMS approver through the governed route. From an empty database every SOP approval, method validation and the RACT's approval run. |
| `7aeecfc654`, `c9a3680a24` | The seed re-runs over its own data: a document already frozen or approved is found, and two people's same-titled acknowledgement tasks do not stop it. |
| `44f25b3fdb` | Biostatistics "Save as a working document" saved nothing (503) on every project: the sign-in token carries the organisation as text. |
| `1c26e6aed8` | Biostatistics names an unfilled field beside "Assess defensibility", not as a red error. |
| `cc06768a51` | The CSR study is prepared as an open IND with a clearly fictional sponsor (P-115 item 4), so its package identity is complete. |
| `a3c57ccdf5` | A refused "Close letter" ends its message with one full stop. |
| `70ec16da36` (the CSR walk session, from this run's finding) | A fresh Codespace's CSR study preparation finishes. |

- **Coverage:** runs A (projects and authoring, 120 clicks) and C (work areas and administration, 265 clicks) finished
  with nothing further. B (Communication, Vault, Submission Center, Tasks) and D (the Lumen account) are recorded in
  the evidence README as they end. The crawler resumes from its log and restarts its browser every 60 clicks.
- **Found and handed on:** every sign-in mints the token's organisation and user ids as strings (platform owner); a
  page open reads the session six times and the project five (shell owner); `lumen-vault`'s 24 review, approval and
  seal steps want a third person in the development organisation (the Codespace session, DATA).
- **Seen red on trunk, not this lane's:** `section-sources-unverifiable-native.pglite` (3),
  `tests/routes/chat-governed-upload` (1).
- **GA readiness** (`scripts/ops/ga-readiness-report.mjs`, 8 of 42 ready, 18 blockers): none is code in this lane.
  They are production secrets, SMTP for the sign-in code, the PQ protocol's approval and run, a production restore
  rehearsal and the AWS apply (rows D1, D5, D6, D9, D10).

**Open for the founder:**
- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` as Codespaces secrets. No model output has been seen in a Codespace;
- the PQ decision for production drafting (every model is `pending`);
- whether the client types read "medical device and diagnostics, biotech, pharma, CROs/consultants".

#### L1 (row D1) — ready to run on AWS: re-measured at head, the WAF, cheaper readiness (session `session_01QoxbLaF89iYd7wC96owa7t`, 2026-11-10)

**What already exists.**
- Work order: `docs/work-orders/MR-03-first-deploy-staging-to-production.md`. Stages 1–4 had landed.
- Infrastructure: `terraform/` (one stack, two roots, tested modules), `deploy-aws.yml` (staging, promote, rollback) and
  `provision-database.yml`.
- CI's image jobs.
- P-11, the WAF, decided but never built.

**Delivered**
- **Re-measured at head.** Evidence: `docs/evidence/D1/2026-11-10-aws-readiness/`.
  - Terraform: 121/121 offline tests pass, every root validates, and the deploy preflight proof holds.
  - The deploy contracts pass.
  - On GitHub: the production image boot, blank-DB provisioning, boot smoke, Security Scan and Codespace jobs pass.
- **P-11, the WAF**, `4e697a5381`: an `aws_wafv2_web_acl` on the distribution.
  - The IP-reputation and known-bad-inputs groups block, and a per-IP rate rule blocks.
  - The common rule set counts for two weeks; its 8 KB body rule counts on every path.
  - The region precondition is in, and the Trivy exception is deleted.
  - Red 11/1 failed, then green 15/15.
- **OPS-22**, `5e8a7317ce` and `37d030e109`'s chain: `/readyz` runs its database query and Vault-store probe at most once
  per 5 s, and in production the public body is `{ ready }` alone. Green 81/81.
- **OPS-29**, `8a5eb16b27`: the metrics token is compared in constant time.
- **MR-03**, `999efec84a`: re-confirmed at head, with the founder's first-apply checklist in order.

**What blocks a deploy, in order**
1. **Trunk CI is red**, and `deploy-aws.yml` runs only a SHA whose whole `ci.yml` run passed. The MR-02 lanes own it:
   - Secret scan: 8 findings, 3 credentials live;
   - Lint;
   - Integration;
   - Test: 447 of 79,560 failing.
2. **The founder's inputs**, listed in MR-03's 2026-11-10 checklist:
   - accounts, region, domain and certificates;
   - SMTP;
   - the Anthropic key, and its placement entry (B4);
   - error reporting (NEW-3);
   - Vault retention;
   - revoking the live credentials;
   - the apply.

**Next, engineering, no founder input**
- Wire `READYZ_TOKEN` into the task definition and the smoke test.
- MR-03 Stage 6 (OPS-17).
- Stage 7 steps 2–4 and 8.
- Switch the common rule set to block two weeks after the first apply.

#### D7-B / F1 — Quality on the work-area pattern, its registers as the product's tables, and the change record's signature (session `session_01GyGhjgjrNvxgwH4JhTMRZX`, 2026-11-06 to 2026-11-10)

The founder: "We don't have apps anymore. We just have the core product… The quality is a major part of the product. I
just don't want separate apps or cards." Quality is one work area: a header, AnA's starters, its registers as tabs,
quiet sections, no tiles or type cards. The sweep plan is C1–C18, each with its findings. The evidence for each step is
under `docs/evidence/DESIGN/D7/`.

| Step | Commits | Where a person sees it |
|---|---|---|
| The work area | `a65f886a7` | Quality: one header, three starters, registers as tabs |
| Rows: one next step and More | `606a9a302`, `63ff5b495`, `b02be8a1d`, `8a0e2836a` | Each register row |
| Change control as one log section | `6f651cc23` | The Change control tab: stage filter as one segmented control, procedure in a closed disclosure |
| C1–C2: the SOP tab's quiet sections, honest dates and all-clears | `0561109d1` | SOP register, Periodic review, Training |
| C3–C5: toasts; refusals said as refusals; every Open reaches the one editor | `ff2a66369`, `3f2ab6ad1`, `1a69d42a1` | Every Quality write and read |
| Independent review of C1–C5: 23 confirmed findings repaired | `58bed0a70` | `2026-11-10-review-repairs/` |
| C6: the SOP register is D0's table | `62c7f0031` | SOP register (the 390 sideways scroll found and fixed) |
| C8: the change log is D0's table, one next step per change, no Approve for the proposer | `ea1d59957` | Change control log |
| F1: an approved change's signed content cannot be rewritten (409, not 404) | `c555f4a2a`, `faa4b737e` | `PATCH /api/mdx/qms/changes/:id`; checked first by three independent readers |
| C9: the change record is read and assessed in its row, and read inside the approval ceremony | `135394180` | A change's row; "Edit assessment"; "What you approve" in the signature dialog |
| F1: a change's approval signs the content the approver read | `c284f3cb4`, `78e9705ef` | The signature is refused, and nothing signed, when the change was edited after the dialog opened |
| C10: change-control documents open the one "New controlled document" door | `b61c5b088` | Change control: Change-control documents and forms |
| C11: the records registers are D0's table, one next step per record | `33682ac65` | CAPA, Deviations, Nonconformances, Suppliers, Internal audits, Management reviews |
| C12: a capped read says so; the figures keep the facts the tiles carried | `646b855fe` | "The 100 most recently updated CAPAs: …"; "not all read" in a record's CAPA column |
| C13: CAPA and review action items are a table; their moves are named by the act | `72178e7a2` | A CAPA's or a management review's action items |
| C14: Quality reads the open project and says whose records it lists | `e39cc0d59` | Quality from a project: "Show the whole organisation"; "Organisation-wide" on the registers kept for the organisation |
| C15: Quality's dialogs are the product's one drawer | `c9e9fdefd` | New controlled document, Record periodic review, Job roles, Who must train, Version history |
| C16–C17: the training reader and the review route are the drawer; Reassign is the shared sheet | `91baf7d96` | Read and acknowledge; Review route; Reassign |
| F1, found walking C17: a QMS document's route reads are record reads, so Reassign is not refused 429; an empty picker says no one can be chosen | `b4129366a` | Reassign right after editing and sending for review |
| C18a: a register's sentence is the line under its head; dates stay on one line | `e3131458b` | Every register's head at 1440 and 1280 |
| C18: Quality's root and type are the product's | `df4e7013a` | Quality in dark mode: the product's #262624; no Quality-only buttons |
| F1: the GA ledger row L97 cites the evidence that now proves it | `e9876d85e` | `docs/GA_COMPLETION_LEDGER_2026-08.md` |

The sweep's C1–C18 are done, except C7.

**Open:**
- C7 waits on a decision: 48 px rows. The routine signature line and the route line would leave the row, and MR-12
  Stage 5 and RR4 §2.12 placed them there.
- dialogs-3 waits on a decision: "Edit controlled text", a second editor inside the reader.
- Outside D7, from the review of F1 (Part 11 review L-2): an edit while a change is still editable records no reason
  or before-and-after values, and `DELETE /qms/changes/:id` soft-deletes an approved change.
- Outside D7, found walking:
  - D0's refusal words name "this project" for every 404 shown through `ErrorState`'s `read`
    (`describeReadFailure`'s default subject);
  - the shared reassign sheet keeps the bottom-sheet variant and its eyebrow;
  - the editor's project-sources read answered 409 and 503 in the walk environment.

## 4. How everyone works

1. **Every commit names its package.** The last paragraph of the message carries the trailer `Plan: <ID>`, for
   example `Plan: D3`. The pre-push gate (`npm run ci:one-design-plan`) refuses a commit with no trailer, with an
   unknown package, or naming a package that is not `open`.
2. **A commit stays inside its package.** Every file it changes must match the package's `paths` in the ledger.
   Tests, `docs/evidence/**` and `.design/**` are always allowed.
3. **Nothing new without the plan.** These must be listed under `approvedAdditions` in the ledger, naming the
   package, before the gate accepts them:
   - a new screen: a `UI_SURFACES` id or a `SURFACE_VIEWS` entry;
   - a new API mount: a `/api/…` path registered in `server/bootstrap/`;
   - a new table: a `CREATE TABLE` in a new migration for a name no existing migration creates.
4. **The plan changes only by founder decision.** A change to this file, the ledger, the gate or the rule text in
   `CLAUDE.md`, `AGENTS.md` or the Copilot instructions carries `Plan: PLAN` and `Founder-Decision: P-<n>`. The
   decision is recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md`. No session amends the plan to make room for its own
   work.
5. **There is no bypass.** No environment variable or flag skips the gate. A commit the gate refuses is reworded or
   split. If the plan really is wrong, ask the founder.
6. **Scope, not branches.** Parallel sessions split work by package and file set (RULE 0). They never put two
   sessions on the same file at once.

## 5. RULE 6 — nothing new; finish what exists (founder decision P-80, 2026-11-01)

**The design packages open now.** D1–D7 stop waiting on D0, by the same decision ("Get to it"). Each builds on §2,
and uses D0's components where they have landed. The founder's complaint is the UI, and a parallel session was
already giving Project home Claude's shape (`eab6799360`). Two sessions still never work on the same file at once
(§4.6).

> The founder: "No agent is allowed to build anything new. However, they're allowed to continue and finish and
> conclude with brilliant working UI everything that's in place."

**The vision it serves.** Veeva, Weave Bio, Artos and Certara, merged into one and built by Anthropic as Claude for
life sciences, without ever breaking from Claude's UI. The code for each already exists in this repository:

| Named | What it brings | Where it already is |
|---|---|---|
| Veeva | Regulated content, submissions and quality | Vault (S6), Submission Center (S5), Quality |
| Weave Bio | AI-native IND and submission authoring | AnA (S4) and the one editor (D4) |
| Artos | Drafting from the study's own data | The data room (S2), through the evidence (S3), to AnA (S4) |
| Certara | Biostatistics, modelling, data standards, regulatory writing | The evidence engines and CDISC conformance (S3), AnA (S4) |

**How the gate holds it** (`npm run ci:one-design-plan`, from the ledger's `completesRequired`):
1. Every commit carries `Completes: <path>`, naming a file or folder that existed before it. `Plan: PLAN` commits
   are exempt.
2. A new route file, a new service (folder, or a file directly under `server/services/` or `services/`) and a new
   AnA tool are refused unless `approvedAdditions` lists them. So are a screen, a mount and a table.
3. Splitting a large file is not new. The new file goes inside the folder it came from, and the commit names that
   folder in `Completes:`.

**Before the first line of any work.** Search first (RULE 3) and write "What already exists". The work is then
named as what it is: complete, reach, fix or converge.
