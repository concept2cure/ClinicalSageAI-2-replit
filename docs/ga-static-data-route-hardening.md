# GA Static-Data Route Hardening

## Purpose
For GA readiness, routes serving hardcoded/static business data must remain **fail-closed by default** and must never be enabled in production.

## Production policy
- `NODE_ENV=production` + any static-data flag set to `true` now fails startup.
- Enforced flags:
  - `ENABLE_HAQ_MANAGER_STATIC_DATA`
  - `ENABLE_MISSION_CONTROL_STATIC_DATA`

> Note: `/api/regulatory/submissions`, `/api/regulatory/calendar`, and `/api/organizations` now read/write governed DB tables and are no longer part of static-data flag governance.

## Disabled-route response contract
Blocked routes return:
- HTTP `503`
- Headers:
  - `X-Route-Hardening: static-business-data-blocked`
  - `X-Route-Enable-Flag: <flag>`
- JSON body includes:
  - `code: STATIC_BUSINESS_DATA_DISABLED`
  - `requiredFlag`
  - `timestamp`

## Operational guidance
1. Keep all static-data flags unset/false in all shared environments.
2. If temporary enablement is required in non-production, set only the minimal flag needed.
3. Remove flag usage once underlying routes are migrated to governed persisted data sources.
