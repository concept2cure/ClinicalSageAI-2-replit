# Source-first assembly backend evidence

Base: `ff5e065a7`, canonical `concept2cure-v2`. Production and test source are
frozen. This extends the existing assembly transaction and section writer; it
adds no editor, database schema, dependency, provider or parallel write path.

`initial-red.log` records a real authenticated HTTP failure before implementation:
an explicitly empty source selection was ignored and returned a successful
template-only plan (200), instead of refusing the invalid selection (400).

`final-tests.log`: **114 / 114 passed across nine files**. This includes 48
authenticated assembly HTTP cases: the existing 33 plus 15 source-selection
cases. Other files exercise complete existing outline planning, shared section
transactions/placement/guidance, unchanged section-draft source behavior, and
canonical CRE source identity/CRUD. The pure outline test covers all 305 builtin
templates / 4,308 section rows, including the 295-section outline; this is
planning coverage, not 4,308 SQL inserts or proof of filing suitability.

The new HTTP/SQL cases exercise ordered mixed unfiled CRE/Vault references,
exact text-free manifests, retained text after `keep_data`, preservation of
existing prose/order/original provenance, document reference evidence when all
target sections already exist, identical manifests on appended section events,
same-length extraction changes in both stores, exact bounded span verification,
forged excerpt hashes, cross-project exclusion before source-body reads,
unreadable/withdrawn/superseded sources, expected-checksum mismatch, fresh private
source-parent admission, and rollback when the distinct source audit event fails.

`source-pins.json` retains the historical exact bytes of 43 source/test files
taken before and after this replay. Every hash matched during that run. The
canonical branch was subsequently fast-forwarded from `ff5e065a7` to
`8d06f7156`, and the cross-owner authoring router subsequently changed for
uncertain acceptance handling. The five owned production files and owned HTTP
test still match these pins; the router is the sole differing file in this
43-file map at qualification time. The original pins and logs are preserved.
Root's later integration receipts qualify the later router and final tree;
this replay does not claim to have tested those subsequent bytes.

A later official compiler identified a control-flow typing issue in the new
resolver. The bounded function-declaration correction and a 62-case HTTP replay
on the later frozen router are recorded separately in
[compiler-remedy/README.md](compiler-remedy/README.md). This original replay's
pins and logs remain unchanged.

`lint-final.json` / `lint-summary.json`: six scoped files, zero errors. Five
existing evidence-spine warnings are unchanged; every other scoped production
and test file has zero warnings. `sql-gate.log` records the passing SQL
interpolation gate without baseline changes. Scoped `git diff --check` passed.

The tests use PGlite with real SQL and the existing signed-JWT HTTP fixture.
Its single-slot assembly pool also checks that source reads and commit guards
reuse the caller's connection. These are not native PostgreSQL concurrency,
live-provider, human-testing or deployment receipts. No provider was called.

The manifest records source-reference intent. It does not claim citation
support, model consumption, scientific qualification, approval or filing readiness.
Source text is not copied into actor-authored scientific prose by deterministic
assembly. The existing explicit whole-source import remains separate.

The [log storage receipt](../release/evidence-log-storage.json) preserves the
original raw log bytes/hashes; readable logs normalize surplus blank lines at EOF.
