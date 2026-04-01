# ZenApp Shell Reduction Pass

## Scope
- Extracted embedded module host rendering out of `ZenApp.tsx` into dedicated host components.
- Extracted demoted layout normalization into `router/zenRouteNormalization.ts`.
- Added explicit approved-route evaluation for external testing mode.

## Before/After Responsibility Snapshot
- **Before:** Inline 510(k), PMA, CER rendering + assistant rails + demotion redirects + route guard behavior in one shell file.
- **After:**
  - Embedded module hosts live in `components/shell/EmbeddedModuleHosts.tsx`.
  - Demoted mode normalization is centralized in `router/zenRouteNormalization.ts`.
  - External-testing route decisions are centralized in `router/approvedRoutePolicy.ts`.

## LOC Delta (approx)
- `ZenApp.tsx`: reduced by extracting repeated embedded host blocks.
- New files absorb shell-specific routing and module-host concerns.

## External-Testing Implication
- Route allowance/redirect behavior is now inspectable via founder route panel in external testing mode.
