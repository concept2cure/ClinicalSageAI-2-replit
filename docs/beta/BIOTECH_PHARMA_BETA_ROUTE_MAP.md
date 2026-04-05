# Biotech / Pharma Beta Route Map

> Generated: 2026-04-05
> Branch: concept2cure-v2

## Beta Founder Path (Canonical)

```
LOGIN          /concept2cure/login         → ZenLogin.tsx (829 lines)
SIGNUP         /concept2cure/signup        → ZenSignup.tsx (1026 lines)
PROJECT LIST   /concept2cure/projects      → ProjectsSidebar.tsx (756 lines)
PROJECT HOME   /concept2cure/project/:id   → project-home layout
510K WORKSPACE /concept2cure/project/:id/510k → CERV2Page.jsx (9429 lines)
IND WORKSPACE  /concept2cure/project/:id/ind  → section-workspace layout
ECTD WORKSPACE /concept2cure/project/:id/ectd → eCTD Navigator
CMC WORKSPACE  /concept2cure/project/:id/cmc  → section-workspace layout
```

## Approved Project Modules (Beta)

`510k` | `pma` | `cer` | `ind` | `ectd` | `cmc`

## Track A — Regulatory Lead (510k)

| Step | Component | Lines | Status |
|------|-----------|-------|--------|
| Project create | NewProjectWizard.tsx | ~200 | Works |
| Intake | Enhanced510kIntakeWorkflow.jsx | 1039 | Stage 0 only |
| Device profile | DeviceIntakeForm.jsx | 1551 | Works |
| Predicate search | PredicateFinderPanel.jsx | 1794 | Needs Shadow Service |
| Equivalence | EquivalenceBuilderPanel.jsx | 894 | Works |
| Compliance | ComplianceCheckPanel.jsx | 1379 | Works (PDF TBD) |
| Document vault | EnhancedDocumentVault.jsx | 1740 | Works |
| Editor | CERV2EditorAI.jsx | 1080 | Works |
| Export | Fda510kExportService.js | 357 | Works |

## Track B — IND / eCTD Authoring

| Step | Component | Status |
|------|-----------|--------|
| IND workspace | section-workspace layout | Routed |
| eCTD navigator | ECTDNavigator | Tool panel |
| Document editor | EditorPanel | Works |
| eCTD compile | ectd-compile routes | Backend ready |
| eCTD export | ectd-export routes | Backend ready |

## Track C — CMC

| Step | Component | Status |
|------|-----------|--------|
| CMC workspace | section-workspace layout | Routed |
| CMC documents | section-workspace | Needs verification |

## Track D — AnA 1.0 RI

| Step | Component | Status |
|------|-----------|--------|
| Chat panel | AnaPersistentPanel.tsx | Available |
| RI endpoints | ana-ri-inline-routes.ts | 773 lines, working |
| Workspace integration | EmbeddedAssistantRail | Available in 510k |

## Known Placeholder Text on Beta Path

1. Enhanced510kIntakeWorkflow.jsx:1010 — "Additional stages will be implemented"
2. Enhanced510kIntakeWorkflow.jsx:1019 — "Stage N content will be implemented here"
3. RTAChecklistPanel.jsx:414 — "PDF Export Not Yet Available"
4. ComplianceCheckPanel.jsx:334 — "PDF report generation is under development"

## Auth Surface

| File | Lines | Role |
|------|-------|------|
| ZenLogin.tsx | 829 | Login (clean) |
| ZenSignup.tsx | 1026 | Signup (needs convergence) |
| authService.tsx | 1097 | Client auth service |
| auth.ts (server) | 1738 | Backend auth routes |
| authEnterprise.ts | 775 | Enterprise auth |
| auth.ts (middleware) | 249 | JWT middleware |

## Sidebar Structure

Global: New → Search → Projects → Apps → Artifacts → Setup
Project: Overview → Tools → Vault → Review → Submit

## Hidden Patterns (Route Policy)

`/concept2cure/admin/*`, `/concept2cure/internal/*`, `/concept2cure/labs/*`, `/concept2cure/legacy/*`

## Demoted Layout Modes (Redirect to projects/documents)

mission-control, snowglobe, rules, ectd-coauthor, document-vault, clinical-trial,
templates, sherpa, analytics, timeline, audit, enablement-center, platform-admin,
biologics-dashboard, ctd-onboarding, client-intelligence, collaboration-hub,
user-inbox, client-branding, training-center, client-onboarding, knowledge-base,
project-knowledge, artifacts, document-builder, ana-platform-control
