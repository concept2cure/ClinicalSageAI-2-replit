# Client Intelligence API Route Audit

**Date**: 2026-03-29
**Scope**: Verify frontend API calls match backend routes in `server/routes/client-intelligence.ts`

---

## Backend Route Inventory

All routes are mounted at `/api/client-intelligence` (confirmed in `server/index.ts` line 4210).

| # | Method | Path | Request Shape | Response Shape |
|---|--------|------|--------------|----------------|
| 1 | GET | `/profile` | query: `clientWorkspaceId?` | `{ success, profile }` |
| 2 | POST | `/profile` | body: `{ companyName, clientWorkspaceId?, ...profileData }` | `{ success, profile }` |
| 3 | POST | `/documents/upload` | multipart: `file` + body: `profileId` | `{ success, result }` |
| 4 | GET | `/documents` | query: `profileId` | `{ success, documents }` |
| 5 | GET | `/checklist` | query: `profileId` | `{ success, checklist }` |
| 6 | GET | `/memory` | query: `profileId, category?, limit?, offset?` | `{ success, ...result }` |
| 7 | GET | `/memory/semantic-search` | query: `profileId?, query, category?, limit?, minSimilarity?` | `{ success, ...result }` |
| 8 | GET | `/memory/context-assemble` | query: `threadId, query, projectId?, limitPerLayer?, maxChars?, minSimilarity?, maxAgeDays?` | `{ success, ...result, memoryBlockChars, memoryDiagnostics }` |
| 9 | POST | `/memory/:id/verify` | params: `id` | `{ success }` |
| 10 | POST | `/memory/:id/supersede` | params: `id`, body: `supersededById?` | `{ success }` |
| 11 | DELETE | `/memory/:id` | params: `id` | `{ success }` |
| 12 | GET | `/context` | query: `clientWorkspaceId?` | `{ success, context }` |
| 13 | GET | `/project/:projectId/profile` | params: `projectId` | `{ success, profile }` |
| 14 | POST | `/project/:projectId/profile` | params: `projectId`, body: project data | `{ success, profile }` |
| 15 | POST | `/project/:projectId/documents/upload` | multipart: `file` | `{ success, result }` |
| 16 | GET | `/project/:projectId/documents` | params: `projectId` | `{ success, documents }` |
| 17 | GET | `/project/:projectId/memory` | query: `category?` | `{ success, ...result }` |
| 18 | GET | `/project/:projectId/memory/semantic-search` | query: `query, category?, limit?, minSimilarity?` | `{ success, ...result }` |
| 19 | POST | `/project/:projectId/memory/:id/supersede` | params: `projectId, id` | `{ success }` |
| 20 | GET | `/memory/shared-pool` | query: `projectId?, category?, query?, limit?, includeSuperseded?` | `{ success, ...result }` |
| 21 | GET | `/project/:projectId/context` | params: `projectId` | `{ success, context }` |
| 22 | GET | `/ana/user-profile` | (auth from token) | `{ success, profile }` |
| 23 | POST | `/ana/user-profile` | body: user profile data | `{ success }` |
| 24 | GET | `/ana/merged-context` | query: `projectId?` | `{ success, ...result }` |
| 25 | GET | `/ana/capabilities` | query: `projectId?` | `{ success, capabilities }` |
| 26 | POST | `/ana/log-outcome` | body: `{ capabilityKey, actionType, outcome, ... }` | `{ success }` |
| 27 | GET | `/ana/wisdom` | query: `projectType?, regulatoryBody?` | `{ success, wisdom }` |
| 28 | GET | `/ana/objectives` | query: `projectId?` | `{ success, objectives }` |
| 29 | POST | `/ana/objectives` | body: objective data | `{ success, objective }` |
| 30 | GET | `/ana/templates/company-types` | none | `{ success, types }` |
| 31 | GET | `/ana/templates/project-types` | none | `{ success, types }` |
| 32 | GET | `/ana/templates/company/:type` | params: `type` | `{ success, template }` |
| 33 | GET | `/ana/templates/project/:type` | params: `type` | `{ success, template }` |

---

## Frontend API Calls

### 1. UserContextEditor.tsx

| Call | Method | URL | Body |
|------|--------|-----|------|
| Fetch profile | GET | `/api/client-intelligence/user/profile` | -- |
| Save profile | POST | `/api/client-intelligence/user/profile` | `{ role, expertise, responseStyle, additionalContext }` |

### 2. CompanyContextEditor.tsx

| Call | Method | URL | Body |
|------|--------|-----|------|
| Fetch profile | GET | `/api/client-intelligence/profile` | -- |
| Save profile | POST | `/api/client-intelligence/profile` | `{ ...existingProfile, ...patch }` |

### 3. ProjectContextEditor.tsx

| Call | Method | URL | Body |
|------|--------|-----|------|
| Fetch profile | GET | `/api/client-intelligence/project/{projectId}/profile` | -- |
| Save profile | POST | `/api/client-intelligence/project/{projectId}/profile` | `Partial<ProjectProfile>` |

### 4. DocumentUploadZone.tsx

| Call | Method | URL | Body |
|------|--------|-----|------|
| Company upload | POST | `/api/client-intelligence/documents/upload` | FormData(`file`) |
| Project upload | POST | `/api/client-intelligence/project/{scopeId}/documents/upload` | FormData(`file`) |

---

## Mismatches Found

### CRITICAL: UserContextEditor uses non-existent route

