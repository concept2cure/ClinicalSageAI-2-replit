/**
 * Concept2Cure Client Portal V2 - Security Alerts Dashboard
 *
 * Real-time security monitoring and alert management:
 * - Threat detection and response
 * - Anomaly alerts
 * - Login attempt monitoring
 * - Compliance violation tracking
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11.10(e), NIST 800-53
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  AlertTriangle,
  AlertOctagon,
  AlertCircle,
  Bell,
  BellOff,
  BellRing,
  Eye,
  EyeOff,
  Check,
  CheckCircle,
  XCircle,
  X,
  Clock,
  Calendar,
  MapPin,
  Globe,
  User,
  Users,
  Lock,
  Unlock,
  Key,
  KeyRound,
  RefreshCw,
  Loader2,
  Search,
  Filter,
  Download,
  Trash2,
  Archive,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Activity,
  TrendingUp,
  TrendingDown,
  Zap,
  Info,
  Settings,
  FileText,
  Fingerprint,
  Smartphone,
  Monitor,
  Laptop,
  Network,
  Wifi,
  WifiOff,
  Bug,
  Skull,
  Ban,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type AlertStatus = 'new' | 'investigating' | 'resolved' | 'dismissed';
type AlertCategory =
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'compliance'
  | 'system'
  | 'network';

interface SecurityAlert {
  id: string;
  title: string;
  description: string;
  category: AlertCategory;
  severity: AlertSeverity;
  status: AlertStatus;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  userId?: string;
  userName?: string;
  ipAddress?: string;
  location?: string;
  deviceInfo?: string;
  affectedResource?: string;
  mitigationSteps?: string[];
  relatedAlerts?: string[];
  metadata: Record<string, string | number | boolean>;
}

interface AlertStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  new: number;
  investigating: number;
  resolved: number;
}

interface ThreatIndicator {
  type: string;
  value: string;
  confidence: number;
  source: string;
  lastSeen: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  critical: {
    label: 'Critical',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: AlertOctagon,
  },
  high: {
    label: 'High',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    icon: AlertTriangle,
  },
  medium: {
    label: 'Medium',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: AlertCircle,
  },
  low: {
    label: 'Low',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: Info,
  },
  info: {
    label: 'Info',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: Info,
  },
};

const STATUS_CONFIG: Record<AlertStatus, { label: string; color: string; bgColor: string }> = {
  new: { label: 'New', color: 'text-red-600', bgColor: 'bg-red-100' },
  investigating: { label: 'Investigating', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  resolved: { label: 'Resolved', color: 'text-green-600', bgColor: 'bg-green-100' },
  dismissed: { label: 'Dismissed', color: 'text-gray-600', bgColor: 'bg-gray-100' },
};

const CATEGORY_CONFIG: Record<
  AlertCategory,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  authentication: { label: 'Authentication', icon: Key },
  authorization: { label: 'Authorization', icon: Lock },
  data_access: { label: 'Data Access', icon: Eye },
  compliance: { label: 'Compliance', icon: Shield },
  system: { label: 'System', icon: Monitor },
  network: { label: 'Network', icon: Network },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_ALERTS: SecurityAlert[] = [
  {
    id: 'alert_001',
    title: 'Multiple Failed Login Attempts',
    description:
      'Detected 5 consecutive failed login attempts for user john.smith@pharma.com from IP 185.23.45.67 (Ukraine)',
    category: 'authentication',
    severity: 'high',
    status: 'new',
    createdAt: new Date('2025-01-25T10:30:00Z'),
    updatedAt: new Date('2025-01-25T10:30:00Z'),
    userId: 'user_001',
    userName: 'John Smith',
    ipAddress: '185.23.45.67',
    location: 'Kiev, Ukraine',
    deviceInfo: 'Chrome 120 on Windows 11',
    affectedResource: 'User Authentication',
    mitigationSteps: [
      'Account has been temporarily locked',
      'User notified via email',
      'Review IP for potential blocking',
    ],
    metadata: {
      attemptCount: 5,
      lockDurationMinutes: 30,
      isKnownMaliciousIP: false,
    },
  },
  {
    id: 'alert_002',
    title: 'Unusual Data Export Activity',
    description:
      'User exported 15 documents in the last 10 minutes, exceeding normal threshold of 5 per hour',
    category: 'data_access',
    severity: 'critical',
    status: 'investigating',
    createdAt: new Date('2025-01-25T09:45:00Z'),
    updatedAt: new Date('2025-01-25T10:00:00Z'),
    userId: 'user_002',
    userName: 'Sarah Johnson',
    ipAddress: '192.168.1.105',
    location: 'Boston, MA',
    deviceInfo: 'Firefox 122 on macOS 14',
    affectedResource: 'Document Repository',
    mitigationSteps: [
      'Review exported documents for sensitivity',
      'Contact user to verify activity',
      'Check for potential data exfiltration',
    ],
    metadata: {
      documentsExported: 15,
      normalThreshold: 5,
      containsSensitiveData: true,
    },
  },
  {
    id: 'alert_003',
    title: 'Privileged Access Without MFA',
    description:
      'Administrator access attempted without completing multi-factor authentication verification',
    category: 'authorization',
    severity: 'high',
    status: 'resolved',
    createdAt: new Date('2025-01-25T08:20:00Z'),
    updatedAt: new Date('2025-01-25T08:35:00Z'),
    resolvedAt: new Date('2025-01-25T08:35:00Z'),
    userId: 'user_003',
    userName: 'Mike Chen',
    ipAddress: '10.0.0.42',
    location: 'New York, NY',
    deviceInfo: 'Edge 120 on Windows 11',
    affectedResource: 'Admin Panel',
    mitigationSteps: [
      'Access attempt blocked',
      'User re-authenticated with MFA',
      'Session established securely',
    ],
    metadata: {
      adminRole: 'System Administrator',
      wasBlocked: true,
      mfaCompleted: true,
    },
  },
  {
    id: 'alert_004',
    title: 'Electronic Signature Bypass Attempt',
    description:
      'Detected attempt to submit regulatory document without proper electronic signature verification',
    category: 'compliance',
    severity: 'critical',
    status: 'new',
    createdAt: new Date('2025-01-25T10:15:00Z'),
    updatedAt: new Date('2025-01-25T10:15:00Z'),
    userId: 'user_004',
    userName: 'Lisa Park',
    ipAddress: '172.16.0.55',
    location: 'San Francisco, CA',
    affectedResource: 'IND Submission: IND-2025-001',
    mitigationSteps: [
      'Submission blocked pending signature',
      'User notified of requirement',
      'Audit trail entry created',
    ],
    metadata: {
      documentType: 'IND Application',
      signatureRequired: true,
      complianceRule: 'FDA 21 CFR Part 11.50',
    },
  },
  {
    id: 'alert_005',
    title: 'New Device Login',
    description: 'User logged in from a previously unrecognized device/location combination',
    category: 'authentication',
    severity: 'low',
    status: 'dismissed',
    createdAt: new Date('2025-01-24T16:30:00Z'),
    updatedAt: new Date('2025-01-24T16:45:00Z'),
    userId: 'user_005',
    userName: 'Alex Rivera',
    ipAddress: '203.45.67.89',
    location: 'Los Angeles, CA',
    deviceInfo: 'Safari 17 on iPhone 15',
    affectedResource: 'User Authentication',
    metadata: {
      deviceType: 'Mobile',
      mfaVerified: true,
      userConfirmed: true,
    },
  },
  {
    id: 'alert_006',
    title: 'Password Policy Violation',
    description: 'User attempted to reuse a previous password during password change',
    category: 'compliance',
    severity: 'medium',
    status: 'resolved',
    createdAt: new Date('2025-01-24T11:20:00Z'),
    updatedAt: new Date('2025-01-24T11:25:00Z'),
    resolvedAt: new Date('2025-01-24T11:25:00Z'),
    userId: 'user_006',
    userName: 'Emma Wilson',
    ipAddress: '192.168.1.110',
    location: 'Boston, MA',
    affectedResource: 'Password Management',
    metadata: {
      passwordHistoryViolation: true,
      requiredHistoryDepth: 12,
      actualAttemptDepth: 8,
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ALERT CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const AlertCard: React.FC<{
  alert: SecurityAlert;
  onViewDetails: (alert: SecurityAlert) => void;
  onUpdateStatus: (alertId: string, status: AlertStatus) => void;
  isUpdating: boolean;
}> = ({ alert, onViewDetails, onUpdateStatus, isUpdating }) => {
  const severityConfig = SEVERITY_CONFIG[alert.severity];
  const statusConfig = STATUS_CONFIG[alert.status];
  const categoryConfig = CATEGORY_CONFIG[alert.category];
  const SeverityIcon = severityConfig.icon;
  const CategoryIcon = categoryConfig.icon;

  const timeAgo = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <Card
      className={`transition-all ${
        alert.status === 'new' ? 'border-l-4 border-l-red-500' : ''
      } ${alert.severity === 'critical' ? 'ring-1 ring-red-200' : ''}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${severityConfig.bgColor}`}>
              <SeverityIcon className={`h-5 w-5 ${severityConfig.color}`} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">{alert.title}</h3>
                <Badge className={`${severityConfig.bgColor} ${severityConfig.color} border-0`}>
                  {severityConfig.label}
                </Badge>
                <Badge className={`${statusConfig.bgColor} ${statusConfig.color} border-0`}>
                  {statusConfig.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{alert.description}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                <span className="flex items-center gap-1">
                  <CategoryIcon className="h-3 w-3" />
                  {categoryConfig.label}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeAgo(alert.createdAt)}
                </span>
                {alert.userName && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {alert.userName}
                  </span>
                )}
                {alert.ipAddress && (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {alert.ipAddress}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onViewDetails(alert)}>
              <Eye className="h-4 w-4 mr-1" />
              Details
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={isUpdating}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {alert.status === 'new' && (
                  <DropdownMenuItem onClick={() => onUpdateStatus(alert.id, 'investigating')}>
                    <Activity className="mr-2 h-4 w-4" />
                    Mark Investigating
                  </DropdownMenuItem>
                )}
                {(alert.status === 'new' || alert.status === 'investigating') && (
                  <>
                    <DropdownMenuItem onClick={() => onUpdateStatus(alert.id, 'resolved')}>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Mark Resolved
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onUpdateStatus(alert.id, 'dismissed')}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Dismiss
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STATS CARDS COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const StatsCards: React.FC<{ stats: AlertStats }> = ({ stats }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    <Card className="border-l-4 border-l-red-500">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Critical</p>
            <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
          </div>
          <AlertOctagon className="h-8 w-8 text-red-200" />
        </div>
      </CardContent>
    </Card>
    <Card className="border-l-4 border-l-orange-500">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">High</p>
            <p className="text-2xl font-bold text-orange-600">{stats.high}</p>
          </div>
          <AlertTriangle className="h-8 w-8 text-orange-200" />
        </div>
      </CardContent>
    </Card>
    <Card className="border-l-4 border-l-blue-500">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">New Alerts</p>
            <p className="text-2xl font-bold text-blue-600">{stats.new}</p>
          </div>
          <BellRing className="h-8 w-8 text-blue-200" />
        </div>
      </CardContent>
    </Card>
    <Card className="border-l-4 border-l-green-500">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Resolved Today</p>
            <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
          </div>
          <ShieldCheck className="h-8 w-8 text-green-200" />
        </div>
      </CardContent>
    </Card>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// ALERT DETAILS DIALOG
// ─────────────────────────────────────────────────────────────────────────────

const AlertDetailsDialog: React.FC<{
  alert: SecurityAlert | null;
  open: boolean;
  onClose: () => void;
  onUpdateStatus: (alertId: string, status: AlertStatus) => void;
}> = ({ alert, open, onClose, onUpdateStatus }) => {
  if (!alert) return null;

  const severityConfig = SEVERITY_CONFIG[alert.severity];
  const statusConfig = STATUS_CONFIG[alert.status];
  const categoryConfig = CATEGORY_CONFIG[alert.category];
  const CategoryIcon = categoryConfig.icon;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge className={`${severityConfig.bgColor} ${severityConfig.color} border-0`}>
              {severityConfig.label}
            </Badge>
            <Badge className={`${statusConfig.bgColor} ${statusConfig.color} border-0`}>
              {statusConfig.label}
            </Badge>
          </div>
          <DialogTitle className="text-xl">{alert.title}</DialogTitle>
          <DialogDescription>{alert.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Alert Info Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">Category</p>
              <p className="flex items-center gap-2">
                <CategoryIcon className="h-4 w-4" />
                {categoryConfig.label}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Alert ID</p>
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{alert.id}</code>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Created</p>
              <p>{alert.createdAt.toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Last Updated</p>
              <p>{alert.updatedAt.toLocaleString()}</p>
            </div>
            {alert.resolvedAt && (
              <div className="space-y-1">
                <p className="text-muted-foreground">Resolved</p>
                <p>{alert.resolvedAt.toLocaleString()}</p>
              </div>
            )}
          </div>

          {/* User & Source Info */}
          {(alert.userName || alert.ipAddress) && (
            <div className="space-y-3">
              <h4 className="font-semibold">Source Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {alert.userName && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">User</p>
                    <p className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {alert.userName}
                    </p>
                  </div>
                )}
                {alert.ipAddress && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">IP Address</p>
                    <p className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      {alert.ipAddress}
                    </p>
                  </div>
                )}
                {alert.location && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Location</p>
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {alert.location}
                    </p>
                  </div>
                )}
                {alert.deviceInfo && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Device</p>
                    <p className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      {alert.deviceInfo}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Affected Resource */}
          {alert.affectedResource && (
            <div className="space-y-3">
              <h4 className="font-semibold">Affected Resource</h4>
              <p className="text-sm bg-muted px-3 py-2 rounded">{alert.affectedResource}</p>
            </div>
          )}

          {/* Mitigation Steps */}
          {alert.mitigationSteps && alert.mitigationSteps.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold">Mitigation Steps</h4>
              <ul className="space-y-2">
                {alert.mitigationSteps.map((step, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Metadata */}
          {Object.keys(alert.metadata).length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold">Additional Details</h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(alert.metadata).map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <p className="text-muted-foreground capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </p>
                    <p className="font-medium">
                      {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compliance Note */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This alert and all actions taken are logged per FDA 21 CFR Part 11.10(e) audit trail
              requirements.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2">
          {alert.status === 'new' && (
            <Button variant="outline" onClick={() => onUpdateStatus(alert.id, 'investigating')}>
              <Activity className="mr-2 h-4 w-4" />
              Start Investigation
            </Button>
          )}
          {(alert.status === 'new' || alert.status === 'investigating') && (
            <Button onClick={() => onUpdateStatus(alert.id, 'resolved')}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Mark Resolved
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION SETTINGS PANEL
// ─────────────────────────────────────────────────────────────────────────────

const NotificationSettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState({
    emailCritical: true,
    emailHigh: true,
    emailMedium: false,
    emailLow: false,
    slackEnabled: true,
    slackCritical: true,
    slackHigh: true,
    dailyDigest: true,
    weeklyReport: true,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Settings
        </CardTitle>
        <CardDescription>Configure how you receive security alerts</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email Notifications */}
        <div className="space-y-4">
          <h4 className="font-semibold">Email Notifications</h4>
          <div className="grid grid-cols-2 gap-4">
            {(['critical', 'high', 'medium', 'low'] as AlertSeverity[]).map(severity => {
              const config = SEVERITY_CONFIG[severity];
              return (
                <div
                  key={severity}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-2">
                    <Badge className={`${config.bgColor} ${config.color} border-0`}>
                      {config.label}
                    </Badge>
                  </div>
                  <Switch
                    checked={
                      settings[
                        `email${severity.charAt(0).toUpperCase() + severity.slice(1)}` as keyof typeof settings
                      ] as boolean
                    }
                    onCheckedChange={checked =>
                      setSettings(prev => ({
                        ...prev,
                        [`email${severity.charAt(0).toUpperCase() + severity.slice(1)}`]: checked,
                      }))
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Slack Integration */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Slack Integration</h4>
            <Switch
              checked={settings.slackEnabled}
              onCheckedChange={checked => setSettings(prev => ({ ...prev, slackEnabled: checked }))}
            />
          </div>
          {settings.slackEnabled && (
            <div className="pl-4 space-y-2 border-l-2">
              <div className="flex items-center justify-between p-2">
                <span className="text-sm">Critical alerts</span>
                <Switch
                  checked={settings.slackCritical}
                  onCheckedChange={checked =>
                    setSettings(prev => ({ ...prev, slackCritical: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between p-2">
                <span className="text-sm">High priority alerts</span>
                <Switch
                  checked={settings.slackHigh}
                  onCheckedChange={checked =>
                    setSettings(prev => ({ ...prev, slackHigh: checked }))
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Reports */}
        <div className="space-y-4">
          <h4 className="font-semibold">Summary Reports</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="font-medium">Daily Digest</p>
                <p className="text-sm text-muted-foreground">
                  Summary of all alerts from the previous day
                </p>
              </div>
              <Switch
                checked={settings.dailyDigest}
                onCheckedChange={checked =>
                  setSettings(prev => ({ ...prev, dailyDigest: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="font-medium">Weekly Security Report</p>
                <p className="text-sm text-muted-foreground">
                  Comprehensive security analysis and trends
                </p>
              </div>
              <Switch
                checked={settings.weeklyReport}
                onCheckedChange={checked =>
                  setSettings(prev => ({ ...prev, weeklyReport: checked }))
                }
              />
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t pt-4">
        <Button>
          <CheckCircle className="mr-2 h-4 w-4" />
          Save Settings
        </Button>
      </CardFooter>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SECURITY ALERTS DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export const SecurityAlertsDashboard: React.FC = () => {
  const [alerts, setAlerts] = useState<SecurityAlert[]>(MOCK_ALERTS);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | 'all'>('all');
  const [activeTab, setActiveTab] = useState('alerts');

  // Calculate stats
  const stats: AlertStats = useMemo(
    () => ({
      total: alerts.length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      high: alerts.filter(a => a.severity === 'high').length,
      medium: alerts.filter(a => a.severity === 'medium').length,
      low: alerts.filter(a => a.severity === 'low').length,
      new: alerts.filter(a => a.status === 'new').length,
      investigating: alerts.filter(a => a.status === 'investigating').length,
      resolved: alerts.filter(a => a.status === 'resolved').length,
    }),
    [alerts]
  );

  // Filter alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      const matchesSearch =
        searchQuery === '' ||
        alert.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        alert.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        alert.userName?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSeverity = severityFilter === 'all' || alert.severity === severityFilter;
      const matchesStatus = statusFilter === 'all' || alert.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || alert.category === categoryFilter;

      return matchesSearch && matchesSeverity && matchesStatus && matchesCategory;
    });
  }, [alerts, searchQuery, severityFilter, statusFilter, categoryFilter]);

  const handleUpdateStatus = async (alertId: string, status: AlertStatus) => {
    setUpdatingId(alertId);
    await new Promise(r => setTimeout(r, 500));
    setAlerts(prev =>
      prev.map(a =>
        a.id === alertId
          ? {
              ...a,
              status,
              updatedAt: new Date(),
              resolvedAt: status === 'resolved' ? new Date() : a.resolvedAt,
            }
          : a
      )
    );
    setUpdatingId(null);
    setSelectedAlert(null);
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setIsLoading(false);
  };

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" />
            Security Alerts
          </h1>
          <p className="text-muted-foreground">Monitor and respond to security events</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Stats */}
      <StatsCards stats={stats} />

      {/* Critical Alert Banner */}
      {stats.critical > 0 && (
        <Alert variant="destructive">
          <AlertOctagon className="h-4 w-4" />
          <AlertTitle>Critical Security Alert</AlertTitle>
          <AlertDescription>
            There {stats.critical === 1 ? 'is' : 'are'} {stats.critical} critical security{' '}
            {stats.critical === 1 ? 'alert' : 'alerts'} requiring immediate attention.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="alerts">
            Alerts
            {stats.new > 0 && (
              <Badge variant="destructive" className="ml-2">
                {stats.new}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings">Notification Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search alerts..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <Select
                  value={severityFilter}
                  onValueChange={v => setSeverityFilter(v as AlertSeverity | 'all')}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severity</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={v => setStatusFilter(v as AlertStatus | 'all')}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="investigating">Investigating</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={categoryFilter}
                  onValueChange={v => setCategoryFilter(v as AlertCategory | 'all')}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="authentication">Authentication</SelectItem>
                    <SelectItem value="authorization">Authorization</SelectItem>
                    <SelectItem value="data_access">Data Access</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="network">Network</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Alert List */}
          <div className="space-y-3">
            {filteredAlerts.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">No Alerts Found</h3>
                  <p className="text-muted-foreground">
                    {searchQuery || severityFilter !== 'all' || statusFilter !== 'all'
                      ? 'No alerts match your current filters'
                      : 'No security alerts at this time'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredAlerts.map(alert => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onViewDetails={setSelectedAlert}
                  onUpdateStatus={handleUpdateStatus}
                  isUpdating={updatingId === alert.id}
                />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <NotificationSettingsPanel />
        </TabsContent>
      </Tabs>

      {/* Alert Details Dialog */}
      <AlertDetailsDialog
        alert={selectedAlert}
        open={!!selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onUpdateStatus={handleUpdateStatus}
      />
    </div>
  );
};

export default SecurityAlertsDashboard;
