# Independent template route and saved-review evaluation

This evaluation uses the existing HTTP/JWT authoring routes, real canonical
creation and review services, and isolated PGlite SQL. It does not qualify native
PostgreSQL concurrency, deployed RLS, live providers, regulatory readiness or
agency transmission.

## Before implementation

The existing `GET /api/authoring/templates` lacked the selected registry/component
identities, so the initial regional route suite failed all eight cases. No
unimplemented helper was imported for this RED run. Expected filing identities
came from active `pharma_biotech` registry rows in US/CA/EU/JP/GLOBAL and document
components came from existing `ectd`/`ctis` outlines.

Saved-review RED returned no recorded filing context and accepted malformed or
conflicting present context. Its raw result was 12 failures and two passes.
Eleven failures reflect product behavior; one empty-array `it.each` parameter
was expanded by Vitest into `undefined`. That harness case was boxed as
`{ filingContext: [] }` before final evaluation. The corrected final suite also
checks missing mandatory regional context, mismatched source entry identity,
and compatibility with historical IND sources that have no regional context.

Compact actual output is retained in [route-before.txt](./route-before.txt) and
[saved-review-before.txt](./saved-review-before.txt). Full request/audit logs are
kept in scratch, rather than duplicated in release evidence.

## Verified behavior

The first combined focused run passed 51 tests in three files. The unchanged
IND creation/section-read loop retains all 200 starts and 2,725 empty sections, exact
existing UUIDs and hashes, module/catalogue coverage and authority refusals.
Only its list request is filtered to the existing `IND pyramid` category so the
expanded shared picker can contain other template types.

The regional route suite creates/reopens all 87 selected active registry
filings and all 17 indexed biotech components, with 1,580 empty sections.
It separately creates the PIL metadata worksheet with one preparation section.
Thus the actual regular start coverage is 305 templates and 4,306 sections:
200 IND plus 105 new regional/component starts. Counts are observed from the
canonical records; they are not a maintained filing list or a completeness
claim for every sponsor's product.

The 104 indexed regional/component copies have matching genesis revisions,
CREATE audit evidence and exact recorded source identity/context. Each of their
saved section-guidance endpoints returns the recorded CREATE guidance, including
the canonical purpose; each document GET reopens the same source under an
independent working title supplied at creation. This does not perform a later
rename. The PIL case verifies creation, section reads and complete paged saved
review, without a separate document GET or guidance-endpoint check. The 200 IND
loop reads all saved sections and atomic evidence, with document GET and saved
guidance checks in five representative cases. Ordinal documents retain
`module: null`; only an explicit canonical component CTD section establishes a
single module. Copies remain unbound working documents, with original-record
limitations retained.

The routes refuse mismatched modules, a foreign-tenant project, and current
revoked/reader memberships despite an old JWT. Injected mandatory source
resolution and listing failures return explicit errors with no authoring writes.
An injected second-section failure rolls back document, section, revision and
audit rows. Organization/global database-backed template and original IND
failure boundaries remain covered by the existing suite.

The final regional route run additionally sends every new real POST-created
copy through `critiqueSavedDocument` on the same tenant SQL fixture. It consumes
all continuation pages, verifies exact full recorded source/context, pins the
same snapshot and writing score, reconstructs every limitation, accounts for
every empty authored section and asserts each serialized page is at most
5,000 characters. Empty authored bodies stay empty; reference material does
not become study facts or regulatory-completeness evidence.

Nine exact-UUID reference checks passed as a separate completeness supplement.
For US/CA/EU/JP, each complete page walk retains every canonical heading,
purpose and regulatory-basis reference. Preparation JSON is reconstructed by
character offsets and equals the existing canonical preparation builder,
without broken surrogate pairs and within the 5,000-character result budget.
Conflicting region, filing and family/device scope is refused. A shared ICH
component accepts a confirmed Canadian filing context while retaining its
recorded GLOBAL identity.

The shared HTTP/SQL fixture leaves literal migration arrays in each actual test
file so the migration-list closure scan still sees and validates both harnesses.
That contract passed four checks. All four owned test/fixture files passed
strict ESLint with zero warnings and errors.

## Reproduction

Use the repository's current toolchain with a 4 GiB Vitest heap:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts \
  server/routes/__tests__/indTemplateEditor.pglite.integration.test.ts \
  server/routes/__tests__/globalBiotechTemplateEditor.pglite.integration.test.ts \
  server/services/ana/__tests__/saved-global-template-oversight.pglite.test.ts
```

The focused first result, UUID completeness supplement and migration closure
result are retained as compact selected output. The final complete saved-review run passed all 20 regional cases in 189.61
seconds; the full registry/component create/reopen/review case took 153.489
seconds within its 180-second bound. Its compact output is retained in
[every-saved-review-after.txt](./every-saved-review-after.txt). Repository-wide compiler,
build, browser and publication evidence belongs to the parent release record.

## Post-sync legacy database-store fixture

The synchronized 92-file core run returned 1,527 passes and three failures.
All three were in the existing mocked-pool `authoringTemplateStartFrom.test.ts`:
its database-only name assertions excluded IND builtins but still counted the
105 newly offered regional/component builtins as database rows. The other
91 files passed.

Only that fixture was corrected. Its database-store assertions now exclude both
IND and recorded `filingContext` builtin rows, while each of the three cases
separately requires all 200 IND rows and the exact current regional UUID roster.
This includes the unavailable-global-database case, so a failed shared database
read cannot hide builtins. Response counts include the expected database rows
and all builtin rows. Database org/global ordering, sectionless filtering,
source content behavior, no-write refusals and transaction rollback assertions
remain intact. No production behavior changed for this correction.

The corrected file passed all eight tests in 9.23 seconds and strict ESLint with
zero warnings/errors. Qualification is the 91 passing files from the complete
run plus this corrected focused file; the entire 92-file run was not repeated
for this fixture-only change. Its before/after output is retained in
[post-sync-legacy-fixture-before.txt](./post-sync-legacy-fixture-before.txt) and
[post-sync-legacy-fixture-after.txt](./post-sync-legacy-fixture-after.txt).
