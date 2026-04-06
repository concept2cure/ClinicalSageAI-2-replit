# Wave 2 Route Authority Verification

**Date:** 2026-04-06
**Source:** `docs/reports/platform-full-audit-2026-04-01.md` (Wave 2)
**Status:** All issues already resolved. No code changes needed.

---

## Issue 1: /api/projects — RESOLVED (no conflict)

The platform audit (2026-04-01) reported an inline `app.get('/api/projects')` in `server/index.ts` conflicting with a router mount. As of 2026-04-06:

- **Single mount** via `registerProjectRoutes()` (server/index.ts L957)
- `register-project-routes.ts` L13: `app.use('/api/projects', projectsRoutes.default)`
- `projects-management.ts` L44: `router.get('/')` — canonical handler
- **No inline handler** in index.ts
- Comment at L563: "/api/projects is owned by mounted projects-management router"

**Verdict:** One authority. Clean.

## Issue 2: /api/regulatory — RESOLVED (no overlap)

The audit reported two routers on `/api/regulatory` with overlapping `/search`. As of 2026-04-06:

- `registerCoreRoutes()` mounts `/api/regulatory/tasks` (task management)
- `registerRegulatoryRoutes()` mounts 13 distinct sub-paths: `/api/fda510k-unified`, `/api/fda510k`, `/api/510k/estar`, `/api/cerv2/export`, `/api/cerv2/ai`, `/api/medical-devices`, `/api/ivdr`, `/api/manufacturing`, `/api/pharmacovigilance`, `/api/clinical-operations`, `/api/cer`, `/api/pdf-tasks`, `/api/grdhe`
- No overlapping `/search` endpoint between the two

**Verdict:** Different purposes, separate paths. Clean.

## Issue 3: Candidate Deletions — ALREADY GONE

| File | Status |
|------|--------|
| `server/routes_update.ts` | Does not exist |
| `client/src/hooks/use-auth.jsx` | Does not exist (only `.tsx`) |
| `client/src/main.jsx` | Does not exist (only `.tsx`) |

---

## Wave 2 Success Criteria

| Criterion | Status |
|-----------|--------|
| One canonical authority per critical route family | **PASS** |
| No overlapping `/api/projects` handlers | **PASS** |
| No overlapping `/api/regulatory` search endpoints | **PASS** |
| Candidate stale files removed | **PASS** (already absent) |
