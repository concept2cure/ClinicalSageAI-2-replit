import { useEffect, useMemo, useState } from 'react';
import { HomeIcon, type IconName } from './icons';
import {
  NAV_ITEMS, NAV_SUB, DASH, MODULES, RECENTS, SUGGESTIONS, SCOPE_OPTIONS,
  type Scope, type NavItem, type ModuleCard,
} from './data';
import { AnaCard } from './AnaCard';
import { CommandPalette, type PaletteItem } from './CommandPalette';
import brandIcon from '../../../assets/concept2cure-icon.svg';
import styles from './styles.module.css';

interface User {
  name: string;
  initials: string;
  role: string;
}

export interface ClaudeHomeProps {
  user?: Partial<User>;
  onNavigate?: (navId: string) => void;
  onSendPrompt?: (prompt: string) => void;
  initialActiveNav?: string;
  initialCollapsed?: boolean;
}

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

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
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
            <div key={item.id}>
              <button
                type="button"
                className={styles.navItem}
                aria-current={isActive || undefined}
                data-label={item.label}
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
            </div>
          );
        })}
      </div>

      <div className={styles.railSpacer} />

      <button type="button" className={styles.railAccount} aria-label={user.name}>
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
        <span className={styles.here}>{activeNavLabel}</span>
      </div>
      <ScopeSwitcher scope={scope} setScope={setScope} />
      <div className={styles.tbDivider} />
      <button type="button" className={styles.workspacePill} aria-label="Switch workspace">
        <span className={styles.sqr} aria-hidden="true" />
        <span>BioNova Therapeutics</span>
        <span className={styles.chev}><HomeIcon name="down" size={14} /></span>
      </button>
      <div className={styles.tbDivider} />
      <div className={styles.tbActions}>
        <button type="button" className={styles.tbBtn} onClick={onOpenPalette} aria-label="Search (Command-K)">
          <HomeIcon name="search" size={16} />
        </button>
        <button type="button" className={styles.tbBtn} aria-label="Notifications">
          <HomeIcon name="bell" size={16} />
          <span className={styles.badge} aria-hidden="true" />
        </button>
        <button type="button" className={styles.tbBtn} aria-label="Help">
          <HomeIcon name="help" size={16} />
        </button>
      </div>
    </header>
  );
}

function GreetAndCompose({
  userName, onSend,
}: {
  userName: string;
  onSend?: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    onSend?.(t);
    setDraft('');
  };

  return (
    <div className={styles.greetBlock}>
      <span className={styles.greetStar} aria-hidden="true">✻</span>
      <h1 className={styles.greetH1}>{timeOfDayGreeting()}, {userName}</h1>
      <div className={styles.greetSub}>
        What would you like to work on? Ask AnA, or jump into a module below.
      </div>

      <div className={styles.composer}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask AnA — draft a section, pull a precedent, review a SAP…"
          rows={1}
        />
        <div className={styles.composerActions}>
          <button type="button" className={styles.composerIcon} aria-label="Attach">
            <HomeIcon name="attach" size={16} />
          </button>
          <button type="button" className={styles.composerIcon} aria-label="Tools">
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
            aria-label="Send"
          >
            <HomeIcon name="arrowUp" size={16} />
          </button>
        </div>
      </div>

      <div className={styles.suggest}>
        {SUGGESTIONS.map(s => (
          <button
            type="button"
            key={s.label}
            className={styles.suggestPill}
            onClick={() => { onSend?.(s.label); }}
          >
            <span className={styles.ico}><HomeIcon name={s.ico} size={14} /></span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <>
      <div className={styles.secHdr}>
        <div className={styles.secTitle}>At a glance</div>
        <button type="button" className={styles.secMore}>
          View all dashboards <HomeIcon name="right" size={12} />
        </button>
      </div>
      <div className={styles.dash}>
        {DASH.map(d => (
          <button type="button" key={d.label} className={styles.dashCard}>
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
        {MODULES.map((m: ModuleCard) => {
          const nav = NAV_ITEMS.find(n => n.id === m.navId);
          const isPinned = nav?.group === 'domain';
          const isActive = activeNav === m.navId;
          const cls = [
            styles.moduleCard,
            isPinned && styles.isPinned,
            isPinned && isActive && styles.isActive,
          ].filter(Boolean).join(' ');
          return (
            <button
              type="button"
              key={m.navId}
              className={cls}
              onClick={() => setActiveNav(m.navId)}
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
            </button>
          );
        })}
      </div>
    </>
  );
}

function Recents() {
  return (
    <>
      <div className={styles.secHdr}>
        <div className={styles.secTitle}>Recent activity</div>
        <button type="button" className={styles.secMore}>
          View all <HomeIcon name="right" size={12} />
        </button>
      </div>
      <div className={styles.recents}>
        {RECENTS.map((r, i) => (
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

const DEFAULT_USER: User = {
  name: 'Jordan',
  initials: 'JC',
  role: 'Enterprise · Reg Affairs',
};

export function ClaudeHome({
  user,
  onNavigate,
  onSendPrompt,
  initialActiveNav = 'biopharma',
  initialCollapsed = false,
}: ClaudeHomeProps) {
  const resolvedUser: User = useMemo(
    () => ({ ...DEFAULT_USER, ...user }),
    [user],
  );

  const [activeNav, setActiveNav] = useState(initialActiveNav);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [scope, setScope] = useState<Scope>('all');
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl-K opens the palette
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

  const handleNav = (id: string) => {
    setActiveNav(id);
    onNavigate?.(id);
  };

  const handlePaletteNavigate = (it: PaletteItem) => {
    if (it.kind === 'Module') handleNav(it.id);
    if (it.kind === 'Ask AnA') onSendPrompt?.(it.label);
  };

  const activeNavLabel = NAV_ITEMS.find(n => n.id === activeNav)?.label ?? 'Home';

  return (
    <div className={styles.shell} data-collapsed={collapsed || undefined}>
      <Rail
        activeNav={activeNav}
        setActiveNav={handleNav}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
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
            <GreetAndCompose userName={resolvedUser.name} onSend={onSendPrompt} />
            <AnaCard scope={scope} />
            <Dashboard />
            <div style={{ height: 24 }} />
            <Launcher activeNav={activeNav} setActiveNav={handleNav} />
            <div style={{ height: 24 }} />
            <Recents />
          </div>
        </div>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={handlePaletteNavigate}
      />
    </div>
  );
}
