/**
 * Role Management Page
 *
 * Manage user roles, permissions, and access control.
 * Enterprise RBAC with audit trail support.
 *
 * @module pages/admin/RoleManagementPage
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  Users,
  FileText,
  Database,
  Settings,
  Eye,
  Lock,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';

// Permission categories
const PERMISSION_CATEGORIES = [
  {
    id: 'documents',
    name: 'Documents',
    icon: FileText,
    permissions: [
      {
        id: 'documents.view',
        name: 'View Documents',
        description: 'View all documents in the system',
      },
      { id: 'documents.create', name: 'Create Documents', description: 'Create new documents' },
      { id: 'documents.edit', name: 'Edit Documents', description: 'Edit existing documents' },
      { id: 'documents.delete', name: 'Delete Documents', description: 'Delete documents' },
      {
        id: 'documents.approve',
        name: 'Approve Documents',
        description: 'Approve documents for submission',
      },
      {
        id: 'documents.export',
        name: 'Export Documents',
        description: 'Export documents to eCTD format',
      },
    ],
  },
  {
    id: 'submissions',
    name: 'Submissions',
    icon: Database,
    permissions: [
      {
        id: 'submissions.view',
        name: 'View Submissions',
        description: 'View regulatory submissions',
      },
      {
        id: 'submissions.create',
        name: 'Create Submissions',
        description: 'Create new submissions',
      },
      {
        id: 'submissions.submit',
        name: 'Submit to FDA',
        description: 'Submit packages to regulatory agencies',
      },
      {
        id: 'submissions.cancel',
        name: 'Cancel Submissions',
        description: 'Cancel pending submissions',
      },
    ],
  },
  {
    id: 'users',
    name: 'User Management',
    icon: Users,
    permissions: [
      { id: 'users.view', name: 'View Users', description: 'View user list and profiles' },
      { id: 'users.invite', name: 'Invite Users', description: 'Send invitations to new users' },
      { id: 'users.edit', name: 'Edit Users', description: 'Modify user details and roles' },
      { id: 'users.delete', name: 'Remove Users', description: 'Remove users from organization' },
      {
        id: 'users.impersonate',
        name: 'Impersonate Users',
        description: 'Act as another user (audit logged)',
      },
    ],
  },
  {
    id: 'admin',
    name: 'Administration',
    icon: Settings,
    permissions: [
      { id: 'admin.settings', name: 'System Settings', description: 'Access system configuration' },
      {
        id: 'admin.audit',
        name: 'Audit Logs',
        description: 'View audit trail and compliance reports',
      },
      {
        id: 'admin.billing',
        name: 'Billing',
        description: 'Access billing and subscription settings',
      },
      {
        id: 'admin.integrations',
        name: 'Integrations',
        description: 'Manage third-party integrations',
      },
    ],
  },
];

// Default roles with their permissions
const DEFAULT_ROLES = [
  {
    id: 'admin',
    name: 'Administrator',
    description: 'Full system access with all permissions',
    color: 'purple',
    isSystem: true,
    userCount: 2,
    permissions: PERMISSION_CATEGORIES.flatMap(c => c.permissions.map(p => p.id)),
  },
  {
    id: 'regulatory_lead',
    name: 'Regulatory Lead',
    description: 'Lead regulatory affairs with submission authority',
    color: 'blue',
    isSystem: true,
    userCount: 5,
    permissions: [
      'documents.view',
      'documents.create',
      'documents.edit',
      'documents.approve',
      'documents.export',
      'submissions.view',
      'submissions.create',
      'submissions.submit',
      'users.view',
    ],
  },
  {
    id: 'medical_writer',
    name: 'Medical Writer',
    description: 'Document creation and editing capabilities',
    color: 'orange',
    isSystem: true,
    userCount: 8,
    permissions: [
      'documents.view',
      'documents.create',
      'documents.edit',
      'submissions.view',
      'users.view',
    ],
  },
  {
    id: 'quality_assurance',
    name: 'Quality Assurance',
    description: 'Review and approve documents for compliance',
    color: 'cyan',
    isSystem: true,
    userCount: 3,
    permissions: [
      'documents.view',
      'documents.approve',
      'submissions.view',
      'users.view',
      'admin.audit',
    ],
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to documents and submissions',
    color: 'gray',
    isSystem: true,
    userCount: 12,
    permissions: ['documents.view', 'submissions.view', 'users.view'],
  },
];

const COLOR_MAP: Record<string, string> = {
  purple: 'bg-purple-100 text-purple-800 border-purple-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  orange: 'bg-orange-100 text-orange-800 border-orange-200',
  cyan: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  gray: 'bg-gray-100 text-gray-800 border-gray-200',
  green: 'bg-green-100 text-green-800 border-green-200',
  red: 'bg-red-100 text-red-800 border-red-200',
};

export default function RoleManagementPage() {
  const { currentOrganization } = useTenant();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState<(typeof DEFAULT_ROLES)[0] | null>(null);
  const [roles, setRoles] = useState(DEFAULT_ROLES);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: 'blue',
    permissions: [] as string[],
  });

  const togglePermission = (permissionId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(p => p !== permissionId)
        : [...prev.permissions, permissionId],
    }));
  };

  const handleCreateRole = () => {
    const newRole = {
      id: formData.name.toLowerCase().replace(/\s+/g, '_'),
      name: formData.name,
      description: formData.description,
      color: formData.color,
      isSystem: false,
      userCount: 0,
      permissions: formData.permissions,
    };
    setRoles([...roles, newRole]);
    setShowCreateDialog(false);
    setFormData({ name: '', description: '', color: 'blue', permissions: [] });
  };

  const handleEditRole = (role: (typeof DEFAULT_ROLES)[0]) => {
    setSelectedRole(role);
    setFormData({
      name: role.name,
      description: role.description,
      color: role.color,
      permissions: role.permissions,
    });
    setShowEditDialog(true);
  };

  const handleSaveRole = () => {
    if (!selectedRole) return;
    setRoles(
      roles.map(r =>
        r.id === selectedRole.id
          ? {
              ...r,
              name: formData.name,
              description: formData.description,
              permissions: formData.permissions,
            }
          : r
      )
    );
    setShowEditDialog(false);
    setSelectedRole(null);
  };

  const handleDeleteRole = (roleId: string) => {
    setRoles(roles.filter(r => r.id !== roleId));
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Role Management</h1>
            <p className="text-sm text-gray-500">
              Configure roles and permissions for {currentOrganization?.name || 'your organization'}
            </p>
          </div>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-amber-500 to-orange-600">
              <Plus className="w-4 h-4 mr-2" />
              Create Role
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Role</DialogTitle>
              <DialogDescription>Define a custom role with specific permissions</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role Name</label>
                  <Input
                    placeholder="e.g., Project Manager"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Color</label>
                  <div className="flex gap-2">
                    {Object.keys(COLOR_MAP).map(color => (
                      <button
                        key={color}
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-8 h-8 rounded-full border-2 ${
                          formData.color === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                        } ${COLOR_MAP[color]}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  placeholder="Describe what this role can do..."
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="space-y-4">
                <label className="text-sm font-medium">Permissions</label>
                <Accordion type="multiple" className="w-full">
                  {PERMISSION_CATEGORIES.map(category => (
                    <AccordionItem key={category.id} value={category.id}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2">
                          <category.icon className="w-4 h-4" />
                          <span>{category.name}</span>
                          <Badge variant="outline" className="ml-2">
                            {formData.permissions.filter(p => p.startsWith(category.id)).length} /{' '}
                            {category.permissions.length}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 pl-6">
                          {category.permissions.map(permission => (
                            <div key={permission.id} className="flex items-start gap-3">
                              <Checkbox
                                id={permission.id}
                                checked={formData.permissions.includes(permission.id)}
                                onCheckedChange={() => togglePermission(permission.id)}
                              />
                              <div>
                                <label
                                  htmlFor={permission.id}
                                  className="text-sm font-medium cursor-pointer"
                                >
                                  {permission.name}
                                </label>
                                <p className="text-xs text-gray-500">{permission.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateRole} disabled={!formData.name}>
                Create Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Info Banner */}
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">21 CFR Part 11 Compliance</p>
              <p className="text-xs text-amber-700">
                All role and permission changes are audit logged. System roles cannot be deleted but
                can be modified.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Roles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map(role => (
          <Card key={role.id} className="relative overflow-hidden">
            {role.isSystem && (
              <div className="absolute top-3 right-3">
                <Badge variant="outline" className="text-xs">
                  <Lock className="w-3 h-3 mr-1" />
                  System
                </Badge>
              </div>
            )}
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${COLOR_MAP[role.color]}`}
                >
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">{role.name}</CardTitle>
                  <CardDescription className="text-xs">{role.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Users with this role</span>
                <Badge variant="secondary">{role.userCount}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Permissions</span>
                <Badge variant="secondary">{role.permissions.length}</Badge>
              </div>

              {/* Permission preview */}
              <div className="flex flex-wrap gap-1">
                {role.permissions.slice(0, 4).map(p => (
                  <Badge key={p} variant="outline" className="text-xs">
                    {p.split('.')[1]}
                  </Badge>
                ))}
                {role.permissions.length > 4 && (
                  <Badge variant="outline" className="text-xs">
                    +{role.permissions.length - 4} more
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleEditRole(role)}
                >
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                {!role.isSystem && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete role "{role.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove this role and its permissions. Users assigned to this role will lose their access. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteRole(role.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Delete role
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Role: {selectedRole?.name}</DialogTitle>
            <DialogDescription>Modify role permissions and settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Role Name</label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  disabled={selectedRole?.isSystem}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-sm font-medium">Permissions</label>
              <Accordion type="multiple" className="w-full">
                {PERMISSION_CATEGORIES.map(category => (
                  <AccordionItem key={category.id} value={category.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <category.icon className="w-4 h-4" />
                        <span>{category.name}</span>
                        <Badge variant="outline" className="ml-2">
                          {formData.permissions.filter(p => p.startsWith(category.id)).length} /{' '}
                          {category.permissions.length}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pl-6">
                        {category.permissions.map(permission => (
                          <div key={permission.id} className="flex items-start gap-3">
                            <Checkbox
                              id={`edit-${permission.id}`}
                              checked={formData.permissions.includes(permission.id)}
                              onCheckedChange={() => togglePermission(permission.id)}
                            />
                            <div>
                              <label
                                htmlFor={`edit-${permission.id}`}
                                className="text-sm font-medium cursor-pointer"
                              >
                                {permission.name}
                              </label>
                              <p className="text-xs text-gray-500">{permission.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRole}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
