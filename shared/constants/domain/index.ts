/**
 * Domain Constants — barrel export.
 *
 * Canonical domain vocabulary for the regulatory intelligence platform.
 * Each module defines a union type, a DomainEntry array, and a
 * toQuestionOptions() helper for bridging into the intelligence question
 * engine.
 *
 * @module shared/constants/domain
 */

/* ─── Shared domain-entry shape ───────────────────────────────────────── */

export interface DomainEntry<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** MedDRA SOC or related coding system reference. */
  codingRef?: string;
  /** ICH/regulatory references relevant to this entry. */
  regulatoryRefs?: string[];
}

/* ─── Re-exports ──────────────────────────────────────────────────────── */

export {
  type TherapeuticArea,
  THERAPEUTIC_AREAS,
  toQuestionOptions as therapeuticAreaOptions,
} from './therapeutic-areas.js';

export {
  type ClinicalPhase,
  CLINICAL_PHASES,
  toQuestionOptions as clinicalPhaseOptions,
} from './clinical-phases.js';

export {
  type RouteOfAdministration,
  ROUTES_OF_ADMINISTRATION,
  toQuestionOptions as routeOfAdministrationOptions,
} from './routes-of-administration.js';

export {
  type DosageForm,
  DOSAGE_FORMS,
  toQuestionOptions as dosageFormOptions,
} from './dosage-forms.js';

export {
  type StudyDesign,
  STUDY_DESIGNS,
  toQuestionOptions as studyDesignOptions,
} from './study-designs.js';

export {
  type ExpressionSystem,
  EXPRESSION_SYSTEMS,
  toQuestionOptions as expressionSystemOptions,
} from './expression-systems.js';

export {
  type AnalyticalMethod,
  ANALYTICAL_METHODS,
  toQuestionOptions as analyticalMethodOptions,
} from './analytical-methods.js';

export {
  type ManufacturingProcess,
  MANUFACTURING_PROCESSES,
  toQuestionOptions as manufacturingProcessOptions,
} from './manufacturing-processes.js';

export {
  type ContainerClosure,
  CONTAINER_CLOSURES,
  toQuestionOptions as containerClosureOptions,
} from './container-closure.js';

export {
  type ExcipientClass,
  EXCIPIENT_CLASSES,
  toQuestionOptions as excipientClassOptions,
} from './excipient-classes.js';

export {
  type EndpointType,
  ENDPOINT_TYPES,
  toQuestionOptions as endpointTypeOptions,
} from './endpoint-types.js';

export {
  type StatisticalMethod,
  STATISTICAL_METHODS,
  toQuestionOptions as statisticalMethodOptions,
} from './statistical-methods.js';
