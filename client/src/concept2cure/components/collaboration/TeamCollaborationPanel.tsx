/**
 * @fileoverview Team Collaboration Panel
 * @module concept2cure/components/collaboration/TeamCollaborationPanel
 * @version 1.0.0
 *
 * @description
 * Real-time collaboration features for regulatory teams.
 * This component handles:
 * - Team presence indicators (who's online)
 * - Real-time activity feed
 * - Shared document editing sessions
 * - @ mentions and notifications
 * - Task assignments and handoffs
 *
 * Inspired by how regulatory teams actually collaborate:
 * - Cross-functional review cycles
 * - SME consultations
 * - Agency interaction prep
 * - Global team coordination across time zones
 *
 * @compliance
 * - Audit trail for all collaboration actions
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Users,
  MessageSquare,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  AtSign,
  Send,
  PenTool,
  Eye,
  Bell,
  ChevronRight,
  MoreHorizontal,
  Video,
  Calendar,
  Paperclip,
  UserPlus,
  ArrowRight,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  role: string;
  department: string;
  avatar?: string;
  
  // Status
  status: 'online' | 'away' | 'busy' | 'offline';
  statusMessage?: string;
  lastActive?: string;
  
  // Location for global teams
  timezone?: string;
  localTime?: string;
  
  // Current activity
  currentDocument?: string;
  currentProject?: string;
}

export type ActivityType = 
  | 'document_edit'
  | 'document_view'
  | 'comment_added'
  | 'comment_resolved'
  | 'task_assigned'
  | 'task_completed'
  | 'review_requested'
  | 'review_completed'
  | 'approval_granted'
  | 'document_uploaded'
  | 'mention';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  actor: TeamMember;
  timestamp: string;
  
  // Context
  documentId?: string;
  documentName?: string;
  projectId?: string;
  projectName?: string;
  
  // Details
  message?: string;
  mentionedUsers?: string[];
  
  // For tasks
  taskId?: string;
  taskTitle?: string;
  assignee?: TeamMember;
}

export interface ActiveSession {
  documentId: string;
  documentName: string;
  documentType: string;
  participants: TeamMember[];
  startedAt: string;
  lastActivity: string;
}

interface TeamCollaborationPanelProps {
  teamMembers: TeamMember[];
  activities: ActivityItem[];
  activeSessions: ActiveSession[];
  currentUserId: string;
  onMemberClick?: (member: TeamMember) => void;
  onActivityClick?: (activity: ActivityItem) => void;
  onJoinSession?: (session: ActiveSession) => void;
  onStartCall?: (members: TeamMember[]) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS_CONFIG: Record<TeamMember['status'], {
  color: string;
  bgColor: string;
  label: string;
}> = {
  online: { color: 'bg-green-500', bgColor: 'bg-green-100', label: 'Online' },
  away: { color: 'bg-amber-500', bgColor: 'bg-amber-100', label: 'Away' },
  busy: { color: 'bg-red-500', bgColor: 'bg-red-100', label: 'Busy' },
  offline: { color: 'bg-stone-400', bgColor: 'bg-stone-100', label: 'Offline' },
};

const ACTIVITY_CONFIG: Record<ActivityType, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
}> = {
  document_edit: { icon: PenTool, color: 'text-blue-600', label: 'edited' },
  document_view: { icon: Eye, color: 'text-stone-500', label: 'viewed' },
  comment_added: { icon: MessageSquare, color: 'text-violet-600', label: 'commented on' },
  comment_resolved: { icon: CheckCircle, color: 'text-green-600', label: 'resolved comment on' },
  task_assigned: { icon: UserPlus, color: 'text-amber-600', label: 'assigned task' },
  task_completed: { icon: CheckCircle, color: 'text-green-600', label: 'completed' },
  review_requested: { icon: Eye, color: 'text-cyan-600', label: 'requested review on' },
  review_completed: { icon: CheckCircle, color: 'text-green-600', label: 'completed review of' },
  approval_granted: { icon: CheckCircle, color: 'text-emerald-600', label: 'approved' },
  document_uploaded: { icon: FileText, color: 'text-blue-600', label: 'uploaded' },
  mention: { icon: AtSign, color: 'text-pink-600', label: 'mentioned you in' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const formatTimeAgo = (timestamp: string): string => {
  const now = new Date();
  const then = new Date(timestamp);
  const diff = now.getTime() - then.getTime();
  
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM MEMBER AVATAR
// ═══════════════════════════════════════════════════════════════════════════════

const MemberAvatar: React.FC<{
  member: TeamMember;
  size?: 'sm' | 'md' | 'lg';
  showStatus?: boolean;
  onClick?: () => void;
}> = ({ member, size = 'md', showStatus = true, onClick }) => {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };
  
  const statusConfig = STATUS_CONFIG[member.status];
  
  return (
    <button
      onClick={onClick}
      className="relative group"
      title={`${member.name} (${statusConfig.label})`}
    >
      {member.avatar ? (
        <img
          src={member.avatar}
          alt={member.name}
          className={cn(
            'rounded-full object-cover ring-2 ring-white',
            sizeClasses[size]
          )}
        />
      ) : (
        <div className={cn(
          'rounded-full flex items-center justify-center font-medium bg-blue-600 text-white ring-2 ring-white',
          sizeClasses[size]
        )}>
          {member.initials}
        </div>
      )}
      
      {showStatus && (
        <span className={cn(
          'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white',
          statusConfig.color
        )} />
      )}
    </button>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM PRESENCE SECTION
// ═══════════════════════════════════════════════════════════════════════════════

const TeamPresenceSection: React.FC<{
  members: TeamMember[];
  onMemberClick?: (member: TeamMember) => void;
  onStartCall?: (members: TeamMember[]) => void;
}> = ({ members, onMemberClick, onStartCall }) => {
  const onlineMembers = members.filter(m => m.status !== 'offline');
  const offlineMembers = members.filter(m => m.status === 'offline');
  
  // Group by department
  const byDepartment = useMemo(() => {
    const groups: Record<string, TeamMember[]> = {};
    onlineMembers.forEach(m => {
      if (!groups[m.department]) groups[m.department] = [];
      groups[m.department].push(m);
    });
    return groups;
  }, [onlineMembers]);
  
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-stone-900">Team</h3>
        <span className="text-xs text-green-600 font-medium">
          {onlineMembers.length} online
        </span>
      </div>
      
      {/* Online members by department */}
      <div className="space-y-4">
        {Object.entries(byDepartment).map(([dept, deptMembers]) => (
          <div key={dept}>
            <p className="text-xs font-medium text-stone-500 mb-2">{dept}</p>
            <div className="space-y-2">
              {deptMembers.map(member => (
                <button
                  key={member.id}
                  onClick={() => onMemberClick?.(member)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-stone-100 transition-colors text-left"
                >
                  <MemberAvatar member={member} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{member.name}</p>
                    <p className="text-xs text-stone-500 truncate">{member.role}</p>
                  </div>
                  {member.currentDocument && (
                    <span className="text-xs text-blue-600 truncate max-w-24">
                      {member.currentDocument}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Offline members collapsed */}
      {offlineMembers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-stone-200">
          <p className="text-xs text-stone-400 mb-2">{offlineMembers.length} offline</p>
          <div className="flex -space-x-1">
            {offlineMembers.slice(0, 8).map(member => (
              <MemberAvatar key={member.id} member={member} size="sm" showStatus={false} />
            ))}
            {offlineMembers.length > 8 && (
              <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center text-xs text-stone-500 ring-2 ring-white">
                +{offlineMembers.length - 8}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Quick actions */}
      <div className="mt-4 pt-4 border-t border-stone-200 flex gap-2">
        <button
          onClick={() => onStartCall?.(onlineMembers)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors duration-150"
        >
          <Video className="w-4 h-4" />
          Start Call
        </button>
        <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors duration-150">
          <Calendar className="w-4 h-4" />
          Schedule
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY FEED
// ═══════════════════════════════════════════════════════════════════════════════

const ActivityFeed: React.FC<{
  activities: ActivityItem[];
  currentUserId: string;
  onActivityClick?: (activity: ActivityItem) => void;
}> = ({ activities, currentUserId, onActivityClick }) => {
  // Separate mentions for current user
  const myMentions = activities.filter(
    a => a.type === 'mention' || a.mentionedUsers?.includes(currentUserId)
  );
  
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-4">Activity</h3>
      
      {/* My mentions */}
      {myMentions.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-pink-600 mb-2 flex items-center gap-1">
            <AtSign className="w-3 h-3" />
            Mentions
          </p>
          <div className="space-y-2">
            {myMentions.slice(0, 3).map(activity => {
              const config = ACTIVITY_CONFIG[activity.type];
              const Icon = config.icon;
              
              return (
                <button
                  key={activity.id}
                  onClick={() => onActivityClick?.(activity)}
                  className="w-full flex items-start gap-2 p-2 bg-pink-50 rounded-lg hover:bg-pink-100 transition-colors text-left"
                >
                  <MemberAvatar member={activity.actor} size="sm" showStatus={false} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-stone-900">
                      <span className="font-medium">{activity.actor.name}</span>
                      {' '}{config.label}{' '}
                      <span className="text-pink-600">{activity.documentName || activity.taskTitle}</span>
                    </p>
                    {activity.message && (
                      <p className="text-xs text-stone-500 truncate mt-0.5">{activity.message}</p>
                    )}
                    <p className="text-xs text-stone-400 mt-1">{formatTimeAgo(activity.timestamp)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {/* All activity */}
      <div className="space-y-2">
        {activities.slice(0, 10).map(activity => {
          const config = ACTIVITY_CONFIG[activity.type];
          const Icon = config.icon;
          
          return (
            <button
              key={activity.id}
              onClick={() => onActivityClick?.(activity)}
              className="w-full flex items-start gap-2 p-2 hover:bg-stone-50 rounded-lg transition-colors text-left"
            >
              <MemberAvatar member={activity.actor} size="sm" showStatus={false} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-stone-700">
                  <span className="font-medium text-stone-900">{activity.actor.name}</span>
                  {' '}{config.label}{' '}
                  <span className="text-blue-600">{activity.documentName || activity.taskTitle}</span>
                </p>
                <p className="text-xs text-stone-400">{formatTimeAgo(activity.timestamp)}</p>
              </div>
              <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', config.color)} />
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVE SESSIONS
// ═══════════════════════════════════════════════════════════════════════════════

const ActiveSessionsSection: React.FC<{
  sessions: ActiveSession[];
  onJoinSession?: (session: ActiveSession) => void;
}> = ({ sessions, onJoinSession }) => {
  if (sessions.length === 0) return null;
  
  return (
    <div className="p-4 border-t border-stone-200">
      <h3 className="text-sm font-semibold text-stone-900 mb-3">Active Editing Sessions</h3>
      
      <div className="space-y-2">
        {sessions.map(session => (
          <div
            key={session.documentId}
            className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-emerald-800">{session.documentName}</p>
                <p className="text-xs text-emerald-600">{session.documentType}</p>
              </div>
              <button
                onClick={() => onJoinSession?.(session)}
                className="px-2 py-1 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 transition-colors duration-150"
              >
                Join
              </button>
            </div>
            
            <div className="flex items-center gap-1">
              <div className="flex -space-x-1">
                {session.participants.slice(0, 4).map(p => (
                  <MemberAvatar key={p.id} member={p} size="sm" showStatus={false} />
                ))}
              </div>
              {session.participants.length > 4 && (
                <span className="text-xs text-emerald-600">+{session.participants.length - 4}</span>
              )}
              <span className="ml-auto text-xs text-emerald-600">
                {formatTimeAgo(session.startedAt)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const TeamCollaborationPanel: React.FC<TeamCollaborationPanelProps> = ({
  teamMembers,
  activities,
  activeSessions,
  currentUserId,
  onMemberClick,
  onActivityClick,
  onJoinSession,
  onStartCall,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<'team' | 'activity'>('activity');
  
  // Unread mentions count
  const unreadMentions = activities.filter(
    a => (a.type === 'mention' || a.mentionedUsers?.includes(currentUserId))
  ).length;
  
  return (
    <div className={cn('flex flex-col h-full bg-white border-l border-stone-200', className)}>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-stone-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab('activity')}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-150',
              activeTab === 'activity'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            )}
          >
            Activity
            {unreadMentions > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs font-medium text-white bg-pink-500 rounded-full">
                {unreadMentions}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-150',
              activeTab === 'team'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            )}
          >
            Team
            <span className="ml-1.5 text-xs text-green-600">
              {teamMembers.filter(m => m.status !== 'offline').length}
            </span>
          </button>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'activity' ? (
          <ActivityFeed
            activities={activities}
            currentUserId={currentUserId}
            onActivityClick={onActivityClick}
          />
        ) : (
          <TeamPresenceSection
            members={teamMembers}
            onMemberClick={onMemberClick}
            onStartCall={onStartCall}
          />
        )}
        
        {/* Active sessions always visible */}
        <ActiveSessionsSection
          sessions={activeSessions}
          onJoinSession={onJoinSession}
        />
      </div>
      
      {/* Quick message input */}
      <div className="flex-shrink-0 p-4 border-t border-stone-200">
        <div className="relative">
          <input
            type="text"
            placeholder="Message team..."
            className="w-full pl-4 pr-20 py-2 text-sm border border-stone-200 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button className="p-1.5 text-stone-400 hover:text-stone-600 transition-colors duration-150">
              <Paperclip className="w-4 h-4" />
            </button>
            <button className="p-1.5 text-blue-600 hover:text-blue-700 transition-colors duration-150">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamCollaborationPanel;
