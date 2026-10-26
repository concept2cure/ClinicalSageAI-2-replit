# Exact saved-study CRF working copies

Local/Codespaces automated qualification only. Root owns canonical publication and global gates. No live provider, patient data, agency call, EDC or deployment was used.

## What already exists

The existing `rowsToStudyDesign` parser reads the saved `c2c.studyDesign.v1` object, and `projectCrfShell` deterministically produces blank forms/items, visits, origins, CDASH hints and gaps. The existing source-import route, canonical authoring writer and workflow import machinery already own current project admission, explicit organization-source association, preview/fingerprint, transactional revalidation, working-copy reuse/recovery, revision/audit/span provenance and release governance. This increment reaches that same editor path for a saved study; it adds no endpoint, parser, editor, patient collection store or migration. The approved design records current/deleted discovery and scope.

## Product contract

- Source identity is `{kind:'study-design-crf', studyId:string}`. The shared normalizer trims study IDs, bounds them to the saved PRM column's 100 characters and rejects ASCII control characters. Direct materialization and saved-origin validation require the canonical normalized identity.
- The caller first admits its target. The adapter locks a tenant-filtered saved-study header, then reads current active actor membership and verifies the recorded source program, unique anchor, current project access and target match before selecting the full saved row, parsing or projecting content. Organization sources require the existing explicit association reason when copied. Malformed/conflicting recorded identity or scope fails closed.
- The preview fingerprint covers the entire saved SQL row and complete projection, scope, sections, section hashes and gaps. Creation freshly materializes on the canonical writer transaction, so even non-projected source changes invalidate the preview. Reopening and governance retain the new source kind through the existing verifier and earliest CREATE receipt.
- Identification/limitations and gaps precede one editable section per projected form, with stable local codes. Every projected item, type, visit, CDASH hint, units, origin, source activity/endpoint, note and placeholder flag is represented. Dynamic values use the existing `plainTextToHtml`, preserving literal angle brackets and line breaks as text. Hashes identify these escaped source section bytes; the existing writer records its actual stored representation independently.
- Origin authorship remains `unknown`, model null and model evidence unrecorded. This is a blank design/specification working copy; no completed patient record, signed page, observed value, validated CDASH mapping, SDTM annotation, collection readiness or EDC deployability is inferred.

## Evidence

- `http/red.json`, `red.log.gz`, `source-freeze-red.json` and `red-test.ts.gz`: actual existing HTTP behavior before production edits. A real authenticated, currently admitted preview returned 400 `SOURCE_REQUIRED` instead of 200. Earlier role/reason fixture setup epochs are preserved separately and are explicitly not product RED.
- `http/final-green.json`, `final-lint.json` and raw gzip output: 27 actual HTTP/service boundary cases pass and the new fixture passes strict lint with zero warnings/errors. Both receipts have empty source drift. Initial/second passing epochs with concurrent source refactor drift are retained truthfully; only these final no-drift receipts qualify the final source. The HTTP source freeze includes its actual reader/writer/parser/projector closure, with archived source snapshots.
- `related-regressions.json` and gzip raw output: existing workflow materialization, retained import governance and deterministic CRF projection tests; 3 suites/69 tests passed, source drift empty.
- `production-lint.json` and gzip raw output: all six changed production files pass strict ESLint with zero warnings/errors, source drift empty.
- `source-freeze.json`: exact changed source and reused parser/projector/plain-text plus related fixture hashes. The copied `run-check.py` roots at this repository and records actual command, Node version, source hashes before/after, exit code and raw output hash.

The HTTP fixture uses real JWT, current membership/project policy, canonical authoring migrations, actual parser/projection/import/writer and PGlite SQL. Its saved-study table is an explicit minimal source fixture, not a proof of all production PRM migrations. Tests do not establish multi-connection race behavior, human usability, scientific/clinical/statistical correctness, standards certification or regulatory acceptance. Human testing remains Not run.
