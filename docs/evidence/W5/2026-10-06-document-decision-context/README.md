# W5 / D2–D7 — document removal decisions stay with their source

## Current-build assessment

The existing project Data Room and Vault already expose DocumentDisposition.
The existing preview/apply API and transactional service implement keep_data,
remove_data and supersede; physical erasure is a separate retention process.
The apply service remains gated by C2C_DOCUMENT_DISPOSITIONS_ENABLED=1. This
session neither changes that flag nor claims production activation.

The remaining defect repaired here was selection lifetime. Reusing the dialog
component for another project or source retained its prior preview, selection
and reason. A pending save could then display its result and invoke onChanged
against a later selection. Server preview tokens already enforce scope; this
repair also prevents stale decisions and receipts in the client.

## Change

The existing component resets all decision state on project, target type or
target identity change. Its old preview and reason do not survive. Reads and
writes use the request generation to ignore responses from the previous source,
including both recorded and refused responses. The original request can still
finish on the server: this is response isolation, not cancellation or rollback.
A synchronous pending-write latch prevents overlapping confirmations in one
mounted dialog. No new model, dependency, endpoint, store or schema is added.

## Evidence

Before implementation: documentDisposition.test.tsx had 4 failures and 17 passes.
The failing tests change either project or document after preview, then resolve
a pending successful or refused decision after selecting another document.
After implementation: 134 tests passed across 12 files, run with
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run and these targets:

- client/src/concept2cure/v2/__tests__/documentDisposition.test.tsx
- client/src/concept2cure/v2/__tests__/projectDocumentDisposition.test.tsx
- server/services/document-data-disposition/__tests__
- server/services/ana/__tests__/authoring-canonical-bridge.test.ts
- server/routes/__tests__/review-board-authoring-store.pglite.integration.test.ts

This includes the existing real SQL tests for retain/withdraw/supersede, audit
failure rollback, stale/tampered/expired tokens, tenant boundaries, citations,
retrieval/catalog eligibility and runtime-role constraints. These tests do not
establish live tenant qualification or production activation. Production build,
changed-file warning ratchet and git diff --check passed. Full TypeScript
confirmation is delegated to the unchanged GitHub CI gate; the prior commit's
four type errors are corrected in the same follow-up.
