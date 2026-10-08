/**
 * ui-v2 shell chrome, first ported from kit app/Shell.jsx:
 * Rail (the places · account menu with Apps and the client type)
 * · TopBar (breadcrumb · the open project · org · ⌘K · task/collab/bell/help)
 * · CmdK palette. The rail's list is decided in docs/design/ONE_ANA_ONE_CANVAS.md
 * §5, not ported from the kit (registryModel.ts, RAIL_CORE).
 *
 * There is no AnA rail. AnA is talked to in one place, the conversation
 * (surfaces/ConversationThread.tsx), which renders the shell's one chat with
 * every turn's work, answer, caveats, actions and Part 11 sign-off
 * (docs/design/ONE_ANA_ONE_CANVAS.md, slice 9).
 *
 * Deltas from the kit prototype, all repo-seams (INSTALL_TARGET_AUDIT):
 *  - window.I → lucide map (./icons); window.* registry globals → ./registryModel.
 *  - Org identity reads TenantContext + the authenticated user (never a
 *    hard-coded "Acme Bio"); logout calls the real authService.
 */
import React from 'react';
import { useAuth } from '@/services/portal/authService';
import { useTenant } from '@/contexts/TenantContext';
import brandMark from '@/assets/concept2cure-icon.svg';
import { I } from './icons';
import { TaskTray } from './TaskTray';
import { useShellProject } from './shellProject';
import {
  AI_ACTIONS,
  CLIENT_CATEGORIES,
  RAIL_CORE,
  breadcrumbTierOf,
  resolveSegmentId,
} from './registryModel';
import { flagAllowsSurface } from './clinicalRegulatoryGraphFlag';
import {
  isLaunchScopeLocked,
  isLocked,
  lockShortReason,
  useNavEntitlements,
  type NavSurfaceEntitlement,
} from './navEntitlements';
import { NavUnlockPanel } from './NavUnlockPanel';
import { AccountPanel } from './AccountPanel';
import { applySurfaceAction } from './surfaceActions';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

export interface ShellSurfaceRef {
  id: string;
  label: string;
  navTier?: string;
  readiness?: string;
}

/**
 * Does this viewer hold an organization-administrator role?
 *
 * One implementation, because two entry points now consume it. It began inline
 * in `Rail` — the account menu offers Admin and Access requests only to admins — and
 * ⌘K needs the same answer: both open {@link NavUnlockPanel} for a locked
 * destination, and that panel's copy branches on it (an admin is offered the
 * Apps catalog or workspace setup; a member is told to ask an administrator).
 * A second copy of this role list would let one customer get two different next
 * steps for one lock depending on whether they came from the rail or the
 * palette, which is exactly the inconsistency the panel exists to prevent.
 *
 * `String(r)` rather than trusting the declared `string[]`: roles arrive from a
 * JWT claim, and a numeric or null entry there must not throw inside the shell.
 */
function isOrgAdminRole(roles: readonly string[] | undefined): boolean {
  return (roles ?? []).some((r) =>
    ['admin', 'owner', 'super_admin', 'platform_admin', 'business_admin'].includes(String(r).toLowerCase()),
  );
}

/** Where "Get help" goes, from the account menu and the header alike: AnA, which answers
 *  questions about the product in the governed conversation. */
const HELP_SURFACE = 'conversation-thread';

/* ── Left rail ─────────────────────────────────────────────────────────── */

