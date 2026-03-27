# Concept2Cure — Claude Code Planning Prompt for UI / UX / IA Refactor

You are working inside the `concept2cure-v2` branch.

This is a planning sprint first.
Do **not** start with broad code changes.
Do **not** produce a shallow design memo.
Do **not** invent a new product disconnected from the repo.

Your job is to build a **repo-grounded implementation plan** to transform Concept2Cure into a calm, elegant, project-centric operating system experience comparable in clarity and thoughtfulness to ChatGPT / Claude-style software.

## Mission

Create a plan to evolve Concept2Cure from a powerful but overlapping module set into a clean regulatory operating system that:
- is easy for first-time paying users to understand
- is project-centric
- has a short, calm global navigation
- has clear in-project workflow swim lanes
- keeps AnA as the persistent universal guide
- reconciles artifacts / documents / files / vault / DMS into one coherent user language
- supports both client tracks:
  - Pharma & Biotech
  - Medical Device & Diagnostics

## Core product truth to preserve

Concept2Cure should be organized as:

### Global shell
- New
- Search
- Projects
- Apps
- Artifacts
- Setup

### Project shell
- Overview
- Work
- Vault
- Review
- Submit

### Persistent intelligence layer
- AnA 1.0 RI is always present across screens as the single conversational guide and operator.

## Canonical semantic model

Lock this language unless the repo forces a better version:

- **Artifacts** = governed outputs and governed records
- **Documents** = editable artifacts in the Work experience
- **Files** = uploaded / source / supporting stored materials
- **Vault** = the workspace where files live and artifacts can also be browsed in storage / evidence context
- **DMS** = backend capability only, not a major user-facing top-nav term

## Client tracks

The platform must support two client tracks without becoming two separate operating systems:
- Pharma & Biotech
- Medical Device & Diagnostics

Client track should influence:
- defaults
- templates
- submission language
- recommended apps
- guided onboarding

Client track should **not** create separate global shells.

## Global destinations: intended meaning

### New
Used to create:
- new chat with AnA
- new project
- new artifact
- new workspace from template

### Search
Universal search across:
- projects
- artifacts
- files
- apps
- recent chats / sessions
- section codes
- submission types

### Projects
A destination page for:
- project list
- project creation
- search / sort / filter
- status / recent activity
- opening a project

### Apps
A destination launcher page for specialty workbenches and document-producing tools.

Use exactly three groups unless the repo strongly proves otherwise:
- Strategy & Evidence
- Builders
- Specialist Studios

### Artifacts
A destination page for governed outputs and governed records.
Should support:
- recent
- drafts
- in review
- approved
- submission-ready
- filter by project / type / status / date

### Setup
A destination page for:
- org profile
- user defaults / role defaults
- client track preferences
- templates / playbooks
- connectors / integrations
- automation preferences
- onboarding / training

## Project shell: intended meaning

### Overview
Project home, summary, status, next actions, recent artifacts, pending reviews, milestones, risks.

### Work
Main document-making lane.
Includes:
- document editor
- section workspace
- dossier / section map
- templates
- transform canvas
- governed document authoring
- app outputs landing into editable artifacts

### Vault
Files / evidence / source materials / linked artifacts.

### Review
Quality and control center.
Includes:
- quality checks
- compliance
- readiness
- provenance
- compare
- audit trail
- traceability
- signatures
- verification

### Submit
Finalization and filing lane.
Includes:
- submission readiness
- section completeness
- package export
- final checks
- submission-ready outputs

## Apps launcher: intended grouping

### Strategy & Evidence
Examples:
- Deep Research
- Precedent Intelligence
- Evidence Memo
- Protocol Rationale
- Risk-Benefit Analysis

### Builders
Examples:
- Clinical Overview
- Module 3 Builder
- Safety Narrative
- 510(k) Workspace
- PMA Workspace
- CER Generator

### Specialist Studios
Examples:
- CMC
- Biostatistics
- Clinical
- Device

## First-time user orchestration

The current product must be rethought from the perspective of a first-time paying user.

The desired first-time experience is:
1. welcome / orientation
2. quick guided setup
3. create first project
4. land in project Overview
5. guided tour of Overview / Work / Vault / Review / Submit
6. complete first successful action
7. confidence checkpoint

