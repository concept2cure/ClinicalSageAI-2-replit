# Complete template discovery in the existing document build controls

W1 / D2; `concept2cure-v2` only. Local/Codespaces only, no deployment.

## What already exists

- `v2/surfaces/AuthoringTemplatePicker.tsx` owns searchable loaded template
  metadata, native selection, result counts, clearing/focus and retained selected
  options. `AuthoringCreateExport.tsx` already uses it in the canonical New
  document form. It currently includes blank-document choices and creation copy.
- `v2/editor/AuthoringAssemblyBuild.tsx` owns the existing build disclosure and
  preview/build/AnA controls. Its template field is a plain native select; it
  cannot search the same regional, IND and shared planning catalogue.
- `v2/editor/useAuthoringAssemblyBuild.ts::readTemplates` reduces the current
  catalogue to id/name. `assemblyBuildState.ts` stores per-owner/document build
  buckets. Current preview/build transports, source manifests, dirty-work holds,
  unknown outcomes and retained AnA candidates already exist and remain owners.
- `server/routes/authoring.router.ts` GET `/templates` returns organization,
  shared and builtin metadata, including descriptions, regions, categories and
  recorded filing context. It reports a failed shared store separately. Builtin
  projection and exact outlines already cover the admitted catalogue; this
  increment adds no registry entries, headings or template service.
- `authoring-assembly.ts`, `authoring-assembly-source.ts` and the shared assembly
  contracts resolve and verify exact current outlines and source/filing scope.
  Display metadata and search results never authorize drafting or applicability.
- Existing `authoringTemplateSearch`, `authoringAssemblyBuild`,
  `workbenchAssemblyBuild`, `sourceFirstAssemblyFlow` and source-start tests
  exercise the native picker and one editor/controller. No assembly search test
  currently reaches the discarded metadata.

Root and two read-only reviewers inspected these surfaces, routes, services,
AnA oversight/remedy tools, shared contracts and current tests. Deleted-history
searches for TemplatePicker, TemplateSearch, Assembly, SourceImport and Remedies
found no competing canonical assembly-search implementation. Deleted legacy
authoring routers/panes are intentionally retired. The design skill, HANDOFF,
README and `ui_kits/authoring/` establish one editor, token-based existing native
controls and calm factual copy. Reuse those controls; no new UI pattern or CSS.

## Approved bounded completion

Reuse `AuthoringTemplatePicker` inside the existing build disclosure with an
optional `purpose="assembly"` and `disabled` prop. Defaults preserve the New
document experience. Assembly has a Choose a template empty option, no blank
document option and no creation-only loading/error/empty/no-match advice.
Preserve the explicit Template label, result/status descriptions, native keyboard
selection and Clear returning focus to search. Disable search, Clear and select
while loading, busy, unknown, read-only or otherwise refused by the existing
controller. Use the same existing tokens/classes; no new panel or modal.

Retain allowlisted loaded display metadata in `AssemblyTemplate`, using the
existing `AuthoringTemplate` shape and recorded filing-context parser where
appropriate. Copy only valid strings/string arrays/context, never arbitrary
payload keys. Invalid optional display fields cannot crash filtering. Malformed,
empty or duplicate required identities fail the complete roster read, rather
than silently shortening or substituting it. Keep numeric/string IDs exact.

Store `templateQuery` in the existing per-document/session build bucket. A query
or Clear changes only that field: no network request, auto-selection, preview,
write, source substitution, candidate change or plan invalidation. Preserve a
selected template even when filtered out. A new choice still uses the existing
chooseTemplate and exact outline preview. Guard retained query callbacks against
account/session replacement and document/project visit changes, including A-B-A;
same-session canonical bearer refresh keeps the current query.

## File ownership and verification

- Root: shared `AuthoringTemplatePicker.tsx`, focused purpose/disabled tests,
  existing actual Workbench integration cases, human guide, documentation, source
  pins, build/compiler/gates, Git and normal direct publication.
- Scoped worker: `assemblyBuildState.ts`, `useAuthoringAssemblyBuild.ts`,
  `AuthoringAssemblyBuild.tsx`, one focused assembly-search suite and `worker/`
  evidence. No other edits, Git mutations, compiler/build/global scans/dependencies.
- Independent reviewer: read-only contract/implementation/evidence review.

Retain meaningful behavioral RED before production changes and final actual
GREEN/raw exits/hashes under
`docs/evidence/D2-ASSEMBLY-TEMPLATE-SEARCH/2026-10-23/`. Run relevant existing
creation, assembly, source and owner regressions, lint/warning ratchet, build,
editor/UI gates and normal pre-push compiler. No baseline or dependency increase,
force, bypass, PR, branch or worktree. Human checks remain Not run until performed.

## Separate follow-ups found during discovery

Review `SourceImportDialog.tsx` delayed intake ownership/unknown-outcome handling
in a separate completion: current tests cover source/project changes but need
actual account/session/refresh cases. Review `authoring-assembly.ts` excerpt
selection for selected-section title/guidance relevance separately. Neither is
silently widened into this template discovery change. Universal regional/sector
completeness, provider/agency delivery and human acceptance remain unqualified.
