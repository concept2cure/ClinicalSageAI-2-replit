# Stage 11 — Backend Route Ownership Convergence and API De-duplication

**Generated:** 2026-04-01
**Branch:** `cursor/cleanup-workstream-integration-7784`
**Purpose:** Turn duplicate route families into explicit canonical ownership

---

## 1. Mission

Reduce backend ambiguity now that the shell is telling a cleaner story. Identify
duplicate or overlapping route families, pick canonical owners, retain compatibility
shims only where needed, and document the decisions.

---

## 2. Route Mount Reality

### Scale

| Metric | Value |
|--------|-------|
| Route files under `server/routes/` | 307 (263 `.ts`, 26 `.js`, 18 subdirs) |
| Total directory size | 6.3 MB |
| `app.use()` lines in `server/index.ts` | ~180 |
| Unique URL prefixes | ~120 |
| Duplicate/stacked prefixes | 6 families |
| `server/index.ts` total lines | 7,911 |

### Mount Architecture

Routes are mounted in two phases:
1. **Module-level** (top of file, lines 523–4584) — synchronous imports
2. **`startServer()` block** (lines 6988–7640) — dynamic imports inside `try/catch`

Express resolves routes by mount order. If two routers share a prefix, the earlier-mounted
one wins for any path it handles.

---

## 3. Duplicate Route Family Analysis

### Family 1: `/api/ind` (2 routers)

| Order | Line | File | Sub-paths |
|-------|------|------|-----------|
| 1 | 3923 | `ind-generation.ts` | `GET /structure`, `GET /device-status/:type/:projectId`, `GET /status/:projectId`, `POST /generate-section`, `POST /generate-form`, `POST /assemble` |
| 2 | 7022 | `ind.ts` | `GET/POST /applications`, `GET/PUT/DELETE /applications/:id`, `POST .../generate/:sectionCode`, `/stream`, `/analyze`, `/guidance`, `/followup` |

**Overlap:** None — different sub-path namespaces.
**Risk:** LOW — coexist safely by path design.
**Decision:** Keep both. `ind-generation.ts` owns generation/assembly. `ind.ts` owns application CRUD.

### Family 2: `/api/regulatory` (2 routers)

| Order | Line | File | Sub-paths |
|-------|------|------|-----------|
| 1 | 3928 | `regulatory-registry.ts` | `GET /registry`, `GET /registry/:id`, `GET /regions`, **`GET /search`**, `GET /resolve` |
| 2 | 7266 | `regulatoryRoutes.ts` | `GET /submissions`, `GET/POST /calendar`, **`GET /search`**, `GET /risk/:sectionId` |

**Overlap:** **YES — `GET /search` exists on both routers.**
- `regulatory-registry.ts` searches the in-memory registry by query string
- `regulatoryRoutes.ts` calls `regulatoryService.getRegulatoryIntelligence`
- Only the first mount (`regulatory-registry`) serves `GET /api/regulatory/search`
- The second handler is **effectively dead** for that path

**Risk:** HIGH — silent shadowing of a real handler.
**Decision:** The `regulatory-registry.ts` `GET /search` is the canonical handler. The
shadowed `GET /search` in `regulatoryRoutes.ts` should either be removed, renamed to
`GET /intelligence-search`, or documented as intentionally dead.

### Family 3: `/api/documents` (4+ routers)

| Order | Line | File | Sub-paths |
|-------|------|------|-----------|
| 1 | 1761 | `versionDiff.ts` | `GET /:id/versions`, `GET /:id/diff` |
| 2 | 7184 | `documents-unified.ts` | `GET /health`, `GET /docs`, sub-routers (`/core`, `/authoring`, etc.) |
| 3 | 7192 | `sourceLinks.ts` | `GET/POST /:id/sources`, `DELETE /:id/sources/:linkId`, `POST /:id/sources/analyze` |
| 4 | 7208 | `document-intelligence-routes.ts` | `POST /process`, `/identify-types`, `/analyze`, `/enhance` |

