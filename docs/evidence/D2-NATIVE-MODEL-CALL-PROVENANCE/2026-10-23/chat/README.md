# Mounted classic model-call provenance — fail-first evidence

## What already exists

The mounted `sendMessageHandler` already uses `loopToolCollector` and
`recordLoopTurn`; the adapter already offers `onModelResponse`. The canonical
recorder and author reader already accept/read `model.calls`, while classic
chat passes its composite display model as the summary model. This suite
exercises that actual existing path rather than introducing a second collector.
See the parent inventory and approved contract.

## Frozen baseline result

Ten tests ran: **seven intended semantic failures and three passing controls**,
zero skips. Every failure concerns missing recorded model calls or the resulting
wrong/absent author list. There are no missing-export, missing-method, fixture or
lint failures. The callback seam is invoked optionally so unwired observation
fails on retained facts. Included ESLint passed with zero errors and warnings
before the test was frozen. All 26 selected baseline input hashes matched both
before and after the run.

Cases cover first/no-tool response, raw gateway model versus the composite
legacy display model, mixed models, repeated-model distinct request IDs,
unknown earlier author, detachment from subsequently mutated response metadata,
and retention through late context413, raw-body422 and generic503 failures.
Raw tool bodies, final/failed outcomes, tenant/actor/thread, original error
identity, private diagnostic suppression and existing display behavior stay
asserted. Passing controls are first-call failure (no invented model), legacy
no-observer fallback/exact limitation warning, and invalid-message early return.

## Boundaries and reproducibility

The collector, `recordLoopTurn`, `TurnRecorder`, `servedModelsOf` and
`qualifyServedModels` are actual production implementations. The mounted route
runs via Express/Supertest. The executor scripts returned-response callbacks;
DB, retrieval and prompt/context services are deterministic substitutes. Only
`writeTurnRecordSafely` is replaced at the final durable-write boundary: it seals
the actual recorder in memory and uses canonical author qualification for its
returned status. A transparent wrapper records the real helper's input so error
identity can be checked. No durable database/chained-audit, actual executor,
provider delivery or live SDK behavior is claimed by this suite.

`red-command.json`, `red.txt`, `red-results.json` and `red-exit.json` retain the
exact Node22 argv, hash, raw transcript, machine report and exit. `baseline-*`
retain selected source pins; `lint-before-freeze.*` retain the included lint.
`frozen.json` lists the exact test hash, seven failures and three passing
controls. The worker made no production changes, Git mutations, dependency or
network operations. Root owns all edits after this final submission.
