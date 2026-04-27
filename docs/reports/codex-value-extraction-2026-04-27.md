# Codex Branch Value-Extraction Triage — 2026-04-27

## Scope

Audit of `codex/audit-backend-for-efficiency-improvements` for genuinely-missing fixes that should land on `concept2cure-v2` before the codex branch is deleted. Performed under user direction:

- **Lose nothing of incremental value.**
- **No regressions.**
- **No changes inconsistent with the Claude Design UI bundle.**

Filtering rules applied:
- Skip every commit touching `client/src/concept2cure/components/{concept2cure-home,ana,claude-ectd-coauthor}/` — bundle is sole UI authority.
- Skip monochrome / color / Tailwind / aesthetic refactors — superseded.
- Skip "boulder-to-statue" / "Phase 1/2 dead code purge" / Build Order architecture commits — these depend on a divergent server architecture that v2 doesn't share.
- Focus on `server/`, `shared/`, `tests/` — backend-only fixes.

## Headline finding

**Most of the codex security and correctness fixes are already incorporated on `concept2cure-v2`.** The unification commit (`b188d70`) and parallel work pulled in the equivalent changes — sometimes in a more conservative form than codex applied. Specifically:

- `70f4ef82` (safe `since` query param guard): **already applied on v2** (line 3322 of `concept2cure.ts`).
- `791610c0` CMC `getOrgId` header-trust removal: **already applied on v2** in a stricter form. Codex added `req.user?.organizationId` as a fallback; v2 trusts only middleware-derived `tenantId` / `tenantContext.organizationId`. v2's pattern is safer.

This is the expected outcome of a 2,049-commit divergent line in a healthy codebase.

## Genuine security gaps on `concept2cure-v2` (recommend port)

Three real tenant-spoofing / silent-default issues remain on v2 that codex `791610c0` addressed but the equivalent fix is not on v2:

### Gap 1 — `server/api/templates/routes.ts` trusts `x-organization-id` header in 5 places

Lines 46, 217, 304, 353, 403 read the org id from a client-controllable HTTP header:
```ts
const organizationId = parseInt(req.headers['x-organization-id'] as string);
```
Any client can set this header to any tenant's id and access that tenant's templates. Severity: **tenant isolation breach**.

### Gap 2 — `server/routes/cerv2-export-routes.ts` trusts `x-organization-id` header in 2 places

Lines 69 and 751 read the org id from the same client-controllable header. Same breach class.

### Gap 3 — `server/routes/connector-library.ts` silently defaults to org 1

```ts
function getOrganizationId(req: Request): number {
  const ctx = (req as any).tenantContext;
  return ctx?.organizationId || 1;   // ← silent default to tenant 1
}
```
If middleware fails to populate `tenantContext`, every request is treated as belonging to organization 1. Severity: **tenant-1 data exposure / cross-tenant write risk**.

## Proposed ports (for your approval)

These are **manual ports** in v2's idiom, not direct cherry-picks. Direct cherry-pick from codex would introduce `req.user?.organizationId` trust which v2 deliberately avoided.

| # | File | Change | Risk |
| - | --- | --- | --- |
| 1 | `server/api/templates/routes.ts` | Replace `parseInt(req.headers['x-organization-id'] as string)` with `Number((req as any).tenantId \|\| (req as any).tenantContext?.organizationId)` in all 5 places. Update error message to drop the header reference. | Low — 5 isolated reads, no logic change, behavior matches CMC routes already on v2. |
| 2 | `server/routes/cerv2-export-routes.ts` | Same replacement pattern in 2 places (lines 69, 751). | Low — same as #1. |
| 3 | `server/routes/connector-library.ts` `getOrganizationId` | Replace `return ctx?.organizationId \|\| 1` with `if (!orgId \|\| orgId <= 0) throw new Error('Organization context required'); return orgId`. | Low — fail-fast instead of silent default. Existing callers already throw on missing context. |

**Bonus defensive change from `791610c0`:**
- `server/api/templates/routes.ts` multer filename uses `Math.random()`. Codex replaces with `crypto.randomBytes(8).toString('hex')`. Worth porting — not strictly security-critical (filename is server-controlled, no user input), but slightly more robust against filename collisions. Optional.

## Skipped — already on v2

- `70f4ef82` safe `since` query param guard
- `791610c0` CMC `getOrgId` header trust removal (v2 has stricter version)
- The `getOrgId` pattern in `server/api/cmc/routes.ts` and the rest of `server/api/cmc/*Routes.ts` (already cleaned up)

## Skipped — UI / superseded by Claude Design bundle

`4b2442a9`, `c1d96f46`, `01818b5c`, `b7e8785d`, `5e0dd43f`, `475bdbb1`, `cce61114`, `b8651ded`, `d148deca`, `816633e3`, `243a490a`, `08a37a88`, `1abd6a6c`, `4ce44c22`, `fcb7ff3b`, `e1e14f00`, `d80cd296` — all UI/CSS/login-page/landing-page work that the Claude Design bundle now owns.

## Skipped — architecturally incompatible

These commits depend on the codex line's "governed decision fabric" / "Build Orders 1-24" architecture, which `concept2cure-v2` doesn't share:

- `74ec0ae6` audit remediation — touches `governed-decision-service.ts` (doesn't exist on v2)
- `1fb580ef` forensic audit round 2 — touches `seed-default-canon.ts` (doesn't exist on v2)
- `b98fae07` audit QA — same `governed-decision-service.ts` dependency
- `770d933b`, `10bacb92`, `8a112135`, `85706cd8`, `56af0f26`, `9f6d9844`, `4cea082b`, `836a614d`, `56f98fb9` — Build Orders 2–8 governance fabric
- All "boulder-to-statue" / "dead code purge" / Phase X refactor commits — postdate v2's own refactor path

## Skipped — would conflict with Phase 1 home wiring

- `ca9d817a` "move requireActiveProject before hooks that reference it (TDZ fix)" — touches `ZenApp.tsx`. The Phase 1 home early return added in `fc50ea70` may have changed the relevant ordering. A direct cherry-pick risks regressing the bundle home.
- `8593c5e3` "IND authoring flow" — touches `ZenApp.tsx` and `ClaudeToolExecutor.ts`. Mixed UI/server. The `ClaudeToolExecutor.ts` portion is worth a separate look once the simpler ports above are landed and verified.

## Recommend deferred — needs deeper file-by-file triage

- `4e0fea2f` "security hardening across 41 route files" — about half the files no longer exist on v2 (deleted/refactored on v2's path). For each surviving file, would need to check whether the same fix is already on v2 (likely yes for most, given the pattern with `791610c0`). Estimated 1–2 hour focused session of its own.

## After ports land

Once these three small ports land and verify clean, the codex branches can be deleted with confidence — the remaining unique commits are either already on v2, superseded by the bundle, or architecturally incompatible.

## What I need from you

1. Approve the 3 ports above (`templates/routes.ts`, `cerv2-export-routes.ts`, `connector-library.ts`)? Yes/no per item.
2. Include the bonus `crypto.randomBytes` filename change? Yes/no.
3. Should I proceed to `4e0fea2f` deferred review next, or hold the codex branches as a future audit task?
