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
import {
  useChatUpload,
  attachmentReadLabel,
  CHAT_UPLOAD_ACCEPT,
  SR_ONLY_STYLE,
} from '../hooks/useChatUpload';
import { I } from './icons';
import { TaskTray } from './TaskTray';
import type { OnboardingWelcome } from './onboardingWelcome';
import { AnaActivity, type AnaActivityProps } from './AnaActivity';
import { stashNavParamsForTarget } from './navParams';
import { AnaGrounding, type AnaGroundingEvidence } from './AnaGrounding';
import { CrlPremortemPanel, type CrlPremortemArtifact } from '../components/ana/CrlPremortemPanel';
import { SignoffList } from './SignoffList';
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
import {
  isLocked,
  lockShortReason,
  useNavEntitlements,
  type NavSurfaceEntitlement,
} from './navEntitlements';
import { NavUnlockPanel } from './NavUnlockPanel';
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
  /**
   * What ANA is doing / did this turn — the live work record rendered by
   * {@link AnaActivity}. Every field is something the turn genuinely reported;
   * see that module for why the rail used to show none of it.
   */
  activity?: AnaActivityProps;
  /**
   * Caveats about THIS answer — a degraded-mode signal from the server, or a
   * timeout that cut the turn short. Deliberately not part of `activity`: the
   * work record is about how the answer was reached and lives behind a
   * disclosure, whereas a caveat qualifies the answer itself and has to be read
   * without going looking for it.
   */
  warnings?: string[];
  /**
   * Steers the human sent mid-run that AnA accepted, in order. `useAnaChat`
   * has recorded these since run control shipped and nothing rendered them:
   * a steer you cannot see afterwards is one you cannot tell was taken.
   */
  interjections?: string[];
  /**
   * The server's evidence verdict for this answer. Emitted as `grounding_strip`
   * and stored by `useAnaChat` since that pipeline shipped; nothing rendered it.
   */
  evidence?: AnaGroundingEvidence;
  /**
   * The CRL/RTF pre-mortem decision artifact, when the turn assembled one.
   * `CrlPremortemPanel` has existed, and been tested, since E14 with ZERO mount
   * sites — a board-ready artifact the product could not show anyone.
   */
  crlPremortem?: CrlPremortemArtifact;
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
  /* Live licence verdicts for this organization. Until the server answers —
     and permanently if it cannot — `verdictFor` returns null for everything and
     the rail renders exactly as it did before: a lock badge is a claim about a
     customer's contract, and inventing one from a failed fetch is the failure
     mode worth avoiding here, not an unlocked rail. */
  const { verdictFor } = useNavEntitlements();
  /** The locked destination the human just activated, if any. */
  const [lockedFor, setLockedFor] = React.useState<NavSurfaceEntitlement | null>(null);
  const name = user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Signed in';
  const initials =
    (user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '') || name.slice(0, 2).toUpperCase();
  const role = user?.roles?.[0] ?? '';
  const isOrgAdmin = (user?.roles ?? []).some((r) =>
    ['admin', 'owner', 'super_admin', 'platform_admin', 'business_admin'].includes(String(r).toLowerCase()),
  );
  const acctGo = (id?: string) => {
    setAcct(false);
    if (id) onNav(id);
  };
  const ACCT_ITEMS: ({ label: string; ic: string; to?: string; action?: 'logout' } | { sep: true })[] = [
    // Admin is reached from the bottom-left account menu — the same place and
    // gesture as Claude's admin/settings. Gated to org admins; admin-console
    // itself renders a non-leaky denied state, but we hide the entry entirely
    // for non-admins to mirror Claude exactly.
    ...(isOrgAdmin ? [{ label: 'Admin', ic: 'shieldCheck', to: 'admin-console' }] : []),
    // Licensing control sits beside Admin, same gate. The surface itself
    // re-checks platform-admin server-side on every read and write; this only
    // decides whether the entry is offered.
    ...(isOrgAdmin ? [{ label: 'Licensing', ic: 'checkSquare', to: 'master-licensing' }] : []),
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
    /* Entitlement is keyed on the DESTINATION, not the rail entry: "Recent
       Documents" and "Starred Items" are shortcuts onto document-authoring and
       projects, so they inherit those modules' verdicts rather than looking up
       ids the catalog has never heard of. */
    const verdict = verdictFor(target);
    const locked = isLocked(verdict);
    return (
      <button
        key={s.id}
        type="button"
        className="nav-item"
        data-on={activeId === target || undefined}
        /* Locked is a data attribute, not `disabled`. A disabled control is
           unreachable by keyboard and explains nothing — the entitlements spec
           requires a locked destination to stay an activatable, labelled
           affordance that opens an honest panel. */
        data-locked={locked || undefined}
        aria-current={activeId === target ? 'page' : undefined}
        onClick={() => (locked && verdict ? setLockedFor(verdict) : onNav(target))}
        /* The lock reaches assistive tech through the accessible name, not the
           icon: the icon is decorative and the colour shift is never the only
           channel. The reason is the SERVER'S reason, per verdict — this used
           to hard-code "not included in your plan" for all three, which is only
           true of a tier gap: a module an admin switched off needs nothing
           bought, and one outside the workspace's industry mode is not fixed by
           any plan. Hover and screen-reader users were getting a different, and
           wrong, reason from the one the panel gave them on activation. */
        aria-label={locked && verdict ? `${s.label} — ${lockShortReason(verdict)}` : undefined}
        title={locked && verdict ? `${s.label} — ${lockShortReason(verdict)}` : s.label}
      >
        <span className="ico">{I[s.icon] ?? I.grid}</span>
        <span className="lbl">{s.label}</span>
        {locked && (
          <span className="nav-lic" data-lic="off" aria-hidden="true">
            {I.lock}
          </span>
        )}
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
      {lockedFor && (
        <NavUnlockPanel
          verdict={lockedFor}
          isOrgAdmin={isOrgAdmin}
          onClose={() => setLockedFor(null)}
          onNav={onNav}
        />
      )}
    </nav>
  );
}

