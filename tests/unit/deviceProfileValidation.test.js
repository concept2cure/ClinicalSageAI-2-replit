/**
 * Device Profile Validation Test
 *
 * This test verifies that our device profile validation works consistently
 * across the frontend and backend components.
 */

// Import schema utilities
const {
  validateDeviceProfileData,
  formatDeviceProfileForFrontend,
  formatDeviceProfileForDatabase,
} = require('../shared/schemas/DeviceProfileSchema.js');

// Sample data for testing
const sampleFrontendData = {
  deviceName: 'Test Device',
  deviceClass: 'II',
  intendedUse: 'Testing purposes only',
  manufacturer: 'Test Manufacturer',
  modelNumber: 'TEST-123',
  technicalCharacteristics: { test: true, features: ['A', 'B', 'C'] },
  documentVaultId: 'vault-123',
  folderStructure: { root: { children: [] } },
};

const sampleDbData = {
  id: 1,
  device_name: 'Test Device',
  device_class: 'II',
  intended_use: 'Testing purposes only',
  manufacturer: 'Test Manufacturer',
  model_number: 'TEST-123',
  technical_characteristics: JSON.stringify({ test: true, features: ['A', 'B', 'C'] }),
  document_vault_id: 'vault-123',
  folder_structure: JSON.stringify({ root: { children: [] } }),
  created_at: new Date(),
  updated_at: new Date(),
};

describe('Device Profile Schema Validation', () => {
  test('formatDeviceProfileForDatabase properly converts frontend data to database format', () => {
    const result = formatDeviceProfileForDatabase(sampleFrontendData);

    // Check field conversion
    expect(result.device_name).toBe(sampleFrontendData.deviceName);
    expect(result.device_class).toBe(sampleFrontendData.deviceClass);
    expect(result.intended_use).toBe(sampleFrontendData.intendedUse);
    expect(result.manufacturer).toBe(sampleFrontendData.manufacturer);
    expect(result.model_number).toBe(sampleFrontendData.modelNumber);

    // Check JSON stringification
    expect(typeof result.technical_characteristics).toBe('string');
    const parsedTech = JSON.parse(result.technical_characteristics);
    expect(parsedTech).toEqual(sampleFrontendData.technicalCharacteristics);

    expect(typeof result.folder_structure).toBe('string');
    const parsedFolder = JSON.parse(result.folder_structure);
    expect(parsedFolder).toEqual(sampleFrontendData.folderStructure);
  });

  test('formatDeviceProfileForFrontend properly converts database data to frontend format', () => {
    const result = formatDeviceProfileForFrontend(sampleDbData);

    // Check field conversion
    expect(result.deviceName).toBe(sampleDbData.device_name);
    expect(result.deviceClass).toBe(sampleDbData.device_class);
    expect(result.intendedUse).toBe(sampleDbData.intended_use);
    expect(result.manufacturer).toBe(sampleDbData.manufacturer);
    expect(result.modelNumber).toBe(sampleDbData.model_number);
    expect(result.documentVaultId).toBe(sampleDbData.document_vault_id);

    // We don't parse JSON here, the API should handle that
    expect(result.technicalCharacteristics).toBe(sampleDbData.technical_characteristics);
    expect(result.folderStructure).toBe(sampleDbData.folder_structure);

    // Check timestamps
    expect(result.createdAt).toEqual(sampleDbData.created_at);
    expect(result.updatedAt).toEqual(sampleDbData.updated_at);
  });

  test('validateDeviceProfileData rejects invalid data', () => {
    // Missing required deviceName field
    const invalidData = {
      deviceClass: 'II',
      intendedUse: 'Testing purposes only',
    };

    // Should throw an error for missing deviceName
    expect(() => {
      validateDeviceProfileData(invalidData);
    }).toThrow('Device name is required');
  });

  test('validation handles camelCase and snake_case conversions', () => {
    // Mixed case data format
    const mixedData = {
      deviceName: 'Mixed Case Device',
      device_class: 'II',
      intended_use: 'Testing mixed case fields',
      manufacturer: 'Test Corp',
    };

    const result = validateDeviceProfileData(mixedData);

    // Check that both formats were handled correctly
    expect(result.device_name).toBe('Mixed Case Device');
    expect(result.device_class).toBe('II');
    expect(result.intended_use).toBe('Testing mixed case fields');
    expect(result.manufacturer).toBe('Test Corp');
  });
});
