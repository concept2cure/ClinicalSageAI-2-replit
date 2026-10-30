# P-73, slice 1: a trial program resolves to its own region's trial application

**Design:** `docs/design/TRIAL_APPLICATION_DRAFTING_2026-10-30.md`, slice 1.
**Decision:** P-73. **Rows:** W3 / D2, D4.

## What already exists

- **The drafting context.** `server/services/ana/draft-submission-context.ts` drafts each section against the
  registry entry that `registryContextForProgram` resolves (`server/services/c2c/program-registry-context.ts`).
- **The old rule.** Without a wizard choice, only `PROGRAM_TYPE_REGISTRY` pairs resolved. Of the trial
  applications, only `cta + EMA` did. A Health Canada, MHRA, PMDA, NMPA, MFDS or Swissmedic trial program was
  drafted "SUBMISSION REQUIREMENTS STATUS: UNASSESSED", although its registry entry exists
  (`shared/regulatory/global-document-registry.ts`).
- **The backfill.** `migrations/20261008c_projects_registry_context.sql` restates the rule in SQL for existing
  project records, and a parity test runs both over every pair.

## The change

- **New rule.** `TRIAL_APPLICATION_REGISTRY`: an IND or a CTA filed with an agency that has exactly one trial
  application is that application:

  | Agency | Trial application |
  |---|---|
  | HEALTH_CANADA | CA_CTA |
  | MHRA | UK_CTA |
  | PMDA | JP_CTN |
  | NMPA | CN_CTA |
  | MFDS | KR_IND |
  | SWISSMEDIC | CH_CTA |

- **Ambiguous agencies.** TGA (CTN or CTA), ANVISA (DDCM or DEEC) and CDSCO (several forms) still resolve to
  nothing. The record cannot say which application they mean.
- **Agency names.** The agency is compared with spaces and hyphens as underscores, in TypeScript and SQL alike,
  so "Health Canada" matches `HEALTH_CANADA`.
- **Migration.** The migration is amended in place (Rule 1), with a dated header. It still only adds keys where
  none is recorded, and drops nothing.

## Red, then green

- **Red** (`slice1-red.txt`): 8 of 12 unit tests failed. Every trial pair resolved to null. The parity test could
  not load, because the table did not exist.
- **Green** (`slice1-green.txt`): 57 of 57, made up of the unit test plus the SQL/TypeScript parity test, pair by
  pair.
- **Mutations:** all three turn the tests red (`slice1-mutations.txt`):
  1. the SQL loses a pair;
  2. the SQL stops normalising the agency;
  3. TGA is treated as having one application.
- **Updated test.** `batch-draft-submission-context.pglite.test.ts` pinned "an IND filed with MHRA is not mapped".
  P-73 changes that, so it now asserts that MHRA, MFDS and NMPA map. TGA, EMA, "US FDA" and absent agencies stay
  unassessed. 92 of 92 pass.

## Gates and other suites

- **Migration gates:** `ci:migration-drop-safety`, `ci:migration-set-order` and `ci:migration-deploy-path` pass.
- **Wider suites:** the project, intake and authoring suites ran 89 files and 1,792 tests. One failed, in
  `cross-sector-builtin-authoring-templates.test.ts` ("preserves all 392 prior builtin objects"). It fails
  identically on trunk without this change.

## What this does not do

- **Module 1 content.** These applications now resolve, but `UK_CTA`, `CH_CTA` and `KR_IND` still fall back to
  generic CTD headings, and their Module 1 answers "not indexed". Drafting now says exactly that, instead of
  "unassessed". Cited regional content is slice 4.
- **The editor.** Its "Draft from sources" path does not use this resolver yet. That is slice 2.