- **Frontend calls**: `GET /api/client-intelligence/user/profile` and `POST /api/client-intelligence/user/profile`
- **No such route exists**. The closest match is `GET /api/client-intelligence/ana/user-profile` and `POST /api/client-intelligence/ana/user-profile`.
- **Impact**: UserContextEditor will always get a 404 error. Users cannot load or save their AnA preferences.
- **Files**: `client/src/concept2cure/components/intelligence/UserContextEditor.tsx` lines 73, 104

### CRITICAL: CompanyContextEditor response shape mismatch

- **Frontend** (`CompanyContextEditor.tsx` line 512-516): The `queryFn` does `return res.json()`, which returns the full envelope `{ success: true, profile: {...} }`.
- **Data binding**: The query result is typed as `CompanyProfile` and used directly (e.g., `profile.companyName`).
- **Backend** returns `{ success: true, profile: { companyName, ... } }`.
- **Impact**: The component receives the envelope as the "profile". Accessing `profile.companyName` will always be `undefined` because the data is nested under `profile.profile`. The `isProfileEmpty()` check would always return true, showing the empty state.
- **Fix needed**: The queryFn should extract `json.profile` before returning, e.g., `const json = await res.json(); return json.profile;`
- **File**: `client/src/concept2cure/components/intelligence/CompanyContextEditor.tsx` lines 512-516

### HIGH: DocumentUploadZone missing required `profileId` for company uploads

- **Frontend** (`DocumentUploadZone.tsx`): For company-scoped uploads, sends `POST /api/client-intelligence/documents/upload` with only `FormData('file')`.
- **Backend** (`client-intelligence.ts` lines 161-166): Requires `profileId` in `req.body`. Returns 400 if missing.
- **Impact**: All company-level document uploads will fail with "profileId is required".
- **File**: `client/src/concept2cure/components/intelligence/DocumentUploadZone.tsx` line 108

### HIGH: DocumentUploadZone called with wrong props

- **CompanyContextEditor** (`CompanyContextEditor.tsx` line 594): `<DocumentUploadZone />` -- passes **no props**. The `scope` prop is required.
- **ProjectContextEditor** (`ProjectContextEditor.tsx` line 760): `<DocumentUploadZone projectId={projectId} />` -- passes `projectId` which is **not a valid prop**. The correct props would be `scope="project" scopeId={projectId}`.
- **Impact**: TypeScript would catch this at compile time, but at runtime:
  - In CompanyContextEditor: `scope` is undefined, so `getUploadUrl()` returns the company upload URL (fallback behavior), but the upload will fail anyway due to missing `profileId`.
  - In ProjectContextEditor: `scope` is undefined and `scopeId` is undefined. The `projectId` prop is silently ignored. The upload URL defaults to the company endpoint instead of the project endpoint.
- **Files**: `client/src/concept2cure/components/intelligence/CompanyContextEditor.tsx` line 594, `client/src/concept2cure/components/intelligence/ProjectContextEditor.tsx` line 760

### MODERATE: UserContextEditor response shape mismatch (if route existed)

- Even if the route URL were corrected to `/ana/user-profile`, the backend returns `{ success: true, profile: {...} }`.
- The frontend `queryFn` does `return res.json()` which would return the envelope.
- The data is typed as `UserProfileResponse` and accessed directly (`profile.role`, `profile.expertise`).
- **Impact**: Would need `json.profile` extraction, same as CompanyContextEditor.
- **File**: `client/src/concept2cure/components/intelligence/UserContextEditor.tsx` lines 72-76

### MODERATE: ProjectContextEditor response handling works correctly (no issue)

- The `ProjectContextEditor` queryFn correctly does: `const json = await res.json(); return { ...EMPTY_PROFILE, ...json?.data, ...json?.profile }`.
- This correctly extracts `json.profile` from the backend envelope. The `json?.data` spread is harmless (undefined).

### LOW: No routes use `sendSuccess()` / `sendError()` envelope pattern

- All 33 routes in `client-intelligence.ts` use raw `res.json({ success: true, ... })` and `res.status(N).json({ success: false, error: ... })`.
- Per CLAUDE.md code standards, backend routes MUST use `sendSuccess()` / `sendError()` envelope from `concept2cure.ts`.
- **Impact**: Functional but inconsistent with the rest of the codebase. Response shapes may diverge from what other parts of the app expect from the standard envelope.

---

## Summary Table

| # | Severity | Component | Issue |
|---|----------|-----------|-------|
| 1 | CRITICAL | UserContextEditor | Calls `/user/profile` -- route does not exist (should be `/ana/user-profile`) |
| 2 | CRITICAL | CompanyContextEditor | Returns full envelope as profile data -- `companyName` etc. always undefined |
| 3 | HIGH | DocumentUploadZone | Company upload missing `profileId` in FormData -- backend rejects with 400 |
| 4 | HIGH | CompanyContextEditor | `<DocumentUploadZone />` missing required `scope` prop |
| 5 | HIGH | ProjectContextEditor | `<DocumentUploadZone projectId={...}>` uses wrong prop name (should be `scope="project" scopeId={...}`) |
| 6 | MODERATE | UserContextEditor | Response shape mismatch (envelope not unwrapped) -- blocked by issue #1 anyway |
| 7 | LOW | client-intelligence.ts | All routes use raw `res.json()` instead of `sendSuccess()`/`sendError()` |
