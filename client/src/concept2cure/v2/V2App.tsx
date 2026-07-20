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
import {
  AnaRail,
  CmdK,
  ESignGate,
  Rail,
  TopBar,
  makeSampleActionResult,
  type AnaMessage,
} from './Shell';
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
   reply streams, the status phase stands in until the first token lands. */
function adaptChatMessage(m: AnaChatMessage): AnaMessage {
  if (m.role === 'user') return { role: 'user', body: m.text };
  return {
    role: 'ana',
    body: m.text || (m.streaming ? m.statusPhase || 'Thinking…' : ''),
    sample: false,
  };
}

export function V2App() {
  const [location, setLocation] = useLocation();
  const [prefs, setPrefs] = React.useState<Prefs>(loadPrefs);
  const [cmdkOpen, setCmdkOpen] = React.useState(false);
  const [actionMsgs, setActionMsgs] = React.useState<AnaMessage[]>([]);
  const [esignFor, setEsignFor] = React.useState<string | null>(null);

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
  const anaChat = useAnaChat({ screenName: activeId });
  const nav = React.useCallback(
    (id: string) => {
      setLocation(locationForSurface(id));
      setActionMsgs([]);
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

  const runAction = (id: string, signed: boolean) => {
    setActionMsgs((ms) => [...ms, { role: 'action', result: makeSampleActionResult(id, signed) }]);
    if (!prefs.anaOpen) set('anaOpen', true);
  };
  const onAct = (id: string) => {
    const a = getAction(id);
    if (a?.governed) setEsignFor(id);
    else runAction(id, false);
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

  /* The rail shows the real AnA conversation; surface-scoped governed-action
     demos (onAct) append after it and reset on navigation. */
  const railMessages = [...anaChat.messages.map(adaptChatMessage), ...actionMsgs];

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
      {esignFor && (
        <ESignGate
          actionId={esignFor}
          onCancel={() => setEsignFor(null)}
          onConfirm={() => {
            runAction(esignFor, true);
            setEsignFor(null);
          }}
        />
      )}
    </div>
  );
}

export default V2App;