**Overlap:** None — different sub-path shapes.
**Risk:** MEDIUM — any future catch-all on an earlier mount would shadow later ones.
**Decision:** `documents-unified.ts` is the canonical owner. Other files provide specialized
sub-domains (version diff, source links, intelligence). Keep all four but document
that `documents-unified.ts` is the facade.

### Family 4: `/api/ai` (3 mounts)

| Order | Line | File | Purpose |
|-------|------|------|---------|
| 1 | 966 | `api/ai/routes.ts` | Compliance analysis, boilerplate generation, regulatory guidance |
| 2 | 1032 | `ai-assistance.ts` | Generic AI assist, verify, health |
| 3 | 3935 | `ai-claims-routes.ts` | Claims binder (`/claims/:claimId/add-to-binder`) |

**Overlap:** None — different sub-paths.
**Risk:** LOW — conceptually different concerns, confusing naming only.
**Decision:** Keep all three. Future work should namespace them more clearly
(e.g., `/api/ai/compliance`, `/api/ai/assist`, `/api/ai/claims`).

### Family 5: `/api/projects` (3 mounts)

| Order | Line | File | Sub-paths |
|-------|------|------|-----------|
| 1 | 7083 | `projects-management.ts` | `GET /`, `GET /:projectId`, `POST /`, `DELETE /:projectId`, `PATCH /:projectId` |
| 2 | 7145 | `project-modules.ts` (mounted at `/api/projects`) | `GET/POST /:projectId/modules`, `GET /find`, `GET /org-stats` |
| 3 | 7146 | `project-modules.ts` (mounted at `/api/project-modules`) | Same router, different mount |

**Overlap:** **YES — `GET /api/projects/find` and `GET /api/projects/org-stats` are BUG CANDIDATES.**
- `projects-management.ts` defines `GET /:projectId` which matches any string
- This means `GET /api/projects/find` hits projects-management first, treating "find" as a projectId
- The `project-modules` handler for `/find` on the `/api/projects` mount is unreachable

**Risk:** HIGH — likely bug.
**Decision:** `GET /find` and `GET /org-stats` should only be served from the
`/api/project-modules` mount (line 7146). The duplicate mount of `project-modules`
at `/api/projects` (line 7145) should be removed or its paths verified not to collide.

### Family 6: `/api/programs` (2 routers + RTM)

| Order | Line | File | Sub-paths |
|-------|------|------|-----------|
| 1 | 1697 | `se-matrix.ts` | `POST /:programId/se-matrix/render` |
| 2 | 1709 | `defense-packet.ts` | `POST/GET/PATCH /:programId/predicate-intel/defense-packet...` |
| 3 | 7200 | `rtm-export.ts` (at `/api`) | `GET/POST /programs/:programId/rtm...` |

**Overlap:** None — different second-segment paths.
**Risk:** LOW — safe by design.
**Decision:** Keep all three.

---

## 4. Route Ownership Matrix (Canonical Decisions)

| URL prefix | Canonical owner | Additional routers | Status |
|-----------|----------------|-------------------|--------|
| `/api/auth` | `auth.ts` | `authEnterprise.ts`, `sso.ts` | Clean — different sub-paths |
| `/api/concept2cure` | `concept2cure.ts` | `compute.ts` (at `/compute` sub-path) | Clean |
| `/api/chat` | `chat.ts` | `chat-actions.ts` (at `/api` with `/chat/actions/*`) | Clean |
| `/api/authoring` | `authoring.router.ts` | `authoring-actions.ts` | Clean |
| `/api/ind` | `ind-generation.ts` + `ind.ts` | Split ownership by concern | Safe |
| `/api/regulatory` | `regulatory-registry.ts` (primary) | `regulatoryRoutes.ts` (secondary) | **`GET /search` conflict** |
| `/api/documents` | `documents-unified.ts` (facade) | `versionDiff.ts`, `sourceLinks.ts`, `document-intelligence-routes.ts` | Safe — document facade |
| `/api/ai` | `api/ai/routes.ts` (compliance) | `ai-assistance.ts`, `ai-claims-routes.ts` | Safe — different concerns |
| `/api/projects` | `projects-management.ts` (CRUD) | `project-modules.ts` | **`/find` and `/org-stats` shadowed** |
| `/api/programs` | `se-matrix.ts` + `defense-packet.ts` | `rtm-export.ts` | Safe |
| `/api/ana-ri` | `ana-ri.ts` | — | Clean |
| `/api/ana` | `ana-features.ts` | — | Clean |

