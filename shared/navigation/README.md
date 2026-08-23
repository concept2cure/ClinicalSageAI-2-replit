# AnA navigation contract

The single source of truth for **where AnA can navigate in the app, and how**.
UI-agnostic: pure data + pure functions, importable by both the server (AnA
tools) and the client (the navigate handler).

## What ships today (contract locked)

- **`NAVIGATION_TARGETS`** — the registry of navigable screens (id, label,
  description, `scope` global/project, group, optional params). Seeded from the
  live navigation model (`client/src/concept2cure/zen-app-constants.ts`
  `LayoutMode` + the ZenApp surface resolver).
- **`resolveNavigation(targetId, params)`** — validates a request and returns a
  `NavigationDirective` (`{ actionType, targetId, label, path, scope, params }`)
  or a typed error. Never emits a jump to an unknown screen.
- **`parseNavigationSignals(text)`** — extracts ` ```ana-navigate ` JSON blocks
  (`{ "target": "...", "params": {…} }`) from AnA's response and resolves them.
- **AnA tools** `list_app_screens` (discovery) and `navigate_to` (validate +
  produce a directive). Both registered and reachable today; `navigate_to`
  returns `{ status: 'navigation_ready', directive }`.

The frontend half is the v2 shell (the old ZenApp/`Ana.tsx` path this README
once described is deleted): a `NavigationAction` chip
(`server/services/ana-ri/navigation-actions.ts`) reaches the client on
`post_done`, and `client/src/concept2cure/v2/Shell.tsx` renders it as a button
whose click calls `onNav(targetId)` → `V2App.nav` →
`locationForSurface(targetId)` → `surfaceIdFromLocation` (which applies
`DEEP_LINK_ALIASES`) → the `SURFACE_VIEWS` entry.

## Both formerly-deferred steps are now wired

1. **Directives surface into the stream — tool-driven only.**
   `server/routes/ana-ri/stream.ts` collects `navigate_to` results whose
   `status === 'navigation_ready'` (via `directiveFromToolResult`) and
   post-processing appends them to `executedActions` as chips; the generic
   chat route (`server/routes/chat/send-message.ts`, the other
   `executeAgenticLoop` caller) collects and returns the same chips in its
   JSON response. The signal-driven option (`parseNavigationSignals`) is
   deliberately NOT wired and must stay unwired: fenced prose arrives from
   retrieved documents and tool output, and steering the screen from prose
   would let any ingested PDF move the operator — see the header of
   `server/services/ana-ri/navigation-actions.ts`. (`POST /api/ana-ri/chat`
   runs no local tools by design, so navigation structurally cannot occur
   there.)
2. **Registry ↔ routes reconciliation.** Registry ids that predate the v2
   surface ids resolve through `DEEP_LINK_ALIASES`
   (`client/src/concept2cure/v2/registryModel.ts`), and
   `client/src/concept2cure/v2/__tests__/navigationReachability.test.ts` fails
   the moment any `NAVIGATION_TARGETS` id stops resolving to a real surface
   view — the lock-step check this section used to defer.

## Live Drive (applied navigation, opt-in)

`server/services/ana-ri/live-drive.ts` + `client/src/concept2cure/v2/liveDrive.ts`:
when the subscriber turns the Live Drive toggle on (AnA rail → Control), each
turn is sent with `live_drive: true`; entitled turns (`ana_live_drive`,
professional tier, `ENTITLEMENTS_ENFORCE` modes) stream `drive_navigation`
events the shell APPLIES as they arrive — AnA drives, the person watches, with
an on-screen strip, per-turn cap shared with the chip budget, client-side
re-validation against this registry, an `agent.ana.screen.navigate` audit row
per applied move, and instant take-over (Esc). Chips remain the default for
everyone else; governed actions keep their confirmation/e-sign gates in every
mode.

No app **surfaces** are created here — only the navigation ability + contract.
Surfaces remain owned by Claude Design.
