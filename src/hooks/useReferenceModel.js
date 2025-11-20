import { useQuery } from '@tanstack/react-query';

/**
 * useReferenceModel Hook
 *
 * This hook provides access to the reference model data:
 * - Document types
 * - Document subtypes
 * - Lifecycles
 * - Folder templates
 *
 * It fetches all data in a single query and caches it, with utility
 * functions for filtering and finding specific items.
 *
 * @returns {Object} Reference model data and utility functions
 */
export default function useReferenceModel() {
  // Fetch all reference model data
  const { data, isLoading, error, isError } = useQuery({
    queryKey: ['/api/meta/reference-model-data'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Helper functions

  /**
   * Get all document types
   * @returns {Array} Document types
   */
  const getTypes = () => data?.types || [];

  /**
   * Get all document subtypes
   * @param {string} typeId Optional type ID to filter by
   * @returns {Array} Document subtypes
   */
  const getSubtypes = typeId => {
    const subtypes = data?.subtypes || [];
    return typeId ? subtypes.filter(s => s.type_id === typeId) : subtypes;
  };

  /**
   * Get a specific document type by ID
   * @param {string} id Type ID
   * @returns {Object|undefined} Document type
   */
  const getType = id => data?.types?.find(t => t.id === id);

  /**
   * Get a specific document subtype by ID
   * @param {string} id Subtype ID
   * @returns {Object|undefined} Document subtype
   */
  const getSubtype = id => data?.subtypes?.find(s => s.id === id);

  /**
   * Get a specific lifecycle by ID
   * @param {string} id Lifecycle ID
   * @returns {Object|undefined} Lifecycle
   */
  const getLifecycle = id => data?.lifecycles?.find(l => l.id === id);

  /**
   * Get a subtype with its type and lifecycle information
   * @param {string} id Subtype ID
   * @returns {Object|undefined} Enriched subtype
   */
  const getEnrichedSubtype = id => {
    const subtype = getSubtype(id);
    if (!subtype) return undefined;

    const type = getType(subtype.type_id);
    const lifecycle = getLifecycle(subtype.lifecycle_id);

    return {
      ...subtype,
      type,
      lifecycle,
    };
  };

  /**
   * Get folder templates
   * @param {number|null} parentId Optional parent ID to filter by
   * @returns {Array} Folder templates
   */
  const getFolderTemplates = parentId => {
    const templates = data?.folderTemplates || [];
    if (parentId === undefined) return templates;

    if (parentId === null) {
      return templates.filter(t => !t.parent_id);
    }

    return templates.filter(t => t.parent_id === parentId);
  };

  return {
    // Raw data
    data,
    isLoading,
    error,
    isError,

    // Getter methods
    getTypes,
    getSubtypes,
    getType,
    getSubtype,
    getLifecycle,
    getEnrichedSubtype,
    getFolderTemplates,

    // Convenience properties for common data
    types: data?.types || [],
    subtypes: data?.subtypes || [],
    lifecycles: data?.lifecycles || [],
    folderTemplates: data?.folderTemplates || [],
  };
}
