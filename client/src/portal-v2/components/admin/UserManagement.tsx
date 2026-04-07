/**
 * Concept2Cure Client Portal V2 - User Management System
 *
 * Enterprise user management with role assignment, SoD validation,
 * training tracking, and compliance monitoring.
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11, ICH E6 GCP
 */

import React, { useState, useCallback, useMemo } from 'react';
import { adminLogger } from '../../utils/logger';
import {
  Users,
  UserPlus,
  UserCog,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Search,
  Filter,
  MoreVertical,
  Mail,
  Lock,
  Unlock,
  Key,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  GraduationCap,
  Calendar,
  Building,
  Eye,
  Edit,
  Trash2,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  SortAsc,
  UserX,
  UserCheck,
  History,
} from 'lucide-react';
import { useSecurityContext } from '../../hooks/useSecurityContext';
import { ElectronicSignatureGate, SignatureDisplay } from '../security/ElectronicSignature';
import type { UserRole } from '../../core/portalTypes';
import type {
  UserProfile,
  OrganizationMembership,
  MembershipStatus,
  AccessLevel,
} from '../../core/securityTypes';
import {
  validateSoD,
  ROLE_PERMISSION_PRESETS,
  SOD_CONFLICT_MATRIX,
} from '../../core/regulatoryCompliance';

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA (Replace with API calls)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_USERS: (UserProfile & { membership: OrganizationMembership })[] = [
  {
    id: 'user_001',
    email: 'john.smith@pharma.com',
    displayName: 'John Smith',
    avatarUrl: null,
    title: 'Sr. Regulatory Affairs Manager',
    department: 'Regulatory Affairs',
    phone: '+1 555-0101',
    timezone: 'America/New_York',
    locale: 'en-US',
    preferredMfaMethod: 'totp',
    mfaEnabled: true,
    mfaMethods: ['totp'],
    lastLoginAt: '2025-01-23T14:30:00Z',
    passwordLastChangedAt: '2025-01-01T00:00:00Z',
    loginCount: 156,
    trainingCompletedAt: '2025-01-15T00:00:00Z',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2025-01-23T14:30:00Z',
    membership: {
      id: 'mem_001',
      userId: 'user_001',
      organizationId: 'org_001',
      roles: ['regulatory_lead', 'admin'],
      customPermissions: [],
      accessLevel: 'FULL',
      status: 'ACTIVE',
      invitedBy: 'system',
      invitedAt: '2024-01-15T00:00:00Z',
      acceptedAt: '2024-01-15T00:00:00Z',
      expiresAt: null,
      lastActivityAt: '2025-01-23T14:30:00Z',
    },
  },
  {
    id: 'user_002',
    email: 'sarah.johnson@pharma.com',
    displayName: 'Sarah Johnson',
    avatarUrl: null,
    title: 'Medical Writer',
    department: 'Medical Writing',
    phone: '+1 555-0102',
    timezone: 'America/Chicago',
    locale: 'en-US',
    preferredMfaMethod: 'totp',
    mfaEnabled: true,
    mfaMethods: ['totp'],
    lastLoginAt: '2025-01-23T10:15:00Z',
    passwordLastChangedAt: '2024-12-01T00:00:00Z',
    loginCount: 89,
    trainingCompletedAt: '2024-06-15T00:00:00Z', // Expired
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2025-01-23T10:15:00Z',
    membership: {
      id: 'mem_002',
      userId: 'user_002',
      organizationId: 'org_001',
      roles: ['medical_writer'],
      customPermissions: [],
      accessLevel: 'STANDARD',
      status: 'ACTIVE',
      invitedBy: 'user_001',
      invitedAt: '2024-03-01T00:00:00Z',
      acceptedAt: '2024-03-02T00:00:00Z',
      expiresAt: null,
      lastActivityAt: '2025-01-23T10:15:00Z',
    },
  },
  {
    id: 'user_003',
    email: 'michael.chen@pharma.com',
    displayName: 'Michael Chen',
    avatarUrl: null,
    title: 'Clinical Operations Lead',
    department: 'Clinical Operations',
    phone: '+1 555-0103',
    timezone: 'America/Los_Angeles',
    locale: 'en-US',
    preferredMfaMethod: 'email',
    mfaEnabled: false, // Non-compliant
    mfaMethods: [],
    lastLoginAt: '2025-01-20T16:45:00Z',
    passwordLastChangedAt: '2024-08-01T00:00:00Z', // Expired
    loginCount: 234,
    trainingCompletedAt: '2025-01-10T00:00:00Z',
    createdAt: '2023-06-15T00:00:00Z',
    updatedAt: '2025-01-20T16:45:00Z',
    membership: {
      id: 'mem_003',
      userId: 'user_003',
      organizationId: 'org_001',
      roles: ['clinical_ops', 'project_manager'],
      customPermissions: [],
      accessLevel: 'STANDARD',
      status: 'ACTIVE',
      invitedBy: 'user_001',
      invitedAt: '2023-06-15T00:00:00Z',
      acceptedAt: '2023-06-15T00:00:00Z',
      expiresAt: null,
      lastActivityAt: '2025-01-20T16:45:00Z',
    },
  },
  {
    id: 'user_004',
    email: 'emily.davis@partner.com',
    displayName: 'Emily Davis',
    avatarUrl: null,
    title: 'External Consultant',
    department: 'External',
    phone: '+1 555-0104',
    timezone: 'America/New_York',
    locale: 'en-US',
    preferredMfaMethod: 'totp',
    mfaEnabled: true,
    mfaMethods: ['totp'],
    lastLoginAt: '2025-01-22T09:00:00Z',
    passwordLastChangedAt: '2025-01-01T00:00:00Z',
    loginCount: 12,
    trainingCompletedAt: '2025-01-05T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-22T09:00:00Z',
    membership: {
      id: 'mem_004',
      userId: 'user_004',
      organizationId: 'org_001',
      roles: ['external_partner'],
      customPermissions: [],
      accessLevel: 'LIMITED',
      status: 'ACTIVE',
      invitedBy: 'user_001',
      invitedAt: '2025-01-01T00:00:00Z',
      acceptedAt: '2025-01-01T00:00:00Z',
      expiresAt: '2025-06-30T23:59:59Z',
      lastActivityAt: '2025-01-22T09:00:00Z',
    },
  },
  {
    id: 'user_005',
    email: 'robert.wilson@pharma.com',
    displayName: 'Robert Wilson',
    avatarUrl: null,
    title: 'QA Specialist',
    department: 'Quality Assurance',
    phone: '+1 555-0105',
    timezone: 'America/New_York',
    locale: 'en-US',
    preferredMfaMethod: 'totp',
    mfaEnabled: true,
    mfaMethods: ['totp', 'hardware_key'],
    lastLoginAt: null,
    passwordLastChangedAt: null,
    loginCount: 0,
    trainingCompletedAt: null,
    createdAt: '2025-01-20T00:00:00Z',
    updatedAt: '2025-01-20T00:00:00Z',
    membership: {
      id: 'mem_005',
      userId: 'user_005',
      organizationId: 'org_001',
      roles: ['quality_assurance'],
      customPermissions: [],
      accessLevel: 'STANDARD',
      status: 'PENDING',
      invitedBy: 'user_001',
      invitedAt: '2025-01-20T00:00:00Z',
      acceptedAt: null,
      expiresAt: null,
      lastActivityAt: null,
    },
  },
];

