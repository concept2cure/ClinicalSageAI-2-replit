/**
 * @fileoverview Data Connector Interface
 * @module server/services/connectors/connector-interface
 *
 * Unified interface for all external data source connectors.
 * Each connector (ClinicalTrials.gov, Veeva Vault, Medidata, PubMed,
 * regulatory agency scrapers) implements this interface.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ConnectorHealth {
  status: 'healthy' | 'degraded' | 'unavailable';
  latencyMs?: number;
  lastChecked: Date;
  message?: string;
}

export interface ConnectorQuery {
  indication?: string;
  phase?: string;
  sponsor?: string;
  intervention?: string;
  therapeuticArea?: string;
  keywords?: string[];
  dateRange?: { from?: string; to?: string };
  limit?: number;
}

export interface ConnectorDocument {
  id: string;
  sourceConnector: string;
  title: string;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
  url?: string;
  retrievedAt: Date;
}

export interface ConnectorResult {
  id: string;
  sourceConnector: string;
  title: string;
  summary: string;
  relevanceScore: number;
  metadata: Record<string, unknown>;
  url?: string;
}

export interface ConnectorCredentials {
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  baseUrl?: string;
  username?: string;
  password?: string;
  customHeaders?: Record<string, string>;
}

export type ConnectorType = 'api' | 'scraper' | 'mcp';

// ═══════════════════════════════════════════════════════════════════════════════
// INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

export interface DataConnector {
  /** Unique connector identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Connection type */
  type: ConnectorType;
  /** Whether this connector requires org-specific credentials */
  requiresCredentials: boolean;
  /** Minimum tier required to use this connector */
  requiredTier: string;

  /** Check connector health / availability */
  status(): Promise<ConnectorHealth>;

  /** Search for data matching the query */
  search(query: ConnectorQuery): Promise<ConnectorResult[]>;

  /** Fetch a specific document/resource by ID */
  fetch(resourceId: string): Promise<ConnectorDocument>;

  /** Set credentials for authenticated connectors */
  authenticate(credentials: ConnectorCredentials): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTOR CATALOG
// ═══════════════════════════════════════════════════════════════════════════════

export interface ConnectorSetupStep {
  step: number;
  title: string;
  instructions: string;
}

export interface ConnectorSetupGuide {
  overview: string;
  prerequisites: string[];
  credentialFields: { field: string; label: string; placeholder: string; secret: boolean }[];
  steps: ConnectorSetupStep[];
  troubleshooting: string[];
}

export interface ConnectorCatalogEntry {
  id: string;
  name: string;
  type: ConnectorType;
  description: string;
  requiredTier: string;
  requiresCredentials: boolean;
  documentationUrl?: string;
  icon?: string;
  category: 'regulatory' | 'literature' | 'clinical_data' | 'dms' | 'ehr';
  setupGuide?: ConnectorSetupGuide;
}

