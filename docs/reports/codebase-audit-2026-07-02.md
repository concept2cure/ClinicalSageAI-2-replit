# Codebase Audit — 2026-07-02

Multi-agent audit of the platform (recent-merge diff review, server security
sweep, core-services review, client/hook review, and two client→server API
path cross-checks), anchored on the repo's own CI gates. This report lists
what was **fixed** in the accompanying change set and what was **found but
deliberately not fixed here** (with reasons), so the remaining gaps stay
visible instead of silently dropped.

## Fixed in this change set

### Security

1. **Cross-tenant read/write via org-role `admin` treated as platform staff**
   (`server/routes/organizations-routes.ts`). `validateOrgOwnership` and the
   list handler bypassed tenant scoping for `role === 'admin'` — but `admin`
   is the *organization-membership* role every customer admin carries
   (`auth.ts` sets the JWT role from the selected membership). Any tenant
   admin could read any org's details/clients/settings, PATCH any org's
   settings, and enumerate every organization on the platform. The bypass is
   now restricted to platform-staff roles (`platform_admin`, `superadmin`,
   `super_admin`), matching `clients-routes.ts` / `tenant-users.ts`.

2. **`ci:jwt-verify-pinned` gate red at HEAD** (`server/utils/jwtVerify.ts`).
   The code was safe (HS256 pinned via a hoisted options object) but the
   textual CI checker only recognizes an inline `algorithms:` near the call.
   The pin is now spelled inline at both call sites so the gate verifies it.

### Server correctness

3. **Redis sliding-window rate limiter counted rejected requests**
   (`server/middleware/redisRateLimiter.ts`). The `zadd` ran unconditionally,
   so a client at its limit that kept retrying could stay locked out
   indefinitely — and behavior diverged from the in-memory fallback (which
   only counts allowed requests). Rejected requests are now `zrem`'d.

4. **Host-throttle over-admit race** (`server/services/integrations/host-throttle.ts`).
   `release()` decremented `active` before waking a queued waiter, which
   re-incremented only when its continuation resumed; a fresh `run()` in that
   microtask window saw a free slot and briefly exceeded the per-host
   concurrency cap. The slot is now handed directly to the waiter (no
   decrement on hand-off). A deterministic regression test reproduces the old
   bug (`tests/integrations/host-throttle.test.ts`).

5. **Integration cache-key collisions → wrong cached data served**
   (`server/cache_manager.js`). Filename sanitization collapsed every
   non-`[a-z0-9_-]` character to `_` and lower-cased, so distinct queries
   (e.g. brand `"Tylenol-PM"` vs `"Tylenol PM"`) could share one cache file
   and silently serve each other's ChEMBL/CT.gov/PubMed/openFDA payloads. A
   SHA-256 digest of the raw key is now appended to the filename (existing
   cache entries simply re-fetch once).

6. **Temp-directory leak on every eCTD / technical-file assemble**
   (`server/services/ectd/assemble-from-core.ts`,
   `server/services/pathway-engines/mdr-ivdr/assemble-technical-file-from-core.ts`).
   Each assemble `mkdtemp`'d a staged package (all leaf PDFs + zip) that was
   never removed — unbounded disk growth with submission activity. Results
   now carry a best-effort `cleanup()`; both callers (the assemble routes in
   `server/routes/submissions.ts` and `transmitSequence` in
   `submission-service.ts`) invoke it once the bundle bytes are consumed.

7. **Cortex advisory project route unreachable — double-mounted prefix**
   (`server/routes/cortexAdvisoryRoutes.ts`). The router is mounted at
   `/advisory` but declared `GET /advisory/:projectId`, so the handler only
   answered at `/api/cortex/advisory/advisory/:projectId`; the client's
   `/api/cortex/advisory/:projectId` always 404'd (degrading to zero-value
   fallbacks). The canonical `/:projectId` is now registered at the end of
   the router (so it cannot shadow the literal routes); the legacy doubled
   path still answers.

### Client correctness (AnA / ZenApp)

8. **First reply of every new ZenApp-hosted conversation was aborted**
   (`Ana.tsx`). The server emits `thread_id` before the first token; Ana
   reported it to ZenApp via `onThreadChange`, ZenApp echoed it back through
   `contextProfile.threadId`, and Ana's pinned-thread hydration effect then
   called `loadThread` — aborting the live stream and clobbering the reply.
   An echo guard now marks the already-live thread as hydrated.

9. **Chat file upload always 401'd** (`hooks/useChatUpload.ts`). `/api/chat`
   is behind Bearer-only auth; the upload fetch sent only cookies. It now
   sends `getAuthHeaders()`, and the error chip no longer renders
   `[object Object]` for structured error bodies.

