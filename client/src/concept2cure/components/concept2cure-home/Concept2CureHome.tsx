/**
 * Concept2CureHome — Phase 1 Home surface.
 *
 * Mirror of docs/design/concept2cure-design-system/project/ui_kits/home/App.jsx.
 * Claude Code is implementer, not designer — do not diverge. If behavior
 * needs to change, the change belongs in the Claude Design canvas first,
 * then lands here as a follow-up phase.
 *
 * Deviations from the bundle (by explicit user direction):
 *  - user name / initials / role come from real auth (bundle hardcodes Jordan / JC).
 *    Edit mode (see Tweaks) still lets the designer override the user for preview.
 *  - Icons render via lucide-react rather than inline SVG (same Lucide glyphs).
 *  - CSS is CSS Modules to avoid collisions with the rest of the app.
 *  - Production activation of Tweaks: the canvas postMessage protocol is preserved
 *    verbatim; outside a canvas iframe, append ?tweaks=1 to the URL to activate.
 */
import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HomeIcon } from './icons';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import {
  NAV_ITEMS, NAV_SUB, DASH, RECENTS, SUGGESTIONS, SCOPE_OPTIONS,
  visibleNavItems, visibleModules,
  type Scope, type NavItem, type ModuleCard, type BriefingItem,
} from './data';
import { AnaCard } from './AnaCard';
import { CommandPalette, type PaletteItem } from './CommandPalette';
import { useHomeData, type HomeProject } from './useHomeData';
import { useHomeBriefing } from './useHomeBriefing';
import { ProjectsScreen } from '../concept2cure-projects';
import brandIcon from '../../../assets/concept2cure-icon.svg';
import styles from './styles.module.css';

interface User {
  name: string;
  initials: string;
  role: string;
}

export interface Concept2CureHomeProps {
  user?: Partial<User>;
  /**
   * Called when a rail / palette item is clicked. Receives the NAV_ITEMS id
   * (projects, vault, submission, biostat, ...). ZenApp decides whether the
   * id maps to a real LayoutMode or just updates local active-nav state.
   * Return true to suppress the default active-nav state change.
   */
  onNavigate?: (navId: string) => boolean | void;
  /**
   * Called when the user submits a draft from the home composer. ZenApp
   * seeds Ana with the text, switches to a chat-hosting layout, and lets
   * Ana auto-send on mount.
   */
  onLaunchChat?: (draft: string) => void;
  /** Open a specific project's workspace from the rail subdrawer / Recents. */
  onSelectProject?: (projectId: string) => void;
  /** Open a PDEV surface for an IND program — deep-link from the Projects detail. */
  onOpenPdev?: (programId: string, nav: string) => void;
  /** Open the workspace switcher — pill in the top bar. */
  onWorkspaceSwitch?: () => void;
  /** Open notifications surface — bell icon in the top bar. */
  onOpenNotifications?: () => void;
  /** Open help — help icon in the top bar. */
  onOpenHelp?: () => void;
  /** Open the user account menu — avatar at the bottom of the rail. */
  onOpenAccount?: () => void;
  /** Composer attach button — typically opens a file picker. */
  onComposerAttach?: () => void;
  /** Composer tools button — opens the AnA tools / slash menu. */
  onComposerTools?: () => void;
  /** Composer model picker chip ("AnA 1.0 RI"). */
  onComposerModelPicker?: () => void;
  /** Briefing row click. Receives the item; payload has projectId/actionId when
   *  the item came from the live RIM next-actions fetch. */
  onBriefingItemClick?: (item: BriefingItem, index: number) => void;
  /** "Start with #1" — host opens the first briefing item. */
  onStartFirstBriefing?: (item: BriefingItem | null) => void;
  /** At-a-glance dashboard tile click. `key` is the tile label slug. */
  onDashboardTileClick?: (key: string) => void;
  /** Click on a recent activity row that's a chat thread. */
  onSelectThread?: (threadId: string) => void;
  /** "View all" link on the Recents section. */
  onViewAllRecents?: () => void;
}

