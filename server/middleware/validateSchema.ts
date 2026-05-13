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

const SCHEMA_ROOT = path.resolve('client/src/schemas');
const SCHEMA_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const schemaCache = new Map<string, any>();

/**
 * Load a schema from the file system. Schemas are cached after first
 * load — they ship with the build and do not change at runtime, so the
 * previous behaviour of reading from disk on every request was both a
 * cost and a needless attack-surface widening.
 *
 * The schema name is restricted to a safe character set and the
 * resolved path is checked to live under the schema root, so a caller
 * passing `../../etc/passwd` (or similar) cannot escape the schema
 * directory.
 */
export function loadSchema(schemaName: string): any {
  if (!SCHEMA_NAME_PATTERN.test(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }

  const cached = schemaCache.get(schemaName);
  if (cached) return cached;

  const schemaPath = path.resolve(SCHEMA_ROOT, `${schemaName}.json`);
  // Resolve guards against `..` traversal even if the regex above is loosened.
  if (!schemaPath.startsWith(SCHEMA_ROOT + path.sep) && schemaPath !== SCHEMA_ROOT) {
    throw new Error(`Schema path escapes schema root: ${schemaName}`);
  }

  const schemaData = fs.readFileSync(schemaPath, 'utf8');
  const schema = JSON.parse(schemaData);
  schemaCache.set(schemaName, schema);
  return schema;
}

/**
 * Test-only: clear the schema cache.
 */
export function _clearSchemaCacheForTests(): void {
  schemaCache.clear();
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
  // Resolve and cache the schema at middleware-construction time so a
  // misconfiguration (missing file, bad name) fails fast on startup
  // instead of on the first request, and so the disk read doesn't run
  // per request.
  let cachedSchema: any | null = null;
  let loadError: Error | null = null;
  try {
    cachedSchema = loadSchema(schemaName);
  } catch (err) {
    loadError = err as Error;
    console.error(`[validateSchema] Failed to load schema "${schemaName}":`, err);
  }

  return (req: Request, res: Response, next: NextFunction) => {
    if (!cachedSchema) {
      // Log the underlying cause server-side but never expose disk
      // paths or exception messages to the client.
      console.error(
        `[validateSchema] Cannot validate request — schema "${schemaName}" failed to load`,
        loadError,
      );
      return res.status(500).json({
        error: 'Schema validation unavailable',
        code: 'SCHEMA_UNAVAILABLE',
      });
    }

    const validationResult = validateAgainstSchema(req.body, cachedSchema);
    if (!validationResult.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.errors,
      });
    }
    next();
  };
}

export default validateSchema;
