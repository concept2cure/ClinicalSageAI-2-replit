/**
 * VAULT/Docushare Document Service
 *
 * This service provides methods for interacting with the VAULT/Docushare document
 * management system, supporting the eCTD document organization and workflow.
 */

import axios from 'axios';

const BASE_URL = '/api/vault';

/**
 * Get folder structure from VAULT/Docushare
 * @returns {Promise<Object>} Folder structure
 */
export const getFolderStructure = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/folders`);
    return response.data;
  } catch (error) {
    console.error('Error fetching folder structure:', error);
    throw new Error('Unable to fetch folder structure');
  }
};

/**
 * Get files within a specific folder
 * @param {string} folderId - The folder ID
 * @param {string} sequence - Optional sequence filter
 * @returns {Promise<Array>} Array of files
 */
export const getFilesInFolder = async (folderId, sequence = null) => {
  try {
    const url = sequence
      ? `${BASE_URL}/folders/${folderId}/files?sequence=${sequence}`
      : `${BASE_URL}/folders/${folderId}/files`;

    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching files for folder ${folderId}:`, error);
    throw new Error('Unable to fetch files');
  }
};

/**
 * Create a new folder in VAULT/Docushare
 * @param {string} parentFolderId - The parent folder ID
 * @param {string} folderName - Name for the new folder
 * @returns {Promise<Object>} Created folder information
 */
export const createFolder = async (parentFolderId, folderName) => {
  try {
    const response = await axios.post(`${BASE_URL}/folders`, {
      parentFolderId,
      folderName,
    });
    return response.data;
  } catch (error) {
    console.error('Error creating folder:', error);
    throw new Error('Unable to create folder');
  }
};

/**
 * Upload a file to VAULT/Docushare
 * @param {File} file - The file to upload
 * @param {string} folderId - The destination folder ID
 * @param {string} sequence - The submission sequence
 * @param {Object} metadata - Optional metadata
 * @returns {Promise<Object>} Uploaded file information
 */
export const uploadFile = async (file, folderId, sequence, metadata = {}) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folderId', folderId);
    formData.append('sequence', sequence);
    formData.append('metadata', JSON.stringify(metadata));

    const response = await axios.post(`${BASE_URL}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error('Unable to upload file');
  }
};

/**
 * Download a file from VAULT/Docushare
 * @param {string} fileId - The file ID to download
 * @returns {Promise<Blob>} File blob
 */
export const downloadFile = async fileId => {
  try {
    const response = await axios.get(`${BASE_URL}/files/${fileId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  } catch (error) {
    console.error(`Error downloading file ${fileId}:`, error);
    throw new Error('Unable to download file');
  }
};

/**
 * Get metadata for a file
 * @param {string} fileId - The file ID
 * @returns {Promise<Object>} File metadata
 */
export const getFileMetadata = async fileId => {
  try {
    const response = await axios.get(`${BASE_URL}/files/${fileId}/metadata`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching metadata for file ${fileId}:`, error);
    throw new Error('Unable to fetch file metadata');
  }
};

/**
 * Delete a file from VAULT/Docushare
 * @param {string} fileId - The file ID to delete
 * @returns {Promise<Object>} Deletion status
 */
export const deleteFile = async fileId => {
  try {
    const response = await axios.delete(`${BASE_URL}/files/${fileId}`);
    return response.data;
  } catch (error) {
    console.error(`Error deleting file ${fileId}:`, error);
    throw new Error('Unable to delete file');
  }
};

/**
 * Search for files in VAULT/Docushare
 * @param {string} query - Search query
 * @returns {Promise<Array>} Search results
 */
export const searchFiles = async query => {
  try {
    const response = await axios.get(`${BASE_URL}/search?query=${encodeURIComponent(query)}`);
    return response.data;
  } catch (error) {
    console.error(`Error searching files with query ${query}:`, error);
    throw new Error('Unable to search files');
  }
};

/**
 * Get available submission sequences
 * @returns {Promise<Array>} Array of sequence numbers
 */
export const getSequences = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/sequences`);
    return response.data;
  } catch (error) {
    console.error('Error fetching sequences:', error);
    // Return mock data for eCTD sequences (0001-0013) when API fails
    return Array.from({ length: 13 }, (_, i) => {
      const num = String(i + 1).padStart(4, '0');
      return { id: `SN${num}`, name: `SN${num}` };
    }).reverse();
  }
};

const buildAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Get full document metadata including linked objects
 * @param {string|number} documentId - The document ID
 * @returns {Promise<Object>} Document metadata
 */
export const getDocumentMetadata = async documentId => {
  const response = await fetch(`${BASE_URL}/documents/${documentId}`, {
    headers: {
      ...buildAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch document metadata');
  }

  return response.json();
};

/**
 * Get version history for a document
 * @param {string|number} documentId - The document ID
 * @returns {Promise<Array>} Version history
 */
export const getDocumentVersions = async documentId => {
  const response = await fetch(`${BASE_URL}/documents/${documentId}/versions`, {
    headers: {
      ...buildAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch versions');
  }

  return response.json();
};

/**
 * Get audit trail for a document
 * @param {string|number} documentId - The document ID
 * @returns {Promise<Array>} Audit trail entries
 */
export const getDocumentAuditTrail = async documentId => {
  const response = await fetch(`${BASE_URL}/documents/${documentId}/audit`, {
    headers: {
      ...buildAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch audit trail');
  }

  return response.json();
};

export default {
  getFolderStructure,
  getFilesInFolder,
  createFolder,
  uploadFile,
  downloadFile,
  getFileMetadata,
  deleteFile,
  searchFiles,
  getSequences,
  getDocumentMetadata,
  getDocumentVersions,
  getDocumentAuditTrail,
};
