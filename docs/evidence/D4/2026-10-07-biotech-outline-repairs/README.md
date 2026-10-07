# Anna — regional outline repairs and consistent document authoring

Workstream: W2 Authoring, launch row D4. Parent:
`c3163b5cc165616842391b02f25e837fd7a7471c`, published on
`concept2cure-v2`. The user authorized continued implementation and GitHub CI
for the full-project TypeScript check after the local host exhausted memory.
No repository gate or baseline is weakened. The parent passed the canonical
GitHub typecheck with zero errors; `ci-typecheck-c316.txt` records that result.

## Corrected document scope

| Existing registry identity | Indexed outline | Scope and qualification limit |
| --- | --- | --- |
| EU_CTA | CTIS Form/MSC, Part I and Part II | Product/Member State scope, allowed document alternatives, language and disclosure need review; platform groups are not CTD modules. |
| CA_CTA | Native administrative/clinical Module 1 and applicable quality Modules 2–3 | Initial-only PSEAT-CTA, product/phase quality scope and eCTD/non-eCTD exceptions remain explicit. |
| CA_CTA_A | Separate clinical/quality amendment scaffold | No initial-only PSEAT; change scope selects applicable evidence. |
| JP_CTN | Notification fields and conditional supporting attachments | Notification category, timing, modality, local evidence and document language require confirmation. This does not generate official XML/PDF. |
| US_IND_AMENDMENT | Existing lifecycle components selected by amendment subtype | New protocol, changed protocol, new investigator, information and CMC evidence are separate conditional branches. |
| ICH_NONCLIN_SUMMARY | Existing canonical CTD 2.6.1–2.6.7 records | No QOS, clinical summaries, 2.4 overview or Module 4 reports; the format does not determine studies required. |

Source checks, dates and exact primary references are in `regional-sources.md`
and `japan-us-nonclinical-sources.md`. Those distinguish regulator text from
platform authoring groups and conditional applicability from a waiver.

`coverage.json` records **119 of 119** active biotech registry entries with an
indexed scaffold, including **87 of 87** in US, EU, Canada, Japan and shared
global components. This measures outline availability. The remaining inherited
outlines have not all received independent current-source validation and are
not qualified document builders merely because a registry identity resolves.

## One existing authoring path

The synchronous and asynchronous catalog now use the same exact dedicated
lookup. Drafting, canonical saved outlines, registry resolution/preview,
readiness, manifests and project bootstrap consume that catalog. DSUR and CSR
project/store structures derive from the existing E2F/E3 records; no parallel
heading tree, renderer, model, integration or production dependency is added.

The full initial US IND adapter remains. IND amendments now use their actual
amendment components. CTIS, Notification, Amendment and standalone Document
groups preserve their meaning in stored section metadata. Unrecognized groups
skip chemistry keyword heuristics and record why; skipped checks are not
counted as successful checks.

Canada's exact native rows brief its regional content. Scoped CTD requests
cannot escape to full Module 2 through a parent code or title. Marketing
applications retain canonical CTD briefs and record their dedicated blueprint
provenance. Outline pages explicitly state availability and retain the existing
bounded pagination and preparation interview.

## Honest assessment

Baseline scaffold completion remains a progress measurement. It cannot resolve
conditional trial scope or eligible document alternatives. Those pathways carry
critical unassessed-applicability gaps and cannot return `ready` or
`packageComplete`. Unknown artifact requirements likewise cannot establish
readiness. Trial manifests carry their scope limitations, use CTIS for EU CTA,
and require separate Canadian format/delivery or Japanese notification review;
marketing eCTD/SmPC rules are not inherited by those trial routes.

The initial preparation update supplies focused client questions on scientific
objectives, source versions/cutoffs, protocol/SAP prespecification, estimands,
validated results, safety, quality, local evidence, agency commitments and
accountable review. Conversation markers never prove evidence sufficiency;
preparation continues to report `not_assessed` and `evidenceReviewed: false`.

## Verification

| Check | Result/evidence |
| --- | --- |
| Integrated repaired outlines, tool preparation, drafting, registry consumers and source projections | 432 passing tests, 15 files: `final-integrated.txt` |
| Actual deficiency-scan handler, including new non-CTD labels | 14 passing tests: `scan-green.txt`; seven failing before correction in `authoring-deficiency-scan-red.txt` |
| Regional CTA source/scoping checks | Nine failures before correction, nine passes after: `regional-red.txt`, `regional-green.txt` |
| Japan/US/nonclinical corrections | Failing old/absent records, then nine passes: `japan-us-nonclinical-red.txt`, `japan-us-nonclinical-green.txt` |
| Canonical consumer consistency and false-ready regression | Five original consistency failures and a false-ready failure: `consistency-red.txt`, `consistency-readiness-red.txt`; integrated suite verifies the final code |
| Bootstrap routing/group labels | Ten failures before correction, 26 passes after: `bootstrap-red.txt`, `bootstrap-green.txt` |
| Changed TypeScript ESLint | 25 files, zero errors: `lint.txt`; inherited warnings remain, warning growth must pass the unchanged push ratchet |
| Server bundle | `build-server.txt`; client sources unchanged from the parent successful production build |
| Existing Authoring canvas path | `canvas-path.txt`: unchanged gate passed |
| Canonical preflight before TypeScript | All preceding hook checks passed: `push-preflight.txt`; zero lint errors and net one fewer warning. This is not a full local pre-push pass. |
| Current-head full-project TypeScript | GitHub CI is the authorized execution host; the parent CI result does not substitute for the new head's check. |

`existing-consumers.txt` and earlier `drafting-green.txt` record intermediate
regression failures discovered when adopting dedicated marketing blueprints;
the final integrated suite verifies the corrected exact lookup and provenance.

These tests do not qualify live sponsor drafting or agency transmission. Remaining
qualification includes representative source-linked client conversations through
governed drafting/save/review/export, accountable medical/statistical/CMC and
regional SME review, supported-model PQ evidence, product-specific applicability,
validated datasets/safety messages, technical package checks and live release
evidence. No client data or filing has been created by this reference repair.

The remote advanced to `f2a4ebec7dfa80f932cb7ff311e18d25249a7302` during
verification through the existing repo-health baseline bot. Only its two report
files changed. Those updates are preserved as the direct parent of this repair;
they do not alter the source code validated against `c3163b5cc`.
