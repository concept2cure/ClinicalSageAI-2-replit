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

---

## 6) Conflict-resolution playbook — #323 vs #309 (AnA surfaces)

Status refresh:

- #323 is **MERGED** into `concept2cure-v2`.
- #309 is **OPEN** and currently **CONFLICTING**.
- Therefore this is now a **forward-port playbook**: preserve merged #323 architecture while reintroducing #309 queue behavior safely.

### 6.1 Overlap hotspots (exact files)

1. `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
   - #323 adds decision-aware rail + slash parity + shared intelligence flow touches (major hunks around prior ranges ~267-558, ~744-902, ~1993-2221, ~3741-4240).
   - #309 adds persistent conversation queue + streamed turn-hand-off touches (major hunks around prior ranges ~320-4135 and ~4852-5331).
   - **Conflict risk:** both branches modify send/stream orchestration and lower input/controls rendering regions.

2. `server/routes/ana-ri.ts`
   - #323 refactors chat/stream flow to shared context helpers and command/intelligence wiring.
   - #309 injects queue metadata responses for chat + stream (`buildQueueMeta`, `queueMeta` envelope paths).
   - **Conflict risk:** both branches touch chat/stream response envelope shape and route internals.

### 6.2 Merge precedence contract

Apply this precedence during conflict resolution:

1. **Keep #323 as structural authority** for AnA route architecture:
   - shared helper usage and enrichment wiring,
   - slash parity contract pathing,
   - decision/intelligence rails already merged.
2. **Reapply #309 as behavioral delta only**:
   - queue state model, persistence, resume/retry UX,
   - stream handoff behavior,
   - response `queueMeta` propagation where absent.
3. If a hunk is ambiguous, prefer:
   - imported shared helper + existing #323 call graph,
   - then layer queue logic without reintroducing pre-#323 duplicated flow.

### 6.3 Deterministic rebase procedure (for #309 branch owner)

1. Rebase #309 branch onto latest `origin/concept2cure-v2`.
2. Resolve `AnaPersistentPanel.tsx` with a three-way intent pass:
   - pass A: retain #323 decision rail + slash command scaffolding;
   - pass B: restore queue types/state (`conversationQueue`, `activeQueueItemId`, persistence key, queued lifecycle helpers);
   - pass C: verify only one send/stream pipeline remains (no duplicate send handlers).
3. Resolve `server/routes/ana-ri.ts` by preserving #323 route architecture and ensuring:
   - `queueMeta` exists in `/chat` success envelope,
   - `queueMeta` exists in `/stream` final success envelope,
   - `queueMeta` also included in stream error payload path.
4. Re-run lint/typecheck before tests to detect duplicate symbol or envelope-shape drift early.

### 6.4 Required validation gate before merge

Minimum focused set (must pass):

- `tests/routes/ana-ri-health.test.ts`
- `server/services/__tests__/ana-ri.test.ts`
- any queue-focused tests touching `AnaPersistentPanel` behavior (or equivalent new tests if absent)
- `npm run ci:audit-route-mounts:no-regression`
- `npm run audit:repo-health:no-regression`

Recommended additional confidence checks:

- targeted chat/stream contract smoke (verify `queueMeta` returned in both `/chat` and `/stream`)
- manual chat UI pass:
  - enqueue while active response is running,
  - refresh browser and confirm queue restoration,
  - resume/retry controls behave deterministically.

---

## 7) Conflict-resolution checklist — #327 vs #324 (authoring-actions + shell surfaces)

Status refresh:

- #327 is **MERGED**.
- #324 is **MERGED**.

Both already landed; this checklist is a **post-merge guardrail** for any follow-on PRs touching these same surfaces.

### 7.1 Surface checklist

When a future PR touches either:

- `server/routes/authoring-actions.ts`
- `client/src/concept2cure/ZenApp.tsx`

require:

1. Route authority confirmation:
   - no bypass path around governed authoring actions,
   - mount and prefix remain compliant with route-audit guardrails.
2. Shell/navigation confirmation:
   - no regression in canonical entry points to EditorPanel and document lifecycle stages.
3. Test gate:
   - `tests/resolution/e2e-authoring-workflow.test.ts`
   - governed export route/consequence checks
   - governance audits (`ci:audit-route-mounts:no-regression`, `audit:repo-health:no-regression`).

### 7.2 Escalation rule

If both files are changed in one PR, classify as **high integration risk** and require:

- explicit reviewer sign-off from both authoring and shell owners,
- conflict simulation against latest `concept2cure-v2` before merge queue entry.

---

## 8) Validation evidence addendum (executed on 2026-04-01)

Focused validation gate requested for the #323/#309 playbook has been executed on branch `cursor/customer-shaped-harness-build-5841`.

### 8.1 Governance no-regression checks

1. `npm run ci:audit-route-mounts:no-regression`  
   - Result: **PASS**
   - Snapshot: `Errors: 0`, `Warnings: 16`
   - Baseline delta: `+0 new errors`, `+0 new warnings`
   - Artifact updated: `docs/reports/route-mount-audit-latest.json`

2. `npm run audit:repo-health:no-regression`  
   - Result: **PASS**
   - Snapshot:
     - duplicate basenames: `195` (delta `0`)
     - files over byte threshold: `26` (delta `0`)
     - files over line threshold: `85` (delta `0`)
   - Artifact updated:
     - `docs/reports/repo-health-scan-latest.json`
     - `docs/reports/repo-health-scan-latest.md`

### 8.2 AnA focused suite

3. `npm run test:ana`  
   - Result: **PASS**
   - Vitest summary: `4 files`, `137 tests`, all passing
   - Included suites:
     - `tests/routes/ana-ri-health.test.ts`
     - `tests/routes/ana-gap-analysis.test.ts`
     - `tests/resolution/ana-orchestrator.test.ts`
     - `server/services/__tests__/ana-ri.test.ts`

### 8.3 Gate status conclusion

The required focused gate defined in section 6.4 is currently **satisfied** for AnA + governance no-regression checks in this branch state.

