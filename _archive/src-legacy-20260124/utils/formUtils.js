/**
 * Form Utilities for FDA Form Generation
 *
 * This module provides helper functions for working with FDA forms in the IND Wizard.
 */

import axios from 'axios';
import { apiRequest } from '@/lib/queryClient';

/**
 * Load form data with error handling
 * @param {string} projectId - The project ID
 * @param {string} formId - The FDA form ID (e.g., '1571', '1572', etc.)
 * @param {Object} defaultData - Default data to use if loading fails
 * @returns {Promise<Object>} - Form data
 */
export async function loadFormData(projectId, formId, defaultData = {}) {
  try {
    const response = await apiRequest('GET', `/api/ind/${projectId}/forms/${formId}/data`);
    if (!response.ok) {
      throw new Error(`Failed to load form data: ${response.statusText}`);
    }
    const data = await response.json();
    return data && data.data ? data.data : defaultData;
  } catch (error) {
    console.error(`Error loading form ${formId} data:`, error);
    return defaultData;
  }
}

/**
 * Save form data with error handling
 * @param {string} projectId - The project ID
 * @param {string} formId - The FDA form ID (e.g., '1571', '1572', etc.)
 * @param {Object} formData - The form data to save
 * @returns {Promise<Object>} - Response data
 */
export async function saveFormData(projectId, formId, formData) {
  try {
    const response = await apiRequest(
      'PUT',
      `/api/ind/${projectId}/forms/${formId}/data`,
      formData
    );
    if (!response.ok) {
      throw new Error(`Failed to save form data: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error saving form ${formId} data:`, error);
    throw error;
  }
}

/**
 * Generate PDF form with error handling
 * @param {string} projectId - The project ID
 * @param {string} formId - The FDA form ID (e.g., '1571', '1572', etc.)
 * @param {Object} formData - The form data to use for generation
 * @returns {Promise<Object>} - PDF generation result with download URL
 */
export async function generatePdfForm(projectId, formId, formData) {
  try {
    const response = await apiRequest(
      'POST',
      `/api/ind/${projectId}/forms/${formId}/generate`,
      formData
    );
    if (!response.ok) {
      throw new Error(`Failed to generate PDF: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error generating form ${formId} PDF:`, error);
    throw error;
  }
}

/**
 * Get form guidance with error handling
 * @param {string} projectId - The project ID
 * @param {string} formId - The FDA form ID (e.g., '1571', '1572', etc.)
 * @returns {Promise<Object>} - Form guidance data
 */
export async function getFormGuidance(projectId, formId) {
  try {
    const response = await apiRequest('GET', `/api/ind/${projectId}/forms/${formId}/guidance`);
    if (!response.ok) {
      throw new Error(`Failed to get form guidance: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error getting form ${formId} guidance:`, error);
    // Return default guidance if error
    return {
      tips: [
        'Fill out all required fields marked with an asterisk (*)',
        'Ensure consistency with information across all forms',
        'Double-check all entered information for accuracy',
      ],
    };
  }
}

/**
 * Get form status with error handling
 * @param {string} projectId - The project ID
 * @param {string} formId - The FDA form ID (e.g., '1571', '1572', etc.)
 * @returns {Promise<Object>} - Form status data
 */
export async function getFormStatus(projectId, formId) {
  try {
    const response = await apiRequest('GET', `/api/ind/${projectId}/forms/${formId}/status`);
    if (!response.ok) {
      throw new Error(`Failed to get form status: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error getting form ${formId} status:`, error);
    // Return default status if error
    return {
      status: 'not_started',
      lastUpdated: null,
    };
  }
}

/**
 * Validate FDA 1571 form data
 * @param {Object} formData - The form data to validate
 * @returns {Object} - Validation result with errors object
 */
export function validateForm1571(formData) {
  const errors = {};

  if (!formData.sponsor_name?.trim()) {
    errors.sponsor_name = 'Sponsor name is required';
  }

  if (!formData.drug_name?.trim()) {
    errors.drug_name = 'Drug name is required';
  }

  if (!formData.phase?.trim()) {
    errors.phase = 'Phase is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate FDA 1572 form data
 * @param {Object} formData - The form data to validate
 * @returns {Object} - Validation result with errors object
 */
export function validateForm1572(formData) {
  const errors = {};

  if (!formData.investigator_name?.trim()) {
    errors.investigator_name = 'Investigator name is required';
  }

  if (!formData.facility_name?.trim()) {
    errors.facility_name = 'Facility name is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate FDA 3674 form data
 * @param {Object} formData - The form data to validate
 * @returns {Object} - Validation result with errors object
 */
export function validateForm3674(formData) {
  const errors = {};

  if (!formData.sponsor_name?.trim()) {
    errors.sponsor_name = 'Sponsor name is required';
  }

  if (!formData.certify_option) {
    errors.certify_option = 'Certification option is required';
  }

  // NCT number is required if the certify option is requirements_met or submitted_not_yet_required
  if (
    (formData.certify_option === 'requirements_met' ||
      formData.certify_option === 'submitted_not_yet_required') &&
    !formData.nct_number?.trim()
  ) {
    errors.nct_number = 'NCT number is required for this certification option';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate FDA 3454 form data
 * @param {Object} formData - The form data to validate
 * @returns {Object} - Validation result with errors object
 */
export function validateForm3454(formData) {
  const errors = {};

  if (!formData.sponsor_name?.trim()) {
    errors.sponsor_name = 'Sponsor name is required';
  }

  if (!formData.drug_name?.trim()) {
    errors.drug_name = 'Drug name is required';
  }

  if (!formData.certification_option) {
    errors.certification_option = 'Certification option is required';
  }

  // If the certification option is disclosed_arrangements, need at least one arrangement
  if (
    formData.certification_option === 'disclosed_arrangements' &&
    (!formData.disclosed_arrangements || formData.disclosed_arrangements.length === 0)
  ) {
    errors.disclosed_arrangements = 'At least one financial arrangement must be disclosed';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Get form validator function based on form ID
 * @param {string} formId - The FDA form ID
 * @returns {Function} - Validator function for the specified form
 */
export function getFormValidator(formId) {
  switch (formId) {
    case '1571':
      return validateForm1571;
    case '1572':
      return validateForm1572;
    case '3674':
      return validateForm3674;
    case '3454':
      return validateForm3454;
    default:
      // Default validator that does nothing
      return () => ({ isValid: true, errors: {} });
  }
}
