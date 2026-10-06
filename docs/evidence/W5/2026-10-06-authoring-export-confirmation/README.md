# W5 / D2–D7 — authoring export confirmation and recovery

## Existing-build finding

The existing Authoring Word/PDF/XML export action reported that no file was
produced and the document was unchanged after any transport failure. The server
records authoring_export_history before sending bytes. A lost INSERT reply, lost
HTTP response, interrupted body, or send failure can leave a real export record
and baseline despite that message. Export requests could overlap, and a late
response could download or refresh after the active document/project changed.

## Repair

The existing POST /api/authoring/docs/:docId/export distinguishes three failures:
EXPORT_NOT_RECORDED before attempting the history INSERT; EXPORT_OUTCOME_UNKNOWN
when the INSERT's result is uncertain; and EXPORT_DELIVERY_FAILED after the
history write was confirmed. Partial streams are terminated rather than receiving
a second JSON body. A failure before headers are sent removes attachment, content
type and content length headers so the safe failure envelope is JSON.

The existing client distinguishes a confirmed refusal, uncertain recording, and
a recorded export whose complete file was not received. A 2xx confirms recording
even when reading its body fails; empty bodies are not offered as files. Confirmed
records refresh the existing export history. Unknown replies block repeat export
in that context until the author chooses Check export history, which opens and
refreshes the existing Workbench rail. The warning remains and a subsequent retry
is an explicit new export, not a re-download of an identical stored artifact.
There is no automatic retry, exactly-once guarantee, new artifact store, or new
endpoint. A per-context latch prevents overlapping requests across formats.
Document/project changes and unmount invalidate old receipts, including an
A → B → A switch and a body arriving after success headers.

Download success describes a browser download request, not proof the file was
saved to disk. Existing frozen/approved and signature-content gates remain in
force. Rendering/recording failures can still leave an attempted EXPORT audit
entry, which precedes rendering in the existing route; no audit rollback or
atomic export-audit/history transaction is claimed by this repair.

## Validation

Red: 12 failing new regressions and 14 passing cases across the two focused
client/server files. Green: 67 tests across 9 files:

- client/src/concept2cure/v2/__tests__/authoringCreateExport.test.tsx
- client/src/concept2cure/v2/__tests__/workbenchExportRecovery.test.tsx
- client/src/concept2cure/v2/__tests__/authoringExports.test.tsx
- server/routes/__tests__/authoringExportPdf.test.ts
- server/routes/__tests__/authoringExportDocx.test.ts
- server/routes/__tests__/authoringExportHistory.test.ts
- server/routes/__tests__/authoringExportSignatureManifest.test.ts
- server/routes/__tests__/authoringSignFreezeAndExportGate.test.ts
- tests/golden-journeys/ind-authoring.journey.test.ts

Run with NODE_OPTIONS=--max-old-space-size=4096 npx vitest run and these paths.
The Workbench test records a fixture export before dropping its reply, then finds
that record through the real history rail without a second POST. Server tests
inject render, INSERT-reply, and pre-byte send failures; these are harness tests,
not a live PostgreSQL/network-fault qualification. The IND journey uses real
PGlite SQL. No complete IND, production, agency submission, or client qualification
is asserted.

Production build, changed-file warning ratchet (6 files; no warning count changes),
test-import resolution and git diff --check passed. Full TypeScript on the
published commit remains an unchanged GitHub CI gate; no local full-tsc result
is asserted. No new dependency, schema, model, store, or capability was added.

## CI fixture type correction

The first published commit's zero-baseline TypeScript gate found two errors in
new test fixtures: a partial Response with a rejecting blob method needed the
existing explicit unknown cast, and the Workbench test supplied a segment prop
that DocumentAuthoring does not accept. Both fixtures were corrected; application
behavior is unchanged. The three affected client suites (39 tests) were rerun,
and the same zero-baseline gate verifies the correction on its published commit.
