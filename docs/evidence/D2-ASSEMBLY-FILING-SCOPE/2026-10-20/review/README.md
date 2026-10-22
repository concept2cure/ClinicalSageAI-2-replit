# Complete assembled section provenance in the existing saved review

W1 / D2; canonical `concept2cure-v2`; local/Codespaces fixtures only.
Root owns combined qualification and direct Git operations. Contract:
[assembly filing scope and review](../../../../design/ASSEMBLY_FILING_SCOPE_AND_REVIEW_2026-10-20.md).

## What already exists

`server/services/authoring/authoring-assembly.ts` already saves selected built-in
template source, guidance and assembly identity on each appended section's CREATE
audit row. The parent template is deliberately unchanged. The existing
`authoring-template-guidance.ts` validates the receipt and resolves that section's
exact saved guidance independently of a missing/different parent template.

`server/services/ana/saved-template-review.ts` already supplies bounded reference
items to the authorized whole-document `saved-document-critique.ts`. It previously
skipped section metadata without a parent template, otherwise compared each source
with the parent, and labelled every reference with the parent template ID.
Its existing source validation, Unicode pagination, byte/item limits and snapshot
composition are extended in place. No second reviewer or guidance resolver is added.

Code/caller/fixture searches and deleted saved-template/review/assembly-guidance
history found no retired counterpart. `saved-document-critique.ts` is the only
production caller; its existing authorized program ID now accompanies the review
scope. No additional project lookup or shared guidance resolver change is needed.

## Verification

- [Initial RED](red.json): 25 failures / one passing access-control case. It
  reproduced omitted/misattributed sources, incomplete paging, ignored drift,
  permissive invalid/incomplete assembly receipts and an unreadable audit store.
  The [raw output](red-output.txt.gz), actual exit and four fixed source hashes
  are retained.
- [First candidate](candidate.json): 56 / 56 across the new assembly cases and
  existing saved-template oversight. This is historical, before the explicit
  program scope addition and final helper/API refactoring.
- [Program-scope RED](program-scope-red.json): one failure / 26 skipped. A
  different valid program UUID passed the existing receipt's shape check.
  Review now compares it with the actual authorized program passed by the sole
  existing caller. [Raw output](program-scope-red-output.txt.gz).
- [Expanded candidate](expanded-candidate.json): 119 / 119 across six files,
  before the parameter grouping required to retain the lint limit.
- [Final GREEN](green.json): **119 / 119 across six files**, including 33 new
  assembly cases, existing saved-template oversight, saved critique unit/PGlite,
  section guidance and the existing document surgery end-to-end suite.
  [Raw output](green-output.txt.gz). The [ten source pins before](source-pins-before.json)
  and [after](source-pins-after.json) match exactly.
- [Strict lint](lint.json): all three changed production/test files have zero
  errors and zero warnings. [Initial lint](lint-candidate.json) retains two
  warnings; [scope-API lint](lint-after-scope.json) retains the six-parameter
  warning. Shallow guide copying, an identity helper and one required scope
  object remove these warnings without a rule waiver or baseline increase.

The actual saved-record fixtures verify null/different parents, separate manual
and narrative eligibility, exact Canada/Japan/body identity, earliest CREATE
semantics, complete escaped Unicode source limits/guidance, stale continuation
after source/guide/receipt changes, reference byte/item ceilings, invalid or
inaccessible metadata, foreign program identities and current revoked access.
They assert unchanged authored-text scores, parent identity and absence of review
writes. Existing identity-only history and no-template/no-assembly behavior remain.

## Limits

Stored organization/global template assemblies currently record an assembly
receipt without the full recorded source and guidance. Complete whole-document
review explicitly refuses that unverified reference; it does not borrow the
parent's source, infer eligibility/limits or use today's template as historical
authority. Manual assembly remains available. Resolving that missing recorded
metadata is separate work.

No compiler/build/global scans, Git mutations, provider calls, human walkthrough,
production RLS, full fresh database installation, legal template completeness or
agency transmission qualification was performed by this worker. Root's combined
qualification binds the final shared sources. Test counts overlap and must not
be added. [Machine summary](summary.json).
