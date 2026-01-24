/**
 * FDA 510(k) Service
 *
 * This service handles interactions with the 510(k) API endpoints,
 * including eSTAR integration, package validation, and workflow management.
 *
 * This service now fully integrates with Document Vault for proper file management
 * and connects to downstream features throughout the 510(k) workflow.
 */

import { apiRequest } from '../lib/queryClient';
import docuShareService from './DocuShareService';

// Export as a singleton object
export const FDA510kService = {
  /**
   * Fetch a list of all 510(k) projects
   *
   * @returns Promise with array of projects
   */
  async fetchProjects() {
    const response = await apiRequest.get('/api/fda510k/projects');
    return response.data;
  },

  /**
   * Fetch a specific 510(k) project by ID
   *
   * @param {string} projectId Project ID
   * @returns Promise with project data
   */
  async fetchProject(projectId) {
    const response = await apiRequest.get(`/api/fda510k/projects/${projectId}`);
    return response.data;
  },

  /**
   * Create a new 510(k) project
   *
   * @param {Object} projectData Project data
   * @returns Promise with created project
   */
  async createProject(projectData) {
    const response = await apiRequest.post('/api/fda510k/projects', projectData);
    return response.data;
  },

  /**
   * Update an existing 510(k) project
   *
   * @param {string} projectId Project ID
   * @param {Object} projectData Updated project data
   * @returns Promise with updated project
   */
  async updateProject(projectId, projectData) {
    const response = await apiRequest.put(`/api/fda510k/projects/${projectId}`, projectData);
    return response.data;
  },

  /**
   * Delete a 510(k) project
   *
   * @param {string} projectId Project ID
   * @returns Promise with deletion result
   */
  async deleteProject(projectId) {
    const response = await apiRequest.delete(`/api/fda510k/projects/${projectId}`);
    return response.data;
  },

  /**
   * Search for predicate devices in the FDA database
   *
   * @param {Object} searchCriteria Search parameters
   * @returns Promise with search results
   */
  async searchPredicateDevices(searchCriteria) {
    const response = await apiRequest.post('/api/fda510k/predicates/search', searchCriteria);
    return response.data;
  },

  /**
   * Save predicate device selection to a project
   *
   * @param {string} projectId Project ID
   * @param {Array} selectedPredicates List of selected predicate devices
   * @returns Promise with updated project
   */
  async savePredicateSelection(projectId, selectedPredicates) {
    const response = await apiRequest.post(`/api/fda510k/predicates/${projectId}`, {
      predicates: selectedPredicates,
    });
    return response.data;
  },

  /**
   * Search for a specific predicate device by 510(k) number
   *
   * @param {string} k510Number The 510(k) number to search for
   * @returns {Promise<Object>} The predicate device data if found
   */
  async getPredicateByK510Number(k510Number) {
    const response = await apiRequest.get(`/api/fda510k/predicates/number/${k510Number}`);
    return response.data;
  },

  /**
   * Run a compliance check for a 510(k) submission
   *
   * This method analyzes the current project state and identifies
   * documentation gaps.
   *
   * @param {string} projectId The ID of the 510(k) project to check
   * @param {Object} options Optional parameters for the compliance check
   * @returns {Promise<Object>} Detailed compliance check results with issues and score
   */
  async runComplianceCheck(deviceProfile, organizationId, options = {}) {
    const response = await apiRequest.post(`/api/fda510k/compliance-check`, {
      deviceProfile: deviceProfile,
      organizationId: organizationId,
      options: options,
    });
    return response.data;
  },

  /**
   * Generate a FDA-compliant PDF for a 510(k) section
   *
   * @param {string} projectId Project ID
   * @param {string} sectionId Section ID
   * @returns Promise with PDF URL
   */
  async generateSectionPDF(projectId, sectionId) {
    const response = await apiRequest.post(`/api/fda510k/generate-pdf/section`, {
      projectId,
      sectionId,
    });
    return response.data;
  },

  /**
   * Generate a complete FDA-compliant 510(k) submission PDF
   *
   * @param {string} projectId Project ID
   * @returns Promise with PDF URL
   */
  async generateSubmissionPDF(projectId) {
    const response = await apiRequest.post(`/api/fda510k/generate-pdf/submission`, {
      projectId,
    });
    return response.data;
  },

  /**
   * Get an existing device profile by project ID
   *
   * @param {string} projectId The project ID to retrieve the profile for
   * @returns {Promise<Object>} The device profile data
   */
  async getDeviceProfile(projectId) {
    const response = await apiRequest.get(`/api/fda510k/device-profile/${projectId}`);
    return response.ok ? response.data : null;
  },

  /**
   * Save a device profile and create necessary folder structure in Document Vault
   *
   * This enhanced method handles:
   * 1. Saving the device profile data
   * 2. Creating/updating device profile document in Document Vault
   * 3. Creating the proper folder structure for the 510(k) submission
   * 4. Establishing connections to downstream workflow components
   *
   * @param {Object} profileData The complete device profile data
   * @returns {Promise<Object>} Created/updated profile with Document Vault references
   */
  async saveDeviceProfile(profileData) {
    console.log('Creating device profile with Document Vault integration:', profileData);

    // Step 1: Save profile data to API
    const response = await apiRequest.post(`/api/fda510k/device-profile`, profileData);
    const savedProfile = response.data;

    if (!savedProfile || !savedProfile.id) {
      throw new Error('Failed to save device profile - no ID returned');
    }

    // Step 2: Create document structure in Document Vault
    const folderStructure = await this.createDeviceVaultStructure(savedProfile);

    // Step 3: Create profile document in Document Vault
    const profileDocumentData = {
      name: `${savedProfile.deviceName || 'Unnamed Device'} - Device Profile`,
      content: JSON.stringify(savedProfile, null, 2),
      mimeType: 'application/json',
      metadata: {
        documentType: '510k-device-profile',
        deviceId: savedProfile.id,
        manufacturer: savedProfile.manufacturer,
        deviceClass: savedProfile.deviceClass,
        date: new Date().toISOString(),
        version: '1.0',
        status: 'active',
      },
    };

    // Create JSON document in the device profile folder
    const documentResult = await this.createProfileDocument(
      folderStructure.deviceProfileFolderId,
      profileDocumentData
    );

    // Step 4: Update the profile with document references
    const updatedProfile = {
      ...savedProfile,
      documentVaultId: documentResult.id,
      folderStructure: {
        rootFolderId: folderStructure.rootFolderId,
        deviceProfileFolderId: folderStructure.deviceProfileFolderId,
        predicatesFolderId: folderStructure.predicatesFolderId,
        equivalenceFolderId: folderStructure.equivalenceFolderId,
        testingFolderId: folderStructure.testingFolderId,
        submissionFolderId: folderStructure.submissionFolderId,
      },
    };

    // Step 5: Save the updated profile with document references
    await apiRequest.put(`/api/fda510k/device-profile/${savedProfile.id}`, updatedProfile);

    console.log('Device profile created and vault integration complete:', updatedProfile);
    return updatedProfile;
  },

  /**
   * Create the folder structure for a device in the Document Vault
   *
   * @param {Object} deviceProfile The device profile to create folders for
   * @returns {Promise<Object>} Object with created folder IDs
   */
  async createDeviceVaultStructure(deviceProfile) {
    try {
      // Create a main folder for the device using deviceProfile.id as the unique identifier
      const folderName = deviceProfile.deviceName || 'New Medical Device';
      const deviceFolder = await docuShareService.createFolder({
        name: `510(k) - ${folderName}`,
        parentId: 'root', // Root folder in Document Vault
        metadata: {
          type: '510k-submission',
          deviceId: deviceProfile.id,
          deviceClass: deviceProfile.deviceClass,
          date: new Date().toISOString(),
        },
      });

      // Create subfolders for different parts of the 510(k) process
      const deviceProfileFolder = await docuShareService.createFolder({
        name: 'Device Profile',
        parentId: deviceFolder.id,
        metadata: { section: 'device-profile' },
      });

      const predicatesFolder = await docuShareService.createFolder({
        name: 'Predicate Devices',
        parentId: deviceFolder.id,
        metadata: { section: 'predicates' },
      });

      const equivalenceFolder = await docuShareService.createFolder({
        name: 'Substantial Equivalence',
        parentId: deviceFolder.id,
        metadata: { section: 'equivalence' },
      });

      const testingFolder = await docuShareService.createFolder({
        name: 'Performance Testing',
        parentId: deviceFolder.id,
        metadata: { section: 'testing' },
      });

      const submissionFolder = await docuShareService.createFolder({
        name: 'Final Submission',
        parentId: deviceFolder.id,
        metadata: { section: 'submission' },
      });

      return {
        rootFolderId: deviceFolder.id,
        deviceProfileFolderId: deviceProfileFolder.id,
        predicatesFolderId: predicatesFolder.id,
        equivalenceFolderId: equivalenceFolder.id,
        testingFolderId: testingFolder.id,
        submissionFolderId: submissionFolder.id,
      };
    } catch (error) {
      console.error('Error creating folder structure in Document Vault:', error);
      throw error;
    }
  },

  /**
   * Create a profile document in the Document Vault
   *
   * @param {string} folderId Folder ID to create the document in
   * @param {Object} documentData Document data to create
   * @returns {Promise<Object>} Created document
   */
  async createProfileDocument(folderId, documentData) {
    try {
      const document = await docuShareService.createDocument({
        ...documentData,
        folderId,
      });

      return document;
    } catch (error) {
      console.error('Error creating profile document in Document Vault:', error);
      throw error;
    }
  },

  /**
   * Generate and save a predicate comparison document
   *
   * @param {Object} comparisonData Comparison data between subject and predicate devices
   * @param {string} folderId Folder ID to save the document in
   * @returns {Promise<Object>} Created document
   */
  async savePredicateComparison(comparisonData, folderId) {
    try {
      const documentData = {
        name: `Predicate Comparison - ${comparisonData.predicateDevice.name}`,
        content: JSON.stringify(comparisonData, null, 2),
        mimeType: 'application/json',
        metadata: {
          documentType: '510k-predicate-comparison',
          subjectDeviceId: comparisonData.subjectDevice.id,
          predicateDeviceId: comparisonData.predicateDevice.id,
          date: new Date().toISOString(),
          version: '1.0',
        },
        folderId,
      };

      const document = await docuShareService.createDocument(documentData);
      return document;
    } catch (error) {
      console.error('Error saving predicate comparison document:', error);
      throw error;
    }
  },

  /**
   * Save equivalence determination document
   *
   * @param {Object} equivalenceData Substantial equivalence data
   * @param {string} folderId Folder ID to save the document in
   * @returns {Promise<Object>} Created document
   */
  async saveEquivalenceDetermination(equivalenceData, folderId) {
    try {
      const documentData = {
        name: 'Substantial Equivalence Determination',
        content: JSON.stringify(equivalenceData, null, 2),
        mimeType: 'application/json',
        metadata: {
          documentType: '510k-equivalence-determination',
          deviceId: equivalenceData.deviceId,
          date: new Date().toISOString(),
          version: '1.0',
        },
        folderId,
      };

      const document = await docuShareService.createDocument(documentData);
      return document;
    } catch (error) {
      console.error('Error saving equivalence determination document:', error);
      throw error;
    }
  },

  /**
   * Generate the final 510(k) submission package
   *
   * This function assembles all required documents for a 510(k) submission,
   * including the main summary document, eSTAR file, and supporting attachments.
   *
   * @param {Object} data All data needed for report generation
   * @returns {Promise<Object>} Generated report and document URLs
   */
  async generateFinal510kReport(data) {
    const { deviceProfile, compliance, equivalence, sections, options } = data;

    // Call the API to generate the 510(k) package
    const response = await apiRequest.post(`/api/fda510k/generate-report`, {
      deviceProfile,
      compliance,
      equivalence,
      sections,
      options,
    });

    return response.data;
  },

  /**
   * Validate a completed 510(k) submission for FDA compliance
   *
   * @param {string} projectId Project ID to validate
   * @returns {Promise<Object>} Validation results
   */
  async validateSubmission(projectId) {
    const response = await apiRequest.post(`/api/fda510k/validate-submission/${projectId}`);
    return response.data;
  },
};

export default FDA510kService;
