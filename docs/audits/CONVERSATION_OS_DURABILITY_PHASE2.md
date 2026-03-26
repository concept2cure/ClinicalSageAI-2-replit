# Conversation OS Durability Phase 2 (2026-03-26)

## Hardening Delivered
- Removed silent defaults (`project-unscoped`, `system`) from primary durable service paths.
- Added strict context validation in routes for durable reads/writes and fail-closed behavior for governed accept.
- Added durable accepted-artifact consequence table and persistence writes.
- Updated proposal accept to emit explicit states:
  - `ACCEPTED_GOVERNED`
  - `ACCEPTED_PERSISTED_NO_GOVERNANCE`
- Removed hardcoded org usage in governed writeback path; organization id is now required context.

## Remaining Risk
- `kernelStore` remains available only behind explicit env flag `CONVERSATION_OS_ALLOW_MEMORY_FALLBACK=true` for dev/emergency fallback.
- Production durability still requires DB connectivity and migrations applied.
