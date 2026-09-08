/**
 * Answer validation for the AnA Intelligence Question Engine.
 *
 * Validates field-level constraints (required, min/max, pattern),
 * cross-field dependencies, date constraints, and regulatory deadline
 * checks on the answers submitted for a question node.
 *
 * @module server/services/ana/intelligence-questions/validators
 */

import type { QuestionNode, QuestionField, FieldPredicate } from './types.js';
import { evaluatePredicate } from './engine.js';

export interface ValidationError {
  fieldId: string;
  message: string;
  severity?: 'error' | 'warning';
}

export function validateAnswers(
  node: QuestionNode,
  answers: Record<string, unknown>,
  allAnswers?: Record<string, Record<string, unknown>>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  const flatPrior = allAnswers ? flattenAnswers(allAnswers) : {};

  for (const field of node.fields) {
    if (field.visibleWhen && !evaluatePredicate(field.visibleWhen, { ...flatPrior, ...answers })) {
      continue;
    }

    const value = answers[field.id];

    if (field.required) {
      if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
        errors.push({ fieldId: field.id, message: `${field.label} is required.` });
        continue;
      }
    }

    if (value == null || value === '') continue;

    const v = field.validation;
    if (v) {
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

      // A number field's answer reaches here as a real number from the UI but
      // as a string ('200') from the AnA tool surface; a `typeof === 'number'`
      // gate silently skips min/max for the string form, letting an
      // out-of-range value pass validation. Coerce a number-field string before
      // the range check so the bound is enforced either way.
      const numericValue =
        typeof value === 'number'
          ? value
          : field.type === 'number' && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
            ? Number(value)
            : null;
      if (numericValue !== null) {
        if (v.min != null && numericValue < v.min) {
          errors.push({ fieldId: field.id, message: `${field.label} must be at least ${v.min}.` });
        }
        if (v.max != null && numericValue > v.max) {
          errors.push({ fieldId: field.id, message: `${field.label} must be at most ${v.max}.` });
        }
      }
    }

    if (field.type === 'select' || field.type === 'radio') {
      if (field.options && typeof value === 'string') {
        const validValues = field.options.map(o => o.value);
        if (!validValues.includes(value)) {
          errors.push({ fieldId: field.id, message: `${field.label}: "${value}" is not a valid option.` });
        }
      }
    }

    if (field.type === 'multi_select' && Array.isArray(value) && field.options) {
      const validValues = field.options.map(o => o.value);
      for (const item of value) {
        if (typeof item === 'string' && !validValues.includes(item)) {
          errors.push({ fieldId: field.id, message: `${field.label}: "${item}" is not a valid option.` });
        }
      }
    }

    if (field.type === 'date' && typeof value === 'string') {
      const dateErrors = validateDate(field, value, answers, flatPrior);
      errors.push(...dateErrors);
    }
  }

  const crossFieldErrors = runCrossFieldValidation(node, answers, flatPrior);
  errors.push(...crossFieldErrors);

  return errors;
}

function validateDate(
  field: QuestionField,
  value: string,
  nodeAnswers: Record<string, unknown>,
  priorAnswers: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const date = new Date(value);

  if (isNaN(date.getTime())) {
    errors.push({ fieldId: field.id, message: `${field.label}: invalid date format.` });
    return errors;
  }

  const now = new Date();
  const fieldId = field.id.toLowerCase();

  if (fieldId.includes('submission') || fieldId.includes('filing') || fieldId.includes('target')) {
    if (date < now) {
      errors.push({
        fieldId: field.id,
        message: `${field.label} is in the past. Planned dates should be future dates.`,
        severity: 'warning',
      });
    }
  }

  if (fieldId.includes('start') && typeof nodeAnswers[field.id.replace('start', 'end')] === 'string') {
    const endDate = new Date(nodeAnswers[field.id.replace('start', 'end')] as string);
    if (!isNaN(endDate.getTime()) && date > endDate) {
      errors.push({ fieldId: field.id, message: `${field.label} cannot be after the end date.` });
    }
  }

  if (fieldId.includes('end') && typeof nodeAnswers[field.id.replace('end', 'start')] === 'string') {
    const startDate = new Date(nodeAnswers[field.id.replace('end', 'start')] as string);
    if (!isNaN(startDate.getTime()) && date < startDate) {
      errors.push({ fieldId: field.id, message: `${field.label} cannot be before the start date.` });
    }
  }

  if (fieldId.includes('expir')) {
    const sixMonthsOut = new Date(now);
    sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
    if (date < sixMonthsOut) {
      errors.push({
        fieldId: field.id,
        message: `${field.label} is within 6 months. Ensure adequate shelf life for regulatory review timelines.`,
        severity: 'warning',
      });
    }
  }

  return errors;
}

function runCrossFieldValidation(
  node: QuestionNode,
  answers: Record<string, unknown>,
  priorAnswers: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const allValues = { ...priorAnswers, ...answers };

  const multiSelectFields = node.fields.filter(f => f.type === 'multi_select');
  for (const field of multiSelectFields) {
    const value = answers[field.id];
    if (Array.isArray(value)) {
      const hasContra = value.some(v =>
        typeof v === 'string' && (v.includes('none') || v.includes('not_applicable')),
      );
      if (hasContra && value.length > 1) {
        errors.push({
          fieldId: field.id,
          message: `${field.label}: "None" or "Not Applicable" cannot be combined with other selections.`,
        });
      }
    }
  }

  const enrollment = findNumeric(answers, 'sample_size', 'enrollment', 'target_enrollment', 'planned_enrollment');
  const sites = findNumeric(answers, 'number_of_sites', 'site_count', 'num_sites');
  if (enrollment !== null && sites !== null && sites > 0) {
    const perSite = enrollment / sites;
    if (perSite < 1) {
      errors.push({
        fieldId: 'number_of_sites',
        message: `With ${enrollment} subjects across ${sites} sites, you would have less than 1 subject per site. Consider reducing the number of sites.`,
        severity: 'warning',
      });
    }
  }

  const phase = String(allValues['study_phase'] ?? allValues['trial_phase'] ?? '').toLowerCase();
  const sampleSize = findNumeric(answers, 'sample_size', 'target_enrollment', 'planned_enrollment');
  if (phase && sampleSize !== null) {
    if (phase.includes('3') && sampleSize < 100) {
      errors.push({
        fieldId: findFieldId(answers, 'sample_size', 'target_enrollment', 'planned_enrollment') ?? 'sample_size',
        message: `Phase 3 typically requires significantly more than ${sampleSize} subjects. Most pivotal trials enroll 300+ patients.`,
        severity: 'warning',
      });
    }
    if (phase.includes('1') && sampleSize > 200) {
      errors.push({
        fieldId: findFieldId(answers, 'sample_size', 'target_enrollment', 'planned_enrollment') ?? 'sample_size',
        message: `Phase 1 trials rarely exceed 100 subjects. ${sampleSize} is unusually large for early-phase work.`,
        severity: 'warning',
      });
    }
  }

  return errors;
}

function findNumeric(answers: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const val = answers[key];
    if (val != null) {
      const n = Number(val);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function findFieldId(answers: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (key in answers) return key;
  }
  return null;
}

function flattenAnswers(answers: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const nodeAnswers of Object.values(answers)) {
    Object.assign(flat, nodeAnswers);
  }
  return flat;
}
