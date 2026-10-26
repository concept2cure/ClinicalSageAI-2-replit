# Live editor-section context qualification

W1 / D2. This packet extends the existing AnA conversation and saved-reference owners. No production dependency, model/provider call, editor, store, schema, deployment or Git publication was performed by this worker.

## What already exists

- `server/routes/ana-ri/stream.ts` is the live editor conversation route, also reached by the legacy `/api/chat/stream` alias. It has current project admission, request DB lease, shared route prefetch, one orchestrator and actual-message recorder.
- `server/services/ana-ri/chat-context-builder.ts:prefetchRouteIntelligenceContext` is live; its separate `buildChatContext` is not called by production. The latter was not expanded.
- `server/routes/chat/send-message.ts` owns the separate normal JSON chat path. Its old loose context ignored the authoring channel, and a custom system prompt replaced the default prompt. Existing special submission-chat dispatch remains outside this work.
- `server/services/ana-ri/open-document.ts` and the reader worker now admit the exact saved selector and use canonical `savedTemplateReview` source precedence, policy and reference rendering. These routes reuse that resolver rather than implement another reader.
- `server/services/ana-ri/context-blocks.ts` already owns prompt-context adaptation/serialization. The shared mapping here prevents the legacy orchestrator's CTD-only ACTIVE SECTION consumer from interpreting ordinal CRF/protocol headings as CTD headings.
- Existing stream route harness, current project PGlite fixture, normal JSON model-call recorder fixture and saved-document critique PGlite fixture supply reusable source/access/record boundaries.

## Completed wiring

Live stream prefetch and normal JSON chat pass the lazy request client getter, captured numeric actor and actual admitted project. JSON chooses one complete authoring channel, otherwise its legacy context, without filling identity gaps from another channel. The reference block is appended outside a custom JSON system prompt. Both live paths adapt trusted persona document type/code and document state from the admitted result; saved raw module/type/code/status claims cannot supersede it. Internal CTD-only section/module context is admitted only for resolved US_IND. Display/lookup codes are sanitized as single lines; exact raw saved codes remain in the mandatory JSON and persona data. Template references remain outside source evidence, and existing recorders retain exactly the sent gateway messages.

`chat/open-document-context.ts` is a small request adapter over the canonical resolver and existing optional timeout, not a second context engine. Existing large-file aliases were trimmed so warning counts and numeric warning metrics did not grow.

## Qualification and evidence boundaries

- `../routes-json-red.json` / raw gzip: two meaningful normal JSON HTTP/PGlite failures before any production mutation. Both reached200 with valid current project membership and canonical VIEWER grant, real source SQL, gateway capture and real recorder; neither ordinary nor custom-prompt input contained the retained child guide. Exact RED test/production source snapshots are compressed in this directory. `json-first-red.log.gz` preserves the preliminary identical behavioral run.
- `../routes-json-green.json`:9/9 across the6-case mounted JSON fixture and3-case pure mapping fixture, no source drift. Includes one complete legacy/authoring channel, no identity splicing, foreign-project and revoked-view protected-read refusal, ordinary/custom prompt preservation, real sent/recorded input equality, raw-code/legacy-sanitization separation, CRF CTD collision/status and unavailable-context suppression.
- `../routes-final-new-lint.json`: strict lint on new adapter and both new tests, zero warnings/errors, no drift.
- `lint-comparison.json` / `compare-lint.mjs`: existing stream25→25, JSON18→18, prefetch5→5 and context-blocks1→1 warning counts; zero errors and no numeric warning metric growth.
- `http/`: actual live stream real-orchestrator/current SQL/request-executor tests, preserved RED and intermediate epochs, final14-case no-drift qualification and strict lint. Its initial positive child-guide RED lacked a canonical VIEWER grant, so that case alone is not proof of authorized-flow failure; the independent foreign-private-project metadata leak and the valid-grant JSON RED provide meaningful failure proof. Later positive fixtures explicitly seed the grant.

The JSON fixture executes actual current actor/project/document/section/template SQL in isolated PGlite and uses the existing permission engines. Unrelated retrieval/counter service effects, the model executor and final durable writer are scripted seams; the real recorder seals in memory. These tests prove the exact context reached the recorder and gateway request, not a new durable-writer implementation, clinical correctness, scientific source support or human signoff. Root owns combined regression/build/gates/compiler, final source pins, publication and human checklist; human cases remain Not run.


## Legacy-channel compatibility correction

The root combined regression found four existing latency tests whose legacy `context.sectionCode` was no longer forwarded when `authoring_context` was absent. Those existing assertions were kept unchanged. A fresh actual HTTP/PGlite baseline under `http/legacy/` then proved the complete legacy saved selector lost its retained guide (one failure), while the explicit incomplete new channel remained a passing no-identity-splicing control (one pass; fourteen other cases intentionally skipped).

The existing context-blocks owner now exposes one `selectAuthoringContext` function reused by stream and JSON: choose the explicit complete authoring channel when present, otherwise the complete legacy channel. Never fill missing identity fields from the other. Current project/actor/VIEW admission and exact saved references remain unchanged. The fix passed all27 cases across existing stream latency, mounted normal JSON and pure mapping suites, no source drift (`../routes-legacy-fix.json`). The full actual stream replay passed16/16 with no drift (`http/legacy/green.json`). `legacy-lint-comparison.json` is pinned to canonical baseline6e72f4494 and shows unchanged warning counts and no numeric metric growth. Earlier freezes/receipts/manifests remain historical epochs; root's final manifest qualifies the complete packet.
