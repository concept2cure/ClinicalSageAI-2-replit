/**
 * Concept2Cure Client Portal V2 - Delegation of Authority
 *
 * Comprehensive delegation management with:
 * - Temporary authority assignments
 * - Approval delegation chains
 * - Out-of-office coverage
 * - Delegation audit trails
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11.10(g), ICH E6(R2)
 */

import React, { useState, useCallback, useMemo } from 'react';
import { adminLogger } from '../../utils/logger';
import {
  UserCheck,
  UserPlus,
  UserMinus,
  Users,
  User,
  UserCog,
  ArrowRight,
  ArrowLeftRight,
  Calendar,
  Clock,
  CalendarClock,
  CalendarOff,
  CalendarCheck,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Check,
  CheckCircle,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Info,
  Search,
  Filter,
  Plus,
  Edit,
  Trash2,
  Eye,
  RefreshCw,
  Loader2,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Bell,
  BellOff,
  FileText,
  Briefcase,
  Building2,
  Mail,
  Send,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

type DelegationType = 'full' | 'approval' | 'view' | 'specific';
type DelegationStatus = 'active' | 'pending' | 'expired' | 'revoked';

interface Delegation {
  id: string;
  delegatorId: string;
  delegatorName: string;
  delegatorEmail: string;
  delegatorRole: string;
  delegateId: string;
  delegateName: string;
  delegateEmail: string;
  delegateRole: string;
  type: DelegationType;
  permissions: string[];
  reason: string;
  startDate: Date;
  endDate: Date;
  status: DelegationStatus;
  createdAt: Date;
  createdBy: string;
  revokedAt?: Date;
  revokedBy?: string;
  revokeReason?: string;
  notifyOnAction: boolean;
  requireApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;
}

interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  avatar?: string;
  activeDelegationsTo: number;
  activeDelegationsFrom: number;
}

