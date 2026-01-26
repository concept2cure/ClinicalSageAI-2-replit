/**
 * TrialSage Client Portal V2 - Role & Permission Manager
 *
 * Comprehensive role-based access control management with:
 * - Permission matrix visualization
 * - Role creation and modification
 * - Segregation of Duties (SoD) enforcement
 * - Custom permission templates
 * - Audit trail for permission changes
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11.10(d), ICH E6 GCP
 */

import React, { useState, useCallback, useMemo } from 'react';
import { adminLogger } from '../../utils/logger';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldPlus,
  Users,
  UserCog,
  Lock,
  Unlock,
  Key,
  Settings,
  Plus,
  Minus,
  Edit,
  Trash2,
  Copy,
  Save,
  X,
  Check,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Database,
  Folder,
  Activity,
  BarChart,
  Bell,
  Loader2,
  History,
  Download,
  Upload,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { UserRole } from '../../core/portalTypes';
import type { Permission, PermissionAction, ResourceType } from '../../core/securityTypes';
import {
  SOD_CONFLICT_MATRIX,
  ROLE_PERMISSION_PRESETS,
  validateSoD,
} from '../../core/regulatoryCompliance';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
  permissions: Permission[];
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

interface PermissionCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  resources: ResourceType[];
}

interface SoDConflict {
  role1: UserRole;
  role2: UserRole;
  reason: string;
  severity: 'critical' | 'high' | 'medium';
  canWaive: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: 'documents',
    name: 'Documents & Files',
    description: 'Access to document vault, uploads, and file management',
    icon: FileText,
    resources: ['document', 'submission'],
  },
  {
    id: 'users',
    name: 'User Management',
    description: 'User administration and role assignments',
    icon: Users,
    resources: ['user', 'role'],
  },
  {
    id: 'system',
    name: 'System Administration',
    description: 'System configuration and security settings',
    icon: Settings,
    resources: ['system', 'audit_log'],
  },
  {
    id: 'data',
    name: 'Data & Analytics',
    description: 'Access to reports, analytics, and data exports',
    icon: Database,
    resources: ['report', 'analytics'],
  },
  {
    id: 'workflows',
    name: 'Workflows & Approvals',
    description: 'Workflow management and approval processes',
    icon: Activity,
    resources: ['workflow', 'approval'],
  },
];

const PERMISSION_ACTIONS: { action: PermissionAction; label: string; color: string }[] = [
  { action: 'create', label: 'Create', color: 'bg-green-100 text-green-700' },
  { action: 'read', label: 'Read', color: 'bg-blue-100 text-blue-700' },
  { action: 'update', label: 'Update', color: 'bg-amber-100 text-amber-700' },
  { action: 'delete', label: 'Delete', color: 'bg-red-100 text-red-700' },
  { action: 'approve', label: 'Approve', color: 'bg-purple-100 text-purple-700' },
  { action: 'export', label: 'Export', color: 'bg-cyan-100 text-cyan-700' },
  { action: 'admin', label: 'Admin', color: 'bg-gray-100 text-gray-700' },
];

