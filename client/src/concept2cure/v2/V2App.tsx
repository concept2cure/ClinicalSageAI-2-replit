/**
 * V2App — the ui-v2 shell root (kit app/App.jsx ported onto wouter).
 *
 * Replaces ZenApp's four-surface switch with registry-driven routing: every
 * reconciled registry id is a route segment (/concept2cure/:surfaceId) the
 * shell resolves — deep links work because ids match
 * shared/constants/ui-surface-registry.ts exactly.
 *
 * Kit deltas (all documented in docs/design/UI_V2_INSTALL_LOG.md):
 *  - Nav state lives in the URL (wouter), not component state — kit `nav(id)`
 *    becomes a location change; unknown segments render the honest scaffold.
 *  - The prototype TweaksPanel/edit-mode postMessage tooling is not product
 *    surface and is not ported.
 *  - AnA conversation is LIVE: the shell rail, ⌘K and every surface's onAsk
 *    stream real grounded replies from /api/ana-ri/stream (useAnaChat) — never
 *    a fabricated/sample reply. Governed action *execution* still demonstrates
 *    the §11.50 e-sign gate with a clearly-labelled sample result until
 *    /api/ai-actions wires in.
 */
import React from 'react';
import { useLocation } from 'wouter';
import { getSurface, type UiSurface } from '@shared/constants/ui-surface-registry';
import { AnaRail, CmdK, Rail, TopBar, type AnaMessage } from './Shell';
import { activityPropsFor, hasReportableWork as hasReportableActivity } from './AnaActivity';
import {
  useAnaChat,
  type AnaChatMessage,
  type DriveSseEvent,
  type DriveTurnControls,
} from '../components/ana/useAnaChat';
import {
  driveReducer,
  INITIAL_DRIVE_STATE,
  shouldApplyNavigation,
  shouldApplyAction,
  validateDriveDirective,
  type DriveAction,
  type DriveLock,
} from './liveDrive';
import {
  advertisedScreenActions,
  applySurfaceAction,
  validateDriveAction,
} from './surfaceActions';
import { LiveDriveOverlay } from './LiveDriveOverlay';
import { LiveDriveControlsContext } from './LiveDriveSwitch';
import { resolveSurfaceIdForTarget, stashNavParamsForTarget } from './navParams';
import { createDriveQueue, type DriveMove } from './driveQueue';
import { publishShellProject } from './shellProject';
import type { SentAttachment } from '../hooks/useChatUpload';
import { getAuthHeaders } from '@/utils/authToken';
import { useActiveSurfaceContext, toModuleContext } from './surfaceContext';
import { useAuth } from '@/services/portal/authService';
import { getJwtOrgId } from '@/utils/authToken';
import { useLiveData } from './dataConnect';
import {
  NavEntitlementsProvider,
  isLocked,
  lockShortReason,
  useNavEntitlements,
} from './navEntitlements';
import { NAVIGATION_TARGETS } from '@shared/navigation';
import {
  anaLockReason,
  setAnaLockedScreens,
  type LockedScreen,
} from '../components/ana/anaLockedScreens';
import { welcomeFor } from './onboardingWelcome';
import { SurfaceBoundary } from './SurfaceScaffold';
import { LaunchScopeGate } from './LaunchScopeGate';
import { CollabLayer } from './surfaces/CollabLauncher';
import { SURFACE_VIEWS } from './surfaceViews';
import { Home, KitSurfaceScaffold } from './surfaces/Surfaces';
import { getAction, getSegment, resolveSegmentId,
  effortForMode,
} from './registryModel';
import { locationForSurface, surfaceIdFromLocation } from './routing';
import { OPEN_PROGRAM_EVENT, OPEN_PROGRAM_SURFACE } from './programAction';
import './styles/app-v2.css';
// Shared surface stylesheets — the kit loads these globally (they carry the
// cross-surface primitives: .sp*/.pj-card/.cm-pushbar in journey, and
// .rd-chip/.sc-*/.ub-*/.tl-spec/.cv-* in coverage). Loaded once here so every
// surface has them, matching the kit's index.html global load.
import './styles/journey-v2.css';
import './styles/coverage-v2.css';
/*
 * Six more family sheets that were written, scoped, and imported by NOTHING.
 *
 * `scripts/ci/check-orphaned-stylesheets.mjs` found them: a stylesheet no file
 * imports is never handed to the bundler, so it cannot style anything on any
 * surface. These six carry the layout for surfaces that ship today, and the
 * consequences were visible:
 *
 *   authoring-v2   `.ed{display:grid;grid-template-columns:220px minmax(420px,1fr)}`
 *                  is the DOCUMENT EDITOR's root. `.ed-tree` and `.ed-doc` ship
 *                  from elsewhere, but the container that puts them side by
 *                  side did not — so the tree and the canvas stacked vertically.
 *   research-v2    `.pd-*` / `.pg-*` — ProtocolDev, ResearchAdmin,
 *                  InvestigatorBrochure, MaaCockpit, SmpcLabeling.
 *   misc-surfaces  `.pdev-toast` and 350 more — Vault, RegChange, Evidence,
 *                  AdminSurfaces, CommunicationCenter, DesignControls.
 *   device-v2      `.dv-*` — HumanFactors.
 *   pathway-core / pathway-panels   `.aa-*`, `.ap-*`, `.aud-*`, `.dd-*`.
 *
 * They load here rather than per-surface because each spans several surfaces,
 * which is the same reason journey-v2 and coverage-v2 load here.
 *
 * Safe to import as-is: every one is already wrapped in `.c2c-v2 { … }` via CSS
 * nesting. I first measured them as "96-100% unscoped" and said so — that was
 * wrong, and wrong in the dangerous direction: the check read selectors line by
 * line and never saw the enclosing block, which is exactly the mistake that
 * would have justified rewriting 1,600 rules that needed no rewriting.
 *
 * `editor-core.css` and `editor-panels.css` are still orphaned and are NOT here
 * — they carry no `.c2c-v2` wrapper, so importing them would bleed. They need
 * scoping first.
 */
import './styles/authoring-v2.css';
import './styles/research-v2.css';
import './styles/misc-surfaces-v2.css';
import './styles/device-v2.css';
import './styles/pathway-core-v2.css';
import './styles/pathway-panels-v2.css';
/* LAST, deliberately. `surface-text-ramp.css` re-bases `--text-400` /
   `--text-300` on every element that establishes a tinted surface, so it has to
   load after the sheets that declare those surfaces — a custom property set
   earlier in the cascade would be overwritten by the rule it is correcting.
   This is the v2/ slice — one generated sheet per shell tree, because Vite keeps
   every shell CSS chunk in <head> for the session and a class defined in two
   trees is a page-wide collision (ci:check-shell-css-collisions). It also
   carries the stylesheets outside the three trees (index.css, styles/,
   _shared/, quality/), which v2 owns as the root shell that mounts the others.
   GENERATED: scripts/design/generate-surface-text-ramp.mjs, drift-checked by
   ci:surface-text-ramp. See GA ledger L102. */
