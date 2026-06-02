# Claude Design — kit backlog ("kits are the only UI")

**Owner:** the canonical Concept2Cure Design System seat.
**Purpose:** the single list of surfaces that do NOT yet have a canonical kit. The
goal ("kits are the only UI") is met when this file is empty and no legacy route
renders. Compiled from `02_KIT_COVERAGE_LEDGER.md` + the v2 surface audit.

## Standing policies (enforced on every MDX PR)
1. **Kit-or-nothing.** A surface a user can reach must render from a canonical
   kit. New `surfaces/*.tsx` without a kit reference do not land.
2. **Delete-on-replace.** The PR that routes a kit replacement **deletes** the
   legacy/code-only surface + route it supersedes, in the same PR. No parallel
   paths. (Applied this cycle: `surfaces/AuditSurface.tsx` deleted when the kit
   `AuditTrailPane` tab landed.)
3. **Installed = merged + deployed.** A kit on a branch / un-merged PR / mirror
   is not installed. It counts only when it renders on the `concept2cure-v2`
   default branch in the deployed product.

---

## Status snapshot

| Bucket | Count | State |
|---|---|---|
| kit-driven (live) | 10 | done |
| June bundle (this PR #677) | 5 | **installed in code + tested; awaiting merge + deploy** |
| code-only **stub** — needs a real kit | 6 | **BACKLOG ↓** |
| code-only **none** — needs a kit or retire | 12 | **BACKLOG ↓** |
| legacy shell (ZenApp/components) | TBD | audit + delete-on-replace |

June bundle (installed in code, awaiting merge+deploy): PathwayPanes tab bar ·
AuditTrailPane (Audit tab) · CorrespondencePane · ApprovalsPane · FilesTreePane ·
DossierDrawer · AnaDrafter.

---

## BACKLOG A — 6 stub surfaces (build a real kit; code + data shape already exist)
These render in code and have an `MDX_STUBS.*` stub only. The implementation +
data shape is the spec input; Claude Design authors the canonical kit, then Claude
Code ports it and deletes the stub path.

| # | Surface | Data shape (exported consts in `mdx/data/*.ts`) |
|---|---|---|
| 1 | Analytics    | `ANL_KPIS`, `ANL_CYCLE_PHASES`, `ANL_BLOCKERS`, `ANL_REVIEWERS`, `ANL_ANA_USAGE`, `ANL_PACE_24M` |
| 2 | Memory       | `MEM_CATEGORIES`, `MEM_IMPORTANCE`, `MEM_ATOMS`, `MEM_INGEST`, `MEM_EFFECTS` |
| 3 | Admin        | `ADM_KPIS`, `ADM_MEMBERS`, `ADM_ROLES`, `ADM_GRANTS`, `ADM_SSO`, `ADM_API_KEYS`, `ADM_AUDIT`, `ADM_SETTINGS` |
| 4 | Engineering  | `ENG_DHF`, `ENG_TRACE`, `ENG_RISK_SEVERITY`, `ENG_RISK_PROB`, `ENG_RISK_ACCEPT`, `ENG_RISKS`, `ENG_ECRS`, `ENG_ISSUES` |
| 5 | UDI          | `UDI_AGENCIES`, `UDI_DEVICES`, `UDI_LABELS`, `UDI_SYMBOLS`, `UDI_ISSUES`, `UDI_MRI` |
| 6 | Post-market  | `PV_METRICS`, `PV_SIGNALS`, `PV_MDRS`, `PV_CAPA_STAGES`, `PV_CAPAS`, `PV_PMS_PLAN`, `PV_TRENDS` |

> Screenshots: produced from the running/deployed app (operator) or via the QA
> harness against a local boot — the surfaces render today from these fixtures.

## BACKLOG B — 12 no-kit surfaces (author a kit, or retire)
| # | Surface | Tag | Action |
|---|---|---|---|
| 7  | IVD            | beta-required | author canonical kit (regulatory pathway) |
| 8  | IVDR           | beta-required | author canonical kit (EU IVDR) |
| 9  | CDx            | beta-required | author canonical kit (companion dx) |
| 10 | SaMD           | beta-required | author canonical kit (software as medical device) |
| 11 | LDT            | beta-required | author canonical kit (lab-developed test) |
| 12 | Quality        | beta-required | author canonical kit (QMS workspace) |
| 13 | Clinical       | beta-required | author canonical kit (clinical-study workspace) |
| 14 | Search         | retire        | Cmd-K palette already covers it; delete the surface + route |
| 15 | Notifications  | retire → shell| move to shell/home kit; delete the MDX surface |
| 16 | Onboarding     | retire → shell| move to shell/home kit; delete the MDX surface |
| 17 | Conversations  | retire → shell| move to shell/home kit; delete the MDX surface |
| 18 | AnA Review     | retire → shell| move to shell/home kit; delete the MDX surface |

## BACKLOG C — legacy shell (audit + delete-on-replace)
- `ZenApp.tsx` still owns the `/` and `/concept2cure` routes; the MDX kit shell is
  not yet the default route (gated on the Projects shell, Phase 3). Each legacy
  surface is deleted in the PR that routes its kit replacement (policy 2).
- Action: audit `ZenApp.tsx` + `components/` for every surface still rendering
  outside a kit route; replace + delete per delete-on-replace.

---

## Gate to "done"
1. Merge + deploy PR #677 → flips the 5 June-bundle rows to kit-driven (10 → 15).
2. Claude Design authors Backlog A (6) + Backlog B beta-required (7) = 13 kits.
3. Retire Backlog B (5 utilities) + clear Backlog C (legacy) via delete-on-replace.

When A, B, and C are empty and no legacy route renders, "kits are the only UI" is true.
