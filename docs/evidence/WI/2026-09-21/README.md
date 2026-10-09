# WI evidence — protocol development in the launch catalog, launch-cut demo scripts, one-click demo chip (2026-09-21)

**Row moved:** D2 (launch catalog). Three items from the control tower; all
proven on a local instance with `LAUNCH_SCOPE_ENFORCE=on` (port 5500, dev
login). Staging is still owed under W2 (D1). No AI provider is configured on
this machine (`/readyz` reports `anaState: no_provider`), so nothing below
claims an end-to-end model run; the AnA half is unit-tested at the tool-result
and chip contracts.

## Item 1 — Protocol development joins the launch catalog (founder decision)

**Finding first.** `protocol-dev` was already registered — in
`shared/constants/ui-surface-registry.ui-v2.ts`, which the main registry
spreads into `UI_SURFACES` — routable (`surfaceViews.ts`, `full: true`), a
navigation target, and licensable (catalog row seeded by
`db/migrations/20260810_reconcile_module_catalog.sql`, category "Author &
assemble", `/concept2cure/protocol-dev`). Nothing needed a second registry
row (zero duplication). The one thing missing was the release boundary:
`shared/constants/launch-scope.ts` did not list it, so `applyLaunchScope`
emitted `entitled:false, source:'launch-scope'` and the page showed "Not in
this release". The founder read that as "not built".

**Change.** `protocol-dev` added to `LAUNCH_APPS.authoring.surfaces` and
`.modules` (dated note in the file). Module grants: `provisionLaunchModules`
reads `LAUNCH_MODULE_IDS`, so new organisations get the grant at creation; the
existing local org 2 was re-provisioned (`provision-launch-modules-org2.txt`,
22/22). `license-manager` derives `launchScope: 'launch' | 'later'` from the
same list, so the Apps catalog card flipped from "Not in this release" to on
with no catalog edit. The AnA surface-context gate needed nothing:
`ProtocolDev.tsx` already publishes `usePublishSurfaceContext('protocol-dev', …)`
(baseline stays 114/120 exact).

| Evidence | What it shows |
|---|---|
| `navigation-verdict-before.json` | `GET /api/module-subscriptions/navigation`, enforcement on, before: `protocol-dev` → `entitled:false, source:'launch-scope'` (101 verdicts, 21 master_admin / 80 launch-scope) |
| `navigation-verdict-after.json` | Same call after: `entitled:true, source:'master_admin'` (22 / 79); catalog row `launchScope:'launch'`, `isEnabled:true`; `GET /api/protocol-dev` returns the smoke protocol with 12 sections, 2 objectives, 3 criteria, 3 visits, 2 assessments, 2 risks, 2 milestones |
| `ci-launch-scope-fail-first.txt` | `ci:launch-scope` exiting 1 with `routable` + `registered` findings on a deliberately unregistered id appended to the Authoring app, then passing on the real tree (42 surfaces, 22 modules) |
| `ci-launch-scope.json` | Gate JSON on the real tree, 0 findings |
| `provision-launch-modules-org2.txt` | `module_subscriptions` row `(2, protocol-dev, enabled)` written by the one grant writer |
| `protocol-dev-document-tab.png` | `/concept2cure/protocol-dev` rendering "[Demo · Biotech] WI smoke protocol" (WI-SMOKE-001, v0.1, Draft): outline 0/12, completeness gate 0 %, ten critical findings, section body not started |
| `protocol-dev-objectives.png`, `-schedule-of-assessments.png`, `-risk-register.png`, `-milestones.png` | The registers rendering the API rows: 2 objectives, a 2 × 3 SoA grid with the four governed cells, two risks on the 5 × 5 heat map, two milestones on the timeline |
| `apps-catalog-protocol-dev-card.png` | The Apps catalog card, unlocked, under "Author & assemble" |
| `authoring-engine-verdict-before.json` / `-after.json` | The control-tower addition: `authoring-engine` swapped OUT of the Authoring app the same day. Before: `entitled:true, source:'master_admin'`, catalog `launchScope:'launch'`. After: `entitled:false, source:'launch-scope'`, catalog `'later'` — the "Not in this release" gate |
| `authoring-engine-gate-enforced.png` | `/concept2cure/authoring-engine` rendering the LaunchScopeGate panel under enforcement |

**Swap (control tower, 2026-09-21).** `authoring-engine` was removed from
`LAUNCH_APPS.authoring` (surfaces and modules) in the same edit:
`surfaces/AuthoringEngine.tsx` is a static explainer built from inline
constants (`AE_PIPE`, `AE_SYSTEMS`) with no editor and no authoring API.
Protocol development takes its place. Consequences checked: it has no rail
entry (`RAIL_*` in `registryModel.ts`), so nothing to hide; the Apps catalog
card flips to "Not in this release" through `launchScope:'later'`; the
fixture allowlist (`scripts/ci/launch-scope-fixture-allowlist.json`) held no
entry for it — its constants are inline, not imported from `fixtures/`, which
is why the fixture rule never saw them — so nothing was removed there; the
three re-cut demo scripts never navigate to it; `launch-scope.test.ts` now
pins it outside the scope and locked even when subscribed. The component
file is untouched. One gate defect surfaced on the way: `ci:launch-scope`
extracts every quoted id inside the `surfaces: [...]` text, comments
included, so a comment that quoted `'authoring-engine'` kept it counted (42
surfaces); the comments were unquoted and the gate reads 41 surfaces / 21
modules. Numbers now: 41 launch surfaces, 21 modules — the same totals as
2026-09-20, one id swapped.

The smoke protocol (`protocol_documents.id = 1`, org 2) was created through
the governed API (`POST /api/protocol-development/documents` + objectives,
eligibility, visits; `/api/protocol-soa` assessments and cells;
`/api/protocol-risks`; `/api/protocol-milestones`), every write with a reason
and an audit id. **No delete route exists on any protocol router** (all
readers filter `deleted_at IS NULL`, nothing sets it), so the row is left in
the local database and is named here.

### What the surface does with each register (from the API, no client data)

| Register | Source | Renders | Writes from the surface |
|---|---|---|---|
| Document / sections | `protocol_sections` (12 seeded on create) | Outline, status dots, completeness gate + findings; body is read-only ("Draft with AnA" sends an ask) | none — no section editor on this surface; `PATCH /api/protocol-development/sections/:id` exists with no caller here |
| Objectives | `protocol_objectives` | grouped primary/secondary/exploratory with endpoint | Add objective (governed form) |
| Eligibility | `protocol_eligibility_criteria` | inclusion / exclusion columns | Add criterion (governed form) |
| Schedule of assessments | `protocol_schedule_visits` + `protocol_soa_assessments` + `protocol_soa_cells` | grid, per-visit totals; cells toggle with a session reason | cells only — **no way to add a visit or an assessment from the surface** (both exist as API routes); `issues` is always `[]` from the assembler |
| Statistics | biostatistics bridge (study design) | link into the designer | n/a |
| Risk register | `protocol_risks` | 5 × 5 heat map, list, mitigation; residual scores show `L0×I0` until `PATCH /api/protocol-risks/risks/:id` sets them (no form here) | Add risk (governed form) |
| Milestones | `protocol_milestones` | timeline with urgency badge (assembler computes from target/actual date) | Add milestone (governed form); status change is API-only |
| Budget | `protocol_budget_items` + `_params` | table and feasibility roll-up | **none** — read-only; `/api/protocol-budget/documents/:id/items` has no caller on the surface; with no params the verdict is omitted rather than invented |
| Amendments | `protocol_amendments` (+ changes) | cards with changeset | New amendment (governed form) |
| Deviations & CAPA | `protocol_deviations` (+ capa) | cards with CAPA rows | Report deviation (governed form) |
| Reviews | `protocol_review_assignments` + comments | reviewer list, comments, blocking count | **none** — reviewers/comments are API-only (`/api/protocol-reviews`) |
| Consent | assembler returns `consent: []` always | "0 of 0 required elements present", 0 % | **unsupported** — `/api/protocol-consent` forms are never read by `pdev-view-assembler` |
| Header sponsor / PI | assembler returns `''` for both | empty | not stored on `protocol_documents` |

Honest empty states were left as they are: every register normalises to an
empty collection, the budget prints no verdict without both sides of the
contract, and no fixture reaches the client (`ProtocolDev.tsx` imports only a
type from `fixtures/protocol-data`).

## Item 2 — the three Live Drive scripts re-cut to the launch catalog

`shared/navigation/demo-scripts.ts`: `training-orientation` (15 stops, 9
navigations: Projects → program → project home → Vault → Authoring →
Protocol development → Submission Center (validation) → Submission Readiness
(readiness view) → QMS (approved changes) → audit trail),
`training-submission-day` (14 stops: Projects → Vault → Authoring → Review
queue → Submission Center (select, validation) → Readiness → Part 11 console
→ audit trail) and `sales-flagship` (12 stops, the pitch order: Projects →
program → Authoring (open a document) → Protocol development → Vault →
Submission Center → Readiness → QMS → audit trail). Talking points name
"[Demo · Biotech] C2C-101" (anti-IL-23 antibody IND) and "[Demo · MDX]
NeuroPanel-Dx" (IVD 510(k)) without pinning ids. Every `act` is an existing
registered action; every pinned param is in its enum. Budgets (12/16) hold.

Two navigation targets were added to `shared/navigation/index.ts` so a
demonstration can end at the record: `audit-trail` and `part11-console`
(shell surfaces the catalog never gates; `navigationReachability.test.ts`
proves both mount a real view).

| Evidence | What it shows |
|---|---|
| `demo-scripts-test-failing-first.txt` | The new launch-catalog test against the OLD scripts: 4 failures naming `cmc`, `intelligence → global-ri`, `nda-cockpit`, `deep-research`, no Submission Readiness stop, no Vault-first submission day |
| `demo-scripts-test-passing.txt` | 15/15 after the re-cut, existing invariants (validated plan, budgets, unique ids, picker metadata) unchanged |

The two medtech scripts (`training-medtech`, `sales-medtech`) were out of
scope and still navigate outside the catalog; under enforcement they fail the
same way the three did. Listed under "open".

## Item 3 — "Show me the system" in chat without Live Drive

**What happened before.** With Live Drive off, `start_product_demo` returned
`demo_ready` plus an instruction to tell the user to find the toggle in the
rail's Control menu. `navigate_to` / `act_on_screen` results become chips
through `services/ana-ri/navigation-actions.ts`, but a demo result was not a
navigation, so the turn ended with a paragraph and nothing to press.

**Now.** The tool result carries `driven: false | true`. `navigation-actions.ts`
gains `demoStartFromToolResult` (only a `demo_ready` result with
`driven: false` qualifies — a driven demo is already playing, refusals never
become a start) and `toDemoStartChips` (same dedup/cap contract). The SSE
route (`stream.ts` → `post-processing.ts`) and the chat route
(`send-message.ts`) append the chip to `executedActions` exactly where the
navigation chips go. The rail (`Shell.tsx`, `ExecutedActionTail`) renders
`actionType: 'start_demo'` as **"Start demonstration: <title>"** and calls
`liveDrive.onStartDemo(demoId, title)` — the same `startDemo` V2App hands the
Control menu — so the toggle turns on visibly, demo mode commits, and budgets
and take-over are one machine. Locked workspaces get no button (the menu hides
its demonstrations there too); a chip with no `demoId` stays inert. The
work-dock output list ignores the offer like it ignores navigation offers.

Tests (all passing): `server/services/ana-ri/__tests__/navigation-actions.test.ts`
(directive shape, driven/undriven, refusals, dedup/cap),
`server/services/ana/__tests__/navigation-tools.test.ts` (`driven` flag and
the instruction naming the chip, "do not narrate the stops as if you had made
them"), `client/src/concept2cure/v2/__tests__/anaRailActions.test.tsx` (chip
calls `onStartDemo('sales-flagship','Sales demonstration')`, inert when
locked, inert without a starter, inert without a script id).

Not proven: an actual model turn. No provider key is configured here, the
gateway initialises with zero providers, and simulating one would be the
thing Rule 2 forbids.

## Gates

See `ci-gates.txt` (launch-scope selftest, AnA surface-context 114/120 exact,
undefined CSS classes, fixture fallback) and `ci-launch-scope-fail-first.txt`.
`typecheck:fast`: 0 errors in any file touched here; the single error on the tree (`server/services/ana-ri/__tests__/response-register.test.ts:200`, a number-for-string in a test fixture) is in a file this session did not touch and predates it on the current HEAD. ESLint warning ratchet `--since HEAD`:
`no file changed its warning count since HEAD` (an interim `Shell.tsx` complexity +1 was removed by moving the chip tail into `ExecutedActionTail`). Suites: `demo-scripts`, `navigation`, `surface-actions`,
`callable-apps`, `navigation-actions`, `navigation-tools`, `launch-scope`,
`anaRailActions`, `anaRailAttach`, `anaRailWorkDock`, `shellAskGuard`,
`liveDrive`, `navParams`, `navigationReachability` — all green.

## Open

- Staging run of the same verdicts once D1 lands (W2).
- Protocol development surface gaps (table above): no visit / assessment /
  budget / reviewer / consent entry from the screen, no section editor, consent
  never assembled, sponsor and PI not stored. Each is an API-only or
  unsupported register today; none of them fabricates.
- `training-medtech` and `sales-medtech` still leave the catalog.
- The smoke protocol row stays in the local database (no delete route).
