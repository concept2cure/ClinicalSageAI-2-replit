/**
 * Validation Utilities
 *
 * This module provides common validation functions for request bodies
 * using Zod schemas.
 */

/**
 * Validates a request body against a Zod schema
 *
 * @param {Object} body - The request body to validate
 * @param {Object} schema - The Zod schema to validate against
 * @returns {Object} Validation result with success and errors
 */
export function validateRequestBody(body, schema) {
  try {
    const validatedData = schema.parse(body);
    return { success: true, data: validatedData, errors: null };
  } catch (error) {
    const formattedErrors = error.errors
      ? error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
        }))
      : [{ path: 'unknown', message: 'Validation failed' }];

    return { success: false, data: null, errors: formattedErrors };
  }
}

/**
 * Makes sure a string is sanitized for file paths to prevent directory traversal
 *
 * @param {string} input - The input string to sanitize
 * @returns {string} The sanitized string
 */
export function sanitizePathComponent(input) {
  if (typeof input !== 'string') {
    return '';
  }
  // Remove any directory traversal sequences and invalid characters
  return input
    .replace(/\.\./g, '')
    .replace(/[\/\\]/g, '')
    .replace(/[^a-zA-Z0-9\-_\.]/g, '_');
}

/**
 * Validate and sanitize file extension
 *
 * @param {string} extension - The file extension to validate
 * @param {Array<string>} allowedExtensions - List of allowed extensions
 * @returns {string|null} Sanitized extension or null if not allowed
 */
export function validateFileExtension(extension, allowedExtensions) {
  if (typeof extension !== 'string') {
    return null;
  }

  const sanitized = extension.toLowerCase().trim();
  return allowedExtensions.includes(sanitized) ? sanitized : null;
}

/**
 * Validate a date string is in ISO format
 *
 * @param {string} dateString - The date string to validate
 * @returns {boolean} Whether the date string is valid
 */
export function validateISODate(dateString) {
  if (typeof dateString !== 'string') {
    return false;
  }

  const regex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/;
  if (!regex.test(dateString)) {
    return false;
  }

  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

export default {
  validateRequestBody,
  sanitizePathComponent,
  validateFileExtension,
  validateISODate,
};
