# Build Order 21 — Workflow Transition Enforcement Architecture

## Transition Flow

```
User clicks Verify/Publish
  → applyWorkflowTransition(stage, governanceModel)
    → runTransitionPreflight(stage, governanceModel)
      → allowed?
        YES → proceed with stage transition
        NO  → show TransitionPreflightBanner
```

## Banner Behavior

- **blocked** — hard stop. Banner shows reasons, next actions, and a CTA button. No proceed option.
- **review_required** — soft stop. Banner shows reasons and next actions with a proceed-anyway dismiss option.

## Derivation

All preflight logic derives from the shared `WorkspaceGovernanceViewModel`. The preflight function is pure: it reads gate selectors (`selectVerifyGate`, `selectPublishGate`, `publishGateOutcome`) from the existing governance model and returns a `TransitionPreflightResult`.

## Constraints

- No new fetch calls. Governance state is already materialized in the view model.
- No new state store. The banner renders directly from the preflight result held in component state.
- No new routes or modals. CTA actions dispatch through existing governance controller methods.
- Single preflight function serves both verify and publish gates, preventing enforcement drift.
