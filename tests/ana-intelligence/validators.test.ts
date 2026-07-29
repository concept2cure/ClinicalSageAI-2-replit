/**
 * Answer validators — field constraints, date logic, and cross-field rules.
 *
 * validateAnswers operates on a QuestionNode + a flat answers map, so these
 * tests construct synthetic nodes directly (no flow registry required).
 */
import { describe, it, expect } from 'vitest';
import { validateAnswers } from '../../server/services/ana/intelligence-questions/validators';
import type { QuestionNode, QuestionField } from '../../shared/types/intelligence-questions';

const node = (fields: QuestionField[]): QuestionNode => ({
  id: 'n1',
  section: 's1',
  question: 'q',
  fields,
});

const errIds = (errors: { fieldId: string }[]) => errors.map((e) => e.fieldId);

describe('validateAnswers', () => {
  describe('required fields', () => {
    it('flags a missing required field', () => {
      const n = node([{ id: 'name', label: 'Name', type: 'text', required: true }]);
      const errors = validateAnswers(n, {});
      expect(errIds(errors)).toContain('name');
      expect(errors[0].message).toMatch(/required/i);
    });

    it('flags an empty string required field', () => {
      const n = node([{ id: 'name', label: 'Name', type: 'text', required: true }]);
      expect(errIds(validateAnswers(n, { name: '' }))).toContain('name');
    });

    it('flags an empty-array required multi_select', () => {
      const n = node([{ id: 'tags', label: 'Tags', type: 'multi_select', required: true, options: [] }]);
      expect(errIds(validateAnswers(n, { tags: [] }))).toContain('tags');
    });

    it('passes when a required field is provided', () => {
      const n = node([{ id: 'name', label: 'Name', type: 'text', required: true }]);
      expect(validateAnswers(n, { name: 'Acme' })).toEqual([]);
    });
  });

  describe('string length + pattern', () => {
    it('enforces minLength', () => {
      const n = node([{ id: 'code', label: 'Code', type: 'text', validation: { minLength: 3 } }]);
      expect(errIds(validateAnswers(n, { code: 'ab' }))).toContain('code');
      expect(validateAnswers(n, { code: 'abc' })).toEqual([]);
    });

    it('enforces maxLength', () => {
      const n = node([{ id: 'code', label: 'Code', type: 'text', validation: { maxLength: 3 } }]);
      expect(errIds(validateAnswers(n, { code: 'abcd' }))).toContain('code');
    });

    it('enforces pattern with a custom message', () => {
      const n = node([
        {
          id: 'email',
          label: 'Email',
          type: 'text',
          validation: { pattern: '^[^@]+@[^@]+$', patternMessage: 'Bad email' },
        },
      ]);
      const errors = validateAnswers(n, { email: 'not-an-email' });
      expect(errIds(errors)).toContain('email');
      expect(errors[0].message).toBe('Bad email');
      expect(validateAnswers(n, { email: 'a@b.com' })).toEqual([]);
    });
  });

  describe('numeric min/max', () => {
    it('enforces min', () => {
      const n = node([{ id: 'n', label: 'N', type: 'number', validation: { min: 10 } }]);
      expect(errIds(validateAnswers(n, { n: 5 }))).toContain('n');
      expect(validateAnswers(n, { n: 10 })).toEqual([]);
    });

    it('enforces max', () => {
      const n = node([{ id: 'n', label: 'N', type: 'number', validation: { max: 100 } }]);
      expect(errIds(validateAnswers(n, { n: 200 }))).toContain('n');
    });
  });

  describe('option validity', () => {
    it('rejects an out-of-vocabulary select value', () => {
      const n = node([
        {
          id: 'phase',
          label: 'Phase',
          type: 'select',
          options: [{ value: 'phase_1', label: 'Phase 1' }],
        },
      ]);
      expect(errIds(validateAnswers(n, { phase: 'phase_9' }))).toContain('phase');
      expect(validateAnswers(n, { phase: 'phase_1' })).toEqual([]);
    });

    it('rejects an out-of-vocabulary multi_select item', () => {
      const n = node([
        {
          id: 'areas',
          label: 'Areas',
          type: 'multi_select',
          options: [{ value: 'oncology', label: 'Oncology' }],
        },
      ]);
      expect(errIds(validateAnswers(n, { areas: ['oncology', 'nope'] }))).toContain('areas');
    });
  });

  describe('visibleWhen skipping', () => {
    it('skips validation for a required field hidden by visibleWhen', () => {
      const n = node([
        { id: 'gate', label: 'Gate', type: 'text' },
        {
          id: 'detail',
          label: 'Detail',
          type: 'text',
          required: true,
          visibleWhen: { field: 'gate', operator: 'eq', value: 'yes' },
        },
      ]);
      // gate !== 'yes' -> detail is hidden -> its required constraint is skipped
      expect(validateAnswers(n, { gate: 'no' })).toEqual([]);
      // gate === 'yes' -> detail is visible & required -> error
      expect(errIds(validateAnswers(n, { gate: 'yes' }))).toContain('detail');
    });

    it('honors prior-node answers when resolving visibleWhen', () => {
      const n = node([
        {
          id: 'detail',
          label: 'Detail',
          type: 'text',
          required: true,
          visibleWhen: { field: 'gate', operator: 'eq', value: 'yes' },
        },
      ]);
      const prior = { priorNode: { gate: 'yes' } };
      // gate is supplied by a prior node -> detail becomes visible & required
      expect(errIds(validateAnswers(n, {}, prior))).toContain('detail');
    });
  });

  describe('validateDate', () => {
    it('warns when a submission date is in the past', () => {
      const n = node([{ id: 'submission_date', label: 'Submission Date', type: 'date' }]);
      const errors = validateAnswers(n, { submission_date: '2000-01-01' });
      const e = errors.find((x) => x.fieldId === 'submission_date');
      expect(e).toBeDefined();
      expect(e!.message).toMatch(/past/i);
    });

    it('does not warn for a future submission date', () => {
      const n = node([{ id: 'submission_date', label: 'Submission Date', type: 'date' }]);
      expect(validateAnswers(n, { submission_date: '2999-01-01' })).toEqual([]);
    });

    it('flags an invalid date format', () => {
      const n = node([{ id: 'target_date', label: 'Target Date', type: 'date' }]);
      const errors = validateAnswers(n, { target_date: 'not-a-date' });
      expect(errIds(errors)).toContain('target_date');
      expect(errors[0].message).toMatch(/invalid date/i);
    });

    it('enforces start/end consistency (start after end)', () => {
      const n = node([
        { id: 'study_start', label: 'Study Start', type: 'date' },
        { id: 'study_end', label: 'Study End', type: 'date' },
      ]);
      const errors = validateAnswers(n, { study_start: '2030-06-01', study_end: '2030-01-01' });
      expect(errIds(errors)).toContain('study_start');
    });

    it('accepts a start date before the end date', () => {
      const n = node([
        { id: 'study_start', label: 'Study Start', type: 'date' },
        { id: 'study_end', label: 'Study End', type: 'date' },
      ]);
      // both future so submission/target rules do not trip; ordering is valid
      const errors = validateAnswers(n, { study_start: '2030-01-01', study_end: '2030-06-01' });
      expect(errors).toEqual([]);
    });
  });

  describe('runCrossFieldValidation', () => {
    it('flags "none" combined with other multi-select selections', () => {
      const n = node([
        {
          id: 'designations',
          label: 'Designations',
          type: 'multi_select',
          options: [
            { value: 'none', label: 'None' },
            { value: 'orphan', label: 'Orphan' },
          ],
        },
      ]);
      const errors = validateAnswers(n, { designations: ['none', 'orphan'] });
      expect(errIds(errors)).toContain('designations');
      expect(errors.find((e) => e.fieldId === 'designations')!.message).toMatch(/None/i);
    });

    it('does not flag a lone "none" selection', () => {
      const n = node([
        {
          id: 'designations',
          label: 'Designations',
          type: 'multi_select',
          options: [{ value: 'none', label: 'None' }],
        },
      ]);
      expect(validateAnswers(n, { designations: ['none'] })).toEqual([]);
    });

    it('flags less than one subject per site (enrollment-per-site sanity)', () => {
      const n = node([
        { id: 'sample_size', label: 'Sample Size', type: 'number' },
        { id: 'number_of_sites', label: 'Sites', type: 'number' },
      ]);
      const errors = validateAnswers(n, { sample_size: 10, number_of_sites: 50 });
      expect(errIds(errors)).toContain('number_of_sites');
      expect(errors.find((e) => e.fieldId === 'number_of_sites')!.message).toMatch(/per site/i);
    });

    it('does not flag a reasonable enrollment-per-site ratio', () => {
      const n = node([
        { id: 'sample_size', label: 'Sample Size', type: 'number' },
        { id: 'number_of_sites', label: 'Sites', type: 'number' },
      ]);
      expect(validateAnswers(n, { sample_size: 300, number_of_sites: 20 })).toEqual([]);
    });
  });
});