10. **Part 11 governed-action sign-off could never complete**
    (`ana/useGovernedAction.ts`). Same missing `Authorization` header on
    `/api/ana-ri/governed-action`; additionally a structured error body was
    passed as an object to `setError`, crashing the panel ("Objects are not
    valid as a React child"). Both fixed.

11. **Retry/Edit clicked mid-stream wiped the conversation and sent nothing**
    (`ana/useAnaChat.ts`). `send()`'s re-entrancy guard read a stale
    `isStreaming` closure, so `reset(); send(text)` no-opped the send after
    clearing all messages. The guard now reads a live ref; stream cleanup is
    ownership-guarded so an aborted stream's `finally` can't orphan its
    replacement; and the hook aborts in-flight streams on unmount.

12. **Applied Part 11 seal leaked across versions/documents**
    (`ana/VerificationPanel.tsx`, `Ana.tsx`). The panel's `appliedSeal` state
    never resynced with the `seal` prop, and Ana never cleared its
    per-version-index seal map when the active document changed — showing one
    document's seal on another and blocking new seals. Both now resync/reset
    (keyed on the durable document identity, `artifactId ?? title`).

13. **Durable version history never loaded** (`Ana.tsx`). The
    conversation-os `document-versions` fetch sent no auth header (always
    401 → silent fallback to in-session grouping, and the seal's
    `existingVersionNumber` could bind to the wrong persisted version). Now
    authenticated, with a fetch-target guard that also removes a refetch-loop
    hazard.

14. **Legacy token key read raced the token migration** (`ZenApp.tsx`). Two
    call sites read `trialsage_access_token` from storage directly; the
    canonical `authToken.ts` migration deletes that key, silently
    de-authenticating the project-artifacts query and promotion action for
    persistent-login users. Both now use `getAuthHeaders()`.

15. **Intelligence-question answers rendered as raw JSON bubbles**
    (`Ana.tsx`). The `[INTELLIGENCE_ANSWER]{json}` protocol message is now
    rendered (and exported) as a readable "Answered: …" line.

16. **Safety-narrative tool pins missed their own turn** (`Ana.tsx`,
    `useAnaChat.ts`). The handler updated pinned-tools state and sent in the
    same tick, so the guided turn went out without its tools. `send()` now
    accepts a per-call `toolsOverride`.

### Test robustness

17. Two PGlite-backed suites (`ind-forms.contract.integration.test.ts`,
    `leaf-source-resolver.test.ts`) flaked on the global 10s `hookTimeout`
    under full-suite load; their `beforeAll` hooks now carry explicit 60s
    timeouts.

## Found, not fixed here (documented gaps)

- **`client/src/concept2cure/services/cmcService.ts` — 13 legacy endpoints
  with no server route** (impurities CRUD, `/specifications` list,
  ich-compliance per-spec, `/stability/protocols/:id`, `/batches/*`). These
  are pre-existing dead surfaces (the file's own comments flag them as
  older); each call degrades via its error path. Building 13 endpoints (or
  amputating the client features that call them) is a product decision, not
  an audit fix. Note also `getSpecification` and `listStabilityProtocols`
  accidentally resolve to the `GET /:projectId` handler — same family.
- **`cortexService.ts` — `advisory/signals` and `advisory/predictions/:id`
  have no server implementation** (services degrade to `[]`). Needs either
  server endpoints or removal of the client affordances.
- **`Ana.tsx` "Download as DOCX" posts to `/api/docx-factory/render`, which
  does not exist**; the honest Markdown fallback always triggers. The
  platform's export governance (`ci:governed-export-routes`) requires
  governed-consequence responses for export routes, so a quick ungoverned
  markdown→docx endpoint would violate that contract. Needs a governed
  render route per ANA_DOCUMENT_STUDIO_UI_SPEC.
- **`authService` 24h token refresh writes `trialsage_access_token` while
  `authToken.ts` caches sessionStorage `token`** — after a refresh, cached
  reads can return the stale token until storage clears. Needs a single
  writer (route the refresh through `setAuthToken`).
- **`ci:tenant-isolation` carries 25 baselined candidates** (raw SQL against
  tenant-scoped tables without an org predicate, e.g. legacy `users` queries
  in `concept2cure.ts`). No new ones added; the baseline should be burned
  down entry-by-entry with allowlist justifications or fixes.
- Five mdx hooks carry stale "endpoint not yet implemented" doc comments for
  routes that now exist (`useAdmin`, `useAnalytics`, `useEngineering`,
  `usePostmarket`, `useUdi`) — comment cleanup only.
