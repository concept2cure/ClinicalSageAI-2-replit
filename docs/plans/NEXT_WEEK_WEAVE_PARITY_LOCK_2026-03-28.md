# Next-Week Weave Parity Lock — Non-Negotiable

**Date:** 2026-03-28  
**Branch:** `concept2cure-v2` only  
**Audience:** Claude Code  

## Mission
By next week, Concept2Cure must reach **customer-visible parity** with Weave on the core regulated submission workspace.

This is not an architecture exercise.
This is not a cleanup sprint.
This is not a platform theory discussion.

This is a **close-the-gap sprint**.

## The only scoreboard that matters
From the repo parity matrix, Weave-visible use cases currently stand at:
- **MATCHED (5):** AI drafting, template-driven authoring, review, verification, governed publishing/export
- **PARTIAL (3):** Dossier Manager, Submission Builder visibility, connected collaboration
- **GAP (2):** Data Room/Ask, HAQ workflow

The job is simple:
- close the **2 gaps**
- upgrade the **3 partials** until they are honest parity

Do not spend time adding more hidden capability while visible parity remains unfinished.

## Required deliverable by end of sprint
A biotech/pharma user must be able to:
1. Create a project from the Global Regulatory Document Registry
2. Open a clear central workspace for the submission workflow
3. Upload project documents into a Data Room / Vault
4. Ask AI questions over project-scoped documents and receive grounded answers with visible sources
5. Open or create governed drafts directly into the canonical editor
6. See live dossier section readiness driven by real artifact state
7. Move documents through a visible Draft → Review → Verify → Publish lifecycle
8. Assemble/export through governed submission/export flow
9. Ingest regulator questions / HAQs / deficiency items
10. Draft, review, and export HAQ responses as governed artifacts

If those ten things are true, parity is defensible.
If they are not true, parity is not done.

## Priority order — do not deviate

### 1. Data Room / Ask (GAP)
Build or finish the real project-scoped Ask flow.

Must-have outcome:
- upload documents
- browse/search documents
- ask questions over project documents
- return grounded answers with visible source references/snippets
- no fake generic-chat fallback presented as Data Room intelligence

Likely files and seams:
- `client/src/components/coauthor/AskDataRoomPanel.jsx`
- `client/src/concept2cure/pages/VaultPage.tsx`
- `server/services/foresight-rag-service.ts`
- `server/services/deep-research-orchestrator.ts`
- real route wiring for `/api/evidence/ask`

### 2. HAQ Manager (GAP)
Build the visible HAQ workflow.

Must-have outcome:
- ingest questions / deficiency items / authority queries
- organize by question, section, topic, status, risk
- draft governed responses using project context and source docs
- review/edit responses in the editor
- export HAQ package or response set

Use existing backend intelligence if present:
- `server/services/regulatory-precedent-intelligence/ema-question-taxonomy-service.ts`
- `server/services/regulatory-precedent-intelligence/crl-trigger-service.ts`

Create a visible UI in the project work path.

### 3. Dossier Manager (PARTIAL → PARITY)
Strengthen dossier behavior.

Must-have outcome:
- dossier tree shows live section readiness from actual artifact/placement/status data
- section click opens the existing artifact or a guided governed create flow
- updates to documents update dossier state visibly
- section readiness is no longer decorative

Likely files:
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `client/src/concept2cure/components/workflow/DossierMap.tsx`
- `server/routes/concept2cure.ts`
- registry/readiness/bootstrap services as needed

### 4. Submission Builder visibility (PARTIAL → PARITY)
Make submission assembly/export obvious in the main path.

Must-have outcome:
- user can clearly find the submission/assembly flow from the central workspace
- assembly/export no longer feels buried in separate navigation
- governed export is the visible default path

Use existing surfaces:
- `client/src/concept2cure/components/workflow/SubmissionReadiness.tsx`
- `server/routes/ectd-compile.ts`
- `server/routes/ectd-export.ts`
- `server/routes/cerv2-export-routes.ts`

### 5. Connected collaboration / lifecycle (PARTIAL → PARITY)
Reorganize the editor around a visible lifecycle.

Must-have outcome:
- clear 4-stage indicator: Draft → Review → Verify → Publish
- existing inspector panels grouped into those stages
- obvious next action in each stage
- review/provenance/compliance/export feel like one connected system, not random inspector panels

Primary file:
- `client/src/concept2cure/components/editor/EditorPanel.tsx`

### 6. Convergence cleanup required for parity
Any creation flow that still creates an artifact without opening it directly into the editor/workflow must be fixed now.

No dead-end creation paths.
No “artifact created, go find it yourself.”

## Beta-safe constraint
Do not break governed export. Keep policy enforcement and governed consequence paths intact.

If a visible export flow bypasses governed consequence, fix it.
If a beta-visible path is ungoverned, it is not acceptable.

## What NOT to do in this sprint
Do NOT:
- expand the registry further unless required for parity path completion
- do broad codebase cleanup
- refactor `server/index.ts` for elegance
- rewrite auth or tenant systems
- add dashboards that distract from the work path
- build hidden intelligence nobody sees
- create parallel editors or parallel workspaces

## Mandatory repo-truth note before coding
Before implementation, produce a short repo-truth status note that says:
1. what is already done vs still open for each of the 5 required parity areas
2. exact files you will edit/create
3. which visible user paths will change
4. what the minimum end-to-end parity demo path will be

Then implement.

## Mandatory proof before declaring done
Do not claim parity without proof.

Deliver all of the following:
1. exact files created/edited
2. what gap/partial each change closed
3. end-to-end click path for the parity demo
4. screenshots or equivalent proof docs if possible
5. test evidence for major paths
6. explicit statement of anything still deferred

## Definition of done
You may only say “Weave customer-visible parity achieved” when:
- Data Room / Ask is real and grounded
- HAQ workflow is visible and governed
- dossier readiness is live
- submission builder path is obvious and governed
- editor lifecycle is coherent and visible
- no major visible creation dead ends remain

Until then, do not overclaim.

## Tone and execution style
Be surgical.
Be fast.
Be honest.
No more planning theater.
Ship visible parity.
