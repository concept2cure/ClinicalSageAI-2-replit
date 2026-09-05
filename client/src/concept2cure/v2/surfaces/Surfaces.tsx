/**
 * Core surface family — kit app/Surfaces.jsx ported:
 *   Home            — AnA-first landing (centered composer, segment context)
 *   GlobalRiBrowser — catalog-driven capability browser (`global-ri`,
 *                     GET /api/global-ri/catalog via the existing
 *                     useGlobalRiCatalog hook; real catalog → honest empty →
 *                     honest error, no fixture)
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
import { liveGetOrNull, EmptyState, useLiveRows } from '../dataConnect';
import {
  ANA_MODES,
  NAV_TIERS_V2,
  NAV_GROUP_OF,
  READINESS_META,
  getSegmentContext,
  getSegmentModules,
  getSurfaceMeta,
} from '../registryModel';
import type { GlobalRiCatalog, EnrichedGlobalRiCapability } from '@shared/types/global-ri-api';
import { consumeNavParams } from '../navParams';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { usePublishSurfaceContext } from '../surfaceContext';
import '../styles/surfaces-v2.css';
import { useChatUpload } from '../../hooks/useChatUpload';

/* ════════════ Home — AnA-first landing (centered composer) ════════════ */

/**
 * One row of the real programme portfolio, as GET /api/c2c/projects projects it
 * from `regulatory_programs` (server/routes/c2c/projects.ts). Home only needs
 * the identity fields; the Projects surface reads the same route for the full
 * card. Declared here rather than imported so Home does not pull the whole
 * Projects module (and its New-Project wizard) into the landing chunk.
 */
interface HomeProgram {
  id: string;
  title: string;
  code: string;
  status: string;
  ws: string;
}

/**
 * The lead-programme line under the greeting.
 *
 * This block used to render `SEGMENT_CONTEXT[segment].program` — a constant. For
 * a biotech tenant that constant read 'BX-301 — BLA · 351(a)', so the FIRST
 * authenticated screen named a drug programme the organization had never
 * created, while Projects (one click away, reading the same database) correctly
 * reported none. Fabricated programme identity is a data-integrity defect in a
 * regulated tool, so the constant is gone and this reads the real portfolio.
 *
 * Four honest states, no fixture: loading, the real lead programme, "No programs
 * yet", or a failed read said plainly. An active programme is preferred as the
 * lead (that is what "what am I working on" means); if none is active the first
 * row still beats showing nothing.
 */
function HomeLeadProgram({ onNav }: { onNav: (id: string) => void }) {
  const { rows, loading, error, empty } = useLiveRows<HomeProgram>('/api/c2c/projects');

  if (loading) {
    return <div role="status" className="landing-segctx-prog">Loading your programs…</div>;
  }
  if (error) {
    return (
      <div className="landing-segctx-prog">
        <span className="ico">{I.alertTriangle}</span>
        Couldn&rsquo;t load your programs
      </div>
    );
  }
  if (empty) {
    return (
      <div className="landing-segctx-prog">
        <span className="ico">{I.gitBranch}</span>
        No programs yet
      </div>
    );
  }

  const lead = rows.find((p) => p.status === 'active') ?? rows[0];
  const others = rows.length - 1;
  return (
    <button
      type="button"
      className="landing-segctx-prog"
      onClick={() => onNav('projects')}
      title="Open the project portfolio"
    >
      <span className="ico">{I.gitBranch}</span>
      {lead.code ? `${lead.code} — ${lead.title}` : lead.title}
      {others > 0 && <span className="landing-segctx-tag">+{others} more</span>}
    </button>
  );
}

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

  /* ── "Attach file" opened a picker into nothing ────────────────────────────
     The `<input type="file">` below carried no onChange, so on the product's
     FRONT PAGE a user pressed +, chose "Attach file", picked a document in the
     OS dialog — and nothing was read, uploaded or shown. The picker closing
     was the entire feedback.

     `useChatUpload` → POST /api/chat/upload is the same path the shell
     composer and ConversationThread use; this composer just never called it.
     Attached files ride along to the thread this composer seeds, so the
     document the user attached is the one the conversation opens on. */
  const upload = useChatUpload();

  /* Time-aware greeting — the only warmth in the product, once. */
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const userName = user?.firstName || user?.displayName || 'there';
  const engine = ANA_MODES.find((m) => m.id === mode) ?? ANA_MODES[0];

  const send = () => {
    const t = draft.trim();
    /* Attachments alone are a legitimate turn ("read this"), and a file still
       being read is not ready to be named — the same rule ConversationThread's
       composer applies. Only files the SERVER confirmed it read are mentioned;
       a failed upload keeps its chip and its error and is never described as
       attached. */
    if (upload.uploading) return;
    const ready = upload.attachments.filter((a) => a.status === 'ready').map((a) => a.name);
    if (!t && ready.length === 0) return;
    const line = ready.length ? `Attached: ${ready.join(', ')}` : '';
    const seedText = t && line ? `${t}\n\n${line}` : t || line;
    /*
     * Seed the thread, do not `onAsk`.
     *
     * `onAsk` pushes into the SHELL's conversation and opens the shell's AnA
     * rail — but the destination, `conversation-thread`, is registered
     * `ownsConversation: true`, so the rail this question was sent to is the
     * one surface that never draws it.
     * And `ConversationThread` runs its own `useAnaChat` keyed off
     * `window.C2C_CONVO`, which nothing here was writing. Net effect: you typed
     * a question into the product's front door, landed on an EMPTY
     * conversation screen, and the answer streamed into a hidden rail — to
     * reappear, unbidden, the next time you opened a surface that does draw it.
     *
     * `window.C2C_CONVO = { id: 'new', seed }` is the protocol the thread
     * already implements (ConversationThread.tsx:300) and that ProjectHome
     * already uses (ProjectHome.tsx:570). The seed is sent on mount, into the
     * thread the user is actually looking at.
     */
    (window as any).C2C_CONVO = { id: 'new', seed: seedText };
    setDraft('');
    upload.clear();
    onNav('conversation-thread');
  };
  /* Open the wizard, not the (empty) portfolio behind it. Projects.tsx:675
     already reads this flag on mount and opens the wizard; nothing in the repo
     wrote it, so every "Start a new … project" hero CTA landed the user on a
     list with no programs and no obvious next step. */
  const newProject = () => {
    try { (window as any).__C2C_NEW_PROJECT = true; } catch { /* noop */ }
    onNav('projects');
  };

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
            <HomeLeadProgram onNav={onNav} />
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
            aria-label="Attach files for AnA to read"
            onChange={(e) => {
              upload.addFiles(e.target.files);
              // Clear the input so re-picking the SAME file fires change again.
              e.target.value = '';
            }}
          />
          {upload.attachments.length > 0 && (
            <div className="landing-atts">
              {upload.attachments.map((a) => (
                <span key={a.id} className="landing-att" data-status={a.status}>
                  {I.paperclip} {a.name}
                  {a.status === 'uploading' && <em> · reading…</em>}
                  {a.status === 'error' && <em> · {a.error ?? 'failed'}</em>}
                  <button
                    type="button"
                    className="landing-att-x"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => upload.removeAttachment(a.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <span className="sr-only" aria-live="polite">{upload.statusMessage}</span>
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
                disabled={upload.uploading || (!draft.trim() && !upload.attachments.some((a) => a.status === 'ready'))}
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
