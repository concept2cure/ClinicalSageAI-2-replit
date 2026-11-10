/**
 * ui-v2 shell chrome, first ported from kit app/Shell.jsx:
 * Rail (the places, then the work areas · account menu with the client type)
 * · TopBar (the open project and where you are · collaborate, new task, your work)
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
import { hasKeys, useLiveData } from './dataConnect';
import { isOrgAdminRole } from './orgAdmin';
import { canAdministerBilling } from '@shared/constants/permissions';
import { TaskTray } from './TaskTray';
import { readShellProject, shellProgramName, updateShellProject, useShellProject, type ShellProject, reopenLastProject, noteRecentProject } from './shellProject';
import { destinationFor } from './routing';
import { OPEN_PROGRAM_SURFACE } from './programAction';
import { isMdxProjectFeature } from '@shared/constants/mdx-project-features';
import { openPaletteProject, paletteProjectResults, shellProjectOfPalette, usePaletteProjects, type PaletteProject, type PaletteProjectsRead } from './paletteProjects';

import {
  AI_ACTIONS,
  CLIENT_CATEGORIES,
  DEEP_LINK_ALIASES,
  RAIL_CORE,
  RAIL_WORK_AREAS_LABEL,
  PROJECTS_CRUMB,
  breadcrumbTierOf,
  resolveSegmentId,
  type SurfaceApplies,
} from './registryModel';
import { flagAllowsSurface } from './clinicalRegulatoryGraphFlag';
import { PJ_LIFECYCLE } from './fixtures/project-home-data';
import {
  isLaunchScopeLocked,
  isLocked,
  lockShortReason,
  useNavEntitlements,
  type NavSurfaceEntitlement,
} from './navEntitlements';
import { NavUnlockPanel } from './NavUnlockPanel';
import { AccountPanel } from './AccountPanel';
import { OrganizationAccess } from './OrganizationAccess';
import { WhatAnaRemembers } from './WhatAnaRemembers';
import { applySurfaceAction } from './surfaceActions';
import { surfaceLeaveRefusal } from './navParams';
import { ceremonyOpen } from './ceremony';
import { C2CToast, useToast } from './toast';
import { useSurfaceAvailable } from './surfaceAvailable';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

export interface ShellSurfaceRef {
  id: string;
  label: string;
  navTier?: string;
  readiness?: string;
}


/** Where the account menu's "Get help" goes: AnA, which answers questions about the
 *  product in the governed conversation. The top bar's own Help button went in D1-2
 *  (D1.md §D1.B step 4); this is its one place now. */
const HELP_SURFACE = 'conversation-thread';

/** New conversation: Home's composer, where a question starts one (C2C_CONVO =
 *  { id: 'new', seed }). The sidebar's action and the top bar's phone button share
 *  it (D1.md §D1.A step 1, §D1.B step 3); each asks its own leave guard first. */
function openNewConversation(onNav: (id: string) => void) {
  onNav('home');
  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.landing-input')?.focus());
}

/** One of the person's conversations, through the shell's one conversation channel
 *  (C2C_CONVO = { id }). The sidebar's Recents and ⌘K's "Recent conversations" share
 *  it (D1.md §D1.F step 2); each asks its own leave guard first. */
function openConversation(id: string, onNav: (id: string) => void) {
  window.C2C_CONVO = { id };
  onNav('conversation-thread');
}

/** Preflight chrome requests before dispatch; surface-owned saved handoffs keep their own controls. */
function useShellLeaveGuard(onNav?: (id: string) => void) {
  const [notice, notify] = useToast();
  const canLeave = React.useCallback((navigationDialog?: Element | null) => {
    let reason = ceremonyOpen()
      ? 'Finish or cancel the open governed form before navigating.'
      : surfaceLeaveRefusal(navigationDialog);
    if (!reason) {
      const leave = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(leave);
      if (leave.defaultPrevented) reason = 'Save or discard your unsaved document changes before navigating.';
    }
    if (reason) {
      notify(reason, 'error');
      return false;
    }
    notify('', 'error');
    return true;
  }, [notify]);
  const go = (id: string) => { if (canLeave()) onNav?.(id); };
  return { canLeave, go, notify, leaveNotice: <C2CToast msg={notice} /> };
}

/* ── Left rail ─────────────────────────────────────────────────────────── */

/** One of the places (registryModel.ts RAIL_CORE). */
type RailEntry = {
  id: string;
  label: string;
  icon: string;
  target?: string;
  applies?: SurfaceApplies;
  group?: 'work-areas';
};

/** The project's page and the old ids that land on it (registryModel.ts DEEP_LINK_ALIASES). */
const PROJECT_PAGE_IDS: ReadonlySet<string> = new Set([
  'project-home',
  ...Object.keys(DEEP_LINK_ALIASES).filter((id) => DEEP_LINK_ALIASES[id] === 'project-home'),
]);

/** The project's work areas that have no rail entry of their own: they are opened
 *  from the project's page (ProjectCoreWork.tsx) and work on the open project.
 *  Biostatistics left the rail for the project (RULE 4); its calculators are its own. */
const PROJECT_WORK_IDS: ReadonlySet<string> = new Set(['protocol-dev', 'biostatistics']);

/**
 * The rail entry a screen is shown under. A screen with its own entry is its own.
 * The project's page, its work areas and a project feature (crumbed under Projects,
 * breadcrumbTierOf) have none: inside a project, Projects is the place the person is
 * in, so the rail marks it. Before 2026-10-31 nothing was marked inside a project.
 */
export function railTargetOf(activeId: string): string {
  if ((RAIL_CORE as readonly RailEntry[]).some((s) => (s.target ?? s.id) === activeId)) return activeId;
  const inProject = PROJECT_PAGE_IDS.has(activeId) || PROJECT_WORK_IDS.has(activeId) || isMdxProjectFeature(activeId);
  return inProject ? PROJECTS_CRUMB.id : activeId;
}


