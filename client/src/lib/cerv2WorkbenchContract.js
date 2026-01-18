/**
 * CERv2 Workbench API Contract Layer
 * 
 * This is the ONLY place where API URLs are constructed.
 * All components must use this layer - no direct fetch() calls.
 * 
 * Architecture:
 * - apiFetch: centralized fetch wrapper with error handling
 * - routes: URL builders (the only place URLs exist)
 * - typed API functions that return predictable shapes
 */

/**
 * Centralized fetch wrapper with:
 * - Consistent error handling
 * - JSON parsing
 * - Auth headers
 * - Request cancellation support
 */
export async function apiFetch(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
    credentials: 'include',
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/**
 * Route registry - the ONLY place URLs are built
 * 
 * Usage: routes.evidence(programId, orgId) => '/api/cerv2-workbench/programs/123/evidence?orgId=1'
 */
export const routes = {
  // Evidence endpoints
  evidence: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/evidence?orgId=${orgId}`,
  evidenceById: (programId, evidenceId, orgId) => `/api/cerv2-workbench/programs/${programId}/evidence/${evidenceId}?orgId=${orgId}`,
  evidenceUpload: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/evidence?orgId=${orgId}`,
  evidenceDownload: (programId, evidenceId, orgId) => `/api/cerv2-workbench/programs/${programId}/evidence/${evidenceId}/download?orgId=${orgId}`,
  
  // Evidence linking
  evidenceLinks: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/evidence-links?orgId=${orgId}`,
  evidenceLinksBulk: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/evidence-links/bulk?orgId=${orgId}`,
  
  // Claims endpoints
  claims: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/claims?orgId=${orgId}`,
  claimById: (programId, claimId, orgId) => `/api/cerv2-workbench/programs/${programId}/claims/${claimId}?orgId=${orgId}`,
  claimStatus: (programId, claimId, orgId) => `/api/cerv2-workbench/programs/${programId}/claims/${claimId}/status?orgId=${orgId}`,
  
  // Standards endpoints
  standards: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/standards?orgId=${orgId}`,
  standardById: (programId, standardId, orgId) => `/api/cerv2-workbench/programs/${programId}/standards/${standardId}?orgId=${orgId}`,
  standardStatus: (programId, standardId, orgId) => `/api/cerv2-workbench/programs/${programId}/standards/${standardId}/status?orgId=${orgId}`,
  
  // Outcomes endpoints
  outcomes: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/outcomes?orgId=${orgId}`,
  outcomeById: (programId, outcomeId, orgId) => `/api/cerv2-workbench/programs/${programId}/outcomes/${outcomeId}?orgId=${orgId}`,
  outcomeStatus: (programId, outcomeId, orgId) => `/api/cerv2-workbench/programs/${programId}/outcomes/${outcomeId}/status?orgId=${orgId}`,
  
  // Audit endpoints
  audit: (programId, orgId, params = {}) => {
    const queryParams = new URLSearchParams({ orgId, ...params });
    return `/api/cerv2-workbench/programs/${programId}/audit?${queryParams}`;
  },
  
  // Export endpoints
  exports: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/exports?orgId=${orgId}`,
  exportPreflight: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/exports/preflight?orgId=${orgId}`,
  exportClaimsMatrix: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/exports/claims-matrix?orgId=${orgId}`,
  exportStandardsCoverage: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/exports/standards-coverage?orgId=${orgId}`,
  exportOutcomesSubstantiation: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/exports/outcomes-substantiation?orgId=${orgId}`,
  exportDefensePack: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/exports/defense-pack?orgId=${orgId}`,
  exportDownload: (programId, exportId, orgId) => `/api/cerv2-workbench/programs/${programId}/exports/${exportId}/download?orgId=${orgId}`,

  // Workbench summary
  workbenchSummary: (programId, orgId) => `/api/cerv2-workbench/programs/${programId}/summary?orgId=${orgId}`,
};

/**
 * Get organization ID from context (assuming it's in localStorage or context)
 * TODO: Replace with actual auth context
 */
function getOrgId() {
  return (
    localStorage.getItem('currentOrganizationId') ||
    localStorage.getItem('organizationId') ||
    ''
  );
}

/**
 * Evidence API
 */
export const evidenceApi = {
  async list(programId, { limit = 50, cursor, filters = {} } = {}, signal) {
    const orgId = getOrgId();
    const params = new URLSearchParams({ orgId, limit, ...filters });
    if (cursor) params.set('cursor', cursor);
    
    const url = `/api/cerv2-workbench/programs/${programId}/evidence?${params}`;
    return apiFetch(url, { signal });
  },

  async upload(programId, file, signal) {
    const orgId = getOrgId();
    const formData = new FormData();
    formData.append('file', file);
    
    const url = routes.evidenceUpload(programId, orgId);
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      signal,
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Upload failed');
    return data;
  },

  async bulkLink(programId, data, signal) {
    const orgId = getOrgId();
    const url = routes.evidenceLinksBulk(programId, orgId);
    return apiFetch(url, { method: 'POST', body: data, signal });
  },

  async bulkUnlink(programId, data, signal) {
    const orgId = getOrgId();
    const url = routes.evidenceLinksBulk(programId, orgId);
    return apiFetch(url, { method: 'DELETE', body: data, signal });
  },

  async listLinks(programId, { entityType, entityId }, signal) {
    const orgId = getOrgId();
    const params = new URLSearchParams({ orgId, entityType, entityId });
    const url = `/api/cerv2-workbench/programs/${programId}/evidence-links?${params}`;
    return apiFetch(url, { signal });
  },

  async link(programId, data, signal) {
    const orgId = getOrgId();
    const url = routes.evidenceLinks(programId, orgId);
    return apiFetch(url, { method: 'POST', body: data, signal });
  },

  async unlink(programId, data, signal) {
    const orgId = getOrgId();
    const url = routes.evidenceLinks(programId, orgId);
    return apiFetch(url, { method: 'DELETE', body: data, signal });
  },

  async remove(programId, evidenceId, signal) {
    const orgId = getOrgId();
    const url = routes.evidenceById(programId, evidenceId, orgId);
    return apiFetch(url, { method: 'DELETE', signal });
  },

  getDownloadUrl(programId, evidenceId) {
    const orgId = getOrgId();
    return routes.evidenceDownload(programId, evidenceId, orgId);
  },
};

/**
 * Claims API
 */
export const claimsApi = {
  async list(programId, { limit = 50, cursor } = {}, signal) {
    const orgId = getOrgId();
    const params = new URLSearchParams({ orgId, limit });
    if (cursor) params.set('cursor', cursor);
    
    const url = `/api/cerv2-workbench/programs/${programId}/claims?${params}`;
    return apiFetch(url, { signal });
  },

  async updateStatus(programId, claimId, { status, notes }, signal) {
    const orgId = getOrgId();
    const url = routes.claimStatus(programId, claimId, orgId);
    return apiFetch(url, { method: 'PATCH', body: { status, notes }, signal });
  },

  async create(programId, { claimType, claimText, rationale, owner, tags, status }, signal) {
    const orgId = getOrgId();
    const url = routes.claims(programId, orgId);
    return apiFetch(url, {
      method: 'POST',
      body: { claimType, claimText, rationale, owner, tags, status },
      signal,
    });
  },
};

/**
 * Standards API
 */
export const standardsApi = {
  async list(programId, { limit = 50, cursor } = {}, signal) {
    const orgId = getOrgId();
    const params = new URLSearchParams({ orgId, limit });
    if (cursor) params.set('cursor', cursor);
    
    const url = `/api/cerv2-workbench/programs/${programId}/standards?${params}`;
    return apiFetch(url, { signal });
  },

  async updateStatus(programId, standardId, { status, notes }, signal) {
    const orgId = getOrgId();
    const url = routes.standardStatus(programId, standardId, orgId);
    return apiFetch(url, { method: 'PATCH', body: { status, notes }, signal });
  },
};

/**
 * Outcomes API
 */
export const outcomesApi = {
  async list(programId, { limit = 50, cursor } = {}, signal) {
    const orgId = getOrgId();
    const params = new URLSearchParams({ orgId, limit });
    if (cursor) params.set('cursor', cursor);
    
    const url = `/api/cerv2-workbench/programs/${programId}/outcomes?${params}`;
    return apiFetch(url, { signal });
  },

  async updateStatus(programId, outcomeId, { status, notes }, signal) {
    const orgId = getOrgId();
    const url = routes.outcomeStatus(programId, outcomeId, orgId);
    return apiFetch(url, { method: 'PATCH', body: { status, notes }, signal });
  },
};

/**
 * Audit API
 */
export const auditApi = {
  async list(programId, { limit = 50, cursor, type, entityType } = {}, signal) {
    const orgId = getOrgId();
    const params = { limit };
    if (cursor) params.cursor = cursor;
    if (type) params.type = type;
    if (entityType) params.entityType = entityType;
    
    const url = routes.audit(programId, orgId, params);
    return apiFetch(url, { signal });
  },
};

/**
 * Exports API
 */
export const exportsApi = {
  async list(programId, { limit = 50, cursor } = {}, signal) {
    const orgId = getOrgId();
    const params = new URLSearchParams({ orgId, limit });
    if (cursor) params.set('cursor', cursor);
    
    const url = routes.exports(programId, orgId);
    return apiFetch(url, { signal });
  },

  async preflight(programId, signal) {
    const orgId = getOrgId();
    const url = routes.exportPreflight(programId, orgId);
    return apiFetch(url, { signal });
  },

  async generateClaimsMatrix(programId, signal) {
    const orgId = getOrgId();
    const url = routes.exportClaimsMatrix(programId, orgId);
    return apiFetch(url, { method: 'POST', signal });
  },

  async generateStandardsCoverage(programId, signal) {
    const orgId = getOrgId();
    const url = routes.exportStandardsCoverage(programId, orgId);
    return apiFetch(url, { method: 'POST', signal });
  },

  async generateOutcomesSubstantiation(programId, signal) {
    const orgId = getOrgId();
    const url = routes.exportOutcomesSubstantiation(programId, orgId);
    return apiFetch(url, { method: 'POST', signal });
  },

  async generateDefensePack(programId, signal) {
    const orgId = getOrgId();
    const url = routes.exportDefensePack(programId, orgId);
    return apiFetch(url, { method: 'POST', signal });
  },

  getDownloadUrl(programId, exportId) {
    const orgId = getOrgId();
    return routes.exportDownload(programId, exportId, orgId);
  },
};

/**
 * Workbench API
 */
export const workbenchApi = {
  async summary(programId, signal) {
    const orgId = getOrgId();
    const url = routes.workbenchSummary(programId, orgId);
    return apiFetch(url, { signal });
  },
};
