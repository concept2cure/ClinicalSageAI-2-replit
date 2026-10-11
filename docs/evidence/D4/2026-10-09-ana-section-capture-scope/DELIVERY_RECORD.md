# AnA section preparation scope — W3 / D4

Canonical branch: concept2cure-v2.
Initial base: dc90f337d44670324923f795c076052b33f1ffde.
Release base: f1759e4becfe25be8bf8bdafed01424d7e9fdeb7 (report-health-only advance).
No UI changes.

## Delivered behavior

The existing draft_section command reads a doc_sections row and returns its
sectionId, code and title. It does not generate or save draft content. The old
lookup matched only the section identifier, while the command description
claimed AI-generated submission-ready prose.

The lookup now requires the authenticated command context's positive safe-integer
organizationId and matches both id and tenant_id. An invalid tenant is refused
before acquiring a database connection. A missing section and another tenant's
section produce the same not-found result without disclosing metadata. Database
failures remain failures.

An owned result preserves its original identifiers and adds status:prepared and
draftGenerated:false inside data. The message and backend registry description
explicitly say the result is metadata preparation, with no draft generated or
saved. Existing authorization, proposal/confirmation and governed authoring paths
are preserved. There is no new generation capability or automatic handoff.

## Qualification

All qualification passed on the frozen production/test bytes:

- Focused actual-command/deployed-DDL/PGlite suite: 22 passed in 7.959 seconds.
- Natural fail-first before production edits: 18 failed, 4 required-input and
  unconfirmed-dispatch invariants passed, in 8.108 seconds. The
  original real query disclosed the seeded foreign tenant's metadata.
- Bounded AnA/IND/command-governance regression selection: 736
  passed across 35 selected files, 0 failed or skipped, in
  52.670 seconds.
- Production build passed in 18.163 seconds.
- Forced lint: 0 errors; unchanged command-executor 18 warnings; new test 0
  warnings. Normal pre-commit and git diff --check passed.
- Full unchanged pre-push gate passed in 58.239 seconds.
  TypeScript: 0 errors, tsc exit 0.

The native compiler helper prepared the incremental cache only. The unchanged
hook and actual tsc result establish qualification. Independent review approved
the exact source pins and schema/consumer boundaries. The production file is
byte-identical outside draftSection and its backend registry description. Source
hashes, raw commands, results and the review are retained in this directory.

Client tree remains f4a50c306387585250e354c68e08a099362e3823.
Publication uses a non-force expected-head update of concept2cure-v2. Remote CI
is separate from local qualification and is reported at delivery.

## Boundaries

The deployed standalone table has tenant_id INTEGER NOT NULL and a nullable soft
doc_id reference, with no authoritative project relationship. This correction
establishes tenant binding for this capture command; it does not establish active
project ownership, qualified source selection or complete CTD content. The
quarantined legacy document schema is not used to invent a project join.

Tests exercise the actual command and its parameterized query against PGlite
with the deployed creator DDL. They do not establish deployment, regulator
acceptance, full-repository test success, all-IND template coverage or scientific
qualification. Separate seal-route enforcement and the broader IND hierarchy,
applicability, therapeutic/modality and temporal qualification plan remain open.
