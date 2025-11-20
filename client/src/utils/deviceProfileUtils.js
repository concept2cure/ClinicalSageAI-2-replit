/**
 * Returns the default structure for a device profile.
 */
export const getDefaultDeviceProfileStructure = () => ({
  documentType: '510k',
  sections: ['device-info', 'predicates', 'compliance'],
  version: '1.0',
});

/**
 * Returns default metadata for a new device profile.
 */
export const getDefaultDeviceProfileMetadata = () => {
  const now = new Date().toISOString();
  return {
    createdAt: now,
    lastUpdated: now,
  };
};

/**
 * Creates a new, complete device profile object.
 * @param {Object} initialProps - Optional initial properties to override defaults.
 * @returns {Object} A new device profile object.
 */
export const createNewDeviceProfile = (initialProps = {}) => {
  const defaultStructure = getDefaultDeviceProfileStructure();
  const defaultMetadata = getDefaultDeviceProfileMetadata();

  const baseProfile = {
    id: `device-${Date.now()}`,
    deviceName: 'Sample Medical Device',
    manufacturer: 'Sample Manufacturer',
    productCode: 'ABC',
    deviceClass: 'II',
    intendedUse: 'For diagnostic use in clinical settings',
    description: 'A medical device designed for diagnostic procedures',
    technicalSpecifications: 'Meets ISO 13485 standards',
    regulatoryClass: 'Class II',
    status: 'active',
    // Ensure deep copies for structure and metadata
    structure: { ...defaultStructure },
    metadata: { ...defaultMetadata },
    ...initialProps, // Apply overrides from initialProps
  };

  // If initialProps includes partial structure or metadata, merge them carefully
  // ensuring not to just overwrite but to merge with defaults.
  if (initialProps.structure) {
    baseProfile.structure = { ...defaultStructure, ...initialProps.structure };
  }
  if (initialProps.metadata) {
    baseProfile.metadata = { ...defaultMetadata, ...initialProps.metadata };
  }

  // Ensure ID is correctly handled if passed in initialProps
  if (initialProps.id) {
    baseProfile.id = initialProps.id;
  }

  return baseProfile;
};

/**
 * Ensures an existing profile has the necessary structure and metadata.
 * Useful for migrating profiles loaded from localStorage or other sources.
 *
 * @param {Object} profile - The device profile to check and migrate.
 * @returns {Object} The migrated device profile, or a new profile if input is null/undefined.
 * @throws {Error} Will throw an error if essential corrections cannot be made
 */
