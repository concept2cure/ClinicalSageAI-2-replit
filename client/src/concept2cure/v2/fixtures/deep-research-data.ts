/**
 * Deep Research fixture data — ported verbatim from kit app/deep-research.jsx.
 *
 * Connector catalog mirrors CONNECTOR_CATALOG (server/services/connectors/
 * connector-interface.ts). 18 connectors with exact id / type / category /
 * requiredTier / requiresCredentials / credentialFields.
 */

/* ── Types ── */

export interface CredentialField {
  field: string;
  label: string;
  placeholder: string;
  secret: boolean;
}

export type ConnectorTier = 'free' | 'standard' | 'professional' | 'enterprise';
export type ConnectorType = 'api' | 'scraper';
export type ConnectorCategory =
  | 'clinical_data'
  | 'literature'
  | 'regulatory'
  | 'dms'
  | 'ehr'
  | 'funding'
  | 'compliance'
  | 'sor';

export interface ConnectorInfo {
  id: string;
  name: string;
  type: ConnectorType;
  cat: ConnectorCategory;
  tier: ConnectorTier;
  creds: boolean;
  icon: string;
  desc: string;
  cf: CredentialField[];
}

export interface ConnectorState extends ConnectorInfo {
  configured: boolean;
}

export interface DrResult {
  conn: string;
  title: string;
  date: string;
  meta: string;
}

export interface DrJob {
  name: string;
  state: 'run' | 'done';
  hits: number;
}

export type ResearchDepth = 'quick' | 'standard' | 'exhaustive';

/* ── Connector catalog (verbatim from CONNECTOR_CATALOG) ── */

