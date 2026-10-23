# Existing assembly template discovery — W1 / D2

Contract: `docs/design/ASSEMBLY_TEMPLATE_SEARCH_2026-10-23.md`.
Discovery starts at clean/synchronized canonical `5ff6d2252`; local/Codespaces only.

## What already exists

`AuthoringTemplatePicker.tsx` already supplies loaded-metadata search, native
selection and retained selected options for New document. The existing
`AuthoringAssemblyBuild.tsx` has a plain template select, while
`useAuthoringAssemblyBuild.ts` discards that same GET `/templates` metadata to
id/name. Existing controller buckets, preview/build/source transports and AnA
candidate review remain authoritative. Server catalogue, builtin projection,
exact outlines, source manifests and filing restrictions are reused unchanged.
The design lists the concrete paths, current tests and deleted-history searches.
There is no competing editor, picker, catalogue, route, service or model path.

## Scope and evidence

Reuse the current picker with assembly-specific copy and no blank-document
choice. Preserve exact selection, preview, sources, requirements and retained
candidates while searching. Guard query state by the existing account/session/
document visit and disable held controls. Record meaningful behavioral RED,
final qualified GREEN, declared source hashes, commands, exits and raw output.
Declared pins are bounded inputs, not an exhaustive transitive dependency graph.

Root owns Git, global checks and publication. No dependency/baseline increase,
PR, alternate branch, force, bypass, deployment or live agency/provider calls.
Automated HTTP/auth seams do not establish human acceptance or universal
regulatory completeness. Human checklist cases remain Not run until executed.

## Shared picker qualification

The pre-production shared-picker run (`picker-red.*`) has **7 behavioral
failures / 2 controls passing** across 9 cases, with no declared source drift.
It reproduces assembly's blank/creation-only options, loading/empty messages and
missing held-control behavior. Archived production/test snapshots reproduce the
reported source hashes. `picker-qualified.*` passes **34 tests / 2 suites**,
including the existing 25-case New document search suite. Forced strict ESLint
passes with **0 errors / 0 warnings**, preserving the initial zero-warning state.

The earlier first-green run also passes 34 tests, but its following strict lint
correctly fails on one new complexity warning. The equivalent disabled-expression
correction removes that warning; only the qualified epoch identifies final picker
bytes. Historical freezes and raw results remain separate. Assembly integration
and complete publication qualification follow after the scoped worker freezes.

The existing human guide adds cases **92–95**, for **95 total, all Not run**.
Search filters loaded display metadata only. It adds no regulatory obligation,
provider eligibility, approval, source verification or agency-submission authority.

## Combined editor verification

The final editor selection passes **211 tests / 10 suites**. All seven changed
TypeScript files pass strict ESLint with **0 errors / 0 warnings**; the full
changed-file warning ratchet, production build and seven repository/editor/UI
gates pass. Repeated worker and picker cohorts are not added to that count.
`qualification.json` lists actual receipts and their original freeze scopes.

The first combined run passed210/211: one root-authored AnA integration test
waited for a transient Structure built message after preparation had advanced to
retained candidates. Its corrected wait checks the final candidate state. The
original test is archived and its failure retained; no production change hid it.

A declaration error initially included `/tmp/repo-health-ceiling-probe.json`,
a generated scanner output, as a source input. The health command itself exited0
but the runner correctly flagged that output's change. The explicit
`publication-source-freeze.json` removes only that generated output, leaving
**64 unchanged repository inputs**; the repeated health capture passes without
drift. Earlier65-input receipts are retained with their actual scopes rather
than overwritten or silently relabelled.

The pre-publication fetch also found concurrent company-session and workflow
catalogue/navigation completions at `aef1b6a15`. Normal merge and bounded
integration verification follow. These do not replace the editor or authorize
new drafting/filing acts. Full current TypeScript is required by the ordinary
pre-push hook before publication; human cases1–95 remain Not run.
