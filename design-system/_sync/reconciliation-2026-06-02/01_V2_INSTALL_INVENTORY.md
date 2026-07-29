# V2 install inventory — Claude Design kits → concept2cure-v2

**Compiled:** 2026-06-02, by the design-system seat, reading `concept2cure/ClinicalSageAI-2-replit@concept2cure-v2` (commit `a1c68dc`) directly.
**Method:** GitHub tree + file reads against the live default branch. Not from memory, not from the handoff docs — from what is actually in the repo today.

---

## 0 · TL;DR

1. **The MDX kit is installed AND has been expanded well beyond the canonical design.** The React implementation at `client/src/concept2cure/mdx/` is 123 files with **29 surfaces** — roughly twice what the canonical `ui_kits/mdx/` defines. Claude Code built real surfaces that were never designed in this project (LDT, IVD, IVDR, CDx, SaMD, UDI, Engineering, Post-market, Quality, Clinical, Onboarding, Conversations, Search, Notifications).
2. **The design-system mirror inside v2 is STALE.** `design-system/.sync-meta` shows `synced_at: 2026-04-29`. Everything I shipped after that — the Files tab, `dossier-store.jsx`, `pathway-tabs.css`/`files-tree.css`/`drafter.css`, the audit/correspondence/approvals panes — is **not** reflected in the mirror, and the 7-file sync bundle from this week has not landed.
3. **Two kits exist in the v2 mirror that do NOT exist in this canonical project:** `ui_kits/mdx_phase2/` and `ui_kits/pdev/`. Those were authored on the v2 side (or by another designer seat). The canonical project has only `ana_ri`, `ectd_coauthor`, `home`, `mdx`.
4. **The mirror carries docs this project doesn't have:** `MDX_DESIGN_BACKLOG.md`, `PDEV_IND_DESIGN_BRIEF.md`, `READ_ME_FIRST.md`. The canonical source and the mirror have diverged in both directions.

Net: **installation is far ahead of the canonical design system, and the canonical→mirror sync is broken/stale.** The risk is no longer "did Claude Code install the kit" — it's "the codebase and the design system are drifting apart and neither is the clean source of truth anymore."

---

## 1 · What's in the canonical design system (this project)

`ui_kits/` here contains exactly four kits:

| Kit | Status in this project |
|---|---|
| `home/` | Phase 1 — home shell, rail, projects |
| `mdx/` | Phase 2 — the medical-device workstream (the bulk of recent work) |
| `ana_ri/` | reference — chat-first shell |
| `ectd_coauthor/` | reference — artifact workbench |

The `mdx/` kit (30 files) is the canonical spec for: Overview/Programs, 510(k), PMA, CER (+ CerWorkbench 7 sub-tabs), Precedent, Pre-Sub/Q-Sub, Vault, Validation Center, Submissions (pipeline + 4-tab detail), Templates, the pathway sub-tabs (Workspace/Audit/Correspondence/Approvals/Files), DossierDrawer, AnaDrafter, the editors (eSTAR/PMA/CER/Document), ProjectHome, and the `dossier-store` filesystem layer.

---

## 2 · What's actually installed in v2 — the design-system mirror

Path: `concept2cure-v2/design-system/`

```
design-system/
  .sync-meta              synced_at: 2026-04-29T01:47:32Z · source ref: main
  CLAUDE.md
  README.md  SKILL.md  HANDOFF.md  FEATURE_INVENTORY.md
  READ_ME_FIRST.md         ← not in canonical project
  MDX_DESIGN_BACKLOG.md     ← not in canonical project
  PDEV_IND_DESIGN_BRIEF.md  ← not in canonical project
  colors_and_type.css
  assets/  preview/
  ui_kits/
    ana_ri/         ✓ mirrors canonical
    ectd_coauthor/  ✓ mirrors canonical
    home/           ✓ mirrors canonical
    mdx/            ⚠ stale — predates Files tab / dossier-store / pane CSS
    mdx_phase2/     ✗ NOT in canonical project
    pdev/           ✗ NOT in canonical project
```

