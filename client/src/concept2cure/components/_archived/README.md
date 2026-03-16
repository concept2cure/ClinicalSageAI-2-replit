# Archived Components

Components moved here are **deprecated** and no longer part of the active UI flow.

## ProjectLauncher.tsx.deprecated

- **Removed**: 2026-03-12
- **Reason**: All project-selection paths now route directly to `regulatory-workspace` + `editor` mode. The intermediate launcher screen between project selection and document focus was eliminated to reduce navigation friction.
- **Replaced by**: Direct routing in `ZenApp.tsx` — project row click → `setLayoutMode('regulatory-workspace')` + `setRiViewMode('editor')`.
- **Safe to delete**: Yes. Zero live imports, zero reachable routes. Retained here for reference only.
