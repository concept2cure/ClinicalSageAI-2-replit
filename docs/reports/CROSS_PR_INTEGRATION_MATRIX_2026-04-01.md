# Cross-PR Integration Matrix — 2026-04-01

## Scope

Open PRs targeting `concept2cure-v2`:

- #327 `cursor/biotech-client-ui-experience-ebb9` (draft)
- #326 `cursor/central-system-review-18f8` (draft)
- #325 `cursor/customer-shaped-harness-build-5841` (draft)
- #324 `cursor/customer-shaped-harness-build-e420` (draft)
- #323 `cursor/ana-intelligence-refinement-35c8` (draft)
- #320 `codex/refactor-codebase-for-optimization` (open)
- #309 `codex/implement-ana-continuous-conversation-queue` (open)

---

## 1) CI/merge-health snapshot

All open PRs are currently non-green:

- Draft PRs (#327/#326/#325/#324/#323): `UNSTABLE`
- Open codex PRs (#320/#309): `DIRTY`

Common failing checks across nearly all:

- `Lint`
- `typecheck`
- `Security Scan`
- preview/setup scaffolding checks (`setup`, `preview_db_test`)

Secondary failures:

- `Danger` / `Danger.js Automated Review` on some PRs
- `ops-audit` on selected PRs (#325, #320)
- `PR Validation` on some codex PRs

Interpretation:

- The biggest blocker to safe merge sequencing is **shared CI baseline instability**, not a single feature defect.
- Merge ordering should still prioritize overlap risk first.

---

## 2) File overlap matrix (open PRs)

Computed overlaps among open PR file sets:

1. **#323 ↔ #309 (2 files)**
   - `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
   - `server/routes/ana-ri.ts`
   - **Risk: high** (same AnA/chat + route surfaces)

2. **#327 ↔ #325 (1 file)**
   - `client/src/concept2cure/ZenApp.tsx`
   - **Risk: medium** (shell/navigation concurrency)

3. **#327 ↔ #324 (1 file)**
   - `server/routes/authoring-actions.ts`
   - **Risk: high** (governed authoring core)

4. **#326 ↔ #320 (1 file)**
   - `server/index.ts`
   - **Risk: high** (mount-order and runtime authority)

5. **#325 ↔ #323 (1 file)**
   - `tests/routes/ana-ri-health.test.ts`
   - **Risk: low/medium** (test-level conflict)

6. **#325 ↔ #320 (1 file)**
   - `package.json`
   - **Risk: medium** (script/dependency churn conflict)

---

## 3) Recommended merge order (risk-aware)

### Phase A — stabilize governance/control-plane branch first

1. **#325** (this branch) after finishing current local uncommitted governance-v2 delta.
   - Rationale: introduces no-regression governance foundation used to evaluate later merges.

### Phase B — resolve highest overlap clusters

2. **Choose one of #323 vs #309 first** (both touch AnA route/chat core).
   - Prefer the one with smaller diff/scope or cleaner conflict resolution path.
3. Merge the second only after rebasing/revalidating against the first.

4. **Choose one of #327 vs #324 first** (authoring-actions overlap via #327↔#324).
   - Rebase second on merged first; re-run targeted authoring tests.

### Phase C — infrastructure/documentation refactor PRs

5. **#320** after #325 (and after #326 decision), because of `package.json` + `server/index.ts` overlap risk.
6. **#326** (docs/audit addendum) can merge earlier if rebased and conflict-free, but if it still touches `server/index.ts` snapshots, place it after runtime changes settle.

---

## 4) Immediate next actions

1. Finish and ship the **current local uncommitted delta on #325**:
   - route owner mapping + route latest artifact output
   - repo-health owners + markdown output
   - CI artifact upload + nightly strict wiring
   - strict warning-limit enforcement fix in route audit

2. After #325 update is pushed, generate a short **conflict-resolution checklist** for:
   - (#323, #309) AnA surfaces
   - (#327, #324) authoring-actions + shell surfaces

3. Require a minimum focused test set before each merge candidate:
   - AnA cluster: `tests/routes/ana-ri-health.test.ts` + relevant orchestrator tests
   - Authoring cluster: `tests/resolution/e2e-authoring-workflow.test.ts` + governed export tests
   - Runtime cluster: route mount audit + repo-health no-regression scripts

---

## 5) Decision summary

Most productive "next area of major progress":

- **Integration governance and merge sequencing**, not additional feature expansion.

Reason:

- Parallel streams are active and overlapping on core files.
- Without sequence control, merges into `concept2cure-v2` will produce expensive conflict churn and unclear regressions.

