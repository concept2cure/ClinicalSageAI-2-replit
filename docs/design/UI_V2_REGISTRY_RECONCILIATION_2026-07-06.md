# Registry-id reconciliation — kit `app/registry.jsx` vs `shared/constants/ui-surface-registry.ts`

- Shared registry: **33** surfaces · Kit registry: **81** surfaces
- Ids present in BOTH and field-identical: **29**
- Ids present in BOTH with field-level differences: **4**
- Ids the kit ADDS (absent from shared): **48**
- Ids the shared registry has that the kit DROPS: **0**

## Field-level differences on shared ids

### `apps`
- **readiness**: `"planned"` → `"routes-ready"`

### `tasks`
- **apiPrefixes**: `["/api/tasks", "/api/regulatory/tasks", "/api/collaboration"]` → `["/api/task-management", "/api/regulatory/tasks", "/api/project-sections"]`
- **sharedContract**: `"@shared/types/communication-center"` → `"@shared/schema unifiedTasks \u00b7 taskDependencies"`

### `ana-memory`
- **navTier**: `"admin"` → `"global"`
- **label**: `"AnA memory"` → `"AnA Memory"`
- **group**: `"intelligence"` → `"explore"`
- **apiPrefixes**: `["/api/ana", "/api/mdx"]` → `["/api/mdx/ana/memory", "/api/mdx/ana/threads"]`
- **compliance**: `["accessibility-enforcement", "microcopy-tone"]` → `["regulatory-compliance-ux", "accessibility-enforcement", "microcopy-tone"]`

### `billing`
- **layoutMode**: `"setup"` → `"billing"`
- **apiPrefixes**: `["/api/billing"]` → `["/api/billing/invoices", "/api/billing/budgets", "/api/billing/portal"]`

## Kit-added surface ids (by tier)

- **global** (4): `ana-command` · `cro-portfolio` · `etmf` · `filings-catalog`
- **project** (34): `program-journey` · `dispatch-readiness` · `shadow-review` · `decision-lineage` · `ivd-completeness` · `batch-draft` · `authoring-engine` · `inconsistency` · `source-tracer` · `dossier` · `conversation-thread` · `evidence-search` · `haq-manager` · `nda-cockpit` · `device-workstream` · `protocol-dev` · `research-admin` · `pyramid` · `registrations` · `market-access` · `change-assessment` · `doc-journey` · `labeling-pi` · `agency-meetings` · `communication-center` · `rbm` · `orchestration` · `reg-change` · `insights` · `pediatric` · `orphan` · `lifecycle-mgmt` · `clinical-ops` · `nonclinical`
- **specialist** (4): `intelligence-catalog` · `pharmacovigilance` · `design-controls` · `human-factors`
- **admin** (6): `licensing` · `training` · `coverage` · `admin-console` · `onboarding` · `usage`

## Contract refs normalized to `null` (file missing or not a @shared path)

- `decision-lineage`: Contract ref (not yet a @shared file): @shared/types/decision-lineage
- `ivd-completeness`: Contract ref (not yet a @shared file): @shared/regulatory/ivdr
- `inconsistency`: Contract ref (not yet a @shared file): server/routes/assumption-decision-contradiction.ts
- `source-tracer`: Contract ref (not yet a @shared file): server/routes/sourceLinks.ts + server/routes/citations.ts
- `conversation-thread`: Contract detail: concept2cureConversations/Messages
- `haq-manager`: Contract ref (not yet a @shared file): @shared/types/haq
- `pyramid`: Contract ref (not yet a @shared file): services/regulatory/SubmissionPyramidEngine.ts · globalPyramids.ts · submission-type-bridge.ts
- `rbm`: Contract ref (not yet a @shared file): client/src/concept2cure/services/rbmService.ts · hooks/useRbm.ts
- `intelligence-catalog`: Contract ref (not yet a @shared file): server/services/ana/tool-pedigree.ts
- `insights`: Contract ref (not yet a @shared file): server/services/report-os/taxonomy.ts

## Disposition (applied in this change — flag any veto before Phase 3)

The four field-level differences are the kit's 2026-07-05 route-truth
corrections (all verified against the 15 `server/bootstrap/register-*` mount
files in the kit's GA_READINESS_AUDIT) plus one readiness upgrade:

| id | change | disposition |
|---|---|---|
| `apps` | readiness planned → routes-ready | adopted — `/api/module-subscriptions` is mounted and tested |
| `tasks` | routes → `/api/task-management` + `/api/project-sections`; contract → `@shared/schema` (unifiedTasks · taskDependencies) | adopted — unifiedTasks board is the canonical store; the communication-center contract now belongs to the `communication-center` surface |
| `ana-memory` | navTier admin → global (rail Explore) · routes → `/api/mdx/ana/memory` + `/api/mdx/ana/threads` · +part11 rail | adopted — matches the mounted mdx ana-memory router and the kit rail |
| `billing` | layoutMode setup → billing · routes → `/api/billing/{invoices,budgets,portal}` | adopted — billing-dashboard.ts + billing.ts both mount at `/api/billing` (verified) |

Additive schema change: the `UiSurface` interface gains an optional
`icon?: string` (kit Icons.jsx vocabulary) so the ui-v2 rail/⌘K render from
the registry — no existing consumer reads it.

Deep-link aliases (`task-board`, `device-submission`, `ind-lifecycle`) are
intentionally NOT registry entries — they live in the ui-v2 shell's alias map
(`client/src/concept2cure/v2/routing.ts`), exactly as the kit keeps them in
`SURFACE_VIEWS` only.

Nothing was renamed or dropped: all 33 pre-existing ids survive verbatim; the
48 additions use the kit ids verbatim. `tests/ui-readiness/ui-surface-registry.test.ts`
(14 checks: uniqueness, taxonomy, contracts-on-disk, uiKit dirs) passes, plus
new parity tests in `client/src/concept2cure/v2/__tests__/`.
