// Explicit synthetic facts, never client or production records.
const base = {
  id: '11111111-1111-4111-8111-111111111111', code: 'SYNTHETIC-MDX',
  status: 'active', name: 'Synthetic device Alpha', product_name: 'Synthetic device Alpha',
  product_type: 'device', program_type: '510K', regulatory_path: '510k', primary_agency: 'FDA',
  device_flags: [], indication: null, intended_use: null, description: null,
  phase: null, priority: null, target_submission_date: null, canChange: false,
};
export const scenarios = {
  '510k': { project: base, filings: [] },
  cer: { project: { ...base, name: 'Synthetic device CER', product_name: 'Synthetic device CER', program_type: 'MDR', regulatory_path: 'mdr', primary_agency: 'EU' }, filings: [] },
  ivdr: { project: { ...base, name: 'Synthetic assay PER', product_name: 'Synthetic assay PER', product_type: 'ivd', program_type: 'IVDR', regulatory_path: 'ivdr', primary_agency: 'EU' }, filings: [] },
  multi: { project: { ...base, name: 'Synthetic assay multi-filing', product_name: 'Synthetic assay multi-filing', product_type: 'ivd' }, filings: ['MDR', 'IVDR', 'IVDR'] },
  'de-novo': { project: { ...base, name: 'Synthetic De Novo', program_type: 'DE_NOVO', regulatory_path: 'de_novo' }, filings: [] },
};
const item = (moduleId, name, extra = {}) => ({ moduleId, name, description: `Synthetic ${name} feature`,
  category: 'mdx', sortOrder: 1, isEnabled: true, isAvailable: true,
  requiredTier: 'professional', subscriptionState: 'enabled', launchScope: 'launch', ...extra });
export const catalog = [
  item('projects', 'Projects', { category: 'work' }),
  item('device-510k', '510(k) pathway'), item('device-cer', 'Clinical evaluation'),
  item('device-diagnostics', 'Diagnostic evidence'), item('device-engineering', 'Device engineering'),
  item('device-software', 'Software evidence', { isEnabled: false, subscriptionState: 'disabled' }),
  item('ivd-completeness', 'IVDR completeness'),
  item('document-authoring', 'Authoring', { category: 'authoring' }),
];
export const licence = { tier: 'professional', industryMode: 'medtech', usage: {
  projects: { currentCount: 1, maxAllowed: 25 }, users: { currentCount: 1, maxAllowed: 50 },
} };
