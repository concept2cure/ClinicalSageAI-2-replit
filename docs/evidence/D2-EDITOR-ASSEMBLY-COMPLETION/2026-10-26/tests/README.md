# Assembly queue completion: focused behavioral evidence

W1 / D2; local/Codespaces only. The implementation contract is
`docs/design/ASSEMBLY_QUEUE_COMPLETION_2026-10-26.md`.

## What already exists

- `client/src/concept2cure/v2/editor/useAuthoringAssemblyBuild.ts` owns the existing build, retry, stop, source selection and retained review lifecycle.
- `assemblyDraftQueue.ts` runs the existing sequential candidate queue. `assemblyBuildTransport.ts` verifies the saved document through scoped inventory, detail and section reads. `authoringDraftTransport.ts` performs generation and separate explicit acceptance.
- Existing `authoringAssemblyBuild.test.tsx`, `authoringAssemblySources.test.tsx` and `authoringDraftTermination.test.tsx` cover refusal, ownership and retained candidates. The added `editor/__tests__/assemblyDraftQueueCompletion.test.tsx` exercises that same actual hook and its real queue/transport exports. It mocks only HTTP replies; it does not reproduce the queue algorithm.

## Reproduction and result

The confirmed assembly commit contains empty sections. A later saved-record read
finds author text in an exact pending section while a later section remains empty.
Before the fix, the populated section becomes failed and stops both initial
preparation and every explicit retry. No later candidate is requested.

`RED.txt` records five failing behavioral cases and eleven passing boundary
controls, with exit code 1. `RED-result.json` records the command, UTC start,
duration and verification that all pinned inputs remained unchanged through the
run. Root changed production only after this RED capture.

`GREEN.txt` records all sixteen cases passing with the same test file after the
root's queue/state change. `LINT.txt` is intentionally empty: strict ESLint
`--max-warnings=0` exited 0. Their result JSON files also verify pinned inputs
remained unchanged during each run.

The cases prove:

- Initial preparation and explicit retry preserve exact saved text and continue to later empty sections.
- Fully populated pending batches finish with zero candidates, no review session and no acceptance request. Ordinary retry excludes terminal preserved slots.
- Completed review edits and change reasons survive when a later populated section is preserved and another section is drafted.
- Missing sections, wrong IDs, wrong codes, malformed records, failed reads and inaccessible records still stop preparation.
- Stop, dirty-editor currentness loss and source selection change during delayed reads produce no preservation or later generation.
- Provider refusal after a preserved section still stops before later empty sections.
- Exact-section targeting and changed-source selection do not reuse unrelated pending slots.

Every case also checks that no acceptance request occurs. The text and source
fixtures are synthetic; this packet does not qualify live AnA/provider access,
a human browser session, an agency submission or deployment.

## Retained epochs and integrity

`RED-initial.txt` retains the first exploratory epoch (six failures / ten passing
controls). Its extra failure was an overbroad assertion that a changed source
selection must retain the old queue's stopped phase. Existing source selection
behavior leaves no slots in the newly selected set, so the phase can become
built while old slots stay unstarted. The final test asserts the meaningful
boundary: the new source identity, unchanged old slots and no generation. No
production behavior changed for that correction.

`red-inputs.json` and `green-inputs.json` pin SHA-256 hashes for the test,
queue/state/controller/transports/source-selection owners, test setup/config,
package metadata and approved design. The final RED test and all source
snapshots are retained as gzip files. The lockfile is pinned by hash only; it
was not copied or changed. Snapshots decompress to the exact bytes whose hashes
the input manifests record. The initial exploratory epoch's raw output is
retained separately; the final RED owns the authoritative pinned input set.

`ARTIFACTS-SHA256.json` hashes every other file in this packet. No compiler,
production build, repository-wide gate, Git mutation or live provider call was
run by this test worker.
