# Reach native per-call model provenance — D2 / W2

The non-streaming AnA entry points retain only a final model; earlier returned
models disappear, including on a late failure. Classic chat also passes its
composite display model to the record. This completes the existing model-response
observer through the shared native collector and canonical turn record so the
current authoring qualification sees every reported model, including unknowns.

## What already exists

The existing adapter emits every returned model response, the native collector
already retains tool work, and `TurnRecorder.addServed`, `servedModelsOf` and the
current qualified `servedBy` writer already support per-call provenance. Three
hosts omit that wiring. [Inventory](INVENTORY.md) names paths, limits, consumer
and deleted-history searches; [contract](CONTRACT.md) fixes the narrow interface.
No second record store, gateway/adapter change, schema, dependency, surface,
model or qualification policy is added. Tool-step rounds and later model inputs
remain unreported and are still stated as limitations.

## Evidence

`baseline-inputs.json` pins selected initial inputs before tests/production.
Disjoint fail-first and compatibility evidence will be filed alongside this
README. Root owns production and direct canonical commits. Qualification and
actual publication outcomes will be appended after completion; this document
is not yet a claim of a passing or deployed implementation.
