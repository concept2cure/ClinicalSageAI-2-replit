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
import { HomeIcon } from './icons';
import {
  NAV_ITEMS, NAV_SUB, DASH, MODULES, RECENTS, SUGGESTIONS, SCOPE_OPTIONS,
  type Scope, type NavItem, type ModuleCard,
} from './data';
import { AnaCard } from './AnaCard';
import { CommandPalette, type PaletteItem } from './CommandPalette';
import { useHomeData } from './useHomeData';
import { useHomeBriefing } from './useHomeBriefing';
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

const DEFAULT_USER: User = {
  name: DEFAULTS.userName,
  initials: DEFAULTS.userInitials,
  role: DEFAULTS.userRole,
};

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/* ─── Rail ─── */
function Rail({
  activeNav, setActiveNav, collapsed, setCollapsed, user,
}: {
  activeNav: string;
  setActiveNav: (id: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  user: User;
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

      <div className={styles.railSearch} role="search">
        <span className={styles.ico}><HomeIcon name="search" size={14} /></span>
        <input placeholder="Search artifacts, chats…" />
        <kbd>⌘K</kbd>
      </div>

      <div className={styles.railSection}>Modules</div>
      <div className={styles.railNav}>
        {NAV_ITEMS.map((item: NavItem) => {
          const isActive = activeNav === item.id;
          const sub = NAV_SUB[item.id];
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
              {isActive && sub && !collapsed && (
                <div className={styles.railSub}>
                  {sub.map((s, i) => (
                    <button type="button" key={i} className={styles.subItem}>
                      <span className={styles.dot} /><span>{s}</span>
                    </button>
                  ))}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <div className={styles.railSpacer} />

      <button type="button" className={styles.railAccount} title={user.name}>
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
}: {
  activeNavLabel: string;
  scope: Scope;
  setScope: (s: Scope) => void;
  onOpenPalette: () => void;
}) {
  return (
    <header className={styles.topbar}>
      <div className={styles.crumbs}>
        <span>Concept2Cure.RI</span>
        <span className={styles.sep}>›</span>
        <span className={styles.here}>{activeNavLabel || 'Home'}</span>
      </div>
      <ScopeSwitcher scope={scope} setScope={setScope} />
      <div className={styles.tbDivider} />
      <button type="button" className={styles.workspacePill} title="Switch workspace">
        <span className={styles.sqr} aria-hidden="true" />
        <span>BioNova Therapeutics</span>
        <span className={styles.chev}><HomeIcon name="down" size={14} /></span>
      </button>
      <div className={styles.tbDivider} />
      <div className={styles.tbActions}>
        <button type="button" className={styles.tbBtn} title="Search (⌘K)" onClick={onOpenPalette}>
          <HomeIcon name="search" size={16} />
        </button>
        <button type="button" className={styles.tbBtn} title="Notifications">
          <HomeIcon name="bell" size={16} />
          <span className={styles.badge} aria-hidden="true" />
        </button>
        <button type="button" className={styles.tbBtn} title="Help">
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
}: {
  userName: string;
  onLaunchChat?: (draft: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    if (onLaunchChat) {
      onLaunchChat(text);
    }
    setDraft('');
  };
  const tod = timeOfDay();

  return (
    <div className={styles.greetBlock}>
      <span className={styles.greetStar} aria-hidden="true">✻</span>
      <h1 className={styles.greetH1}>{tod}, {userName}</h1>
      <div className={styles.greetSub}>
        What would you like to work on? Ask AnA, or jump into a module below.
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
          <button type="button" className={styles.composerIcon} title="Attach">
            <HomeIcon name="attach" size={16} />
          </button>
          <button type="button" className={styles.composerIcon} title="Tools">
            <HomeIcon name="tools" size={16} />
          </button>
          <button type="button" className={styles.composerChip}>
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
function Dashboard({ projectCount, artifactTotal }: { projectCount: number | null; artifactTotal: number | null }) {
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
        <button type="button" className={styles.secMore}>
          View all dashboards <HomeIcon name="right" size={12} />
        </button>
      </div>
      <div className={styles.dash}>
        {cards.map((d, i) => (
          <button type="button" key={i} className={styles.dashCard}>
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
  activeNav, setActiveNav,
}: {
  activeNav: string;
  setActiveNav: (id: string) => void;
}) {
  return (
    <>
      <div className={styles.secHdr}>
        <div className={styles.secTitle}>All modules</div>
        <button type="button" className={styles.secMore}>
          Customize <HomeIcon name="right" size={12} />
        </button>
      </div>
      <div className={styles.modules}>
        {MODULES.map((m: ModuleCard, i) => {
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
function Recents({ threads }: { threads: Array<{ id: string; title: string; updatedAt: string }> }) {
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
        <button type="button" className={styles.secMore}>
          View all <HomeIcon name="right" size={12} />
        </button>
      </div>
      <div className={styles.recents}>
        {showReal
          ? threads.map(t => (
              <button type="button" key={t.id} className={styles.recentRow}>
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
}: Concept2CureHomeProps) {
  const authUser: User = {
    name: user?.name ?? DEFAULT_USER.name,
    initials: user?.initials ?? DEFAULT_USER.initials,
    role: user?.role ?? DEFAULT_USER.role,
  };

  // Bundle state — tweaks, tweaksOpen, editModeActive, scope, paletteOpen.
  // Logic below is ported verbatim from bundle App.jsx (the App function).
  const [tweaks, setTweaks] = useState<Tweaks>(DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [editModeActive, setEditModeActive] = useState(false);
  const [scope, setScope] = useState<Scope>('all');
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { metrics, recentThreads } = useHomeData();
  const { items: briefingItems } = useHomeBriefing();

  // Bundle App.jsx setTweak — mirrors the tweak into the parent canvas host
  // so the designer surface stays in sync.
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
    <div className={shellClassName} data-collapsed={tweaks.collapsed || undefined}>
      <Rail
        activeNav={tweaks.activeNav}
        setActiveNav={handleSelectNav}
        collapsed={tweaks.collapsed}
        setCollapsed={(v: boolean) => setTweak('collapsed', v)}
        user={resolvedUser}
      />
      <main className={styles.main}>
        <TopBar
          activeNavLabel={activeNavLabel}
          scope={scope}
          setScope={setScope}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <div className={styles.page}>
          <div className={styles.pageInner}>
            <GreetAndCompose userName={resolvedUser.name} onLaunchChat={onLaunchChat} />
            <AnaCard
              scope={scope}
              onOpenPalette={() => setPaletteOpen(true)}
              items={briefingItems ?? undefined}
              lastSyncLabel={briefingItems ? 'just now' : undefined}
            />
            <Dashboard projectCount={metrics.projectCount} artifactTotal={metrics.artifactTotal} />
            <div style={{ height: 24 }} />
            <Launcher activeNav={tweaks.activeNav} setActiveNav={handleSelectNav} />
            <div style={{ height: 24 }} />
            <Recents threads={recentThreads} />
          </div>
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
