# 2 — Proof tier: two journeys and one schema contract ran on a schema older than the code

CI Lint step "Proof tier" (`npm run test:proof-tier`) was red. Locally at HEAD
`882c2bc37`, 6 files failed. This record covers the 3 with a schema-gap
cause.

| File | Red | Cause |
|---|---|---|
| `tests/golden-journeys/device-510k-estar.journey.test.ts` | project creation 500 | `42703 column "eu_mdr_class" of relation "regulatory_programs" does not exist` |
| `tests/golden-journeys/cer-eu-mdr.journey.test.ts` | the same | the same |
| `tests/schema-contract/biopharma-programs-router-columns.contract.test.ts` | fixture 45 columns, Drizzle 46 | `applicant_sponsor_id` missing |

**Why.**
- `352ca5aa` (2026-10-20) made `POST /api/c2c/projects` write
  `eu_mdr_class` / `eu_ivdr_class`. The columns come from
  `migrations/20261012b_regulatory_programs_eu_device_classes.sql`, which is
  on the deploy set but was not in either journey's replay list.
- `ccd509c0` (2026-10-21) added `regulatory_programs.applicant_sponsor_id` to
  `shared/schema/programs.ts` and migration `20261021`. The contract's fixture
  DDL is pinned to Drizzle column-for-column, and it did not have the new
  column.

**Fix.**
- Each journey replays the real `20261012b` migration right after
  `20260907_regulatory_programs_application_number.sql`, as the deploy set
  orders them, rather than a hand copy of its columns.
- The contract fixture gains `applicant_sponsor_id uuid` in Drizzle's
  position.
- No assertion changed.

**Red → green.**
- Before: 510(k) 1 failed, CER 1 failed, contract 1 of 5 failed.
- After: the three files pass, 8 of 8.

The drug NDA journey shares the `eu_mdr_class` gap and is fixed by the same
replay. Its next failure is a correct refusal, which needs the applicant to be
recorded. That is in the following record.
