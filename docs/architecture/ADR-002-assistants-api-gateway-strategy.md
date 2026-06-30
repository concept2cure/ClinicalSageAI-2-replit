# ADR-002: Strategy for OpenAI-Direct Calls That Cannot Route Through the AI Gateway

**Status:** Proposed  **Date:** 2026-06-30

## Context

The AI gateway (`server/services/ai-gateway/gateway.ts`) centralizes LLM calls
behind `route()` with multi-provider fallback, audit, and policy enforcement.
`server/services/openai-service.ts` still makes direct OpenAI SDK calls that
bypass the gateway. These fall into three groups.

### 1. Assistants API (stateful server-side resources)

| Function                | Line | SDK call                                 |
|-------------------------|------|------------------------------------------|
| `createAssistant()`     | 33   | `openai.beta.assistants.create()`        |
| `createThread()`        | 53   | `openai.beta.threads.create()`           |
| `addMessageToThread()`  | 70   | `openai.beta.threads.messages.create()`  |
| `runAssistant()`        | 86   | `openai.beta.threads.runs.create()`      |
| `getRunStatus()`        | 101  | `openai.beta.threads.runs.retrieve()`    |
| `listMessages()`        | 119  | `openai.beta.threads.messages.list()`    |

### 2. Responses API & Images API

| Function                       | Line | SDK call                      |
|--------------------------------|------|-------------------------------|
| `generateStructuredResponse()` | 142  | `openai.responses.create()`   |
| `generateWithWebSearch()`      | 175  | `openai.responses.create()`   |
| `generateImage()`              | 198  | `openai.images.generate()`    |

No `openai.files.create` usage exists in the codebase.

## Why These Cannot Use `gateway.route()`

**Assistants API** manages stateful server-side resources (assistants, threads,
runs). These are CRUD/polling operations, not prompt-in/completion-out. The
gateway's `GatewayRequest` cannot express them, and no Anthropic/Moonshot
equivalent exists, making multi-provider fallback meaningless.

**Responses API** uses a different request shape (`input`, `web_search_preview`
tool) incompatible with the gateway's `messages` array.

**Images API** is a generation endpoint with no equivalent in the gateway.

## Decision: Sanctioned OpenAI-direct calls behind a thin wrapper (option b)

Building a gateway abstraction over single-provider CRUD endpoints would be a
leaky facade with all cost and no benefit. Instead:

1. **Wrap** the six Assistants functions and `generateImage` in a shared
   `openaiDirect()` helper that logs caller, latency, and cost to the same
   audit table the gateway uses -- unified observability without fake routing.
2. **Gate** behind `OPENAI_ASSISTANTS_ENABLED` feature flag. If unset, calls
   throw immediately, preventing silent vendor lock-in spread.
3. **Migrate** `generateStructuredResponse` to `gateway.structuredOutput()` and
   `generateWithWebSearch` to `gateway.route()` with a future web-search
   capability (tracked separately -- these are "soft" bypasses).
4. **Deprecate** the raw `openai` client export; new code must use the gateway
   or `openaiDirect()`.

## Consequences

- Assistants API calls remain OpenAI-locked but are auditable and gated.
- No wasted abstraction for a single-provider feature.
- The gateway stays focused on multi-provider completion routing.
- If Assistants are later replaced with gateway-native multi-turn chat, the
  feature flag makes the migration boundary explicit.
