# Kit-coverage ledger — "kits are the only UI"

**Compiled:** 2026-06-02 by the design-system seat, diffing the canonical `ui_kits/mdx/` against the implemented surfaces in `concept2cure-v2@a1c68dc` (`client/src/concept2cure/mdx/surfaces/`).
**Purpose:** turn "kits are the only UI" into a number you drive to zero. The goal is met when **no row is `code-only` or `legacy`** — every rendered surface traces to a canonical kit.

## Status legend
- **kit-driven** — has a canonical kit, ported, rendering. ✅ counts toward the goal.
- **kit-pending-install** — canonical kit exists; lands via PR #677 (June bundle). Becomes kit-driven on merge+deploy.
- **code-only (stub)** — built in code, but canonical only has an `InDesignSurface` stub. Needs a real kit back-ported.
- **code-only (none)** — built in code, no canonical kit at all. Needs a kit, or retire the surface.
- **legacy** — rendered by `ZenApp.tsx` / old `components/`. Must be replaced + deleted.

---

## A · The 29 implemented MDX surfaces

| # | Surface (v2) | Canonical kit? | Status | Action |
|---|---|---|---|---|
| 1 | `Overview` | Surfaces.jsx · Overview | **kit-driven** | — |
| 2 | `K510Surface` | Surfaces.jsx · K510 | **kit-driven** | — |
| 3 | `PmaSurface` | Surfaces.jsx · PMA | **kit-driven** | — |
| 4 | `CerSurface` | CerWorkbench (7 sub-tabs) | **kit-driven** | — |
| 5 | `PrecedentSurface` | Surfaces.jsx · Precedent | **kit-driven** | — |
| 6 | `QSubSurface` | PreSub.jsx | **kit-driven** | — |
| 7 | `VaultSurface` | Workbench.jsx · Vault | **kit-driven** | — |
| 8 | `TemplatesSurface` | Workbench.jsx · Templates | **kit-driven** | — |
| 9 | `AskAnaChip` | Surfaces.jsx (util) | **kit-driven** | — |
| 10 | `InDesignSurface` | Surfaces.jsx (util) | **kit-driven** | — |
| 11 | `AuditSurface` | PathwayPanes · AuditTrailPane (PR #677) | **kit-pending-install** | merge #677, then refactor from standalone → pathway sub-tab |
| 12 | `AnalyticsSurface` | only `MDX_STUBS.analytics` | **code-only (stub)** | back-port real kit |
| 13 | `MemorySurface` | only `MDX_STUBS.memory` | **code-only (stub)** | back-port real kit |
| 14 | `AdminSurface` | only `MDX_STUBS.admin` | **code-only (stub)** | back-port real kit |
| 15 | `EngineeringSurface` | only `MDX_STUBS.engineering` | **code-only (stub)** | back-port real kit |
| 16 | `UdiSurface` | only `MDX_STUBS.udi` | **code-only (stub)** | back-port real kit |
| 17 | `PostmarketSurface` | only `MDX_STUBS.postmarket` | **code-only (stub)** | back-port real kit |
| 18 | `CdxSurface` | none | **code-only (none)** | back-port or retire |
| 19 | `IvdSurface` | none | **code-only (none)** | back-port or retire |
| 20 | `IvdrSurface` | none | **code-only (none)** | back-port or retire |
| 21 | `LdtSurface` | none | **code-only (none)** | back-port or retire |
| 22 | `SamdSurface` | none | **code-only (none)** | back-port or retire |
| 23 | `QualitySurface` | none | **code-only (none)** | back-port or retire |
| 24 | `ClinicalSurface` | none | **code-only (none)** | back-port or retire |
| 25 | `OnboardingSurface` | none | **code-only (none)** | back-port or retire |
| 26 | `ConversationsSurface` | none | **code-only (none)** | back-port or retire |
| 27 | `SearchSurface` | none (Cmd-K palette only, not a surface) | **code-only (none)** | back-port or retire |
| 28 | `NotificationsSurface` | none | **code-only (none)** | back-port or retire |
| 29 | `AnaReviewSurface` | none | **code-only (none)** | back-port or retire |

## B · Canonical surfaces NOT yet visible in the v2 surface list
These exist in the kit but didn't appear as `surfaces/*.tsx` — confirm they install via #677 or port them:

| Kit surface | Where | Status |
|---|---|---|
| `FilesTreePane` (Files tab) | June bundle | kit-pending-install (#677) |
| `PathwayPanes` tab bar (Workspace/Audit/Correspondence/Approvals/Files) | June bundle | kit-pending-install (#677) |
| `DossierDrawer` (Document/Attachments/Activity) | June bundle | kit-pending-install (#677) |
| `AnaDrafter` | June bundle | kit-pending-install (#677) |
| `EstarEditor` / `PmaEditor` / `CerEditor` / `DocumentEditor` | EstarEditor.jsx, EditorSurfaces.jsx | **verify** — no editor surface in the v2 `surfaces/` list; confirm where editors render |
| `ProjectHome` | ProjectHome.jsx | **verify** — confirm ported |

---

## C · The number

| Bucket | Count |
|---|---|
| kit-driven (live) | **10** |
| kit-pending-install (#677 merge flips these green) | **5** (Audit, Files, PathwayPanes, DossierDrawer, AnaDrafter) |
| code-only (stub) — needs real kit | **6** |
| code-only (none) — needs kit or retire | **12** |
| legacy (ZenApp/components) | **TBD — audit needed** |

**"Kits are the only UI" = the bottom three rows reach 0.**
Today: **18 surfaces** (6 stub + 12 none) render with no real canonical kit, plus the legacy shell is un-audited.

---

## D · Burn-down order (drive the 18 to 0)

**Phase A — bank what's already done (this week)**
1. Merge PR #677 + deploy. Flips 5 rows to kit-driven (10 → 15).
2. Verify editors + ProjectHome render from kits (§B "verify" rows).

**Phase B — back-port the 6 stubs (fast; they were always meant to be kits)**
3. For Analytics, Memory, Admin, Engineering, UDI, Post-market: Claude Code sends a screenshot + the data shape per surface; I author the canonical kit; it becomes the verify-against spec. These are low-risk because the rail already treats them as first-class.

**Phase C — triage the 12 no-kit surfaces (the real decision)**
4. Split into **beta-required** vs **retire/park**:
   - Likely beta-required for an MDX product: IVD, IVDR, CDx, SaMD, UDI(✓already stub), LDT, Quality, Clinical, Post-market(✓stub) — these are real regulatory pathways/workspaces.
   - Likely platform-utility (design once, reuse): Search, Notifications, Onboarding, Conversations, AnA Review — these may belong to the shell/home kit, not the MDX kit.
5. For each beta-required: I author a canonical kit. For each retire: delete the surface + its route in one PR.

**Phase D — kill legacy**
6. Audit `ZenApp.tsx` (93 KB) + old `components/` for any surface still rendering outside a kit route. Replace each with its kit-driven route, then delete in the same PR. No parallel paths.

**Phase E — lock it**
7. Add a CI check (or a manual ledger review on every MDX PR): every new `surfaces/*.tsx` must reference a canonical kit, or the PR is blocked. This is what *keeps* "kits are the only UI" true instead of drifting again.

---

## E · What I need from Claude Code to advance this
1. **Merge #677** → I re-verify and flip 5 rows.
2. **The rescue package** (`mdx_phase2/`, `pdev/`, 3 docs) → so canonical is the superset.
3. **Per-surface screenshot + data shape** for the 6 stubs (Phase B) — I turn them into kits fast.
4. **Beta-required vs retire tags** for the 12 no-kit surfaces (Phase C).
5. **Confirmation of where editors + ProjectHome render** (§B verify rows).

Send 1–4 and I produce kits in burn-down order. The ledger's "code-only" count is the single number that says whether the goal is met.
