# 510(k) Guided-Beta Readiness Update (Repo-Truth)

**Date:** 2026-04-01  
**Scope:** Concept2Cure-v2 current branch (`concept2cure-v2`)  
**Focus:** External tester readiness for the 510(k) path only (not full-platform GA)

---

## Executive Update

Concept2Cure remains a **real guided-beta product candidate** with meaningful hardening and credible governed-document workflow behavior. It is still **not full-platform production ready**.

### Updated readiness call

- **510(k): GO with caveats (guided beta only)**
- **CER/PMA-adjacent lanes: controlled beta use only**
- **Broad biotech/eCTD claims: hold until runtime and route truth are narrowed**
- **Enterprise self-serve release: NO**

---

## What improved / remains strong

1. **Shell-level consolidation for module embedding is real**  
   ZenApp routes and embeds 510(k)/PMA/CER inside a single shell contract with assistant support.

2. **Workspace governance capabilities are substantive**  
   ProjectWorkspaceShell supports dossier-centric authoring, governed placement/relocation, section requirements, review-linked signals, and editor handoff.

3. **AnA RI orchestration path is non-trivial**  
   Orchestration + evidence/structure checks + response action execution + command execution are active in route flow.

4. **Security/hardening controls exist in critical edges**  
   Redirect normalization and static-data fail-closed behavior are both explicit and testable.

---

## What still blocks "platform-ready" truth

1. **Runtime concentration risk remains high**  
   `server/index.ts` is still a high blast-radius composition root with mixed old/new route ownership and duplicate bootstrap imports.

2. **No-mock guard is baseline-tolerant, not absolute**  
   The CI script blocks new findings but permits baseline-accepted findings.

3. **Contract tests are structural, not full journey proof**  
   Stage 12 AI entry-point contract tests validate shape/wiring, not complete browser-level generation assurance.

4. **RC documentation itself remains conditional**  
   Current readiness docs still position this as controlled human beta with explicit limits.

---

## 510(k) External Tester Trust Zones

## Green (safe to demo)

- `/concept2cure` shell + project selection + embedded 510(k) module host
- Workspace authoring path (dossier/files/templates/outline + governed placement)
- Guided AnA usage for drafting assistance and governed artifact intent

## Yellow (demo only with operator)

- Any flow requiring mixed route families from `server/index.ts`
- Any route where fallback/legacy behavior is reachable via non-canonical nav
- Any proof claim based on structural test coverage alone

## Red (hide from external beta script)

- Mock/scaffold route families documented in mock-route audit
- Legacy/demoted route destinations outside canonical concept2cure shell path

---

## Suggested Next Work Sprint (2 weeks)

**Sprint name:** `S14 510k Runtime Truth & Demo Hardening`  
**Primary objective:** Make the 510(k) founder/external-tester path provably real, narrow, and non-embarrassing.

### Sprint outcomes (must-have)

1. **Carve 510(k) beta path out of monolith mounts**
   - Extract 510(k)-relevant mounts from `server/index.ts` into explicit bootstrap module(s).
   - Remove duplicate bootstrap imports and dead local scaffolding in path scope.
   - Publish route ownership map specifically for 510(k) journey.

2. **Fence/disable non-canonical route surfaces on beta path**
   - Add feature-flag or route-level hard fence for known mock/scaffold families when in beta mode.
   - Enforce fail-closed responses for blocked route families (do not silently fallback to synthetic output).

3. **Upgrade no-mock policy to beta-path absolute**
   - Add a stricter CI mode for `concept2cure` + 510(k)-visible API routes:
     - no baseline allowance for those paths
     - fail on any mock/simulated/placeholder markers

4. **Founder-path proof capture in seeded environment**
   - Run canonical seeded walkthrough (login → project → 510(k) workspace → draft → save/open artifact → lifecycle transition).
   - Capture machine-readable evidence pack (command output + test report + route trace summary).

5. **Typecheck containment strategy**
   - Either:
     - A) make `npm run typecheck` pass for sprint-owned path, or
     - B) create scoped beta typecheck gate (path/project references) and enforce green for owned scope.

### Nice-to-have

- Add route-level telemetry tags for canonical 510(k) journey events.
- Add one smoke test for lifecycle transition side effects in workspace.

---

