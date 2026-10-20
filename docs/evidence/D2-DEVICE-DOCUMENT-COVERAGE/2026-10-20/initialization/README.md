# Reach EU classification from project initialization

W1 / D2; the existing project wizard and creation route, under the
[device authoring contract](../../../../design/DEVICE_DOCUMENT_AUTHORING_2026-10-20.md).

## What already exists

`client/src/concept2cure/v2/surfaces/Projects.tsx` provides the registry-driven
three-step wizard. `server/routes/c2c/projects.ts` creates the program, governed
dossier and project anchor transactionally. `server/services/c2c/scaffold-project-documents.ts`
reads active `c2c_rule_packs`; changing heading templates alone cannot enable a
regional governed dossier.

`shared/regulatory/device-class.ts` owns the MDR declared and IVDR vocabularies.
`server/services/c2c/programme-profile-write.ts` already validates `euMdrClass`
and `euIvdrClass`, and `shared/schema/programs.ts` already declares their separate
columns. The project-setup interview already reaches that profile schema. The
wizard previously offered only FDA I/II/III classes for every device filing and
creation wrote only `device_class`. This increment reaches the existing regional
fields; it adds no class vocabulary, schema, style or editor.

`surfaces/AnaVerbs.tsx` already provides the actual RegistryPicker and searches
all segments without changing the current tab when a result is chosen.
`shared/constants/domain/product-types.ts` owns filing-to-product class
resolution and Diagnostics-lane refinement. That refinement previously changed
MDR/CER to IVD, and the wizard did not read an explicitly diagnostic result's
segment when selected from another lane. Those existing paths are corrected,
not replaced.

`shared/regulatory/filing-catalog.ts` already resolves exact canonical registry
IDs and aliases, while registry rows already record parent filing identities.
The class-scope helper added there reads that identity and reuses the existing
MDR declared classes, IVDR classes and MDR rule-class normalization; it does
not introduce another classification vocabulary or engine.

Root and focused code/history searches covered project initialization, device
classification, regional columns, registry, bootstrap, routes and removed wizard
paths. No competing modern project creation path was found.

## Evidence

- [Preliminary RED](preliminary-red.json) preserves the first exact execution,
  including one test-selector correction, separately from the corrected RED.
- [Corrected pre-fix RED](red.json) records actual command, exit, raw output and
  before/after source hashes against unchanged product code: 18 meaningful
  failures. The [intermediate selector capture](selector-corrected-red.json)
  remains separate, with the test source stored as original UTF-8.
- [First candidate](candidate.json): 18/18 passed before expanding the state
  round-trip and real-SQL checks. [Expanded candidate](expanded-candidate.json):
  97/98 passed; an old IVDR offer fixture incorrectly stated product type device.
  That fixture now states IVD, retaining its offer/transaction assertions, and a
  separate case proves a mismatched non-IVD is refused.
- [Final focused replay](green.json): 101/101 across 11 suites, including seven
  new wizard cases, 15 new route cases, two additional real-SQL anchor/audit
  cases, FDA predicate pairs, regulated choices, names, market refusals and the
  existing anchor/digest checks. The two owned implementation files and all
  tests stayed fixed. During this capture the parent added Japan Class I
  notification to the shared registry: that one dependency changed, and the
  wrapper correctly exited 1 on its frozen-hash assertion. The test process
  itself exited 0. All 18 after-run hashes match the files at verification.
  [Capture validation](scope-capture-validation.json) preserves the distinction;
  root combined qualification on current frozen sources supersedes this scope
  proof. The [pre-comment replay](pre-comment-replay.json) passed 101/101 with
  every dependency frozen before obsolete comments were condensed to keep the
  wizard under the repository line ceiling.
- [Lint](lint.json): five test files pass strict zero-warning lint. Product
  files have zero errors and retain their canonical warning counts (wizard
  seven, route five), compared using canonical source via stdin, without
  temporary TypeScript files. Its canonical stdin receipts come from the
  [pre-comment lint](pre-comment-lint.json). The [initial lint](candidate-lint.json) preserves
  the test-only max-parameters warning corrected by one object argument.
- [Summary](summary.json) records scope and overlapping counts.

## Cross-lane search correction

[Corrected cross-lane RED](cross-lane-red.json) records six meaningful failures:
three actual global-search selections and three canonical vocabulary assertions.
The generic FDA 510(k) selected from Diagnostics already passed and remains a
compatibility control. [Preliminary capture](cross-lane-preliminary-red.json)
retains an incomplete auth-mock diagnosis separately, with original test bytes.