import './styles/surface-text-ramp.css';
import { restoreShellProject } from './shellProject';

const PREFS_KEY = 'c2c-v2-prefs';

interface Prefs {
  dark: boolean;
  railCollapsed: boolean;
  anaOpen: boolean;
  anaMode: string;
  segment: string;
  /** Set once the client dismisses (or outgrows) the first-run AnA welcome. */
  welcomeDismissed: boolean;
  /** AnA Live Drive toggle — while on, turns opt in to applied navigation. */
  liveDrive: boolean;
  /**
   * Which Live Drive default this stored pref was written under. Absent on
   * prefs saved while the default was OFF: those carry `liveDrive: false`
   * because every pref write persisted the whole object, not because anyone
   * switched AnA's hands off. See `loadPrefs`.
   */
  liveDriveDefault?: 2;
}

/* Live Drive is ON by default. Asking AnA to take you somewhere, open a
   program or run a demonstration is the consent: she does it, on screen,
   within the same per-turn budgets, with Take over and the toggle always to
   hand. It shipped OFF behind a toggle inside the rail's collapsed "Ask ·
   engine" menu, absent from every screen that owns its conversation, so a
   subscriber who asked AnA to go somewhere got a reply and a screen that never
   moved. Governed work is untouched: the surface-action registry refuses
   sign/approve/submit/lock outright, and those stay a person's signature. */
const DEFAULT_PREFS: Prefs = {
  dark: false,
  railCollapsed: true,
  anaOpen: false,
  anaMode: 'standard',
  segment: 'biopharma',
  welcomeDismissed: false,
  liveDrive: true,
  liveDriveDefault: 2,
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<Prefs>;
      /* BP-W2-1: a pref persisted before the lane merge may carry the retired
         'biotech'/'pharma' segment ids — normalize on read so the stored value
         lands on the merged lane instead of tripping the unknown-id fallback. */
      if (stored.segment) stored.segment = resolveSegmentId(stored.segment);
      /* A pref written under the old OFF default holds `liveDrive: false`
         whether or not the person ever touched the toggle — any pref change
         wrote the whole object — and Take over used to write it too. Neither is
         a decision to keep AnA from acting, so it is re-read under the current
         default once. A switch-off made after this point is kept. */
      if (stored.liveDriveDefault !== 2) {
        stored.liveDrive = true;
        stored.liveDriveDefault = 2;
      }
      return { ...DEFAULT_PREFS, ...stored };
    }
  } catch {
    /* default */
  }
  return DEFAULT_PREFS;
}

/* Adapt one real AnA turn (useAnaChat → /api/ana-ri/stream) into the shell
   rail's AnaMessage shape. Replies are REAL, never stamped sample; while a
   reply streams, the status phase stands in until the first token lands. The
   turn's REAL executedActions (what ANA actually ran) and pendingSignoffs (a
   governed command blocked on a Part 11 e-signature) are carried through so the
   rail renders ANA's genuine action results and the real sign-off prompt —
   never a fabricated result card. */
/* Exported for its own test. Every field below is CARRIAGE — a thing the turn
   reported that the rail can only render if this function hands it over — and
   carriage is exactly what has been missing each time: the tool calls, the
   rounds and the lens were all captured and dropped here, and so were the
   answer's warnings. Deleting a line from this function breaks nothing that
   renders, which is why it needs a test of its own rather than relying on the
   component suites, all of which pass their props in directly. */
export function adaptChatMessage(m: AnaChatMessage): AnaMessage {
  if (m.role === 'user') return { role: 'user', body: m.text };
  return {
    role: 'ana',
    // The body no longer has to carry the waiting state on its own. While a
    // turn streams, AnaActivity below shows the actual work; the body falls
    // back to the phase only until the first token lands, and to nothing at
    // all when the activity record can speak for itself.
    body: m.text || (m.streaming && !hasReportableWork(m) ? m.statusPhase || 'Thinking…' : ''),
    sample: false,
    executedActions: m.executedActions,
    pendingSignoffs: m.pendingSignoffs,
    /* Dropped here until now. On a timeout `useAnaChat` keeps the partial text
       and records 'Response timed out' in `warnings`; with nothing carrying it
       across, a truncated answer read as a finished one. */
    warnings: m.warnings,
    /* Dropped here like the rest: captured by the hook, rendered nowhere. */
    interjections: m.interjections,
    /* The evidence verdict. Captured since the grounding pipeline shipped and
       dropped here like the rest. */
    evidence: m.evidence,
    /* Built by E14, panelled by E14, carried by nobody until now. */
    crlPremortem: m.crlPremortem,
    /* Everything the turn reported about how it was answered — through the
       one mapping every host uses (AnaActivity.activityPropsFor). This used to
       be built here field by field, and again in ConversationThread, and each
       copy dropped something the other carried. */
    activity: activityPropsFor(m),
    /* The draft, for its output card beneath the turn. */
    output: m.generatedDraft?.title ? { generatedDraft: m.generatedDraft, streaming: m.streaming } : undefined,
  };
}

/** True when the activity record has something real to show for this turn. */
function hasReportableWork(m: AnaChatMessage): boolean {
  return hasReportableActivity(activityPropsFor(m));
}

/**
 * The program a project-scoped drive directive carries, when the server
 * resolved one (navigate_to's `program`): `{ id, name?, code? }` with a
 * non-empty string id, or null. It rides beside the registry's directive —
 * program identity is tenant data, not registry state, so re-validation
 * against the registry cannot vouch for it; the surfaces that read the open
 * program validate it by fetching, as they do after any selection.
 */
export function readDirectiveProgram(
  raw: unknown
): { id: string; name?: string; code?: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = (raw as { program?: unknown }).program;
  if (!p || typeof p !== 'object') return null;
  const { id, name, code } = p as { id?: unknown; name?: unknown; code?: unknown };
  const idStr = typeof id === 'number' ? String(id) : typeof id === 'string' ? id.trim() : '';
  if (!idStr) return null;
  return {
    id: idStr,
    ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {}),
    ...(typeof code === 'string' && code.trim() ? { code: code.trim() } : {}),
  };
}

