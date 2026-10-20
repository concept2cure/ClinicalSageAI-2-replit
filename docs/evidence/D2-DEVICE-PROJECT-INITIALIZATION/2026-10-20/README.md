# Device project initialization evidence

W1 / D2; canonical `concept2cure-v2`; Codespaces/local testing only.
This follows the device authoring increment `352ca5aae` and its 392-template
inventory. Work remains within Projects, Authoring, Vault and Submission Center.

## What already exists

- `shared/regulatory/global-document-registry.ts` and `filing-catalog.ts` already
  identify FDA HDE, Canada MDL/IVD licensing and Japan approval, certification,
  notification and diagnostic records. Several currently resolve to generic
  `device`/`ivd` project pathways, which deliberately fail closed.
- `server/services/market-specs/document-template-library.ts` and
  `shared/regulatory/device-authoring-sections.ts` serve exact regional working
  outlines to the existing editor and AnA. These are limited authoring groups,
  not independently verified current agency forms or complete legal requirements.
- `server/services/c2c/document-class.ts`, `rule-pack-lookup.ts` and
  `scaffold-project-documents.ts` already perform class resolution, exact pack
  lookup and transactional governed-document creation. Generic device/IVD is
  unclassified; no FDA near-neighbour substitution is acceptable.
- `shared/regulatory/filing-document-classes.ts`,
  `server/services/c2c/filing-class-packs.ts` and
  `scripts/db/emit-filing-class-packs.ts` already connect documentary filings to
  immutable, provenance-labelled pack versions. These classes are document-only
  and must not be silently repurposed as regional application identities.
- `server/services/regulatory/market-support.ts` already offers author-only
  projects when their exact outline exists, and refuses unavailable classes,
  packs and transports. `Projects.tsx` already renders the shared filing catalog
  and uses the canonical product vocabulary; no new wizard or editor is needed.
- The migration applier replays its whole set. Existing pack provenance,
  review status and CHECK constraints must be reused and replay-tested; a seed
  script alone cannot admit a document class to an installed database.
- Previous coverage also corrected the legacy EU CDx template title. The
  canonical product descriptor still states blanket Class D, so its UI-facing
  wording remains inconsistent with the current class-neutral filing record.

Searches covered HDE, MDL, IVD licence, Shonin, Ninsho/Nintei, Todokede,
project/bootstrap/class/pack paths, routes, services, shared taxonomy and
migration files. Deleted-history searches over device/MDL/Shonin/HDE/rule-pack,
bootstrap and filing-class paths found legacy device routes/generators retired
in the canonical 510(k) convergence (`c6d7295a8`) and later cleanup; no separate
regional governed project pipeline was found to restore. Existing implementations
will be extended, with no competing editor, bootstrap or submission transport.

## Implementation contract

See [the design](../../../design/DEVICE_PROJECT_INITIALIZATION_2026-10-20.md) for the eight exact class/agency/product mappings and scoped ownership. Existing application initialization, pack emission and readiness evaluation are extended in place. No agency transport or regulatory qualification is asserted.

The first correction removes the contradictory unconditional CDx class description; the red and green receipts record the semantic regression test and source pins.

## Implemented behavior

The existing wizard and API now reach HDE, Canada MDL/IVD licence and Japan
Shonin/Ninsho/Todokede/IVD approval/CDx through eight exact application classes.
All use the existing editor outlines and pack pipeline. Product families remain
coherent across arrival lanes; canonical authority values survive save/reopen,
including the registered certification body. Conflicting filings, authorities,
product families and missing exact packs refuse without substitution.

Eight immutable preparation packs are installed through the canonical migration
manifest. They are low-confidence, unreviewed platform outlines with no transport
channel. All 392 previous template IDs and snapshot hashes are preserved. The
existing readiness evaluator reports unknown requirements as unassessed/0 with
critical gaps. Governed section review completion remains a separate measure.

Independent review found and closed additional paths that could lend these
preparation classes medicinal requirements or records: generic eCTD endpoints
(including linked numeric project IDs), added-market creation and the canonical
submission writer. Existing supported medicinal and device pathways remain
available. Wrong-authority remedies name the expected authority from the catalog.

## Verification records

- `regional-catalog-red.json` / `regional-catalog-green.json`: 15 meaningful
  failures resolved; 168 passing shared catalog/product/pathway cases.
- `cdx-descriptor-red.json` / `cdx-descriptor-green.json`: conditional CDx
  classification wording; earlier focused receipts, superseded by integration.
- `ana-segment-red.json` / `ana-segment-green.json`: regional device interview
  routing; 42 passing cases.
- [Initialization worker](init/README.md) and [pack worker](pack/README.md):
  actual focused red/green commands, source pins, replay and lint records.
- `added-market-red.json` / `added-market-green.json`: 16 new guard failures
  reproduced; the unrefused fixture writes also contaminated the existing audit
  positive control, making 17 failures in that RED. Final GREEN is 28/28,
  including the unchanged positive control, actual new packs, no write calls
  and unchanged documents/sections/submissions/audit/project state on refusal.
- `submission-creation-red.json` / `submission-creation-green.json`: shared
  canonical insert refusal, 13 passing cases exercising standalone and
  transactional entry points; IND/NDA/510(k)/PMA controls remain available.
- `template-snapshot-preservation.json`: exact current runtime comparison
  against the prior 392-template inventory, all unchanged.
