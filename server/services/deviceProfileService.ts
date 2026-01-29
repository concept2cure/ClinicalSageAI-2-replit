/**
 * Device Profile Service
 *
 * This is a unified service to handle device profiles across both the 510(k) submission
 * pipeline and the CERV2 dashboard module. It provides a single source of truth for
 * device profile data management.
 */

// Define the DeviceProfile type
export interface DeviceProfile {
  id: string;
  deviceName?: string;
  name?: string; // Alternate field name in some UI components
  manufacturer?: string;
  modelNumber?: string;
  deviceClass?: 'I' | 'II' | 'III';
  productCode?: string;
  regulationNumber?: string;
  intendedUse?: string;
  description?: string;
  predicateDevice?: {
    name?: string;
    manufacturer?: string;
    kNumber?: string;
  };
  organizationId?: string | number;
  clientWorkspaceId?: string | number;
  createdAt?: string;
  updatedAt?: string;
  created?: string; // Alternative field name in some components
  updated?: string; // Alternative field name in some components
  [key: string]: any; // Allow for additional fields
}

// In-memory store for device profiles
// In production, this would be replaced with a database implementation
export const store = new Map<string, DeviceProfile>();

/**
 * Generate a unique ID for a device profile
 * @returns A UUID string
 */
const generateId = (): string => {
  // Use crypto.randomBytes to generate a unique ID
  return require('crypto').randomBytes(16).toString('hex');
};

/**
 * Get a profile key that includes tenant context
 * @param organizationId Organization ID for multi-tenant context
 * @param id Profile ID
 * @returns A composite key string
 */
const getProfileKey = (organizationId: string | number | null | undefined, id: string): string => {
  return `${organizationId || 'global'}_${id}`;
};

/**
 * List all device profiles for an organization
 * @param organizationId Organization ID for filtering profiles
 * @returns Array of device profiles
 */
export function listProfiles(organizationId?: string | number): DeviceProfile[] {
  return Array.from(store.entries())
    .filter(([key]) => key.startsWith(`${organizationId || 'global'}_`))
    .map(([, profile]) => profile);
}

/**
 * Get a specific device profile by ID
 * @param id Profile ID
 * @param organizationId Organization ID for tenant context
 * @returns The device profile or undefined if not found
 */
export function getProfile(
  id: string,
  organizationId?: string | number
): DeviceProfile | undefined {
  const key = getProfileKey(organizationId, id);
  return store.get(key);
}

/**
 * Create a new device profile
 * @param data Profile data without ID
 * @param organizationId Organization ID for tenant context
 * @param clientWorkspaceId Optional client workspace ID
 * @returns The created device profile
 */
export function createProfile(
  data: Omit<DeviceProfile, 'id'>,
  organizationId?: string | number,
  clientWorkspaceId?: string | number
): DeviceProfile {
  const id = generateId();
  const now = new Date().toISOString();

  const profile: DeviceProfile = {
    ...data,
    id,
    organizationId,
    clientWorkspaceId,
    createdAt: now,
    updatedAt: now,
    // Add alternate field names for backward compatibility
    created: now,
    updated: now,
  };

  const key = getProfileKey(organizationId, id);
  store.set(key, profile);

  console.log(`Created device profile ${id}`, {
    name: profile.deviceName || profile.name,
    organizationId,
  });

  return profile;
}

/**
 * Update an existing device profile
 * @param id Profile ID
 * @param data Updated profile data
 * @param organizationId Organization ID for tenant context
 * @returns The updated device profile
 */
export function updateProfile(
  id: string,
  data: Partial<DeviceProfile>,
  organizationId?: string | number
): DeviceProfile {
  const key = getProfileKey(organizationId, id);
  const existing = store.get(key);

  if (!existing) {
    throw new Error(`Device profile not found: ${id}`);
  }

  const now = new Date().toISOString();

  const updated: DeviceProfile = {
    ...existing,
    ...data,
    id, // Ensure ID doesn't change
    organizationId: existing.organizationId, // Preserve original organization ID
    updatedAt: now,
    updated: now, // Alternate field for backward compatibility
  };

  store.set(key, updated);

  console.log(`Updated device profile ${id}`, {
    name: updated.deviceName || updated.name,
    organizationId,
  });

  return updated;
}

/**
 * Save a device profile (create or update)
 * @param data Profile data, may include ID for updates
 * @param organizationId Organization ID for tenant context
 * @param clientWorkspaceId Optional client workspace ID
 * @returns The saved device profile
 */
export function saveProfile(
  data: Partial<DeviceProfile>,
  organizationId?: string | number,
  clientWorkspaceId?: string | number
): DeviceProfile {
  if (data.id) {
    return updateProfile(data.id, data, organizationId);
  } else {
    return createProfile(data as Omit<DeviceProfile, 'id'>, organizationId, clientWorkspaceId);
  }
}

/**
 * Delete a device profile
 * @param id Profile ID to delete
 * @param organizationId Organization ID for tenant context
 * @returns True if the profile was deleted, false if not found
 */
export function deleteProfile(id: string, organizationId?: string | number): boolean {
  const key = getProfileKey(organizationId, id);
  const exists = store.has(key);

  if (exists) {
    store.delete(key);
    console.log(`Deleted device profile ${id}`, { organizationId });
    return true;
  }

  return false;
}

export default {
  listProfiles,
  getProfile,
  createProfile,
  updateProfile,
  saveProfile,
  deleteProfile,
};
