/**
 * Activity Monitor Component
 *
 * Real-time system activity monitoring with:
 * - Live activity feed
 * - User session tracking
 * - System event monitoring
 * - Security event alerts
 *
 * @version 1.0.0
 * @compliance FDA 21 CFR Part 11, SOC 2 Type II
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { sessionLogger } from '../../utils/logger';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity,
  Users,
  User,
  Clock,
  Calendar,
  Shield,
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  XCircle,
  Eye,
  Search,
  Filter,
  RefreshCw,
  Download,
  Pause,
  Play,
  Settings,
  Monitor,
  Globe,
  MapPin,
  Smartphone,
  Laptop,
  Server,
  Database,
  FileText,
  Lock,
  Unlock,
  LogIn,
  LogOut,
  Key,
  Edit,
  Trash2,
  Upload,
  Send,
  MessageSquare,
  Bell,
  Zap,
  TrendingUp,
  ChevronRight,
  ExternalLink,
  Info,
  MoreVertical,
  Circle,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ActivityEvent {
  id: string;
  timestamp: Date;
  type: ActivityType;
  category: ActivityCategory;
  severity: ActivitySeverity;
  userId?: string;
  userName?: string;
  userRole?: string;
  action: string;
  resource?: string;
  resourceType?: string;
  details: string;
  metadata: Record<string, unknown>;
  ipAddress: string;
  userAgent?: string;
  location?: {
    country: string;
    city: string;
    coordinates?: [number, number];
  };
  sessionId?: string;
  requestId: string;
  duration?: number;
  status: 'success' | 'failure' | 'warning' | 'pending';
}

type ActivityType =
  | 'auth'
  | 'document'
  | 'user'
  | 'system'
  | 'security'
  | 'api'
  | 'workflow'
  | 'integration';

type ActivityCategory =
  | 'login'
  | 'logout'
  | 'mfa'
  | 'password'
  | 'permission'
  | 'create'
  | 'update'
  | 'delete'
  | 'view'
  | 'export'
  | 'import'
  | 'approve'
  | 'reject'
  | 'sign'
  | 'submit'
  | 'config'
  | 'alert'
  | 'error';

type ActivitySeverity = 'info' | 'warning' | 'error' | 'critical';

interface ActiveSession {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  userEmail: string;
  loginTime: Date;
  lastActivity: Date;
  ipAddress: string;
  location?: {
    country: string;
    city: string;
  };
  device: {
    type: 'desktop' | 'mobile' | 'tablet';
    os: string;
    browser: string;
  };
  status: 'active' | 'idle' | 'locked';
  mfaVerified: boolean;
}

interface SystemMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  status: 'healthy' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
  lastUpdated: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<ActivitySeverity, { label: string; color: string; bgColor: string }> =
  {
    info: { label: 'Info', color: '#2563eb', bgColor: '#dbeafe' },
    warning: { label: 'Warning', color: '#d97706', bgColor: '#fef3c7' },
    error: { label: 'Error', color: '#dc2626', bgColor: '#fee2e2' },
    critical: { label: 'Critical', color: '#7c2d12', bgColor: '#fecaca' },
  };

const TYPE_CONFIG: Record<
  ActivityType,
  { label: string; icon: React.ComponentType<any>; color: string }
> = {
  auth: { label: 'Authentication', icon: Key, color: '#7c3aed' },
  document: { label: 'Document', icon: FileText, color: '#2563eb' },
  user: { label: 'User', icon: User, color: '#059669' },
  system: { label: 'System', icon: Server, color: '#6b7280' },
  security: { label: 'Security', icon: Shield, color: '#dc2626' },
  api: { label: 'API', icon: Zap, color: '#d97706' },
  workflow: { label: 'Workflow', icon: Activity, color: '#0891b2' },
  integration: { label: 'Integration', icon: Globe, color: '#9333ea' },
};

const CATEGORY_ICONS: Record<ActivityCategory, React.ComponentType<any>> = {
  login: LogIn,
  logout: LogOut,
  mfa: Smartphone,
  password: Key,
  permission: Lock,
  create: FileText,
  update: Edit,
  delete: Trash2,
  view: Eye,
  export: Download,
  import: Upload,
  approve: CheckCircle,
  reject: XCircle,
  sign: Edit,
  submit: Send,
  config: Settings,
  alert: AlertTriangle,
  error: AlertCircle,
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const generateMockEvents = (): ActivityEvent[] => {
  const events: ActivityEvent[] = [
    {
      id: 'evt-001',
      timestamp: new Date(Date.now() - 1000 * 60),
      type: 'auth',
      category: 'login',
      severity: 'info',
      userId: 'user-001',
      userName: 'Dr. Sarah Chen',
      userRole: 'Regulatory Lead',
      action: 'User login successful',
      details: 'MFA verified via authenticator app',
      metadata: { mfaMethod: 'totp', attemptNumber: 1 },
      ipAddress: '192.168.1.100',
      userAgent: 'Chrome/120.0 Windows 10',
      location: { country: 'United States', city: 'Boston' },
      sessionId: 'sess-abc123',
      requestId: 'req-001',
      status: 'success',
    },
    {
      id: 'evt-002',
      timestamp: new Date(Date.now() - 1000 * 120),
      type: 'document',
      category: 'approve',
      severity: 'info',
      userId: 'user-002',
      userName: 'Dr. Michael Park',
      userRole: 'Medical Writer',
      action: 'Document approved',
      resource: 'IND-2025-001-Protocol-v2.3',
      resourceType: 'protocol',
      details: 'Clinical protocol approved with electronic signature',
      metadata: { documentId: 'doc-123', version: '2.3', signatureId: 'sig-456' },
      ipAddress: '192.168.1.105',
      location: { country: 'United States', city: 'San Francisco' },
      requestId: 'req-002',
      status: 'success',
    },
    {
      id: 'evt-003',
      timestamp: new Date(Date.now() - 1000 * 300),
      type: 'security',
      category: 'alert',
      severity: 'warning',
      action: 'Multiple failed login attempts',
      details: '5 failed login attempts from single IP address',
      metadata: { attemptCount: 5, blockedDuration: 900 },
      ipAddress: '203.0.113.42',
      location: { country: 'Unknown', city: 'Unknown' },
      requestId: 'req-003',
      status: 'warning',
    },
    {
      id: 'evt-004',
      timestamp: new Date(Date.now() - 1000 * 450),
      type: 'user',
      category: 'permission',
      severity: 'info',
      userId: 'user-003',
      userName: 'Admin User',
      userRole: 'Administrator',
      action: 'Role assigned to user',
      resource: 'Jennifer Kim',
      resourceType: 'user',
      details: 'Assigned QA Specialist role with document approval permissions',
      metadata: { targetUserId: 'user-004', newRole: 'qa_specialist' },
      ipAddress: '192.168.1.101',
      requestId: 'req-004',
      status: 'success',
    },
    {
      id: 'evt-005',
      timestamp: new Date(Date.now() - 1000 * 600),
      type: 'workflow',
      category: 'submit',
      severity: 'info',
      userId: 'user-005',
      userName: 'Emily Rodriguez',
      userRole: 'Regulatory Specialist',
      action: 'Submission package created',
      resource: 'IND-2025-001',
      resourceType: 'submission',
      details: 'eCTD submission package generated for FDA review',
      metadata: { submissionType: 'IND', agency: 'FDA', moduleCount: 5 },
      ipAddress: '192.168.1.110',
      requestId: 'req-005',
      duration: 45000,
      status: 'success',
    },
    {
      id: 'evt-006',
      timestamp: new Date(Date.now() - 1000 * 900),
      type: 'api',
      category: 'error',
      severity: 'error',
      action: 'API request failed',
      resource: '/api/v1/documents/upload',
      resourceType: 'endpoint',
      details: 'File upload failed: exceeded maximum file size limit',
      metadata: { fileSize: 104857600, maxSize: 52428800, errorCode: 'FILE_TOO_LARGE' },
      ipAddress: '192.168.1.115',
      requestId: 'req-006',
      status: 'failure',
    },
    {
      id: 'evt-007',
      timestamp: new Date(Date.now() - 1000 * 1200),
      type: 'system',
      category: 'config',
      severity: 'info',
      userId: 'user-003',
      userName: 'Admin User',
      userRole: 'Administrator',
      action: 'System configuration updated',
      resource: 'Password Policy',
      resourceType: 'setting',
      details: 'Minimum password length increased from 12 to 14 characters',
      metadata: { setting: 'password.minLength', oldValue: 12, newValue: 14 },
      ipAddress: '192.168.1.101',
      requestId: 'req-007',
      status: 'success',
    },
    {
      id: 'evt-008',
      timestamp: new Date(Date.now() - 1000 * 1500),
      type: 'document',
      category: 'sign',
      severity: 'info',
      userId: 'user-006',
      userName: 'Dr. Robert Thompson',
      userRole: 'Medical Director',
      action: 'Document electronically signed',
      resource: 'Safety-Report-Q4-2025',
      resourceType: 'safety_report',
      details: '21 CFR Part 11 compliant electronic signature applied',
      metadata: {
        signatureType: 'approval',
        signatureId: 'sig-789',
        meaning: 'Approved for submission',
      },
      ipAddress: '192.168.1.120',
      requestId: 'req-008',
      status: 'success',
    },
  ];

  return events;
};

const MOCK_SESSIONS: ActiveSession[] = [
  {
    id: 'sess-001',
    userId: 'user-001',
    userName: 'Dr. Sarah Chen',
    userRole: 'Regulatory Lead',
    userEmail: 'sarah.chen@example.com',
    loginTime: new Date(Date.now() - 1000 * 60 * 45),
    lastActivity: new Date(Date.now() - 1000 * 60),
    ipAddress: '192.168.1.100',
    location: { country: 'United States', city: 'Boston' },
    device: { type: 'desktop', os: 'Windows 11', browser: 'Chrome 120' },
    status: 'active',
    mfaVerified: true,
  },
  {
    id: 'sess-002',
    userId: 'user-002',
    userName: 'Dr. Michael Park',
    userRole: 'Medical Writer',
    userEmail: 'michael.park@example.com',
    loginTime: new Date(Date.now() - 1000 * 60 * 120),
    lastActivity: new Date(Date.now() - 1000 * 60 * 15),
    ipAddress: '192.168.1.105',
    location: { country: 'United States', city: 'San Francisco' },
    device: { type: 'desktop', os: 'macOS 14', browser: 'Safari 17' },
    status: 'idle',
    mfaVerified: true,
  },
  {
    id: 'sess-003',
    userId: 'user-003',
    userName: 'Admin User',
    userRole: 'Administrator',
    userEmail: 'admin@example.com',
    loginTime: new Date(Date.now() - 1000 * 60 * 30),
    lastActivity: new Date(Date.now() - 1000 * 60 * 5),
    ipAddress: '192.168.1.101',
    location: { country: 'United States', city: 'New York' },
    device: { type: 'desktop', os: 'Windows 11', browser: 'Edge 120' },
    status: 'active',
    mfaVerified: true,
  },
  {
    id: 'sess-004',
    userId: 'user-005',
    userName: 'Emily Rodriguez',
    userRole: 'Regulatory Specialist',
    userEmail: 'emily.r@example.com',
    loginTime: new Date(Date.now() - 1000 * 60 * 60),
    lastActivity: new Date(Date.now() - 1000 * 60 * 35),
    ipAddress: '192.168.1.110',
    location: { country: 'United States', city: 'Chicago' },
    device: { type: 'mobile', os: 'iOS 17', browser: 'Safari Mobile' },
    status: 'idle',
    mfaVerified: true,
  },
];

const MOCK_METRICS: SystemMetric[] = [
  {
    id: 'metric-001',
    name: 'Active Users',
    value: 47,
    unit: 'users',
    status: 'healthy',
    trend: 'up',
    lastUpdated: new Date(),
  },
  {
    id: 'metric-002',
    name: 'API Response Time',
    value: 145,
    unit: 'ms',
    status: 'healthy',
    trend: 'stable',
    lastUpdated: new Date(),
  },
  {
    id: 'metric-003',
    name: 'Error Rate',
    value: 0.02,
    unit: '%',
    status: 'healthy',
    trend: 'down',
    lastUpdated: new Date(),
  },
  {
    id: 'metric-004',
    name: 'Active Sessions',
    value: 52,
    unit: 'sessions',
    status: 'healthy',
    trend: 'up',
    lastUpdated: new Date(),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  events: ActivityEvent[];
  isLive: boolean;
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ events, isLive }) => {
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const getStatusIcon = (status: ActivityEvent['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failure':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Activity className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Activity Feed
                {isLive && (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-normal">
                    <Circle className="h-2 w-2 fill-green-500 animate-pulse" />
                    Live
                  </span>
                )}
              </CardTitle>
              <CardDescription>Real-time system activity</CardDescription>
            </div>
          </div>
          <Badge variant="outline">{events.length} events</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <div className="space-y-3">
            {events.map(event => {
              const TypeIcon = TYPE_CONFIG[event.type].icon;
              const CategoryIcon = CATEGORY_ICONS[event.category];

              return (
                <div
                  key={event.id}
                  className={`p-4 rounded-lg border transition-colors hover:bg-gray-50 ${
                    event.severity === 'critical'
                      ? 'border-red-200 bg-red-50'
                      : event.severity === 'error'
                        ? 'border-red-100 bg-red-50/50'
                        : event.severity === 'warning'
                          ? 'border-amber-100 bg-amber-50/50'
                          : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="p-2 rounded-lg"
                      style={{ backgroundColor: `${TYPE_CONFIG[event.type].color}15` }}
                    >
                      <TypeIcon
                        className="h-4 w-4"
                        style={{ color: TYPE_CONFIG[event.type].color }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{event.action}</span>
                          {getStatusIcon(event.status)}
                        </div>
                        <span className="text-xs text-gray-500">{formatTime(event.timestamp)}</span>
                      </div>

                      <p className="text-sm text-gray-600 mb-2">{event.details}</p>

                      <div className="flex items-center flex-wrap gap-2 text-xs">
                        {event.userName && (
                          <Badge variant="outline" className="gap-1">
                            <User className="h-3 w-3" />
                            {event.userName}
                          </Badge>
                        )}
                        {event.resource && (
                          <Badge variant="outline" className="gap-1">
                            <FileText className="h-3 w-3" />
                            {event.resource}
                          </Badge>
                        )}
                        <Badge variant="outline" className="gap-1">
                          <Globe className="h-3 w-3" />
                          {event.ipAddress}
                        </Badge>
                        {event.location && (
                          <Badge variant="outline" className="gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.location.city}, {event.location.country}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

interface ActiveSessionsProps {
  sessions: ActiveSession[];
  onTerminate: (sessionId: string) => void;
}

const ActiveSessions: React.FC<ActiveSessionsProps> = ({ sessions, onTerminate }) => {
  const getDeviceIcon = (type: ActiveSession['device']['type']) => {
    switch (type) {
      case 'desktop':
        return <Laptop className="h-4 w-4" />;
      case 'mobile':
        return <Smartphone className="h-4 w-4" />;
      case 'tablet':
        return <Laptop className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: ActiveSession['status']) => {
    switch (status) {
      case 'active':
        return 'text-green-500';
      case 'idle':
        return 'text-amber-500';
      case 'locked':
        return 'text-red-500';
    }
  };

  const formatDuration = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>Currently logged in users</CardDescription>
            </div>
          </div>
          <Badge variant="secondary">{sessions.length} active</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map(session => (
              <TableRow key={session.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{session.userName}</p>
                    <p className="text-xs text-gray-500">{session.userRole}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getDeviceIcon(session.device.type)}
                    <div>
                      <p className="text-sm">{session.device.browser}</p>
                      <p className="text-xs text-gray-500">{session.device.os}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-gray-400" />
                    <span className="text-sm">
                      {session.location?.city}, {session.location?.country}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{formatDuration(session.loginTime)}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Circle className={`h-2 w-2 fill-current ${getStatusColor(session.status)}`} />
                    <span className="text-sm capitalize">{session.status}</span>
                    {session.mfaVerified && (
                      <Shield className="h-3 w-3 text-blue-500" title="MFA Verified" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => onTerminate(session.id)}
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

interface SystemMetricsProps {
  metrics: SystemMetric[];
}

const SystemMetricsPanel: React.FC<SystemMetricsProps> = ({ metrics }) => {
  const getStatusColor = (status: SystemMetric['status']) => {
    switch (status) {
      case 'healthy':
        return '#059669';
      case 'warning':
        return '#d97706';
      case 'critical':
        return '#dc2626';
    }
  };

  const getTrendIcon = (trend: SystemMetric['trend']) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-3 w-3" />;
      case 'down':
        return <TrendingUp className="h-3 w-3 rotate-180" />;
      case 'stable':
        return <Activity className="h-3 w-3" />;
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map(metric => (
        <Card key={metric.id}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <Circle
                className="h-3 w-3 fill-current"
                style={{ color: getStatusColor(metric.status) }}
              />
              <div
                className="flex items-center gap-1 text-xs"
                style={{ color: getStatusColor(metric.status) }}
              >
                {getTrendIcon(metric.trend)}
              </div>
            </div>
            <p className="text-2xl font-bold">
              {metric.value}
              <span className="text-sm text-gray-500 font-normal ml-1">{metric.unit}</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">{metric.name}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

interface SecurityAlertsProps {
  events: ActivityEvent[];
}

const SecurityAlerts: React.FC<SecurityAlertsProps> = ({ events }) => {
  const securityEvents = events.filter(
    e => e.type === 'security' || e.severity === 'critical' || e.severity === 'error'
  );

  if (securityEvents.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-green-500" />
          <p className="font-medium text-green-700">No Security Alerts</p>
          <p className="text-sm text-gray-500">All systems operating normally</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <ShieldAlert className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <CardTitle>Security Alerts</CardTitle>
            <CardDescription>Events requiring attention</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {securityEvents.map(event => (
            <Alert
              key={event.id}
              variant={event.severity === 'critical' ? 'destructive' : 'default'}
              className={
                event.severity === 'critical'
                  ? ''
                  : event.severity === 'error'
                    ? 'border-red-200'
                    : 'border-amber-200'
              }
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{event.action}</AlertTitle>
              <AlertDescription>
                <p>{event.details}</p>
                <p className="text-xs mt-1">
                  IP: {event.ipAddress} | {event.timestamp.toLocaleString()}
                </p>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const ActivityMonitor: React.FC = () => {
  const [events, setEvents] = useState<ActivityEvent[]>(generateMockEvents());
  const [sessions] = useState<ActiveSession[]>(MOCK_SESSIONS);
  const [metrics] = useState<SystemMetric[]>(MOCK_METRICS);
  const [isLive, setIsLive] = useState(true);
  const [activeTab, setActiveTab] = useState('feed');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<ActivitySeverity | 'all'>('all');

  // Simulate live events
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      // Add a new simulated event occasionally
      if (Math.random() > 0.7) {
        const newEvent: ActivityEvent = {
          id: `evt-${Date.now()}`,
          timestamp: new Date(),
          type: 'system',
          category: 'view',
          severity: 'info',
          action: 'Page viewed',
          details: 'Dashboard accessed',
          metadata: {},
          ipAddress: '192.168.1.100',
          requestId: `req-${Date.now()}`,
          status: 'success',
        };
        setEvents(prev => [newEvent, ...prev].slice(0, 100));
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isLive]);

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const matchesSearch =
        e.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.userName?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || e.type === typeFilter;
      const matchesSeverity = severityFilter === 'all' || e.severity === severityFilter;
      return matchesSearch && matchesType && matchesSeverity;
    });
  }, [events, searchQuery, typeFilter, severityFilter]);

  const handleTerminateSession = (sessionId: string) => {
    // In production, this would call an API
    sessionLogger.audit('Session termination', { sessionId });
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="h-6 w-6" />
            Activity Monitor
          </h1>
          <p className="text-gray-500">Real-time system activity and security monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={isLive ? 'default' : 'outline'} onClick={() => setIsLive(!isLive)}>
            {isLive ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Resume
              </>
            )}
          </Button>
          <Button variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* System Metrics */}
      <SystemMetricsPanel metrics={metrics} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="feed">
            <Activity className="mr-2 h-4 w-4" />
            Activity Feed
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <Users className="mr-2 h-4 w-4" />
            Active Sessions
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldAlert className="mr-2 h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="space-y-4 mt-6">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search activities..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(value: ActivityType | 'all') => setTypeFilter(value)}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={severityFilter}
              onValueChange={(value: ActivitySeverity | 'all') => setSeverityFilter(value)}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                {Object.entries(SEVERITY_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ActivityFeed events={filteredEvents} isLive={isLive} />
        </TabsContent>

        <TabsContent value="sessions" className="mt-6">
          <ActiveSessions sessions={sessions} onTerminate={handleTerminateSession} />
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <SecurityAlerts events={events} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ActivityMonitor;
