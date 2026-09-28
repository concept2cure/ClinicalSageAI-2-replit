# D2: a catalog toggle row that could not be created was never mentioned

**Row:** D2 (launch catalog working honestly). This is the operator-facing half
of the AnA client-files surface. **Workstream:** the AnA client-files lane.
**Date:** 2026-09-24.

## The defect

At boot, `bootstrapDocumentCatalogToggles` (`server/startup/document-catalog-bootstrap.ts`)
creates the two feature-toggle rows, `ana.document_catalog` and
`ana.vault_chunking`, then prints the one line an operator reads to find the
switch. Each creation was `.catch(() => undefined)`.

If the insert is refused but the store can still be read (a grant missing on
`feature_toggles`, for instance), both flags read "off". The line then says
"Turn it on globally by enabling the feature toggle rows above", but those rows
do not exist, and nothing anywhere says why. An operator following the
instruction finds nothing to enable.

## The fix

A failed creation now logs a warning, just before the startup line, naming the
key, the consequence ("there is no row to enable and the flag reads off until
one exists"), and the database's reason. Boot still does not stop; the flags
still fail closed.

## Evidence

| File | Result |
|---|---|
| `red/unit-bootstrap.txt` | 1 failed, 9 passed. With row creation refused and the store readable, nothing was logged: `expected '' to contain 'ana.document_catalog'`. |
| `green/unit-bootstrap.txt` | 10 passed. The warning names both keys and the refusal. |

ESLint for both files: 0 problems. The toggles themselves remain off; turning
them on is the founder's decision.
