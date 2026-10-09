# D4: AnA was told every uploaded Vault file was "0% complete"

**Row:** D4 (Validation package), Vault honest state. **Workstream:** the AnA
client-files lane. **Date:** 2026-09-24. **Source:** handed to this lane by the
vault re-baseline (`docs/work-orders/README.md` → `…01DiJJAk`: "AnA's Vault
screen context reports uploaded files as '0% complete' (the surface itself was
fixed to show no percentage, `28324fdf`)").

## The defect

An uploaded file has no authoring completion. It is a file, not a rule-pack
section being written. `uploadLeaf` (`server/routes/c2c/project-vault.ts`) set
`pct: 0` for it, with the comment "0 rather than a fabricated figure". But 0 is
itself a figure. The Vault surface does not render `pct`. It passes the selected
document to AnA as `facts.selected.percentComplete`, so AnA described every
uploaded file, a signed CoA or a final protocol included, as 0% complete. The
two search-hit mappers (`searchHitToDoc` in `Vault.tsx`, `hitToDoc` in
`ProjectFilesPanel.tsx`) did the same.

## The fix

- `VaultDoc.pct` is `number | null` on the server and on the client
  (`client/src/concept2cure/v2/fixtures/vault-data.ts`). An upload is `null`:
  not applicable. Authored sections and documents keep their completion.
- The published context says `percentComplete: null` for an upload, **even when
  the server still sends 0**. During a rolling deploy the client can meet a
  server that has not caught up, and a 0 from it is still not a figure.

Nothing on the server reads `percentComplete`, and no Vault code aggregates
`pct` across a folder, so a null does not change any total.

## Evidence

| File | Result |
|---|---|
| `red/unit-vault-upload-completion.txt` | 2 failed. `project-vault-cabinet` (an upload leaf's `pct` is 0, expected null); `vaultSurface` (the context AnA receives for the auto-selected upload, read through `useActiveSurfaceContext('vault')`, carries `percentComplete: 0`). |
| `green/unit-vault-upload-completion.txt` | 944 passed across 95 files: every `server/routes/c2c` test, the Vault surface, its status vocabulary, the editor panel and the MDX data suites. |

Typecheck: 0 errors. ESLint is unchanged against HEAD for every changed file.

## Not done here

`hitToDoc` in `ProjectFilesPanel.tsx` duplicates `searchHitToDoc` in
`Vault.tsx`. Only its upload value was changed here. Merging the two into one
mapper is a separate change.
