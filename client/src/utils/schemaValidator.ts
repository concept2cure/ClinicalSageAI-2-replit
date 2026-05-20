/**
 * Device profile validator.
 *
 * Hand-rolled instead of using Ajv because Ajv's `.compile()` calls
 * `new Function()` to generate validators — which is blocked under our
 * production CSP (`script-src` drops `'unsafe-eval'`). The schema in
 * `../schemas/deviceProfile.json` is small enough that a direct
 * validator is comparable in size to the Ajv plumbing it replaces.
 *
 * The shape mirrors what the previous Ajv-backed implementation
 * returned (`{ isValid, errors: [{ field, message, params }] }`) so
 * `DeviceProfileAPI.js` doesn't have to change.
 */

import deviceProfileSchema from '../schemas/deviceProfile.json';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type JsonSchema = {
  type?: string;
  enum?: unknown[];
  format?: string;
  items?: JsonSchema;
  required?: string[];
  properties?: Record<string, JsonSchema>;
};

export interface ValidationError {
  field: string;
  message: string;
  params: Record<string, unknown>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function checkType(value: unknown, expected: string): boolean {
  switch (expected) {
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
    case 'integer':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function checkFormat(value: unknown, format: string): boolean {
  if (typeof value !== 'string') return true;
  if (format === 'date') return ISO_DATE_RE.test(value);
  // Unknown formats — pass through. Matches Ajv's default behavior when
  // no format validator is registered.
  return true;
}

function validateValue(
  value: unknown,
  schema: JsonSchema,
  field: string,
  errors: ValidationError[],
): void {
  if (value === undefined) return;

  if (schema.type && !checkType(value, schema.type)) {
    errors.push({
      field,
      message: `${field} must be a ${schema.type}`,
      params: { type: schema.type, actual: typeOf(value) },
    });
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({
      field,
      message: `${field} must be one of: ${schema.enum.join(', ')}`,
      params: { allowedValues: schema.enum },
    });
    return;
  }

  if (schema.format && !checkFormat(value, schema.format)) {
    errors.push({
      field,
      message: `${field} is not a valid ${schema.format}`,
      params: { format: schema.format },
    });
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, idx) => {
      validateValue(item, schema.items as JsonSchema, `${field}[${idx}]`, errors);
    });
  }

  if (
    schema.type === 'object' &&
    schema.properties &&
    typeof value === 'object' &&
    value !== null
  ) {
    validateObject(value as Record<string, unknown>, schema, field, errors);
  }
}

function validateObject(
  data: Record<string, unknown>,
  schema: JsonSchema,
  fieldPrefix: string,
  errors: ValidationError[],
): void {
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    const v = data?.[key];
    if (v === undefined || v === null || v === '') {
      errors.push({
        field: key,
        message: `${key} is required`,
        params: { missingProperty: key },
      });
    }
  }

  const props = schema.properties ?? {};
  for (const [key, propSchema] of Object.entries(props)) {
    const value = data?.[key];
    if (value === undefined) continue;
    const fieldName = fieldPrefix ? `${fieldPrefix}.${key}` : key;
    validateValue(value, propSchema, fieldName, errors);
  }
}

export function validateDeviceProfile(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  validateObject(
    (data as Record<string, unknown>) ?? {},
    deviceProfileSchema as JsonSchema,
    '',
    errors,
  );
  return {
    isValid: errors.length === 0,
    errors,
  };
}

export default {
  validateDeviceProfile,
};
