/**
 * GlobalRiBrowser — the catalog-driven Global RI capability browser
 * (`global-ri`, GET /api/global-ri/catalog via useGlobalRiCatalog; real
 * catalog → honest empty → honest error, no fixture).
 *
 * Moved out of Surfaces.tsx on 2026-09-29, unchanged. The shell imports
 * Surfaces.tsx for Home and KitSurfaceScaffold, so this browser's
 * /api/global-ri calls counted as shell calls, and the launch-scope checks
 * (ci:launch-scope-api) could not tell that no launch screen makes them.
 * `global-ri` is outside the launch catalog; its API is refused in
 * production. Only surfaceViews.ts imports this file.
 * Styles: styles/surfaces-v2.css.
 */
import React from 'react';
import { useGlobalRiCatalog } from '@/hooks/useGlobalRiCatalog';
import { apiRequest } from '@/lib/queryClient';
import { I } from '../icons';
import { liveGetOrNull, EmptyState } from '../dataConnect';
import type { GlobalRiCatalog, EnrichedGlobalRiCapability } from '@shared/types/global-ri-api';
import { consumeNavParams } from '../navParams';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { usePublishSurfaceContext } from '../surfaceContext';
import '../styles/surfaces-v2.css';

/* ════════════ Global-RI capability browser (catalog-driven) ════════════ */

/* Minimal JSON-schema shape the dynamic form reads from a capability's AnA
   tool (the live catalog carries it per tool as `tools[].inputSchema`). */
interface GriInputSchema {
  properties?: Record<
    string,
    { type?: string; enum?: string[]; description?: string; format?: string }
  >;
  required?: string[];
}

/* Honest outcome of running a capability against its REAL global-RI route:
   the real deterministic payload, or an error — never a fabricated fixture. */
interface GriRunResult {
  /** The real structured payload the route returned (heterogeneous per capability). */
  data: unknown;
  /** Set only when the run failed. */
  error?: string;
  /** The real HTTP route that was called (shown for provenance). */
  route?: string;
}

/** Render a real payload value honestly: scalars as text, nested shapes as compact JSON. */
function renderVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Run a capability against its REAL global-RI route and return the real
 * deterministic payload (or an honest error). No fixture fallback — a failed
 * run surfaces honestly instead of a fabricated stand-in.
 *
 * FOLLOW-UP (actions pass): each of the ~41 capabilities returns a distinct
 * domain shape (e.g. exclusivity → components + LOE date; strategy brief →
 * per-market sections), none of which is the old fixture's summary/fields/
 * citations shape. A per-capability formatted renderer + typed result contract
 * is not built yet, so the raw structured result is shown honestly below.
 */
async function griRun(
  cap: EnrichedGlobalRiCapability,
  input: Record<string, unknown>
): Promise<GriRunResult> {
  const route = cap.routes?.[cap.routes.length - 1] ?? '';
  const m = route.match(/^(GET|POST)\s+(.+)$/);
  if (!m) return { data: null, error: `No runnable HTTP route on "${cap.label}".` };
  const path =
    '/api/global-ri' + m[2].replace(/:(\w+)/g, (_s, k: string) => encodeURIComponent(String(input?.[k] ?? '')));
  try {
    if (m[1] === 'GET') {
      const res = await liveGetOrNull<unknown>(path);
      return { data: res.data, error: res.error, route: `GET ${path}` };
    }
    const res = await apiRequest('POST', path, input);
    if (!res.ok) return { data: null, error: `HTTP ${res.status}`, route: `POST ${path}` };
    return { data: (await res.json()) as unknown, route: `POST ${path}` };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e), route };
  }
}

/**
 * Match a navigation directive's `intelligenceTab` param against the LIVE
 * catalog's group ids/labels. The registry enum ('protocol'|'cmc'|'biostat'|
 * 'reports') predates the catalog-driven groups, so the match is tolerant —
 * id equality, then id/label containment — and an honest null when nothing
 * matches (the browser opens on its default group; no fabricated tab).
 * Exported for its own test.
 */
export function matchIntelligenceGroup(
  groups: ReadonlyArray<{ id: string; label: string }>,
  tab: string | null | undefined,
): string | null {
  const want = (tab ?? '').trim().toLowerCase();
  if (!want) return null;
  const exact = groups.find((g) => g.id.toLowerCase() === want);
  if (exact) return exact.id;
  const contains = groups.find(
    (g) => g.id.toLowerCase().includes(want) || g.label.toLowerCase().includes(want),
  );
  return contains ? contains.id : null;
}

