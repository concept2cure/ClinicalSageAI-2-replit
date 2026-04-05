# Pull Request Activity Audit

**Repository**: concept2cure/ClinicalSageAI-2-replit
**Date**: 2026-04-04
**Scope**: All open PRs + most recent ~60 closed PRs (pages 1-2)

---

## Executive Summary

The repository has **21 open PRs** and a high volume of recently closed PRs (~60 in the last week alone). The majority of recent work correctly targets `concept2cure-v2`. However, there are several concerning patterns:

1. **A `claude/*` branch PR is currently open** (violates branch rules)
2. **30 historical PRs targeted `main`** (the deprecated branch)
3. **18 PRs originated from `claude/*` branches** (forbidden per CLAUDE.md)
4. **Multiple AI agents (Codex, Copilot, Cursor) are generating PRs at extremely high velocity** with large structural changes and minimal human review turnaround
5. **Some merged PRs had failing typechecks or incomplete test runs**

---

## 1. Open PRs (21 total)

### Violating Branch Rules

| PR | Branch | Issue |
|----|--------|-------|
| **#377** | `claude/repo-control-guardrails-ntLIR` -> `concept2cure-v2` | **VIOLATION**: `claude/*` branch is forbidden per CLAUDE.md. Ironically, this PR adds "repo control guardrails." +324 lines, 5 files. |

### Dependabot PRs (20 total)

All 20 remaining open PRs are Dependabot dependency bumps, all correctly targeting `concept2cure-v2`. Created 2026-04-02. Several involve **major version jumps** that warrant careful review:

| PR | Package | Version Jump | Risk |
|----|---------|-------------|------|
| #370 | openai | 4.104.0 -> 6.33.0 | **HIGH** - Major version, likely breaking API changes |
| #375 | @anthropic-ai/sdk | 0.37.0 -> 0.82.0 | **HIGH** - Major jump, possible breaking changes |
| #376 | @vitejs/plugin-react | 4.7.0 -> 6.0.1 | **HIGH** - Major version jump |
| #364 | @types/node | 20.16.11 -> 25.5.0 | **HIGH** - Major version jump |
| #369 | babel-jest | 29.7.0 -> 30.3.0 | **MEDIUM** - Major version |
| #371 | tailwind-merge | 2.6.1 -> 3.5.0 | **MEDIUM** - Major version |
| #366 | csv-parse | 5.6.0 -> 6.2.1 | **MEDIUM** - Major version |
| #361 | bcrypt (Python) | 4.0.1 -> 5.0.0 | **MEDIUM** - Major version |
| #362 | pytest | 7.4.3 -> 9.0.2 | **MEDIUM** - Major version |
| #357 | openai (Python) | 1.12.0 -> 2.30.0 | **MEDIUM** - Major version |
| #360 | cryptography | 42.0.4 -> 46.0.6 | **LOW** - Security dependency, should merge |
| Others | Various | Minor bumps | **LOW** |

**Recommendation**: These have been sitting since April 2, untouched. The high-risk ones (openai, anthropic SDK, vite plugin) should NOT be auto-merged; they need compatibility testing. The security-related ones (cryptography, bcrypt) should be prioritized.

---

## 2. Recently Closed/Merged PRs (60 reviewed)

### By Source Agent

| Agent | Merged | Closed Unmerged | Total |
|-------|--------|-----------------|-------|
| **Codex** (OpenAI) | 28 | 4 | 32 |
| **Cursor** | 7 | 5 | 12 |
| **Copilot** | 2 | 0 | 2 |
| **Claude** | 11 | 2 | 13 |
| **Human/Other** | ~5 | 0 | ~5 |

### Merge Velocity Concern

