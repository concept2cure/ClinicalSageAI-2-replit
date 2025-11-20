/**
 * Device Profile Schema
 *
 * This schema defines the structure for device profiles used in 510(k) submissions.
 * It is shared between frontend and backend to ensure data consistency.
 *
 * IMPORTANT: This schema accurately reflects the actual database structure.
 * Any changes here should be coordinated with database migrations.
 */

// The actual database columns that exist in the device_profiles table
export const DEVICE_PROFILE_COLUMNS = [
  'device_name',
  'device_class',
  'intended_use',
  'manufacturer',
  'model_number',
  'technical_characteristics',
  'document_vault_id',
  'folder_structure',
  'created_at',
  'updated_at',
];

// For validating incoming data before database operations
export const validateDeviceProfileData = data => {
  // Create a filtered version with only valid fields
  const filteredData = {};

  // Only include fields that actually exist in the database
  DEVICE_PROFILE_COLUMNS.forEach(column => {
    if (data[column] !== undefined) {
      filteredData[column] = data[column];
    }

    // Handle camelCase to snake_case conversion for frontend properties
    const camelKey = column.replace(/_([a-z])/g, g => g[1].toUpperCase());
    if (data[camelKey] !== undefined && filteredData[column] === undefined) {
      filteredData[column] = data[camelKey];
    }
  });

  // Required field validation
  if (!filteredData.device_name) {
    throw new Error('Device name is required');
  }

  return filteredData;
};

// Convert database records (snake_case) to frontend format (camelCase)
export const formatDeviceProfileForFrontend = dbRecord => {
  if (!dbRecord) return null;

  return {
    id: dbRecord.id,
    deviceName: dbRecord.device_name,
    deviceClass: dbRecord.device_class,
    intendedUse: dbRecord.intended_use,
    manufacturer: dbRecord.manufacturer,
    modelNumber: dbRecord.model_number,
    technicalCharacteristics: dbRecord.technical_characteristics,
    documentVaultId: dbRecord.document_vault_id,
    folderStructure: dbRecord.folder_structure,
    createdAt: dbRecord.created_at,
    updatedAt: dbRecord.updated_at,
  };
};

// Convert frontend format (camelCase) to database format (snake_case)
export const formatDeviceProfileForDatabase = frontendData => {
  const dbData = {
    device_name: frontendData.deviceName,
    device_class: frontendData.deviceClass,
    intended_use: frontendData.intendedUse,
    manufacturer: frontendData.manufacturer,
    model_number: frontendData.modelNumber,
    // Only stringify if not already a string
    technical_characteristics:
      typeof frontendData.technicalCharacteristics === 'string'
        ? frontendData.technicalCharacteristics
        : JSON.stringify(frontendData.technicalCharacteristics || {}),
    document_vault_id: frontendData.documentVaultId,
    folder_structure:
      typeof frontendData.folderStructure === 'string'
        ? frontendData.folderStructure
        : JSON.stringify(frontendData.folderStructure || {}),
  };

  return dbData;
};
