# Streaming read-window contract cases

## What already exists

The tests mount the actual `server/routes/ana-ri/stream.ts` route using its established `support/stream-route-harness.ts`. They register the real `read_project_document` handler; existing budgeting, snapshot deferral, host admission and receipt settlement run. `support/read-delivery-vault.ts` supplies synthetic admitted source access, coverage and an in-memory receipt writer. The scripted gateway records follow-up request payloads; this demonstrates host dispatch parameters, not live provider delivery.

The new `server/routes/ana-ri/__tests__/stream-read-unicode-windows.test.ts` contains eight cases: three explicit hard-end/tiny/split-start windows, an actual-end UTF-16 read walk, a round-withheld retry at the normalized start, pre-handoff cancellation, changed-source handoff refusal and an unchanged ASCII control. It compares dispatched JSON with both deferred spans, exact source slices and the synthetic receipt store. The walk joins whole strings and checks UTF-16 offsets; it does not use the existing suite's code-point reconstruction helper.

No SQL persistence, native RLS, provider execution, deployment or agency result is claimed. Cancellation is tested before handoff/commit, not as a promise to roll back a previously committed receipt.

## Execution status

This authoring record claims no execution result. Root owns baseline runs, semantic failure classification, frozen hashes, lint and qualification. No production, configuration or shared helper was edited.
