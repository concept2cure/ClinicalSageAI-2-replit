# Complete the existing program applicant binding and form facts

W5 / D7, MR-10 Stage 4 identity integration. Parent contract:
`docs/design/APPLICANT_IDENTITY_COMPLETION_2026-10-21.md`.

## What already exists

- `ind_sponsors` already records legal name, DUNS, contact and signatory in the
  existing IND registry. Its deployed migration is
  `migrations/20260609_ind_master_data.sql`. These facts are not copied to programs.
- `server/routes/ind-forms.routes.ts` already reads program facts for the
  Module 1 forms and writes sponsor address/IND type through `/program-facts`.
  Its reader and completed writer are now extracted into the single existing
  feature's `server/services/ind-forms/program-form-facts.ts`, keeping the route
  below the unchanged 1500-line file ceiling. GET, build and write receipts all
  use that reader.
- `server/services/ind-forms/form-context-assembler.ts` already maps registry
  records to form metadata. It now retains explicitly bound sponsor metadata
  while preserving program address as its existing authority.
- `requireGovernedProgramWriteTx`, `setTenantContextTx`, `writeChainedAuditRow`,
  the normal migration set, and the PGlite harness already provide current
  authority, tenant transaction scope, atomic audit and schema execution.
  The tests reuse the existing `pglitePool` bridge for real transactions and
  Drizzle's array-mode results, including duplicate selected column names.

## Completed behavior

`20261021_regulatory_programs_applicant_sponsor.sql` adds only the nullable
registry link and enforces its tenant relationship with a composite FK. The
normal deployment set registers it after the existing registry migration.
PGlite applies the real migration. Deleting a sponsor clears only the nullable
link; it cannot clear the program's tenant key.

The existing program-facts write requires a reason and exact `factsVersion`,
rechecks persisted authority, locks program before sponsor, and commits the
facts and chained audit together. Stale reads refuse. Audit failure rolls
back. A lost commit acknowledgement reports an unconfirmed outcome and directs
the user to reload before retrying.

Program timestamps are PostgreSQL `TIMESTAMP WITHOUT TIME ZONE` in the real
creating migration. The harness now mirrors that type. Its opaque version
token formats the stored timestamp directly with all six fractional digits;
it does not round through a JavaScript Date or shift with session time zone.
Registry timestamps remain their existing `TIMESTAMPTZ` type and use their
existing service's UTC revision expression.

Program-backed forms pin recorded applicant name, application number, address,
bound contact and signatory after existing per-build choices. Standalone form
metadata and stated phase/serial/IND-type behavior remain available. A record
read outage is an explicit 503; a broken explicit binding cannot fall back to a
different organization-named applicant.

## Executed verification

- `red.log`: original route failed 8 of 9 focused cases before implementation.
- `mutation-identity-pinning-red.log`: removing the identity pinning makes the
  spoof regression fail. Production source was restored before the final run.
- `signatory-red.log`: independent review found a dropped registry signatory;
  the added regression failed first with blank authorized-representative boxes.
  Preserving recorded sponsor metadata fixes both absent and spoofed overrides.
- `green-reviewed.log`: **97 tests passed in 4 files**, including 15 focused
  applicant/authority/audit/CAS cases, existing form routes, attachment
  attestation and context assembler. Native PostgreSQL proof is owned by the
  parent evidence packet; this log is PGlite, not a native-server claim.
- `lint-reviewed.log`: zero errors; 11 existing large-file/function warnings
  across the reached routes, existing harness and existing route tests. The
  extracted helper and focused applicant tests add no warnings.
- `migration-set-order.log` and `migration-drop-safety.log`: both normal gates
  pass with 418 migrations. No baseline or dependency was changed.

Earlier green/replay logs retain the duplicate-column test-bridge diagnosis and
the intentional old assertion update: caller-supplied program addresses no
longer override the recorded address. They are superseded by the reviewed run.

Actual customer facts, human witnessing, agency assets and agency conformance
qualification are not executed or claimed by this worker. Root owns the final
integrated browser/build/compiler/publication evidence.

## Normal push gate follow-up: reuse the existing facts reader for its lock

`prepush-ownership-refusal.log` retains the actual normal push refusal before
the compiler: the standalone `SELECT id ... FOR UPDATE` used only for locking
also copied the canonical ownership query. `ownership-red.log` reproduces that
gate failure directly. The gate and baseline remain unchanged.

The writer now requests its program row lock through the existing full-facts
reader's optional internal `forUpdate` argument. Drizzle emits a row lock only
for `regulatoryPrograms`, so the nullable sponsor/organization outer joins are
not locked. Current authority still comes from
`requireGovernedProgramWriteTx` → `programInOrganization`; the subsequent read,
exact CAS check and sponsor share lock retain their behavior.

- `green-reader-lock.log`: **97/97 tests in 4 files**, including the existing
  15 focused authority/CAS/audit/applicant cases, on the corrected lock path.
- `lint-reader-lock.log`: empty successful output, zero errors/warnings for
  the one source file changed by this correction.
- `ownership-green.log`: normal ownership gate passes.
- `ownership-selftest.log`: unchanged selftest passes (10 copies found,
  6 legitimate reads passed).
- `source-inputs-reader-lock.json` pins this follow-up cohort separately from
  the earlier `green-reviewed.log` inputs. Root rebuilds and reruns normal
  publication gates after the source correction.
