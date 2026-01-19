/**
 * Security Service
 *
 * This service handles authentication, authorization, and multi-tenant
 * organization management for the TrialSage platform.
 */

import { authService } from './authService';

class SecurityService {
  constructor() {
    this.isInitialized = false;
    this.currentUser = null;
    this.roles = [];
    this.organizations = [];
    this.currentOrganization = null;
    this.parentOrganization = null;
    this.permissions = new Map();
    this.modules = [];
    this.projects = [];
    this.clientWorkspaces = [];
    this.entitlements = [];
  }

  /**
   * Initialize the security service
   */
  async initialize() {
    try {
      const token = authService.getToken();
      if (!token) {
        this.cleanup();
        return false;
      }

      const response = await fetch('/api/portal/bootstrap', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        this.cleanup();
        return false;
      }

      const payload = await response.json();
      if (!payload?.success) {
        this.cleanup();
        return false;
      }

      this.currentUser = payload.user;
      this.organizations = payload.organizations || [];
      this.currentOrganization = payload.currentOrganization || this.organizations[0] || null;
      this.clientWorkspaces = payload.clientWorkspaces || [];
      this.projects = payload.projects || [];
      this.modules = payload.modules || [];
      this.entitlements = payload.modules || [];

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Error initializing Security Service:', error);
      throw error;
    }
  }

  /**
   * Load roles and permissions
   */
  async loadRoles() {
    try {
      this.roles = [];
      this.permissions.clear();
      return true;
    } catch (error) {
      console.error('Error loading roles:', error);
      throw error;
    }
  }

  /**
   * Check if a user is authenticated
   */
  isAuthenticated() {
    return !!this.currentUser;
  }

  /**
   * Log in a user
   */
  async login(credentials) {
    try {
      const response = await authService.login(credentials);
      if (response?.token) {
        authService.setToken(response.token);
      }
      await this.initialize();
      return { success: true, user: this.currentUser };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log out a user
   */
  async logout() {
    try {
      await authService.logout();
      this.cleanup();
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if a user has a permission
   */
  hasPermission(permission) {
    if (!this.isAuthenticated()) {
      return false;
    }

    try {
      const role = this.currentOrganization?.role || this.currentUser?.role;
      if (role === 'admin' || role === 'super_admin') return true;

      const permissions = this.currentOrganization?.permissions;
      if (Array.isArray(permissions)) {
        return permissions.includes(permission);
      }

      if (permissions && typeof permissions === 'object') {
        return Boolean(permissions[permission]);
      }

      return false;
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }

  /**
   * Get the current organization
   */
  getCurrentOrganization() {
    return this.currentOrganization;
  }

  /**
   * Get all accessible organizations
   */
  getAccessibleOrganizations() {
    if (!this.isAuthenticated()) {
      return [];
    }

    return this.organizations;
  }

  /**
   * Switch to a different organization
   */
  async switchOrganization(organizationId) {
    if (!this.isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      const token = authService.getToken();
      if (!token) {
        throw new Error('Authentication token missing');
      }

      const response = await fetch('/api/portal/switch-organization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ organizationId }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.token) {
        throw new Error(payload?.message || 'Unable to switch organization');
      }

      authService.setToken(payload.token);
      await this.initialize();

      return { success: true, organization: this.currentOrganization };
    } catch (error) {
      console.error('Error switching organization:', error);
      throw error;
    }
  }

  /**
   * Get the client count
   */
  getClientCount() {
    if (!this.currentOrganization) {
      return 0;
    }

    return this.currentOrganization.clients || 0;
  }

  /**
   * Get user roles
   */
  getUserRoles() {
    if (!this.isAuthenticated()) {
      return [];
    }

    return [this.currentOrganization?.role].filter(Boolean);
  }

  getProjects() {
    return this.projects || [];
  }

  getModules() {
    return this.modules || [];
  }

  getEntitlements() {
    return this.entitlements || [];
  }

  hasModuleAccess(moduleId, { projectId, clientWorkspaceId } = {}) {
    if (!moduleId) return false;
    const entitlements = this.entitlements || [];
    if (entitlements.length === 0) return false;

    return entitlements.some(entry => {
      const entryModuleId = entry.moduleId || entry.id;
      if (entryModuleId !== moduleId) return false;

      const entitlement = entry.entitlement;
      if (!entitlement) return true;

      if (entitlement.scope === 'project' && projectId) {
        return Number(entitlement.projectId) === Number(projectId);
      }

      if (entitlement.scope === 'workspace' && clientWorkspaceId) {
        return Number(entitlement.clientWorkspaceId) === Number(clientWorkspaceId);
      }

      return entitlement.scope === 'organization';
    });
  }

  async returnToParentOrganization() {
    if (!this.organizations.length) {
      return { success: false, error: 'No organizations available' };
    }

    const target =
      this.organizations.find(org => org.role === 'admin' && org.id !== this.currentOrganization?.id) ||
      this.organizations[0];

    if (!target) {
      return { success: false, error: 'No parent organization available' };
    }

    await this.switchOrganization(target.id);
    return { success: true, organization: this.currentOrganization };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.isInitialized = false;
    this.currentUser = null;
    this.currentOrganization = null;
    this.organizations = [];
    this.modules = [];
    this.projects = [];
    this.clientWorkspaces = [];
    this.entitlements = [];
    console.log('Security Service cleaned up');
  }
}

export default SecurityService;