// Bundle App.jsx DEFAULTS — verbatim from the canvas bundle. These are the
// editable defaults the designer tweaks through the canvas, and the production
// fallbacks when no user has been wired through onboarding yet.
interface Tweaks {
  dark: boolean;
  collapsed: boolean;
  activeNav: string;
  userName: string;
  userInitials: string;
  userRole: string;
}
const DEFAULTS: Tweaks = /*EDITMODE-BEGIN*/{
  dark: false,
  collapsed: false,
  activeNav: 'projects',
  userName: 'Jordan',
  userInitials: 'JC',
  userRole: 'Enterprise · Reg Affairs',
}/*EDITMODE-END*/;

// localStorage keys for persisted rail state.
// The task spec calls for key `c2c.rail.collapsed`; activeNav uses the
// same namespace so the two states travel together.
const LS_COLLAPSED = 'c2c.rail.collapsed';
const LS_ACTIVE_NAV = 'c2c.rail.activeNav';

function readPersistedTweaks(): Pick<Tweaks, 'collapsed' | 'activeNav'> {
  try {
    const collapsed = window.localStorage.getItem(LS_COLLAPSED);
    const activeNav = window.localStorage.getItem(LS_ACTIVE_NAV);
    return {
      collapsed: collapsed === 'true',
      activeNav: activeNav ?? DEFAULTS.activeNav,
    };
  } catch {
    return { collapsed: DEFAULTS.collapsed, activeNav: DEFAULTS.activeNav };
  }
}

const DEFAULT_USER: User = {
  name: DEFAULTS.userName,
  initials: DEFAULTS.userInitials,
  role: DEFAULTS.userRole,
};

// Returns a translation key suffix, not a literal — word order and honorifics
// (e.g. Japanese さん) differ by language, so the phrase is assembled in the
// `home` namespace, never concatenated in code.
function timeOfDayKey(): 'late' | 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h < 5) return 'late';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

