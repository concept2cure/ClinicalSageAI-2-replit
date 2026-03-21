/**
 * @fileoverview Zen Sidebar — Claude.ai-style, intent-organized navigation
 * @module concept2cure/components/sidebar/ZenSidebar
 *
 * Navigation restructured around user workflow:
 *   CREATE  → Ask AnA, Draft Sections, Guided Authoring, Team Reviews
 *   RESEARCH → Find Evidence, Biostatistics, Predictions
 *   REVIEW  → Check Compliance, Submission Pulse, AI Agents
 *   MANAGE  → Operations, Documents, Knowledge Base, Academy
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
  PenLine,
  Search,
  ShieldCheck,
  BarChart3,
  GraduationCap,
  Users,
  FlaskConical,
  Snowflake,
  Bot,
  Compass,
  Activity,
  Upload,
  Layers,
  Package,
  BookOpen,
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
  activeNavId?: string;
  industryMode?: string;
}

// ─── Workspace group ──────────────────────────────────────────────────────────

const WorkspaceGroup: React.FC<{
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ label, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-400 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded transition-colors duration-150"
      >
        <ChevronDown
          className={cn(
            'w-2.5 h-2.5 flex-shrink-0 transition-transform duration-150',
            !open && '-rotate-90'
          )}
        />
        <span>{label}</span>
      </button>
      {open && <div className="pb-2 space-y-px">{children}</div>}
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
  subtitle?: string;
  onClick: () => void;
}> = ({ icon, label, active, accentColor, badge, subtitle, onClick }) => {
  const accentMap = {
    blue: { bg: 'bg-blue-500/15', text: 'text-blue-400', iconColor: 'text-blue-400' },
    violet: { bg: 'bg-violet-500/15', text: 'text-violet-400', iconColor: 'text-violet-400' },
    emerald: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', iconColor: 'text-emerald-400' },
  };
  const accent = accentColor && accentMap[accentColor];

  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'w-full flex items-center gap-2.5 mx-1 pl-5 pr-3 py-[6px] text-sm transition-all duration-150 rounded-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
        active
          ? accent
            ? `${accent.bg} ${accent.text} font-medium`
            : 'bg-white/10 text-white font-medium'
          : accent
            ? cn(
                'text-zinc-400',
                accent.bg === 'bg-blue-500/15' && 'hover:bg-blue-500/10 hover:text-blue-400',
                accent.bg === 'bg-violet-500/15' && 'hover:bg-blue-500/10 hover:text-violet-400',
                accent.bg === 'bg-emerald-500/15' && 'hover:bg-emerald-500/10 hover:text-emerald-400'
              )
            : 'text-zinc-400 hover:bg-white/8 hover:text-zinc-200'
      )}
    >
      <span
        className={cn(
          'flex-shrink-0',
          active ? (accent ? accent.iconColor : 'text-white') : 'text-zinc-500'
        )}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0 text-left">
        <span className="block truncate">{label}</span>
        {subtitle && (
          <span className="block text-xs text-zinc-500 truncate leading-tight">{subtitle}</span>
        )}
      </div>
      {badge && (
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium leading-none flex-shrink-0">
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
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'group relative flex items-center gap-2 mx-2 px-3 py-2 rounded-lg cursor-pointer select-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
        isActive
          ? 'bg-white/10 text-white'
          : 'text-zinc-400 hover:bg-white/8 hover:text-zinc-200'
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
          aria-label={`Delete conversation: ${convo.title}`}
          className={cn(
            'flex-shrink-0 p-1 rounded text-zinc-500 hover:bg-white/10 hover:text-red-400 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-all duration-150',
            hovered ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100'
          )}
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
    <span className="text-xs font-medium text-zinc-500">{label}</span>
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
      <aside
        className="flex flex-col h-full w-14 bg-zinc-900 border-r border-zinc-800 items-center py-3 gap-2 flex-shrink-0"
        role="navigation"
        aria-label="Main sidebar"
      >
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <button
          onClick={onNewChat}
          aria-label="New chat"
          className="w-9 h-9 rounded-lg bg-white/10 text-white flex items-center justify-center hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={onOpenProjects}
          aria-label="Projects"
          className="w-9 h-9 rounded-lg text-zinc-400 flex items-center justify-center hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150"
        >
          <FolderOpen className="w-4 h-4" />
        </button>

        {/* Core workflow icons */}
        <div className="w-8 border-t border-zinc-700 my-1" />
        <button
          onClick={() => onNavigate?.('ai-copilot')}
          aria-label="Ask AnA"
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150',
            activeNavId === 'ai-copilot' ? 'bg-violet-500/15 text-violet-400' : 'text-zinc-400 hover:bg-white/10'
          )}
        >
          <Sparkles className="w-4 h-4" />
        </button>
        <button
          onClick={() => onNavigate?.('author')}
          aria-label="Draft Sections"
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150',
            activeNavId === 'author' ? 'bg-emerald-500/15 text-emerald-400' : 'text-zinc-400 hover:bg-white/10'
          )}
        >
          <PenLine className="w-4 h-4" />
        </button>
        <button
          onClick={() => onNavigate?.('intelligence-hub')}
          aria-label="Find Evidence"
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150',
            activeNavId === 'intelligence-hub' ? 'bg-blue-500/15 text-blue-400' : 'text-zinc-400 hover:bg-white/10'
          )}
        >
          <Search className="w-4 h-4" />
        </button>
        <button
          onClick={() => onNavigate?.('review-readiness')}
          aria-label="Check Compliance"
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150',
            activeNavId === 'review-readiness' ? 'bg-blue-500/15 text-blue-400' : 'text-zinc-400 hover:bg-white/10'
          )}
        >
          <ShieldCheck className="w-4 h-4" />
        </button>
        <button
          onClick={() => onNavigate?.('artifacts')}
          aria-label="Documents"
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150',
            activeNavId === 'artifacts' ? 'bg-violet-500/15 text-violet-400' : 'text-zinc-400 hover:bg-white/10'
          )}
        >
          <Layers className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          className="mt-auto w-9 h-9 rounded-lg text-zinc-500 flex items-center justify-center hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="w-9 h-9 rounded-lg text-zinc-500 flex items-center justify-center hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150"
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
      <aside
        className="flex flex-col h-full w-56 bg-zinc-900 border-r border-zinc-800 flex-shrink-0 fixed z-50 md:static md:z-auto"
        role="navigation"
        aria-label="Main sidebar"
      >
        {/* Brand header */}
        <div className="flex items-center justify-between px-3 h-11 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="font-semibold text-white text-sm">Concept2Cure</span>
          </div>
          <button
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-400 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* New workspace thread */}
        <div className="px-2 pb-1.5 flex-shrink-0">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150"
          >
            <Plus className="w-3.5 h-3.5 flex-shrink-0" />
            New workspace thread
          </button>
        </div>

        {/* Projects shortcut */}
        <div className="px-2 pb-1.5 flex-shrink-0">
          <button
            onClick={onOpenProjects}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:bg-white/8 hover:text-zinc-200 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150"
          >
            <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500" />
            My projects
          </button>
        </div>

        <div className="mx-2 border-t border-zinc-800 flex-shrink-0" />

        {/* ── Intent-organized navigation ──────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto min-h-0 zen-scroll py-1"
          style={{ scrollbarWidth: 'thin' }}
        >
          {/* ── CREATE — draft, write, build ────────────────────── */}
          <WorkspaceGroup label="Create">
            <NavItem
              icon={<Sparkles className="w-3.5 h-3.5" />}
              label="Ask AnA"
              subtitle="Questions · Strategy · Guidance"
              active={activeNavId === 'ai-copilot'}
              accentColor="violet"
              onClick={() => onNavigate?.('ai-copilot')}
            />
            <NavItem
              icon={<PenLine className="w-3.5 h-3.5" />}
              label="Draft Sections"
              subtitle="eCTD · CSR · CTD modules"
              active={activeNavId === 'author'}
              accentColor="emerald"
              onClick={() => onNavigate?.('author')}
            />
            <NavItem
              icon={<Compass className="w-3.5 h-3.5" />}
              label="Guided Authoring"
              subtitle="Step-by-step with AI assist"
              active={activeNavId === 'document-sherpa'}
              onClick={() => onNavigate?.('document-sherpa')}
            />
            <NavItem
              icon={<Users className="w-3.5 h-3.5" />}
              label="Team Reviews"
              subtitle="Comments · Decisions"
              active={activeNavId === 'collaboration-hub'}
              accentColor="blue"
              onClick={() => onNavigate?.('collaboration-hub')}
            />
          </WorkspaceGroup>

          {/* ── RESEARCH — find evidence, analyze data ──────────── */}
          <WorkspaceGroup label="Research">
            <NavItem
              icon={<Search className="w-3.5 h-3.5" />}
              label="Find Evidence"
              subtitle="Literature · Precedents · Alerts"
              active={activeNavId === 'intelligence-hub'}
              accentColor="violet"
              onClick={() => onNavigate?.('intelligence-hub')}
            />
            <NavItem
              icon={<FlaskConical className="w-3.5 h-3.5" />}
              label="Biostatistics"
              subtitle="Power · Endpoints · Design"
              active={activeNavId === 'biostatistics'}
              accentColor="emerald"
              onClick={() => onNavigate?.('biostatistics')}
            />
            <NavItem
              icon={<Snowflake className="w-3.5 h-3.5" />}
              label="Predictions"
              subtitle="Simulations · Forecasts"
              active={activeNavId === 'snowglobe'}
              accentColor="blue"
              onClick={() => onNavigate?.('snowglobe')}
            />
          </WorkspaceGroup>

          {/* ── REVIEW — quality, compliance, readiness ──────────── */}
          <WorkspaceGroup label="Review">
            <NavItem
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
              label="Check Compliance"
              subtitle="Quality · Audit · Readiness"
              active={activeNavId === 'review-readiness'}
              onClick={() => onNavigate?.('review-readiness')}
            />
            <NavItem
              icon={<Activity className="w-3.5 h-3.5" />}
              label="Submission Pulse"
              subtitle="Signals · Risk · Status"
              active={activeNavId === 'review-pulse'}
              onClick={() => onNavigate?.('review-pulse')}
            />
            <NavItem
              icon={<Bot className="w-3.5 h-3.5" />}
              label="AI Agents"
              subtitle="Automated checks"
              active={activeNavId === 'agent-hub'}
              accentColor="violet"
              onClick={() => onNavigate?.('agent-hub')}
            />
          </WorkspaceGroup>

          {/* ── MANAGE — operations, files, settings ─────────────── */}
          <WorkspaceGroup label="Manage" defaultOpen={false}>
            <NavItem
              icon={<BarChart3 className="w-3.5 h-3.5" />}
              label="Operations"
              subtitle="Submissions · Workflows"
              active={activeNavId === 'command-center'}
              onClick={() => onNavigate?.('command-center')}
            />
            <NavItem
              icon={<Layers className="w-3.5 h-3.5" />}
              label="Documents"
              subtitle="All outputs · Templates"
              active={activeNavId === 'artifacts'}
              accentColor="violet"
              onClick={() => onNavigate?.('artifacts')}
            />
            <NavItem
              icon={<Package className="w-3.5 h-3.5" />}
              label="Submissions"
              subtitle="eCTD builder · Packaging"
              active={activeNavId === 'submission-builder'}
              accentColor="indigo"
              onClick={() => onNavigate?.('submission-builder')}
            />
            <NavItem
              icon={<BookOpen className="w-3.5 h-3.5" />}
              label="Templates"
              subtitle="Regulatory templates"
              active={activeNavId === 'template-library'}
              accentColor="violet"
              onClick={() => onNavigate?.('template-library')}
            />
            <NavItem
              icon={<Upload className="w-3.5 h-3.5" />}
              label="Knowledge Base"
              subtitle="Reference materials"
              active={activeNavId === 'knowledge-base'}
              accentColor="emerald"
              onClick={() => onNavigate?.('knowledge-base')}
            />
            <NavItem
              icon={<GraduationCap className="w-3.5 h-3.5" />}
              label="Academy"
              subtitle="Guides · Training"
              active={activeNavId === 'enablement-center'}
              onClick={() => onNavigate?.('enablement-center')}
            />
          </WorkspaceGroup>

          <div className="mx-2 my-1.5 border-t border-zinc-800" />

          {/* ── Conversations ──────────────────────────────────── */}
          <WorkspaceGroup label="Conversations" defaultOpen={conversations.length > 0}>
            {conversations.length === 0 && (
              <div className="px-4 py-4 text-center">
                <MessageSquare className="w-6 h-6 text-zinc-600 mx-auto mb-1.5" />
                <p className="text-xs text-zinc-500 leading-relaxed">No conversations yet.</p>
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
        <div className="flex-shrink-0 border-t border-zinc-800 p-2">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-zinc-400 hover:bg-white/10 hover:text-zinc-200 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors duration-150"
          >
            <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-violet-400 leading-none">
                {avatarInitial}
              </span>
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-zinc-200 truncate leading-tight">
                  {displayName}
                </p>
                {userEmail && (
                  <p className="text-xs text-zinc-500 truncate leading-tight">{userEmail}</p>
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
