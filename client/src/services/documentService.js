import axios from 'axios';

// Base URL for document API
const API_URL = '/api/documents';

/**
 * Upload a document to the server
 * @param {File} file - The file to upload
 * @param {Object} metadata - Metadata for the document
 * @returns {Promise<Object>} Uploaded document information
 */
export async function uploadDocument(file, metadata) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('metadata', JSON.stringify(metadata));

  try {
    const response = await axios.post(`${API_URL}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading document:', error);
    throw new Error(`Failed to upload document: ${error.message}`);
  }
}

/**
 * Fetch documents from the server with optional filters
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Array>} List of documents
 */
export async function fetchDocuments(filters = {}) {
  try {
    // Convert filters to query parameters
    const queryParams = Object.entries(filters)
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');

    const url = queryParams ? `${API_URL}?${queryParams}` : API_URL;
    const response = await axios.get(url);

    return response.data;
  } catch (error) {
    console.error('Error fetching documents:', error);
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }
}

/**
 * Download a document
 * @param {string} documentId - ID of the document to download
 * @returns {Promise<Blob>} Document data as blob
 */
export async function downloadDocument(documentId) {
  try {
    const response = await axios.get(`${API_URL}/${documentId}/download`, {
      responseType: 'blob',
    });

    return response.data;
  } catch (error) {
    console.error('Error downloading document:', error);
    throw new Error(`Failed to download document: ${error.message}`);
  }
}

/**
 * View document metadata
 * @param {string} documentId - ID of the document
 * @returns {Promise<Object>} Document metadata
 */
export async function getDocumentMetadata(documentId) {
  try {
    const response = await axios.get(`${API_URL}/${documentId}/metadata`);
    return response.data;
  } catch (error) {
    console.error('Error fetching document metadata:', error);
    throw new Error(`Failed to fetch document metadata: ${error.message}`);
  }
}

/**
 * Save a CER document with all related data
 * @param {Object} cerData - Complete CER data
 * @returns {Promise<Object>} Saved CER information
 */
export async function saveCER(cerData) {
  try {
    const response = await axios.post(`${API_URL}/cer`, cerData);
    return response.data;
  } catch (error) {
    console.error('Error saving CER:', error);
    throw new Error(`Failed to save CER: ${error.message}`);
  }
}

/**
 * Fetch CER history
 * @param {string} deviceId - Device ID to filter by
 * @returns {Promise<Array>} List of CER versions
 */
export async function fetchCERHistory(deviceId) {
  try {
    const response = await axios.get(
      `${API_URL}/cer/history?deviceId=${encodeURIComponent(deviceId)}`
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching CER history:', error);
    throw new Error(`Failed to fetch CER history: ${error.message}`);
  }
}

/**
 * Compare two CER versions
 * @param {string} versionA - First version ID
 * @param {string} versionB - Second version ID
 * @returns {Promise<Object>} Comparison results
 */
export async function compareCERVersions(versionA, versionB) {
  try {
    const response = await axios.post(`${API_URL}/cer/compare`, {
      versionA,
      versionB,
    });
    return response.data;
  } catch (error) {
    console.error('Error comparing CER versions:', error);
    throw new Error(`Failed to compare CER versions: ${error.message}`);
  }
}

/**
 * Share a document with other users
 * @param {string} documentId - ID of the document to share
 * @param {Array} recipients - List of recipient emails
 * @param {string} permission - Permission level
 * @returns {Promise<Object>} Share results
 */
export async function shareDocument(documentId, recipients, permission) {
  try {
    const response = await axios.post(`${API_URL}/${documentId}/share`, {
      recipients,
      permission,
    });
    return response.data;
  } catch (error) {
    console.error('Error sharing document:', error);
    throw new Error(`Failed to share document: ${error.message}`);
  }
}

/**
 * Delete a document
 * @param {string} documentId - ID of the document to delete
 * @returns {Promise<Object>} Deletion results
 */
export async function deleteDocument(documentId) {
  try {
    const response = await axios.delete(`${API_URL}/${documentId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting document:', error);
    throw new Error(`Failed to delete document: ${error.message}`);
  }
}

/**
 * Extract text from an uploaded document
 * @param {File} file - The file to extract text from
 * @returns {Promise<string>} Extracted text
 */
export async function extractTextFromDocument(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await axios.post(`${API_URL}/extract-text`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data.text;
  } catch (error) {
    console.error('Error extracting text from document:', error);
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}

/**
 * Generate a PDF from CER data
 * @param {Object} cerData - CER data to generate PDF from
 * @returns {Promise<Blob>} Generated PDF as blob
 */
export async function generateCERPDF(cerData) {
  try {
    const response = await axios.post(`${API_URL}/cer/generate-pdf`, cerData, {
      responseType: 'blob',
    });

    return response.data;
  } catch (error) {
    console.error('Error generating CER PDF:', error);
    throw new Error(`Failed to generate CER PDF: ${error.message}`);
  }
}

export default {
  uploadDocument,
  fetchDocuments,
  downloadDocument,
  getDocumentMetadata,
  saveCER,
  fetchCERHistory,
  compareCERVersions,
  shareDocument,
  deleteDocument,
  extractTextFromDocument,
  generateCERPDF,
};
