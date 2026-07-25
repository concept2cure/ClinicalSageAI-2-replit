/**
 * ui-v2 shell chrome — faithful port of kit app/Shell.jsx:
 * Rail (client categories · workspace · specialist · explore · quick access)
 * · TopBar (breadcrumb · segment switcher · org · ⌘K · task/collab/bell/help)
 * · AnaRail (persistent co-author rail) · CmdK palette.
 *
 * Deltas from the kit prototype, all repo-seams (INSTALL_TARGET_AUDIT):
 *  - window.I → lucide map (./icons); window.* registry globals → ./registryModel.
 *  - Org identity reads TenantContext + the authenticated user (never a
 *    hard-coded "Acme Bio"); logout calls the real authService.
 *  - AnA is LIVE: the rail streams real replies from /api/ana-ri/stream, renders
 *    the REAL actions ANA executed, and — for a governed command — the REAL
 *    Part 11 sign-off prompt (GovernedActionSignoff → /api/ana-ri/governed-action).
 *    The prototype's fabricated action-result card and demonstration e-sign gate
 *    have been removed; every action executes through ANA, never a sample.
 */
import React from 'react';
import { useAuth } from '@/services/portal/authService';
import { useTenant } from '@/contexts/TenantContext';
import brandMark from '@/assets/concept2cure-icon.svg';
import { I } from './icons';
import { SampleTag, useLive, connected } from './dataConnect';
import { GovernedActionSignoff } from '../components/ana/GovernedActionSignoff';
import type { PendingSignoff } from '../components/ana/useGovernedAction';
import type { AnaChatAction } from '../components/ana/useAnaChat';
import {
  AI_ACTIONS,
  ANA_MODES,
  CLIENT_CATEGORIES,
  NAV_TIERS_V2,
  NAV_GROUP_OF,
  PRIMARY_SEGMENTS,
  RAIL_CORE,
  RAIL_EXPLORE,
  RAIL_QUICK,
  RAIL_SPECIALIST,
  SEGMENTS,
  getAnaContext,
  getCoauthor,
  getSegment,
  getSurfaceActions,
  type AnaContext,
} from './registryModel';
import { isClinicalRegulatoryGraphEnabled } from './clinicalRegulatoryGraphFlag';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';

export interface ShellSurfaceRef {
  id: string;
  label: string;
  navTier?: string;
  readiness?: string;
}

export interface AnaMessage {
  role: 'user' | 'ana';
  body?: string;
  model?: string;
  sample?: boolean;
  actions?: string[];
  /** The real actions ANA executed this turn (streamed from /api/ana-ri/stream). */
  executedActions?: AnaChatAction[];
  /** Governed commands ANA proposed that are blocked on a Part 11 e-signature. */
  pendingSignoffs?: PendingSignoff[];
}

