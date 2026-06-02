# Reconciliation packet reply — 2026-06-02

Answers to the five reply items, in order, plus the §B verify rows. Goal: "kits
are the only UI." Status is reported honestly: code-verified items say so;
items that require merge/deploy say that too.

---

## 1 · Step 1 rescue package — DELIVERED
`mdx_phase2/` + `pdev/` + the three docs (`MDX_DESIGN_BACKLOG.md`,
`PDEV_IND_DESIGN_BRIEF.md`, `READ_ME_FIRST.md`) were packaged as a zip and
handed to the operator, with a sha256 record at
`_sync/rescue-2026-06-02.manifest.txt`. Not single-copy: the originals remain at
their `design-system/ui_kits/{mdx_phase2,pdev}` + `design-system/` paths in this
repo. None of them have been deleted or overwritten. Re-attachable on request.

## 2 · canonical locked
**canonical locked.** `design-system/` is read-only; I removed the one
hand-edit I had made to it (the Step 3a mirror copy) so the mirror is untouched
and will be refreshed only by the sync workflow from canonical. `.sync-meta`
still reads `ref: main`; pointing it at the canonical export is an operator/secret
change, flagged for the sync owner.

## 3 · installed + live (Steps 3–4) — PARTIAL, and here is the exact boundary
**Step 3 (install) is done in code and verified; Step 4 (merge + deploy) I cannot
perform from this environment.** I can push to the feature branch and open/maintain
a PR, but I cannot merge to the protected `concept2cure-v2` default branch or
deploy production — those two actions are the operator's. So "installed + live +
URL" is not something I can truthfully send; what I can send is: **PR #677 is
green and every piece is wired and compiling.** Merge it + deploy and it is live;
the acceptance list then runs against that URL.

What landed in the implementation (`client/src/concept2cure/mdx/`), all
typecheck-clean (`tsc --noEmit`: 0 errors) and orphan/repo-health clean:
- `store/dossierStore.ts` (kit IIFE → typed ES module)
- `surfaces/pathway/PathwayPanes.tsx` — the 5-tab bar + Audit/Correspondence/
  Approvals panes + the 3-tab `DossierDrawer`
- `surfaces/pathway/FilesTreePane.tsx` — the Files tab
- `components/AnaDrafter.tsx` — full-page drafter, wired to take over from the
  Correspondence pane's "Draft response with AnA"
- `data/pathwayTabs.ts` (+`PATHWAY_TABS_DATA`), `data/correspondenceDetail.ts`,
  the 3 kit stylesheets, the icon glyphs, the type contracts
