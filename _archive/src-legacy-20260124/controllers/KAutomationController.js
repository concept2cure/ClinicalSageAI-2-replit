/**
 * K Automation Controller
 *
 * This controller serves as the central logic hub for the 510(k) and CER
 * automation workflow, connecting UI components with the appropriate service
 * calls and managing state.
 */

import fda510kService from '../services/FDA510kService';
import * as CERService from '../services/cerService';
import SemanticSearchService from '../services/SemanticSearchService';
import VaultService from '../services/DocuShareService';
import { apiRequest } from '../lib/queryClient';

class KAutomationController {
  /**
   * Fetch device profiles from API
   *
   * @param {string} organizationId Optional organization ID for tenant context
   * @returns {Promise<Array>} Array of device profiles
   */
  async fetchDeviceProfiles(organizationId = null) {
    try {
      const response = await apiRequest.get('/api/device-profiles', {
        headers: organizationId
          ? {
              'X-Organization-Id': organizationId,
            }
          : undefined,
      });

      return response.data.profiles || [];
    } catch (error) {
      console.error('Error fetching device profiles:', error);
      throw error;
    }
  }

  /**
   * Create a new device profile
   *
   * @param {Object} profileData The device profile data
   * @param {string} organizationId Optional organization ID for tenant context
   * @returns {Promise<Object>} The created device profile
   */
  async createDeviceProfile(profileData, organizationId = null) {
    try {
      return await fda510kService.DeviceProfileAPI.create(profileData, organizationId);
    } catch (error) {
      console.error('Error creating device profile:', error);
      throw error;
    }
  }

  /**
   * Search for predicate devices using advanced semantic matching
   *
   * @param {Object} searchCriteria Search criteria including device details
   * @param {string} organizationId Optional organization ID for tenant context
   * @returns {Promise<Array>} Array of matching predicate devices with relevance scores
   */
  async findPredicateDevices(searchCriteria, organizationId = null) {
    try {
      const result = await fda510kService.findPredicateDevices(searchCriteria, organizationId);
      return result;
    } catch (error) {
      console.error('Error finding predicate devices:', error);
      throw error;
    }
  }

  /**
   * Run a comprehensive compliance check for FDA 510(k) submission
   *
   * @param {string} projectId The 510(k) project ID
   * @param {Object} options Compliance check options
   * @returns {Promise<Object>} Detailed compliance check results
   */
  async runComplianceCheck(projectId, options = {}) {
    try {
      return await fda510kService.runComplianceCheck(projectId, options);
    } catch (error) {
      console.error('Error running compliance check:', error);
      throw error;
    }
  }

  /**
   * Generate an eSTAR package for FDA submission
   *
   * @param {string} projectId The 510(k) project ID
   * @param {Object} options Build options
   * @returns {Promise<Object>} Build result including file URL
   */
  async generateESTARPackage(projectId, options = {}) {
    try {
      return await fda510kService.buildESTARPackage(projectId, options);
    } catch (error) {
      console.error('Error generating eSTAR package:', error);
      throw error;
    }
  }

  /**
   * Generate a new CER section using AI
   *
   * @param {string} sectionType The type of section to generate
   * @param {Object} context Additional context for generation
   * @returns {Promise<Object>} Generated section content
   */
  async generateCERSection(sectionType, context = {}) {
    try {
      const response = await apiRequest.post('/api/cer/sections/generate', {
        sectionType,
        context,
      });

      return response.data;
    } catch (error) {
      console.error('Error generating CER section:', error);
      throw error;
    }
  }

  /**
   * Generate a complete CER report
   *
   * @param {Object} options CER generation options
   * @returns {Promise<Object>} Job information for tracking
   */
  async generateFullCER(options) {
    try {
      return await CERService.generateFullCER(options);
    } catch (error) {
      console.error('Error generating full CER:', error);
      throw error;
    }
  }

  /**
   * Search literature for relevant references
   *
   * @param {string} query Search query
   * @param {Object} filters Search filters
   * @returns {Promise<Object>} Search results
   */
  async searchLiterature(query, filters = {}) {
    try {
      const result = await SemanticSearchService.searchMedicalLiterature(query, filters);
      return result;
    } catch (error) {
      console.error('Error searching literature:', error);
      throw error;
    }
  }

  /**
   * Upload a document to the vault
   *
   * @param {File} file File to upload
   * @param {Object} metadata Document metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadDocument(file, metadata = {}) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('metadata', JSON.stringify(metadata));

      const response = await apiRequest.post('/api/vault/documents', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error uploading document:', error);
      throw error;
    }
  }

  /**
   * Fetch documents from vault
   *
   * @param {Object} filters Filter criteria
   * @param {Object} pagination Pagination options
   * @returns {Promise<Object>} Documents and pagination info
   */
  async fetchVaultDocuments(filters = {}, pagination = { page: 1, limit: 20 }) {
    try {
      return await VaultService.getDocuments(filters, pagination);
    } catch (error) {
      console.error('Error fetching vault documents:', error);
      throw error;
    }
  }

  /**
   * Run MAUD algorithm validation
   *
   * @param {Object} algorithm Algorithm configuration
   * @returns {Promise<Object>} Validation results
   */
  async validateMAUDAlgorithm(algorithm) {
    try {
      const response = await apiRequest.post('/api/maud/validate', algorithm);
      return response.data;
    } catch (error) {
      console.error('Error validating MAUD algorithm:', error);
      throw error;
    }
  }

  /**
   * Get organization tenant context
   *
   * @returns {Promise<Object>} Current tenant context
   */
  async getTenantContext() {
    try {
      const response = await apiRequest.get('/api/tenant-context');
      return response.data;
    } catch (error) {
      console.error('Error getting tenant context:', error);
      throw error;
    }
  }

  /**
   * Check if user has necessary permissions
   *
   * @param {string} permission The permission to check
   * @returns {Promise<boolean>} True if user has permission
   */
  async checkPermission(permission) {
    try {
      const response = await apiRequest.get(`/api/permissions/check?permission=${permission}`);
      const result = response.data;
      return result.hasPermission === true;
    } catch (error) {
      console.error(`Error checking permission ${permission}:`, error);
      return false;
    }
  }
}

// Create and export singleton instance
const kAutomationController = new KAutomationController();
export default kAutomationController;
