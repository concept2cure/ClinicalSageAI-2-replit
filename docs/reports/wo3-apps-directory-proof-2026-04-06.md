# WO-3 Apps Directory Proof

**Date:** 2026-04-06

## Catalog
- Featured: 4 apps (Deep Research, Precedent Intelligence, CMC Module, Biostatistics)
- Authoring: 6 apps (510(k), PMA, CER Generator, Safety Narrative, IND Authoring, Report Generator)
- Intelligence: 4 apps (Regulatory Intelligence, CSR Intelligence, Study Protocol Designer, Dossier Navigator)
- Specialist: 6 apps (eCTD Navigator, Document Vault, SOP Management, CAPA Management, Post-Market Surveillance, Inspection Readiness)
- Total: 20 apps

## Routing Verification
| App ID | Route Target | Mechanism |
|--------|-------------|-----------|
| deep-research | chats (deep-research mode) | setLayoutMode('chats') |
| precedent-intelligence | precedent-intelligence workspace | openWorkspaceView |
| cmc | section-workspace + editor | requireActiveProject + setRiViewMode |
| biostatistics | ana-biostats tool panel | setActiveToolPanel |
| 510k-workspace | /concept2cure/project/:id/510k | navigate() or openWorkspaceView fallback |
| pma-workspace | /concept2cure/project/:id/pma | navigate() or openWorkspaceView fallback |
| cer-generator | /concept2cure/project/:id/cer | navigate() or openWorkspaceView fallback |
| safety-narrative | safety-narrative workspace | openWorkspaceView |
| ind-authoring | section-workspace + editor | requireActiveProject + setRiViewMode |
| report-engine | report-engine workspace | openWorkspaceView |
| regulatory-intelligence | intelligence tool panel | setActiveToolPanel |
| csr-intelligence | csr-workflow workspace | openWorkspaceView |
| protocol-designer | protocol tool panel | setActiveToolPanel |
| dossier-navigator | dossier-map workspace | openWorkspaceView |
| ectd-navigator | ectd tool panel | setActiveToolPanel |
| document-vault | vault workspace | openWorkspaceView |
| sop-management | sop tool panel | setActiveToolPanel |
| capa-management | capa tool panel | setActiveToolPanel |
| post-market | pms tool panel | setActiveToolPanel |
| inspection-readiness | inspection tool panel | setActiveToolPanel |

## Design
- Stone palette only, zero non-stone colors
- Search across all categories (ignores active tab when searching)
- Category pill tabs: Featured (black active), Authoring, Intelligence, Specialist
- 2-column grid on desktop (`md:grid-cols-2`), 1-column on mobile
- No project selection blocker on browse — apps always browsable
- `openWorkspaceView` handles missing project (toast + project picker)
- Each app: 40px rounded icon box, label, 1-line description, hover chevron

## Color Audit
```
$ grep -n "blue-\|violet-\|indigo-\|cyan-\|teal-\|emerald-\|red-\|amber-\|green-" AppsPage.tsx
(no output — zero non-stone colors)
```

## What Changed
- `AppsPage.tsx`: Complete rewrite — from 7 apps in 3 track-aware groups to 20 apps in 4 clean categories
- `ZenApp.tsx`: onNavigate switch expanded from 7 cases to 20, all with verified route targets
- Removed: track-awareness sorting, "Select a project to launch apps" blocker, WorkspaceCanvas/PageTitleHeader wrappers
- Added: search across all categories, pill-style category tabs, 2-col grid, empty state
