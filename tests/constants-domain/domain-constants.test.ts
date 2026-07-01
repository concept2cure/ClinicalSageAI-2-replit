/**
 * Domain constants — invariants shared by every canonical vocabulary module,
 * plus the organization-types bridge functions.
 *
 * Every DomainEntry array must have unique values and non-empty labels, and its
 * toQuestionOptions() bridge must emit exactly one option per entry carrying a
 * value and a label.
 */
import { describe, it, expect } from 'vitest';
import {
  THERAPEUTIC_AREAS,
  therapeuticAreaOptions,
  CLINICAL_PHASES,
  clinicalPhaseOptions,
  ROUTES_OF_ADMINISTRATION,
  routeOfAdministrationOptions,
  DOSAGE_FORMS,
  dosageFormOptions,
  STUDY_DESIGNS,
  studyDesignOptions,
  EXPRESSION_SYSTEMS,
  expressionSystemOptions,
  MANUFACTURING_PROCESSES,
  manufacturingProcessOptions,
  ANALYTICAL_METHODS,
  analyticalMethodOptions,
  CONTAINER_CLOSURES,
  containerClosureOptions,
  EXCIPIENT_CLASSES,
  excipientClassOptions,
  ENDPOINT_TYPES,
  endpointTypeOptions,
  STATISTICAL_METHODS,
  statisticalMethodOptions,
  ORGANIZATION_TYPES,
  organizationTypeOptions,
  REGULATORY_MEETING_TYPES,
  regulatoryMeetingTypeOptions,
} from '../../shared/constants/domain/index';
import type { DomainEntry } from '../../shared/constants/domain/index';
import type { QuestionOption } from '../../shared/types/intelligence-questions';
import {
  orgToClientSegment,
  orgToSubmissionClientType,
  orgToFlowClientType,
} from '../../shared/constants/domain/organization-types';

type AnyEntry = DomainEntry<string>;

const MODULES: Array<{
  name: string;
  entries: AnyEntry[];
  options: () => QuestionOption[];
  expectedLength: number;
}> = [
  { name: 'THERAPEUTIC_AREAS', entries: THERAPEUTIC_AREAS, options: therapeuticAreaOptions, expectedLength: 25 },
  { name: 'CLINICAL_PHASES', entries: CLINICAL_PHASES, options: clinicalPhaseOptions, expectedLength: 10 },
  { name: 'ROUTES_OF_ADMINISTRATION', entries: ROUTES_OF_ADMINISTRATION, options: routeOfAdministrationOptions, expectedLength: 18 },
  { name: 'DOSAGE_FORMS', entries: DOSAGE_FORMS, options: dosageFormOptions, expectedLength: 22 },
  { name: 'STUDY_DESIGNS', entries: STUDY_DESIGNS, options: studyDesignOptions, expectedLength: 14 },
  { name: 'EXPRESSION_SYSTEMS', entries: EXPRESSION_SYSTEMS, options: expressionSystemOptions, expectedLength: 12 },
  { name: 'MANUFACTURING_PROCESSES', entries: MANUFACTURING_PROCESSES, options: manufacturingProcessOptions, expectedLength: 20 },
  { name: 'ANALYTICAL_METHODS', entries: ANALYTICAL_METHODS, options: analyticalMethodOptions, expectedLength: 24 },
  { name: 'CONTAINER_CLOSURES', entries: CONTAINER_CLOSURES, options: containerClosureOptions, expectedLength: 16 },
  { name: 'EXCIPIENT_CLASSES', entries: EXCIPIENT_CLASSES, options: excipientClassOptions, expectedLength: 18 },
  { name: 'ENDPOINT_TYPES', entries: ENDPOINT_TYPES, options: endpointTypeOptions, expectedLength: 18 },
  { name: 'STATISTICAL_METHODS', entries: STATISTICAL_METHODS, options: statisticalMethodOptions, expectedLength: 18 },
  { name: 'ORGANIZATION_TYPES', entries: ORGANIZATION_TYPES, options: organizationTypeOptions, expectedLength: 9 },
  { name: 'REGULATORY_MEETING_TYPES', entries: REGULATORY_MEETING_TYPES, options: regulatoryMeetingTypeOptions, expectedLength: 14 },
];

describe('domain constant arrays', () => {
  describe.each(MODULES)('$name', ({ entries, options, expectedLength }) => {
    it('is a non-empty array of the expected length', () => {
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBe(expectedLength);
    });

    it('has unique values', () => {
      const values = entries.map((e) => e.value);
      expect(values.length).toBe(new Set(values).size);
    });

    it('has a non-empty string label for every entry', () => {
      for (const e of entries) {
        expect(typeof e.label).toBe('string');
        expect(e.label.trim().length).toBeGreaterThan(0);
        expect(typeof e.value).toBe('string');
        expect(e.value.trim().length).toBeGreaterThan(0);
      }
    });

    it('toQuestionOptions() returns one option per entry with value + label', () => {
      const opts = options();
      expect(opts.length).toBe(entries.length);
      opts.forEach((opt, i) => {
        expect(opt.value).toBe(entries[i].value);
        expect(opt.label).toBe(entries[i].label);
        expect(typeof opt.value).toBe('string');
        expect(opt.label.length).toBeGreaterThan(0);
      });
    });
  });
});

describe('organization-types bridge functions', () => {
  describe('orgToClientSegment', () => {
    it('maps product-owning orgs to a regulatory segment', () => {
      expect(orgToClientSegment('pharma')).toBe('pharma');
      expect(orgToClientSegment('biotech')).toBe('biotech');
      expect(orgToClientSegment('medtech')).toBe('device'); // note: medtech -> device
      expect(orgToClientSegment('ivd')).toBe('ivd');
    });
    it('returns null for service / institutional orgs', () => {
      expect(orgToClientSegment('cro')).toBeNull();
      expect(orgToClientSegment('cdmo')).toBeNull();
      expect(orgToClientSegment('academic')).toBeNull();
      expect(orgToClientSegment('government')).toBeNull();
      expect(orgToClientSegment('other')).toBeNull();
    });
  });

  describe('orgToSubmissionClientType', () => {
    it('maps to submission-constants ClientType (medtech -> mdx)', () => {
      expect(orgToSubmissionClientType('pharma')).toBe('pharma');
      expect(orgToSubmissionClientType('biotech')).toBe('biotech');
      expect(orgToSubmissionClientType('medtech')).toBe('mdx');
      expect(orgToSubmissionClientType('ivd')).toBe('ivd');
    });
    it('returns null for service orgs', () => {
      for (const org of ['cro', 'cdmo', 'academic', 'government', 'other'] as const) {
        expect(orgToSubmissionClientType(org)).toBeNull();
      }
    });
  });

  describe('orgToFlowClientType', () => {
    it('maps to flow clientTypes (ivd folded into medtech)', () => {
      expect(orgToFlowClientType('pharma')).toBe('pharma');
      expect(orgToFlowClientType('biotech')).toBe('biotech');
      expect(orgToFlowClientType('medtech')).toBe('medtech');
      expect(orgToFlowClientType('ivd')).toBe('medtech');
    });
    it('returns null for service orgs', () => {
      for (const org of ['cro', 'cdmo', 'academic', 'government', 'other'] as const) {
        expect(orgToFlowClientType(org)).toBeNull();
      }
    });
  });
});
