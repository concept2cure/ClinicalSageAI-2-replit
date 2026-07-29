# MDX install runbook — get the June work LIVE on concept2cure-v2

**For:** Claude Code, working in `concept2cure/ClinicalSageAI-2-replit`
**From:** design-system seat (canonical project: "Concept2Cure Design System")
**Date:** 2026-06-02
**Goal:** every piece of the canonical MDX kit is **installed, wired, and rendering** on the `concept2cure-v2` default branch — not parked in `design-system/`, not stranded on a feature branch, not behind an un-merged PR. "Done" = a user on the deployed product clicks into the MDX module and the Files tab, dossier drawer, pathway sub-tabs, and Ana drafter all work.

This runbook is ordered. Do not reorder. Steps 0–2 protect work that currently exists in only one place; do them before any sync.

---

## Vocabulary (so we don't talk past each other)

- **Canonical** = the design-system project. Source of truth for design.
- **Mirror** = `concept2cure-v2/design-system/`. A read-only snapshot of canonical. Per `HANDOFF.md` you must not hand-edit it.
- **Implementation** = `concept2cure-v2/client/src/concept2cure/mdx/`. The real React app users run.
- **Installed** = present in Implementation, imported by a route, rendering at runtime on the default branch. NOT "present in the mirror." A kit sitting in `design-system/ui_kits/` is **not installed** — it's just mirrored.

The whole point of this runbook: move the June work from *mirrored* (or not even that) to *installed*.

---

## STEP 0 — Freeze the sync (5 min)

Do not run any `design-system/` re-sync job yet. The mirror currently contains work that exists nowhere else (see Step 1). A sync from canonical will overwrite it.

- If a sync is scheduled (cron, CI, husky hook), disable it now.
- Confirm in writing (commit message or reply) that the sync is frozen before continuing.

---

## STEP 1 — Rescue single-copy work from the mirror (BLOCKING)

The mirror has content that was authored on your side and is **not** in canonical. If it's lost, it's gone. Package these and send them to me so I can absorb them into canonical FIRST:

```
design-system/ui_kits/mdx_phase2/        (entire directory)
design-system/ui_kits/pdev/              (entire directory)
design-system/MDX_DESIGN_BACKLOG.md
design-system/PDEV_IND_DESIGN_BRIEF.md
design-system/READ_ME_FIRST.md
```

Acceptable formats: a zip attached to your reply, OR a branch with those paths + a one-line manifest, OR paste the file contents inline. Until I confirm "absorbed into canonical," **do not delete or overwrite any of the above.**

**Why this is first:** once these are in canonical, canonical becomes the true superset, and every later sync is safe. Skip this and Step 3's sync destroys them.

---

## STEP 2 — Lock the canonical direction (decision, 5 min)

Going forward:
- **Canonical project = source of truth.** All design originates there.
- **`design-system/` mirror = read-only.** Never hand-edit it again. If you need a new design, request it from canonical; it syncs down.
- The `.sync-meta` `ref` should point at the canonical export, not `main`. Confirm the sync source path with the human operator.

Reply "canonical locked" once you and the operator agree. This prevents the drift from re-forming.

---

## STEP 3 — Install the June bundle (the core of this runbook)

I'm sending a 10-file bundle (`mdx-install-2026-06-02/`). It has two groups:

### 3a · Mirror drop (7 files) → `design-system/ui_kits/mdx/`
Copy verbatim, overwriting existing:
```
dossier-store.jsx
data-pathway-tabs.jsx
data-correspondence-detail.jsx
data-submissions.jsx
pathway-tabs.css
files-tree.css
drafter.css
```
This refreshes the stale mirror. But mirroring is NOT installing — continue to 3b.

### 3b · Port into the implementation → `client/src/concept2cure/mdx/`
The bundle also includes the 3 component files that have no port yet:
```
FilesTreePane.jsx     PathwayPanes.jsx     AnaDrafter.jsx
```

Port each kit file to its TypeScript home and WIRE it (import + render). Mapping:

| Kit file | v2 destination | Wiring required |
|---|---|---|
| `dossier-store.jsx` | `mdx/store/dossierStore.ts` | export `DossierStore`, `useFileNode`, `useSection`. It's an IIFE that publishes on `window` in the kit — convert to a real ES module export. Load before any consumer. |
| `data-pathway-tabs.jsx` | `mdx/data/pathwayTabs.ts` | already partially present — reconcile, don't duplicate |
| `data-correspondence-detail.jsx` | `mdx/data/correspondenceDetail.ts` | new |
| `data-submissions.jsx` | `mdx/data/submissions.ts` | reconcile with existing `submission/` dir (see Step 5) |
| `PathwayPanes.jsx` | `mdx/surfaces/pathway/PathwayPanes.tsx` | renders the sub-tab bar: Workspace · Audit · Correspondence · Approvals · Files |
| `FilesTreePane.jsx` | `mdx/surfaces/pathway/FilesTreePane.tsx` | the Files tab — tree + preview, reads `dossierStore` |
| `AnaDrafter.jsx` | `mdx/components/AnaDrafter.tsx` | inline drafting composer |
| `pathway-tabs.css`, `files-tree.css`, `drafter.css` | import next to `mdx/app.css` | add the 3 `<link>`/`import` lines |

**Critical wiring — the pathway sub-tab bar.** Today you have `AuditSurface.tsx` as a standalone surface. In the canonical design, Audit is **not** standalone — it's one tab inside the per-pathway tab bar (`PathwayPanes`), alongside Workspace / Correspondence / Approvals / Files. Refactor: mount `PathwayPanes` inside each pathway surface (`K510Surface`, `PmaSurface`, `CerSurface`), and make the existing audit/correspondence/approvals content render as tabs within it, not as separate rail destinations.

**Acceptance for Step 3 (must all be true on the default branch after merge):**
- [ ] Open the deployed MDX module → a 510(k) program → the pathway tab bar shows 5 tabs.
- [ ] **Files tab** renders the tree (Dossier/Correspondence/Approvals/Audit/Sources) with a working preview pane.
- [ ] Clicking a `body.md` in the Files tree opens the **DossierDrawer** with Document/Attachments/Activity tabs.
- [ ] `dossierStore` edits round-trip (edit a section → it persists in the in-memory store → Activity tab shows the event).
- [ ] **AnaDrafter** opens inline from a section and accepts/cancels.
- [ ] `pathway-tabs.css` / `files-tree.css` / `drafter.css` are loaded (no unstyled panes).
- [ ] Token check still green: `--accent-100` → `#d97757`, `--bg-000` → `#faf9f5`.

---

## STEP 4 — Triage the 15 undesigned surfaces (decision)

Your implementation has 29 surfaces; ~15 have no canonical design:
`LDT, IVD, IVDR, CDx, SaMD, UDI, Engineering, Post-market, Quality, Clinical, Onboarding, Conversations, Search, Notifications, AnA Review`.

For each, tag **beta-required** or **parked**:
- **beta-required** → I back-port a reference kit into canonical so it has a spec to verify against. Send me a screenshot + the surface's data shape and I'll produce the canonical design.
- **parked** → stays as-is; we log it as "implementation-ahead, design pending" so it's tracked, not forgotten.

Reply with the 15-item tag list. No code changes here — just the decision.

---

## STEP 5 — Reconcile the Submission home (decision + small refactor)

Submission Center exists twice conceptually:
- `client/src/concept2cure/submission/` (its own top-level dir)
- the kit treats Submissions as a Workbench surface inside `mdx/`

Pick one home. Recommended: keep it under `mdx/` as a Workbench surface (matches the kit and the workstream-switcher model). If you keep the separate `submission/` dir, tell me and I'll move it in the canonical kit to match — but the two must not both render different versions.

---

## STEP 6 — Merge to default, verify live (the "installed" gate)

None of this counts until it's on `concept2cure-v2` (default branch) and deployed.

1. PR from your working branch → `concept2cure-v2`.
2. PR description = the Step 3 acceptance checklist, every box ticked with a screenshot.
3. Merge. Do not leave it open "for review later" — installed means merged.
4. After deploy, re-run the Step 3 acceptance list against the **live** URL, not localhost.
5. Reply "installed + live" with the deployed URL so I can verify from my side.

**Definition of done:** a real user on the deployed product navigates MDX → program → Files tab and it works. Anything short of that (branch, PR, mirror-only, localhost-only) is **not done**.

---

## Do NOT
- run a sync before Step 1 is confirmed absorbed
- delete `mdx_phase2` / `pdev` before I confirm they're in canonical
- hand-edit anything under `design-system/` ever again
- treat "copied into the mirror" as "installed" — it must render in the app
- leave the work on a branch or an un-merged PR and call it shipped

## Reply to me with
1. Step 1 package (the rescue zip/branch)
2. "canonical locked" (Step 2)
3. Step 4 triage list (15 surfaces tagged)
4. Step 5 decision (submission home)
5. "installed + live" + URL (Step 6)

I'll move on my side the moment I have #1 and #3.
