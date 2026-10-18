# D2: alternate JSON chat read-only enforcement

The current-turn constraint now reaches the JSON handler's tool surface and the existing executor guard. An earlier drafting request cannot authorize a non-read tool on a read-only turn. Authorized reads, conversation persistence, retrieval/generation/claim provenance and turn evidence remain available. Explicit later writes return to ordinary governance.

The handler skips submission-chat draft/rewrite routing for read-only turns, strips executable fences through the canonical helper, and suppresses action settlement, proposals, suggestions, navigation/action/demo chips, RIM capture and working-memory write-back. The canonical helper, tool register, executor enforcement, approval registries and provider/model configuration are unchanged.

## Verification

- RED: the unmodified handler produced **5 failures / 1 pass**. It still offered pinned non-read tools, returned a task command fence and artifact proposal, and invoked both implicit and explicit submission-chat rewrite paths. The ordinary-write case passed.
- GREEN: **41 tests passed across 4 files**, no skips, exit 0; duration 52.29s. This includes 6 new handler cases, existing private-project admission, canonical read-only helper and real executor rule-zero tests.
- Scoped ESLint: **0 errors**. The handler retains its **18 existing warnings**; the new test has **0 warnings**. Existing handler complexity increases **212 → 222** and counted function lines **992 → 1000** from the boundary guards. No warning baseline or lint rule was changed.
- `git diff --check` passed for the two changed source/test files. Final hashes match the GREEN source freeze.

The new suite exercises the real JSON handler, agentic loop, registered-tool authorization wrapper and action parser. The gateway/model and service effects are mocked; no provider API is called. It checks read access and truthful turn/conversation/evidence recording, refused model-originated non-read calls, suppressed proposal/background callbacks and all three chip types, and a subsequent explicit write restoring normal proposals and behavior. Navigation resolution and demo-script lookup are registered reads; their results stay recorded without executable response chips.

After the initial RED run, the offered-tool assertion was corrected to retain those registered reads, the demo fixture was corrected to its actual script envelope, and the positive continuation check was expanded to all chip types. The original handler still fails the revised tool-surface expectation (seven tools offered instead of three). RED and GREEN test hashes are retained separately rather than implying identical test bytes.

Run with the session's Node 22 binary first on `PATH` and `NODE_OPTIONS=--max-old-space-size=4096`:

```sh
node node_modules/vitest/vitest.mjs run \
  server/routes/chat/__tests__/send-message-read-only.test.ts \
  server/routes/chat/__tests__/send-message-private-project.test.ts \
  server/services/ana/__tests__/read-only-turn.test.ts \
  server/services/ana/__tests__/tool-authorization-rule-zero.test.ts \
  --config vitest.config.ts
```

`red.log` and `green.log` retain the outcomes. Their database/audit setup messages are from the mocked test environment; the admission suite also deliberately logs its injected thread-boundary stop. `red-pins.json`, `green-pins.json`, `final-pins.json` and `lint-delta.json` identify the sources and checks. This is focused local regression evidence; hosted CI, live-provider drafting and browser acceptance remain separate root-owned checks.

Only `server/routes/chat/send-message.ts`, the new `server/routes/chat/__tests__/send-message-read-only.test.ts`, and this evidence directory were changed by this workstream. No staging, commit, push, server or database startup was performed.
