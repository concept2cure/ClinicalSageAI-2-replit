# Regional biotech templates in the existing editor

W1 / D2 implementation under the
[published contract](../../../../design/GLOBAL_BIOTECH_EDITOR_TEMPLATES_2026-10-14.md),
initial integration base `d6d8c19f`, canonical branch `concept2cure-v2`.
Incoming content-bound human-review work was integrated at `9ba70078` before
final verification. It did not change the template source contracts. The final
regression selection adds 14 peer-review, current-access and source-adoption
checks; browser evidence is replayed on the synchronized editor sources.

## Delivered coverage

The same editor and Start from picker now offer **305 built-in templates**:
200 unchanged IND starts, 87 active regional/shared biotech registry entries,
and 18 document components. The new projections supply 1,581 empty authored
sections with canonical reference guidance. The exact
[inventory and source hashes](template-inventory.json) are generated from the
existing registry and outlines rather than maintained as a second catalogue.

| Registry scope | Active biotech filing/document types |
| --- | ---: |
| US / FDA | 32 |
| Canada / Health Canada | 8 |
| EU / EMA and applicable European authorities | 22 |
| Japan / PMDA | 8 |
| Shared GLOBAL / ICH records | 17 |

Coverage includes the existing registry's investigational, marketing,
post-approval, safety, quality, special-procedure and shared clinical document
types. Product-class metadata is retained as applicability context, not proof
that a scaffold fits every sponsor or modality. The requested “EMEA” is treated
as EMA/EU here; this does not add Middle East/Africa rules or qualification.

Each regional source records its exact filing ID, jurisdiction, agency,
version/hash, drafting eligibility and original-record limits. Those facts are
saved with the document and section CREATE guidance independently of its title,
in AnA conversation handoffs and in the authorized saved-document review.
Conflicting, malformed or missing mandatory regional identity refuses a review
verdict. Existing IND source IDs/hashes and historical source behavior remain
unchanged.

Whole filings and documents without explicit drafting eligibility are preparation
worksheets. Only explicit canonical component metadata enables narrative
drafting. Original forms, datasets, certificates, executed consents, signed
records, technical messages and restricted master-file parts remain required.
Whole filings and ordinal headings do not acquire an invented CTD module.

Visual inspection caught long applicability notes pushing the regional picker
controls down its drawer. Its existing description now gives a concise creation
summary and points to complete limits and missing-outline notices in the existing
editor disclosure. Full saved metadata and AnA context are unchanged. The final
copy passed 59 focused creation/editor tests; browser evidence was replayed after
this correction. Earlier capture metadata is explicitly diagnostic.

The existing AnA template tool now resolves the same exact UUID and checks the
requested market, filing identity and family. Complete preparation inquiries and
reference text are paged within 5,000 characters, with Unicode-safe offsets.
Saved review keeps its existing authorization, snapshot drift and writing-only
score; guidance does not become authored evidence or checklist completion.

Two existing source-selection errors were corrected before exposing them:
EU PSUR uses the canonical 19-section PBRER component, and NDA/BLA annual reports
use the existing seven-component post-approval lifecycle record. A PIL metadata
entry without an indexed leaflet outline opens an explicitly limited source
preparation worksheet; it is not a QRD leaflet or an SmPC copy.

## Verification

[Independent SQL/HTTP evaluation](TEST_EVAL.md) retains actual before failures
and final persistence/review results. Its real route tests create all 305 starts
and read their 4,306 empty saved sections, with atomic evidence checks. All 104
indexed regional/component copies receive explicit document GET and section
guidance checks; five IND representatives receive both. The PIL preparation
copy is checked through creation, section reads and saved review. All 105 new
documents pass through complete paged saved review. This local PGlite qualification does not establish live PostgreSQL RLS.

The root's existing rendered editor suite initially failed five regional cases
while its 13 preserved cases passed; the final 18 editor cases pass. Together
with 16 independent regional saved-review cases, that focused run passed 34
tests. Source selection first failed two behavioral tests, then the projection
and canonical-source selection passed 250 tests across four files.

[Browser evaluation](BROWSER_EVAL.md) exercises the actual creation picker,
empty created editor, guidance and all four AnA handoffs for US, Canada, EU,
Japan, a shared narrative component and the explicit PIL preparation gap, in
desktop/touch light/dark. It records synthetic API boundaries and accessibility
incomplete rules. Fixture-provided saved paragraphs qualify rendered reads and
handoffs; they do not represent user-authored or persisted editor content.

[Release checks](release-checks.json) record the combined regression selection,
compiler/build, UI/source/import/style checks and unchanged warning baselines.
The [exact regression files](regression-test-files.json) make that scope
reproducible. Run the repository's configured Node/TypeScript toolchain, use
`NODE_OPTIONS=--max-old-space-size=4096` for selected Vitest files, and follow the
browser fixture's reproduction instructions. Run the warning ratchet after the
compiler because it creates temporary previous-source files in the source tree.
Normal Git hooks enforce the committed push-range and publication gates.
The earlier 78-file broad run was deliberately stopped for this synchronization,
with no conclusion attributed to its partial results. Its compiler had completed
with zero errors. The synchronized 92-file run passed 1,527 tests in 91 files
and failed three obsolete database-only catalogue assertions in one file. The
corrected file then passed all eight tests, with the exact regional UUID roster
and all 200 IND rows explicitly checked. This qualifies all 1,530 selected cases
across runs; it is not a single all-green 92-file rerun. After the final pure
list-mapping helper extraction, two targeted listing/failure cases passed; the
final UI helper passed 59 focused cases. The compiler, build and all 24 browser
cases were repeated on the final frozen production sources.

The first warning-ratchet run caught two added warnings. Extracting a pure row
mapper and description helper removed them without changing row data or rendered
copy. The final ratchet checks 22 changed lintable files with zero per-file
warning growth. No warning or compiler baseline was edited.

## Boundaries

This is authoring and review coverage within the existing launch surfaces.
No new editor, UI pattern, route, tool, store, dependency or migration was added.
The source catalogue, Data Room, Vault, project isolation, tracked remedies and
governed save/filing paths retain their existing implementations and regression
coverage. Existing CMC composition, package validation, signing, approval,
submission channels and technical safety-message/dataset qualification were not
widened. No live provider, agency acceptance, deployed readiness or green launch
row is claimed. Source limitations and recall/platform-convention basis remain
visible and require current agency/client confirmation.
