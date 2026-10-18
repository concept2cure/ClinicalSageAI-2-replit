# Source intake follow-through

This pass starts from `1c7d319a` on `concept2cure-v2` and uses the existing
source intake, native Word converter and canonical authoring transaction.

Two source defects were reproduced before repair. A Word file with repeated
`3.2.S.4.1` headings produced duplicate section identifiers and HTTP 500 at
the canonical unique index. The transaction correctly left no document,
section, revision or audit rows, but the source could not be worked on.
Separately, an exact Vault predecessor remained importable after a same-family
successor became current, despite the existing surface disabling earlier
versions. Both new creation and exact-draft reuse could pass the stale source
check when the successor was inserted during conversion.

The Word allocator reserves every recorded code before assigning working
identifiers. It keeps the first occurrence and assigns later occurrences
deterministic `import.<source-position>` codes, skipping reserved or used codes
without case ambiguity. Every source title, passage, table and position stays
distinct. Visible warnings name each displaced original heading and its
replacement identifier and state that the identifier is not a CTD filing
location. The same warnings persist in the existing import origin and every
section's CREATE audit. No passage is combined or discarded.

Vault intake now reads the exact eligible original row with `FOR SHARE`, then
checks the canonical `supersededSql('d')` predicate in a fresh statement. A
Vault check-in holds that predecessor `FOR UPDATE` while inserting a
successor; checking in a later statement avoids a snapshot taken before a wait
on that lock. The same path runs initially and inside the authoring creation
transaction, before either creation or reuse. A stale or unverifiable current
version receives the existing typed HTTP 409 `SOURCE_CHANGED` with guidance to
refresh and choose the current version. The requested identity is never
substituted with a family head. Existing saved work remains readable by its
exact authoring document ID.

## Verification

The repeated-heading HTTP regression failed before the allocator: 12 existing
cases passed and the new case received HTTP 500. The four current-version
regressions also failed before the version check: the initial read reached a
held physical original and the conversion-race cases accepted old versions.

The final targeted run passes **49 tests in four suites**:

- `authoring-source-conversion.test.ts`: 3 checks for repeated/case-equivalent
  codes, reservation before allocation, deterministic results, unchanged source
  inputs and preservation of unique/single-section source codes.
- `authoring-source-import.test.ts`: 26 checks, including a fresh current-version
  query after the exact source row lock, missing/current-false refusal before
  bytes or conversion, and the existing actor/project/role/integrity/provenance
  and exact-draft reuse checks.
- `authoringSourceImport.pglite.integration.test.ts`: 17 real HTTP/service
  cases. Native Word conversion and the canonical transaction preserve three
  repeated headings and their bodies/table/order, save a reviewed continuation,
  reopen it, and reuse the same edited document with its original warnings.
  Initial and conversion-raced supersession each refuse both new and reused
  copies without changing authoring documents, sections, revisions, audits or
  permissions. Original bytes and recorded hashes remain unchanged.
- `ind-document-catalog.test.ts`: 3 existing full-coverage checks. The complete
  canonical eight phases, 102 non-module CTD sections and 93 deliverable entries
  retain their official-form/data/manual drafting limits. Intake retains the
  existing absence of a document-type whitelist.

All five changed source production/test files pass scoped ESLint with zero
warnings. Existing long test groups were split without changing their cases
or assertions. `git diff --check` passes.

Proof logs are stored beside this note: `repeated-headings-red.txt`,
`current-version-red.txt`, `source-green.txt`, `source-lint.txt` and
`repeated-headings-transaction-red.txt`.

PGlite proves real SQL, HTTP behavior and atomic rollback. These cases do not
prove independent PostgreSQL connections, production RLS, hosted qualification
or a live model. Existing format/size/conversion limits remain in force.

## Fixed SQL fragment

The sole new SQL interpolation is `supersededSql('d')`, the existing canonical
family predicate called with literal alias `d`. Its query binds the exact
verified document, project and tenant as `[documentId, programId, tenantId]`.
No requested identity, title, checksum, reason or other user value enters SQL
text. The control tower reviewed the SQL scanner baseline change (4 to 5 for
`authoring-source-import.ts`) after observing the scanner reject the new site;
the green check confirms only this fixed canonical fragment was admitted.
The source session changed no scanner or
baseline and added no source eligibility implementation.
