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
only. Root will preserve it with a normal merge and check the 551 selected source
inputs remain identical; those selected inputs are not an exhaustive graph.
Normal direct push, whole-tree TypeScript and fresh remote Git-byte/ancestry
verification will be recorded after those operations finish. No branch, PR,
force or hook bypass is used.

The first normal push was blocked on one TS2352 in the deliberately incomplete
native-host test fixture. The only correction is an erased `unknown` bridge;
original bytes, first rejection log, exact diff and identical-runtime-JavaScript
proof remain in `root/`. No test assertion, fixture value, production behavior
or baseline changed. Current source/frozen manifests identify this revision;
corrected-source regression and actual accepted push are recorded separately.
