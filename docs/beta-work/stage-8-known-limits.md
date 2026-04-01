# Stage 8 — Known Limits and Deliberately Hidden Surfaces

**Date:** 2026-04-01  
**Branch evaluated:** `cursor/customer-shaped-harness-build-5841`

This file is the explicit known-limits pack for the beta release candidate.

## 1) Known limits (validated in Stage 8)

| Area | Current limit | Evidence |
|---|---|---|
| Full repo type safety | `npm run typecheck` is red with broad pre-existing TS issues outside beta slices. | Stage 8 run output (`agent-tools/63df224b-...txt`) |
| Full beta-safe E2E smoke (`smoke:e2e-assembly`) | Cannot run in this environment without `DATABASE_URL` or `TEST_DATABASE_URL`. | Command output: `TEST_DATABASE_URL or DATABASE_URL is required` |
| Auth/tenant smoke slice | `tests/services/roleBasedAccess.test.ts` and `tests/services/mfaService.test.ts` currently fail in this repo state. | Stage 8 run output (`agent-tools/1554d96e-...txt`) |
| Guided demo contract test | `tests/guided-demo-path.test.ts` has drift failures (expects old strings/routes/labels). | Stage 8 run output (`agent-tools/6635c1b7-...txt`) |
| AnA smoke suite | `npm run test:ana` is mostly green but has 1 failing mocked-import scenario in `ana-ri-health.test.ts`. | Stage 8 run output (`agent-tools/43c57ad3-...txt`) |

## 2) Deliberately hidden/demoted surfaces (beta truthfulness)

| Surface | Current handling | Source |
|---|---|---|
| Mission Control / SnowGlobe families | Demoted and redirected; dedicated renderers removed from `ZenApp` render tree. | `client/src/concept2cure/ZenApp.tsx` (`DEMOTED_REDIRECTS`, removed renderer block) |
| Standalone eCTD without active project | Treated as non-primary path; expected to show empty state rather than fake flow. | `docs/proof/GUIDED_DEMO_CHECKLIST.md` |
| Legacy routes (`/v3`, `/client-portal`) | Not part of approved demo path; expected 404/dead path behavior. | `docs/proof/GUIDED_DEMO_CHECKLIST.md` |
| Dr. Sage legacy code | Still present in repo, intentionally not in primary beta shell journey. | `docs/reports/CONTROLLED_BETA_FREEZE_2026-03-27.md` |

## 3) Protected organs (must not be destabilized in beta)

From controlling plan/freeze artifacts, these remain protected:

- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
- `client/src/concept2cure/components/editor/EditorPanel.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `client/src/concept2cure/components/workspace/ReviewReadiness.tsx`
- `client/src/concept2cure/components/workspace/SubmissionReadiness.tsx`
- `server/routes/concept2cure.ts`
- `server/services/export/governedExportConsequence.ts`
- `server/services/compute/exportGovernance.ts`

## 4) Deferred post-beta refactors (explicitly not in Stage 8 scope)

- Dr. Sage code removal
- SnowGlobe dead-code cleanup
- Broad `ZenApp.tsx` decomposition
- Vault upload completion parity across all surfaces
- Sentence-level source traceability depth
- Full collaboration stack parity (CRDT-level)

Primary references:

- `docs/reports/CONTROLLED_BETA_FREEZE_2026-03-27.md`
- `docs/audits/repo-risk-pass-2026-03-26.md`
- `docs/proof/BETA_LAUNCH_LANE_PROOF.md`
- `docs/release/ANA_DOCUMENT_STACK_ROLLBACK.md`

## 5) Contradictions to carry forward openly

1. **Vault behavior contradiction** between older freeze docs (browse-only) and launch-lane proof (upload built).  
2. **Controlled beta vs broad beta posture** across docs (`READY for controlled beta` vs `NO-GO for broad beta`).  
3. **Demo contract tests vs current UI labels/flows** (test drift).

These are documented intentionally; they are not hidden in this RC pack.
