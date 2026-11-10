# D2 — shell controls preserve pending study and protocol work

## What already exists

`Shell.tsx` owns Rail, TopBar/project chip and CmdK. Rail and palette action
dispatch precedes `onNav`. `navParams.ts` owns the shared leave registry and
native-dialog refusal; `ceremony.ts` owns governed-form presence.
`ProtocolWorkNavigation.ts`, `DocumentWorkbench.tsx` and `RichSectionEditor.tsx`
already own pending status/text/save refusal. `toast.tsx` supplies accessible
feedback. `V2App.tsx` remains the canonical router; the synchronous saved-copy
handoff from `SourceImportDialog.tsx` keeps its existing surface-owned path.
TaskTray and notification record handoffs keep their existing guards.

The full inventory, searches, deleted-history limits and implementation boundary
are in `docs/design/STUDY_PROTOCOL_PROJECT_INITIATION.md`, under the shell-controls
continuation. No new canvas, generator, editor, router, registry, API or store.

## Verification

- `red.log.gz`: ten shell regressions reproduced before the Shell fix; the clean
  palette control passed. Tests mount the real protocol workspace/shared editor
  beside the real Rail, TopBar and CmdK, with saved-record/network fixtures.
- `dialog-red.log.gz`: three expected failures before the exact-dialog helper
  change; registered-guard control passed. The new helper tests then passed.
- The nineteen shell cases cover status-only and real TipTap text changes,
  an unresolved section PATCH, legacy editor `beforeunload`, all scoped shell
  destinations, palette step/action/question callbacks, keyboard input and query
  retention, exceptions, governed forms and a same-class underlying dialog.
  Refusals precede routing/bus callbacks and preserve project identity, nav
  params, editor target, conversation seed and the source editor node. Reverting
  pending status does not replay the request; a fresh keyboard activation works.
- Four helper cases preserve strict default behavior, exact-element exclusion,
  sibling/nested dialogs, registered pending work and fail-closed exceptions.
- `final-green.log.gz`: fifteen focused suites, 165 tests pass on the final
  source, including both new suites and the retained shell/editor regressions.
- Focused regression suites also exercise licensing/audience, project-chip and
  palette destinations, and existing saved-source/editor Save/Leave/Cancel paths.
  These retained handoff suites use their established mocked navigation/intake
  boundaries; source review confirms V2App/surface handoff callbacks are unchanged.
- An incoming RBM admission added the existing rail choice but left the palette
  order assertion stale. The initial regression run recorded that single failure
  (`regressions-initial.log.gz`, 141 passing); update only its expected list to
  include the admitted Risk-based monitoring entry. No admission change here.
- `lint-baseline.json.gz` and `lint.json.gz`: zero errors; the same five existing
  Shell warnings and zero warnings in the helper/tests. No new warning allowance.
- `build.log.gz`: production client/server build passed. The independent review
  found no material issue in dispatch ordering, dialog scope or saved handoffs.
- Required pre-push gates run before publication. No second
  editor, canvas, generator, store, API, navigation registry or dependency.

The full shell uses its existing router and explicit saved-copy handoffs. Browser
history, sign-out, organization switching, entitlement-resolution dialog handoffs
and surface-owned navigation are outside this bounded slice. Engineering checks
do not confer formal OQ or deployed UI validation.
