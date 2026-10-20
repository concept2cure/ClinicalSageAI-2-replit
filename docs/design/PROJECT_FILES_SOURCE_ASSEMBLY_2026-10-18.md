# Project files source assembly

W1 / D2. Canonical `concept2cure-v2`; starting source `3cae08d23`.
User direction: document assembly begins with catalogue / Data Room sources,
inside the single existing editor and its established UI principles.

Resumed 2026-10-20 on `e1c63ae9b` after reviewing the intervening canonical
changes. The pending adapter extraction preserves the current Vault search
contract imported from `VaultLibraryResults.tsx`. Earlier test receipts describe
their original source only; final qualification must use the updated checkout.

## What already exists

- `editor/SourceAssemblyDialog.tsx` and `editor/useSourceAssemblyTarget.ts`
  already own the read-only source-to-working-document chooser and its context
  guards. `DataRoomSourcesPanel.tsx` and `surfaces/ProjectHome.tsx` reach it.
- `surfaces/Vault.tsx` already offers the upload adapter in its details pane.
  This work extracts that adapter into `editor/VaultSourceBuildAction.tsx` and
  uses it from the existing `editor/ProjectFileActions.tsx` selected footer.
  The footer currently offers open/import/citation/reference, without assembly.
- `editor/ProjectFilesPanel.tsx` already supplies the effective project, Vault
  tree and paginated search rows. `surfaces/VaultLibraryResults.tsx` now owns
  the full-Vault search shape/guard; that canonical consolidation is retained.
- `editorTarget.ts`, `editor/assemblySourceIntent.ts`,
  `editor/DocumentWorkbench.tsx` and `editor/useAuthoringAssemblyBuild.ts`
  already own publication, guarded document navigation, source adoption and
  the one preview/build/candidate workflow. They are reused unchanged.
- `shared/authoring/assembly-sources.ts` and the existing
  `server/services/authoring/authoring-assembly-sources.ts` own source identities
  and current source verification. No parallel reader or contract is needed.
- The retained `saved-source-reuse/browser/probe.tsx` evidence host already
  mounts the actual editor. This packet imports that host and scopes its mock
  module through the local fixture server, rather than copying the host.

Product paths above are under `client/src/concept2cure/v2/` unless otherwise named;
the evidence host is under the sibling 2026-10-18 editor-integration packet.
Current-branch searches covered source assembly/build names in client surfaces,
authoring routes/services and shared contracts. Deleted-file history was checked
with `git log --all --diff-filter=D` for ProjectFile, SourceAssembly and
VaultSourceBuild names; no competing deleted rail implementation was found.

## Confirmed gap and boundary

The existing Project files rail exposes Data Room assembly but its Vault lane
only exposes opening a file, whole-source import and section citation/reference.
An author can find a Vault source beside the document without a way to select
it for the existing assembly workflow. The full Vault surface already has that
adapter. Reuse it in the selected-file footer; do not add a new editor, form,
navigation channel, provider, source reader, schema, dependency or stylesheet.

Extract the current full-Vault upload adapter into one small shared component.
Render the existing **Build in editor** action for an upload with a real Vault
document identity and an explicit effective project. Both full Vault and the
Project files selected footer use it. Do not derive a Vault UUID from a tree
row id, title, checksum or matching Data Room citation identity. Preserve the
`vault` namespace, exact `docId` and a supplied expected checksum. Search rows
already map their exact returned UUID to `docId`; later search pages remain
usable through that existing mapping.

Source eligibility follows the existing adapter: withdrawn, superseded and
earlier versions are refused; missing original bytes do not alone prohibit
using verified retained text. Whole-source import keeps its own availability
rule. Malformed source identities/checksums fail through the shared action's
existing parser rather than being coerced or silently broadened. Authored
sections, folders and absent document/project identities offer no upload build.

## Existing interaction and authority

The rail passes its effective `programId`, including a held document's actual
project, and its existing optional external `onNav`. Do not look up a different
shell project in the adapter. The shared chooser reads the same project's
saved working documents and rechecks the chosen document before publishing.
Selection, chooser mount, opening a target and editor remount perform no
authoring write, preview, generation or acceptance.

Inside the editor, omit external navigation and let the existing target
listener/request-leave flow protect dirty content and governed forms. A clean
accepted target adopts only the explicit Vault selectors and opens the existing
build disclosure; a fresh template/target preview is still required. A pinned
editor continues through its existing guarded external-document path. The
adapter does not require an editable current section: source browsing can lead
to a different saved working target. The target's current edit/build admission
remains authoritative.

The source action and chooser retain their current actor, session, organisation,
project-visit, selection and unmount guards. Changing the selected source or
project cannot publish or revive a pending old choice, including a project
round trip. A live change in the launcher's availability or disabled state must
also retire its chooser, including withdrawal then re-allowing the same source.
Include that state in the existing private launcher scope; do not add a second
activity store. Reusing this entry must preserve existing draft/review buffers and
source selections when the host refuses navigation. No direct adoption into
the build controller or bypass of its current source verification is added.

## Ownership and evidence

Root owns this contract, canonical synchronization, local testing guide, final
verification and direct push. Entry implementation owns the extracted adapter,
`ProjectFileActions.tsx`, `ProjectFilesPanel.tsx`, the full Vault adapter
replacement, the existing launcher scope and focused panel tests. Independent
editor qualification owns a separate actual-Workbench flow test. Browser qualification owns only the new
evidence fixture/receipts. No overlapping source edits or delegate Git writes.

Evidence: `docs/evidence/D2-EDITOR-INTEGRATION/2026-10-18/project-files-source-assembly/`.
Retain a meaningful missing-action failure, exact source pins and raw statuses.
Qualify browse and later-page search UUID handoff, source availability and
namespace rules, no selection or automatic write, local and external hosts,
late context changes, actual dirty/ceremony guards and both build modes through
the existing controller. Preserve Open/import/cite/reference behavior.
Use bounded desktop/touch light/dark browser checks of the actual editor and
canonical styles. Run scoped lint, official zero-baseline compiler, production
build, editor/design/security gates and unchanged warning counts. Human and
live-provider testing stay explicitly unrun. No deployment or agency claim.