On **2026-04-01 alone**, approximately **20 PRs were merged** -- all from Codex branches. Many were merged within seconds of creation (e.g., PR #352 created 22:51, merged 22:52 -- 39 seconds). This suggests automated or near-instant merge without review.

### Large/Structural PRs (Merged)

| PR | Title | Additions | Deletions | Files | Concern |
|----|-------|-----------|-----------|-------|---------|
| #352 | CMC Module 3 OS: schema, compiler, APIs, UI | +1,709 | -240 | 21 | New DB schema + compiler + UI -- merged in 39 seconds |
| #321 | LiteLLM / Langfuse / OPA / OpenTelemetry integrations | +1,206 | -317 | 22 | 4 new integrations at once; **typecheck failed**, merged anyway |
| #356 | Communication Center scaffold | +1,128 | 0 | 5 | New subsystem -- 5 files averaging 225 lines each |
| #354 | Guided 510(k) beta flow + telemetry | +694 | -8 | 17 | New beta flow + CI wiring |
| #350 | Correspondence impact + canonical tasking | +664 | -157 | 10 | New operating layer |
| #311 | Security hardening (JWT, tenant isolation) | +545 | -270 | 30 | Sweeping auth changes across 30 files |
| #349 | Refactor ZenApp + ProjectWorkspaceShell | unknown | unknown | unknown | Core shell refactor |

### PRs Merged Despite Failing Checks

| PR | Issue |
|----|-------|
| #321 | **`npm run typecheck` failed** due to missing type packages. Merged anyway. |
| #354 | Full `tsc --noEmit` not completed. Merged anyway. |
| #350 | Jest test run failed (transform config issue). Merged anyway. |

---

## 3. PRs Targeting `main` (VIOLATION)

**30 PRs historically targeted `main`**, the deprecated branch. These are all from March 2026 and earlier, before the single-branch policy was fully enforced:

| PR | Status | Date | Title |
|----|--------|------|-------|
| #164 | MERGED | 2026-03-19 | Claude/concept2cure system build |
| #158 | MERGED | 2026-03-18 | Add Intelligent Report Generator |
| #156 | MERGED | 2026-03-18 | Add GA demo seeder |
| #155 | MERGED | 2026-03-17 | Refactor error handling |
| #154 | MERGED | 2026-03-17 | Claude/concept2cure enablement platform |
| #153 | MERGED | 2026-03-17 | Add Enablement Platform |
| #149 | MERGED | 2026-03-16 | Claude/product launch planning |
| #148 | MERGED | 2026-03-16 | Phase 1+2: Bug fixes |
| #147 | MERGED | 2026-03-16 | Replace placeholder ModulePages |
| #143 | MERGED | 2026-02-20 | C2C product audit questionnaire |
| #142 | MERGED | 2026-02-17 | Document Neon DB connection |
| #141 | MERGED | 2026-02-12 | Release Candidate v1.0 |
| #139 | MERGED | 2026-02-09 | Concept2cure v2 |
| #138 | MERGED | 2026-02-09 | Fix evidence router mount |
| #137 | MERGED | 2026-02-09 | Phase 5 (PM Settings) |
| #136 | MERGED | 2026-02-09 | Phase 6 (DOCX Factory) |
| #135 | MERGED | 2026-02-09 | Fix Copilot delegation branches |
| #134 | MERGED | 2026-02-09 | Fix Phase 5 Evidence router |
| #133 | MERGED | 2026-02-09 | Phase 6: eCTD services |
| #131 | MERGED | 2026-02-07 | Phase 6.5.C: Seed UI |
| #130 | MERGED | 2026-02-07 | Phase 6.5: Seed Templates |
| + several closed-unmerged (#160, #159, #157, #151, #150, #146, #145, #144, #140) |

**Assessment**: All main-targeting PRs predate the branch consolidation. No new PRs target `main` since ~March 19. The policy is being followed for recent work.

---

## 4. PRs from `claude/*` Branches (VIOLATION)

**18 PRs originated from `claude/*` branches** across the repo history:

| PR | Status | Date | Branch | Target |
|----|--------|------|--------|--------|
| **#377** | **OPEN** | 2026-04-04 | `claude/repo-control-guardrails-ntLIR` | concept2cure-v2 |
| #303 | MERGED | 2026-03-29 | claude/* | concept2cure-v2 |
| #219 | MERGED | 2026-03-25 | claude/* | concept2cure-v2 |
| #208 | MERGED | 2026-03-25 | claude/* | concept2cure-v2 |
| #207 | MERGED | 2026-03-25 | claude/* | concept2cure-v2 |
| #206 | MERGED | 2026-03-24 | claude/* | concept2cure-v2 |
| #186 | MERGED | 2026-03-23 | claude/* | concept2cure-v2 |
| #184 | MERGED | 2026-03-23 | claude/* | concept2cure-v2 |
| #164 | MERGED | 2026-03-19 | claude/* | main |
| #154 | MERGED | 2026-03-17 | claude/* | main |
| #149 | MERGED | 2026-03-16 | claude/* | main |
| + others (closed unmerged) |

**Assessment**: Most `claude/*` branch PRs are from March 17-29. The most recent one (#377, today) is a direct violation of the current CLAUDE.md rules. The earlier ones predate the strict enforcement.

### PRs from `feature/*` Branches

**0 found.** No `feature/*` branches were used.

---

## 5. Stale/Abandoned PRs

### Closed Without Merge (Abandoned)

| PR | Date | Branch | Title |
|----|------|--------|-------|
| #332 | 2026-04-01 | `cursor/system-pathway-cleanup-14eb` | refactor: forensic system cleanup |
| #333 | 2026-04-01 | `cursor/customer-shaped-harness-build-e420` | fix: hard fail closed governed harness |
| #334 | 2026-04-01 | `cursor/ana-projects-module-review-2d27` | fix: harden project conversation scope |
| #335 | 2026-04-01 | `cursor/biotech-client-ui-experience-ebb9` | fix: fail-close mock and fallback api |
| #336 | 2026-04-01 | `codex/refactor-codebase-for-optimization` | Refactor server route mounting (superseded by #347) |
| #331 | 2026-04-01 | `cursor/cleanup-workstream-integration-7784` | feat: Stages 8-13 + Merge Resolution |
| #322 | 2026-03-31 | `cursor/critical-files-management-f38a` | refactor: align projects module |
| #314 | 2026-03-31 | `cursor/development-environment-setup-811c` | chore: set up Cursor Cloud dev environment |
| #304 | 2026-03-29 | `codex/review-application-security-posture-61kpxc` | Harden auth & CORS (superseded) |
| #302 | 2026-03-29 | `codex/review-application-security-posture` | Security posture review (superseded by #304) |
| #307 | 2026-03-30 | `codex/perform-security-audit-and-remediation-plan` | Security audit (superseded) |

**Pattern**: Many Cursor PRs were closed without merge, then superseded by Copilot or Codex PRs covering similar ground. This suggests agent churn -- multiple agents attempting the same work, with only one version being accepted.

---

## 6. Concerning Patterns

### Pattern 1: Extreme Merge Velocity Without Review

20 PRs merged on a single day (April 1), many within seconds of creation. No review comments, no CI checks completing before merge. This is a governance risk for a regulated platform.

### Pattern 2: Agent Branch Proliferation

Despite CLAUDE.md forbidding branch creation, multiple agents continue creating branches:
- `codex/*` branches: ~30 PRs
- `cursor/*` branches: ~15 PRs  
- `copilot/*` branches: ~3 PRs
- `claude/*` branches: 18 PRs

While codex/cursor/copilot branches are not explicitly forbidden in CLAUDE.md (only `claude/*` and `feature/*` are), the spirit of "one branch, one truth" is being violated by all agent-created branches.

### Pattern 3: Overlapping/Superseded Work

Multiple PRs cover the same ground:
- Security posture: #302, #304, #307, #311 (3 abandoned, 1 merged)
- Route optimization: #336 (closed), #347 (merged)
- Communication center: #315, #356 (both merged -- possible duplication)

### Pattern 4: PRs Merged with Failing Checks

At least 3 PRs (#321, #350, #354) explicitly noted failing typechecks or test runs in their descriptions but were merged anyway.

### Pattern 5: 20 Dependabot PRs Sitting Unreviewed

All dependabot PRs from April 2 remain open, including security-relevant ones (cryptography, bcrypt).

---

## 7. Recommendations

1. **Close PR #377** -- it uses a forbidden `claude/*` branch. If the content is needed, cherry-pick commits directly to `concept2cure-v2`.

2. **Enforce merge protection rules** -- require at least one review approval and passing CI checks before merge. The current pattern of merging within seconds is dangerous for a regulated platform.

3. **Clean up Dependabot PRs** -- triage the 20 open dependency bumps. Merge security patches (cryptography, bcrypt). Create a plan for major version upgrades (openai, anthropic SDK, vite).

4. **Reduce agent churn** -- multiple agents producing overlapping PRs wastes effort and creates integration risk. Establish clearer task assignment to avoid 3 agents attempting the same security hardening.

5. **Enforce the single-branch model for all agents** -- extend CLAUDE.md's branch prohibition to cover `codex/*`, `cursor/*`, and `copilot/*` branches as well, or formally acknowledge those as acceptable.

6. **Audit the branches** -- there are likely 30+ orphaned branches from closed/merged PRs. Clean them up.

7. **Never merge PRs with failing typechecks** -- for a TypeScript codebase, this is a baseline quality gate.

---

## Appendix: PR Count by Week

| Week | Merged | Closed Unmerged | Opened (still open) |
|------|--------|-----------------|---------------------|
| Mar 16-22 | ~12 | ~4 | 0 |
| Mar 23-29 | ~15 | ~3 | 0 |
| Mar 30 - Apr 1 | ~30 | ~8 | 0 |
| Apr 2-4 | 0 | 0 | 21 (all Dependabot + 1 claude/*) |
