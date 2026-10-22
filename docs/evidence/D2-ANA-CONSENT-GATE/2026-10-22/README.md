# D2 — the consent-form approval gate holds a form to the one element record

Row **D2**. Decision delegated by the founder on 2026-10-21 ("You decide based on what's best for our clients"), as handed on from `docs/evidence/D2-ANA-CONSENT-RECORD/2026-10-15/`.

## What the decision is

1. An FDA-regulated consent form cannot be approved (signed) unless:
   - its confidentiality element says that the Food and Drug Administration may inspect the records (21 CFR 50.25(a)(5));
   - for an applicable clinical trial, it carries the ClinicalTrials.gov statement (21 CFR 50.25(c)).
2. If applicable-clinical-trial status is unknown, the form is held to 50.25(c) (the conservative choice). Recording "not an applicable clinical trial" (`PATCH /api/protocol-consent/forms/:id/applicable-clinical-trial`, governed, with a reason) makes the statement optional.
3. A draft or in-review form gains the elements it lacks the next time it is edited. That happens in the edit's governed transaction, with the form row locked.
4. An approved or superseded form is the signed record and is never changed. Its completeness read reports `predatesCurrentElements` and an info finding saying a new version must include them.

## Measured before (86a37c740)

`protocol-consent-logic.ts` seeded every form from its own fifteen-row list, which cited only 45 CFR 46.116. That list had:
- no ClinicalTrials.gov element;
- no research statement as its own element.

The gate checked only "marked present and has content". So a form was signable without the FDA-inspection wording, and without 50.25(c). `red-at-86a37c740.txt` shows 12 of 13 new cases failing on unchanged trunk.

## Change

- `server/services/protocol-consent/protocol-consent-logic.ts`:
  - the seed is now `consentElementsFor('fda')` from `shared/regulatory/informed-consent-elements.ts`, so the duplicate list is deleted (zero duplication);
  - `LEGACY_ELEMENT_KEYS` maps the old keys onto the elements they always covered (`purpose_duration` → purpose + research statement, and so on);
  - `PRESCRIBED_WORDING` holds the two statements the gate requires. Other wording patterns remain a reading aid;
  - `evaluateConsentCompleteness(rows, { expected })` counts a required element that no row covers as missing;
  - findings cite each element's own paragraph.
- `protocol-consent-service.ts`:
  - one insert path for seeding and for sync;
  - `setApplicableClinicalTrialTx`;
  - `getCompleteness` returns `predatesCurrentElements`.
- `server/routes/protocol-consent.ts`:
  - `applicableClinicalTrial` on create;
  - the ACT route. The viewer-refusal test reads routes from the router, so the new route is covered by it.

No migration. The tables' creating file is not on `C2C_MIGRATION_FILES` (deploy-path baseline), so an SQL backfill would reach no deployed database, and it would have duplicated the element record in SQL. The application-level sync reaches every database the service runs against.

## Green

`green.txt` shows 35/35:
- the pure gate cases;
- the old logic tests, repinned to the record: 11 required elements, 50.25 citations;
- the lineage-gate PGlite test, now on the real consent migration;
- the new lifecycle PGlite test, which covers new forms, legacy in-review forms, the ACT switch, and approved forms left unchanged.

## Not done, handed on

- **`create_consent_form` AnA tool** (`server/services/ana/AnaToolExecutor.ts`, held under 24h): it does not yet pass `applicable_clinical_trial`. Its forms default to "unknown", which means they are held to 50.25(c).
- **The regime is FDA only.** A form for HHS-supported research that is not FDA-regulated would need the Common Rule-only elements, and there is no regime column (the table is off the deploy path). Outside the US-IND composition boundary.
- **Unrelated failures:** `tests/regulatory/submittabilityCoverage.test.ts` and `submissionTypeBridge.test.ts` fail identically on unchanged trunk (EU_IVDR vs EU_IVDR_TECHDOC). They are not this change's.
