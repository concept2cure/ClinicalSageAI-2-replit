# Swarm Audit + Next Steps — 2026-04-01

## Scope

Audit requested for:
1. All work completed in this thread/feature set.
2. Open sessions/signals not yet promoted to `concept2cure-v2`.
3. Current branch state and uncommitted delta.
4. Clear, staged next-step plan.

---

## 1) Current branch + feature-set status

Branch: `cursor/customer-shaped-harness-build-5841`  
Base target: `concept2cure-v2`

### Landed in this branch (already pushed/PR-updated)

- Stage 8 beta RC docs and runbooks.
- Navigation coherence fix in `ZenApp.tsx`.
- Dead file removals + legacy route deprecation labeling.
- QA stabilization for:
  - `tests/routes/ana-ri-health.test.ts`
  - `tests/guided-demo-path.test.ts`
  - `tests/services/roleBasedAccess.test.ts`
  - `tests/services/mfaService.test.ts`
- New governance tooling:
  - `scripts/ci/audit-route-mounts.mjs`
  - `scripts/audits/repo-health-scan.mjs`
  - CI wiring for no-regression checks
  - baseline files and generated report artifacts

### Not yet committed (local working tree now)

Modified:
- `.github/workflows/ci.yml`
- `package.json`
- `scripts/ci/audit-route-mounts.mjs`
- `scripts/audits/repo-health-scan.mjs`
- `docs/reports/repo-health-scan-latest.json`

Untracked:
- `docs/reports/route-mount-owners.json`
- `docs/reports/repo-health-owners.json`
- `docs/reports/route-mount-audit-latest.json`
- `docs/reports/repo-health-scan-latest.md`

### Audit verdict on local delta

The local delta is **coherent and high value**, but **not yet ready to merge** because:

1. **Route full-strict enforcement bug was discovered and patched mid-pass**  
   - `--max-warnings` needed explicit enforcement in `audit-route-mounts.mjs`.  
   - This is now fixed locally but not yet committed.

2. **Script naming and CI/CLI alignment needs one cleanup pass**  
   - Script aliases evolved (`...:strict`, `...:full-strict`, `...:no-regression`), and although functional, naming can be tightened before freeze.

3. **Owner mapping format divergence risk**
   - `route-mount` supports array/object fallback; `repo-health` expects `owners[]` with prefixes.
   - Works now, but should be normalized to one schema style for maintainability.

4. **Generated artifacts are currently mixed with source edits**
   - Need explicit decision on what to version (baselines) vs what to upload as CI artifacts only (latest snapshots).

---

## 2) Open PRs targeting `concept2cure-v2`

Open PRs (as of audit):
- #327 `cursor/biotech-client-ui-experience-ebb9` (draft)
- #326 `cursor/central-system-review-18f8` (draft)
- #325 `cursor/customer-shaped-harness-build-5841` (draft, this branch)
- #324 `cursor/customer-shaped-harness-build-e420` (draft)
- #323 `cursor/ana-intelligence-refinement-35c8` (draft)
- #320 `codex/refactor-codebase-for-optimization` (open)
- #309 `codex/implement-ana-continuous-conversation-queue` (open)

### CI state summary

All open PRs sampled above show **UNSTABLE/DIRTY** and recurring failures centered in:
- `Lint`
- `Security Scan`
- `typecheck`
- occasionally setup/preview-db scaffolding checks

This implies branch quality variance across concurrent streams and reinforces the need for the new no-regression governance gates.

---

## 3) Open session / terminal signal audit

Signals from other session outputs show:

- Historical typecheck failures in unrelated frontend surfaces (known repo debt).
- Historical duplicate-key warning (`jsdom`) from earlier states (already fixed in this branch path).
- Historical failing versions of MFA tests (already fixed in this branch path).

Interpretation:
- No evidence of additional hidden, unpushed work in this session context.
- The dominant risk is **parallel branch drift**, not hidden local terminal work.

---

## 4) Feature-set quality assessment (current)

### Strong

- Governance direction is correct: no-regression gating is now real and executable.
- Route risk surfaced with ownership annotations (actionable instead of generic warnings).
- Repo health scanning is baselined and CI-compatible.
- QA has been repeatedly run and documented.

### Gaps to close before next push

1. **Finalize strict semantics**
   - Keep PR CI in no-regression mode.
   - Keep nightly strict as debt-pressure signal.
   - Ensure both scripts fail exactly when intended.

2. **Normalize owners contract**
   - Decide one shape (`owners[]` preferred) and enforce validation.

3. **Artifact policy**
   - Keep baselines in git.
   - Keep “latest generated snapshots” as CI artifacts unless explicitly needed in-repo.

4. **PR #325 description refresh**
   - Add explicit section for governance v2 wave (owners + nightly strict + artifacts).

---

## 5) Planned next steps (recommended execution order)

## Step A — Stabilize and ship current local delta

1. Final consistency pass on:
   - `scripts/ci/audit-route-mounts.mjs`
   - `scripts/audits/repo-health-scan.mjs`
   - `package.json`
   - `.github/workflows/ci.yml`
2. Decide tracked files:
   - Track: `route-mount-owners.json`, `repo-health-owners.json`
   - Track baseline files
   - Do **not** track latest generated snapshots unless required by policy
3. Run command matrix:
   - no-regression route + repo health
   - full-strict route + repo health (expect fail on debt)
4. Commit/push/update PR #325.

## Step B — Cross-PR branch hygiene (non-code sync)

1. Build a short “integration status matrix” for #323/#324/#326/#327/#320/#309:
   - failing gates
   - overlap with #325
   - merge risk to `concept2cure-v2`
2. Recommend merge ordering and conflict-risk hotspots.

## Step C — Controlled wave after stabilization

1. Route ownership matrix hardening:
   - path owner file validation + required owner coverage threshold
2. Repo-health schema validation:
   - enforce owners file schema strictly
3. CI UX:
   - publish compact summary in job logs (top new issues only)

---

## 6) Decision checkpoint

Before resuming implementation, the safest immediate move is:

**Commit/push the current governance-v2 local delta (Step A) first**, then run the cross-PR integration matrix (Step B).

That preserves momentum while reducing risk of losing the current strict-mode improvements.

