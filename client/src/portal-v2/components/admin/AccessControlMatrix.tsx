/**
 * Concept2Cure Client Portal V2 - Access Control Matrix
 *
 * Visual representation of user-role-permission relationships:
 * - Role-permission matrix view
 * - User-resource access visualization
 * - Permission inheritance display
 * - Access gap analysis
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11.10(d), NIST 800-53 AC
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Lock,
  Unlock,
  Key,
  KeyRound,
  User,
  Users,
  UserPlus,
  UserMinus,
  UserCheck,
  Building2,
  FileText,
  FolderOpen,
  Database,
  Settings,
  Workflow,
  Eye,
  EyeOff,
  Edit,
  Trash2,
  Plus,
  Minus,
  Check,
  X,
  CheckCircle,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Info,
  Search,
  Filter,
  Download,
  Upload,
  RefreshCw,
  Loader2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Maximize2,
  Minimize2,
  Grid,
  List,
  HelpCircle,
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
import { Checkbox } from '@/components/ui/checkbox';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

type PermissionLevel = 'none' | 'read' | 'write' | 'admin' | 'full';
type ResourceCategory = 'documents' | 'submissions' | 'users' | 'system' | 'data' | 'workflows';

interface Role {
  id: string;
  name: string;
  description: string;
  level: number;
  isSystem: boolean;
  userCount: number;
}

interface Resource {
  id: string;
  name: string;
  category: ResourceCategory;
  description: string;
  isSensitive: boolean;
}

interface Permission {
  roleId: string;
  resourceId: string;
  level: PermissionLevel;
  inherited: boolean;
  inheritedFrom?: string;
}

interface UserAccess {
  userId: string;
  userName: string;
  userEmail: string;
  roles: string[];
  effectivePermissions: Permission[];
  lastAccess?: Date;
}

interface AccessGap {
  type: 'missing' | 'excessive' | 'conflict';
  description: string;
  affectedRole: string;
  affectedResource: string;
  recommendation: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const PERMISSION_LEVELS: Record<
  PermissionLevel,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  none: { label: 'None', color: 'text-stone-400', bgColor: 'bg-stone-100', icon: X },
  read: { label: 'Read', color: 'text-stone-600', bgColor: 'bg-stone-100', icon: Eye },
  write: { label: 'Write', color: 'text-stone-700', bgColor: 'bg-stone-100', icon: Edit },
  admin: { label: 'Admin', color: 'text-stone-600', bgColor: 'bg-stone-100', icon: Settings },
  full: { label: 'Full', color: 'text-stone-600', bgColor: 'bg-stone-100', icon: ShieldCheck },
};

const CATEGORY_CONFIG: Record<
  ResourceCategory,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  documents: { label: 'Documents', icon: FileText },
  submissions: { label: 'Submissions', icon: FolderOpen },
  users: { label: 'Users', icon: Users },
  system: { label: 'System', icon: Settings },
  data: { label: 'Data', icon: Database },
  workflows: { label: 'Workflows', icon: Workflow },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_ROLES: Role[] = [
  {
    id: 'role_admin',
    name: 'System Administrator',
    description: 'Full system access',
    level: 100,
    isSystem: true,
    userCount: 2,
  },
  {
    id: 'role_reg_mgr',
    name: 'Regulatory Manager',
    description: 'Manage regulatory submissions',
    level: 80,
    isSystem: false,
    userCount: 5,
  },
  {
    id: 'role_reg_spec',
    name: 'Regulatory Specialist',
    description: 'Prepare and submit documents',
    level: 60,
    isSystem: false,
    userCount: 12,
  },
  {
    id: 'role_qa_mgr',
    name: 'QA Manager',
    description: 'Quality assurance oversight',
    level: 70,
    isSystem: false,
    userCount: 3,
  },
  {
    id: 'role_reviewer',
    name: 'Reviewer',
    description: 'Review and approve documents',
    level: 50,
    isSystem: false,
    userCount: 8,
  },
  {
    id: 'role_viewer',
    name: 'Viewer',
    description: 'Read-only access',
    level: 10,
    isSystem: true,
    userCount: 15,
  },
];

const MOCK_RESOURCES: Resource[] = [
  {
    id: 'res_ind',
    name: 'IND Applications',
    category: 'submissions',
    description: 'Investigational New Drug applications',
    isSensitive: true,
  },
  {
    id: 'res_nda',
    name: 'NDA Applications',
    category: 'submissions',
    description: 'New Drug Applications',
    isSensitive: true,
  },
  {
    id: 'res_protocols',
    name: 'Clinical Protocols',
    category: 'documents',
    description: 'Clinical study protocols',
    isSensitive: true,
  },
  {
    id: 'res_reports',
    name: 'Safety Reports',
    category: 'documents',
    description: 'Safety and adverse event reports',
    isSensitive: true,
  },
  {
    id: 'res_users',
    name: 'User Management',
    category: 'users',
    description: 'User accounts and permissions',
    isSensitive: false,
  },
  {
    id: 'res_roles',
    name: 'Role Management',
    category: 'users',
    description: 'Role definitions and assignments',
    isSensitive: false,
  },
  {
    id: 'res_audit',
    name: 'Audit Logs',
    category: 'system',
    description: 'System audit trail',
    isSensitive: true,
  },
  {
    id: 'res_config',
    name: 'System Configuration',
    category: 'system',
    description: 'Platform configuration settings',
    isSensitive: false,
  },
  {
    id: 'res_data',
    name: 'Clinical Data',
    category: 'data',
    description: 'Clinical trial data',
    isSensitive: true,
  },
  {
    id: 'res_workflows',
    name: 'Workflow Templates',
    category: 'workflows',
    description: 'Document workflow definitions',
    isSensitive: false,
  },
];

const MOCK_PERMISSIONS: Permission[] = [
  // System Administrator - Full access
  { roleId: 'role_admin', resourceId: 'res_ind', level: 'full', inherited: false },
  { roleId: 'role_admin', resourceId: 'res_nda', level: 'full', inherited: false },
  { roleId: 'role_admin', resourceId: 'res_protocols', level: 'full', inherited: false },
  { roleId: 'role_admin', resourceId: 'res_reports', level: 'full', inherited: false },
  { roleId: 'role_admin', resourceId: 'res_users', level: 'full', inherited: false },
  { roleId: 'role_admin', resourceId: 'res_roles', level: 'full', inherited: false },
  { roleId: 'role_admin', resourceId: 'res_audit', level: 'full', inherited: false },
  { roleId: 'role_admin', resourceId: 'res_config', level: 'full', inherited: false },
  { roleId: 'role_admin', resourceId: 'res_data', level: 'full', inherited: false },
  { roleId: 'role_admin', resourceId: 'res_workflows', level: 'full', inherited: false },
  // Regulatory Manager
  { roleId: 'role_reg_mgr', resourceId: 'res_ind', level: 'admin', inherited: false },
  { roleId: 'role_reg_mgr', resourceId: 'res_nda', level: 'admin', inherited: false },
  { roleId: 'role_reg_mgr', resourceId: 'res_protocols', level: 'write', inherited: false },
  { roleId: 'role_reg_mgr', resourceId: 'res_reports', level: 'write', inherited: false },
  { roleId: 'role_reg_mgr', resourceId: 'res_users', level: 'read', inherited: false },
  { roleId: 'role_reg_mgr', resourceId: 'res_roles', level: 'none', inherited: false },
  { roleId: 'role_reg_mgr', resourceId: 'res_audit', level: 'read', inherited: false },
  { roleId: 'role_reg_mgr', resourceId: 'res_config', level: 'none', inherited: false },
  { roleId: 'role_reg_mgr', resourceId: 'res_data', level: 'read', inherited: false },
  { roleId: 'role_reg_mgr', resourceId: 'res_workflows', level: 'write', inherited: false },
  // Regulatory Specialist
  { roleId: 'role_reg_spec', resourceId: 'res_ind', level: 'write', inherited: false },
  { roleId: 'role_reg_spec', resourceId: 'res_nda', level: 'write', inherited: false },
  { roleId: 'role_reg_spec', resourceId: 'res_protocols', level: 'write', inherited: false },
  { roleId: 'role_reg_spec', resourceId: 'res_reports', level: 'write', inherited: false },
  { roleId: 'role_reg_spec', resourceId: 'res_users', level: 'none', inherited: false },
  { roleId: 'role_reg_spec', resourceId: 'res_roles', level: 'none', inherited: false },
  { roleId: 'role_reg_spec', resourceId: 'res_audit', level: 'none', inherited: false },
  { roleId: 'role_reg_spec', resourceId: 'res_config', level: 'none', inherited: false },
  { roleId: 'role_reg_spec', resourceId: 'res_data', level: 'read', inherited: false },
  { roleId: 'role_reg_spec', resourceId: 'res_workflows', level: 'read', inherited: false },
  // QA Manager
  { roleId: 'role_qa_mgr', resourceId: 'res_ind', level: 'read', inherited: false },
  { roleId: 'role_qa_mgr', resourceId: 'res_nda', level: 'read', inherited: false },
  { roleId: 'role_qa_mgr', resourceId: 'res_protocols', level: 'read', inherited: false },
  { roleId: 'role_qa_mgr', resourceId: 'res_reports', level: 'admin', inherited: false },
  { roleId: 'role_qa_mgr', resourceId: 'res_users', level: 'read', inherited: false },
  { roleId: 'role_qa_mgr', resourceId: 'res_roles', level: 'none', inherited: false },
  { roleId: 'role_qa_mgr', resourceId: 'res_audit', level: 'read', inherited: false },
  { roleId: 'role_qa_mgr', resourceId: 'res_config', level: 'none', inherited: false },
  { roleId: 'role_qa_mgr', resourceId: 'res_data', level: 'read', inherited: false },
  { roleId: 'role_qa_mgr', resourceId: 'res_workflows', level: 'read', inherited: false },
  // Reviewer
  { roleId: 'role_reviewer', resourceId: 'res_ind', level: 'read', inherited: false },
  { roleId: 'role_reviewer', resourceId: 'res_nda', level: 'read', inherited: false },
  { roleId: 'role_reviewer', resourceId: 'res_protocols', level: 'read', inherited: false },
  { roleId: 'role_reviewer', resourceId: 'res_reports', level: 'read', inherited: false },
  { roleId: 'role_reviewer', resourceId: 'res_users', level: 'none', inherited: false },
  { roleId: 'role_reviewer', resourceId: 'res_roles', level: 'none', inherited: false },
  { roleId: 'role_reviewer', resourceId: 'res_audit', level: 'none', inherited: false },
  { roleId: 'role_reviewer', resourceId: 'res_config', level: 'none', inherited: false },
  { roleId: 'role_reviewer', resourceId: 'res_data', level: 'read', inherited: false },
  { roleId: 'role_reviewer', resourceId: 'res_workflows', level: 'none', inherited: false },
  // Viewer
  { roleId: 'role_viewer', resourceId: 'res_ind', level: 'read', inherited: false },
  { roleId: 'role_viewer', resourceId: 'res_nda', level: 'read', inherited: false },
  { roleId: 'role_viewer', resourceId: 'res_protocols', level: 'read', inherited: false },
  { roleId: 'role_viewer', resourceId: 'res_reports', level: 'read', inherited: false },
  { roleId: 'role_viewer', resourceId: 'res_users', level: 'none', inherited: false },
  { roleId: 'role_viewer', resourceId: 'res_roles', level: 'none', inherited: false },
  { roleId: 'role_viewer', resourceId: 'res_audit', level: 'none', inherited: false },
  { roleId: 'role_viewer', resourceId: 'res_config', level: 'none', inherited: false },
  { roleId: 'role_viewer', resourceId: 'res_data', level: 'none', inherited: false },
  { roleId: 'role_viewer', resourceId: 'res_workflows', level: 'none', inherited: false },
];

const MOCK_GAPS: AccessGap[] = [
  {
    type: 'missing',
    description: 'QA Manager cannot access workflow templates for audit purposes',
    affectedRole: 'QA Manager',
    affectedResource: 'Workflow Templates',
    recommendation: 'Grant read access to Workflow Templates for audit trail review',
  },
  {
    type: 'excessive',
    description:
      'Regulatory Specialist has write access to IND Applications without approval requirement',
    affectedRole: 'Regulatory Specialist',
    affectedResource: 'IND Applications',
    recommendation: 'Consider requiring approval workflow for IND modifications',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION CELL COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const PermissionCell: React.FC<{
  permission: Permission | undefined;
  onEdit: () => void;
  readonly?: boolean;
}> = ({ permission, onEdit, readonly }) => {
  const level = permission?.level || 'none';
  const config = PERMISSION_LEVELS[level];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-8 p-0 ${config.bgColor} hover:opacity-80`}
            onClick={onEdit}
            disabled={readonly}
          >
            <Icon className={`h-4 w-4 ${config.color}`} />
            {permission?.inherited && (
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-stone-1000 rounded-full" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{config.label}</p>
          {permission?.inherited && (
            <p className="text-xs text-muted-foreground">
              Inherited from {permission.inheritedFrom}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION MATRIX COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const PermissionMatrix: React.FC<{
  roles: Role[];
  resources: Resource[];
  permissions: Permission[];
  onEditPermission: (roleId: string, resourceId: string) => void;
  selectedCategory: ResourceCategory | 'all';
}> = ({ roles, resources, permissions, onEditPermission, selectedCategory }) => {
  const filteredResources = resources.filter(
    r => selectedCategory === 'all' || r.category === selectedCategory
  );

  const groupedResources = useMemo(() => {
    const groups: Record<ResourceCategory, Resource[]> = {
      documents: [],
      submissions: [],
      users: [],
      system: [],
      data: [],
      workflows: [],
    };
    filteredResources.forEach(r => {
      groups[r.category].push(r);
    });
    return groups;
  }, [filteredResources]);

  const getPermission = (roleId: string, resourceId: string): Permission | undefined => {
    return permissions.find(p => p.roleId === roleId && p.resourceId === resourceId);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left p-3 bg-muted font-medium sticky left-0 z-10 min-w-[200px]">
              Resource
            </th>
            {roles.map(role => (
              <th key={role.id} className="text-center p-2 bg-muted font-medium min-w-[100px]">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs">{role.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {role.userCount} users
                  </Badge>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupedResources).map(([category, categoryResources]) => {
            if (categoryResources.length === 0) return null;
            const config = CATEGORY_CONFIG[category as ResourceCategory];
            const CategoryIcon = config.icon;

            return (
              <React.Fragment key={category}>
                {/* Category Header */}
                <tr className="bg-muted/50">
                  <td colSpan={roles.length + 1} className="px-3 py-2 font-medium text-sm">
                    <div className="flex items-center gap-2">
                      <CategoryIcon className="h-4 w-4" />
                      {config.label}
                    </div>
                  </td>
                </tr>
                {/* Resources in Category */}
                {categoryResources.map(resource => (
                  <tr key={resource.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 sticky left-0 bg-background z-10">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{resource.name}</span>
                        {resource.isSensitive && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <ShieldAlert className="h-4 w-4 text-stone-1000" />
                              </TooltipTrigger>
                              <TooltipContent>Sensitive Resource</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{resource.description}</p>
                    </td>
                    {roles.map(role => (
                      <td key={role.id} className="p-2 text-center">
                        <PermissionCell
                          permission={getPermission(role.id, resource.id)}
                          onEdit={() => onEditPermission(role.id, resource.id)}
                          readonly={role.isSystem && role.id === 'role_admin'}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCESS GAP ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

const AccessGapAnalysis: React.FC<{ gaps: AccessGap[] }> = ({ gaps }) => {
  const gapTypeConfig: Record<
    AccessGap['type'],
    {
      label: string;
      color: string;
      bgColor: string;
      icon: React.ComponentType<{ className?: string }>;
    }
  > = {
    missing: {
      label: 'Missing Access',
      color: 'text-stone-700',
      bgColor: 'bg-stone-100',
      icon: AlertCircle,
    },
    excessive: {
      label: 'Excessive Access',
      color: 'text-stone-800',
      bgColor: 'bg-stone-100',
      icon: AlertTriangle,
    },
    conflict: {
      label: 'Conflict',
      color: 'text-stone-700',
      bgColor: 'bg-stone-100',
      icon: ShieldAlert,
    },
  };

  if (gaps.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <ShieldCheck className="h-12 w-12 mx-auto text-stone-700 mb-4" />
          <h3 className="font-semibold mb-2">No Access Gaps Detected</h3>
          <p className="text-muted-foreground">
            Your access control configuration appears to be well-defined
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {gaps.map((gap, index) => {
        const config = gapTypeConfig[gap.type];
        const Icon = config.icon;

        return (
          <Card key={index} className={`border-l-4 ${config.bgColor.replace('bg-', 'border-l-')}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg ${config.bgColor}`}>
                  <Icon className={`h-5 w-5 ${config.color}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={`${config.bgColor} ${config.color} border-0`}>
                      {config.label}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {gap.affectedRole} → {gap.affectedResource}
                    </span>
                  </div>
                  <p className="text-sm mb-2">{gap.description}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <HelpCircle className="h-4 w-4" />
                    <span>{gap.recommendation}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Fix
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION EDITOR DIALOG
// ─────────────────────────────────────────────────────────────────────────────

const PermissionEditorDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  roleId: string | null;
  resourceId: string | null;
  roles: Role[];
  resources: Resource[];
  currentPermission: Permission | undefined;
  onSave: (roleId: string, resourceId: string, level: PermissionLevel) => void;
}> = ({ open, onClose, roleId, resourceId, roles, resources, currentPermission, onSave }) => {
  const [selectedLevel, setSelectedLevel] = useState<PermissionLevel>(
    currentPermission?.level || 'none'
  );

  const role = roles.find(r => r.id === roleId);
  const resource = resources.find(r => r.id === resourceId);

  React.useEffect(() => {
    setSelectedLevel(currentPermission?.level || 'none');
  }, [currentPermission]);

  if (!role || !resource) return null;

  const handleSave = () => {
    onSave(roleId!, resourceId!, selectedLevel);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Permission</DialogTitle>
          <DialogDescription>
            Configure access level for {role.name} on {resource.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-muted-foreground">Role</p>
              <p className="font-medium">{role.name}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-muted-foreground">Resource</p>
              <p className="font-medium">{resource.name}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Permission Level</Label>
            <div className="grid grid-cols-5 gap-2">
              {(Object.keys(PERMISSION_LEVELS) as PermissionLevel[]).map(level => {
                const config = PERMISSION_LEVELS[level];
                const Icon = config.icon;
                return (
                  <Button
                    key={level}
                    variant={selectedLevel === level ? 'default' : 'outline'}
                    className={`flex flex-col h-auto py-3 ${
                      selectedLevel === level ? '' : config.bgColor
                    }`}
                    onClick={() => setSelectedLevel(level)}
                  >
                    <Icon className={`h-5 w-5 ${selectedLevel === level ? '' : config.color}`} />
                    <span className="text-xs mt-1">{config.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {resource.isSensitive && selectedLevel !== 'none' && (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                This is a sensitive resource. Access changes will be logged in the audit trail per
                FDA 21 CFR Part 11.10(e).
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <CheckCircle className="mr-2 h-4 w-4" />
            Save Permission
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION LEGEND
// ─────────────────────────────────────────────────────────────────────────────

const PermissionLegend: React.FC = () => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm">Permission Levels</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="flex flex-wrap gap-4">
        {(
          Object.entries(PERMISSION_LEVELS) as [
            PermissionLevel,
            (typeof PERMISSION_LEVELS)[PermissionLevel],
          ][]
        ).map(([level, config]) => {
          const Icon = config.icon;
          return (
            <div key={level} className="flex items-center gap-2">
              <div className={`p-1 rounded ${config.bgColor}`}>
                <Icon className={`h-4 w-4 ${config.color}`} />
              </div>
              <span className="text-sm">{config.label}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-2 border-l pl-4">
          <div className="relative">
            <div className="p-1 rounded bg-stone-100">
              <Check className="h-4 w-4 text-stone-400" />
            </div>
            <span className="absolute -top-1 -right-1 h-2 w-2 bg-stone-1000 rounded-full" />
          </div>
          <span className="text-sm">Inherited</span>
        </div>
      </div>
    </CardContent>
  </Card>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ACCESS CONTROL MATRIX COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const AccessControlMatrix: React.FC = () => {
  const [roles] = useState<Role[]>(MOCK_ROLES);
  const [resources] = useState<Resource[]>(MOCK_RESOURCES);
  const [permissions, setPermissions] = useState<Permission[]>(MOCK_PERMISSIONS);
  const [gaps] = useState<AccessGap[]>(MOCK_GAPS);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('matrix');
  const [selectedCategory, setSelectedCategory] = useState<ResourceCategory | 'all'>('all');
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editingResource, setEditingResource] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleEditPermission = (roleId: string, resourceId: string) => {
    setEditingRole(roleId);
    setEditingResource(resourceId);
  };

  const handleSavePermission = (roleId: string, resourceId: string, level: PermissionLevel) => {
    setPermissions(prev => {
      const existing = prev.find(p => p.roleId === roleId && p.resourceId === resourceId);
      if (existing) {
        return prev.map(p =>
          p.roleId === roleId && p.resourceId === resourceId ? { ...p, level } : p
        );
      }
      return [...prev, { roleId, resourceId, level, inherited: false }];
    });
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 500));
    setIsLoading(false);
  };

  const currentPermission = permissions.find(
    p => p.roleId === editingRole && p.resourceId === editingResource
  );

  return (
    <div
      className={`${isFullscreen ? 'fixed inset-0 z-50 bg-background p-4 overflow-auto' : 'container py-8'} space-y-6`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Access Control Matrix
          </h1>
          <p className="text-muted-foreground">
            Visual representation of role-based access control
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setIsFullscreen(!isFullscreen)}>
            {isFullscreen ? (
              <Minimize2 className="mr-2 h-4 w-4" />
            ) : (
              <Maximize2 className="mr-2 h-4 w-4" />
            )}
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-8 w-8 mx-auto text-stone-600 mb-2" />
            <p className="text-2xl font-bold">{roles.length}</p>
            <p className="text-sm text-muted-foreground">Roles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Database className="h-8 w-8 mx-auto text-stone-600 mb-2" />
            <p className="text-2xl font-bold">{resources.length}</p>
            <p className="text-sm text-muted-foreground">Resources</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Key className="h-8 w-8 mx-auto text-stone-700 mb-2" />
            <p className="text-2xl font-bold">{permissions.length}</p>
            <p className="text-sm text-muted-foreground">Permissions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-stone-600 mb-2" />
            <p className="text-2xl font-bold">{gaps.length}</p>
            <p className="text-sm text-muted-foreground">Access Gaps</p>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <PermissionLegend />

      {/* Gap Alert */}
      {gaps.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Access Gaps Detected</AlertTitle>
          <AlertDescription>
            {gaps.length} potential access control {gaps.length === 1 ? 'issue has' : 'issues have'}{' '}
            been identified. Review the Gap Analysis tab for recommendations.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="matrix">Permission Matrix</TabsTrigger>
          <TabsTrigger value="gaps">
            Gap Analysis
            {gaps.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {gaps.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="space-y-4">
          {/* Category Filter */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Label>Filter by Category:</Label>
                <Select
                  value={selectedCategory}
                  onValueChange={v => setSelectedCategory(v as ResourceCategory | 'all')}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Matrix */}
          <Card>
            <CardContent className="p-0">
              <PermissionMatrix
                roles={roles}
                resources={resources}
                permissions={permissions}
                onEditPermission={handleEditPermission}
                selectedCategory={selectedCategory}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gaps" className="space-y-4">
          <AccessGapAnalysis gaps={gaps} />
        </TabsContent>
      </Tabs>

      {/* Permission Editor Dialog */}
      <PermissionEditorDialog
        open={!!(editingRole && editingResource)}
        onClose={() => {
          setEditingRole(null);
          setEditingResource(null);
        }}
        roleId={editingRole}
        resourceId={editingResource}
        roles={roles}
        resources={resources}
        currentPermission={currentPermission}
        onSave={handleSavePermission}
      />
    </div>
  );
};

export default AccessControlMatrix;
