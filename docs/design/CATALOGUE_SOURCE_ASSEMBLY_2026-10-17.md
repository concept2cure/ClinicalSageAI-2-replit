# Source-first document assembly

W1 / D2; canonical `concept2cure-v2`; source `ff5e065a7`.
User direction: orchestration, assembly and use of data should begin in the
data catalogue / Data Room. This extends existing Projects, Vault and Authoring.
No new editor, surface, provider, schema, dependency or stylesheet.

## Entry and handoff

Add **Build in editor** beside the existing explicit Data Room source selection,
plus a per-source entry in current-project Vault/catalogue details and the
existing Data Room source rail. Keep **Work on document** as the canonical
verbatim whole-source import. Do not repurpose Vault filing checkboxes or infer
selections from the newest sources when no source is selected.

One shared dialog uses existing `de` form/list/notice patterns. It names the
original project and exact selected source identities, reads current working
documents for that project, and lets the user choose one saved document. Its
continue action only opens that exact document in the existing editor; no
write or generation occurs from selecting sources, opening a dialog or mounting.
With no suitable document, explain how to create one through the existing editor
then return. Do not duplicate the creator or send a pre-mount creation event.

Use the existing `editorTarget` channel with optional
`assemblySources: {version:1,sources:AssemblySourceSelector[]}`. Both setter and
reader validate and deep-copy it. Require original project plus exact document
identity; URL/notification parsing cannot manufacture this intent. Capture
session/account/organization/project-visit guards in the launcher and receiver.
The canonical target channel privately retains the publisher's guard before
dispatch, so a slow editor load cannot adopt an earlier account or project visit.
Closing the chooser alone does not invalidate a current handoff.
Bind sources only when that exact document navigation is accepted through the
existing dirty-work/ceremony guards. An unrelated/default document never inherits
them. Source/actor/project changes cannot revive an old asynchronous handoff.

## Shared contract

`shared/authoring/assembly-sources.ts` owns selectors, manifest validation and
the maximum of five explicitly selected sources (the existing section-draft
source bound). Selectors retain their own namespaces:

```ts
type AssemblySourceSelector = (
  | {kind:'data-room';sourceId:number}
  | {kind:'vault';documentId:string}
) & {expectedChecksum?:string};
```

Reject invalid/empty/oversized/duplicate selections instead of dropping entries.
Use a supplied row checksum as an additional expected-version check. Never
coerce CRE integer IDs into Vault UUIDs, infer identity from title/hash, or trust
client source prose. Display labels are not evidence.

Existing `AssemblyPreviewInput` gains optional `sources:AssemblySourceSelector[]`;
`AssemblyPlan` gains optional `sources:AssemblySourceManifest`. Omitting sources
preserves existing template-only semantics. Existing commit repeats selectors
and uses the plan fingerprint. The manifest is text-free and carries original
hash, extraction hash, exact UTF-16 excerpt coordinates and excerpt hash,
recorded version, original availability, disposition and explicit limitations.
Each excerpt is at most 8,000 UTF-16 characters; at most five sources means the
entire selected set fits without dropping a source. Preview selects a bounded
window using the canonical source-window helper. It does not claim a full-file
scientific review. Unfiled current Data Room text is supported without requiring
Vault filing. Missing original bytes do not by themselves forbid retained,
verified readable text; original-file import availability stays separate.

## One private source resolver

`readSelectedAuthoringSources(q, identity, selectors, options?)` lives in
`server/services/authoring/authoring-assembly-sources.ts`. Identity is the
verified organization/user/program. Options support a deterministic preview
query, exact manifest verification, and source reservation in the caller's
transaction. It returns `{manifest,chunks}`. Chunks remain server-side and use
the current section-draft `{content,title,sourceId}` vocabulary; CRE attribution
uses only genuine canonical IDs and verified links. Vault uploads without a
canonical CRE link remain honestly uncited.

For Data Room, reuse exact actor/recorded-parent admission from
`source-read-access`, require the exact saved program/current/data-eligible
source, and read persisted `cre_evidence_sources.extracted_text`. For Vault,
reuse actor catalog scope/current document readers. Both require genuine hashes
and nonblank readable text, recheck authority before release, and reserve
current versions/dispositions under commit/accept locks. Unknown source scope,
withdrawal, supersession, unavailable extraction, conflicting expected hashes
and same-length extraction corrections fail closed. No optional source is
silently skipped and no failure becomes broad project retrieval.

Manifest fingerprints include stable ordered source/excerpt identities, not
read timestamps. Assembly fingerprints include the full verified manifest.
Commit recomputes and locks the same sources. Persist the versioned manifest in
new-section audit metadata and a distinct document assembly audit event even
when every target section is preserved. Preserve original import provenance and
existing section prose/order; source references are intent, not verified citation
support, model consumption, scientific qualification or filing approval.

## AnA and deterministic mode

Without AnA, retain existing template/stored-content assembly and the explicit
source-reference manifest. Do not promote source text into actor-authored science.
The existing whole-source import remains available when verbatim editing is needed.

The section draft endpoint gains optional `sources:AssemblySourceManifest`.
The private resolver rechecks and supplies precisely the manifest's saved spans,
not a newly chosen window. Verify before dispatch and after generation; no
broad retrieval fallback is allowed for explicit sources. Store the manifest in
existing candidate generator JSON as `assemblySources`, alongside saved-base
and existing Vault receipts. Acceptance revalidates/reserves it in the existing
transaction before any content update. Malformed stored receipts are retained
and refused rather than dropped. Failure rolls back candidate consumption and
section/audit/lineage changes. Existing no-selection behavior remains intact.

The current build controller/queue remains the sole orchestration owner.
Pass the exact manifest to every selected candidate request, retain candidates,
edits/reasons and source identity across reviews, stop/retry explicitly, and
never auto-accept. Changing a source selection invalidates an old preview and
prevents it from adopting candidates from another selection. Present current
source titles/kinds/versions/hashes/excerpt bounds and limitations in the same
build disclosure. Open it for a valid catalogue handoff without starting work.

## Evidence and ownership

Evidence: `docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/`.
Root owns contract/shared source schema, synchronization, final checks and push.
Backend owns private source resolver + assembly/source persistence.
AnA server owns draft/store acceptance integration. Entry UI owns shared target
dialog + source surfaces + editorTarget validation. Orchestration UI owns the
Workbench receiver + build controller/transport/queue + source presentation.
No overlapping edits or Git mutations by delegates.

Verify meaningful initial failures, actual SQL/HTTP current access and rollback,
exact mixed source/excerpt parity, all-preserved reference persistence, no
fallback, unchanged editor/import behavior, stale/dirty/context handoffs and
both build modes. Reuse bounded browser evaluation in existing desktop/touch
light/dark styling. Run official compiler/build, existing editor/UI/security
guards and warning ratchet without baseline growth. Human/provider cases remain
Not run until actually performed. Direct canonical publication; local Codespaces
testing only. No deployment or live provider configuration/calls.
