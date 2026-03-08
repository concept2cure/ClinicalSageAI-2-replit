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
}) => {
  const displayName = userName || 'My Account';
  const avatarInitial = displayName[0].toUpperCase();
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
            <span className="font-semibold text-zinc-900 text-sm">Lumen AI</span>
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

        {/* ── Workspace shortcut ──────────────────────────────────── */}
        <div className="px-3 py-1.5 flex-shrink-0">
          <button
            onClick={() => onNavigate?.('regulatory-workspace')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-zinc-600 hover:bg-blue-50 hover:text-blue-700 text-sm transition-colors"
          >
            <Brain className="w-4 h-4 flex-shrink-0 text-zinc-400" />
            Workspace
          </button>
        </div>

        <div className="mx-3 border-t border-zinc-200 flex-shrink-0" />

        {/* Conversation history */}
        <div className="flex-1 overflow-y-auto min-h-0 py-1" style={{ scrollbarWidth: 'thin' }}>
          {conversations.length === 0 && (
            <div className="px-4 py-10 text-center">
              <MessageSquare className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-xs text-zinc-400 leading-relaxed">
                No conversations yet.
                <br />
                Start one above.
              </p>
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