/* ── Left rail ─────────────────────────────────────────────────────────── */
export function Rail({
  activeId,
  onNav,
  collapsed,
  setCollapsed,
  segment,
  setSegment,
}: {
  activeId: string;
  onNav: (id: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  segment: string;
  setSegment: (id: string) => void;
}) {
  const { user, logout } = useAuth();
  const [acct, setAcct] = React.useState(false);
  const name = user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Signed in';
  const initials =
    (user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '') || name.slice(0, 2).toUpperCase();
  const role = user?.roles?.[0] ?? '';
  const acctGo = (id?: string) => {
    setAcct(false);
    if (id) onNav(id);
  };
  const ACCT_ITEMS: ({ label: string; ic: string; to?: string; action?: 'logout' } | { sep: true })[] = [
    { label: 'Settings', ic: 'settings', to: 'admin-console' },
    { label: 'Usage & limits', ic: 'barChart', to: 'usage' },
    { label: 'Billing', ic: 'creditCard', to: 'billing' },
    { sep: true },
    { label: 'View all plans', ic: 'checkSquare', to: 'licensing' },
    { label: 'Set up a workspace', ic: 'rocket', to: 'onboarding' },
    { label: 'Codebase coverage', ic: 'grid', to: 'coverage' },
    { label: 'Get help', ic: 'help', to: 'conversation-thread' },
    { sep: true },
    { label: 'Log out', ic: 'logOut', action: 'logout' },
  ];
  /**
   * Rail entries that a feature flag gates. Flag off ⇒ the entry is not
   * rendered at all — not greyed out, not present-but-empty. A visible entry for
   * a capability the deployment does not have is worse than no entry.
   */
  const railVisible = (s: { id: string }) =>
    s.id === 'crl-library' ? isClinicalRegulatoryGraphEnabled() : true;
  const navItem = (s: { id: string; label: string; icon: string; badge?: string; count?: number; target?: string }) => {
    const target = s.target ?? s.id;
    return (
      <button
        key={s.id}
        type="button"
        className="nav-item"
        data-on={activeId === target || undefined}
        aria-current={activeId === target ? 'page' : undefined}
        onClick={() => onNav(target)}
        title={s.label}
      >
        <span className="ico">{I[s.icon] ?? I.grid}</span>
        <span className="lbl">{s.label}</span>
        {s.badge && <span className="nav-badge">{s.badge}</span>}
        {s.count != null && <span className="nav-count">{s.count}</span>}
      </button>
    );
  };
  return (
    <nav className="rail" aria-label="Primary">
      <div className="rail-top">
        <button
          type="button"
          className="rail-logo"
          onClick={() => onNav('document-authoring')}
          title="Document workspace"
          aria-label="Document workspace"
          data-on={activeId === 'document-authoring' || undefined}
        >
          <img src={brandMark} alt="" />
          <div className="rail-logo-text">
            Concept2Cure<span>.RI</span>
          </div>
        </button>
        <button
          type="button"
          className="rail-collapse"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {I.panelLeft}
        </button>
      </div>
      <div className="rail-scroll">
        <div className="rail-section">Client categories</div>
        <div className="rail-nav">
          {CLIENT_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className="nav-item"
              data-on={segment === c.id || undefined}
              aria-current={segment === c.id ? 'true' : undefined}
              onClick={() => setSegment(c.id)}
              title={c.label}
            >
              <span className="ico">{I[c.icon] ?? I.grid}</span>
              <span className="lbl">{c.label}</span>
            </button>
          ))}
        </div>
        <div className="rail-section">Workspace</div>
        <div className="rail-nav">{RAIL_CORE.map(navItem)}</div>
        <div className="rail-section">Science &amp; intelligence</div>
        {/* `crl-library` is gated by ENABLE_CLINICAL_REGULATORY_GRAPH — flag off
            and the rail entry is absent entirely, not disabled or empty. */}
        <div className="rail-nav">{RAIL_SPECIALIST.filter(railVisible).map(navItem)}</div>
        <div className="rail-section">Explore</div>
        <div className="rail-nav">{RAIL_EXPLORE.map(navItem)}</div>
        <div className="rail-section">Quick access</div>
        <div className="rail-nav">{RAIL_QUICK.map(navItem)}</div>
      </div>
      <div className="rail-foot">
        <button
          type="button"
          className="rail-account"
          title={name}
          onClick={() => setAcct((v) => !v)}
          data-open={acct || undefined}
        >
          <div className="avatar">{initials}</div>
          <div className="who">
            <div className="nm">{name}</div>
            <div className="rl">{role}</div>
          </div>
          <span className="chev">{I.down}</span>
        </button>
        {acct && (
          <>
            <div className="acct-scrim" onClick={() => setAcct(false)} />
            <div className="acct-menu" role="menu">
              <div className="acct-head">
                <div className="avatar">{initials}</div>
                <div className="who">
                  <div className="nm">{name}</div>
                  <div className="rl">{role}</div>
                </div>
              </div>
              {ACCT_ITEMS.map((it, i) =>
                'sep' in it ? (
                  <div key={i} className="acct-sep" />
                ) : (
                  <button
                    key={i}
                    type="button"
                    className="acct-item"
                    role="menuitem"
                    onClick={() => {
                      if (it.action === 'logout') {
                        setAcct(false);
                        void logout();
                      } else {
                        acctGo(it.to);
                      }
                    }}
                  >
                    <span className="ico">{I[it.ic] ?? I.grid}</span>
                    <span className="lbl">{it.label}</span>
                  </button>
                )
              )}
            </div>
          </>
        )}
      </div>
    </nav>
  );
}

