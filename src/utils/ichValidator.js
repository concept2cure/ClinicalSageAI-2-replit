/**
 * ICH Structure Validation Utility
 *
 * This module provides functions to validate ZIP files against
 * ICH eCTD structure requirements using the backend validation endpoint.
 */
import { vaultFetch } from './apiClient';

/**
 * Validates a ZIP blob against ICH eCTD structure requirements
 *
 * @param {Blob} zipBlob - The ZIP file blob to validate
 * @returns {Promise<{valid: boolean, errors: string[], message: string}>} - Validation result
 */
export async function validateZipStructure(zipBlob) {
  try {
    // Convert blob to base64
    const arrayBuffer = await zipBlob.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((s, byte) => s + String.fromCharCode(byte), '')
    );

    // Call validation endpoint with tenant context headers
    const response = await vaultFetch('/api/vault/validate', {
      method: 'POST',
      body: JSON.stringify({ zipBlob: base64 }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error during ICH validation:', error);
    return {
      valid: false,
      errors: [error.message || 'An unexpected error occurred during validation'],
      message: 'Failed to validate the submission structure. Please try again.',
    };
  }
}

/**
 * Creates an enhanced submission handler that validates
 * the submission before downloading
 *
 * @param {Function} setValidationResult - State setter for validation results
 * @param {Function} toastFunction - Toast notification function
 * @returns {Function} Enhanced submission handler
 */
export function createValidatedSubmissionHandler(setValidationResult, toastFunction) {
  return async fileIds => {
    if (!fileIds || fileIds.length === 0) {
      toastFunction({
        title: 'No files selected',
        description: 'Please select files to include in your submission package.',
        variant: 'destructive',
      });
      return null;
    }

    try {
      // Step 1: Compile the submission with tenant context headers
      const response = await vaultFetch('/api/vault/compile', {
        method: 'POST',
        body: JSON.stringify({ fileIds }),
      });

      if (!response.ok) {
        throw new Error(`Error compiling submission: ${response.statusText}`);
      }

      const blob = await response.blob();

      // Step 2: Validate the compiled ZIP
      const validationResult = await validateZipStructure(blob);
      setValidationResult(validationResult);

      // Step 3: Handle based on validation result
      if (!validationResult.valid) {
        toastFunction({
          title: 'Validation errors detected',
          description: 'Please review the errors and fix your submission structure.',
          variant: 'destructive',
        });
        return blob;
      }

      // Step 4: If valid, download the ZIP
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'eCTD_Submission.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toastFunction({
        title: 'Submission validated and compiled',
        description: 'Your submission package meets ICH requirements and has been downloaded.',
        variant: 'default',
      });

      return blob;
    } catch (error) {
      console.error('Error compiling or validating submission:', error);
      toastFunction({
        title: 'Compilation failed',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
  };
}
