# Design-engineering bridge — proposal

**Status:** decision required from product + design lead.
**Author:** Claude Code, 2026-05-01.
**Companion:** `UI_MIGRATION_MAP_2026-05-01.md`, `CLAUDE_DESIGN_KIT_BRIEFS_2026-05-01.md`, `SHELL_MIGRATION_ANALYSIS_2026-05-01.md`.

---

## TL;DR

The transport script + GitHub Actions workflow that pulls the Claude Design canvas into the v2 monorepo's `design-system/` mirror **is already built**. It's not running because `DESIGN_SYSTEM_SOURCE` (the fetchable URL of canonical) is unset.

The bridge problem is therefore **not a tooling problem; it's a placement problem**. The canonical design system lives in a Claude Design project workspace that the v2 GitHub runner cannot reach. Until that's resolved, every kit ships through manual file uploads — which is what produced the 2026-04-26 token regression and the 5-files-uploaded-via-PR-comment incident this session.

This document presents three options for fixing the placement, recommends one, and quantifies the cost of doing nothing.

---

## What's already built

| Asset | Path | Status |
|---|---|---|
| Sync transport script | `scripts/sync-design-system.sh` | Works; supports `--sync` / `--check` / `--dry-run`; atomic mirror replacement; layout validation; `.sync-meta` stamping |
| Sync workflow | `.github/workflows/sync-design-system.yml` | Wired; opens PRs on drift; runs token verification job after sync |
| Operator runbook | `docs/design-system-sync.md` | Documented |
| Token cascade CI | `scripts/ci/check-token-cascade.mjs` (this session) | Green; fails the build on any unresolved `var(--*)` |
| Per-kit verify (rendered tokens) | The workflow's `verify-design-tokens` job | Boots client in headless Chromium, asserts `--accent-100` resolves |

**The infrastructure works.** It's been run successfully, evidenced by the `.sync-meta` (`synced_at: 2026-04-29T01:47:32Z`) and the commit history (`5430d2cf chore(design-system): sync mirror from canonical`).

What's not working is the **trigger frequency and the source addressability**:
- `DESIGN_SYSTEM_SOURCE` is not set as a repo variable, so the workflow can't auto-run.
- Designers ship revisions in canvas, but those revisions don't make their way to a place the workflow can fetch.
- Operator must currently know that "designer shipped a thing" + know the local canonical path + run the script + push the result. Five-finger workflow that shouldn't require humans.

---

## Three options

### Option A — Co-locate (eliminate the bridge)

**Move `design-system/` into the v2 monorepo permanently as the canonical source.** Retire the canvas as a separate workspace. The Claude Design AI session (or a designer) edits files in a feature branch of `concept2cure/clinicalsageai-2-replit` directly.

```
[before]                              [after]
┌────────────────┐                   ┌─────────────────────┐
│ Claude Design  │                   │ concept2cure/v2 monorepo │
│ canvas         │                   │   ├─ design-system/ │
│   ui_kits/...  │                   │   │  ui_kits/...    │
└──────┬─────────┘                   │   ├─ client/...     │
       │ manual upload               │   └─ server/...     │
       ▼                             └─────────────────────┘
┌────────────────┐
│ v2 monorepo    │
│   design-system│
│     /  (mirror)│
└────────────────┘
```

**Pros:**
- Eliminates the bridge entirely. No transport, no sync, no .sync-meta, no drift. One git history.
- Designer commits and engineer commits in the same PR; review is unified.
- Token regressions impossible — CI runs on the same artifacts the designer ships.
- Works today without infrastructure change. The sync script and workflow can be deleted.

**Cons:**
- Loses whatever workflow advantages the canvas tool provides (visual preview, isolated playground, etc. — depends on what Claude Design canvas actually offers).
- Designer must work with git PRs; if the canvas tool was a non-git editing surface, that's a workflow change.
- If Claude Design is owned by a different team / different Claude session that doesn't have v2 repo access, requires granting access.

**Cost:** 1 day (move folder, delete sync script + workflow, update CLAUDE.md).
**Risk:** Low — only displacement is workflow.

### Option B — Mirror canvas to a real git repo (keep the bridge, fix the source)

**Have Claude Design canvas auto-export to a public/internal git repo on every save.** v2 GitHub Actions points `DESIGN_SYSTEM_SOURCE` at that repo URL. The existing transport workflow runs on a schedule (or on push webhook) and opens PRs.

```
┌────────────────┐
│ Claude Design  │
│ canvas         │ ── auto-export ──▶ ┌─────────────────────────┐
└────────────────┘                    │ git: concept2cure/      │
                                      │      design-system      │
                                      └──────────┬──────────────┘
                                                 │ webhook / poll
                                                 ▼
                                      ┌─────────────────────────┐
                                      │ v2 monorepo workflow    │
                                      │   sync-design-system.yml│
                                      │   ↓ opens PR            │
                                      │ design-system/ (mirror) │
                                      └─────────────────────────┘
```

**Pros:**
- Designer keeps the canvas tool unchanged.
- Sync becomes automatic: kit revisions land as PRs without operator action.
- One-way flow is auditable; every kit revision is a git commit.

**Cons:**
- Requires the canvas tool to support auto-export to git (or someone to run the export manually — which puts us back to manual ops).
- Maintains two sources of truth; drift risk if the canvas state ever diverges from the export.
- Webhook infra to set up if push-driven; otherwise scheduled polling (15-minute drift floor).
- More machinery, more failure modes.

