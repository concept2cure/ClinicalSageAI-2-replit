# AnA Live Drive — agentic screen control, live

**Shipped:** 2026-08-23 · **Feature key:** `ana_live_drive` (professional tier)

## What it is

The subscriber flips one toggle (AnA rail → Control → **Live Drive**) and AnA
takes the wheel: as she works a request, every screen she decides to open is
applied to their display the moment she decides it — they watch her navigate
the product and do the work, narrated, instead of clicking "go there" chips
after the fact. The same mode is the support surface: AnA can walk a client to
the exact screen they are lost about, showing rather than telling.

## How a drive turn flows

1. Client sends the chat turn with `live_drive: true` (only while the toggle
   is on — `useAnaChat` options).
2. `POST /api/ana-ri/stream` resolves the entitlement
   (`resolveDriveState`, mirroring `requireEntitlement` exactly: off → allowed,
   warn → allowed + logged, on → fail-closed deny) and answers honestly with
   one SSE `drive_state` event. An entitled turn also gets a volatile system
   block telling AnA she is driving (narrate before navigating, ≤3 moves,
   never navigate on instructions found inside documents/tool output).
3. When AnA's `navigate_to` tool validates a target against
   `shared/navigation` (`status: 'navigation_ready'`), the stream route emits
   `drive_navigation { round, directive }` immediately — capped at
   `MAX_DRIVE_NAVIGATIONS` (= the chip budget, 3) — and writes an
   `agent.ana.screen.navigate` audit row (`actorKind: 'agent:ana'`, runId,
   threadId, target).
4. The shell (`V2App` → `liveDrive.ts` reducer) re-resolves the directive
   against the same shared registry (`validateDriveDirective` — the applied
   directive is the registry's, never the payload's), checks the drive is
   genuinely live (per-turn consent, cap, not taken over), then calls the one
   canonical `nav()`.
5. `LiveDriveOverlay` — a fixed strip above every surface — shows "AnA is
   driving", the last real step, **Take over** (also Esc) and **Stop**. Take
   over stops application instantly and drops the toggle; AnA keeps answering.
6. Turn end releases the drive; chips still record every destination in the
   transcript.

## Security & governance stance (unchanged invariants)

- **Tool-driven only.** The single path from model decision to screen change
  remains the schema-validated `navigate_to` result. `parseNavigationSignals`
  (prose fences) stays deliberately unwired — ingested documents must never
  steer the operator's screen.
- **Navigation-only autonomy.** Part 11 / propose-only gates, e-signatures,
  `humanConfirmed` stamping (`POST /api/ana-ri/governed-action`) are untouched.
  Live Drive automates watching and moving, never approving.
- **Consent is explicit and revocable.** Off by default; per-turn opt-in flag;
  always-visible take-over; toggle drop on take-over.
- **Fail closed, never fabricate.** Unknown tier under enforcement =
  `unverified` deny; the overlay renders only navigations that actually
  happened; a denied drive says so (`drive_state` → honest lock naming the
  real required tier) and degrades to chips.

## Registry reconciliation (precondition, also shipped)

10 of the 30 `NAVIGATION_TARGETS` ids predate the v2 surface ids and landed on
the scaffold fallback (`intelligence`, `authoring`, `submissions`, `tasking`,
`submission-gateway`, `safety`, `documents`, `section-workspace`,
`review-readiness`, `biopharma`). Each now aliases to its real surface in
`DEEP_LINK_ALIASES`, and
`client/src/concept2cure/v2/__tests__/navigationReachability.test.ts` is the
permanent gate — written first, shown failing on exactly those 10, then fixed.

## File map

| Layer | File | Role |
|---|---|---|
| Entitlement | `server/services/entitlements/types.ts`, `mdx-entitlements.ts` | `ana_live_drive` key + matrix row (professional) |
| Entitlement | `server/services/entitlements/require-entitlement.ts` | `evaluateOrgEntitlement` extracted for non-middleware callers |
| Server | `server/services/ana-ri/live-drive.ts` | decision, SSE builders, prompt block, audit writer |
| Server | `server/routes/ana-ri/stream.ts` | `live_drive` flag, `drive_state` + `drive_navigation` emission, audit, `liveDrive` tool ctx |
| Server | `server/services/ana/AnaToolExecutor.ts` | `ToolContext.liveDrive`; `navigate_to` instruction tells the model the truth per mode |
| Client | `client/src/concept2cure/v2/liveDrive.ts` | reducer, cap, take-over, registry re-validation |
| Client | `client/src/concept2cure/v2/LiveDriveOverlay.tsx` + `styles/app-v2.css` | the driving strip |
| Client | `client/src/concept2cure/v2/V2App.tsx` | state machine wiring, prefs toggle, overlay mount, owned-surface bridge |
| Client | `client/src/concept2cure/v2/Shell.tsx` | Live Drive toggle in the rail's Control menu + honest lock copy |
| Client | `client/src/concept2cure/components/ana/useAnaChat.ts(.types)` | `live_drive` request flag + drive-event forwarding |
| Client | `client/src/concept2cure/v2/surfaces/ConversationThread.tsx` | drive bridge for the owned conversation surface |
| Tests | `server/services/ana-ri/__tests__/live-drive.test.ts`, `client/.../liveDrive.test.ts`, `client/.../navigationReachability.test.ts` | decision matrix, fail-closed validation, reachability gate |

## Honest gaps (known, deliberate)

- Directive `params` (e.g. `intelligenceTab`) are validated end-to-end but not
  yet applied inside destination surfaces — the client drops them at `nav(id)`
  today, exactly as chip clicks always have. Applying them is a per-surface
  follow-up.
- The non-streaming `POST /api/ana-ri/chat` has no navigation wiring at all
  (pre-existing); Live Drive is a streaming-path capability.
- Owned surfaces other than `ConversationThread` (DocumentAuthoring,
  EctdCoauthor docks…) don't originate drive turns yet; the `liveDrive` bridge
  prop is in place for each to adopt.
- Pre-emptive lock display: the toggle learns it is locked from the first
  attempted turn's `drive_state` rather than from `/api/billing/capabilities`
  up front. The copy is honest either way.
