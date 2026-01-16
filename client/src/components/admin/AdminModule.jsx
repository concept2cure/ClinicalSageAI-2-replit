/**
 * Admin Module
 *
 * Main component for the Admin module of the TrialSage platform.
 * This module provides administration features for the multi-tenant environment,
 * allowing CRO master accounts to manage their biotech client organizations.
 */

import React, { useState, useEffect } from 'react';
import { Users, Building, Settings, Shield, Activity, Database, UserPlus, MoreHorizontal, Search, ChevronDown, X, CheckCircle, AlertTriangle, Filter } from 'lucide-react'
import { useModuleIntegration } from '../integration/ModuleIntegrationLayer';
import securityService from '../../services/SecurityService';
import { OrganizationSwitcher } from '../client-portal/OrganizationSwitcher';

// Client user table component
const ClientUserTable = ({ organization }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Simulated roles for filter
  const roles = ['All Roles', 'Admin', 'Manager', 'Writer', 'Reviewer', 'Viewer'];

  // Load users for organization
  useEffect(() => {
    const loadUsers = async () => {
      try {
        // In a real app, would fetch from API
        // For now, use demo data
        setLoading(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 300));

        // Demo users
        const demoUsers = [
          {
            id: 1,
            username: 'johnsmith',
            email: 'john.smith@bioinnovate.com',
            firstName: 'John',
            lastName: 'Smith',
            role: 'Admin',
            lastLogin: '2025-04-26T08:30:00Z',
            status: 'active',
          },
          {
            id: 2,
            username: 'sarahjohnson',
            email: 'sarah.johnson@bioinnovate.com',
            firstName: 'Sarah',
            lastName: 'Johnson',
            role: 'Manager',
            lastLogin: '2025-04-25T14:15:00Z',
            status: 'active',
          },
          {
            id: 3,
            username: 'markwilson',
            email: 'mark.wilson@bioinnovate.com',
            firstName: 'Mark',
            lastName: 'Wilson',
            role: 'Writer',
            lastLogin: '2025-04-24T09:45:00Z',
            status: 'active',
          },
          {
            id: 4,
            username: 'emilychen',
            email: 'emily.chen@bioinnovate.com',
            firstName: 'Emily',
            lastName: 'Chen',
            role: 'Reviewer',
            lastLogin: '2025-04-23T16:20:00Z',
            status: 'active',
          },
          {
            id: 5,
            username: 'michaelbrown',
            email: 'michael.brown@bioinnovate.com',
            firstName: 'Michael',
            lastName: 'Brown',
            role: 'Viewer',
            lastLogin: null,
            status: 'invited',
          },
        ];

        setUsers(demoUsers);
        setLoading(false);
      } catch (error) {
        console.error('Error loading users:', error);
        setLoading(false);
      }
    };

    if (organization) {
      loadUsers();
    }
  }, [organization]);

  // Filter users based on search and role
  const filteredUsers = users.filter(user => {
    const matchesSearch =
      !searchQuery ||
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = !selectedRole || selectedRole === 'All Roles' || user.role === selectedRole;

    return matchesSearch && matchesRole;
  });

  // Format date for display
  const formatDate = dateString => {
    if (!dateString) return 'Never';

    return new Date(dateString).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <div className="p-6 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-lg font-semibold">Client Users</h2>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 w-full text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Role filter */}
            <div className="relative">
              <select
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
                className="pl-9 pr-8 py-2 w-full text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary appearance-none"
              >
                <option value="">All Roles</option>
                {roles.slice(1).map(role => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <Filter className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <ChevronDown className="absolute right-3 top-2.5 text-gray-400" size={16} />
            </div>

            {/* Add user button */}
            <button className="flex items-center px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-opacity-90">
              <UserPlus size={16} className="mr-2" />
              <span>Add User</span>
            </button>
          </div>
        </div>
      </div>

      {/* User table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3 text-left">Name</th>
              <th className="px-6 py-3 text-left">Email</th>
              <th className="px-6 py-3 text-left">Role</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Last Login</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                  <div className="flex justify-center mb-3">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
                  </div>
                  Loading users...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                  No users found matching your criteria
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium">
                      {user.firstName} {user.lastName}
                    </div>
                    <div className="text-xs text-gray-500">{user.username}</div>
                  </td>
                  <td className="px-6 py-4 text-sm">{user.email}</td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'Admin'
                          ? 'bg-purple-100 text-purple-800'
                          : user.role === 'Manager'
                            ? 'bg-blue-100 text-blue-800'
                            : user.role === 'Writer'
                              ? 'bg-green-100 text-green-800'
                              : user.role === 'Reviewer'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {user.status === 'active' ? (
                      <span className="inline-flex items-center text-green-500">
                        <CheckCircle size={14} className="mr-1" />
                        Active
                      </span>
                    ) : user.status === 'invited' ? (
                      <span className="inline-flex items-center text-yellow-500">
                        <AlertTriangle size={14} className="mr-1" />
                        Invited
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-gray-500">Inactive</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(user.lastLogin)}</td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-gray-400 hover:text-gray-600">
                      <MoreHorizontal size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {filteredUsers.length} of {users.length} users
          </div>
          <div className="flex items-center space-x-2">
            <button
              className="px-3 py-1 text-sm border rounded bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              disabled
            >
              Previous
            </button>
            <button
              className="px-3 py-1 text-sm border rounded bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              disabled
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Admin module main component
const AdminModule = () => {
  const { getSharedContext } = useModuleIntegration();
  const [currentOrg, setCurrentOrg] = useState(null);
  const [isClientOrg, setIsClientOrg] = useState(false);

  // Get current organization on mount
  useEffect(() => {
    setCurrentOrg(securityService.currentOrganization);
    setIsClientOrg(securityService.currentOrganization?.type !== 'cro');
  }, []);

  // Handle organization switch
  const handleOrgSwitch = org => {
    setCurrentOrg(org);
    setIsClientOrg(org?.type !== 'cro');
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Administration</h1>
          <p className="text-gray-600">Manage users, organizations, and system settings</p>
        </div>

        {!isClientOrg && <OrganizationSwitcher onSwitch={handleOrgSwitch} />}
      </div>

      {isClientOrg ? (
        // Client organization admin view
        <div className="space-y-6">
          <ClientUserTable organization={currentOrg} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-full bg-primary bg-opacity-10 flex items-center justify-center text-primary mr-3">
                  <Building size={20} />
                </div>
                <h2 className="text-lg font-semibold">Organization Profile</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Organization Name
                  </label>
                  <div className="text-gray-800">{currentOrg?.name || 'Client Organization'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Organization Type
                  </label>
                  <div className="text-gray-800 capitalize">{currentOrg?.type || 'biotech'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Contact Email
                  </label>
                  <div className="text-gray-800">
                    contact@{currentOrg?.name?.toLowerCase().replace(/\s+/g, '')}.com
                  </div>
                </div>
                <button className="mt-2 px-4 py-2 border border-primary text-primary rounded hover:bg-primary hover:bg-opacity-5">
                  Edit Profile
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
                  <Shield size={20} />
                </div>
                <h2 className="text-lg font-semibold">Security</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-600">
                      Two-Factor Authentication
                    </label>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Enabled
                    </span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-600">Password Policy</label>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Strong
                    </span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-600">Session Timeout</label>
                    <span className="text-sm text-gray-800">30 minutes</span>
                  </div>
                </div>
                <button className="mt-2 px-4 py-2 border border-primary text-primary rounded hover:bg-primary hover:bg-opacity-5">
                  Security Settings
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600 mr-3">
                  <Activity size={20} />
                </div>
                <h2 className="text-lg font-semibold">Audit Logs</h2>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-gray-600">
                  Access and download audit logs for compliance and security monitoring.
                </div>
                <div className="space-y-1 mt-4">
                  <div className="text-xs text-gray-500">Recent Activity</div>
                  <div className="text-sm">User login - John Smith</div>
                  <div className="text-xs text-gray-500">2 hours ago</div>
                </div>
                <div className="space-y-1 mt-2">
                  <div className="text-sm">Document accessed - Protocol v2.1</div>
                  <div className="text-xs text-gray-500">Yesterday</div>
                </div>
                <button className="mt-4 px-4 py-2 border border-primary text-primary rounded hover:bg-primary hover:bg-opacity-5">
                  View All Logs
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // CRO master account admin view
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-full bg-primary bg-opacity-10 flex items-center justify-center text-primary mr-3">
                  <Building size={20} />
                </div>
                <h2 className="text-lg font-semibold">Client Organizations</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Manage your client organizations and their settings.
              </p>
              <div className="flex items-center text-sm text-primary">
                <span className="font-medium">4</span>
                <span className="mx-2">Client organizations</span>
              </div>
              <button className="mt-4 w-full px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90">
                Manage Organizations
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
                  <Users size={20} />
                </div>
                <h2 className="text-lg font-semibold">User Management</h2>
              </div>
              <p className="text-gray-600 mb-4">Manage users across all client organizations.</p>
              <div className="flex items-center text-sm text-primary">
                <span className="font-medium">28</span>
                <span className="mx-2">Total users</span>
              </div>
              <button className="mt-4 w-full px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90">
                Manage Users
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 mr-3">
                  <Shield size={20} />
                </div>
                <h2 className="text-lg font-semibold">Security & Compliance</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Manage security settings and compliance policies.
              </p>
              <div className="flex items-center text-sm text-green-600">
                <CheckCircle size={16} className="mr-2" />
                <span>All security checks passing</span>
              </div>
              <button className="mt-4 w-full px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90">
                Security Settings
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold">Client Organizations</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3 text-left">Organization</th>
                    <th className="px-6 py-3 text-left">Type</th>
                    <th className="px-6 py-3 text-left">Users</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-left">Last Activity</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium">BioInnovate Therapeutics</div>
                    </td>
                    <td className="px-6 py-4 text-sm">Biotech</td>
                    <td className="px-6 py-4 text-sm">12</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">2 hours ago</td>
                    <td className="px-6 py-4 text-right">
                      <button className="px-3 py-1 text-sm text-primary border border-primary rounded hover:bg-primary hover:bg-opacity-5">
                        Manage
                      </button>
                    </td>
                  </tr>

                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium">GenomeWave Pharma</div>
                    </td>
                    <td className="px-6 py-4 text-sm">Pharma</td>
                    <td className="px-6 py-4 text-sm">8</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">Yesterday</td>
                    <td className="px-6 py-4 text-right">
                      <button className="px-3 py-1 text-sm text-primary border border-primary rounded hover:bg-primary hover:bg-opacity-5">
                        Manage
                      </button>
                    </td>
                  </tr>

                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium">NeuroCrest Biologics</div>
                    </td>
                    <td className="px-6 py-4 text-sm">Biotech</td>
                    <td className="px-6 py-4 text-sm">5</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">3 days ago</td>
                    <td className="px-6 py-4 text-right">
                      <button className="px-3 py-1 text-sm text-primary border border-primary rounded hover:bg-primary hover:bg-opacity-5">
                        Manage
                      </button>
                    </td>
                  </tr>

                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium">MedTech Innovations</div>
                    </td>
                    <td className="px-6 py-4 text-sm">Medical Device</td>
                    <td className="px-6 py-4 text-sm">3</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Onboarding
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">1 week ago</td>
                    <td className="px-6 py-4 text-right">
                      <button className="px-3 py-1 text-sm text-primary border border-primary rounded hover:bg-primary hover:bg-opacity-5">
                        Manage
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
              <button className="px-4 py-2 text-primary border border-primary rounded hover:bg-primary hover:bg-opacity-5">
                Add New Client
              </button>
              <div className="text-sm text-gray-600">4 organizations total</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="p-6 border-b">
                <h2 className="text-lg font-semibold">System Settings</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">
                      Enable Blockchain Verification
                    </span>
                    <div className="relative inline-block w-10 h-5 rounded-full bg-green-500">
                      <span className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transform transition-transform"></span>
                    </div>
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    Verify document authenticity using blockchain technology
                  </p>
                </div>

                <div>
                  <label className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">
                      Multi-Factor Authentication
                    </span>
                    <div className="relative inline-block w-10 h-5 rounded-full bg-green-500">
                      <span className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transform transition-transform"></span>
                    </div>
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    Require MFA for all administrative accounts
                  </p>
                </div>

                <div>
                  <label className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">AI-Powered Insights</span>
                    <div className="relative inline-block w-10 h-5 rounded-full bg-green-500">
                      <span className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transform transition-transform"></span>
                    </div>
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    Enable AI features across all modules
                  </p>
                </div>

                <div>
                  <label className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">Auto-Backup</span>
                    <div className="relative inline-block w-10 h-5 rounded-full bg-green-500">
                      <span className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transform transition-transform"></span>
                    </div>
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    Enable automatic daily backups of all data
                  </p>
                </div>
              </div>
              <div className="p-4 bg-gray-50 border-t text-center">
                <button className="px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90">
                  Save Settings
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="p-6 border-b">
                <h2 className="text-lg font-semibold">Recent Activity</h2>
              </div>
              <div className="divide-y max-h-80 overflow-y-auto">
                <div className="p-4 hover:bg-gray-50">
                  <div className="text-sm font-medium">New client organization added</div>
                  <div className="text-xs text-gray-500 mt-1">
                    <span>MedTech Innovations</span>
                    <span className="mx-2">•</span>
                    <span>1 week ago</span>
                  </div>
                </div>

                <div className="p-4 hover:bg-gray-50">
                  <div className="text-sm font-medium">User permissions updated</div>
                  <div className="text-xs text-gray-500 mt-1">
                    <span>Sarah Johnson @ BioInnovate</span>
                    <span className="mx-2">•</span>
                    <span>2 days ago</span>
                  </div>
                </div>

                <div className="p-4 hover:bg-gray-50">
                  <div className="text-sm font-medium">System backup completed</div>
                  <div className="text-xs text-gray-500 mt-1">
                    <span>Automated process</span>
                    <span className="mx-2">•</span>
                    <span>Yesterday</span>
                  </div>
                </div>

                <div className="p-4 hover:bg-gray-50">
                  <div className="text-sm font-medium">Security audit completed</div>
                  <div className="text-xs text-gray-500 mt-1">
                    <span>System</span>
                    <span className="mx-2">•</span>
                    <span>3 days ago</span>
                  </div>
                </div>

                <div className="p-4 hover:bg-gray-50">
                  <div className="text-sm font-medium">Module access granted</div>
                  <div className="text-xs text-gray-500 mt-1">
                    <span>GenomeWave Pharma</span>
                    <span className="mx-2">•</span>
                    <span>4 days ago</span>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-50 border-t text-center">
                <button className="text-primary text-sm">View All Activity</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminModule;
