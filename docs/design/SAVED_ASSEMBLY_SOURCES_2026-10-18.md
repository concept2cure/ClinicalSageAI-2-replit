# Reuse saved document build references

W1 / D2, canonical `concept2cure-v2`, initial source `e62320e0a`.
Continuation of the founder's source-first document assembly direction. The
existing build writes document-level `ASSEMBLY_SOURCES` audit events, including
all-preserved builds, but a remounted editor cannot reuse those references.

## Product behavior

Reuse the existing document build disclosure, notices, forms and buttons. No
new editor, route surface, stylesheet, dependency, schema or provider. The root
design skill remains the UI authority. Preserve source selection, import,
template assembly and the existing retained AnA candidate review paths.

Add **Check saved sources** and, after a successful read, **Use saved sources**
inside the existing build controls. Reading is explicit and read-only; opening
the editor/disclosure does not restore preferences or start a write/generation.
Name the result as the last recorded source-based build references, not the
current selection, complete document bibliography, citations or scientific
qualification. Clearing selected sources remains local; it does not erase history.

Show the verified historical event time and exact source titles/identities.
Only a fresh explicit reuse adopts source selectors through the existing
assembly controller. Require another verified read at reuse, the same event and
manifest as the displayed result, current editable/clean context and no governed
form, active build/generation or unresolved write outcome. Refuse changed records
instead of silently adopting another event. A new catalogue handoff/local
selection takes precedence: require clearing it and checking again before reuse.
Require closing the existing draft review pane before reuse, preserving its
uncontrolled edited buffers and covering manual generation/accept/check work.
Pass that existing host state as a narrow saved-reuse refusal; if the pane opens
during the read, the late reuse must fail. Historical checks remain read-only
and available while the pane is open. Do not create another draft activity store.
No old plan, reason, AnA option, candidate, acceptance or generated prose is
restored. The user chooses a template and previews a new build; its excerpt
selection is freshly visible. No broad retrieval fallback on a failed reuse.

## Shared read contract

`shared/authoring/saved-assembly-sources.ts` owns the text-free response and its
strict copied decoder:

```ts
interface SavedAssemblySourceRecord {
  eventId: string;
  recordedAt: string;
  manifest: AssemblySourceManifest;
}
interface SavedAssemblySources {
  version: 1;
  docId: string;
  programId: string;
  record: SavedAssemblySourceRecord | null;
}
```

Exact UUIDs, an ISO timestamp and the shared manifest parser are required.
Manifest project must match the response project. No source chunks, actor
addresses, original bytes, old build fingerprint or general audit text leave
this read. A null record means a successfully admitted query found no recorded
selection; missing/failed/malformed reads never become null.

Add `GET /api/authoring/docs/:docId/assembly/sources?programId=<uuid>` on the
existing authenticated assembly registration. Return `{success:true,data}` or
the existing `{success:false,error:code,message}` error shape. Authenticate the
actor from the request. Verify current project and whole-document read authority
through `getCurrentAuthoringReadScope`; section-only access and an audit-role
bypass do not authorize this read. Authorized whole-document viewers and frozen
documents may inspect references; reuse remains an edit-context decision.

Read document-level `ASSEMBLY_SOURCES` events directly, not the capped general
audit rail or section CREATE metadata. Use the canonical recorded chain order
where available; detect absent, malformed, duplicate or ambiguous ordering and
refuse rather than guess an older usable event. Verify the newest candidate's
trail metadata/content/reason/operation against its canonical audit entry and
payload hash, plus exact document/project identity and manifest. Reuse existing
audit verification helpers; do not claim a whole tenant-chain walk from a local
row/payload verification. A damaged newest event never falls back to an older one.

Revalidate the stored manifest through `readSelectedAuthoringSources` with
`expectedManifest`, including exact old spans, extraction/original hashes,
current versions/dispositions, source ACLs and retained-text rules. Recheck the
latest event and current document/project/source authority before release so
mid-read changes cannot publish older selection or private metadata. A missing
event is an explicit empty result. Unverifiable evidence, changed sources and
unavailable admission are explicit 409/403/503 refusals with no source metadata.
GET must not write, touch the document, extend audit history, draft or consume
candidates. No database migration and no source text in the response.

## Client lifecycle

Keep saved-reference state separate from build phase, plan and unknown-write
holds. Use the current controller's actor/session/project-visit/document/source
revision guards and per-attempt token before and after every await. Prevent
double-click requests, stale finalizers, project/document/source ABA and late
adoption after dirty/ceremony/context changes. Hide cached historical metadata
as soon as its owner is stale; never revive it by returning to the same IDs.
Scope transport/runtime decoding to the exact active document and project.
Errors and explicit empty results preserve any local text, plan, source
selection and retained reviews. Reusing valid references invalidates old plans
through the existing selection setter and still preserves retained reviews and
unresolved-write holds. No automatic source recovery or generation on mount.

## Ownership and evidence

Root owns this contract/shared response parser, final integration, guide and
direct canonical push. Backend owns the new saved-source service, assembly GET
registration and new actual HTTP/PGlite tests. Editor orchestration owns the
controller extension, saved-reference notice and new client tests. Once this
contract is published, independent evaluation/browser work may run in parallel.
No delegate stages, commits, pushes, changes a baseline or edits another owner.

Evidence: `docs/evidence/D2-EDITOR-INTEGRATION/2026-10-18/saved-source-reuse/`.
Preserve meaningful missing-feature failures. Verify old records beyond500
general events, recorded ordering, no older fallback, all-preserved builds,
viewer/frozen reads, section/private/foreign scope denial, tamper and stale
sources, retained text, mid-read revocation/new event, actual zero-write GET,
reopen/check/reuse/fresh preview, both build modes, dirty/ceremony and unknown
holds, rapid/late requests, source/project/account ABA and original editor
regressions. Run compiler/build, existing single-editor/design/security gates
and no per-file warning growth. Record local/synthetic versus actual SQL proof
honestly; human and live-provider tests remain unrun until performed.
