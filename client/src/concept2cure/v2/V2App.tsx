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
import { useAnaChat, type AnaChatMessage } from '../components/ana/useAnaChat';
import { useAuth } from '@/services/portal/authService';
import { getJwtOrgId } from '@/utils/authToken';
import { useLive } from './dataConnect';
import { welcomeFor } from './onboardingWelcome';
import { SurfaceBoundary } from './SurfaceScaffold';
import { CollabLayer } from './surfaces/CollabLauncher';
import { SURFACE_VIEWS } from './surfaceViews';
import { Home, KitSurfaceScaffold } from './surfaces/Surfaces';
import { getAction, getSegment } from './registryModel';
import { locationForSurface, surfaceIdFromLocation } from './routing';
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

const PREFS_KEY = 'c2c-v2-prefs';

interface Prefs {
  dark: boolean;
  railCollapsed: boolean;
  anaOpen: boolean;
  anaMode: string;
  segment: string;
  /** Set once the client dismisses (or outgrows) the first-run AnA welcome. */
  welcomeDismissed: boolean;
}

const DEFAULT_PREFS: Prefs = {
  dark: false,
  railCollapsed: true,
  anaOpen: false,
  anaMode: 'standard',
  segment: 'biotech',
  welcomeDismissed: false,
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
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
function adaptChatMessage(m: AnaChatMessage): AnaMessage {
  if (m.role === 'user') return { role: 'user', body: m.text };
  return {
    role: 'ana',
    body: m.text || (m.streaming ? m.statusPhase || 'Thinking…' : ''),
    sample: false,
    executedActions: m.executedActions,
    pendingSignoffs: m.pendingSignoffs,
  };
}

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
  /* The real AnA assistant for the whole shell — one streaming conversation
     (/api/ana-ri/stream) shared by the rail, ⌘K and every surface's onAsk. */
  const anaChat = useAnaChat({ screenName: activeId, projectId: readShellProjectId() });
  const { user } = useAuth();
  /* The onboarding welcome must reflect the TENANT's real client type
     (organizations.client_type), not `prefs.segment` — that is a browser-local
     view toggle defaulting to 'biotech', so a device/diagnostics/CRO client
     would otherwise be greeted with biotech prompts, and a user switching
     tenants would inherit the previous tenant's stored segment. */
  const jwtOrgId = getJwtOrgId();
  const orgLive = useLive<{ organization?: { clientType?: string } } | null>(
    jwtOrgId ? `/api/organizations/${encodeURIComponent(jwtOrgId)}` : null,
    null,
    [jwtOrgId]
  );
  const tenantClientType = orgLive.sample ? null : orgLive.data?.organization?.clientType ?? null;
  const nav = React.useCallback(
    (id: string) => {
      setLocation(locationForSurface(id));
    },
    [setLocation]
  );
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
    (seed: string) => {
      try {
        (window as unknown as { C2C_CONVO?: { id: string; seed?: string | null } }).C2C_CONVO = {
          id: 'new',
          seed,
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
  const ask = (text: string) => {
    const clean = text.replace(/^\[Agent\]\s*/i, '').trim();
    if (!clean) return;
    if (ownsConversation) {
      startShellConversation(clean);
      return;
    }
    if (!prefs.anaOpen) set('anaOpen', true);
    void anaChat.send(clean);
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
    activeId === 'conversation-thread' ? `${activeId}#${convoEpoch}` : activeId;

  let body: React.ReactNode;
  if (activeId === 'home') {
    body = <Home onNav={nav} onAsk={ask} segment={prefs.segment} />;
  } else if (view?.ownsConversation) {
    /* Narrowed by the union: this component's props do not include `onAsk`, so
       there is no way to hand it a rail that is not being rendered. */
    const V = view.component;
    body = <V key={bodyKey} surface={ctxSurface} onNav={nav} segment={prefs.segment} />;
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

  return (
    <div
      className={`c2c-v2 shell${prefs.dark ? ' dark' : ''}`}
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
          <SurfaceBoundary resetKey={bodyKey}>{body}</SurfaceBoundary>
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
          onNav={nav}
          // Scopes composer uploads to the active project, so extracted text
          // lands in that project's memory — the same id useAnaChat uses.
          projectId={readShellProjectId()}
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
    </div>
  );
}

export default V2App;