/**
 * Publishes, for AnA, the navigation targets whose screen the server's verdict
 * set locks (launch scope, plan, grants) — sent with every turn so her tools
 * refuse them rather than move the person onto a "not in this release" panel.
 * Rendered inside NavEntitlementsProvider, which V2App itself sits above.
 */
function AnaLockPublisher() {
  const { verdictFor, resolved } = useNavEntitlements();
  React.useEffect(() => {
    if (!resolved) {
      setAnaLockedScreens([]);
      return;
    }
    const out: LockedScreen[] = [];
    for (const t of NAVIGATION_TARGETS) {
      const verdict = verdictFor(resolveSurfaceIdForTarget(t.id));
      if (verdict && isLocked(verdict)) out.push({ id: t.id, reason: lockShortReason(verdict) });
    }
    setAnaLockedScreens(out);
  }, [verdictFor, resolved]);
  return null;
}

/* Rehydrate the open program BEFORE any surface renders. The selection is a
   window global set by Projects/MdxSurfaceHost via publishShellProject and
   mirrored per-tab; without this, a reload or a deep link straight to
   /concept2cure/cmc (or /vault, /ectd-compile) dropped every project-scoped
   surface to "Open a program" until the user detoured through Projects.
   Module scope deliberately: it must run when the shell bundle evaluates,
   ahead of the first render of any reader. A live selection always wins. */
restoreShellProject();

/* The shell's grounding for ANA: the project currently in context (set on the
   window by the projects surface, the same source the CMC/board surfaces read).
   Passing it to useAnaChat lets ANA see the open program on every surface's
   chat instead of answering blind. */
function readShellProjectId(): string | undefined {
  try {
    const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
    return p && p.id != null ? String(p.id) : undefined;
  } catch {
    return undefined;
  }
}

