# Build Order 21 — Transition Enforcement Map

## TransitionPreflightResult Contract

| Field               | Type                                         | Purpose                                      |
| ------------------- | -------------------------------------------- | -------------------------------------------- |
| target              | WorkflowStage                                | Stage the user wants to reach                |
| allowed             | boolean                                      | Whether transition can proceed               |
| status              | `'allowed' \| 'blocked' \| 'review_required'` | Governance outcome                           |
| reasons             | string[]                                     | Why blocked or review required               |
| nextActions         | string[]                                     | Actionable steps to resolve                  |
| blockingDecisionIds | string[]                                     | Decision record IDs causing the block        |
| fallbackNav         | string \| null                               | Where to redirect if blocked                 |
| cta                 | `'open_queue' \| 'inspect_decision' \| 'refresh' \| null` | Primary call-to-action for the banner |

## runTransitionPreflight Logic

- **Non-gated transitions** (draft, review, etc.) — always returns `allowed: true`.
- **verify_review** — runs `selectVerifyGate` from shared governance model.
- **publish_package** — runs `selectPublishGate` + `publishGateOutcome` from shared governance model.
- Pure function. No fetches, no side effects. Derives entirely from `WorkspaceGovernanceViewModel`.

## Shell Integration

`applyWorkflowTransition` now calls `runTransitionPreflight` before executing verify and publish transitions. If `allowed` is false, the transition is blocked and the banner is shown instead.

## TransitionPreflightBanner UX

- Inline governance interception rendered at the top of the workspace.
- Displays `reasons` as a list and `nextActions` as guidance text.
- CTA button determined by the `cta` field:
  - `open_queue` — calls `governance.openQueue` to navigate to the decision queue.
  - `inspect_decision` — calls `governance.inspectDecision(blockingDecisionIds[0])`.
  - `refresh` — calls `governance.requestRefresh` to re-derive governance state.
- `review_required` status shows a dismiss/proceed-anyway option; `blocked` does not.

## CTA Navigation

All CTAs drive real navigation through the governance controller. No new routes, no modals, no fetches. The banner is a pure presentation of preflight output with action dispatch.
