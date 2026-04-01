# Harness Feature Audit + Cross-Session Review (2026-04-01)

## Scope

Audit of:

1. Current harness feature branch (`cursor/customer-shaped-harness-build-e420`) and PR #324,
2. Entire governed harness feature set delivered in this branch,
3. Other open Cursor sessions/PRs,
4. Remote Cursor/Codex branches without open PRs (to identify stranded work),
5. Concrete next-step execution plan.

---

## A) Current Branch + PR Status

- **Current branch:** `cursor/customer-shaped-harness-build-e420`
- **Working tree:** clean
- **Ahead of `concept2cure-v2`:** 5 commits
  - `00991f2f` feat: enforce customer-shaped governed harness core authority
  - `27cfd5cb` fix: harden governed route enforcement and transition QA
  - `8052f962` fix: enforce governed contract in service-layer artifact writers
  - `1c345f4c` fix: enforce governed contract on ai action artifact mutations
  - `1be5a622` fix: fail closed upload and normalize governed action errors
- **PR:** #324 (draft), base `concept2cure-v2`
- **PR delta size:** 23 files, +3832 / -153

### Local/targeted harness validation

Passed together:

- `tests/document-contract.governed.test.ts`
- `server/services/__tests__/governedDocumentContractService.test.ts`
- `server/services/__tests__/governedRuleResolver.test.ts`
- `tests/routes/concept2cure-governed-upload.test.ts`
- `tests/routes/authoring-actions-governance.test.ts`

Result: **12/12 passing**.

---

## B) Harness Feature Set Audit (What is actually enforced now)

### 1. Canonical governed authority is materially in place

Core authority stack is implemented and wired:

- `shared/types/document-contract.ts`
- `server/services/concept2cure/governedDocumentContractService.ts`
- `server/services/concept2cure/rules/ruleResolver.ts`
- `server/services/concept2cure/rules/rulePacks.ts`
- `server/services/concept2cure/rules/personaOverlays.ts`
- `server/services/concept2cure/authority/documentClassSemantics.ts`

### 2. Route/service write-path wiring status

Artifact write surfaces found and reviewed:

- `server/routes/concept2cure.ts`
- `server/routes/knowledge-base.ts`
- `server/routes/authoring-actions.ts`
- `server/services/ana-guidance-executor.ts`
- `server/services/contradiction-consequence-service.ts`
- `server/services/ai-actions/handlers/promote-artifact.ts`
- `server/services/ai-actions/handlers/refine-with-validation.ts`
- `server/services/ai-actions/handlers/attach-sources.ts`

All above now include governed resolution before mutation paths where artifact writes occur.

### 3. Specific residual risk discovered in this audit (important)

`server/routes/knowledge-base.ts` still contains **best-effort/non-fatal artifact-save behavior** in selected flows:

- Module 3 DOCX generation `saveAsArtifact` path catches and logs save failures (`Could not save Module 3 as artifact`) and still returns generated DOCX.
- Vault connector versioning path catches and logs version insert issues (`Vault DMS version insert skipped`) and still returns success.
- IND autodraft section generation catches DB save failures and continues to return generated section content.

Interpretation:

- These are no longer raw bypasses of governed validation where writes happen, but they are **still consequence-soft paths** (generation can succeed while governed persistence consequence fails).
- This conflicts with strict “no regulated generation without governed consequence” for the strongest interpretation of product law.

### 4. Documentation consistency check

Current audit/proof docs were updated and now correctly reflect:

- Upload convergence now fail-closed
- Authoring-actions governed invalid envelopes normalized
- Main residual gap shifted upstream to orchestration hygiene and consequence-hardening opportunities.

---

## C) CI/PR Health Findings (PR #324)

PR #324 is `UNSTABLE` due to repo/workflow-level blockers not unique to this branch:

1. **setup/typecheck workflow issue**
   - Missing lockfile in runner path for that workflow step (`Dependencies lock file is not found ... package-lock.json`).
2. **Neon setup failure**
   - API key scoped to a different project (`not allowed to perform actions outside the project this key is scoped to`).
3. **Security Scan failure**
   - CI references unresolved action version: `aquasecurity/trivy-action@0.20.0`.
4. **Lint failures**
   - Includes pre-existing broad lint debt and duplicate keys/no-alert/no-dupe-keys/no-regex-spaces across many files beyond this branch.
5. **Preview DB migration failure**
   - `db/migrations/20260129_workflow_indexes_and_dlq.sql` expects `tenant_id` column not present in preview schema path.

These are largely cross-repo CI baseline issues, not specific regressions introduced only by this harness branch.

---

## D) Other Open Cursor Sessions / PRs (not yet in concept2cure-v2)

Open PRs discovered:

