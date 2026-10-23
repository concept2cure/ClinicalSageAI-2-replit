# Complete selected-source document starts in the existing editor

W1 / D2; `concept2cure-v2` only. Local/Codespaces, no deployment or agency call.
Continue the current Authoring/Projects/Vault/catalogue workflow and existing UI.

## What already exists

- `editor/SourceAssemblyDialog.tsx` and `useSourceAssemblyTarget.ts` already
  retain explicit bounded Data Room/Vault selectors, list current project working
  documents, recheck the selected target and publish its exact UUID to the one
  editor. The creation remedy currently closes the chooser, clears the editor
  target and asks the person to create a document and return; source intent is lost.
- `surfaces/AuthoringCreateExport.tsx` owns the current New document form,
  `C2CForm`, native searchable `AuthoringTemplatePicker`, blank/template create
  payload, server receipt and recovery controls. This is the creation UI to reuse;
  no competing form, picker or document writer is authorized.
- `newDocumentAction.ts` already asks a mounted creation host to open that form
  through `c2c:new-document`. It deliberately does nothing before the host mounts;
  it cannot retain a cross-navigation creation request or its source ownership.
- `editor/useAuthoringCreation.ts` and `authoringCreationRecovery.ts` already
  pin actor headers, track pending/unknown outcomes, refuse duplicate creation,
  preserve navigation holds and support explicit scoped recovery. A list match
  is not a creation receipt. Preserve these contracts rather than making another
  mutation/recovery transport.
- `editorTarget.ts`, `editor/assemblySourceIntent.ts`, `workbenchLeaveTarget.ts`
  and `DocumentWorkbench.tsx` already admit exact document/project source intent
  through actor/session/project-visit, dirty-work and governed-form guards.
  Source selectors are bounded metadata; later preview/build verifies exact
  source versions and excerpts. A source-bearing target currently requires a
  document UUID and cannot represent an uncreated document.
- `editor/authoringDraftTransport.ts`, `shellProject.ts`, `ceremony.ts`,
  `useDialog.ts` and `C2CForm.tsx` own current context, unsaved-work/ceremony and
  focus behavior. `useDialog` is not a stack of independently active traps;
  overlapping creation/chooser dialogs must not be introduced.
- Existing source-first, project-file, target-ownership, creation/recovery and
  actual HTTP/PGlite tests cover these parts. No new schema, endpoint, AnA tool,
  provider path, rendering engine or editorial surface is needed.


The unchanged backend owners are `server/routes/authoring.router.ts` (current
project/tenant reads and `POST /docs`), `server/services/authoring/authoring-documents.ts`
(the shared transactional creator), and `db/migrations/20260725_authoring_document_loop_tables.sql`
(the existing authoring document/section/template schema). They do not retain a
client chooser’s source intent and require no new schema for this completion.
`shared/authoring/assembly-sources.ts`, `server/routes/authoring-assembly.ts` and
`server/services/authoring/authoring-assembly-sources.ts` own bounded selectors,
explicit assembly and exact current source checks. `server/services/authoring/authoring-draft-tool.ts`
and `server/services/ana/document-catalog-tools.ts` expose existing AnA authoring/
source preparation and reads; they do not authorize automatic acceptance or
submission. These paths are reused unchanged, with no new AnA tool.

Searches covered client surface/editor/create/import/assembly names, server
routes/services, AnA source/draft tools, shared schemas and migrations. Deleted
history was searched for SourceAssembly, source assembly and authoring creation;
no alternative canonical source-preserving creation flow was identified.
The repository design skill, HANDOFF, README and authoring kit establish the
existing drawer, buttons, picker and one editor as the implementation references.

## Completion contract

Continue the explicit selected-source journey when a working document must be
created. Use the canonical New document form and creator, preserve actual
template/module choice and current project/actor ownership, and open only the
confirmed returned document in the current editor with the exact original
selectors. Opening the form must not create/build/generate. Creation must not
automatically preview, assemble, generate, accept, approve or file content.

Cancellation, changed sources, project A→B→A, account/session replacement,
unmount, delayed reads/replies, dirty work and another governed form must retain
their existing safe outcomes. Same-account token refresh remains supported.
Unknown creation cannot turn into an automatic retry or a guessed document.
Source intent must not be restored from localStorage, a URL, title or list order.

Before implementation, root and a read-only reviewer will choose the smallest
reuse of the existing creation host and handoff, with explicit file ownership.
No worker implementation is authorized by this discovery contract yet.

## Evidence

Record meaningful failing behavior before the production correction, final
guard/integration tests, actual source pins and raw exits under
`docs/evidence/D2-SOURCE-ASSEMBLY-DOCUMENT-START/2026-10-23/`.
Root owns synchronization and normal direct commits/pushes; no new branch,
worktree, PR, force, hook bypass, dependency or baseline increase.

