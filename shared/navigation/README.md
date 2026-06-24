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

The frontend half already exists: an AnA chat action carrying a `path` flows
through the streamed `executedActions` into the chat client
(`client/src/concept2cure/components/ana/Ana.tsx` → `handleActionClick` →
`onNavigate(action.path)` → ZenApp's navigate handler → `layoutMode`).

## What is deferred ("wire later", pending Claude Design's final routes)

1. **Surface the directive into the stream.** In
   `server/routes/ana-ri/post-processing.ts`, after the response text is ready,
   push navigation directives into the streamed `executedActions` so the chat
   client applies them. Two options (pick when the UI is final):
   - **Tool-driven:** collect `navigate_to` tool results whose
     `status === 'navigation_ready'` and map each `directive` to an action
     `{ label: directive.label, path: directive.path, actionType: 'navigate', ...directive.params }`.
   - **Signal-driven:** call `parseNavigationSignals(fullContent)` and map each
     directive the same way.
2. **Reconcile the registry with the final routes.** Keep `NAVIGATION_TARGETS`
   in lock-step with the final `LayoutMode` / nav constants. `navigation.test.ts`
   guards the contract shape; add a reconciliation check against the UI constants
   once they stabilize.

No app **surfaces** are created here — only the navigation ability + contract.
Surfaces remain owned by Claude Design.
