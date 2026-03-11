/**
 * @fileoverview Lumen Sidebar — Claude.ai-style, regulatory-focused
 * @module concept2cure/components/sidebar/ZenSidebar
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Plus,
  MessageSquare,
  Trash2,
  Settings,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Activity,
  FileText,
  Beaker,
  Layers,
  Stethoscope,
  FlaskConical,
  Search,
  ShieldAlert,
  Brain,
  Archive,
  PenLine,
  GitCompare,
  MessageCircle,
  BadgeCheck,
  ClipboardList,
  BookOpen,
  Database,
  History,
  Microscope,
  FileLock2,
  Package,
  ScrollText,
  Cpu,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  title: string;
  projectId: string;
  timestamp: Date;
  starred?: boolean;
  pinned?: boolean;
}

interface Project {
  id: string;
  name: string;
  type: string;
  color: string;
}

export interface ZenSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  conversations: Conversation[];
  projects: Project[];
  activeConversationId?: string;
  activeProjectId?: string;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onOpenProjects: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onDeleteConversation: (id: string) => void;
  onToggleStar: (id: string) => void;
  onTogglePin: (id: string) => void;
  onNavigate?: (id: string) => void;
  userName?: string;
  userEmail?: string;
  /** Which product nav item is currently active */
  activeNavId?: string;
  /** Organization industry mode — drives which nav items are shown */
  industryMode?: string;
}

// ─── Workspace item ───────────────────────────────────────────────────────────

const WorkspaceItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  badge?: string;
  onClick: () => void;
}> = ({ icon, label, badge, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-2.5 pl-7 pr-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 text-sm transition-colors rounded-lg"
  >
    <span className="flex-shrink-0 text-zinc-400">{icon}</span>
    <span className="flex-1 text-left truncate">{label}</span>
    {badge && (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium leading-none flex-shrink-0">
        {badge}
      </span>
    )}
  </button>
);

// ─── Workspace group ──────────────────────────────────────────────────────────

const WorkspaceGroup: React.FC<{
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ label, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-600 transition-colors"
      >
        <ChevronDown
          className={cn('w-3 h-3 flex-shrink-0 transition-transform', !open && '-rotate-90')}
        />
        <span>{label}</span>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
};

// ─── Nav item with active/accent support ──────────────────────────────────────

const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  accentColor?: 'blue' | 'violet' | 'emerald';
  badge?: string;
  onClick: () => void;
}> = ({ icon, label, active, accentColor, badge, onClick }) => {
  const accentMap = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', iconColor: 'text-blue-500' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-700', iconColor: 'text-violet-500' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', iconColor: 'text-emerald-500' },
  };
  const accent = accentColor && accentMap[accentColor];

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 pl-7 pr-3 py-1.5 text-sm transition-colors rounded-lg',
        active
          ? accent
            ? `${accent.bg} ${accent.text} font-medium`
            : 'bg-zinc-200/80 text-zinc-900 font-medium'
          : accent
            ? `text-zinc-600 hover:${accent.bg} hover:${accent.text}`
            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
      )}
    >
      <span
        className={cn(
          'flex-shrink-0',
          active ? (accent ? accent.iconColor : 'text-zinc-700') : 'text-zinc-400'
        )}
      >
        {icon}
      </span>
      <span className="flex-1 text-left truncate">{label}</span>
      {badge && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium leading-none flex-shrink-0">
          {badge}
        </span>
      )}
    </button>
  );
};

// ─── Single conversation row ──────────────────────────────────────────────────

