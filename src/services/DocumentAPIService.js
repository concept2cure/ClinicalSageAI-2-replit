/**
 * Document API Service
 *
 * Provides utility functions for interacting with the document vault API endpoints.
 * Centralizes all API calls related to document management, including uploading,
 * downloading, and managing document metadata.
 */

// Create a single export object for consistent API access
const documentApiService = {};

/**
 * Fetch all documents with optional filtering
 * @param {Object} options - Query parameters for filtering documents
 * @param {string} [options.type] - Filter by document type
 * @param {string} [options.status] - Filter by document status
 * @param {string} [options.search] - Search term for document name/content
 * @param {string} [options.folderId] - Filter by folder ID
 * @param {number} [options.limit] - Maximum number of documents to return
 * @param {number} [options.offset] - Offset for pagination
 * @returns {Promise<Array>} - Array of document objects
 */
documentApiService.getDocuments = async (options = {}) => {
  try {
    // Build query string from options
    const queryParams = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value);
      }
    });

    const response = await fetch(`/api/documents?${queryParams.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Error fetching documents: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in getDocuments:', error);
    throw error;
  }
};

/**
 * Fetch a single document by ID
 * @param {string} id - The document ID
 * @returns {Promise<Object>} - The document object
 */
documentApiService.getDocument = async id => {
  try {
    const response = await fetch(`/api/documents/${id}`);

    if (!response.ok) {
      throw new Error(`Error fetching document: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in getDocument:', error);
    throw error;
  }
};

/**
 * Upload a new document
 * @param {FormData} formData - The form data containing file and metadata
 * @returns {Promise<Object>} - The created document object
 */
documentApiService.uploadDocument = async formData => {
  try {
    const response = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Error uploading document: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in uploadDocument:', error);
    throw error;
  }
};

/**
 * Create a new document with content
 * @param {Object} documentData - The document data including content
 * @returns {Promise<Object>} - The created document object
 */
documentApiService.createDocument = async documentData => {
  try {
    const response = await fetch('/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(documentData),
    });

    if (!response.ok) {
      throw new Error(`Error creating document: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in createDocument:', error);
    throw error;
  }
};

/**
 * Update an existing document
 * @param {string} id - The document ID
 * @param {Object} documentData - The updated document data
 * @returns {Promise<Object>} - The updated document object
 */
documentApiService.updateDocument = async (id, documentData) => {
  try {
    const response = await fetch(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(documentData),
    });

    if (!response.ok) {
      throw new Error(`Error updating document: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in updateDocument:', error);
    throw error;
  }
};

/**
 * Delete a document
 * @param {string} id - The document ID
 * @returns {Promise<boolean>} - Success indicator
 */
documentApiService.deleteDocument = async id => {
  try {
    const response = await fetch(`/api/documents/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Error deleting document: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Error in deleteDocument:', error);
    throw error;
  }
};

/**
 * Fetch document folders
 * @param {Object} options - Query parameters
 * @param {string} [options.parentId] - Parent folder ID for hierarchy navigation
 * @returns {Promise<Array>} - Array of folder objects
 */
documentApiService.getFolders = async (options = {}) => {
  try {
    // Build query string from options
    const queryParams = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value);
      }
    });

    const response = await fetch(`/api/documents/folders?${queryParams.toString()}`);

    if (!response.ok) {
      throw new Error(`Error fetching folders: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in getFolders:', error);
    throw error;
  }
};

/**
 * Create a new folder
 * @param {Object} folderData - The folder data
 * @returns {Promise<Object>} - The created folder object
 */
documentApiService.createFolder = async folderData => {
  try {
    const response = await fetch('/api/documents/folders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(folderData),
    });

    if (!response.ok) {
      throw new Error(`Error creating folder: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in createFolder:', error);
    throw error;
  }
};

/**
 * Download a document
 * @param {string} id - The document ID
 * @param {string} [filename] - Optional filename for the downloaded file
 */
documentApiService.downloadDocument = async (id, filename) => {
  try {
    const response = await fetch(`/api/documents/${id}/download`);

    if (!response.ok) {
      throw new Error(`Error downloading document: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `document-${id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error in downloadDocument:', error);
    throw error;
  }
};

/**
 * Save CER to document vault
 * @param {Object} cerData - The CER data to save
 * @param {string} cerData.title - The title of the CER
 * @param {Array} cerData.sections - The sections of the CER
 * @param {Object} metadata - Additional document metadata
 * @returns {Promise<Object>} - The created document object
 */
documentApiService.saveCerToVault = async (cerData, metadata = {}) => {
  try {
    // Prepare document data
    const documentData = {
      name: metadata.name || cerData.title,
      type: 'cer',
      category: 'Clinical Evaluation',
      version: metadata.version || '1.0.0',
      status: metadata.status || 'draft',
      description: metadata.description || `Clinical Evaluation Report for ${cerData.title}`,
      tags: metadata.tags || ['CER', 'Clinical Evaluation'],
      author: metadata.author || 'TrialSage AI',
      content: {
        title: cerData.title,
        sections: cerData.sections,
        metadata: {
          ...metadata,
          generatedAt: new Date().toISOString(),
        },
      },
    };

    // Create document
    const response = await fetch('/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(documentData),
    });

    if (!response.ok) {
      throw new Error(`Error saving CER to vault: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in saveCerToVault:', error);
    throw error;
  }
};

export { documentApiService };