export function V2App() {
  const [location, setLocation] = useLocation();
  const [prefs, setPrefs] = React.useState<Prefs>(loadPrefs);
  const [cmdkOpen, setCmdkOpen] = React.useState(false);

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) =>
    setPrefs((p) => {
      const next = { ...p, [k]: v };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* session-only */
      }
      return next;
    });

  const activeId = surfaceIdFromLocation(location);
  /* Demonstration mode — 'demo' while a started demonstration is live. It
     rides every opted-in turn (so a question asked mid-demo and the resumed
     stops keep the demo budgets), and drops on take-over, toggle-off, or
     starting a plain tour. Never persisted: a demonstration is a session
     event, not a preference. */
  const [driveMode, setDriveMode] = React.useState<'assist' | 'demo'>('assist');
  /* Bumped when AnA navigates to the screen already showing with new params
     (a tab, a section, a program): part of the surface's React key, so the
     screen remounts and reads them now instead of on the next visit. */
  const [remountEpoch, setRemountEpoch] = React.useState(0);
  const prefsRef = React.useRef(prefs);
  prefsRef.current = prefs;

  /* ── AnA Live Drive — the shell's apply/take-over state machine ──────────
     The reducer (v2/liveDrive.ts) is pure; the ref is folded through the SAME
     reducer on dispatch so back-to-back events in one SSE chunk see the cap
     and take-over immediately, without waiting for React's commit. */
  const [drive, reactDispatchDrive] = React.useReducer(driveReducer, INITIAL_DRIVE_STATE);
  const driveRef = React.useRef(INITIAL_DRIVE_STATE);
  const dispatchDrive = React.useCallback((action: DriveAction) => {
    driveRef.current = driveReducer(driveRef.current, action);
    reactDispatchDrive(action);
  }, []);
  /* Moved above useAnaChat because onDriveEvent below needs it. The single
     client navigation entry — Live Drive goes through the same door a chip
     click does, never a second router. */
  const nav = React.useCallback(
    (id: string) => {
      setLocation(locationForSurface(id));
    },
    [setLocation]
  );
  /* True from a drive_state{enabled} until the person takes over — read by the
     follow-the-work effect below, which fires AFTER turn_end has already
     released the reducer's `active` (drafts persist post-`done`). */
  const droveThisTurnRef = React.useRef(false);
  /* The chat whose turn is driving — its Stop and steer are the ones the drive
     strip must reach, and it is where an on-screen outcome AnA needs to hear
     about (an operation the screen refused) is sent mid-turn. The shell's own
     chat is only one of the chats that can drive. */
  const driveControlsRef = React.useRef<DriveTurnControls | null>(null);
  /* Counts driving turns, so a turn's late release cannot end a newer one. */
  const driveTurnRef = React.useRef(0);
  /* Read by the move queue between renders: which screen is showing now. */
  const activeIdRef = React.useRef(activeId);
  activeIdRef.current = activeId;
  /* Tell AnA, mid-turn, that a move she made did not land — so she corrects
     course instead of narrating a screen that did not change. Rides the
     run-control interject (an operator turn the server splices into her next
     round); a turn that has already finished has no next round, and the
     overlay and transcript still show the failure. */
  const reportMoveFailure = React.useCallback((move: DriveMove, reason: string) => {
    const what =
      move.kind === 'navigate'
        ? `Opening the ${move.directive.label} screen`
        : `"${move.directive.label}" on the ${move.directive.surfaceId} screen`;
    const controls = driveControlsRef.current;
    if (!controls) return;
    void controls
      .interject(
        `[Screen report] ${what} did not happen: ${reason} ` +
          'Tell the person plainly, then choose another way to finish the task.'
      )
      .catch(() => undefined);
  }, []);
  /* AnA's moves reach the screen through ONE serial queue: each navigation
     waits for its screen, each operation for its outcome, before the next
     begins (see driveQueue.ts for what applying on arrival used to do). */
  const driveQueueRef = React.useRef<ReturnType<typeof createDriveQueue> | null>(null);
  if (!driveQueueRef.current) {
    driveQueueRef.current = createDriveQueue({
      navigate: (directive) => {
        /* A directive that names a program opens it first, through the same
           channel the portfolio's own "open" uses — so "take me to the
           Vault for BX-301" lands on BX-301's vault, not on an empty
           "open a program" state. */
        const program = (directive as { program?: { id: string; name?: string; code?: string } })
          .program;
        if (program && program.id) {
          publishShellProject({
            id: program.id,
            ...(program.name ? { title: program.name } : {}),
            ...(program.code ? { code: program.code } : {}),
          });
        }
        /* Registry-validated params ride the navParams channel so the
           destination opens on the exact tab/section AnA named — and a
           param-less drive clears any stale entry rather than inheriting it.
           Navigating to the screen already showing, with params, remounts it
           so the params are applied now rather than on the next visit. */
        stashNavParamsForTarget(directive.targetId, directive.params);
        const target = resolveSurfaceIdForTarget(directive.targetId);
        if (target === activeIdRef.current) {
          if ((directive.params && Object.keys(directive.params).length > 0) || program) {
            setRemountEpoch((n) => n + 1);
          }
          return;
        }
        nav(directive.targetId);
      },
      isShowing: (directive) =>
        resolveSurfaceIdForTarget(directive.targetId) === activeIdRef.current,
      perform: (directive, onDeferred) => applySurfaceAction(directive, nav, onDeferred),
      canApply: () => !driveRef.current.takenOver,
      refuse: (move) => {
        const target = move.kind === 'navigate' ? move.directive.targetId : move.directive.surfaceId;
        const reason = anaLockReason(target);
        return reason ? `That screen is ${reason} for this workspace.` : null;
      },
      onApplied: (move, detail) => {
        if (move.kind === 'act') {
          dispatchDrive({
            kind: 'action',
            actionId: move.directive.actionId,
            label: detail || move.directive.label,
            round: move.round,
          });
        }
      },
      onFailed: (move, reason) => {
        dispatchDrive({
          kind: 'move_failed',
          targetId: move.kind === 'act' ? move.directive.actionId : move.directive.targetId,
          label: move.directive.label,
          reason,
        });
        reportMoveFailure(move, reason);
      },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    });
  }
  const onDriveEvent = React.useCallback(
    (ev: DriveSseEvent, controls?: DriveTurnControls) => {
      if (controls) driveControlsRef.current = controls;
      if (ev.type === 'drive_turn_end') {
        /* Release the drive only once every move the turn made has landed —
           the stream ends before the queue does. And only if no newer turn
           has started meanwhile: a late release would switch off the drive
           the person's next message just engaged. */
        const turn = driveTurnRef.current;
        const queue = driveQueueRef.current;
        void (queue ? queue.whenIdle() : Promise.resolve()).then(() => {
          if (driveTurnRef.current === turn) dispatchDrive({ kind: 'turn_end' });
        });
        return;
      }
      if (ev.type === 'drive_state') {
        if (ev.enabled) driveTurnRef.current += 1;
        droveThisTurnRef.current = ev.enabled;
        dispatchDrive({
          kind: 'drive_state',
          enabled: ev.enabled,
          mode: ev.mode === 'demo' ? 'demo' : 'assist',
          reason: ev.reason,
          requiredTier: ev.requiredTier,
        });
        /* A demonstration asked for in plain words is promoted to demo mode by
           the server mid-turn; keep it for the follow-up turns ("continue",
           a question asked mid-demo) so they carry the demo budgets too. */
        if (ev.enabled && ev.mode === 'demo') setDriveMode('demo');
        return;
      }
      if (ev.type === 'drive_action') {
        /* drive_action: the screen only ever DOES what the shared
           surface-action registry itself resolves (fail closed), only while
           the drive is genuinely live, only under the mode's action budget —
           and only through a handler the mounted surface registered (the bus
           refuses a screen that does not implement the operation). The step is
           recorded when the screen reports it done, never before. */
        const actionDirective = validateDriveAction(ev.directive);
        if (!actionDirective || !shouldApplyAction(driveRef.current)) return;
        driveQueueRef.current?.push({ kind: 'act', directive: actionDirective, round: ev.round });
        return;
      }
      /* drive_navigation: the screen moves ONLY to what the shared registry
         itself resolves (fail closed), only while the drive is genuinely live
         (per-turn consent, take-over kills it instantly), and only under the
         per-turn cap. */
      const directive = validateDriveDirective(ev.directive);
      if (!directive || !shouldApplyNavigation(driveRef.current)) return;
      dispatchDrive({ kind: 'navigation', directive, round: ev.round });
      /* The program the server resolved for a project-scoped target travels
         beside the registry's directive (it is data, not registry state). */
      const program = readDirectiveProgram(ev.directive);
      driveQueueRef.current?.push({
        kind: 'navigate',
        directive: program ? { ...directive, program } : directive,
        round: ev.round,
      } as DriveMove);
    },
    [dispatchDrive]
  );
  /* Which chat is driving. The shell's own chat is the one the rail shows, so
     when ITS drive carries the person off a screen that draws its own
     conversation (the thread) onto one that does not, the rail opens — AnA
     keeps narrating where the person can see it. A dock's chat (the editor's,
     the eCTD co-author's) is not the rail's, so its drive never opens it. */
  const onShellDriveEvent = React.useCallback(
    (ev: DriveSseEvent, controls?: DriveTurnControls) => {
      if (ev.type === 'drive_navigation' || ev.type === 'drive_action') {
        const leaving = SURFACE_VIEWS[activeIdRef.current]?.ownsConversation;
        if (leaving && !prefsRef.current.anaOpen) set('anaOpen', true);
      }
      onDriveEvent(ev, controls);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onDriveEvent]
  );
  const onSurfaceDriveEvent = onDriveEvent;
  /* ── Follow the work (declared before useAnaChat, which takes it) ─────
     The point of Live Drive is WATCHING AnA work — and her biggest work
     product is a persisted draft (`artifact_version_saved` → onArtifactSaved,
     fired by EVERY chat instance: the rail's and each owned dock's via the
     bridge). When a driven turn lands one, take the subscriber to the
     Artifacts Center with that artifact focused, so the document appears in
     front of them instead of behind a nav item. */
  const followedArtifactsRef = React.useRef<Set<string>>(new Set());
  const followWork = React.useCallback(
    (artifactId: string) => {
      /* Both gates on purpose: the toggle must still be ON (a turn-old ref
         must not outlive the person switching drive off) AND this turn must
         have genuinely driven (an un-entitled or undriven turn never moves
         the screen, drafts included). Deduped per artifact so a re-render or
         duplicate event can never re-hijack the screen. */
      if (!artifactId || !prefs.liveDrive || !droveThisTurnRef.current) return;
      if (followedArtifactsRef.current.has(artifactId)) return;
      followedArtifactsRef.current.add(artifactId);
      stashNavParamsForTarget('artifacts-center', { artifactId });
      nav('artifacts-center');
    },
    [nav, prefs.liveDrive]
  );
  /* The real AnA assistant for the whole shell — one streaming conversation
     (/api/ana-ri/stream) shared by the rail, ⌘K and every surface's onAsk. */
  /* What the active surface is showing, forwarded to AnA as `module_context` on
     every turn. `screenName` alone told her WHICH screen the user was on and
     nothing about what was on it, so a question like "what should I do next?"
     had to be answered from the message text. A surface publishes through
     `usePublishSurfaceContext`; the reader returns null unless the published
     context belongs to the surface currently mounted, so context from the
     previous screen can never be presented as this one's. */
  const activeSurfaceContext = useActiveSurfaceContext(activeId);
  const anaModuleContext = React.useMemo(() => {
    const base = toModuleContext(activeSurfaceContext);
    /* The active screen's OPERABLE vocabulary, from the shared surface-action
       registry (aliases applied) — folded into every turn so AnA can
       act_on_screen without a list_screen_actions round-trip. Static truth of
       what is wireable here; the bus still refuses anything the mounted
       surface has not actually registered. */
    const screenActions = advertisedScreenActions(activeId);
    if (screenActions.length === 0) return base;
    return { ...(base ?? { surface: activeId }), screen_actions: screenActions };
  }, [activeSurfaceContext, activeId]);
  const anaChat = useAnaChat({
    screenName: activeId,
    projectId: readShellProjectId(),
    moduleContext: anaModuleContext,
    driveMode,
    /* The composer's mode picker, finally connected.
       `prefs.anaMode` was stored and rendered beside the send button — "Ask ·
       Maximum" — and never reached the request. `effort_level` decides how many
       agentic rounds AnA gets (fast 4, balanced 6+2, thorough 10+4), her output
       budget and her model tier, and the server defaults to `balanced` when it
       is absent. So Deep research quietly bought 8 rounds instead of 14, and
       Quick ask cost twice what it promised. Only Standard was right, and only
       by coincidence. */
    effortLevel: effortForMode(prefs.anaMode),
    /* Live Drive: while the toggle is on every rail/⌘K turn opts in, and the
       turn's drive events feed the shell's apply/take-over machine above. */
    liveDrive: prefs.liveDrive,
    onDriveEvent: onShellDriveEvent,
    onArtifactSaved: followWork,
  });
  /* A turn ending releases the drive — reported by whichever chat was driving
     (`drive_turn_end`, see onDriveEvent), after its queued moves have landed.
     This used to watch only the SHELL chat's streaming flag, so a drive from
     any other chat left "AnA is driving" on screen with dead controls. */
  /* Pre-emptive Live Drive verdict — the toggle shows its honest lock (with
     the real required tier) before the first attempted turn. Advisory only:
     the same resolveDriveState answers per turn and overwrites this. A failed
     read changes nothing — unknown is neither locked nor entitled. */
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/ana-ri/live-drive/state', {
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          success?: boolean;
          data?: { enabled?: boolean; reason?: string; requiredTier?: string | null };
        };
        const d = body?.data;
        if (cancelled || !body?.success || !d || typeof d.enabled !== 'boolean') return;
        const lock: DriveLock | null = d.enabled
          ? null
          : { reason: d.reason ?? 'not_enabled', requiredTier: d.requiredTier ?? null };
        dispatchDrive({ kind: 'lock_info', lock });
      } catch {
        /* verdict unknown — leave the toggle unannotated, never fabricate */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatchDrive]);
  /* Take over = this is the person's screen again, now: stop applying for the
     rest of THIS turn and end any live demonstration. AnA keeps answering.

     It used to switch the toggle off as well, and persist that — so one press
     of Escape during a drive (closing a dialog, say) left AnA unable to move
     the screen in every later session, with the only way back inside a
     collapsed menu. Taking the wheel for a turn is not a decision about the
     next one; the toggle is where that decision lives. */
  const takeOverDrive = () => {
    droveThisTurnRef.current = false;
    driveQueueRef.current?.clear();
    dispatchDrive({ kind: 'take_over' });
    setDriveMode('assist');
  };
  /* ── One-click drive asks: the guided tour + the demonstrations ────────
     The ask is sent with its drive settings stated on the call itself
     (`sendOpts`), so it can never go out with the previous render's toggle or
     mode — the stale-closure trap that sent demonstrations as ordinary turns.
     A click while AnA is mid-answer stops that answer and starts this one; it
     used to be dropped without a word. */
  const TOUR_ASK =
    'Show me around this workspace. Take me through the screens that matter most for my work — navigate to each one and briefly explain what I can do there as you go.';
  const pendingDriveAskRef = React.useRef<{ ask: string; mode: 'assist' | 'demo' } | null>(null);
  const queueDriveAsk = (ask: string, mode: 'assist' | 'demo') => {
    /* The person follows the drive in the rail wherever the screen draws one;
       a screen that owns its conversation shows the same shell chat itself. */
    if (!ownsConversation && !prefs.anaOpen) set('anaOpen', true);
    setDriveMode(mode);
    if (!prefs.liveDrive) set('liveDrive', true);
    if (anaChat.isStreaming) {
      pendingDriveAskRef.current = { ask, mode };
      void anaChat.stop();
      return;
    }
    void anaChat.send(ask, undefined, { liveDrive: true, driveMode: mode });
  };
  React.useEffect(() => {
    const pending = pendingDriveAskRef.current;
    if (!pending || anaChat.isStreaming) return;
    pendingDriveAskRef.current = null;
    void anaChat.send(pending.ask, undefined, { liveDrive: true, driveMode: pending.mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anaChat.isStreaming]);
  const startTour = () => queueDriveAsk(TOUR_ASK, 'assist');
  /* Start a curated demonstration (training or sales — the Control menu lists
     them from the shared script registry). The ask names the script id so AnA
     fetches exactly that plan with start_product_demo, and asks for the whole
     tour in one go: a turn ends when AnA stops calling tools, so "check in with
     me as you go" ended demonstrations after their first stop. The person can
     interject from the drive strip at any point without stopping her. */
  const startDemo = (demoId: string, title: string) =>
    queueDriveAsk(
      `Run the "${title}" demonstration for me now (demo script id: ${demoId}). ` +
        `Fetch it with start_product_demo and drive it stop by stop, all the way through, ` +
        `at a brisk pace — narrate each stop briefly as you make it.`,
      'demo'
    );
  const startDemoRef = React.useRef(startDemo);
  startDemoRef.current = startDemo;
  const startTourRef = React.useRef(startTour);
  startTourRef.current = startTour;
  /* The Live Drive switch, wherever it is drawn (the rail's menu, a composer
     on a screen without a rail). Switching off ends the current drive now. */
  const setLiveDriveOn = React.useCallback(
    (v: boolean) => {
      set('liveDrive', v);
      if (!v) {
        driveQueueRef.current?.clear();
        dispatchDrive({ kind: 'take_over' });
        setDriveMode('assist');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatchDrive]
  );
  const lastMsg = anaChat.messages[anaChat.messages.length - 1];
  /* What AnA is doing right now, for the drive strip — only ever a label the
     stream genuinely reported (the running tool's label, else the phase). */
  const driveActivity =
    lastMsg?.role === 'assistant' && lastMsg.streaming
      ? (lastMsg.toolCalls?.filter((t) => t.status === 'running').slice(-1)[0]?.label ??
        lastMsg.statusPhase)
      : undefined;
  /* The narration tail for the drive strip — the REAL streamed text, bounded.
     Shown only on surfaces that own the conversation (the rail is hidden
     there, so without this a demo stop on e.g. document-authoring would play
     out in silence: AnA narrating into a column the screen does not draw). */
  const driveNarration =
    lastMsg?.role === 'assistant' && lastMsg.streaming && lastMsg.text
      ? lastMsg.text.length > 180
        ? `…${lastMsg.text.slice(-180).replace(/^\S*\s/, '')}`
        : lastMsg.text
      : undefined;
  /* The bridge for surfaces that run their own conversation (see
     SurfaceViewProps.liveDrive) — same toggle, same reducer, one machine. */
  /* The same controls, for the switch drawn beside each composer. */
  const liveDriveControls = React.useMemo(
    () => ({
      on: prefs.liveDrive,
      locked: drive.lock,
      setOn: setLiveDriveOn,
      onStartDemo: (demoId: string, title: string) => startDemoRef.current(demoId, title),
      onStartTour: () => startTourRef.current(),
    }),
    [prefs.liveDrive, drive.lock, setLiveDriveOn]
  );
  const liveDriveBridge = React.useMemo(
    () => ({
      on: prefs.liveDrive,
      onDriveEvent: onSurfaceDriveEvent,
      onWorkSaved: followWork,
      setOn: setLiveDriveOn,
      onStartDemo: (demoId: string, title: string) => startDemoRef.current(demoId, title),
      onStartTour: () => startTourRef.current(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs.liveDrive, onSurfaceDriveEvent, followWork, setLiveDriveOn]
  );
  const { user } = useAuth();
  /* The onboarding welcome must reflect the TENANT's real client type
     (organizations.client_type), not `prefs.segment` — that is a browser-local
     view toggle defaulting to 'biotech', so a device/diagnostics/CRO client
     would otherwise be greeted with biotech prompts, and a user switching
     tenants would inherit the previous tenant's stored segment. */
  const jwtOrgId = getJwtOrgId();
  /* useLiveData rather than useLive: this read never wanted a fixture (it
     passed null and treated .sample as "did it fail"), and the fixture-backed
     helper is being retired — see ledger L68. */
  const orgLive = useLiveData<{ organization?: { clientType?: string } }>(
    jwtOrgId ? `/api/organizations/${encodeURIComponent(jwtOrgId)}` : null,
    [jwtOrgId]
  );
  const tenantClientType = orgLive.data?.organization?.clientType ?? null;
  const selectSegment = (id: string) => {
    set('segment', id);
    nav('home');
  };

  const view = SURFACE_VIEWS[activeId];
  /* True when the SURFACE has taken the rail's column and answers questions
     itself (or deliberately offers none) — see surfaceViews.ts. The shell must
     not render a rail here, and must not write to one either. */
  const ownsConversation = Boolean(view?.ownsConversation);
  const isFull = Boolean(view?.full);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      }
      /* ⌘\ toggles the rail — but `set` PERSISTS, and on a surface that owns
         the conversation there is no rail to toggle. Un-guarded, this wrote
         anaOpen:true to localStorage from a screen that shows nothing happening
         and opened the rail on the next surface that draws one. Same leak as
         `ask()` below, through a different door. */
      if (mod && e.key === '\\' && !ownsConversation) {
        e.preventDefault();
        set('anaOpen', !prefs.anaOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefs.anaOpen, ownsConversation]);

  /* "Choose or create a program", from anywhere.

     Almost every panel in the product is scoped to a program, so an empty one
     usually has a single cure: open a program, or create the first. Surfaces
     that hold `nav` call it directly (`openProgramAction(nav)`); this listener
     serves the ones that cannot. `<DataGate>` renders the empty state for all
     33 MDX panels and is a leaf with no `nav` and nothing to thread one
     through — without this, its CTA would have no destination and the lane
     would keep shipping the instruction-with-no-button the contract retires.

     Same idiom as `c2c:open-collab`, and the destination is single-sourced
     from ./programAction.ts so a panel and the shell cannot disagree about
     where the action goes. */
  React.useEffect(() => {
    const onOpenProgram = () => nav(OPEN_PROGRAM_SURFACE);
    window.addEventListener(OPEN_PROGRAM_EVENT, onOpenProgram);
    return () => window.removeEventListener(OPEN_PROGRAM_EVENT, onOpenProgram);
  }, [nav]);

  const surface: UiSurface | undefined = activeId === 'home' ? undefined : getSurface(activeId);
  const ctxSurface: UiSurface =
    surface ??
    ({
      id: 'home',
      label: 'Home',
      navTier: 'global',
      layoutMode: 'projects',
      group: 'workspace',
      icon: 'home',
      uiKit: 'home',
      apiPrefixes: ['/api/projects'],
      anaToolFamilies: [],
      sharedContract: null,
      discoveryCatalog: null,
      readiness: 'routes-ready',
      compliance: ['accessibility-enforcement', 'microcopy-tone'],
      notes: 'Home opens with the segment pathway chips and the composer. Ports in the surface phase.',
    } as UiSurface);

  /* Hand a question to the surface that owns the shell's conversation.
     `window.C2C_CONVO = { id:'new', seed }` then navigate: the protocol
     ConversationThread implements (ConversationThread.tsx:300) and that Home
     (Surfaces.tsx:76) and ProjectHome (ProjectHome.tsx:576) already use.

     `convoEpoch` exists because `setLocation` to the location you are already
     on is a no-op in wouter, and ConversationThread reads the seed ON MOUNT. On
     that one surface, seeding without a remount would leave the question parked
     on `window` to be consumed the next time the thread mounted — reintroducing
     the very ambush this change removes. The epoch is part of the surface's
     React key, so the seed is always read by a mount that happens now. */
  const [convoEpoch, setConvoEpoch] = React.useState(0);
  const startShellConversation = React.useCallback(
    (seed: string, seedFiles?: SentAttachment[]) => {
      try {
        (
          window as unknown as { C2C_CONVO?: { id: string; seed?: string | null; seedFiles?: SentAttachment[] } }
        ).C2C_CONVO = {
          id: 'new',
          seed,
          seedFiles,
        };
      } catch {
        /* non-fatal: the thread opens empty rather than seeded */
      }
      setConvoEpoch((n) => n + 1);
      nav('conversation-thread');
    },
    [nav]
  );

  /* AnA ask — routes to the REAL streaming assistant (/api/ana-ri/stream via
     useAnaChat). The [Agent] prefix (rail agent toggle) is a task hint the
     server's agentic tool loop handles, so we strip it and stream a grounded
     reply. Governed action execution stays reachable via the action chips
     (onAct → §11.50 e-sign). No fabricated/sample reply is ever shown.

     THE GUARD. Surfaces that own the conversation no longer receive this
     function at all (the SurfaceView union removes `onAsk` from their props),
     but ⌘K and its action chips are shell-level and reach every surface. On a
     screen with no rail this used to `set('anaOpen', true)` — which persists to
     localStorage — and stream the answer into a column that screen never draws:
     nothing visible here, and your question waiting for you, opened, on the
     next surface that does draw one. The question goes to the surface that
     shows it instead. */
  const ask = (text: string, files?: SentAttachment[]) => {
    const clean = text.replace(/^\[Agent\]\s*/i, '').trim();
    if (!clean) return;
    if (ownsConversation) {
      startShellConversation(clean, files);
      return;
    }
    if (!prefs.anaOpen) set('anaOpen', true);
    void anaChat.send(clean, files);
  };

  /* Governed + ungoverned actions both execute through ANA, the real agentic
     executor. Tapping an action chip sends its intent to /api/ana-ri/stream;
     ANA runs it (execute_platform_command / the AI-action dispatcher) with the
     shell's grounded project context and streams the REAL result. A governed
     action comes back as a Part 11 sign-off prompt (rendered inline by the rail
     via the real GovernedActionSignoff), never a fabricated result card. */
  const onAct = (id: string) => {
    const a = getAction(id);
    ask(a?.label ?? id.replace(/_/g, ' '));
  };

  /* The surface's mount identity. Only `conversation-thread` varies within one
     id — see `startShellConversation` above. */
  const bodyKey =
    (activeId === 'conversation-thread' ? `${activeId}#${convoEpoch}` : activeId) +
    (remountEpoch > 0 ? `~${remountEpoch}` : '');

  let body: React.ReactNode;
  if (activeId === 'home') {
    body = <Home onNav={nav} onAsk={ask} segment={prefs.segment} />;
  } else if (view?.ownsConversation) {
    /* Narrowed by the union: this component's props do not include `onAsk`, so
       there is no way to hand it a rail that is not being rendered. */
    const V = view.component;
    body = (
      <V
        key={bodyKey}
        surface={ctxSurface}
        onNav={nav}
        segment={prefs.segment}
        liveDrive={liveDriveBridge}
        shellChat={anaChat}
      />
    );
  } else if (view) {
    const V = view.component;
    body = <V key={bodyKey} surface={ctxSurface} onAsk={ask} onNav={nav} segment={prefs.segment} />;
  } else {
    body = <KitSurfaceScaffold surface={ctxSurface} onAsk={ask} />;
  }

  /* The rail shows the real AnA conversation — including the actions ANA
     actually executed and any governed action awaiting a Part 11 sign-off. */
  const railMessages = anaChat.messages.map(adaptChatMessage);

  /* First-run AnA welcome (task #13 P1, assist-only): a client-type-aware
     greeting the new client sees before the conversation starts. Shown while
     the AnA conversation is still empty and the client hasn't dismissed it —
     it naturally gives way the moment they send their first message. Scripted
     copy, LIVE responses (the starters call the real /api/ana-ri/stream). */
  const firstName = (user?.firstName || user?.displayName || '').trim().split(/\s+/)[0] || '';
  const welcome =
    railMessages.length === 0 && !prefs.welcomeDismissed
      ? welcomeFor(tenantClientType ?? prefs.segment, firstName)
      : null;

  /* Escape closes the phone-width rail overlay. Gated on the SAME media query
     the overlay css uses, so a desktop Escape never collapses the persistent
     rail — the overlay is the only rail state Escape should dismiss. */
  /* The shell's own dark marker cannot reach <body>, which sits ABOVE it, so
     `body { background: var(--bg-000) }` resolved in a scope where the dark
     palette was never in view. index.css had frozen that further, pointing the
     rule at two literal :root tokens (--color-bg #faf9f5, --color-text-primary
     #141413) used nowhere else — light in both themes by construction.
     Today .c2c-v2 paints the viewport so nothing shows, but the light band is
     there on overscroll, behind a shell shorter than the viewport, and in any
     print or screenshot path that captures the body.
     Marking BODY, not <html>: the shell already makes every descendant dark, so
     this adds only body itself and anything portalled to it — which is the part
     that was wrong. Putting it on <html> would instead make :root dark and
     change what every alias in the palette resolves to. */
  React.useEffect(() => {
    const body = document.body;
    if (!prefs.dark) return undefined;
    body.classList.add('dark');
    body.setAttribute('data-theme', 'dark');
    return () => {
      body.classList.remove('dark');
      body.removeAttribute('data-theme');
    };
  }, [prefs.dark]);

  React.useEffect(() => {
    // The two narrow-width overlays — the rail drawer (≤640px) and the AnA
    // drawer (≤900px) — are the only states Escape should dismiss. The AnA drawer only exists when the
    // surface does not own the conversation (otherwise there is no rail).
    const anaDrawer = prefs.anaOpen && !ownsConversation;
    if (prefs.railCollapsed && !anaDrawer) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const phone = window.matchMedia('(max-width: 640px)').matches;
      const tablet = window.matchMedia('(max-width: 900px)').matches;
      if (phone && !prefs.railCollapsed) set('railCollapsed', true);
      else if (tablet && anaDrawer) set('anaOpen', false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.railCollapsed, prefs.anaOpen, ownsConversation]);

  return (
    /* Licence verdicts are fetched once, above the rail, so the rail and the
       panel that explains a locked destination read the same answer. The
       provider renders no DOM of its own, so the shell's grid is untouched. */
    <NavEntitlementsProvider>
    <LiveDriveControlsContext.Provider value={liveDriveControls}>
    <AnaLockPublisher />
    <div
      className={`c2c-v2 shell${prefs.dark ? ' dark' : ''}`}
      /* Both dark selectors, because the app's own stylesheets key off both and
         this element used to carry only the class. colors_and_type.css declares
         its dark block as `.dark, [data-theme="dark"]`, so the class alone was
         enough for the canonical tokens — but the GENERATED surface-text-ramp
         sheets emit their dark re-base as `[data-theme="dark"] :is(…)` only, and
         nothing in client/ ever set that attribute. The ramp's light re-base
         therefore stayed applied in dark mode, leaving light-mode grey text on
         dark tinted surfaces: measured in Chromium at 1.90:1 and 1.66:1 against
         the 4.5:1 floor, where the dark values give 4.57 and 5.24. Setting the
         attribute here fixes it at the source, rather than teaching every
         generated sheet a second selector (which would also make `.dark` a
         cross-shell class collision — ci:check-shell-css-collisions). */
      data-theme={prefs.dark ? 'dark' : undefined}
      data-collapsed={prefs.railCollapsed}
      data-ana-open={ownsConversation ? false : prefs.anaOpen}
      /* The DOM attribute keeps its name: `.shell[data-editor="true"]` is what
         app-v2.css:846 and authoring-v2.css:13 key the zero-width rail column
         off, and those stylesheets are outside this change. */
      data-editor={ownsConversation || undefined}
    >
      <Rail
        activeId={activeId}
        onNav={nav}
        collapsed={prefs.railCollapsed}
        setCollapsed={(v) => set('railCollapsed', v)}
        segment={prefs.segment}
        setSegment={selectSegment}
      />
      {/* Phone-width scrim: at <=640px the EXPANDED rail paints over the
          content (app-v2.css keeps the grid at the collapsed strip), and this
          scrim sits between them — tap collapses the rail; Escape is handled
          by the shell-level listener below, which is also gated to phone
          width. Display is entirely CSS-gated (.rail-scrim), so wider
          viewports render nothing and desktop behavior is untouched. */}
      {!prefs.railCollapsed && (
        <div aria-hidden="true" className="rail-scrim" onClick={() => set('railCollapsed', true)} />
      )}
      {/* The AnA drawer's scrim (≤900px only — display is CSS-gated on
          data-ana-open inside the 900px query, exactly like .rail-scrim). */}
      {!ownsConversation && prefs.anaOpen && (
        <div aria-hidden="true" className="ana-scrim" onClick={() => set('anaOpen', false)} />
      )}
      <main className="main">
        <TopBar
          surface={activeId === 'home' ? { id: 'home', label: 'Home', navTier: 'global' } : ctxSurface}
          onPalette={() => setCmdkOpen(true)}
          segment={prefs.segment}
          onSegment={(id) => {
            set('segment', id);
            const s = getSegment(id);
            if (s?.defaultSurface) nav(s.defaultSurface);
          }}
          onNav={nav}
          onAsk={ask}
        />
        <div className={isFull ? 'page page-full' : 'page'}>
          <SurfaceBoundary resetKey={bodyKey}>
            {/* A deep link to a surface outside the launch scope renders the
                honest panel, from the same verdict the rail and catalog read. */}
            <LaunchScopeGate surfaceId={activeId} surface={ctxSurface}>
              {body}
            </LaunchScopeGate>
          </SurfaceBoundary>
        </div>
      </main>
      {!ownsConversation && (
        <AnaRail
          open={prefs.anaOpen}
          setOpen={(v) => set('anaOpen', v)}
          surface={ctxSurface}
          segment={prefs.segment}
          mode={prefs.anaMode}
          setMode={(m) => set('anaMode', m)}
          messages={railMessages}
          onSend={ask}
          onAct={onAct}
          welcome={welcome}
          onDismissWelcome={() => set('welcomeDismissed', true)}
          /* "New thread" — was an inert button. Aborts any run, clears the rail
             transcript and starts a fresh server thread; the prior thread stays
             in history (conversation-thread surface), so this is non-destructive. */
          onNewThread={anaChat.reset}
          onNav={nav}
          // Scopes composer uploads to the active project, so extracted text
          // lands in that project's memory — the same id useAnaChat uses.
          projectId={readShellProjectId()}
          /* Mid-run control, finally reachable. The hook has exposed these
             since run control shipped and the rail wired none of them, so a
             human could watch AnA work a question the wrong way and had no way
             to say so until she finished. */
          streaming={anaChat.isStreaming}
          runStatus={anaChat.runStatus}
          /* Pause, resume and steer are offered only once a controllable run
             exists — runStatus stays null until `run_started` arrives, and a
             turn that opened no run row (no resolvable tenant) never sends one.
             Rendering them regardless would put buttons on screen that quietly
             do nothing, which is the failure this strip was added to end.
             Stop is unconditional: it aborts the client's own request, which
             works whether or not the server opened a run. */
          onPause={anaChat.runStatus ? () => void anaChat.pause() : undefined}
          onResume={anaChat.runStatus ? () => void anaChat.resume() : undefined}
          onStop={() => void anaChat.stop()}
          onSteer={anaChat.runStatus ? (m) => anaChat.interject(m) : undefined}
          /* The live work dock reads the raw turns: progress phases, tool
             timings, pending steers and outputs that the adapted rail message
             shape does not carry. */
          work={{ messages: anaChat.messages, pendingSteers: anaChat.pendingSteers }}
          liveDrive={{
            on: prefs.liveDrive,
            locked: drive.lock,
            setOn: setLiveDriveOn,
            onStartTour: startTour,
            onStartDemo: startDemo,
          }}
        />
      )}
      <CmdK
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        onNav={nav}
        onAsk={ask}
        onAct={(id) => {
          onAct(id);
          setCmdkOpen(false);
        }}
      />
      <CollabLayer onNav={nav} />
      {/* Fixed strip, above every surface, while AnA is actually driving —
          who is driving, where she just went, take-over one keypress away. */}
      <LiveDriveOverlay
        state={drive}
        activity={driveActivity}
        narration={ownsConversation ? driveNarration : undefined}
        onTakeOver={takeOverDrive}
        /* Stop and steer reach the chat that is DRIVING, which is not always
           the shell's own (the editor dock's, the co-author's). */
        onStop={() => {
          driveQueueRef.current?.clear();
          const c = driveControlsRef.current;
          if (c) c.stop();
          else void anaChat.stop();
        }}
        /* Interactivity without surrender: a question or steer typed into the
           strip lands mid-run (the run-control interject) — AnA answers and
           continues driving; the person never has to take over just to speak. */
        onSteer={(m) => (driveControlsRef.current ? driveControlsRef.current.interject(m) : anaChat.interject(m))}
      />
    </div>
    </LiveDriveControlsContext.Provider>
    </NavEntitlementsProvider>
  );
}

export default V2App;
