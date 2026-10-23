# Native returned-model provenance — canonical publication

This completes the existing `onModelResponse` path through the shared native
collector/writer and three current hosts: classic chat, agent API and realtime.
Each returned model call retains round, actual provider/model and gateway request
ID; repeated calls stay distinct, unknown authors stay visible, and earlier
responses survive a later failed/stopped turn. The existing author reader and
qualification policy consume the same canonical record. Classic display-model
strings and legacy/no-observer behavior remain unchanged.

The contract and inventory were committed before tests. Three owners froze 43
new tests with 30 semantic failures and 13 passing controls against unchanged
selected baseline inputs; 35 existing adapter/author controls also passed.
Original red bytes/logs are retained. The initial 330/34 green run exposed one
included-lint complexity warning. A small helper extraction removed that growth
without changing frozen tests or warning baselines. The final run passed **330 tests / 34 suites**,
zero failures/skips; included lint has zero errors and 22 existing warnings (zero growth).

The collector/native-host suites use real TurnRecorder, PGlite and the chained
writer; their executor responses are scripted. Classic route tests use the real
collector/recorder/readers and seal only in memory at the final writer seam.
No live provider, full request trace, HMAC/RLS, deployment or agency-acceptance
claim follows from these fixtures. The existing limitation warning remains
honest about tool-step round assignments and later model inputs.

One incoming commit after the baseline changes three unrelated Markdown files
only. Root preserved it with a normal merge and checked that all 551 selected source
inputs remained identical; those selected inputs are not an exhaustive graph.
Normal direct push, whole-tree TypeScript and fresh remote Git-byte/ancestry
verification are recorded in the accepted publication section below. No branch, PR,
force or hook bypass is used.

The first normal push was blocked on one TS2352 in the deliberately incomplete
native-host test fixture. The only correction is an erased `unknown` bridge;
original bytes, first rejection log, exact diff and identical-runtime-JavaScript
proof remain in `root/`. No test assertion, fixture value, production behavior
or baseline changed. Current source/frozen manifests identify this revision;
corrected-source regression and actual accepted push are recorded separately.

## Accepted code publication

Normal direct push of `4718e17cb1224022684829a0e45f92f5048b5850` succeeded to
`concept2cure-v2`. Every gate passed, including whole-tree TypeScript with
**zero errors**. The original rejected push and successful retry command,
transcript and result are retained separately under `root/`.

The corrected-source regression passed **330 tests / 34 suites**, zero failures
or skips; included lint has zero errors and the same 22 existing warnings
(zero growth). [Current qualification](root/current-qualification.json) pins
current source and test bytes after the erased fixture-cast correction.

A fresh fetch verified identical local/remote heads, all **551 current selected
inputs**, 34 tests, four production files, three current test-freeze pins and all
**86 evidence files** tracked at the accepted code head. All **52 retained
ancestors** remain present and there are no unmerged entries. The original
70-artifact and 551-source manifests matched their historical `a36245bc...`
Git head. [Remote verification](root/code-verification.json) records each scope.

The final commit adds publication evidence only. Its manifest pins current
evidence files except itself; final normal-push and read-only synchronization
proof stays in the tool transcript to avoid a recursive evidence commit.
