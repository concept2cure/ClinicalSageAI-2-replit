# D6 — Anthropic-hosted tools reach only first-party Anthropic, and only for a tenant that opted in (2026-09-26)

**Row:** D6, W2 gateway scope. **Workstream:** WS2 of the AnA local-safe-AI plan (OQ-PL-06 and OQ-PL-07 in §9).
**Builds on:** `../2026-09-25-tenant-boundary/`, which made the tenant placement policy hold on every dispatch.

Web search, web fetch and code execution are *server tools*: the model calls them and Anthropic runs them on its own
infrastructure. A search query or a URL is written by the model from the conversation, so it carries the tenant's
context. Code execution runs the conversation's data in a sandbox Anthropic hosts. Neither location appears in the DPA
annex.

## What was wrong (at `a80fd373`)

1. **Environment flags were the only gate.** `ANA_ENABLE_WEB_SEARCH`, `ANA_ENABLE_WEB_FETCH` and
   `ANA_ENABLE_CODE_EXECUTION` (`AnaToolDefinitions.ts` `getEnabledServerTools`) offered the same tools to every tenant
   on the deployment. That included a private-lane, zero-retention or residency-bound tenant. None of the flags is set in
   any deployed configuration in this repository, so this had not happened; nothing stopped it once a flag was turned on.
2. **The gateway forwarded tools verbatim to Bedrock and Vertex** (`gateway.ts:2161` and `:2360`,
   `params.tools = request.tools`). A private lane either cannot run them, or runs hosted search the tenant never chose.
   The OpenAI-compatible executor dropped them with only a log line, so the ledger could not show that a turn ran
   without web search.
3. **`web_fetch` had no boundary** (`AnaToolDefinitions.ts:2787-2790`): no `allowed_domains` and no `max_uses`, while
   `web_search` had both. The model could fetch any URL it wrote or found in a document.
4. **A Files-API document reference went to every lane.** On Bedrock and Vertex, `gateway.ts:2177` and `:2387` attached
   the beta header and sent a `document` block given by Anthropic file id. Those lanes cannot resolve the id, so the
   model would answer about a file it never saw.
5. **The `/ana` realtime socket was a fourth, ungoverned door.**
   - `ana-realtime.ts:117` passed `getAllEnabledTools()` straight to relevance selection: no tenant deny-list, no
     catalog gate, and every hosted tool the deployment had enabled.
   - The turn also ran with no tenant scope. Under `RLS_ENFORCE=on`, every query it made refused, and the fail-soft
     tool-policy read degraded to "every tool allowed".
6. **Hosted-step evidence never reached grounding.** Sources and fetched text never joined the corpus the answer is
   grounded against (`stream.ts` `toolEvidenceCorpus`), so a citation taken from a web result could not be credited.

## What is true now

- **One rule decides where a hosted tool may run** (`server/services/ai-gateway/server-tool-policy.ts`):
  1. **Only first-party Anthropic runs them.** Bedrock, Vertex, OpenAI, Azure, Kimi and the self-hosted lane have them
     withheld.
  2. **Code execution only ever sees a provably `public` payload.** AnA's turns are tenant payloads, so it is never
     offered to them. The platform's own sandbox (`run_python_script`) is the path for tenant data.
  3. **A tenant-bound request needs the tenant's opt-in:** a resolved placement policy with `public_source_frontier` on,
     `public_source_egress` not off, no zero-retention requirement, no residency requirement, and Anthropic and
     `frontier_shared` not excluded. No policy row, or a policy that could not be read, is no opt-in.
  4. **Work with no tenant is not held back:** the explicit system scope, or development with no scope. In production,
     a call with no tenant binding is already refused by WS1.
- **The toolset applies it** (`governedToolsetFor`), so a tenant is never offered a tool it has not opted into. An
  org-less turn gets none.
- **The gateway applies it again, per lane, in `executeProvider`.** This covers the primary and every fallback, just
  before dispatch, so a door that skips the toolset cannot get past it.
  - Withheld tools are removed, together with a tool choice that named one; nothing leaves.
  - The response carries `withheldServerTools` (name and reason).
  - The served ledger row's metadata records `serverTools.withheld`, and `serverTools.used` for hosted tools that ran.
- **`web_fetch` is bounded like `web_search`:** the same agency domain list (`REGULATORY_WEB_DOMAINS`) and
  `max_uses: 5`.
- **A Files-API document reference is refused off first-party Anthropic** (`FileReferenceNotCarriedError`,
  `FILE_REFERENCE_NOT_CARRIED`). It is terminal like every `GatewayPolicyError`. The beta header is sent to
  first-party Anthropic only.
- **The realtime socket turn is governed like the other doors:** it runs in the tenant scope the socket was
  authenticated for, and composes its tools through `governedToolsetFor`. `chat-path-parity.test.ts` now covers it.
- **Hosted-step evidence is grounded.** Each web step's sources, and a fetched document's text up to 12,000 characters,
  join `toolEvidenceCorpus` (`serverToolEvidence`).

## Red and green

| What | Red (`a80fd373`, every WS2 source file at HEAD) | Green |
|---|---|---|
| `server-tool-policy.test.ts` (the rule) | cannot import: the module did not exist | pass |
| `server-tool-placement.test.ts` (route level, fake SDK) | 8 of 10 fail. Bedrock was sent `web_search` and `web_fetch`; a no-policy, ZDR, egress-off and unreadable-policy tenant all got them on Anthropic; `code_execution` ran a tenant turn; a file-id document went to Bedrock | 10 pass |
| `governed-toolset-hosted-tools.test.ts` | 6 of 6 fail: every tenant was offered all three hosted tools | 6 pass |
| `server-tools-gating.test.ts`: web fetch bounded | 2 fail: no `allowed_domains`, no `max_uses` | pass |
| `server-tool-steps.test.ts`: grounding evidence | 4 fail: no evidence function | pass |
| `chat-path-parity.test.ts`: realtime door | 2 fail: realtime skipped `governedToolsetFor` and ran unscoped | pass |

Totals: red `red/ws2-tests.txt`, 22 of 62 fail. Green `green/ws2-tests.txt`, 70 of 70 pass. The wider run, 549 test files
and 6,179 tests across the gateway, AnA, AnA-RI, routes, config and the action queue, passes (`green/repo-gates.txt`).

## Decisions made here, and why

- **Withhold, don't refuse.** A hosted tool a lane or tenant may not use is removed and recorded, and the turn runs
  without it. Refusing would fail every AnA turn whenever first-party Anthropic is down and the ladder reaches another
  lane. The boundary is the same either way: nothing is sent. The media and file-reference cases stay terminal, because
  answering without the document would be answering about something the model never saw.
- **The opt-in is `public_source_frontier`, with `public_source_egress` as an off switch.** No new column: the two WS1
  columns already say "public-source research may use shared frontier infrastructure" and "public-source egress is
  allowed at all".
- **Zero-retention and residency-bound tenants get no hosted tools, even with the opt-in,** until Anthropic's current
  terms are confirmed to cover server tools under ZDR (plan open decision 5).

## Not done, and why

- **No UI shows that a tool was withheld.** The response and the ledger carry it; surfacing it in AnA's work panel is
  client work.
- **The ledger does not yet have typed columns** for server-tool use and provenance. That is WS3; they ride in the row's
  metadata for now.
- **The DPA annex does not list Anthropic-hosted tool execution as a processing location.** That is WS8's paper change.
  Until then these tools stay off by default, and on only for an opted-in tenant.