**Cost:** 2–3 days (set up canvas → git export, wire webhook or schedule, populate `DESIGN_SYSTEM_SOURCE` repo variable).
**Risk:** Medium — depends on canvas tool support for git export.

### Option C — Status quo + bridge SLA

**Keep manual uploads. Add a documented SLA for how often designer ships and operator runs sync.** Token cascade CI catches regressions at PR time; lifeline against silent drift.

**Pros:**
- Zero engineering work.
- Existing infra (cascade CI, sync script as run-locally tool) catches the worst class of regression.

**Cons:**
- Continues to consume engineering time per kit.
- Continues to break occasionally — three incidents already this session (token regression, file-uploaded-via-PR-comment, 5-files-at-repo-root that needed manual move).
- Throttles GA timeline. With 15 kits queued, even 30 min of bridge friction per kit = 7.5 hours wasted; with 60 min friction = 15 hours.
- Token regression is not the only failure class — the silent ones (designer renamed a class, port still works but visual changes) won't be caught by the cascade CI.

**Cost:** 0 today, ~$X waste over GA.
**Risk:** High over time. Each kit is another incident risk.

---

## What option C costs over GA

Assuming:
- 15 kits between now and limited GA
- Mean ~1 hour of bridge friction per kit (file move + verify + handoff coordination)
- Worst-case ~4 hours per kit when something goes silently wrong (visual regression discovered on stage)

= 15 × 1 = **15 hours** at floor; up to **60 hours** in incident scenarios. At loaded engineering rates, that's $2k–$10k of waste, not counting morale and the implicit GA timeline drag.

Compared with Option A (1 day = ~$1.5k) or Option B (2–3 days = ~$3–5k), the bridge fix pays for itself before kit #5.

---

## Recommendation: Option A

**Co-locate the design system in the v2 monorepo.** Reasons in priority order:

1. **It eliminates the entire problem class.** Any sync-based solution carries drift risk forever; co-locating doesn't.
2. **It removes infrastructure debt.** Two scripts, one workflow, one runbook, one set of secrets all retire.
3. **It tightens the feedback loop.** Designer sees the token CI green/red on the same PR they shipped; engineer sees the design tokens immediately.
4. **It matches CLAUDE.md's framing.** CLAUDE.md says `design-system/` is "the only path Claude Code reads"; promoting it to the canonical source matches that already-stated truth.
5. **The canvas-tool-as-workspace value is unproven.** If Claude Design's canvas offers something git can't (visual preview, etc.), we've never seen the design tooling defend its own value vs. a real git repo. Worth the test.

**Option B is the right answer if:** Claude Design canvas has a visual / collaborative feature that's load-bearing for the design process and can't be replicated in a git editor. In that case, the cost of Option B is still less than the cumulative cost of Option C.

**Option C is wrong** because it's the path that produced the regressions we already hit and the manual uploads we're already paying for.

---

## What execution of Option A looks like

If approved:

1. **Confirm the canonical source state.** Take the latest revision from canvas, drop it into `design-system/` as a real commit. (`scripts/sync-design-system.sh` already does this — run it once locally with `DESIGN_SYSTEM_SOURCE=<canonical local path>`.)
2. **Update CLAUDE.md.** Replace "mirror" framing with "canonical." Designer and Claude Code both edit `design-system/` directly.
3. **Retire the sync infra.**
   - Delete `scripts/sync-design-system.sh`
   - Delete `.github/workflows/sync-design-system.yml`
   - Delete `docs/design-system-sync.md` (replace with a 1-paragraph note in `design-system/CLAUDE.md` saying "this is the canonical source, edit here").
4. **Add token CI to the standard PR check.** `npm run ci:token-cascade` runs on every PR (already exists, just wire to required-status checks).
5. **Set up designer access.** Whoever owns the Claude Design surface gets write access (or merge access via a designer GitHub org membership) to the v2 repo. Designer commits to a feature branch; engineer reviews PR.

**Total engineering effort: 1 day.** Most of it is the CLAUDE.md rewrite and access provisioning.

---

## What execution of Option B looks like

If chosen:

1. Set up a real git repo for the canvas: `concept2cure/design-system`.
2. Configure the canvas tool to auto-export on save (or on a button click), pushing to `concept2cure/design-system:main`.
3. Set `DESIGN_SYSTEM_SOURCE` repo variable in v2 to that git URL.
4. Enable a schedule trigger on `.github/workflows/sync-design-system.yml` (`on: schedule: cron: '0 * * * *'`).
5. Add a webhook from `concept2cure/design-system:push` to v2's `repository_dispatch` event so sync runs on push, not just hourly.
6. Run a kit revision through the round-trip end-to-end to verify.

**Total engineering effort: 2–3 days.** Most of it is the canvas-export setup, which is a Claude Design–side task.

---

## What I need

A decision: **A**, **B**, or **C** with explicit acceptance of the cost.

The four artifacts I've shipped this session (UI migration map, shell analysis, kit briefs, Q-Sub schema) are all gated on this decision being made before kit #1 lands. Without it, the briefs at `CLAUDE_DESIGN_KIT_BRIEFS_2026-05-01.md` will go through the same friction-prone path that's already been documented as broken.

Decision deadline: before the first kit (Project shell or AI letter response) is merged. After that, the bridge is a sunk cost we keep paying.

---

## Out of scope

- Cross-repo type sharing (`shared/types`) — separate concern; current pattern works.
- Designer-side QA tooling (visual regression, Storybook) — orthogonal.
- Multi-tenancy of the design system (different customers' brand variants) — post-GA.
