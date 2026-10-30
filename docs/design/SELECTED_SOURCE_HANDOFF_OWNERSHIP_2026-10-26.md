# Complete selected-source handoff ownership

W1 / D2, `concept2cure-v2` only; local/Codespaces. Continue Evidence → Author in
one existing editor, using existing UI patterns. No deployment/provider/agency call.

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

## Approved contract

Capture one mounted chooser's original program, canonical copied source selectors,
account object, session revision and shell project visit. Read admission requires
an actual current adopted bearer matching the captured actor/org. No anonymous,
legacy storage-only or unadopted bearer fallback. Canonical same-session refresh
preserves work; each inventory operation pins its actor headers once and uses
those headers through response/body delivery. Guard before dispatch, after
response/body, before state, before Close, after Close and before navigation.

Account/session replacement, project A→B→A, source/parent ownership changes,
unmount and source payload mutation retire old reads/callbacks. Mask private
choices/selection while retired, keep Close/Cancel accessible, and do not silently
read or adopt the new account. Retained launch callbacks must keep their original
rendered source scope; retained choose/reload/open callbacks must not borrow
obsolete selection or pending-lane state. Duplicate reads/opens stay serialized.

Validate scoped inventory UUID/unique identity, title/status/project and explicit
readScope document|sections. Invalid/unknown scope refuses the response rather
than becoming empty or whole-document. Filter explicit section-only and existing
sealed/locked targets using the current policy. Do not infer a target by title,
order or newest row. Revalidate the exact selection before Open.

Keep mounted read admission separate from non-mount source ownership so deliberate
Close/unmount can continue. After Close use the latest host predicate/callback and
current ceremony state. Refuse handoff if any retired. Pass the original owner
predicate through editorTarget for ordinary assemblySources as already happens
for document starts. The source channel must retain that owner after publication;
an obsolete sender must not overwrite an unrelated valid target. Keep source
selectors copied and bounded. Existing editor/dirty/form guards stay authoritative.

Both Open existing document and New document use this original source ownership.
New document remains the canonical form, without creating, previewing or building
from this chooser. A read failure may be retried; it is not an empty list. No new
writer, schema, endpoint, template roster, global state, dependency, stylesheet,
editor, model or product UI pattern is authorized.

## Scope and qualification

Root owns useSourceAssemblyTarget.ts, SourceAssemblyDialog.tsx, editorTarget.ts,
design/work-order/human handoff, integration, gates and normal direct Git.
Test owner owns new sourceAssemblyOwnership.test.tsx, focused channel tests and
strict fixture alignment in sourceAssemblyEntry, sourceDocumentStartChannel,
sourceFirstAssemblyFlow, sourceDocumentStartFlow, projectFilesSourceAssembly;
evidence `tests/`. No production edits by this owner.
Browser owner owns only `docs/evidence/D2-EDITOR-LOCAL-JOURNEYS/2026-10-26/browser/`:
reuse existing actual-component hosts and synthetic HTTP; preserve historical
packets. No Docker/container changes, provider calls, production edits or Git.

Before production changes retain meaningful behavioral RED through existing
exports/components, actual source/test snapshots and raw exits; fixture-only
failures are not product RED. Root then implements. Retain qualified GREEN,
read-only browser checks, strict no-warning-growth lint, build/single-editor/UI/
size gates and normal push compiler. No compiler beside tests/build/lint/global
checks, no baseline increase, dependency refresh, PR/branch/worktree/force/bypass.
The packet is docs/evidence/D2-EDITOR-LOCAL-JOURNEYS/2026-10-26/. Synthetic browser
and API results do not mark the human checklist passed or qualify live AnA or
agency delivery.

## Receiver completion confirmed during implementation

The existing ordinary assemblySourceIntent receiver re-captured a fresh guard,
and editorTarget.peek/consume copied only the document-start owner. A separate
meaningful receiver RED retained 5 failed/1 passed against that existing export
before its correction. Root additionally owns editor/assemblySourceIntent.ts.
Extend the same private channel owner/snapshot and transfer it to genuine copied
receipts. Its ordinary receiver must retain the sender predicate, reject raw or
copied unowned commands, verify source mutation and refuse expired admission; an
already-admitted intent may outlive the channel TTL while both owners remain
current. This mirrors the existing document-start contract and adds no channel
or storage. No DocumentWorkbench, creator or backend edit is needed.

Final bounded review retained another existing-export RED (8 failed/6 passed)
for both source intent types: observed selector mutation, false sender/receiver
predicate or throwing predicate could revive after restoration. Their existing
current guard now shares one private one-way retirement helper. Temporary
ceremony/dirty holds are outside this ownership predicate; valid same-session
refresh and already-admitted TTL behavior remain unchanged. Historical browser
and 153-case snapshots precede this one-file correction and stay immutable;
final tests/browser qualification replays the successor bytes.
