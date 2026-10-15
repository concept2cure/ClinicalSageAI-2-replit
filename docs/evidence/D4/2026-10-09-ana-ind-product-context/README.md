# D4: retain product context in nested IND drafting

Canonical branch: `concept2cure-v2`. Base: `b879e9a9`.
Workstream: W3 authoring / D4 governed workflow. Recorded 2026-10-09.

The registered `batch_draft_sections` tool previously described only device
context fields. Its nested drafting call had no therapeutic-area or modality
advisory block, even though the existing platform registries already held those
profiles. This batch extends the existing request and tool schema with two
optional labels, and the real drafting method uses the existing canonical
registries. No UI, model, provider, database table, source loader or drafting
engine is added.

Therapeutic area and modality remain independent. Neither is inferred from the
other, from an indication, or from a broad `biologic`/`mrna` label. Unknown values
remain unassessed. Gateway metadata records the canonical labels and explicitly
states `caller-declared-unverified`. These fields are **not automatically loaded
from the open program**, independently verified project facts, study evidence,
an applicability verdict or scientific qualification.

For a known CTD section, the existing profile renderer's optional scoped mode
retains only matching or always context rules and matching common-gap records.
Unrelated clinical safety/efficacy rules and gaps are excluded from CMC drafting.
The default renderer behavior remains unchanged for other consumers. Unscoped
risk/reviewer/reference text remains general advisory, not section requirements.
The existing modality CMC reference set is supplied only to Module 3 drafts,
with currency and product/phase applicability explicitly unverified. No new
regulatory facts or reference claims are added to those registries.

The source-selection and version-bound source receipts remain independent.
No source selection is promoted to scientific review. Unsupported results,
phase, population and disease-stage facts stay explicit gaps; static profile
references do not establish current guidance status or effective dates.

## Regression evidence

The real drafting method and registered batch handler execute with a gateway
double. All 25 existing profiles and 11 existing modalities reach nested IND
drafting in 275 input combinations. This proves deterministic prompt wiring,
not scientific suitability of every combination, model performance, provider
qualification or submission readiness.

Independent review found two defects and each was reproduced before repair:

| Defect | Observed failure | Repair |
|---|---|---|
| Modality aliases inherited object properties | `__proto__` and `constructor` produced two failing CMC drafting cases before the normalizer repair. | Canonical `normalizeModality` now accepts only own alias keys. Permanent normalizer and real-drafting tests cover inherited names. |
| Common-gap records ignored active section | Oncology CMC received clinical benefit-risk/efficacy gaps; the new negative assertion failed. | Optional scoped rendering filters common gaps by exact section or their declared prefix semantics. |

Focused product-context and canonical modality checks pass 309 tests in two
files. The coordinated final selection passes 1,965 tests in 80 files across
regulatory records, drafting/source handling, program scoping, modality,
regional context and signature target binding. See the coordinated delivery
record for final build, full TypeScript, pre-push and remote check results.

The unrelated baseline ESLint failure in the signature-target fixture is also
corrected by naming and then invoking the transpiled module function. Its
production-module adapter regression passes; no signing runtime is changed.

## Still open

Automatic product-context projection from owned modern program records,
indication-specific and phase-specific applicability decisions, reviewed
currency/effective-date evidence, scientific source qualification, strict
hierarchy validation and live model/end-to-end IND qualification remain open.
This batch does not claim all IND documents or therapeutic-area SME evaluations
complete. The existing IND coverage plan remains the governing follow-through.
