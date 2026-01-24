import Ajv from 'ajv';
import deviceProfileSchema from '../schemas/deviceProfile.json';

// Initialize Ajv
const ajv = new Ajv({ allErrors: true });

// Add schemas
const validateDeviceProfileAjv = ajv.compile(deviceProfileSchema);

/**
 * Validate device profile data against JSON schema
 *
 * @param {Object} data - The device profile data to validate
 * @returns {Object} - Validation result with errors formatted for UI
 */
export const validateDeviceProfile = data => {
  // Run validation
  const isValid = validateDeviceProfileAjv(data);

  // Format errors for UI if validation failed
  if (!isValid) {
    const errors = (validateDeviceProfileAjv.errors || []).map(error => {
      // Extract field name from error path
      const field =
        error.instancePath.replace(/^\//, '') || error.params.missingProperty || 'unknown';

      // Format error message based on error type
      let message = '';

      switch (error.keyword) {
        case 'required':
          message = `${error.params.missingProperty} is required`;
          break;
        case 'enum':
          message = `${field} must be one of: ${error.params.allowedValues.join(', ')}`;
          break;
        case 'type':
          message = `${field} must be a ${error.params.type}`;
          break;
        default:
          message = error.message || 'Invalid value';
      }

      return {
        field,
        message,
        params: error.params,
        raw: error,
      };
    });

    return {
      isValid: false,
      errors,
    };
  }

  return {
    isValid: true,
    errors: [],
  };
};

/**
 * Validate schema with detailed error path mapping
 *
 * This is a more generic validator that can be used for any schema
 *
 * @param {Object} schema - JSON schema to validate against
 * @param {Object} data - Data to validate
 * @returns {Object} - Validation result with errors formatted for UI
 */
export const validateSchema = (schema, data) => {
  // Compile schema if it's not already compiled
  const validate = typeof schema === 'function' ? schema : ajv.compile(schema);

  // Run validation
  const isValid = validate(data);

  // Format errors for UI if validation failed
  if (!isValid) {
    const errors = (validate.errors || []).map(error => {
      // Extract field name from error path
      const fieldPath = error.instancePath.replace(/^\//, '').split('/');
      const field = fieldPath.length
        ? fieldPath.join('.')
        : error.params.missingProperty || 'unknown';

      // Format user-friendly error message
      let message = '';

      switch (error.keyword) {
        case 'required':
          message = `The field "${error.params.missingProperty}" is required`;
          break;
        case 'enum':
          message = `"${field}" must be one of: ${error.params.allowedValues.join(', ')}`;
          break;
        case 'type':
          message = `"${field}" must be a ${error.params.type}`;
          break;
        case 'format':
          message = `"${field}" is not a valid ${error.params.format}`;
          break;
        case 'minimum':
          message = `"${field}" must be greater than or equal to ${error.params.limit}`;
          break;
        case 'maximum':
          message = `"${field}" must be less than or equal to ${error.params.limit}`;
          break;
        case 'minLength':
          message = `"${field}" must be at least ${error.params.limit} characters`;
          break;
        case 'maxLength':
          message = `"${field}" must be no more than ${error.params.limit} characters`;
          break;
        case 'pattern':
          message = `"${field}" must match the pattern: ${error.params.pattern}`;
          break;
        default:
          message = error.message || `Invalid value for "${field}"`;
      }

      return {
        path: fieldPath,
        field,
        message,
        params: error.params,
        keyword: error.keyword,
        raw: error,
      };
    });

    return {
      isValid: false,
      errors,
    };
  }

  return {
    isValid: true,
    errors: [],
  };
};

// Export all validators
export default {
  validateDeviceProfile,
  validateSchema,
};
