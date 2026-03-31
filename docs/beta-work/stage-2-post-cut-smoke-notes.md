# Stage 2 — Post-Cut Smoke Notes

Stage: Stage 2 — Proof-Driven Low-Risk Deletions and Deprecation Fence  
Branch / commit reviewed: `cursor/critical-files-management-f38a` @ `d481b7da76e5723da94be4ac06506b5cb8a71879`

## Smoke checklist and outcomes

| Check | Result | Evidence |
|---|---|---|
| Frontend bootstrap still works off `main.tsx` | **PASS** | `client/index.html:45` -> `/src/main.tsx`; `client/src/main.tsx:15-24` renders `<App />` |
| Concept2Cure shell load path intact | **PASS** | `client/src/main.tsx:9,20` -> `App`; `client/src/App.jsx:369-396, 413-419` delegates to `ZenRouter`; `client/src/concept2cure/router/ZenRouter.tsx:113-118, 495-531` routes to `ZenApp` |
| Root redirects still intentional | **PASS with known hazard** | Outer redirects preserved at `client/src/App.jsx:947-953`; catch-all remains `client/src/App.jsx:927-928`. Known hazard retained intentionally: duplicate `/` definitions at `client/src/App.jsx:413-419` and `:436` |
| No deleted file remains imported/mounted | **PASS** | `rg` finds `routes_update` and `use-auth.jsx` only in docs references; no runtime imports in `client/src`, `server`, `tests` |
| Hidden/fenced routes still intentionally fenced | **PASS** | Fences added to `client/src/main.jsx`, `client/src/portal-v2/ClientPortalV2.tsx`, `client/src/portal-v2/index.ts`, and `server/routes/index.ts` with explicit proof-gated wording |

## Known hazards intentionally not changed in Stage 2

1. Layered `/login` ownership across outer `App` redirects and nested route switches.
2. Duplicate `/` ownership in `MainApp` where first-match semantics overshadow one branch.
3. `/client-portal/*` ownership remains ambiguous until explicit root-shell decision is made.

These were explicitly carried forward from Stage 1 as cleanup hazards and were not refactored in this low-risk stage.

