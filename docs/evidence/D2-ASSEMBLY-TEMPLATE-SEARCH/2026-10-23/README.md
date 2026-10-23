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

The first combined run passed 210/211: one root-authored AnA integration test
waited for a transient Structure built message after preparation had advanced to
retained candidates. Its corrected wait checks the final candidate state. The
original test is archived and its failure retained; no production change hid it.

A declaration error initially included `/tmp/repo-health-ceiling-probe.json`,
a generated scanner output, as a source input. The health command itself exited 0
but the runner correctly flagged that output's change. The explicit
`publication-source-freeze.json` removes only that generated output, leaving
**64 unchanged repository inputs**; the repeated health capture passes without
drift. Earlier 65-input receipts are retained with their actual scopes rather
than overwritten or silently relabelled.

The pre-publication fetch also found concurrent company-session and workflow
catalogue/navigation completions at `aef1b6a15`. Normal merge and bounded
integration verification follow. These do not replace the editor or authorize
new drafting/filing acts. Full current TypeScript is required by the ordinary
pre-push hook before publication; human cases 1–95 remain Not run.

## Canonical integration

Implementation `1e3732a0a` and normal merge `c10dc27b2` preserve the incoming
company/session and workflow-discovery completions. Read-only review found no
compatibility blocker: incoming code touches none of our 64 declared repository
inputs. Assembly still uses its pinned apiRequest path; apiCall's new owner
guard is opt-in for existing company callers. The existing Apps destination and
feature IDs are retained by the reached Workflow catalogue. The removed legacy
CapabilityBrowser is intentionally replaced by that canonical destination.

`canonical-source-freeze.json` extends the unchanged 64 inputs with 53 incoming/
shared-owner inputs (**117** total), recording the deleted browser path separately.
The bounded 9-suite integration and current build/UI checks use this explicit
merged epoch. Repeated assembly/Workbench suites are not added to earlier 211
tests as new coverage. Final publication verifies actual Git blobs and absence
of the removed legacy path; no external generated output is a declared input.

The merged canonical replay passes **184 tests / 9 suites**, the current build
and all seven repository/editor/UI gates with no declared source drift. This
includes repeated assembly and actual Workbench tests; it is a separate cohort,
not 184 additional distinct tests. All own 64 repository pins are unchanged.
Current whole-project TypeScript runs in the normal direct push hook; the actual
accepted receipt and source Git-object verification follow publication.
