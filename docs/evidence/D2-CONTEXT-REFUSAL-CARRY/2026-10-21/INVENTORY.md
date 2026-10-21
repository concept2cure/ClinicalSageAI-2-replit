# D2 / W2 — reach existing context-window refusal in AnA chat

## What already exists

- `server/services/ana/agentic-loop.ts` already enforces the opt-in 24,000
  UTF-16 raw result-body limit, with private read/passages kept whole or
  explicitly withheld. Both native hosts assert after settlement and at staging.
- `server/services/ana/tool-output-frame.ts` already frames untrusted output and
  escapes closing tags. Hosts add headers, narration, failure/shortfall guidance,
  operator turns and prior history. These are outside the raw-body bound.
- `server/services/ai-gateway/context-budget.ts` already estimates the complete
  gateway request, counting message text, text blocks, tool/schema definitions,
  image allowances and reserved output. It intentionally uses a lenient token
  estimate; PDFs and provider-specific rendering costs are not exact token proof.
- `server/services/ai-gateway/gateway.ts` already applies that admission before
  primary/fallback SDK dispatch. Models too small are skipped without a provider
  failure penalty; when none fits, `GatewayContextWindowError` carries size,
  ceiling and reduction guidance. No second allocator/admission gate is needed.
- `server/services/ai-gateway/gateway-error-map.ts` already classifies the typed
  refusal as `TOKEN_LIMIT_EXCEEDED`, and its canonical HTTP table maps it to 413.
  Authoring/intelligence consumers already use that classifier. It currently has
  no explicit AnA partial-tool-work guidance option.
- `server/routes/chat/send-message.ts` retains failed classic turns but reports
  every executor exception except the raw-body-budget error as provider503.
  `server/routes/ana-ri/stream.ts` retains failed/stopped partial turns but emits
  generic errors for context admission refusal. Existing typed raw-body refusal
  handling must stay byte-compatible.
- Existing `context-window-admission.test.ts`, gateway error-map tests,
  `ana-intelligence-gateway-errors.test.ts`, native classic/SSE tests and shared
  route/Vault fixtures expose these seams. Child staging/legacy replay already
  preserves its evidence boundaries and does not require a parallel gate.
- `client/src/concept2cure/components/ana/useAnaChat.ts` already retains SSE
  error codes/messages and failed-turn records, but its empty/partial recovery
  text ignores context refusal and recommends retry. Its non-2xx parser drops
  the message and turn record. Existing `queryClient.ts` safe message/code
  readers and `anaProgress.ts` record validation can be reused; no new parser
  or record authority is needed. Existing refusal, interrupted-host and
  turn-record hook suites expose these consumers. Deleted-history searches for
  useAnaChat/stream-refusal/partial-reply names found only retired surfaces, not
  an alternate recovery implementation.

Root searched framing, serialization, tool/round/request size limits, context
window/budget, typed admission errors and every classifier consumer across AnA,
gateway, routes/API, client surfaces, shared/schema, migrations and designs.
Deleted-history searches for frame/tool-output/round/request budgets and
context-window/gateway-error names found no removed alternative to restore.
The existing full-request gate is reached through its consumer errors; a new
arbitrary framed-character ceiling would duplicate policy and is not proposed.

This inventory precedes audit delegation and interface design. Root owns all
production/Git. Initial read-only auditors inspect the existing gateway and both
host failure carriers; disjoint test workers follow an approved contract.
