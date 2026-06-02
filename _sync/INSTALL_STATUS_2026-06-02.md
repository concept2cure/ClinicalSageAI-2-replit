# MDX install — status reply to INSTALL_RUNBOOK.md

**From:** Claude Code (concept2cure-v2 / ClinicalSageAI-2-replit)
**Branch:** `claude/zealous-babbage-VCMSs`
**Date:** 2026-06-02

Governing direction set by the operator this session: **the Claude Design kits are
the only UI; no divergence; no other UI besides what design has built.** Everything
below is implemented to that rule — the kit's in-memory dossier store and fixtures
are installed as the real data model for the pathway tabs (no live-API substitution,
no "sample data" hedges), and superseded non-kit surfaces are flagged for removal.

---

## The 5 reply items

### 1. Step 1 rescue package — DELIVERED
Delivered as a zip to the operator + a sha256 record at
`_sync/rescue-2026-06-02.manifest.txt`. The bytes are **not single-copy** — they already
live at their `design-system/` originals in this repo, so the package is a convenience
copy, not the only copy. (The earlier committed unzipped tree was removed: it duplicated
~48 basenames already present under `design-system/`, which tripped the repo-health
no-regression gate for no benefit.) Contents:
- `ui_kits/mdx_phase2/` (21 files) · `ui_kits/pdev/` (14 files)
- `MDX_DESIGN_BACKLOG.md` (design-system-only — true single copy)
- `PDEV_IND_DESIGN_BRIEF.md` · `READ_ME_FIRST.md` (design-system variant; differs from repo root)
- `MANIFEST.txt` with sha256 + byte size per file.
Nothing under `design-system/` was deleted or overwritten.

### 2. "canonical locked" (Step 2)
Confirmed. `design-system/` is treated as a read-only mirror. The only canonical→mirror
transport is `.github/workflows/sync-design-system.yml`, which is **`workflow_dispatch`
only** (no schedule, no push trigger) and additionally gated on a `DESIGN_SYSTEM_SOURCE`
secret. Nothing auto-fires, so the Step 0 freeze holds as long as that workflow is not
run by hand. `.sync-meta` currently reads `ref: main`; per Step 2 it should point at the
canonical export — that is an operator/secret change, noted for the sync owner.

### 3. Step 4 triage — 15 surfaces

Method: a surface is **beta-required** if it is reachable today (routed in
`mdx/App.tsx`), because under "kit is the only UI" any reachable surface needs a
canonical kit to verify against. The rest are mounted nowhere — implementation-ahead,
design-pending — so they are **parked**.

| Tag | Surfaces |
|---|---|
| **beta-required** (routed → needs a canonical kit) | **UDI**, **Engineering**, **Post-market** |
| **parked** (file exists, mounted nowhere) | LDT, IVD, IVDR, CDx, SaMD, Quality, Clinical, Onboarding, Conversations, Search, Notifications, AnA Review |

For the 3 beta-required: please back-port reference kits so they have a spec (they are
currently reachable non-kit UI, i.e. the divergence we are eliminating). The 12 parked
stay as-is and are logged "implementation-ahead, design pending"; each will either get a
kit or be removed in the legacy-cleanup pass — they are not user-reachable today, so they
are not live "other UI."

### 4. Step 5 — Submission home
**Decision: `mdx/` Workbench surface is the home** (`mdx/workbench/Workbench.tsx →
SubmissionsSurface`), matching the kit and the workstream-switcher model. The standalone
`client/src/concept2cure/submission/` dir is wired only into **legacy `ZenApp.tsx`** (and
`components/editor/`), i.e. the legacy UI already slated for deletion. It is the divergent
copy and is marked for retirement with the rest of the legacy shell. Canonical kit needs
no change here — it already treats Submissions as a Workbench surface.

### 5. "installed + live" + URL (Step 6) — see boundary below
Honest status: this environment can push to a branch and open a PR, **but it cannot merge
to the default branch or deploy to production** — those two actions are the operator's.
The June bundle is ported, wired, and (per the build check in this PR) compiles clean on
the branch. "Live on the deployed product" is reached when you merge this PR and deploy;
the acceptance checklist below is then run against the live URL.

---

## What was installed (Step 3)

**3a · mirror refresh** — deferred to the `sync-design-system` workflow. Step 2 / the
runbook "Do NOT" list say the mirror is read-only ("do NOT hand-edit anything under
`design-system/`"); hand-copying the 7 files both violates that and duplicated
`mdx_phase2` basenames (repo-health regression). The mirror gets these files when the
operator next runs the sync from canonical — which is also when canonical has absorbed
the Step 1 package. No content is lost: the 7 files are in the bundle and in canonical.

**3b · ported into the implementation** (`client/src/concept2cure/mdx/`):
- `store/dossierStore.ts` — kit IIFE converted to a real ES module; exports
  `DossierStore`, `useFileNode`, `useSection`; seeds from `data/k510` + `data/pathwayTabs`.
- `data/pathwayTabs.ts` — extended with `PATHWAY_TABS_DATA` (audit / correspondence /
  approvals + `corrLabel`), typed; `@kit-registry-no-consumer-yet` marker removed (consumer ships here).
- `surfaces/pathway/PathwayPanes.tsx` — the 5-tab bar (Workspace · Audit · Correspondence
  · Approvals · Files), the Audit/Correspondence/Approvals panes, and the 3-tab
  **DossierDrawer** (Document / Attachments / Activity) with live store round-trip.
- `surfaces/pathway/FilesTreePane.tsx` — the Files tab (tree + preview).
- `pathway-tabs.css`, `files-tree.css`, `drafter.css` imported alongside `app.css`.
- `icons.tsx` — added the Lucide glyphs the kit references (fileText, lock, userPlus,
  paperclip, image, code, edit, bookOpen, left).
- `types.ts` — added the AuditEvent / Correspondence / Approval / dossier-node contracts.
- **Wired:** `PathwayPanes` mounted inside `K510Surface`, `PmaSurface`, `CerSurface`
  (existing surface content is now the Workspace tab). The previously-**orphan**
  `AuditSurface.tsx` (unrouted, live-API divergence) is superseded by the kit's
  AuditTrailPane and is flagged for removal in the legacy-cleanup pass (left in place this
  PR only because deleting it also orphans `data/audit.ts` + `hooks/useAudit.ts`, which
  belongs in the same cleanup commit).

**Deferred to the immediate next increment (one component):** the full-page
`AnaDrafter` + its `data-correspondence-detail` data module. It is the largest, most
self-contained kit file; held back so the verified core is not gated on its size. Its entry
point ("Draft response with AnA" in the Correspondence pane) works today via AnA chat —
no regression — and `PathwayPanes` already accepts an `onDraftResponse` hook to slot it in.

---

## Step 3 acceptance — to run against the LIVE url after merge + deploy
- [ ] MDX → a 510(k) program → pathway tab bar shows 5 tabs.
- [ ] Files tab renders the tree (Dossier / Correspondence / Approvals / Audit / Sources) + preview.
- [ ] Click a `body.md` → DossierDrawer opens with Document / Attachments / Activity.
- [ ] Edit a section → persists in the store → Activity tab shows the event.
- [ ] (lands with AnaDrafter) AnaDrafter opens inline and accepts / cancels.
- [ ] `pathway-tabs.css` / `files-tree.css` / `drafter.css` loaded (no unstyled panes).
- [ ] Token check green: `--accent-100` → `#d97757`, `--bg-000` → `#faf9f5`.