export function GlobalRiBrowser({ onAsk }: { onAsk: (text: string) => void }) {
  // Live catalog from GET /api/global-ri/catalog (real getGlobalRiCatalog service,
  // auth'd regulatory-author, tested). Real data → honest empty → honest error;
  // no fixture fallback, no "Sample data" pill.
  const { data: catalog, isLoading, isError } = useGlobalRiCatalog();
  const [group, setGroup] = React.useState<string | undefined>(undefined);
  const [capId, setCapId] = React.useState<string | null>(null);
  /* A navigation directive's `intelligenceTab` param (AnA navigate_to / chip —
     consumed once on mount, before the catalog resolves). Applied below as a
     default only: an explicit group click always wins. */
  const [navTab] = React.useState<string | null>(
    () => consumeNavParams('global-ri')?.intelligenceTab ?? null,
  );

  /* The loading and error branches below return early, but every HOOK in this
     component must run on every render, so the hooks (and the reads they
     share) live above those returns. The open-capability and active-group
     reads are hoisted here in null-safe form and reused by the render further
     down — one computation, not two. */
  const cap =
    capId && catalog ? catalog.capabilities.find((c) => c.id === capId) ?? null : null;
  const activeGroup = catalog
    ? group ?? matchIntelligenceGroup(catalog.groups, navTab) ?? catalog.groups[0]?.id
    : undefined;

  /* What AnA can see of this screen. A FAILED read publishes the failure: an
     empty catalog over an outage and a genuinely empty catalog are different
     truths, and a summary counting zero capabilities over an error would make
     her confidently wrong about the whole intelligence surface. */
  const anaContext = React.useMemo(() => {
    if (isLoading) {
      return { summary: 'The intelligence catalog is still loading; nothing on screen is final yet.' };
    }
    if (isError || !catalog) {
      return {
        summary:
          'The intelligence catalog could not be read, so this screen is empty because of a ' +
          'failure, not because there are no capabilities.',
      };
    }
    const groupLabel = catalog.groups.find((g) => g.id === activeGroup)?.label ?? activeGroup;
    return {
      summary:
        `Global regulatory intelligence: ${catalog.total} capabilities in the catalog` +
        (groupLabel ? `, group "${groupLabel}" open` : '') +
        (cap ? `, capability "${cap.label}" open showing its inputs` : '') +
        '.',
      facts: {
        activeGroup: activeGroup ?? null,
        capId,
        totalCapabilities: catalog.total,
        groups: catalog.groups.map((g) => g.id),
      },
      availableActions: [
        'Open an intelligence group',
        'Open a capability to see its inputs',
        'Close the open capability',
      ],
    };
  }, [isLoading, isError, catalog, activeGroup, capId, cap]);
  usePublishSurfaceContext('global-ri', anaContext);

  /* AnA's hands on this screen — the surface-action bus (shared registry:
     intelligence.*; the 'intelligence' nav-target id resolves to this
     surface's own 'global-ri' id through DEEP_LINK_ALIASES). Every handler
     drives the SAME state the human's own controls drive (setGroup /
     setCapId); names are resolved against the LIVE catalog with honest
     misses, never a guess. While the catalog is still loading the handlers
     answer not-ready (`retry: true`) and the bus holds the directive for the
     ready signal below — the navigate→act gap. */
  useSurfaceActionHandlers('global-ri', {
    'intelligence.open-group': (params) => {
      /* A person may be mid-form in the open capability detail; swapping the
         catalog underneath it would discard their typing. Honest refusal. */
      if (capId !== null) {
        return { ok: false, reason: 'A capability detail is open — close it first.' };
      }
      if (isLoading) {
        return { ok: false, reason: 'The intelligence catalog is still loading.', retry: true };
      }
      if (isError || !catalog) {
        return { ok: false, reason: 'The intelligence catalog could not be read.' };
      }
      const wanted = (params.group ?? '').trim();
      if (!wanted) return { ok: false, reason: 'No group named.' };
      const matched = matchIntelligenceGroup(catalog.groups, wanted);
      if (!matched) {
        return { ok: false, reason: `No intelligence group named "${params.group}" in the catalog.` };
      }
      setGroup(matched);
      const label = catalog.groups.find((g) => g.id === matched)?.label ?? matched;
      return { ok: true, detail: `Opened ${label}` };
    },
    'intelligence.open-capability': (params) => {
      if (isLoading) {
        return { ok: false, reason: 'The intelligence catalog is still loading.', retry: true };
      }
      if (isError || !catalog) {
        return { ok: false, reason: 'The intelligence catalog could not be read.' };
      }
      const wanted = (params.capability ?? '').trim();
      if (!wanted) return { ok: false, reason: 'No capability named.' };
      const lower = wanted.toLowerCase();
      /* id exact wins, then label (case-insensitive), then unique containment. */
      let match =
        catalog.capabilities.find((c) => c.id === wanted) ??
        catalog.capabilities.find((c) => c.label.toLowerCase() === lower) ??
        null;
      if (!match) {
        const contains = catalog.capabilities.filter(
          (c) => c.label.toLowerCase().includes(lower) || c.id.toLowerCase().includes(lower),
        );
        if (contains.length > 1) {
          return {
            ok: false,
            reason: `"${params.capability}" matches ${contains.length} capabilities — name one exactly.`,
          };
        }
        match = contains[0] ?? null;
      }
      if (!match) {
        return { ok: false, reason: `No capability named "${params.capability}" in the catalog.` };
      }
      setCapId(match.id);
      setGroup(match.group);
      return { ok: true, detail: `Opened ${match.label}` };
    },
    'intelligence.close-capability': () => {
      if (capId === null) return { ok: false, reason: 'No capability is open.' };
      /* Closing discards anything typed into the capability form. That loss is
         stated in the registry description; the form state is child-local and
         invisible here, so it cannot be guarded — only said. */
      setCapId(null);
      return {
        ok: true,
        detail: cap ? `Closed ${cap.label} — back to the catalog` : 'Back to the capability catalog',
      };
    },
  });
  /* The ready signal for the retry contract above: when the catalog read
     settles, a held not-ready directive gets its one re-attempt. */
  React.useEffect(() => {
    if (!isLoading) notifySurfaceActionReady('global-ri');
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="gri-main">
        <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading the global-RI capability catalog…</div>
      </div>
    );
  }
  if (isError || !catalog) {
    return (
      <div className="gri-main">
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the global-RI catalog"
          hint="The regulatory-intelligence capability catalog didn't respond. Sign in with regulatory-author access and retry, or check that the regulatory-intelligence service is reachable."
        />
      </div>
    );
  }
  if (!catalog.capabilities || catalog.capabilities.length === 0) {
    return (
      <div className="gri-main">
        <EmptyState
          icon={I.fileText}
          title="No global-RI capabilities available"
          hint="The catalog loaded but returned no capabilities for your account."
        />
      </div>
    );
  }

  if (cap) return <GlobalRiCapability cap={cap} catalog={catalog} onBack={() => setCapId(null)} onAsk={onAsk} />;

  const groupMeta = catalog.groups.find((g) => g.id === activeGroup);
  const caps = catalog.capabilities.filter((c) => c.group === activeGroup);
  return (
    <div className="gri">
      <nav className="gri-nav">
        <div className="gri-nav-lbl">
          {catalog.total} capabilities · {catalog.anaToolCount} AnA tools
        </div>
        {catalog.groups.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`gri-group${activeGroup === g.id ? ' on' : ''}`}
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
                {c.anaTools[0] ? <span className="tool">{c.anaTools[0]}</span> : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* A single capability: auto-form from the live tool inputSchema → result panel. */
function GlobalRiCapability({
  cap,
  catalog,
  onBack,
  onAsk,
}: {
  cap: EnrichedGlobalRiCapability;
  catalog: GlobalRiCatalog;
  onBack: () => void;
  onAsk: (text: string) => void;
}) {
  /* The live @shared catalog carries the form schema per AnA tool
     (tools[].inputSchema). */
  const schema = (cap.tools?.[0]?.inputSchema ?? { properties: {}, required: [] }) as GriInputSchema;
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const [form, setForm] = React.useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    Object.entries(props).forEach(([k, p]) => {
      init[k] = p.type === 'boolean' ? false : '';
    });
    return init;
  });
  const [result, setResult] = React.useState<GriRunResult | null>(null);
  const [running, setRunning] = React.useState(false);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const run = () => {
    setRunning(true);
    griRun(cap, form).then((r) => {
      setResult(r);
      setRunning(false);
    });
  };
  const groupLabel = catalog.groups.find((g) => g.id === cap.group)?.label;

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
              {/* The label sat beside each control naming nothing; the runner
                  builds its form from the capability's own schema, so the id is
                  built from the same key. */}
              <label htmlFor={`gri-${k}`}>
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
                <select id={`gri-${k}`} className="gri-input" value={String(form[k])} onChange={(e) => set(k, e.target.value)}>
                  <option value="">Select…</option>
                  {p.enum.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`gri-${k}`}
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
              {result.route && <span className="scaf-tag">{result.route}</span>}
            </div>
            <div className="gri-result-body">
              {result.error ? (
                <EmptyState
                  tone="error"
                  icon={I.alertTriangle}
                  title="Couldn't run this capability"
                  hint={`The global-RI service didn't return a result (${result.error}). Check the inputs and that you're signed in with regulatory-author access, then retry.`}
                />
              ) : result.data == null ||
                (typeof result.data === 'object' && Object.keys(result.data as object).length === 0) ? (
                <EmptyState
                  icon={I.fileText}
                  title="No result returned"
                  hint="The capability ran but returned nothing for these inputs."
                />
              ) : typeof result.data !== 'object' ? (
                <div className="gri-result-sum">{String(result.data)}</div>
              ) : (
                <>
                  <div className="gri-kv">
                    {Object.entries(result.data as Record<string, unknown>).map(([k, v]) => (
                      <div key={k} className="gri-kv-cell">
                        <div className="k">{labelize(k)}</div>
                        <div className="v">{renderVal(v)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="gri-caveat">
                    Raw deterministic result from the global-RI service. A formatted per-capability view is being built.
                  </div>
                </>
              )}
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
