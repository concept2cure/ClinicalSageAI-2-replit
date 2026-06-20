# Codebase Study for UI Design — Concept2Cure / ClinicalSageAI ("AnA RI")

**Prepared for:** Claude Design
**Purpose:** Define exactly what must come to life on the user interface, derived from a full study of the codebase — not from any current UI.
**Date:** 2026-06-20
**Method:** Three parallel code-derived studies (document lifecycle & generation; AnA AI layer & intelligence; platform modules, services, integrations, RBAC, client IA), synthesized here.
**Posture (agreed):** Hybrid structure — the document lifecycle is the spine; then a capability catalog by module; then a UI surface map that ties capabilities to proposed screens. Depth: **inventory + opinionated UX proposals** (we describe every capability, what the UI must let users see/do, and concrete UX/IA recommendations; visual design remains the design team's).

> How to read this. Parts 1–5 are the **inventory** (what exists in code and what each capability implies for the UI). Part 6 is the **opinionated surface map** (the screens we recommend the new UI be built from). Part 7 walks real **use cases** end-to-end. Part 8 is a **prioritized roadmap**. Part 9 lists **open questions** for design discovery. Appendices hold the exhaustive lists (commands, tools, events, routes, roles, integrations, status enums) so the body stays readable. Where the code is partial or ambiguous, it is marked **[partial]** or **[unverified]**.

---

## What this product is

A multi-tenant SaaS platform for **regulatory submissions and the regulated document lifecycle** across pharma, biotech, and medical-device/IVD. Sponsors author, govern, assemble, and submit regulatory dossiers (IND/NDA/BLA, 510(k)/PMA/De Novo, EU CER/MDR/IVDR, eCTD) under **21 CFR Part 11 / GxP** controls, assisted throughout by an AI regulatory co-pilot ("**AnA**"). The platform's center of gravity is the **document** — its creation, evidence-grounding, review, signature, versioning, and submission — wrapped in an auditable governance fabric.

Three things distinguish the product and must shape the UI:

1. **Everything is governed.** Record-altering actions capture a reason-for-change and, for high-impact actions, an electronic signature; everything is audit-logged. Governance is not a settings page — it is woven into every mutation.
2. **AnA is a first-class actor, not a chatbot bolted on.** AnA can draft, search, analyze, and *execute governed mutations* (place in dossier, revert, freeze, sign, submit) directly from conversation. The UI must let the AI and the human share the same workspace and the same governance gates.
3. **Evidence and readiness are pervasive.** Content carries provenance and grounding verdicts; documents and modules carry readiness scores and blocking contradictions. The UI must surface "is this true / is this ready / what's blocking it" almost everywhere.

---

# PART 1 — THE SPINE: THE DOCUMENT LIFECYCLE

Everything else hangs off this. The platform models a document across **three layers** that the UI must make coherent as one object to the user, even though they are distinct in the data model.

## 1.1 The three layers of a document

| Layer | Tables (representative) | What it is | UI meaning |
|---|---|---|---|
| **Authoring layer** | `documents`, `documentVersions` | The editable working document with rich-text content and a version chain; Part 11 audit on create/update. | What the user edits in the editor; "current draft + history." |
| **Artifact layer** | `concept2cure_artifacts`, `concept2cure_artifact_versions`, `project_sections` | The *governed*, AI-or-human-generated canonical content tagged to a CTD section, carrying status, provenance, quality grade. | The thing that gets a status, a readiness verdict, and is placed into a dossier. |
| **Submission layer** | `submissions`, `submission_regions`, `ectd_sequences`, `submission_leaves` | The eCTD assembly spine: sequences (0000, 0001…), per-region profiles, and "leaves" pointing at documents/artifacts in CTD slots. | The dossier/submission builder and the regulatory transmission record. |

A bridge (`documents.artifact_id → concept2cure_artifacts`) unifies identity between the authoring and artifact layers. **UI implication:** the user should experience "a document" as one object with three faces — *Edit* (authoring), *Govern/Place* (artifact), *Assemble/Submit* (submission) — not three different screens with different names for the same thing.

## 1.2 The state machine (what the UI must visualize)

There are several status vocabularies in code; the UI should present a **single unified lifecycle ribbon** that maps onto them:

- **Artifact status:** `draft → review → approved → locked → archived` (`ArtifactStatus`). Extended forms add `in_review`, `published`, `superseded`.
- **Lifecycle readiness level** (the richer signal to render): `draft · evidence_gap · review_ready · approval_ready · export_ready · publish_ready · blocked · degraded` (`LifecycleReadinessLevel`).
- **eCTD sequence status:** `draft → assembling → validated → frozen → dispatched`; with `validationStatus` (`pending/passed/failed`) and `dispatchStatus` (`pending/sent/acknowledged/rejected`).
- **Submission status / stage:** `planning/active/submitted/archived`; stage `original/amendment/response/variation/annual/withdrawal`.
- **Post-approval obligations:** `planned · in_preparation · submitted · approved · rejected · overdue · closed` (recurring variations, supplements, PSUR/PBRER, pediatric, renewals).

**Governed mutation intents** (the verbs the UI exposes as actions): `create · update · place · relocate · promote · approve · lock · export · publish · dispatch · archive · rollback · compile · refresh`.

**UI proposal — the Lifecycle Ribbon.** A persistent horizontal status spine on every document/section, showing the current readiness level, the next legal transition (e.g., "Promote to review"), and what blocks it (count of contradictions/missing evidence). Each transition is a governed action (see §1.4). The ribbon is the single most important reusable component in the product.

## 1.3 Readiness, contradictions, and gates (the "can I move forward?" engine)

Before content advances, the platform runs **preflight** at three altitudes:

- **Section preflight** checks: body expectations (missing/weak evidence), unresolved contradictions, cross-section consistency, comparison against the approved baseline, and a readiness score → verdict `ready · blocked · provisional · needs-review · needs-reapproval`.
- **Module preflight** rolls up sections (counts ready/blocked/provisional/…); reports major blockers + recommended actions.
- **Dossier preflight** rolls up modules; offers actions like open-blocked-module, run-module-preflight, promote-when-clean.

Gates that decide whether an action is allowed:
- **Export gate** (`exportGovernance.ts`): outcome `eligible/blocked/insufficient_context`, with per-check pass/fail, blocking reasons, and remediation steps.
- **Publish/dispatch gate**: `dispatchReady` + dispatch blockers.
- **Governed document evaluation** (`governed-document-fabric.ts`) bundles readiness + placement decision + export gate + publish gate + downstream consequences into one decision record (outcome `allow/block/review/degraded`).

**Contradiction engine:** unresolved `contradiction_findings` carry severity, type, and a `blocksPromotion` flag; resolution is a multi-step flow (plan → execute → explain).

**UI proposal — the Readiness Inspector.** A right-rail panel that, for whatever is in focus (section/module/dossier), shows: readiness score, the checklist of gate checks (pass/fail with reasons), the list of blocking contradictions and missing evidence, and one-click remediations. This is the second most important reusable component. Blockers must be **clickable** straight to the offending content.

## 1.4 Governance overlay (Part 11 — applies to every mutation)

Record-altering actions are **fail-closed** under per-tenant enforcement (`anaPart11Enforce`). Tiered policy:

- **Reason-only tier** (e.g., status/milestone changes): capture a reason-for-change (≥10 chars), audit-logged before the mutation runs.
- **E-signature tier** (high-impact: place-in-dossier, revert, freeze, sign, submit, create submission package): reason **plus** server-side re-authentication (password, MFA when enabled) before the mutation runs.

Every governed action writes an immutable audit record (actor, IP, user-agent, reason, signature meaning, timestamp). Decision records capture promote/approve/export/publish outcomes with rationale.

**UI proposal — the Sign-off surface (already prototyped for chat).** A consistent governed-action affordance used *everywhere* a governed mutation can happen (editor, dossier builder, review queue, AnA chat): a reason-for-change field always; password/MFA fields only for the high-impact tier; an audit confirmation on success. It must be fully accessible (labels, error live-region, keyboard/Escape, focus management). This is the third core reusable component.

## 1.5 Provenance & evidence (must travel with content)

Generated content carries `ArtifactProvenance` (generatedAt/By, aiProvider, aiModel, conversation context, quality grade A–D, evidence-label count, runId). Evidence is validated through a discipline check (claims labeled KNOWN/INFERRED/MISSING), a structure check, an evidence verdict (sources/strength/gaps), and a self-verification "grounding" round (claims checked against tool outputs). Vault content is chunked + embedded (pgvector) for retrieval and citation.

**UI proposal — Provenance & grounding chips.** Inline, on paragraphs and on AI answers: a grounding chip ("N sources · 87% grounded · 2 overclaims") that expands to show flagged claims and their sources; a provenance badge (who/what model/when, quality grade) on generated content; citation popovers that open the source chunk/document.

---

# PART 2 — CAPABILITY CATALOG BY MODULE

Each module below lists its purpose and the **screens/operations it implies**. (Routes and services in Appendix E.) Maturity varies; production-leaning areas are Auth, Projects, the MDX 510(k)/CER workbench, the Vault, and AnA chat — others are partial and are flagged in Part 9.

## 2.1 Regulatory submission modules

- **510(k) / De Novo (medical device).** Predicate intelligence, substantial-equivalence matrix, eSTAR section authoring, RTA pre-flight, transmit to FDA ESG. *Screens:* eSTAR section editor with status, predicate comparison workbench, SE matrix, RTA readiness gate, transmit (with confirm + e-sign).
- **PMA.** 10-phase premarket-approval workflow, module assembly, evidence aggregation. *Screens:* phase dashboard, module tabs, evidence assembly.
- **CER (EU MDR Annex XIV).** FAERS analysis, literature synthesis, GSPR/essential-requirements alignment, post-market clinical follow-up (PMCF) plans. *Screens:* CER builder, literature/FAERS panels, GSPR checklist, PMCF plan editor.
- **IND → NDA/BLA (biopharma).** Protocol authoring, CMC section assembly, nonclinical (tox/pharm) tabs, regulatory correspondence, IND package + transmit. *Screens:* IND project home, protocol editor, CMC assembly, nonclinical summary tabs, correspondence log, submission package builder.
- **eCTD / Dossier.** Module 1–5 navigator, sequence lifecycle (draft→assembling→validated→frozen→dispatched), leaf assembly, structural validation, ZIP/XML compile with MD5 backbone, region packaging (FDA/EMA/PMDA/HC). *Screens:* CTD tree with drag-in leaves, sequence ledger, validation report, compile/export, region profile manager.
- **CMC / Module 3.** Manufacturing process, stability matrix, control strategy (ICH Q14), specification rationale; build-all / per-section, stale-section detection & refresh, readiness, contradictions, evidence lineage, variation classification. *Screens:* CMC module map with per-section status/staleness, control-strategy editor, stability matrix, variation classifier.
- **IVDR / IVD lifecycle.** Risk classification, performance (LoD/LoQ) validation, compliance matrix, companion-diagnostic pairing. *Screens:* classification decision tool, performance-study recorder, compliance matrix.

## 2.2 Evidence & knowledge

- **Regulatory Intelligence (AnA RI).** Live aggregation from ClinicalTrials.gov, PubMed, FDA, EMA, PMDA, NMPA, ChEMBL, bioRxiv, CMS Coverage, ICD-10. *Screens:* query/chat engine, precedent search, competitive landscape, endpoint benchmarking.
- **Vault / Document management.** S3-backed storage with immutable refs, classification, processing pipeline (extract → vectorize → index), retention policies, archival snapshots, version lineage. *Screens:* upload drop-zone with processing progress, semantic search, document detail with versions/retention, linked-evidence view.
- **Evidence Fabric.** RAG layer with multi-tier memory (working/project/account), citation provenance, evidence-sufficiency scoring & gap analysis. *Screens:* evidence panel on documents, sufficiency/gap report, "link evidence to section" affordance.
- **Artifacts Center.** Cross-project artifact library / "digital twin": version chains, provenance, signature status, reuse catalog. *Screens:* artifact library with filters, reuse/insert flow.

## 2.3 Specialist domains

- **Biostatistics / CSR.** Study design, SAP authoring, sample-size/power, dose-escalation (3+3/BOIN), simulation, missing-data analysis, estimands (E9 R1), defensibility QC, TLF shells, CDISC define.xml. *Screens:* study-design canvas, SAP editor, power/sample-size calculator, simulation runner, TLF shell builder.
- **Device classification & diagnostics performance.** Class I/II/III prediction, predicate selection, biocompatibility/sterilization/electrical standards, performance testing. *Screens:* classification decision tree, standards matrix, performance recorder.
- **Quality / QMS.** CAPA, MDR, management review, inspection readiness, nonconforming product, TMF. *Screens:* CAPA board, inspection prep, TMF completeness checklist.
- **Post-market / Pharmacovigilance.** Complaint intake, safety-signal detection, FAERS/MAUDE reporting, ICSR/E2B(R3), DSUR/PBRER, RMP/REMS, lifecycle obligations calendar. *Screens:* complaint intake, signal dashboard, safety-narrative editor, obligations calendar.
- **Submission Ops / Center.** Package assembly, completeness validation, ESG send, status tracking, FDA forms (1571/1572, AE3500A), EMA E2B(R3). *Screens:* package preview, validation report, transmit, status timeline, form auto-fill.
- **Authoring / document builder.** Rich-text (TipTap), section freeze/lock, compliance scanning, slash commands; collaborative editing intent (Hocuspocus/CRDT referenced) **[partial — concurrent-edit conflict handling not confirmed in code]**. *Screens:* the editor (see Part 4).
- **Approval workflows.** Review queues (My Queue / Project Queue), review threads (open/resolved/outdated), reassignment, frozen-document e-sign, audit insert. *Screens:* review queue, review thread, approve/sign.

## 2.4 Global regulatory intelligence & compliance

A large family of jurisdiction-specific surfaces (45+ route groups) covering CMC, CTA, pediatric, exclusivity, inspection, labeling, pharmacovigilance, stability, devices, fees, reliance, expanded access, promotional compliance, submission-format localization, timelines, and more. *Screens:* a **regional requirements matrix**, timing estimator, format localizer, inspection-preparedness view. **[partial — many are deep-link "modes" without a unified panel yet; strong design opportunity, see Part 8.]**

## 2.5 Cross-functional platforms

- **AnA (AI co-pilot).** See Part 3 — the cross-cutting AI surface.
- **Collaboration.** Presence, @mentions, reactions, activity feed, channels. *Screens:* presence indicators in editor, mention notifications, activity feed.
- **Tasks / project management.** Kanban + list, milestones, dependencies, assignments, due dates. *Screens:* task board, milestone timeline.
- **Intelligence dashboards.** Readiness rings, milestone timelines, AI next-best-actions, change-impact analysis. *Screens:* project home dashboard.
- **Concept2Cure orchestration (C2C).** Project scoping, commitment tracking, template reuse, study-twin simulation, governance. *Screens:* project scoping wizard, commitment tracker, template gallery.

---

# PART 3 — AnA: THE AI LAYER AS A UI SURFACE

AnA is a streaming, tool-using, governed agent embedded across the product. The UI must render its *process* (so users trust it) and its *governance* (so actions are safe).

## 3.1 The streaming turn (events the UI must render)

The server streams Server-Sent Events; the UI must handle each (full list in Appendix D): `status` (phase: orchestrating/context_assembly/generating), `thread_id`, `orchestration` (detected intent lens, suggested actions), `thinking` (collapsible reasoning), `text` (token stream), `step` (agentic-loop round + tools), `tool_use` (name + human label + input), `tool_result` (label + status + output), `artifact_draft` (a generated draft ready to open in the editor), `done` (latency/provider/model), then background `warning`, `grounding_strip` (evidence verdict), and `post_done` (executed actions/commands, enrichment sources, evidence discipline, structure score, grounding counts, reliability). `error` on hard failure.

**UI proposal — the AnA panel.** A persistent right-rail (and a full-screen mode) showing: streaming answer with a **collapsible thinking** section; **tool-call rows** (icon + human label + running/success/error, expandable output) as a live audit trail; an **evidence/grounding chip** that drills into flagged claims; **action chips** for things AnA did ("Drafted Module 2.3 → Open in editor"); a **latency/provider** chip and a **degraded** badge on fallback; and inline **edit-and-regenerate** on the user's own messages. Calm, restrained status motion (no spinners-as-decoration).

## 3.2 What AnA can *do* (commands) and *know* (tools)

- **Commands** (~80; Appendix B): governed mutations and operations across project, artifact, dossier, task, milestone, document governance (draft/freeze/sign/submit/export), submission packaging, search, biostatistics, trial design, compliance/deficiency, intelligence (readiness/drift/contradiction/predict-next), CMC Module 3 workflow, MDX 510(k)/Q-Sub, PDEV→IND, audit, user/GDPR, team. Governed ones route through the Part 11 sign-off (§1.4).
- **Tools** (~270; Appendix C, grouped): search/research (clinical evidence, literature, FAERS/MAUDE, recalls, approvals, labels, CMS coverage, ChEMBL, ICD-10, project knowledge), guidance/advisories (study design, estimands, CTD, pathways, special designations, GCP, PV, value dossier, ICH/FDA lookups, deficiency taxonomy), biostatistics, quality/CMC, device/diagnostics, nonclinical, clinical, CTD/eCTD assembly & validation, regulatory intelligence, deficiency & risk, document generation (DOCX/PDF surgery, OCR, templates), program management, compliance/verification, finance/grants, training/personnel, and product/submission intelligence.

**UI implication.** Tools are mostly invisible plumbing surfaced as narrated rows; **commands** are user-visible outcomes (they create/modify governed records and must reflect in the workspace immediately, with the governance gate when required). Designers don't need a screen per tool — they need a **great narration row** and a **great action-chip → workspace reflection** loop.

## 3.3 Proactive intelligence (push, not pull)

The platform computes signals the UI should surface without the user asking:
- **Deadline radar** — obligations bucketed overdue / due-soon (≤30d) / upcoming, with legal basis and consequence.
- **Risk watch** — open blockers by severity with owner + next action.
- **Contradiction watch** — unresolved findings, flagging those that block promotion.
- **Since-last-visit** — what newly went overdue / new blockers / new contradictions since the user's last visit (honest "what appeared while away," not "what resolved").
- **MDX proactive signals** — Q-Sub target approaching, stale eSTAR sections, unanswered FDA correspondence, evidence-sufficiency low near target, program target approaching — each with a suggested tool/surface.
- **Deficiency taxonomy** — 100+ patterns (e.g., CLIN-001, STAT-001) with reviewer language and mitigations; proactively matched to the active submission.

**UI proposal — the Signals/Alerts center + ambient surfacing.** A dedicated alerts center (severity-sorted, actionable) *and* ambient placement: a "since you were last here" panel on return, deadline chips on the project home, blocker badges on sections. Respect alert fatigue: severity floor, muting per signal type, quiet hours (these controls already exist server-side).

## 3.4 Context enrichment

AnA composes context from ~20 sources (industry wisdom, playbooks, challenge library, decision frameworks, agency tactics, ICH corpus, pathways, role/lens attunement, deficiency taxonomy, RIM signals, readiness, recommendations, evidence chain) and supports ~58 slash commands (e.g., `/risk /readiness /precedent /draft /preflight /sap /cmc /ectd /redteam /strategy`). **UI implication:** offer slash-command discovery/autocomplete in the composer and show which enrichment sources informed an answer (attribution), feeding the evidence panel.

---

# PART 4 — THE DOCUMENT GENERATION, DRAFTING & EDITING ENGINE

This is the heart of daily use and the area the request emphasized. It spans generation → drafting → editing → review → export across every document type.

## 4.1 Generation (machine-authored first drafts)

A broad generator catalog produces real regulatory content: regulatory artifacts (strategy/evidence memos, section drafts, deficiency-preemption) via the AI gateway; CTD summaries (2.3 quality, 2.4/2.6 nonclinical, 2.5 clinical overview, 2.7 clinical/stat summaries); CMC drafts and control strategies; biostatistics narratives, SAPs, study reports; CDISC define.xml; schedule-of-events tables; PMCF and pediatric (PREA/PIP) sections; eCTD module/DOCX (compliant margins/styles/tables); FDA/EMA forms (1571, AE3500A, E2B(R3)). Generation runs through a **quality gate** (grade, evidence discipline, structure) and **governed writeback** (provenance + audit), and can arrive in chat as an `artifact_draft` to open in the editor.

**UI proposal — generation as a first-class, reviewable event.** When AnA (or a template) generates content, show it as a **proposal** the user reviews before it persists (accept/reject), with the quality grade, evidence labels, and structure check visible. Never silently write generated content into a governed record.

## 4.2 The editor (drafting & editing)

A TipTap-based rich-text editor (headings, lists, blockquotes, code, highlight, placeholders, read-only mode) with a **section workspace** that maps a CTD outline to a nested tree, tracks per-section status (`approved/review/drafted/locked/todo`), caches bodies, and supports **two modes**: *conversation* (chat-driven drafting with selection actions — summarize/explain/rewrite/compare/extract/refine on highlighted text) and *workbench* (structured table editing). Paragraphs carry provenance and citations; an inspector shows AI signals. Autosave creates versions on change.

**UI proposal — the unified Section Workspace.** Left: outline tree with status badges and readiness coloring. Center: the editor with inline AI selection menu, provenance/citation affordances per paragraph, and the **Lifecycle Ribbon** on top. Right: the **Readiness Inspector** (blockers/contradictions/evidence) and the **AnA panel** (shared context). Make conversation↔workbench a calm mode toggle, not two apps.

## 4.3 Templates, autosave, collaboration, track-changes

Template-based assembly (`build_from_template`, fetch-and-fill) and section stubs exist. Autosave → version chain (versionNumber/label, changeType major/minor/editorial, changeDescription). DOCX export embeds **track-changes** (OOXML revision marks) and version history. Real-time collaboration (presence/CRDT) is referenced but concurrent-edit conflict handling is **[partial/unverified]**.

**UI proposal.** A template gallery with preview/fill; visible autosave + version timeline with restore; track-changes review view for DOCX round-trips; presence avatars and a "who's editing" indicator in the editor (design for collaboration even if the backend lands later).

## 4.4 Export & render

PDF (with eCTD bookmarks, STF wrapper), DOCX (with track-changes/version history), eCTD ZIP/XML (MD5 backbone, structural validation), and domain forms. Export is gated (§1.3) and has consequences (mark exported/dispatched, audit, link to sequence).

**UI proposal — the Export/Compile surface.** Format picker (PDF/DOCX/eCTD ZIP/forms) → **gate check results** (eligible/blocked + reasons + remediations) → render progress → download + audit confirmation. For eCTD, a compile view showing the CTD tree, validation report, and the freeze→dispatch transition.

## 4.5 Review & QC

Bulk-approve, promotion gates, readiness/preflight (§1.3), contradiction resolution, reviewer-simulation/personas (predict FDA/EMA objections), shadow review (explain proposed findings with pass/fail), and review-policy gates for AI content. *Screens:* review queue, review thread, reviewer-simulation report ("what a reviewer will object to"), shadow-review verdict, bulk-approve.

---

# PART 5 — CROSS-CUTTING SYSTEMS (UI obligations)

- **RBAC & multi-tenancy.** Org roles `admin/manager/member/viewer`; project roles same set; permissions JSON; section-level gating flag; two-tier tenancy (organizations → client workspaces); Postgres RLS. *UI:* role-aware affordances (hide/disable, not error), org/workspace switcher, user & role admin, can-only-assign-≤-own-role.
- **Audit & Part 11.** HMAC-sealed audit log; document freeze immutability; e-signature (password re-entry, timestamp, audit insert); integrity sweeps; signed archive export. *UI:* an **audit trail viewer** (filter by actor/resource/action), per-record history, freeze/sign indicators, exportable audit packets.
- **Notifications.** In-app toasts, email digests, @mentions, assignment/approval reminders, digest mode with severity floor/muting/quiet hours. *UI:* notification center + per-user digest preferences.
- **Integrations.** ~16 connectors (ClinicalTrials.gov, PubMed, FDA, EMA, PMDA, NMPA, Veeva, Medidata, SharePoint/OneDrive/Google Drive/Box, FHIR, Grants.gov, SAM, Ellucian) + direct APIs (CMS, ICD-10, bioRxiv, ChEMBL) + email/calendar/CRM. *UI:* connector gallery with per-connector auth/health, tier gating, "connect" flows.
- **AI governance.** Multi-cloud LLM routing (Anthropic/OpenAI/Bedrock/Vertex/Azure/local) with residency + zero-retention flags, approved-model list, groundedness-enforce gate, per-tier tool policy, rate limits. *UI:* admin controls for model/residency/retention; groundedness-block acknowledgment UX; tool-availability by tier/role.
- **i18n & theming.** Locale support + per-org branding (logo/accent/domain), light/dark, high-contrast, focus-visible. *UI:* the design system must be tokenized and themeable per tenant; **WCAG 2.2 AA** is a procurement gate (regulated customers) — accessibility is non-negotiable, not a polish pass.

---

# PART 6 — THE PROPOSED UI SURFACE MAP (opinionated)

Synthesizing everything, we recommend the new UI be composed from these surfaces and **reusable primitives**. Module-specific screens are skins over these.

### Reusable primitives (build once, use everywhere)
1. **Lifecycle Ribbon** (§1.2) — status + next transition + blocker count, on any governed object.
2. **Readiness Inspector** (§1.3) — gate checks, contradictions, missing evidence, one-click remediation.
3. **Governed-action Sign-off** (§1.4) — reason-for-change always, e-sign tier conditionally; accessible; used in every mutation surface.
4. **Provenance & grounding chips** (§1.5, §3.1) — on paragraphs and AI answers, drill-down to sources.
5. **AnA panel** (§3.1) — shared right-rail co-pilot with narration, evidence, action chips.
6. **Signals/Alerts surfacing** (§3.3) — alerts center + ambient placement, with fatigue controls.
7. **Audit viewer** (§5) — filterable, exportable.

### Primary workspaces
- **A. Project Home / Dashboard.** Readiness rings, milestone timeline, deadline radar, since-last-visit, open blockers/contradictions, AI next-best-actions. Entry to everything.
- **B. Section Workspace (the editor).** §4.2 — outline tree + editor + Readiness Inspector + AnA. The daily driver.
- **C. Dossier / eCTD Builder.** CTD module tree, leaf assembly, sequence ledger, validation report, compile/freeze/dispatch. The submission layer made tangible.
- **D. Submission Center.** Package assembly, completeness validation, forms auto-fill, transmit (ESG) with confirm + e-sign, status timeline.
- **E. Review & Approvals.** My Queue / Project Queue, review threads, reviewer-simulation & shadow-review reports, bulk-approve, e-sign.
- **F. Evidence & Vault.** Upload/processing, semantic search, document detail (versions/retention/lineage), evidence-sufficiency & gap reports, link-evidence-to-section.
- **G. Intelligence / Signals Center.** Alerts, deadline radar, deficiency-preemption, precedent & competitive landscape, regional requirements matrix.
- **H. AnA Full-Screen.** Conversation-first workspace for research/drafting that can hand drafts to the editor and execute governed actions.
- **I. Admin.** Org/users/roles, tenancy/branding, connectors, AI governance (model/residency/retention/tool policy), audit, billing/entitlements, Part 11 enforcement toggle.
- **J. Specialist canvases** (skins over A–F): Biostatistics/CSR, CMC/Module 3, 510(k)/CER/PMA/IVDR, Pharmacovigilance/Post-market, QMS.

---

# PART 7 — END-TO-END USE-CASE WALKTHROUGHS

These show the lifecycle in motion across roles and prove the primitives carry the product.

1. **Author a CTD section (medical writer).** Open Section Workspace → AnA drafts 2.5 from context (proposal w/ quality grade) → accept → edit with inline rewrite → Readiness Inspector shows 1 blocking contradiction + 1 weak claim → resolve contradiction (plan→execute→explain), add citation from Vault → Lifecycle Ribbon: *Promote to review* (reason-for-change) → reviewer assigned.
2. **Respond to an FDA deficiency (regulatory affairs).** Signals Center flags unanswered correspondence + matched deficiency pattern (reviewer language + mitigation) → AnA drafts IR response → reviewer-simulation predicts residual objections → revise → place in dossier (reason + **e-signature**) → compile sequence → transmit.
3. **Assemble & submit an eCTD (submission ops).** Dossier Builder: drag approved leaves into CTD slots → run validation (fix failed checks) → sequence draft→assembling→validated → **freeze** (e-sign) → **dispatch** to ESG (confirm + e-sign) → status timeline tracks acknowledged.
4. **CMC Module 3 refresh (CMC scientist).** CMC map shows stale sections → refresh-stale regenerates → contradictions surfaced vs. prior approved → resolve → readiness gate clears → promote.
5. **Run a study-design/SAP pass (biostatistician).** Study-design canvas → sample-size + simulation → SAP editor (generated draft) → defensibility QC → export to CSR.
6. **Return-after-absence (any role).** "Since you were last here": 2 newly overdue obligations, 3 new blockers, 1 new contradiction → click straight to each.

---

# PART 8 — PRIORITIZED ENHANCEMENT OPPORTUNITIES (opinionated)

Ranked by leverage for the new UI:

1. **Unify the three document layers into one object model in the UI.** The biggest usability risk is exposing authoring/artifact/submission as separate nouns. Build the Lifecycle Ribbon + one document identity. *High impact, high effort.*
2. **Make readiness & contradictions ambient and clickable.** The Readiness Inspector + blocker-to-content navigation turns a compliance burden into a guided path. *High impact, medium effort.*
3. **One governed-action component everywhere.** Consistency of the Part 11 sign-off across editor/dossier/review/chat is both a trust and an accessibility win. *High impact, low-medium effort (prototype exists).*
4. **Generation-as-proposal pattern.** A single accept/reject-with-quality-grade flow for all machine-authored content. *High impact, medium effort.*
5. **A unified Global-RI panel.** Replace 45+ deep-link "modes" with one regional-requirements matrix + timing/format localizer. *High impact, high effort.*
6. **Signals center with fatigue controls wired to the UI.** Server controls exist (severity floor/mute/quiet hours); surface them. *Medium impact, low effort.*
7. **Evidence-to-section linking UX.** Make "cite this Vault chunk into this paragraph" a first-class drag/insert. *Medium impact, medium effort.*
8. **Reviewer-simulation & shadow-review as a standard pre-submission step.** Productize "what will the reviewer object to." *Medium impact, medium effort.*
9. **Accessibility as a baseline.** WCAG 2.2 AA across all primitives from day one (procurement gate). *High impact, ongoing.*
10. **Collaboration presence/track-changes.** Design now; backend may follow. *Medium impact, medium effort.*

---

# PART 9 — OPEN QUESTIONS & GAPS FOR DESIGN DISCOVERY

Surfaced from code; resolve before/with detailed design:

1. **Concurrent editing** — CRDT/Hocuspocus referenced but conflict resolution unconfirmed. How "live" is multi-user editing v1?
2. **Revert/rollback** — `rollback` intent + version tables exist; the end-to-end revert UX/handler is **[partial]**. Confirm scope.
3. **Section-level permissions** — gating flag exists; the actual section-permission matrix (e.g., can a viewer see CSR "Safety"?) is unspecified.
4. **Review-thread lifecycle** — open/resolved/outdated transitions & visibility rules need definition.
5. **Global-RI IA** — 45+ jurisdiction routes need a unified panel design.
6. **eCTD compile/validation pass criteria** — what exactly must pass to freeze/dispatch; how to present failures.
7. **Vault evidence-linking UX** — the precise "add citation to document" interaction.
8. **Tool/command visibility by role/tier** — which AnA capabilities appear for whom.
9. **MDX embed contract** — the existing MDX bundle handoff (props/state/routing) needs formalizing if reused.
10. **Maturity map** — several specialist modules are partial; design should sequence around what's production-ready (Auth, Projects, MDX 510(k)/CER, Vault, AnA) vs. needs build-out.

---

# APPENDICES

## Appendix A — Lifecycle status vocabularies (verbatim)
- ArtifactStatus: `draft · review · approved · locked · archived` (+ `in_review · published · superseded`).
- LifecycleReadinessLevel: `draft · evidence_gap · review_ready · approval_ready · export_ready · publish_ready · blocked · degraded`.
- Mutation intents: `create · update · place · relocate · promote · approve · lock · export · publish · dispatch · archive · rollback · compile · refresh`.
- eCTD sequence: `draft · assembling · validated · frozen · dispatched`; validation `pending/passed/failed`; dispatch `pending/sent/acknowledged/rejected`.
- Submission: status `planning/active/submitted/archived`; stage `original/amendment/response/variation/annual/withdrawal`.
- Obligations: `planned · in_preparation · submitted · approved · rejected · overdue · closed`.
- Section preflight verdict: `ready · blocked · provisional · needs-review · needs-reapproval`.
- Governed decision outcome: `allow · block · review · degraded`.
- Document classes: strategy_memo · evidence_memo · section_draft · module3_output · submission_component · audit_report · comparator_summary · risk_benefit · protocol_rationale · regional_differences · safety_evidence_brief · endpoint_justification.
- Programs/applications: ind · ectd · 510k · pma · cer · ivdr · general_ri; nda · bla · anda · maa · de_novo · cta. Regulators: fda · ema · mhra · hc · pmda · multi.

## Appendix B — AnA command inventory (~80, grouped)
Project: create/list/update_project. Artifact: create/update/list_artifact(s), update_artifact_status*, list/compare versions, review_version_impact, revert_to_version*‡, export_artifact. Dossier: place_in_dossier*‡, check_dossier_readiness. Task: create/update/list_task. Milestone: create*/update/list_milestone. Document governance (all Part 11): draft_section, freeze_document*‡, sign_document*‡, submit_document*‡, export_document, generate_checklist. Submission: create_submission_package*‡, create_review_thread, add_review_comment. Search: search_artifacts, search_precedents. Biostatistics: generate_sap, compute_sample_size, compute_dose_escalation, assess_defensibility. Trial design: design_trial, simulate_challenges. Compliance/deficiency: run_compliance_scan, scan_deficiencies, check_claim, check_promotion_blockers. Intelligence: run_submission_assessment, detect_drift, predict_next_artifact, compute_readiness, scan_contradictions. Cross-jurisdiction: analyze_jurisdictions. Endpoints: recommend_endpoints, evaluate_endpoint. RIM: run_rim_scan. Reporting: generate_report, generate_clinical_insights, analyze_cross_document, analyze_cms_strategy, assess_diagnostic_validation. CMC Module 3: module3_build_all/build_section/missing_inputs/stale_sections/refresh_stale/readiness/contradictions/lineage/classify_source; cmc_status, ich_compliance, control_strategy, variations_classify. MDX 510(k)/Q-Sub (Part 11): q_sub.create*, q_sub.commitment.set_rolled_in*, section.approve*, section.update*, k510_workflow.preflight, k510_workflow.transmit*‡. MDX Phase 2/3: gspr.create, postmarket_review.assess, evidence_sufficiency.assess/gap_analysis, reviewer_simulation.run, predicate_candidate.set_status, se_matrix.patch (all Part 11). PDEV→IND (Part 11): ind_project.*, ind_study.*, ind_safety_summary.draft, ind_nonclinical_overview.draft, ind_protocol.draft, ind_cmc_section.draft, ind_submit_package.create, ind_transmit_to_fda. Audit/observability (read-only): audit.explain, k510_workflow.document_preview. User: load_user_context, load_conversation_history, export_personal_data, erase_personal_data. Team: list_team_members.
`*` = reason-for-change required; `‡` = e-signature (high-impact) required.

## Appendix C — AnA tool inventory (~270, by group)
Search/research (~18): clinical evidence, medicare coverage, connected repos, literature, drug/device adverse events, recalls, approvals, labels, regulatory correspondence, document/large-document, grants, IVD knowledge, ChEMBL, CRM, project-knowledge (single/multi). Guidance/advisories (~24): study design, labeling structure, medical information, reporting guideline (CONSORT/SPIRIT/…), data integrity (ALCOA+), RWE, estimand (E9 R1), pharmacovigilance, CTD structure, special designations, GCP, COA selection, risk management (REMS/RMP), regulatory pathway, value dossier (HTA), FDA guidance, ICH guideline, pathway/precedent/deficiency lookups, ICD-10, medical-writing guidance/review, mine_precedents. Biostatistics (~12), Quality/Chemistry/Manufacturing (~16), Device/diagnostics (~14), Nonclinical (~8), Clinical (~8), Quality/CTD assembly & validation (~12), Regulatory intelligence (~10), Deficiency & risk (~10), Document/artifact generation (~20: generate_document, build_from_template, schedule_of_events, SOP, STF, 510k SE, FDA IR response, author_docx_native, abbreviation list, surgical_docx_xml_edit, pdf_overlay, rasterize, OCR, read/validate/convert docx, etc.), Program management (~18), Compliance/verification (~12), Finance/grants (~14), Training/personnel (~14), Product/submission intelligence (~20). Full names available in `server/services/ana/AnaToolDefinitions.ts`.

## Appendix D — AnA SSE event types
`status · thread_id · orchestration · thinking · text · step · tool_use · tool_result · artifact_draft · done · warning · grounding_strip · post_done · error`. (`post_done` carries executedActions, executedCommands, enrichmentSources, evidence + evidenceDiscipline, structure score, grounding counts, reliability.)

## Appendix E — Route-group catalog (server API surface)
Auth/identity: auth, authEnterprise, sso, scim, api-keys. Admin/tenant: admin/(audit-siem, scim-ip-allowlist, scim-tenants), tenants, organizations-routes, tenant-*. Projects: projects-management, project-*, device-projects, device-cockpit. Submissions: 510k-*, fda510k-*, fda-forms, pma-workflow, cer/cerv2-*, ind* (forms/lifecycle/submissions/unified/autodraft/pdf/sections/templates/kpi), ectd-*, ivdr-*. Documents/authoring: document*, authoring*, etmf, docx-factory, contentAssembly. Evidence/knowledge: evidence*, vault*, knowledge*, external-intelligence. AnA/chat: ana-ri/** (chat, generate-execute, kernel, lookups, plan, post-processing, stream, threads, utility), ana-* (biostats, cortex, intelligence, platform-control, tool-policy, features), chat*, conversation*. Global RI: global-ri/** (45+). Regulatory/compliance: regulatory* (intelligence/registry/programs/correspondence/assessments/graph/precedent/digital-twin), global-compliance, global-markets, region-profiles. Specialist: biostat*, csr*, nonclinical, preclinical, clinical-operations, device-*, design-risk, companion-diagnostics, human-factors, manufacturing, post-market, pharmacovigilance, postmarket-surveillance, safety-narrative, financial-disclosures, inspections, gspr-postmarket. Submission/workflow: submission*, approval-workflow, review*, workflow, escalate, resolution. Collaboration/tasks: collaboration, taskManagement, concept2cure-communication-center, notification_routes. Analytics/reporting: analytics-routes, intelligent-reports, report-os*. Admin/setup: setup, module-subscriptions, mdx-admin, users, client-branding. Platform: health, well-known, csp-report, docs, public-api. Integrations: firecrawl*, graphrag, deep-research, citations, grants, sentinel-routes. Compliance/Part 11: part11-compliance, esignature. (Representative, not exhaustive.)

## Appendix F — Role model
Org roles: `admin · manager · member · viewer`. Project/workspace roles: `admin · manager · member · viewer`. Permissions: JSON on org membership; section-level gating via `AUTH_ENFORCE_SECTION_PERMS`; can-only-assign-≤-own-role. Tenancy: organizations → clientWorkspaces; Postgres RLS (`RLS_ENFORCE`, `RLS_REQUIRE_ENFORCE`). Auth: JWT (RS256), SAML SSO (multi-tenant), SCIM 2.0, MFA TOTP.

## Appendix G — Integrations
Connectors: ClinicalTrials.gov, PubMed, FDA Drugs@FDA, EMA EPARs, PMDA, NMPA/CDE, Veeva Vault, Medidata Rave, SharePoint, OneDrive, Google Drive, Box, FHIR R4, Grants.gov, SAM Exclusions, Ellucian Banner. Direct APIs: CMS Coverage, ICD-10, bioRxiv/medRxiv, ChEMBL. Productivity: Gmail, Google Calendar, HubSpot. LLM substrates: Anthropic, OpenAI, AWS Bedrock, Google Vertex, Azure OpenAI, LiteLLM/local. Embeddings: OpenAI text-embedding-3-small, local BGE/TEI. Observability: Langfuse, OpenTelemetry, Firecrawl.

## Appendix H — Module → primary screen index
510(k)/De Novo → eSTAR Section Workspace + Predicate/SE workbench + Submission Center. PMA → Phase dashboard + Dossier Builder. CER → CER builder + Evidence/Vault + GSPR checklist. IND/NDA/BLA → Project Home + Section Workspace + CMC map + Submission Center. eCTD → Dossier Builder. CMC → CMC module map (Section Workspace skin). IVDR → Classification tool + performance recorder. Biostatistics/CSR → Specialist canvas. PV/Post-market → Signals Center + safety-narrative editor + obligations calendar. QMS → CAPA/inspection boards. Vault → Evidence & Vault. Global RI → Intelligence/Signals Center (unified matrix). AnA → AnA panel (everywhere) + AnA Full-Screen. Admin → Admin.

---

*This document is a code-derived study intended to inform UI design. Items marked **[partial]** or **[unverified]** indicate areas where the code is incomplete or where behavior could not be fully confirmed from source — resolve these in design discovery (Part 9).*
