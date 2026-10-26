# Existing editor local journey completion — W1 / D2

Contract: docs/design/SELECTED_SOURCE_HANDOFF_OWNERSHIP_2026-10-26.md.
Local/Codespaces only, concept2cure-v2 only.

## What already exists

- `editor/SourceAssemblyDialog.tsx` owns the Data Room/Vault/Project files Build
  in editor action, shared chooser and canonical New document remedy.
- `editor/useSourceAssemblyTarget.ts` owns scoped inventory GETs and rechecks the
  selected exact UUID before opening. It checks context before Close, then
  publishes without rechecking. Missing readScope is treated as a whole document.
  Its retained choose/load/open callbacks can consult obsolete rendered values.
- `editorTarget.ts` is the canonical private owned, copied, TTL-bound source
  channel. Its second predicate currently applies only to sourceDocumentStart;
  ordinary assemblySources captures a fresh owner after the chooser closes.
- `editor/authoringCurrentRead.ts` supplies account-object/session ownership and
  refresh subscriptions; `taskTarget.ts` supplies actor IDs; utils/authToken.ts
  supplies capturedActorHeaders; authService.tsx verifies live adopted bearer
  consistency. `authoringDraftTransport.ts` and `shellProject.ts` supply the
  existing project-visit guard. Compose these; do not globally change draft
  guards or introduce a parallel session/store/channel.
- `editor/useSourceIntake.ts` already composes these stricter boundaries for
  verbatim working-copy intake. It is a different operation and stays intact.
- Existing `AuthoringCreateExport.tsx`, useAuthoringCreation.ts, assembly source
  intents, DocumentWorkbench.tsx and its dirty/ceremony guards remain the sole
  document creation, editor admission and later explicit preview/build owners.
- Unchanged backend owners: authoring.router.ts current scoped document GETs;
  authoring-document-read.ts supplies explicit document/sections readScope;
  authoring-assembly.ts / authoring-assembly-sources.ts verify current exact source
  versions/excerpts. Shared assembly-sources.ts validates and copies selectors.
  Existing AnA document/source tools reuse those owners; this chooser does no
  generation, acceptance, approval, filing or submission.
- Existing sourceAssemblyEntry, sourceDocumentStartChannel, sourceFirstAssemblyFlow,
  sourceDocumentStartFlow and projectFilesSourceAssembly tests cover source/target
  changes during reads and after publication. They do not cover ownership or a
  new governed ceremony inside Close, raw credential replacement, captured GET
  headers or retained launch callbacks. Some older fixtures use opaque tokens or
  omit readScope; align them to real contracts without weakening assertions.
- Existing browser hosts under D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly
  and 2026-10-18/project-files-source-assembly mount real ProjectHome/chooser and
  one DocumentWorkbench with synthetic HTTP. Reuse those hosts or their small
  adapters, not another product surface or a copied workbench implementation.
  Current Chromium/Playwright/axe and Node22 are present. The managed Docker
  socket/cached pgvector image are available, but no app/database is running.
  This bounded browser check does not require a new database.

Root and two independent read-only audits searched components, callers, shared
selectors, route/service/AnA owners, tests, local/browser scripts and deleted
SourceAssembly/source-assembly/source-intake history. No competing implementation
was found to restore. No active work-order scope overlaps this chooser. Normal
fast-forward 4bae69d89 → 6f7477656 retains 99 incoming commits; candidate source
bytes are unchanged. The new client journey puts this operation in Evidence →
Author and preserves the one-editor/UI requirement. Root reread SKILL/HANDOFF/
README and the runtime/network/Docker skill references.


## Verification scope

Retain real pre-edit behavioral RED, copied source/test snapshots, final component
and integration tests, actual-component browser results with synthetic HTTP,
commands/exits/input hashes and normal canonical publication. Historical opaque
bearer/missing-scope fixtures must be aligned; their failures are fixture failures.
Human/provider/agency acceptance remains separate and unexecuted here.

Receiver discovery: existing ordinary `assemblySourceIntent.ts` re-captured an
owner and editorTarget.peek/consume did not transfer its private owner. Retained
receiver RED is 5 failed/1 passed before root extended that fourth existing owner,
using the same sender/receiver/snapshot/TTL pattern as document starts.

## Qualified local increment

Source commit `4d8cf50d0` is retained through normal merge `634be82d7` of
`b3661f72d` (client-journey door/auth fixture corrections and evidence only).
All 33 editor integration inputs remained unchanged through that merge.

- Tests owner: **161 passed / 7 suites** (60 focused ownership/receiver cases
  and 101 aligned existing source entry/document-start/Project files cases).
- Root integration: **221 passed / 10 different suites**, covering the shared
  channel, actual editor/source rail/Workbench/creation/saved-source and MDX
  handoffs. These total 382 disjoint tests, not the sum of historical reruns.
- Definitive browser epoch: `browser/final-latched/summary.json`: **44/44 pass**
  across desktop/phone and light/dark; actual ProjectHome Data Room → exact one
  native editor, raw launcher refusals, owner/ceremony changes during Close,
  refresh/pinned headers, late body masking and keyboard/footer checks.
  The 60 captured stages include 16 bounded axe checks with zero violations or
  incomplete rules. These are automated actual-component/synthetic-HTTP checks,
  not human sessions, native server qualification or live AnA calls.
- Strict source/test/fixture lint: zero errors/warnings. All seven declared
  editor/UI/size gates and production build pass. No dependency/baseline growth.
- Root `source-freeze.json` declares 50 bounded inputs. The worker 25-input and
  browser 29-production/3-shared/11-fixture declarations remain separate. None
  claims exhaustive dependency closure. Final raw-output hashes verify.

Meaningful RED epochs and intermediate failures remain immutable: initial
component 24 failed/6 passed, browser 3 actual Close failures, receiver 5 failed/1
passed, then two real launcher/refusal failures in the 153-case integration, and
8 receiver-retirement failures before the final one-way helper. Browser ancillary
GET fixture mismatches are labelled fixture failures, not product RED. Earlier
153-case and 44-browser epochs precede the final receiver latch and are historical.

Owned browser servers are stopped; no app/database/container was created or
modified. The human guide has 106 cases, all Not run. Final compiler and ordinary
direct canonical publication are pending the normal push hook; accepted Git blob
verification and its receipt will be filed after that hook completes.
