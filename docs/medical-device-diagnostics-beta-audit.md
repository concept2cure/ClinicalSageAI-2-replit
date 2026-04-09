# Medical Device & Diagnostics Unified Workbench Audit (Beta Plan)

## Scope
This audit inventories the current platform capabilities for medical device + diagnostics clients and defines how to unify execution for FDA 510(k), PMA, CER/IVDR, and eSTAR submission work under a single workbench experience.

## Current Capability Inventory

### 1) Pathway-specific builders
- **510(k) Workspace**: supports predicate strategy and substantial equivalence package development.
- **PMA Workspace**: supports premarket approval workflow with high-risk evidence assembly.
- **CER Generator**: supports EU MDR/IVDR clinical evaluation report generation.

### 2) Cross-cutting operating surfaces
- **Project module integration**: app connection model initializes app memory roles in project context.
- **Collaboration + tasks**: Communication Center provides integrated task board, collaboration threads, and review pulse.
- **Submission center/eSTAR lane**: Submission & Agency Portal tab provides package assembly and agency-response workbench.

### 3) Gaps to close for beta
- Establish one canonical “Device & Diagnostics Workbench” entry point in **Apps**.
- Keep all pathway tools and operational surfaces discoverable from that workbench.
- Standardize beta acceptance metrics and pilot-readiness checklist for this client cohort.

## Unified Workbench Journey
1. Intake device/diagnostic profile and classify pathway fit (510(k), PMA, CER, De Novo, IVDR).
2. Draft and evidence-map artifacts in pathway workspaces with project-aware context.
3. Route cross-functional collaboration and tasks from linked review lanes.
4. Compile package and execute submission center/eSTAR-ready workflow.
5. Monitor agency correspondence and response cycles in the same control plane.

## Wiring Model (Implementation)
- Add a dedicated **Device & Diagnostics Workbench** app card under Apps.
- Register the same app in project connected-app catalog for project-level wiring.
- Render a unified workbench page that:
  - exposes launches to 510(k), PMA, and CER;
  - provides inventory + journey + beta checklist;
  - embeds Communication Center to keep collaboration/task/submission flows in one place.

## Beta Exit Criteria (recommended)
- Project context reliably hydrates all connected device/diagnostics tools.
- Collaboration, task, and submission tabs show live or fallback operational states with no dead routes.
- At least one test project can complete end-to-end: draft → review → package assembly → submission center handoff.
- Pilot analytics captured: cycle time, unresolved issues, response SLAs, package defect count.
