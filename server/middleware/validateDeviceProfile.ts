import { Request, Response, NextFunction } from 'express';
import deviceProfileSchema from '../../client/src/schemas/deviceProfile.json';

/**
 * Simple validation for device profile
 */
function validateAgainstSchema(data: any, schema: any): { valid: boolean; errors: any[] } {
  const errors: any[] = [];

  // Check required fields
  if (schema.required && Array.isArray(schema.required)) {
    for (const requiredField of schema.required) {
      if (data[requiredField] === undefined) {
        errors.push({
          path: `/${requiredField}`,
          message: `Missing required property: ${requiredField}`,
          params: { missingProperty: requiredField },
        });
      }
    }
  }

  // Check property types and constraints
  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries<any>(schema.properties)) {
      const value = data[propName];

      // Skip if property is not provided (we already checked required fields)
      if (value === undefined) continue;

      // Check type
      if (propSchema.type === 'string' && typeof value !== 'string') {
        errors.push({
          path: `/${propName}`,
          message: `Expected string for property ${propName}, got ${typeof value}`,
          params: { type: 'string' },
        });
      }

      // Check string constraints
      if (propSchema.type === 'string' && typeof value === 'string') {
        // Min length
        if (propSchema.minLength !== undefined && value.length < propSchema.minLength) {
          errors.push({
            path: `/${propName}`,
            message: `Property ${propName} must be at least ${propSchema.minLength} characters`,
            params: { minLength: propSchema.minLength },
          });
        }

        // Max length
        if (propSchema.maxLength !== undefined && value.length > propSchema.maxLength) {
          errors.push({
            path: `/${propName}`,
            message: `Property ${propName} must be at most ${propSchema.maxLength} characters`,
            params: { maxLength: propSchema.maxLength },
          });
        }

        // Enum values
        if (propSchema.enum && !propSchema.enum.includes(value)) {
          errors.push({
            path: `/${propName}`,
            message: `Property ${propName} must be one of: ${propSchema.enum.join(', ')}`,
            params: { enum: propSchema.enum },
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Middleware to validate device profile JSON against schema
 */
export function validateDeviceProfile(req: Request, res: Response, next: NextFunction) {
  // Get the request body
  const deviceProfile = req.body;

  // Validate against the schema
  const { valid, errors } = validateAgainstSchema(deviceProfile, deviceProfileSchema);

  if (!valid) {
    // Return validation errors
    return res.status(400).json({
      error: 'Validation error',
      details: errors,
    });
  }

  // Validation passed, proceed to the next middleware/controller
  next();
}