---

## 5. Real Bugs Found

### Bug 1: `GET /api/regulatory/search` — shadowed handler

The `regulatoryRoutes.ts` handler for `GET /search` (which calls `regulatoryService.getRegulatoryIntelligence`) is unreachable because `regulatory-registry.ts` is mounted first and defines the same path. Callers will always get the registry search, never the intelligence search.

**Impact:** Any code calling `GET /api/regulatory/search` expecting intelligence results gets registry results instead.

### Bug 2: `GET /api/projects/find` and `GET /api/projects/org-stats` — swallowed by `:projectId`

The `projects-management.ts` router defines `GET /:projectId` which matches any path segment. When `project-modules.ts` is mounted at the same `/api/projects` prefix, its `GET /find` and `GET /org-stats` routes are unreachable because Express matches `/:projectId` first, treating "find" and "org-stats" as project IDs.

**Impact:** Any code calling `GET /api/projects/find` gets a "project not found" error instead of the expected module lookup. The same routes work correctly on the `/api/project-modules` mount.

---

## 6. Deprecated/Orphaned Route Files

| File | Status | Evidence |
|------|--------|---------|
| `server/routes/index.ts` | Deprecated — not mounted by `server/index.ts` | Explicit deprecation comment in file |
| `server/routes/tenants.ts` | Orphaned — replaced by `tenants-simple.js` | Only referenced from deprecated `index.ts` |
| `server/routes/programs.ts` | Possibly orphaned | No reference from `server/index.ts` |
| `server/routes/programsV2.ts` | Possibly orphaned | No reference from `server/index.ts` |
| `server/routes/projects-create.ts` | Possibly orphaned | Comments only; no mount found |

---

## 7. Green Family Integration Tests (Recommended)

For Stage 11 verification, these canonical families should have integration tests:

| Family | Test target | Method |
|--------|-----------|--------|
| Auth | `POST /api/auth/login` | Supertest with seeded user |
| Concept2Cure projects | `GET /api/concept2cure/projects` | Supertest with auth token |
| AnA/RI | `POST /api/ana-ri/chat` or health endpoint | Supertest with auth token |
| Documents | `GET /api/documents/health` | Supertest (no auth required for health) |
| IND | `GET /api/ind/structure` | Supertest with auth token |

---

## 8. Recommended Actions (Ordered)

| Priority | Action | Risk | Stage |
|----------|--------|------|-------|
| 1 | Document the `/api/regulatory/search` conflict and decide canonical behavior | Low | Now |
| 2 | Remove duplicate mount of `project-modules` at `/api/projects` (line 7145) | Low | Now |
| 3 | Add integration smoke tests for green families | None | Stage 11 |
| 4 | Namespace `/api/ai` sub-routers more clearly | Low | Post-beta |
| 5 | Consolidate auth middleware to single format (.ts) | Medium | Post-beta |
| 6 | Clean up orphaned route files | Low | Post-beta |
| 7 | Long-term: carve `concept2cure.ts` into domain-specific route files | High | Post-beta |

---

## 9. Cross-Stage Rules Applied

- No route deletion without ownership proof: every decision above is backed by mount analysis
- No blind merge of route changes: Express mount order is documented
- No deep surgery on `server/index.ts`: only the documented line-7145 removal is recommended
- Backend duplication documented, not removed wholesale: shims and secondary mounts preserved
  where they serve different sub-paths safely