/** One of the places (registryModel.ts RAIL_CORE). */
type RailEntry = {
  id: string;
  label: string;
  icon: string;
  target?: string;
  applies?: { actionId: string; params: Record<string, string> };
};

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
  const acctBtnRef = React.useRef<HTMLButtonElement>(null);
  const acctMenuId = React.useId();
  /* Closing the menu without choosing (Escape, Tab, the scrim, the chosen
     client type again) hands focus back to the button that opened it. */
  const dismissAcct = () => {
    setAcct(false);
    acctBtnRef.current?.focus();
  };
  /* The person's own account — profile, password, authenticator app (P-25,
     AccountPanel.tsx). A dialog over the shell, not a routed surface, so it has
     no registry or launch-scope row: it is part of the account menu. */
  const [accountOpen, setAccountOpen] = React.useState(false);
  /* Live licence verdicts for this organization. Until the server answers —
     and permanently if it cannot — `verdictFor` returns null for everything and
     the rail renders exactly as it did before: a lock badge is a claim about a
     customer's contract, and inventing one from a failed fetch is the failure
     mode worth avoiding here, not an unlocked rail. */
  const { verdictFor, platformAdmin } = useNavEntitlements();
  /** The locked destination the human just activated, if any. */
  const [lockedFor, setLockedFor] = React.useState<NavSurfaceEntitlement | null>(null);
  const name = user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Signed in';
  const initials =
    (user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '') || name.slice(0, 2).toUpperCase();
  const role = user?.roles?.[0] ?? '';
  const isOrgAdmin = isOrgAdminRole(user?.roles);
  /* Launch scope is a release boundary, not a licence: a greyed rail entry
     for an app nobody can enable is a dead affordance. Every place is in the
     launch scope today (shellNav.test.tsx); this keeps an entry out if a
     deployment's verdicts say otherwise. The Apps catalog still lists the app
     with the reason. A feature flag that is off hides its entry as well: the
     one predicate every list of destinations reads (flagAllowsSurface, QA
     2026-10-08 j1), so the rail and Project home's grids never disagree. */
  const railVisible = (s: { id: string; target?: string }) =>
    flagAllowsSurface(s.id) && !isLaunchScopeLocked(verdictFor(s.target ?? s.id));
  /* An entry that `applies` a screen action asks it of the screen as it opens
     it, through the validated bus AnA's moves use: My work opens the task
     board on the signed-in person's tasks (registryModel.ts RAIL_CORE). The
     bus stashes the action, opens the screen, and the screen performs it once
     its read has landed. */
  const open = (s: RailEntry, target: string) => {
    const res = s.applies ? resolveSurfaceAction(s.applies.actionId, s.applies.params) : null;
    /* It opens the entry's own screen, so the address is the same as any
       other way there (/tasks, not the action's nav-target alias). */
    if (res?.ok) applySurfaceAction(res.directive, () => onNav(target));
    else onNav(target);
  };
  const navItem = (s: RailEntry) => {
    const target = s.target ?? s.id;
    /* Entitlement is keyed on the DESTINATION, not the rail entry: "New
       conversation" opens Home, so it inherits Home's verdict rather than
       looking up an id the catalog has never heard of. */
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
        onClick={() => (locked && verdict ? setLockedFor(verdict) : open(s, target))}
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
      </button>
    );
  };
  /* The collapsed rail is 56px: the 24px brand mark and this 26px toggle side
     by side inside its padding left the mark 5px wide — a sliver, and a 5px
     click target for the Document workspace (launch sweep finding 135). So
     collapsed, the mark keeps the top and the toggle moves to the foot. */
  const collapseToggle = (
    <button
      type="button"
      className="rail-collapse"
      onClick={() => setCollapsed(!collapsed)}
      title={collapsed ? 'Expand' : 'Collapse'} aria-label={collapsed ? 'Expand' : 'Collapse'}
    >
      {I.panelLeft}
    </button>
  );
  return (
    <nav className="rail" aria-label="Primary">
      <div className="rail-top">
        <button
          type="button"
          className="rail-logo"
          /* Home, where the one conversation starts (ONE_ANA_ONE_CANVAS.md §5). */
          onClick={() => onNav('home')}
          title="Home"
          aria-label="Home"
          data-on={activeId === 'home' || undefined}
        >
          <img src={brandMark} alt="" />
          <div className="rail-logo-text">
            Concept2Cure<span>.RI</span>
          </div>
        </button>
        {!collapsed && collapseToggle}
      </div>
      {/* The places (docs/design/ONE_ANA_ONE_CANVAS.md §5). One list, the same
          for every client type; Apps and the client type are in the account
          menu below. */}
      <div className="rail-scroll">
        <div className="rail-nav">{RAIL_CORE.filter(railVisible).map(navItem)}</div>
      </div>
      <div className="rail-foot">
        {collapsed && collapseToggle}
        <button
          ref={acctBtnRef}
          type="button"
          className="rail-account"
          title={name}
          aria-haspopup="menu"
          aria-expanded={acct}
          aria-controls={acct ? acctMenuId : undefined}
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
          <AccountMenu
            id={acctMenuId}
            name={name}
            initials={initials}
            role={role}
            isOrgAdmin={isOrgAdmin}
            platformAdmin={platformAdmin}
            segment={segment}
            onClose={dismissAcct}
            onGo={(id) => {
              setAcct(false);
              onNav(id);
            }}
            onAccount={() => {
              setAcct(false);
              setAccountOpen(true);
            }}
            onSegment={(id) => {
              setAcct(false);
              setSegment(id);
            }}
            onLogout={() => {
              setAcct(false);
              void logout();
            }}
          />
        )}
      </div>
      {accountOpen && (
        <AccountPanel
          onClose={() => {
            setAccountOpen(false);
            // The menu item that opened it is gone; focus returns to the menu's button.
            acctBtnRef.current?.focus();
          }}
        />
      )}
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

