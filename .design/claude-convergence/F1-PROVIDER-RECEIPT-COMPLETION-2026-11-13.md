# F1: finish provider and AnA completion checks

W1, launch D1/D2. Continue from canonical `2a667bf51`, preserving the project-first workflow and existing provider/model approval boundaries. No app, route, service, table, tool, model, credential or dependency is added.

## What already exists

- `scripts/ops/codespaces-doctor.mjs` already performs opt-in OpenAI authentication/Responses usage and Anthropic model/Message usage checks. Both usage paths currently swallow JSON body failures and certify success solely from 2xx headers. Existing tests accept non-generation bodies. The current CLI and static error mapping are retained.
- New private receipt helpers may be split from the existing doctor into `scripts/ops/codespaces-provider-receipt.mjs`, in the same folder under Rule 6, solely to keep the existing file below its lint limit. Focused receipt cases may likewise be split from its existing test and imported by that same test entry point. These are private file splits, not services, commands or integrations.
- `scripts/ops/codespaces-doctor.test.mjs` already covers HTTP auth, billing, quota, model ladder and secret redaction; extend it with completed-body and receipt regressions, including real loopback body stalls. No real provider requests are needed.
- `scripts/ops/verify-ana-answers.mjs` already requires text, one provider/model done receipt and no_more_tools, supports explicit admitted model/project requests and provider assertions, and bounds login. Its text join coerces malformed non-string content. It waits for EOF and omits the current post_done completion contract.
- `scripts/ops/verify-ana-answers.test.mjs` already drives the real child CLI over isolated synthetic HTTP/SSE. Extend that existing harness; fixtures do not qualify a real provider or hosted Codespace.
- `server/routes/ana-ri/stream.ts` emits done before deferred persistence/evidence work; `server/routes/ana-ri/post-processing.ts` emits post_done. The canonical browser consumer `client/src/concept2cure/components/ana/useAnaChat.ts` enters finalizing on done, refuses EOF without post_done/error, and cancels the reader after authoritative completion rather than waiting on a lingering transport. This existing contract is followed, not changed.
- Existing SDK types in `node_modules/openai/resources/responses/responses.d.ts` and `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts` define the existing Responses/Message receipts. Validate the narrow receipt needed by these existing minimal usage prompts, retaining legitimate model version suffixes, and preserve HTTP refusal/model fallback behavior.
- Codespaces post-create/post-start, current doctor command, and `docs/operations/CODESPACES_NEON_OPENAI_RECOVERY.md` remain the existing operator path. The recovery guide lacks the existing actual AnA verifier command; add that narrow operator reach beside the provider probes. No automatic provider call is added. Scoped holds were released by the accepted canonical continuation.

Discovery: searched existing probes, SSE readers, routes, error consumers, SDK receipt types, the plan/ledger and current coordination. `git log --all --diff-filter=D` found no deleted replacement for the AnA/doctor probes. The browser parser is local to its React hook; importing that browser hook into a Node CLI would add coupling, so the existing CLI reader is corrected in place.

## Bounded repair and proof

Retain genuine RED source/test snapshots and raw logs before source changes. Provider usage must not pass on timed-out, unreadable, empty, unrelated or failed receipts; preserve no-charge defaults and existing static/redacted errors. AnA LIVE needs correctly typed answer text, its existing completed provider receipt, and ordered post_done finalization. Match the canonical browser completion boundary so a finalized answer is not held open by a lingering connection. Cover adversarial cases and positive controls in the current suites. Run scoped lint and normal canonical hooks; no gates, baselines, plans or ledgers change.

No provider key is available here. The prior existing-key decision remains in force; no new key is created. Live OpenAI, hosted Codespaces and high-risk model qualification are not claimed.