const ConvoRow: React.FC<{
  convo: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ convo, isActive, onSelect, onDelete }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
      className={cn(
        'group relative flex items-center gap-2 mx-2 px-3 py-2 rounded-lg cursor-pointer select-none transition-colors',
        isActive
          ? 'bg-zinc-200/80 text-zinc-900'
          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
      )}
    >
      <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-50" />
      <span className="flex-1 text-sm truncate leading-5">{convo.title}</span>
      {hovered && (
        <button
          onClick={e => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex-shrink-0 p-1 rounded hover:bg-zinc-200 text-zinc-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

// ─── Section label ────────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <div className="px-5 pt-4 pb-1">
    <span className="text-xs font-medium text-zinc-400">{label}</span>
  </div>
);

// ─── Main sidebar ─────────────────────────────────────────────────────────────

export const ZenSidebar: React.FC<ZenSidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onOpenProjects,
  onOpenSettings,
  onDeleteConversation,
  onNavigate,
  userName,
  userEmail,
  activeNavId,
  industryMode = 'medtech',
}) => {
  const displayName = userName || 'My Account';
  const avatarInitial = displayName[0].toUpperCase();

  const isBiotech = industryMode === 'biotech' || industryMode === 'pharma';

  // Track-aware workspace label based on industry mode and current URL
  const workspaceLabel = (() => {
    if (isBiotech) {
      try {
        const params = new URLSearchParams(window.location.search);
        const mode = params.get('mode');
        const labels: Record<string, string> = {
          nda: 'NDA Workspace',
          bla: 'BLA Workspace',
          ind: 'IND Workspace',
        };
        return labels[mode || ''] || 'IND Workspace';
      } catch {
        return 'IND Workspace';
      }
    }
    try {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');
      const labels: Record<string, string> = {
        pma: 'PMA Workspace',
        de_novo: 'De Novo Workspace',
        hde: 'HDE Workspace',
        cer: 'CER Workspace',
      };
      return labels[mode || ''] || '510(k) Workspace';
    } catch {
      return '510(k) Workspace';
    }
  })();
  // Group conversations by time
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 86400000);

  const sorted = [...conversations].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const todayConvos = sorted.filter(c => new Date(c.timestamp) >= startOfToday);
  const yesterdayConvos = sorted.filter(
    c => new Date(c.timestamp) >= startOfYesterday && new Date(c.timestamp) < startOfToday
  );
  const olderConvos = sorted.filter(
    c => new Date(c.timestamp) >= sevenDaysAgo && new Date(c.timestamp) < startOfYesterday
  );

  // ── Collapsed icon-only strip ──────────────────────────────────────────────
  if (isCollapsed) {
    return (
      <aside className="flex flex-col h-full w-14 bg-zinc-50 border-r border-zinc-200 items-center py-3 gap-2 flex-shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <button
          onClick={onNewChat}
          title="New chat"
          className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={onOpenProjects}
          title="Projects"
          className="w-9 h-9 rounded-xl text-zinc-500 flex items-center justify-center hover:bg-zinc-200 transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleCollapse}
          title="Expand sidebar"
          className="mt-auto w-9 h-9 rounded-xl text-zinc-400 flex items-center justify-center hover:bg-zinc-200 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={onOpenSettings}
          title="Settings"
          className="w-9 h-9 rounded-xl text-zinc-400 flex items-center justify-center hover:bg-zinc-200 transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  // ── Full expanded sidebar ──────────────────────────────────────────────────
  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onToggleCollapse} />
      <aside className="flex flex-col h-full w-64 bg-zinc-50 border-r border-zinc-200 flex-shrink-0 fixed z-50 md:static md:z-auto">
        {/* Brand header */}
        <div className="flex items-center justify-between px-4 h-14 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-zinc-900 text-sm">Concept2Cure</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium leading-none">
              Regulatory
            </span>
          </div>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* New conversation */}
        <div className="px-3 pb-2 flex-shrink-0">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors"
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            New conversation
          </button>
        </div>

        {/* Projects shortcut */}
        <div className="px-3 pb-2 flex-shrink-0">
          <button
            onClick={onOpenProjects}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 text-sm transition-colors"
          >
            <FolderOpen className="w-4 h-4 flex-shrink-0 text-zinc-400" />
            My projects
          </button>
        </div>

        <div className="mx-3 border-t border-zinc-200 flex-shrink-0" />

        {/* ── Grouped product navigation ──────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto min-h-0 zen-scroll"
          style={{ scrollbarWidth: 'thin' }}
        >
          {/* ── Workspaces ──────────────────────────────────────── */}
          <WorkspaceGroup label="Workspaces">
            <NavItem
              icon={<Brain className="w-4 h-4" />}
              label="RI Copilot"
              active={activeNavId === 'ai-copilot'}
              accentColor="blue"
              onClick={() => onNavigate?.('ai-copilot')}
            />
            {isBiotech ? (
              <>
                <NavItem
                  icon={<ShieldAlert className="w-4 h-4" />}
                  label={workspaceLabel}
                  active={activeNavId === 'ind-workspace'}
                  onClick={() => onNavigate?.('ind-workspace')}
                />
                <NavItem
                  icon={<PenLine className="w-4 h-4" />}
                  label="eCTD Co-Author"
                  active={activeNavId === 'ectd-coauthor'}
                  onClick={() => onNavigate?.('ectd-coauthor')}
                />
                <NavItem
                  icon={<Beaker className="w-4 h-4" />}
                  label="CMC Platform"
                  active={activeNavId === 'cmc'}
                  onClick={() => onNavigate?.('cmc')}
                />
                <NavItem
                  icon={<FlaskConical className="w-4 h-4" />}
                  label="Clinical Trial Hub"
                  active={activeNavId === 'clinical-trial'}
                  onClick={() => onNavigate?.('clinical-trial')}
                />
              </>
            ) : (
              <>
                <NavItem
                  icon={<ShieldAlert className="w-4 h-4" />}
                  label={workspaceLabel}
                  onClick={() => onNavigate?.('510k-workspace')}
                />
                <NavItem
                  icon={<FileText className="w-4 h-4" />}
                  label="CER Generator"
                  onClick={() => onNavigate?.('cer-generator')}
                />
                <NavItem
                  icon={<PenLine className="w-4 h-4" />}
                  label="eCTD Co-Author"
                  active={activeNavId === 'ectd-coauthor'}
                  badge="Early Access"
                  onClick={() => onNavigate?.('ectd-coauthor')}
                />
              </>
            )}
          </WorkspaceGroup>

          {/* ── Evidence ────────────────────────────────────────── */}
          <WorkspaceGroup label="Evidence">
            <NavItem
              icon={<Search className="w-4 h-4" />}
              label="Evidence Search"
              onClick={() => onNavigate?.('evidence-search')}
            />
            <NavItem
              icon={<Database className="w-4 h-4" />}
              label="CSR Repository"
              active={activeNavId === 'csr-repository'}
              onClick={() => onNavigate?.('evidence-search')}
            />
            <NavItem
              icon={<History className="w-4 h-4" />}
              label="Historical Outcomes"
              active={activeNavId === 'historical-outcomes'}
              onClick={() => onNavigate?.('evidence-search')}
            />
            <NavItem
              icon={<Microscope className="w-4 h-4" />}
              label="Precedent Intelligence"
              active={activeNavId === 'precedent-intelligence'}
              onClick={() => onNavigate?.('ai-copilot')}
            />
          </WorkspaceGroup>

          {/* ── Intelligence ──────────────────────────────────── */}
          <WorkspaceGroup label="Intelligence">
            <NavItem
              icon={<Cpu className="w-4 h-4" />}
              label="Lumen Cortex"
              active={activeNavId === 'lumen-cortex'}
              accentColor="emerald"
              onClick={() => onNavigate?.('lumen-cortex')}
            />
          </WorkspaceGroup>

          {/* ── Documents ───────────────────────────────────────── */}
          <WorkspaceGroup label="Documents">
            <NavItem
              icon={<Archive className="w-4 h-4" />}
              label="Document Vault"
              active={activeNavId === 'document-vault'}
              onClick={() => onNavigate?.('document-vault')}
            />
            <NavItem
              icon={<Package className="w-4 h-4" />}
              label="Active Dossier"
              active={activeNavId === 'active-dossier'}
              onClick={() => onNavigate?.('ind-workspace')}
            />
            <NavItem
              icon={<ScrollText className="w-4 h-4" />}
              label="Drafts"
              active={activeNavId === 'drafts'}
              onClick={() => onNavigate?.('document-vault')}
            />
          </WorkspaceGroup>

          {/* ── Governance ──────────────────────────────────────── */}
          <WorkspaceGroup label="Governance" defaultOpen={false}>
            <NavItem
              icon={<FileLock2 className="w-4 h-4" />}
              label="Provenance"
              active={activeNavId === 'provenance'}
              onClick={() => onNavigate?.('ai-copilot')}
            />
            <NavItem
              icon={<GitCompare className="w-4 h-4" />}
              label="Version Compare"
              active={activeNavId === 'version-compare'}
              onClick={() => onNavigate?.('ai-copilot')}
            />
            <NavItem
              icon={<MessageCircle className="w-4 h-4" />}
              label="Review Comments"
              active={activeNavId === 'review-comments'}
              onClick={() => onNavigate?.('ai-copilot')}
            />
            <NavItem
              icon={<BadgeCheck className="w-4 h-4" />}
              label="Signatures"
              active={activeNavId === 'signatures'}
              onClick={() => onNavigate?.('ai-copilot')}
            />
            <NavItem
              icon={<ClipboardList className="w-4 h-4" />}
              label="Audit Reports"
              active={activeNavId === 'audit-reports'}
              onClick={() => onNavigate?.('ai-copilot')}
            />
          </WorkspaceGroup>

          <div className="mx-3 my-1 border-t border-zinc-200" />

          {/* ── Conversations ──────────────────────────────────── */}
          <WorkspaceGroup label="Conversations" defaultOpen={conversations.length > 0}>
            {conversations.length === 0 && (
              <div className="px-4 py-4 text-center">
                <MessageSquare className="w-6 h-6 text-zinc-300 mx-auto mb-1.5" />
                <p className="text-xs text-zinc-400 leading-relaxed">No conversations yet.</p>
              </div>
            )}

            {todayConvos.length > 0 && (
              <>
                <SectionLabel label="Today" />
                {todayConvos.map(c => (
                  <ConvoRow
                    key={c.id}
                    convo={c}
                    isActive={c.id === activeConversationId}
                    onSelect={() => onSelectConversation(c.id)}
                    onDelete={() => onDeleteConversation(c.id)}
                  />
                ))}
              </>
            )}

            {yesterdayConvos.length > 0 && (
              <>
                <SectionLabel label="Yesterday" />
                {yesterdayConvos.map(c => (
                  <ConvoRow
                    key={c.id}
                    convo={c}
                    isActive={c.id === activeConversationId}
                    onSelect={() => onSelectConversation(c.id)}
                    onDelete={() => onDeleteConversation(c.id)}
                  />
                ))}
              </>
            )}

            {olderConvos.length > 0 && (
              <>
                <SectionLabel label="Previous 7 days" />
                {olderConvos.map(c => (
                  <ConvoRow
                    key={c.id}
                    convo={c}
                    isActive={c.id === activeConversationId}
                    onSelect={() => onSelectConversation(c.id)}
                    onDelete={() => onDeleteConversation(c.id)}
                  />
                ))}
              </>
            )}
          </WorkspaceGroup>
        </div>

        {/* User / settings footer */}
        <div className="flex-shrink-0 border-t border-zinc-200 p-3">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 text-sm transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-violet-700 leading-none">
                {avatarInitial}
              </span>
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-zinc-900 truncate leading-tight">
                  {displayName}
                </p>
                {userEmail ? (
                  <p className="text-[11px] text-zinc-400 truncate leading-tight">{userEmail}</p>
                ) : (
                  <p className="text-[11px] text-zinc-400 leading-tight">
                    Settings &amp; preferences
                  </p>
                )}
              </div>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};

export default ZenSidebar;
