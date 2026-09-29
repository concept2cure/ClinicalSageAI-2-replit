# D6 — Anthropic's web tools reach each model in the version it accepts (2026-09-29)

**Row:** D6 (W2 gateway scope). **Plan item:** WS8 C3, the model-level half of web research governance: the "probable Haiku
4.5 server-tool defect" found while scoping it.

## What was wrong (at `12c57bd7`)

AnA declares web search and web fetch as `web_search_20260209` and `web_fetch_20260209`
(`server/services/ana/AnaToolDefinitions.ts`), the dynamic-filtering variants. According to the Claude API reference
(`claude-api` skill, Server Tools), those are accepted by Opus 4.6+ and Sonnet 4.6+ only. Older models, Haiku 4.5 among
them, take the basic `web_search_20250305` and `web_fetch_20250910`.

Every Fast turn routes to Haiku 4.5 (`claude-haiku-4`, `maxApiEffort: null`), and nothing in the gateway lowered the tools
per model. So a tenant opted in to public-source research (WS2) sent a tool its model does not accept on every Fast turn,
and on the ladder's last Anthropic rung. The registry said nothing about which version each model takes.

## What is true now

- `ModelConfig.webToolVariant` declares, for each Anthropic entry, the version it accepts:
  - `dynamic_filtering` on Opus 5.5, Opus 5, Opus 4.8, Sonnet 5 and Sonnet 4.6;
  - `basic` on Haiku 4.5.

  An absent value means basic, the version every model accepts.
- `webToolsForModel` (`server-tool-policy.ts`) runs at the last mile, after the placement rule (`governServerTools`), for the
  primary and every fallback. A model that is not declared `dynamic_filtering` is sent the basic variant of each web tool,
  with the same name, domains and use cap. Web research is not withheld from it.
- A test pins the registry: every Anthropic entry declares a variant, and only Opus and Sonnet 4.6+ claim dynamic
  filtering.
- Bedrock and Vertex are unchanged. Hosted tools never reach those lanes (WS2): Bedrock has neither web tool, and Vertex has
  basic web search only (the reference's platform table).

## Red and green

| What | Red (`12c57bd7`) | Green |
|---|---|---|
| Haiku 4.5 on an opted-in tenant is sent `web_search_20250305` / `web_fetch_20250910`, domains and cap kept | fails: sent `_20260209` | pass |
| Every Anthropic entry declares its variant; only 4.6+ claim dynamic filtering | fails: no entry declares one | pass |
| Opus 5.5 keeps the `_20260209` variants | passes, by design: nothing changes for a model that accepts them | pass |

`green/suites.txt` covers `server/services/ai-gateway` and `server/services/ana`: 4286 pass, 0 fail. `green/typecheck.txt`
reports 0 errors.

## Not verified here

The live API's response to `web_search_20260209` on Haiku 4.5 was not observed: the session has no product key. The
reference's statement of model support is the basis. Confirming it once on staging with a real key is owed with D1.
