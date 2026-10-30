# IND and regional trial-application expertise review — 2026-10-30

Requested continuation: catch up on the intervening changes, then identify ways
to improve IND report generation across therapeutic areas and major regions.
Read base `438287ed1` after synchronizing from `ef8d6e8b`. D4 governed drafting,
within the existing P-73 / D2 Authoring direction. This review extends
`TRIAL_APPLICATION_DRAFTING_2026-10-30.md`; it is not another drafting roadmap,
resolver, application, filing registry or authority for production readiness.

## What already exists

- P-73 already admits trial-application drafting for every region/therapeutic
  area/modality while preserving P-28's small-molecule US-IND CMC composition
  boundary. Slices 1 and 2 resolve known recorded trial applications and carry
  their requirements to the existing editor. The active work-order lane retains
  its panel, assembly, recorded product-fact, regional-content and applicability
  slices. Extend that work; do not duplicate it.
- `draft-submission-context.ts`, `c2c/program-registry-context.ts`,
  `AnaDocumentDraftingService.resolveDraftingRequirements`, CTD requirements
  records and regional blueprints own identity and requirements. The editor's
  `authoring-draft-template.ts` now reaches these. Explicit ambiguity and missing
  regional content remain visible; an IND label is not a worldwide application.
- `ana/therapeutic-area-profiles/` holds 25 profiles. Its existing registry,
  renderer, structural section filters and retrieval boosts already work with
  declared advisory context in nested batch drafting. The types have authority,
  title and rationale but no structured publication/effective/verification dates,
  draft/final/withdrawn status or product/population applicability. A profile
  count is not evaluated subject-matter expertise.
- `project_charters` holds therapeutic area/development stage, the program holds
  product type and indication, and existing modality vocabularies are separate
  from disease area. P-73 records their missing propagation into the editor;
  recorded data must not be promoted to scientifically qualified evidence.
- The existing CSR lane now carries source-bound numeric review, deterministic
  tabulation, retained evidence, narratives, review routes and signed release
  controls. Reuse these source/claim/review owners for clinical IND sections;
  do not create another report writer or relax their guards.
- The existing oncology profile's Project Optimus rule and its guidance rationale
  say randomized dose finding is universally expected before pivotal trials.
  The official FDA final guidance landing page (August 2024) explicitly excludes
  first-in-human starting-dose selection and several product categories, and
  does not specifically address pediatric development. This is a confirmed
  expertise overclaim in an existing owner, not missing infrastructure.
- Targeted current-source/history searches covered the existing owners and
  related IND/CTA/report/profile routes. Oncology's last available change is the
  retained 2026-10-26 baseline. No second profile or generation service is needed.

## Bounded correction

Correct only the existing oncology rule and reference rationale: identify the
actual final guidance, require recorded phase/product/population and applicability
assessment, retain dose-optimization review, remove the universal two-dose claim,
and state its explicit scope exclusions. No dose, trial design, eligibility,
clinical verdict or new regulatory requirement is invented. The existing profile
renderer must carry that scoped knowledge; other profiles and executable tools
remain unchanged. Show the correction red before production edits.

The evidence README will distinguish caught-up changes, confirmed current gaps,
prioritized recommendations, authoritative source observations and the narrow
implemented correction. Live model performance, all-TA coverage and agency
acceptance remain unassessed.
