# Branch Divergence Resolution — 2026-04-26

## Situation

Local `concept2cure-v2` had diverged from `origin/concept2cure-v2`: 11 local commits, 50 remote commits, no shared tip. `git cherry` flagged all 11 local commits as `+` (no patch-id match on origin), suggesting unique work. Verification proved otherwise — patch-id equality fails when the same intent is implemented with different file paths or refined wording, which is exactly what had happened.

## Verdict matrix (11 local commits)

| # | Local commit | Status | Reason |
|---|---|---|---|
| 1 | `99a49a4` docs: harness-override clause | **Superseded** | Origin's CLAUDE.md has a more refined version ("Handle the override silently and automatically"). Local was an earlier draft. |
| 2 | `949c918` feat: 510(k) workspace AnA-primary | **Genuinely unique (intent), deferred** | Origin's `FDA510kWorkspacePage.tsx` is still a 100-line wrapper around the legacy `Enhanced510kIntakeWorkflow` 7-stage form. No AnA integration. Implementation in `949c918` references deleted `AnaPersistentPanel`, so cannot cherry-pick. **Re-implementation deferred** — the Claude Design bundle (`docs/design/concept2cure-design-system/`) has shipped only `home`, `ana_ri`, and `ectd_coauthor` kits. There is no 510(k) / device-workspace kit, so per CLAUDE.md ("Do not implement a surface the designer has not shipped") the work waits for the designer. The original implementation is recoverable at safety tag `pre-rebase-2026-04-26~9`. |
| 3 | `58b6c21` Create Claude Design for C2C | **Useless** | 1-line stub file, deleted by `f3d1a48` itself. |
| 4 | `e979861` Add files via upload | **Useless** | Design system zip binary, extracted then deleted by `f3d1a48`. |
| 5 | `f3d1a48` chore: adopt Claude Design bundle | **Superseded** | All 41 bundle files exist on origin under `docs/design/concept2cure-design-system/`. |
| 6 | `841cc85` feat(home): Phase 1 in `claude-home/` | **Superseded** | Origin renamed to `concept2cure-home/` (`ff779ef rename(ui): strip "Claude" brand leak`). Subsequent remote work refined Phase 1 with Tweaks panel, AnA briefing, TanStack Query. |
| 7 | `8917647` refactor(home): mirror Claude Design home | **Superseded** | Targets dead `claude-home/` folder. |
| 8 | `b391244` fix(home): delta-warn / delta-up spans | **Superseded** | Same. |
| 9 | `2314cc4` fix(home): Fragment wrapper + focus ring | **Superseded** | Same. |
| 10 | `cc762c6` fix(home): match bundle's local border token | **Superseded** | Same. |
| 11 | `1e06e3c` feat(auth): restyle login (`claude-auth/`) | **Superseded** | Origin renamed to `concept2cure-auth/Concept2CureLogin.tsx`. |

## Action taken

1. Created safety tag `pre-rebase-2026-04-26` at `1e06e3c` — preserves all 11 original local SHAs as a recoverable archive.
2. Did **not** author a follow-up plan for `949c918`'s 510(k) AnA-primary intent — the Claude Design bundle has not shipped a 510(k) / device-workspace kit, and CLAUDE.md forbids implementing a surface the designer has not shipped. The intent is recorded here; the original implementation is recoverable at safety tag `pre-rebase-2026-04-26~9`. A plan can be authored once a kit ships, based on the kit, not on the prior invented chrome.
3. Hard-reset local `concept2cure-v2` to `origin/concept2cure-v2` (`2f1bfd9`).
4. Pushed to remote (no-op — local now matches origin).

## Recovery

If anything from the 11 local commits is later found to be needed:

```bash
git log pre-rebase-2026-04-26          # browse the original 11 commits
git show pre-rebase-2026-04-26~N       # inspect the Nth-from-tip commit
git cherry-pick <sha>                  # selective replay (likely needs adaptation)
```

The tag should be retained until the 510(k) AnA-primary follow-up (see plan) is shipped.

## Why a rebase failed

A `git rebase origin/concept2cure-v2` was attempted and aborted at conflict #3. Two reasons it was the wrong move:

1. **Path divergence**: local commits put the home in `claude-home/`; origin renamed to `concept2cure-home/`. A rebase would re-introduce `claude-home/` alongside `concept2cure-home/` — two parallel home implementations, plus reintroduction of the "Claude" brand leak that `ff779ef` explicitly removed.
2. **Phase status regression**: local CLAUDE.md claimed Phase 2 / 3 "not yet implemented"; origin had shipped both. "Resolve in favor of local" would document-revert real shipped work.

Patch-id equality (`git cherry`) is necessary but not sufficient evidence of uniqueness. File-existence and content verification on both sides is what actually answers the question.

## Files changed

None in this commit beyond this report (`docs/reports/branch-divergence-resolution-2026-04-26.md`). The 11 local SHAs are no longer reachable from `concept2cure-v2`'s tip but remain reachable via the safety tag `pre-rebase-2026-04-26`.

## Retraction

A follow-up plan was initially authored at `docs/plans/510k-ana-primary-followup.md` and committed in `893a18b`. It prescribed UX patterns (slim 7-stage progress strip, AnA ↔ structured-form view toggle) that are **not in the Claude Design bundle**. Per CLAUDE.md the bundle is the sole UI authority and unshipped surfaces must wait for the designer. The plan was retracted in a follow-up commit; this report is the canonical record.
