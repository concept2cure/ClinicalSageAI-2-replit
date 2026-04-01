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
- `POST /projects/:projectId/authority-profiles`
- `GET /projects/:projectId/agency-communications`
- `POST /projects/:projectId/agency-communications`
- `GET /projects/:projectId/publishops/services`
- `POST /projects/:projectId/publishops/services`
- `PATCH /projects/:projectId/publishops/services/:serviceId/status`

## Client data wiring

- Communication Center UI reads scoped data from:
  - authority profiles API
  - agency communications API
  - PublishOps services API
- If backend data is unavailable, the UI falls back to local scaffold defaults to keep the lane usable in non-migrated/demo environments.

## Security and fail-closed behavior

- All routes run under existing Concept2Cure auth + tenant middleware chain.
- Visibility tiers are validated and filtered server-side.
- Restricted tiers (`publishops_only`, `restricted_legal_sensitive`) are denied unless role policy allows.
- Each mutation writes an audit entry through existing Part 11 audit logging.

## Data model scaffold

Shared type contracts were added in `shared/types/communication-center.ts` for:

- `AuthorityProfileRecord`
- `AgencyCommunicationEventRecord`
- `PublishOpsServiceRecord`
- `COMMUNICATION_VISIBILITY_TIERS`
- `PUBLISHOPS_SERVICE_STATES`

## Current limitations (intentional)

- Routes are fail-closed if required Communication Center tables are missing (migration must be applied first).
- No live agency connector implementation is included yet.
- Event ingestion/normalization is still manual API-driven (no automated channel adapters yet).

## Next backend steps (before broader UI)

1. Add transport adapter abstraction for agency channel ingest (portal/gateway/email/mixed).
2. Add event ingestion workers and signature provenance for inbound correspondence files.
3. Extend notification emission mapping for new event classes.
4. Add dedicated API integration tests (not just static contract tests).
