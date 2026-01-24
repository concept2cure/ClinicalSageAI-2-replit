/**
 * Administration Service
 *
 * Enterprise-grade administration service that manages multi-tenant operations,
 * client provisioning, user management, and system configuration across the
 * TrialSage platform. Designed to support CRO master accounts with multiple
 * biotech client management capabilities.
 */

import securityService from './SecurityService';

// Client status types
export const CLIENT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
};

// Client tier types
export const CLIENT_TIERS = {
  BASIC: 'basic',
  STANDARD: 'standard',
  ENTERPRISE: 'enterprise',
  CUSTOM: 'custom',
};

// Admin event types
export const ADMIN_EVENTS = {
  CLIENT_CREATED: 'client_created',
  CLIENT_UPDATED: 'client_updated',
  CLIENT_ARCHIVED: 'client_archived',
  USER_INVITED: 'user_invited',
  USER_ACTIVATED: 'user_activated',
  USER_DEACTIVATED: 'user_deactivated',
  CONFIG_UPDATED: 'config_updated',
  MODULE_ENABLED: 'module_enabled',
  MODULE_DISABLED: 'module_disabled',
  SUBSCRIPTION_CHANGED: 'subscription_changed',
  FEATURE_TOGGLED: 'feature_toggled',
};

class AdminService {
  constructor() {
    this.apiBase = '/api/admin';
    this.clients = [];
    this.adminListeners = new Map();
  }

