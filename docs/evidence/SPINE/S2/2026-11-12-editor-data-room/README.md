# The editor's Data room, 2026-11-12 (GA walk of what the catalog feeds)

Walked at trunk head as Ana Author: the CDISC pilot CSR document opened from the project's Author step, then
More → Vault → Data room, and the CSR's "Build from the study's data".

## What already exists (RULE 3)

| Path | What it does |
|---|---|
| `client/src/concept2cure/v2/editor/ProjectFilesPanel.tsx` | The editor's Vault panel: lanes Vault, Data room, IND documents |
| `client/src/concept2cure/v2/editor/DataRoomSourcesPanel.tsx` | The Data room lane (the same panel as Vault → Data catalog), given the editor's read owner |
| `client/src/concept2cure/v2/dataConnect.tsx` (`useLiveData`) | A read sends only while its owner says the view is current |

## Found and fixed: the Data room lane stayed on "Loading project sources…"

Opening the lane sent the project's read once, cancelled it, and never sent it again (`before-stuck-loading.png`;
the server answers that read in half a second). Switching to "All my projects" and back made it load.

In development React mounts a component, unmounts it and mounts it again. The panel kept a "still mounted" flag in a
passive effect; its list asks that flag in its own passive effect, and a child's effects run before its parent's. So
on the second mount the list saw "not mounted", sent nothing, and nothing asked again. A production build does not
double-mount, so it was not affected; **every Codespace is**, because a Codespace runs the development server, and
that is where the product is demonstrated.

The flag is now set in a layout effect, which runs before any passive effect. `dataRoomSourceReads.test.tsx` renders
the panel in `React.StrictMode` with a read owner: it fails without the change ("Loading project sources…" for good)
and passes with it.

After (`after-this-project.png`, `after-all-my-projects.png`): the lane answers in 0.8 s with the project's 25
sources; All my projects lists 50 captures and 19 Vault documents under their folders; back to This project and
Refresh both load. The CSR's study-data chooser lists the frozen study bundle. No API response ≥ 400, no console error.

## Seen, not mine to change

- The same flag pattern (`mounted.current = true` in a passive effect) is in 18 other files. It only bites where a
  child's read asks the parent's flag on mount; `editor/ProjectFilesPanel.tsx:494` is the nearest (its Vault lane
  loaded in this walk). Listed for their lanes in COORDINATION.md.
- The CDISC pilot project's own Data room ("This project", and the project page's Evidence step) lists 25 Quality
  records and none of the study's seven files, which are in its Vault. The catalog ("All my projects", and the
  Evidence step's "Open the data catalog") lists them. Whether the project's own room should list its Vault documents
  too is the project-page lane's call for the Evidence step; sent to it.