## Detailed Build Instructions (Execution Playbook)

## 0) Environment bootstrap

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/concept2cure-ri?sslmode=disable"
export SKIP_DB_STARTUP_TEST=true NODE_ENV=development PORT=5000
export SESSION_SECRET=dev-session-secret JWT_SECRET=dev-jwt-secret REFRESH_TOKEN_SECRET=dev-refresh-token-secret
export CONCEPT2CURE_SIGNER_MODE=dev
npm run db:ensure
npm run dev
```

## 1) Route ownership carve-out (510k scope)

1. Inventory mounts and call-sites:
```bash
rg -n "app\.use\(|register.*Routes|/api/" server/index.ts server/bootstrap
```
2. Create/expand bootstrap module for 510(k) beta path (core + AI + concept2cure scoped routes).
3. Keep behavior parity; move wiring, not functionality.
4. Add/update route ownership doc under `docs/reports/` for 510(k) path.

**Acceptance criteria**
- 510(k) path mounts are discoverable from bootstrap manifests.
- `server/index.ts` has reduced direct inline route mounting for 510(k)-critical lanes.

## 2) Beta-path hard fencing

1. Use route middleware to block non-canonical/mock families for beta mode.
2. Return explicit fail-closed payload (503 + route-hardening headers).
3. Confirm demoted/legacy routes are not reachable from shell nav.

**Acceptance criteria**
- Calling blocked families in beta mode returns fail-closed response.
- Canonical 510(k) flow remains functional.

## 3) CI policy tightening (no-mock absolute for beta path)

1. Extend `scripts/ci/check-no-mock-in-prod-routes.mjs` with a strict subset mode:
   - target allowlist/denylist for beta-visible paths
   - no baseline suppression for strict subset
2. Wire script to CI as `ci:no-mock-beta-path`.

**Acceptance criteria**
- New strict job fails on any beta-path mock marker, regardless of baseline.
- Existing baseline mode can remain for whole-repo transitional governance.

## 4) Proof pack refresh (founder path)

1. Add reproducible founder-path runbook command block.
2. Execute:
```bash
node scripts/ci/check-no-mock-in-prod-routes.mjs
npx vitest run --config vitest.config.ts tests/routes/ai-entry-point-contract.test.ts
```
3. If browser harness is available, run pulse/smoke subset; if not, document limitation explicitly.
4. Write updated proof doc with exact timestamp and environment.

**Acceptance criteria**
- One document contains: commands, outputs, known limits, and explicit no-overclaim statement.

## 5) Typecheck containment

1. Run:
```bash
npm run typecheck
```
2. Classify errors into:
   - in-scope (must fix this sprint)
   - out-of-scope inherited debt (documented)
3. Implement scoped gate if full green is unrealistic in sprint window.

**Acceptance criteria**
- 510(k)-owned scope typecheck gate is green and enforced in CI.

---

## Sprint Definition of Done

- Canonical 510(k) path is demonstrably real and fenced from known synthetic/mixed-truth surfaces.
- CI has strict no-mock enforcement for beta-visible 510(k) routes.
- Founder demo runbook is reproducible in seeded dev environment.
- Evidence pack updated with date/time, exact commands, and explicit limitations.
- No full-platform readiness overclaims in updated product messaging.

---

## Suggested Jira/Tracker Breakdown

1. **S14-01**: 510(k) route ownership carve-out from `server/index.ts`  
2. **S14-02**: Beta-mode hard fencing for non-canonical route families  
3. **S14-03**: Strict `ci:no-mock-beta-path` implementation  
4. **S14-04**: Founder-path proof pack rerun + evidence publication  
5. **S14-05**: Typecheck containment gate for 510(k) owned scope


---

## Detailed Sprint Calendar (10 working days)

### Week 1

**Day 1 — Baseline capture + branch scaffolding**
- Create sprint branch from `concept2cure-v2`.
- Capture baseline outputs:
  - `node scripts/ci/check-no-mock-in-prod-routes.mjs`
  - `npm run typecheck`
  - `npx vitest run --config vitest.config.ts tests/routes/ai-entry-point-contract.test.ts`
- Save outputs in `docs/reports/s14-baselines/`.

**Day 2 — 510(k) route inventory and ownership map**
- Generate route ownership table (mount point, file owner, beta-visibility, risk class).
- Mark each route as `canonical`, `legacy-compatible`, or `beta-hidden`.

**Day 3–4 — `server/index.ts` extraction (safe move only)**
- Move 510(k)-critical mounts to bootstrap module(s) without behavior changes.
- Add route registry comments and ownership tags.
- Keep one integration checkpoint commit per move cluster.

**Day 5 — Integration checkpoint**
- Re-run baseline commands.
- Diff route mount inventory before/after.
- Publish `S14-W1-checkpoint.md` with net changes and regressions (if any).

### Week 2

**Day 6–7 — Beta hard fences**
- Add explicit middleware fences for non-canonical/mock families in beta mode.
- Ensure all blocked paths return explicit fail-closed payloads with reason headers.

**Day 8 — Strict no-mock beta-path CI gate**
- Add strict path mode to mock-route CI checker.
- Introduce `npm run ci:no-mock-beta-path`.
- Set CI to required on beta branch policy.

**Day 9 — Founder-path proof pack rerun**
- Run canonical scenario with seeded data and capture:
  - route trace summary
  - test outputs
  - known limitations
- Publish `docs/proof/RC_BETA_PROOF_PACK_S14.md`.

**Day 10 — Release readiness review**
- Validate DoD checklist.
- Decide: `GO guided beta` or `HOLD` with blockers.
- Publish release recommendation memo.

---

## Build/Verification Command Matrix

## Fast local loop

```bash
# 1) Env + DB
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/concept2cure-ri?sslmode=disable"
export SKIP_DB_STARTUP_TEST=true NODE_ENV=development PORT=5000
export SESSION_SECRET=dev-session-secret JWT_SECRET=dev-jwt-secret REFRESH_TOKEN_SECRET=dev-refresh-token-secret
export CONCEPT2CURE_SIGNER_MODE=dev
npm run db:ensure

