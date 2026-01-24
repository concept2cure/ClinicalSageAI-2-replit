import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Users,
  Shield,
  FileText,
  Settings,
  User,
  PlusCircle,
  Edit,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  BarChart2,
  FileBarChart,
  Calendar,
  Download,
} from 'lucide-react';
import { queryClient, apiRequest } from '../../lib/queryClient';
import { useToast } from '../../hooks/use-toast';

/**
 * Staff Oversight Panel Component
 *
 * Administrative interface for managing staff security privileges:
 * - Role assignment and management
 * - User permission oversight
 * - Security audit reports
 * - Privilege management
 */
export default function StaffOversightPanel() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('users');
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [userRoleModalOpen, setUserRoleModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItems, setExpandedItems] = useState({});

  // Query for all users
  const {
    data: users,
    isLoading: isLoadingUsers,
    error: usersError,
  } = useQuery({
    queryKey: ['/api/security/users'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/security/users');
      return res.json();
    },
  });

  // Query for all roles
  const {
    data: roles,
    isLoading: isLoadingRoles,
    error: rolesError,
  } = useQuery({
    queryKey: ['/api/security/roles'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/security/roles');
      return res.json();
    },
  });

  // Query for all permissions
  const {
    data: permissions,
    isLoading: isLoadingPermissions,
    error: permissionsError,
  } = useQuery({
    queryKey: ['/api/security/permissions'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/security/permissions');
      return res.json();
    },
  });

  // Mutation for creating a new role
  const createRoleMutation = useMutation({
    mutationFn: async roleData => {
      const res = await apiRequest('POST', '/api/security/roles', roleData);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Role created successfully',
        description: 'The new role has been added to the system.',
      });
      queryClient.invalidateQueries(['/api/security/roles']);
      setRoleModalOpen(false);
    },
    onError: error => {
      toast({
        title: 'Failed to create role',
        description: error.message || 'An error occurred while creating the role.',
        variant: 'destructive',
      });
    },
  });

  // Mutation for updating a role
  const updateRoleMutation = useMutation({
    mutationFn: async ({ roleId, roleData }) => {
      const res = await apiRequest('PUT', `/api/security/roles/${roleId}`, roleData);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Role updated successfully',
        description: 'The role has been updated in the system.',
      });
      queryClient.invalidateQueries(['/api/security/roles']);
      setRoleModalOpen(false);
    },
    onError: error => {
      toast({
        title: 'Failed to update role',
        description: error.message || 'An error occurred while updating the role.',
        variant: 'destructive',
      });
    },
  });

  // Mutation for deleting a role
  const deleteRoleMutation = useMutation({
    mutationFn: async roleId => {
      await apiRequest('DELETE', `/api/security/roles/${roleId}`);
    },
    onSuccess: () => {
      toast({
        title: 'Role deleted successfully',
        description: 'The role has been removed from the system.',
      });
      queryClient.invalidateQueries(['/api/security/roles']);
    },
    onError: error => {
      toast({
        title: 'Failed to delete role',
        description: error.message || 'An error occurred while deleting the role.',
        variant: 'destructive',
      });
    },
  });

  // Mutation for assigning roles to a user
  const assignRolesMutation = useMutation({
    mutationFn: async ({ userId, roleIds }) => {
      await apiRequest('POST', `/api/security/users/${userId}/roles`, { roleIds });
    },
    onSuccess: () => {
      toast({
        title: 'Roles assigned successfully',
        description: "The user's roles have been updated.",
      });
      queryClient.invalidateQueries(['/api/security/users']);
      setUserRoleModalOpen(false);
    },
    onError: error => {
      toast({
        title: 'Failed to assign roles',
        description: error.message || 'An error occurred while assigning roles.',
        variant: 'destructive',
      });
    },
  });

  // Mutation for generating a staff oversight report
  const generateReportMutation = useMutation({
    mutationFn: async reportOptions => {
      const res = await apiRequest('POST', '/api/security/reports/staff-oversight', reportOptions);
      return res.json();
    },
    onSuccess: data => {
      toast({
        title: 'Report generated successfully',
        description: `${data.reportType} report is ready to view.`,
      });
      setReportModalOpen(false);
      // Here you could also save the report or display it
    },
    onError: error => {
      toast({
        title: 'Failed to generate report',
        description: error.message || 'An error occurred while generating the report.',
        variant: 'destructive',
      });
    },
  });

  // Filtered users based on search term
  const filteredUsers = users
    ? users.filter(
        user =>
          user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  // Function to toggle item expansion
  const toggleExpand = id => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Handle role form submission
  const handleRoleSubmit = e => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const roleData = {
      name: formData.get('name'),
      description: formData.get('description'),
      level: parseInt(formData.get('level')),
      permissions: Array.from(document.querySelectorAll('input[name="permissions"]:checked')).map(
        el => el.value
      ),
    };

    if (selectedRole) {
      updateRoleMutation.mutate({ roleId: selectedRole.id, roleData });
    } else {
      createRoleMutation.mutate(roleData);
    }
  };

  // Handle user role assignment
  const handleAssignRoles = e => {
    e.preventDefault();

    const roleIds = Array.from(document.querySelectorAll('input[name="userRoles"]:checked')).map(
      el => el.value
    );

    assignRolesMutation.mutate({
      userId: selectedUser.id,
      roleIds,
    });
  };

  // Handle report generation
  const handleGenerateReport = e => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const reportOptions = {
      reportType: formData.get('reportType'),
      startDate: formData.get('startDate'),
      endDate: formData.get('endDate'),
      roles: Array.from(document.querySelectorAll('input[name="reportRoles"]:checked')).map(
        el => el.value
      ),
    };

    generateReportMutation.mutate(reportOptions);
  };

  // Open role modal for editing
  const openEditRoleModal = role => {
    setSelectedRole(role);
    setRoleModalOpen(true);
  };

  // Open role modal for creation
  const openNewRoleModal = () => {
    setSelectedRole(null);
    setRoleModalOpen(true);
  };

  // Open user role modal
  const openUserRoleModal = user => {
    setSelectedUser(user);
    setUserRoleModalOpen(true);
  };

  // Open report generation modal
  const openReportModal = () => {
    setReportModalOpen(true);
  };

  // Format permission description for display
  const formatPermissionDescription = permission => {
    return permission
      .replace(/_/g, ' ')
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Get user's roles as a comma-separated string
  const getUserRoles = user => {
    if (!user || !user.roles || !roles) return '';

    return user.roles
      .map(roleId => {
        const role = roles.find(r => r.id === roleId);
        return role ? role.name : roleId;
      })
      .join(', ');
  };

  // Check if any required data is loading
  const isLoading = isLoadingUsers || isLoadingRoles || isLoadingPermissions;

  // Check for errors
  const hasError = usersError || rolesError || permissionsError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="animate-spin w-8 h-8 border-4 border-hotpink-500 border-t-transparent rounded-full"
          aria-label="Loading"
        />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-700">
        <h3 className="text-lg font-semibold mb-2">Error Loading Data</h3>
        <p>
          {usersError?.message ||
            rolesError?.message ||
            permissionsError?.message ||
            'An error occurred while loading data.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-hotpink-700 flex items-center">
          <Shield className="mr-2 h-5 w-5" />
          Staff Oversight &amp; Privilege Management
        </h2>
        <p className="text-gray-600 text-sm mt-1">
          Manage staff security permissions, roles, and oversight reporting
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'users'
                ? 'border-hotpink-500 text-hotpink-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <Users className="mr-2 h-4 w-4" />
              <span>Staff Management</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('roles')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'roles'
                ? 'border-hotpink-500 text-hotpink-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <Shield className="mr-2 h-4 w-4" />
              <span>Roles & Privileges</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'reports'
                ? 'border-hotpink-500 text-hotpink-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <FileBarChart className="mr-2 h-4 w-4" />
              <span>Oversight Reports</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('permissions')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'permissions'
                ? 'border-hotpink-500 text-hotpink-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <Settings className="mr-2 h-4 w-4" />
              <span>Permission Registry</span>
            </div>
          </button>
        </nav>
      </div>

      {/* Staff Management Tab */}
      {activeTab === 'users' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="relative w-64">
              <input
                type="text"
                placeholder="Search users..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-hotpink-500 focus:border-hotpink-500"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={openReportModal}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-hotpink-500"
              >
                <FileBarChart className="mr-2 h-4 w-4" />
                Run Staff Report
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    User
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Roles
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Last Activity
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map(user => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-hotpink-100 flex items-center justify-center">
                          <User className="h-6 w-6 text-hotpink-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.name || user.username}
                          </div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getUserRoles(user) || 'No roles assigned'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          user.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {user.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.lastActivity ? new Date(user.lastActivity).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <button
                        onClick={() => openUserRoleModal(user)}
                        className="text-hotpink-600 hover:text-hotpink-900 mr-3"
                      >
                        <Shield className="h-5 w-5" />
                      </button>

                      <button
                        onClick={() => alert('View audit log for user: ' + user.id)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <FileText className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                      No users found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Roles & Privileges Tab */}
      {activeTab === 'roles' && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={openNewRoleModal}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-hotpink-600 hover:bg-hotpink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-hotpink-500"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Create New Role
            </button>
          </div>

          <div className="space-y-4">
            {roles &&
              roles.map(role => (
                <div key={role.id} className="border border-gray-200 rounded-md overflow-hidden">
                  <div
                    className={`bg-gray-50 px-4 py-3 flex justify-between items-center cursor-pointer ${
                      expandedItems[role.id] ? 'border-b border-gray-200' : ''
                    }`}
                    onClick={() => toggleExpand(role.id)}
                  >
                    <div>
                      <span className="font-medium text-gray-900">{role.name}</span>
                      <span className="ml-2 text-sm text-gray-500">Level: {role.level}</span>
                    </div>
                    <div className="flex items-center">
                      {role.systemDefined && (
                        <span className="mr-3 px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                          System
                        </span>
                      )}

                      <div className="flex space-x-2">
                        {!role.systemDefined && (
                          <>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                openEditRoleModal(role);
                              }}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              <Edit className="h-4 w-4" />
                            </button>

                            <button
                              onClick={e => {
                                e.stopPropagation();
                                if (
                                  window.confirm(
                                    `Are you sure you want to delete the role "${role.name}"?`
                                  )
                                ) {
                                  deleteRoleMutation.mutate(role.id);
                                }
                              }}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}

                        {expandedItems[role.id] ? (
                          <ChevronUp className="h-5 w-5 text-gray-500" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-500" />
                        )}
                      </div>
                    </div>
                  </div>

                  {expandedItems[role.id] && (
                    <div className="px-4 py-3 bg-white">
                      <div className="text-sm text-gray-500 mb-3">
                        {role.description || 'No description available.'}
                      </div>

                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Permissions:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {role.permissions.map(permission => (
                            <div key={permission} className="flex items-center text-sm">
                              <Check className="h-4 w-4 text-green-500 mr-2" />
                              <span>{formatPermissionDescription(permission)}</span>
                            </div>
                          ))}

                          {role.permissions.length === 0 && (
                            <div className="text-sm text-gray-500">No permissions assigned.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Oversight Reports Tab */}
      {activeTab === 'reports' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer transition-shadow"
              onClick={() => {
                generateReportMutation.mutate({ reportType: 'ROLE_DISTRIBUTION' });
              }}
            >
              <div className="flex items-center mb-2">
                <div className="p-2 rounded-full bg-blue-100 text-blue-600 mr-3">
                  <BarChart2 className="h-5 w-5" />
                </div>
                <h3 className="text-base font-medium text-gray-900">Role Distribution</h3>
              </div>
              <p className="text-sm text-gray-500">
                View the distribution of security roles across all staff members
              </p>
            </div>

            <div
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer transition-shadow"
              onClick={() => {
                generateReportMutation.mutate({
                  reportType: 'PERMISSION_USAGE',
                  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                  endDate: new Date().toISOString(),
                });
              }}
            >
              <div className="flex items-center mb-2">
                <div className="p-2 rounded-full bg-green-100 text-green-600 mr-3">
                  <FileBarChart className="h-5 w-5" />
                </div>
                <h3 className="text-base font-medium text-gray-900">Permission Usage</h3>
              </div>
              <p className="text-sm text-gray-500">
                Analyze which permissions are being utilized and their frequency
              </p>
            </div>

            <div
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer transition-shadow"
              onClick={() => {
                generateReportMutation.mutate({
                  reportType: 'USER_ACTIVITY',
                  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                  endDate: new Date().toISOString(),
                });
              }}
            >
              <div className="flex items-center mb-2">
                <div className="p-2 rounded-full bg-yellow-100 text-yellow-600 mr-3">
                  <User className="h-5 w-5" />
                </div>
                <h3 className="text-base font-medium text-gray-900">User Activity</h3>
              </div>
              <p className="text-sm text-gray-500">
                Review staff activity patterns and identify inactive accounts
              </p>
            </div>

            <div
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer transition-shadow"
              onClick={() => {
                generateReportMutation.mutate({
                  reportType: 'SECURITY_EVENTS',
                  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                  endDate: new Date().toISOString(),
                });
              }}
            >
              <div className="flex items-center mb-2">
                <div className="p-2 rounded-full bg-red-100 text-red-600 mr-3">
                  <Shield className="h-5 w-5" />
                </div>
                <h3 className="text-base font-medium text-gray-900">Security Events</h3>
              </div>
              <p className="text-sm text-gray-500">
                Monitor security-related events and identify suspicious activities
              </p>
            </div>

            <div
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer transition-shadow"
              onClick={openReportModal}
            >
              <div className="flex items-center mb-2">
                <div className="p-2 rounded-full bg-hotpink-100 text-hotpink-600 mr-3">
                  <Settings className="h-5 w-5" />
                </div>
                <h3 className="text-base font-medium text-gray-900">Custom Report</h3>
              </div>
              <p className="text-sm text-gray-500">
                Generate a custom report with specific parameters and filters
              </p>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="text-base font-medium text-gray-900 mb-2">Recent Reports</h3>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Report Type
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Generated On
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Generated By
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    Role Distribution
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    April 25, 2025
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Admin User</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                    <button className="text-hotpink-600 hover:text-hotpink-900 mr-3">
                      <Download className="h-5 w-5" />
                    </button>
                    <button className="text-blue-600 hover:text-blue-900">
                      <Eye className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    Security Events
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    April 24, 2025
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">System</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                    <button className="text-hotpink-600 hover:text-hotpink-900 mr-3">
                      <Download className="h-5 w-5" />
                    </button>
                    <button className="text-blue-600 hover:text-blue-900">
                      <Eye className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    User Activity
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    April 23, 2025
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Admin User</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                    <button className="text-hotpink-600 hover:text-hotpink-900 mr-3">
                      <Download className="h-5 w-5" />
                    </button>
                    <button className="text-blue-600 hover:text-blue-900">
                      <Eye className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Permission Registry Tab */}
      {activeTab === 'permissions' && (
        <div>
          <div className="mb-4">
            <p className="text-sm text-gray-500">
              This registry contains all available permissions in the system, organized by
              functional module. These permissions can be assigned to roles, which in turn are
              assigned to users.
            </p>
          </div>

          <div className="space-y-4">
            {permissions &&
              Object.entries(permissions).map(([module, perms]) => (
                <div key={module} className="border border-gray-200 rounded-md overflow-hidden">
                  <div
                    className={`bg-gray-50 px-4 py-3 flex justify-between items-center cursor-pointer ${
                      expandedItems[module] ? 'border-b border-gray-200' : ''
                    }`}
                    onClick={() => toggleExpand(module)}
                  >
                    <div className="font-medium text-gray-900">{module.replace(/_/g, ' ')}</div>
                    <div>
                      {expandedItems[module] ? (
                        <ChevronUp className="h-5 w-5 text-gray-500" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-500" />
                      )}
                    </div>
                  </div>

                  {expandedItems[module] && (
                    <div className="px-4 py-3 bg-white">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th
                              scope="col"
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >
                              Permission Code
                            </th>
                            <th
                              scope="col"
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >
                              Description
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {Object.entries(perms).map(([code, description]) => (
                            <tr key={code}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                                {code}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-500">{description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Role Modal */}
      {roleModalOpen && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {selectedRole ? 'Edit Role' : 'Create New Role'}
              </h3>
            </div>

            <form onSubmit={handleRoleSubmit}>
              <div className="px-6 py-4">
                <div className="mb-4">
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Role Name*
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    defaultValue={selectedRole?.name || ''}
                    required
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-hotpink-500 focus:border-hotpink-500 sm:text-sm"
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    defaultValue={selectedRole?.description || ''}
                    rows={3}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-hotpink-500 focus:border-hotpink-500 sm:text-sm"
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="level" className="block text-sm font-medium text-gray-700">
                    Hierarchy Level (1-100)*
                  </label>
                  <div className="mt-1 flex rounded-md shadow-sm">
                    <input
                      type="number"
                      id="level"
                      name="level"
                      min="1"
                      max="100"
                      defaultValue={selectedRole?.level || 50}
                      required
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-hotpink-500 focus:border-hotpink-500 sm:text-sm"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Higher levels have more authority. Administrator = 100, Standard User = 50.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Permissions
                  </label>

                  {permissions &&
                    Object.entries(permissions).map(([module, perms]) => (
                      <div key={module} className="mb-4">
                        <div className="font-medium text-sm text-gray-900 mb-2">
                          {module.replace(/_/g, ' ')}
                        </div>
                        <div className="space-y-2 ml-4">
                          {Object.entries(perms).map(([code, description]) => (
                            <div key={code} className="flex items-start">
                              <div className="flex items-center h-5">
                                <input
                                  id={`permission-${code}`}
                                  name="permissions"
                                  type="checkbox"
                                  value={code}
                                  defaultChecked={selectedRole?.permissions.includes(code)}
                                  className="h-4 w-4 text-hotpink-600 focus:ring-hotpink-500 border-gray-300 rounded"
                                />
                              </div>
                              <div className="ml-3 text-sm">
                                <label
                                  htmlFor={`permission-${code}`}
                                  className="font-medium text-gray-700"
                                >
                                  {code}
                                </label>
                                <p className="text-gray-500">{description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="inline-flex justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-hotpink-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-hotpink-600 hover:bg-hotpink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-hotpink-500"
                >
                  {selectedRole ? 'Update Role' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Role Modal */}
      {userRoleModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                Manage Roles for {selectedUser.name || selectedUser.username}
              </h3>
            </div>

            <form onSubmit={handleAssignRoles}>
              <div className="px-6 py-4">
                <div className="space-y-3">
                  {roles &&
                    roles.map(role => (
                      <div key={role.id} className="flex items-start">
                        <div className="flex items-center h-5">
                          <input
                            id={`role-${role.id}`}
                            name="userRoles"
                            type="checkbox"
                            value={role.id}
                            defaultChecked={selectedUser.roles?.includes(role.id)}
                            className="h-4 w-4 text-hotpink-600 focus:ring-hotpink-500 border-gray-300 rounded"
                          />
                        </div>
                        <div className="ml-3 text-sm">
                          <label htmlFor={`role-${role.id}`} className="font-medium text-gray-700">
                            {role.name}
                          </label>
                          <p className="text-gray-500">{role.description}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setUserRoleModalOpen(false)}
                  className="inline-flex justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-hotpink-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-hotpink-600 hover:bg-hotpink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-hotpink-500"
                >
                  Save Role Assignments
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Generate Staff Oversight Report</h3>
            </div>

            <form onSubmit={handleGenerateReport}>
              <div className="px-6 py-4">
                <div className="mb-4">
                  <label htmlFor="reportType" className="block text-sm font-medium text-gray-700">
                    Report Type*
                  </label>
                  <select
                    id="reportType"
                    name="reportType"
                    required
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-hotpink-500 focus:border-hotpink-500 sm:text-sm rounded-md"
                  >
                    <option value="ROLE_DISTRIBUTION">Role Distribution</option>
                    <option value="PERMISSION_USAGE">Permission Usage</option>
                    <option value="USER_ACTIVITY">User Activity</option>
                    <option value="SECURITY_EVENTS">Security Events</option>
                  </select>
                </div>

                <div className="mb-4">
                  <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                    Start Date
                  </label>
                  <input
                    type="date"
                    id="startDate"
                    name="startDate"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-hotpink-500 focus:border-hotpink-500 sm:text-sm"
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                    End Date
                  </label>
                  <input
                    type="date"
                    id="endDate"
                    name="endDate"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-hotpink-500 focus:border-hotpink-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Filter by Roles (Optional)
                  </label>
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {roles &&
                      roles.map(role => (
                        <div key={role.id} className="flex items-center">
                          <input
                            id={`report-role-${role.id}`}
                            name="reportRoles"
                            type="checkbox"
                            value={role.id}
                            className="h-4 w-4 text-hotpink-600 focus:ring-hotpink-500 border-gray-300 rounded"
                          />
                          <label
                            htmlFor={`report-role-${role.id}`}
                            className="ml-2 text-sm text-gray-700"
                          >
                            {role.name}
                          </label>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="inline-flex justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-hotpink-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-hotpink-600 hover:bg-hotpink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-hotpink-500"
                >
                  Generate Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
