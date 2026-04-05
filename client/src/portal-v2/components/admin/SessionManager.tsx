/**
 * Concept2Cure Client Portal V2 - Session Manager
 *
 * Comprehensive session management with:
 * - Active session monitoring
 * - Concurrent session control
 * - Session timeout configuration
 * - Remote session termination
 * - Device fingerprinting
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11.10(d), NIST 800-63B
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Monitor,
  Smartphone,
  Tablet,
  Laptop,
  Globe,
  Clock,
  MapPin,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  CheckCircle,
  XCircle,
  LogOut,
  RefreshCw,
  Loader2,
  Info,
  Settings,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Fingerprint,
  Key,
  Activity,
  History,
  Trash2,
  MoreVertical,
  ChevronDown,
  ChevronUp,
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
import { Slider } from '@/components/ui/slider';
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

type DeviceType = 'desktop' | 'laptop' | 'tablet' | 'mobile' | 'unknown';
type SessionStatus = 'active' | 'idle' | 'expired' | 'terminated';

interface ActiveSession {
  id: string;
  userId: string;
  deviceType: DeviceType;
  deviceName: string;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  ipAddress: string;
  location: string;
  country: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  status: SessionStatus;
  isCurrent: boolean;
  mfaVerified: boolean;
  trustedDevice: boolean;
  fingerprint: string;
}

interface SessionSettings {
  sessionTimeoutMinutes: number;
  idleTimeoutMinutes: number;
  maxConcurrentSessions: number;
  extendOnActivity: boolean;
  terminateOnPasswordChange: boolean;
  requireMfaForNewDevices: boolean;
  allowRememberDevice: boolean;
  trustedDeviceExpirationDays: number;
}

interface SessionActivity {
  id: string;
  sessionId: string;
  action: string;
  resource: string;
  timestamp: Date;
  ipAddress: string;
  success: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DEVICE_ICONS: Record<DeviceType, React.ComponentType<{ className?: string }>> = {
  desktop: Monitor,
  laptop: Laptop,
  tablet: Tablet,
  mobile: Smartphone,
  unknown: Globe,
};

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string; bgColor: string }> = {
  active: { label: 'Active', color: 'text-stone-700', bgColor: 'bg-stone-100' },
  idle: { label: 'Idle', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  expired: { label: 'Expired', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  terminated: { label: 'Terminated', color: 'text-stone-700', bgColor: 'bg-stone-100' },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_SESSIONS: ActiveSession[] = [
  {
    id: 'sess_001',
    userId: 'user_001',
    deviceType: 'laptop',
    deviceName: 'MacBook Pro',
    browser: 'Chrome',
    browserVersion: '121.0.6167.85',
    os: 'macOS',
    osVersion: '14.2.1',
    ipAddress: '192.168.1.105',
    location: 'Boston, MA',
    country: 'United States',
    createdAt: new Date('2025-01-25T08:30:00Z'),
    lastActivityAt: new Date('2025-01-25T10:45:00Z'),
    expiresAt: new Date('2025-01-25T11:15:00Z'),
    status: 'active',
    isCurrent: true,
    mfaVerified: true,
    trustedDevice: true,
    fingerprint: 'fp_abc123',
  },
  {
    id: 'sess_002',
    userId: 'user_001',
    deviceType: 'mobile',
    deviceName: 'iPhone 15 Pro',
    browser: 'Safari',
    browserVersion: '17.2',
    os: 'iOS',
    osVersion: '17.2.1',
    ipAddress: '172.16.0.55',
    location: 'Cambridge, MA',
    country: 'United States',
    createdAt: new Date('2025-01-24T14:20:00Z'),
    lastActivityAt: new Date('2025-01-24T18:30:00Z'),
    expiresAt: new Date('2025-01-24T19:00:00Z'),
    status: 'idle',
    isCurrent: false,
    mfaVerified: true,
    trustedDevice: true,
    fingerprint: 'fp_def456',
  },
  {
    id: 'sess_003',
    userId: 'user_001',
    deviceType: 'desktop',
    deviceName: 'Windows PC',
    browser: 'Edge',
    browserVersion: '120.0.2210.91',
    os: 'Windows',
    osVersion: '11',
    ipAddress: '10.0.0.42',
    location: 'New York, NY',
    country: 'United States',
    createdAt: new Date('2025-01-23T09:15:00Z'),
    lastActivityAt: new Date('2025-01-23T17:45:00Z'),
    expiresAt: new Date('2025-01-23T18:15:00Z'),
    status: 'expired',
    isCurrent: false,
    mfaVerified: true,
    trustedDevice: false,
    fingerprint: 'fp_ghi789',
  },
];

const MOCK_SETTINGS: SessionSettings = {
  sessionTimeoutMinutes: 30,
  idleTimeoutMinutes: 15,
  maxConcurrentSessions: 5,
  extendOnActivity: true,
  terminateOnPasswordChange: true,
  requireMfaForNewDevices: true,
  allowRememberDevice: true,
  trustedDeviceExpirationDays: 30,
};

// ─────────────────────────────────────────────────────────────────────────────
// SESSION CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const SessionCard: React.FC<{
  session: ActiveSession;
  onTerminate: (sessionId: string) => void;
  onTrustDevice: (sessionId: string, trusted: boolean) => void;
  onViewActivity: (sessionId: string) => void;
  isTerminating: boolean;
}> = ({ session, onTerminate, onTrustDevice, onViewActivity, isTerminating }) => {
  const [expanded, setExpanded] = useState(false);
  const DeviceIcon = DEVICE_ICONS[session.deviceType];
  const statusConfig = STATUS_CONFIG[session.status];

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
    <Card className={session.isCurrent ? 'border-primary' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-lg ${session.isCurrent ? 'bg-primary/10' : 'bg-muted'}`}>
              <DeviceIcon
                className={`h-6 w-6 ${session.isCurrent ? 'text-primary' : 'text-muted-foreground'}`}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{session.deviceName}</p>
                {session.isCurrent && (
                  <Badge variant="default" className="text-xs">
                    Current
                  </Badge>
                )}
                {session.trustedDevice && (
                  <Badge variant="secondary" className="text-xs">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Trusted
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {session.browser} {session.browserVersion} on {session.os} {session.osVersion}
              </p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {session.location}
                </span>
                <span className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  {session.ipAddress}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className={`${statusConfig.bgColor} ${statusConfig.color} border-0`}>
              {statusConfig.label}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setExpanded(!expanded)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onViewActivity(session.id)}>
                  <History className="mr-2 h-4 w-4" />
                  View Activity
                </DropdownMenuItem>
                {!session.trustedDevice && !session.isCurrent && (
                  <DropdownMenuItem onClick={() => onTrustDevice(session.id, true)}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Trust Device
                  </DropdownMenuItem>
                )}
                {session.trustedDevice && !session.isCurrent && (
                  <DropdownMenuItem onClick={() => onTrustDevice(session.id, false)}>
                    <ShieldX className="mr-2 h-4 w-4" />
                    Untrust Device
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {!session.isCurrent && session.status === 'active' && (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onTerminate(session.id)}
                    disabled={isTerminating}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Terminate Session
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Session timing */}
        <div className="mt-4 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Started: {session.createdAt.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Activity className="h-3 w-3" />
            <span>Last activity: {timeAgo(session.lastActivityAt)}</span>
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Session ID</p>
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{session.id}</code>
              </div>
              <div>
                <p className="text-muted-foreground">Device Fingerprint</p>
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                  {session.fingerprint}
                </code>
              </div>
              <div>
                <p className="text-muted-foreground">MFA Status</p>
                <p className="flex items-center gap-1">
                  {session.mfaVerified ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-stone-700" />
                      Verified
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-stone-700" />
                      Not Verified
                    </>
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Expires At</p>
                <p>{session.expiresAt.toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}

        {/* Expand toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="mr-2 h-4 w-4" />
              Hide Details
            </>
          ) : (
            <>
              <ChevronDown className="mr-2 h-4 w-4" />
              Show Details
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SESSION SETTINGS COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const SessionSettingsPanel: React.FC<{
  settings: SessionSettings;
  onSave: (settings: SessionSettings) => void;
  isLoading: boolean;
}> = ({ settings, onSave, isLoading }) => {
  const [formData, setFormData] = useState(settings);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setHasChanges(JSON.stringify(formData) !== JSON.stringify(settings));
  }, [formData, settings]);

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Session Settings
        </CardTitle>
        <CardDescription>
          Configure session timeout and security policies per FDA 21 CFR Part 11.10(d)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Session Timeout */}
        <div className="space-y-4">
          <div>
            <Label>Session Timeout (minutes)</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Maximum duration before requiring re-authentication
            </p>
            <div className="flex items-center gap-4">
              <Slider
                value={[formData.sessionTimeoutMinutes]}
                onValueChange={([value]) =>
                  setFormData(prev => ({ ...prev, sessionTimeoutMinutes: value }))
                }
                min={5}
                max={120}
                step={5}
                className="flex-1"
              />
              <span className="w-16 text-right font-mono">{formData.sessionTimeoutMinutes}m</span>
            </div>
          </div>

          <div>
            <Label>Idle Timeout (minutes)</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Time of inactivity before session is marked idle
            </p>
            <div className="flex items-center gap-4">
              <Slider
                value={[formData.idleTimeoutMinutes]}
                onValueChange={([value]) =>
                  setFormData(prev => ({ ...prev, idleTimeoutMinutes: value }))
                }
                min={5}
                max={60}
                step={5}
                className="flex-1"
              />
              <span className="w-16 text-right font-mono">{formData.idleTimeoutMinutes}m</span>
            </div>
          </div>
        </div>

        {/* Concurrent Sessions */}
        <div className="space-y-3">
          <Label>Maximum Concurrent Sessions</Label>
          <Select
            value={formData.maxConcurrentSessions.toString()}
            onValueChange={value =>
              setFormData(prev => ({ ...prev, maxConcurrentSessions: parseInt(value) }))
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="-1">Unlimited</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Number of devices that can be logged in simultaneously
          </p>
        </div>

        {/* Toggles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div>
              <p className="font-medium">Extend on Activity</p>
              <p className="text-sm text-muted-foreground">
                Reset timeout when user performs actions
              </p>
            </div>
            <Switch
              checked={formData.extendOnActivity}
              onCheckedChange={checked =>
                setFormData(prev => ({ ...prev, extendOnActivity: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div>
              <p className="font-medium">Terminate on Password Change</p>
              <p className="text-sm text-muted-foreground">
                End all sessions when password is changed
              </p>
            </div>
            <Switch
              checked={formData.terminateOnPasswordChange}
              onCheckedChange={checked =>
                setFormData(prev => ({ ...prev, terminateOnPasswordChange: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div>
              <p className="font-medium">Require MFA for New Devices</p>
              <p className="text-sm text-muted-foreground">
                Verify identity when logging in from unrecognized devices
              </p>
            </div>
            <Switch
              checked={formData.requireMfaForNewDevices}
              onCheckedChange={checked =>
                setFormData(prev => ({ ...prev, requireMfaForNewDevices: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div>
              <p className="font-medium">Allow "Remember This Device"</p>
              <p className="text-sm text-muted-foreground">Let users skip MFA on trusted devices</p>
            </div>
            <Switch
              checked={formData.allowRememberDevice}
              onCheckedChange={checked =>
                setFormData(prev => ({ ...prev, allowRememberDevice: checked }))
              }
            />
          </div>
        </div>

        {/* Trusted Device Expiration */}
        {formData.allowRememberDevice && (
          <div className="space-y-3">
            <Label>Trusted Device Expiration (days)</Label>
            <Select
              value={formData.trustedDeviceExpirationDays.toString()}
              onValueChange={value =>
                setFormData(prev => ({ ...prev, trustedDeviceExpirationDays: parseInt(value) }))
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              How long a device remains trusted before requiring re-verification
            </p>
          </div>
        )}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Per FDA 21 CFR Part 11.10(d), session timeout should be configured to prevent
            unauthorized access when terminals are left unattended. Recommended maximum is 30
            minutes.
          </AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter className="border-t pt-4">
        <Button onClick={handleSave} disabled={!hasChanges || isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="mr-2 h-4 w-4" />
          )}
          Save Settings
        </Button>
      </CardFooter>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SESSION ACTIVITY DIALOG
// ─────────────────────────────────────────────────────────────────────────────

const SessionActivityDialog: React.FC<{
  open: boolean;
  sessionId: string | null;
  onClose: () => void;
}> = ({ open, sessionId, onClose }) => {
  const [activities, setActivities] = useState<SessionActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && sessionId) {
      setIsLoading(true);
      // Mock API call
      setTimeout(() => {
        setActivities([
          {
            id: 'act_001',
            sessionId,
            action: 'login',
            resource: 'Authentication',
            timestamp: new Date('2025-01-25T08:30:00Z'),
            ipAddress: '192.168.1.105',
            success: true,
          },
          {
            id: 'act_002',
            sessionId,
            action: 'view',
            resource: 'Document: Protocol v2.1',
            timestamp: new Date('2025-01-25T09:15:00Z'),
            ipAddress: '192.168.1.105',
            success: true,
          },
          {
            id: 'act_003',
            sessionId,
            action: 'edit',
            resource: 'Submission: IND-2025-001',
            timestamp: new Date('2025-01-25T09:45:00Z'),
            ipAddress: '192.168.1.105',
            success: true,
          },
          {
            id: 'act_004',
            sessionId,
            action: 'export',
            resource: 'Report: Compliance Summary',
            timestamp: new Date('2025-01-25T10:30:00Z'),
            ipAddress: '192.168.1.105',
            success: true,
          },
        ]);
        setIsLoading(false);
      }, 500);
    }
  }, [open, sessionId]);

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Session Activity
          </DialogTitle>
          <DialogDescription>Recent activity log for this session</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {activities.map(activity => (
              <div
                key={activity.id}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${activity.success ? 'bg-stone-900' : 'bg-stone-900'}`}
                  />
                  <div>
                    <p className="font-medium capitalize">{activity.action}</p>
                    <p className="text-sm text-muted-foreground">{activity.resource}</p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p>{activity.timestamp.toLocaleTimeString()}</p>
                  <p className="text-muted-foreground">{activity.ipAddress}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SESSION MANAGER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const SessionManager: React.FC = () => {
  const [sessions, setSessions] = useState<ActiveSession[]>(MOCK_SESSIONS);
  const [settings, setSettings] = useState<SessionSettings>(MOCK_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [viewingActivityId, setViewingActivityId] = useState<string | null>(null);
  const [showTerminateAll, setShowTerminateAll] = useState(false);

  const activeSessions = sessions.filter(s => s.status === 'active' || s.status === 'idle');
  const currentSession = sessions.find(s => s.isCurrent);

  const handleTerminate = async (sessionId: string) => {
    setTerminatingId(sessionId);
    // Mock API call
    await new Promise(r => setTimeout(r, 800));
    setSessions(prev =>
      prev.map(s => (s.id === sessionId ? { ...s, status: 'terminated' as SessionStatus } : s))
    );
    setTerminatingId(null);
  };

  const handleTerminateAll = async () => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setSessions(prev =>
      prev.map(s => (s.isCurrent ? s : { ...s, status: 'terminated' as SessionStatus }))
    );
    setIsLoading(false);
    setShowTerminateAll(false);
  };

  const handleTrustDevice = async (sessionId: string, trusted: boolean) => {
    setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, trustedDevice: trusted } : s)));
  };

  const handleSaveSettings = async (newSettings: SessionSettings) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setSettings(newSettings);
    setIsLoading(false);
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 500));
    setIsLoading(false);
  };

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Session Management</h1>
          <p className="text-muted-foreground">Monitor and manage your active sessions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {activeSessions.length > 1 && (
            <Button variant="destructive" onClick={() => setShowTerminateAll(true)}>
              <LogOut className="mr-2 h-4 w-4" />
              Terminate All Others
            </Button>
          )}
        </div>
      </div>

      {/* Session Count Alert */}
      {activeSessions.length >= settings.maxConcurrentSessions &&
        settings.maxConcurrentSessions > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Session Limit Reached</AlertTitle>
            <AlertDescription>
              You have {activeSessions.length} active sessions, which is the maximum allowed.
              Terminate an existing session to log in from another device.
            </AlertDescription>
          </Alert>
        )}

      {/* Current Session Highlight */}
      {currentSession && (
        <Card className="border-primary bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Current Session
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  {React.createElement(DEVICE_ICONS[currentSession.deviceType], {
                    className: 'h-6 w-6 text-primary',
                  })}
                </div>
                <div>
                  <p className="font-medium">{currentSession.deviceName}</p>
                  <p className="text-sm text-muted-foreground">
                    {currentSession.browser} on {currentSession.os}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {currentSession.location} • {currentSession.ipAddress}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Session expires in</p>
                <p className="font-medium">
                  {Math.max(
                    0,
                    Math.round((currentSession.expiresAt.getTime() - Date.now()) / 60000)
                  )}{' '}
                  minutes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Sessions List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">All Sessions ({activeSessions.length} active)</h2>
        </div>

        {sessions.map(session => (
          <SessionCard
            key={session.id}
            session={session}
            onTerminate={handleTerminate}
            onTrustDevice={handleTrustDevice}
            onViewActivity={setViewingActivityId}
            isTerminating={terminatingId === session.id}
          />
        ))}
      </div>

      {/* Session Settings */}
      <SessionSettingsPanel settings={settings} onSave={handleSaveSettings} isLoading={isLoading} />

      {/* Activity Dialog */}
      <SessionActivityDialog
        open={!!viewingActivityId}
        sessionId={viewingActivityId}
        onClose={() => setViewingActivityId(null)}
      />

      {/* Terminate All Confirmation */}
      <Dialog open={showTerminateAll} onOpenChange={setShowTerminateAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Terminate All Other Sessions
            </DialogTitle>
            <DialogDescription>
              This will immediately end all sessions except your current one. Users on those
              sessions will be logged out.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This action will be logged in the audit trail per FDA 21 CFR Part 11.10(e).
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTerminateAll(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleTerminateAll} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Terminate All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SessionManager;