# 2) Boot app
npm run dev

# 3) Hardening checks
node scripts/ci/check-no-mock-in-prod-routes.mjs
npx vitest run --config vitest.config.ts tests/routes/ai-entry-point-contract.test.ts
```

## Pre-merge gate (sprint scope)

```bash
# Required
node scripts/ci/check-no-mock-in-prod-routes.mjs
npx vitest run --config vitest.config.ts tests/routes/ai-entry-point-contract.test.ts

# Advisory (until fully green)
npm run typecheck
```

## Optional full-package confidence pass

```bash
npm run lint
npm run build
```

---

## Required Artifacts for Sprint Close

1. `docs/reports/s14-route-ownership-510k.md`  
   - route inventory with canonical/legacy/beta-hidden labels
2. `docs/reports/s14-no-mock-beta-path-policy.md`  
   - strict checker design + false-positive handling
3. `docs/proof/RC_BETA_PROOF_PACK_S14.md`  
   - founder-path evidence (commands + outputs + limitations)
4. `docs/reports/s14-typecheck-containment.md`  
   - in-scope/out-of-scope error accounting + gate recommendation

---

## Owner Model (recommended)

- **Backend owner:** route extraction + hard fences + CI checker strict mode
- **Frontend owner:** verify canonical shell route behavior and deep-link integrity
- **QA owner:** founder-path proof execution and evidence packaging
- **Control owner:** sprint scoreboard, risk tracking, and go/no-go recommendation

---

## Risk Register (S14)

1. **Route extraction introduces mount-order regressions**  
   Mitigation: one-cluster-at-a-time commits + route inventory diff at each checkpoint.

2. **Strict mock checker causes false positives**  
   Mitigation: beta-path scoped matching + reviewed exception list (time-boxed).

3. **Typecheck debt obscures sprint signal**  
   Mitigation: scoped typecheck containment doc + explicit ownership boundaries.

4. **Environment drift invalidates proof run**  
   Mitigation: pin env bootstrap block and capture exact runtime settings in proof pack.

---

## Go/No-Go Gate for External 510(k) Testers

**GO (guided beta) only if all are true:**
- Canonical 510(k) founder path completes without route dead-end.
- No beta-path mock findings in strict CI mode.
- Founder proof pack published with reproducible commands and outputs.
- Known limits and hidden routes are explicitly documented.

**NO-GO if any are false.**