/* ─── Rail ─── */
function Rail({
  activeNav, setActiveNav, collapsed, setCollapsed, user,
  projects, onSelectProject, onOpenAccount, onOpenPalette,
}: {
  activeNav: string;
  setActiveNav: (id: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  user: User;
  projects: HomeProject[];
  onSelectProject?: (projectId: string) => void;
  onOpenAccount?: () => void;
  onOpenPalette: () => void;
}) {
  return (
    <nav className={styles.rail} aria-label="Primary">
      <div className={styles.railTop}>
        <div className={styles.railLogo}>
          <img src={brandIcon} alt="" />
          <div className={styles.railLogoText}>
            Concept2Cure<span>.RI</span>
          </div>
        </div>
        <button
          type="button"
          className={styles.railCollapse}
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <HomeIcon name="panelLeft" size={16} />
        </button>
      </div>

      <button
        type="button"
        className={styles.railSearch}
        onClick={onOpenPalette}
        aria-label="Open command palette"
      >
        <span className={styles.ico}><HomeIcon name="search" size={14} /></span>
        <span className={styles.railSearchText}>Search artifacts, chats…</span>
        <kbd>⌘K</kbd>
      </button>

      <div className={styles.railSection}>Modules</div>
      <div className={styles.railNav}>
        {visibleNavItems().map((item: NavItem) => {
          const isActive = activeNav === item.id;
          const isProjects = item.id === 'projects';
          const showLiveProjects = isProjects && projects.length > 0;
          const staticSub = NAV_SUB[item.id];
          return (
            <Fragment key={item.id}>
              <button
                type="button"
                className={styles.navItem}
                aria-current={isActive || undefined}
                data-label={item.label}
                title={collapsed ? item.label : undefined}
                onClick={() => setActiveNav(item.id)}
              >
                <span className={styles.ico}><HomeIcon name={item.icon} size={16} /></span>
                <span className={styles.lbl}>{item.label}</span>
              </button>
              {isActive && !collapsed && (
                showLiveProjects ? (
                  <div className={styles.railSub}>
                    {projects.map(p => (
                      <button
                        type="button"
                        key={p.id}
                        className={styles.subItem}
                        onClick={() => onSelectProject?.(p.id)}
                      >
                        <span className={styles.dot} />
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                ) : staticSub ? (
                  <div className={styles.railSub}>
                    {staticSub.map((s, i) => (
                      <button type="button" key={i} className={styles.subItem}>
                        <span className={styles.dot} /><span>{s}</span>
                      </button>
                    ))}
                  </div>
                ) : null
              )}
            </Fragment>
          );
        })}
      </div>

      <div className={styles.railSpacer} />

      <button
        type="button"
        className={styles.railAccount}
        title={user.name}
        onClick={onOpenAccount}
      >
        <div className={styles.avatar}>{user.initials}</div>
        <div className={styles.who}>
          <div className={styles.name}>{user.name}</div>
          <div className={styles.plan}>{user.role}</div>
        </div>
        <span className={styles.chev}><HomeIcon name="down" size={14} /></span>
      </button>
    </nav>
  );
}

/* ─── Scope switcher ─── */
function ScopeSwitcher({ scope, setScope }: { scope: Scope; setScope: (s: Scope) => void }) {
  return (
    <div className={styles.scope} role="tablist" aria-label="Domain scope">
      {SCOPE_OPTIONS.map(o => (
        <button
          type="button"
          key={o.id}
          className={styles.scopeBtn}
          data-on={scope === o.id || undefined}
          role="tab"
          aria-selected={scope === o.id}
          onClick={() => setScope(o.id)}
        >
          <span className={styles.ico}><HomeIcon name={o.ico} size={13} /></span>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─── TopBar ─── */
function TopBar({
  activeNavLabel, scope, setScope, onOpenPalette,
  workspaceLabel, onWorkspaceSwitch, onOpenNotifications, onOpenHelp,
}: {
  activeNavLabel: string;
  scope: Scope;
  setScope: (s: Scope) => void;
  onOpenPalette: () => void;
  workspaceLabel: string;
  onWorkspaceSwitch?: () => void;
  onOpenNotifications?: () => void;
  onOpenHelp?: () => void;
}) {
  const { t: tc } = useTranslation('common');
  return (
    <header className={styles.topbar}>
      <div className={styles.crumbs}>
        <span>Concept2Cure.RI</span>
        <span className={styles.sep}>›</span>
        <span className={styles.here}>{activeNavLabel || 'Home'}</span>
      </div>
      <ScopeSwitcher scope={scope} setScope={setScope} />
      <div className={styles.tbDivider} />
      <button
        type="button"
        className={styles.workspacePill}
        title="Switch workspace"
        onClick={onWorkspaceSwitch}
      >
        <span className={styles.sqr} aria-hidden="true" />
        <span>{workspaceLabel}</span>
        <span className={styles.chev}><HomeIcon name="down" size={14} /></span>
      </button>
      <div className={styles.tbDivider} />
      <div className={styles.tbActions}>
        <LanguageSwitcher variant="topbar" />
        <button type="button" className={styles.tbBtn} title={`${tc('actions.search')} (⌘K)`} aria-label={tc('actions.search')} onClick={onOpenPalette}>
          <HomeIcon name="search" size={16} />
        </button>
        <button
          type="button"
          className={styles.tbBtn}
          title={tc('topbar.notifications')}
          aria-label={tc('topbar.notifications')}
          onClick={onOpenNotifications}
        >
          <HomeIcon name="bell" size={16} />
          <span className={styles.badge} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.tbBtn}
          title={tc('topbar.help')}
          aria-label={tc('topbar.help')}
          onClick={onOpenHelp}
        >
          <HomeIcon name="help" size={16} />
        </button>
      </div>
    </header>
  );
}

/* ─── GreetAndCompose — hands the draft off to ZenApp when onLaunchChat is wired ─── */
function GreetAndCompose({
  userName,
  onLaunchChat,
  onAttach,
  onTools,
  onModelPicker,
}: {
  userName: string;
  onLaunchChat?: (draft: string) => void;
  onAttach?: () => void;
  onTools?: () => void;
  onModelPicker?: () => void;
}) {
  const { t } = useTranslation('home');
  const [draft, setDraft] = useState('');
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    if (onLaunchChat) {
      onLaunchChat(text);
    }
    setDraft('');
  };
  const greeting = t(`greeting.${timeOfDayKey()}`);

  return (
    <div className={styles.greetBlock}>
      <span className={styles.greetStar} aria-hidden="true">✻</span>
      <h1 className={styles.greetH1}>{t('greetingLine', { greeting, name: userName })}</h1>
      <div className={styles.greetSub}>
        {t('prompt')}
      </div>

      <div className={styles.composer}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="Ask AnA — draft a section, pull a precedent, review a SAP…"
          rows={1}
        />
        <div className={styles.composerActions}>
          <button
            type="button"
            className={styles.composerIcon}
            title="Attach"
            onClick={onAttach}
          >
            <HomeIcon name="attach" size={16} />
          </button>
          <button
            type="button"
            className={styles.composerIcon}
            title="Tools"
            onClick={onTools}
          >
            <HomeIcon name="tools" size={16} />
          </button>
          <button
            type="button"
            className={styles.composerChip}
            onClick={onModelPicker}
          >
            AnA 1.0 RI <HomeIcon name="down" size={12} />
          </button>
          <button
            type="button"
            className={styles.composerSend}
            onClick={send}
            disabled={!draft.trim()}
            title="Send"
          >
            <HomeIcon name="arrowUp" size={16} />
          </button>
        </div>
      </div>

      <div className={styles.suggest}>
        {SUGGESTIONS.map((s, i) => (
          <button
            type="button"
            key={i}
            className={styles.suggestPill}
            onClick={() => setDraft(s.label)}
          >
            <span className={styles.ico}><HomeIcon name={s.ico} size={14} /></span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Dashboard ─── */
function dashKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function Dashboard({
  projectCount,
  artifactTotal,
  onTileClick,
}: {
  projectCount: number | null;
  artifactTotal: number | null;
  onTileClick?: (key: string) => void;
}) {
  // Overlay real counts on top of the static demo metrics where we have them.
  const cards = DASH.map(d => {
    if (d.label === 'Active projects' && projectCount !== null) {
      return { ...d, metric: String(projectCount), meta: `${projectCount} project${projectCount !== 1 ? 's' : ''} in this workspace` };
    }
    return d;
  });
  return (
    <>
      <div className={styles.secHdr}>
        <div className={styles.secTitle}>At a glance</div>
        <button
          type="button"
          className={styles.secMore}
          onClick={() => onTileClick?.('view-all-dashboards')}
        >
          View all dashboards <HomeIcon name="right" size={12} />
        </button>
      </div>
      <div className={styles.dash}>
        {cards.map((d, i) => (
          <button
            type="button"
            key={i}
            className={styles.dashCard}
            onClick={() => onTileClick?.(dashKey(d.label))}
          >
            <div className={styles.dashLabel}>{d.label}</div>
            <div className={styles.dashMetric}>
              {d.metric}{d.unit && <span className={styles.unit}>{d.unit}</span>}
            </div>
            {d.bar && (
              <div className={styles.readiness}>
                <div
                  className={`${styles.readinessFill} ${d.bar.tone === 'warn' ? styles.warn : d.bar.tone === 'err' ? styles.err : ''}`}
                  style={{ width: `${d.bar.pct}%` }}
                />
              </div>
            )}
            <div className={styles.dashMeta}>{d.meta}</div>
          </button>
        ))}
      </div>
    </>
  );
}

/* ─── Module launcher — <a href> to match bundle App.jsx ─── */
function Launcher({
  activeNav, setActiveNav, onCustomize,
}: {
  activeNav: string;
  setActiveNav: (id: string) => void;
  onCustomize?: () => void;
}) {
  return (
    <>
      <div className={styles.secHdr}>
        <div className={styles.secTitle}>All modules</div>
        <button type="button" className={styles.secMore} onClick={onCustomize}>
          Customize <HomeIcon name="right" size={12} />
        </button>
      </div>
      <div className={styles.modules}>
        {visibleModules().map((m: ModuleCard, i) => {
          const nav = NAV_ITEMS.find(n => n.id === m.navId);
          const isPinned = nav?.group === 'domain';
          const isActive = activeNav === m.navId;
          const cls = [
            styles.moduleCard,
            isPinned && styles.isPinned,
            isPinned && isActive && styles.isActive,
          ].filter(Boolean).join(' ');
          const href = nav?.href ?? null;
          return (
            <a
              key={i}
              className={cls}
              href={href ?? '#'}
              onClick={e => { if (!href) e.preventDefault(); setActiveNav(m.navId); }}
            >
              <div className={styles.mcHead}>
                <div className={styles.mcIco}><HomeIcon name={m.icon} size={16} /></div>
                <div className={styles.mcArrow}><HomeIcon name="arrowRight" size={14} /></div>
              </div>
              <div className={styles.mcTitle}>{m.title}</div>
              <div className={styles.mcDesc}>{m.desc}</div>
              <div className={styles.mcFoot}>
                <span className={styles.dot} />{m.foot}
              </div>
            </a>
          );
        })}
      </div>
    </>
  );
}

/* ─── Recents ─── */
function Recents({
  threads,
  onSelectThread,
  onViewAll,
}: {
  threads: Array<{ id: string; title: string; updatedAt: string }>;
  onSelectThread?: (threadId: string) => void;
  onViewAll?: () => void;
}) {
  // Use real threads when available, otherwise fall back to static demo data.
  const showReal = threads.length > 0;

  function relTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 2) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <>
      <div className={styles.secHdr}>
        <div className={styles.secTitle}>Recent activity</div>
        <button type="button" className={styles.secMore} onClick={onViewAll}>
          View all <HomeIcon name="right" size={12} />
        </button>
      </div>
      <div className={styles.recents}>
        {showReal
          ? threads.map(t => (
              <button
                type="button"
                key={t.id}
                className={styles.recentRow}
                onClick={() => onSelectThread?.(t.id)}
              >
                <span className={styles.rIco}><HomeIcon name="chat" size={14} /></span>
                <span className={styles.rTtl}>
                  <span className={styles.rMod}>AnA · </span>
                  {t.title.length > 60 ? t.title.slice(0, 60) + '…' : t.title}
                </span>
                <span className={`${styles.pill} ${styles.info}`}>
                  <span className={styles.pd} />Chat
                </span>
                <span className={styles.rWhen}>{relTime(t.updatedAt)}</span>
              </button>
            ))
          : RECENTS.map((r, i) => (
              <button type="button" key={i} className={styles.recentRow}>
                <span className={styles.rIco}><HomeIcon name={r.icon} size={14} /></span>
                <span className={styles.rTtl}>
                  <span className={styles.rMod}>{r.mod}</span>{r.ttl}
                </span>
                <span className={`${styles.pill} ${styles[r.pill.kind]}`}>
                  <span className={styles.pd} />{r.pill.label}
                </span>
                <span className={styles.rWhen}>{r.when}</span>
              </button>
            ))}
      </div>
    </>
  );
}

/* ─── Tweaks Panel ─── */
/* Ported verbatim from bundle App.jsx (TweaksPanel). JSX structure and copy
   kept identical; only global class names are mapped to CSS Modules. */
function TweaksPanel({
  tweaks,
  setTweak,
  onClose,
}: {
  tweaks: Tweaks;
  setTweak: <K extends keyof Tweaks>(key: K, val: Tweaks[K]) => void;
  onClose: () => void;
}) {
  return (
    <aside className={styles.tweaksPanel} role="dialog" aria-label="Tweaks">
      <div className={styles.tweaksTitle}>
        <span>Tweaks</span>
        <button type="button" className={styles.close} onClick={onClose} title="Close">
          <HomeIcon name="close" size={14} />
        </button>
      </div>

      <div className={styles.tweakRow}>
        <span className={styles.tweakLabel}>Dark mode</span>
        <button
          type="button"
          className={styles.switch}
          data-on={tweaks.dark}
          onClick={() => setTweak('dark', !tweaks.dark)}
          aria-label="Dark mode"
        />
      </div>

      <div className={styles.tweakRow}>
        <span className={styles.tweakLabel}>Rail collapsed</span>
        <button
          type="button"
          className={styles.switch}
          data-on={tweaks.collapsed}
          onClick={() => setTweak('collapsed', !tweaks.collapsed)}
          aria-label="Collapse rail"
        />
      </div>

      <div className={styles.tweakRow}>
        <span className={styles.tweakLabel}>Active module</span>
        <div className={styles.seg}>
          {[
            { id: 'mdx', label: 'Device' },
            { id: 'biopharma', label: 'Biopharma' },
            { id: 'projects', label: 'Projects' },
          ].map(o => (
            <button
              type="button"
              key={o.id}
              className={styles.segBtn}
              data-on={tweaks.activeNav === o.id}
              onClick={() => setTweak('activeNav', o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

/* ─── App ─── */
export function Concept2CureHome({
  user,
  onNavigate,
  onLaunchChat,
  onSelectProject,
  onOpenPdev,
  onWorkspaceSwitch,
  onOpenNotifications,
  onOpenHelp,
  onOpenAccount,
  onComposerAttach,
  onComposerTools,
  onComposerModelPicker,
  onBriefingItemClick,
  onStartFirstBriefing,
  onDashboardTileClick,
  onSelectThread,
  onViewAllRecents,
}: Concept2CureHomeProps) {
  const authUser: User = {
    name: user?.name ?? DEFAULT_USER.name,
    initials: user?.initials ?? DEFAULT_USER.initials,
    role: user?.role ?? DEFAULT_USER.role,
  };

  // Bundle state — tweaks, tweaksOpen, editModeActive, scope, paletteOpen.
  // Logic below is ported verbatim from bundle App.jsx (the App function).
  // `collapsed` and `activeNav` are seeded from localStorage so the user's
  // last-used rail state is restored on every visit.
  const [tweaks, setTweaks] = useState<Tweaks>(() => ({
    ...DEFAULTS,
    ...readPersistedTweaks(),
  }));
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [editModeActive, setEditModeActive] = useState(false);
  const [scope, setScope] = useState<Scope>('all');
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { metrics, recentThreads, projects } = useHomeData();
  const { items: briefingItems } = useHomeBriefing();

  // Bundle App.jsx setTweak — mirrors the tweak into the parent canvas host
  // so the designer surface stays in sync. Also persists `collapsed` and
  // `activeNav` to localStorage so rail state survives page reloads.
  const setTweak = <K extends keyof Tweaks>(key: K, val: Tweaks[K]) => {
    setTweaks(t => {
      const next = { ...t, [key]: val };
      try {
        window.parent?.postMessage(
          { type: '__edit_mode_set_keys', edits: { [key]: val } },
          '*',
        );
      } catch {
        /* no parent (standalone production tab) — ignore */
      }
      // Persist rail-specific keys to localStorage.
      try {
        if (key === 'collapsed') {
          window.localStorage.setItem(LS_COLLAPSED, String(val));
        } else if (key === 'activeNav') {
          window.localStorage.setItem(LS_ACTIVE_NAV, String(val));
        }
      } catch {
        /* storage unavailable — ignore */
      }
      return next;
    });
  };

  // Bundle App.jsx — Tweaks host protocol. Register listener first, then
  // announce availability so the canvas parent can activate edit mode.
  // Production activation also honors ?tweaks=1 on the URL so designers can
  // open the panel outside the canvas iframe without shipping a visible entry.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      const data = e.data as { type?: string };
      if (data.type === '__activate_edit_mode') {
        setEditModeActive(true);
        setTweaksOpen(true);
      }
      if (data.type === '__deactivate_edit_mode') {
        setEditModeActive(false);
        setTweaksOpen(false);
      }
    };
    window.addEventListener('message', handler);
    try {
      window.parent?.postMessage({ type: '__edit_mode_available' }, '*');
    } catch {
      /* no parent — ignore */
    }
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tweaks') === '1') {
        setEditModeActive(true);
        setTweaksOpen(true);
      }
    }
    return () => window.removeEventListener('message', handler);
  }, []);

  // ⌘K / Ctrl-K palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Rail + palette + module-card click handler. Calls the host's onNavigate
  // first so ZenApp can route to a real LayoutMode; the local active-nav
  // state only updates when the host didn't suppress it.
  const handleSelectNav = (id: string) => {
    const suppressed = onNavigate?.(id);
    if (!suppressed) setTweak('activeNav', id);
  };

  // Palette navigation — only Module selects a rail item (matches bundle onPaletteNav).
  const onPaletteNav = (it: PaletteItem) => {
    if (it.kind === 'Module') handleSelectNav(it.id);
  };

  // In edit mode the designer can override user identity for preview; in
  // production we always show the real auth user.
  const resolvedUser: User = editModeActive
    ? { name: tweaks.userName, initials: tweaks.userInitials, role: tweaks.userRole }
    : authUser;

  const activeNavLabel = NAV_ITEMS.find(n => n.id === tweaks.activeNav)?.label ?? 'Home';
  const shellClassName = `${styles.shell}${tweaks.dark ? ' ' + styles.dark : ''}`;

  return (
    <div
      className={shellClassName}
      data-c2c-phase="1-home"
      data-collapsed={tweaks.collapsed || undefined}
    >
      <Rail
        activeNav={tweaks.activeNav}
        setActiveNav={handleSelectNav}
        collapsed={tweaks.collapsed}
        setCollapsed={(v: boolean) => setTweak('collapsed', v)}
        user={resolvedUser}
        projects={projects}
        onSelectProject={onSelectProject}
        onOpenAccount={onOpenAccount}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <main className={styles.main}>
        <TopBar
          activeNavLabel={activeNavLabel}
          scope={scope}
          setScope={setScope}
          onOpenPalette={() => setPaletteOpen(true)}
          workspaceLabel="BioNova Therapeutics"
          onWorkspaceSwitch={onWorkspaceSwitch}
          onOpenNotifications={onOpenNotifications}
          onOpenHelp={onOpenHelp}
        />
        <div className={styles.page}>
          {tweaks.activeNav === 'projects' ? (
            // Phase 3 Projects surface — list ↔ detail. Replaces the home
            // dashboard content when the rail's `projects` item is active.
            // Lives at design-system/ui_kits/home/Projects.jsx +
            // ProjectsExtras.jsx; ported in
            // client/src/concept2cure/components/concept2cure-projects/.
            <ProjectsScreen onOpenPdev={onOpenPdev} />
          ) : (
            <div className={styles.pageInner}>
              <GreetAndCompose
                userName={resolvedUser.name}
                onLaunchChat={onLaunchChat}
                onAttach={onComposerAttach}
                onTools={onComposerTools}
                onModelPicker={onComposerModelPicker}
              />
              <AnaCard
                onOpenPalette={() => setPaletteOpen(true)}
                items={briefingItems ?? undefined}
                lastSyncLabel={briefingItems ? 'just now' : undefined}
                onItemClick={onBriefingItemClick}
                onStartFirst={onStartFirstBriefing}
              />
              <Dashboard
                projectCount={metrics.projectCount}
                artifactTotal={metrics.artifactTotal}
                onTileClick={onDashboardTileClick}
              />
              <div style={{ height: 24 }} />
              <Launcher
                activeNav={tweaks.activeNav}
                setActiveNav={handleSelectNav}
                onCustomize={() => setTweaksOpen(true)}
              />
              <div style={{ height: 24 }} />
              <Recents
                threads={recentThreads}
                onSelectThread={onSelectThread}
                onViewAll={onViewAllRecents}
              />
            </div>
          )}
        </div>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={onPaletteNav}
      />

      {editModeActive && tweaksOpen && (
        <TweaksPanel
          tweaks={tweaks}
          setTweak={setTweak}
          onClose={() => setTweaksOpen(false)}
        />
      )}
      {editModeActive && !tweaksOpen && (
        <button
          type="button"
          className={styles.tweaksToggle}
          onClick={() => setTweaksOpen(true)}
          title="Tweaks"
        >
          <HomeIcon name="sliders" size={16} />
        </button>
      )}
    </div>
  );
}