The wizard now reads an explicitly diagnostic result's existing registry segment
for refinement; the canonical helper keeps MDR/CER device-only regardless of
the lane. An ambiguous generic FDA 510(k) still uses the Diagnostics lane.
The same helper's CDx comment now agrees with the existing Rule 3(f) Class C
classification record, subject to other applicable rules; no classification
engine behavior changed for CDx.

[Cross-lane focused green](cross-lane-green.json) passes 95/95 across six suites,
including actual RegistryPicker and RegistryBridge search, product vocabulary,
EU setup, FDA predicates, class refusals and market offers. Seven selected
source/test hashes stayed fixed. [Cross-lane lint](cross-lane-lint.json) checks
the modified product files and strict zero-warning test files. Counts overlap
the earlier 101-case replay and must not be added. Root's combined current-source
qualification supersedes earlier source hashes changed by this correction.

## Class-specific filing compatibility

[Class-scope RED](class-compatibility-red.json) records eight meaningful failures:
four exact-filing option lists offered contradictory classes, and four real
creation requests accepted those contradictions. A separate
[context RED](class-compatibility-context-red.json) proves that an exact EU
class-specific identity was also accepted for an FDA application with no class
stated. Both receipts retain the unchanged implementation pins and raw output.

The wizard and route now use the same canonical filing-scope helper. Exact MDR
Class I permits I, Is, Im and Ir; combined IVDR C/D permits C or D. An inherited
class-specific parent constrains its descendant, with parent cycles bounded.
General MDR/IVDR, CER and the legacy CDx identifier remain unconstrained. An
unstated class stays null, including when an exact class-specific filing was
selected; the helper never stamps a declaration on the sponsor's behalf.

[Focused green](class-compatibility-green.json) passes 80/80 across six suites,
with all 11 selected source/test pins stable during capture. This includes the
16-case new `shared/regulatory/__tests__/filing-catalog-device-classes.test.ts`,
the existing EU wizard/route suites, real cross-lane search, FDA predicate and
market-offer regressions. [Strict lint](class-compatibility-lint.json) passes
all three modified/new test files with zero errors and warnings. Product files
have zero errors; canonical warning counts remain seven for the wizard, five
for the route and one pre-existing filing-catalog complexity warning. The
filing-catalog canonical stdin baseline confirms that one existing warning.

[Earlier candidate](class-compatibility-candidate.json) and
[candidate lint](class-compatibility-candidate-lint.json) remain historical.
The [first complete scope capture](class-compatibility-scope-capture.json)
passed 80/80 but correctly records shared-registry drift during the run; it is
retained without changing that result. After the stable final capture, root
updated two Class I/A descriptions and an internal-QMS preparation notice.
Root's combined final qualification binds those final bytes and supersedes
historical dependency pins; these focused counts overlap earlier replays.

## Prior Project files rail regression

After canonical catch-up, the [unchanged prior rail replay](rail-regression-before-fixture-fix.json)
passed 21/26: entry checks passed, but five actual Workbench flows were refused
by current identity guards. Its synthetic opaque token carried no JWT actor
claims, and its document responses did not record `client_program_id`.

The existing flow fixture now encodes the same returned test user's numeric
actor/organization claims in its synthetic JWT and supplies the existing saved
document parent field. Production code, all assertions and negative
identity/project/source/ceremony guards remain unchanged.
[Corrected replay](rail-regression.json) passes 26/26 across both suites, with all
10 source/test hashes frozen. Only the fixture hash differs between red and green;
the nine production/entry dependencies match. [Strict fixture lint](rail-regression-lint.json)
passes with zero errors and warnings. This is synthetic HTTP/editor integration,
not proof of live authentication, model calls or native database policy.

The two existing PGlite fixtures now apply the existing 20261012b EU-class
migration, matching the columns already present in canonical deployment. The
real-SQL cases read IIa and D from the correct regional column, confirm the US
class stays null, and read the same creation's anchor and audit values. Both
regional nulls are explicitly recorded in the creation audit when unstated.

The wizard retains its current field/select, grid, review and step structures.
EU choices start unstated; FDA-only controls, flags and form copy stay within
FDA. Switching FDA → IVDR → FDA or MDR → IVDR → MDR retires hidden facts rather
than restoring them. The route validates existing class schemas and refuses
wrong-region FDA fields and conflicting class, product family or registry data.
No generic Canada/Japan device or IVD class was admitted.

Qualification is limited to initialized facts and existing transaction contracts.
Dossier scaffolding is mocked in these route fixtures; PGlite is not native
PostgreSQL tenant-policy/concurrency qualification. Existing development-audit
and older test act warnings are retained in raw output. No agency transmission,
human acceptance or complete regional filing suitability is inferred.
