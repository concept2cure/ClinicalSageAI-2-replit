# Legacy UI removal plan ("coming soon" replacement)

**Status:** audit complete · **deletions made: none** (awaiting approval) · branch `concept2cure-v2`
**Replacement target chosen:** blank "coming soon" page where old UI was.

## Headline finding — the migration is essentially already done

The premise (legacy routes pointing at legacy pages that need a "coming soon" swap)
**does not match the current code.** The route table was already collapsed onto
Claude Design in prior phases. There are **no legacy route declarations and no
legacy page components left to repoint.** Every route resolves into
`client/src/concept2cure/` (the Claude Design tree) or is a redirect into it.

So there is **nothing to replace with a "coming soon" page** — the old UI is not
on any route. The only "old UI from before Claude Design" still physically present
is a small set of **orphaned, unimported files** (dead code), not screens.

## Routing (single router, wouter)
- `main.tsx` → `App.jsx` (provider chain + outer `<Switch>`).
- `App.jsx`: `/sign-in|/auth|/login` → redirect `/concept2cure/login`; `/client-portal*` → redirect `/concept2cure`; catch-all → `<ZenRouter/>` (lazy).
- `ZenRouter.tsx`: every route renders a Claude Design surface — `Concept2CureLogin`, `ZenSignup`, `MdxRoute`, and `ProtectedZenApp` (`concept2cure/ZenApp.tsx`) for `/`, `/concept2cure`, `/concept2cure/project/:id`, `/concept2cure/*`; catch-all redirects to `/concept2cure`.
- **`/` and `/concept2cure` are already owned by the Claude Design shell** (`ZenApp`). Nothing routes to a legacy component.

## OFF-LIMITS — shared infrastructure (do NOT delete)
The **only** thing the Claude Design tree imports from the legacy `client/src/components/`
tree is the shadcn primitive layer:

- **`client/src/components/ui/`** — entire directory (~78 entries incl. `button/`, `card/` subfolders). Imported by `ZenApp.tsx`, `concept2cure/auth/*`, and entry points (`main.tsx` → `ui/toaster`; `App.jsx` → `ui/error-boundary` → `ModuleErrorBoundary`). A blanket `delete client/src/components/` would break the whole app — **delete subfolders individually, never the parent.**
- `client/src/contexts/` (`FileContext`, `TenantContext`, `EvidenceGraphContext`, …), `services/portal/*`, `lib/`, `hooks/`, `api/`, `utils/`, `store/`, `i18n/`, `types/`, `schemas/`, `flags/`, `role/`, `data/`, `templates/`, `assets/`, `locales/`, `design-system/`, `styles/`, `ErrorBoundary.jsx`, `cspNonce.ts`, `index.css`, and all of `client/src/concept2cure/**`.
- **Auth is a live Claude Design surface** (`concept2cure/auth/`, `services/portal/authService`) — not legacy.

Note: inside `concept2cure/`, `../components/...` resolves to `concept2cure/components/` (internal Claude Design — keep). Only `@/components/...` reaches the legacy tree.

## SAFE-TO-REMOVE — orphaned legacy files (zero importers, not on any route)
| Path | ~Files | Notes |
|---|---|---|
| `client/src/components/ai/` | 8 | `AIResponseBlock`, `AgentControlPanel`, `AgentController`, `CodeAnalysisPanel`, `ContextPreview`(+test), `EmbeddedCodingAgent`, `SimpleCodingAgent` — no importers |
| `client/src/components/legacy-esign/` | 5 | `ElectronicSignature.tsx`, `portalTypes.ts`, `regulatoryCompliance.ts`, `securityTypes.ts`, `useSecurityContext.tsx` — superseded by concept2cure `EsignModal` |
| `client/src/components/NanoBananaImageGenerator.tsx` | 1 | no importers |

**Total ≈14 files.** Everything else under `client/src/components/` is `ui/` (OFF-LIMITS).

Orphaned-but-not-UI (flagged for awareness, recommend leaving unless you say otherwise):
`client/src/domain.figma.tsx`, `primitives.figma.tsx`, `component-registry.ts`, `stub-router-dom.tsx` — zero importers, but not pages.

## "Coming soon" component
Not needed for the stated goal (no legacy routes to cover). If you instead want
placeholders for *unbuilt* Claude Design surfaces, the component would live at
`client/src/concept2cure/_shared/ComingSoon.tsx` (design-system tokens: sentence
case, 13px body, `colors_and_type.css`) and be swapped into specific
`ZenRouter.tsx` route elements — a different intent than "remove old UI."

## Recommendation
1. **Approve deletion of the ~14 orphaned files** above (low risk — zero importers; app boot unaffected). I'll delete, run `tsc`, commit, push.
2. **Do nothing route-wise** — there is no legacy route to convert; the "coming soon" swap is moot because the migration already happened.
3. Treat `client/src/components/ui/` as permanent shared infra.

**Awaiting your go on step 1 before deleting anything.**
