# Projects Parity Execution Board — Stage 1 (Sharing + Visibility)

## Scope

Stage 1 delivers project-level sharing and visibility controls for Concept2Cure Projects, including:

- explicit project sharing members with scoped roles (`owner`, `edit`, `use`)
- project visibility policy (`private`, `org_public`)
- access enforcement hooks in project read/list and key project operations
- API endpoints for reading/updating sharing state

## Backend Deliverables (completed in this slice)

### 1) Data model additions

- `project_visibility_settings` table
  - one row per project
  - `visibility`: `private | org_public`
  - tenant scoping via `organization_id`
- `project_members` table
  - explicit project membership
  - role: `owner | edit | use`
  - status: `active | revoked`

### 2) Routes and behavior

Implemented in `server/routes/concept2cure.ts`:

- `GET /api/concept2cure/projects/:id/sharing`
- `PATCH /api/concept2cure/projects/:id/sharing/visibility`
- `PUT /api/concept2cure/projects/:id/sharing/members/:userId`
- `DELETE /api/concept2cure/projects/:id/sharing/members/:userId`

Also wired sharing-aware behavior into:

- `GET /api/concept2cure/projects` (filtered by access)
- `GET /api/concept2cure/projects/:id` (enforced access + sharing metadata)
- create project flow initializes sharing rows (private + creator owner member)
- key project operations now use centralized access helper with workspace + org scope checks

### 3) Policy helper

- Added `server/services/project-sharing-access.ts` with:
  - `getProjectSharingState`
  - `canUseProject`
  - `canEditProject`
  - `canManageProject`
  - `applyProjectSharingState`

## Migrations

- Added `db/migrations/20260401_project_sharing_visibility.sql`
- Updated `db/migrations/migrations_manifest.json`

## Tests

- Added: `tests/services/project-sharing-access.test.ts`
  - covers default visibility behavior
  - private sharing + membership semantics
  - org-manager override semantics

## Follow-ups for Stage 1.1 / Stage 1.2

1. Add route-level tests for sharing endpoints:
   - manager vs non-manager update permissions
   - membership validation and error paths
   - legacy fallback path when sharing tables are missing
2. Add frontend controls:
   - share modal
   - visibility selector
   - member role chips/actions
3. Add audit events for sharing mutations:
   - visibility changes
   - member add/remove/role change
4. Add usage analytics:
   - sharing adoption metrics
   - private/public split
   - active collaborator counts
