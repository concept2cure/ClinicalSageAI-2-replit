# Shared authoring creation recovery

W1 / D2, 2026-10-17. Canonical `concept2cure-v2`, initial source `bfec9be6b`.
Continuation of the pushed current-access/exact-handoff increment `9bd3ee734`.
Local Codespaces qualification only; one existing editor and UI patterns.

## One mechanism

Extract the existing native creation hook's ref-backed attempt ledger into a
small shared authoring primitive. The primitive owns synchronous admission,
attempt identity, conditional updates and render notification. Native and
specialist adapters retain their own requests, receipts, messages and context
guards. Keep the native hook's public API and existing document/section
creation semantics unchanged.

The specialist hook owns one lane for all creation actions in the same host,
actor/organization and project. Open and Attach cannot create concurrently;
React rerender timing is not a lock. Retain the original title, module, section
code and content with a held attempt. Changing a result must not replace the
payload of an unresolved save. No global or durable store, endpoint, dependency,
origin classification, editor or automatic retry is introduced.

Separate state ownership from permission to publish effects. Existing actor,
organization, auth revision, project-visit and mount guards remain in force.
Older requests and finalizers cannot release a newer attempt. A token refresh
for the same actor remains valid. An overlap returns a blocked outcome, never
a shared success promise whose callers would both publish success effects.

## Outcomes and explicit actions

- Pending blocks all creation in that lane synchronously.
- Confirmed complete saves retain the exact document/project/section receipt.
  A later explicit action for the same payload freshly verifies scoped inventory,
  parent detail and section rows before reuse without another write. Missing or
  unverified records remain held; edited text is preserved. A changed payload
  can start a new deliberate save.
- Unknown document identity blocks repeat creation until an explicit successful
  scoped all-status document-list check. Display the check's inventory and
  uncertainty before another explicit creation. Never infer request ownership
  from a title, timestamp, list position or matching text.
- A confirmed document with unknown/refused section creation remains held.
  Check the exact document's membership in the scoped list, its existence and
  its section rows. Detail GET alone omits project identity; empty sections
  alone do not establish a parent. Malformed, refused or wrong-scope reads keep
  the block. Check performs reads only.
- If the requested normalized section code is absent, expose a separate
  **Continue saving text** action. It sends only the original section payload
  to the confirmed document. Never POST another document. The existing server
  parent reservation, normalized duplicate check and unique index remain the
  authority; a conflict requires another check, never overwrite.
- If that code exists, preserve it and offer inspection. A read does not prove
  that the interrupted request authored it. Do not overwrite it or replay
  caller lifecycle effects. Recovered inspection and section-only continuation
  use separate explicit controls; they do not automatically navigate or PATCH
  a correspondence record.
- A confirmed empty document opens by exact ID/project without a nonexistent
  section target. A confirmed existing section can supply its exact code.

## UI and proof

Reuse the existing `scaf-note` recovery notice, status/alert semantics and
`btn ghost` controls from native creation. Extract a shared presentation if
needed; add no CSS, dialog or surface. Place the notice near existing result
actions and outside horizontal toolbars. Preserve the specialist source result
while checking or continuing. All six caller modules use the same controller.

Capture RED before implementation, then native creation regression, specialist
scope/receipt and actual caller checks, meaningful parent/duplicate guarantees,
strict lint, compiler/build and UI/publication gates under
`docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/shared-recovery/`. Publish verified
increments directly with normal hooks.

## Limits

A verified list cannot identify a lost document response or prove no write
committed. New creation after that check remains a deliberate human choice.
Recovery GET does not establish edit authority; POST checks current permission.
A component-owned ref ledger does not survive remount, reload or another tab
and is not backend idempotency. Native creation retains its existing lifetime
and actor behavior. These bounds must be visible in evidence and human testing;
no provider, human-review, deployment or regulatory-readiness claim follows.