/* ── Topbar ───────────────────────────────────────────────────────────── */
export function TopBar({
  surface,
  onPalette,
  segment,
  onSegment,
}: {
  surface: ShellSurfaceRef;
  onPalette: () => void;
  segment: string;
  onSegment: (id: string) => void;
}) {
  const tenant = useTenant();
  const orgName = tenant?.currentOrganization?.name ?? 'Organization';
  const orgMark = orgName
    .split(/\s+/)
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const tier = NAV_TIERS_V2.find((t) => t.id === (NAV_GROUP_OF[surface.id] ?? 'biopharma'));
  const [segOpen, setSegOpen] = React.useState(false);
  const seg = getSegment(segment) ?? SEGMENTS[0];
  const secondary = SEGMENTS.filter((s) => !s.primary);
  const segOpt = (s: (typeof SEGMENTS)[number]) => (
    <button
      key={s.id}
      type="button"
      className="tb-dom-opt"
      data-on={s.id === segment}
      onClick={() => {
        onSegment(s.id);
        setSegOpen(false);
      }}
    >
      <span className="ico">{I[s.icon] ?? I.globe}</span>
      <span className="tdo-mid">
        <span className="tdo-l">{s.label}</span>
        <span className="tdo-p">{s.pathways.join(' · ')}</span>
      </span>
      {s.id === segment && <span className="ico tdo-chk">{I.check}</span>}
    </button>
  );
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>{tier ? tier.label : ''}</span>
        <span className="sep">›</span>
        <span className="here">{surface.label}</span>
      </div>
      <div className="tb-spacer" />
      {seg && (
        <div className="tb-dom-wrap">
          <button
            type="button"
            className="tb-dom"
            onClick={() => setSegOpen((o) => !o)}
            title="Switch client domain"
            data-open={segOpen}
          >
            <span className="ico">{I[seg.icon] ?? I.globe}</span>
            <span className="tb-dom-lbl">{seg.label}</span>
            <span className="tb-org-chev">{I.down}</span>
          </button>
          {segOpen && (
            <>
              <div className="tb-dom-scrim" onClick={() => setSegOpen(false)} />
              <div className="tb-dom-menu" role="menu">
                <div className="tb-dom-sec">Client domain</div>
                {PRIMARY_SEGMENTS.map(segOpt)}
                <div className="tb-dom-sec">Other</div>
                {secondary.map(segOpt)}
                <div className="tb-dom-foot">
                  {I.info}
                  <span>Scopes modules, default workflow &amp; AnA context. Nav stays the same.</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      <button type="button" className="tb-org" title="Organization (switcher lands with the auth flow phase)">
        <span className="tb-org-mark">{orgMark}</span>
        <span className="tb-org-name">{orgName}</span>
        <span className="tb-org-chev">{I.down}</span>
      </button>
      <button type="button" className="tb-cmdk" onClick={onPalette}>
        <span className="ico">{I.search}</span>
        <span className="lbl">Search, jump, or run a command</span>
        <span className="kbd">⌘K</span>
      </button>
      <button
        type="button"
        className="tb-task"
        title="New task — assign & track from this screen (lands with the tasks surface port)"
      >
        <span className="ico">{I.checkSquare ?? I.plus}</span>
        <span className="tb-task-lbl">Task</span>
      </button>
      <button type="button" className="tb-btn" title="Collaborate — message, @mention, route (lands with the collaboration port)">
        {I.messageSquare}
      </button>
      <button type="button" className="tb-btn" title="Notifications">
        {I.bell}
      </button>
      <button type="button" className="tb-btn" title="Help">
        {I.help}
      </button>
    </header>
  );
}

/** Renders the REAL Part 11 sign-off prompts ANA returned for governed actions,
    mirroring the chat's Message signoff handling: each resolves through the real
    GovernedActionSignoff (POST /api/ana-ri/governed-action) to the server's
    confirmation, or is dismissed. No fabricated audit/hash — the outcome is the
    server's, never invented. */
function RailSignoffs({ signoffs }: { signoffs: PendingSignoff[] }) {
  const [outcomes, setOutcomes] = React.useState<Record<number, string>>({});
  const [dismissed, setDismissed] = React.useState<Record<number, boolean>>({});
  return (
    <div className="ana-msg-signoffs">
      {signoffs.map((s, i) => {
        if (dismissed[i]) return null;
        if (outcomes[i]) {
          return (
            <div key={`${s.command}-${i}`} className="ana-signoff-done" role="status">
              {I.check} {outcomes[i]}
            </div>
          );
        }
        return (
          <GovernedActionSignoff
            key={`${s.command}-${i}`}
            signoff={s}
            onResolved={(o) => setOutcomes((p) => ({ ...p, [i]: o.message }))}
            onCancel={() => setDismissed((p) => ({ ...p, [i]: true }))}
          />
        );
      })}
    </div>
  );
}

/* ── Persistent AnA rail ──────────────────────────────────────────────── */
export function AnaRail({
  open,
  setOpen,
  surface,
  segment,
  mode,
  setMode,
  messages,
  onSend,
  onAct,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  surface: ShellSurfaceRef;
  segment: string;
  mode: string;
  setMode: (m: string) => void;
  messages: AnaMessage[];
  onSend: (text: string) => void;
  onAct: (id: string) => void;
}) {
  const [draft, setDraft] = React.useState('');
  const [files, setFiles] = React.useState<string[]>([]);
  const [agent, setAgent] = React.useState(false);
  const [plusOpen, setPlusOpen] = React.useState(false);
  const [modeOpen, setModeOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const imgRef = React.useRef<HTMLInputElement>(null);
  const addFiles = (fl: FileList | null) => {
    if (!fl) return;
    setFiles((f) => [...f, ...Array.from(fl).map((x) => x.name)]);
  };
  const model = ANA_MODES.find((m) => m.id === mode)?.model ?? 'Balanced';
  const co = getCoauthor(segment);
  const ac0: AnaContext = getAnaContext(surface.id, segment);
  /* HARD RULE: bind AnA to the real co-author endpoint (live ?? fixture). When
     the backend is reachable, live co-author state overrides the fixture. */
  const liveCo = useLive<Partial<AnaContext> | null>(
    `/api/coauthor?surface=${encodeURIComponent(surface.id)}&segment=${encodeURIComponent(segment ?? '')}`,
    null,
    [surface.id, segment]
  );
  const ac: AnaContext = liveCo.data ? { ...ac0, ...liveCo.data } : ac0;
  const anaSample = !connected() || liveCo.sample;
  const suggestions = ac.suggestions?.length ? ac.suggestions : [];
  const send = () => {
    const t = draft.trim();
    if (!t && !files.length) return;
    onSend(agent ? `[Agent] ${t}` : t || `Attached ${files.length} file(s)`);
    setDraft('');
    setFiles([]);
  };

  if (!open) {
    return (
      <aside className="ana-seam" aria-label="AnA (collapsed)">
        <button type="button" className="ana-seam-btn" onClick={() => setOpen(true)} title="Open AnA · ⌘\">
          <span className="ana-seam-mark">✻</span>
          <span className="ana-seam-label">AnA</span>
        </button>
      </aside>
    );
  }
  return (
    <aside className="ana" aria-label="AnA assistant">
      <div className="ana-hdr">
        <div className="ana-id">
          <span className="ana-id-mark">✻</span>
          <div>
            <div className="ana-id-name">AnA — Co-Author</div>
            <div className="ana-id-model">
              {model} engine · in {ac.module || 'this workspace'}
            </div>
          </div>
        </div>
        <div className="ana-actions">
          <button type="button" className="tb-btn" title="New thread">
            {I.plus}
          </button>
          <button type="button" className="tb-btn" onClick={() => setOpen(false)} title="Collapse · ⌘\">
            {I.panelRight}
          </button>
        </div>
      </div>
      <div className="ana-body" aria-live="polite">
        {ac.module && (
          <div className="ana-ctx">
            <div className="ana-ctx-module">
              <span className="ico">{(ac.icon && I[ac.icon]) || I.grid}</span>
              <div className="ana-ctx-module-mid">
                <div className="ana-ctx-module-k">Working in</div>
                <div className="ana-ctx-module-v">{ac.module}</div>
              </div>
              <SampleTag sample={anaSample} />
            </div>
            <div className="ana-ctx-here">{ac.here}</div>
            {ac.program && (
              <div className="ana-ctx-prog">
                <span className="ico">{I.gitBranch}</span>
                {ac.program}
              </div>
            )}
            <div className="ana-ctx-cell">
              <span className="ana-ctx-k">{ac.section ? 'Current section' : 'Focus'}</span>
              <span className="ana-ctx-section">{ac.focus}</span>
            </div>
            <div className="ana-ctx-grid">
              <div className="ana-ctx-cell">
                <span className="ana-ctx-k">Stage</span>
                <span className="ana-ctx-stage">{ac.stage}</span>
              </div>
              <div className="ana-ctx-cell">
                <span className="ana-ctx-k">Readiness</span>
                <span className="ana-ctx-ready">
                  <span className="ana-ctx-bar">
                    <span style={{ width: `${ac.readiness ?? 0}%` }} />
                  </span>
                  {ac.readiness}%
                </span>
              </div>
            </div>
            {ac.evidence && (
              <div className="ana-ctx-cell">
                <span className="ana-ctx-k">Linked evidence</span>
                <div className="ana-ctx-evi">
                  {ac.evidence.map((e, i) => (
                    <button
                      key={i}
                      type="button"
                      className="ana-ctx-chip"
                      onClick={() => onSend(`Show the ${e.count} linked ${e.label} in ${ac.module}`)}
                    >
                      <b>{e.count}</b> {e.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {ac.activity && (
              <div className="ana-ctx-cell">
                <span className="ana-ctx-k">Recent activity</span>
                <div className="ana-ctx-acts">
                  {ac.activity.map((a, i) => (
                    <div key={i} className={`ana-ctx-act ${a.type}`}>
                      <span className="ico">{a.type === 'alert' ? I.alertTriangle : I.check}</span>
                      <span className="t">{a.text}</span>
                      <span className="w">{a.when}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {messages.length === 0 && (
          <div className="ana-greet">
            <div className="ana-greet-mark">✻</div>
            <div className="ana-greet-t">AnA is working in {ac.module || 'this workspace'}</div>
            <div className="ana-greet-s">
              {ac.here ? ac.here[0].toUpperCase() + ac.here.slice(1) : 'Ask about this module'}. Ask
              below, or pick an action — every change is tracked and governed.
            </div>
            {suggestions.length > 0 && (
              <div className="ana-greet-chips">
                {suggestions.slice(0, 3).map((s, i) => (
                  <button key={i} type="button" className="ana-greet-chip" onClick={() => onSend(s)}>
                    {I.sparkles}
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
            <div key={i} className={`ana-msg ${m.role}`}>
              {m.role === 'ana' && (
                <div className="who">
                  AnA · {m.model || model}
                  {m.sample ? ' · sample' : ''}
                </div>
              )}
              <div className="bd">{m.body}</div>
              {m.role === 'ana' && Array.isArray(m.actions) && m.actions.length > 0 && (
                <div className="ana-msg-actions">
                  {m.actions.map((id) => {
                    const a = AI_ACTIONS.find((x) => x.id === id);
                    if (!a) return null;
                    return (
                      <button key={id} type="button" className="ana-next-chip" onClick={() => onAct(id)}>
                        {I.arrowRight}
                        {a.label}
                        {a.governed ? (
                          <span className="ana-chip-gov" title="Governed · e-sign required">
                            {I.lock}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
              {m.role === 'ana' &&
                Array.isArray(m.executedActions) &&
                m.executedActions.length > 0 && (
                  <div className="ana-msg-executed">
                    {m.executedActions.map((a, i) => (
                      <span
                        key={i}
                        className={`ana-exec-chip${a.executed ? ' is-done' : ''}${a.error ? ' is-err' : ''}`}
                        title={a.error || a.label}
                      >
                        {a.error ? I.alertTriangle : a.executed ? I.check : I.zap} {a.label}
                      </span>
                    ))}
                  </div>
                )}
              {m.role === 'ana' &&
                Array.isArray(m.pendingSignoffs) &&
                m.pendingSignoffs.length > 0 && <RailSignoffs signoffs={m.pendingSignoffs} />}
            </div>
        ))}
      </div>
      <div className="ana-foot">
        {ac.actions && (
          <div className="ana-coauth">
            <div className="ana-coauth-h">What AnA can do here</div>
            <div className="ana-coauth-row">
              {ac.actions.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  className="ana-coauth-act"
                  onClick={() => onSend(a.prompt ?? a.label)}
                >
                  <span className="ico">{(a.icon && I[a.icon]) || I.sparkles}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="ana-composer">
          {files.length > 0 && (
            <div className="ana-files">
              {files.map((f, i) => (
                <span key={i} className="ana-file">
                  <span className="ico">{I.paperclip}</span>
                  {f}
                  <button type="button" onClick={() => setFiles(files.filter((_, k) => k !== i))}>
                    {I.close}
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            rows={1}
            placeholder={agent ? 'Describe a task for AnA to carry out…' : 'Ask AnA, or describe a task…'}
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
            onChange={(e) => addFiles(e.target.files)}
          />
          <input
            ref={imgRef}
            type="file"
            multiple
            accept="image/*"
            className="ana-hidden-input"
            onChange={(e) => addFiles(e.target.files)}
          />
          <div className="ana-crow">
            <div className="ana-tools">
              <button
                type="button"
                className="ana-tool"
                title="Attach"
                aria-label="Attach"
                onClick={() => {
                  setPlusOpen((o) => !o);
                  setModeOpen(false);
                }}
              >
                {I.plus}
              </button>
            </div>
            <div className="ana-right">
              <button
                type="button"
                className="ana-modepull"
                onClick={() => {
                  setModeOpen((o) => !o);
                  setPlusOpen(false);
                }}
                title="Control & engine"
              >
                <span className="ana-modepull-ic">{agent ? I.wand : I.sparkles}</span>
                <span>
                  {agent ? 'Agent' : 'Ask'} · {ANA_MODES.find((m) => m.id === mode)?.model}
                </span>
                {I.down}
              </button>
              <button
                type="button"
                className="ana-send"
                disabled={!draft.trim() && !files.length}
                onClick={send}
                aria-label="Send"
              >
                {I.arrowUp}
              </button>
            </div>
          </div>
          {plusOpen && (
            <div className="ana-menu" onMouseLeave={() => setPlusOpen(false)}>
              <div className="ana-menu-sec">Suggested</div>
              {suggestions.map((s, i) => (
                <button
                  key={`sg${i}`}
                  type="button"
                  className="ana-menu-item"
                  onClick={() => {
                    onSend(s);
                    setPlusOpen(false);
                  }}
                >
                  <span className="ico">{I.sparkles}</span>
                  {s}
                </button>
              ))}
              <div className="ana-menu-sec">Files</div>
              <button
                type="button"
                className="ana-menu-item"
                onClick={() => {
                  fileRef.current?.click();
                  setPlusOpen(false);
                }}
              >
                <span className="ico">{I.paperclip}</span>Attach file<span className="mh">PDF · DOCX · XLSX · CSV</span>
              </button>
              <button
                type="button"
                className="ana-menu-item"
                onClick={() => {
                  imgRef.current?.click();
                  setPlusOpen(false);
                }}
              >
                <span className="ico">{I.image}</span>Attach image or scan
              </button>
              <button
                type="button"
                className="ana-menu-item"
                onClick={() => {
                  onSend('Reference a document from the Vault');
                  setPlusOpen(false);
                }}
              >
                <span className="ico">{I.vault}</span>Reference from Vault
              </button>
              <div className="ana-menu-sec">Data &amp; connectors</div>
              <button
                type="button"
                className="ana-menu-item"
                onClick={() => {
                  onSend('Connect a data source');
                  setPlusOpen(false);
                }}
              >
                <span className="ico">{I.database}</span>Connect data source<span className="mh">FAERS · EUDAMED</span>
              </button>
              <button
                type="button"
                className="ana-menu-item"
                onClick={() => {
                  onSend('Reference another project');
                  setPlusOpen(false);
                }}
              >
                <span className="ico">{I.folder}</span>Reference another project
              </button>
              <button
                type="button"
                className="ana-menu-item"
                onClick={() => {
                  onSend('Manage connectors');
                  setPlusOpen(false);
                }}
              >
                <span className="ico">{I.settings}</span>Manage connectors
              </button>
              <div className="ana-menu-sec">Intelligence</div>
              <button
                type="button"
                className="ana-menu-item"
                onClick={() => {
                  onSend('>run a RIM tool');
                  setPlusOpen(false);
                }}
              >
                <span className="ico">{I.zap}</span>Run a RIM tool
              </button>
              <button
                type="button"
                className="ana-menu-item"
                onClick={() => {
                  onSend('Show slash commands and skills');
                  setPlusOpen(false);
                }}
              >
                <span className="ico">{I.sparkles}</span>Slash commands &amp; skills
              </button>
            </div>
          )}
          {modeOpen && (
            <div className="ana-menu" onMouseLeave={() => setModeOpen(false)}>
              <div className="ana-menu-sec">Control</div>
              <button
                type="button"
                className="ana-menu-item"
                data-on={!agent || undefined}
                onClick={() => {
                  setAgent(false);
                  setModeOpen(false);
                }}
              >
                <span className="ico">{I.sparkles}</span>Ask<span className="mh">AnA answers; you act</span>
              </button>
              <button
                type="button"
                className="ana-menu-item"
                data-on={agent || undefined}
                onClick={() => {
                  setAgent(true);
                  setModeOpen(false);
                }}
              >
                <span className="ico">{I.wand}</span>Agent<span className="mh">AnA takes governed actions</span>
              </button>
              <div className="ana-menu-sec">Engine</div>
              {ANA_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="ana-menu-item"
                  data-on={mode === m.id || undefined}
                  onClick={() => setMode(m.id)}
                >
                  <span className="ico">{I.zap}</span>
                  {m.model}
                  <span className="mh">{m.desc}</span>
                </button>
              ))}
            </div>
          )}
          {agent && (
            <div className="ana-agent-note">
              <span className="ico">{I.shieldCheck}</span>Agent mode — AnA runs tools &amp; drafts
              governed actions. Changes require your e-signature.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ── ⌘K palette ───────────────────────────────────────────────────────── */
interface CmdKItem {
  id: string;
  kind: string;
  label: string;
  hint?: string;
  icon?: string;
}

export function CmdK({
  open,
  onClose,
  onNav,
  onAsk,
  onAct,
}: {
  open: boolean;
  onClose: () => void;
  onNav: (id: string) => void;
  onAsk: (text: string) => void;
  onAct: (id: string) => void;
}) {
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const term = q.replace(/^[/>]\s?/, '').toLowerCase();
  const isCmd = q.startsWith('>');

  const items = React.useMemo<CmdKItem[]>(() => {
    // NOTE(Phase 3): the kit also searches filings, documents, conversations,
    // pathways, people and templates from its fixture files — those categories
    // join as their surface families port.
    if (!q.trim()) {
      return [
        { id: '_hd_jump', kind: 'header', label: 'Jump to' },
        ...UI_SURFACES.slice(0, 8).map((s) => ({
          id: s.id,
          kind: 'nav',
          label: s.label,
          hint: NAV_TIERS_V2.find((t) => t.id === (NAV_GROUP_OF[s.id] ?? 'biopharma'))?.label,
          icon: s.icon,
        })),
        { id: '_hd_actions', kind: 'header', label: 'Quick actions' },
        { id: 'run_validation', kind: 'action', label: 'Run validation', hint: 'Action', icon: 'zap' },
        { id: 'export_document', kind: 'action', label: 'Export document', hint: 'Action · e-sign', icon: 'zap' },
      ];
    }
    if (isCmd) {
      return AI_ACTIONS.filter((a) => !term || a.label.toLowerCase().includes(term)).map((a) => ({
        id: a.id,
        kind: 'action',
        label: a.label,
        hint: a.governed ? 'Action · e-sign required' : 'Action',
        icon: 'zap',
      }));
    }
    const results: CmdKItem[] = [];
    const navs = UI_SURFACES.filter(
      (s) => s.label.toLowerCase().includes(term) || (s.notes ?? '').toLowerCase().includes(term)
    ).slice(0, 8);
    if (navs.length) {
      results.push({ id: '_hd_surfaces', kind: 'header', label: 'Surfaces' });
      navs.forEach((s) =>
        results.push({
          id: s.id,
          kind: 'nav',
          label: s.label,
          hint: NAV_TIERS_V2.find((t) => t.id === (NAV_GROUP_OF[s.id] ?? 'biopharma'))?.label,
          icon: s.icon,
        })
      );
    }
    const acts = AI_ACTIONS.filter((a) => a.label.toLowerCase().includes(term)).slice(0, 3);
    if (acts.length) {
      results.push({ id: '_hd_actions2', kind: 'header', label: 'Actions' });
      acts.forEach((a) =>
        results.push({
          id: a.id,
          kind: 'action',
          label: a.label,
          hint: a.governed ? 'Action · e-sign' : 'Action',
          icon: 'zap',
        })
      );
    }
    if (q.trim()) {
      results.push({ id: '_hd_ana', kind: 'header', label: 'AnA' });
      results.push({
        id: 'ask',
        kind: 'ask',
        label: `Ask AnA: "${q.trim()}"`,
        hint: 'Send to gateway',
        icon: 'sparkles',
      });
    }
    return results;
  }, [q, term, isCmd]);

  const selectable = React.useMemo(() => items.filter((it) => it.kind !== 'header'), [items]);

  const run = React.useCallback(
    (it?: CmdKItem) => {
      if (!it || it.kind === 'header') return;
      if (it.kind === 'nav') onNav(it.id);
      else if (it.kind === 'action') onAct(it.id);
      else onAsk(q.trim());
      onClose();
    },
    [onNav, onAct, onAsk, q, onClose]
  );

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, selectable.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        run(selectable[sel]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, selectable, sel, onClose, run]);

  if (!open) return null;
  let selIdx = -1;
  return (
    <div className="cmdk-bd" onClick={onClose}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-in">
          <span className="ico">{I.search}</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            placeholder='Search surfaces, or ">" for actions…'
          />
          {q && (
            <button
              type="button"
              className="tbtn"
              onClick={() => {
                setQ('');
                setSel(0);
              }}
              aria-label="Clear"
            >
              {I.close}
            </button>
          )}
        </div>
        <div className="cmdk-list">
          {items.map((it) => {
            if (it.kind === 'header') {
              return (
                <div key={it.id} className="cmdk-hdr">
                  {it.label}
                </div>
              );
            }
            selIdx += 1;
            const si = selIdx;
            return (
              <button
                key={it.id}
                type="button"
                className={`cmdk-item${sel === si ? ' on' : ''}`}
                onMouseEnter={() => setSel(si)}
                onClick={() => run(it)}
              >
                <span className="ico">{(it.icon && I[it.icon]) || I.arrowRight}</span>
                <span className="lbl">{it.label}</span>
                <span className="hint">{it.hint ?? ''}</span>
              </button>
            );
          })}
          {items.length === 0 && <div className="cmdk-empty">No results for &quot;{q}&quot;</div>}
        </div>
        <div className="cmdk-foot">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
          <span className="cmdk-foot-hint">/ jump · &gt; action</span>
        </div>
      </div>
    </div>
  );
}
