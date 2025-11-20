/**
 * Device Profile API Client
 *
 * This module provides a client-side interface for working with device profiles
 * and ensures proper validation before sending data to the server.
 */

import { apiRequest } from '../lib/api';

// The actual database columns that exist in the device_profiles table
const VALID_FIELDS = [
  'deviceName', // Maps to device_name in DB
  'deviceClass', // Maps to device_class in DB
  'intendedUse', // Maps to intended_use in DB
  'manufacturer', // Maps to manufacturer in DB
  'modelNumber', // Maps to model_number in DB
  'technicalCharacteristics', // Maps to technical_characteristics in DB
  'documentVaultId', // Maps to document_vault_id in DB
  'folderStructure', // Maps to folder_structure in DB
];

// Filter out invalid fields from a device profile object
export const validateDeviceProfile = profileData => {
  // Create a filtered version with only valid fields
  const filteredData = {};

  // Only include fields that should be sent to the API
  VALID_FIELDS.forEach(field => {
    if (profileData[field] !== undefined) {
      filteredData[field] = profileData[field];
    }
  });

  // Required field validation
  if (!filteredData.deviceName) {
    throw new Error('Device name is required');
  }

  return filteredData;
};

// Device Profile API endpoints
const DeviceProfileAPI = {
  /**
   * Create a new device profile with validated data
   *
   * @param {Object} profileData Device profile data
   * @returns {Promise<Object>} Created profile
   */
  async create(profileData) {
    try {
      // Validate data before sending to server
      const validatedData = validateDeviceProfile(profileData);

      // Send to server
      const response = await apiRequest('/api/fda510k/device-profile', {
        method: 'POST',
        data: validatedData,
      });

      return response.data || response;
    } catch (error) {
      console.error('Error creating device profile:', error);
      throw error;
    }
  },

  /**
   * Update an existing device profile with validated data
   *
   * @param {string} profileId Profile ID
   * @param {Object} profileData Updated profile data
   * @returns {Promise<Object>} Updated profile
   */
  async update(profileId, profileData) {
    try {
      // Validate data before sending to server
      const validatedData = validateDeviceProfile(profileData);

      // Send to server
      const response = await apiRequest(`/api/fda510k/device-profile/${profileId}`, {
        method: 'PUT',
        data: validatedData,
      });

      return response.data || response;
    } catch (error) {
      console.error('Error updating device profile:', error);
      throw error;
    }
  },

  /**
   * Get a device profile by ID
   *
   * @param {string} profileId Profile ID
   * @returns {Promise<Object>} Retrieved profile
   */
  async get(profileId) {
    try {
      const response = await apiRequest(`/api/fda510k/device-profile/${profileId}`);
      return response.data || response;
    } catch (error) {
      console.error('Error getting device profile:', error);
      throw error;
    }
  },

  /**
   * Get all device profiles
   *
   * @returns {Promise<Array>} List of profiles
   */
  async list() {
    try {
      const response = await apiRequest('/api/fda510k/device-profiles');
      return response.data || response;
    } catch (error) {
      console.error('Error listing device profiles:', error);
      throw error;
    }
  },
};

export default DeviceProfileAPI;
