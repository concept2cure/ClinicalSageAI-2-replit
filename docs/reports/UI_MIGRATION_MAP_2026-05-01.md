# UI migration map — full Claude Design replacement

Inventory of every UI codebase that must retire by GA, per the directive to standardize on Claude Design only. Date: 2026-05-01. Source of truth for the Phase 3 migration sequence.

---

## Status legend

- **Keep** — non-UI infrastructure or service code; survives Claude Design transition
- **Wrap-then-swap** — kept temporarily; wrapped behind a Claude-Design-shaped contract; swapped when the kit lands
- **Migrate** — UI surface that has live consumers; needs a Claude Design kit before it can retire
- **Delete now** — orphaned (no live consumer); safe to delete in a single PR

---

## 1. portal-v2 (~18 sub-directories)

The shock finding. Of all the portal-v2 code, **only three modules have live consumers**:

| Path | Status | Live consumers |
|---|---|---|
| `portal-v2/services/authService` | Keep | Concept2CureLogin, ZenRouter, ZenLogin, App.jsx — service layer for /api/auth |
| `portal-v2/services/cortexClient` | Keep | Service layer for /api/cortex |
| `portal-v2/components/security/ElectronicSignature` | Wrap-then-swap | `<GovernedActionButton>` (Phase 0) wraps it; swap when Claude Design ships e-sign kit |

**Everything else in `portal-v2/components/*` is orphaned** — no live consumer. That includes:

- `portal-v2/components/dashboards/{ExecutiveDashboard, RegulatoryLeadDashboard, …}` — orphaned
- `portal-v2/components/admin/*` — orphaned
- `portal-v2/components/vault/{DocumentVault, …}` — orphaned
- `portal-v2/components/monitoring/*` — orphaned
- `portal-v2/components/billing/*` — orphaned
- `portal-v2/components/settings/*` — orphaned
- `portal-v2/components/onboarding/*` — orphaned
- `portal-v2/components/cortex/*` — orphaned (despite the service still being live)
- `portal-v2/components/client-portal/*`, `ai-assistant/*`, `compliance/*`, `audit/*`, `workflows/*` — all orphaned

**Implication.** ~95% of portal-v2 can be deleted in a single sweep once we:
1. Move `services/authService` and `services/cortexClient` to a `client/src/services/` location (out of `portal-v2/`).
2. Replace `ElectronicSignature` with the future Claude Design e-sign kit.
3. Delete `portal-v2/` entirely.

But the audit also said most of these orphaned components encoded real product capability against backend services (RegulatoryLeadDashboard does AI-letter ingest; ExecutiveDashboard does portfolio rollup). **The capability migrates to MDX via new Claude Design kits; the orphaned code does not need to be physically migrated — only referenced as design briefs**.

---

## 2. concept2cure/components (~55 sub-directories)

Same pattern: most sub-directories are orphaned despite encoding real capability. Live consumers from the entry points (ZenApp + ZenRouter):

### Live coupling — ZenApp imports

| Path | What it is | Status |
|---|---|---|
| `components/sidebar/ZenSidebar` | Project workspace sidebar chrome | Migrate to MDX shell (Rail already exists) |
| `components/command/ZenCommandPalette` | ⌘K palette | Migrate to MDX CmdK (already exists) |
| `components/projects/ProjectSwitcher` (NewProjectModal) | New-project modal | Need Claude Design kit |
| `components/workspace/ProjectConfigPanel` | Project settings panel | Need Claude Design kit |
| `components/workspace/ProjectHeaderBar` | Project topbar chrome | Migrate to MDX TopBar |
| `components/workspace/ProjectWorkspaceShell` | Overall project workspace shell | Migrate to MDX shell |
| `components/shell/EmbeddedModuleHosts` (510k/PMA/CER) | Iframe→React bridge that I removed in Phase 2 | Likely orphaned now — verify and delete |
| `components/shell/GlobalOperatingShell` | Global app shell | Migrate to MDX shell |
| `components/ErrorBoundary` | Error boundary | Keep (utility, not UI surface) |

### Cross-component coupling — imports from inside concept2cure/components/*