export const DR_CONN: ConnectorInfo[] = [
  { id: 'clinical_trials_gov', name: 'ClinicalTrials.gov', type: 'api', cat: 'clinical_data', tier: 'free', creds: false, icon: 'beaker',
    desc: 'NIH/NLM registry of FDA-regulated clinical studies worldwide. Search by condition, intervention, location, sponsor, and status.', cf: [] },
  { id: 'pubmed', name: 'PubMed / MEDLINE', type: 'api', cat: 'literature', tier: 'free', creds: false, icon: 'book',
    desc: 'NCBI literature database with 36M+ biomedical citations. Publications, systematic reviews, and meta-analyses.',
    cf: [{ field: 'apiKey', label: 'NCBI API Key (optional)', placeholder: 'For higher rate limits', secret: true }] },
  { id: 'fda_drugs', name: 'FDA Drugs@FDA', type: 'scraper', cat: 'regulatory', tier: 'standard', creds: false, icon: 'stethoscope',
    desc: 'FDA approval histories, labeling, review documents, and regulatory actions for approved drug products.', cf: [] },
  { id: 'ema_epar', name: 'EMA European Public Assessment Reports', type: 'scraper', cat: 'regulatory', tier: 'standard', creds: false, icon: 'globe',
    desc: 'EMA assessment reports, product information, and procedural documents.', cf: [] },
  { id: 'eudamed', name: 'EUDAMED (EU Medical Device Database)', type: 'api', cat: 'regulatory', tier: 'standard', creds: false, icon: 'globe',
    desc: 'European Database on Medical Devices. Search by Basic UDI-DI, manufacturer (actor SRN), and risk class.', cf: [] },
  { id: 'eu_ctis', name: 'EU CTIS (Clinical Trials Information System)', type: 'api', cat: 'clinical_data', tier: 'standard', creds: false, icon: 'beaker',
    desc: 'EU Clinical Trials Information System under Reg. (EU) 536/2014. Authorised/ongoing EU trials.', cf: [] },
  { id: 'pmda_reviews', name: 'PMDA Review Reports', type: 'scraper', cat: 'regulatory', tier: 'professional', creds: false, icon: 'scroll',
    desc: 'Japanese PMDA review reports and approval information. English translations for most recent approvals.', cf: [] },
  { id: 'nmpa_cde', name: 'NMPA / CDE Approvals', type: 'scraper', cat: 'regulatory', tier: 'professional', creds: false, icon: 'scroll',
    desc: 'China NMPA and Center for Drug Evaluation approval data.', cf: [] },
  { id: 'veeva_vault', name: 'Veeva Vault', type: 'api', cat: 'dms', tier: 'professional', creds: true, icon: 'database',
    desc: 'Your Veeva Vault instance -- document management, study data, and regulatory information management.',
    cf: [
      { field: 'baseUrl', label: 'Vault Domain URL', placeholder: 'https://yourvault.veevavault.com', secret: false },
      { field: 'username', label: 'API Username', placeholder: 'api-user@yourdomain.com', secret: false },
      { field: 'password', label: 'API Password', placeholder: 'Your Vault API password', secret: true },
    ] },
  { id: 'medidata_rave', name: 'Medidata Rave', type: 'api', cat: 'clinical_data', tier: 'professional', creds: true, icon: 'barChart',
    desc: 'Medidata Rave EDC -- study data, subject data, and CRF information via Rave Web Services (RWS).',
    cf: [
      { field: 'baseUrl', label: 'Rave Instance URL', placeholder: 'https://yourstudy.mdsol.com', secret: false },
      { field: 'username', label: 'Rave Username', placeholder: 'Your Medidata Rave username', secret: false },
      { field: 'password', label: 'Rave Password', placeholder: 'Your Medidata Rave password', secret: true },
    ] },
  { id: 'sharepoint', name: 'Microsoft SharePoint', type: 'api', cat: 'dms', tier: 'professional', creds: true, icon: 'globe',
    desc: 'SharePoint Online -- document search, retrieval, and library browsing via Microsoft Graph API.',
    cf: [
      { field: 'clientId', label: 'Azure AD Application (Client) ID', placeholder: 'xxxxxxxx-xxxx-...', secret: false },
      { field: 'clientSecret', label: 'Client Secret', placeholder: 'Azure AD app client secret', secret: true },
      { field: 'baseUrl', label: 'Tenant Domain', placeholder: 'yourtenant.sharepoint.com', secret: false },
    ] },
  { id: 'fhir-r4', name: 'FHIR R4 Server', type: 'api', cat: 'ehr', tier: 'professional', creds: true, icon: 'stethoscope',
    desc: 'Any FHIR R4-compliant server (Epic, Cerner, HAPI). Patient, MedicinalProductDefinition, ResearchStudy, DocumentReference, Observation.',
    cf: [
      { field: 'baseUrl', label: 'FHIR Server Base URL', placeholder: 'https://fhir.example.com/r4', secret: false },
      { field: 'apiKey', label: 'Bearer Token / API Key', placeholder: 'FHIR server auth token', secret: true },
      { field: 'clientId', label: 'OAuth Client ID (optional)', placeholder: 'SMART on FHIR client ID', secret: false },
      { field: 'clientSecret', label: 'OAuth Client Secret (optional)', placeholder: 'SMART on FHIR client secret', secret: true },
    ] },
  { id: 'onedrive', name: 'Microsoft OneDrive', type: 'api', cat: 'dms', tier: 'professional', creds: true, icon: 'globe',
    desc: 'OneDrive (personal or business) via Microsoft Graph API -- search, browse, retrieve.',
    cf: [
      { field: 'clientId', label: 'Azure AD Application (Client) ID', placeholder: 'xxxxxxxx-xxxx-...', secret: false },
      { field: 'clientSecret', label: 'Client Secret', placeholder: 'Azure AD app client secret', secret: true },
      { field: 'baseUrl', label: 'Tenant ID', placeholder: 'Your Azure AD tenant ID', secret: false },
    ] },
  { id: 'google_drive', name: 'Google Drive', type: 'api', cat: 'dms', tier: 'professional', creds: true, icon: 'database',
    desc: 'Google Drive via Drive API v3 -- documents, spreadsheets, files. Service-account auth with domain-wide delegation.',
    cf: [
      { field: 'clientId', label: 'Service Account Email', placeholder: 'svc@project.iam.gserviceaccount.com', secret: false },
      { field: 'clientSecret', label: 'Private Key (JSON key file)', placeholder: '-----BEGIN PRIVATE KEY-----...', secret: true },
      { field: 'username', label: 'Impersonate User (optional)', placeholder: 'user@yourdomain.com', secret: false },
    ] },
  { id: 'box', name: 'Box', type: 'api', cat: 'dms', tier: 'professional', creds: true, icon: 'database',
    desc: 'Box enterprise document management -- search, retrieve, upload via Box API v2 (Client Credentials Grant).',
    cf: [
      { field: 'clientId', label: 'Client ID', placeholder: 'Your Box app Client ID', secret: false },
      { field: 'clientSecret', label: 'Client Secret', placeholder: 'Your Box app Client Secret', secret: true },
      { field: 'baseUrl', label: 'Enterprise ID', placeholder: 'Box Enterprise ID (numeric)', secret: false },
    ] },
  { id: 'grants_gov', name: 'Grants.gov', type: 'api', cat: 'funding', tier: 'free', creds: false, icon: 'building',
    desc: 'US federal funding opportunities (Search2 API). Discover and track NOFOs across federal agencies for pre-award pipeline building.', cf: [] },
  { id: 'sam_exclusions', name: 'SAM.gov Restricted-Party Screening', type: 'api', cat: 'compliance', tier: 'professional', creds: true, icon: 'shieldAlert',
    desc: 'Screen investigators, sub-recipients and vendors against the SAM.gov Exclusions list (2 CFR 200.214 suspension & debarment).',
    cf: [{ field: 'apiKey', label: 'SAM.gov API Key', placeholder: 'Your SAM.gov personal API key', secret: true }] },
  { id: 'ellucian_banner', name: 'Ellucian Banner (Ethos)', type: 'api', cat: 'sor', tier: 'enterprise', creds: true, icon: 'building',
    desc: 'Banner as the institutional system of record via the Ethos Integration API -- reconcile persons, organizations and grant/fund records (read-only).',
    cf: [
      { field: 'baseUrl', label: 'Ethos Base URL', placeholder: 'https://integrate.elluciancloud.com', secret: false },
      { field: 'apiKey', label: 'Ethos API Key', placeholder: 'Your Ethos Integration API key', secret: true },
    ] },
];

