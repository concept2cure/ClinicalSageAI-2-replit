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
 *  - AnA replies + action results are labelled sample until /api/ana-ri and
 *    /api/ai-actions wire in the surface phases (GAP RULE — no fabricated
 *    live output). Governed actions still demonstrate the §11.50 e-sign gate,
 *    marked sample; nothing is written.
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
import { SurfaceBoundary } from './SurfaceScaffold';
import { CollabLayer } from './surfaces/CollabLauncher';
import { SURFACE_VIEWS } from './surfaceViews';
import { Home, KitSurfaceScaffold } from './surfaces/Surfaces';
import {
  AI_ACTIONS,
  ANA_MODES,
  getAction,
  getSegment,
  getSurfaceActions,
} from './registryModel';
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

export function V2App() {
  const [location, setLocation] = useLocation();
  const [prefs, setPrefs] = React.useState<Prefs>(loadPrefs);
  const [cmdkOpen, setCmdkOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<AnaMessage[]>([]);
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
  const nav = React.useCallback(
    (id: string) => {
      setLocation(locationForSurface(id));
      setMessages([]);
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

  /* AnA ask — PROTOTYPE reply, always stamped sample until /api/ana-ri wires
     in the surface phases. A fabricated reply must never read as live. */
  const ask = (text: string) => {
    if (!text) return;
    const model = ANA_MODES.find((m) => m.id === prefs.anaMode)?.model ?? 'Balanced';
    const plain = text.replace(/^\[Agent\]\s*/i, '').trim();
    const agentMatch = text.match(/^\[Agent\]\s*(.*)$/i);
    if (agentMatch) {
      const body = agentMatch[1].trim() || 'Run the right action here.';
      const blob = body.toLowerCase();
      let hit: (typeof AI_ACTIONS)[number] | null = null;
      let hitScore = 0;
      for (const a of AI_ACTIONS) {
        const triggers = (a.triggers ?? []).concat(
          a.label
            .toLowerCase()
            .split(/\s+/)
            .filter((w: string) => w.length > 3)
        );
        const score = triggers.reduce((s: number, w: string) => s + (blob.includes(w) ? 1 : 0), 0);
        if (score > hitScore) {
          hit = a;
          hitScore = score;
        }
      }
      setMessages((ms) => [...ms, { role: 'user', body }]);
      if (!prefs.anaOpen) set('anaOpen', true);
      if (hit) {
        onAct(hit.id);
        return;
      }
      setMessages((ms) => [
        ...ms,
        {
          role: 'ana',
          model,
          sample: true,
          body: 'I didn’t match that to a governed action on this surface. Here are the actions I can run here — pick one or rephrase:',
          actions: getSurfaceActions(activeId).slice(0, 3),
        },
      ]);
      return;
    }
    setMessages((ms) => [
      ...ms,
      { role: 'user', body: plain },
      {
        role: 'ana',
        model,
        sample: true,
        body:
          'Sample response — the live AnA gateway (/api/ana-ri) wires up with the surface-port phase. When it lands, this thread streams real grounded answers with pedigree badges; until then nothing here should be read as analysis.',
        actions: getSurfaceActions(activeId).slice(0, 3),
      },
    ]);
    if (!prefs.anaOpen) set('anaOpen', true);
  };

  const runAction = (id: string, signed: boolean) => {
    setMessages((ms) => [...ms, { role: 'action', result: makeSampleActionResult(id, signed) }]);
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
          messages={messages}
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
