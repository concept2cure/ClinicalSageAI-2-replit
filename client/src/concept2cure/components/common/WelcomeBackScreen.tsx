/**
 * @fileoverview Welcome Back Screen
 * @module concept2cure/components/WelcomeBackScreen
 * @version 1.0.0
 *
 * @description
 * Claude.ai-style post-login experience. Shows user their last workspace
 * with option to continue or start fresh.
 *
 * @compliance
 * - FDA 21 CFR Part 11: Login/session events logged
 * - WCAG 2.1 AA: Fully accessible with keyboard navigation
 */

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  Plus,
  Clock,
  Users,
  FileText,
  AlertCircle,
  CheckCircle,
  Folder,
  Sparkles,
  ClipboardList,
  Bell,
  Calendar,
} from 'lucide-react';
import { useSessionRestore } from '../../hooks/useSessionRestore';
import { useProjects } from '../../hooks/useProjects';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  submissionType: string;
}

interface PendingItem {
  id: string;
  type: 'task' | 'review' | 'milestone' | 'notification';
  title: string;
  description?: string;
  dueDate?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

interface WelcomeBackScreenProps {
  userId: string;
  userName: string;
  organizationId: string;
  onContinue: (projectId: string, conversationId?: string) => void;
  onNewProject: (type: string) => void;
  onViewDashboard: () => void;
  onDismiss: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUICK ACTIONS CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: '510k',
    label: '510(k)',
    description: 'Medical Device',
    icon: FileText,
    color: 'blue',
    submissionType: '510K',
  },
  {
    id: 'ind',
    label: 'IND',
    description: 'Investigational Drug',
    icon: FileText,
    color: 'purple',
    submissionType: 'IND',
  },
  {
    id: 'nda',
    label: 'NDA',
    description: 'New Drug Application',
    icon: FileText,
    color: 'emerald',
    submissionType: 'NDA',
  },
  {
    id: 'cer',
    label: 'CER',
    description: 'Clinical Evaluation',
    icon: ClipboardList,
    color: 'amber',
    submissionType: 'CER',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const getTimeAgo = (date: string): string => {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return then.toLocaleDateString();
};

const getColorClasses = (color: string) => ({
  bg: `bg-${color}-50`,
  border: `border-${color}-200`,
  text: `text-${color}-700`,
  icon: `text-${color}-500`,
  hover: `hover:bg-${color}-100 hover:border-${color}-300`,
});

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const WelcomeBackScreen: React.FC<WelcomeBackScreenProps> = ({
  userId,
  userName,
  organizationId,
  onContinue,
  onNewProject,
  onViewDashboard,
  onDismiss,
}) => {
  const { getLastProject, getLastConversation } = useSessionRestore(userId, organizationId);
  const { projects } = useProjects();

  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const lastProject = getLastProject();
  const lastConversation = getLastConversation();

  // Load pending items from API
  useEffect(() => {
    const loadPendingItems = async () => {
      setIsLoading(true);
      try {
        const token =
          sessionStorage.getItem('trialsage_access_token') ||
          localStorage.getItem('trialsage_access_token');
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('/api/concept2cure/tasks/pending', { headers });
        if (res.ok) {
          const json = await res.json();
          const items = Array.isArray(json.data) ? json.data : [];
          setPendingItems(items.slice(0, 5).map((t: any) => ({
            id: String(t.id),
            type: t.type || 'task',
            title: t.title || t.name || 'Untitled',
            description: t.description || t.projectName || undefined,
            dueDate: t.dueDate || t.deadline || undefined,
            priority: t.priority || undefined,
          })));
        } else {
          setPendingItems([]);
        }
      } catch {
        setPendingItems([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadPendingItems();
  }, [userId]);

  // Greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Get first name
  const firstName = userName.split(' ')[0];

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-stone-800 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-stone-900">Concept2Cure</h1>
              <p className="text-xs text-stone-500">Regulatory Intelligence Platform</p>
            </div>
          </div>

          <button
            onClick={onDismiss}
            className="text-sm text-stone-500 hover:text-stone-700 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors duration-150"
          >
            Skip to Dashboard
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-12">
          {/* Greeting */}
          <div className="mb-10">
            <h2 className="text-base font-semibold text-stone-900 mb-2">
              {getGreeting()}, {firstName}!
            </h2>
            <p className="text-stone-500 text-lg">
              {lastProject
                ? 'Ready to continue where you left off?'
                : 'What would you like to work on today?'}
            </p>
          </div>

          {/* Continue Section */}
          {lastProject && (
            <section className="mb-12">
              <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">
                Continue where you left off
              </h3>

              <button
                onClick={() => onContinue(lastProject.id, lastConversation?.id)}
                className={cn(
                  'w-full text-left p-5 rounded-xl border border-stone-200 bg-white shadow-sm',
                  'hover:border-stone-200 hover:shadow-sm',
                  'focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none',
                  'transition-all duration-150 group'
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Project Icon */}
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                      lastProject.type === '510K' && 'bg-blue-100',
                      lastProject.type === 'IND' && 'bg-stone-200',
                      lastProject.type === 'NDA' && 'bg-emerald-100'
                    )}
                  >
                    <Folder
                      className={cn(
                        'w-5 h-5',
                        lastProject.type === '510K' && 'text-blue-600',
                        lastProject.type === 'IND' && 'text-stone-600',
                        lastProject.type === 'NDA' && 'text-emerald-600'
                      )}
                    />
                  </div>

                  {/* Project Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          lastProject.type === '510K' && 'bg-blue-100 text-stone-700',
                          lastProject.type === 'IND' && 'bg-stone-200 text-stone-700',
                          lastProject.type === 'NDA' && 'bg-emerald-100 text-emerald-700'
                        )}
                      >
                        {lastProject.type}
                      </span>
                    </div>
                    <h4 className="text-lg font-semibold text-stone-900 mb-1 truncate">
                      {lastProject.name}
                    </h4>
                    <p className="text-sm text-stone-500 flex items-center gap-4">
                      {lastProject.updatedAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {getTimeAgo(typeof lastProject.updatedAt === 'string' ? lastProject.updatedAt : lastProject.updatedAt.toISOString())}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Action */}
                  <div className="flex items-center gap-2 text-blue-600 group-hover:gap-3 transition-all duration-150">
                    <span className="text-sm font-medium">Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </button>
            </section>
          )}

          {/* Quick Actions */}
          <section className="mb-12">
            <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">
              Start a new project
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {QUICK_ACTIONS.map(action => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={() => onNewProject(action.submissionType)}
                    className={cn(
                      'p-5 rounded-xl border text-left transition-all duration-150',
                      'hover:shadow-sm shadow-sm',
                      'focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none',
                      action.color === 'blue' &&
                        'border-blue-200 bg-blue-50/50 hover:border-blue-300',
                      action.color === 'purple' &&
                        'border-stone-200 bg-stone-100/50 hover:border-stone-300',
                      action.color === 'emerald' &&
                        'border-emerald-200 bg-emerald-50/50 hover:border-emerald-300',
                      action.color === 'amber' &&
                        'border-amber-200 bg-amber-50/50 hover:border-amber-300'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-5 h-5 mb-3',
                        action.color === 'blue' && 'text-blue-600',
                        action.color === 'purple' && 'text-stone-600',
                        action.color === 'emerald' && 'text-emerald-600',
                        action.color === 'amber' && 'text-amber-600'
                      )}
                    />
                    <h4 className="font-semibold text-stone-900 mb-0.5">{action.label}</h4>
                    <p className="text-xs text-stone-500">{action.description}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Pending Items */}
          {pendingItems.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">
                Needs your attention
              </h3>

              <div className="space-y-3">
                {pendingItems.map(item => (
                  <div
                    key={item.id}
                    className={cn(
                      'p-4 rounded-xl border bg-white',
                      'flex items-center gap-4',
                      item.priority === 'high' && 'border-amber-200',
                      item.priority === 'critical' && 'border-red-200',
                      !item.priority && 'border-stone-200'
                    )}
                  >
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                        item.type === 'task' && 'bg-blue-100',
                        item.type === 'review' && 'bg-amber-100',
                        item.type === 'milestone' && 'bg-emerald-100',
                        item.type === 'notification' && 'bg-stone-200'
                      )}
                    >
                      {item.type === 'task' && <CheckCircle className="w-5 h-5 text-blue-600" />}
                      {item.type === 'review' && <AlertCircle className="w-5 h-5 text-amber-600" />}
                      {item.type === 'milestone' && (
                        <Calendar className="w-5 h-5 text-emerald-600" />
                      )}
                      {item.type === 'notification' && <Bell className="w-5 h-5 text-stone-600" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-stone-900 truncate">{item.title}</h4>
                      {item.description && (
                        <p className="text-sm text-stone-500">{item.description}</p>
                      )}
                    </div>

                    {item.dueDate && (
                      <span className="text-xs text-stone-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getTimeAgo(item.dueDate)}
                      </span>
                    )}

                    {item.priority === 'high' && (
                      <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        High Priority
                      </span>
                    )}
                    {item.priority === 'critical' && (
                      <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                        Critical
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-stone-200 bg-stone-50/50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-stone-500">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>

          <button
            onClick={onViewDashboard}
            className="text-sm text-stone-600 hover:text-stone-900 px-4 py-2 rounded-lg hover:bg-stone-100 transition-colors duration-150"
          >
            View Full Dashboard
          </button>
        </div>
      </footer>
    </div>
  );
};

export default WelcomeBackScreen;
