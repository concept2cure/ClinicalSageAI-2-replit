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

Three owners froze **43 new tests: 30 intended semantic failures and 13 passing
controls**, zero skips, with included lint at zero errors/warnings. All 26
selected baseline inputs and 31 existing regression files stayed unchanged
before production. Another 35 existing adapter/author-reader controls passed
unchanged. [Frozen tests](frozen-tests.json) pins exact bytes; raw transcripts
and substituted/real boundaries are under `collector/`, `native-hosts/`, `chat/`
and `adapter-controls/`. No missing-export/method or fixture failure counts
as red evidence. Production edits follow this freeze.

## Qualification

The initial full regression passed **330 tests / 34 suites**. Included lint
then found one new helper complexity warning; its exact initial results remain
under `root/green*` and `root/lint-green*`. Root extracted only the served-call
replay/limitation selection into a small typed helper, preserving method order
and all frozen tests. No suppression or baseline changed.

Final Node 22 regression passed **330 tests / 34 suites**, zero failures/skips,
including all 43 frozen new cases. Explicit included lint across seven changed
TypeScript files has zero errors, the same 22 existing warnings and zero growth;
all new tests and the shared helper have zero warnings. Two source reviews,
a further helper review and an independent final evidence review cleared the
change. [Qualification](root/qualification.json) pins commands/results, all 551
selected source/test/config inputs and exact production/test bytes. The selected
inputs are not an exhaustive dependency graph.

Actual normal push, TypeScript and remote-verification evidence is recorded in
[publication](PUBLICATION.md). Tool-step rounds and later model inputs remain
unavailable through these entry points and the record explicitly says so.
