const apiBase = '';

const getOrgId = () =>
  localStorage.getItem('currentOrganizationId') ||
  localStorage.getItem('organizationId') ||
  '';

const buildUrl = (path, params = {}) => {
  const url = new URL(`${apiBase}${path}`, window.location.origin);
  const orgId = getOrgId();
  if (orgId) url.searchParams.set('orgId', orgId);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};

export async function listEvidence(programId, params = {}) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/evidence`, params);
  const res = await fetch(url, { credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to fetch evidence');
  return payload;
}

export async function uploadEvidence(programId, file, { folderPath = 'evidence', tags = '', evidenceType = 'EVIDENCE' } = {}) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/evidence`);
  const form = new FormData();
  form.append('file', file);
  form.append('folderPath', folderPath);
  form.append('tags', tags);
  form.append('evidenceType', evidenceType);

  const headers = {};
  const orgId = getOrgId();
  if (orgId) headers['x-organization-id'] = orgId;

  const res = await fetch(url, {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers,
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to upload evidence');
  return payload;
}

export async function patchEvidence(programId, evidenceId, patch) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/evidence/${evidenceId}`);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to update evidence');
  return payload;
}

export async function deleteEvidence(programId, evidenceId) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/evidence/${evidenceId}`);
  const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to delete evidence');
  return payload;
}

export async function listAudit(programId, options = {}) {
  const { limit, cursor, type, entityType } = options;
  const params = {};
  if (limit) params.limit = limit;
  if (cursor) params.cursor = cursor;
  if (type) params.type = type;
  if (entityType) params.entityType = entityType;
  
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/audit`, params);
  const res = await fetch(url, { credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to load audit events');
  return payload;
}

export async function getReadiness(programId) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/readiness`);
  const res = await fetch(url, { credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to load readiness');
  return payload;
}

export async function listSubmissionPackages(programId) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/packages`);
  const res = await fetch(url, { credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to load submission packages');
  return payload;
}

export async function getCoverage(programId) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/coverage`);
  const res = await fetch(url, { credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to load coverage');
  return payload;
}

export async function listClaims(programId) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/claims`);
  const res = await fetch(url, { credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to load claims');
  return payload;
}

export async function createClaim(programId, data) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/claims`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to create claim');
  return payload;
}

export async function updateClaim(programId, claimId, data) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/claims/${claimId}`);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to update claim');
  return payload;
}

export async function deleteClaim(programId, claimId) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/claims/${claimId}`);
  const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to delete claim');
  return payload;
}

export async function listStandards(programId) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/standards`);
  const res = await fetch(url, { credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to load standards');
  return payload;
}

export async function createStandardRequirement(programId, data) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/standards`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to create requirement');
  return payload;
}

export async function updateStandardRequirement(programId, standardId, requirementId, data) {
  const url = buildUrl(
    `/api/cerv2-workbench/programs/${programId}/standards/${standardId}/requirements/${requirementId}`
  );
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to update requirement');
  return payload;
}

export async function deleteStandardRequirement(programId, standardId, requirementId) {
  const url = buildUrl(
    `/api/cerv2-workbench/programs/${programId}/standards/${standardId}/requirements/${requirementId}`
  );
  const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to delete requirement');
  return payload;
}

export async function listOutcomes(programId) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/outcomes`);
  const res = await fetch(url, { credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to load outcomes');
  return payload;
}

export async function createOutcome(programId, data) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/outcomes`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to create outcome');
  return payload;
}

export async function updateOutcome(programId, outcomeId, data) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/outcomes/${outcomeId}`);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to update outcome');
  return payload;
}

export async function deleteOutcome(programId, outcomeId) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/outcomes/${outcomeId}`);
  const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to delete outcome');
  return payload;
}

export async function linkEvidence(programId, data) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/evidence-links`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to link evidence');
  return payload;
}

export async function unlinkEvidence(programId, data) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/evidence-links`);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to unlink evidence');
  return payload;
}

export async function listEvidenceLinks(programId, params) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/evidence-links`, params);
  const res = await fetch(url, { credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to load evidence links');
  return payload;
}

export async function generateExport(programId, exportType) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/exports/${exportType}`);
  const res = await fetch(url, { method: 'POST', credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to generate export');
  return payload;
}

export function buildDownloadUrl(programId, evidenceId) {
  return buildUrl(`/api/cerv2-workbench/programs/${programId}/evidence/${evidenceId}/download`);
}

export async function bulkLinkEvidence(programId, data) {
  // data: { evidenceIds: string[], entityType: string, entityId: string }
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/evidence-links/bulk`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to bulk link evidence');
  return payload;
}

export async function bulkUnlinkEvidence(programId, data) {
  // data: { evidenceIds: string[], entityType?: string, entityId?: string }
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/evidence-links/bulk`);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to bulk unlink evidence');
  return payload;
}

export async function getExportPreflight(programId) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/exports/preflight`);
  const res = await fetch(url, { credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to get export preflight');
  return payload;
}
export async function updateClaimStatus(programId, claimId, status, notes) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/claims/${claimId}/status`);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status, notes }),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to update claim status');
  return payload;
}

export async function updateStandardStatus(programId, standardId, status, notes) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/standards/${standardId}/status`);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status, notes }),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to update standard status');
  return payload;
}

export async function updateOutcomeStatus(programId, outcomeId, status, notes) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/outcomes/${outcomeId}/status`);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status, notes }),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to update outcome status');
  return payload;
}/**
 * Update claim status with audit trail
 */
export async function patchClaimStatus(programId, claimId, status, notes) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/claims/${claimId}/status`);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status, notes }),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to update claim status');
  return payload;
}

/**
 * Update standard status with audit trail
 */
export async function patchStandardStatus(programId, standardId, status, notes) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/standards/${standardId}/status`);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status, notes }),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to update standard status');
  return payload;
}

/**
 * Update outcome status with audit trail
 */
export async function patchOutcomeStatus(programId, outcomeId, status, notes) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/outcomes/${outcomeId}/status`);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status, notes }),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to update outcome status');
  return payload;
}

/**
 * List audit events with pagination
 */
export async function listAuditPaginated(programId, params = {}) {
  const url = buildUrl(`/api/cerv2-workbench/programs/${programId}/audit`, params);
  const res = await fetch(url, { credentials: 'include' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Failed to load audit events');
  return payload;
}
