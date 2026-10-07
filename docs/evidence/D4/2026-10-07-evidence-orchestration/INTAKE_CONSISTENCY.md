# D4 — canonical intake consistency

Date: 2026-10-07. Workstream: launch validation, existing Projects / Vault intake.
Base: `16bbf5b070ecfc186d7addaa1b6b96e384d6fe87`; branch: `concept2cure-v2`.
No dependency, route, model, integration, data store, or automatic filing added.

## Production change and interpretation

`shared/constants/document-intake-formats.ts` now declares candidate extensions
separately from canonical text-extraction strategy, byte-check support, and
limitations. Shared candidates drive `useChatUpload`, project/home/chat pickers,
`useVaultUpload` callers, and the Vault multipart receiver. The chat server's
existing broader allowlist is unchanged; this does not claim every type its
generic allowlist admits is extractable or offered by these pickers.

| Format | Project/chat candidates | Vault candidates | Canonical content handling |
| --- | --- | --- | --- |
| PDF | Yes, 25 MB | Yes, 50 MB | Existing text layer; thin-text OCR recovery; failure remains honest |
| DOCX | Yes | Yes | Existing Mammoth raw-text extraction |
| XLSX | Now reachable consistently | Retained | Existing ExcelJS all-sheet text representation; not scientific dataset mapping or formula recalculation |
| CSV / TSV / JSON / XML | Now reachable consistently | CSV retained; TSV/JSON/XML added | Raw UTF-8 source text only; no clinical/CDISC schema, subject, unit, or analysis-ready validation |
| TXT / Markdown | Yes | Yes | Raw UTF-8 text |
| PNG / JPG / JPEG / GIF | Retained | Now admitted | Existing OCR dispatcher, subject to engine/language availability and readability |
| Legacy DOC / XLS | Legacy candidates retained, including landing's XLS declaration | Retained | No canonical binary DOC/XLS text parser; extraction method `none` |
| RTF | Not newly enabled | Retained | Existing raw text/RTF markup handling; not an RTF parser |
| WebP | Existing candidate declaration retained | Not enabled | OCR classifier exists, but current byte verifier refuses WebP MIME; not an end-to-end supported upload |

The canonical extractor now recognizes application JSON/XML MIME and XML/TSV
filename fallbacks as raw UTF-8 text. JSON/XML are not parsed or scientifically
validated; preserving the source representation does not qualify it for an
analysis. Non-UTF-8 encoded source fidelity is not qualified by this change.

The existing safety helper already checks JSON/XML/TSV byte shape. Its name/type
bindings now also require compatible text MIME declarations for these three
extensions, rejecting a PDF masquerading under those names before scan/storage.
PNG/JPEG/GIF use the existing signature checks. WebP/TIFF/BMP signature support
was not added or bypassed.

Server scanner policy, organization/program checks, editor role requirement,
tenant-scope re-entry, 25 MB chat / 50 MB Vault limits, extraction-failure
outcomes, governed storage/audit/catalog transaction, and explicit filing are
unchanged. A source uploaded to a project/chat is not automatically a Vault
document or catalog entry: the existing explicit filing/capture bridge still
owns that transition, subject to catalog/chunking feature flags.

## Red before production change

The five-file focused command below ran before any production edit, after
correcting two test assertions to the existing service argument shape:

```sh
npx vitest run client/src/concept2cure/v2/__tests__/documentIntakeFormats.test.ts client/src/concept2cure/v2/__tests__/anaRailAttach.test.tsx server/services/ocr/__tests__/documentIntake.test.ts server/routes/__tests__/vault-ingest-refusal-status.test.ts server/utils/__tests__/fileSignature.test.ts --reporter=dot
```

Result: **25 failed, 56 passed, 5 failed files**. Failures demonstrated:

- Chat picker/validation omitted CSV/XLSX/JSON/XML/TSV/Markdown.
- Extractor returned `none` for MIME-only JSON/XML and generic-MIME XML/TSV.
- Real Vault multipart receiver refused JSON/XML/TSV and PNG/JPEG/GIF.
- Name/type binding accepted PDF declarations under JSON/XML/TSV names.

Existing XLSX/CSV receiver controls, actual XLSX extraction, legacy no-parser
behavior, OCR routing/failure, and prior safety/refusal controls passed.

## Green and bounded verification

The same five-file command after the fix passed **86 tests / 5 files** (five
additional byte-shape controls were added). The expanded command additionally
checks real rendered Project Home/Vault pickers, real chat multipart extraction,
existing Vault-hook authentication/filing copy, and existing scanner controls:

```sh
npx vitest run client/src/concept2cure/v2/__tests__/documentIntakeFormats.test.ts client/src/concept2cure/v2/__tests__/anaRailAttach.test.tsx client/src/concept2cure/v2/__tests__/vaultSurface.test.tsx client/src/concept2cure/v2/__tests__/projectHomeDataRoom.test.tsx client/src/concept2cure/v2/__tests__/useVaultUpload.test.tsx server/services/ocr/__tests__/documentIntake.test.ts server/routes/__tests__/vault-ingest-refusal-status.test.ts server/routes/__tests__/chat-upload-safety.test.ts server/utils/__tests__/fileSignature.test.ts server/middleware/__tests__/uploadSafety.test.ts --reporter=dot
```

Expanded initial result: **158 passed / 10 files**. Final expanded result:
**159 passed / 10 files**, including the new real multipart refusal above the
unchanged 50 MB Vault limit (25.87 seconds).

Changed-file ESLint with `--no-ignore`: **0 errors, 31 warnings**. Warnings are
existing large-surface complexity/length and unused declarations; the changed
extractor has no complexity warning. Standalone shared-contract check:

```sh
npx tsc --noEmit --skipLibCheck --target ES2022 --moduleResolution bundler --module esnext shared/constants/document-intake-formats.ts
git diff --check
```

Both commands exited 0. This is not a claim of full application typecheck or
production build; the control tower owns combined release gates/publication.

## Test boundaries and remaining qualification

- XLSX extraction uses a real generated ExcelJS workbook and canonical
  `extractDocumentText`; raw-text tests preserve subject identifiers and zero
  values as source text, not a normalized clinical dataset.
- The rendered AnA rail uploads actual File/FormData with project identity;
  fetch is mocked. Project Home/Vault picker checks use mocked reads.
- The real Express Vault multipart receiver calls a mocked ingest service;
  it proves admission/dispatch and unchanged caller/program arguments, not
  full stored-file or catalog persistence for every format.
- Real chat multipart tests use canonical safety/extraction but mocked storage,
  database, and virus-scan responses. Spoofed names are refused before those
  writes. Existing safety tests use a local mock ClamAV protocol server and
  verify production unavailable/incomplete/positive-scan refusals.
- Image tests spy on the existing OCR service to prove dispatch, confidence
  propagation, and honest `none` on failure. They do not qualify real OCR
  accuracy, all scanner limits, Japanese language, or live provider deployment.
- No connected EDC/eTMF/FHIR capture, inbound SFTP, watched cloud folder,
  ZIP ingestion, raw XPT/SAS reader, or study dataset mapping was created.
  Scientific curation, analysis selection, source-purpose limitations, human
  review, and jurisdiction-specific regulatory release remain separate gates.

## Owned changes

- `shared/constants/document-intake-formats.ts`
- `client/src/concept2cure/hooks/useChatUpload.ts`
- `client/src/concept2cure/v2/useVaultUpload.ts`
- `client/src/concept2cure/v2/surfaces/Surfaces.tsx`
- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`
- `client/src/concept2cure/v2/surfaces/Vault.tsx`
- `client/src/concept2cure/mdx/surfaces/VaultSurface.tsx`
- `client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx`
- `server/routes/vault-ingest.ts`
- `server/services/ocr/extractDocumentText.ts`
- `server/utils/fileSignature.ts` (control-tower-approved bounded text bindings)
- Eight focused test files named above, excluding unchanged
  `useVaultUpload.test.tsx` / `uploadSafety.test.ts` regression suites.
- This evidence document. No worker commit or push.

## Follow-up — CSV field fidelity through structured reading and editing

The approved follow-up changes only
`server/services/documentIntelligence/spreadsheetService.ts`, its existing
`__tests__/spreadsheetService.test.ts`, and this evidence. The existing installed
ExcelJS implementation (`node_modules/exceljs/lib/csv/csv.js`) defaults to
number/date/boolean/error inference in its CSV `map`. Its existing
`CsvReadOptions.map` API allows explicit preservation of decoded field strings;
no dependency, parsing engine, or scientific schema was added.

Actual canonical `readWorksheet`, `workbookToText`, and
`applyWorkbookEdits` → XLSX → `readWorksheet` demonstrated this defect before the
production change:

| Source field | Pre-fix read/edited output |
| --- | --- |
| `00123` subject ID | Numeric `123` |
| `000045` lot ID | Numeric `45` |
| `123456789012345678901234` long ID | Rounded `1.2345678901234569e+23` |
| `2026-01-02` date-looking label | Timezone-adjusted ISO timestamp |
| `0` | Numeric zero, not original field text |
| `1e-05` | Numeric `0.00001`, losing the field representation |
| `true` | Boolean rather than field text |
| Empty field | `null` rather than empty string |

Quoted commas/escaped quotes and a formula-looking string were controls. The
regression also checks that `#N/A` remains literal source text rather than an
Excel error cell. All three new regressions failed while all 17 existing tests
passed:

```sh
npx vitest run server/services/documentIntelligence/__tests__/spreadsheetService.test.ts --reporter=dot
```

Production now supplies the existing CSV reader an identity string map.
Decoded CSV cell values remain strings, including zero, notation, labels,
identifiers, boolean/error/formula-looking text, and empty fields. Quoting is
handled by the existing CSV parser; this is logical field fidelity, not a
promise to reproduce identical CSV delimiter/quote syntax. Original source
bytes remain unchanged; edits return a new XLSX buffer.

XLSX loading and stored cell types are unchanged. An explicitly supplied
numeric edit still writes a number; an explicitly supplied formula remains a
formula with no recalculated result. CSV inputs are still promoted to XLSX on
save. The earlier CSV test expecting inferred numeric dose `2.4` was deliberately
corrected to the source string `"2.4"`: scientific type, missingness, date, unit,
and analysis mapping must be deliberate, not guessed during receipt/read/edit.
The direct CSV UTF-8 extraction path already preserved source text and is
unchanged by this follow-up. Tool descriptions are coordinated separately by
the control tower to state the raw-field and deliberate-mapping limitations.

Final follow-up commands:

```sh
npx vitest run server/services/documentIntelligence/__tests__/spreadsheetService.test.ts server/services/ocr/__tests__/documentIntake.test.ts --reporter=dot
npx eslint server/services/documentIntelligence/spreadsheetService.ts server/services/documentIntelligence/__tests__/spreadsheetService.test.ts
git diff --check
```

Results: **38 tests passed / 2 files**; ESLint **0 errors, 2 existing warnings**;
`git diff --check` exit 0. These are actual in-memory CSV/XLSX read/edit/save
checks, not mocked reader results. They do not validate clinical schemas,
units, mappings, statistical suitability, recalculation, live project capture,
or agency-ready datasets. The control tower still owns combined release checks.