- Mounted inside `K510Surface` / `PmaSurface` / `CerSurface`
- **`surfaces/AuditSurface.tsx` deleted** — the standalone divergence is gone;
  Audit is now a tab inside `PathwayPanes` (kit `AuditTrailPane`). (`data/audit.ts`
  + `hooks/useAudit.ts` stay — they're still used by `_shared/program/ProgramSubTabs`.)

Bundle port status: **9 of 10 files ported + wired.** The 10th,
`data-submissions.jsx → data/submissions.ts`, is Submission-Center scope (it
reconciles with the existing `submissions.ts` consumed by `SubmissionsSurface`),
not a pathway-tabs file — it does not affect the Step 3 acceptance list. It's the
next port after this lands.

Step 3 acceptance — code state (live verification is post-merge):
- [x] 5-tab pathway bar mounts in K510/PMA/CER
- [x] Files tab renders tree + preview from `dossierStore`
- [x] `body.md` → DossierDrawer (Document/Attachments/Activity)
- [x] store edits round-trip → Activity tab
- [x] AnaDrafter opens inline + accept/cancel
- [x] 3 stylesheets imported next to `app.css`
- [x] tokens unchanged (`--accent-100` #d97757, `--bg-000` #faf9f5)
- [ ] re-run the above against the **deployed URL** ← needs operator merge + deploy

## 4 · The 6 stubs — data shapes (screenshots need the running app)
Per-surface exported data shape (from `mdx/data/*.ts`). Screenshots require the
surface rendering in the running/deployed app; I can produce them via the QA
harness if you want me to attempt booting the app locally, otherwise they come
from the deploy.

- **Analytics** (`data/analytics.ts`): `ANL_KPIS`, `ANL_CYCLE_PHASES`, `ANL_BLOCKERS`, `ANL_REVIEWERS`, `ANL_ANA_USAGE`, `ANL_PACE_24M`
- **Memory** (`data/memory.ts`): `MEM_CATEGORIES`, `MEM_IMPORTANCE`, `MEM_ATOMS`, `MEM_INGEST`, `MEM_EFFECTS`
- **Admin** (`data/admin.ts`): `ADM_KPIS`, `ADM_MEMBERS`, `ADM_ROLES`, `ADM_GRANTS`, `ADM_SSO`, `ADM_API_KEYS`, `ADM_AUDIT`, `ADM_SETTINGS`
- **Engineering** (`data/engineering.ts`): `ENG_DHF`, `ENG_TRACE`, `ENG_RISK_SEVERITY`, `ENG_RISK_PROB`, `ENG_RISK_ACCEPT`, `ENG_RISKS`, `ENG_ECRS`, `ENG_ISSUES`
- **UDI** (`data/udi.ts`): `UDI_AGENCIES`, `UDI_DEVICES`, `UDI_LABELS`, `UDI_SYMBOLS`, `UDI_ISSUES`, `UDI_MRI`
- **Post-market** (`data/postmarket.ts`): `PV_METRICS`, `PV_SIGNALS`, `PV_MDRS`, `PV_CAPA_STAGES`, `PV_CAPAS`, `PV_PMS_PLAN`, `PV_TRENDS`

(Each surface also has live hooks `use<Surface>` that fall back to these fixtures.)

## 5 · The 12 no-kit surfaces — beta-required / retire

| Surface | Tag | Why |
|---|---|---|
| IVD | **beta-required** | core IVD regulatory pathway |
| IVDR | **beta-required** | EU IVDR pathway |
| CDx | **beta-required** | companion-diagnostic pathway |
| SaMD | **beta-required** | software-as-medical-device pathway |
| LDT | **beta-required** | lab-developed-test pathway |
| Quality | **beta-required** | QMS workspace |
| Clinical | **beta-required** | clinical-study workspace |
| Search | **retire** | the Cmd-K palette already covers search; not a standalone surface |
| Notifications | **retire (→ shell kit)** | platform-utility; belongs to the shell/home kit, design once |
| Onboarding | **retire (→ shell kit)** | platform-utility; shell/home concern |
| Conversations | **retire (→ shell kit)** | platform-utility; shell/home concern |
| AnA Review | **retire (→ shell kit)** | platform-utility; shell/home concern |

7 beta-required (regulatory pathways/workspaces → please author canonical kits),
5 retire-from-MDX (platform utilities → fold into the shell/home kit, then delete
the MDX-specific surface + route in one PR).

## §B verify rows
- **Editors (eSTAR / PMA / CER / Document):** do **not** render inside MDX. Per
  Phase 9, MDX hands off via `onOpenEditor → openAuthoring(docType) →
  onOpenAuthoring`; the editors live in the Universal Authoring shell at
  `client/src/concept2cure/authoring/` (`App.tsx`, `AuthoringRoute.tsx`,
  `shell/`, `workbench/`, `artifact/`). Confirm those trace to the authoring kit.
- **ProjectHome:** renders from `mdx/projectHome/ProjectHome.tsx` via `App.tsx`
  `case 'project-home'`. Ported / kit-driven.

## Step 0 freeze
Confirmed frozen (written confirmation, which Step 0 accepts). The only
canonical→mirror transport is `.github/workflows/sync-design-system.yml`, which is
**`workflow_dispatch` only** — no cron, no push trigger, and gated on a
`DESIGN_SYSTEM_SOURCE` secret. Nothing auto-fires; I have not run it and will not
until you confirm the rescue is absorbed into canonical.
