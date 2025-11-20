/**
 * Folder Hierarchy Utilities
 *
 * Helper functions for working with reference model folder hierarchies.
 */

/**
 * Builds a full path from a folder and its ancestors
 *
 * @param {Object} folder - Current folder
 * @param {Array} allFolders - All folders in the system
 * @returns {Array} Path array of folder objects from root to current folder
 */
export function buildFolderPath(folder, allFolders) {
  if (!folder) return [];

  const path = [folder];
  let currentFolder = folder;

  // Maximum depth to prevent infinite loops
  const maxDepth = 10;
  let depth = 0;

  while (currentFolder.parent_id && depth < maxDepth) {
    const parentFolder = allFolders.find(f => f.id === currentFolder.parent_id);
    if (!parentFolder) break;

    path.unshift(parentFolder);
    currentFolder = parentFolder;
    depth++;
  }

  return path;
}

/**
 * Determines if a folder is valid for a document subtype based on the reference model
 *
 * @param {Object} folder - The folder to check
 * @param {string} subtypeId - Document subtype ID
 * @param {Array} allFolders - All folders
 * @param {Object} referenceModel - Reference model data from useReferenceModel hook
 * @returns {boolean} True if the folder is valid for the document type
 */
export function isFolderValidForSubtype(folder, subtypeId, allFolders, referenceModel) {
  if (!folder || !subtypeId) return false;

  // Get the subtype
  const subtype = referenceModel.getSubtype(subtypeId);
  if (!subtype) return false;

  // Type-specific folder?
  if (folder.document_type_id) {
    return folder.document_type_id === subtype.type_id;
  }

  // Check parent folders until we find one with a document_type_id
  const path = buildFolderPath(folder, allFolders);

  // Find the topmost folder with a document_type_id
  const typeFolder = path.find(f => !!f.document_type_id);
  if (!typeFolder) return true; // No type constraints found

  return typeFolder.document_type_id === subtype.type_id;
}

/**
 * Gets recommended folders for a document subtype
 *
 * @param {string} subtypeId - Document subtype ID
 * @param {Array} allFolders - All folders in the system
 * @param {Object} referenceModel - Reference model data from useReferenceModel hook
 * @returns {Array} Recommended folders for this document subtype
 */
export function getRecommendedFolders(subtypeId, allFolders, referenceModel) {
  if (!subtypeId) return [];

  // Get the subtype
  const subtype = referenceModel.getSubtype(subtypeId);
  if (!subtype) return [];

  // Find all folders that are valid for this subtype
  return allFolders.filter(folder =>
    isFolderValidForSubtype(folder, subtypeId, allFolders, referenceModel)
  );
}

/**
 * Formats a folder path as a string
 *
 * @param {Array} path - Array of folder objects
 * @returns {string} Path as a string
 */
export function formatFolderPath(path) {
  if (!path || !path.length) return '';
  return path.map(folder => folder.name).join(' / ');
}
