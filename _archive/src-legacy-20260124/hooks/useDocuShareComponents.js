import { useState, useEffect } from 'react';
import { listDocs, uploadDoc, downloadDoc, getDocViewUrl } from './useDocuShare';

/**
 * Custom hook to integrate with DocuShare for component use
 *
 * @returns {Object} DocuShare operations and state
 */
export function useDocuShare() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load documents on initial render
  useEffect(() => {
    fetchDocuments();
  }, []);

  /**
   * Fetch documents from DocuShare
   */
  async function fetchDocuments() {
    setLoading(true);
    setError(null);

    try {
      const docs = await listDocs();
      setDocuments(docs);
    } catch (err) {
      console.error('Error fetching documents:', err);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Upload a document to DocuShare
   *
   * @param {File} file - The file to upload
   * @param {string} moduleContext - The module context
   * @param {string} sectionContext - The section context
   * @returns {Promise<Object>} - The upload result
   */
  async function uploadDocument(file, moduleContext = 'general', sectionContext = '') {
    setLoading(true);
    setError(null);

    try {
      const result = await uploadDoc(file, moduleContext);
      await fetchDocuments(); // Refresh the document list
      return result;
    } catch (err) {
      console.error('Error uploading document:', err);
      setError('Failed to upload document');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Download a document from DocuShare
   *
   * @param {string} objectId - The document object ID
   * @returns {Promise<Blob>} - The document blob
   */
  async function downloadDocument(objectId) {
    setLoading(true);
    setError(null);

    try {
      return await downloadDoc(objectId);
    } catch (err) {
      console.error('Error downloading document:', err);
      setError('Failed to download document');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Get a view URL for a document
   *
   * @param {string} objectId - The document object ID
   * @returns {Promise<string>} - The view URL
   */
  async function getDocumentViewUrl(objectId) {
    setLoading(true);
    setError(null);

    try {
      return await getDocViewUrl(objectId);
    } catch (err) {
      console.error('Error getting document view URL:', err);
      setError('Failed to get document view URL');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return {
    documents,
    loading,
    error,
    fetchDocuments,
    uploadDocument,
    downloadDocument,
    getDocumentViewUrl,
  };
}

export default useDocuShare;