export const CONNECTOR_CATALOG: ConnectorCatalogEntry[] = [
  // ─── Regulatory Data Sources ─────────────────────────────────────────────────
  {
    id: 'clinical_trials_gov',
    name: 'ClinicalTrials.gov',
    type: 'api',
    category: 'clinical_data',
    description: 'NIH/NLM registry of FDA-regulated clinical studies worldwide. Search trials by condition, intervention, location, sponsor, and status.',
    requiredTier: 'free',
    requiresCredentials: false,
    icon: 'flask',
    setupGuide: {
      overview: 'ClinicalTrials.gov is a free, publicly accessible database. No credentials are needed — just enable the connector and start searching.',
      prerequisites: ['No prerequisites required'],
      credentialFields: [],
      steps: [
        { step: 1, title: 'Enable the connector', instructions: 'Toggle the connector on from this page.' },
        { step: 2, title: 'Start searching', instructions: 'Use the search panel or AnA chat to query clinical trials by indication, phase, sponsor, or intervention.' },
      ],
      troubleshooting: [
        'If results are empty, try broader search terms or check for typos in the indication name.',
        'ClinicalTrials.gov API has a rate limit of ~10 requests per second. If you hit limits, wait a moment and retry.',
      ],
    },
  },
  {
    id: 'pubmed',
    name: 'PubMed / MEDLINE',
    type: 'api',
    category: 'literature',
    description: 'NCBI literature database with 36M+ biomedical citations. Search publications, systematic reviews, and meta-analyses.',
    requiredTier: 'free',
    requiresCredentials: false,
    icon: 'book',
    setupGuide: {
      overview: 'PubMed provides free access to biomedical literature. No API key is required for basic use, though an NCBI API key increases rate limits.',
      prerequisites: ['No prerequisites required'],
      credentialFields: [
        { field: 'apiKey', label: 'NCBI API Key (optional)', placeholder: 'Your NCBI API key for higher rate limits', secret: true },
      ],
      steps: [
        { step: 1, title: 'Enable the connector', instructions: 'Toggle the connector on. It works immediately without credentials.' },
        { step: 2, title: 'Optional: Add NCBI API key', instructions: 'Register at NCBI and generate an API key from your account settings for higher throughput (10 req/s vs 3 req/s).' },
      ],
      troubleshooting: [
        'Rate limit errors (HTTP 429) indicate you need an API key. Register at ncbi.nlm.nih.gov/account.',
        'PubMed search uses MeSH terms for best results — try standard medical terminology.',
      ],
    },
  },
  {
    id: 'fda_drugs',
    name: 'FDA Drugs@FDA',
    type: 'scraper',
    category: 'regulatory',
    description: 'FDA approval histories, labeling, review documents, and regulatory actions for approved drug products.',
    requiredTier: 'standard',
    requiresCredentials: false,
    icon: 'pill',
    setupGuide: {
      overview: 'Drugs@FDA data is scraped from the public FDA website. No credentials are needed.',
      prerequisites: ['Standard tier subscription or higher'],
      credentialFields: [],
      steps: [
        { step: 1, title: 'Enable the connector', instructions: 'Toggle the connector on. Data is scraped from the public FDA Drugs@FDA database.' },
        { step: 2, title: 'Search by drug name', instructions: 'Search by brand name, active ingredient, or application number (NDA/BLA/ANDA).' },
      ],
      troubleshooting: [
        'FDA website changes may temporarily affect data scraping. Results are cached for reliability.',
        'For very recent approvals, allow 24–48 hours for FDA to publish review documents.',
      ],
    },
  },
  {
    id: 'ema_epar',
    name: 'EMA European Public Assessment Reports',
    type: 'scraper',
    category: 'regulatory',
    description: 'European Medicines Agency assessment reports, product information, and procedural documents.',
    requiredTier: 'standard',
    requiresCredentials: false,
    icon: 'flag',
    setupGuide: {
      overview: 'EMA EPARs are publicly available assessment reports. No credentials are required.',
      prerequisites: ['Standard tier subscription or higher'],
      credentialFields: [],
      steps: [
        { step: 1, title: 'Enable the connector', instructions: 'Toggle the connector on to access EMA public assessment reports.' },
        { step: 2, title: 'Search by product', instructions: 'Search by active substance name, INN, or marketing authorization holder.' },
      ],
      troubleshooting: [
        'EMA documents are available in multiple languages. English versions are returned by default.',
        'Some older products may have limited digital documentation.',
      ],
    },
  },
  {
    id: 'pmda_reviews',
    name: 'PMDA Review Reports',
    type: 'scraper',
    category: 'regulatory',
    description: 'Japanese Pharmaceuticals and Medical Devices Agency review reports and approval information.',
    requiredTier: 'professional',
    requiresCredentials: false,
    icon: 'scroll',
    setupGuide: {
      overview: 'PMDA review reports are publicly accessible. English translations are available for most recently approved products.',
      prerequisites: ['Professional tier subscription'],
      credentialFields: [],
      steps: [
        { step: 1, title: 'Enable the connector', instructions: 'Toggle the connector on to access PMDA review reports.' },
        { step: 2, title: 'Search by product', instructions: 'Search by INN, product name, or therapeutic area. English translations are available for recent approvals.' },
      ],
      troubleshooting: [
        'Some review reports are only available in Japanese. Machine translation is applied where English versions are unavailable.',
        'PMDA website may have intermittent availability during maintenance windows.',
      ],
    },
  },
  {
    id: 'nmpa_cde',
    name: 'NMPA / CDE Approvals',
    type: 'scraper',
    category: 'regulatory',
    description: 'China National Medical Products Administration and Center for Drug Evaluation approval data.',
    requiredTier: 'professional',
    requiresCredentials: false,
    icon: 'scroll',
    setupGuide: {
      overview: 'NMPA/CDE approval data is scraped from public Chinese regulatory databases.',
      prerequisites: ['Professional tier subscription'],
      credentialFields: [],
      steps: [
        { step: 1, title: 'Enable the connector', instructions: 'Toggle the connector on to access NMPA/CDE approval data.' },
        { step: 2, title: 'Search by drug name', instructions: 'Search by INN, Chinese drug name, or registration number.' },
      ],
      troubleshooting: [
        'Data is primarily in Chinese with machine-translated summaries. Use INN for best cross-language matching.',
        'CDE website access may be intermittent from non-China regions.',
      ],
    },
  },

  // ─── Enterprise DMS & Clinical Platforms ─────────────────────────────────────
  {
    id: 'veeva_vault',
    name: 'Veeva Vault',
    type: 'api',
    category: 'dms',
    description: 'Connect to your Veeva Vault instance for document management, study data, and regulatory information management.',
    requiredTier: 'professional',
    requiresCredentials: true,
    documentationUrl: 'https://developer.veevavault.com/api/24.1/',
    icon: 'database',
    setupGuide: {
      overview: 'Connect ClinicalSageAI to your Veeva Vault instance to search and retrieve regulatory documents, study data, and submission artifacts.',
      prerequisites: [
        'Veeva Vault account with API access enabled',
        'API user credentials (username + password) or OAuth client credentials',
        'Vault domain URL (e.g., yourvault.veevavault.com)',
      ],
      credentialFields: [
        { field: 'baseUrl', label: 'Vault Domain URL', placeholder: 'https://yourvault.veevavault.com', secret: false },
        { field: 'username', label: 'API Username', placeholder: 'api-user@yourdomain.com', secret: false },
        { field: 'password', label: 'API Password', placeholder: 'Your Vault API password', secret: true },
        { field: 'clientId', label: 'Client ID (optional)', placeholder: 'OAuth client ID if using OAuth flow', secret: false },
        { field: 'clientSecret', label: 'Client Secret (optional)', placeholder: 'OAuth client secret', secret: true },
      ],
      steps: [
        { step: 1, title: 'Create an API user in Veeva Vault', instructions: 'In Vault Admin > Users, create a dedicated API user with read access to the document types you want to search. Assign the appropriate security profile.' },
        { step: 2, title: 'Enable API access', instructions: 'Ensure your Vault has API access enabled. Go to Admin > Settings > General Settings and confirm "API Enabled" is checked.' },
        { step: 3, title: 'Enter credentials', instructions: 'Enter your Vault domain URL and API user credentials below. For OAuth, provide client ID and secret instead of username/password.' },
        { step: 4, title: 'Test connection', instructions: 'Click "Test Connection" to verify ClinicalSageAI can authenticate and access your Vault instance.' },
      ],
      troubleshooting: [
        'Error "INVALID_SESSION_ID": Your credentials may have expired. Re-enter your password or regenerate OAuth tokens.',
        'Error "INSUFFICIENT_ACCESS": The API user needs read access to the relevant Vault applications (QualityDocs, RIM, etc.).',
        'If connection times out, verify the Vault domain URL is correct and accessible from your network.',
        'For SSO-enforced Vaults, you must use a service account exempted from SSO or use OAuth client credentials.',
      ],
    },
  },
  {
    id: 'medidata_rave',
    name: 'Medidata Rave',
    type: 'api',
    category: 'clinical_data',
    description: 'Connect to Medidata Rave for electronic data capture, study data, and clinical trial management.',
    requiredTier: 'professional',
    requiresCredentials: true,
    documentationUrl: 'https://learn.medidata.com/en-US/d/rave-web-services',
    icon: 'chart',
    setupGuide: {
      overview: 'Connect to your Medidata Rave EDC instance to access clinical study data, subject data, and CRF information through Rave Web Services (RWS).',
      prerequisites: [
        'Medidata Rave account with Web Services access',
        'Rave Web Services (RWS) enabled for your instance',
        'API credentials (username + password for the Rave instance)',
        'Study-level access grants for the studies you want to query',
      ],
      credentialFields: [
        { field: 'baseUrl', label: 'Rave Instance URL', placeholder: 'https://yourstudy.mdsol.com', secret: false },
        { field: 'username', label: 'Rave Username', placeholder: 'Your Medidata Rave username', secret: false },
        { field: 'password', label: 'Rave Password', placeholder: 'Your Medidata Rave password', secret: true },
      ],
      steps: [
        { step: 1, title: 'Verify RWS access', instructions: 'Contact your Medidata administrator to confirm Rave Web Services (RWS) is enabled for your instance. RWS must be licensed separately.' },
        { step: 2, title: 'Create an API user', instructions: 'In Rave, create a dedicated API user with read-only access to the studies you want to connect. Assign appropriate study-level permissions.' },
        { step: 3, title: 'Enter credentials', instructions: 'Enter your Rave instance URL (e.g., https://yourstudy.mdsol.com) and the API user credentials below.' },
        { step: 4, title: 'Test connection', instructions: 'Click "Test Connection" to verify access. The connector will list available studies.' },
      ],
      troubleshooting: [
        'Error "Unauthorized": Verify the username and password. Rave passwords are case-sensitive.',
        'Error "Study not found": The API user may not have access to that study. Check study-level permissions in Rave Admin.',
        'If RWS returns "Service Unavailable", contact Medidata support — RWS may not be enabled for your instance.',
        'For iMedidata-federated accounts, use the Rave-specific credentials, not the iMedidata SSO credentials.',
      ],
    },
  },
  {
    id: 'sharepoint',
    name: 'Microsoft SharePoint',
    type: 'api',
    category: 'dms',
    description: 'Connect to your SharePoint Online instance for document search, retrieval, and library browsing via Microsoft Graph API.',
    requiredTier: 'professional',
    requiresCredentials: true,
    documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/resources/sharepoint',
    icon: 'cloud',
    setupGuide: {
      overview: 'Connect to SharePoint Online to search and retrieve documents from your organization\'s SharePoint sites and document libraries.',
      prerequisites: [
        'Microsoft 365 tenant with SharePoint Online',
        'Azure AD app registration with Microsoft Graph API permissions',
        'Admin consent for Sites.Read.All or Sites.ReadWrite.All permissions',
      ],
      credentialFields: [
        { field: 'clientId', label: 'Azure AD Application (Client) ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', secret: false },
        { field: 'clientSecret', label: 'Client Secret', placeholder: 'Your Azure AD app client secret', secret: true },
        { field: 'baseUrl', label: 'Tenant Domain', placeholder: 'yourtenant.sharepoint.com', secret: false },
      ],
      steps: [
        { step: 1, title: 'Register an Azure AD application', instructions: 'Go to Azure Portal > Azure Active Directory > App registrations > New registration. Name it "ClinicalSageAI SharePoint Connector". Set "Accounts in this organizational directory only".' },
        { step: 2, title: 'Configure API permissions', instructions: 'In the app registration, go to API Permissions > Add a permission > Microsoft Graph > Application permissions. Add: Sites.Read.All, Files.Read.All. Click "Grant admin consent".' },
        { step: 3, title: 'Create a client secret', instructions: 'Go to Certificates & Secrets > New client secret. Set an appropriate expiry. Copy the secret value immediately — it won\'t be shown again.' },
        { step: 4, title: 'Enter credentials', instructions: 'Enter the Application (Client) ID, the client secret, and your SharePoint tenant domain below.' },
      ],
      troubleshooting: [
        'Error "AADSTS700016": The application ID is incorrect. Verify the Client ID in Azure AD.',
        'Error "Insufficient privileges": Admin consent has not been granted. An Azure AD admin must grant consent for the app permissions.',
        'Error "InvalidAuthenticationToken": The client secret may have expired. Generate a new secret in Azure AD.',
        'If search returns no results, verify the app has access to the target SharePoint site collections.',
      ],
    },
  },
  {
    id: 'fhir-r4',
    name: 'FHIR R4 Server',
    type: 'api',
    category: 'ehr',
    description: 'Connect to any FHIR R4-compliant server. Search Patient, MedicinalProductDefinition, ResearchStudy, DocumentReference, and Observation resources. Supports Bearer token and SMART on FHIR OAuth2 authentication.',
    requiredTier: 'professional',
    requiresCredentials: true,
    documentationUrl: 'https://hl7.org/fhir/R4/',
    icon: 'heart-pulse',
    setupGuide: {
      overview: 'Connect to any FHIR R4-compliant healthcare data server (Epic, Cerner, HAPI FHIR, etc.) to query clinical and regulatory data resources.',
      prerequisites: [
        'FHIR R4-compliant server endpoint URL',
        'Authentication credentials (Bearer token, API key, or SMART on FHIR OAuth2 client)',
        'Read access to target FHIR resource types',
      ],
      credentialFields: [
        { field: 'baseUrl', label: 'FHIR Server Base URL', placeholder: 'https://fhir.example.com/r4', secret: false },
        { field: 'apiKey', label: 'Bearer Token / API Key', placeholder: 'Your FHIR server authentication token', secret: true },
        { field: 'clientId', label: 'OAuth Client ID (optional)', placeholder: 'SMART on FHIR client ID', secret: false },
        { field: 'clientSecret', label: 'OAuth Client Secret (optional)', placeholder: 'SMART on FHIR client secret', secret: true },
      ],
      steps: [
        { step: 1, title: 'Identify your FHIR server', instructions: 'Determine the base URL of your FHIR R4 server. For Epic: typically https://yourorg.epic.com/interconnect-fhir-oauth/api/FHIR/R4. For Cerner: check your Cerner Millennium configuration.' },
        { step: 2, title: 'Obtain credentials', instructions: 'For Bearer token auth: generate an API key or long-lived token from your FHIR server admin. For SMART on FHIR: register a backend service client and obtain client_id and client_secret.' },
        { step: 3, title: 'Enter credentials', instructions: 'Enter the FHIR server base URL and your authentication credentials below. Use either Bearer token OR OAuth client credentials.' },
        { step: 4, title: 'Test connection', instructions: 'Click "Test Connection". The connector will query the server\'s /metadata endpoint to verify connectivity and supported resource types.' },
      ],
      troubleshooting: [
        'Error "CapabilityStatement not found": The base URL may be incorrect. Ensure it points to the FHIR R4 endpoint, not the root server URL.',
        'Error "401 Unauthorized": Your token may have expired. SMART on FHIR tokens typically expire in 5 minutes — the connector handles auto-refresh if OAuth credentials are provided.',
        'If searching returns no results, verify you have read access to the target resource types (Patient, ResearchStudy, etc.).',
        'For Epic servers, ensure the backend service app is approved in your Epic App Market.',
      ],
    },
  },
  {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    type: 'api',
    category: 'dms',
    description: 'Connect to Microsoft OneDrive (personal or business) via Microsoft Graph API. Search, browse, and retrieve documents from any OneDrive account.',
    requiredTier: 'professional',
    requiresCredentials: true,
    documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/resources/onedrive',
    icon: 'cloud',
    setupGuide: {
      overview: 'Connect to OneDrive for Business or personal OneDrive accounts to search and retrieve documents via Microsoft Graph API.',
      prerequisites: [
        'Microsoft 365 account or personal Microsoft account',
        'Azure AD app registration with Microsoft Graph API permissions',
        'Admin consent for Files.Read.All permission',
      ],
      credentialFields: [
        { field: 'clientId', label: 'Azure AD Application (Client) ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', secret: false },
        { field: 'clientSecret', label: 'Client Secret', placeholder: 'Your Azure AD app client secret', secret: true },
        { field: 'baseUrl', label: 'Tenant ID', placeholder: 'Your Azure AD tenant ID', secret: false },
        { field: 'username', label: 'Target User ID (optional)', placeholder: 'User ID to access a specific user\'s drive', secret: false },
      ],
      steps: [
        { step: 1, title: 'Register an Azure AD application', instructions: 'Go to Azure Portal > Azure Active Directory > App registrations > New registration. Name it "ClinicalSageAI OneDrive Connector".' },
        { step: 2, title: 'Configure API permissions', instructions: 'Add Microsoft Graph > Application permissions: Files.Read.All. Grant admin consent.' },
        { step: 3, title: 'Create a client secret', instructions: 'Go to Certificates & Secrets > New client secret. Copy the value immediately.' },
        { step: 4, title: 'Enter credentials', instructions: 'Enter the Application (Client) ID, client secret, and tenant ID.' },
      ],
      troubleshooting: [
        'Error "AADSTS700016": The Client ID is incorrect.',
        'Error "Access denied": Admin consent has not been granted for Files.Read.All.',
        'To access a specific user\'s drive, set the Target User ID to that user\'s Azure AD object ID.',
        'For personal Microsoft accounts, use the common tenant endpoint.',
      ],
    },
  },
  {
    id: 'google_drive',
    name: 'Google Drive',
    type: 'api',
    category: 'dms',
    description: 'Connect to Google Drive via Drive API v3. Search and retrieve documents, spreadsheets, and files. Supports service account authentication with domain-wide delegation.',
    requiredTier: 'professional',
    requiresCredentials: true,
    documentationUrl: 'https://developers.google.com/drive/api/v3/about-sdk',
    icon: 'hard-drive',
    setupGuide: {
      overview: 'Connect to Google Drive using a service account to search and retrieve documents, spreadsheets, and other files from your organization\'s Google Workspace.',
      prerequisites: [
        'Google Cloud project with Drive API enabled',
        'Service account with domain-wide delegation (for Google Workspace)',
        'Service account key file (JSON)',
      ],
      credentialFields: [
        { field: 'clientId', label: 'Service Account Email', placeholder: 'myservice@project-id.iam.gserviceaccount.com', secret: false },
        { field: 'clientSecret', label: 'Private Key (from JSON key file)', placeholder: '-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----', secret: true },
        { field: 'username', label: 'Impersonate User (optional)', placeholder: 'user@yourdomain.com (for domain-wide delegation)', secret: false },
      ],
      steps: [
        { step: 1, title: 'Enable Drive API', instructions: 'Go to Google Cloud Console > APIs & Services > Library. Search for "Google Drive API" and click Enable.' },
        { step: 2, title: 'Create a service account', instructions: 'Go to IAM & Admin > Service Accounts > Create Service Account. Name it "ClinicalSageAI Connector". No special roles needed.' },
        { step: 3, title: 'Generate a key', instructions: 'Click the service account > Keys > Add Key > Create New Key > JSON. Download the key file.' },
        { step: 4, title: 'Enable domain-wide delegation', instructions: 'In the service account details, check "Enable Google Workspace domain-wide delegation". In your Google Workspace Admin Console, go to Security > API controls > Manage domain-wide delegation. Add the service account client ID with scope: https://www.googleapis.com/auth/drive.readonly' },
        { step: 5, title: 'Enter credentials', instructions: 'From the downloaded JSON key file, enter the client_email as "Service Account Email" and the private_key as "Private Key". To access a specific user\'s Drive, set the Impersonate User email.' },
      ],
      troubleshooting: [
        'Error "JWT signature error": The private key may be corrupted. Re-download the key file and paste the complete key including BEGIN/END markers.',
        'Error "unauthorized_client": Domain-wide delegation is not configured. Follow step 4 to add the service account in Google Workspace Admin.',
        'Error "access_denied": The service account does not have the drive.readonly scope. Update the domain-wide delegation settings.',
        'If impersonating a user, that user must exist in the Google Workspace domain.',
      ],
    },
  },
];
