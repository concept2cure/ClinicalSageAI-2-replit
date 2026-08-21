/**
 * "Choose or create a program" — the one action that fixes an empty panel,
 * reachable from any depth.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * Part 3 of the empty-state contract (see `<EmptyState>` in ./dataConnect.tsx)
 * is the one action that fixes it, and for the great majority of empty panels
 * in this product that action is the same one: every program-scoped record is
 * empty until a program is open, so the cure is to open one — or, on a fresh
 * tenant, to create the first.
 *
 * `openProgramAction` was first written inside `surfaces/cmcShared.tsx`, where
 * it could take the surface's own `nav` prop and was therefore *honestly
 * absent* — it returned `undefined` — whenever a caller had no `nav` to give.
 * That was the right call while the only channel was a prop, and it does not
 * survive contact with the MDX lane, where the component that renders the
 * empty state is `<DataGate>`: a leaf several levels below any surface, holding
 * neither `nav` nor anything it could be threaded through. All 33 MDX panels
 * would have taken the absent branch, which is how that lane ended up shipping
 * "Select a program to load this panel." as prose with nothing to click on it —
 * the exact passive instruction the contract exists to retire, and the finding
 * the MDX UAT recorded on 20 surfaces.
 *
 * So the action moved here and gained a second channel. A DOM event is the
 * idiom this shell already uses to reach the shell from a leaf (`c2c:open-collab`
 * opens the collaboration modal the same way), and `V2App` holds the listener.
 * The prop remains preferred where a caller has one: it is synchronous, it is
 * visible in that component's own dependency list, and it does not depend on a
 * shell being mounted.
 *
 * ── One label, one destination ───────────────────────────────────────────────
 * Both are defined once, here. Mission Control is where a program is opened AND
 * where "New program" creates one (surfaces/MissionControl.tsx), so a single
 * destination genuinely serves both halves of the label — which is why the
 * label can be a single sentence rather than a choice the panel makes on the
 * user's behalf. A second copy of either would let two empty panels disagree
 * about what the same action is called or where it goes.
 */

/** Dispatched when a panel with no `nav` prop asks for the program picker. */
export const OPEN_PROGRAM_EVENT = 'c2c:open-program';

/** The single label for this action across the product. */
export const OPEN_PROGRAM_LABEL = 'Choose or create a program';

/** The single destination: programs are both opened and created there. */
export const OPEN_PROGRAM_SURFACE = 'mission-control';

/**
 * Ask the shell for the program picker. Used by components too deep to hold a
 * `nav` prop. Safe before the shell has mounted its listener and safe with no
 * DOM at all — it does nothing, which is the honest outcome when there is no
 * shell to navigate.
 */
export function openPrograms(): void {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_PROGRAM_EVENT));
  } catch {
    /* No DOM (SSR, or a test environment without jsdom). There is nowhere to
       navigate to in that case, so silence is correct rather than a crash. */
  }
}

/**
 * The canonical empty-state action. Pass straight to `<EmptyState action>`:
 *
 *     <EmptyState
 *       title="No UDI records yet"
 *       hint="UDI records are held per program."
 *       action={openProgramAction(nav)}
 *       regulation="Serves the UDI record (21 CFR 830)"
 *     />
 *
 * `nav` is used when the caller has one and the event carries the call
 * otherwise, so — unlike the earlier CMC-local version — this never returns
 * `undefined`. A panel that cannot reach the shell is a broken shell, not a
 * panel that should quietly drop its only way forward.
 */
export function openProgramAction(
  nav?: (id: string) => void,
): { label: string; onAct: () => void } {
  return {
    label: OPEN_PROGRAM_LABEL,
    onAct: nav ? () => nav(OPEN_PROGRAM_SURFACE) : openPrograms,
  };
}
