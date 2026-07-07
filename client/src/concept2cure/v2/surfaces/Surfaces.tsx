/**
 * Core surface family — kit app/Surfaces.jsx ported:
 *   Home            — AnA-first landing (centered composer, segment context)
 *   GlobalRiBrowser — catalog-driven capability browser (`global-ri`,
 *                     contract-ready: GET /api/global-ri/catalog via the
 *                     existing useGlobalRiCatalog hook; fixture behind pill)
 *   KitSurfaceScaffold — the kit's honest "ready to install" state for
 *                     surfaces whose components haven't ported yet
 * Styles: styles/surfaces-v2.css (+ shell classes from app-v2.css).
 */
import React from 'react';
import { useAuth } from '@/services/portal/authService';
import { useGlobalRiCatalog } from '@/hooks/useGlobalRiCatalog';

import type { UiSurface } from '@shared/constants/ui-surface-registry';
import { apiRequest } from '@/lib/queryClient';
import { I } from '../icons';
import { SampleTag, liveGet } from '../dataConnect';
import {
  ANA_MODES,
  NAV_TIERS_V2,
  NAV_GROUP_OF,
  READINESS_META,
  getSegmentContext,
  getSegmentModules,
  getSurfaceMeta,
} from '../registryModel';
import {
  GLOBAL_RI_CATALOG_FIXTURE,
  GLOBAL_RI_RESULTS,
  type GriCapability,
  type GriCatalog,
  type GriInputSchema,
  type GriResultFixture,
} from '../fixtures/globalRi';
import { PedigreeBadge } from '../intelligence/Intelligence';
import '../styles/surfaces-v2.css';