- #327 `cursor/biotech-client-ui-experience-ebb9` (9 files, +441/-54)
- #326 `cursor/central-system-review-18f8` (9 files, +1017/-432)
- #325 `cursor/customer-shaped-harness-build-5841` (25 files, +3754/-120)
- #324 `cursor/customer-shaped-harness-build-e420` (this branch)
- #323 `cursor/ana-intelligence-refinement-35c8` (12 files, +?; targeted AnA work)
- #320, #309 older codex PRs still open

### Cross-PR overlap risk with #324

File overlap computation:

- #323 vs #324: **0 overlapping files**
- #325 vs #324: **0 overlapping files**
- #326 vs #324: **0 overlapping files**
- #327 vs #324: **1 overlapping file**
  - `server/routes/authoring-actions.ts`

Primary merge-conflict risk relative to #324 is therefore **PR #327**.

---

## E) Remote branches without open PR (stranded work audit)

Remote `cursor/*` + `codex/*` branches tracked: 38

- Open-PR heads: 7
- Without open PR: 35
  - Already merged into `concept2cure-v2`: 22
  - Not merged and no open PR: 13

Not-merged/no-open-PR branches:

- `codex/audit-ana-access-and-control-mechanisms`
- `codex/audit-and-compress-biotech-experience`
- `codex/audit-last-20-prs-for-correct-wiring`
- `codex/audit-last-20-prs-for-correct-wiring-btzyb0`
- `codex/audit-last-20-prs-for-correct-wiring-cj22xo`
- `codex/audit-last-20-prs-for-correct-wiring-inn8d5`
- `codex/audit-last-20-prs-for-correct-wiring-ot4ghx`
- `codex/build-ana-document-product-quality-stack-yipiap`
- `codex/perform-security-audit-and-remediation-plan`
- `codex/review-application-security-posture`
- `codex/review-application-security-posture-61kpxc`
- `cursor/critical-files-management-f38a`
- `cursor/development-environment-setup-811c`

### Priority among stranded branches

High-priority by likely production relevance:

1. `cursor/critical-files-management-f38a` (33 commits, 50 files, ahead 33 / behind 0)
2. `cursor/development-environment-setup-811c` (2 commits, 155 files)
3. `codex/perform-security-audit-and-remediation-plan` (2 commits, 351 files)
4. `codex/review-application-security-posture` family (security hardening candidates)

Low-priority/noisy:

- Multiple `audit-last-20-prs-for-correct-wiring-*` and mega-diff audit branches (700+ files each), likely tooling/docs-heavy and stale versus current base.

---

## F) Overall Assessment

### Harness branch quality

- **Strong progress**: canonical governed authority, route/service convergence, fail-closed upload path, normalized governed invalid envelopes, and loud tests now exist.
- **Residual technical debt**: certain knowledge-base generation/export helper flows still treat governed artifact/version persistence failures as non-fatal.
- **Merge safety**: main conflict hotspot is `server/routes/authoring-actions.ts` with PR #327.

### Repo integration reality

- Current blockers to landing are mostly **CI platform/dependency/workflow baseline failures** rather than harness logic regressions.
- There is meaningful additional work in other sessions not yet merged to `concept2cure-v2`, with at least two high-value branches needing triage.

---

## G) Recommended Next-Step Plan

### Phase 1 — Cross-session triage (control-tower pass)

1. Triage #327 against #324 specifically on `server/routes/authoring-actions.ts`; decide merge order and conflict policy.
2. Triage #325/#326/#323 for sequencing and compatibility with harness branch.
3. For the 13 unmerged/no-open-PR branches, open/close decision matrix:
   - Promote to PR (if high-value, low-risk),
   - Cherry-pick critical commits,
   - Archive/drop stale audit-only mega-diff branches.

### Phase 2 — Harness hardening (single branch, small commits)

1. Convert remaining knowledge-base best-effort saves to explicit fail-closed behavior where they represent regulated output consequence.
2. Add loud tests covering:
   - Module3 saveAsArtifact failure semantics,
   - IND autodraft artifact-save consequence enforcement,
   - Vault connector version consequence semantics.

### Phase 3 — CI unblock prerequisites (minimal, non-feature)

1. Fix workflow lockfile/path expectations for setup/typecheck jobs.
2. Pin/repair broken security action ref (`trivy-action` version).
3. Decide policy for Neon preview setup key scope failures (skip/fail-open per environment flag, or correct key/project).
4. Isolate known repo-wide lint/typecheck debt from branch-specific gates where possible.

### Phase 4 — Merge preparation

1. Rebase/merge with selected upstream PRs per triage order.
2. Re-run targeted harness suites + PR smoke.
3. Update harness truth-table/proof with final post-rebase reality.
4. Move from draft to ready only after conflict-free, auditable pass.

---

## H) Operator Decision Requests (for next execution wave)

To proceed efficiently, pick one:

1. **Control-tower first:** I perform PR/branch triage + merge-order matrix before any more code changes.
2. **Harness-first:** I immediately harden the remaining knowledge-base non-fatal consequence paths.
3. **CI-first:** I focus exclusively on workflow failures blocking stable PR signal.