type AccountItem = { label: string; ic: string; to?: string; action?: 'logout' | 'account' } | { sep: true } | { clientType: true };

/**
 * The account menu: settings, the client type, help and sign-out
 * (docs/design/ONE_ANA_ONE_CANVAS.md §5, "Account menu"). The Apps catalog and
 * the client type moved here from the rail's list on 2026-10-08.
 *
 * It is a menu by the WAI-ARIA menu pattern, since the button says it opens
 * one: focus moves to the first item when it opens; ArrowUp and ArrowDown (and
 * Home and End) move between items, which are not separate Tab stops; Escape
 * closes it and returns focus to the button; Tab closes it and moves on. The
 * client types were plain Tab stops in the rail's list before they moved here,
 * so without this a keyboard user could open the menu and not reach them.
 */
function AccountMenu({
  id,
  name,
  initials,
  role,
  isOrgAdmin,
  platformAdmin,
  segment,
  onClose,
  onGo,
  onAccount,
  onSegment,
  onLogout,
}: {
  id: string;
  name: string;
  initials: string;
  role: string;
  isOrgAdmin: boolean;
  platformAdmin: boolean;
  segment: string;
  onClose: () => void;
  onGo: (id: string) => void;
  /** Open the person's own account panel (P-25). */
  onAccount: () => void;
  onSegment: (id: string) => void;
  onLogout: () => void;
}) {
  const items: AccountItem[] = [
    // Each person's own account, first, as in Claude's account menu (P-25).
    { label: 'Account', ic: 'user', action: 'account' },
    // Admin is reached from the bottom-left account menu — the same place and
    // gesture as Claude's admin/settings. Gated to org admins; admin-console
    // itself renders a non-leaky denied state, but we hide the entry entirely
    // for non-admins to mirror Claude exactly.
    ...(isOrgAdmin ? [{ label: 'Admin', ic: 'shieldCheck', to: 'admin-console' }] : []),
    // Licensing is the PLATFORM operator's console, not the customer's plan
    // page (that is "View all plans" below). It is offered only when the server
    // says its guard admits this viewer — `platformAdmin` is that guard's own
    // function (resolvePlatformAdmin). It used to be offered on `isOrgAdmin`, so
    // every customer org admin opened seven tabs that each refused them. The
    // guard still re-checks every read and write; this only decides the offer.
    ...(platformAdmin ? [{ label: 'Licensing', ic: 'checkSquare', to: 'master-licensing' }] : []),
    /* Where a member's request for a locked module lands. Without this entry the
       lock panel's one instruction — "ask an administrator" — points at nobody:
       the request is recorded, and the person who can approve it has no way to
       find it. The queue is org-scoped server-side; this only decides whether
       the entry is offered. */
    ...(isOrgAdmin ? [{ label: 'Access requests', ic: 'clipboardList', to: 'access-requests' }] : []),
    { label: 'Usage & limits', ic: 'barChart', to: 'usage' },
    { label: 'Billing', ic: 'creditCard', to: 'billing' },
    /* Every app, with the reason a locked one is locked. It was an entry in
       the rail's "Explore" section. */
    { label: 'Apps catalog', ic: 'grid', to: 'apps' },
    { sep: true },
    { clientType: true },
    { sep: true },
    { label: 'View all plans', ic: 'checkSquare', to: 'licensing' },
    { label: 'Set up a workspace', ic: 'rocket', to: 'onboarding' },
    { label: 'Codebase coverage', ic: 'grid', to: 'coverage' },
    { label: 'Get help', ic: 'help', to: HELP_SURFACE },
    { sep: true },
    { label: 'Log out', ic: 'logOut', action: 'logout' },
  ];
  const chosen = resolveSegmentId(segment);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuItems = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? []);
  React.useEffect(() => {
    menuItems()[0]?.focus();
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = menuItems();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      list[(i + list.length) % list.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? list.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      /* Not the shell's own Escape (the phone-width drawer) as well. */
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Tab') {
      /* Focus goes back to the button first, so Tab moves on from there. */
      onClose();
    }
  };
  return (
    <>
      <div className="acct-scrim" onClick={onClose} />
      <div id={id} ref={menuRef} className="acct-menu" role="menu" aria-label="Account" onKeyDown={onKeyDown}>
        <div className="acct-head">
          <div className="avatar">{initials}</div>
          <div className="who">
            <div className="nm">{name}</div>
            <div className="rl">{role}</div>
          </div>
        </div>
        {items.map((it, i) => {
          if ('sep' in it) return <div key={i} className="acct-sep" />;
          if ('clientType' in it) {
            /* The client type is a setting, chosen in this one place. It was the
               rail's "Client categories" list. It scopes modules, the default
               screen and AnA's context; the places stay the same. A chosen type
               carries a check mark as well as its state, so colour is never the
               only channel. */
            return (
              <div key={i} role="group" aria-label="Client type" className="acct-group">
                <div className="acct-sec" aria-hidden="true">Client type</div>
                {CLIENT_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="acct-item"
                    role="menuitemradio"
                    tabIndex={-1}
                    aria-checked={chosen === c.id}
                    /* Choosing the type already chosen changes nothing, so it
                       does not move the person off their screen either. */
                    onClick={() => (chosen === c.id ? onClose() : onSegment(c.id))}
                  >
                    <span className="ico">{I[c.icon] ?? I.grid}</span>
                    <span className="lbl">{c.label}</span>
                    {chosen === c.id && <span className="acct-check" aria-hidden="true">{I.check}</span>}
                  </button>
                ))}
              </div>
            );
          }
          return (
            <button
              key={i}
              type="button"
              className="acct-item"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                if (it.action === 'logout') onLogout();
                else if (it.action === 'account') onAccount();
                else if (it.to) onGo(it.to);
              }}
            >
              <span className="ico">{I[it.ic] ?? I.grid}</span>
              <span className="lbl">{it.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ── Topbar ───────────────────────────────────────────────────────────── */

/**
 * The open project, named (FILING_SPINE F8). No screen said which filing a
 * person was in, and the top bar's control here was "Switch client domain": a
 * second place to set the client type, which the account menu already sets
 * (FILING_SPINE §6 row 10). The project is the filing, so the chip names it by
 * code, or by title when it has none, and opens its page. With none open it
 * says so and opens Projects, where one is chosen. It reads the shell's one
 * project channel, so it changes the moment a surface opens another project.
 */
function ProjectChip({ here, onNav }: { here: string; onNav?: (id: string) => void }) {
  const openProject = useShellProject();
  if (!openProject) {
    return (
      <button type="button" className="tb-proj" data-empty="true" onClick={() => onNav?.('projects')} title="Choose a project in Projects">
        <span className="ico" aria-hidden="true">{I.folder}</span>
        <span className="tb-proj-lbl">No project open</span>
        {/* The label is a state; this says what the button does, for a screen
            reader, where the title tooltip is not reliably read. */}
        <span className="sr-only">. Choose one in Projects</span>
      </button>
    );
  }
  const code = String(openProject.code ?? '').trim();
  const title = String(openProject.title ?? '').trim();
  const name = code || title;
  return (
    <button
      type="button"
      className="tb-proj"
      onClick={() => onNav?.('project-home')}
      title={[code, title].filter(Boolean).join(' — ') || 'The open project'}
      aria-current={here === 'project-home' ? 'page' : undefined}
    >
      <span className="ico" aria-hidden="true">{I.folder}</span>
      {/* A project opened by id alone (a deep link) has no name in the channel
          yet; the chip says what it does rather than invent one. */}
      {name && <span className="sr-only">Open project </span>}
      <span className="tb-proj-lbl">{name || 'Open project'}</span>
    </button>
  );
}

export function TopBar({
  surface,
  onPalette,
  onNav,
  onAsk,
}: {
  surface: ShellSurfaceRef;
  onPalette: () => void;
  /** Not read here since the top bar stopped setting the client type
   *  (FILING_SPINE F8): it is chosen in the account menu, which the rail
   *  renders. Kept so the shell's call site is unchanged by that slice. */
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
  const tier = breadcrumbTierOf(surface);
  return (
    <header className="topbar">
      <div className="crumbs">
        <span className="crumb-root">Concept2Cure.RI</span>
        <span className="sep crumb-root-sep" aria-hidden="true">›</span>
        {/* A surface in both client categories has no tier crumb; this drew an
            empty one between two separators ("Concept2Cure.RI › › Quality"),
            launch sweep finding 129. */}
        {tier && (
          <>
            <span className="crumb-tier">{tier.label}</span>
            <span className="sep" aria-hidden="true">›</span>
          </>
        )}
        <span className="here">{surface.label}</span>
      </div>
      <div className="tb-spacer" />
      <ProjectChip here={surface.id} onNav={onNav} />
      {/* The organisation this session is scoped to — a label, not a control.
          It was a button with a dropdown chevron, no handler and the tooltip
          "switcher lands with the auth flow phase" (launch sweep finding 131).
          A session's token carries one organisation; there is no switch to
          offer until the server has one. */}
      <div className="tb-org" title={orgName}>
        <span className="tb-org-mark" aria-hidden="true">{orgMark}</span>
        <span className="tb-org-name">{orgName}</span>
      </div>
      <button type="button" className="tb-cmdk" onClick={onPalette} aria-label="Search, jump, or run a command" title="Search, jump, or run a command (⌘K)">
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
        onClick={() => { try { (window as any).C2C?.open?.('task'); } catch { /* launcher not mounted */ } }}
      >
        <span className="ico">{I.checkSquare ?? I.plus}</span>
        <span className="tb-task-lbl">Task</span>
      </button>
      <button
        type="button"
        className="tb-btn"
        title="Collaborate — message a colleague about this screen"
        aria-label="Collaborate"
        onClick={() => { try { (window as any).C2C?.open?.('collab'); } catch { /* launcher not mounted */ } }}
      >
        {I.messageSquare}
      </button>
      <TaskTray onNav={onNav} onAsk={onAsk} />
      {/* Where the account menu's "Get help" goes. It had no handler at all
          (launch sweep finding 132). */}
      <button
        type="button"
        className="tb-btn"
        title="Get help"
        aria-label="Get help"
        onClick={() => onNav?.(HELP_SURFACE)}
      >
        {I.help}
      </button>
    </header>
  );
}

/* ── ⌘K palette ───────────────────────────────────────────────────────── */
interface CmdKItem {
  id: string;
  kind: string;
  label: string;
  hint?: string;
  icon?: string;
  /**
   * The licence verdict for a `nav` result, carried ONLY when the server
   * returned a refusal for that destination.
   *
   * One optional field rather than a `locked` boolean beside a nullable
   * verdict, because that pair has an unrepresentable-but-writable state: a row
   * marked locked with no verdict to explain it — a dead end with no reason and
   * no next step. Absent here covers all three "render it exactly as before"
   * cases at once: the fetch has not resolved, the fetch failed, or the catalog
   * carries no row for the id (navEntitlements.tsx rules 1 and 2).
   */
  lock?: NavSurfaceEntitlement;
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
  const { user } = useAuth();
  /* The SAME verdict set the rail reads. The provider is mounted once above the
     whole shell (V2App), so this is a context read, not a second fetch: two
     fetches could disagree about whether a destination is locked, and the rail
     and the palette would then describe one contract two ways. Until it answers
     — and permanently if it cannot — `verdictFor` returns null for everything
     and the palette behaves exactly as it did before this gate existed. */
  const { verdictFor } = useNavEntitlements();
  const isOrgAdmin = isOrgAdminRole(user?.roles);
  /** The locked destination the human just activated from the palette. */
  const [lockedFor, setLockedFor] = React.useState<NavSurfaceEntitlement | null>(null);
  React.useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      /* Reopening the palette dismisses an explanation left over from an
         earlier activation. Activating a locked result closes the palette and
         opens the panel, so the two are never meant to be stacked; without this
         a ⌘K pressed while the panel is up would put the palette underneath a
         dialog the human has not answered yet. */
      setLockedFor(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const term = q.replace(/^[/>]\s?/, '').toLowerCase();
  const isCmd = q.startsWith('>');

  const items = React.useMemo<CmdKItem[]>(() => {
    /**
     * Every navigation result is built here, so the palette's two branches —
     * the empty-query "Jump to" list and a search hit — cannot drift on
     * entitlement. They did not merely drift before: NEITHER checked, so ⌘K
     * handed a customer a one-keystroke route into a destination the rail had
     * greyed out and explained. The rail's gate is only wayfinding, and a
     * second door past it means the explanation never reaches them.
     */
    const navResult = (s: { id: string; label: string; icon?: string }): CmdKItem => {
      const verdict = verdictFor(s.id);
      /* `isLocked` is already false for both null cases; the explicit null test
         is what carries the verdict into the branch for TypeScript, and it
         makes the "no verdict ⇒ no lock" rule readable at the call site. */
      const lock = verdict !== null && isLocked(verdict) ? verdict : undefined;
      return {
        id: s.id,
        kind: 'nav',
        label: s.label,
        /* The hint column normally carries the destination's domain group. For
           a locked one it carries the REASON instead: once the row cannot be
           opened, which domain it belongs to is the less useful of the two
           facts, and the reason has to be visible without hovering. It is the
           server's own reason per verdict — never a blanket "upgrade", which
           would be wrong for a module an admin switched off (nothing to buy)
           or one outside the workspace's industry mode (no plan fixes it). */
        hint: lock
          ? lockShortReason(lock)
          : breadcrumbTierOf(s)?.label,
        icon: s.icon,
        lock,
      };
    };
    // NOTE(Phase 3): the kit also searches filings, documents, conversations,
    // pathways, people and templates from its fixture files — those categories
    // join as their surface families port.
    if (!q.trim()) {
      return [
        { id: '_hd_jump', kind: 'header', label: 'Jump to' },
        ...UI_SURFACES.slice(0, 8).map(navResult),
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
      navs.forEach((s) => results.push(navResult(s)));
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
    /* `verdictFor` is memoised by the provider on the payload, so this list
       rebuilds once — when the verdicts land — and not on every render. */
  }, [q, term, isCmd, verdictFor]);

  const selectable = React.useMemo(() => items.filter((it) => it.kind !== 'header'), [items]);

  const run = React.useCallback(
    (it?: CmdKItem) => {
      if (!it || it.kind === 'header') return;
      /* A locked destination never navigates — from here any more than from the
         rail. Routing there would 403, or worse render an empty surface that
         reads as "there is nothing here" rather than "your organization has not
         licensed this". Instead the palette closes and hands over to the one
         panel that explains the verdict and offers the step that resolves THAT
         reason, so both entry points give the customer one answer. */
      if (it.lock) {
        setLockedFor(it.lock);
        onClose();
        return;
      }
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

  /* Rendered OUTSIDE the `open` branch on purpose. Activating a locked result
     closes the palette, so a panel mounted inside that branch would unmount in
     the same commit as the activation that asked for it — the customer would
     see the palette vanish and nothing take its place, which reads as the
     product swallowing their keystroke. CmdK itself stays mounted whether or
     not it is showing (V2App renders it unconditionally), so this is the one
     place the explanation can outlive the palette. */
  const unlock = lockedFor ? (
    <NavUnlockPanel
      verdict={lockedFor}
      isOrgAdmin={isOrgAdmin}
      onClose={() => setLockedFor(null)}
      onNav={onNav}
    />
  ) : null;

  if (!open) return unlock;
  let selIdx = -1;
  return (
    <>
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
                /* Locked is a data attribute, never `disabled` — the same
                   decision the rail made, for the same reason. A disabled row
                   drops out of the arrow-key cursor and out of `selectable`
                   here, so the one result a customer most needs an answer about
                   would be the one result they could not reach or interrogate.
                   It stays an ordinary row that Enter activates; only its
                   destination changes. */
                data-locked={it.lock ? true : undefined}
                onMouseEnter={() => setSel(si)}
                onClick={() => run(it)}
                /* The reason reaches assistive tech through the accessible
                   NAME, exactly as in the rail: the lock glyph is decorative
                   and the muted row is never the only channel. Title carries
                   the same sentence so a hover and a screen reader are never
                   told two different things about one row. */
                aria-label={it.lock ? `${it.label} — ${lockShortReason(it.lock)}` : undefined}
                title={it.lock ? `${it.label} — ${lockShortReason(it.lock)}` : undefined}
              >
                <span className="ico">{(it.icon && I[it.icon]) || I.arrowRight}</span>
                <span className="lbl">{it.label}</span>
                {it.lock && (
                  <span className="nav-lic" data-lic="off" aria-hidden="true">
                    {I.lock}
                  </span>
                )}
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
    {unlock}
    </>
  );
}
