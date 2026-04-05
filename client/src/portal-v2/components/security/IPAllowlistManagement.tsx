/**
 * IP Allowlist Management Component
 *
 * Network-level access control management with:
 * - IP address whitelisting
 * - CIDR range support
 * - Geographic restrictions
 * - Temporary access grants
 *
 * @version 1.0.0
 * @compliance FDA 21 CFR Part 11.10(d), SOC 2 Type II
 */

import React, { useState, useMemo } from 'react';
import { securityLogger } from '../../utils/logger';
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
import { Label } from '@/components/ui/label';
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
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Globe,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Edit,
  Search,
  Filter,
  RefreshCw,
  Download,
  Upload,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  MapPin,
  Server,
  Network,
  Wifi,
  WifiOff,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  MoreVertical,
  Info,
  Settings,
  History,
  Zap,
  Ban,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface IPAllowlistEntry {
  id: string;
  ipAddress: string;
  cidrRange?: string;
  type: IPEntryType;
  label: string;
  description?: string;
  status: IPEntryStatus;
  environment: Environment[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  lastUsed?: Date;
  usageCount: number;
  tags: string[];
  metadata: Record<string, unknown>;
}

type IPEntryType = 'single' | 'range' | 'cidr' | 'country' | 'vpn';
type IPEntryStatus = 'active' | 'inactive' | 'expired' | 'pending_approval';
type Environment = 'production' | 'staging' | 'development' | 'all';

interface GeoRestriction {
  id: string;
  type: 'allow' | 'block';
  countries: string[];
  regions?: string[];
  enabled: boolean;
  description?: string;
}

interface BlockedIP {
  id: string;
  ipAddress: string;
  reason: string;
  blockedAt: Date;
  blockedBy: string;
  expiresAt?: Date;
  attemptCount: number;
  lastAttempt: Date;
  autoBlocked: boolean;
}

interface AccessLog {
  id: string;
  timestamp: Date;
  ipAddress: string;
  action: 'allowed' | 'blocked' | 'challenged';
  reason: string;
  userId?: string;
  userName?: string;
  country?: string;
  city?: string;
  userAgent?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<IPEntryStatus, { label: string; color: string; bgColor: string }> = {
  active: { label: 'Active', color: '#647746', bgColor: '#e4ebd8' },
  inactive: { label: 'Inactive', color: '#8a8880', bgColor: '#f4f3ee' },
  expired: { label: 'Expired', color: '#dc2626', bgColor: '#fee2e2' },
  pending_approval: { label: 'Pending', color: '#d97706', bgColor: '#fef3c7' },
};

const ENVIRONMENT_CONFIG: Record<Environment, { label: string; color: string }> = {
  production: { label: 'Production', color: '#dc2626' },
  staging: { label: 'Staging', color: '#d97706' },
  development: { label: 'Development', color: '#5585b3' },
  all: { label: 'All Environments', color: '#8a8880' },
};

const TYPE_CONFIG: Record<IPEntryType, { label: string; description: string }> = {
  single: { label: 'Single IP', description: 'A single IPv4 or IPv6 address' },
  range: {
    label: 'IP Range',
    description: 'A range of IP addresses (e.g., 192.168.1.1-192.168.1.255)',
  },
  cidr: { label: 'CIDR Block', description: 'A CIDR notation subnet (e.g., 192.168.1.0/24)' },
  country: { label: 'Country', description: 'All IP addresses from a specific country' },
  vpn: { label: 'VPN/Corporate', description: 'Corporate VPN or known good exit nodes' },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_ALLOWLIST: IPAllowlistEntry[] = [
  {
    id: 'ip-001',
    ipAddress: '192.168.1.0/24',
    cidrRange: '/24',
    type: 'cidr',
    label: 'Corporate Office Network',
    description: 'Main headquarters network range',
    status: 'active',
    environment: ['production', 'staging'],
    createdBy: 'Admin User',
    createdAt: new Date('2025-06-15'),
    updatedAt: new Date('2026-01-10'),
    lastUsed: new Date('2026-01-25'),
    usageCount: 15420,
    tags: ['corporate', 'trusted'],
    metadata: { location: 'Boston HQ' },
  },
  {
    id: 'ip-002',
    ipAddress: '10.0.0.0/8',
    cidrRange: '/8',
    type: 'cidr',
    label: 'Internal VPN Range',
    description: 'Corporate VPN client IP range',
    status: 'active',
    environment: ['all'],
    createdBy: 'IT Admin',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-12-01'),
    lastUsed: new Date('2026-01-25'),
    usageCount: 89542,
    tags: ['vpn', 'internal'],
    metadata: { provider: 'Cisco AnyConnect' },
  },
  {
    id: 'ip-003',
    ipAddress: '203.0.113.50',
    type: 'single',
    label: 'Remote Developer - John',
    description: 'Home office IP for developer access',
    status: 'active',
    environment: ['development', 'staging'],
    createdBy: 'IT Admin',
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    expiresAt: new Date('2026-03-15'),
    lastUsed: new Date('2026-01-24'),
    usageCount: 342,
    tags: ['remote', 'temporary'],
    metadata: { employee: 'John Smith', department: 'Engineering' },
  },
  {
    id: 'ip-004',
    ipAddress: '198.51.100.0/24',
    cidrRange: '/24',
    type: 'cidr',
    label: 'Partner Network - CRO',
    description: 'Authorized CRO partner network range',
    status: 'active',
    environment: ['production'],
    createdBy: 'Security Team',
    createdAt: new Date('2025-09-01'),
    updatedAt: new Date('2025-12-15'),
    lastUsed: new Date('2026-01-23'),
    usageCount: 2156,
    tags: ['partner', 'cro'],
    metadata: { partner: 'Clinical Research Partners Inc.' },
  },
  {
    id: 'ip-005',
    ipAddress: '172.16.0.0/12',
    cidrRange: '/12',
    type: 'cidr',
    label: 'AWS Infrastructure',
    description: 'AWS VPC internal network range',
    status: 'active',
    environment: ['all'],
    createdBy: 'DevOps',
    createdAt: new Date('2024-06-01'),
    updatedAt: new Date('2025-11-01'),
    usageCount: 458721,
    tags: ['infrastructure', 'aws'],
    metadata: { provider: 'AWS', region: 'us-east-1' },
  },
];

const MOCK_BLOCKED: BlockedIP[] = [
  {
    id: 'block-001',
    ipAddress: '185.234.219.45',
    reason: 'Multiple failed authentication attempts',
    blockedAt: new Date('2026-01-24'),
    blockedBy: 'System',
    expiresAt: new Date('2026-01-25'),
    attemptCount: 15,
    lastAttempt: new Date('2026-01-24'),
    autoBlocked: true,
  },
  {
    id: 'block-002',
    ipAddress: '45.227.255.206',
    reason: 'Known malicious IP from threat intelligence',
    blockedAt: new Date('2026-01-20'),
    blockedBy: 'Security Team',
    attemptCount: 0,
    lastAttempt: new Date('2026-01-20'),
    autoBlocked: false,
  },
  {
    id: 'block-003',
    ipAddress: '91.219.28.0/24',
    reason: 'Suspected bot network range',
    blockedAt: new Date('2026-01-15'),
    blockedBy: 'System',
    attemptCount: 847,
    lastAttempt: new Date('2026-01-23'),
    autoBlocked: true,
  },
];

const MOCK_GEO_RESTRICTIONS: GeoRestriction[] = [
  {
    id: 'geo-001',
    type: 'allow',
    countries: ['US', 'CA', 'GB', 'DE', 'FR', 'JP', 'AU'],
    enabled: true,
    description: 'Allow access only from approved countries',
  },
  {
    id: 'geo-002',
    type: 'block',
    countries: ['KP', 'IR', 'SY', 'CU'],
    enabled: true,
    description: 'Block access from sanctioned countries (OFAC compliance)',
  },
];

const MOCK_ACCESS_LOGS: AccessLog[] = [
  {
    id: 'log-001',
    timestamp: new Date(Date.now() - 60000),
    ipAddress: '192.168.1.105',
    action: 'allowed',
    reason: 'IP in corporate allowlist',
    userId: 'user-001',
    userName: 'Dr. Sarah Chen',
    country: 'United States',
    city: 'Boston',
  },
  {
    id: 'log-002',
    timestamp: new Date(Date.now() - 120000),
    ipAddress: '185.234.219.45',
    action: 'blocked',
    reason: 'IP on blocklist',
    country: 'Unknown',
  },
  {
    id: 'log-003',
    timestamp: new Date(Date.now() - 180000),
    ipAddress: '203.0.113.50',
    action: 'allowed',
    reason: 'Temporary access grant',
    userId: 'user-010',
    userName: 'John Smith',
    country: 'United States',
    city: 'Seattle',
  },
  {
    id: 'log-004',
    timestamp: new Date(Date.now() - 300000),
    ipAddress: '45.33.32.156',
    action: 'challenged',
    reason: 'Unknown IP - MFA required',
    userId: 'user-005',
    userName: 'Emily Rodriguez',
    country: 'United States',
    city: 'San Francisco',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

interface AllowlistStatsProps {
  entries: IPAllowlistEntry[];
  blocked: BlockedIP[];
}

const AllowlistStats: React.FC<AllowlistStatsProps> = ({ entries, blocked }) => {
  const stats = useMemo(() => {
    const active = entries.filter(e => e.status === 'active').length;
    const expiringSoon = entries.filter(e => {
      if (!e.expiresAt) return false;
      const daysUntil = Math.ceil((e.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return daysUntil <= 7 && daysUntil > 0;
    }).length;
    const totalBlocked = blocked.length;
    const autoBlocked = blocked.filter(b => b.autoBlocked).length;

    return { active, expiringSoon, totalBlocked, autoBlocked };
  }, [entries, blocked]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-500">Active Entries</p>
              <p className="text-2xl font-bold text-stone-700">{stats.active}</p>
            </div>
            <div className="p-3 bg-stone-100 rounded-lg">
              <ShieldCheck className="h-6 w-6 text-stone-700" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-500">Expiring Soon</p>
              <p className="text-2xl font-bold text-stone-600">{stats.expiringSoon}</p>
            </div>
            <div className="p-3 bg-stone-100 rounded-lg">
              <Clock className="h-6 w-6 text-stone-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-500">Blocked IPs</p>
              <p className="text-2xl font-bold text-stone-700">{stats.totalBlocked}</p>
            </div>
            <div className="p-3 bg-stone-100 rounded-lg">
              <Ban className="h-6 w-6 text-stone-700" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-500">Auto-Blocked</p>
              <p className="text-2xl font-bold text-stone-600">{stats.autoBlocked}</p>
            </div>
            <div className="p-3 bg-stone-100 rounded-lg">
              <Zap className="h-6 w-6 text-stone-600" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

interface AddIPModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (entry: Partial<IPAllowlistEntry>) => void;
}

const AddIPModal: React.FC<AddIPModalProps> = ({ open, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    ipAddress: '',
    type: 'single' as IPEntryType,
    label: '',
    description: '',
    environment: ['production'] as Environment[],
    hasExpiry: false,
    expiresAt: '',
    tags: '',
  });

  const handleSubmit = () => {
    onSubmit({
      ipAddress: formData.ipAddress,
      type: formData.type,
      label: formData.label,
      description: formData.description,
      environment: formData.environment,
      expiresAt: formData.hasExpiry ? new Date(formData.expiresAt) : undefined,
      tags: formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    });
    onClose();
  };

  const validateIP = (ip: string): boolean => {
    // Basic IPv4 validation
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    // Basic IPv6 validation
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  };

  const isValidInput =
    formData.ipAddress &&
    formData.label &&
    (formData.type === 'country' || validateIP(formData.ipAddress));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add IP to Allowlist
          </DialogTitle>
          <DialogDescription>Add a trusted IP address or range to the allowlist</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="type">Entry Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value: IPEntryType) => setFormData({ ...formData, type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <div>
                      <span className="font-medium">{config.label}</span>
                      <p className="text-xs text-stone-500">{config.description}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="ipAddress">
              {formData.type === 'country' ? 'Country Code' : 'IP Address / Range'}
            </Label>
            <Input
              id="ipAddress"
              placeholder={
                formData.type === 'single'
                  ? '192.168.1.100'
                  : formData.type === 'cidr'
                    ? '192.168.1.0/24'
                    : formData.type === 'range'
                      ? '192.168.1.1-192.168.1.255'
                      : formData.type === 'country'
                        ? 'US, CA, GB'
                        : 'Enter IP or identifier'
              }
              value={formData.ipAddress}
              onChange={e => setFormData({ ...formData, ipAddress: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              placeholder="e.g., Corporate Office, Remote Developer"
              value={formData.label}
              onChange={e => setFormData({ ...formData, label: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Additional details about this entry..."
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="environment">Environment</Label>
            <Select
              value={formData.environment[0]}
              onValueChange={(value: Environment) =>
                setFormData({ ...formData, environment: [value] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ENVIRONMENT_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Set Expiration</p>
              <p className="text-sm text-stone-500">Automatically expire this entry after a date</p>
            </div>
            <Switch
              checked={formData.hasExpiry}
              onCheckedChange={checked => setFormData({ ...formData, hasExpiry: checked })}
            />
          </div>

          {formData.hasExpiry && (
            <div>
              <Label htmlFor="expiresAt">Expiration Date</Label>
              <Input
                id="expiresAt"
                type="date"
                value={formData.expiresAt}
                onChange={e => setFormData({ ...formData, expiresAt: e.target.value })}
              />
            </div>
          )}

          <div>
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              placeholder="e.g., corporate, trusted, temporary"
              value={formData.tags}
              onChange={e => setFormData({ ...formData, tags: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValidInput}>
            <Plus className="mr-2 h-4 w-4" />
            Add to Allowlist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface AllowlistTableProps {
  entries: IPAllowlistEntry[];
  onEdit: (entry: IPAllowlistEntry) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
}

const AllowlistTable: React.FC<AllowlistTableProps> = ({
  entries,
  onEdit,
  onDelete,
  onToggleStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<IPEntryStatus | 'all'>('all');

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const matchesSearch =
        e.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.ipAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [entries, searchQuery, statusFilter]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>IP Allowlist</CardTitle>
            <CardDescription>Trusted IP addresses and ranges</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                placeholder="Search entries..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value: IPEntryStatus | 'all') => setStatusFilter(value)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>IP / Range</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.map(entry => (
              <TableRow key={entry.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-stone-400" />
                    <code className="text-sm bg-stone-100 px-2 py-0.5 rounded">
                      {entry.ipAddress}
                    </code>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{entry.label}</p>
                    {entry.tags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {entry.tags.slice(0, 2).map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {entry.tags.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{entry.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{TYPE_CONFIG[entry.type].label}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {entry.environment.map(env => (
                      <Badge
                        key={env}
                        variant="outline"
                        style={{ borderColor: ENVIRONMENT_CONFIG[env].color }}
                        className="text-xs"
                      >
                        {ENVIRONMENT_CONFIG[env].label}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    style={{
                      backgroundColor: STATUS_CONFIG[entry.status].bgColor,
                      color: STATUS_CONFIG[entry.status].color,
                    }}
                  >
                    {STATUS_CONFIG[entry.status].label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{entry.usageCount.toLocaleString()}</span>
                </TableCell>
                <TableCell>
                  {entry.expiresAt ? (
                    <span className="text-sm">{formatDate(entry.expiresAt)}</span>
                  ) : (
                    <span className="text-sm text-stone-400">Never</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onToggleStatus(entry.id)}>
                      {entry.status === 'active' ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onEdit(entry)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-stone-700 hover:text-stone-800"
                      onClick={() => onDelete(entry.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredEntries.length === 0 && (
          <div className="text-center py-8 text-stone-500">
            <Network className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No entries found matching your criteria</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface BlocklistTableProps {
  blocked: BlockedIP[];
  onUnblock: (id: string) => void;
}

const BlocklistTable: React.FC<BlocklistTableProps> = ({ blocked, onUnblock }) => {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-stone-100 rounded-lg">
            <Ban className="h-5 w-5 text-stone-700" />
          </div>
          <div>
            <CardTitle>Blocked IPs</CardTitle>
            <CardDescription>IP addresses blocked from accessing the system</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>IP Address</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Blocked</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {blocked.map(entry => (
              <TableRow key={entry.id}>
                <TableCell>
                  <code className="text-sm bg-stone-100 text-stone-800 px-2 py-0.5 rounded">
                    {entry.ipAddress}
                  </code>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{entry.reason}</p>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{formatDate(entry.blockedAt)}</span>
                </TableCell>
                <TableCell>
                  {entry.expiresAt ? (
                    <span className="text-sm">{formatDate(entry.expiresAt)}</span>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      Permanent
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium text-stone-700">{entry.attemptCount}</span>
                </TableCell>
                <TableCell>
                  {entry.autoBlocked ? (
                    <Badge variant="outline" className="gap-1">
                      <Zap className="h-3 w-3" />
                      Auto
                    </Badge>
                  ) : (
                    <Badge variant="outline">Manual</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => onUnblock(entry.id)}>
                    <Unlock className="mr-2 h-4 w-4" />
                    Unblock
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {blocked.length === 0 && (
          <div className="text-center py-8 text-stone-500">
            <ShieldCheck className="h-12 w-12 mx-auto mb-4 text-stone-900" />
            <p>No blocked IP addresses</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface GeoRestrictionsProps {
  restrictions: GeoRestriction[];
  onToggle: (id: string) => void;
}

const GeoRestrictionsPanel: React.FC<GeoRestrictionsProps> = ({ restrictions, onToggle }) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-stone-100 rounded-lg">
            <Globe className="h-5 w-5 text-stone-600" />
          </div>
          <div>
            <CardTitle>Geographic Restrictions</CardTitle>
            <CardDescription>Control access based on geographic location</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {restrictions.map(restriction => (
          <div
            key={restriction.id}
            className={`p-4 border rounded-lg ${
              restriction.type === 'allow'
                ? 'border-stone-200 bg-stone-100/50'
                : 'border-stone-200 bg-stone-100/50'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {restriction.type === 'allow' ? (
                  <CheckCircle className="h-5 w-5 text-stone-700" />
                ) : (
                  <XCircle className="h-5 w-5 text-stone-700" />
                )}
                <span className="font-medium capitalize">
                  {restriction.type === 'allow' ? 'Allowed Countries' : 'Blocked Countries'}
                </span>
              </div>
              <Switch
                checked={restriction.enabled}
                onCheckedChange={() => onToggle(restriction.id)}
              />
            </div>
            {restriction.description && (
              <p className="text-sm text-stone-600 mb-3">{restriction.description}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {restriction.countries.map(country => (
                <Badge key={country} variant="outline">
                  {country}
                </Badge>
              ))}
            </div>
          </div>
        ))}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>OFAC Compliance</AlertTitle>
          <AlertDescription>
            Geographic restrictions help maintain compliance with U.S. sanctions and export control
            regulations. Blocked countries include sanctioned regions per OFAC guidelines.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

interface AccessLogsProps {
  logs: AccessLog[];
}

const AccessLogs: React.FC<AccessLogsProps> = ({ logs }) => {
  const getActionIcon = (action: AccessLog['action']) => {
    switch (action) {
      case 'allowed':
        return <CheckCircle className="h-4 w-4 text-stone-900" />;
      case 'blocked':
        return <XCircle className="h-4 w-4 text-stone-900" />;
      case 'challenged':
        return <AlertTriangle className="h-4 w-4 text-stone-900" />;
    }
  };

  const getActionBadge = (action: AccessLog['action']) => {
    switch (action) {
      case 'allowed':
        return <Badge className="bg-stone-100 text-stone-800">Allowed</Badge>;
      case 'blocked':
        return <Badge className="bg-stone-100 text-stone-800">Blocked</Badge>;
      case 'challenged':
        return <Badge className="bg-stone-100 text-stone-700">Challenged</Badge>;
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-stone-100 rounded-lg">
            <History className="h-5 w-5 text-stone-600" />
          </div>
          <div>
            <CardTitle>Access Logs</CardTitle>
            <CardDescription>Recent IP access decisions</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {logs.map(log => (
            <div key={log.id} className="flex items-center gap-4 p-3 border rounded-lg">
              {getActionIcon(log.action)}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-sm bg-stone-100 px-2 py-0.5 rounded">{log.ipAddress}</code>
                  {getActionBadge(log.action)}
                </div>
                <p className="text-sm text-stone-600">{log.reason}</p>
                {log.userName && <p className="text-xs text-stone-500">User: {log.userName}</p>}
              </div>
              <div className="text-right text-sm text-stone-500">
                <p>{formatTime(log.timestamp)}</p>
                {log.city && log.country && (
                  <p className="text-xs">
                    {log.city}, {log.country}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const IPAllowlistManagement: React.FC = () => {
  const [allowlist, setAllowlist] = useState<IPAllowlistEntry[]>(MOCK_ALLOWLIST);
  const [blocklist, setBlocklist] = useState<BlockedIP[]>(MOCK_BLOCKED);
  const [geoRestrictions, setGeoRestrictions] = useState<GeoRestriction[]>(MOCK_GEO_RESTRICTIONS);
  const [accessLogs] = useState<AccessLog[]>(MOCK_ACCESS_LOGS);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('allowlist');

  const handleAddEntry = (entry: Partial<IPAllowlistEntry>) => {
    const newEntry: IPAllowlistEntry = {
      id: `ip-${Date.now()}`,
      ipAddress: entry.ipAddress || '',
      type: entry.type || 'single',
      label: entry.label || '',
      description: entry.description,
      status: 'active',
      environment: entry.environment || ['production'],
      createdBy: 'Current User',
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: entry.expiresAt,
      usageCount: 0,
      tags: entry.tags || [],
      metadata: {},
    };
    setAllowlist([newEntry, ...allowlist]);
  };

  const handleToggleStatus = (id: string) => {
    setAllowlist(
      allowlist.map(e =>
        e.id === id ? { ...e, status: e.status === 'active' ? 'inactive' : 'active' } : e
      )
    );
  };

  const handleDeleteEntry = (id: string) => {
    setAllowlist(allowlist.filter(e => e.id !== id));
  };

  const handleUnblock = (id: string) => {
    setBlocklist(blocklist.filter(b => b.id !== id));
  };

  const handleToggleGeo = (id: string) => {
    setGeoRestrictions(geoRestrictions.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            IP Allowlist Management
          </h1>
          <p className="text-stone-500">Manage trusted IP addresses and network access controls</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={() => setAddModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add IP
          </Button>
        </div>
      </div>

      {/* Stats */}
      <AllowlistStats entries={allowlist} blocked={blocklist} />

      {/* Compliance Alert */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>Network Security Controls</AlertTitle>
        <AlertDescription>
          IP allowlisting is a critical security control for 21 CFR Part 11 compliance. All changes
          to the allowlist are logged in the audit trail and require appropriate authorization.
        </AlertDescription>
      </Alert>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="allowlist">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Allowlist
          </TabsTrigger>
          <TabsTrigger value="blocklist">
            <Ban className="mr-2 h-4 w-4" />
            Blocklist
          </TabsTrigger>
          <TabsTrigger value="geo">
            <Globe className="mr-2 h-4 w-4" />
            Geo Restrictions
          </TabsTrigger>
          <TabsTrigger value="logs">
            <History className="mr-2 h-4 w-4" />
            Access Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="allowlist" className="mt-6">
          <AllowlistTable
            entries={allowlist}
            onEdit={entry => securityLogger.debug('IP entry edit initiated', { entryId: entry.id })}
            onDelete={handleDeleteEntry}
            onToggleStatus={handleToggleStatus}
          />
        </TabsContent>

        <TabsContent value="blocklist" className="mt-6">
          <BlocklistTable blocked={blocklist} onUnblock={handleUnblock} />
        </TabsContent>

        <TabsContent value="geo" className="mt-6">
          <GeoRestrictionsPanel restrictions={geoRestrictions} onToggle={handleToggleGeo} />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <AccessLogs logs={accessLogs} />
        </TabsContent>
      </Tabs>

      {/* Add Modal */}
      <AddIPModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddEntry}
      />
    </div>
  );
};

export default IPAllowlistManagement;
