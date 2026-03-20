/**
 * @fileoverview Collaboration Hub — Advanced threaded collaboration workspace
 * @module concept2cure/pages/MissionControl/CollaborationHub
 *
 * Thread navigator, message detail view, context panel.
 * Supports comments, questions, change requests, review notes, and escalations
 * with visibility controls (internal / sponsor / authority).
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  Users,
  AtSign,
  AlertCircle,
  ArrowUp,
  Send,
  Eye,
  Lock,
  Search,
  Clock,
  ChevronRight,
  FileText,
  Filter,
  Reply,
  Globe,
  Shield,
  CircleDot,
  Hash,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  ClipboardList,
  AlertTriangle,
} from 'lucide-react';
import {
  useCollaboration,
  useCreateCollaboration,
  useArtifacts,
  usePrograms,
} from '../../hooks/useMissionControl';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CollaborationHubProps {
  programId: number | null;
}

type ThreadTab = 'all' | 'mine' | 'mentions' | 'escalated';
type CollabType = 'comment' | 'question' | 'change_request' | 'review_note' | 'escalation';
type Visibility = 'internal' | 'sponsor' | 'authority';

// ─── Constants ───────────────────────────────────────────────────────────────

const COLLAB_TYPE_CONFIG: Record<CollabType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  comment: { label: 'Comment', icon: MessageSquare, color: 'text-zinc-600', bg: 'bg-zinc-100' },
  question: { label: 'Question', icon: HelpCircle, color: 'text-blue-700', bg: 'bg-blue-50' },
  change_request: { label: 'Change Request', icon: RotateCcw, color: 'text-orange-700', bg: 'bg-orange-50' },
  review_note: { label: 'Review Note', icon: ClipboardList, color: 'text-purple-700', bg: 'bg-purple-50' },
  escalation: { label: 'Escalation', icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-50' },
};

const VISIBILITY_CONFIG: Record<Visibility, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  internal: { label: 'Internal', icon: Lock, color: 'text-zinc-600', bg: 'bg-zinc-100' },
  sponsor: { label: 'Sponsor', icon: Globe, color: 'text-blue-600', bg: 'bg-blue-50' },
  authority: { label: 'Authority', icon: Shield, color: 'text-emerald-600', bg: 'bg-emerald-50' },
};

const TAB_CONFIG: { key: ThreadTab; label: string; icon: React.ElementType }[] = [
  { key: 'all', label: 'All Threads', icon: MessageSquare },
  { key: 'mine', label: 'My Threads', icon: CircleDot },
  { key: 'mentions', label: 'Mentions', icon: AtSign },
  { key: 'escalated', label: 'Escalated', icon: AlertCircle },
];

const CURRENT_USER = 'current-user';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(/[\s\-_]+/)
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function relativeTime(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function isToday(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// ─── Component ───────────────────────────────────────────────────────────────

const CollaborationHub: React.FC<CollaborationHubProps> = ({ programId }) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ThreadTab>('all');
  const [typeFilter, setTypeFilter] = useState<CollabType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);

  // Compose state
  const [composeBody, setComposeBody] = useState('');
  const [composeType, setComposeType] = useState<CollabType>('comment');
  const [composeVisibility, setComposeVisibility] = useState<Visibility>('internal');
  const [composePriority, setComposePriority] = useState(false);

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: artifacts = [], isLoading: artifactsLoading } = useArtifacts(programId);
  const { data: collaboration = [], isLoading: collabLoading } = useCollaboration('program', programId);
  const createCollaboration = useCreateCollaboration();
  const { data: programs = [] } = usePrograms();

  const currentProgram = useMemo(
    () => programs.find((p: any) => p.id === programId) || null,
    [programs, programId],
  );

  // ── Derived: threads grouped by artifact ───────────────────────────────────
  const threads = useMemo(() => {
    let items = [...collaboration];

    // Tab filter
    if (activeTab === 'mine') {
      items = items.filter((c: any) => c.author === CURRENT_USER);
    } else if (activeTab === 'mentions') {
      items = items.filter((c: any) => c.body?.includes(`@${CURRENT_USER}`));
    } else if (activeTab === 'escalated') {
      items = items.filter((c: any) => c.type === 'escalation' || c.priority === 'high');
    }

    // Type filter
    if (typeFilter !== 'all') {
      items = items.filter((c: any) => c.type === typeFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (c: any) =>
          c.body?.toLowerCase().includes(q) ||
          c.author?.toLowerCase().includes(q) ||
          c.type?.toLowerCase().includes(q),
      );
    }

    // Sort by most recent first
    items.sort((a: any, b: any) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });

    return items;
  }, [collaboration, activeTab, typeFilter, searchQuery]);

  // Group threads by artifact
  const groupedThreads = useMemo(() => {
    const groups: Record<number, { artifact: any; threads: any[] }> = {};
    for (const thread of threads) {
      const artId = thread.targetId;
      if (!groups[artId]) {
        const art = artifacts.find((a: any) => a.id === artId);
        groups[artId] = {
          artifact: art || { id: artId, title: `Artifact #${artId}`, code: '—' },
          threads: [],
        };
      }
      groups[artId].threads.push(thread);
    }
    return Object.values(groups);
  }, [threads, artifacts]);

  const selectedThread = useMemo(
    () => collaboration.find((c: any) => c.id === selectedThreadId) || null,
    [collaboration, selectedThreadId],
  );

  const linkedArtifact = useMemo(() => {
    if (!selectedThread) return null;
    return artifacts.find((a: any) => a.id === selectedThread.targetId) || null;
  }, [selectedThread, artifacts]);

  // Threads for the same artifact as selected
  const relatedThreads = useMemo(() => {
    if (!selectedThread) return [];
    return collaboration
      .filter((c: any) => c.targetId === selectedThread.targetId && c.id !== selectedThread.id)
      .slice(0, 5);
  }, [collaboration, selectedThread]);

  // Participants for the selected artifact
  const participants = useMemo(() => {
    if (!selectedThread) return [];
    const authors = new Set<string>();
    collaboration
      .filter((c: any) => c.targetId === selectedThread.targetId)
      .forEach((c: any) => {
        if (c.author) authors.add(c.author);
      });
    return Array.from(authors);
  }, [collaboration, selectedThread]);

  // Activity summary
  const activitySummary = useMemo(() => {
    const todayMessages = collaboration.filter((c: any) => isToday(c.createdAt)).length;
    const openQuestions = collaboration.filter(
      (c: any) => c.type === 'question' && !c.resolvedAt,
    ).length;
    const pendingChanges = collaboration.filter(
      (c: any) => c.type === 'change_request' && !c.resolvedAt,
    ).length;
    return { todayMessages, openQuestions, pendingChanges };
  }, [collaboration]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSend = () => {
    if (!composeBody.trim() || !selectedThread) return;
    createCollaboration.mutate({
      targetType: 'artifact',
      targetId: selectedThread.targetId,
      type: composeType,
      body: composeBody.trim(),
      author: CURRENT_USER,
      visibility: composeVisibility,
      priority: composePriority ? 'high' : 'normal',
      parentId: replyingTo,
    });
    setComposeBody('');
    setComposePriority(false);
    setReplyingTo(null);
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  const isLoading = artifactsLoading || collabLoading;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Clock className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  // When no program is selected, show a cross-program collaboration view
  // instead of a blank screen

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col bg-[#FAFAF9] overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-blue-500" />
          <h1 className="text-base font-semibold text-zinc-900">Collaboration Hub</h1>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 text-blue-700">
            <MessageSquare className="w-3 h-3" /> {collaboration.length} threads
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-50 text-orange-700">
            <HelpCircle className="w-3 h-3" /> {activitySummary.openQuestions} open questions
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="w-3 h-3" /> {activitySummary.todayMessages} today
          </span>
        </div>
      </div>

      {/* ── Three-Column Layout ─────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── Left Column: Thread Navigator ──────────────────────────────── */}
        <div className="w-80 border-r bg-white flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b">
            {TAB_CONFIG.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-medium border-b-2 transition-colors',
                    activeTab === tab.key
                      ? 'border-blue-500 text-blue-700'
                      : 'border-transparent text-zinc-500 hover:text-zinc-700',
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search & Filter */}
          <div className="p-3 space-y-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Search threads..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 border border-zinc-200 rounded-lg bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-zinc-400" />
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as CollabType | 'all')}
                className="text-[11px] px-1.5 py-1 border border-zinc-200 rounded-md bg-white text-zinc-700"
              >
                <option value="all">All Types</option>
                {(Object.keys(COLLAB_TYPE_CONFIG) as CollabType[]).map(key => (
                  <option key={key} value={key}>
                    {COLLAB_TYPE_CONFIG[key].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Thread List */}
          <div className="flex-1 overflow-y-auto divide-y">
            {groupedThreads.length === 0 ? (
              <div className="p-6 text-center">
                <MessageSquare className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
                <p className="text-xs text-zinc-500">No threads found</p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {searchQuery ? 'Try adjusting your search' : 'Threads will appear as collaboration begins'}
                </p>
              </div>
            ) : (
              groupedThreads.map(group => (
                <div key={group.artifact.id}>
                  {/* Artifact group header */}
                  <div className="px-3 py-1.5 bg-zinc-50 border-b">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3 h-3 text-zinc-400" />
                      <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider truncate">
                        {group.artifact.title}
                      </span>
                      <span className="text-[11px] text-zinc-400 ml-auto">{group.threads.length}</span>
                    </div>
                  </div>
                  {/* Threads under this artifact */}
                  {group.threads.map((thread: any) => {
                    const isActive = selectedThreadId === thread.id;
                    const typeConf = COLLAB_TYPE_CONFIG[thread.type as CollabType] || COLLAB_TYPE_CONFIG.comment;
                    const TypeIcon = typeConf.icon;
                    return (
                      <button
                        key={thread.id}
                        onClick={() => setSelectedThreadId(thread.id)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 transition-colors',
                          isActive ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-zinc-50',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <TypeIcon className={cn('w-3.5 h-3.5 mt-0.5 flex-shrink-0', typeConf.color)} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-zinc-800 truncate">
                                {thread.author || 'Unknown'}
                              </span>
                              {thread.priority === 'high' && (
                                <ArrowUp className="w-3 h-3 text-red-500 flex-shrink-0" />
                              )}
                              <span className="text-[11px] text-zinc-400 ml-auto flex-shrink-0">
                                {relativeTime(thread.createdAt)}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-600 mt-0.5 line-clamp-2">
                              {thread.body || 'No content'}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={cn('text-[11px] px-1 py-0.5 rounded', typeConf.bg, typeConf.color)}>
                                {typeConf.label}
                              </span>
                              {thread.visibility && (
                                <span className={cn(
                                  'text-[11px] px-1 py-0.5 rounded',
                                  VISIBILITY_CONFIG[thread.visibility as Visibility]?.bg || 'bg-zinc-100',
                                  VISIBILITY_CONFIG[thread.visibility as Visibility]?.color || 'text-zinc-600',
                                )}>
                                  {VISIBILITY_CONFIG[thread.visibility as Visibility]?.label || thread.visibility}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ─── Center Column: Thread Detail ───────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedThread ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-10 h-10 text-zinc-200 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">Select a thread to view details</p>
                <p className="text-xs text-zinc-400 mt-1">Choose from the navigator on the left</p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="border-b bg-white px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-zinc-900">
                        {linkedArtifact?.title || `Thread #${selectedThread.id}`}
                      </h2>
                      {(() => {
                        const tc = COLLAB_TYPE_CONFIG[selectedThread.type as CollabType] || COLLAB_TYPE_CONFIG.comment;
                        return (
                          <span className={cn('text-[11px] px-1.5 py-0.5 rounded-full', tc.bg, tc.color)}>
                            {tc.label}
                          </span>
                        );
                      })()}
                      {selectedThread.priority === 'high' && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700">
                          High Priority
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {linkedArtifact && (
                        <>
                          <span className="text-xs font-mono text-zinc-500">{linkedArtifact.code}</span>
                          <span className="text-xs text-zinc-400">|</span>
                        </>
                      )}
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-zinc-400" />
                        <span className="text-xs text-zinc-600">{participants.length} participants</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Selected thread as primary message */}
                <ThreadMessage
                  message={selectedThread}
                  onReply={() => setReplyingTo(selectedThread.id)}
                />

                {/* Related messages on the same artifact (simulate thread) */}
                {relatedThreads.map((msg: any) => (
                  <ThreadMessage
                    key={msg.id}
                    message={msg}
                    onReply={() => setReplyingTo(msg.id)}
                  />
                ))}

                {relatedThreads.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-xs text-zinc-400">No other messages in this thread</p>
                  </div>
                )}
              </div>

              {/* Compose Area */}
              <div className="border-t bg-white px-6 py-3">
                {replyingTo && (
                  <div className="flex items-center gap-2 mb-2 text-xs text-zinc-500">
                    <Reply className="w-3 h-3" />
                    <span>Replying to message #{replyingTo}</span>
                    <button
                      onClick={() => setReplyingTo(null)}
                      className="text-zinc-400 hover:text-zinc-600 ml-1"
                    >
                      &times;
                    </button>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <textarea
                    value={composeBody}
                    onChange={e => setComposeBody(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
                    }}
                    placeholder="Type your message... (Ctrl+Enter to send)"
                    rows={2}
                    className="flex-1 text-sm px-3 py-2 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {/* Type selector */}
                  <select
                    value={composeType}
                    onChange={e => setComposeType(e.target.value as CollabType)}
                    className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700"
                  >
                    {(Object.keys(COLLAB_TYPE_CONFIG) as CollabType[]).map(key => (
                      <option key={key} value={key}>
                        {COLLAB_TYPE_CONFIG[key].label}
                      </option>
                    ))}
                  </select>

                  {/* Visibility selector */}
                  <select
                    value={composeVisibility}
                    onChange={e => setComposeVisibility(e.target.value as Visibility)}
                    className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700"
                  >
                    {(Object.keys(VISIBILITY_CONFIG) as Visibility[]).map(key => (
                      <option key={key} value={key}>
                        {VISIBILITY_CONFIG[key].label}
                      </option>
                    ))}
                  </select>

                  {/* Priority toggle */}
                  <button
                    onClick={() => setComposePriority(!composePriority)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg border transition-colors',
                      composePriority
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50',
                    )}
                  >
                    <ArrowUp className="w-3 h-3" />
                    Priority
                  </button>

                  <div className="flex-1" />

                  {/* Send */}
                  <button
                    onClick={handleSend}
                    disabled={!composeBody.trim() || createCollaboration.isPending}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-60 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ─── Right Column: Context Panel ────────────────────────────────── */}
        <div className="w-72 border-l bg-white overflow-y-auto">
          {!selectedThread ? (
            <div className="p-6 text-center">
              <Eye className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">Context will appear when a thread is selected</p>
            </div>
          ) : (
            <div className="divide-y">
              {/* Linked Artifact */}
              <div className="p-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Linked Artifact
                </h3>
                {linkedArtifact ? (
                  <div className="bg-zinc-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 mt-0.5 text-zinc-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-800 truncate">{linkedArtifact.title}</p>
                        <p className="text-[11px] font-mono text-zinc-500">{linkedArtifact.code}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        'text-[11px] px-1.5 py-0.5 rounded-full',
                        linkedArtifact.lifecycleState === 'approved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : linkedArtifact.lifecycleState === 'in-review'
                          ? 'bg-blue-100 text-blue-700'
                          : linkedArtifact.lifecycleState === 'revision-needed'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-zinc-100 text-zinc-600',
                      )}>
                        {linkedArtifact.lifecycleState || 'unknown'}
                      </span>
                      {linkedArtifact.dossierModule && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                          {linkedArtifact.dossierModule}
                        </span>
                      )}
                      {linkedArtifact.artifactType && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 capitalize">
                          {linkedArtifact.artifactType}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">Artifact not found</p>
                )}
              </div>

              {/* Participants */}
              <div className="p-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Participants
                </h3>
                {participants.length === 0 ? (
                  <p className="text-xs text-zinc-400">No participants</p>
                ) : (
                  <div className="space-y-2">
                    {participants.map((name, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-semibold flex-shrink-0">
                          {getInitials(name)}
                        </div>
                        <span className="text-xs text-zinc-700 truncate">{name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity Summary */}
              <div className="p-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Activity Summary
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-zinc-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-xs text-zinc-600">Messages today</span>
                    </div>
                    <span className="text-xs font-semibold text-zinc-800">{activitySummary.todayMessages}</span>
                  </div>
                  <div className="flex items-center justify-between bg-zinc-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-xs text-zinc-600">Open questions</span>
                    </div>
                    <span className="text-xs font-semibold text-zinc-800">{activitySummary.openQuestions}</span>
                  </div>
                  <div className="flex items-center justify-between bg-zinc-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="w-3.5 h-3.5 text-purple-500" />
                      <span className="text-xs text-zinc-600">Pending changes</span>
                    </div>
                    <span className="text-xs font-semibold text-zinc-800">{activitySummary.pendingChanges}</span>
                  </div>
                </div>
              </div>

              {/* Related Threads */}
              <div className="p-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Related Threads
                </h3>
                {relatedThreads.length === 0 ? (
                  <p className="text-xs text-zinc-400">No related threads</p>
                ) : (
                  <div className="space-y-2">
                    {relatedThreads.map((t: any) => {
                      const tc = COLLAB_TYPE_CONFIG[t.type as CollabType] || COLLAB_TYPE_CONFIG.comment;
                      const TIcon = tc.icon;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setSelectedThreadId(t.id)}
                          className="w-full text-left flex items-start gap-2 p-2 rounded-lg hover:bg-zinc-50 transition-colors"
                        >
                          <TIcon className={cn('w-3.5 h-3.5 mt-0.5 flex-shrink-0', tc.color)} />
                          <div className="min-w-0">
                            <p className="text-xs text-zinc-700 line-clamp-1">{t.body || 'No content'}</p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                              {t.author} &middot; {relativeTime(t.createdAt)}
                            </p>
                          </div>
                          <ChevronRight className="w-3 h-3 text-zinc-400 mt-0.5 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Sub-component: ThreadMessage ────────────────────────────────────────────

interface ThreadMessageProps {
  message: any;
  onReply: () => void;
}

const ThreadMessage: React.FC<ThreadMessageProps> = ({ message, onReply }) => {
  const typeConf = COLLAB_TYPE_CONFIG[message.type as CollabType] || COLLAB_TYPE_CONFIG.comment;
  const visConf = VISIBILITY_CONFIG[message.visibility as Visibility];
  const TypeIcon = typeConf.icon;

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-start gap-3">
        {/* Author avatar */}
        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
          {getInitials(message.author || 'U')}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header line */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-800">{message.author || 'Unknown'}</span>
            {message.role && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
                {message.role}
              </span>
            )}
            <span className={cn('text-[11px] px-1.5 py-0.5 rounded-full', typeConf.bg, typeConf.color)}>
              {typeConf.label}
            </span>
            {visConf && (
              <span className={cn('text-[11px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5', visConf.bg, visConf.color)}>
                <visConf.icon className="w-2.5 h-2.5" />
                {visConf.label}
              </span>
            )}
            {message.priority === 'high' && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 flex items-center gap-0.5">
                <ArrowUp className="w-2.5 h-2.5" />
                High Priority
              </span>
            )}
            <span className="text-[11px] text-zinc-400 ml-auto">
              {relativeTime(message.createdAt)}
            </span>
          </div>

          {/* Content */}
          <p className="text-sm text-zinc-700 mt-2 whitespace-pre-wrap">{message.body || 'No content'}</p>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={onReply}
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-blue-600 transition-colors"
            >
              <Reply className="w-3 h-3" />
              Reply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollaborationHub;
