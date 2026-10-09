# Existing IND and AnA coverage audit

Read-only baseline: 6071cce1821115faff223dd84fa7ceacf7d01656, canonical branch
concept2cure-v2. User priority: full IND depth across therapeutic areas, with
product/project context and temporal knowledge. No UI changes.

## Finding and current correction

The active AnA path is batch_draft_sections in AnaToolExecutor.ts, followed by
AnaDocumentDraftingService.draftDocument and resolveDraftingRequirements. Returned
drafts remain unsaved until promoted through draft_authoring_document and the
existing qualification/confirmation gates. The retired ind_* tool route is not
the priority implementation path.

The batch handler previously forwarded an omitted submission_type as undefined.
The resolver then returned requirements:null and requirementsSource:none. Thus a
deep IND request could miss recorded section guidance even with an IND project
open. The current bounded correction recovers a known canonical filing from the
tenant-owned open program. It does not guess a jurisdiction, upgrade a template,
alter requirements content or qualify all IND drafting.

## What exists and what is missing

| Area | Existing canonical source | Material audit observation |
|---|---|---|
| IND package | services/regulatory/ind-ectd-sections.ts | 107-node package scaffold with 87 terminal nodes; flags are not generation qualification. Some M4 reports are intentionally imported rather than model drafted. |
| Content and hierarchy | server/services/ind/ctd/{authoring-guidance,ich-m4-headings}.ts | 115 authoring records plus 120 additional structural records. Of 193 terminal nodes, 93 have exact guidance and 100 only structure. Ancestor guidance is not an exact leaf template. |
| Regional M1 | shared/regulatory/regional-module1.ts | Conditional rules exist, but projections and deep-tree initial flags are not fully aligned, including financial-disclosure placement. Required/optional metadata does not resolve product applicability. |
| M2 summaries | server/services/regulatory/ctd-module-structure.ts; shared/ana/ind-module-authoring.ts | The former omits 2.6.5/2.6.7. The specialized transcription template supports 2.5/2.7 with six/four headers and omits their remaining literature/synopsis sections. This limited helper does not represent all AnA authoring capability. |
| M3 CMC | CTD overlay and ICH structural record | Detailed records/structural rows are missing for examples including 3.2.S.1.1, 3.2.A.1–3 and pharmaceutical-development subdivisions. Parent prose can resolve, but exact coverage remains unproven. |
| M4 nonclinical | ICH structural record | Numbered tabulated-summary tables are not modeled. Original study reports should be source-grounded/imported; missing AI-draftable flags alone are not defects. |
| M5 clinical | CTD overlay/lifecycle types | Optional prior-human sections exist. The IND necessity tag mainly selecting 5.4 cannot serve as an applicability allowlist for every IND. |
| Therapeutic context | server/services/ana/therapeutic-area-profiles/ | 25 profiles, 238 rules, 304 reference entries. Tests check vocabulary/text shape and wiring, not clinical correctness of all area/section/modality combinations. |
| Modality | shared/regulatory/modality.ts | 11 existing classifications. Therapeutic area and modality need independent, compatible overlays; gene therapy can be relevant to oncology or rare disease. |
| Project evidence | draft-project-sources.ts and drafting-source-lineage.ts | Server-loaded owned/current sources have hash-bound bounded excerpts and save-time rechecks. Selected/extracted is not scientifically qualified or approved. Product/phase/time context still needs systematic drafting coverage. |
| Regulatory time | regulatory-currency/{currency-registry,guidance-ingestion-service}.ts | Dated facts, verification-age and as-of helpers exist. The registry is curated, not universal; FDA guidance search explicitly reports no connected guidance index. Therapeutic references themselves lack dated verification metadata. |
| Legacy generation | server/routes/ind-generation.ts | Only 19 legacy codes are accepted, rejecting 104 exact overlay entries. Existing canonical AnA tools use the replacement path; widening a retired path is deferred. |

Some IND journey prose has embedded undated or older references and fixed study
timing statements, independent of the canonical record. They need a separate
source-grounded review, not a bulk string replacement or assumed new requirement.

Additional bounded follow-ups were identified during the execution review:

- command-executor.ts draft_section reads doc_sections by id alone. Its deployed
  creator carries tenant_id. Add and verify the tenant/project row binding and
  reconcile the command's drafting claim with its actual capture-only behavior.
  This audit did not exercise a live cross-tenant record; it is a concrete query
  and contract gap requiring fail-first verification.
- plan_ind_module_authoring consumes model-supplied facts and provenance, verifies
  its own built text, and can report sealable with live provenance and no facts.
  Self-consistent transcription is not independent evidence qualification or
  section completeness. Verify and correct the honesty gate in a separate batch.
- CTD RequirementAnswer basis remains empty for these sections. The temporal
  basis/currency records are not mandatory inputs to each CTD draft. Current
  Vault versions do not by themselves establish study cutoff or regulatory
  currency. These gaps must remain visible in any expertise/readiness claim.

## Limits of this audit

Inventory counts cover the encoded FDA lifecycle, including optional/marketing
sections. They are neither an official complete CTD census nor required initial
IND-document counts. Some official table numbers are explicitly unmodeled.
This audit did not run all hierarchy/therapeutic combinations through a live
qualified model, review every guidance document, query a deployed sponsor database
or establish FDA acceptance. The plan and this delivery must retain those limits.

The implementable sequence and evaluation contract are in
docs/design/ANA_IND_COVERAGE_PLAN.md. Regulatory observations and their primary
URLs are in REGULATORY_SOURCE_REVIEW.md. Runtime counts and their reproduction
script are retained in the audit subdirectory.
