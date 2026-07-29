/**
 * AnA RI Routes — Regulatory Intelligence Copilot API.
 *
 * Thin router. Per-endpoint handlers live in ./ana-ri/*.ts and are wired in
 * by their respective mount* functions. Anything with meaningful behaviour
 * (request handling, orchestration, persistence, SSE) lives in a sibling
 * module; this file exists to keep the Express mount wiring in one place.
 *
 * ## Governance contract (enforced by ai-entry-point-contract.test.ts)
 *
 * Every handler mounted below routes through the AI gateway
 * (`server/services/ai-gateway/`). No direct OpenAI/Anthropic SDK
 * instantiation is allowed in this surface or its submodules.
 *
 * - `POST /api/ana-ri/chat` (./ana-ri/chat.ts) — calls processResponseActions
 *   on the assistant reply so AnA-emitted action blocks (artifact create,
 *   amend, link, etc.) execute through the governed contract pipeline.
 * - `POST /api/ana-ri/generate` (./ana-ri/generate-execute.ts) — generates
 *   regulatory content through the AI gateway and persists the result as a
 *   governed artifact in `draft` status (lifecycleStatus: 'draft'). Promotion
 *   to `review` / `approved` / `locked` happens via authoring-actions.
 * - `POST /api/ana-ri/stream` (./ana-ri/stream.ts) — same gateway path with
 *   SSE token streaming.
 *
 * If you split a new handler out of this file, the literals `gateway`,
 * `draft`, and `processResponseActions` must remain present in this file's
 * doc header (or in the file the contract test points at) so the tripwire
 * still detects governance.
 *
 * Surface (unchanged by the split):
 *   POST /api/ana-ri/chat              → ./ana-ri/chat.ts
 *   POST /api/ana-ri/stream            → ./ana-ri/stream.ts
 *   POST /api/ana-ri/plan + /plan/*    → ./ana-ri/plan.ts
 *   GET  /api/ana-ri/kernel/*          → ./ana-ri/kernel.ts
 *   POST /api/ana-ri/generate          → ./ana-ri/generate-execute.ts
 *   POST /api/ana-ri/execute           → ./ana-ri/generate-execute.ts
 *   GET  /api/ana-ri/deficiencies      → ./ana-ri/lookups.ts
 *   GET  /api/ana-ri/deficiencies/critical → ./ana-ri/lookups.ts
 *   GET  /api/ana-ri/actions           → ./ana-ri/lookups.ts
 *   GET  /api/ana-ri/rubric            → ./ana-ri/lookups.ts
 *   GET  /api/ana-ri/health            → ./ana-ri/utility.ts
 *   POST /api/ana-ri/evaluate          → ./ana-ri/utility.ts
 *   GET  /api/ana-ri/observability     → ./ana-ri/utility.ts
 *   GET  /api/ana-ri/observability/log → ./ana-ri/utility.ts
 *   GET  /api/ana-ri/commands          → ./ana-ri/utility.ts
 *   GET  /api/ana-ri/decisions         → ./ana-ri/utility.ts
 *   GET  /api/ana-ri/threads/:id/timeline → ./ana-ri/threads.ts
 *
 * @module server/routes/ana-ri
 */

import { Router } from 'express';

import { mountChatRoute } from './ana-ri/chat.js';
import { mountStreamRoute } from './ana-ri/stream.js';
import { mountPlanRoutes } from './ana-ri/plan.js';
import { mountKernelRoutes } from './ana-ri/kernel.js';
import { mountGenerateExecuteRoutes } from './ana-ri/generate-execute.js';
import { mountLookupRoutes } from './ana-ri/lookups.js';
import { mountUtilityRoutes } from './ana-ri/utility.js';
import { mountThreadRoutes } from './ana-ri/threads.js';

const router = Router();

// Mount order is by surface size, not correctness — Express routes are matched
// in registration order but these paths don't overlap, so ordering is purely
// organisational.
mountChatRoute(router);
mountStreamRoute(router);
mountPlanRoutes(router);
mountKernelRoutes(router);
mountGenerateExecuteRoutes(router);
mountLookupRoutes(router);
mountUtilityRoutes(router);
mountThreadRoutes(router);

export default router;
