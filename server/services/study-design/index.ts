/**
 * Study Design module — the design-as-data spine (USDM / ICH M11-aligned).
 *
 * Public surface for the structured study-design object and its deterministic gates.
 * Persistence, sample-size wiring, SoA, SAP/protocol projection and governance are
 * added in subsequent slices; this barrel exposes the object model plus the §2/§3/§4/
 * §6/§10/§17 validation that everything else builds on.
 *
 * @module server/services/study-design
 */

export * from './study-design-types';
export {
  type DesignFinding,
  type FindingSeverity,
  estimandGate,
  endpointRedFlags,
  frameworkRules,
  multiplicityGate,
  powerRedFlags,
  runAllGates,
} from './design-gates';
export {
  type DesignRiskLevel,
  type DesignValidationReport,
  validateDesign,
} from './design-validation';
