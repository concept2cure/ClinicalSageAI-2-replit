/**
 * Answer validation for the AnA Intelligence Question Engine.
 *
 * Validates field-level constraints (required, min/max, pattern) on
 * the answers submitted for a question node. Returns an array of
 * validation errors — empty means all answers are valid.
 *
 * @module server/services/ana/intelligence-questions/validators
 */

import type { QuestionNode } from './types.js';

export interface ValidationError {
  fieldId: string;
  message: string;
}

export function validateAnswers(
  node: QuestionNode,
  answers: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const field of node.fields) {
    const value = answers[field.id];

    // Required check
    if (field.required) {
      if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
        errors.push({ fieldId: field.id, message: `${field.label} is required.` });
        continue;
      }
    }

    // Skip further validation if empty and not required
    if (value == null || value === '') continue;

    const v = field.validation;
    if (!v) continue;

    // String validations
    if (typeof value === 'string') {
      if (v.minLength != null && value.length < v.minLength) {
        errors.push({ fieldId: field.id, message: `${field.label} must be at least ${v.minLength} characters.` });
      }
      if (v.maxLength != null && value.length > v.maxLength) {
        errors.push({ fieldId: field.id, message: `${field.label} must be at most ${v.maxLength} characters.` });
      }
      if (v.pattern) {
        const regex = new RegExp(v.pattern);
        if (!regex.test(value)) {
          errors.push({ fieldId: field.id, message: v.patternMessage || `${field.label} format is invalid.` });
        }
      }
    }

    // Number validations
    if (typeof value === 'number') {
      if (v.min != null && value < v.min) {
        errors.push({ fieldId: field.id, message: `${field.label} must be at least ${v.min}.` });
      }
      if (v.max != null && value > v.max) {
        errors.push({ fieldId: field.id, message: `${field.label} must be at most ${v.max}.` });
      }
    }

    // Select validations — ensure value is one of the options
    if (field.type === 'select' || field.type === 'radio') {
      if (field.options && typeof value === 'string') {
        const validValues = field.options.map(o => o.value);
        if (!validValues.includes(value)) {
          errors.push({ fieldId: field.id, message: `${field.label}: "${value}" is not a valid option.` });
        }
      }
    }

    // Multi-select validations
    if (field.type === 'multi_select' && Array.isArray(value) && field.options) {
      const validValues = field.options.map(o => o.value);
      for (const v of value) {
        if (typeof v === 'string' && !validValues.includes(v)) {
          errors.push({ fieldId: field.id, message: `${field.label}: "${v}" is not a valid option.` });
        }
      }
    }
  }

  return errors;
}
