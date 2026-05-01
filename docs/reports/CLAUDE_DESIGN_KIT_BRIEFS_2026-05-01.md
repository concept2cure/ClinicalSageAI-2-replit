# Claude Design — kit briefs for GA capability surfaces

Companion to `UI_MIGRATION_MAP_2026-05-01.md` and `SHELL_MIGRATION_ANALYSIS_2026-05-01.md`. One brief per kit Claude Design needs to ship for GA. Each brief gives:

- **Persona** — who uses this (per `personas` doc)
- **Moment** — the trigger (one of the seven moments of pain)
- **Backend it ships against** — service path; the data is real
- **Information architecture** — the surface's navigation and content hierarchy
- **Key affordances** — buttons, modals, drilldowns
- **States** — empty / loading / error / unconfigured (use `<DataState/>` primitive)
- **Anti-patterns** — what NOT to do
- **Constraints** — design-system non-negotiables, accessibility, motion

Common to every kit (state once, do not repeat):

- Sentence case everywhere
- Body 13px; max title 18–24px
- Claude orange `#d97757` is the only strong color, sparingly used (one focal point per screen)
- 200ms ease-out motion only
- Lucide icons only
- Second person, direct; no exclamations, no emoji
- WCAG 2.2 AA — focus visible, color never the only signal
- Every governed mutation routes through `<GovernedActionButton>` (Phase 0 primitive); the button label and reason-for-change prompt are kit-level decisions

---

## Kit priority queue

Recommended order based on user value × backend readiness × current orphaned-UI overlap:

1. **Project shell kit** (composite — drives shell migration; gates everything else)
2. **AI letter response surface** (M1 — the wedge; backend exists)
3. **Claim-evidence dashboard** (backbone; backend exists)
4. **Reviewer simulator** (strategic differentiator; backend exists)
5. **Evidence sufficiency dashboard** (Overview enhancement; backend exists)
6. **Living-file freshness** (compounds; backend exists)
7. **Portfolio rollup** (persona 1; existing dashboards as reference)
8. **Pre-flight RTA gate** (filing-day stress reducer; backend exists)
9. **Cover letter / 510(k) summary generator** (M3; partial backend)
10. **Filing calendar with dependencies** (operational; backend gap)
11. **Document vault** (existing stub; backend exists)
12. **Post-market vigilance top-level** (existing stub; backend exists)
13. **E-sign confirmation flow** (visual swap of `<GovernedActionButton>`)
14. **Auth — Signup screen** (only legacy auth piece left)
15. **Q-Sub commitment receiver pill** (small, gated on Q-Sub backend)

---

## Brief 1 · Project shell kit

**Persona.** Every persona — this is the chrome around everything.
**Moment.** Continuous. Every workspace interaction.

**What it owns.**
- Universal rail (left): workstream tabs (k510 / pma / cer / pre-sub / vault / validation / submissions / templates / postmarket / udi / engineering / analytics / memory / admin) + project list + chat history per project + pin/recent
- Universal command palette (⌘K): workstreams + projects + conversations + tools / slash commands + "create project" inline action
- New-project flow: name, submission type, region, agency, target date, custom instructions, Part-11 metadata
- Project-settings drawer: members, ownership, knowledge base, custom instructions, audit trail, danger zone
- Topbar: project context (color accent, title, due chip), AnA toggle, palette trigger
- Main pane orchestrator: conditionally renders MDX surfaces, eCTD coauthor, ana_ri inside the same chrome

**Backend it ships against.** Existing project APIs (`/api/concept2cure/projects/*`, `/api/chat/threads`, `/api/intelligence/projects/:id/next-actions`); new per-user UI state CRUD (`/api/user-ui-state`).

**IA.** Three persistent zones — rail, main, AnA panel. The rail is two-tier (project picker + workstream tabs) so the user can switch projects without leaving the workstream tab.

**Key affordances.**
- Project switcher: combobox in topbar, click rail logo to expand list
- New project: "+ New" button at top of project list opens modal
- Workstream tabs respond to active surface; can be deep-linked
- Palette: typing immediately filters across projects + workstreams + tools

**States.** Loading (no project yet), empty (zero projects → CTA to create first), restored (multi-device — load persisted `activeNav`, `anaOpen`, etc.).