### Required principle
Do **not** onboard by over-explaining agent architecture first.
Do **not** auto-advance users through abstract intro slides.
Users should get to first value quickly.

AnA should act as the universal tour guide and contextual operator.

## Repo-grounded audit targets

Audit these files and any immediately connected dependencies they pull in:
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/concept2cure/components/shell/GlobalOperatingShell.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `client/src/concept2cure/components/enablement/FirstRunExperience.tsx`
- `client/src/concept2cure/components/workspace/GovernedDocumentPanel.tsx`
- `client/src/concept2cure/components/workspace/ProjectFileTree.tsx`
- `client/src/concept2cure/components/workspace/OperatingSystemRegistryPanel.tsx`
- `client/src/concept2cure/components/workspace/SubmissionAppsPanel.tsx`
- `client/src/concept2cure/models/ctdHierarchy.ts`
- any relevant routing or page files connected to Review, Submit, Vault, Apps, or project creation

## What you must produce

Create a thorough planning document at:

`docs/plans/UI_OS_IMPLEMENTATION_PLAN_2026-03-26.md`

The plan must include the following sections:

### 1. Repo truth summary
- what already exists
- what is duplicated / overlapping
- what is mislabeled
- what should be preserved
- what should be demoted or merged

### 2. Final navigation architecture
- global shell map
- project shell map
- contextual project block design
- where AnA lives
- what stays in left rail vs what moves inside project context

### 3. Canonical naming system
Explicitly reconcile:
- artifacts
- documents
- files
- vault
- DMS
- reports
- dossier
- submission

For each term, say:
- canonical meaning
- where shown in UI
- where not shown in UI

### 4. First-time user journey map
From payment/sign-in through first successful action.
Include:
- first-run steps
- exact screens
- AnA guidance moments
- where users can skip
- how track selection changes defaults

### 5. Swim lanes by persona / role
Map the expected path for:
- Regulatory lead
- Medical writer
- CMC specialist
- Biostatistician
- Device / diagnostics lead
- QA / reviewer
- Executive / PM

### 6. Apps launcher plan
- exact app groups
- what belongs in each
- what should launch inside project context
- which current repo surfaces map to each group

### 7. Artifacts / Work / Vault / Review / Submit map
For each, define:
- primary user goal
- object types involved
- key UI components involved in repo
- current problems
- target state

### 8. Sidebar redesign plan
Design the Zen sidebar around:
- global destinations only in global rail
- project-local destinations only when a project is open
- recent projects / recent artifacts / recent chats treatment
- search entry behavior
- account / settings treatment

### 9. Phased implementation plan
Break implementation into phases with exact files and risk.
At minimum:
- Phase 0: audit + naming lock
- Phase 1: shell + sidebar restructure
- Phase 2: project shell cleanup
- Phase 3: artifacts / files / vault reconciliation
- Phase 4: apps launcher
- Phase 5: onboarding / first-run orchestration
- Phase 6: polish / validation / proof

### 10. Validation checklist
Describe exactly how to verify:
- first-time user success path
- app launch path
- CMC path
- Biostatistics path
- device path
- review path
- submit path
- artifact visibility
- vault / file behavior
- search behavior
- no dead-end routes

### 11. Before/after proof expectations
Specify what screenshots / proof files Claude Code should collect once implementation begins.

## Important constraints

- Do not turn this into a dashboard-heavy enterprise UI.
- Do not add more top-level nouns.
- Do not create competing AI personas.
- Do not keep project workflow items mixed into the same hierarchy as global destinations.
- Do not preserve route sprawl just because it already exists.
- Do not collapse Work / Vault / Review / Submit back into one giant workspace soup.
- Do not use “DMS” as a major user-facing label.

## Required quality bar

The plan must be specific enough that a follow-up build sprint can be executed directly from it.
It must reference concrete repo files and current UI realities.
It must be written for humans, not just engineers.
It must show that you understand the difference between:
- global OS navigation
- in-project workflow navigation
- specialty apps
- governed artifacts
- stored files

## Final return format

After writing the plan, return:
1. path to the plan file
2. concise summary of the final architecture
3. biggest current UX risks
4. recommended first implementation phase
5. commit hash

Start by reading the repo and producing the plan only. Do not begin implementation in this sprint.