**Finding:** the mirror is a 2026-04-29 snapshot taken from ref `main`. It does not contain this project's June work, and it contains two kits + three docs that were never in this project. The sync is one-directional and stale, and the v2 side has been editing inside the mirror (which `HANDOFF.md` explicitly says not to do).

---

## 3 · What's actually installed in v2 — the React implementation

Path: `client/src/concept2cure/mdx/` — **123 files.** This is a real, deep port, not a stub.

### 3.1 Shell + infra (present, ported)
- `App.tsx` (13 KB), `MdxRoute.tsx`, `app.css` (**120 KB** — the kit CSS lifted and extended)
- `components/`: `AnaDraftBanner`, `DataState`, `DocumentsPanel`, `EsignModal`, `GovernedActionButton`, `SampleDataBanner`
- `_stubs/ComingSoon.tsx`

### 3.2 Surfaces (29 — `client/src/concept2cure/mdx/surfaces/`)

**Canonical surfaces (designed here, ported):**
- `Overview.tsx`, `K510Surface.tsx`, `PmaSurface.tsx`, `CerSurface.tsx`, `PrecedentSurface.tsx`
- `QSubSurface.tsx` (Pre-Sub), `VaultSurface.tsx`, `TemplatesSurface.tsx`
- `MemorySurface.tsx`, `AnalyticsSurface.tsx`, `AdminSurface.tsx`, `AuditSurface.tsx`
- `AskAnaChip.tsx`, `InDesignSurface.tsx`

**Surfaces built in v2 with NO canonical design in this project:**
- `CdxSurface.tsx` — companion diagnostics
- `IvdSurface.tsx` / `IvdrSurface.tsx` — IVD / EU IVDR
- `LdtSurface.tsx` — lab-developed tests
- `SamdSurface.tsx` — software as a medical device
- `UdiSurface.tsx` — UDI / labeling
- `EngineeringSurface.tsx` — device engineering
- `PostmarketSurface.tsx` — post-market vigilance
- `QualitySurface.tsx` — QMS
- `ClinicalSurface.tsx` — clinical evidence
- `OnboardingSurface.tsx`, `ConversationsSurface.tsx`, `SearchSurface.tsx`,
  `NotificationsSurface.tsx`, `AnaReviewSurface.tsx`

### 3.3 Data layer (~40 files — `client/src/concept2cure/mdx/data/`)
Covers every surface above plus: `admin`, `analytics`, `audit`, `cdx`, `cer`, `clinical`, `conversations`, `editor`, `editors`, `engineering`, `ivd`, `ivdr`, `k510`, `ldt`, `memory`, `nav`, `notifications`, `onboarding`, `pathwayTabs`, `pma`, `postmarket`, `presub`, `programs`, `qsub`, `quality`, plus `-docs` companions.

### 3.4 What is NOT yet visible in the v2 mdx port (gaps vs. my latest kit)
Based on the file list, these canonical pieces from my recent work are **not present as named modules** in `client/src/concept2cure/mdx/`:
- `FilesTreePane` / Files sub-tab — no `FilesTreePane.tsx` in surfaces
- `dossier-store` — no `dossierStore.ts` in the data/store layer
- `PathwayPanes` (Audit/Correspondence/Approvals/Files tab bar) — no dedicated module; audit exists as a standalone `AuditSurface`, not as a pathway sub-tab
- `DossierDrawer` 3-tab (Document/Attachments/Activity) — not visible
- `Submissions` pipeline surface — no `SubmissionsSurface.tsx` in the surfaces list (submission lives under `client/src/concept2cure/submission/`, separate dir — needs reconci­liation)

These are exactly the files in the 7-file sync bundle that hasn't landed. **Their absence in the React port is consistent with the mirror being stale.**

---

## 4 · The drift map (the real story)