Top consumers (subdirs imported from outside `components/*`):

| Path | External import count | Status |
|---|---|---|
| `components/intelligentDocs/*` | 7 | Investigate — likely connected to authoring |
| `components/workflow/*` | 2 | Migrate or delete after audit |
| `components/ui/*` | 2 | Probably shared utilities — keep on case basis |
| `components/workspace/*` | 1 | Already on the migrate list above |

### Orphaned (no live consumer outside `components/*` itself)

All other ~50 subdirs:

```
audit, biostats, biotech, biologics, brand, builder, calendar, canvas,
chat, clinical, cmc, coauthor, collaboration, command*, common, compliance,
compute, concept2cure-projects, control-plane, correspondence, cro, dashboard,
dashboards, demo, dr-sage, editor, enablement, home, ind, industry,
intelligence, knowledge, layout, medtech, onboarding, pharma, precedent,
projects*, proof, provenance, quality, readiness, regulatory, reports,
sidebar*, settings, submission, templates, traceability, writing
```

Most encode real capability (`regulatory/PostMarketSurveillance`, `intelligence/ClaimEvidenceDashboard`, `submission/PreSubmissionChecklist`, etc.) but have no live import. Some have already been deleted by upstream PRs but the directory still exists. **They become design references for Claude Design kits, not migration sources.**

`*` = listed under "live coupling" above — partial use.

---

## 3. Legacy `client/src/components/{canvas,dashboard,navigation,timeline,predicate}/`

| Path | Status |
|---|---|
| `components/canvas/` | **Delete now** — zero internal imports from concept2cure |
| `components/dashboard/` | **Delete now** — zero internal imports |
| `components/navigation/` | **Delete now** — zero internal imports |
| `components/timeline/` | **Delete now** — zero internal imports |
| `components/predicate/` | **Delete now** — zero internal imports (`DefensePacketPanel` was previously cited; verify before deletion) |

These were the "different token namespace" components I flagged earlier. CLAUDE.md says they're being deleted. They're orphaned. Single deletion PR after a final grep sweep for any test/storybook reference.

---

## 4. concept2cure/auth (legacy auth components)

