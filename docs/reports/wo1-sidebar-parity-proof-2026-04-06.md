# WO-1 Sidebar Parity Proof

**Date:** 2026-04-06
**Target:** ChatGPT sidebar parity

## What Was Removed
- WORKSPACE section (lines 1181-1223) containing:
  - Tools (NavItem → `nav.documents`)
  - Editor (NavItem → `nav['submission-builder']`)
  - Intelligence (NavItem → `nav['ri-copilot']`)
  - Review & Verify (NavItem → `nav.review`)
  - References (NavItem → `nav.vault`)
  - Submit & Export (NavItem → `nav.submit`)
- Border divider preceding the WORKSPACE section

## What Remains
- Zone A: + New (dropdown with New Chat / New Project / New Artifact), Search
- Zone B: Chats, Projects, Communication Center, Apps, Settings (5 primary destinations)
- Active Project Context: Project name + submission type badge (only when project is active)
- Zone C: Project search input, Pinned Projects group, Recent Projects group, General Conversations group
- Zone D: User avatar + name + email footer

## Where Removed Functionality Is Still Reachable
| Removed Item | Still Reachable Via |
|---|---|
| Tools | Apps page, project workspace context |
| Editor | Opens from artifacts/documents within projects |
| Intelligence | Communication Center, chat @mentions, AnA slash commands |
| Review & Verify | Communication Center, project workspace |
| References | Project workspace vault tab |
| Submit & Export | Communication Center, project workspace |

## Dead Code Cleaned
- Nav handlers removed from `nav` useMemo: `submission-builder`, `tools`, `submit`, `documents`, `ri-copilot`, `review`, `vault`
- Unused icon imports removed: `Wrench`, `Brain`, `ShieldCheck`, `Send`
- Retained nav handlers still needed elsewhere: `project-home`, `overview`, `task-board`
- Retained icon imports used in context menus: `PenLine`, `Archive`

## Project Context Tabs
- No project-specific tabs (Overview, Tasks, Tools, Submit) exist in the sidebar
- Active project section only shows project name + submission type badge — acceptable ChatGPT-like pattern

## Grep Confirmation
```
$ grep -n '"Tools"\|"Editor"\|"Intelligence"\|"Review & Verify"\|"References"\|"Submit & Export"\|"Workspace"\|"Documents"' ZenSidebar.tsx
(no output — all forbidden items removed)
```

## Registry Updated
- `config/ui-surface-registry.json` → `ZenSidebar.tsx` entry updated with `workspaceSectionRemoved` field
