import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

/**
 * Schema validation middleware for Express
 * Validates request body against a JSON schema
 */

interface ValidationError {
  field: string;
  message: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Load a schema from the file system
 * @param schemaName Name of the schema file without extension
 * @returns The schema object
 */
function loadSchema(schemaName: string): any {
  try {
    // In ES modules, use a relative path from project root
    const schemaPath = `./client/src/schemas/${schemaName}.json`;
    const schemaData = fs.readFileSync(schemaPath, 'utf8');
    return JSON.parse(schemaData);
  } catch (error) {
    console.error(`Failed to load schema ${schemaName}:`, error);
    throw new Error(`Schema ${schemaName} not found`);
  }
}

/**
 * Validates data against a JSON schema
 * @param data Data to validate
 * @param schema The JSON schema to validate against
 * @returns Validation result with isValid flag and errors array
 */
function validateAgainstSchema(data: any, schema: any): ValidationResult {
  const errors: ValidationError[] = [];

  // Check required fields
  if (schema.required && Array.isArray(schema.required)) {
    for (const requiredField of schema.required) {
      if (
        data[requiredField] === undefined ||
        data[requiredField] === null ||
        data[requiredField] === ''
      ) {
        errors.push({
          field: requiredField,
          message: `Field '${requiredField}' is required`,
        });
      }
    }
  }

  // Check property types and constraints
  if (schema.properties) {
    for (const [key, property] of Object.entries(schema.properties)) {
      if (data[key] !== undefined && data[key] !== null) {
        // Type checking based on JSON schema type
        if ((property as any).type === 'string' && typeof data[key] !== 'string') {
          errors.push({
            field: key,
            message: `Field '${key}' must be a string`,
          });
        }

        if ((property as any).type === 'number' && typeof data[key] !== 'number') {
          errors.push({
            field: key,
            message: `Field '${key}' must be a number`,
          });
        }

        if ((property as any).type === 'boolean' && typeof data[key] !== 'boolean') {
          errors.push({
            field: key,
            message: `Field '${key}' must be a boolean`,
          });
        }

        if ((property as any).type === 'array' && !Array.isArray(data[key])) {
          errors.push({
            field: key,
            message: `Field '${key}' must be an array`,
          });
        }

        // Enum validation
        if ((property as any).enum && !(property as any).enum.includes(data[key])) {
          errors.push({
            field: key,
            message: `Field '${key}' must be one of: ${(property as any).enum.join(', ')}`,
          });
        }

        // Array items validation
        if (
          (property as any).type === 'array' &&
          Array.isArray(data[key]) &&
          (property as any).items
        ) {
          data[key].forEach((item: any, index: number) => {
            if ((property as any).items.type === 'object' && typeof item !== 'object') {
              errors.push({
                field: `${key}[${index}]`,
                message: `Item at index ${index} must be an object`,
              });
            }

            if ((property as any).items.type === 'string' && typeof item !== 'string') {
              errors.push({
                field: `${key}[${index}]`,
                message: `Item at index ${index} must be a string`,
              });
            }
          });
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Middleware factory that returns a validator for a specific schema
 * @param schemaName Name of the schema file without extension
 * @returns Express middleware function
 */
export function validateSchema(schemaName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = loadSchema(schemaName);
      const validationResult = validateAgainstSchema(req.body, schema);

      if (!validationResult.isValid) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validationResult.errors,
        });
      }

      next();
    } catch (error) {
      console.error('Schema validation error:', error);
      return res.status(500).json({
        error: 'Schema validation error',
        message: (error as Error).message,
      });
    }
  };
}

export default validateSchema;
