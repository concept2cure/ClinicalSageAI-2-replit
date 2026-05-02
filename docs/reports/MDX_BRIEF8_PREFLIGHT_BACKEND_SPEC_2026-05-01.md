# Brief #8 — Pre-flight RTA gate · backend wiring spec

**Status:** Implementation-ready spec. **Branch the kit lands on:**
TBD by Claude Design. **Backend status:** Pre-flight invocation +
audit are shipped; this doc maps the kit's affordances to the
existing backend and identifies the small gaps to close concurrent
with the UI port.

The pre-flight surface is gated on the design system shipping
`ui_kits/preflight/`. When it lands, this spec gives the porting
engineer a clean wiring path.

## What's already shipped on the backend

| Capability | Surface |
|---|---|
| Module pre-flight | `POST /api/authoring-actions/module-preflight` |
| Dossier pre-flight | `POST /api/authoring-actions/dossier-preflight` |
| Audit on both | `k510_workflow.preflight` (human) + `agent.ana.k510_workflow.preflight` (AnA) |
| ESG transmit | `POST /api/510k/:projectId/esg/submit` |
| Audit on transmit | `k510_workflow.transmit` / `..transmit.failed` (human) + `agent.ana.k510_workflow.transmit` (AnA) |
| AnA tools | `k510_workflow.preflight` (read-only), `k510_workflow.transmit` (strict gate: `yes-transmit` + reason ≥ 30 chars) |
| Pre-flight context block in AnA prompt | Per active surface, via `mdx-context-resolver.ts` |

## Surface ↔ backend wiring

### Pre-flight verdict panel

| UI affordance | BFF call | Notes |
|---|---|---|
| "Run pre-flight" button (per module) | `POST /api/authoring-actions/module-preflight` body `{ projectId, moduleCode, regulatorBody?, submissionType? }` | Returns `{ overall: 'green'|'warn'|'block', sectionResults, counts, majorBlockers, recommendedActions }`. |
| "Run dossier pre-flight" button | `POST /api/authoring-actions/dossier-preflight` body `{ projectId, regulatorBody?, submissionType? }` | Aggregates across modules. |
| Verdict pill (green / amber / red) | Map `overall` directly | The kit picks colors from design tokens — backend just sends the verdict string. |
| Per-section drilldown | Comes inline in the pre-flight response (`sectionResults`) | No extra call. |
| Per-blocker card with "fix this" link | `majorBlockers[i]` carries `{ moduleCode, kind, severity, message }`; the kit links to the relevant editor surface | Suggest using `MDX_TOOLS` from the knowledge pack to surface the right tool to invoke. |

### Sign-off chain

| UI affordance | BFF call | Notes |
|---|---|---|
| Pre-transmit sign-off list | `GET /api/esignature/required-signatures?projectId=…` (NEW — see "what to add" below) | Returns the list of required signers (RA, QA, Tech) and their current state. |
| "Sign" button per role | `POST /api/esignature/sign` (existing) | Standard Part 11 sign-off; emits `esignature.sign` audit row. |
| Sign-chain status pill | Computed client-side from the required-signatures list | Each entry carries `{ role, signed: boolean, signedAt, signerName }`. |

### Transmit panel

| UI affordance | BFF call | Notes |
|---|---|---|
| "Transmit to FDA" button | `POST /api/510k/:projectId/esg/submit` (existing) | Returns `{ packageId, transactionId, ackStatus }`. |
| Transmit confirmation modal | The kit MUST require the user type "yes-transmit" (matches the AnA strict gate convention) | Don't duplicate: the API doesn't enforce this UX; it's the kit's job. |
| Reason capture (≥ 30 chars) | Sent in the body as `reason` | Server-side audit row carries this in `details.agentReason` for AnA paths; for human paths add `details.humanReason`. |
| ESG receipt + tracking handle | The transmit response carries `transactionId` | Kit displays it and offers a copy-to-clipboard. |
| "Transmit failed" toast | Map any non-2xx response | The audit row `k510_workflow.transmit.failed` is already emitted server-side. |

