# Canonical passage round-budget proof

## What already exists

- `server/services/ana/agentic-loop.ts` already owns per-result capping, round
  targets, ordinary floors and private-map read placement. Ordinary bodies,
  including complete passage JSON, are sliced under round pressure. The proof
  calls that real export, not a replacement budgeter.
- `server/services/ana/document-passage-tools.ts` already fits passage-handler
  JSON at 7,500 UTF-16 units and preserves whole retained locators. These tests
  isolate later round delivery using synthetic serialized bodies; they do not
  rerun or independently qualify that handler or source admission.
- `server/services/ana/read-receipts.ts` already treats exact
  `notDeliveredResult(offset)` bytes specially during guarded handoff and only
  settles unchanged admitted payloads. Tests supply the budgeter's existing
  private-map shape without creating receipts or invoking settlement.
- Existing `agentic-loop-rounds.test.ts` and `read-receipts.test.ts` already pin
  ordinary slicing, the floor and read priority. Explicit golden strings here
  independently retain those legacy behaviors while completing passage handling.

The root [inventory](../INVENTORY.md) and [approved contract](../CONTRACT.md)
preceded this disjoint test file. Production and all 26 selected baseline inputs
remained unchanged during test creation, execution and freezing.

## Fail-first result

The frozen suite contains **24 tests: 13 intended failures and 11 passing
controls** against unchanged production. Failures demonstrate existing passage
slicing/invalid JSON, missing fixed withholding envelopes and incomplete
call-order capacity admission. The mixed-read case confirms existing read
decisions before failing on the sliced passage. There are no missing modules,
missing new exports, fixture-construction failures or live-service prerequisites.

The tests require first-three admission for four 7,500-character bodies,
replacement reservation for five 6,000-character bodies, exact serialized
references/metadata for retained bodies, immutable originals/private-map values,
per-result ceilings, fixed payload-independent withholding JSON, negative-room
short-body admission, tiny custom totals, private-map precedence and bounded
ordinary shares after capacity is released. Ordinary golden controls preserve
small rounds, equal-share slicing, the 20-call floor, read placement and shares,
exact-name selection, payload fields having no authority, and the empty round.

`baseline-command.json` records Node 22, canonical Vitest configuration, one
worker, the 4 GiB heap, exact argv, test hash and all 26 unchanged source/config
pins. `baseline-red.txt` is raw combined output and `baseline-result.json`
records exit 1. `lint-raw.txt` is actual ESLint JSON output, with zero errors and
warnings; stderr and its exact command/result are retained separately.
An initial identical-assertion run is retained as `initial-*`; only a header
comment was clarified about canonical setup's pg mock before final freezing.

## Scope and integrity

No provider, native handler, catalog or retrieval substitute is installed by
this file. Canonical `tests/setup.ts` mocks pg process-wide, and an imported
module emits database startup logs. This is not live DB, source access, receipt
persistence, provider delivery, model behavior, multilingual relevance or agency
acceptance evidence. Synthetic reference-shaped fields are opaque payload data,
not verified source identities.

The suite proves whole-or-withheld bodies, not a hard aggregate total for tiny
budgets or large ordinary-floor rounds. It does not bound framing overhead.
No production file, Git state, compiler or other owner's file was changed.
Frozen test and evidence hashes are recorded in `frozen-test.json` and
`evidence-sha256.json`. Raw transcripts remain byte-preserved.
