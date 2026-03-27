# LAUNCH GATE — DOCUMENT CONSEQUENCE BASELINE (Pre-sprint)

Date: 2026-03-27  
Branch observed: `work` (requested `concept2cure-v2` not present in local git refs)

## 1) Beta-visible generated-document entry points

| Entry point | Surface | Creates governed artifact? | Appears in project context? | Reopens in editor? | Version/status/placement/provenance/audit visible? | Compute-driven? | Proposal-accept-driven? | Dead-end/partial status |
|---|---|---|---|---|---|---|---|---|
| Compute preset launch (`Artifact Compute Plane`) | `ComputeJobPanel` in dashboard | Yes (via compute writeback) | Yes after artifact reload/list path | Yes (`Open`) | Partial: status/version/placement shown; refs mostly abbreviated and split between summary/details | Yes | No | Partial visibility quality |
| Conversation proposal accept | `ProjectWorkspaceShell` proposal cards | Yes or persisted-only fallback | Partial: accepted governance is tracked in local state, but proposal reload path drops consequence fields | Yes when governed artifact id exists | Partial: shown immediately after action, not robust on refresh/list | No | Yes | Partial durability-to-UI mapping |
| Submission Apps “Create Governed Draft” | `SubmissionAppsPanel` via `onCreateDraft` | Yes (artifact creation path) | Yes | Yes | Partial: appears as artifact but source/provenance/audit semantics unclear in recent list | No | No | Partial metadata trust |
| Transform Canvas / phase-4 draft create | `ProjectWorkspaceShell` `handlePhase4CreateDraft` | Yes | Yes | Yes | Partial: same metadata clarity gap | No | No | Partial |
| Governed export compute preset | `ComputeJobPanel` preset (`governed_export`) | Yes artifact is created; output still file-oriented | Yes | Yes | Partial: intent/export semantics not explicitly labeled export-only vs editable artifact consequence | Yes | No | Partial labeling |

## 2) Exact files to touch

- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `client/src/concept2cure/components/compute/ComputeJobPanel.tsx`
- `server/services/compute/computeService.ts`
- `server/services/compute/artifactWriteback.ts`
- `server/services/conversation-os/persistence.ts`
- `server/services/conversation-os/types.ts`
- `server/services/conversation-os/artifactProposalService.ts`
- `server/__tests__/services/computeService.integration.test.ts`
- `server/services/__tests__/conversation-os.test.ts`
- `client/src/concept2cure/components/workspace/documentConsequence.ts` (new)
- `client/src/concept2cure/components/workspace/__tests__/documentConsequence.test.ts` (new)

## 3) Top 8 trust gaps in current visible beta path

1. Proposal consequence metadata is not reliably returned from proposal list reads (refresh can lose governed/persisted nuance).
2. Proposal cards map API responses to only `id/status` during initial snapshot load, dropping consequence fields.
3. Compute consequence summary is present but not structured as an explicit governed consequence contract (artifact id/refs are visually weak).
4. Workspace “Recent Governed Documents” relies on inconsistent artifact metadata fields (`source`, provenance/audit presence) that are not guaranteed by writeback.
5. Compute writeback metadata does not consistently mark source/governed/provenance/audit presence for downstream UI trust surfaces.
6. Proposal accept writeback does not stamp source metadata to let workspace distinguish proposal-governed consequences from manual drafts.
7. Placement/provenance/audit action affordances are split across panels, making consequence loop less immediate and less undeniable.
8. Hero-path generated drafts (Submission Apps / transform-create) become artifacts, but consequence surface does not consistently identify them as generated draft sources.