/** A role value as words: "admin" → "Admin", "org_admin" → "Org admin" (D1.md §D1.A step 2). */
function roleWords(role: string): string {
  const words = role.replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

/** Phone width, where the expanded sidebar is a drawer over the page (app-v2.css, the phone block). */
function phoneWidth(): boolean {
  try {
    return window.matchMedia('(max-width: 640px)').matches;
  } catch {
    return false;
  }
}

export function Rail({
  activeId,
  onNav,
  collapsed,
  setCollapsed,
  segment,
  setSegment,
  onSearch,
}: {
  activeId: string;
  onNav: (id: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  segment: string;
  setSegment: (id: string) => void;
  /** Opens the command palette: Claude's "Search" in the sidebar. */
  onSearch?: () => void;
}) {
  const { user, logout } = useAuth();
  const { canLeave, notify, leaveNotice } = useShellLeaveGuard();
  const recentProjects = useRailRecentProjects();
  /* The organisation's name, or none (P-25): the account's second line, as
     Claude's sidebar shows the organisation under the person (D1.md §D1.A step 2). */
  const org: string | null = useTenant()?.currentOrganization?.name?.trim() || null;
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
  /* What AnA remembers (WhatAnaRemembers.tsx), from anywhere: it was reached
     only from a conversation's header. The same drawer, the same props as
     ConversationThread.tsx gives it (D1.md §D1.A step 3). */
  const [remembersOpen, setRemembersOpen] = React.useState(false);
  /* At phone width the expanded sidebar is a drawer over the page, so choosing
     an item in it also closes it (D1.md §D1.A step 7). Wider, it stays. */
  const closeOnPhone = () => {
    if (phoneWidth()) setCollapsed(true);
  };
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
     deployment's verdicts say otherwise. Subscription & features still lists the
     feature with the reason. A feature flag that is off hides its entry as well: the
     one predicate every list of destinations reads (flagAllowsSurface, QA
     2026-10-08 j1), so the rail and Project home's grids never disagree. */
  const railVisible = (s: { id: string; target?: string }) =>
    flagAllowsSurface(s.id) && !isLaunchScopeLocked(verdictFor(s.target ?? s.id));
  const visible: RailEntry[] = RAIL_CORE.filter(railVisible);
  const places = visible.filter((s) => !s.group);
  const workAreas = visible.filter((s) => s.group === 'work-areas');
  const workAreasId = React.useId();
  const railActive = railTargetOf(activeId);
  /* An entry that `applies` a screen action asks it of the screen as it opens
     it, through the validated bus AnA's moves use: Tasks opens the task
     board on everyone's tasks (registryModel.ts RAIL_CORE). The
     bus stashes the action, opens the screen, and the screen performs it once
     its read has landed. */
  const open = (s: RailEntry, target: string) => {
    if (!canLeave()) return;
    closeOnPhone();
    const res = s.applies ? resolveSurfaceAction(s.applies.actionId, s.applies.params) : null;
    /* It opens the entry's own screen, so the address is the same as any
       other way there (/tasks, not the action's nav-target alias). */
    if (res?.ok) applySurfaceAction(res.directive, () => onNav(target));
    else onNav(target);
    /* A project screen needs a project. Reopen the one this account last had
       open before deciding anything, which is the rule shellProject states and
       nothing called: "a project screen reopens the last project the signed-in
       account opened, and never another account's"
       (railOpensWithoutProject.test.ts). Without this the entry is a dead end —
       the router sends a project-scoped target with nothing open to Projects
       (routing.ts destinationFor), so the work area never opens and reads as
       missing. Found on 2026-11-09, on Biostatistics, by the founder: its
       target became project-scoped that day and the door closed with it. It was
       true of CMC and every other work area before that.

       Only then the notice, and only when there is genuinely no project to
       reopen — the one case where Projects is the right answer. Said rather
       than silent: from Projects the click looked dead (2026-10-31). */
    if (target !== OPEN_PROGRAM_SURFACE && destinationFor(target, Boolean(readShellProject())).surfaceId === OPEN_PROGRAM_SURFACE) {
      if (!reopenLastProject()) {
        notify(`Open a project to see its ${s.label}. Choose one in Projects.`, 'ok');
      }
    }
  };
  const navItem = (s: RailEntry) => {
    const target = s.target ?? s.id;
    /* Entitlement is keyed on the DESTINATION, not the rail entry: "New
       conversation" opens Home, so it inherits Home's verdict rather than
       looking up an id the catalog has never heard of. */
    const verdict = verdictFor(target);
    const locked = isLocked(verdict);
    const current = railActive === target;
    return (
      <button
        key={s.id}
        type="button"
        className="nav-item"
        data-on={current || undefined}
        /* Locked is a data attribute, not `disabled`. A disabled control is
           unreachable by keyboard and explains nothing — the entitlements spec
           requires a locked destination to stay an activatable, labelled
           affordance that opens an honest panel. */
        data-locked={locked || undefined}
        aria-current={current ? 'page' : undefined}
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
  const rail = (
    <nav className="rail" aria-label="Primary">
      <div className="rail-top">
        <button
          type="button"
          className="rail-logo"
          /* Home, where the one conversation starts (ONE_ANA_ONE_CANVAS.md §5). */
          onClick={() => {
            if (!canLeave()) return;
            closeOnPhone();
            onNav('home');
          }}
          title="Home"
          aria-label="Home"
        >
          <img src={brandMark} alt="" />
          <div className="rail-logo-text">
            Concept2Cure<span>.RI</span>
          </div>
        </button>
        {!collapsed && collapseToggle}
      </div>
      {/* Claude's sidebar opens with its primary action and Search, above the
          places (D1.md §D1.A step 1). New conversation is an action, not a place
          (no RAIL_CORE entry): it opens Home's composer, where a question starts
          a new conversation (C2C_CONVO = { id: 'new', seed }). Search opens the
          command palette (⌘K). */}
      <div className="rail-nav rail-actions">
        <button type="button" className="nav-item rail-new" title="New conversation" onClick={() => {
          if (!canLeave()) return;
          closeOnPhone();
          openNewConversation(onNav);
        }}>
          <span className="ico" aria-hidden="true">{I.plus}</span>
          <span className="lbl">New conversation</span>
        </button>
        {onSearch && (
          <button type="button" className="nav-item" title="Search (⌘K)" onClick={() => {
            closeOnPhone();
            onSearch();
          }}>
            <span className="ico">{I.search}</span>
            <span className="lbl">Search</span>
          </button>
        )}
      </div>
      {/* The places, then the work areas under their heading
          (registryModel.ts RAIL_CORE). One list, the same for every client
          type; the client type is in the account menu below. Collapsed, the
          heading is a rule, so the two groups still read as two. */}
      <div className="rail-scroll">
        {/* Claude's sidebar: the places, then the work areas, then Recents.
            Home is where a conversation starts. */}
        <div className="rail-nav">{places.map(navItem)}</div>
        {workAreas.length > 0 && (
          <div className="rail-nav rail-group" role="group" aria-labelledby={workAreasId}>
            <div className="rail-group-h" id={workAreasId}>{RAIL_WORK_AREAS_LABEL}</div>
            {workAreas.map(navItem)}
          </div>
        )}
        {!collapsed && <RailRecents
          projects={recentProjects}
          onOpen={(id) => {
            if (!canLeave()) return;
            closeOnPhone();
            openConversation(id, onNav);
          }}
          onOpenProject={(p) => {
            if (!canLeave()) return;
            closeOnPhone();
            openPaletteProject(p, onNav);
          }}
        />}
      </div>
      {/* The account at the bottom, with the organisation's access beside it
          (OrganizationAccess.tsx, moved from the top bar: D1.md §D1.A step 2).
          Collapsed, the foot stacks the expand toggle, organisation access, then
          the avatar, in that order for the eye and for Tab alike. */}
      <div className="rail-foot">
        {collapsed && collapseToggle}
        {collapsed && <OrganizationAccess />}
        <button
          ref={acctBtnRef}
          type="button"
          className="rail-account"
          title={[name, org].filter(Boolean).join(' · ')}
          aria-haspopup="menu"
          aria-expanded={acct}
          aria-controls={acct ? acctMenuId : undefined}
          onClick={() => setAcct((v) => !v)}
          data-open={acct || undefined}
        >
          <div className="avatar">{initials}</div>
          <div className="who">
            <div className="nm">{name}</div>
            <div className="rl">{org ?? roleWords(role)}</div>
          </div>
          <span className="chev">{I.down}</span>
        </button>
        {!collapsed && <OrganizationAccess />}
        {acct && (
          <AccountMenu
            id={acctMenuId}
            name={name}
            initials={initials}
            role={role}
            org={org}
            isOrgAdmin={isOrgAdmin}
            billingAdmin={canAdministerBilling(user)}
            platformAdmin={platformAdmin}
            segment={segment}
            onClose={dismissAcct}
            onGo={(id) => {
              if (!canLeave()) return;
              setAcct(false);
              closeOnPhone();
              onNav(id);
            }}
            onAccount={() => {
              setAcct(false);
              setAccountOpen(true);
            }}
            onRemembers={() => {
              setAcct(false);
              setRemembersOpen(true);
            }}
            onSegment={(id) => {
              if (!canLeave()) return;
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
      {remembersOpen && (
        <WhatAnaRemembers
          projectRef={readShellProject()?.id ?? null}
          projectName={shellProgramName()}
          onClose={() => {
            setRemembersOpen(false);
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
  /* The rail's notices sit beside it, not in it: at phone width choosing an item
     closes the drawer, and the collapsed rail is not drawn there (app-v2.css), so a
     notice inside it ("Open a project to see its Vault…") would never be seen. */
  return <>{rail}{leaveNotice}</>;
}

type AccountItem = { label: string; ic: string; to?: string; action?: 'logout' | 'account' | 'remembers' } | { sep: true } | { clientType: true };

/**
 * The account menu: settings, the client type, help and sign-out
 * (docs/design/ONE_ANA_ONE_CANVAS.md §5, "Account menu"). The client type
 * moved here from the rail's list on 2026-10-08; the module catalog is here as
 * "Subscription & features", for organization administrators, since 2026-10-25
 * (named so on 2026-10-26: "Plan" is the project's first step, the
 * subscription is "subscription", section 9 of
 * .design/client-journey/INFORMATION_ARCHITECTURE.md). Each entry carries its
 * surface's registry label, as the breadcrumb and ⌘K do, except a billing
 * administrator's one entry to Licensing, "Subscription & billing" (P-68); they are written out
 * because config/ui-surface-registry.json's audit (npm run audit:ui-authority)
 * reads this menu's labels from this file, and shellNav.test.tsx and
 * clientNamesSlice1.test.tsx hold them to the registry.
 *
 * It is a menu by the WAI-ARIA menu pattern, since the button says it opens
 * one: focus moves to the first item when it opens; ArrowUp and ArrowDown (and
 * Home and End) move between items, which are not separate Tab stops; Escape
 * closes it and returns focus to the button; Tab closes it and moves on. The
 * client types were plain Tab stops in the rail's list before they moved here,
 * so without this a keyboard user could open the menu and not reach them.
 */
/** How many of the person's own conversations the sidebar lists. */
const RAIL_RECENTS = 15;

/** How many recent projects the sidebar lists, above the conversations. */
const RAIL_RECENT_PROJECTS = 3;
/** The project list Home and the palette read (PALETTE_PROJECTS_URL's route), newest-updated first. */
const RAIL_PROJECTS_URL = `/api/c2c/projects?limit=${RAIL_RECENT_PROJECTS}`;
const isRows = (v: unknown): v is unknown[] => Array.isArray(v);

/** One project row as the palette reads it (paletteProjects.ts PaletteProject), or null. */
function railProjectOf(row: unknown): PaletteProject | null {
  const r = (row ?? {}) as Record<string, unknown>;
  const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const id = text(r.id);
  const title = text(r.title);
  return id && title ? { id, title, code: text(r.code), ws: text(r.ws), status: text(r.status) } : null;
}

/** One of the person's own AnA conversations, as GET /api/chat/threads lists it. */
interface RecentThread { id: string; title?: string | null }
/** The person's recent conversations as the sidebar and the palette read them. */
interface RecentThreadsRead { threads: RecentThread[]; loading: boolean; failed: boolean }
const hasThreads = hasKeys<{ threads: unknown }>('threads');
/** A list of threads; anything else (no `threads`, or not a list) is a failed read. */
const isThreadList = (v: unknown): v is { threads: RecentThread[] } => hasThreads(v) && Array.isArray(v.threads);

/**
 * The person's own AnA conversations, newest first (GET /api/chat/threads, the
 * caller's own threads in the organisation), at most `limit`, read while
 * `enabled`: always for the sidebar's Recents, while it is open for ⌘K's
 * "Recent conversations" (D1.md §D1.F step 2). A reply without `threads` is a
 * failed read; it is never shown as none.
 */
function useRecentThreads(limit: number, enabled = true): RecentThreadsRead {
  const read = useLiveData<{ threads: RecentThread[] }>(enabled ? `/api/chat/threads?limit=${limit}` : null, [], isThreadList);
  const { data, loading, error } = read;
  return React.useMemo(
    () => ({ threads: (data?.threads ?? []).slice(0, limit), loading, failed: Boolean(error) }),
    [data, loading, error, limit],
  );
}

/**
 * Recents, as in Claude's sidebar: up to three recent projects, then the
 * person's own AnA conversations, newest first (useRecentThreads, the same
 * read Home used to list), under one heading. A reply without `threads` is a
 * failed read and says so; it is never shown as none. The projects come from
 * the list route Home and the palette read; a failed project read shows no
 * project rows and never blocks the conversations (D1.md §D1.A step 4).
 */
/**
 * The account's most recent projects, newest-updated first, from the list route
 * Home and the palette read; none when the read fails. Read by the rail itself,
 * collapsed or not, because a project screen chosen with no project open
 * reopens the first of them when this account never opened one here
 * (shellProject.ts noteRecentProject).
 */
function useRailRecentProjects(): PaletteProject[] {
  const { data, error } = useLiveData<unknown[]>(RAIL_PROJECTS_URL, [], isRows);
  const projects = React.useMemo(() => (error || !Array.isArray(data)
    ? []
    : data.map(railProjectOf).filter((p): p is PaletteProject => p !== null).slice(0, RAIL_RECENT_PROJECTS)), [data, error]);
  const first = projects[0] ?? null;
  React.useEffect(() => { noteRecentProject(first ? shellProjectOfPalette(first) : null); }, [first]);
  return projects;
}

function RailRecents({ projects, onOpen, onOpenProject }: { projects: PaletteProject[]; onOpen: (id: string) => void; onOpenProject: (p: PaletteProject) => void }) {
  const headId = React.useId();
  const read = useRecentThreads(RAIL_RECENTS);
  const { threads } = read;
  return (
    <div className="rail-nav rail-group rail-recents" role="group" aria-labelledby={headId} data-testid="rail-recents">
      <div className="rail-group-h" id={headId}>Recents</div>
      {projects.map((p) => (
        <button key={`p-${p.id}`} type="button" className="nav-item rail-recent" title={[p.code, p.title].filter(Boolean).join(' — ')}
          onClick={() => onOpenProject(p)}>
          <span className="ico" aria-hidden="true">{I.folder}</span>
          <span className="lbl">{p.title.slice(0, 120)}</span>
        </button>
      ))}
      {read.loading ? (
        <div className="rail-recents-note" role="status">Loading…</div>
      ) : read.failed ? (
        <div className="rail-recents-note" role="alert">Couldn&rsquo;t load your conversations.</div>
      ) : threads.length === 0 ? (
        <div className="rail-recents-note">Your conversations appear here.</div>
      ) : (
        threads.map((t) => (
          <button key={t.id} type="button" className="nav-item rail-recent" title={t.title || 'Untitled conversation'}
            onClick={() => onOpen(t.id)}>
            <span className="lbl">{(t.title || 'Untitled conversation').slice(0, 120)}</span>
          </button>
        ))
      )}
    </div>
  );
}

function AccountMenu({
  id,
  name,
  initials,
  role,
  org,
  isOrgAdmin,
  billingAdmin,
  platformAdmin,
  segment,
  onClose,
  onGo,
  onAccount,
  onRemembers,
  onSegment,
  onLogout,
}: {
  id: string;
  name: string;
  initials: string;
  role: string;
  /** The organisation's name, or null when none is known. */
  org: string | null;
  isOrgAdmin: boolean;
  /** The session carries the billing-administration permission, derived from
   *  the invoice route's own role list (shared/constants/permissions.ts). */
  billingAdmin: boolean;
  platformAdmin: boolean;
  segment: string;
  onClose: () => void;
  onGo: (id: string) => void;
  /** Open the person's own account panel (P-25). */
  onAccount: () => void;
  /** Open "What AnA remembers" (WhatAnaRemembers.tsx). */
  onRemembers: () => void;
  onSegment: (id: string) => void;
  onLogout: () => void;
}) {
  const available = useSurfaceAvailable();
  const items: AccountItem[] = [
    // Each person's own account, first, as in Claude's account menu (P-25).
    { label: 'Account', ic: 'user', action: 'account' },
    // AnA's notes about working with this person and the open project, read-only,
    // from anywhere: it was reachable only from a conversation's header.
    { label: 'What AnA remembers', ic: 'history', action: 'remembers' },
    // Admin is reached from the bottom-left account menu — the same place and
    // gesture as Claude's admin/settings. Gated to org admins; admin-console
    // itself renders a non-leaky denied state, but we hide the entry entirely
    // for non-admins to mirror Claude exactly.
    ...(isOrgAdmin ? [{ label: 'Admin', ic: 'shieldCheck', to: 'admin-console' }] : []),
    /* What the organization's subscription includes, and the switches for it.
       It was "Plan & features", and before that "Workflows" (and the Apps
       catalog), on the rail and in this menu for everyone, and it read as
       dozens of separate applications: a client testing the product could not
       tell what to use or when (docs/design/CLIENT_JOURNEY_2026-10-25.md).
       Features open from inside a project; this page is the administrator's
       licensing view of them. */
    ...(isOrgAdmin ? [{ label: 'Subscription & features', ic: 'grid', to: 'apps' }] : []),
    // Platform licensing is the PLATFORM operator's console, not the customer's
    // subscription page (that is "Compare subscriptions" below). It is offered only when the server
    // says its guard admits this viewer — `platformAdmin` is that guard's own
    // function (resolvePlatformAdmin). It used to be offered on `isOrgAdmin`, so
    // every customer org admin opened seven tabs that each refused them. The
    // guard still re-checks every read and write; this only decides the offer.
    ...(platformAdmin ? [{ label: 'Platform licensing', ic: 'checkSquare', to: 'master-licensing' }] : []),
    /* An engineering view of the surface registry, not a customer capability,
       and outside the release. It was in every member's menu, where the launch
       scope turned it into a "not in this release" lock (slice 0 of
       .design/client-journey/INFORMATION_ARCHITECTURE.md). Beside Platform licensing,
       for the platform's administrators, and only when it can be opened. */
    ...(platformAdmin && available('coverage') ? [{ label: 'Codebase coverage', ic: 'grid', to: 'coverage' }] : []),
    /* Where a member's request for a locked module lands. Without this entry the
       lock panel's one instruction — "ask an administrator" — points at nobody:
       the request is recorded, and the person who can approve it has no way to
       find it. The queue is org-scoped server-side; this only decides whether
       the entry is offered. */
    ...(isOrgAdmin ? [{ label: 'Access requests', ic: 'clipboardList', to: 'access-requests' }] : []),
    { label: 'Usage & limits', ic: 'barChart', to: 'usage' },
    { sep: true },
    { clientType: true },
    { sep: true },
    /* Licensing, by who uses it for what (decision P-68). A billing
       administrator reads the invoices, checks out and manages billing there
       (fold billing into Licensing, 2026-10-29), and has ONE entry to it,
       "Subscription & billing" (INFORMATION_ARCHITECTURE.md section 9). Part 1
       had pointed a separate "Billing" entry at it, which gave them two doors
       to one screen. Everyone else compares the subscriptions there, under the
       registry label. `billingAdmin` is the permission the server derives from
       the billing routes' own role list, not the broader org-admin test. */
    billingAdmin
      ? { label: 'Subscription & billing', ic: 'creditCard', to: 'licensing' }
      : { label: 'Compare subscriptions', ic: 'checkSquare', to: 'licensing' },
    { label: 'Set up a workspace', ic: 'rocket', to: 'onboarding' },
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
            <div className="rl">{[org, roleWords(role)].filter(Boolean).join(' · ')}</div>
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
                else if (it.action === 'remembers') onRemembers();
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

/** The open project's name as the top bar reads it: its code, or its title when it has none. */
function shellProjectName(project: ShellProject | null): string {
  return String(project?.code ?? '').trim() || String(project?.title ?? '').trim();
}

const isNamedProgram = hasKeys<{ id: string; name: string | null; code: string | null }>('id');

/**
 * A project opened by its link alone (a new tab, a reload, a shared link, a
 * bookmark) is in the shell by id only, so the top bar had no name to show for
 * it and a work area's way back read "Project" (UI walks, 2026-10-31 and
 * 2026-11-01: the project's agency inbox; the CMC session, 2026-11-02, on
 * ProjectBack). The top bar reads the project once (GET /api/c2c/projects/:id)
 * and names it in the shell's channel, as Projects does on opening one, so
 * every reader of the channel has its name. A name the shell already has is
 * kept, and a read that answered for another project names nothing.
 */
function useNameProjectOpenedById(project: ShellProject | null): void {
  const unnamed = project && !String(project.title ?? '').trim() && !String(project.code ?? '').trim()
    ? String(project.id).trim().toLowerCase()
    : null;
  const read = useLiveData(unnamed ? `/api/c2c/projects/${encodeURIComponent(unnamed)}` : null, [unnamed], isNamedProgram);
  const row = read.data;
  React.useEffect(() => {
    if (!unnamed || !row || String(row.id).toLowerCase() !== unnamed) return;
    const live = readShellProject();
    if (!live || String(live.id).trim().toLowerCase() !== unnamed || live.title || live.code) return;
    updateShellProject({ ...(row.name ? { title: row.name } : {}), ...(row.code ? { code: row.code } : {}) });
  }, [unnamed, row]);
}

/** Screens that name themselves in their own body (Home's greeting, the conversation's
 *  header), so the bar adds no page crumb there (D1.md §D1.B step 1). */
const SELF_NAMED_SURFACES: ReadonlySet<string> = new Set(['home', 'conversation-thread']);

/** The launcher (surfaces/CollabLauncher.tsx) with this screen's context: New task or Collaborate. */
function openLauncher(mode: 'task' | 'collab') {
  try { (window as any).C2C?.open?.(mode); } catch { /* launcher not mounted */ }
}

/**
 * Claude's top bar: where you are, in one quiet line, and a few quiet icons
 * (D1.md §D1.B). The open project is the first crumb on every screen while one is
 * open (FILING_SPINE F8): a button, named by its code (or title), that opens its
 * page and is the current page there. It took over from the project chip
 * (`ProjectChip`, deleted in D1-2), which named the project a second time beside the
 * crumbs. A project opened by id alone has no name in the channel yet, and the crumb
 * does not invent one. The brand is the sidebar's wordmark and the place is its
 * active row, so there is no root or category crumb. The search box, the
 * organisation label and Help left the bar for the sidebar's Search and ⌘K, the
 * account's second line, and the account menu's "Get help" (D1-1).
 */
export function TopBar({
  surface,
  onNav,
  onAsk,
  onOpenRail,
}: {
  surface: ShellSurfaceRef;
  /** Not read since the top bar's search box went (D1.md §D1.B step 4): the
   *  sidebar's Search and ⌘K open the palette. Kept so call sites are unchanged. */
  onPalette?: () => void;
  /** Not read here since the top bar stopped setting the client type
   *  (FILING_SPINE F8): it is chosen in the account menu, which the rail
   *  renders. Kept so the shell's call site is unchanged by that slice. */
  segment: string;
  onSegment: (id: string) => void;
  onNav?: (id: string) => void;
  onAsk?: (text: string) => void;
  /** Opens the sidebar. At ≤640px the collapsed sidebar is not drawn, and the
   *  `.tb-rail` button (shown there only, app-v2.css) is the way to it
   *  (D1.md §D1.A step 5, §D1.B step 2). */
  onOpenRail?: () => void;
}) {
  const { canLeave, go, leaveNotice } = useShellLeaveGuard(onNav);
  /* The shell's one project channel: the crumb changes the moment a screen opens
     another project. */
  const openProject = useShellProject();
  useNameProjectOpenedById(openProject);
  const projectName = shellProjectName(openProject);
  const projectTitle = [openProject?.code, openProject?.title].map((v) => String(v ?? '').trim()).filter(Boolean).join(' — ');
  const onProjectPage = surface.id === 'project-home';
  /* The page's own name follows the project, except where the project crumb already
     names the page (the project's page) or the screen names itself. */
  const here = SELF_NAMED_SURFACES.has(surface.id) || (onProjectPage && projectName) ? '' : surface.label;
  return (
    <header className="topbar">
      {onOpenRail && <button type="button" className="tb-btn tb-rail" aria-label="Open the sidebar" onClick={onOpenRail}>{I.panelLeft}</button>}
      <div className="crumbs">
        {projectName && (
          <button type="button" className="crumb-proj" onClick={() => go('project-home')} title={projectTitle}
            aria-current={onProjectPage ? 'page' : undefined}>
            <span className="ico" aria-hidden="true">{I.folder}</span>
            <span className="lbl">{projectName}</span>
          </button>
        )}
        {projectName && here && <span className="sep" aria-hidden="true">›</span>}
        {here && <span className="here">{here}</span>}
      </div>
      <div className="tb-spacer" />
      {/* Collaborate and New task open the launcher with this screen's context (at
          phone width they are in ⌘K); Your work is the live "what needs me" panel. */}
      <button type="button" className="tb-btn tb-collab" aria-label="Collaborate on this screen" title="Collaborate on this screen"
        onClick={() => openLauncher('collab')}>{I.messageSquare}</button>
      <button type="button" className="tb-btn tb-newtask" aria-label="New task from this screen" title="New task from this screen"
        onClick={() => openLauncher('task')}>{I.checkSquare}</button>
      <TaskTray onNav={onNav} onAsk={onAsk} />
      {/* At phone width (only there, app-v2.css): the sidebar's New conversation. */}
      <button type="button" className="tb-btn tb-new" aria-label="New conversation" title="New conversation"
        onClick={() => { if (onNav && canLeave()) openNewConversation(onNav); }}>{I.plus}</button>
      {leaveNotice}
    </header>
  );
}

/* ── ⌘K palette ───────────────────────────────────────────────────────── */
interface CmdKItem {
  id: string;
  /** header, note, nav, project, thread (a conversation), action, launch (the launcher) or ask. */
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
  /** A screen action asked of the destination as it opens: a rail place's
   *  (Tasks opens on everyone's tasks), or a project step's. */
  applies?: SurfaceApplies;
  /** A `project` result: the project it opens. */
  project?: PaletteProject;
  /** A `thread` result: the id of the conversation it reopens. */
  thread?: string;
}

/** How many of the person's conversations ⌘K lists with nothing typed (D1.md §D1.F step 2). */
const PALETTE_RECENTS = 5;

/** The places (RAIL_CORE, by the id each opens). Their rows carry no hint: the
 *  place's own name says where it goes (D1.md §D1.F step 4). */
const PALETTE_PLACE_IDS: ReadonlySet<string> = new Set(RAIL_CORE.map((s) => s.target ?? s.id));

/** New task and Message a colleague: the launcher (surfaces/CollabLauncher.tsx), as the
 *  top bar's New task and Collaborate open it. At phone width the top bar hides both,
 *  and these rows are where they are (D1.md §D1.F step 3, §D1.B step 3). */
const LAUNCH_ACTIONS: readonly CmdKItem[] = [
  { id: 'launch:task', kind: 'launch', label: 'New task', icon: 'checkSquare' },
  { id: 'launch:collab', kind: 'launch', label: 'Message a colleague', icon: 'messageSquare' },
];
const launchHits = (term: string): CmdKItem[] => LAUNCH_ACTIONS.filter((a) => !term || a.label.toLowerCase().includes(term));

/** "Recent conversations" with nothing typed: the person's newest, each reopening
 *  as the sidebar's Recents reopens it, or the line saying they could not be read.
 *  Never an empty group: none, or a read still running, adds nothing. */
function recentItems(recent: RecentThreadsRead): CmdKItem[] {
  if (recent.loading) return [];
  const header: CmdKItem = { id: '_hd_recent', kind: 'header', label: 'Recent conversations' };
  if (recent.failed) return [header, { id: '_note_recent', kind: 'note', label: 'Conversations could not be read, so none are listed here.' }];
  if (!recent.threads.length) return [];
  return [header, ...recent.threads.map((t): CmdKItem => ({
    id: `thread:${t.id}`, kind: 'thread', label: (t.title || 'Untitled conversation').slice(0, 120), icon: 'messageCircle', thread: t.id,
  }))];
}

/** Opens a result that leaves the screen: a place or a step (with its screen
 *  action), a project, a conversation, an AnA action, or the question asked of
 *  AnA. The palette has already asked the leave guard. */
function openPaletteResult(
  it: CmdKItem,
  question: string,
  to: { onNav: (id: string) => void; onAct: (id: string) => void; onAsk: (text: string) => void },
): void {
  if (it.kind === 'nav' && it.applies) {
    const res = resolveSurfaceAction(it.applies.actionId, it.applies.params);
    const target = it.id.startsWith('step:') ? 'project-home' : it.id;
    if (res.ok) applySurfaceAction(res.directive, () => to.onNav(target));
    else to.onNav(target);
  } else if (it.kind === 'nav') to.onNav(it.id);
  else if (it.kind === 'project' && it.project) openPaletteProject(it.project, to.onNav);
  else if (it.kind === 'thread' && it.thread) openConversation(it.thread, to.onNav);
  else if (it.kind === 'action') to.onAct(it.id);
  else to.onAsk(question);
}

/** The Projects group under a search: the matching projects, or a line saying why
 *  none can be listed (a read still running, or one that failed). A failed read is
 *  never shown as "no project matches". */
function projectItems(read: PaletteProjectsRead, term: string): CmdKItem[] {
  const header: CmdKItem = { id: '_hd_projects', kind: 'header', label: 'Projects' };
  if (read.state !== 'ready') {
    if (read.state === 'closed') return [];
    const label = read.state === 'reading' ? 'Reading projects…' : 'Projects could not be read, so none are listed here.';
    return [header, { id: '_note_projects', kind: 'note', label }];
  }
  const hits = paletteProjectResults(read.projects, term);
  if (!hits.length) return [];
  return [header, ...hits.map((p): CmdKItem => ({ id: `project:${p.id}`, kind: 'project', label: p.title, hint: p.code ?? 'Project', icon: 'folder', project: p }))];
}

/**
 * Administration pages, by who the account menu offers them to (AccountMenu). The
 * palette reads the same rule, so a search never offers a page the menu withholds:
 * the slice 0 launch walk found it offering Platform licensing to a customer's
 * administrator and the Admin console to members. The server still guards each.
 */
export const ADMIN_AUDIENCE: Readonly<Record<string, 'org-admin' | 'platform-admin'>> = {
  'admin-console': 'org-admin',
  apps: 'org-admin',
  'access-requests': 'org-admin',
  'master-licensing': 'platform-admin',
  coverage: 'platform-admin',
};

function offeredTo(id: string, viewer: { isOrgAdmin: boolean; platformAdmin: boolean }): boolean {
  const audience = ADMIN_AUDIENCE[id];
  if (audience === 'org-admin') return viewer.isOrgAdmin;
  if (audience === 'platform-admin') return viewer.platformAdmin;
  return true;
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
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const { canLeave, leaveNotice } = useShellLeaveGuard();
  const { user } = useAuth();
  /* The SAME verdict set the rail reads. The provider is mounted once above the
     whole shell (V2App), so this is a context read, not a second fetch: two
     fetches could disagree about whether a destination is locked, and the rail
     and the palette would then describe one contract two ways. Until it answers
     — and permanently if it cannot — `verdictFor` returns null for everything
     and the palette behaves exactly as it did before this gate existed. */
  const { verdictFor, platformAdmin } = useNavEntitlements();
  const isOrgAdmin = isOrgAdminRole(user?.roles);
  /** The open project, whose steps the palette lists. */
  const project = useShellProject();
  /** The organization's projects, which a search matches by title and code. */
  const projectsRead = usePaletteProjects(open);
  /** The person's newest conversations, listed with nothing typed (the sidebar's read). */
  const recent = useRecentThreads(PALETTE_RECENTS, open);
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
     * the empty-query "Go to" list and a search hit — cannot drift on
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
      /* A place carries no group: its own name says where it goes (D1.md §D1.F step 4). */
      const group = PALETTE_PLACE_IDS.has(s.id) ? undefined : breadcrumbTierOf(s)?.label;
      return {
        id: s.id,
        kind: 'nav',
        label: s.label,
        /* The hint column normally carries the destination's domain group, the
           breadcrumb's parent crumb: Projects for a project feature. For
           a locked one it carries the REASON instead: once the row cannot be
           opened, which domain it belongs to is the less useful of the two
           facts, and the reason has to be visible without hovering. It is the
           server's own reason per verdict — never a blanket "upgrade", which
           would be wrong for a module an admin switched off (nothing to buy)
           or one outside the workspace's industry mode (no plan fixes it). */
        hint: lock ? lockShortReason(lock) : group,
        icon: s.icon,
        lock,
      };
    };
    // NOTE(Phase 3): the kit also searches filings, documents, conversations,
    // pathways, people and templates from its fixture files — those categories
    // join as their surface families port.
    /* ⌘K reaches what a person can already see; it is not a catalogue (slice 0
       of .design/client-journey/INFORMATION_ARCHITECTURE.md, section 2). "Jump
       to" listed the first eight registry rows (Plan & features, Artifacts
       center, a locked Regulatory workspace among them); "Go to" (D1-3) lists
       the places, as the rail does, by the rail's own rule. */
    const places: CmdKItem[] = RAIL_CORE
      .filter((s) => flagAllowsSurface(s.id) && !isLaunchScopeLocked(verdictFor(s.target ?? s.id)))
      .map((s) => ({
        ...navResult({ id: s.target ?? s.id, label: s.label, icon: s.icon }),
        applies: 'applies' in s && s.applies ? { actionId: s.applies.actionId, params: { ...s.applies.params } } : undefined,
      }));
    /* The open project's six steps, each opening the project on it through the
       validated action AnA and the rest of the product use. */
    const steps: CmdKItem[] = project
      ? PJ_LIFECYCLE.map((step) => ({
          id: `step:${step.id}`,
          kind: 'nav',
          label: step.label,
          hint: project.code || project.title || 'This project',
          icon: step.icon,
          applies: { actionId: 'project-home.set-stage', params: { stage: step.id } },
        }))
      : [];
    /* With nothing typed, the most likely next things, as Claude's palette offers
       them (D1.md §D1.F step 2): the open project's steps, the person's newest
       conversations, the places, then the actions. */
    if (!q.trim()) {
      return [
        ...(steps.length ? [{ id: '_hd_project', kind: 'header', label: 'This project' }, ...steps] : []),
        ...recentItems(recent),
        { id: '_hd_jump', kind: 'header', label: 'Go to' },
        ...places,
        { id: '_hd_actions', kind: 'header', label: 'Actions' },
        { id: 'run_validation', kind: 'action', label: 'Run validation', hint: 'Action', icon: 'zap' },
        { id: 'export_document', kind: 'action', label: 'Export document', hint: 'Action · e-sign', icon: 'zap' },
        ...LAUNCH_ACTIONS,
      ];
    }
    if (isCmd) {
      return [
        ...AI_ACTIONS.filter((a) => !term || a.label.toLowerCase().includes(term)).map((a) => ({
          id: a.id,
          kind: 'action',
          label: a.label,
          hint: a.governed ? 'Action · e-sign required' : 'Action',
          icon: 'zap',
        })),
        ...launchHits(term),
      ];
    }
    const results: CmdKItem[] = [];
    const stepHits = steps.filter((st) => st.label.toLowerCase().includes(term));
    if (stepHits.length) {
      results.push({ id: '_hd_project', kind: 'header', label: 'This project' });
      results.push(...stepHits);
    }
    results.push(...projectItems(projectsRead, term));
    // Match across every meaningful field, not just label/notes: the kebab id
    // (de-hyphenated so "submission center" matches "submission-center"), the
    // domain group, and the AnA tool families the surface exposes. Cap high —
    // .cmdk-list scrolls (app.css) — so ⌘K reaches the full ~99-surface registry
    // rather than stopping at the first 8 label/notes hits.
    const navs = UI_SURFACES.filter((s) => {
      /* A surface outside the release is not listed: it was, as a "not in this
         release" lock nobody can open (slice 0). A licence lock still is: its
         unlock panel says what to do. */
      if (isLaunchScopeLocked(verdictFor(s.id))) return false;
      if (!offeredTo(s.id, { isOrgAdmin, platformAdmin })) return false;
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
      results.push({ id: '_hd_surfaces', kind: 'header', label: 'Pages' });
      navs.forEach((s) => results.push(navResult(s)));
    }
    const acts: CmdKItem[] = [
      ...AI_ACTIONS.filter((a) => a.label.toLowerCase().includes(term)).slice(0, 3).map((a) => ({
        id: a.id,
        kind: 'action',
        label: a.label,
        hint: a.governed ? 'Action · e-sign' : 'Action',
        icon: 'zap',
      })),
      ...launchHits(term),
    ];
    if (acts.length) results.push({ id: '_hd_actions2', kind: 'header', label: 'Actions' }, ...acts);
    /* The question itself, last: its words say what it does, so it has no group
       or hint of its own (D1.md §D1.F step 1). */
    results.push({ id: 'ask', kind: 'ask', label: `Ask AnA: "${q.trim()}"`, icon: 'sparkles' });
    return results;
    /* `verdictFor` is memoised by the provider on the payload, so this list
       rebuilds once — when the verdicts land — and not on every render. */
  }, [q, term, isCmd, verdictFor, project, isOrgAdmin, platformAdmin, projectsRead, recent]);

  const selectable = React.useMemo(() => items.filter((it) => it.kind !== 'header' && it.kind !== 'note'), [items]);

  const run = React.useCallback(
    (it?: CmdKItem) => {
      if (!it || it.kind === 'header' || it.kind === 'note') return;
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
      /* New task and Message a colleague open the launcher over this screen, as the
         top bar's icons do: nothing is left, so no leave guard is asked. */
      if (it.kind === 'launch') {
        onClose();
        openLauncher(it.id === 'launch:task' ? 'task' : 'collab');
        return;
      }
      if (!canLeave(dialogRef.current)) return;
      openPaletteResult(it, q.trim(), { onNav, onAct, onAsk });
      onClose();
    },
    [onNav, onAct, onAsk, q, onClose, canLeave]
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
      <div ref={dialogRef} className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-in">
          <span className="ico">{I.search}</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            placeholder="Search projects, conversations and pages, or type > for actions"
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
            if (it.kind === 'note') {
              return <div key={it.id} className="cmdk-empty" role="status">{it.label}</div>;
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
        {leaveNotice}
      </div>
    </div>
    {unlock}
    </>
  );
}