**Anti-patterns.**
- Two separate chrome surfaces for project vs portfolio mode (don't bifurcate)
- Project switcher inside the topbar AND rail simultaneously
- Click-through-required to create the first project (use empty-state CTA)

**Out of scope.** External-collaborator portal (separate, post-GA).

**Replaces.** `ZenSidebar` (1,327 LOC), `ZenCommandPalette` (718 LOC), `ProjectSwitcher` (1,135 LOC), `ProjectConfigPanel` (980 LOC), `ProjectHeaderBar` (128 LOC), `ProjectWorkspaceShell` (3,367 LOC) → **−7,655 LOC** retired.

---

## Brief 2 · AI letter response surface

**Persona.** RA Specialist (#2), RA Project Manager (#3).
**Moment.** M1 — FDA AI letter just arrived; 30/180-day clock starts.

**What it does.** Ingests an FDA AI letter PDF or email; auto-classifies each request item; routes items to owners; tracks responses; gates the next dossier transmit on close-out of all items.

**Backend it ships against.** `/api/regulatory-correspondence/*` (issue-parser, response-package-compiler exist).

**IA.** Inbox + detail two-pane.
- **Left:** list of correspondence (RFA / AI letter / SIR / interactive review). Filter by program, status (open / in-review / responded / closed-out), severity.
- **Right:** detail view with: parsed letter at top → list of issue items → response thread per item → commitment register → close-out button.

**Key affordances.**
- "Ingest new letter" — upload PDF or paste email body, parser populates the item list
- Per-item: assign owner, set due date, classify severity (blocker / major / minor / clarification), draft response
- Per-letter: aggregate close-out gate — when all items resolved, button unlocks "Mark response sent"
- Living-file integration: items linked to dossier sections refresh those sections' staleness

**States.** No correspondence yet (empty); parser running (loading); parser failed (error with retry); shadow service unavailable (unconfigured).

**Anti-patterns.**
- Free-text bucket (everything goes through structured items)
- Close-out without commitment register (leaves promises off the dossier)

**Replaces.** `portal-v2/components/dashboards/RegulatoryLeadDashboard` (capability migration; the orphan is reference, not a port source).

---

## Brief 3 · Claim-evidence dashboard

**Persona.** RA Specialist (#2), Clinical Lead (#4).
**Moment.** Continuous. Used during eSTAR/CER drafting, AI letter response, reviewer-sim.

**What it does.** Single source of truth for "is this claim defensible?" Tree of claims left, alignment verdict center, evidence detail right. Drag-drop linking. Health badges: orphan / contradicted / weak.

**Backend.** `sentenceTraceabilityService`, `evidenceObjects`, `device_claims`, `claim_evidence_links`, `regulatory-graph` event publishers.

**IA.** Three-pane.
- **Left:** claim tree, grouped by document (eSTAR §, CER §, IFU §, marketing claim)
- **Center:** selected claim's verdict (strong / moderate / weak / orphan / contradicted), evidence summary, alignment score
- **Right:** evidence detail panel (doc/study/protocol metadata, p-values, study design markers, citation)

**Affordances.** Drag evidence to claim; promote/demote evidence strength; flag orphan; "ask AnA to draft a defense narrative."

**States.** Empty (no claims), no-evidence (claim has no links), all-orphans (graph not yet authored).

**Anti-patterns.**
- Treating claims as documents (they're rows in a graph)
- Allowing direct edit of evidence metadata (evidence is sourced, not authored)

**Replaces.** `components/predicate/DefensePacketPanel` (already deleted), `components/traceability/*` (orphaned).

---

## Brief 4 · Reviewer simulator

**Persona.** RA Specialist, RA Lead.
**Moment.** Pre-filing. "What would CDRH OHT2 ask?"

**What it does.** Persona toggles produce reviewer questions over the current dossier; show evidence/claim snippets; deterministic re-runnable.

**Backend.** `reviewer-simulator.service`, `reviewer-personas` (8 personas), `reviewer-question-engine`. Schema `reviewer_simulation_runs` with `inputs_hash` for replay.

**IA.**
- **Left:** persona toggle column (8 personas with brief role bios)
- **Center:** generated questions grouped by severity (blocker / major / minor / clarification)
- **Right:** for selected question — relevant claim + evidence snippet, "ask AnA to address this"

**Affordances.** "Run reviewer sim" button; persona toggle re-filters; export as briefing pack PDF.

**States.** No personas selected (empty); running (loading); inputs unchanged (badge: "cached run from N hours ago"); shadow service down (unconfigured).

**Anti-patterns.**
- Sequencing personas (they vote in parallel; UI must reflect that)
- Treating questions as one-shot (each question must trace to which persona raised it)

---

## Brief 5 · Evidence sufficiency dashboard

**Persona.** RA Lead, RA Specialist.
**Moment.** "Are we ready to file?"

**What it does.** KPI strip + horizontal pillar bars + findings list with per-pillar recommendations. Embedded into Overview and Project home; standalone surface as well.

**Backend.** `evidence-sufficiency.service`, `evidence_sufficiency_assessments`, `pillars.ts`.

**IA.** Single-pane scrollable.
- **Top:** overall verdict badge (sufficient / borderline / insufficient) + last-assessed timestamp + refresh button
- **Middle:** pillar strip — one row per pillar with horizontal score bar (0–100), color by verdict
- **Bottom:** findings list grouped by pillar; each finding has remediation hint + "ask AnA"

**Pillars** (for ICP A, 510(k)). Substantial-equivalence narrative · Performance · Biocompat · Software · Cybersecurity · Human factors · Clinical (if any) · Labeling.

**States.** Never assessed (CTA to run); stale (orange marker — "data has changed since last run; refresh"); fresh; failed.

---

## Brief 6 · Living-file freshness

**Persona.** RA Specialist, V&V Engineer (#5).
**Moment.** M7 — claim or evidence changes.

**What it does.** When a claim/evidence changes, list every artifact that goes stale. Cascade re-review queue with one-click "mark for re-review" or "auto-cascade refresh."

**Backend.** `change-router.service`, `freshness-report.service`.

**IA.** List, grouped by program. Each row: artifact ref + reason for staleness (which upstream change) + impact severity + "open" / "mark reviewed" / "cascade refresh."

**States.** All fresh (empty); recent change detected (badge); refresh-in-progress (loading).

---

## Brief 7 · Portfolio rollup

**Persona.** RA Lead (#1), CEO (#8).
**Moment.** M6 — quarterly portfolio review.

**What it does.** Cross-program filing-date risk, RTF risk, AI-letter clock, claim-evidence health, evidence sufficiency rollup.

**Backend.** Aggregation across `regulatoryPrograms`, `submissions`, `evidence_sufficiency_assessments`, `regulatory_correspondence`.

**IA.** Single dashboard.
- **Top:** KPI strip (total programs, on-track, at-risk, blocked)
- **Middle:** programs grid (cards) with mini-readiness chart, filing-date confidence interval, open AI-letter clock
- **Bottom:** "what changed this week" feed

**Replaces.** `portal-v2/components/dashboards/ExecutiveDashboard`, `components/pharma/PharmaPortfolioDashboard` (capability migration).

---

## Brief 8 · Pre-flight RTA gate

**Persona.** RA Specialist.
**Moment.** M3 — filing day.

**What it does.** Server-side RTA + reviewer-sim + Part-11 sign-offs + auto-generated cover letter and §summary all compose into a single "pre-flight" surface. Gate-style: until every check is green, transmit is disabled.

**Backend.** `validate-completeness-engine`, `reviewer-simulator.service`, `auditService`, `response-package-compiler`.

**IA.** Single page, vertically structured.
- **Top:** overall readiness (verdict + score)
- **Per-check section:** name, state (green/amber/red), drilldown
- **Bottom:** transmit button — disabled until all green; clicking goes through `<GovernedActionButton>`

**Anti-patterns.**
- Letting the user override a red check (use waiver flow with audit trail)
- Burying the cover letter / §summary preview behind a separate tab

---

## Brief 9 · Cover letter / 510(k) summary generator

**Persona.** RA Specialist.
**Moment.** Pre-filing.

**What it does.** Pulls content from §3, §6, §11, §12 into the cover letter and 510(k) summary templates. Author edits inline; AnA assists with phrasing; sign-off via `<GovernedActionButton>`.

**Backend.** Finish `response-package-compiler` so it can pull §-level content.

**IA.** DocumentEditor primitive (already shipped) with cover-letter / summary templates as section types.

---

## Brief 10 · Filing calendar with dependencies

**Persona.** RA Project Manager (#3).
**Moment.** Continuous; weekly review.

**What it does.** Gantt of filings + gates + dependencies. Slip on one task re-plans dependents.

**Backend gap.** Dependency engine + persistence. Spec required.

**IA.** Calendar grid + Gantt swimlane.
- **Top:** quarter-month-week view toggle
- **Body:** swimlanes per program; tasks colored by status, dependency arrows
- **Drilldown:** click a task → modal with details + reschedule action

**Out of scope for GA.** Resource leveling, multi-tenant calendar.

---

## Brief 11 · Document vault

**Persona.** RA Specialist, RA Project Manager.
**Moment.** Continuous; "where is the latest IFU PDF?"

**What it does.** Searchable, taggable, versioned document store. Per-document audit trail.

**Backend.** Existing vault routes + `evidence_objects`.

**IA.** Two-pane list-detail. Search + filter (by program, by §, by tag, by author). Detail shows version history with diffs.

**Replaces.** `portal-v2/components/vault/DocumentVault` (orphaned; capability migration).

---

## Brief 12 · Post-market vigilance top-level

**Persona.** RA Specialist, RA Lead.
**Moment.** F · weekly post-market.

**What it does.** Top-level surface that promotes the CER PMS tab content + adds reportability decision tree, MDR clock, PSUR due, Article 88 trend detection (post-GA).

**Backend.** `post-market.service`, `gspr-postmarket.service`.

**IA.** Four-tab CerWorkbench-style: Inbox · Reports · Trends · Field actions.

**Replaces.** `components/regulatory/PostMarketSurveillance` (orphaned).

---

## Brief 13 · E-sign confirmation flow

**Persona.** Anyone executing a governed mutation.
**Moment.** Continuous.

**What it does.** Visual layer of `<GovernedActionButton>`. Currently uses `legacy-esign/ElectronicSignatureGate` (Part 11 correct, pre-Claude-Design). Replace the visual with a Claude-Design-styled modal flow: meaning declaration → password → MFA → success.

**Backend.** Already wired (`auditService`, `electronic_signatures` table).

**Constraint.** Hard requirement: 21 CFR 11.50(b) meaning declaration must remain explicit and acknowledgeable; password + MFA chain unchanged.

**Replaces.** `components/legacy-esign/ElectronicSignature.tsx` (final visual swap).

---

## Brief 14 · Auth — Signup

**Persona.** New customer.
**Moment.** Onboarding.

**What it does.** Replaces `ZenSignup`. Multi-step: account info → organization info → plan selection → compliance acknowledgment → submit.

**Backend.** Existing auth APIs.

**IA.** Single page with stepper. Steps: info, organization, plan, compliance.

**Replaces.** `concept2cure/auth/ZenSignup`.

---

## Brief 15 · Q-Sub commitment receiver pill

**Persona.** RA Specialist, RA Project Manager.
**Moment.** Inside eSTAR / PMA / CER editor — section header.

**What it does.** When a Q-Sub commitment lands on this section, show a pill in the section header: "Q251142 cm-1 · pending." Click expands a small panel showing the commitment text and "mark rolled in" via `<GovernedActionButton>`.

**Backend.** Q-Sub schema (drafted at `shared/schema/q-sub.ts`); routes pending.

**IA.** Section-header chip; expand → small panel.

**Constraint.** Cannot dismiss without a commitment-status update.

---

## What I need back from Claude Design

For each kit:

1. A figma file or `ui_kits/<name>/` folder with components in the system's tokens.
2. A short README enumerating: states, key affordances, motion targets, accessibility considerations.
3. Pre-port review: I send a TypeScript port draft, designer signs off before merge.

---

## What this changes in the plan

- The plan needs **15 kits** for limited GA, not 4.
- The **project shell kit** is the keystone — it gates ~8,000 LOC of legacy retirement and unblocks all other capability migrations to share chrome.
- Five kits (3, 4, 5, 6, 7) ship against backend that's already 70%+ built — these are the fastest wins per week.
- Two kits (10, 15) require a backend buildout first (filing calendar dep engine, Q-Sub schema). Q-Sub schema is drafted at `shared/schema/q-sub.ts` and ready for backend lead review.

---

## Decisions Claude Design owes back

1. **Project shell kit scope.** One kit covering rail + palette + project-create + project-settings + workspace, or four smaller kits?
2. **Visual hierarchy: workstream tab vs project list in the rail.** Two-tier (project picker on top), or composed into one (active project name as topbar item with workstreams in rail only)?
3. **AI letter visual.** Inbox vs threaded conversation vs hybrid?
4. **Reviewer simulator visual.** Persona-toggle column vs persona-tab strip vs persona-as-filter dropdown?
5. **Pre-flight RTA gate placement.** Inline at top of submission center, or modal-only (only opens when user clicks "Submit to FDA")?
