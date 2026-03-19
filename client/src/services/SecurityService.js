/**
 * Security Service
 *
 * This service handles authentication, authorization, and multi-tenant
 * organization management for the Concept2Cure platform.
 */

class SecurityService {
  constructor() {
    this.isInitialized = false;
    this.currentUser = null;
    this.roles = [];
    this.organizations = [];
    this.currentOrganization = null;
    this.permissions = new Map();
  }

  /**
   * Initialize the security service
   */
  async initialize() {
    try {
      console.log('Initializing Security Service');

      // Load roles
      console.log('Loading roles');
      await this.loadRoles();

      // Simulate user already logged in
      // In production, this would check for an existing session
      this.currentUser = {
        id: 'user-001',
        username: 'jsmith',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@example.com',
        roles: ['admin'],
        organizations: ['org-001', 'org-002'],
      };

      // Load organizations
      this.organizations = [
        {
          id: 'org-001',
          name: 'Acme CRO',
          type: 'cro',
          role: 'Administrator',
          clients: 5,
          lastUpdated: '2025-04-25',
        },
        {
          id: 'org-002',
          name: 'BioPharma Inc.',
          type: 'pharma',
          role: 'Viewer',
          clients: 2,
          lastUpdated: '2025-04-20',
        },
      ];

      // Set current organization
      this.currentOrganization = this.organizations[0];

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
      // In production, this would load from an API or database
      // For development, we'll simulate some roles

      // Admin role
      const adminRole = {
        id: 'role-001',
        name: 'admin',
        displayName: 'Administrator',
        description: 'Full access to all features',
        permissions: ['create', 'read', 'update', 'delete', 'share', 'verify'],
      };

      // Editor role
      const editorRole = {
        id: 'role-002',
        name: 'editor',
        displayName: 'Editor',
        description: 'Can create and edit documents',
        permissions: ['create', 'read', 'update', 'share'],
      };

      // Viewer role
      const viewerRole = {
        id: 'role-003',
        name: 'viewer',
        displayName: 'Viewer',
        description: 'Can view documents only',
        permissions: ['read'],
      };

      // Regulatory role
      const regulatoryRole = {
        id: 'role-004',
        name: 'regulatory',
        displayName: 'Regulatory Affairs',
        description: 'Specializes in regulatory submissions',
        permissions: ['create', 'read', 'update', 'share', 'verify'],
      };

      // Store roles
      this.roles = [adminRole, editorRole, viewerRole, regulatoryRole];

      // Set up permissions map
      this.permissions.set('admin', new Set(adminRole.permissions));
      this.permissions.set('editor', new Set(editorRole.permissions));
      this.permissions.set('viewer', new Set(viewerRole.permissions));
      this.permissions.set('regulatory', new Set(regulatoryRole.permissions));

      console.log('Roles loaded:', this.roles.length);
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
      // In production, this would call an authentication API
      // For development, we'll simulate a login

      // Check credentials
      if (credentials.username === 'jsmith' && credentials.password === 'password') {
        this.currentUser = {
          id: 'user-001',
          username: 'jsmith',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@example.com',
          roles: ['admin'],
          organizations: ['org-001', 'org-002'],
        };

        // Load organizations
        this.organizations = [
          {
            id: 'org-001',
            name: 'Acme CRO',
            type: 'cro',
            role: 'Administrator',
            clients: 5,
            lastUpdated: '2025-04-25',
          },
          {
            id: 'org-002',
            name: 'BioPharma Inc.',
            type: 'pharma',
            role: 'Viewer',
            clients: 2,
            lastUpdated: '2025-04-20',
          },
        ];

        // Set current organization
        this.currentOrganization = this.organizations[0];

        return { success: true, user: this.currentUser };
      } else {
        return { success: false, error: 'Invalid username or password' };
      }
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
      // In production, this would call a logout API
      // For development, we'll just clear the current user

      this.currentUser = null;
      this.currentOrganization = null;

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
      // Check if user has the permission through their roles
      for (const role of this.currentUser.roles) {
        const rolePermissions = this.permissions.get(role);

        if (rolePermissions && rolePermissions.has(permission)) {
          return true;
        }
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
      // Find the organization
      const organization = this.organizations.find(org => org.id === organizationId);

      if (!organization) {
        throw new Error('Organization not found');
      }

      // Check if user has access to the organization
      if (!this.currentUser.organizations.includes(organizationId)) {
        throw new Error('User does not have access to this organization');
      }

      // Switch to the organization
      this.currentOrganization = organization;

      return { success: true, organization };
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

    return this.currentUser.roles;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.isInitialized = false;
    this.currentUser = null;
    this.currentOrganization = null;
    console.log('Security Service cleaned up');
  }
}

export default SecurityService;
