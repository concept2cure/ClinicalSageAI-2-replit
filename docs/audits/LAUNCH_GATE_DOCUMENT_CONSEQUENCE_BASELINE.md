# LAUNCH GATE — DOCUMENT CONSEQUENCE BASELINE

Date: 2026-03-27  
Requested branch: `concept2cure-v2` (not present in local clone; work performed on current `work` branch snapshot)

## 1) Beta-visible generated-document entry points (baseline before this sprint pass)

| Entry point | File(s) | Governed artifact created | Appears in project context | Reopens in editor | Version/Status/Placement/Prov/Audit visible | Compute-driven | Proposal-accept-driven | Dead-end / partial baseline |
|---|---|---:|---:|---:|---|---:|---:|---|
| Artifact Compute Plane panel | `client/src/concept2cure/components/compute/ComputeJobPanel.tsx`, `server/services/compute/computeService.ts`, `server/routes/compute.ts` | Yes | Yes | Yes | Mostly yes (all fields present in list/detail + panel) | Yes | No | Partial: consequence is visible, but not unified with proposal history in persisted list state |
| Conversation OS proposal accept | `server/services/conversation-os/artifactProposalService.ts`, `server/routes/conversation-os.ts`, `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | Yes when valid context; explicit persisted-only fallback otherwise | Partial | Partial | Partial (accept response carries fields, but baseline list reload did not carry persisted consequence fields) | No | Yes | Partial: accepts were not fully durable/visible after refresh in proposal list view |
| Workspace recent governed documents | `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | Yes (artifact list based) | Yes | Yes | Partial (metadata visible if present in artifact metadata) | Mixed | Mixed | Partial: proposal-side governed state could be silent after reload |
| Guided authoring / generated draft surfaces reachable via workspace shell | `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` + existing artifact creation surfaces | Mixed by route | Mixed | Mixed | Mixed | Mixed | Mixed | Partial (some flows still export-only elsewhere in codebase; see trust gaps) |

## 2) Top 8 trust gaps (baseline)

1. Accepted proposal consequence fields were not being rehydrated from proposal list reads; visibility depended on same-session local state.  
2. Proposal list endpoint returned only proposal core fields (no governance consequence join), which weakened post-refresh trust.  
3. Workspace “recent governed documents” and proposal consequence were adjacent but not backed by a fully durable shared consequence view.  
4. Some beta-visible generation/export routes in broader codebase remain export/download oriented and are not represented as reopenable governed artifacts.  
5. Proposal persisted-no-governance state existed backend-side, but durable read-path visualization was incomplete.  
6. Not all generation surfaces consistently expose placement/provenance/audit references in the same visible place.  
7. Hero-path trust still depends on users seeing consequence in workspace immediately after action; this was fragile on reload for proposals.  
8. Local repository snapshot lacks `concept2cure-v2` branch, blocking exact-branch verification requested for launch-gate signoff.

## 3) Exact files targeted in this sprint pass

- `server/services/conversation-os/types.ts`
- `server/services/conversation-os/persistence.ts`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `server/services/__tests__/artifactProposalService.test.ts`
- `docs/audits/LAUNCH_GATE_DOCUMENT_CONSEQUENCE_BASELINE.md`
- `docs/audits/LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md`

## 4) Scope control

This pass avoids shell redesign and focuses only on durable, visible governed consequence in existing workspace/product surfaces.