export const DR_CATS: Record<string, string> = {
  regulatory: 'Regulatory',
  literature: 'Literature',
  clinical_data: 'Clinical data',
  dms: 'Document management (DMS)',
  ehr: 'EHR / clinical systems',
  funding: 'Funding',
  compliance: 'Compliance',
  sor: 'System of record',
};

export const DR_RESULTS: DrResult[] = [
  { conn: 'ClinicalTrials.gov', title: 'Phase 2 RTK-X inhibitor in advanced solid tumors -- confirmed ORR 34% (n=118)', date: '2024', meta: 'NCT · completed' },
  { conn: 'PubMed / MEDLINE', title: 'RTK-X pathway inhibition in biliary tract cancer -- systematic review & meta-analysis', date: '2023', meta: 'Eur J Cancer' },
  { conn: 'FDA Drugs@FDA', title: 'Precedent accelerated approval on ORR endpoint -- confirmatory trial required', date: '2022', meta: 'Drugs@FDA · SBA' },
  { conn: 'EMA EPAR', title: 'Conditional marketing authorization, similar mechanism, PRIME designation', date: '2023', meta: 'EPAR' },
];

export const DR_SYNTH =
  'Across four sources, the RTK-X inhibitor class shows ORR-based accelerated (FDA, 2022) and conditional (EMA, 2023) approvals, each carrying a post-approval confirmatory-trial commitment [SRC-3, SRC-4]. Reported Phase 2 ORR ranges 31–38% [SRC-1, SRC-2], consistent with BX-204’s confirmed 38.6%. The precedent supports an accelerated-approval strategy anchored on ORR with a pre-agreed confirmatory trial.';

export const DEPTHS: [string, string, string][] = [
  ['quick', 'Quick', '1 credit'],
  ['standard', 'Standard', '3 credits'],
  ['exhaustive', 'Exhaustive', '8 credits'],
];

export const TIER_TONE: Record<ConnectorTier, string> = {
  free: 'ok',
  standard: 'ai',
  professional: 'warn',
  enterprise: 'idle',
};
