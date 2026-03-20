/**
 * @fileoverview Team Workspace — Team & workspace management for Mission Control
 * @module concept2cure/pages/MissionControl/TeamWorkspace
 *
 * Member directory, role/permission matrix, activity feed, workload distribution.
 * Invite modal for onboarding new team members.
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  Users,
  UserPlus,
  Mail,
  MessageSquare,
  ArrowRightLeft,
  Trash2,
  Shield,
  Check,
  X,
  Clock,
  Activity,
  BarChart3,
  Search,
  ChevronRight,
  AlertTriangle,
  FileText,
  Eye,
  CheckCircle2,
  Upload,
  PenLine,
  Settings,
  Plus,
  Send,
  Lightbulb,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeamWorkspaceProps {
  programId: number | null;
}

type TabKey = 'members' | 'roles' | 'activity' | 'workload';

type MemberRole = 'Program Lead' | 'Author' | 'Reviewer' | 'Approver' | 'Contributor' | 'QA';
type MemberStatus = 'online' | 'away' | 'offline';

interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: MemberRole;
  department: string;
  status: MemberStatus;
  lastActive: string;
  assignedArtifacts: number;
  openReviews: number;
  avatar?: string;
}

interface ActivityEntry {
  id: number;
  userId: number;
  userName: string;
  action: string;
  target?: string;
  timestamp: string;
}

interface WorkloadEntry {
  memberId: number;
  memberName: string;
  assigned: number;
  inReview: number;
  overdue: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'members', label: 'Members', icon: Users },
  { key: 'roles', label: 'Roles & Permissions', icon: Shield },
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'workload', label: 'Workload', icon: BarChart3 },
];

const ROLE_COLORS: Record<MemberRole, { bg: string; text: string; dot: string }> = {
  'Program Lead': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  Author: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  Reviewer: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  Approver: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  Contributor: { bg: 'bg-zinc-100', text: 'text-zinc-700', dot: 'bg-zinc-500' },
  QA: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

const STATUS_CONFIG: Record<MemberStatus, { label: string; color: string }> = {
  online: { label: 'Online', color: 'bg-emerald-500' },
  away: { label: 'Away', color: 'bg-amber-400' },
  offline: { label: 'Offline', color: 'bg-zinc-300' },
};

const PERMISSIONS = [
  'Create Artifacts',
  'Edit',
  'Review',
  'Approve',
  'Delete',
  'Export',
  'Manage Team',
  'Configure Rules',
] as const;

type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<MemberRole, Record<Permission, boolean>> = {
  'Program Lead': {
    'Create Artifacts': true,
    Edit: true,
    Review: true,
    Approve: true,
    Delete: true,
    Export: true,
    'Manage Team': true,
    'Configure Rules': true,
  },
  Author: {
    'Create Artifacts': true,
    Edit: true,
    Review: false,
    Approve: false,
    Delete: false,
    Export: true,
    'Manage Team': false,
    'Configure Rules': false,
  },
  Reviewer: {
    'Create Artifacts': false,
    Edit: false,
    Review: true,
    Approve: false,
    Delete: false,
    Export: true,
    'Manage Team': false,
    'Configure Rules': false,
  },
  Approver: {
    'Create Artifacts': false,
    Edit: false,
    Review: true,
    Approve: true,
    Delete: false,
    Export: true,
    'Manage Team': false,
    'Configure Rules': false,
  },
  Contributor: {
    'Create Artifacts': true,
    Edit: true,
    Review: false,
    Approve: false,
    Delete: false,
    Export: false,
    'Manage Team': false,
    'Configure Rules': false,
  },
  QA: {
    'Create Artifacts': false,
    Edit: false,
    Review: true,
    Approve: false,
    Delete: false,
    Export: true,
    'Manage Team': false,
    'Configure Rules': true,
  },
};

const MOCK_MEMBERS: TeamMember[] = [
  {
    id: 1,
    name: 'Alice Chen',
    email: 'alice.chen@pharmadev.com',
    role: 'Program Lead',
    department: 'Regulatory Affairs',
    status: 'online',
    lastActive: '2 min ago',
    assignedArtifacts: 14,
    openReviews: 3,
  },
  {
    id: 2,
    name: 'Bob Martinez',
    email: 'bob.martinez@pharmadev.com',
    role: 'Author',
    department: 'Medical Writing',
    status: 'online',
    lastActive: '5 min ago',
    assignedArtifacts: 8,
    openReviews: 0,
  },
  {
    id: 3,
    name: 'Carol Nguyen',
    email: 'carol.nguyen@pharmadev.com',
    role: 'Reviewer',
    department: 'Clinical Operations',
    status: 'away',
    lastActive: '1 hr ago',
    assignedArtifacts: 5,
    openReviews: 7,
  },
  {
    id: 4,
    name: 'David Park',
    email: 'david.park@pharmadev.com',
    role: 'Approver',
    department: 'Quality Assurance',
    status: 'online',
    lastActive: '10 min ago',
    assignedArtifacts: 3,
    openReviews: 5,
  },
  {
    id: 5,
    name: 'Eva Rossi',
    email: 'eva.rossi@pharmadev.com',
    role: 'Author',
    department: 'Medical Writing',
    status: 'offline',
    lastActive: '3 hrs ago',
    assignedArtifacts: 11,
    openReviews: 1,
  },
  {
    id: 6,
    name: 'Frank Dubois',
    email: 'frank.dubois@pharmadev.com',
    role: 'Contributor',
    department: 'Biostatistics',
    status: 'away',
    lastActive: '45 min ago',
    assignedArtifacts: 6,
    openReviews: 0,
  },
  {
    id: 7,
    name: 'Grace Kim',
    email: 'grace.kim@pharmadev.com',
    role: 'QA',
    department: 'Quality Assurance',
    status: 'online',
    lastActive: '1 min ago',
    assignedArtifacts: 4,
    openReviews: 9,
  },
  {
    id: 8,
    name: 'Henry Okafor',
    email: 'henry.okafor@pharmadev.com',
    role: 'Reviewer',
    department: 'Regulatory Affairs',
    status: 'offline',
    lastActive: '1 day ago',
    assignedArtifacts: 2,
    openReviews: 4,
  },
];

const MOCK_ACTIVITY: ActivityEntry[] = [
  { id: 1, userId: 2, userName: 'Bob Martinez', action: 'joined the program', target: 'IND-2024-001', timestamp: '10 min ago' },
  { id: 2, userId: 3, userName: 'Carol Nguyen', action: 'completed review of', target: 'Module 2.5 Clinical Overview', timestamp: '25 min ago' },
  { id: 3, userId: 4, userName: 'David Park', action: 'approved artifact', target: 'Module 2.7 Clinical Summary', timestamp: '1 hr ago' },
  { id: 4, userId: 5, userName: 'Eva Rossi', action: 'uploaded evidence for', target: 'Nonclinical Study Report', timestamp: '2 hrs ago' },
  { id: 5, userId: 1, userName: 'Alice Chen', action: 'posted a comment on', target: 'Risk Assessment Matrix', timestamp: '2 hrs ago' },
  { id: 6, userId: 7, userName: 'Grace Kim', action: 'flagged QA issue in', target: 'Module 3.2.P Drug Product', timestamp: '3 hrs ago' },
  { id: 7, userId: 6, userName: 'Frank Dubois', action: 'uploaded evidence for', target: 'Biostatistics Analysis Plan', timestamp: '4 hrs ago' },
  { id: 8, userId: 8, userName: 'Henry Okafor', action: 'completed review of', target: 'Module 1.2 Cover Letter', timestamp: '5 hrs ago' },
  { id: 9, userId: 1, userName: 'Alice Chen', action: 'updated workload assignments for', target: '3 team members', timestamp: '6 hrs ago' },
  { id: 10, userId: 3, userName: 'Carol Nguyen', action: 'posted a comment on', target: 'Module 2.4 Nonclinical Overview', timestamp: '8 hrs ago' },
];

// Workload data fetched via useQuery in the component

const WORKLOAD_RECOMMENDATIONS = [
  { from: 'Alice Chen', to: 'Bob Martinez', count: 3, reason: 'Alice has 2 overdue tasks and 14 assigned; Bob has capacity with only 8 assigned and 0 overdue.' },
  { from: 'Eva Rossi', to: 'Frank Dubois', count: 2, reason: 'Eva has 3 overdue items; Frank has bandwidth with only 6 assigned artifacts.' },
  { from: 'Grace Kim', to: 'Henry Okafor', count: 3, reason: 'Grace has 9 items in review queue; Henry can absorb more review work.' },
];

const ALL_ROLES: MemberRole[] = ['Program Lead', 'Author', 'Reviewer', 'Approver', 'Contributor', 'QA'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getWorkloadScore(entry: WorkloadEntry): { score: number; label: string; color: string } {
  const total = entry.assigned + entry.inReview;
  const overdueWeight = entry.overdue * 3;
  const score = total + overdueWeight;
  if (score <= 8) return { score, label: 'Light', color: 'text-emerald-600' };
  if (score <= 16) return { score, label: 'Moderate', color: 'text-amber-600' };
  return { score, label: 'Heavy', color: 'text-red-600' };
}

function getBarWidth(value: number, max: number): string {
  if (max === 0) return '0%';
  return `${Math.round((value / max) * 100)}%`;
}

// ─── Activity Icon Resolver ──────────────────────────────────────────────────

function getActivityIcon(action: string): React.ElementType {
  if (action.includes('joined')) return UserPlus;
  if (action.includes('review')) return Eye;
  if (action.includes('approved')) return CheckCircle2;
  if (action.includes('uploaded')) return Upload;
  if (action.includes('comment')) return MessageSquare;
  if (action.includes('flagged')) return AlertTriangle;
  if (action.includes('updated')) return Settings;
  return Activity;
}

function getActivityColor(action: string): string {
  if (action.includes('joined')) return 'text-blue-600 bg-blue-50';
  if (action.includes('approved')) return 'text-emerald-600 bg-emerald-50';
  if (action.includes('review')) return 'text-violet-600 bg-violet-50';
  if (action.includes('uploaded')) return 'text-cyan-600 bg-cyan-50';
  if (action.includes('comment')) return 'text-zinc-600 bg-zinc-100';
  if (action.includes('flagged')) return 'text-red-600 bg-red-50';
  if (action.includes('updated')) return 'text-amber-600 bg-amber-50';
  return 'text-zinc-500 bg-zinc-50';
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MemberCard({
  member,
  onMessage,
  onReassign,
  onRemove,
}: {
  member: TeamMember;
  onMessage: (m: TeamMember) => void;
  onReassign: (m: TeamMember) => void;
  onRemove: (m: TeamMember) => void;
}) {
  const roleStyle = ROLE_COLORS[member.role];
  const statusStyle = STATUS_CONFIG[member.status];

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={cn('relative flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold', roleStyle.bg, roleStyle.text)}>
          {getInitials(member.name)}
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white',
              statusStyle.color,
            )}
            title={statusStyle.label}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-900 text-sm truncate">{member.name}</span>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', roleStyle.bg, roleStyle.text)}>
              {member.role}
            </span>
          </div>
          <p className="text-xs text-zinc-500 truncate mt-0.5">{member.email}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{member.department}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-zinc-200">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Clock className="w-3.5 h-3.5" />
          <span>{member.lastActive}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <FileText className="w-3.5 h-3.5" />
          <span>{member.assignedArtifacts} artifacts</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Eye className="w-3.5 h-3.5" />
          <span>{member.openReviews} reviews</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => onMessage(member)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-600 bg-zinc-50 hover:bg-zinc-100 rounded-lg transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Message
        </button>
        <button
          onClick={() => onReassign(member)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Reassign
        </button>
        <button
          onClick={() => onRemove(member)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors ml-auto"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove
        </button>
      </div>
    </div>
  );
}

// ─── Invite Modal ────────────────────────────────────────────────────────────

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('Contributor');
  const [department, setDepartment] = useState('');
  const [message, setMessage] = useState('');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900">Invite Team Member</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@pharmadev.com"
                className="w-full pl-10 pr-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Department</label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Regulatory Affairs"
              className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </div>

          {/* Welcome message */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              Welcome Message <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a personal note to the invitation..."
              rows={3}
              className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-zinc-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            disabled={!email.trim()}
            className={cn(
              'flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-xl transition-colors',
              email.trim()
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-zinc-100 text-zinc-400 cursor-not-allowed',
            )}
          >
            <Send className="w-4 h-4" />
            Send Invite
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TeamWorkspace({ programId }: TeamWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('members');
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [members] = useState<TeamMember[]>(MOCK_MEMBERS);

  // ── Filtered members ────────────────────────────────────────────────────
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        m.department.toLowerCase().includes(q),
    );
  }, [members, searchQuery]);

  // ── Workload data from API ─────────────────────────────────────────────
  const { data: workloadData = [], isLoading: workloadLoading } = useQuery<WorkloadEntry[]>({
    queryKey: ['concept2cure', 'team', 'workload'],
    queryFn: async () => {
      const res = await fetch('/api/concept2cure/team/workload');
      if (!res.ok) throw new Error('Failed to fetch workload data');
      return res.json();
    },
  });

  // ── Workload max for bar scaling ────────────────────────────────────────
  const workloadMax = useMemo(() => {
    return Math.max(...workloadData.map((w) => w.assigned + w.inReview + w.overdue), 1);
  }, [workloadData]);

  // ── No program selected ────────────────────────────────────────────────
  if (!programId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-zinc-400" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-900 mb-1">No Program Selected</h3>
        <p className="text-sm text-zinc-500 max-w-sm">
          Select a program from the sidebar to view and manage your team workspace.
        </p>
      </div>
    );
  }

  // ── Action handlers (stubs) ─────────────────────────────────────────────
  const handleMessage = (m: TeamMember) => {
    // In a full implementation this would open a chat/DM thread
    console.log('Message:', m.name);
  };

  const handleReassign = (m: TeamMember) => {
    console.log('Reassign:', m.name);
  };

  const handleRemove = (m: TeamMember) => {
    console.log('Remove:', m.name);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-zinc-900">Team Workspace</h2>
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                {members.length} members
              </span>
            </div>
            <p className="text-sm text-zinc-500 mt-0.5">Manage team members, roles, and workload distribution</p>
          </div>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Invite Member
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                isActive
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700',
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════ Members Tab ══════════════════════════════════ */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search members by name, email, role, or department..."
              className="w-full pl-10 pr-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </div>

          {/* Member Grid */}
          {filteredMembers.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 text-sm">No members match your search.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredMembers.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  onMessage={handleMessage}
                  onReassign={handleReassign}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════ Roles & Permissions Tab ══════════════════════════ */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">Permission matrix for each role in the workspace.</p>
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors">
              <Plus className="w-4 h-4" />
              Add Role
            </button>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/50">
                    <th className="text-left py-3 px-4 font-semibold text-zinc-700 sticky left-0 bg-zinc-50/50 min-w-[140px]">
                      Role
                    </th>
                    {PERMISSIONS.map((perm) => (
                      <th key={perm} className="text-center py-3 px-3 font-medium text-zinc-600 whitespace-nowrap">
                        {perm}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_ROLES.map((role, idx) => {
                    const roleStyle = ROLE_COLORS[role];
                    return (
                      <tr
                        key={role}
                        className={cn(
                          'border-b border-zinc-200 hover:bg-zinc-50/50 transition-colors',
                          idx === ALL_ROLES.length - 1 && 'border-b-0',
                        )}
                      >
                        <td className="py-3 px-4 sticky left-0 bg-white">
                          <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', roleStyle.bg, roleStyle.text)}>
                            {role}
                          </span>
                        </td>
                        {PERMISSIONS.map((perm) => {
                          const allowed = ROLE_PERMISSIONS[role][perm];
                          return (
                            <td key={perm} className="text-center py-3 px-3">
                              {allowed ? (
                                <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-50">
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                </div>
                              ) : (
                                <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-50">
                                  <X className="w-3.5 h-3.5 text-zinc-400" />
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════ Activity Tab ═════════════════════════════════ */}
      {activeTab === 'activity' && (
        <div className="space-y-1">
          <p className="text-sm text-zinc-500 mb-4">Recent team activity across the program.</p>
          <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100">
            {MOCK_ACTIVITY.map((entry) => {
              const Icon = getActivityIcon(entry.action);
              const colorClasses = getActivityColor(entry.action);
              const member = members.find((m) => m.id === entry.userId);
              const roleStyle = member ? ROLE_COLORS[member.role] : ROLE_COLORS['Contributor'];

              return (
                <div key={entry.id} className="flex items-start gap-3 px-5 py-4 hover:bg-zinc-50/50 transition-colors">
                  {/* Timeline icon */}
                  <div className={cn('flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5', colorClasses)}>
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-700">
                      <span className="font-semibold text-zinc-900">{entry.userName}</span>{' '}
                      {entry.action}{' '}
                      {entry.target && <span className="font-medium text-blue-600">{entry.target}</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-zinc-400" />
                      <span className="text-xs text-zinc-400">{entry.timestamp}</span>
                      {member && (
                        <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', roleStyle.bg, roleStyle.text)}>
                          {member.role}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* User avatar */}
                  <div className={cn('flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold', roleStyle.bg, roleStyle.text)}>
                    {getInitials(entry.userName)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════ Workload Tab ═════════════════════════════════ */}
      {activeTab === 'workload' && (
        <div className="space-y-6">
          <p className="text-sm text-zinc-500">Workload distribution across team members.</p>

          {/* Workload bars */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
            {/* Legend */}
            <div className="flex items-center gap-5 text-xs text-zinc-500 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-500" />
                Assigned Tasks
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-violet-500" />
                In Review
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-red-500" />
                Overdue
              </div>
            </div>

            {workloadLoading && (
              <div className="flex items-center justify-center py-8">
                <span className="text-sm text-zinc-400">Loading workload data...</span>
              </div>
            )}
            {!workloadLoading && workloadData.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <span className="text-sm text-zinc-400">No workload data available.</span>
              </div>
            )}
            {workloadData.map((entry) => {
              const total = entry.assigned + entry.inReview + entry.overdue;
              const wScore = getWorkloadScore(entry);
              const member = members.find((m) => m.id === entry.memberId);
              const roleStyle = member ? ROLE_COLORS[member.role] : ROLE_COLORS['Contributor'];

              return (
                <div key={entry.memberId} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
                          roleStyle.bg,
                          roleStyle.text,
                        )}
                      >
                        {getInitials(entry.memberName)}
                      </div>
                      <span className="text-sm font-medium text-zinc-800">{entry.memberName}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-400">{total} total</span>
                      <span className={cn('font-semibold', wScore.color)}>{wScore.label}</span>
                    </div>
                  </div>

                  {/* Stacked bar */}
                  <div className="flex items-center gap-0.5 h-5 bg-zinc-100 rounded-lg overflow-hidden">
                    {entry.assigned > 0 && (
                      <div
                        className="h-full bg-blue-500 rounded-l-lg flex items-center justify-center"
                        style={{ width: getBarWidth(entry.assigned, workloadMax) }}
                        title={`${entry.assigned} assigned`}
                      >
                        {entry.assigned >= 3 && (
                          <span className="text-xs text-white font-medium">{entry.assigned}</span>
                        )}
                      </div>
                    )}
                    {entry.inReview > 0 && (
                      <div
                        className="h-full bg-violet-500 flex items-center justify-center"
                        style={{ width: getBarWidth(entry.inReview, workloadMax) }}
                        title={`${entry.inReview} in review`}
                      >
                        {entry.inReview >= 3 && (
                          <span className="text-xs text-white font-medium">{entry.inReview}</span>
                        )}
                      </div>
                    )}
                    {entry.overdue > 0 && (
                      <div
                        className="h-full bg-red-500 rounded-r-lg flex items-center justify-center"
                        style={{ width: getBarWidth(entry.overdue, workloadMax) }}
                        title={`${entry.overdue} overdue`}
                      >
                        {entry.overdue >= 2 && (
                          <span className="text-xs text-white font-medium">{entry.overdue}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recommendations */}
          <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="w-5 h-5 text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-900">Workload Recommendations</h3>
            </div>
            <div className="space-y-3">
              {WORKLOAD_RECOMMENDATIONS.map((rec, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 bg-white/70 border border-amber-100 rounded-xl p-3.5"
                >
                  <ArrowRightLeft className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-zinc-800">
                      Consider reassigning{' '}
                      <span className="font-semibold text-amber-700">{rec.count} tasks</span> from{' '}
                      <span className="font-semibold">{rec.from}</span> to{' '}
                      <span className="font-semibold">{rec.to}</span>
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">{rec.reason}</p>
                  </div>
                  <button className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors">
                    Apply
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
