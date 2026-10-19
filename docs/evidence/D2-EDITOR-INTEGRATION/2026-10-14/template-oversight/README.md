# Saved IND template oversight evidence

W1 / D2 continuation of the existing editor under the
[published contract](../../../../design/EDITOR_TEMPLATE_OVERSIGHT_2026-10-14.md).
Implementation began on `269d2c18` and was integrated on `71444466` after a
fast-forward of incoming reporting and protocol qualification changes.

## Result

The existing editor carries the saved document's exact template identity,
recorded source version/hash, preparation or narrative kind, drafting limits and
original-record requirements into its existing AnA conversation handoffs. The
existing provenance header identifies an IND working scaffold or preparation
worksheet. Existing guidance disclosure, controls, styling, tracked remedies,
save and filing doors remain the same implementation.

The existing authorized `critique_document` review now reads recorded section
CREATE guidance through the canonical template-guidance resolver. Exact current
template reference is explicitly distinguished from recorded guidance. Missing
guidance is reported per section; malformed or conflicting mandatory source
context refuses a document verdict. Legacy missing source is reported as not
recorded, with no inference from a renamed title or module.

Template context participates in the pinned review snapshot. Complete reference
fields and limitations are paged with Unicode-safe offsets inside the existing
5,000-character serialized result budget. References remain separate from
authored text, citations and deterministic writing scores. Long screen-context
metadata has explicit omitted-field flags and points to complete saved-review
pages. A late old-document response cannot supply another document's source.

Original official forms, datasets, certificates and signed records remain
required. Oversight requests retain source-supported preparation and tracked
fix proposals through the existing conversation, with no automatic save,
acceptance, approval or filing.

## Proof

- [Independent backend red/green evaluation](TEST_EVAL.md) preserves actual
  failures and covers recorded/current authority, exact identities, snapshot
  drift, access, complete long references, limits and honest reference gaps.
- The root's actual rendered editor tests first failed all 11 original cases,
  then passed all 13 final cases, including conversation prefills, renamed form
  limits, missing/conflicting source, long metadata and delayed prior-document
  responses. The remedy/conversation integration selection also passed 29 tests
  across three files.
- [Browser evaluation](BROWSER_EVAL.md) covers actual template contracts in all
  five modules plus the null-module GLP deliverable, in desktop/touch light/dark.
  All 24 cases, 72 captures and 96 real oversight-prefill callbacks passed with
  one native editor, zero automatic mutations and zero browser errors. The lead
  inspected desktop and touch captures. Accessibility incomplete rules and
  synthetic API qualifications are retained there.
- The selected full editor/template/source/remedy regression run passed 963
  tests across 72 files before the final empty-JSON availability correction.
  [Exact selection](regression-test-files.json) makes that scope reproducible.
  Final focused backend tests and incoming protocol/source-import checks qualify
  the correction and synchronized base; their results are retained separately.

Compiler, build and source/style gate results are recorded in
[release checks](release-checks.json). The first compiler run caught one test
fixture type error; its accurate query result type was fixed, and the final
compiler completed with zero errors. No type, lint, security or design baseline
was relaxed. Normal Git hooks enforce the committed-range import and publication
gates; Git history records the publication receipt. Browser captures retain
their original source hashes; the backend-only correction is reconciled
explicitly rather than rewriting captured pins.

An additional repository-wide import diagnostic found 15 imports in unchanged
legacy files, outside this change. Its [exact scope](repository-wide-import-diagnostic.json)
is retained separately from the required committed push-range check. The initial
pre-commit invocation of that range check had no committed source diff and is
not treated as qualification of this patch.

## Limits and reproduction

Saved review retains current actor/project/document admission, repeatable-read,
512 sections, 8 MiB saved content, 8 MiB references and 20,000 reference items.
Oversized or unreadable mandatory context refuses a verdict. Historic section
metadata with identity-only source remains explicitly identified as such; it
does not invent absent source details. An unavailable reference store is not an
empty success.

Use the repository's configured Node/TypeScript toolchain. Run the selected
Vitest files with `NODE_OPTIONS=--max-old-space-size=4096`; the exact selection
and focused commands are in the linked artifacts. Run
`npm run ci:typecheck:no-regression -- --incremental`, `npm run build`, the
release gates, and the [direct browser fixture](browser-eval-fixture/reproduce.txt).
Run the warning ratchet after the compiler, because the ratchet creates temporary
previous-source files inside the compiler's source tree.

These are local implementation and rendered-wiring qualifications. They do not
establish live AnA/provider behavior, deployed persistence, original-record
verification, regulatory readiness, full WCAG conformance or a green launch row.
The older outline/read/search authorization audit is a separate follow-through;
this patch does not expand those readers' authority or content.