/* ════════════ Home — AnA-first landing (centered composer) ════════════ */
export function Home({
  onNav,
  onAsk,
  segment,
}: {
  onNav: (id: string) => void;
  onAsk: (text: string) => void;
  segment: string;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = React.useState('');
  const [modeOpen, setModeOpen] = React.useState(false);
  const [mode, setMode] = React.useState('standard');
  const [plusOpen, setPlusOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const ctx = getSegmentContext(segment);

  /* Time-aware greeting — the only warmth in the product, once. */
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const userName = user?.firstName || user?.displayName || 'there';
  const engine = ANA_MODES.find((m) => m.id === mode) ?? ANA_MODES[0];

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    onAsk(t);
    setDraft('');
    onNav('conversation-thread');
  };
  const newProject = () => onNav('projects');

  const modGroups = getSegmentModules(segment) ?? [];

  const quickActions =
    ctx?.actions ??
    ([
      { id: 'author', label: 'Author', icon: 'penLine', surface: 'document-authoring' },
      { id: 'projects', label: 'Projects', icon: 'folder', surface: 'projects' },
      { id: 'evidence', label: 'Search evidence', icon: 'search', surface: 'evidence-search' },
      { id: 'intelligence', label: 'Intelligence', icon: 'globe', surface: 'global-ri' },
      { id: 'vault', label: 'From vault', icon: 'vault', surface: 'vault' },
    ] as { id: string; label: string; icon: string; surface: string }[]);

  return (
    <div className="landing">
      <div className="landing-center">
        <div className="landing-greet">
          <span className="landing-mark">✻</span>
          <h1>
            {greeting}, {userName}
          </h1>
        </div>
        {ctx && (
          <div className="landing-segctx">
            <div className="landing-segctx-top">
              <span className="landing-segctx-cat">{ctx.label}</span>
              <span className="landing-segctx-tag">{ctx.tagline}</span>
            </div>
            <div className="landing-segctx-prog">
              <span className="ico">{I.gitBranch}</span>
              {ctx.program}
            </div>
            <div className="landing-segctx-paths">
              {ctx.pathways.map((p, i) => (
                <span key={i} className="landing-segctx-path">
                  {p}
                </span>
              ))}
            </div>
            <button type="button" className="landing-newproj" onClick={newProject}>
              <span className="ico">{I.plus}</span>Start a new {ctx.label} project
            </button>
          </div>
        )}
        <div className="landing-composer">
          <textarea
            className="landing-input"
            rows={3}
            placeholder="How can I help you today?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.xml"
            className="ana-hidden-input"
          />
          <div className="landing-crow">
            <div className="landing-crow-l">
              <button
                type="button"
                className="landing-tool"
                title="Attach files"
                onClick={() => setPlusOpen((o) => !o)}
              >
                {I.plus}
              </button>
              {plusOpen && (
                <div className="landing-plus-menu">
                  <button
                    type="button"
                    onClick={() => {
                      fileRef.current?.click();
                      setPlusOpen(false);
                    }}
                  >
                    <span className="ico">{I.paperclip}</span>Attach file
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onNav('vault');
                      setPlusOpen(false);
                    }}
                  >
                    <span className="ico">{I.vault}</span>From vault
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onNav('projects');
                      setPlusOpen(false);
                    }}
                  >
                    <span className="ico">{I.folder}</span>Open a project
                  </button>
                </div>
              )}
            </div>
            <div className="landing-crow-r">
              <button type="button" className="landing-engine" onClick={() => setModeOpen((o) => !o)}>
                <span className="landing-eng-ana">AnA</span>
                <span>{engine.model}</span>
                <span className="landing-eng-mode">{engine.label}</span>
                <span className="landing-eng-chev">{I.down}</span>
              </button>
              {modeOpen && (
                <div className="landing-mode-menu">
                  {ANA_MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      data-on={mode === m.id || undefined}
                      onClick={() => {
                        setMode(m.id);
                        setModeOpen(false);
                      }}
                    >
                      <span className="lm-label">{m.model}</span>
                      <span className="lm-desc">{m.desc}</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="landing-send"
                disabled={!draft.trim()}
                onClick={send}
                title="Send"
              >
                {I.arrowUp}
              </button>
            </div>
          </div>
        </div>
        <div className="landing-actions">
          {quickActions.map((a) => (
            <button key={a.id} type="button" className="landing-action" onClick={() => onNav(a.surface)}>
              <span className="ico">{I[a.icon] ?? I.grid}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
        {modGroups.length > 0 && (
          <div className="landing-modules">
            <div className="landing-modules-head">
              <span className="lm-title">Everything in your {ctx ? ctx.label : 'workspace'}</span>
              <span className="lm-sub">All modules built for this client category</span>
            </div>
            <div className="landing-modgroups">
              {modGroups.map((g) => (
                <section key={g.label} className="landing-modgroup">
                  <h3 className="lm-grp-label">{g.label}</h3>
                  <div className="lm-grp-grid">
                    {g.items.map((id) => {
                      const m = getSurfaceMeta(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          className="lm-card"
                          onClick={() => onNav(id)}
                          title={('notes' in m && m.notes) || m.label}
                        >
                          <span className="lm-card-ic">{(m.icon && I[m.icon]) ?? I.grid}</span>
                          <span className="lm-card-l">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════ Global-RI capability browser (catalog-driven) ════════════ */
function useGriCatalog(): { catalog: GriCatalog; sample: boolean } {
  const live = useGlobalRiCatalog();
  if (live.data && Array.isArray(live.data.capabilities) && live.data.capabilities.length) {
    return { catalog: live.data, sample: false };
  }
  return { catalog: GLOBAL_RI_CATALOG_FIXTURE, sample: true };
}

function griSeed(cap: GriCapability, form: Record<string, unknown>): GriResultFixture {
  return (
    GLOBAL_RI_RESULTS[cap.id] ?? {
      pedigree: 'deterministic_registry',
      summary: `${cap.label} returns a deterministic, citation-backed payload from the global-RI registry (${cap.routes[cap.routes.length - 1]}).`,
      fields: Object.entries(form ?? {})
        .filter(([, v]) => v !== '' && v !== false)
        .map(([k, v]) => ({ k, v: String(v) })),
      citations: ['global-ri registry'],
      caveats: 'Seeded payload — the live route returns the structured result with its own citations and caveats.',
    }
  );
}

/** Kit C2C_GRI.run — call the capability's real route, fixture on failure. */
async function griRun(
  cap: GriCapability,
  input: Record<string, unknown>
): Promise<{ result: GriResultFixture; sample: boolean }> {
  const route = cap.routes?.[cap.routes.length - 1] ?? '';
  const m = route.match(/^(GET|POST)\s+(.+)$/);
  if (!m) return { result: griSeed(cap, input), sample: true };
  const path =
    '/api/global-ri' + m[2].replace(/:(\w+)/g, (_s, k: string) => encodeURIComponent(String(input?.[k] ?? '')));
  try {
    if (m[1] === 'GET') {
      const res = await liveGet<GriResultFixture | null>(path, null);
      if (!res.sample && res.data) return { result: res.data, sample: false };
      return { result: griSeed(cap, input), sample: true };
    }
    const res = await apiRequest('POST', path, input);
    if (res.ok) return { result: (await res.json()) as GriResultFixture, sample: false };
    return { result: griSeed(cap, input), sample: true };
  } catch {
    return { result: griSeed(cap, input), sample: true };
  }
}

export function GlobalRiBrowser({ onAsk }: { onAsk: (text: string) => void }) {
  const { catalog, sample } = useGriCatalog();
  const [group, setGroup] = React.useState(catalog.groups[0]?.id);
  const [capId, setCapId] = React.useState<string | null>(null);
  const cap = capId ? catalog.capabilities.find((c) => c.id === capId) : null;

  if (cap) return <GlobalRiCapability cap={cap} onBack={() => setCapId(null)} onAsk={onAsk} />;
  const groupMeta = catalog.groups.find((g) => g.id === group);
  const caps = catalog.capabilities.filter((c) => c.group === group);
  return (
    <div className="gri">
      <nav className="gri-nav">
        <div className="gri-nav-lbl">
          {catalog.total} capabilities · {catalog.anaToolCount} AnA tools <SampleTag sample={sample} />
        </div>
        {catalog.groups.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`gri-group${group === g.id ? ' on' : ''}`}
            onClick={() => setGroup(g.id)}
          >
            <span>{g.label}</span>
            <span className="n">{catalog.byGroup[g.id] ?? 0}</span>
          </button>
        ))}
      </nav>
      <div className="gri-main">
        <div className="ph">
          <div>
            <div className="ph-eyebrow">Global regulatory intelligence · catalog-driven</div>
            <h1 className="ph-title">{groupMeta?.label}</h1>
            <div className="ph-sub">{groupMeta?.blurb}</div>
          </div>
        </div>
        <div className="gri-caps">
          {caps.map((c) => (
            <button key={c.id} type="button" className="gri-cap" onClick={() => setCapId(c.id)}>
              <div className="t">{c.label}</div>
              <div className="d">{c.description}</div>
              <div className="f">
                <span className={`rd-chip tone-${c.deterministic ? 'ok' : 'warn'}`}>
                  {c.deterministic ? 'deterministic' : 'model-assisted'}
                </span>
                <span className="tool">{c.anaTools[0]}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* A single capability: auto-form from inputSchema → result panel. */
function GlobalRiCapability({
  cap,
  onBack,
  onAsk,
}: {
  cap: GriCapability;
  onBack: () => void;
  onAsk: (text: string) => void;
}) {
  /* Kit fixture carries the schema flat; the live @shared catalog carries it
     per AnA tool (tools[].inputSchema). */
  const schema: GriInputSchema =
    cap.inputSchema ??
    ((cap.tools?.[0]?.inputSchema ?? { properties: {}, required: [] }) as GriInputSchema);
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const [form, setForm] = React.useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    Object.entries(props).forEach(([k, p]) => {
      init[k] = p.type === 'boolean' ? false : '';
    });
    return init;
  });
  const [result, setResult] = React.useState<GriResultFixture | null>(null);
  const [resultSample, setResultSample] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const run = () => {
    setRunning(true);
    griRun(cap, form).then(({ result: r, sample }) => {
      setResult(r);
      setResultSample(sample);
      setRunning(false);
    });
  };
  const groupLabel = GLOBAL_RI_CATALOG_FIXTURE.groups.find((g) => g.id === cap.group)?.label;

  return (
    <div className="gri-main">
      <button type="button" className="gri-back" onClick={onBack}>
        <span className="gri-back-ic">{I.right}</span> Back to capabilities
      </button>
      <div className="gri-det">
        <div className="ph">
          <div>
            <div className="ph-eyebrow">{groupLabel}</div>
            <h1 className="ph-title">{cap.label}</h1>
            <div className="ph-sub">{cap.description}</div>
          </div>
        </div>
        <div className="gri-routes">
          {cap.routes.map((r) => (
            <span key={r} className="scaf-tag">
              {r}
            </span>
          ))}
        </div>

        <div className="gri-form">
          {Object.entries(props).map(([k, p]) => (
            <div className="gri-field" key={k}>
              <label>
                {labelize(k)}
                {required.includes(k) && <span className="req">*</span>}
              </label>
              {p.description && <div className="desc">{p.description}</div>}
              {p.type === 'boolean' ? (
                <div className="gri-toggle">
                  <span
                    className="gri-switch"
                    role="switch"
                    aria-checked={Boolean(form[k])}
                    tabIndex={0}
                    data-on={Boolean(form[k])}
                    onClick={() => set(k, !form[k])}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        set(k, !form[k]);
                      }
                    }}
                  />
                  <span className="gri-toggle-l">{form[k] ? 'Yes' : 'No'}</span>
                </div>
              ) : p.enum ? (
                <select className="gri-input" value={String(form[k])} onChange={(e) => set(k, e.target.value)}>
                  <option value="">Select…</option>
                  {p.enum.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="gri-input"
                  type={p.format === 'date' ? 'date' : p.type === 'number' ? 'number' : 'text'}
                  value={String(form[k])}
                  onChange={(e) => set(k, e.target.value)}
                  placeholder={p.description ?? ''}
                />
              )}
            </div>
          ))}
          <div className="gri-run-row">
            <button type="button" className="btn primary" onClick={run}>
              {I.zap} {running ? 'Running…' : 'Run capability'}
            </button>
            <button type="button" className="btn ghost" onClick={() => onAsk(`Run ${cap.label} via global-RI`)}>
              {I.sparkles} Ask AnA to run it
            </button>
          </div>
        </div>

        {result && (
          <div className="gri-result">
            <div className="gri-result-hdr">
              <span className="t">Result</span>
              <PedigreeBadge level={result.pedigree} />
              <SampleTag sample={resultSample} />
            </div>
            <div className="gri-result-body">
              <div className="gri-result-sum">{result.summary}</div>
              {result.fields && result.fields.length > 0 && (
                <div className="gri-kv">
                  {result.fields.map((f, i) => (
                    <div key={i} className="gri-kv-cell">
                      <div className="k">{f.k}</div>
                      <div className="v">{f.v}</div>
                    </div>
                  ))}
                </div>
              )}
              {result.citations && (
                <div className="gri-cite">
                  {result.citations.map((c) => (
                    <span key={c} className="c">
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {result.caveats && <div className="gri-caveat">{result.caveats}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function labelize(k: string) {
  return k
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/_/g, ' ');
}

/* ════════ Kit surface scaffold — honest "ready to install" state ════════ */
export function KitSurfaceScaffold({
  surface,
  onAsk,
}: {
  surface: UiSurface;
  onAsk: (text: string) => void;
}) {
  const r = READINESS_META[surface.readiness as keyof typeof READINESS_META];
  const hookName = `use${surface.id.replace(/(^|-)(\w)/g, (_m, _s, c: string) => c.toUpperCase())}()`;
  const complianceLabel: Record<string, string> = {
    'accessibility-enforcement': 'accessibility',
    'microcopy-tone': 'microcopy tone',
    'regulatory-compliance-ux': '21 CFR Part 11',
    'motion-discipline': 'motion discipline',
  };
  const steps: React.ReactNode[] = [
    <>
      <b>Kit</b> — design prototype
      {surface.uiKit ? (
        <>
          {' '}
          in <span className="mono">ui_kits/{surface.uiKit}</span>
        </>
      ) : (
        ' (none yet — design owns this)'
      )}
      .
    </>,
    <>
      <b>Shell</b> — renders under layoutMode <span className="mono">{surface.layoutMode}</span> in the
      ui-v2 shell.
    </>,
    <>
      <b>Routes</b> — {surface.apiPrefixes.length} mounted REST prefix
      {surface.apiPrefixes.length > 1 ? 'es' : ''}, auth&#39;d + tested.
    </>,
    <>
      <b>Contract</b> —{' '}
      {surface.sharedContract ? (
        <>
          import <span className="mono">{surface.sharedContract}</span>
        </>
      ) : (
        'add a @shared type as you install (promotes to contract-ready).'
      )}
    </>,
    <>
      <b>Hook</b> — <span className="mono">{hookName}</span> via apiQueryOptions — ~5 lines.
    </>,
  ];
  return (
    <div className="page-inner">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">
            {NAV_TIERS_V2.find((t) => t.id === (NAV_GROUP_OF[surface.id] ?? 'biopharma'))?.label} ·{' '}
            {surface.group}
          </div>
          <h1 className="ph-title">{surface.label}</h1>
          <div className="ph-sub">{surface.notes}</div>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => onAsk(`Help me install the ${surface.label} surface`)}
        >
          {I.sparkles} Ask AnA
        </button>
      </div>

      <div className="scaf">
        <div className="scaf-readiness">
          <span className={`rd-chip tone-${r?.tone ?? 'idle'}`}>{r?.label ?? surface.readiness}</span>
          <span className="scaf-readiness-blurb">{r?.blurb}</span>
        </div>

        <div className="scaf-grid">
          <div className="scaf-card">
            <div className="l">Mounted routes</div>
            {surface.apiPrefixes.map((a) => (
              <div className="scaf-row" key={a}>
                <span className="ico scaf-ok">{I.check}</span>
                <span className="mono">{a}</span>
              </div>
            ))}
          </div>
          <div className="scaf-card">
            <div className="l">Bindings</div>
            <div className="scaf-row">
              <span className="scaf-k">Layout mode</span>
              <span className="mono scaf-v">{surface.layoutMode}</span>
            </div>
            <div className="scaf-row">
              <span className="scaf-k">UI kit</span>
              <span className="mono scaf-v">{surface.uiKit ?? '—'}</span>
            </div>
            <div className="scaf-row">
              <span className="scaf-k">Contract</span>
              <span className="mono scaf-v">
                {surface.sharedContract ? surface.sharedContract.replace('@shared/types/', '') : '—'}
              </span>
            </div>
            <div className="scaf-row">
              <span className="scaf-k">Catalog</span>
              <span className="mono scaf-v">{surface.discoveryCatalog ? 'yes' : '—'}</span>
            </div>
          </div>
        </div>

        {surface.anaToolFamilies.length > 0 && (
          <div className="scaf-ana">
            <div className="scaf-card">
              <div className="l">AnA tool families</div>
              <div>
                {surface.anaToolFamilies.map((a) => (
                  <span key={a} className="scaf-tag">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="scaf-install">
          <div className="scaf-install-hdr">Install path · kit → live (5 layers)</div>
          {steps.map((s, i) => (
            <div className="scaf-step" key={i}>
              <span className="k">{i + 1}</span>
              <span className="t">{s}</span>
            </div>
          ))}
        </div>

        <div className="scaf-note">
          Compliance rails gating this surface:{' '}
          {surface.compliance.map((c) => complianceLabel[c] ?? c).join(' · ')}.
        </div>
      </div>
    </div>
  );
}
