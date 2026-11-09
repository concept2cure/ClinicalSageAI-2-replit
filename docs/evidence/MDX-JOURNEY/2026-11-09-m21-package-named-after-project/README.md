# MDX M21: a device package is named after its project

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md`, M21, recorded on the PMA walk
(`../2026-11-02-slice-5b-pma-ivdr-walked/`). Plan: F1.

## The defect

The server names the draft package's ZIP, its combined PDF and DOCX, and the official eSTAR PDF from `meta.id`
(`server/routes/510k-estar-routes.ts`). `useEstarExport` sent the kit program's `code`. `useMdxPrograms` derives that
code from class and type ("Class II · 510k", "pma"), so the walks downloaded `pma_pma-content-package-draft.zip` and
`Class_II_510k_content-package-draft.zip`. No project was named in the file name, and two projects' packages shared one
name.

## What already exists (RULE 3)

- The project's own name is the kit program's `title` (`productName` or `name`), which `useEstarExport`'s callers
  already pass: `K510Surface`, `PmaSurface` and `OfficialEstarPanel`.
- The server resolves the project by `meta.ident`, the project id, and already sanitises `meta.id` for file names.

## The change

`packageName(program)` in `mdx/hooks/useEstarExport.ts` sends the title, or failing it the code, or failing that the
id. Both the draft package and the official eSTAR use it. `meta.ident` is unchanged.

## Verified

| Check | Before | After |
|---|---|---|
| `mdx/hooks/__tests__/useEstarExport.packageName.test.ts` (draft package, official eSTAR, fallback) | 2 of 3 failed (`red/package-name-before.txt`) | 3 passed |
| Every `mdx/hooks` and `mdx/surfaces` suite | — | 72 files, 795 tests (`green/package-name-after.txt`) |
| The running app, the demo's seeded NeuroPanel-Dx: the home filing's editing copy created (201), B1 started (201) and saved with a reason (200), then Export 510(k) package | `Class_II_510k_content-package-draft.zip` in the slice 5 walk | 200, the filing compared, `_Demo_MDX_NeuroPanel-Dx_510_k__content-package-draft.zip` (`runs/demo-neuropanel-*.json`) |

The seeded project's export answered 422 `NO_AUTHORED_CONTENT` before B1 was written. The demo pack authors its
510(k) documents unbound to the project's filing, so the filing holds no section. That is recorded for the pack, after
the demo of 2026-11-09.
