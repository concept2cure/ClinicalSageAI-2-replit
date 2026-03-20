/**
 * User Inbox & Worklist — Personal command center
 *
 * Claude.ai-inspired clean interface showing:
 * - Urgent items requiring immediate action
 * - Pending approvals assigned to the user
 * - Active project worklist with next actions
 * - Alerts and notifications
 * - AnA-generated daily summary
 *
 * @module concept2cure/pages/UserInbox
 */

import React, { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Inbox,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Shield,
  FileText,
  Zap,
  ChevronRight,
  MessageSquare,
  Bell,
  ListTodo,
  BarChart3,
  Sparkles,
  UserPlus,
  GitBranch,
} from 'lucide-react';
import DecisionLineageMap from '../components/audit/DecisionLineageMap';
import {
  useApprovalRequests,
  useDecideApproval,
  usePrograms,
} from '../hooks/useMissionControl';

// ── Types ────────────────────────────────────────────────────────────────────

type InboxSection = 'overview' | 'approvals' | 'tasks' | 'alerts' | 'lineage';

// ── Component ────────────────────────────────────────────────────────────────

const UserInbox: React.FC<{ onNavigate?: (mode: string) => void }> = ({ onNavigate }) => {
  const [activeSection, setActiveSection] = useState<InboxSection>('overview');
  const [greeting, setGreeting] = useState('');

  const { data: approvals = [] } = useApprovalRequests(null);
  const { data: programs = [] } = usePrograms();
  const decideApproval = useDecideApproval();

  const pendingApprovals = useMemo(
    () => approvals.filter((a: any) => a.status === 'pending'),
    [approvals],
  );

  const urgentItems = useMemo(() => {
    const items: Array<{ id: string; type: string; title: string; priority: string; dueDate?: string; action: string }> = [];

    // Add critical/high pending approvals
    pendingApprovals
      .filter((a: any) => a.priority === 'critical' || a.priority === 'high')
      .forEach((a: any) => {
        items.push({
          id: `approval-${a.id}`,
          type: 'approval',
          title: a.title,
          priority: a.priority,
          dueDate: a.dueDate,
          action: 'Review & decide',
        });
      });

    return items;
  }, [pendingApprovals]);

  // Generate time-aware greeting
  useEffect(() => {
    const hour = new Date().getHours();
    let timeGreeting = 'Good morning';
    if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon';
    else if (hour >= 17) timeGreeting = 'Good evening';

    const pendingCount = pendingApprovals.length;
    const urgentCount = urgentItems.length;

    let summary = '';
    if (urgentCount > 0) {
      summary = `You have ${urgentCount} urgent item${urgentCount > 1 ? 's' : ''} that need${urgentCount === 1 ? 's' : ''} your attention`;
      if (pendingCount > urgentCount) {
        summary += ` and ${pendingCount - urgentCount} other pending approval${pendingCount - urgentCount > 1 ? 's' : ''}`;
      }
      summary += '.';
    } else if (pendingCount > 0) {
      summary = `You have ${pendingCount} pending approval${pendingCount > 1 ? 's' : ''} to review.`;
    } else {
      summary = "You're all caught up. No pending items right now.";
    }

    setGreeting(`${timeGreeting}. ${summary}`);
  }, [pendingApprovals.length, urgentItems.length]);

  const sections: { key: InboxSection; label: string; icon: React.ElementType; badge?: number }[] = [
    { key: 'overview', label: 'Overview', icon: Inbox },
    { key: 'approvals', label: 'Approvals', icon: Shield, badge: pendingApprovals.length || undefined },
    { key: 'tasks', label: 'My Tasks', icon: ListTodo },
    { key: 'alerts', label: 'Alerts', icon: Bell },
    { key: 'lineage', label: 'Decision Lineage', icon: GitBranch },
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#FAFAF9] overflow-hidden">
      {/* ── Navigation tabs ──────────────────────────────────────────────── */}
      <div className="border-b bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center gap-6 h-11">
            {sections.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={cn(
                    'flex items-center gap-1.5 h-full text-xs font-medium border-b-2 transition-colors',
                    activeSection === s.key
                      ? 'border-zinc-900 text-zinc-900'
                      : 'border-transparent text-zinc-400 hover:text-zinc-600',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {s.label}
                  {s.badge && (
                    <span className="flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-full bg-amber-100 text-amber-700">
                      {s.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">

          {/* AnA greeting / summary */}
          <div className="mb-6 bg-white rounded-xl border p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm text-zinc-800 leading-relaxed">{greeting}</p>
                <p className="text-[11px] text-zinc-400 mt-1">AnA — Your regulatory intelligence copilot</p>
              </div>
            </div>
          </div>

          {activeSection === 'overview' && (
            <OverviewSection
              urgentItems={urgentItems}
              pendingApprovals={pendingApprovals}
              programs={programs}
              onNavigate={onNavigate}
              onSwitchSection={setActiveSection}
            />
          )}

          {activeSection === 'approvals' && (
            <ApprovalsSection
              approvals={approvals}
              decideApproval={decideApproval}
            />
          )}

          {activeSection === 'tasks' && (
            <TasksSection programs={programs} onNavigate={onNavigate} />
          )}

          {activeSection === 'alerts' && (
            <AlertsSection />
          )}

          {activeSection === 'lineage' && (
            <div className="bg-white rounded-xl border overflow-hidden" style={{ minHeight: '500px' }}>
              <DecisionLineageMap
                entityType="organization"
                entityId={1}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Overview Section ─────────────────────────────────────────────────────────

function OverviewSection({
  urgentItems,
  pendingApprovals,
  programs,
  onNavigate,
  onSwitchSection,
}: {
  urgentItems: any[];
  pendingApprovals: any[];
  programs: any[];
  onNavigate?: (mode: string) => void;
  onSwitchSection: (s: InboxSection) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Urgent items */}
      {urgentItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">Urgent</h3>
          </div>
          <div className="space-y-2">
            {urgentItems.map(item => (
              <button
                key={item.id}
                onClick={() => onSwitchSection('approvals')}
                className="w-full text-left bg-white rounded-xl border border-red-100 p-4 hover:border-red-200 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate">{item.title}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {item.action}
                      {item.dueDate && ` · Due ${new Date(item.dueDate).toLocaleDateString()}`}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => onSwitchSection('approvals')}
          className="bg-white rounded-xl border p-4 text-left hover:border-zinc-300 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Pending Approvals</span>
          </div>
          <p className="text-2xl font-semibold text-zinc-900">{pendingApprovals.length}</p>
        </button>
        <button
          onClick={() => onSwitchSection('tasks')}
          className="bg-white rounded-xl border p-4 text-left hover:border-zinc-300 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <ListTodo className="w-4 h-4 text-blue-500" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Active Programs</span>
          </div>
          <p className="text-2xl font-semibold text-zinc-900">{programs.length || 0}</p>
        </button>
        <div className="bg-white rounded-xl border p-4 text-left">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Completed This Week</span>
          </div>
          <p className="text-2xl font-semibold text-zinc-900">—</p>
        </div>
      </div>

      {/* Next actions */}
      {pendingApprovals.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
            <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">Next Actions</h3>
          </div>
          <div className="space-y-2">
            {pendingApprovals.slice(0, 5).map((a: any) => (
              <button
                key={a.id}
                onClick={() => onSwitchSection('approvals')}
                className="w-full text-left bg-white rounded-xl border p-3.5 hover:border-zinc-300 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-800 truncate">{a.title}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      From {a.requestedBy} · {a.requestedByRole}
                    </p>
                  </div>
                  <span className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0',
                    a.priority === 'critical' ? 'bg-red-100 text-red-700' :
                    a.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                    'bg-zinc-100 text-zinc-600',
                  )}>
                    {a.priority}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-500" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active programs */}
      {programs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-3.5 h-3.5 text-violet-500" />
            <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">Active Programs</h3>
          </div>
          <div className="space-y-2">
            {programs.slice(0, 4).map((p: any) => (
              <button
                key={p.id}
                onClick={() => onNavigate?.('command-center')}
                className="w-full text-left bg-white rounded-xl border p-3.5 hover:border-zinc-300 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-800">{p.name}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{p.code} · {p.developmentStage || 'active'}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-500" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Approvals Section ────────────────────────────────────────────────────────

function ApprovalsSection({
  approvals,
  decideApproval,
}: {
  approvals: any[];
  decideApproval: any;
}) {
  const [comment, setComment] = useState('');
  const [actingOn, setActingOn] = useState<number | null>(null);

  const handleDecide = (id: number, decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !comment.trim()) return;
    decideApproval.mutate({ id, decision, comment: comment.trim() || undefined });
    setComment('');
    setActingOn(null);
  };

  const pending = approvals.filter((a: any) => a.status === 'pending');
  const decided = approvals.filter((a: any) => a.status !== 'pending');

  return (
    <div className="space-y-6">
      {/* Pending */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-3">
          Awaiting Your Decision ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No pending approvals</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((a: any) => (
              <div key={a.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-800">{a.title}</p>
                    <p className="text-xs text-zinc-500 mt-1">{a.description}</p>
                    <p className="text-[10px] text-zinc-400 mt-2">
                      From {a.requestedBy} ({a.requestedByRole})
                      {a.dueDate && ` · Due ${new Date(a.dueDate).toLocaleDateString()}`}
                    </p>

                    {actingOn === a.id ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={comment}
                          onChange={e => setComment(e.target.value)}
                          placeholder="Add comments (required for rejection)..."
                          rows={2}
                          className="w-full text-xs px-3 py-2 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDecide(a.id, 'approved')}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => handleDecide(a.id, 'rejected')}
                            disabled={!comment.trim()}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                          <button
                            onClick={() => setActingOn(null)}
                            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setActingOn(a.id)}
                        className="mt-3 flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
                      >
                        <Shield className="w-3.5 h-3.5" /> Review & Decide
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Previously decided */}
      {decided.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-3">
            Previously Decided ({decided.length})
          </h3>
          <div className="space-y-2">
            {decided.map((a: any) => {
              const isApproved = a.status === 'approved';
              return (
                <div key={a.id} className="bg-white rounded-xl border p-3.5">
                  <div className="flex items-center gap-3">
                    {isApproved ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-800 truncate">{a.title}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {isApproved ? 'Approved' : 'Rejected'} by {a.decisionBy}
                        {a.decisionAt && ` · ${new Date(a.decisionAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tasks Section ────────────────────────────────────────────────────────────

function TasksSection({ programs, onNavigate }: { programs: any[]; onNavigate?: (mode: string) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">Your Active Work</h3>
      {programs.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <ListTodo className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No active tasks</p>
          <p className="text-xs text-zinc-400 mt-1">Tasks will appear as they are assigned to you</p>
        </div>
      ) : (
        <div className="space-y-2">
          {programs.map((p: any) => (
            <button
              key={p.id}
              onClick={() => onNavigate?.('command-center')}
              className="w-full text-left bg-white rounded-xl border p-4 hover:border-zinc-300 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-violet-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800">{p.name}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    {p.code} · Stage: {p.developmentStage || 'active'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Alerts Section ───────────────────────────────────────────────────────────

function AlertsSection() {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">Recent Alerts</h3>
      <div className="bg-white rounded-xl border p-8 text-center">
        <Bell className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
        <p className="text-sm text-zinc-500">No new alerts</p>
        <p className="text-xs text-zinc-400 mt-1">You'll be notified when actions are required</p>
      </div>
    </div>
  );
}

export default UserInbox;