  /**
   * Get all clients (for CRO master account)
   * @param {Object} options - Query options like status, search terms, etc.
   * @returns {Promise<Array>} - List of clients
   */
  async getAllClients(options = {}) {
    const queryParams = new URLSearchParams(options).toString();

    try {
      const response = await fetch(`${this.apiBase}/clients?${queryParams}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch clients: ${response.statusText}`);
      }

      this.clients = await response.json();
      return this.clients;
    } catch (error) {
      console.error('Error fetching all clients:', error);
      throw error;
    }
  }

  /**
   * Get client by ID
   * @param {string} clientId - Client ID
   * @returns {Promise<Object>} - Client data
   */
  async getClient(clientId) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch client: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching client:', error);
      throw error;
    }
  }

  /**
   * Create a new client with default configurations
   * @param {Object} clientData - Client data
   * @returns {Promise<Object>} - Created client
   */
  async createClient(clientData) {
    try {
      const response = await fetch(`${this.apiBase}/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(clientData),
      });

      if (!response.ok) {
        throw new Error(`Failed to create client: ${response.statusText}`);
      }

      const client = await response.json();
      this._notifyAdminListeners(ADMIN_EVENTS.CLIENT_CREATED, {
        clientId: client.id,
        adminId: securityService.currentUser?.id,
      });

      return client;
    } catch (error) {
      console.error('Error creating client:', error);
      throw error;
    }
  }

  /**
   * Update client information
   * @param {string} clientId - Client ID
   * @param {Object} updates - Client updates
   * @returns {Promise<Object>} - Updated client
   */
  async updateClient(clientId, updates) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update client: ${response.statusText}`);
      }

      const client = await response.json();
      this._notifyAdminListeners(ADMIN_EVENTS.CLIENT_UPDATED, {
        clientId,
        adminId: securityService.currentUser?.id,
        updates: Object.keys(updates),
      });

      return client;
    } catch (error) {
      console.error('Error updating client:', error);
      throw error;
    }
  }

  /**
   * Archive a client
   * @param {string} clientId - Client ID
   * @param {string} reason - Archival reason (optional)
   * @returns {Promise<Object>} - Archived client
   */
  async archiveClient(clientId, reason = '') {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        throw new Error(`Failed to archive client: ${response.statusText}`);
      }

      const client = await response.json();
      this._notifyAdminListeners(ADMIN_EVENTS.CLIENT_ARCHIVED, {
        clientId,
        adminId: securityService.currentUser?.id,
        reason,
      });

      return client;
    } catch (error) {
      console.error('Error archiving client:', error);
      throw error;
    }
  }

  /**
   * Get client usage metrics
   * @param {string} clientId - Client ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Usage metrics
   */
  async getClientUsageMetrics(clientId, options = {}) {
    const queryParams = new URLSearchParams(options).toString();

    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/usage?${queryParams}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch client usage metrics: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching client usage metrics:', error);
      throw error;
    }
  }

  /**
   * Get client subscription information
   * @param {string} clientId - Client ID
   * @returns {Promise<Object>} - Subscription data
   */
  async getClientSubscription(clientId) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/subscription`);
      if (!response.ok) {
        throw new Error(`Failed to fetch client subscription: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching client subscription:', error);
      throw error;
    }
  }

  /**
   * Update client subscription
   * @param {string} clientId - Client ID
   * @param {Object} subscriptionData - Subscription data
   * @returns {Promise<Object>} - Updated subscription
   */
  async updateClientSubscription(clientId, subscriptionData) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/subscription`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscriptionData),
      });

      if (!response.ok) {
        throw new Error(`Failed to update client subscription: ${response.statusText}`);
      }

      const subscription = await response.json();
      this._notifyAdminListeners(ADMIN_EVENTS.SUBSCRIPTION_CHANGED, {
        clientId,
        adminId: securityService.currentUser?.id,
        subscriptionData,
      });

      return subscription;
    } catch (error) {
      console.error('Error updating client subscription:', error);
      throw error;
    }
  }

  /**
   * Invite user to a client's organization
   * @param {string} clientId - Client ID
   * @param {Object} inviteData - Invite data (email, role, etc.)
   * @returns {Promise<Object>} - Invitation result
   */
  async inviteUser(clientId, inviteData) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inviteData),
      });

      if (!response.ok) {
        throw new Error(`Failed to invite user: ${response.statusText}`);
      }

      const invitation = await response.json();
      this._notifyAdminListeners(ADMIN_EVENTS.USER_INVITED, {
        clientId,
        adminId: securityService.currentUser?.id,
        email: inviteData.email,
      });

      return invitation;
    } catch (error) {
      console.error('Error inviting user:', error);
      throw error;
    }
  }

  /**
   * Get pending invitations for a client
   * @param {string} clientId - Client ID
   * @returns {Promise<Array>} - List of pending invitations
   */
  async getPendingInvitations(clientId) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/invitations`);
      if (!response.ok) {
        throw new Error(`Failed to fetch pending invitations: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching pending invitations:', error);
      throw error;
    }
  }

  /**
   * Cancel invitation
   * @param {string} clientId - Client ID
   * @param {string} invitationId - Invitation ID
   * @returns {Promise<boolean>} - Success status
   */
  async cancelInvitation(clientId, invitationId) {
    try {
      const response = await fetch(
        `${this.apiBase}/clients/${clientId}/invitations/${invitationId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to cancel invitation: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      throw error;
    }
  }

  /**
   * Get client users
   * @param {string} clientId - Client ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - List of users
   */
  async getClientUsers(clientId, options = {}) {
    const queryParams = new URLSearchParams(options).toString();

    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/users?${queryParams}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch client users: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching client users:', error);
      throw error;
    }
  }

  /**
   * Update user status in a client
   * @param {string} clientId - Client ID
   * @param {string} userId - User ID
   * @param {string} status - New status (active, inactive)
   * @returns {Promise<Object>} - Updated user status
   */
  async updateUserStatus(clientId, userId, status) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/users/${userId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update user status: ${response.statusText}`);
      }

      const result = await response.json();

      if (status === 'active') {
        this._notifyAdminListeners(ADMIN_EVENTS.USER_ACTIVATED, {
          clientId,
          userId,
          adminId: securityService.currentUser?.id,
        });
      } else if (status === 'inactive') {
        this._notifyAdminListeners(ADMIN_EVENTS.USER_DEACTIVATED, {
          clientId,
          userId,
          adminId: securityService.currentUser?.id,
        });
      }

      return result;
    } catch (error) {
      console.error('Error updating user status:', error);
      throw error;
    }
  }

  /**
   * Configure client modules
   * @param {string} clientId - Client ID
   * @param {Object} moduleConfig - Module configuration
   * @returns {Promise<Object>} - Updated module configuration
   */
  async configureClientModules(clientId, moduleConfig) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/modules`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(moduleConfig),
      });

      if (!response.ok) {
        throw new Error(`Failed to configure client modules: ${response.statusText}`);
      }

      const result = await response.json();

      // Log module enable/disable events
      if (moduleConfig.enabledModules) {
        this._notifyAdminListeners(ADMIN_EVENTS.MODULE_ENABLED, {
          clientId,
          adminId: securityService.currentUser?.id,
          modules: moduleConfig.enabledModules,
        });
      }

      if (moduleConfig.disabledModules) {
        this._notifyAdminListeners(ADMIN_EVENTS.MODULE_DISABLED, {
          clientId,
          adminId: securityService.currentUser?.id,
          modules: moduleConfig.disabledModules,
        });
      }

      return result;
    } catch (error) {
      console.error('Error configuring client modules:', error);
      throw error;
    }
  }

  /**
   * Get client module configuration
   * @param {string} clientId - Client ID
   * @returns {Promise<Object>} - Module configuration
   */
  async getClientModuleConfig(clientId) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/modules`);
      if (!response.ok) {
        throw new Error(`Failed to fetch client module configuration: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching client module configuration:', error);
      throw error;
    }
  }

  /**
   * Configure feature flags for a client
   * @param {string} clientId - Client ID
   * @param {Object} featureConfig - Feature configuration
   * @returns {Promise<Object>} - Updated feature configuration
   */
  async configureFeatureFlags(clientId, featureConfig) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/features`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(featureConfig),
      });

      if (!response.ok) {
        throw new Error(`Failed to configure feature flags: ${response.statusText}`);
      }

      const result = await response.json();
      this._notifyAdminListeners(ADMIN_EVENTS.FEATURE_TOGGLED, {
        clientId,
        adminId: securityService.currentUser?.id,
        features: Object.keys(featureConfig),
      });

      return result;
    } catch (error) {
      console.error('Error configuring feature flags:', error);
      throw error;
    }
  }

  /**
   * Get client feature flag configuration
   * @param {string} clientId - Client ID
   * @returns {Promise<Object>} - Feature configuration
   */
  async getClientFeatureFlags(clientId) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/features`);
      if (!response.ok) {
        throw new Error(`Failed to fetch client feature flags: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching client feature flags:', error);
      throw error;
    }
  }

  /**
   * Get enterprise security settings for a client
   * @param {string} clientId - Client ID
   * @returns {Promise<Object>} - Security settings
   */
  async getClientSecuritySettings(clientId) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/security`);
      if (!response.ok) {
        throw new Error(`Failed to fetch client security settings: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching client security settings:', error);
      throw error;
    }
  }

  /**
   * Configure enterprise security settings for a client
   * @param {string} clientId - Client ID
   * @param {Object} securityConfig - Security configuration
   * @returns {Promise<Object>} - Updated security configuration
   */
  async configureClientSecurity(clientId, securityConfig) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/security`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(securityConfig),
      });

      if (!response.ok) {
        throw new Error(`Failed to configure client security: ${response.statusText}`);
      }

      const result = await response.json();
      this._notifyAdminListeners(ADMIN_EVENTS.CONFIG_UPDATED, {
        clientId,
        adminId: securityService.currentUser?.id,
        configType: 'security',
      });

      return result;
    } catch (error) {
      console.error('Error configuring client security:', error);
      throw error;
    }
  }

  /**
   * Configure blockchain verification settings for a client
   * @param {string} clientId - Client ID
   * @param {Object} blockchainConfig - Blockchain configuration
   * @returns {Promise<Object>} - Updated blockchain configuration
   */
  async configureBlockchainVerification(clientId, blockchainConfig) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/blockchain`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(blockchainConfig),
      });

      if (!response.ok) {
        throw new Error(`Failed to configure blockchain verification: ${response.statusText}`);
      }

      const result = await response.json();
      this._notifyAdminListeners(ADMIN_EVENTS.CONFIG_UPDATED, {
        clientId,
        adminId: securityService.currentUser?.id,
        configType: 'blockchain',
      });

      return result;
    } catch (error) {
      console.error('Error configuring blockchain verification:', error);
      throw error;
    }
  }

  /**
   * Get client portal customization settings
   * @param {string} clientId - Client ID
   * @returns {Promise<Object>} - Customization settings
   */
  async getClientPortalCustomization(clientId) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/portal-customization`);
      if (!response.ok) {
        throw new Error(`Failed to fetch client portal customization: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching client portal customization:', error);
      throw error;
    }
  }

  /**
   * Update client portal customization
   * @param {string} clientId - Client ID
   * @param {Object} customizationData - Customization data
   * @returns {Promise<Object>} - Updated customization
   */
  async updateClientPortalCustomization(clientId, customizationData) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/portal-customization`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(customizationData),
      });

      if (!response.ok) {
        throw new Error(`Failed to update client portal customization: ${response.statusText}`);
      }

      const result = await response.json();
      this._notifyAdminListeners(ADMIN_EVENTS.CONFIG_UPDATED, {
        clientId,
        adminId: securityService.currentUser?.id,
        configType: 'portal-customization',
      });

      return result;
    } catch (error) {
      console.error('Error updating client portal customization:', error);
      throw error;
    }
  }

  /**
   * Get system activity logs for a client
   * @param {string} clientId - Client ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Activity logs
   */
  async getClientActivityLogs(clientId, options = {}) {
    const queryParams = new URLSearchParams(options).toString();

    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/activity?${queryParams}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch client activity logs: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching client activity logs:', error);
      throw error;
    }
  }

  /**
   * Generate billing report for a client
   * @param {string} clientId - Client ID
   * @param {Object} reportOptions - Report options
   * @returns {Promise<Object>} - Billing report
   */
  async generateClientBillingReport(clientId, reportOptions) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/billing-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reportOptions),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate billing report: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error generating billing report:', error);
      throw error;
    }
  }

  /**
   * Get client API keys
   * @param {string} clientId - Client ID
   * @returns {Promise<Array>} - List of API keys
   */
  async getClientApiKeys(clientId) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/api-keys`);
      if (!response.ok) {
        throw new Error(`Failed to fetch client API keys: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching client API keys:', error);
      throw error;
    }
  }

  /**
   * Create client API key
   * @param {string} clientId - Client ID
   * @param {Object} keyData - API key data
   * @returns {Promise<Object>} - Created API key
   */
  async createClientApiKey(clientId, keyData) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(keyData),
      });

      if (!response.ok) {
        throw new Error(`Failed to create client API key: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating client API key:', error);
      throw error;
    }
  }

  /**
   * Revoke client API key
   * @param {string} clientId - Client ID
   * @param {string} keyId - API key ID
   * @returns {Promise<boolean>} - Success status
   */
  async revokeClientApiKey(clientId, keyId) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/api-keys/${keyId}/revoke`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Failed to revoke client API key: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('Error revoking client API key:', error);
      throw error;
    }
  }

  /**
   * Generate client onboarding report
   * @param {string} clientId - Client ID
   * @returns {Promise<Object>} - Onboarding report
   */
  async generateClientOnboardingReport(clientId) {
    try {
      const response = await fetch(`${this.apiBase}/clients/${clientId}/onboarding-report`);
      if (!response.ok) {
        throw new Error(`Failed to generate onboarding report: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error generating onboarding report:', error);
      throw error;
    }
  }

  /**
   * Get CRO organization settings
   * @returns {Promise<Object>} - CRO settings
   */
  async getCroSettings() {
    try {
      const response = await fetch(`${this.apiBase}/organization/settings`);
      if (!response.ok) {
        throw new Error(`Failed to fetch CRO settings: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching CRO settings:', error);
      throw error;
    }
  }

  /**
   * Update CRO organization settings
   * @param {Object} settings - Organization settings
   * @returns {Promise<Object>} - Updated settings
   */
  async updateCroSettings(settings) {
    try {
      const response = await fetch(`${this.apiBase}/organization/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error(`Failed to update CRO settings: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating CRO settings:', error);
      throw error;
    }
  }

  /**
   * Subscribe to admin events
   * @param {string} eventType - Event type
   * @param {Function} callback - Callback function
   * @returns {string} - Subscription ID
   */
  subscribeToAdminEvents(eventType, callback) {
    const subscriptionId = Date.now().toString(36) + Math.random().toString(36).substr(2);

    if (!this.adminListeners.has(eventType)) {
      this.adminListeners.set(eventType, new Map());
    }

    this.adminListeners.get(eventType).set(subscriptionId, callback);
    return subscriptionId;
  }

  /**
   * Unsubscribe from admin events
   * @param {string} eventType - Event type
   * @param {string} subscriptionId - Subscription ID
   */
  unsubscribeFromAdminEvents(eventType, subscriptionId) {
    if (this.adminListeners.has(eventType)) {
      this.adminListeners.get(eventType).delete(subscriptionId);
    }
  }

  /**
   * Notify admin event listeners
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   * @private
   */
  _notifyAdminListeners(eventType, data) {
    if (this.adminListeners.has(eventType)) {
      this.adminListeners.get(eventType).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in admin event listener for ${eventType}:`, error);
        }
      });
    }
  }
}

// Create singleton instance
const adminService = new AdminService();
export default adminService;
