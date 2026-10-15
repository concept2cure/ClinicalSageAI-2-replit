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
| 1 — delivered in 008223d | batch_draft_sections → canonical drafting requirements: infer omitted filing type from the tenant-owned open program | Actual registered handler and real drafting resolver; US IND deep-section guidance reaches gateway, explicit choice preserved, foreign/unknown context unassessed, DB outage refused, scope and source controls preserved |
| 1b — delivered; see 2026-10-09-ana-ind-plan-honesty | Backend plan_ind_module_authoring claim | All planning output explicitly non-sealable; verification limited to its constructed plan text; caller-declared live provenance is not independent source qualification; existing payload retained |
| 1c — delivered; see 2026-10-09-ana-section-capture-scope | Existing draft_section metadata preparation | Tenant-bound row lookup against the deployed standalone table; invalid tenant refused before DB; foreign/missing indistinguishable; preparation versus generation reported honestly; no invented project qualification |
| 1d — bounded guard delivered; see 2026-10-09-ana-seal-verification-scope | Seal-route scope/negative-evidence preservation | Planning-only, explicitly incomplete and malformed verification metadata reaches the real service and is refused before pool/transaction; preserve legacy behavior without claiming authoritative qualification |
| 1e — bounded target binding delivered; see 2026-10-09-ana-seal-target-binding | Persisted seal-target binding | Every supplied artifact/version selector resolves in the tenant-owned project; explicit misses cannot create substitute rows; stored version text/hash and current artifact text must match the submitted bytes, preserving current source attribution; malformed and unanchored selectors refused; selected rows locked during sealing. This binds the target, not an authenticated source verdict |
| 1f — bounded target fidelity delivered; see 2026-10-09-ana-docx-target-fidelity | Existing DOCX verifier's persisted comparison | Server-loaded owned current artifact/version text; canonical v2 UUID anchor; exact target/content and DOCX/text hashes; current head/disposition read and post-extraction recheck; changed/missing/malformed targets refuse without caller-text fallback; explicitly fidelity-only and non-sealable. Existing immutable turn recorder captures the full result; no authenticated consumer or scientific source qualification delivered |
| 1g — bounded recorded fidelity delivered; see 2026-10-09-ana-recorded-fidelity | Existing seal route's optional historical verification reference | Canonical tenant-owned record/blob/audit-payload integrity; bounded UTF-8 transport; exact full successful platform verifier step, not a model summary; current target/anchor/head/hash/disposition recheck; malformed, forged, stale and wrong-target supplied receipts refuse. Valid fidelity still ends in SOURCE_QUALIFICATION_UNASSESSED before BEGIN or governed writes; absent-receipt legacy ok-only behavior remains open |
| 1h — immediate follow-up | Version-bound scientific source review and seal admission | Legacy caller ok cannot establish source qualification. Define and qualify actual reviewed source/target versions through existing governed review, lineage and approval records, then replace legacy admission with reachable authenticated review. Omitted, forged, negative, stale, withdrawn or wrong-target proof must refuse; historical integrity and copying fidelity are not scientific review |
| 2 | Canonical CTD hierarchy/content alignment | Every audited leaf classified exact-content, inherited-content, structure-only or unindexed; controlled mapping of regional M1; numbered table coverage and repeatable study/product instances; unknown codes refused without invented requirements |
| 3 | Product-specific applicability in the existing requirements resolver | Phase/modality/population facts select required/conditional/not-applicable/undetermined with a basis and reason; unknown facts remain gaps; early-phase IND is not forced into a complete marketing dossier |
| 4 | Therapeutic and modality overlays in the existing drafting path | Section-scoped verified references, indication and product constraints reach nested drafting; risk/endpoint instructions fit the actual product; no contradictions between an oncology profile and a CGT modality |
| 5 | Regulatory currency and evidence time | Scope-matched dated citations; draft/final distinction; publication versus effective dates; supersession and verification age; reproducible historical as-of answers; stale/unverified references visibly unresolved |
| 6 | End-to-end IND qualification through existing authoring/review/export | Representative cross-dimension scenarios with section-specific scoring, source receipts, faithful tables/numbers, missing/conflicting data, source updates and sequence lifecycle; qualified model and human regulatory review before acceptance claims |

### Bounded progress, 2026-10-09: CMC depth and nested product context

The coordinated follow-up adds 12 exact CMC content records (three substance
identity leaves and nine pharmaceutical-development leaves) and two structural
parents through the existing canonical record. The recorded inventory is now
127 content records and 122 structural records, with 203 terminal nodes: 103
exact-content and 100 structure-only. The denominator changes as former parents
gain leaves; these are encoded lifecycle counts, not a complete initial-IND
census or a qualification percentage. Phase/product uncertainty and early-IND
evidence limits are preserved. FDA's draft M4Q(R2) numbering is not substituted
for the reviewed final structure. Evidence:
`docs/evidence/D4/2026-10-09-ana-ind-cmc-leaf-guidance/`.

Nested drafting now accepts independent caller-declared therapeutic-area and
modality labels through the existing batch tool, with structurally scoped rules
and common gaps from the existing registries. Unknown/ambiguous labels remain
unassessed; the prompt and gateway metadata explicitly distinguish declared
advisory context from server-loaded or qualified evidence. Wiring tests traverse
25 profiles and 11 modalities (275 inputs), not scientific qualification of all
combinations. Automatic owned-program context projection, scientific review,
applicability and currency remain open. Evidence:
`docs/evidence/D4/2026-10-09-ana-ind-product-context/`.

`docs/design/ANA_IND_REQUIREMENTS_BACKLOG.md` now enumerates all 100 recorded
structure-only terminal sections, their nearest exact-guidance ancestors and
bounded follow-up scopes. Its reproducible audit preserves unresolved initial
IND applicability and the canonical source hashes. It also identifies shared
qualification needs; inherited guidance is not counted as exact leaf content.

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

Remote release qualification remains separate from local checks. The prior
4eda1a3d browser-schema provisioning blocker was subsequently repaired in
a17157f3 and verified by successful Tier 5 run 37983068322; b879e9a9 records the
completed verification at
`docs/evidence/D1/2026-10-09-fresh-ana-runs/POST_PUSH_VERIFICATION.md`.
The Handlebars dependency blocker is repaired and freshly verified by the
successful Security Scan job 114044298588 in CI run 37996641066 on implementation
`b4badf56`. Ordinary full-project TypeScript, all four Tier 5 checks and the
named AnA readiness suite also passed on that SHA. The permanent receipt is
[`POST_PUSH_VERIFICATION.md`](../evidence/D4/2026-10-09-ana-ind-depth-delivery/POST_PUSH_VERIFICATION.md).
Completed proof/guard, tenant-purge and Semgrep failures remain separate
release blockers; pending wider test results are not passing evidence.
Local test/build/pre-push success must not be reported as remote CI success or
commercial deployment while those release blockers remain open.
