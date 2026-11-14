# Reach retained archived projects from the existing portfolio

Plan: F1. Continue the current project-management and Codespaces demo work; no new screen, route, service, table or tool.

## What already exists

- `client/src/concept2cure/v2/surfaces/ProjectsArchived.tsx` reads the admitted portfolio with `includeArchived=true`, preserving client/workstream/pathway filters, and offers governed Restore. Each archived title is a span; there is no opening action.
- `Projects.tsx::openProj` already accepts a server row's id/title and optional code/workstream/status, then calls `shellProject.ts::openProjectHome`. Active cards, lists and the existing AnA project action use this one opening path.
- `server/routes/c2c/projects.ts` already retains direct project reads after archival; the existing Vault routes keep admitted document reads/downloads. Restore is a separate audited state change, not required merely to read a retained record.
- `p122ProjectsRestoreArchived.test.tsx` already covers listing, scoped reads, Restore confirmation, refusals and uncertain outcomes. `styles/project-home-v2.css` already gives archived rows a wrapping flex layout and the shared quiet button styles exist.
- The newly seeded internal handover stays active for presentation because this opening path was absent. Its seed and lifecycle remain unchanged in this repair.
- The older coordination finding about Quality records displayed as files is already fixed in `ProjectHome.tsx`, the catalog and the server's source order; it is not being rebuilt.

Searches covered archived project navigation, portfolio rows, the shared shell opening helper, retained project/Vault reads and current P-122/D3 instructions. Deleted-history search over archived surface names found no alternative opening owner. The coordination record explicitly marks the old project-page hold stale/released.

## Completion contract

Pass the existing `openProj` callback to the archived list and offer a semantic quiet Open action using the actual admitted server row. Carry its archived status and available code/workstream into the existing project home. Opening sends no lifecycle mutation and does not show or submit Restore confirmation. Preserve the current Restore ceremony and client filters, and keep unavailable reads unavailable. Use existing row/button styles; no shared stylesheet change.

Verify navigation/status and zero mutations in the existing behavioral suite, preserve restore/refusal coverage, and walk the real archived project into its retained Vault documents without restoring it. Capture the actual source and runtime observations before direct canonical publication under normal gates.

## Verification

- New behavior failed before the repair; **8/8 archived-project tests** and **26/26 related archived/filter/shell tests** pass with zero skips. Restore confirmation, refusal, uncertain outcomes and client filtering retain their existing assertions.
- Explicit lint reports zero errors. The small archived component and test have zero warnings; the large existing Projects owner retains its six prior warnings. Production build completed successfully.
- Chromium authenticated as the actual demo author, archived only the known synthetic internal-handover fixture through the admitted project API, selected its sponsor filter, and used the new Open control. The existing shell carried its actual id and `archived` status. Its Vault folder exported while the project stayed archived; opening sent no archive/restore request. The existing governed Restore dialog then returned this demonstration fixture to active. No page errors, no provider calls.
- The browser used the existing Codespace-image rehearsal application with the changed frontend files overlaid. This is not hosted GitHub Codespaces access or a final-HEAD backend stamp. The retained ZIP/screenshots/receipt and `source-sha256.json` bind what was tested.

AnA's archived-list description now names the same opening action. No new tool or model was introduced. The portfolio seed still leaves its internal handover active for presentation; an operator can archive it later and read it from Archived projects without first restoring it.
