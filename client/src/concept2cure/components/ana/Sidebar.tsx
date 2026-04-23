/**
 * Sidebar — faithful port of the bundle's Sidebar component.
 *
 * Thin (collapsed 56px) / expanded (260px) rail with logo, New-chat button,
 * Chats / Projects / Artifacts items, Recents list, and an account chip at
 * the bottom. Pixel and behavior faithful to
 * docs/design/concept2cure-design-system/project/ui_kits/ana_ri/App.jsx.
 */
import { I } from './icons';
import styles from './styles.module.css';
import brandIcon from '../../../assets/concept2cure-icon.svg';

export type AnaView = 'home' | 'chat' | 'projects' | 'artifacts';

export interface Recent {
  id: string;
  label: string;
}

export interface AccountInfo {
  name: string;
  initials: string;
  plan: string;
}

export interface SidebarProps {
  view: AnaView;
  setView: (v: AnaView) => void;
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
  recents: Recent[];
  account: AccountInfo;
  onNewChat: () => void;
  onSelectRecent: (id: string) => void;
  activeRecentId?: string | null;
}

export function Sidebar({
  view,
  setView,
  collapsed,
  setCollapsed,
  recents,
  account,
  onNewChat,
  onSelectRecent,
  activeRecentId,
}: SidebarProps) {
  const PanelLeftIco = I.panelLeft;
  const PlusIco = I.plus;
  const ChatIco = I.chat;
  const FolderIco = I.folder;
  const SparklesIco = I.sparkles;

  const itemSelected = (id: AnaView) =>
    view === id || (id === 'home' && view === 'chat');

  return (
    <nav className={styles.sb}>
      <div className={styles.sbTop}>
        <div className={styles.sbLogo}>
          <img src={brandIcon} alt="" />
          <div className={styles.sbLogoText}>
            Concept2Cure<span>.RI</span>
          </div>
        </div>
        <button
          className={styles.sbCollapse}
          onClick={() => setCollapsed(!collapsed)}
          title="Toggle sidebar"
          type="button"
        >
          <PanelLeftIco size={16} />
        </button>
      </div>

      <button
        className={styles.sbNew}
        onClick={() => {
          onNewChat();
          setView('home');
        }}
        type="button"
      >
        <span className={styles.ico}>
          <PlusIco size={16} />
        </span>
        <span>New chat</span>
      </button>

      <button
        className={styles.sbItem}
        aria-selected={itemSelected('home') || undefined}
        onClick={() => setView('home')}
        type="button"
      >
        <span className={styles.ico}>
          <ChatIco size={16} />
        </span>
        <span className={styles.lbl}>Chats</span>
      </button>

      <button
        className={styles.sbItem}
        aria-selected={itemSelected('projects') || undefined}
        onClick={() => setView('projects')}
        type="button"
      >
        <span className={styles.ico}>
          <FolderIco size={16} />
        </span>
        <span className={styles.lbl}>Projects</span>
      </button>

      <button
        className={styles.sbItem}
        aria-selected={itemSelected('artifacts') || undefined}
        onClick={() => setView('artifacts')}
        type="button"
      >
        <span className={styles.ico}>
          <SparklesIco size={16} />
        </span>
        <span className={styles.lbl}>Artifacts</span>
      </button>

      <div className={styles.sbSection}>Recents</div>
      {recents.map(r => (
        <button
          key={r.id}
          className={styles.sbItem}
          aria-selected={(view === 'chat' && activeRecentId === r.id) || undefined}
          onClick={() => {
            onSelectRecent(r.id);
            setView('chat');
          }}
          type="button"
        >
          <span className={styles.lbl}>{r.label}</span>
        </button>
      ))}

      <div className={styles.sbSpacer} />
      <button className={styles.sbAccount} type="button">
        <div className={styles.avatar}>{account.initials}</div>
        <div className={styles.who}>
          <div className={styles.name}>{account.name}</div>
          <div className={styles.plan}>{account.plan}</div>
        </div>
      </button>
    </nav>
  );
}