/* ── Topbar ───────────────────────────────────────────────────────────── */
export function TopBar({
  surface,
  onPalette,
  segment,
  onSegment,
  onNav,
  onAsk,
}: {
  surface: ShellSurfaceRef;
  onPalette: () => void;
  segment: string;
  onSegment: (id: string) => void;
  onNav?: (id: string) => void;
  onAsk?: (text: string) => void;
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
      {/* New task / Collaborate open the universal launcher with the current
          surface's context; the tray is the live "what needs me" slide-over. */}
      <button
        type="button"
        className="tb-task"
        title="New task — assign & track from this screen"
        onClick={() => { try { (window as any).C2C?.open?.('task'); } catch (_e) { /* launcher not mounted */ } }}
      >
        <span className="ico">{I.checkSquare ?? I.plus}</span>
        <span className="tb-task-lbl">Task</span>
      </button>
      <button
        type="button"
        className="tb-btn"
        title="Collaborate — message a colleague about this screen"
        aria-label="Collaborate"
        onClick={() => { try { (window as any).C2C?.open?.('collab'); } catch (_e) { /* launcher not mounted */ } }}
      >
        {I.messageSquare}
      </button>
      <TaskTray onNav={onNav} onAsk={onAsk} />
      <button type="button" className="tb-btn" title="Help" aria-label="Help">
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
  return (
    <SignoffList
      signoffs={signoffs}
      className="ana-msg-signoffs"
      doneClassName="ana-signoff-done"
    />
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
  welcome,
  onDismissWelcome,
  onNav,
  projectId = null,
  runStatus = null,
  streaming = false,
  onPause,
  onResume,
  onStop,
  onSteer,
  liveDrive,
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
  /** First-run AnA welcome (P1, assist-only). Null once the client has started
   *  a conversation or dismissed it — the rail only renders it when present. */
  welcome?: OnboardingWelcome | null;
  onDismissWelcome?: () => void;
  /**
   * Mid-run control. The server has supported pause / resume / cancel /
   * interject at the agentic loop's round boundaries since run control
   * shipped, and `useAnaChat` exposes all four — the rail offered none of
   * them, so a human watching AnA work a question the wrong way could only
   * wait for her to finish. Absent handlers simply hide the affordance.
   */
  runStatus?: 'running' | 'paused' | 'cancelled' | null;
  streaming?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  /** Splices a steer into the next round. Capped server-side at 2000 chars. */
  onSteer?: (message: string) => void;
  /** Lets a welcome starter open a real surface (e.g. the upload flow). */
  onNav?: (id: string) => void;
  /** Scopes chat uploads so extracted text lands in that project's memory.
   *  Null is valid — the file still uploads, it is just not project-scoped. */
  projectId?: string | number | null;
  /**
   * AnA Live Drive toggle (V2App owns the state machine). `locked` carries the
   * server's honest entitlement deny from the last attempted turn — the
   * control stays enabled with the real required tier named, never a
   * disabled, reasonless button (the platform's Locked-never-dead rule).
   */
  liveDrive?: {
    on: boolean;
    locked: { reason: string; requiredTier?: string | null } | null;
    setOn: (v: boolean) => void;
  };
}) {
  const [draft, setDraft] = React.useState('');
  /* The steer field is separate from `draft` on purpose: a steer joins the
     RUNNING turn, a draft starts the next one, and sharing one buffer would
     make it ambiguous which a half-typed sentence was about to do. */
  const [steer, setSteer] = React.useState('');
  const [agent, setAgent] = React.useState(false);
  const [plusOpen, setPlusOpen] = React.useState(false);
  const [modeOpen, setModeOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const imgRef = React.useRef<HTMLInputElement>(null);

  /* The attach button used to be a lie.
   *
   * State was `useState<string[]>` and addFiles did
   * `Array.from(fl).map((x) => x.name)` — it kept the NAMES and dropped the
   * File objects on the floor. Nothing was ever uploaded. The composer then
   * sent `Attached ${files.length} file(s)`, so a user could pick a PDF, watch
   * a chip with its filename appear, hit send, and get an answer from an
   * assistant that had never received a single byte of it. On a regulatory
   * platform, an assistant confidently answering about a document it cannot
   * see is worse than one that refuses.
   *
   * Now uploads go through the shared useChatUpload hook — the same
   * /api/chat/upload path the main Ana composer, the MDX rail and the PDEV
   * dock use, which OCRs the document and writes its text into project memory
   * so AnA can actually retrieve it. */
  const { attachments, addFiles, removeAttachment, clear: clearAttachments, statusMessage } =
    useChatUpload({ projectId });

  const readyAttachments = attachments.filter((a) => a.status === 'ready');
  const uploadingAttachments = attachments.filter((a) => a.status === 'uploading');
  const failedAttachments = attachments.filter((a) => a.status === 'error');
  const model = ANA_MODES.find((m) => m.id === mode)?.model ?? 'Balanced';
  const co = getCoauthor(segment);
  /* AnA's per-surface context is local, and no longer claims otherwise.
   *
   * This used to fetch `GET /api/coauthor?surface=…&segment=…` under a comment
   * calling it a HARD RULE that bound AnA to "the real co-author endpoint".
   * There is no such endpoint. server/routes/coauthor.ts mounts `/sessions`,
   * `/documents`, `/documents/:id` and `/templates` — it has no root handler, so
   * that request 404'd on every render of every surface, forever, and the result
   * was discarded into the same fixture fallback used when it was never issued.
   *
   * The header also carried a `<SampleTag>` whose "Sample data" state meant
   * "backend not reachable — showing sample data from the codebase fixture
   * shape". That was true while the co-author fixture supplied an invented
   * programme, a readiness percentage and an activity feed. Those fields are
   * gone (registryModel.ts), and everything the block still renders — the module
   * label, what AnA is attached to here, the CTD section for authoring surfaces,
   * the action prompts — is reference config, identical for every tenant and
   * every connection state. A pill announcing "sample data" over config would be
   * a new inaccuracy in the opposite direction, so it is removed rather than
   * re-labelled. If per-surface AnA context becomes a real server concern, add
   * the endpoint and the provenance signal together. */
  const ac: AnaContext = getAnaContext(surface.id, segment);
  const suggestions = ac.suggestions?.length ? ac.suggestions : [];
  const send = () => {
    const t = draft.trim();

    // Never send while an upload is in flight. The previous composer had no
    // concept of "in flight" at all, so this case could not arise — and that
    // was the bug.
    if (uploadingAttachments.length > 0) return;

    // Only files the server confirmed it read are referenced. A failed upload
    // must never be described as attached: the chip stays visible with its
    // error, and the message says nothing about it.
    if (!t && readyAttachments.length === 0) return;

    const names = readyAttachments.map((a) => a.name);
    const attachmentLine = names.length
      ? `Attached: ${names.join(', ')}`
      : '';

    // With text, the attachment reference is appended so AnA has both. Without
    // text, the reference IS the message — and it names the files it actually
    // received rather than counting chips the user happened to see.
    const bodyText = t ? (attachmentLine ? `${t}\n\n${attachmentLine}` : t) : attachmentLine;

    onSend(agent ? `[Agent] ${bodyText}` : bodyText);
    setDraft('');
    clearAttachments();
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
      {/* NOT aria-live. It was, and that made the entire growing transcript a
          live region: every streamed token, every new tool row and round
          heading was a mutation inside it, so a screen-reader user got the
          whole subtree re-read instead of a status message — and any narrow
          region nested inside was undefined behaviour on top. Status is
          announced by the narrow, always-mounted regions that own it:
          AnaActivity for what AnA is doing, and the upload region below. */}
      <div className="ana-body">
        {welcome && (
          <div className="ana-welcome">
            <div className="ana-welcome-greet">
              <span className="ana-welcome-mark">✻</span> {welcome.greeting}
            </div>
            <div className="ana-welcome-sub">{welcome.subline}</div>
            <div className="ana-welcome-starters">
              {welcome.starters.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className="ana-welcome-starter"
                  // A starter either opens a real flow (upload) or begins a
                  // live AnA turn — never a canned reply either way.
                  onClick={() => (s.navTo && onNav ? onNav(s.navTo) : onSend(s.prompt))}
                >
                  <span className="ico">
                    {(s.iconKey ? (I as Record<string, React.ReactNode>)[s.iconKey] : null) ?? I.sparkles}
                  </span>
                  {s.label}
                </button>
              ))}
            </div>
            {onDismissWelcome && (
              <button type="button" className="ana-welcome-dismiss" onClick={onDismissWelcome}>
                Skip for now
              </button>
            )}
          </div>
        )}
        {ac.module && (
          <div className="ana-ctx">
            <div className="ana-ctx-module">
              <span className="ico">{(ac.icon && I[ac.icon]) || I.grid}</span>
              <div className="ana-ctx-module-mid">
                <div className="ana-ctx-module-k">Working in</div>
                <div className="ana-ctx-module-v">{ac.module}</div>
              </div>
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
            {/* Stage + readiness render only when a surface's own context
                actually supplies them. They used to be unconditional, filled
                from the per-segment co-author FIXTURE — so every surface showed
                "Draft · 72% ready" about a programme that did not exist. With
                the fixture retired these are usually absent, and an absent
                readiness must show nothing rather than a confident "0%": in a
                regulated tool a fabricated completeness number is worse than no
                number at all. */}
            {(ac.stage || typeof ac.readiness === 'number') && (
              <div className="ana-ctx-grid">
                {ac.stage && (
                  <div className="ana-ctx-cell">
                    <span className="ana-ctx-k">Stage</span>
                    <span className="ana-ctx-stage">{ac.stage}</span>
                  </div>
                )}
                {typeof ac.readiness === 'number' && (
                  <div className="ana-ctx-cell">
                    <span className="ana-ctx-k">Readiness</span>
                    <span className="ana-ctx-ready">
                      <span className="ana-ctx-bar">
                        <span style={{ width: `${ac.readiness}%` }} />
                      </span>
                      {ac.readiness}%
                    </span>
                  </div>
                )}
              </div>
            )}
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
              {/* Caveats sit directly under the answer they qualify, above the
                  work record and never inside it. `useAnaChat` records a
                  server degraded-mode signal, and a timeout, on the message —
                  and on timeout it KEEPS whatever text had already streamed.
                  Nothing rendered these, so a turn cut off mid-answer showed
                  its truncated text with no sign it was truncated: an
                  incomplete result presented as a complete one. */}
              {/* The pre-mortem artifact, when this turn assembled one. No
                  `onExport` is passed: the rail has no DOCX route for it, and
                  the panel now disables that action and says where export lives
                  rather than offering a button that does nothing. */}
              {m.role === 'ana' && m.crlPremortem && (
                <div className="ana-premortem">
                  <CrlPremortemPanel artifact={m.crlPremortem} />
                </div>
              )}
              {/* How well-grounded the answer is. Above the caveats and the
                  work record on purpose: those say what went wrong and how she
                  got here, this says how far the answer can be trusted, which
                  is read first. */}
              {m.role === 'ana' && <AnaGrounding evidence={m.evidence} />}
              {/* Steers AnA accepted for this turn. Shown because a steer you
                  cannot see afterwards is one you cannot tell was taken — and
                  the server has already written it into the decision lineage. */}
              {m.role === 'ana' && Array.isArray(m.interjections) && m.interjections.length > 0 && (
                <div className="ana-steers">
                  {m.interjections.map((t, si) => (
                    <div key={si} className="ana-steer">
                      <span className="ana-steer-ic" aria-hidden="true">{I.chevRight}</span>
                      <span><span className="ana-steer-k">You steered AnA:</span> {t}</span>
                    </div>
                  ))}
                </div>
              )}
              {m.role === 'ana' && Array.isArray(m.warnings) && m.warnings.length > 0 && (
                <div className="ana-msg-warnings" role="note">
                  {m.warnings.map((w, wi) => (
                    <div key={wi} className="ana-msg-warning">
                      <span className="ana-msg-warning-ic" aria-hidden="true">{I.alertTriangle}</span>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              {m.role === 'ana' && m.activity && <AnaActivity {...m.activity} />}
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
                    {m.executedActions.map((a, i) =>
                      /* A navigation target AnA resolved is the one executed
                         action you can act on: it is an offer, not a report, so
                         it renders as a button. Everything else is a record of
                         what already happened and stays inert. Guarded on
                         `targetId` as well as the type, because a chip that
                         cannot say where it goes must not look like it can. */
                      a.actionType === 'navigate' && a.targetId && onNav ? (
                        <button
                          key={i}
                          type="button"
                          className="ana-exec-chip is-nav"
                          onClick={() => {
                            /* The directive's registry-validated params ride
                               the navParams channel so the destination opens
                               on the named tab/section; a param-less chip
                               clears any stale entry instead of inheriting. */
                            stashNavParamsForTarget(a.targetId as string, a.params);
                            onNav(a.targetId as string);
                          }}
                        >
                          {I.arrowRight} {a.label}
                        </button>
                      ) : (
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
        {/* Mid-run control.
            Every action here lands at a ROUND BOUNDARY, not instantly — the
            loop checks between rounds — so the copy says "after this step"
            rather than implying the tool in flight stops dead. Steering is the
            reason this exists: a reviewer watching AnA work a question the
            wrong way could previously only wait for her to finish, while the
            server has spliced steers into the next round, and recorded them in
            the decision lineage, all along. */}
        {streaming && (onPause || onStop || onSteer) && (
          <div className="ana-runctl" role="group" aria-label="Control this run">
            <span className="ana-runctl-state">
              <span
                className={runStatus === 'paused' ? 'ana-runctl-dot is-paused' : 'ana-runctl-dot'}
                aria-hidden="true"
              >
                {runStatus === 'paused' ? I.pause : I.dot}
              </span>
              {runStatus === 'paused' ? 'Paused after this step' : 'Working'}
            </span>

            {onSteer && (
              <form
                className="ana-runctl-steer"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = steer.trim();
                  if (!v) return;
                  onSteer(v);
                  setSteer('');
                }}
              >
                <input
                  type="text"
                  className="ana-runctl-input"
                  value={steer}
                  maxLength={2000}
                  onChange={(e) => setSteer(e.target.value)}
                  placeholder="Steer this run…"
                  aria-label="Steer this run"
                />
                <button type="submit" className="ana-runctl-go" disabled={!steer.trim()}>
                  Steer
                </button>
              </form>
            )}

            <div className="ana-runctl-actions">
              {runStatus === 'paused'
                ? onResume && (
                    <button type="button" className="ana-runctl-btn" onClick={onResume}>
                      Resume
                    </button>
                  )
                : onPause && (
                    <button type="button" className="ana-runctl-btn" onClick={onPause}>
                      Pause
                    </button>
                  )}
              {onStop && (
                <button type="button" className="ana-runctl-btn is-stop" onClick={onStop}>
                  Stop
                </button>
              )}
            </div>
          </div>
        )}
        <div className="ana-composer">
          {attachments.length > 0 && (
            <div className="ana-files">
              {attachments.map((a) => {
                // The chip states what actually happened. A chip that shows a
                // filename and nothing else is what let the old composer imply
                // a file had been received when it had not.
                const read = attachmentReadLabel(a.extractionMethod, a.extractionWords);
                const label =
                  a.status === 'uploading'
                    ? `Uploading ${a.name}…`
                    : a.status === 'error'
                      ? `${a.name} — ${a.error || 'upload failed'}`
                      : read
                        ? `${a.name} · ${read}`
                        : a.name;
                return (
                  <span
                    key={a.id}
                    className={`ana-file ana-file-${a.status}`}
                    title={label}
                  >
                    <span className="ico">{I.paperclip}</span>
                    {label}
                    <button
                      type="button"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => removeAttachment(a.id)}
                    >
                      {I.close}
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {/* Upload lifecycle for screen readers: the chips above are visual
              only, and a failed upload must be announced, not just coloured. */}
          <span aria-live="polite" style={SR_ONLY_STYLE}>
            {statusMessage}
          </span>
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
            // Was ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.xml" — it offered
            // spreadsheet and XML types the extraction service cannot read, so
            // picking one produced a chip and no content. CHAT_UPLOAD_ACCEPT is
            // the single source of truth for what the server can actually
            // extract; the picker now offers exactly that.
            accept={CHAT_UPLOAD_ACCEPT}
            className="ana-hidden-input"
            onChange={(e) => {
              addFiles(e.target.files);
              // Reset so re-picking the same file fires onChange again.
              e.target.value = '';
            }}
          />
          <input
            ref={imgRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="ana-hidden-input"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
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
                disabled={
                  uploadingAttachments.length > 0 ||
                  (!draft.trim() && readyAttachments.length === 0)
                }
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
                {/* Was "PDF · DOCX · XLSX · CSV" — XLSX and CSV are not
                    extractable, so the menu named formats that would be
                    rejected. This lists what the server can actually read. */}
                <span className="ico">{I.paperclip}</span>Attach file<span className="mh">PDF · DOCX · TXT</span>
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
              {liveDrive && (
                <button
                  type="button"
                  className="ana-menu-item"
                  data-on={liveDrive.on || undefined}
                  onClick={() => {
                    liveDrive.setOn(!liveDrive.on);
                    setModeOpen(false);
                  }}
                >
                  <span className="ico">{I.play}</span>Live Drive
                  <span className="mh">
                    {liveDrive.locked
                      ? liveDrive.locked.requiredTier
                        ? `Requires the ${liveDrive.locked.requiredTier} plan`
                        : 'Not available for this workspace'
                      : 'AnA navigates the screens; you watch and can take over'}
                  </span>
                </button>
              )}
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
          {liveDrive?.on && (
            <div className="ana-agent-note">
              <span className="ico">{I.play}</span>
              {liveDrive.locked
                ? liveDrive.locked.requiredTier
                  ? `Live Drive requires the ${liveDrive.locked.requiredTier} plan — AnA will offer destinations as chips instead.`
                  : 'Live Drive is not available for this workspace — AnA will offer destinations as chips instead.'
                : 'Live Drive — AnA navigates your screens as she works. Take over any time (Esc).'}
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
    // Match across every meaningful field, not just label/notes: the kebab id
    // (de-hyphenated so "submission center" matches "submission-center"), the
    // domain group, and the AnA tool families the surface exposes. Cap high —
    // .cmdk-list scrolls (app.css) — so ⌘K reaches the full ~99-surface registry
    // rather than stopping at the first 8 label/notes hits.
    const navs = UI_SURFACES.filter((s) => {
      const haystack = [
        s.label,
        s.notes ?? '',
        s.id.replace(/-/g, ' '),
        s.group ?? '',
        (s.anaToolFamilies ?? []).join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    }).slice(0, 25);
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
