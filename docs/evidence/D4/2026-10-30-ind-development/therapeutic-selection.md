# Therapeutic knowledge selection in existing IND/CTA drafting

Scope: W3 / D4; extends the existing profile renderer only. No new app, registry,
model or drafting route. P-73's recorded-context projection is owned by the lead
session; this slice does not change it or the oncology scope correction.

## What already exists

- `server/services/ana/therapeutic-area-profiles/index.ts` resolves 25 static
  profiles and renders section-scoped context rules and common gaps. It orders
  rules by section and severity, but endpoints/statistics only reach bare E3
  9/11 or CTD 2.7.3/4; references use unconditional first-N order.
- `therapeutic-area-profiles/types.ts` has profile/rule/reference types. Existing
  references carry identifiers, authority, title and rationale, without claimed
  currentness or scientific qualification.
- `server/services/ana/AnaDocumentDraftingService.ts` calls this renderer for
  nested drafts and labels supplied context caller-declared/unverified. The lead
  session owns its recorded-context extension.
- `server/services/regulatory-currency/guidance-ingestion-service.ts` exposes the
  pure `checkGuidanceFreshness`; unmatched guidance is unverified, current=null.
  `currency-registry.ts` supplies dated facts and verification-age helpers.
- `server/services/ana/__tests__/drafting-product-advisory.test.ts` checks 25 x 11
  prompt wiring, including CMC exclusion. It is not clinical SME qualification.
- Read-only search: `rg` for renderer, freshness checker and profiles, plus
  `git log --all --diff-filter=D --name-only` on therapeutic/nonclinical/source/
  scientific-review names; no deleted replacement renderer was found.

## Bounded change and acceptance

1. Extend the renderer options with document kind and optional phase/modality/
   population context. Labels remain advisory; unknown applicability remains
   undetermined. Existing profiles acquire no invented applicability conditions.
2. Reach clinical endpoints/statistics for CTD 2.5, efficacy/safety summaries,
   clinical study-report sections, protocols and relevant ICH E3 sections.
   CTD CMC/nonclinical sections exclude those clinical arrays.
3. Rank references cited by the selected section rules/gaps before general
   fallback references, preserving the existing bounded prompt budget.
4. Reuse the existing freshness checker and dated registry, disclosing matched
   basis, verification limits and unmatched/unverified status. Registry currency
   never proves clinical applicability, official source review or qualification.

Meaningful red/green cases: clinical locations currently omitted; unrelated
CMC/nonclinical exclusion; relevant reference beyond the cap; missing and declared
context; explicitly constrained rule applicability; unmatched/superseded guidance;
jurisdiction-specific not-yet-effective guidance; stale/future verification dates.

## Limitations

The profiles remain static advisory knowledge. Existing rules have structural
scope, not a complete disease/phase/population applicability model. The currency
checker does not reconstruct a complete historical regulatory state. A catalogue
traversal, prompt test or successful model call does not establish SME validation,
scientific source qualification or submission readiness. No provider calls are
part of this slice.

## Verification

- Initial targeted red: `therapeutic-selection-red.log`, 15 failures / 10 passes.
  The failures exercise the omitted clinical locations, reference ordering,
  applicability visibility and dated-reference checks on the old renderer.
- A further CSR-kind / CTD-5.3.5.1 case failed before correcting the precedence
  (`therapeutic-selection-csr-red.log`); it now passes.
- Independent read-only review identified that free-text phase/population
  mismatch could incorrectly exclude a rule. The added regression failed
  (`therapeutic-selection-free-text-red.log`) before reusing the canonical
  clinical-phase vocabulary and keeping unmatched population text undetermined.
- Final focused green: `therapeutic-selection-green.log`, 28 / 28 cases.
- Existing `drafting-product-advisory.test.ts` plus the initial 25 focused cases:
  312 / 312 passed (`therapeutic-selection-affected.log`). The existing 275
  area/modality combinations remain prompt wiring only.
- Scoped ESLint on `index.ts`, `types.ts` and `therapeutic-selection.test.ts`:
  exit 0, zero errors and warnings. `git diff --check` passed.
- No broad suite, project TypeScript run, commit, model or provider call.

## Exact delivered applicability boundary

The renderer reaches clinical arrays at CTD 2.5, 2.7.3/4, 5.3.4/5 and scientific
ICH E3 headings (2, 9–13), and for a protocol when the caller identifies that
document kind. Its `activeCtdSection` names a CTD location; with kind `csr`, it
may instead name the E3 heading. It excludes CTD 2.4, 2.6 and Modules 3/4. It does
not infer a document kind from a therapeutic-area label.

Existing profile rules still lack indexed phase/modality/population conditions;
their clinical applicability therefore remains undetermined. The optional typed
conditions can explicitly select a conditional advisory rule or exclude a known
incompatible canonical phase/modality, recording its ID before omission; unmatched
free-text populations or unrecognized phases stay undetermined. They never declare a legal
necessity or waiver. Recorded versus declared labels retain separate wording,
and neither is qualified scientific evidence. No new scientific scope was added
to the 25 profiles.

Reference ranking uses identifiers/titles explicitly cited by emitted section
rules or gaps, with existing order as fallback. Unscoped risk/reviewer/reference
strings still lack complete disease-specific applicability metadata. Currency
is looked up at rendering time through the existing service, resolving a
specific identifier before its potentially generic display title. Raw registry
verdicts, dated basis and warnings are retained; upcoming status is not called
currently applicable. Unknown references and absent/stale/future verification
remain visibly unresolved. The curated ICH step registry has no independent
source-verification receipt and is labelled accordingly. This does not provide
a complete historical regulatory-state reconstruction.

Clinical PK/biopharm sections (for example 5.3.3) do not automatically receive
disease efficacy endpoints or the profile's mixed clinical-statistical strings.
These unstructured arrays lack topic-specific metadata to select PK-only advice
safely. The delivered clinical study-report coverage is explicitly 5.3.4/5, not a
claim that every Module 5 leaf has appropriate disease-specific scientific advice.