| Path | Status |
|---|---|
| `auth/ZenLogin` | Wrap-then-swap → already swapped, retire after one stable release |
| `auth/ZenSignup` | Migrate (no Claude Design signup kit yet — Phase 1 design brief #15) |
| `auth/ZenAuthLayout` | Wrap-then-swap (lightweight shell; either delete or rebrand) |
| `auth/redirectUtils`, `auth/authInputUtils` | Keep (service utilities) |

---

## 5. concept2cure/components/bundle-surface-frame

Dropped from the live render path in Phase 2 (the iframe→React swap). Verify zero remaining consumers and delete.

---

## Action plan from this map

### A. Immediate, low-risk deletions (can ship as one PR)

1. `client/src/components/canvas/`
2. `client/src/components/dashboard/`
3. `client/src/components/navigation/`
4. `client/src/components/timeline/`
5. `client/src/components/predicate/`
6. `client/src/concept2cure/components/bundle-surface-frame/` (if zero consumers post-Phase-2)
7. Token CI's `ALWAYS_SKIP` list in `scripts/ci/check-token-cascade.mjs` updated to match.

Estimated effort: 1 day. Risk: low (zero internal imports).

### B. Service-layer move (1 small PR)

1. Move `client/src/portal-v2/services/{authService,cortexClient}` → `client/src/services/`.
2. Update imports across codebase (Concept2CureLogin, ZenRouter, ZenLogin, App.jsx, GovernedActionButton, etc.).
3. Run typecheck.

Estimated effort: 1 day. Risk: low.

### C. Orphaned-portal-v2 sweep (1 medium PR)

1. After service-layer move, `portal-v2/services/` is empty → delete `portal-v2/` entirely except `components/security/ElectronicSignature.tsx` and its dependencies.
2. Move `ElectronicSignature.tsx` (and its dep tree) under a temporary location such as `client/src/components/legacy-esign/` so its scope is explicit and the deletion target is obvious post-kit-swap.

Estimated effort: 1–2 days. Risk: medium (need to chase the `useSecurityContext` provider's location).

### D. Shell migration to MDX (Phase 3 kickoff)

1. Identify which legacy shell components MDX shell already replaces:
   - `ZenSidebar` ↔ MDX `Rail`
   - `ZenCommandPalette` ↔ MDX `CmdK`
   - `ProjectHeaderBar` ↔ MDX `TopBar` (partially)
   - `GlobalOperatingShell` ↔ MDX shell already in place
2. Identify what MDX shell does **not** yet cover:
   - Project switcher modal (`NewProjectModal`)
   - Project config panel (`ProjectConfigPanel`)
   - Project workspace shell (`ProjectWorkspaceShell`) — wraps non-MDX surfaces too (eCTD, etc.)
3. Brief Claude Design for the project-shell kit that subsumes all of the above.
4. Port → wire → migrate consumers → retire legacy.

Estimated effort: 3–4 weeks (gated on Claude Design kit). Risk: medium.

### E. Capability migrations (Phase 3 main body)

Each is one vertical: design brief → kit → port → wire → migrate → retire. Ordered by user value (matches GA plan v2):

| # | Capability | Source (orphaned) | Target (MDX) | Backend ready |
|---|---|---|---|---|
| 1 | AI letter ingest + response | `portal-v2/components/dashboards/RegulatoryLeadDashboard` | new MDX surface `correspondence` | yes |
| 2 | Claim-evidence traceability | `components/predicate/DefensePacketPanel`, `components/traceability/*` | new MDX surface `claim-evidence` | yes |
| 3 | Portfolio rollup | `portal-v2/components/dashboards/ExecutiveDashboard`, `components/pharma/PharmaPortfolioDashboard` | new MDX surface `portfolio` | yes |
| 4 | Document vault | `portal-v2/components/vault/DocumentVault` | MDX surface `vault` (currently `<InDesignSurface>` stub) | yes |
| 5 | Filing calendar | `components/calendar/RegulatoryCalendar` | new MDX surface `calendar` (needs backend dep engine) | partial |
| 6 | Pre-flight RTA gate | `components/submission/PreSubmissionChecklist` | new MDX surface `validation` (currently stub) | yes (`validate-completeness-engine`) |
| 7 | Post-market vigilance | `components/regulatory/PostMarketSurveillance` | MDX surface `postmarket` (currently stub) | yes (`post-market.service`) |
| 8 | Evidence sufficiency | (no orphaned UI) | new MDX surface — pure addition | yes |
| 9 | Living-file freshness | (no orphaned UI) | new MDX surface — pure addition | yes |
| 10 | Reviewer simulator | (no orphaned UI) | new MDX surface — pure addition | yes |
| 11 | E-sign confirmation | `portal-v2/components/security/ElectronicSignature` | wrapped by `<GovernedActionButton>`; visual swap when kit lands | yes |
| 12 | Auth · signup | `concept2cure/auth/ZenSignup` | new MDX surface | yes |

---

## What this changes in the plan

The previous plan implied "migrate UIs into MDX." In reality:

- **Most condemned UI is already orphaned**, not load-bearing.
- The actual migration burden is **capability replacement**, not UI translation.
- Each capability needs a new Claude Design kit; the orphaned UIs are reference material, not migration sources.
- Five condemned legacy directories can be deleted **today**.
- Most of `portal-v2/` can be deleted after a small service-layer move.

**Deletion-only PRs (~1 week effort) cut the codebase by tens of thousands of lines and remove the visual confusion of "which dashboard is the real one." Worth doing immediately.**

---

## Decisions still needed

1. **Approve the immediate deletion PR (A)** — five legacy `components/` dirs. Single sweep.
2. **Approve the service-layer move (B)** — `portal-v2/services/* → services/*`.
3. **Confirm the capability-migration order** in section E. Default is the GA plan v2 order; override if a customer commitment dictates otherwise.
4. **Claude Design kit queue** — confirm which kits land first. AI letter response (#1), claim-evidence (#2), and portfolio rollup (#3) are the highest-value triplet.
