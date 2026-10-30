# W2 / D1 — catalog and tasking read recovery

Status: discovery and bounded contracts recorded before production edits. Baseline `47ce1d3d9`; contract `docs/design/CATALOG_TASKING_RECOVERY_2026-10-30.md`. Prior October 23 fixes and final publication are already canonical. No hosted incident or deployment resolution is asserted.

## What already exists

- `WorkflowCatalog.tsx` (re-exported by `AdminSurfaces.tsx`) owns Subscription & features, catalog/license adoption, toggles and context. Its error copy currently offers no executable retry, and license recovery only navigates away.
- `dataConnect.tsx` already provides dependency-triggered `useLiveData`, owned/cancelled reads, shape guards and shared retry controls. `queryClient.ts` / `authToken.ts` already enforce consistent active-session headers. Existing catalog routes and `license-manager.ts` own persisted entitlement facts. No parallel reader, session store or catalog is needed.
- `TaskBoard.tsx` already renders unread stores and retry honestly. Its existing AnA handlers can still describe incomplete data as empty or missing, and a failed project-options read as an absent project. Combined filter validation currently mutates the project before deciding whether the module is valid.
- `surfaceActions.ts` already owns readiness, refusal and handler registration; the board's canvas/signature/archive protections remain the owners. Existing task route and unified-work reader already provide recovery metadata and request-scoped database reads.
- Existing catalog, entitlement, AnA wave-two, surface-action and task-board suites cover these boundaries. Focused failing/recovery cases will extend those boundaries. Searches include current UI/hooks/transport/routes/services/tests and deleted history: retired tasking shell/service (`2895218b8`), ProjectTaskBoard (`d04381632`), AppsPage (`bb243dfad`) and MissionControl board (`77034aa5f`). None is a current replacement.

## Refresh and qualification

The fresh environment was inspected using the cloud-runtime skill: HTTP policy enforced/unrestricted, no configured provider credentials or external identities. A clean canonical clone was obtained. The earlier source `bf47a6964` and final publication `8c89c43b0` are ancestors; they are not recreated. Node 22.23.3 was installed from its official archive with the published SHA-256 verified, matching the repository engine contract.

Red/green, integration and publication results follow here. Synthetic checks do not establish the user's live incident cause. Current hosted URL/error details remain requested.