const ALL_ROLES: UserRole[] = [
  'admin',
  'regulatory_lead',
  'clinical_ops',
  'medical_writer',
  'biostatistician',
  'quality_assurance',
  'legal_counsel',
  'executive',
  'cmc_specialist',
  'safety_officer',
  'project_manager',
  'viewer',
  'external_partner',
];

// ─────────────────────────────────────────────────────────────────────────────
// ROLE DISPLAY CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; description: string }> = {
  admin: {
    label: 'Administrator',
    color: '#dc2626',
    description: 'Full system access and user management',
  },
  regulatory_lead: {
    label: 'Regulatory Lead',
    color: '#5585b3',
    description: 'Lead regulatory strategy and submissions',
  },
  clinical_ops: {
    label: 'Clinical Operations',
    color: '#647746',
    description: 'Manage clinical trial operations',
  },
  medical_writer: {
    label: 'Medical Writer',
    color: '#5585b3',
    description: 'Author and edit regulatory documents',
  },
  biostatistician: {
    label: 'Biostatistician',
    color: '#647746',
    description: 'Statistical analysis and reporting',
  },
  quality_assurance: {
    label: 'Quality Assurance',
    color: '#d97706',
    description: 'QA review and compliance audits',
  },
  legal_counsel: {
    label: 'Legal Counsel',
    color: '#c15f3c',
    description: 'Legal review and approval',
  },
  executive: {
    label: 'Executive',
    color: '#be123c',
    description: 'Executive oversight and reporting',
  },
  cmc_specialist: {
    label: 'CMC Specialist',
    color: '#65a30d',
    description: 'Chemistry, Manufacturing, Controls',
  },
  safety_officer: {
    label: 'Safety Officer',
    color: '#ea580c',
    description: 'Safety monitoring and SAE reporting',
  },
  project_manager: {
    label: 'Project Manager',
    color: '#6a9bcc',
    description: 'Project coordination and timelines',
  },
  viewer: { label: 'Viewer', color: '#8a8880', description: 'Read-only access to documents' },
  external_partner: {
    label: 'External Partner',
    color: '#8a8880',
    description: 'Limited external access',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function UserManagement() {
  const { can, organization, complianceConfig } = useSecurityContext();
  const [users, setUsers] = useState(MOCK_USERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MembershipStatus | 'ALL'>('ALL');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [sortField, setSortField] = useState<'displayName' | 'lastLoginAt' | 'createdAt'>(
    'displayName'
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedUser, setSelectedUser] = useState<(typeof MOCK_USERS)[0] | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    let result = [...users];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        u =>
          u.displayName?.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query) ||
          u.title?.toLowerCase().includes(query) ||
          u.department?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      result = result.filter(u => u.membership.status === statusFilter);
    }

    // Role filter
    if (roleFilter !== 'ALL') {
      result = result.filter(u => u.membership.roles.includes(roleFilter));
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'displayName':
          comparison = (a.displayName || a.email).localeCompare(b.displayName || b.email);
          break;
        case 'lastLoginAt':
          comparison = (a.lastLoginAt || '').localeCompare(b.lastLoginAt || '');
          break;
        case 'createdAt':
          comparison = a.createdAt.localeCompare(b.createdAt);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [users, searchQuery, statusFilter, roleFilter, sortField, sortDirection]);

  // Compliance checks
  const complianceIssues = useMemo(() => {
    const issues: { userId: string; type: string; severity: 'critical' | 'warning' }[] = [];

    users.forEach(user => {
      // Check MFA
      if (complianceConfig?.accessControl.mfaRequired && !user.mfaEnabled) {
        issues.push({ userId: user.id, type: 'mfa_disabled', severity: 'critical' });
      }

      // Check password expiry
      if (user.passwordLastChangedAt) {
        const passwordAge = Math.floor(
          (Date.now() - new Date(user.passwordLastChangedAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        const maxAge = complianceConfig?.accessControl.passwordPolicy.expirationDays || 90;
        if (passwordAge > maxAge) {
          issues.push({ userId: user.id, type: 'password_expired', severity: 'critical' });
        }
      }

      // Check training
      if (complianceConfig?.training.required && user.trainingCompletedAt) {
        const trainingAge = Math.floor(
          (Date.now() - new Date(user.trainingCompletedAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        const maxAge = complianceConfig?.training.refreshIntervalDays || 365;
        if (trainingAge > maxAge) {
          issues.push({ userId: user.id, type: 'training_expired', severity: 'warning' });
        }
      }
    });

    return issues;
  }, [users, complianceConfig]);

  // Get compliance issues for a user
  const getUserIssues = useCallback(
    (userId: string) => complianceIssues.filter(i => i.userId === userId),
    [complianceIssues]
  );

  // Stats
  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter(u => u.membership.status === 'ACTIVE').length,
      pending: users.filter(u => u.membership.status === 'PENDING').length,
      suspended: users.filter(u => u.membership.status === 'SUSPENDED').length,
      compliant: users.filter(u => getUserIssues(u.id).length === 0).length,
      nonCompliant: users.filter(u => getUserIssues(u.id).length > 0).length,
    }),
    [users, getUserIssues]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-7 w-7" />
            User Management
          </h1>
          <p className="text-gray-500 mt-1">Manage organization members, roles, and compliance</p>
        </div>

        {can('users', 'create') && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <UserPlus className="h-5 w-5" />
            Invite User
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total Users"
          value={stats.total}
          icon={<Users className="h-5 w-5" />}
          color="text-gray-600"
        />
        <StatCard
          label="Active"
          value={stats.active}
          icon={<UserCheck className="h-5 w-5" />}
          color="text-green-600"
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          icon={<Clock className="h-5 w-5" />}
          color="text-amber-600"
        />
        <StatCard
          label="Suspended"
          value={stats.suspended}
          icon={<UserX className="h-5 w-5" />}
          color="text-red-600"
        />
        <StatCard
          label="Compliant"
          value={stats.compliant}
          icon={<ShieldCheck className="h-5 w-5" />}
          color="text-green-600"
        />
        <StatCard
          label="Non-Compliant"
          value={stats.nonCompliant}
          icon={<ShieldAlert className="h-5 w-5" />}
          color="text-red-600"
        />
      </div>

      {/* Compliance Alerts */}
      {stats.nonCompliant > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">
              {stats.nonCompliant} user(s) have compliance issues requiring attention
            </span>
          </div>
          <div className="mt-2 text-sm text-amber-700">
            Review users marked with warning icons to resolve MFA, password, or training issues.
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as MembershipStatus | 'ALL')}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="EXPIRED">Expired</option>
            <option value="REVOKED">Revoked</option>
          </select>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value as UserRole | 'ALL')}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="ALL">All Roles</option>
            {ALL_ROLES.map(role => (
              <option key={role} value={role}>
                {ROLE_CONFIG[role].label}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={`${sortField}-${sortDirection}`}
            onChange={e => {
              const [field, dir] = e.target.value.split('-');
              setSortField(field as typeof sortField);
              setSortDirection(dir as typeof sortDirection);
            }}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="displayName-asc">Name (A-Z)</option>
            <option value="displayName-desc">Name (Z-A)</option>
            <option value="lastLoginAt-desc">Recent Login</option>
            <option value="createdAt-desc">Newest First</option>
            <option value="createdAt-asc">Oldest First</option>
          </select>

          {/* Export */}
          {can('users', 'export') && (
            <button className="flex items-center gap-2 px-3 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">
              <Download className="h-4 w-4" />
              Export
            </button>
          )}
        </div>
      </div>

      {/* User List */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">User</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Roles</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Compliance</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Last Active</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredUsers.map(user => (
              <UserRow
                key={user.id}
                user={user}
                issues={getUserIssues(user.id)}
                expanded={expandedUserId === user.id}
                onToggleExpand={() =>
                  setExpandedUserId(expandedUserId === user.id ? null : user.id)
                }
                onEdit={() => {
                  setSelectedUser(user);
                  setShowRoleModal(true);
                }}
                canEdit={can('users', 'update')}
                canDelete={can('users', 'delete')}
              />
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No users found matching your criteria.
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && <InviteUserModal onClose={() => setShowInviteModal(false)} />}

      {/* Role Management Modal */}
      {showRoleModal && selectedUser && (
        <RoleManagementModal
          user={selectedUser}
          onClose={() => {
            setShowRoleModal(false);
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className={`flex items-center gap-2 ${color}`}>
        {icon}
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USER ROW COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface UserRowProps {
  user: (typeof MOCK_USERS)[0];
  issues: { type: string; severity: 'critical' | 'warning' }[];
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  canEdit: boolean;
  canDelete: boolean;
}

function UserRow({
  user,
  issues,
  expanded,
  onToggleExpand,
  onEdit,
  canEdit,
  canDelete,
}: UserRowProps) {
  const statusConfig: Record<MembershipStatus, { label: string; color: string; bg: string }> = {
    ACTIVE: { label: 'Active', color: 'text-green-700', bg: 'bg-green-100' },
    PENDING: { label: 'Pending', color: 'text-amber-700', bg: 'bg-amber-100' },
    SUSPENDED: { label: 'Suspended', color: 'text-red-700', bg: 'bg-red-100' },
    EXPIRED: { label: 'Expired', color: 'text-gray-700', bg: 'bg-gray-100' },
    REVOKED: { label: 'Revoked', color: 'text-gray-700', bg: 'bg-gray-100' },
  };

  const status = statusConfig[user.membership.status];

  return (
    <>
      <tr className="hover:bg-gray-50">
        {/* User Info */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-medium">
              {user.displayName?.[0] || user.email[0].toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-gray-900">{user.displayName || user.email}</div>
              <div className="text-sm text-gray-500">{user.email}</div>
              {user.title && <div className="text-xs text-gray-400">{user.title}</div>}
            </div>
          </div>
        </td>

        {/* Roles */}
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {user.membership.roles.slice(0, 2).map((role: any) => (
              <span
                key={role}
                className="px-2 py-0.5 text-xs rounded-full"
                style={{
                  backgroundColor: `${ROLE_CONFIG[role].color}15`,
                  color: ROLE_CONFIG[role].color,
                }}
              >
                {ROLE_CONFIG[role].label}
              </span>
            ))}
            {user.membership.roles.length > 2 && (
              <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                +{user.membership.roles.length - 2}
              </span>
            )}
          </div>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <span
            className={`px-2 py-1 text-xs font-medium rounded-full ${status.bg} ${status.color}`}
          >
            {status.label}
          </span>
        </td>

        {/* Compliance */}
        <td className="px-4 py-3">
          {issues.length === 0 ? (
            <div className="flex items-center gap-1 text-green-600">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-sm">Compliant</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {issues.some(i => i.severity === 'critical') ? (
                <ShieldX className="h-4 w-4 text-red-500" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              )}
              <span className="text-sm text-gray-600">
                {issues.length} issue{issues.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </td>

        {/* Last Active */}
        <td className="px-4 py-3 text-sm text-gray-500">
          {user.lastLoginAt ? (
            new Date(user.lastLoginAt).toLocaleDateString()
          ) : (
            <span className="text-gray-400">Never</span>
          )}
        </td>

        {/* Actions */}
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onToggleExpand}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="View Details"
            >
              {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
            {canEdit && (
              <button
                onClick={onEdit}
                className="p-1 text-gray-400 hover:text-primary-600"
                title="Edit User"
              >
                <UserCog className="h-5 w-5" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded Details */}
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={6} className="px-4 py-4">
            <UserDetailPanel user={user} issues={issues} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USER DETAIL PANEL
// ─────────────────────────────────────────────────────────────────────────────

interface UserDetailPanelProps {
  user: (typeof MOCK_USERS)[0];
  issues: { type: string; severity: 'critical' | 'warning' }[];
}

function UserDetailPanel({ user, issues }: UserDetailPanelProps) {
  const issueMessages: Record<string, { label: string; action: string }> = {
    mfa_disabled: { label: 'MFA not enabled', action: 'Enable multi-factor authentication' },
    password_expired: { label: 'Password expired', action: 'User must reset password' },
    training_expired: { label: 'Training expired', action: 'Complete required training' },
  };

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* User Details */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">User Details</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Department</span>
            <span className="text-gray-900">{user.department || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Phone</span>
            <span className="text-gray-900">{user.phone || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Timezone</span>
            <span className="text-gray-900">{user.timezone}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Login Count</span>
            <span className="text-gray-900">{user.loginCount}</span>
          </div>
        </div>
      </div>

      {/* Security Info */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Security</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">MFA Enabled</span>
            <span className={user.mfaEnabled ? 'text-green-600' : 'text-red-600'}>
              {user.mfaEnabled ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">MFA Methods</span>
            <span className="text-gray-900">
              {user.mfaMethods.length > 0 ? user.mfaMethods.join(', ') : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Password Changed</span>
            <span className="text-gray-900">
              {user.passwordLastChangedAt
                ? new Date(user.passwordLastChangedAt).toLocaleDateString()
                : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Access Level</span>
            <span className="text-gray-900">{user.membership.accessLevel}</span>
          </div>
        </div>
      </div>

      {/* Compliance Issues */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Compliance Issues</h4>
        {issues.length === 0 ? (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <CheckCircle className="h-4 w-4" />
            <span>No compliance issues</span>
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map((issue, idx) => {
              const msg = issueMessages[issue.type];
              return (
                <div
                  key={idx}
                  className={`p-2 rounded text-sm ${
                    issue.severity === 'critical'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  <div className="font-medium">{msg?.label || issue.type}</div>
                  <div className="text-xs opacity-80">{msg?.action}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INVITE USER MODAL
// ─────────────────────────────────────────────────────────────────────────────

interface InviteUserModalProps {
  onClose: () => void;
}

function InviteUserModal({ onClose }: InviteUserModalProps) {
  const [email, setEmail] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('STANDARD');
  const [sodValidation, setSodValidation] = useState<ReturnType<typeof validateSoD> | null>(null);
  const [showSignature, setShowSignature] = useState(false);

  // Validate SoD when roles change
  const handleRoleToggle = (role: UserRole) => {
    let newRoles: UserRole[];
    if (selectedRoles.includes(role)) {
      newRoles = selectedRoles.filter(r => r !== role);
    } else {
      newRoles = [...selectedRoles, role];
    }
    setSelectedRoles(newRoles);

    // Validate SoD
    if (newRoles.length > 1) {
      const validation = validateSoD(newRoles.slice(0, -1), newRoles[newRoles.length - 1]);
      setSodValidation(validation);
    } else {
      setSodValidation(null);
    }
  };

  const handleInvite = () => {
    // In a real app, this would require electronic signature for admin role assignments
    if (selectedRoles.includes('admin')) {
      setShowSignature(true);
    } else {
      // Proceed with invite
      adminLogger.audit('User invitation initiated', { email, roles: selectedRoles, accessLevel });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <UserPlus className="h-6 w-6" />
            Invite New User
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@company.com"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Access Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Access Level</label>
            <select
              value={accessLevel}
              onChange={e => setAccessLevel(e.target.value as AccessLevel)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="LIMITED">Limited - External/Partner access</option>
              <option value="STANDARD">Standard - Full member access</option>
              <option value="FULL">Full - Administrative access</option>
            </select>
          </div>

          {/* Roles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assign Roles</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_ROLES.map(role => (
                <label
                  key={role}
                  className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedRoles.includes(role)
                      ? 'border-primary-500 bg-primary-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role)}
                    onChange={() => handleRoleToggle(role)}
                    className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <div>
                    <div className="text-sm font-medium" style={{ color: ROLE_CONFIG[role].color }}>
                      {ROLE_CONFIG[role].label}
                    </div>
                    <div className="text-xs text-gray-500">{ROLE_CONFIG[role].description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* SoD Warning */}
          {sodValidation && !sodValidation.isCompliant && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2 text-amber-800 font-medium">
                <ShieldAlert className="h-5 w-5" />
                Segregation of Duties Conflict Detected
              </div>
              <div className="mt-2 space-y-2">
                {sodValidation.conflicts.map((conflict, idx) => (
                  <div key={idx} className="text-sm text-amber-700">
                    <strong>{ROLE_CONFIG[conflict.roleA].label}</strong> conflicts with{' '}
                    <strong>{ROLE_CONFIG[conflict.roleB].label}</strong>
                    <p className="text-xs opacity-80">{conflict.reason}</p>
                  </div>
                ))}
              </div>
              {sodValidation.waiverRequired && (
                <p className="mt-2 text-sm text-amber-600">
                  A waiver may be granted by:{' '}
                  {sodValidation.waiverApprovers.map(r => ROLE_CONFIG[r].label).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={handleInvite}
            disabled={!email || selectedRoles.length === 0}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Send Invitation
          </button>
        </div>

        {/* Signature gate for admin role */}
        {showSignature && (
          <ElectronicSignatureGate
            action="user_creation"
            meaning="approval"
            recordId={`invite_${email}`}
            recordType="user_invitation"
            immediate
            context={`Inviting ${email} with administrator privileges`}
            onSuccess={signature => {
              adminLogger.audit('User invitation signed', { email, signatureId: signature.id });
              onClose();
            }}
            onCancel={() => setShowSignature(false)}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE MANAGEMENT MODAL
// ─────────────────────────────────────────────────────────────────────────────

interface RoleManagementModalProps {
  user: (typeof MOCK_USERS)[0];
  onClose: () => void;
}

function RoleManagementModal({ user, onClose }: RoleManagementModalProps) {
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>(user.membership.roles);
  const [showSignature, setShowSignature] = useState(false);
  const [pendingChange, setPendingChange] = useState<{
    added: UserRole[];
    removed: UserRole[];
  } | null>(null);

  const handleSave = () => {
    const added = selectedRoles.filter(r => !user.membership.roles.includes(r));
    const removed = user.membership.roles.filter((r: any) => !selectedRoles.includes(r));

    if (added.length > 0 || removed.length > 0) {
      setPendingChange({ added, removed });
      setShowSignature(true);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <UserCog className="h-6 w-6" />
            Manage Roles
          </h2>
          <p className="text-gray-500 mt-1">{user.displayName || user.email}</p>
        </div>

        <div className="p-6">
          <div className="space-y-2">
            {ALL_ROLES.map(role => (
              <label
                key={role}
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedRoles.includes(role)
                    ? 'border-primary-500 bg-primary-50'
                    : 'hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(role)}
                  onChange={() => {
                    if (selectedRoles.includes(role)) {
                      setSelectedRoles(selectedRoles.filter(r => r !== role));
                    } else {
                      setSelectedRoles([...selectedRoles, role]);
                    }
                  }}
                  className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <div className="flex-1">
                  <div className="font-medium" style={{ color: ROLE_CONFIG[role].color }}>
                    {ROLE_CONFIG[role].label}
                  </div>
                  <div className="text-xs text-gray-500">{ROLE_CONFIG[role].description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={selectedRoles.length === 0}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
          >
            Save Changes
          </button>
        </div>

        {/* Signature required for role changes */}
        {showSignature && pendingChange && (
          <ElectronicSignatureGate
            action="role_change"
            meaning="approval"
            recordId={user.id}
            recordType="user_role_change"
            immediate
            context={`Changing roles for ${user.displayName || user.email}. Adding: ${pendingChange.added.map(r => ROLE_CONFIG[r].label).join(', ') || 'none'}. Removing: ${pendingChange.removed.map(r => ROLE_CONFIG[r].label).join(', ') || 'none'}`}
            onSuccess={signature => {
              adminLogger.audit('Role change signed', {
                userId: user.id,
                added: pendingChange.added,
                removed: pendingChange.removed,
                signatureId: signature.id,
              });
              onClose();
            }}
            onCancel={() => setShowSignature(false)}
          />
        )}
      </div>
    </div>
  );
}

export default UserManagement;
