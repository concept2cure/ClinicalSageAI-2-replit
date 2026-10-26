# Merged A2.10 source review

Independent static review of local `37f2ed240` converging with incoming
`c7f320403`, 2026-10-26. This note reports source inspection and comparisons;
it does not report new test, browser, database or formal OQ execution.

## What already exists

The shared filing catalogue, RegistryPicker, Projects wizard, ProjectPlan,
ProjectHome context, alias/action resolver and catalogue migration writers are
the existing owners. Incoming A2.10a supplies the stricter exact-filing
admissions and recorded type/agency matching. The continuation supplies metadata
inspection for unavailable filings and its distinct AnA state, CRO label fixes,
and already-in-scope command-description clarification. These converge on one
reference widget and one catalogue replay test owner.

## Findings

No implementation blocker was found in the reviewed merged source.
`source-review-proof.json` records the comparison basis and source hashes.

- **Reference admission:** seven declarations are byte-identical to incoming
  A2.10a: ADMISSIONS, knownAgency, contextMatches, filingLifecycleReferenceFor,
  the original loop prose, archetype table and workflow labels. A broad alias
  cannot select a guide. Plan and ProjectHome supply the exact recorded identity
  plus programme type and primary agency; a missing, unknown or conflicting
  context remains unavailable. No commercial or clinical eligibility is granted.
- **One projection:** `surfaces/FilingLifecycleReference.tsx` owns both the
  collapsed guide and **FilingReferenceDetails**, the actual metadata export.
  The earlier `v2/FilingReference.tsx`, independent FilingsCatalog screen and
  fixture owner are removed. RegistryPicker's chosen and unavailable entries
  and ProjectPlan use that owner. Unavailable entries have reference-only
  details and a distinct label; they cannot call selection or a writer.
- **One context owner:** Projects publishes one projects context, containing
  one filingBrowser object with segment, searchTerm and inspectedReference.
  Catalogue inspection stays distinct from selectedFiling. The picker clears
  an inspected reference when filters, segment or offers invalidate it, and
  publishes controlled catalogue facts rather than typed configuration fields.
  ProjectHome keeps its own existing selected-project context publisher.
- **Public identity:** PROGRAM_DETAIL_SQL, serializeProgramDetail and
  readProgramDetail match incoming source exactly. The serializer resolves only
  an exact active canonical catalogue id, normalizes casing/outer whitespace,
  and withholds unknown/broad aliases and registry-only fallbacks. Private
  metadata remains destructured out of the response. The recorded identity is
  not itself a claim that a guide matches the programme type/agency.
- **Routing:** the legacy id uses the existing shared resolver and
  projects.new-project action with Projects as the global destination. Its
  old registry/view/module rows and deferred identity are removed; Projects
  remains. The alias action uses no project or commercial grant. Existing
  scope-aware routing and query/hash handling remain the established owners.
- **Replay:** catalog-module-claims.contract.test.ts now carries the fresh
  install/replay case. Its shared harness extracts real base DDL and runs the
  actual catalogue writers in deploy order. The historical-subscription case
  uses the matching cascading module FK, repeats the two amended writers and
  checks row/metadata preservation. The smaller parallel
  filing-catalog-fold-replay.pglite.test.ts is removed. These are catalogue SQL
  checks, not full deployment or native PostgreSQL/RLS qualification claims.
- **Safeguards:** six existing guard/dispatch/policy/service files match the
  pre-continuation source. Phase-2 command handler bodies and all executable
  AnA inventory arrays are unchanged; only the two descriptions and historical
  ownership note move. Launch admission, MDX feature ids, request database
  ownership and canonical PM-anchor services are unchanged in this workstream.

## Evidence and documentation attribution

The root A2.10 README attributes the continuation's 378 tests, 16 native cases,
three browser flows and build to the archived pre-merge source; accepted A2.10a
evidence retains its own namespace. Those counts do not qualify the merged
implementation. Final merged qualification belongs under merged/.

During review, the active remaining-fold design's stale combined-qualification
wording and pending-widget-convergence sentence were reported and corrected by
the lead. The four-fold audit's command/CRO evidence paths now point to the
pre-merge archive. Historical snapshots retain their original owner names and
counts. Revised formal OQ remains unexecuted and unsigned.
