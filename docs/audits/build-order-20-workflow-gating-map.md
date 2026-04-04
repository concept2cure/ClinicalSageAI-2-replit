# Build Order 20 — Workflow Gating Map

## 1. Verify / Publish Gates

- **selectVerifyGate**: Reads fabricEntries + queueCounts from the shared governance view-model.
  - If any item is `escalated` or has blockers -> returns `blocked`.
  - If any item is `pending` -> returns `review_required`.
  - Otherwise -> returns `allowed`.
- **selectPublishGate**: Depends on the verify gate outcome plus `publishGateOutcome`.
  - Publish is only `allowed` when verify gate is `allowed` AND publish-specific checks pass.

## 2. Next-Action Recommendations

**selectNextActions** returns a priority-ordered list derived from the same governance model:

| Action                | Priority | Trigger                          |
| --------------------- | -------- | -------------------------------- |
| `resolve_escalated`   | high     | Escalated items exist            |
| `fix_blockers`        | high     | Unresolved blockers exist        |
| `review_pending`      | medium   | Pending items awaiting review    |
| `revisit_deferred`    | low      | Deferred items remain            |
| `proceed_to_verify`   | low      | All above resolved               |

## 3. Manual Refresh

- **requestRefresh**: Callable by any consumer to trigger a data reload.
- **setRefreshFn**: Model stores the refresh function provided by the shell.
- Shell wires `fabricQuery.refetch` into the model via `setRefreshFn`.
- StatusBar (and any other surface) calls `requestRefresh` to pull fresh governance data.

## 4. StatusBar

- Expanded view includes a **Next Actions** section listing recommendations with priority indicators.
- Displays a **Verify gate badge** showing current gate status (`blocked` / `review_required` / `allowed`).
- All data sourced from the shared `WorkspaceGovernanceViewModel` — no separate fetch.
