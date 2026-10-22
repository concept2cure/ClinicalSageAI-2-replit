/** Code-defined capability inventory, derived from the canonical run dispatcher.
 * Registration is not execution or a statement about deployed tenant data. */
import { REPORT_TYPE_SEED } from './taxonomy';
import { GLOBAL_REPORT_TYPE_SEED } from './taxonomy-global';
import { PREDICTION_REPORT_TYPES } from './prediction/report-types';
import { reportAvailability, type ReportEngine } from './report-engine';

export interface ReportCapability {
  typeId: string;
  label: string;
  family: string;
  declaredScopes: string[];
  dataDependencies: string[];
  computedScopes: string[];
  engine: ReportEngine | null;
  state: 'engine-backed' | 'prediction-unavailable' | 'uncomputed';
  decision: 'retain-canonical' | 'qualify-before-exposure' | 'complete-or-retire';
  qualification: string;
}

export function reportCapabilityInventory(): ReportCapability[] {
  return [...REPORT_TYPE_SEED, ...GLOBAL_REPORT_TYPE_SEED, ...PREDICTION_REPORT_TYPES].map(type => {
    const supported = type.allowedScopes.map(scope => ({ scope, availability: reportAvailability(type.typeId, scope, type.allowedScopes) }))
      .filter(item => item.availability.runnable);
    const engine = supported[0]?.availability.engine ?? null;
    const prediction = type.family === 'prediction';
    return {
      typeId: type.typeId, label: type.label, family: type.family,
      declaredScopes: [...type.allowedScopes], computedScopes: supported.map(item => item.scope), engine,
      dataDependencies: [...type.dataDependencies],
      state: engine ? 'engine-backed' : prediction ? 'prediction-unavailable' : 'uncomputed',
      decision: engine ? 'retain-canonical' : prediction ? 'qualify-before-exposure' : 'complete-or-retire',
      qualification: engine ? 'A canonical engine exists at the listed scopes. Registry enablement, object access, plan, recorded inputs and output gates still decide each run.'
        : prediction ? 'No validated prediction model is available as a governed report run. Separate advisory assembly does not qualify a forecast; a plan does not make it executable.'
          : 'No canonical engine computes this type. Authoritative inputs, a scoped provider and end-to-end output qualification are required before exposure.',
    };
  });
}

export function reportCapabilityCounts(inventory = reportCapabilityInventory()) {
  return {
    defined: inventory.length,
    engineBacked: inventory.filter(row => row.state === 'engine-backed').length,
    predictionUnavailable: inventory.filter(row => row.state === 'prediction-unavailable').length,
    uncomputed: inventory.filter(row => row.state === 'uncomputed').length,
  };
}
