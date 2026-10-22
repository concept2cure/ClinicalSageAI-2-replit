# Passage omission — existing outcome consumer qualification

## What already exists

- `server/services/ana/tool-outcome.ts` already classifies declared shortfalls
  and builds the adaptation note for the next model turn. It honors refusal,
  explicit status, nonempty result and detail-only outage priorities, but treats
  every otherwise-successful empty `passages` list as `empty` even when the tool
  explicitly records known matches in positive `omittedPassages`.
- `tests/services/tool-outcome.test.ts` already qualifies genuine misses,
  unavailable services, needs-input states, returned records and ordinary notes.
- The registered passage handler already has fitting and omission counts. The
  parent contract completes its all-omitted response and this existing consumer;
  it does not introduce another classifier or change search authority.

## Frozen baseline

Source baseline: `4282257ac3da9b1c5d15b8e7db6c7599f2388f28`.
Contract clause 7 defines strict successful empty-passage/positive-safe-integer
omission classification after refusal, explicit status and returned records,
before a copied diagnostic's detail-only outage heuristic.

The new owned test imports actual existing `shortfallOf` and
`buildShortfallNote`. No proposed symbol, helper, missing module, retrieval,
provider or database seam is used. The cases cover:

- Known omitted matches, including the valid count boundary, bounded own detail
  and the no-detail envelope.
- Invalid counts or missing strict success/passage-list shape do not invent
  matches; genuine misses keep the old classification.
- Explicit refusal/status/unavailable flags and nonempty returned records keep
  priority. A copied old indexing diagnostic cannot turn known search matches
  into a whole-search outage; the heuristic remains for ordinary envelopes.
- Omission-only and mixed rounds get narrowing/reading guidance without
  describing the omitted search as no results. Ordinary round notes remain
  byte-identical; failed, stopped and held steps remain ignored.

Final unchanged-production baseline: **8 intended failures, 38 passing controls,
46 tests; exit 1**. Failures are behavioral: omitted matches are classified as
empty or unavailable, and adaptation notes report no results instead of omitted
matches. No import, setup or timeout failure occurs.

`baseline-command.json` records exact argv, Node 22.23.3, canonical configuration,
one worker/no parallel files, 4 GiB heap, UTC times and eight before/after input
hashes. All eight are unchanged. `baseline-red.txt` is unmodified raw output.
`frozen-test.json` binds final test bytes. Scoped ESLint with `--max-warnings=0`
passed; command and raw output are retained. No compiler or Git mutation ran.

The first baseline (7 failures/36 controls) used the earlier interpretation that
detail-only outage wording won even for a strict successful omission envelope.
Root clarified the contract before production edits: a copied old indexing
failure can contain that wording despite actual matches. `first-*` retains that
run honestly. The final run above tests the clarified contract and adds controls
for the unchanged ordinary heuristic.

This is a pure consumer test. It does not qualify retrieval, model output,
multi-tool round delivery, live deployment or language recognition quality.
