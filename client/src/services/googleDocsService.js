/**
 * Google Docs Service
 * Handles Google Docs integration for eCTD Co-Author
 */

export const createDocument = async (title = 'Untitled Document') => {
  try {
    // In a real implementation, this would use Google Docs API
    const mockDocId = `doc_${Date.now()}`;
    return {
      id: mockDocId,
      title: title,
      url: `https://docs.google.com/document/d/${mockDocId}/edit`,
      created: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error creating Google Doc:', error);
    throw error;
  }
};

export const openDocument = async docId => {
  try {
    // In a real implementation, this would open the Google Doc
    window.open(`https://docs.google.com/document/d/${docId}/edit`, '_blank');
    return { success: true };
  } catch (error) {
    console.error('Error opening Google Doc:', error);
    throw error;
  }
};

export const getDocument = async docId => {
  try {
    // In a real implementation, this would fetch document content from Google Docs API
    return {
      id: docId,
      title: 'Clinical Overview Template',
      content: 'Document content would be here...',
      lastModified: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error fetching Google Doc:', error);
    throw error;
  }
};

export const updateDocument = async (docId, content) => {
  try {
    // In a real implementation, this would update the Google Doc via API
    return {
      success: true,
      docId: docId,
      lastModified: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error updating Google Doc:', error);
    throw error;
  }
};

export const saveToVault = async (docId, metadata = {}) => {
  try {
    const payload = {
      documentId: docId,
      ...metadata,
    };

    const response = await fetch('/api/vault/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        success: false,
        documentId: docId,
        metadata,
      };
    }

    return response.json();
  } catch (error) {
    console.error('Error saving Google Doc to vault:', error);
    return {
      success: false,
      documentId: docId,
      metadata,
      error: error.message,
    };
  }
};

export default {
  createDocument,
  openDocument,
  getDocument,
  updateDocument,
  saveToVault,
};
