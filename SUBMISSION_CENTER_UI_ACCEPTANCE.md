# Submission Center — UI kit acceptance checklist

What every workspace kit must satisfy to be accepted, so installs are predictable.
Pairs with the install pipeline (`client/src/concept2cure/submission/_install/`),
the contracts (`@shared/types/submission-api`), and the constants
(`@shared/types/submission-constants`).

## Every screen must handle these states
Drive them from the React Query hooks (`isLoading`, `isError`, `data`) and from
`GET /api/submissions/capabilities`:

- **Loading** — skeleton/placeholder, never a blank flash.
- **Empty** — first-run copy + the primary action (e.g. "Create your first submission").
- **Error** — uniform `{ error: { code, message } }`; map via `submissionErrorMessage(code)`. Show a retry where safe.
- **Populated** — the real content.
- **Permission denied** (403 `AUTH_004`) — explain the missing role, don't crash.
- **Capability-off** — when `capabilities.publishTransmit` (etc.) is false, disable/empty that affordance with a one-line reason; never show a dead button.
- **Locked** — a frozen/dispatched sequence is immutable; Builder edits must be disabled (server returns 409 `INVALID_STATE`).
- **In-flight AI** — Planner/Shadow/Validation/Cross-region calls can take seconds; show progress, allow cancel where the endpoint supports it (authoring SSE via `AbortSignal`).
- **Streaming** — authoring renders `chunk` events progressively; finalize on `done`; surface `error` events inline.

## Design-system non-negotiables (CLAUDE.md / README)
- Sentence case everywhere. No Title Case. No ALL CAPS except 10px metadata labels.
- No emoji. No exclamation marks. No cheerleading.
- Body 13px. Max title 18–24px.
- Claude orange `#d97757` is the only strong color — one focal point per screen.
- 200ms ease-out motion. No bounce/spring/overshoot. Respect `prefers-reduced-motion`.
- Lucide icons only. Second person ("you"). Numbers over adjectives.
- Never hard-code a hex — use `colors_and_type.css` tokens. Map a constant's `tone` → palette token.

## Accessibility (WCAG 2.2 AA)
- Full keyboard operability; visible focus; logical focus order; no keyboard traps.
- Color is never the only signal — pair every status/severity color with its text label (the constants already carry labels).
- Contrast ≥ 4.5:1 body, 3:1 large text/UI. Hit targets ≥ 24px.
- Live regions announce async results (validation findings, shadow-review completion, stream end).
- Forms: programmatic labels, inline error text tied to the field, error summary on submit.

## Governance / Part 11 (where the workspace mutates)
- Irreversible/outward actions (sequence freeze, **transmit**) go through the governed flow + e-signature — never a bare button. Dispatch QC gates; it does not transmit.
- Every mutation already audits server-side; the UI should reflect "who/when" from the returned rows where shown.
- Reason-for-change capture on governed mutations (per the regulatory-compliance-ux pattern).

## Per-workspace data + endpoints (consume the hooks, don't fetch)
| Workspace | Hooks | Primary endpoints |
|---|---|---|
| Planner | `useSubmission`, `usePlan`, `useRegionProfiles` | `POST :id/plan` |
| Builder | `useSequences`, `useLeaves`, `useUpsertLeaf`, `useProvenance` | leaves CRUD, classify/extract |
| Sequences | `useSequences`, `useCreateSequence`, `useTransitionSequence` | sequences + transition |
| Validation | `useExplainValidation` | validator → explain |
| Shadow review | `useRunShadowReview`, `useShadowReviews`, `useShadowFindings` | shadow run + findings |
| Cross-region | `useCrossRegion`, `useRegionProfiles` | `POST :id/cross-region` |
| Dispatch | `useDispatchQc` | QC gate (+ governed transmit) |

## Definition of done for a kit
Typechecks against the contracts; renders all states above; passes the a11y bar;
honors the design-system rules; consumes only the hooks/constants (zero hand-rolled
fetch or enums); and the `workspaces.tsx` slot is flipped to `status: 'ready'`.
