# Communication Center Backend Scaffold (Phase: Non-UI First)

This document captures the backend-first scaffold for the integrated operational graph:

- Communication Center
- Submission & Agency Portal (nested lane)
- C2C PublishOps (managed service lane)

## Goals

1. Introduce normalized, authority-aware backend contracts before UI expansion.
2. Keep regulator transport handling abstracted through **Agency Communication Events**.
3. Establish scoped service states for managed PublishOps operations.

## Added API scaffolding

All routes are under `/api/concept2cure` and are project + organization scoped:

- `GET /projects/:projectId/authority-profiles`
- `GET /projects/:projectId/authority-profiles/templates`
- `POST /projects/:projectId/authority-profiles`
- `GET /projects/:projectId/agency-communications`
- `POST /projects/:projectId/agency-communications`
- `GET /projects/:projectId/publishops/services`
- `POST /projects/:projectId/publishops/services`
- `PATCH /projects/:projectId/publishops/services/:serviceId/status`
- `GET /projects/:projectId/submission-center/items`
- `POST /projects/:projectId/submission-center/items`
- `PATCH /projects/:projectId/submission-center/items/:itemId/status`

Implementation note: Communication Center route logic is split into `server/routes/concept2cure-communication-center.ts` and registered from `server/routes/concept2cure.ts` to keep the main route module maintainable.

## Client data wiring

- Communication Center UI reads scoped data from:
  - authority profiles API
  - agency communications API
  - PublishOps services API
  - submission center work-item API
- Communication Center UI can also trigger lightweight operational writes:
  - log manual agency communication event
  - request managed PublishOps support
  - create submission center work items
  - transition items through prepare → publish → submit lifecycle
- If backend data is unavailable, the UI falls back to local scaffold defaults to keep the lane usable in non-migrated/demo environments.

## Security and fail-closed behavior

- All routes run under existing Concept2Cure auth + tenant middleware chain.
- Visibility tiers are validated and filtered server-side.
- Restricted tiers (`publishops_only`, `restricted_legal_sensitive`) are denied unless role policy allows.
- Each mutation writes an audit entry through existing Part 11 audit logging.

## Operational automation currently wired

- Creating an agency communication event can auto-generate a linked project task when response is required or urgency is high/critical.
- If `responseRequired=true` and no due date is supplied, due dates are auto-derived by urgency SLA (critical: 3d, high: 7d, medium/low: 14d).
- Creating a PublishOps service request auto-generates a managed-service task in the task board.
- PublishOps status updates emit scoped notifications (`publishops_accepted`, `publishops_blocked`, `publishops_completed`).
- Submission center item creation auto-generates project tasks for operational traceability.
- Submission lifecycle transitions (`ready_for_publish`, `published`, `submitted_to_gateway`) emit notifications for dispatch awareness.

## Authority-aware profile controls

- Authority profile templates now include practical starter configs for FDA (CDRH + CDER/CBER), EMA, Health Canada, TGA, and PMDA.
- Profile creation applies channel-aware validation:
  - gateway profiles must explicitly define ACK handling
  - portal profiles must explicitly define portal receipt behavior

## Data model scaffold

Shared type contracts were added in `shared/types/communication-center.ts` for:

- `AuthorityProfileRecord`
- `AgencyCommunicationEventRecord`
- `PublishOpsServiceRecord`
- `COMMUNICATION_VISIBILITY_TIERS`
- `PUBLISHOPS_SERVICE_STATES`
- `SubmissionCenterItemRecord`
- `SUBMISSION_CENTER_ITEM_STATES`

## Current limitations (intentional)

- Routes are fail-closed if required Communication Center tables are missing (migrations `20260331_communication_center_scaffold.sql` and `20260401_submission_center_items.sql` must be applied first).
- No live agency connector implementation is included yet.
- Event ingestion/normalization is still manual API-driven (no automated channel adapters yet).

## Next backend steps (before broader UI)

1. Add transport adapter abstraction for agency channel ingest (portal/gateway/email/mixed).
2. Add event ingestion workers and signature provenance for inbound correspondence files.
3. Extend notification emission mapping for new event classes.
4. Add dedicated API integration tests (not just static contract tests).
