/**
 * @fileoverview FHIR R4 Server Connector
 * Connects to FHIR R4-compliant servers for clinical and regulatory data.
 * Supports Patient, MedicinalProductDefinition, ResearchStudy,
 * DocumentReference, and Observation resource types.
 * Authentication via Bearer token or SMART on FHIR OAuth2 client credentials.
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type FHIRResourceType =
  | 'Patient'
  | 'MedicinalProductDefinition'
  | 'ResearchStudy'
  | 'DocumentReference'
  | 'Observation';

interface FHIRBundle {
  resourceType: 'Bundle';
  total?: number;
  entry?: FHIRBundleEntry[];
  link?: { relation: string; url: string }[];
}

interface FHIRBundleEntry {
  fullUrl?: string;
  resource: FHIRResource;
}

interface FHIRResource {
  resourceType: string;
  id?: string;
  meta?: { lastUpdated?: string; versionId?: string };
  [key: string]: unknown;
}

interface FHIRCapabilityStatement {
  resourceType: 'CapabilityStatement';
  fhirVersion?: string;
  status?: string;
  software?: { name?: string; version?: string };
  rest?: { mode?: string; resource?: { type: string }[] }[];
}

interface SMARTTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTOR
// ═══════════════════════════════════════════════════════════════════════════════

export class FHIRR4Connector implements DataConnector {
  id = 'fhir-r4' as const;
  name = 'FHIR R4 Server';
  type = 'api' as const;
  requiresCredentials = true;
  requiredTier = 'professional';

  private baseUrl = '';
  private accessToken = '';
  private tokenExpiresAt = 0;
  private clientId = '';
  private clientSecret = '';
  private tokenEndpoint = '';

  private static readonly SUPPORTED_RESOURCES: FHIRResourceType[] = [
    'Patient',
    'MedicinalProductDefinition',
    'ResearchStudy',
    'DocumentReference',
    'Observation',
  ];

  private static readonly DEFAULT_TIMEOUT_MS = 15_000;

  // ─────────────────────────────────────────────────────────────────────────
  // DataConnector interface
  // ─────────────────────────────────────────────────────────────────────────

  async status(): Promise<ConnectorHealth> {
    if (!this.baseUrl) {
      return {
        status: 'unavailable',
        lastChecked: new Date(),
        message: 'Not configured — provide FHIR server base URL and credentials',
      };
    }

    try {
      const start = Date.now();
      const headers = await this.buildHeaders();
      const res = await this.fetchWithTimeout(`${this.baseUrl}/metadata`, {
        headers: { ...headers, Accept: 'application/fhir+json' },
      });

      if (!res.ok) {
        return {
          status: 'degraded',
          latencyMs: Date.now() - start,
          lastChecked: new Date(),
          message: `FHIR /metadata returned ${res.status}`,
        };
      }

      const capability: FHIRCapabilityStatement = await res.json();
      const fhirVersion = capability.fhirVersion || 'unknown';
      const serverName = capability.software?.name || 'FHIR Server';

      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
        message: `${serverName} (FHIR ${fhirVersion})`,
      };
    } catch (err) {
      return {
        status: 'unavailable',
        lastChecked: new Date(),
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    if (!this.baseUrl) return [];

    const limit = query.limit || 20;
    const results: ConnectorResult[] = [];

    // Determine which resource types to search based on query parameters
    const resourceTypes = this.resolveResourceTypes(query);

    const searchPromises = resourceTypes.map(async (resourceType) => {
      try {
        const params = this.buildSearchParams(resourceType, query, limit);
        const headers = await this.buildHeaders();
        const url = `${this.baseUrl}/${resourceType}?${params}`;

        const res = await this.fetchWithTimeout(url, {
          headers: { ...headers, Accept: 'application/fhir+json' },
        });

        if (!res.ok) return [];

        const bundle: FHIRBundle = await res.json();
        return (bundle.entry || []).map((entry, i) =>
          this.mapToConnectorResult(entry.resource, resourceType, i)
        );
      } catch {
        // Graceful degradation: if one resource type fails, continue with others
        return [];
      }
    });

    const allResults = await Promise.all(searchPromises);
    for (const batch of allResults) {
      results.push(...batch);
    }

    // Sort by relevance and cap at limit
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return results.slice(0, limit);
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    if (!this.baseUrl) {
      throw new Error('FHIR connector not configured — call authenticate() first');
    }

    // resourceId format: "ResourceType/id" (e.g. "Patient/123") or prefixed "fhir:ResourceType/id"
    const cleanId = resourceId.replace(/^fhir:/, '');
    const headers = await this.buildHeaders();
    const res = await this.fetchWithTimeout(`${this.baseUrl}/${cleanId}`, {
      headers: { ...headers, Accept: 'application/fhir+json' },
    });

    if (!res.ok) {
      throw new Error(`FHIR resource ${cleanId} not found (${res.status})`);
    }

    const resource: FHIRResource = await res.json();

    return {
      id: `fhir:${cleanId}`,
      sourceConnector: this.id,
      title: this.extractTitle(resource) || cleanId,
      type: resource.resourceType,
      content: JSON.stringify(resource, null, 2),
      metadata: {
        resourceType: resource.resourceType,
        fhirId: resource.id,
        lastUpdated: resource.meta?.lastUpdated,
        versionId: resource.meta?.versionId,
      },
      url: `${this.baseUrl}/${cleanId}`,
      retrievedAt: new Date(),
    };
  }

  async authenticate(credentials: ConnectorCredentials): Promise<void> {
    if (!credentials.baseUrl) {
      throw new Error('FHIR server base URL is required');
    }

    this.baseUrl = credentials.baseUrl.replace(/\/$/, '');

    // Bearer token authentication (simplest path)
    if (credentials.apiKey) {
      this.accessToken = credentials.apiKey;
      this.tokenExpiresAt = Date.now() + 24 * 60 * 60 * 1000; // Assume 24h validity
      this.clientId = '';
      this.clientSecret = '';
      this.tokenEndpoint = '';
      return;
    }

    // SMART on FHIR OAuth2 client credentials flow
    if (credentials.clientId && credentials.clientSecret) {
      this.clientId = credentials.clientId;
      this.clientSecret = credentials.clientSecret;

      // Discover token endpoint from SMART configuration or use provided custom header
      this.tokenEndpoint =
        credentials.customHeaders?.['tokenEndpoint'] || '';

      if (!this.tokenEndpoint) {
        this.tokenEndpoint = await this.discoverTokenEndpoint();
      }

      if (!this.tokenEndpoint) {
        throw new Error(
          'Could not discover SMART token endpoint. Provide it via customHeaders.tokenEndpoint'
        );
      }

      await this.refreshAccessToken();
      return;
    }

    throw new Error(
      'FHIR R4 connector requires either an API key (Bearer token) or OAuth2 client credentials (clientId + clientSecret)'
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SMART on FHIR OAuth2
  // ─────────────────────────────────────────────────────────────────────────

  private async discoverTokenEndpoint(): Promise<string> {
    // Try .well-known/smart-configuration first (SMART App Launch Framework)
    try {
      const res = await this.fetchWithTimeout(
        `${this.baseUrl}/.well-known/smart-configuration`,
        { headers: { Accept: 'application/json' } }
      );
      if (res.ok) {
        const config = await res.json();
        if (config.token_endpoint) return config.token_endpoint as string;
      }
    } catch {
      // Fall through to CapabilityStatement discovery
    }

    // Fallback: parse CapabilityStatement security extensions
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/metadata`, {
        headers: { Accept: 'application/fhir+json' },
      });
      if (res.ok) {
        const capability: FHIRCapabilityStatement = await res.json();
        const restSecurity = (capability.rest?.[0] as Record<string, unknown>)?.security as
          | { extension?: { url: string; extension?: { url: string; valueUri?: string }[] }[] }
          | undefined;

        const oauthExt = restSecurity?.extension?.find(
          (ext) => ext.url === 'http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris'
        );
        const tokenExt = oauthExt?.extension?.find((ext) => ext.url === 'token');
        if (tokenExt?.valueUri) return tokenExt.valueUri;
      }
    } catch {
      // Discovery failed
    }

    return '';
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.tokenEndpoint || !this.clientId || !this.clientSecret) {
      throw new Error('OAuth2 configuration incomplete');
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'system/*.read',
    });

    const res = await this.fetchWithTimeout(this.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(
        `SMART OAuth2 token request failed (${res.status}): ${errorText}`
      );
    }

    const token: SMARTTokenResponse = await res.json();
    this.accessToken = token.access_token;
    // Refresh 60 seconds before actual expiry
    this.tokenExpiresAt = Date.now() + (token.expires_in - 60) * 1000;
  }

  private async ensureValidToken(): Promise<void> {
    if (this.clientId && this.clientSecret && Date.now() >= this.tokenExpiresAt) {
      await this.refreshAccessToken();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Search helpers
  // ─────────────────────────────────────────────────────────────────────────

  private resolveResourceTypes(query: ConnectorQuery): FHIRResourceType[] {
    // If keywords mention specific resource types, target those
    const keywordsLower = (query.keywords || []).map((k) => k.toLowerCase());
    const matched: FHIRResourceType[] = [];

    for (const rt of FHIRR4Connector.SUPPORTED_RESOURCES) {
      if (keywordsLower.some((k) => k === rt.toLowerCase())) {
        matched.push(rt);
      }
    }

    if (matched.length > 0) return matched;

    // Heuristic: choose resource types based on query shape
    const types: FHIRResourceType[] = [];

    if (query.indication || query.intervention || query.phase || query.sponsor) {
      types.push('ResearchStudy');
    }
    if (query.intervention || query.therapeuticArea) {
      types.push('MedicinalProductDefinition');
    }
    if (query.keywords?.length) {
      types.push('DocumentReference', 'Observation');
    }

    // Default to ResearchStudy + DocumentReference for generic queries
    return types.length > 0 ? types : ['ResearchStudy', 'DocumentReference'];
  }

  private buildSearchParams(
    resourceType: FHIRResourceType,
    query: ConnectorQuery,
    limit: number
  ): URLSearchParams {
    const params = new URLSearchParams();
    params.set('_count', String(limit));
    params.set('_format', 'json');

    switch (resourceType) {
      case 'ResearchStudy':
        if (query.indication) params.set('condition', query.indication);
        if (query.intervention) params.set('focus', query.intervention);
        if (query.phase) params.set('phase', this.mapPhaseToFHIR(query.phase));
        if (query.sponsor) params.set('sponsor', query.sponsor);
        if (query.keywords?.length) params.set('title:contains', query.keywords.join(' '));
        if (query.dateRange?.from) params.set('date', `ge${query.dateRange.from}`);
        if (query.dateRange?.to) params.append('date', `le${query.dateRange.to}`);
        break;

      case 'MedicinalProductDefinition':
        if (query.intervention) params.set('name', query.intervention);
        if (query.therapeuticArea) params.set('type', query.therapeuticArea);
        if (query.keywords?.length) params.set('name:contains', query.keywords.join(' '));
        break;

      case 'Patient':
        if (query.keywords?.length) params.set('name', query.keywords.join(' '));
        break;

      case 'DocumentReference':
        if (query.keywords?.length) params.set('description:contains', query.keywords.join(' '));
        if (query.indication) params.set('subject:Patient.condition', query.indication);
        if (query.dateRange?.from) params.set('date', `ge${query.dateRange.from}`);
        if (query.dateRange?.to) params.append('date', `le${query.dateRange.to}`);
        break;

      case 'Observation':
        if (query.indication) params.set('code:text', query.indication);
        if (query.keywords?.length) params.set('code:text', query.keywords.join(' '));
        if (query.dateRange?.from) params.set('date', `ge${query.dateRange.from}`);
        if (query.dateRange?.to) params.append('date', `le${query.dateRange.to}`);
        break;
    }

    return params;
  }

  private mapPhaseToFHIR(phase: string): string {
    const normalized = phase.toUpperCase().replace(/\s+/g, '');
    const phaseMap: Record<string, string> = {
      '1': 'phase-1',
      '2': 'phase-2',
      '3': 'phase-3',
      '4': 'phase-4',
      I: 'phase-1',
      II: 'phase-2',
      III: 'phase-3',
      IV: 'phase-4',
      PHASE1: 'phase-1',
      PHASE2: 'phase-2',
      PHASE3: 'phase-3',
      PHASE4: 'phase-4',
    };
    return phaseMap[normalized] || phase;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Result mapping
  // ─────────────────────────────────────────────────────────────────────────

  private mapToConnectorResult(
    resource: FHIRResource,
    resourceType: FHIRResourceType,
    index: number
  ): ConnectorResult {
    const fhirId = resource.id || `unknown-${index}`;
    const id = `fhir:${resourceType}/${fhirId}`;
    const title = this.extractTitle(resource) || `${resourceType}/${fhirId}`;
    const summary = this.extractSummary(resource, resourceType);

    return {
      id,
      sourceConnector: this.id,
      title,
      summary,
      relevanceScore: Math.max(0.1, 1 - index * 0.04),
      metadata: {
        resourceType,
        fhirId,
        lastUpdated: resource.meta?.lastUpdated,
      },
      url: `${this.baseUrl}/${resourceType}/${fhirId}`,
    };
  }

  private extractTitle(resource: FHIRResource): string {
    const rt = resource.resourceType;

    if (rt === 'ResearchStudy') {
      return (resource.title as string) || '';
    }

    if (rt === 'MedicinalProductDefinition') {
      const names = resource.name as { productName?: string }[] | undefined;
      return names?.[0]?.productName || '';
    }

    if (rt === 'Patient') {
      const name = (resource.name as { text?: string; given?: string[]; family?: string }[] | undefined)?.[0];
      if (name?.text) return name.text;
      const given = name?.given?.join(' ') || '';
      const family = name?.family || '';
      return `${given} ${family}`.trim();
    }

    if (rt === 'DocumentReference') {
      return (resource.description as string) || '';
    }

    if (rt === 'Observation') {
      const code = resource.code as { text?: string; coding?: { display?: string }[] } | undefined;
      return code?.text || code?.coding?.[0]?.display || '';
    }

    return '';
  }

  private extractSummary(resource: FHIRResource, resourceType: FHIRResourceType): string {
    switch (resourceType) {
      case 'ResearchStudy': {
        const status = (resource.status as string) || '';
        const phase = resource.phase as { text?: string; coding?: { display?: string }[] } | undefined;
        const phaseText = phase?.text || phase?.coding?.[0]?.display || '';
        const conditions = (resource.condition as { text?: string }[] | undefined)
          ?.map((c) => c.text)
          .filter(Boolean)
          .join(', ') || '';
        return `${conditions} | Phase: ${phaseText} | Status: ${status}`.replace(/^\s*\|\s*/, '');
      }

      case 'MedicinalProductDefinition': {
        const status = (resource.status as { coding?: { display?: string }[] })?.coding?.[0]?.display || '';
        const type = (resource.type as { text?: string })?.text || '';
        return `${type} | Status: ${status}`.replace(/^\s*\|\s*/, '');
      }

      case 'Patient': {
        const gender = (resource.gender as string) || '';
        const birthDate = (resource.birthDate as string) || '';
        return `Gender: ${gender} | DOB: ${birthDate}`.replace(/^\s*\|\s*/, '');
      }

      case 'DocumentReference': {
        const status = (resource.status as string) || '';
        const type = (resource.type as { text?: string; coding?: { display?: string }[] })?.text ||
          (resource.type as { coding?: { display?: string }[] })?.coding?.[0]?.display || '';
        const date = (resource.date as string) || '';
        return `${type} | Status: ${status} | Date: ${date}`.replace(/^\s*\|\s*/, '');
      }

      case 'Observation': {
        const status = (resource.status as string) || '';
        const effectiveDateTime = (resource.effectiveDateTime as string) || '';
        const valueQuantity = resource.valueQuantity as { value?: number; unit?: string } | undefined;
        const value = valueQuantity ? `${valueQuantity.value} ${valueQuantity.unit || ''}`.trim() : '';
        return `${value} | Status: ${status} | Date: ${effectiveDateTime}`.replace(/^\s*\|\s*/, '');
      }

      default:
        return resource.resourceType;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────

  private async buildHeaders(): Promise<Record<string, string>> {
    await this.ensureValidToken();
    const headers: Record<string, string> = {
      Accept: 'application/fhir+json',
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  private async fetchWithTimeout(
    url: string,
    init?: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      FHIRR4Connector.DEFAULT_TIMEOUT_MS
    );

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
