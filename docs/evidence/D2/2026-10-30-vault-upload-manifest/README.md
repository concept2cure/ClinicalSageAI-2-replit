# D2: a manifest describes the files in the Vault upload list (Veeva gap 7, 2026-10-30)

`docs/design/VEEVA_GAP_2026-10-22.md` gap 7, "Absent: manifest/CSV mapping into Vault".

A team moving into the Vault brings its library and a spreadsheet that says what each file is: its title, its document type, where it is filed, its CTD section. Veeva's migration takes that spreadsheet as a field mapping. Here, each file's row in the upload list already carried every field the ingest accepts (gap 7.1). Describing 300 files still meant 300 rows of dropdowns, so a team either did that or uploaded everything as "Other" and Unfiled and sorted it out afterwards, one document at a time.

## What already exists

Searches run, in client, server and shared: `manifest`, `csv`, `CSV`, `parseCsv`, `csv-parse`, `Papa.parse`, `import`, `migration`, `field mapping`, `field-mapping`, `bulk import`, `legacy-importer`, `ImportPanel`. Deleted history (`git log --all --diff-filter=D` on `*anifest*` and `*mport*` under `client/src`) holds legacy import panels: `510k/DocumentImportPanel.jsx`, `ImportPanel.jsx`, `coauthor/ImportFromINDDialog.jsx`, `quality/ErpImportPanel.tsx`. They were outside the launch catalog, and none of them wrote to the Vault.

- **The upload list** (`client/src/concept2cure/v2/surfaces/VaultUploadStaging.tsx`, gap 7.1). One row per file, with its own title, document type, classification, folder, evidence kind and CTD section. Each row is sent with its own fields (`fieldsOf`), and the ingest validates every one. This change fills those rows. It sends nothing itself.
- **The vocabularies** the rows offer (`shared/constants/domain/vault-taxonomy.ts`): `VAULT_INGEST_DOCUMENT_TYPES` with their reader labels, `VAULT_CLASSIFICATIONS` with theirs, and `VAULT_DOC_KINDS`. The folders are the project view's own (`uploadFolders` in `Vault.tsx`). A manifest's values are matched against these same lists, so a manifest can set exactly what a row's dropdown can.
- **The legacy eCTD importer** (`legacy-importer/detector.ts`, `mdx-imports.ts`). It maps an eCTD folder tree to CTD sections, writes empty `concept2cure_artifacts` and not the Vault, and is refused in production. It is not a manifest and is not reused.
- **The Veeva field mapping** (`server/integrations/veeva-vault/field-mapping.ts`, unreachable). It translates our metadata into Veeva's fields for a push to Veeva, using document types that are not the ingest's. It is not reused.
- **A CSV parser:** `csv-parse` was already a dependency, used on the server. Its browser build parses the manifest here. **The download primitive:** `client/src/concept2cure/v2/download.ts`.
- **Nothing read a manifest** anywhere in the client or the Vault routes.

## What changed

| Piece | Where |
|---|---|
| `parseManifest`, `applyManifest`, `manifestOf` and `manifestNote`. These are the rules, and the evidence below tests each one.<ul><li>**Headings and values:** columns are read by heading, in any order or case. Values are matched by the Vault's code or the reader's name.</li><li>**Blank cells:** a blank cell leaves the field as it is.</li><li>**Matching:** a line names its file by its path in the list, or by its name when only one file has it.</li><li>**Refusals:** any unknown value refuses its whole line, as does a second line for the same file. An unknown column refuses the whole manifest.</li><li>**Download:** the list is written as a CSV of its current fields. A cell that a spreadsheet would run as a formula is guarded with an apostrophe, and read back as written.</li></ul> | `client/src/concept2cure/v2/surfaces/vaultUploadManifest.ts` (new) |
| "Download this list as a manifest" and "Apply a manifest…" in the upload list, with one note saying what was applied, which lines were not and why, and which files no line named. | `client/src/concept2cure/v2/surfaces/VaultUploadManifestControls.tsx` (new), `VaultUploadStaging.tsx` |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | Before the change, the upload list offers no manifest, and the manifest module does not exist. |
| `02-green.txt` | <ul><li>**The rules and the panel against the real Vault surface:** 16 of 16. Once a manifest is applied, the rows show its fields, nothing is sent, and Upload sends each file's own fields. A line the Vault cannot take leaves its row unchanged. An unknown column changes nothing. The list downloads as a manifest that reads back to the same fields.</li><li>**The Vault client suites, the upload hook, drop zone, intake formats, eTMF, the filing path and AnA's screen drives:** 547 of 547 across 63 files.</li><li>**Type check:** `tsc` exits 0.</li><li>**Lint ratchet:** unchanged.</li></ul> |
| `03-mutation.txt` | Nine mutations, each caught:<ul><li>an unknown column ignored;</li><li>a bad value skipped while the rest of its line applies;</li><li>a blank cell clearing its field;</li><li>a formula cell written unguarded;</li><li>a name two files share going to the first;</li><li>a second line for one file applied;</li><li>a recorded file changed;</li><li>a CTD section taken without a folder;</li><li>a refusal said as a status, not an alert.</li></ul> |

## Decisions recorded here

- **A line is applied whole or not at all.** A file uploaded with its title from the manifest and its folder missing looks described, and is not. A refused line leaves the row as it was, and the note names the line and the reason.
- **An unknown column refuses the manifest.** A misspelt "Folder" heading, silently ignored, would leave every file Unfiled, with no sign the column was there.
- **Applying sends nothing.** The manifest fills the rows, and the person sees what will be recorded and uploads it. Every value still passes the ingest's own validation, and each upload is recorded and audited exactly as one described by hand.
- **CSV, not .xlsx.** Every spreadsheet tool saves CSV, and the downloaded manifest opens in all of them. Reading .xlsx in the browser would add a large parser for no field the CSV cannot carry.
- **Formula cells are guarded both ways.** File names and titles come from people's files. A cell beginning `=`, `+`, `-` or `@` is written with a leading apostrophe, so a spreadsheet shows it as text rather than running it. The apostrophe is removed when the manifest is read back.

## Not done here

- The other two items of gap 7: connector import into the Vault, and saved views. The saved views' owner and store are a founder decision.
- A version column. A new document is recorded as 1.0, and later versions are added to a document, not named in a manifest.
