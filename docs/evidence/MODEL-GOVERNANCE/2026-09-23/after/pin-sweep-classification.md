# Explicit pins to unapproved models: classification, 2026-09-23

Found by a grep for `model: '<gpt-*|claude-sonnet*|claude-haiku*|claude-3*|kimi*|moonshot*>'` in non-test server code (40 lines across 16 files). The six lines in `server/services/submission-twin-service.ts` were excluded: the regulatory digital twin is a CLAUDE.md Rule 2 surface. Doc-comment matches were also excluded.

One agent classified each call site: is it reachable, and does its output become governed regulatory content? A second agent then tried to refute that classification. For a non-governed verdict, the refuter looked specifically for a path by which the output does become governed. The raw findings are in the session workflow journal.

| Site | Classifier | Verifier | Outcome |
|---|---|---|---|
| `server/services/ai/openai-orchestrator.ts:146` | dead-or-unreachable, unreachable | agrees: governed, unreachable | Dead: no importer reaches it (last route deleted in 3cc8547d2). Not changed; listed for deletion by an owner. |
| `server/services/ana/AnaDocumentDraftingService.ts:484` | non-governed-helper, reachable | agrees: not governed, reachable | Not governed (stateless). But the verifier found an image dropped on text-only fallback, now refused at the gateway (MediaNotCarriedError). |
| `server/services/ana/AnaDocumentDraftingService.ts:718 + server/routes/ana-intelligence.ts:` | non-governed-helper, reachable | agrees: not governed, reachable | Not governed. The sealed audit row recorded the literal claude-sonnet-4-6; it now records the model that served. |
| `server/services/estimand-engine-service.ts:356` | governed, reachable | agrees: governed, reachable | Governed. Now routed as regulatory_review, shape-checked and labelled model/deterministic. The fabricated precedent claim is removed. |
| `server/services/predictiveSectionService.ts:205` | non-governed-helper, reachable | agrees: not governed, reachable | Not governed (suggestions, not stored). Fail-open catch returns [] silently. Not changed. |
| `server/services/DocumentDataCenterService.ts:454` | non-governed-helper, reachable | agrees: not governed, reachable | Not governed, but the provenance was fabricated. It now records the served model and labels keyword tags; no invented confidence, category or IP. |
| `server/services/aiProviderRouter.ts:140-250` | governed, reachable | agrees: governed, reachable | Governed via the citation reranker. The judge is routed as regulatory_review for verdicts and fails closed. The router records the served model. |
| `server/api/cmc/blueprintRoutes.ts:308` | governed, reachable | agrees: governed, reachable | Governed. Now document_drafting, fails closed (503 NO_DRAFT_PRODUCED), and leaves no orphan project. |
| `server/api/cmc/playbookRoutes.ts:366` | governed, reachable | agrees: governed, reachable | Governed. Now document_drafting with the "Not supplied" instruction; a failure is recorded as failed and answered with 503. |
| `server/api/drafting/routes.ts:92 (CONFIG.model used at ~408 and ~446)` | governed, reachable | disagrees: governed, unreachable | Governed, but it cannot run: the verifier showed its embedding step always failed. The pin and provenance are fixed, and ai.embeddings now uses the real embedding provider. |
| `server/api/drafting/routes.ts:547` | non-governed-helper, reachable | agrees: not governed, reachable | Not governed (entity index; its store is not provisioned). Not changed. |
| `server/lib/unified-ai-client.ts:295-320` | dead-or-unreachable, unreachable | agrees: not governed, unreachable | Dead helpers (no callers). Not changed. |
| `server/routes/agent-swarm.ts:200-360` | config-or-comment, reachable | agrees: not governed, reachable | Display metadata only; routing is by task type. Not changed; the literal display model is noted. |
| `server/routes/c2c/context-intelligence.ts:165 (/summarize) and :604 (/extract-decisions)` | non-governed-helper, reachable | agrees: not governed, reachable | Not governed (working memory). Fail-open summaries noted. Not changed. |
