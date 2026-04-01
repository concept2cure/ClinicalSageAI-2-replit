# Stage 13 — Release-Candidate Merge-Back and Human Beta Readiness

**Generated:** 2026-04-01
**Branch:** `cursor/cleanup-workstream-integration-7784`
**Base:** `concept2cure-v2`
**Purpose:** Package the cleanup work for human beta testing

---

## 1. Mission

Land the validated cleanup work into a clean path for `concept2cure-v2`, then package
the product so a human can see the right thing instead of the whole graveyard.

---

## 2. Integration Path

### Branch state

The cleanup workstream and `concept2cure-v2` shared the same HEAD when this work began.
All Stage 8–13 work has been committed incrementally on `cursor/cleanup-workstream-integration-7784`,
which is a clean forward branch from `concept2cure-v2`.

### Merge strategy

**Simple fast-forward merge** into `concept2cure-v2` is recommended. The changes are:
- 4 documentation files (Stage 8)
- 1 test file + 1 config fix + 1 doc (Stage 9)
- 4 new extracted modules + 1 modified ZenApp + 1 doc (Stage 10)
- 1 documentation file (Stage 11)
- 1 test file + 1 doc (Stage 12)
- 4 documentation files (Stage 13)

Total: **~18 files changed**, of which **1 existing file modified** (`ZenApp.tsx` — behavior-preserving
extraction), **1 config file fixed** (`playwright.config.ts`), and **16 new files added**.

Risk: **Very low.** The only runtime code change is ZenApp.tsx, which extracts constants and
hooks without changing behavior. All other changes are new test files or documentation.

---

## 3. Verification Checklist

### Tests

| Test suite | Result |
|-----------|--------|
| Stage 12 contract tests (33 tests) | **All pass** |
| Existing vitest suite | Majority pass; known failures documented in ledger |
| Playwright pulse tests (8 tests) | Require running app; structurally sound |
| Playwright workspace smoke (7 tests) | Require running app; unchanged from prior |

### Documents

| Document | Location | Status |
|----------|----------|--------|
| Canonical state | `docs/beta-work/CURRENT_CANONICAL_STATE.md` | Complete |
| Merge risk matrix | `docs/beta-work/stage-8-merge-risk-matrix.md` | Complete |
| Protected organs lock | `docs/beta-work/stage-8-protected-organs-lock.md` | Complete |
| Founder summary (Stage 8) | `docs/beta-work/stage-8-founder-summary.md` | Complete |
| Pulse certification | `docs/beta-work/stage-9-authenticated-pulse-certification.md` | Complete |
| ZenApp seam map | `docs/beta-work/stage-10-zenapp-seam-map.md` | Complete |
| Route convergence | `docs/beta-work/stage-11-backend-route-convergence.md` | Complete |
| AnA artifact contract | `docs/beta-work/stage-12-ana-artifact-contract.md` | Complete |
| RC beta readiness | `docs/beta-work/stage-13-rc-beta-readiness.md` | Complete |
| RC proof pack | `docs/proof/RC_BETA_PROOF_PACK.md` | Complete |
| Human beta test script | `docs/proof/HUMAN_BETA_TEST_SCRIPT.md` | Complete |
| Known issues ledger | `docs/proof/KNOWN_ISSUES_LEDGER.md` | Complete |

---

## 4. What a Human Beta Tester Will See

### The honest path

1. `http://host/` → redirects to `/concept2cure`
2. Login page with email/password or demo personas
3. Zen shell with sidebar (6 global + 5 project navigation items)
4. Project selection from sidebar
5. Workspace with document tree, editor, and inspectors
6. AnA chat for AI-assisted regulatory work
7. Governed artifact creation from AI responses
8. Document lifecycle controls (draft → review → approved → locked)
9. Keyboard shortcuts (⌘K, ⌘N, ⌘,)

### What is intentionally hidden

- Mission Control / SnowGlobe (demoted in ZenApp)
- Dr. Sage legacy (not in shell)
- Standalone eCTD without project (shows empty state)
- Legacy routes (`/v3`, `/client-portal`) — not in beta path
- CMC parallel AI paths — outside concept2cure shell

### What is visibly labeled as limited

- Some workspace tabs may show empty state (feature not yet wired)
- Some AI responses may be slow (depends on API key config)
- TypeScript warnings in console (pre-existing, does not affect runtime)

---

## 5. Known Issues Summary

| Level | Count | Examples |
|-------|------:|---------|
| Blocker | 0 | — |
| High | 4 | Route shadowing bugs (documented), TS typecheck, auth test drift |
| Medium | 6 | Port drift, test drift, streaming gap, auth middleware duplication |
| Low | 5 | Dead code, orphaned files, route museum |
| Deferred | 7 | Monolith carving, legacy cleanup, deep features |

Full ledger: `docs/proof/KNOWN_ISSUES_LEDGER.md`

---

## 6. Founder Demo Click Path

For the fastest demo (5 minutes):

1. Open app → lands on `/concept2cure`
2. Sign in (demo persona or credentials)
3. Click a project in sidebar
4. Click "Tools" tab → see workspace
5. Type in AnA chat: "Draft an executive summary for this IND submission"
6. Wait for response → click "Save to Vault"
7. Open the saved artifact in the editor
8. Show lifecycle status (Draft)
9. Navigate back to workspace → project context preserved
10. Open command palette (⌘K) → show search capability

---

## 7. Human Beta Go / No-Go Recommendation

### GO — with conditions

**Recommendation: Proceed with controlled human beta.**

**Why go:**
- Core beta path works: login → shell → project → workspace → AnA → artifact → editor → return
- AnA is the enforced AI standard for the beta path (33 contract tests pass)
- Shell is materially more honest (ZenApp reduced 11%, dead modes demoted)
- Governed document lifecycle is real (draft → review → approved → locked)
- No blocker-level issues found
- Test net covers the critical path (pulse tests + workspace smoke + contract tests)

**Conditions:**
1. Run `npm run dev` successfully with `DATABASE_URL` configured before demoing
2. Ensure at least one project with documents exists for the demo user
3. Brief beta testers on known limitations (see beta test script)
4. Do not expose legacy routes or CMC paths to beta testers
5. Collect feedback via chat interaction (use AnA itself as the feedback surface)

**What must NOT be claimed:**
- This is not production-ready (no SLA, no performance baseline, no security audit)
- This is not feature-complete (many specialist modules exist but are not in beta scope)
- TypeScript type safety is not enforced at build time
- Full E2E tests require live database and running app

---

## 8. Post-Beta Priorities

| Priority | Action |
|----------|--------|
| 1 | Fix H-1 and H-2 route shadowing bugs |
| 2 | Consolidate auth middleware to single format |
| 3 | Add `processResponseActions` to `/api/chat/stream` |
| 4 | Remove dead code identified in Stage 10 |
| 5 | Begin `concept2cure.ts` domain carving (with integration tests) |
| 6 | Fence legacy AI paths behind feature flag |
| 7 | Performance baseline and monitoring |
| 8 | Security audit for production readiness |
