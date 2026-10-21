# Reach existing context-window refusal through AnA — D2 / W2

This completes the existing full-request admission error path through AnA's two
server carriers and current UI. [CONTRACT.md](CONTRACT.md) fixes the interface,
partial-work honesty and compatibility boundary before production changes.

## What already exists

- `server/services/ana/agentic-loop.ts`, `AnaToolExecutor.ts` and
  `server/routes/ana-ri/stream.ts` already protect raw result-body integrity and
  the 24,000-character bound. `tool-output-frame.ts` adds untrusted-data framing.
- `server/services/ai-gateway/context-budget.ts` and `gateway.ts` already
  estimate the complete request and refuse models whose windows cannot fit.
  `gateway-error-map.ts` already supplies TOKEN_LIMIT_EXCEEDED/413 and actionable
  size guidance. No new admission engine or arbitrary framed-character limit.
- `server/routes/chat/send-message.ts` and the SSE catch already retain failed
  records, but discard this typed refusal. Existing raw-body422 remains intact.
- `client/src/concept2cure/components/ana/useAnaChat.ts` already carries SSE
  failures/records but shows generic retry copy; its non-2xx parser loses the
  message/record. Existing `queryClient.ts` safe readers and `anaProgress.ts`
  record validation are reused. Existing gateway, host and hook suites expose
  the verification seams. [INVENTORY.md](INVENTORY.md) records prior searches.

Root owns production and Git, with disjoint test owners after interface review.
All work goes directly to `concept2cure-v2`. Qualification/publication results
will be added here with raw transcripts and exact hashes. No tool, provider,
model, dependency, schema or user surface is added. Context admission remains
an estimate; no provider delivery, whole-turn rollback or agency acceptance is
claimed.
