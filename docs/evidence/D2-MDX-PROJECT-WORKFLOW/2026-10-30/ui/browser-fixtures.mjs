// Explicit synthetic records for the actual components; never client data.
export const project = { id: '11111111-1111-4111-8111-111111111111', name: 'Synthetic risk project Alpha',
  program_type: '510K', product_type: 'device', regulatory_path: '510k', primary_agency: 'FDA', device_flags: [] };
export const program = { id: project.id, name: project.name, code: 'SYNTHETIC-ALPHA', programType: '510K', productType: 'device',
  regulatoryPath: '510k', primaryAgency: 'FDA', productName: project.name, status: 'active', phase: null,
  createdAt: '2026-10-30T00:00:00Z', updatedAt: '2026-10-30T00:00:00Z' };
export const hazard = { id: 1, program_id: project.id, ref_code: 'HZ-01', hazard: 'Synthetic incorrect measurement',
  hazardous_situation: 'Synthetic treatment decision', harm: 'Synthetic dosing injury', severity: 3, probability: 2,
  residual_probability: null, status: 'open', acceptable: null };
export const control = { id: 9, risk_item_id: 1, description: 'Synthetic independent sensor cross-check', control_type: 'inherent_safety', status: 'verified' };
export const engineering = { data: { summary: { dhfCompletion: 0, openEcrs: 0, openRisks: 1, openIssues: 0, riskLastUpdated: null },
  dhf: [], trace: [], risks: [{ id: hazard.ref_code, hazard: hazard.hazard, situation: hazard.hazardous_situation, harm: hazard.harm,
    severity: 'S3', probBefore: 'P2', controlClass: 'design', control: control.description, verif: '—',
    probAfter: 'P2', residual: 'S3P2', state: 'open', owner: '—' }], ecrs: [], issues: [], documents: [] },
  meta: { scopes: Object.fromEntries(['dhf', 'trace', 'risks', 'ecrs', 'issues', 'documents'].map(key => [key, 'program'])), unavailable: [] } };