This completes a common authoring use case across device/diagnostics,
biotech/pharma and lab/research work. It does not establish universal regulatory
coverage, human acceptance, live AnA/provider connectivity or agency delivery.

## Approved reuse and file ownership

Read-only design/test reviews confirmed that the creator's recovery ledger is
component-owned and that two active dialog traps compete. Keep creation in the
existing editor host. Do not embed another creator into the source chooser.

1. Channel worker owns `editorTarget.ts`, `editor/assemblySourceIntent.ts`,
   `editor/SourceAssemblyDialog.tsx` and their focused channel/entry tests.
   Add optional `EditorTarget.sourceDocumentStart?: EditorAssemblySources`, a
   distinct command with null document ID, exact project UUID and bounded
   selectors. Ordinary `assemblySources` still requires a document UUID.
   Reject mixed commands, copied/unowned objects and URL reconstruction;
   reuse TTL/private ownership and capture the destination lifetime independently
   of the chooser's intentional unmount. Export
   `AssemblySourceDocumentStartIntent { programId, sources, current }` and
   `captureSourceDocumentStartIntent(target, admitted)` from the existing intent
   module. The chooser's existing remedy publishes this command and navigates
   (or lets the mounted editor receive it), with no write or pre-mount event.
2. Creation worker owns `editor/useAuthoringCreation.ts`,
   `surfaces/AuthoringCreateExport.tsx` and focused creation-context tests.
   Export `AuthoringDocumentStart { programId: string; sourceCount: number;
   current: () => boolean; onCreated: (doc: { id: string; title: string }) =>
   void | Promise<void> }` from the existing creation hook. Its options and
   `AuthoringCreateExportProps` accept optional `documentStart` (nullable).
   Consume each prop object once in the existing form host, after current
   actor/project/ceremony/creation checks. Ordinary New document opens have no
   source context. Reuse the same form/picker/payload, with a short existing
   notice explaining the selected-source count and deliberate later build.
   Pin the optional context to EACH ledger entry at create, preserve it through
   pending/unknown/identified recovery, and use that entry's context on delivery.
   Do not read a newer prop to attach sources to an older outcome. A stale source
   handoff suppresses adoption/navigation while a confirmed creation stays known.
   Current source ownership is required before POST; source retirement must not
   remove the existing ability to check the actual creation outcome.
3. Root owns `editor/DocumentWorkbench.tsx`, `workbenchLeaveTarget.ts`, actual
   real-creation/source/editor integration tests, human handoff and global
   qualification/publication. Receive the distinct command once, run existing
   dirty/ceremony/held-context guards and hand an `AuthoringDocumentStart` object
   to the existing creator. Stay/cancel retires the pending start. On confirmed
   delivery, reuse exact-id refresh/navigation and the existing owned
   `assemblySources` handoff with the original selectors. Require current source
   ownership before and after asynchronous refresh. Pinned/narrowed hosts retain
   their existing external-document leave path. No source adoption occurs until
   the returned document is admitted by existing scope/access/navigation guards.

Workers retain meaningful RED before production edits, qualified GREEN and exact
hashes/raw output under disjoint `channel/` and `creation/` evidence folders.
No worker Git, compiler, build, dependency, global scan or other path edit.
Root coordinates all cross-file follow-ups. No new form, modal behavior, visual
pattern, global storage, backend writer or source eligibility policy is approved.

## Review corrections and final implementation

The source-start channel has a private setter-only current-owner callback and
payload snapshot. Admission uses the existing channel TTL; an admitted form may
remain open longer while its source/project/account visit guards remain current.
No URL, serialized target or copied object reconstructs that ownership.

The existing workbench receives a distinct `document-start` leave destination.
Opening the canonical form keeps the current document selection and dirty-buffer
bookkeeping because that canvas remains mounted. Cancelling the form cannot
silently mark it saved. Actual navigation still asks for the existing unsaved-work
decision; creation confirmation does not mean the old text was saved or discarded.

After the confirmed receipt, source continuation uses a visit scope independent
of the list’s derived first document, with the original source owner and explicit
navigation sequence. A staged effect runs after the creator closes its governed
form. In-scope delivery requires a ready inventory containing the returned UUID;
pinned/filtered hosts use the existing external-document path. The staging guard
is separate from the original source intent: the admitted navigation increments
its own sequence without retiring the source owner. No timer or ceremony bypass
is used. Source removal before delivery prevents adoption, while a confirmed
creation stays known and an unresolved creation retains its recovery hold.

Focused regressions exposed and corrected implicit-default refresh invalidation,
form-close sequencing, dirty bookkeeping after form cancellation, and a reordered
inventory replacing the original dirty canvas. Existing task-drawer test fixtures
were aligned to the already-program-scoped native reads without changing those
reads or weakening their assertions. Final evidence is in the named packet; human
cases 76–83 are added to the existing Codespaces handoff and remain Not run.