- `independent-review.json`: read-only findings and fixes, with source hashes
  observed by root after review; reviewer ran no tests.
- `integration-suites.json`: the explicit combined regression selection. Final
  compiler/build/warning/static receipts and source freeze are recorded below
  after execution, rather than inferred from focused passes.

## Qualification epochs

The final local tree before Builder reconciliation is pinned by
[source-freeze-final.json](source-freeze-final.json): 126 source/test hashes on
canonical base `76c60846d`. [Compiler](canonical-typecheck.json) reports zero
errors against the unchanged zero baseline; [production build](canonical-build.json)
passes. All [16 static gates](canonical-static-gates.json) pass, including the
single-editor/canvas, design/token, SQL/gateway and migration checks.
[Warning ratchet](canonical-warning-ratchet.json) compares 44 lintable files with
that canonical base and records no file-level warning increase. The [combined regression](canonical-integration.json) passes **1,892 tests across
85 files**, including existing editor/assembly, incoming extraction evidence and
regional initialization. Its raw output is retained with a SHA-256 digest. All receipts
record no source drift. The build retains its existing large-chunk advisory.

The earlier 78-file / 1,789-test run in `integration.json` and its 116-hash
`source-freeze.json` are historical, before canonical extraction-evidence
changes, the existing project header's authority display fix, and a test-only
tuple fixture typing correction. `typecheck-before-final-corrections.json`
retains the actual two-error fixture result; the compiler baseline was not raised.
[Header RED](header-authority-red.json) reproduced two incorrect display labels;
[header/fixture GREEN](header-and-fixture-green.json) records 37 passing cases.

[Canonical reconciliation](canonical-reconciliation.json) records the incoming
exact extraction-evidence work incorporated before the final 85-file selection.
[Independent follow-up](independent-followup-review.json) reviews its source/text
binding and the existing header chip change. A later
[canonical fetch](canonical-final-fetch.json) found Builder study-tagging work;
[independent prelanding review](independent-prelanding-review.json) found no
interaction blocker and names the combined-tree checks required after merging.
The 85-file run is attributed to the pre-Builder source freeze; subsequent
reconciliation checks must be reported separately without adding overlapping counts.

## Final merged qualification

[Builder reconciliation](canonical-builder-reconciliation.json) records the normal
canonical merge `2b0cbe289` after regional implementation commit `33e82d847`.
Only the shared submission-service module changed among the prior 126 pins;
both error codes/statuses, imports and the preparation-only creation refusal
remain present. [Independent merged review](independent-merged-review.json)
verifies the other 13 incoming files retain their exact incoming hashes.

The expanded [first merged replay](merged-integration-before-signing-fixture.json)
records three failures / 247 passes: the existing dispatch-signing fixture
omitted the canonical STF study metadata migration now read by the incoming
signature manifest. [Fixture correction](signing-fixture-correction.json) applies
that actual existing migration and retains every original assertion. The
[corrected 18-file replay](landing-integration.json) passes **250 / 250**, with
all 150 [landing pins](source-freeze-landing.json) stable.

A targeted audit found the same omitted migration in three other existing
signing fixtures. Their [RED](additional-signing-fixtures-red.json) records
31 failures / 17 passes; [GREEN](additional-signing-fixtures-green.json) passes
**48 / 48** across all three. Existing release, revocation, tenant and stale
content assertions are unchanged. No production signing fallback was added. [Independent fixture review](independent-publication-review.json) confirms all original assertions remain.

The final [publication freeze](source-freeze-publication.json) contains 153
source/test/migration hashes and preserves all 150 prior landing pins.
[Final compiler](publication-typecheck.json) reports zero errors at the unchanged
zero baseline. [Fixture lint](publication-signing-fixture-lint.json) has zero
errors and one existing warning; the [final warning ratchet](publication-warning-ratchet.json)
checks all 48 changed lintable files against canonical `5d18c3950` and finds no
file-level increase. No compiler, lint or migration baseline was raised.

[Merged build](merged-build.json) and all [16 merged static gates](merged-static-gates.json)
pass on [149 merged pins](source-freeze-merged.json). Subsequent edits only add
the existing migration to four test fixtures: every production pin and every
other original pin is unchanged, so those production build/static results remain
applicable. The final compiler and affected fixture regressions additionally
bind the final fixture bytes. All successful receipts record no source drift.
Do not add counts from these overlapping qualification epochs.

[Packaging checks](checks.json) validate JSON, raw output digests, links, source
pins and the manual worksheet status. [Artifact manifest](artifact-manifest.json)
hashes every file in this packet except the manifest itself. The latest
[pre-push fetch](canonical-prepush-fetch.json) records no missing canonical commits.

## Human testing and remaining limits

The [Codespaces guide](../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md)
now has 49 manual cases, all **Not run**. No human acceptance, full fresh local
installation, live model run, deployment or agency transmission was performed
in this increment. PGlite pack contracts apply the relevant canonical migration
subset in applier order and replay it with bound records; that is distinct from
executing every repository migration against a new PostgreSQL installation.

These preparation outlines are not complete verified current agency forms or
legal requirement sets. Qualification of regional requirements, original forms,
expert review, wider EMEA and actual recipient transport remains separate work.
An author-only offer is neither a package nor an executable submission pathway.
Earlier focused, candidate and red receipts remain history; do not add their
overlapping test counts to the final combined run.