### Review-clock timeline

| UI affordance | BFF call | Notes |
|---|---|---|
| 75-day review countdown | `GET /api/510k/esg/status/:transactionId` (existing) | Returns `{ status, ackStatus, submittedAt, reviewClockStartedAt }`. |
| Status timeline | Same call; `status` advances as FDA acknowledges | Kit polls this every N minutes. |
| Acknowledgment receipt download | `GET /api/510k/esg/acknowledgment/:transactionId` (existing) | Returns the FDA ESG ack as text/plain. |

## What to add when the kit ships

Two small additions:

1. **`GET /api/esignature/required-signatures?projectId=…`** —
   computes which roles have signed and which haven't for a given
   project's pre-transmit sign-off chain. Reads from
   `electronic_signatures` joined with the project's required
   sign-off matrix (today the matrix lives in
   `fda_510k_projects.required_signatures` JSON; if absent the
   default chain is RA + QA + Tech). ~50 LOC. Audit
   `esignature.required_signatures.read`.

2. **`agent.ana.k510_workflow.preflight.recommend`** — a wrapper that
   runs pre-flight, parses the `majorBlockers`, and returns a
   structured recommendation list AnA can paraphrase. The pre-flight
   response already has `recommendedActions`; the wrapper just
   normalizes them into the same shape AnA's other tools use. ~30 LOC.

## AnA-driven flow (chat journey)

With existing tools, AnA can guide the user through pre-flight without
the UI being native:

1. User reaches the milestone "preflight_ready" (computed by
   `mdx-onboarding-milestone.ts`).
2. AnA proactively surfaces: "Every load-bearing section is approved
   and your target submission date is in 14 days. Want me to run
   pre-flight?"
3. User says yes → AnA invokes `k510_workflow.preflight` (read-only,
   no confirmation needed).
4. AnA paraphrases the verdict + the top three blockers, links each to
   the editor surface where it can be addressed.
5. User addresses blockers, asks AnA to re-run pre-flight.
6. When verdict is green, AnA proposes `k510_workflow.transmit` with
   the strict gate. The user MUST type `confirm: yes-transmit` and a
   reason ≥ 30 chars. AnA surfaces the audit row id on success so the
   user can pull it into the audit-explainer if needed.

## Audit-trail coverage at full surface

| Action | Code | Status |
|---|---|---|
| Pre-flight invocation | `k510_workflow.preflight` / `agent.ana.*` | ✓ |
| Required signatures read | `esignature.required_signatures.read` | new (item #1) |
| Sign-off recorded | `esignature.sign` | ✓ |
| ESG transmit | `k510_workflow.transmit` / `..transmit.failed` / `agent.ana.*` | ✓ |
| ESG status read | `k510_workflow.status.read` | needs back-fill |
| Acknowledgment download | `k510_workflow.acknowledgment.read` | needs back-fill |

## Estimated implementation time

When the kit ships:
- Items #1, #2 above (backend additions): ~half-day.
- Port kit components into `client/src/concept2cure/mdx/preflight/`: ~1 day.
- Wire components to the BFF endpoints: ~1 day.
- Audit-row back-fill (read endpoints): ~half-day.

**Total:** ~3 days from kit-shipped to surface-live.

## A note on the human-vs-AnA transmit divergence

The AnA-side transmit tool requires `confirm: yes-transmit` + reason
≥ 30 chars. The human-side route at `POST /api/510k/:projectId/esg/submit`
currently does NOT enforce a confirmation phrase or minimum reason
length — the strict gate lives only on the AnA tool. This is correct
for now (humans make their own choices), but the kit should
voluntarily mirror the strict gate at the UI level so the deliberate-
ness expectation is consistent regardless of whether the transmit was
human-driven or AnA-driven. The API will accept either form.
