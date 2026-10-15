# D2 — a SAS transport or Dataset-JSON file enters the Data Room as a clinical dataset

**Founder decision:** 2026-10-15, "Do it all", on the design doc's §6
(`docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md`). This slice
takes the intake half of §6: reading the dataset formats FDA's Study Data
Technical Conformance Guide requires (SAS XPORT v5) and the one it is piloting
(CDISC Dataset-JSON). `m5/datasets` packaging and `.zip` intake stay open.

## Before

- `.xpt` was refused at the client (`validateUploadFile` → "Unsupported"), at
  the server allowlist and at the signature check, which had no rule for it.
- Had one arrived, extraction had no reader: "No text could be read".
- A Dataset-JSON `.json` was admitted but profiled as nothing, and `.ndjson`
  was refused.

## After

| Layer | Change |
|---|---|
| Reader | `server/services/clinical-regulatory-evidence/xpt-structure.ts` reads v5 header records only: each dataset's name, label, variables (name, label, type, length, format) and the record count, not counting the last record's blank padding. No observation is decoded. v8 is declined by name; a truncated file is `MALFORMED`, not thrown. |
| Reader | `dataset-json-structure.ts` reads v1.1 JSON, v1.1 NDJSON and v1.0 (`clinicalData`/`referenceData`). A `.json` that is none of these is `NOT_DATASET_JSON`: most `.json` uploads are not datasets. |
| Profile | `dataset-profile.ts` adds the `xpt` and `dataset-json` formats. CDISC standard and domain are read from variable names, as for CSV. A numeric with a date format is typed `date`. |
| Text | `extractDocumentText.ts` gives an `.xpt` its structure as text (`xpt-structure` method), so the Data Room search finds it by a variable's label. |
| Admission | `fileSignature.ts`: `.xpt` is checked against the transport header whether it is declared `application/x-sas-xport` or `application/octet-stream` (as browsers send it). `signatureTypeFor` binds the check to the name, so an octet-stream `.xpt` cannot skip it. `.ndjson` is bound to text types. The allowlist and `document-intake-formats.ts` admit both. `.sas7bdat` stays refused. |

**Structure only:** a listing holds subject-level data. Neither the text nor
the profile carries a row value. The dbtest asserts this on a subject id.

## Files

- `01-red.txt`: the tests kept and the source reverted, at `64ab7dc4c`.
  - The profile, admission and client-validation assertions fail.
  - On real PostgreSQL the adopted `.xpt` ends `failed`, search does not find it, and the Dataset-JSON file has no profile.
  - The two reader suites fail at import: their modules do not exist.
- `02-green-unit.txt`: 108/108 across the readers, profile, signature, OCR and the client intake contract.
- `03-green-real-pg.txt`: `tests/db/clinical-dataset-intake.dbtest.ts` and this lane's Data Room dbtests, 9/9. They run through the real projects router, behind the request tenant scope, as `app_service` with `RLS_ENFORCE=on`.

## Gates

- `tsc --noEmit`: clean.
- ESLint ratchet `--since origin/concept2cure-v2`: no file changed its warning count.
- `ci:sql-interpolation`, `ci:upload-guards`, `audit:repo-health:ceiling` (114): pass.

## Contract change, stated

`documentIntakeFormats.test.ts` used `subjects.xpt` as its "unsupported"
example. It now uses `subjects.sas7bdat`, which is still refused, and asserts
that `ae.xpt` is admitted.

## Open

- `m5/datasets` leaf packaging (FDA rejection criteria 1734/1736). This changes what D7 proves; the packager admits PDF leaves only today.
- `.zip` intake, which needs bounds, a compression-ratio limit, path-traversal refusal, and one capture per entry.
