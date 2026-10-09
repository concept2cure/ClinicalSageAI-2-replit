# AnA IND coverage and qualification plan

Owner: W3 authoring / D4 governed workflow. Canonical branch: concept2cure-v2.
Created 2026-10-09 UTC in response to the founder's request for full IND depth,
therapeutic coverage, project awareness and regulatory temporal awareness.

This plan extends the existing ANA_REGULATORY_RECORD.md and its single-record
architecture. It authorizes no parallel registry, model, tool, UI or inference
engine. The current implementation remains incomplete against this target.

## The capability to prove

AnA must identify the applicable document/section, retrieve its recorded
requirements, use the right project's qualified evidence and current versions,
preserve unknown applicability and missing data, produce a traceable draft, and
carry that draft through existing review, approval and submission controls.
Generating fluent prose or finding a template is not sufficient evidence.

Thousands of documents can be instances of the same controlled section template
for different studies, products, versions and sequences. The engineering unit is
the canonical section and its applicable variants, not a separate hand-written
file for every possible combination. Do not multiply templates to inflate counts.

| Coverage dimension | Facts that change the appropriate draft |
|---|---|
| Filing and sequence | Initial IND, protocol/information amendments, safety reports, annual reports, clinical-hold responses, agency correspondence and referenced dossiers |
| Hierarchy | Regional Module 1, M2 summaries, M3 substance/product CMC, M4 nonclinical reports and M5 clinical documents; deeper headings, tables and repeating study/product leaves |
| Therapeutic area | Indication, disease stage, prior treatment, relevant endpoints and safety risks; a general area label does not establish a disease-specific requirement |
| Modality | Small molecule, biologic, cell/gene therapy, vaccine and other existing modality vocabulary, independent of disease area |
| Development context | Phase, route/dose/duration, population, product components, manufacturing site/process, prior human experience and agency agreements |
| Evidence | Owned project/program, source identity/version/hash, extraction limitations, study status, conflicting results and retained data after original-file withdrawal |
| Time | Study/data cutoff, source version, guidance publication/adoption/effective dates, draft/final/withdrawn status, supersession and last verification |
| Governance | Draft, needs evidence, review, approved and filed are distinct; source selection and successful generation do not grant approval |

## Audited starting point

Baseline: 6071cce1821115faff223dd84fa7ceacf7d01656. See the dated evidence at
docs/evidence/D4/2026-10-09-ana-ind-submission-context/ and its reproducible audit.

| Existing record | Observed inventory | What it proves |
|---|---:|---|
| Deep IND package tree | 107 nodes; 87 terminal nodes; 37 terminal nodes tagged AI-draftable | A package scaffold and its flags, not verified generation of every leaf |
| CTD authoring overlay | 115 records | Recorded per-section content guidance across the FDA lifecycle |
| Additional ICH structure | 120 records | Headings and structure; not detailed content guidance |
| Combined record | 235 nodes; 193 terminal nodes: 93 exact-guidance, 100 structure-only | A measurable recorded-content gap; not a complete official hierarchy |
| Therapeutic profiles | 25 profiles; 238 context rules; 304 reference entries (may repeat) | Static coverage of the product vocabulary; not 25 verified clinical SME evaluations |
| Modality vocabulary | 11 modalities | Existing product classification vocabulary; not qualification of all combinations |
| US IND regional Module 1 projection | 25 nodes; 20 terminal nodes; 6 exact overlay matches | Registry projections differ; counts cannot establish one-to-one authoring coverage |
| Legacy IND generation route | 19 accepted codes | A legacy route limitation; retired AnA tools no longer use that route |

The combined inventory is not a census of all required initial IND documents.
It contains lifecycle/marketing sections and omits some numbered tables. Detailed
ancestor guidance is not counted as exact leaf guidance. A requiredFor tag is a
necessity flag, not an applicability decision. Optional is not inapplicable.

## Bounded delivery sequence

| Priority | Existing path to improve | Acceptance evidence |
|---|---|---|
| 1 — current batch | batch_draft_sections → canonical drafting requirements: infer omitted filing type from the tenant-owned open program | Actual registered handler and real drafting resolver; US IND deep-section guidance reaches gateway, explicit choice preserved, foreign/unknown context unassessed, DB outage refused, scope and source controls preserved |
| 1b — immediate follow-ups | Existing draft_section capture and plan_ind_module_authoring honesty gate | Tenant/project predicate on the captured row; capture versus generation reported honestly; empty/unqualified model-supplied facts cannot establish sealability; real fail-first cases before any acceptance claim |
| 2 | Canonical CTD hierarchy/content alignment | Every audited leaf classified exact-content, inherited-content, structure-only or unindexed; controlled mapping of regional M1; numbered table coverage and repeatable study/product instances; unknown codes refused without invented requirements |
| 3 | Product-specific applicability in the existing requirements resolver | Phase/modality/population facts select required/conditional/not-applicable/undetermined with a basis and reason; unknown facts remain gaps; early-phase IND is not forced into a complete marketing dossier |
| 4 | Therapeutic and modality overlays in the existing drafting path | Section-scoped verified references, indication and product constraints reach nested drafting; risk/endpoint instructions fit the actual product; no contradictions between an oncology profile and a CGT modality |
| 5 | Regulatory currency and evidence time | Scope-matched dated citations; draft/final distinction; publication versus effective dates; supersession and verification age; reproducible historical as-of answers; stale/unverified references visibly unresolved |
| 6 | End-to-end IND qualification through existing authoring/review/export | Representative cross-dimension scenarios with section-specific scoring, source receipts, faithful tables/numbers, missing/conflicting data, source updates and sequence lifecycle; qualified model and human regulatory review before acceptance claims |

The existing curated currency registry is useful but not comprehensive. Its FDA
guidance ingestion service explicitly reports no connected guidance index. A
live authoritative update feed, if needed, requires its own evaluated bounded
integration; no such integration is added by this delivery. Do not claim automatic
regulatory currency because a static profile contains a guidance title.

## Evaluation contract

Build representative scenarios from the existing 25-area and 11-modality
vocabularies, then deepen high-risk combinations and previously failing sections.
Include ordinary small-molecule INDs, oncology at different disease stages,
rare-disease gene therapy, cell therapy, vaccines, pediatric development, prior
human experience, referenced master files and safety/annual amendments. Not every
area/modality pair is scientifically meaningful; document applicability.

Each scenario must pin the selected filing, requested leaf, phase/product facts,
source cutoff and version, applicable guidance and verification date. Score
placement, content, applicability, evidence fidelity, temporal accuracy and
governance separately. A catalogue traversal can prove reachability, not scientific
correctness. Prompt-wiring tests with a gateway double cannot establish model PQ.

Negative cases include missing or ambiguous agency, withheld phase/modality,
unknown subsection, draft guidance presented as final, post-cutoff evidence,
superseded results, absent study data, source mutation before saving, wrong tenant
or project, truncated content, and misleading completion percentages. Show each
new gate failing on the defect it is meant to catch.

Report progress using the relevant denominator and observed test class. Preserve
partial and unassessed states. Never describe all therapeutic areas, all IND
subsections or submission readiness as complete based on counts or prose length.
