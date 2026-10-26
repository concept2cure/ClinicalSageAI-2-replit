# Retain recorded CRF safety assessments

W1 / D2. Completes the existing deterministic projector and its reachable saved-study import. No new owner, route, editor, UI, model, schema or dependency.

## What already exists

- `server/services/study-design/crf-shell.ts` projects the saved design into blank forms. Its assessment loop previously omitted every activity categorized `safety`, assuming the generic adverse-events scaffold collected it. The same loop already derives linked endpoint items and explicit unlinked-field placeholders.
- `server/services/authoring/study-design-crf-source.ts` admits the exact saved study and materializes that same projection into editable sections with fingerprint and provenance checks. Production code in that adapter is unchanged.
- `server/routes/__tests__/authoringCrfSourceImport.pglite.integration.test.ts` exercises real JWT/HTTP, saved-source admission and canonical authoring writes against isolated PGlite. The current project/protocol projection already reaches SourceImportDialog and the sole editor.
- `server/services/study-design/__tests__/crf-shell.test.ts` documented blanket safety omission. Its ECG placeholder example classified ECG as efficacy; the added cases use the actual safety category. Matching server/client/shared and deleted-name history searches found no other current CRF projector.

## Correction and independently expected outcomes

Remove only `safety` from the standard-covered category set. Each recorded safety activity now passes through the existing assessment loop with its identity, endpoint links and ordered visits. Unknown fields remain explicit placeholders and gaps. Eligibility and administrative behavior remains unchanged. The separate generic AE scaffold remains; a same-name recorded activity is not guessed equivalent or deduplicated.

The unit cases independently expect a QTc endpoint field and visits, laboratory/vital-sign placeholder fields and gaps, and a same-name recorded safety activity distinct from the generic AE scaffold. The route case independently expects those three named forms, source activity IDs, visit names, field types and source derivations. It checks preview titles/hashes/gaps without writes; actual fields after create and reopen; matching persisted revision/source fingerprints; and source-ECG changes refusing stale creation/reuse without altering retained editor sections. These expected fields are not computed by calling the projector under test.

The earlier safety-omission assertion and fixture count assertions are explicitly corrected: the original fixture now retains its recorded adverse-event-review activity as well as generic AE, so it has seven forms, five design-derived forms and six visit-scheduled forms. Original sources and assertions are retained in `original-*.gz`.

## Recorded qualification

- `red.json` / `red.log.gz`: actual prepatch production, four failures and41 passes across two suites, no drift. Three unit failures are missing safety forms. The real HTTP preview also lacks `S_ECG`'s named safety form. `prepatch-source.json` and `red-source-*.gz` pin those sources and tests.
- `green.json` / `green.log.gz`: initial production correction,44 passes and one fixture-calibration failure, no drift. The preview contract returns only code/title/hash, so expecting preview content was invalid. This does not invalidate the earlier missing-form RED. The corrected fixture checks the actual preview contract, then fields on create/reopen.
- `green-corrected.json`:45/45 pass across two suites, no drift. A later test-only clone spelling correction removes an ESLint global warning; final qualification is retained separately.
- `lint.json`: initial strict lint records two existing projector warnings and one new `structuredClone` no-undef warning. Replace the test clone with the existing JSON round-trip pattern. No baseline changes.
- `final-lint.json` plus `lint-details.json`: zero errors, changed tests have zero warnings. `check-lint.py` feeds the retained original projector and current projector into the same ESLint stdin filename and proves exact equality of their two existing warning rule/severity/message tuples. The projector's existing function-length and complexity warnings do not increase.
- `final.json`: final bounded two-suite run, pinned by `final-source.json`; see receipt for actual counts and drift. Final source snapshots are `final-source-*.gz`.

All receipts/raw output are retained, including unsuccessful attempts. Root owns broader regression/build/compiler/UI/size gates and publication.

## Fixture limits

The route uses real HTTP/JWT, current access/import/projection services and canonical authoring database writes over isolated PGlite with a minimal explicit saved-design source table. No provider, agency endpoint, deployed environment or browser is used. These checks do not establish clinical completeness, CDASH conformance, EDC deployability or human validation. Retaining recorded optional/conditional schedule states, footnotes and visit windows in editor text is a separate known adapter follow-up; this increment preserves current visit-ID behavior without expanding it.
