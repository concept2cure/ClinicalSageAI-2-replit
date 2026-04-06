/**
 * Concept2Cure Client Portal V2 - Admin Dashboard
 *
 * Main administrative dashboard for organization management,
 * user oversight, security monitoring, and compliance tracking.
 *
 * @version 2.0.0
 */

import React, { useState } from 'react';
import { adminLogger } from '../../utils/logger';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  Shield,
  Building2,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Key,
  Settings,
  FileText,
  TrendingUp,
  TrendingDown,
  Lock,
  Unlock,
  UserPlus,
  BarChart3,
  Eye,
  Bell,
  Database,
  Server,
} from 'lucide-react';
import type { UserRole } from '../../core/portalTypes';
import type {
  Organization,
  UserProfile,
  AuditLogEntry,
  SecurityAlert,
  OrganizationLimits,
} from '../../core/securityTypes';

// ─────────────────────────────────────────────────────────────────────────────
// METRIC CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface AdminMetric {
  label: string;
  value: number | string;
  change?: number;
  changeLabel?: string;
  trend?: 'up' | 'down' | 'stable';
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const AdminMetricCard: React.FC<{ metric: AdminMetric }> = ({ metric }) => {
  const Icon = metric.icon;
  const TrendIcon =
    metric.trend === 'up' ? TrendingUp : metric.trend === 'down' ? TrendingDown : null;
  const trendColor =
    metric.trend === 'up'
      ? 'text-stone-700'
      : metric.trend === 'down'
        ? 'text-stone-700'
        : 'text-stone-500';

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
            <p className="text-3xl font-bold tracking-tight">{metric.value}</p>
          </div>
          <div className={`rounded-lg p-2.5`} style={{ backgroundColor: `${metric.color}15` }}>
            <Icon className="h-5 w-5" style={{ color: metric.color }} />
          </div>
        </div>
        {(metric.change !== undefined || metric.changeLabel) && (
          <div className={`mt-3 flex items-center gap-1 text-sm ${trendColor}`}>
            {TrendIcon && <TrendIcon className="h-4 w-4" />}
            <span>
              {metric.change !== undefined
                ? `${metric.change > 0 ? '+' : ''}${metric.change}%`
                : ''}
            </span>
            {metric.changeLabel && (
              <span className="text-muted-foreground ml-1">{metric.changeLabel}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RECENT ACTIVITY COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface RecentActivityProps {
  activities: AuditLogEntry[];
}

const RecentActivity: React.FC<RecentActivityProps> = ({ activities }) => {
  const getActivityIcon = (eventType: string) => {
    switch (eventType) {
      case 'LOGIN':
      case 'LOGOUT':
        return <Key className="h-4 w-4 text-stone-900" />;
      case 'LOGIN_FAILED':
        return <AlertTriangle className="h-4 w-4 text-stone-900" />;
      case 'USER_CREATED':
        return <UserPlus className="h-4 w-4 text-stone-900" />;
      case 'DOCUMENT_APPROVED':
        return <CheckCircle2 className="h-4 w-4 text-stone-900" />;
      case 'SETTINGS_CHANGED':
        return <Settings className="h-4 w-4 text-stone-900" />;
      default:
        return <Activity className="h-4 w-4 text-stone-500" />;
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-stone-600" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest actions across your organization</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recent activity</p>
            </div>
          ) : (
            activities.map(activity => (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-stone-50 transition-colors"
              >
                <div className="mt-1">{getActivityIcon(activity.eventType)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{activity.description}</p>
                    <Badge
                      variant="outline"
                      className={
                        activity.severity === 'critical'
                          ? 'border-stone-200 bg-stone-100 text-stone-800'
                          : activity.severity === 'warning'
                            ? 'border-stone-200 bg-stone-100 text-stone-700'
                            : 'border-stone-200'
                      }
                    >
                      {activity.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activity.userName || 'System'} • {formatTime(activity.timestamp)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY ALERTS COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface SecurityAlertsProps {
  alerts: SecurityAlert[];
  onResolve: (alertId: string) => void;
}

const SecurityAlerts: React.FC<SecurityAlertsProps> = ({ alerts, onResolve }) => {
  const unresolvedAlerts = alerts.filter(a => !a.isResolved);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-stone-200 bg-stone-100 text-stone-800';
      case 'high':
        return 'border-stone-200 bg-stone-100 text-stone-800';
      case 'medium':
        return 'border-stone-200 bg-stone-100 text-stone-800';
      default:
        return 'border-stone-200 bg-stone-100 text-stone-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-stone-700" />
              Security Alerts
              {unresolvedAlerts.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {unresolvedAlerts.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Active security concerns requiring attention</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {unresolvedAlerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-stone-900" />
              <p className="font-medium text-stone-800">All Clear</p>
              <p className="text-sm">No active security alerts</p>
            </div>
          ) : (
            unresolvedAlerts.map(alert => (
              <div
                key={alert.id}
                className={`p-4 rounded-lg border ${getSeverityColor(alert.severity)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">{alert.title}</p>
                      <p className="text-sm mt-1 opacity-80">{alert.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span>{new Date(alert.timestamp).toLocaleString()}</span>
                        {alert.ipAddress && <span>IP: {alert.ipAddress}</span>}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onResolve(alert.id)}
                    className="flex-shrink-0"
                  >
                    Resolve
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RESOURCE USAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ResourceUsageProps {
  limits: OrganizationLimits;
  current: {
    users: number;
    projects: number;
    storageGB: number;
  };
}

const ResourceUsage: React.FC<ResourceUsageProps> = ({ limits, current }) => {
  const getUsagePercent = (current: number, max: number) => {
    if (max === -1) return 0; // Unlimited
    return Math.round((current / max) * 100);
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'bg-stone-900';
    if (percent >= 75) return 'bg-stone-900';
    return 'bg-stone-900';
  };

  const resources = [
    {
      label: 'Users',
      current: current.users,
      max: limits.maxUsers,
      icon: Users,
    },
    {
      label: 'Projects',
      current: current.projects,
      max: limits.maxProjects,
      icon: FileText,
    },
    {
      label: 'Storage',
      current: current.storageGB,
      max: limits.maxStorageGB,
      icon: Database,
      unit: 'GB',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5 text-stone-600" />
          Resource Usage
        </CardTitle>
        <CardDescription>Current utilization of your plan limits</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {resources.map(resource => {
            const percent = getUsagePercent(resource.current, resource.max);
            const Icon = resource.icon;
            return (
              <div key={resource.label} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{resource.label}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {resource.current}
                    {resource.unit && ` ${resource.unit}`} /{' '}
                    {resource.max === -1
                      ? '∞'
                      : `${resource.max}${resource.unit ? ` ${resource.unit}` : ''}`}
                  </span>
                </div>
                <Progress
                  value={percent}
                  className="h-2"
                  // @ts-ignore - custom indicator color
                  indicatorClassName={getUsageColor(percent)}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// USER STATUS OVERVIEW COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface UserStatusOverviewProps {
  users: UserProfile[];
}

const UserStatusOverview: React.FC<UserStatusOverviewProps> = ({ users }) => {
  const activeUsers = users.filter(u => u.status === 'active').length;
  const pendingUsers = users.filter(u => u.status === 'pending').length;
  const lockedUsers = users.filter(u => u.status === 'locked').length;
  const mfaEnabled = users.filter(u => u.mfaEnabled).length;

  const stats = [
    { label: 'Active', value: activeUsers, color: 'bg-stone-900' },
    { label: 'Pending', value: pendingUsers, color: 'bg-stone-900' },
    { label: 'Locked', value: lockedUsers, color: 'bg-stone-900' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-stone-600" />
          User Overview
        </CardTitle>
        <CardDescription>Status breakdown of all organization users</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Status bars */}
          <div className="flex h-3 rounded-full overflow-hidden bg-stone-100">
            {stats.map(stat => (
              <div
                key={stat.label}
                className={`${stat.color} transition-all`}
                style={{ width: `${(stat.value / users.length) * 100}%` }}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between text-sm">
            {stats.map(stat => (
              <div key={stat.label} className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${stat.color}`} />
                <span className="text-muted-foreground">{stat.label}</span>
                <span className="font-medium">{stat.value}</span>
              </div>
            ))}
          </div>

          {/* MFA Status */}
          <div className="pt-4 border-t mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-stone-700" />
                <span className="text-sm">MFA Enabled</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{mfaEnabled}</span>
                <span className="text-muted-foreground">/ {users.length}</span>
                <Badge variant={mfaEnabled === users.length ? 'default' : 'secondary'}>
                  {Math.round((mfaEnabled / users.length) * 100)}%
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// QUICK ACTIONS COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface QuickActionsProps {
  onAction: (action: string) => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({ onAction }) => {
  const actions = [
    { id: 'invite_user', label: 'Invite User', icon: UserPlus, color: '#0d6efd' },
    { id: 'view_audit', label: 'View Audit Log', icon: Eye, color: '#57534e' },
    { id: 'security_settings', label: 'Security Settings', icon: Shield, color: '#647746' },
    { id: 'manage_roles', label: 'Manage Roles', icon: Key, color: '#dc2626' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-stone-600" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map(action => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => onAction(action.id)}
              >
                <Icon className="h-5 w-5" style={{ color: action.color }} />
                <span className="text-xs">{action.label}</span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ADMIN DASHBOARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');

  // Mock data - in production, this would come from API
  const metrics: AdminMetric[] = [
    {
      label: 'Total Users',
      value: 47,
      change: 12,
      changeLabel: 'from last month',
      trend: 'up',
      icon: Users,
      color: '#0d6efd',
    },
    {
      label: 'Active Sessions',
      value: 23,
      change: -5,
      changeLabel: 'from yesterday',
      trend: 'down',
      icon: Activity,
      color: '#647746',
    },
    {
      label: 'Security Alerts',
      value: 2,
      changeLabel: 'unresolved',
      icon: AlertTriangle,
      color: '#dc2626',
    },
    {
      label: 'Compliance Score',
      value: '94%',
      change: 3,
      changeLabel: 'improvement',
      trend: 'up',
      icon: Shield,
      color: '#57534e',
    },
  ];

  const mockUsers: UserProfile[] = [
    {
      id: '1',
      email: 'admin@example.com',
      username: 'admin',
      firstName: 'John',
      lastName: 'Smith',
      status: 'active',
      homeOrganizationId: '1',
      primaryRole: 'admin',
      authMethods: ['password', 'mfa'],
      mfaEnabled: true,
      failedLoginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      preferences: {
        theme: 'light',
        language: 'en',
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        emailNotifications: true,
        desktopNotifications: true,
        digestFrequency: 'daily',
      },
    },
    // Add more mock users as needed
  ];

  const mockActivities: AuditLogEntry[] = [
    {
      id: '1',
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
      eventType: 'LOGIN',
      severity: 'info',
      userId: '1',
      userName: 'John Smith',
      organizationId: '1',
      action: 'login',
      description: 'User logged in from new device',
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
      eventType: 'DOCUMENT_APPROVED',
      severity: 'info',
      userId: '2',
      userName: 'Jane Doe',
      organizationId: '1',
      action: 'approve',
      description: 'Protocol Amendment v2.1 approved',
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 1000 * 60 * 60),
      eventType: 'LOGIN_FAILED',
      severity: 'warning',
      organizationId: '1',
      action: 'login_failed',
      description: 'Failed login attempt for user@example.com',
      ipAddress: '192.168.1.100',
    },
  ];

  const mockAlerts: SecurityAlert[] = [
    {
      id: '1',
      type: 'SUSPICIOUS_LOGIN',
      severity: 'high',
      title: 'Unusual Login Location',
      description: 'Login detected from new geographic location (Moscow, Russia)',
      organizationId: '1',
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
      ipAddress: '185.220.100.252',
      isResolved: false,
    },
  ];

  const mockLimits: OrganizationLimits = {
    maxUsers: 50,
    maxProjects: 100,
    maxStorageGB: 200,
    maxApiCallsPerDay: 10000,
    maxConcurrentSessions: 100,
    retentionPeriodDays: 365,
  };

  const handleResolveAlert = (alertId: string) => {
    // TODO: API call to resolve alert
    adminLogger.audit('Security alert resolved', { alertId });
  };

  const handleQuickAction = (action: string) => {
    // TODO: Navigate to appropriate page/modal
    adminLogger.info('Quick action triggered', { action });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-stone-600" />
            Administration
          </h1>
          <p className="text-muted-foreground">
            Manage your organization, users, and security settings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </Button>
          <Button size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Invite User
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 mt-6">
          {/* Metrics Row */}
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            {metrics.map((metric, index) => (
              <AdminMetricCard key={index} metric={metric} />
            ))}
          </div>

          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Column - 2/3 width */}
            <div className="lg:col-span-2 space-y-6">
              <SecurityAlerts alerts={mockAlerts} onResolve={handleResolveAlert} />
              <RecentActivity activities={mockActivities} />
            </div>

            {/* Right Column - 1/3 width */}
            <div className="space-y-6">
              <QuickActions onAction={handleQuickAction} />
              <UserStatusOverview users={mockUsers} />
              <ResourceUsage
                limits={mockLimits}
                current={{ users: 47, projects: 32, storageGB: 87 }}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="users" className="flex-1 mt-6">
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium">User Management</h3>
              <p className="text-muted-foreground mt-2">
                View and manage all users in your organization
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="flex-1 mt-6">
          <Card>
            <CardContent className="p-8 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium">Security Settings</h3>
              <p className="text-muted-foreground mt-2">
                Configure security policies and compliance settings
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="flex-1 mt-6">
          <Card>
            <CardContent className="p-8 text-center">
              <Eye className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium">Audit Log</h3>
              <p className="text-muted-foreground mt-2">
                View complete audit trail of all system activities
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDashboard;