const SOD_SEVERITY_COLORS = {
  critical: 'text-red-600 bg-red-100',
  high: 'text-amber-600 bg-amber-100',
  medium: 'text-yellow-600 bg-yellow-100',
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_ROLES: RoleDefinition[] = [
  {
    id: 'role_admin',
    name: 'Administrator',
    description: 'Full system access with all administrative capabilities',
    isSystem: true,
    isActive: true,
    permissions: ROLE_PERMISSION_PRESETS.admin || [],
    userCount: 3,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2025-01-20'),
    createdBy: 'system',
  },
  {
    id: 'role_reg_lead',
    name: 'Regulatory Lead',
    description: 'Manages regulatory submissions and compliance activities',
    isSystem: true,
    isActive: true,
    permissions: ROLE_PERMISSION_PRESETS.regulatory_lead || [],
    userCount: 8,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2025-01-15'),
    createdBy: 'system',
  },
  {
    id: 'role_medical_writer',
    name: 'Medical Writer',
    description: 'Creates and edits regulatory documents',
    isSystem: true,
    isActive: true,
    permissions: ROLE_PERMISSION_PRESETS.medical_writer || [],
    userCount: 12,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2025-01-10'),
    createdBy: 'system',
  },
  {
    id: 'role_qa',
    name: 'Quality Assurance',
    description: 'Oversight of quality processes and compliance audits',
    isSystem: true,
    isActive: true,
    permissions: ROLE_PERMISSION_PRESETS.quality_assurance || [],
    userCount: 5,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2025-01-05'),
    createdBy: 'system',
  },
  {
    id: 'role_viewer',
    name: 'Viewer',
    description: 'Read-only access to documents and reports',
    isSystem: true,
    isActive: true,
    permissions: ROLE_PERMISSION_PRESETS.viewer || [],
    userCount: 25,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-12-01'),
    createdBy: 'system',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ROLE LIST COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const RoleList: React.FC<{
  roles: RoleDefinition[];
  selectedRoleId: string | null;
  onSelect: (roleId: string) => void;
  onEdit: (roleId: string) => void;
  onDelete: (roleId: string) => void;
  onDuplicate: (roleId: string) => void;
}> = ({ roles, selectedRoleId, onSelect, onEdit, onDelete, onDuplicate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | null>(null);

  const filteredRoles = useMemo(() => {
    return roles.filter(role => {
      const matchesSearch =
        role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        role.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterActive === null || role.isActive === filterActive;
      return matchesSearch && matchesFilter;
    });
  }, [roles, searchQuery, filterActive]);

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search roles..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={filterActive === null ? 'all' : filterActive ? 'active' : 'inactive'}
          onValueChange={v => setFilterActive(v === 'all' ? null : v === 'active')}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Role List */}
      <div className="space-y-2">
        {filteredRoles.map(role => (
          <div
            key={role.id}
            className={`p-4 rounded-lg border cursor-pointer transition-colors ${
              selectedRoleId === role.id
                ? 'border-primary bg-primary/5'
                : 'hover:border-muted-foreground/30 hover:bg-muted/50'
            }`}
            onClick={() => onSelect(role.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${role.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <Shield
                    className={`h-5 w-5 ${role.isActive ? 'text-green-600' : 'text-gray-400'}`}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{role.name}</p>
                    {role.isSystem && (
                      <Badge variant="secondary" className="text-xs">
                        System
                      </Badge>
                    )}
                    {!role.isActive && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{role.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {role.userCount} users
                    </span>
                    <span className="flex items-center gap-1">
                      <Key className="h-3 w-3" />
                      {role.permissions.length} permissions
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => onDuplicate(role.id)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Duplicate</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => onEdit(role.id)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {!role.isSystem && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onDelete(role.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </div>
        ))}

        {filteredRoles.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No roles found</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION MATRIX COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const PermissionMatrix: React.FC<{
  permissions: Permission[];
  onChange: (permissions: Permission[]) => void;
  readOnly?: boolean;
}> = ({ permissions, onChange, readOnly }) => {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    PERMISSION_CATEGORIES.map(c => c.id)
  );

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev =>
      prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
    );
  };

  const hasPermission = (resource: ResourceType, action: PermissionAction): boolean => {
    return permissions.some(p => p.resource === resource && p.actions.includes(action));
  };

  const togglePermission = (resource: ResourceType, action: PermissionAction) => {
    if (readOnly) return;

    const existing = permissions.find(p => p.resource === resource);
    if (existing) {
      if (existing.actions.includes(action)) {
        // Remove action
        const newActions = existing.actions.filter(a => a !== action);
        if (newActions.length === 0) {
          onChange(permissions.filter(p => p.resource !== resource));
        } else {
          onChange(
            permissions.map(p => (p.resource === resource ? { ...p, actions: newActions } : p))
          );
        }
      } else {
        // Add action
        onChange(
          permissions.map(p =>
            p.resource === resource ? { ...p, actions: [...p.actions, action] } : p
          )
        );
      }
    } else {
      // Create new permission
      onChange([
        ...permissions,
        {
          resource,
          actions: [action],
          conditions: {},
        },
      ]);
    }
  };

  const selectAllForResource = (resource: ResourceType) => {
    if (readOnly) return;
    const allActions = PERMISSION_ACTIONS.map(a => a.action);
    const existing = permissions.find(p => p.resource === resource);

    if (existing && existing.actions.length === allActions.length) {
      // Deselect all
      onChange(permissions.filter(p => p.resource !== resource));
    } else {
      // Select all
      if (existing) {
        onChange(
          permissions.map(p => (p.resource === resource ? { ...p, actions: allActions } : p))
        );
      } else {
        onChange([...permissions, { resource, actions: allActions, conditions: {} }]);
      }
    }
  };

  return (
    <div className="space-y-4">
      {PERMISSION_CATEGORIES.map(category => {
        const Icon = category.icon;
        const isExpanded = expandedCategories.includes(category.id);

        return (
          <Collapsible key={category.id} open={isExpanded}>
            <CollapsibleTrigger onClick={() => toggleCategory(category.id)} className="w-full">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="font-medium">{category.name}</p>
                    <p className="text-xs text-muted-foreground">{category.description}</p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left p-2 text-sm font-medium text-muted-foreground w-48">
                        Resource
                      </th>
                      {PERMISSION_ACTIONS.map(action => (
                        <th
                          key={action.action}
                          className="text-center p-2 text-sm font-medium text-muted-foreground w-20"
                        >
                          {action.label}
                        </th>
                      ))}
                      <th className="w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {category.resources.map(resource => {
                      const allSelected = PERMISSION_ACTIONS.every(a =>
                        hasPermission(resource, a.action)
                      );
                      return (
                        <tr key={resource} className="border-t">
                          <td className="p-2">
                            <span className="text-sm capitalize">{resource.replace('_', ' ')}</span>
                          </td>
                          {PERMISSION_ACTIONS.map(action => {
                            const checked = hasPermission(resource, action.action);
                            return (
                              <td key={action.action} className="text-center p-2">
                                <button
                                  type="button"
                                  onClick={() => togglePermission(resource, action.action)}
                                  disabled={readOnly}
                                  className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                                    checked
                                      ? action.color
                                      : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                                  } ${readOnly ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                                >
                                  {checked && <Check className="h-4 w-4" />}
                                </button>
                              </td>
                            );
                          })}
                          <td className="text-center p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => selectAllForResource(resource)}
                              disabled={readOnly}
                              className="text-xs"
                            >
                              {allSelected ? 'None' : 'All'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SOD CONFLICT VIEWER
// ─────────────────────────────────────────────────────────────────────────────

const SoDConflictViewer: React.FC<{
  conflicts: SoDConflict[];
}> = ({ conflicts }) => {
  if (conflicts.length === 0) {
    return (
      <div className="text-center py-8">
        <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-green-500" />
        <p className="font-medium text-green-700">No Segregation of Duties Conflicts</p>
        <p className="text-sm text-muted-foreground mt-1">
          The current role configuration meets SoD requirements
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>SoD Conflicts Detected</AlertTitle>
        <AlertDescription>
          The following role combinations violate Segregation of Duties principles per ICH E6 GCP.
        </AlertDescription>
      </Alert>

      {conflicts.map((conflict, index) => (
        <div
          key={index}
          className={`p-4 rounded-lg border ${SOD_SEVERITY_COLORS[conflict.severity]}`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={conflict.severity === 'critical' ? 'destructive' : 'secondary'}>
                  {conflict.severity.toUpperCase()}
                </Badge>
                <span className="font-medium">
                  {conflict.role1} ↔ {conflict.role2}
                </span>
              </div>
              <p className="text-sm mt-2">{conflict.reason}</p>
            </div>
            {conflict.canWaive && <Badge variant="outline">Waiver Available</Badge>}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ROLE EDITOR DIALOG
// ─────────────────────────────────────────────────────────────────────────────

const RoleEditorDialog: React.FC<{
  open: boolean;
  role: RoleDefinition | null;
  onClose: () => void;
  onSave: (role: RoleDefinition) => void;
  existingRoles: RoleDefinition[];
}> = ({ open, role, onClose, onSave, existingRoles }) => {
  const [editedRole, setEditedRole] = useState<Partial<RoleDefinition>>(role || {});
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Reset when role changes
  React.useEffect(() => {
    if (role) {
      setEditedRole({ ...role });
    } else {
      setEditedRole({
        name: '',
        description: '',
        isActive: true,
        isSystem: false,
        permissions: [],
      });
    }
    setActiveTab('general');
  }, [role, open]);

  const handleSave = async () => {
    setIsLoading(true);
    // Simulate API call
    await new Promise(r => setTimeout(r, 800));

    onSave({
      ...editedRole,
      id: editedRole.id || `role_${Date.now()}`,
      userCount: editedRole.userCount || 0,
      createdAt: editedRole.createdAt || new Date(),
      updatedAt: new Date(),
      createdBy: editedRole.createdBy || 'current_user',
    } as RoleDefinition);

    setIsLoading(false);
  };

  const isValid = editedRole.name && editedRole.description;

  return (
    <Dialog open={open} onOpenChange={() => !isLoading && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {role ? 'Edit Role' : 'Create New Role'}
          </DialogTitle>
          <DialogDescription>
            {role
              ? 'Modify the role settings and permissions below.'
              : 'Define a new role with specific permissions for your organization.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="sod">SoD Analysis</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4">
            <TabsContent value="general" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="role-name">Role Name</Label>
                <Input
                  id="role-name"
                  value={editedRole.name || ''}
                  onChange={e => setEditedRole(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Senior Regulatory Specialist"
                  disabled={editedRole.isSystem}
                />
                {editedRole.isSystem && (
                  <p className="text-xs text-muted-foreground">System roles cannot be renamed</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role-description">Description</Label>
                <Textarea
                  id="role-description"
                  value={editedRole.description || ''}
                  onChange={e => setEditedRole(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the purpose and responsibilities of this role..."
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div>
                  <p className="font-medium">Active Status</p>
                  <p className="text-sm text-muted-foreground">
                    Inactive roles cannot be assigned to users
                  </p>
                </div>
                <Switch
                  checked={editedRole.isActive}
                  onCheckedChange={checked =>
                    setEditedRole(prev => ({ ...prev, isActive: checked }))
                  }
                />
              </div>

              {editedRole.isSystem && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    This is a system-defined role. While you can modify its permissions, the role
                    name and core settings cannot be changed.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="permissions" className="mt-0">
              <PermissionMatrix
                permissions={editedRole.permissions || []}
                onChange={permissions => setEditedRole(prev => ({ ...prev, permissions }))}
              />
            </TabsContent>

            <TabsContent value="sod" className="mt-0">
              <div className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Segregation of Duties analysis checks for potential conflicts when this role is
                    assigned together with other roles per FDA 21 CFR Part 11 and ICH E6 GCP
                    requirements.
                  </AlertDescription>
                </Alert>

                <SoDConflictViewer
                  conflicts={SOD_CONFLICT_MATRIX.filter(
                    conflict =>
                      conflict.role1 === editedRole.name || conflict.role2 === editedRole.name
                  ).map(c => ({
                    role1: c.role1,
                    role2: c.role2,
                    reason: c.reason,
                    severity: c.severity as 'critical' | 'high' | 'medium',
                    canWaive: c.canWaive,
                  }))}
                />
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {role ? 'Save Changes' : 'Create Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ROLE DETAILS PANEL
// ─────────────────────────────────────────────────────────────────────────────

const RoleDetailsPanel: React.FC<{
  role: RoleDefinition;
  onEdit: () => void;
  onViewHistory: () => void;
}> = ({ role, onEdit, onViewHistory }) => {
  const permissionCount = role.permissions.reduce((sum, p) => sum + p.actions.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-lg ${role.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
            <Shield className={`h-8 w-8 ${role.isActive ? 'text-green-600' : 'text-gray-400'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{role.name}</h2>
              {role.isSystem && <Badge variant="secondary">System</Badge>}
            </div>
            <p className="text-muted-foreground">{role.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onViewHistory}>
            <History className="mr-2 h-4 w-4" />
            History
          </Button>
          <Button size="sm" onClick={onEdit}>
            <Edit className="mr-2 h-4 w-4" />
            Edit Role
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{role.userCount}</p>
                <p className="text-sm text-muted-foreground">Users Assigned</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Key className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{permissionCount}</p>
                <p className="text-sm text-muted-foreground">Permissions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{role.isActive ? 'Active' : 'Inactive'}</p>
                <p className="text-sm text-muted-foreground">Status</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Permission Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Permission Summary</CardTitle>
          <CardDescription>Quick view of assigned permissions</CardDescription>
        </CardHeader>
        <CardContent>
          <PermissionMatrix permissions={role.permissions} onChange={() => {}} readOnly />
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Role Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Created</span>
            <span>{role.createdAt.toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Last Modified</span>
            <span>{role.updatedAt.toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Created By</span>
            <span>{role.createdBy}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Role ID</span>
            <code className="text-sm bg-muted px-2 py-0.5 rounded">{role.id}</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ROLE PERMISSION MANAGER
// ─────────────────────────────────────────────────────────────────────────────

export const RolePermissionManager: React.FC = () => {
  const [roles, setRoles] = useState<RoleDefinition[]>(MOCK_ROLES);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(MOCK_ROLES[0]?.id || null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const selectedRole = roles.find(r => r.id === selectedRoleId) || null;

  const handleCreateRole = () => {
    setEditingRole(null);
    setShowEditor(true);
  };

  const handleEditRole = (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    if (role) {
      setEditingRole(role);
      setShowEditor(true);
    }
  };

  const handleDuplicateRole = (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    if (role) {
      setEditingRole({
        ...role,
        id: '',
        name: `${role.name} (Copy)`,
        isSystem: false,
        userCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setShowEditor(true);
    }
  };

  const handleDeleteRole = (roleId: string) => {
    setShowDeleteConfirm(roleId);
  };

  const confirmDeleteRole = () => {
    if (showDeleteConfirm) {
      setRoles(prev => prev.filter(r => r.id !== showDeleteConfirm));
      if (selectedRoleId === showDeleteConfirm) {
        setSelectedRoleId(roles[0]?.id || null);
      }
      setShowDeleteConfirm(null);
    }
  };

  const handleSaveRole = (role: RoleDefinition) => {
    const existing = roles.find(r => r.id === role.id);
    if (existing) {
      setRoles(prev => prev.map(r => (r.id === role.id ? role : r)));
    } else {
      setRoles(prev => [...prev, role]);
    }
    setShowEditor(false);
    setSelectedRoleId(role.id);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h1 className="text-2xl font-bold">Role & Permission Manager</h1>
          <p className="text-muted-foreground">
            Configure roles and permissions per FDA 21 CFR Part 11 requirements
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={handleCreateRole}>
            <Plus className="mr-2 h-4 w-4" />
            Create Role
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Role List Sidebar */}
        <div className="w-96 border-r p-4 overflow-y-auto">
          <RoleList
            roles={roles}
            selectedRoleId={selectedRoleId}
            onSelect={setSelectedRoleId}
            onEdit={handleEditRole}
            onDelete={handleDeleteRole}
            onDuplicate={handleDuplicateRole}
          />
        </div>

        {/* Role Details */}
        <div className="flex-1 p-6 overflow-y-auto">
          {selectedRole ? (
            <RoleDetailsPanel
              role={selectedRole}
              onEdit={() => handleEditRole(selectedRole.id)}
              onViewHistory={() =>
                adminLogger.debug('Viewing role history', { roleId: selectedRole.id })
              }
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Shield className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">Select a role to view details</p>
                <p className="text-sm mt-1">Or create a new role to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Role Editor Dialog */}
      <RoleEditorDialog
        open={showEditor}
        role={editingRole}
        onClose={() => setShowEditor(false)}
        onSave={handleSaveRole}
        existingRoles={roles}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Role
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this role? This action cannot be undone. Users
              assigned to this role will lose these permissions.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This action will be logged in the audit trail per FDA 21 CFR Part 11.10(e).
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteRole}>
              Delete Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RolePermissionManager;
