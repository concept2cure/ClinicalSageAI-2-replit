# Branch Divergence Audit — 2026-04-27

## Why this exists

Per CLAUDE.md NON-NEGOTIABLE branch rule, `concept2cure-v2` is the ONE AND ONLY branch. A divergence audit was triggered when this session discovered:

1. The local `concept2cure-v2` was 50 commits behind origin and 11 commits ahead, indicating split-brain history.
2. Five non-canonical branches existed on origin: 4 agent branches (`claude/*`, `codex/*`, `copilot/*`) and 20 dependabot branches.
3. The Phase 1 Claude Design home (`Concept2CureHome`) was implemented in the codebase but never wired into `ZenApp.tsx` — strongly suggesting recent merges had skipped or dropped UI-installation work.

User principle: *"Lose nothing, all work that adds incremental value must be used."*

This report classifies every non-canonical branch as one of:

- **MERGED** — branch tip is an ancestor of `concept2cure-v2`. Pure cleanup, zero loss.
- **SUPERSEDED** — work exists on the branch but has been replaced by a canonical authority on `concept2cure-v2` (e.g., monochrome UI replaced by the Claude Design bundle).
- **VALUE-AT-RISK** — unique commits exist that may still be relevant. Requires triage before deletion.

## Forbidden agent branches (4)

### 1. `claude/add-coding-discipline-guidelines-QexdD` — **MERGED**

| Field | Value |
| --- | --- |
| Branch tip | `15171e48 feat(skills): add 4 premium UI/UX enforcement skills` |
| Tip relationship to `concept2cure-v2` | Ancestor. Branch is 0 commits ahead, `concept2cure-v2` is 89 commits ahead. |
| Disposition | **Safe to delete.** Tip is fully contained in `concept2cure-v2`. Zero value loss. |

### 2. `copilot/research-medical-device-client` — **MERGED**

| Field | Value |
| --- | --- |
| Branch tip | `e8940248 feat(ana): precedent mining service + mine_precedents tool (#4 of 6)` |
| Tip relationship to `concept2cure-v2` | Ancestor. Branch is 0 commits ahead, `concept2cure-v2` is 70 commits ahead. |
| Disposition | **Safe to delete.** Tip is fully contained in `concept2cure-v2`. Zero value loss. |

### 3. `codex/audit-backend-for-efficiency-improvements` — **VALUE-AT-RISK**

| Field | Value |
| --- | --- |
| Branch tip | `19a30f11 Bound analytics caches and remove test-only route export` |
| Unique non-merge commits | **2,049** |
| File diff vs `concept2cure-v2` | 1,204 files changed, +29,750 / -225,506 lines |
| Earliest unique commit | `2025-11-20` ("Clean migration to Codespaces") |
| Latest unique commit | `2026-04-05` |
| Disposition | **Do NOT delete yet.** Major divergent fork. Requires structured audit. |

### 4. `codex/implement-backend-convergence-for-ana-1.0` — **SUBSUMED BY #3**

| Field | Value |
| --- | --- |
| Branch tip | `2c6084d7 Make guidance executor DB import lazy for test-safe loading` |
| Relationship to `codex/audit-backend` | Subset — `audit-backend` contains all of `implement-backend` plus 2 extra commits (`19a30f11`, `b698d015`). |
| Disposition | **Safe to delete IF and ONLY IF `codex/audit-backend` is preserved**, since the latter is a strict superset. |

## What's on the codex divergence line

The two codex branches represent a **parallel ~5-month development trajectory** (Nov 2025 → April 2026) that was never merged back to the canonical line. Theme breakdown of the 2,049 unique commits:

| Theme | Approximate share | Status |
| --- | --- | --- |
| Monochrome UI conversion / color stripping / Claude.ai visual parity | ~15% | **SUPERSEDED** by `docs/design/concept2cure-design-system/` bundle (CLAUDE.md UI authority) |
| Boulder-to-statue / dead-code purges / route extraction refactors | ~25% | Architectural — overlap with concept2cure-v2's own refactors must be checked |
| Governance fabric / Build Orders 1–24 / decision lifecycle | ~20% | May or may not exist on concept2cure-v2 — **needs file-level audit** |
| Bug fixes (TS errors, broken imports, IND authoring, etc.) | ~10% | **Most likely to be still-applicable** |
| Documentation / audit reports / authority maps | ~15% | Historical record — could be preserved as docs |
| Beta seed data / Playwright proofs / route convergence | ~10% | Possibly subsumed by concept2cure-v2 work |
| Other | ~5% | — |

## Recommended action sequence

### Immediate (this session, zero risk)

1. **Delete `claude/add-coding-discipline-guidelines-QexdD` from origin** — already merged, zero loss.
2. **Delete `copilot/research-medical-device-client` from origin** — already merged, zero loss.

> Note: deletion from this Replit-style git proxy returns HTTP 403. Must be done from a session with `gh` CLI access or via the GitHub web UI at github.com/concept2cure/ClinicalSageAI-2-replit/branches.

### Near-term (separate focused session)

3. **Audit `codex/audit-backend-for-efficiency-improvements` for value extraction.** Suggested sub-tasks:
   - Identify candidate-valuable commits using `git log --grep='^fix:'` and the bug-fix list above.
   - For each candidate, check whether `concept2cure-v2` already addresses the same issue (search by file path + function name, since commit hashes won't match).
   - Cherry-pick or transcribe the genuinely missing fixes onto `concept2cure-v2`.
   - Move authority-mapping docs (`docs/...Plane A/B/C/D...`) into `docs/reports/historical/` if they have research value.
   - Delete monochrome-UI commits without porting — superseded by the Claude Design bundle per CLAUDE.md.

4. **Once #3 is complete, delete both codex branches.**

### Why this is multi-session

A 2,049-commit cherry-pick with 225K lines of difference cannot be done atomically:
- Conflicts will be everywhere — most files have changed on both lines.
- "Already done differently on v2" is the dominant case for most refactors and many bug fixes — those are no-ops to merge but still need verification.
- Some commits depend on architectural state (e.g. governance fabric, Build Order numbering) that doesn't exist on `concept2cure-v2`. Porting those requires understanding the dependency chain.

## Dependabot branches (20)

All 20 are tied to open PRs against `concept2cure-v2` for dependency bumps (uuid, pdf-parse, pydantic, lxml, googleapis, etc.). They are an **automated review queue**, not parallel development. Each PR is independently reviewable and mergeable. Disposition recommendation:

- Triage each PR on its own merits (security relevance, breaking-change risk, test compatibility).
- Merge or close per standard dependency-review process.
- Branch deletion happens automatically when the PR closes.

No action this session — these are not the source of the divergence problem.

## What I changed this session

- `client/src/concept2cure/ZenApp.tsx` — wired Phase 1 `Concept2CureHome` bundle surface as an early return (commit `fc50ea70`).
- `.husky/pre-push` — added branch-authority gate refusing pushes to any ref other than `refs/heads/concept2cure-v2`, with explicit `ALLOW_NON_CANONICAL_PUSH=1` bypass and a deletion-allowed branch (commits `de16b81b`, `cf9b396b`).
- Local — deleted `claude/fix-ui-installation-b0FqX`. Local now has exactly one branch.

## Mechanical guarantee going forward

The pre-push hook prevents new divergence at the local git boundary. Any future session — Claude, Codex, Copilot, or human — that attempts to push to a `claude/*`, `codex/*`, `feature/*`, or any other non-canonical ref will be refused with a clear error before the push reaches origin. Combined with branch protection rules on the GitHub side (suggested follow-up: configure `concept2cure-v2` as the only push-allowed ref at the repository level), this closes the structural hole that allowed the divergence to occur.
