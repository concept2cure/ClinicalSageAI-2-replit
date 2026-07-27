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

const PREFS_KEY = 'c2c-v2-prefs';

interface Prefs {
  dark: boolean;
  railCollapsed: boolean;
  anaOpen: boolean;
  anaMode: string;
  segment: string;
}

const DEFAULT_PREFS: Prefs = {
  dark: false,
  railCollapsed: true,
  anaOpen: false,
  anaMode: 'standard',
  segment: 'biotech',
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

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      }
      if (mod && e.key === '\\') {
        e.preventDefault();
        set('anaOpen', !prefs.anaOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.anaOpen]);

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

  /* AnA ask — routes to the REAL streaming assistant (/api/ana-ri/stream via
     useAnaChat). The [Agent] prefix (rail agent toggle) is a task hint the
     server's agentic tool loop handles, so we strip it and stream a grounded
     reply. Governed action execution stays reachable via the action chips
     (onAct → §11.50 e-sign). No fabricated/sample reply is ever shown. */
  const ask = (text: string) => {
    const clean = text.replace(/^\[Agent\]\s*/i, '').trim();
    if (!clean) return;
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

  const view = SURFACE_VIEWS[activeId];
  const hideAna = Boolean(view?.hideAna);
  const isFull = Boolean(view?.full);
  let body: React.ReactNode;
  if (activeId === 'home') {
    body = <Home onNav={nav} onAsk={ask} segment={prefs.segment} />;
  } else if (view) {
    const V = view.component;
    body = <V surface={ctxSurface} onAsk={ask} onNav={nav} segment={prefs.segment} />;
  } else {
    body = <KitSurfaceScaffold surface={ctxSurface} onAsk={ask} />;
  }

  /* The rail shows the real AnA conversation — including the actions ANA
     actually executed and any governed action awaiting a Part 11 sign-off. */
  const railMessages = anaChat.messages.map(adaptChatMessage);

  return (
    <div
      className={`c2c-v2 shell${prefs.dark ? ' dark' : ''}`}
      data-collapsed={prefs.railCollapsed}
      data-ana-open={hideAna ? false : prefs.anaOpen}
      data-editor={hideAna || undefined}
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
        />
        <div className={isFull ? 'page page-full' : 'page'}>
          <SurfaceBoundary resetKey={activeId}>{body}</SurfaceBoundary>
        </div>
      </main>
      {!hideAna && (
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
