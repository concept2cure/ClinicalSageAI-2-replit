# Existing workflow repairs after the demo rehearsal

Plan F1, workstream W1, launch D2. This packet qualifies repairs to existing
messaging/task composition, RBM import and demo preparation. No screen, service,
route, table, tool, dependency, provider policy or approval gate is added.

## What already exists

- `client/src/concept2cure/v2/surfaces/CollabLauncher.tsx` sends a message then
  optionally creates a task through the existing APIs. A failed second step
  previously allowed repeating the first. Confirmed delivery now remains
  explicit and cannot be resent in that composer; unknown outcomes remain
  unknown. Known message refusals still permit correction/retry. See messaging/.
- `client/src/concept2cure/v2/surfaces/RbmIngest.tsx` is the sole file/paste
  extract dialog, using `rbmWrites.tsx` and the canonical backend parser and
  projection service. It previously mixed stale file reads/provenance and lost
  receipts when its parent board refreshed. The same dialog now owns only its
  current read, permits same-file recovery, and holds the receipt/reprocess
  prompt until dismissal before refreshing. See rbm/ and its full inventory.
- `scripts/demo/launch-demo/packs/lumen-rbm.mjs` already owns required subject
  intake. It swallowed refusal as a successful step, allowing startup's existing
  completion marker. It now uses the existing must/step failure contract. This
  source change also changes the existing scripts/demo marker hash, so an older
  successful cache retries without adding another cache mechanism. See seeding/.
- `tests/validation/lib/harness.mjs` already supplies the API client shared by
  demo preparation. It retried JSON 429s, but waited then stopped on multipart.
  The same bounded retry loop now supports reusable FormData. Six retries,
  authentication, Origin, fields, filename/bytes and non429 behavior are tested.

Each lane's design/evidence inventory includes callers, underlying stores,
existing safeguards and deleted-history search. Held project/editor/Codespace
setup files, plan, ledger and gates remain untouched. Only existing paths are
completed under F1.

## Qualification checkpoint

- Genuine failures were captured before each repair, with exact source snapshots
  and hashes. Calibration/selector failures are explicitly excluded.
- Combined client run: 92/92 cases across seven files, 12.82 seconds.
- Combined script run: 20/20 cases, no network or real retry sleeps.
- Real browser: current input ownership, same filename recovery, native file
  picker reset, file/paste sourceRef and saved receipt pass, no page errors.
  Writes are intercepted; this does not claim a new native ingestion or provider
  qualification. Prior actual native intake is in demo-readiness/native/.
- Scoped lint has zero errors and no warning growth; new tests have no warnings.

qualification-status.json binds all eight changed source/test files. Raw logs
and lane-specific RED/GREEN evidence are retained. This is the frozen focused
checkpoint for ordinary canonical commit/push hooks and full CLI typecheck;
final publication is verified against Git remotely. No paid generation, real
recipient message, scientific approval, signing or filing was performed here.

The first full push compiler correctly blocked five unsupported test-selector
options. Those options were removed without changing a gate or baseline. The
final source/cutoff edit controls also clear stale duplicate authorization,
qualified by two genuine RED cases and the 92-case GREEN run. The earlier
browser receipt remains bound to its recorded component hash; it predates
only those two metadata handlers. Normal push hooks provide final type proof.
