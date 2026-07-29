/**
 * Cheminformatics layer — public surface.
 *
 * Deterministic, dependency-free chemistry utilities that turn a molecular
 * structure (SMILES) and/or curated descriptors into actionable, auditable
 * regulatory/discovery signals:
 *
 * - `screenStructuralAlerts` — SMILES validation + ICH M7(R2)-relevant
 *   structural-alert screen (N-nitrosamine, aromatic amine, epoxide, …).
 * - `assessDevelopability` — Lipinski/Veber oral drug-likeness read over
 *   curated physicochemical descriptors.
 *
 * Everything here is pure and offline. Live compound data (descriptors,
 * mechanism, phase) comes from `server/services/integrations/chembl-client`;
 * the AnA tool layer composes the two.
 *
 * @module server/services/chem
 */

export {
  screenStructuralAlerts,
  validateSmiles,
  explicitAtomWeight,
  type StructuralAlert,
  type StructuralAlertReport,
  type SmilesValidation,
  type AlertConfidence,
} from './structural-alerts.js';

export {
  assessDevelopability,
  type DevelopabilityInput,
  type DevelopabilityReport,
  type DevelopabilityFlag,
  type DevelopabilityStatus,
} from './developability.js';