```
CANONICAL (this project)          MIRROR (v2 design-system/)        IMPLEMENTATION (v2 client/)
──────────────────────────        ──────────────────────────        ───────────────────────────
ui_kits/mdx  (June, current)  ──▶  ui_kits/mdx (Apr-29 snapshot) ──▶  mdx/ 123 files, 29 surfaces
  + Files tab                       ✗ missing                          ✗ not ported
  + dossier-store                   ✗ missing                          ✗ not ported
  + pathway panes/CSS               ✗ missing                          partial (AuditSurface only)
  (no LDT/IVD/SaMD/UDI/…)            ✗ —                                ✓ BUILT (no canonical design)
  (only 4 kits)                     + mdx_phase2  ✗ not canonical       —
  (only 4 kits)                     + pdev        ✗ not canonical       ✓ pdev/ dir exists in client
```

Three-way divergence:
- **Canonical → Mirror:** broken since 2026-04-29. June work never synced.
- **Mirror → Implementation:** Claude Code built ahead of the mirror (29 surfaces vs. the ~14 the kit defines).
- **Implementation → Canonical:** ~15 surfaces exist in code with no design in this project. They were never designed here; they have no source-of-truth spec.

---

## 5 · What this means for beta

- **Good:** the MDX module is not a prototype in v2 — it's a deep, real implementation with auth, governed actions (`GovernedActionButton`, `EsignModal`), data-state handling (`DataState`, `SampleDataBanner`), and far broader surface coverage than the canonical kit. Someone has done a lot of real work.
- **Risk 1 — no single source of truth.** The design system was supposed to be canonical; the implementation has overtaken it. The ~15 undesigned surfaces (LDT, IVD, IVDR, SaMD, UDI, Engineering, Post-market, Quality, Clinical, …) have no design reference, so there's nothing to verify them against.
- **Risk 2 — stale mirror re-introduces the 2026-04-26 regression class.** `HANDOFF.md` warns that editing inside `design-system/` gets overwritten on sync. The mirror has been edited (mdx_phase2, pdev, three new docs). The next real sync will either clobber that work or be skipped — both bad.
- **Risk 3 — my June work (Files tab, dossier-store, pane CSS) is stranded.** It's in this project, bundled for drop, but not in the mirror and not ported. The "live dossier / filesystem" thesis the operator asked for is designed but not installed.

---

## 6 · Recommended reconciliation (in order)

1. **Re-point the sync.** Decide which side is canonical going forward. If this project is canonical, the v2 `design-system/` mirror must be regenerated from here, and `mdx_phase2` + `pdev` + the three new docs must be pulled *back* into this project first so they aren't lost.
2. **Back-port the 15 undesigned surfaces into canonical** (at least as thin reference kits) so they have a spec. Otherwise they will never be verifiable and the design system is fiction.
3. **Land the 7-file June bundle** (`dossier-store`, `pathway-tabs.css`, `files-tree.css`, `drafter.css`, `data-pathway-tabs`, `data-correspondence-detail`, `data-submissions`) into both the mirror and the React port.
4. **Reconcile `submission/` vs `mdx/`** — submission center lives in a separate top-level dir in v2 but is a Workbench surface in the kit. Pick one home.
5. **Write the canonical list of "what is a real MDX surface for beta"** — the 29 implemented surfaces need triage into beta-required vs. parked, because the kit only blesses ~14 of them.

---

## 7 · Raw evidence (so this is auditable)

- Repo: `concept2cure/ClinicalSageAI-2-replit`, branch `concept2cure-v2`, commit `a1c68dc0683d`.
- `design-system/.sync-meta`: `synced_at: 2026-04-29T01:47:32Z`, `ref: main`.
- `design-system/ui_kits/`: `ana_ri, ectd_coauthor, home, mdx, mdx_phase2, pdev` (6; canonical has 4).
- `client/src/concept2cure/mdx/`: 123 files; `surfaces/` has 29 `.tsx`; `data/` ~40 `.ts`; `app.css` 120 KB.
- Canonical `ui_kits/mdx/`: 30 files incl. `FilesTreePane.jsx`, `dossier-store.jsx`, `pathway-tabs.css`, `files-tree.css`, `drafter.css` — none of which appear in the v2 mdx port or the stale mirror.
