# LAUNCH GATE — DOCUMENT CONSEQUENCE REPORT (Sprint Result)

Date: 2026-03-27

## Scope executed
Focused only on compute consequence visibility, proposal acceptance consequence visibility, and in-workspace consequence surfacing. No shell-wide redesign work was performed.

## Implemented changes

### 1) Compute consequence metadata hardening
- Compute writeback now stamps governed metadata (`source`, `governed`, provenance/audit presence) at artifact creation.
- Compute service now passes explicit compute source metadata and returns a `governedConsequence` payload in create-job responses.

### 2) Proposal accept consequence durability + visibility
- Proposal accept writeback now stamps `proposal_accept` source metadata.
- Governed acceptance response now returns the governed artifact id (not the seed proposal artifact id).
- Conversation persistence proposal listing now hydrates latest accepted consequence data (governance state, artifact version/status, placement, provenance/audit refs).

### 3) Workspace consequence surface
- Added a thin “Document Consequence Ledger” in `ProjectWorkspaceShell` that shows:
  - title
  - artifact id
  - version
  - status
  - source type (`compute`, `proposal_accept`, `generated_draft`)
  - placement
  - provenance present
  - audit present
  - open in editor/provenance/audit actions
- Added helper logic for deterministic merged consequence rows from compute jobs, accepted proposals, and generated drafts.

### 4) Compute panel visibility polish (non-cosmetic)
- Compute consequence summary now surfaces explicit artifact/provenance/audit refs and placement state.
- Action labels clarified to “Open in editor”, “Open provenance”, “Open audit”, and “Apply placement”.
- Replaced touched ad-hoc raw action buttons with governed `Button` component usage.

### 5) GA hardening follow-up (post-review)
- Eliminated duplicate artifact creation in Submission Apps flow by reusing the artifact id returned by the initial create API call.
- Added `generated_draft` source metadata at draft creation points so workspace consequence classification is deterministic.
- Tightened consequence ledger to avoid mislabeling manual artifacts as generated consequences.
- Marked non-reopenable consequences honestly in the ledger (`Not reopenable in editor`) rather than presenting a misleading open action.

## Focused tests added/updated
- Updated compute integration test to assert governed consequence payload fields.
- Added conversation proposal persistence test to verify proposal list hydration with governed consequence state.
- Added workspace consequence-row unit tests for source typing, metadata fields, dedupe behavior.
- Added a guard test confirming manual artifacts are excluded from generated consequence rows.

## Hero path truth after sprint

### Fully governed + visible
- Compute-generated document path (Artifact Compute Plane presets) -> governed artifact + visible consequence + reopen path.
- Proposal acceptance path with valid context -> governed consequence persisted + visible state + reopen path.
- Generated draft flows (submission apps / transform create-draft callback) -> project-bound artifacts visible in consequence ledger with reopen path.

### Partial / caveated
- Any legacy/off-path routes outside the workspace hero path that still return download URLs remain outside this sprint’s touched scope.
- Local environment missing dependencies prevented runtime lint/test execution; assertions rely on code inspection and static patch review.

## Dead-end handling status
- No new download-only behavior introduced.
- In touched surfaces, consequence is now rendered as project-bound artifact entries with editor reopen actions.

## Risk notes
- Requested branch `concept2cure-v2` does not exist in local refs; work was committed to current branch (`work`).
- Manual browser-level smoke was not possible in this environment (no browser tool in toolchain for this run).