export const ensureProfileIntegrity = profile => {
  try {
    // Enhanced validation - if profile is null, undefined, or not an object, create a new one
    if (!profile || typeof profile !== 'object') {
      console.warn('ensureProfileIntegrity received invalid profile, creating new one.');
      return createNewDeviceProfile();
    }

    let needsUpdate = false;
    const now = new Date().toISOString();

    // Create a deep copy to avoid mutating the original object directly
    // This is especially important when working with React state
    const newProfile = JSON.parse(JSON.stringify(profile));

    // ---- STAGE 1: CRITICAL DATA VALIDATION ----

    // Ensure ID with explicit validation
    if (!newProfile.id || typeof newProfile.id !== 'string' || newProfile.id.trim() === '') {
      newProfile.id = `device-${Date.now()}`;
      needsUpdate = true;
      console.log(`Profile Integrity: Added/fixed ID ${newProfile.id}`);
    }

    // ---- STAGE 2: STRUCTURE VALIDATION ----

    // Ensure structure with comprehensive validation
    const defaultStructure = getDefaultDeviceProfileStructure();

    // Check if structure is missing or invalid
    if (!newProfile.structure || typeof newProfile.structure !== 'object') {
      console.log(
        `Profile Integrity: Missing structure object for profile ID ${newProfile.id}, rebuilding`
      );

      // Create a completely new structure object
      newProfile.structure = {
        documentType: defaultStructure.documentType,
        sections: [...defaultStructure.sections],
        version: defaultStructure.version,
      };

      needsUpdate = true;
    } else {
      // Structure exists but might need property validation
      let structureFixed = false;

      // Validate documentType (critical property)
      if (
        typeof newProfile.structure.documentType !== 'string' ||
        newProfile.structure.documentType.trim() === ''
      ) {
        console.log(
          `Profile Integrity: Invalid documentType for profile ID ${newProfile.id}, fixing`
        );
        newProfile.structure.documentType = defaultStructure.documentType;
        structureFixed = true;
      }

      // Validate sections array (critical property)
      if (!Array.isArray(newProfile.structure.sections)) {
        console.log(
          `Profile Integrity: sections is not an array for profile ID ${newProfile.id}, fixing`
        );
        newProfile.structure.sections = [...defaultStructure.sections];
        structureFixed = true;
      } else if (newProfile.structure.sections.length === 0) {
        console.log(
          `Profile Integrity: sections array is empty for profile ID ${newProfile.id}, populating`
        );
        newProfile.structure.sections = [...defaultStructure.sections];
        structureFixed = true;
      } else {
        // Ensure sections contains valid string entries
        const validSections = newProfile.structure.sections.filter(
          section => typeof section === 'string' && section.trim() !== ''
        );

        if (validSections.length !== newProfile.structure.sections.length) {
          console.log(
            `Profile Integrity: Found invalid section entries for profile ID ${newProfile.id}, fixing`
          );
          newProfile.structure.sections =
            validSections.length > 0 ? validSections : [...defaultStructure.sections];
          structureFixed = true;
        }
      }

      // Validate version property
      if (typeof newProfile.structure.version !== 'string' || !newProfile.structure.version) {
        console.log(`Profile Integrity: Invalid version for profile ID ${newProfile.id}, fixing`);
        newProfile.structure.version = defaultStructure.version;
        structureFixed = true;
      }

      if (structureFixed) {
        needsUpdate = true;
        console.log(
          `Profile Integrity: Fixed structure properties for profile ID ${newProfile.id}`,
          newProfile.structure
        );
      }
    }

    // ---- STAGE 3: METADATA VALIDATION ----

    // Ensure metadata with explicit validation
    const defaultMetadata = getDefaultDeviceProfileMetadata();

    // Check if metadata is missing or invalid
    if (!newProfile.metadata || typeof newProfile.metadata !== 'object') {
      console.log(
        `Profile Integrity: Missing metadata object for profile ID ${newProfile.id}, rebuilding`
      );

      // Create a fresh metadata object with proper timestamps
      newProfile.metadata = {
        createdAt: now,
        lastUpdated: now,
      };

      needsUpdate = true;
    } else {
      // Metadata exists but might need property validation

      // Validate createdAt (critical timestamp)
      if (typeof newProfile.metadata.createdAt !== 'string' || !newProfile.metadata.createdAt) {
        console.log(
          `Profile Integrity: Invalid createdAt timestamp for profile ID ${newProfile.id}, fixing`
        );
        newProfile.metadata.createdAt = now;
        needsUpdate = true;
      } else {
        // Validate ISO format of createdAt
        try {
          // Check if it's a valid date string
          new Date(newProfile.metadata.createdAt).toISOString();
        } catch (e) {
          console.log(
            `Profile Integrity: Invalid createdAt date format for profile ID ${newProfile.id}, fixing`
          );
          newProfile.metadata.createdAt = now;
          needsUpdate = true;
        }
      }

      // Always update lastUpdated timestamp
      newProfile.metadata.lastUpdated = now;
      needsUpdate = true;
    }

    // ---- STAGE 4: REQUIRED FIELDS VALIDATION ----

    // Ensure required device fields with comprehensive validation
    const requiredStringFields = [
      'deviceName',
      'manufacturer',
      'productCode',
      'deviceClass',
      'status',
    ];

    const defaultValues = {
      deviceName: 'Medical Device',
      manufacturer: 'Manufacturer',
      productCode: 'ABC',
      deviceClass: 'II',
      status: 'active',
    };

    for (const field of requiredStringFields) {
      // Check if field is missing or invalid
      if (
        !newProfile[field] ||
        typeof newProfile[field] !== 'string' ||
        newProfile[field].trim() === ''
      ) {
        console.log(
          `Profile Integrity: Missing or invalid ${field} for profile ID ${newProfile.id}, fixing`
        );

        // Use default value for the field
        newProfile[field] = defaultValues[field] || 'default';
        needsUpdate = true;
      }
    }

    // Ensure other required fields have sensible values
    if (typeof newProfile.intendedUse !== 'string' || newProfile.intendedUse.trim() === '') {
      console.log(
        `Profile Integrity: Missing or invalid intendedUse for profile ID ${newProfile.id}, fixing`
      );
      newProfile.intendedUse = 'For diagnostic use in clinical settings';
      needsUpdate = true;
    }

    if (typeof newProfile.description !== 'string' || newProfile.description.trim() === '') {
      console.log(
        `Profile Integrity: Missing or invalid description for profile ID ${newProfile.id}, fixing`
      );
      newProfile.description = 'A medical device designed for diagnostic procedures';
      needsUpdate = true;
    }

    // ---- FINAL CHECKS AND LOGGING ----

    // Perform a final structural validation before returning
    if (
      !newProfile.structure ||
      typeof newProfile.structure !== 'object' ||
      typeof newProfile.structure.documentType !== 'string' ||
      !Array.isArray(newProfile.structure.sections)
    ) {
      throw new Error('Failed to ensure profile integrity: Critical structure validation failed.');
    }

    if (
      !newProfile.metadata ||
      typeof newProfile.metadata !== 'object' ||
      typeof newProfile.metadata.createdAt !== 'string'
    ) {
      throw new Error('Failed to ensure profile integrity: Critical metadata validation failed.');
    }

    if (needsUpdate) {
      console.log('Profile was updated for integrity. Final ensured profile:', newProfile);
    }

    return newProfile;
  } catch (error) {
    console.error('Fatal error in ensureProfileIntegrity:', error);
    throw new Error(`Error creating document structure: ${error.message}`);
  }
};
