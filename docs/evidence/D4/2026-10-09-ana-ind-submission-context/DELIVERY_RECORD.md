# AnA IND filing context and coverage audit — W3 / D4

Canonical branch: concept2cure-v2.
Release base: d2f0b73714bbc3a2966108966ffafd98cb1d4a97.
Audit baseline: 6071cce1821115faff223dd84fa7ceacf7d01656.
The intervening automatic health update changed two reports only and is preserved.
No UI changes.

## Delivered behavior

AnA's active batch_draft_sections path could skip recorded section requirements
when submission_type was omitted, even in an open IND project. It now consults
the owned open program using the existing tenant/project resolver and filing
registry mapping. A known canonical filing reaches the existing drafting service
and section resolver, including supported deep IND/CTD sections.

Explicit nonblank filing choices are unchanged and do not acquire a database
pool. Missing/blank choices consult the program once per batch. A recorded choice
has precedence over older type/agency fields. Malformed/unknown selections,
foreign/deleted records and ambiguous agencies never create a US filing default.
When no known filing resolves, unsaved planning drafts remain available with an
explicit requirements-unassessed prompt note. A database verification outage
refuses inference and generation through the existing batch failure receipt.

The production change is a read-only helper and two lines in the existing batch
handler. It adds no parallel template registry, model, tool, capability or UI.
The 20-section cap, concurrency, source-loading controls, per-item receipts,
retry association, gateway governance and governed save path remain unchanged.
Successful generation remains unsaved and unapproved.

## Coverage findings and next work

The audit records 115 authoring entries and 120 additional structural entries.
Their combined 193 terminal nodes include 93 exact-guidance nodes and 100
structure-only nodes. This encoded FDA lifecycle includes optional/marketing
content and omits some numbered tables; it is not the number of mandatory IND
documents or proof that every leaf can be generated correctly.

The 25 therapeutic profiles carry static instructions/reference entries, not
universal verified clinical expertise. Regulatory currency is curated; there is
no connected FDA guidance index in the existing ingestion service. Product and
phase applicability, deeper content/table coverage, modality/therapeutic overlays,
dated authoritative grounding and end-to-end qualification remain explicit work.

See IND_COVERAGE_AUDIT.md, audit/coverage-inventory.json,
REGULATORY_SOURCE_REVIEW.md and docs/design/ANA_IND_COVERAGE_PLAN.md.

## Qualification

All qualification passed on the frozen production/test bytes:

- Focused registered-handler/PGlite/canonical-resolver suite: 32 passed.
- Fail-first on the original executor: 29 failed, 3 invariants passed. The
  candidate was restored byte-exactly in finally before the final pass.
- Bounded AnA/IND/context regression selection: 607 passed across 28 selected
  files, 0 failed or skipped, in 41.024 seconds.
- Production build passed in 18.486 seconds.
- Forced lint: 0 errors; 99 existing executor warnings, 0 helper/test warnings.
  Normal pre-commit checks passed; git diff --check passed.
- Full unchanged pre-push gate passed in 61.688 seconds.
  TypeScript: 0 errors, tsc exit 0.

The native compiler helper prepared the incremental cache only. The unchanged
hook and actual tsc result establish qualification. Independent review approved
the exact source pins and coverage boundaries. Source hashes, raw commands and
results are retained alongside the audit and reproducible inventory.

Client tree remains f4a50c306387585250e354c68e08a099362e3823.
Publication uses a non-force expected-head update of concept2cure-v2. Remote CI
is separate from this local qualification and is reported at delivery.

## Boundaries

Focused tests execute the real registered handler, canonical project/filing
mapping and drafting resolver, with PostgreSQL-compatible PGlite queries. The
model gateway is a test double. These checks prove context/prompt wiring and
contracts; they do not establish model PQ, scientific correctness, regulator
acceptance or deployment readiness for every IND variant. No deployed database
or live model was used. Publication is not a production deployment or a
full-repository test verdict.