interface DelegationRequest {
  delegatorId: string;
  delegateId: string;
  type: DelegationType;
  permissions: string[];
  reason: string;
  startDate: Date;
  endDate: Date;
  notifyOnAction: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  DelegationType,
  { label: string; description: string; color: string; bgColor: string }
> = {
  full: {
    label: 'Full Authority',
    description: 'All permissions of the delegator',
    color: 'text-stone-700',
    bgColor: 'bg-stone-100',
  },
  approval: {
    label: 'Approval Authority',
    description: 'Document and workflow approvals only',
    color: 'text-stone-700',
    bgColor: 'bg-stone-100',
  },
  view: {
    label: 'View Access',
    description: 'Read-only access to resources',
    color: 'text-stone-800',
    bgColor: 'bg-stone-100',
  },
  specific: {
    label: 'Specific Permissions',
    description: 'Custom selected permissions',
    color: 'text-stone-700',
    bgColor: 'bg-stone-100',
  },
};

const STATUS_CONFIG: Record<DelegationStatus, { label: string; color: string; bgColor: string }> = {
  active: { label: 'Active', color: 'text-stone-700', bgColor: 'bg-stone-100' },
  pending: { label: 'Pending Approval', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  expired: { label: 'Expired', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  revoked: { label: 'Revoked', color: 'text-stone-700', bgColor: 'bg-stone-100' },
};

const DELEGABLE_PERMISSIONS = [
  { id: 'doc_approve', label: 'Document Approval', category: 'Documents' },
  { id: 'doc_sign', label: 'Electronic Signature', category: 'Documents' },
  { id: 'doc_review', label: 'Document Review', category: 'Documents' },
  { id: 'sub_approve', label: 'Submission Approval', category: 'Submissions' },
  { id: 'sub_submit', label: 'Submit to Agency', category: 'Submissions' },
  { id: 'wf_approve', label: 'Workflow Approval', category: 'Workflows' },
  { id: 'wf_initiate', label: 'Initiate Workflow', category: 'Workflows' },
  { id: 'usr_manage', label: 'User Management', category: 'Administration' },
  { id: 'rpt_generate', label: 'Report Generation', category: 'Reports' },
];

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_USERS: UserSummary[] = [
  {
    id: 'user_001',
    name: 'John Smith',
    email: 'john.smith@pharma.com',
    role: 'Regulatory Manager',
    department: 'Regulatory Affairs',
    activeDelegationsTo: 2,
    activeDelegationsFrom: 1,
  },
  {
    id: 'user_002',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@pharma.com',
    role: 'QA Manager',
    department: 'Quality Assurance',
    activeDelegationsTo: 1,
    activeDelegationsFrom: 0,
  },
  {
    id: 'user_003',
    name: 'Mike Chen',
    email: 'mike.chen@pharma.com',
    role: 'Clinical Data Manager',
    department: 'Clinical Operations',
    activeDelegationsTo: 0,
    activeDelegationsFrom: 2,
  },
  {
    id: 'user_004',
    name: 'Lisa Park',
    email: 'lisa.park@pharma.com',
    role: 'Regulatory Specialist',
    department: 'Regulatory Affairs',
    activeDelegationsTo: 0,
    activeDelegationsFrom: 1,
  },
  {
    id: 'user_005',
    name: 'Alex Rivera',
    email: 'alex.rivera@pharma.com',
    role: 'Senior Regulatory Manager',
    department: 'Regulatory Affairs',
    activeDelegationsTo: 1,
    activeDelegationsFrom: 1,
  },
];

const MOCK_DELEGATIONS: Delegation[] = [
  {
    id: 'del_001',
    delegatorId: 'user_001',
    delegatorName: 'John Smith',
    delegatorEmail: 'john.smith@pharma.com',
    delegatorRole: 'Regulatory Manager',
    delegateId: 'user_004',
    delegateName: 'Lisa Park',
    delegateEmail: 'lisa.park@pharma.com',
    delegateRole: 'Regulatory Specialist',
    type: 'approval',
    permissions: ['doc_approve', 'wf_approve'],
    reason: 'Vacation coverage - Bahamas trip',
    startDate: new Date('2025-01-27'),
    endDate: new Date('2025-02-03'),
    status: 'active',
    createdAt: new Date('2025-01-20'),
    createdBy: 'user_001',
    notifyOnAction: true,
    requireApproval: false,
  },
  {
    id: 'del_002',
    delegatorId: 'user_005',
    delegatorName: 'Alex Rivera',
    delegatorEmail: 'alex.rivera@pharma.com',
    delegatorRole: 'Senior Regulatory Manager',
    delegateId: 'user_001',
    delegateName: 'John Smith',
    delegateEmail: 'john.smith@pharma.com',
    delegateRole: 'Regulatory Manager',
    type: 'full',
    permissions: [],
    reason: 'Business travel - FDA meetings',
    startDate: new Date('2025-01-25'),
    endDate: new Date('2025-01-28'),
    status: 'active',
    createdAt: new Date('2025-01-22'),
    createdBy: 'user_005',
    notifyOnAction: true,
    requireApproval: true,
    approvedBy: 'admin_001',
    approvedAt: new Date('2025-01-23'),
  },
  {
    id: 'del_003',
    delegatorId: 'user_002',
    delegatorName: 'Sarah Johnson',
    delegatorEmail: 'sarah.johnson@pharma.com',
    delegatorRole: 'QA Manager',
    delegateId: 'user_003',
    delegateName: 'Mike Chen',
    delegateEmail: 'mike.chen@pharma.com',
    delegateRole: 'Clinical Data Manager',
    type: 'view',
    permissions: [],
    reason: 'Cross-training and backup coverage',
    startDate: new Date('2025-01-15'),
    endDate: new Date('2025-01-25'),
    status: 'expired',
    createdAt: new Date('2025-01-10'),
    createdBy: 'user_002',
    notifyOnAction: false,
    requireApproval: false,
  },
  {
    id: 'del_004',
    delegatorId: 'user_001',
    delegatorName: 'John Smith',
    delegatorEmail: 'john.smith@pharma.com',
    delegatorRole: 'Regulatory Manager',
    delegateId: 'user_003',
    delegateName: 'Mike Chen',
    delegateEmail: 'mike.chen@pharma.com',
    delegateRole: 'Clinical Data Manager',
    type: 'specific',
    permissions: ['doc_review', 'rpt_generate'],
    reason: 'Project collaboration',
    startDate: new Date('2025-02-01'),
    endDate: new Date('2025-02-28'),
    status: 'pending',
    createdAt: new Date('2025-01-25'),
    createdBy: 'user_001',
    notifyOnAction: true,
    requireApproval: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// DELEGATION CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const DelegationCard: React.FC<{
  delegation: Delegation;
  onViewDetails: (delegation: Delegation) => void;
  onRevoke: (delegationId: string) => void;
  onExtend: (delegationId: string) => void;
  currentUserId?: string;
}> = ({ delegation, onViewDetails, onRevoke, onExtend, currentUserId }) => {
  const typeConfig = TYPE_CONFIG[delegation.type];
  const statusConfig = STATUS_CONFIG[delegation.status];

  const daysRemaining = Math.ceil(
    (delegation.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const isExpiringSoon = delegation.status === 'active' && daysRemaining <= 3 && daysRemaining > 0;

  return (
    <Card className={isExpiringSoon ? 'border-stone-300' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Delegation Flow Visual */}
          <div className="flex items-center gap-3">
            {/* Delegator */}
            <div className="text-center">
              <Avatar className="h-10 w-10 mx-auto">
                <AvatarFallback>
                  {delegation.delegatorName
                    .split(' ')
                    .map(n => n[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <p className="text-xs font-medium mt-1 max-w-[80px] truncate">
                {delegation.delegatorName}
              </p>
              <p className="text-xs text-muted-foreground">Delegator</p>
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
              <Badge className={`${typeConfig.bgColor} ${typeConfig.color} border-0 text-xs mt-1`}>
                {typeConfig.label}
              </Badge>
            </div>

            {/* Delegate */}
            <div className="text-center">
              <Avatar className="h-10 w-10 mx-auto">
                <AvatarFallback>
                  {delegation.delegateName
                    .split(' ')
                    .map(n => n[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <p className="text-xs font-medium mt-1 max-w-[80px] truncate">
                {delegation.delegateName}
              </p>
              <p className="text-xs text-muted-foreground">Delegate</p>
            </div>
          </div>

          {/* Details */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={`${statusConfig.bgColor} ${statusConfig.color} border-0`}>
                {statusConfig.label}
              </Badge>
              {isExpiringSoon && (
                <Badge variant="outline" className="text-stone-600 border-stone-300">
                  <Clock className="mr-1 h-3 w-3" />
                  Expires in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
                </Badge>
              )}
              {delegation.notifyOnAction && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Bell className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>Notifications enabled</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="text-sm mb-2">{delegation.reason}</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {delegation.startDate.toLocaleDateString()} -{' '}
                {delegation.endDate.toLocaleDateString()}
              </span>
              {delegation.permissions.length > 0 && (
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  {delegation.permissions.length} permission
                  {delegation.permissions.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onViewDetails(delegation)}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              {delegation.status === 'active' && (
                <>
                  <DropdownMenuItem onClick={() => onExtend(delegation.id)}>
                    <CalendarClock className="mr-2 h-4 w-4" />
                    Extend Delegation
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onRevoke(delegation.id)}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Revoke Delegation
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// USER SELECTOR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const UserSelector: React.FC<{
  users: UserSummary[];
  selectedId: string | null;
  onSelect: (userId: string) => void;
  label: string;
  excludeIds?: string[];
}> = ({ users, selectedId, onSelect, label, excludeIds = [] }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = users.filter(
    u =>
      !excludeIds.includes(u.id) &&
      (u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedUser = users.find(u => u.id === selectedId);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={selectedId || ''} onValueChange={onSelect}>
        <SelectTrigger>
          <SelectValue placeholder="Select user">
            {selectedUser && (
              <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-xs">
                    {selectedUser.name
                      .split(' ')
                      .map(n => n[0])
                      .join('')}
                  </AvatarFallback>
                </Avatar>
                {selectedUser.name}
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          {filteredUsers.map(user => (
            <SelectItem key={user.id} value={user.id}>
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {user.name
                      .split(' ')
                      .map(n => n[0])
                      .join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.role}</p>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE DELEGATION DIALOG
// ─────────────────────────────────────────────────────────────────────────────

const CreateDelegationDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onSubmit: (request: DelegationRequest) => void;
  users: UserSummary[];
  currentUserId: string;
}> = ({ open, onClose, onSubmit, users, currentUserId }) => {
  const [delegatorId, setDelegatorId] = useState<string>(currentUserId);
  const [delegateId, setDelegateId] = useState<string>('');
  const [type, setType] = useState<DelegationType>('approval');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notifyOnAction, setNotifyOnAction] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!delegateId || !reason || !startDate || !endDate) return;
    setIsSubmitting(true);
    await new Promise(r => setTimeout(r, 800));
    onSubmit({
      delegatorId,
      delegateId,
      type,
      permissions: type === 'specific' ? permissions : [],
      reason,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      notifyOnAction,
    });
    setIsSubmitting(false);
    onClose();
  };

  const togglePermission = (permId: string) => {
    setPermissions(prev =>
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    );
  };

  // Group permissions by category
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, typeof DELEGABLE_PERMISSIONS> = {};
    DELEGABLE_PERMISSIONS.forEach(perm => {
      if (!groups[perm.category]) groups[perm.category] = [];
      groups[perm.category].push(perm);
    });
    return groups;
  }, []);

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Create Delegation
          </DialogTitle>
          <DialogDescription>Temporarily delegate your authority to another user</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* User Selection */}
          <div className="grid md:grid-cols-2 gap-4">
            <UserSelector
              users={users}
              selectedId={delegatorId}
              onSelect={setDelegatorId}
              label="Delegator (From)"
              excludeIds={[delegateId]}
            />
            <UserSelector
              users={users}
              selectedId={delegateId}
              onSelect={setDelegateId}
              label="Delegate (To)"
              excludeIds={[delegatorId]}
            />
          </div>

          {/* Delegation Type */}
          <div className="space-y-3">
            <Label>Delegation Type</Label>
            <div className="grid grid-cols-2 gap-3">
              {(
                Object.entries(TYPE_CONFIG) as [
                  DelegationType,
                  (typeof TYPE_CONFIG)[DelegationType],
                ][]
              ).map(([key, config]) => (
                <Button
                  key={key}
                  variant={type === key ? 'default' : 'outline'}
                  className={`h-auto py-3 flex-col items-start ${
                    type !== key ? config.bgColor : ''
                  }`}
                  onClick={() => setType(key)}
                >
                  <span className={`font-medium ${type !== key ? config.color : ''}`}>
                    {config.label}
                  </span>
                  <span className="text-xs opacity-70">{config.description}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Specific Permissions */}
          {type === 'specific' && (
            <div className="space-y-3">
              <Label>Select Permissions</Label>
              <div className="space-y-4 max-h-48 overflow-y-auto border rounded-lg p-4">
                {Object.entries(groupedPermissions).map(([category, perms]) => (
                  <div key={category}>
                    <p className="text-sm font-medium mb-2">{category}</p>
                    <div className="space-y-2 pl-2">
                      {perms.map(perm => (
                        <div key={perm.id} className="flex items-center gap-2">
                          <Checkbox
                            id={perm.id}
                            checked={permissions.includes(perm.id)}
                            onCheckedChange={() => togglePermission(perm.id)}
                          />
                          <Label htmlFor={perm.id} className="font-normal cursor-pointer">
                            {perm.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Date Range */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                min={startDate || new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Delegation</Label>
            <Textarea
              id="reason"
              placeholder="e.g., Vacation coverage, business travel, project collaboration..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
            />
          </div>

          {/* Notifications */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div>
              <p className="font-medium">Notify on Actions</p>
              <p className="text-sm text-muted-foreground">
                Receive notifications when delegate performs actions
              </p>
            </div>
            <Switch checked={notifyOnAction} onCheckedChange={setNotifyOnAction} />
          </div>

          {/* Compliance Notice */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              All delegated actions will be logged with both the delegator and delegate information
              per FDA 21 CFR Part 11.10(e) requirements.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!delegateId || !reason || !startDate || !endDate || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="mr-2 h-4 w-4" />
            )}
            Create Delegation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DELEGATION DETAILS DIALOG
// ─────────────────────────────────────────────────────────────────────────────

const DelegationDetailsDialog: React.FC<{
  delegation: Delegation | null;
  open: boolean;
  onClose: () => void;
  onRevoke: (delegationId: string, reason: string) => void;
}> = ({ delegation, open, onClose, onRevoke }) => {
  const [revokeReason, setRevokeReason] = useState('');
  const [showRevoke, setShowRevoke] = useState(false);

  if (!delegation) return null;

  const typeConfig = TYPE_CONFIG[delegation.type];
  const statusConfig = STATUS_CONFIG[delegation.status];

  const handleRevoke = () => {
    onRevoke(delegation.id, revokeReason);
    setShowRevoke(false);
    setRevokeReason('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge className={`${typeConfig.bgColor} ${typeConfig.color} border-0`}>
              {typeConfig.label}
            </Badge>
            <Badge className={`${statusConfig.bgColor} ${statusConfig.color} border-0`}>
              {statusConfig.label}
            </Badge>
          </div>
          <DialogTitle>Delegation Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Delegation Flow */}
          <div className="flex items-center justify-center gap-4 p-4 bg-muted rounded-lg">
            <div className="text-center">
              <Avatar className="h-12 w-12 mx-auto">
                <AvatarFallback>
                  {delegation.delegatorName
                    .split(' ')
                    .map(n => n[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <p className="font-medium mt-2">{delegation.delegatorName}</p>
              <p className="text-sm text-muted-foreground">{delegation.delegatorRole}</p>
            </div>
            <div className="flex flex-col items-center">
              <ArrowRight className="h-6 w-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground mt-1">delegates to</span>
            </div>
            <div className="text-center">
              <Avatar className="h-12 w-12 mx-auto">
                <AvatarFallback>
                  {delegation.delegateName
                    .split(' ')
                    .map(n => n[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <p className="font-medium mt-2">{delegation.delegateName}</p>
              <p className="text-sm text-muted-foreground">{delegation.delegateRole}</p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">Start Date</p>
              <p className="font-medium">{delegation.startDate.toLocaleDateString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">End Date</p>
              <p className="font-medium">{delegation.endDate.toLocaleDateString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Created</p>
              <p className="font-medium">{delegation.createdAt.toLocaleDateString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Notifications</p>
              <p className="font-medium">{delegation.notifyOnAction ? 'Enabled' : 'Disabled'}</p>
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Reason</p>
            <p className="p-3 bg-muted rounded-lg">{delegation.reason}</p>
          </div>

          {/* Permissions */}
          {delegation.type === 'specific' && delegation.permissions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Delegated Permissions</p>
              <div className="flex flex-wrap gap-2">
                {delegation.permissions.map(permId => {
                  const perm = DELEGABLE_PERMISSIONS.find(p => p.id === permId);
                  return (
                    <Badge key={permId} variant="secondary">
                      {perm?.label || permId}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Approval Info */}
          {delegation.requireApproval && delegation.approvedBy && (
            <div className="p-3 bg-stone-100 rounded-lg text-sm">
              <div className="flex items-center gap-2 text-stone-800">
                <CheckCircle className="h-4 w-4" />
                <span>Approved by Admin on {delegation.approvedAt?.toLocaleDateString()}</span>
              </div>
            </div>
          )}

          {/* Revoke Section */}
          {delegation.status === 'active' && !showRevoke && (
            <Button variant="destructive" className="w-full" onClick={() => setShowRevoke(true)}>
              <XCircle className="mr-2 h-4 w-4" />
              Revoke Delegation
            </Button>
          )}

          {showRevoke && (
            <div className="space-y-3 p-4 border border-destructive rounded-lg">
              <Label>Reason for Revocation</Label>
              <Textarea
                placeholder="Enter reason for revoking this delegation..."
                value={revokeReason}
                onChange={e => setRevokeReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowRevoke(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleRevoke} disabled={!revokeReason}>
                  Confirm Revocation
                </Button>
              </div>
            </div>
          )}
        </div>

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
// MAIN DELEGATION OF AUTHORITY COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const DelegationOfAuthority: React.FC = () => {
  const [delegations, setDelegations] = useState<Delegation[]>(MOCK_DELEGATIONS);
  const [users] = useState<UserSummary[]>(MOCK_USERS);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedDelegation, setSelectedDelegation] = useState<Delegation | null>(null);

  // Current user (mock)
  const currentUserId = 'user_001';

  // Stats
  const stats = useMemo(
    () => ({
      active: delegations.filter(d => d.status === 'active').length,
      pending: delegations.filter(d => d.status === 'pending').length,
      expiringSoon: delegations.filter(d => {
        if (d.status !== 'active') return false;
        const daysRemaining = Math.ceil((d.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysRemaining <= 3 && daysRemaining > 0;
      }).length,
      myDelegations: delegations.filter(
        d => d.delegatorId === currentUserId && d.status === 'active'
      ).length,
      delegatedToMe: delegations.filter(
        d => d.delegateId === currentUserId && d.status === 'active'
      ).length,
    }),
    [delegations, currentUserId]
  );

  // Filter delegations
  const filteredDelegations = useMemo(() => {
    let filtered = delegations;

    // Tab filter
    if (activeTab === 'active') {
      filtered = filtered.filter(d => d.status === 'active');
    } else if (activeTab === 'pending') {
      filtered = filtered.filter(d => d.status === 'pending');
    } else if (activeTab === 'expired') {
      filtered = filtered.filter(d => d.status === 'expired' || d.status === 'revoked');
    } else if (activeTab === 'my') {
      filtered = filtered.filter(d => d.delegatorId === currentUserId);
    } else if (activeTab === 'tome') {
      filtered = filtered.filter(d => d.delegateId === currentUserId);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        d =>
          d.delegatorName.toLowerCase().includes(query) ||
          d.delegateName.toLowerCase().includes(query) ||
          d.reason.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [delegations, activeTab, searchQuery, currentUserId]);

  const handleCreateDelegation = (request: DelegationRequest) => {
    const delegator = users.find(u => u.id === request.delegatorId)!;
    const delegate = users.find(u => u.id === request.delegateId)!;

    const newDelegation: Delegation = {
      id: `del_${Date.now()}`,
      delegatorId: request.delegatorId,
      delegatorName: delegator.name,
      delegatorEmail: delegator.email,
      delegatorRole: delegator.role,
      delegateId: request.delegateId,
      delegateName: delegate.name,
      delegateEmail: delegate.email,
      delegateRole: delegate.role,
      type: request.type,
      permissions: request.permissions,
      reason: request.reason,
      startDate: request.startDate,
      endDate: request.endDate,
      status: 'active',
      createdAt: new Date(),
      createdBy: currentUserId,
      notifyOnAction: request.notifyOnAction,
      requireApproval: request.type === 'full',
    };

    setDelegations(prev => [newDelegation, ...prev]);
  };

  const handleRevoke = (delegationId: string, reason?: string) => {
    setDelegations(prev =>
      prev.map(d =>
        d.id === delegationId
          ? {
              ...d,
              status: 'revoked' as DelegationStatus,
              revokedAt: new Date(),
              revokedBy: currentUserId,
              revokeReason: reason,
            }
          : d
      )
    );
  };

  const handleExtend = (delegationId: string) => {
    // Open extend dialog (simplified for demo)
    adminLogger.audit('Delegation extended', { delegationId });
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 500));
    setIsLoading(false);
  };

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCheck className="h-6 w-6" />
            Delegation of Authority
          </h1>
          <p className="text-muted-foreground">Manage temporary authority delegations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Delegation
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <ShieldCheck className="h-8 w-8 mx-auto text-stone-700 mb-2" />
            <p className="text-2xl font-bold">{stats.active}</p>
            <p className="text-sm text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-8 w-8 mx-auto text-stone-600 mb-2" />
            <p className="text-2xl font-bold">{stats.pending}</p>
            <p className="text-sm text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-stone-700 mb-2" />
            <p className="text-2xl font-bold">{stats.expiringSoon}</p>
            <p className="text-sm text-muted-foreground">Expiring Soon</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ArrowRight className="h-8 w-8 mx-auto text-stone-600 mb-2" />
            <p className="text-2xl font-bold">{stats.myDelegations}</p>
            <p className="text-sm text-muted-foreground">My Delegations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <User className="h-8 w-8 mx-auto text-stone-600 mb-2" />
            <p className="text-2xl font-bold">{stats.delegatedToMe}</p>
            <p className="text-sm text-muted-foreground">Delegated to Me</p>
          </CardContent>
        </Card>
      </div>

      {/* Expiring Alert */}
      {stats.expiringSoon > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Delegations Expiring Soon</AlertTitle>
          <AlertDescription>
            {stats.expiringSoon} delegation{stats.expiringSoon !== 1 ? 's are' : ' is'} expiring
            within the next 3 days. Consider extending or creating new delegations if coverage is
            still needed.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="active">
              Active
              {stats.active > 0 && <Badge className="ml-2">{stats.active}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pending
              {stats.pending > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {stats.pending}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="my">My Delegations</TabsTrigger>
            <TabsTrigger value="tome">Delegated to Me</TabsTrigger>
            <TabsTrigger value="expired">History</TabsTrigger>
          </TabsList>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search delegations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-4 space-y-3">
          {filteredDelegations.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">No Delegations Found</h3>
                <p className="text-muted-foreground">
                  {searchQuery
                    ? 'No delegations match your search'
                    : activeTab === 'active'
                      ? 'No active delegations at this time'
                      : 'No delegations in this category'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredDelegations.map(delegation => (
              <DelegationCard
                key={delegation.id}
                delegation={delegation}
                onViewDetails={setSelectedDelegation}
                onRevoke={handleRevoke}
                onExtend={handleExtend}
                currentUserId={currentUserId}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <CreateDelegationDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSubmit={handleCreateDelegation}
        users={users}
        currentUserId={currentUserId}
      />

      {/* Details Dialog */}
      <DelegationDetailsDialog
        delegation={selectedDelegation}
        open={!!selectedDelegation}
        onClose={() => setSelectedDelegation(null)}
        onRevoke={handleRevoke}
      />
    </div>
  );
};

export default DelegationOfAuthority;
