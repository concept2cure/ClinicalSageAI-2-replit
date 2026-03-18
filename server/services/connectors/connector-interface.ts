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

export interface ConnectorCatalogEntry {
  id: string;
  name: string;
  type: ConnectorType;
  description: string;
  requiredTier: string;
  requiresCredentials: boolean;
  documentationUrl?: string;
  icon?: string;
}

export const CONNECTOR_CATALOG: ConnectorCatalogEntry[] = [
  {
    id: 'clinical_trials_gov',
    name: 'ClinicalTrials.gov',
    type: 'api',
    description: 'NIH/NLM registry of FDA-regulated clinical studies worldwide. Search trials by condition, intervention, location, sponsor, and status.',
    requiredTier: 'free',
    requiresCredentials: false,
    icon: 'flask',
  },
  {
    id: 'pubmed',
    name: 'PubMed / MEDLINE',
    type: 'api',
    description: 'NCBI literature database with 36M+ biomedical citations. Search publications, systematic reviews, and meta-analyses.',
    requiredTier: 'free',
    requiresCredentials: false,
    icon: 'book',
  },
  {
    id: 'fda_drugs',
    name: 'FDA Drugs@FDA',
    type: 'scraper',
    description: 'FDA approval histories, labeling, review documents, and regulatory actions for approved drug products.',
    requiredTier: 'standard',
    requiresCredentials: false,
    icon: 'pill',
  },
  {
    id: 'ema_epar',
    name: 'EMA European Public Assessment Reports',
    type: 'scraper',
    description: 'European Medicines Agency assessment reports, product information, and procedural documents.',
    requiredTier: 'standard',
    requiresCredentials: false,
    icon: 'flag',
  },
  {
    id: 'pmda_reviews',
    name: 'PMDA Review Reports',
    type: 'scraper',
    description: 'Japanese Pharmaceuticals and Medical Devices Agency review reports and approval information.',
    requiredTier: 'professional',
    requiresCredentials: false,
    icon: 'scroll',
  },
  {
    id: 'nmpa_cde',
    name: 'NMPA / CDE Approvals',
    type: 'scraper',
    description: 'China National Medical Products Administration and Center for Drug Evaluation approval data.',
    requiredTier: 'professional',
    requiresCredentials: false,
    icon: 'scroll',
  },
  {
    id: 'veeva_vault',
    name: 'Veeva Vault',
    type: 'api',
    description: 'Connect to your Veeva Vault instance for document management, study data, and regulatory information management.',
    requiredTier: 'professional',
    requiresCredentials: true,
    documentationUrl: 'https://developer.veevavault.com/api/24.1/',
    icon: 'database',
  },
  {
    id: 'medidata_rave',
    name: 'Medidata Rave',
    type: 'api',
    description: 'Connect to Medidata Rave for electronic data capture, study data, and clinical trial management.',
    requiredTier: 'professional',
    requiresCredentials: true,
    documentationUrl: 'https://learn.medidata.com/en-US/d/rave-web-services',
    icon: 'chart',
  },
];
