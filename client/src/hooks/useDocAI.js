/**
 * Document AI hook for enhanced document processing with OpenAI
 * Provides functions for AI-powered document operations
 */
import { useState } from 'react';
import { uploadDoc } from './useDocuShare';

/**
 * Process a document with AI analysis
 *
 * @param {File} file - The file to process
 * @param {string} folder - The folder to store in
 * @returns {Promise<Object>} - The processing result
 */
export async function processDocWithAI(file, folder = 'drafts') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);

  const response = await fetch('/api/document/process', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Processing failed: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Hook for document AI operations
 *
 * @returns {Object} Document AI operations and state
 */
export function useDocAI() {
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);

  /**
   * Process and upload a document with AI analysis
   *
   * @param {File} file - The file to process
   * @param {string} folder - Optional folder
   * @returns {Promise<Object>} - The processing result
   */
  async function processAndUpload(file, folder) {
    setProcessing(true);
    setError(null);

    try {
      let result;

      // Try AI processing first
      try {
        result = await processDocWithAI(file, folder);
        setLastResult(result);
      } catch (aiError) {
        console.error('AI processing failed, falling back to standard upload:', aiError);
        // Fall back to standard upload
        result = await uploadDoc(file, folder);
      }

      return result;
    } catch (err) {
      setError(err.message || 'Failed to process document');
      throw err;
    } finally {
      setProcessing(false);
    }
  }

  return {
    processing,
    lastResult,
    error,
    processAndUpload,
  };
}

export default useDocAI;
