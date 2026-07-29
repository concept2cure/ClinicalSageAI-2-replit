# Handoff to Design — Global Regulatory Intelligence (global-RI) UI

> [!CAUTION]
> **RETRACTED AS EVIDENCE — 24 July 2026.**
> This brief is a historical record of what was believed on its authoring date. It is
> **not** evidence of what the code does and must not be cited as a reason to build,
> skip, or scope anything. At least one brief in this set was materially wrong about a
> live subsystem (`HANDOFF_TO_DESIGN_document_authoring.md` §2 — see
> `_sync/CLAUDE_DESIGN_MASTER_WORK_ORDER_2026-07-24.md` §0.1).
>
> Verify every claim below against the code at the head of `concept2cure-v2`, or treat
> it as an open question. Authoritative scope lives in
> `_sync/CLAUDE_DESIGN_MASTER_WORK_ORDER_2026-07-24.md`.

**Status:** Backend + data contract are GA-ready and UI-ready. **No UI has been built** — this document and the artifacts it references are the contract a UI kit renders against.

**Audience:** design + frontend building the global-RI surface (and the Claude design UI kits).

---

## 1. What exists (backend, done)

~40 deterministic, citation-backed regulatory-intelligence expert domains spanning the full lifecycle (strategy, designations/access, clinical & nonclinical, quality/CMC, safety & pharmacovigilance, submissions/format, devices & diagnostics, lifecycle/post-market, commercial & supply chain). All are:

- **Pure / deterministic** — same input → same output, no LLM, no fabrication; honest caveats and citations in every payload.
- **Exposed over REST** at `/api/global-ri/*` (auth applied at mount; role `regulatory-author`).
- **Callable by AnA** as 26 deterministic tools, so the assistant answers from the registry instead of guessing.

## 2. The one call to build navigation + forms

`GET /api/global-ri/catalog` returns the entire surface in one payload — **render the whole UI from this; do not hard-code endpoints.**

Shape (typed in `shared/types/global-ri-api.ts` → `GlobalRiCatalog`):

```jsonc
{
  "total": 42,
  "anaToolCount": 26,
  "groups": [ { "id": "strategy", "label": "Strategy & Pathway", "order": 1, "blurb": "…" }, … ],
  "byGroup": { "strategy": 8, "designations_access": 3, … },
  "capabilities": [
    {
      "id": "exclusivity",
      "label": "Exclusivity & LOE",
      "group": "lifecycle",
      "description": "Data/market/orphan/pediatric exclusivity + projected loss-of-exclusivity date.",
      "routes": ["GET /exclusivity/rules/:market", "POST /exclusivity/compute"],
      "anaTools": ["global_ri_exclusivity"],
      "deterministic": true,
      "tools": [
        { "name": "global_ri_exclusivity", "description": "…", "inputSchema": { "type": "object", "properties": { … }, "required": ["market","productClass"] } }
      ]
    }
    // …
  ]
}
```

- `GET /api/global-ri/catalog/:group` returns just one group's capabilities (for lazy-loaded sections).
- **Dynamic forms:** each capability's `tools[].inputSchema` is a JSON-schema (`type`, `properties` with `enum`/`description`, `required`). Render inputs straight from it — enums → selects, booleans → toggles, strings → text/date, numbers → numeric. This is what makes the surface "Claude design UI kit"-ready: forms are data-driven, not bespoke.

## 3. Navigation / IA

Groups are the top-level nav, ordered by `order`. The taxonomy is the single source of truth in `shared/constants/global-ri-ui.ts` (`GLOBAL_RI_GROUPS`) — import it directly on the client so nav labels can't drift from the backend. Nine groups today:

`strategy · designations_access · clinical · quality_cmc · safety_pv · submissions · devices_dx · lifecycle · commercial_supply`

## 4. Calling a capability

- **Reads / lookups** are `GET` with path params (e.g. `GET /api/global-ri/exclusivity/rules/FDA`).
- **Computations / assessments** are `POST` with a JSON body matching the capability's `inputSchema` (e.g. `POST /api/global-ri/exclusivity/compute` `{ "market":"FDA","productClass":"new_chemical_entity","approvalDate":"2026-01-15" }`).
- **Auth:** all routes require an authenticated user with the `regulatory-author` role → otherwise `403`. Unknown market/region/param → `404`; bad body → `400`.
- **Errors are uniform:** `{ "error": { "code": "VALIDATION"|"NOT_FOUND"|"INTERNAL", "message": "…", "details"?: … } }` (typed as `ApiError`).

## 5. Types to import (typed end-to-end)

From `@shared/types/global-ri-api`:
`GlobalRiCatalog`, `GlobalRiGroupCatalog`, `EnrichedGlobalRiCapability`, `GlobalRiCapability`, `ApiError`, plus representative request types (`ExclusivityComputeRequest`, `DeviceClassifyRequest`, `StrategyBriefRequest`).
From `@shared/constants/global-ri-ui`: `GLOBAL_RI_GROUPS`, `GLOBAL_RI_GROUP_IDS`, `getGlobalRiGroup`, `GlobalRiGroupId`.

## 6. Trust / provenance affordance (recommended UI signal)

Every global-RI result is `deterministic: true` (registry-grounded). AnA additionally exposes `ana_tool_pedigree` (deterministic_registry vs external_api_live vs model_assisted) — surface a small "registry-grounded" vs "verify before relying" badge so users can tell bulletproof facts from model-assisted narrative. (Backend ready; badge is a UI decision.)

## 7. Explicit non-goals of this handoff

- No React/components/styles were added. The design system + UI kits own presentation.
- No new presentation strings beyond the catalog's `label`/`description`/`blurb` (which are content, not layout).
- Suggested next design step: a catalog-driven "capability browser" (group nav → capability list → auto-generated form from `inputSchema` → result panel rendering the structured payload + its `citation`/`notes`).
