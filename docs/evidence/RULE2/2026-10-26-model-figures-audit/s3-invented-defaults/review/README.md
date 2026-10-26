# S3 review follow-up — 2026-10-26

Continues the interrupted Claude session from the user's pasted handoff. The workspace was empty;
this session restored `concept2cure/ClinicalSageAI-2-replit` at `6f7477656801aa84bf774e6926287457574de745`
on `concept2cure-v2`. The original S3 commit is `5aa47407d02f4509a06fa2eea6292322eacacb40`.
The unfinished edits and full numbered review were not present in the restored repository, so the
follow-up was reconstructed from the handoff and current code. The five findings described as
predating S3 were not expanded into this change; their original review text was unavailable.

This is a correction to the existing Rule 2 S3 evidence, not a new capability or a claim of a new
launch gate. No migration, dependency, route, UI or alternate implementation was added.

## What already exists

- `server/services/benefit-risk/benefit-risk-knowledge.ts`: uncertainty engine and affected-side prose;
  it preserved an unstated level but still defaulted an unstated affected side to both.
- `server/services/biomarkers/biomarker-knowledge.ts`: clinical validity uses the canonical
  `stats/clinical-performance.ts` 2×2 engine; its cutoff gate still accepted an omitted prespecification.
- `server/services/digital-health/digital-health-knowledge.ts`: cybersecurity tri-state inputs and
  requirement rows; missing mandatory artifacts and the submission-date gate still behaved leniently.
- `server/services/ana/AnaToolExecutor.ts`: `ivdError` and the cached `getRequiredInputKeys` schema
  reader already exist. The telemetry wrapper used the latter only for a report-only contract check.
- `server/services/capa-mdr/triageEngine.ts`: classification already preserves unknown facts and
  normalizes countries; the malfunction rule was confined to one harm label.
- `server/services/capa-mdr/capaMdr.service.ts`: complaint intake already validates the country and
  persists its preliminary classification, but stored the raw country string in `varchar(8)`.
- Existing S3 regression suites were extended in place. Available deletion history was searched
  for the affected engine/handler names; no replacement implementation was introduced.

## Fixes

| Handoff area | Final behavior |
| --- | --- |
| [0] BR affected side | Missing/unrecognized `affects` is `not_stated`; no direction is invented in impact prose or side-dependent conclusion-change prose. |
| [1] Biomarker cutoff | Validity requires `cutoffPrespecified === true`; an unstated cutoff is named in a warning and the cutoff note. Explicit false keeps the existing critical finding. |
| [2] Cyber required artifacts | Missing and unstated SBOM/CVD/patch-plan rows are critical unless 524B is explicitly ruled out. Status still distinguishes missing from unstated. |
| README overclaim | Blanket claims about defaults and classification consumers were narrowed to what code demonstrates. The original numbered review was not recovered, so its exact [3] wording is not asserted. |
| [4] IVD missing inputs | `ivdError` checks the existing tool schema against actual missing/null input values and names the required fields. With required inputs present, TypeErrors remain errors even when their text matches the stats heuristic. Ordinary parameter errors still ask for parameters. |
| [5] Submission-date default | `submissionUnder524B` no longer defaults true. Applicability is undetermined until needed criteria are stated; an explicit false criterion rules it out. The rationale says “Section 524B applies” only when applicability is true. |
| [6] Cyber header | Documents its shared input-reader import accurately. |
| [7] MDR malfunction | FDA recurrence-risk assessment also runs for no-harm/non-serious injury cases (21 CFR 803.50(a)(2)); an unstated risk is unknown. EU no-harm malfunctions remain not assessed. Existing serious-injury/death reporting rules remain in place. |
| [8] Country storage | Intake stores the classifier's normalized country (or literal `unknown`), so padded inputs cannot overflow the country column. |

Tool descriptions and `docs/ana-capability-manifest.json` reflect the revised BR/cyber contracts.
The country tests inspect the actual inserted row; they do not merely test the normalizer.
The existing native transaction test now submits a country with enough leading padding that its
non-space characters exceed `varchar(8)`, and asserts the persisted value is `US`.

## Verification

Regression cases were written and run before production fixes:

- `red/br-cyber.txt`: 10 failures, including expectations that previously pinned lenient behavior.
- `red/biomarker-ivd.txt`: 7 failures.
- `red/mdr.txt`: 7 failures.
- `red/native-country-overflow.txt`: after provisioning native PostgreSQL, restoring only the old
  country-storage line makes the actual complaint request return 503 instead of 201. The fixed
  implementation commits the normalized value. The current governed route maps the storage
  failure to `CAPA_PERSISTENCE_UNAVAILABLE`; the handoff had described it as a 500.

These reconstructed cases differ from the interrupted session's stated 16 failures. They include
additional null-input and TypeError-heuristic checks; no claim is made to recover its exact patch.

Fresh combined verification: **34 files, 534 tests passed** on Node 22.23.4, recorded in
`green/related-suites.txt`. Repository checks are recorded in `green/gates.txt`.

The additional native PostgreSQL 16.15 + pgvector suite passes **12/12** tests
(`green/native-capa-transactions.txt`), using real HTTP authentication, a non-superuser runtime
role, certificate-verified TLS and enforced RLS. The disposable database was provisioned by the
existing `install-fresh.mjs` then `deploy-migrate.mjs` scripts, with complete successful logs
in `green/s3-db-install.txt` and `green/s3-db-deploy.txt`. No test-only schema or policy bypass
was introduced. The database was removed after verification.

Before landing, synchronized the unrelated client-journey commit `b3661f72` from the canonical
branch. It does not modify these production files. Husky was activated in this clone so commit
and push checks execute normally.

- `npm run ci:typecheck:no-regression`: passed, 0 errors against baseline 0.
- `npm run ci:eslint-ratchet -- --since HEAD --gate`: no added warnings.
- `npm run manifest:ana`: regenerated.
- `npm run ci:validation-traceability`: passed.
- `git diff --check`: passed.
The initial parallel lint/test/typecheck attempt was discarded: the lint comparison command creates
short-lived `__eslint_ratchet_prev__` TypeScript files, which the other tools discovered. Verification
was rerun after that command finished. No baseline was changed to accommodate this.

Limitations: these changes do not validate regulatory determinations outside the modeled inputs
or alter the engine's pre-existing 806/report-timing simplifications.
