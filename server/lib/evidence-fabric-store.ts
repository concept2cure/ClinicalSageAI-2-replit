import { sha256Hex, stableStringify, type EvidenceResolveResult } from './evidence-fabric';

export type EvidenceSourceRecord = {
  tenantId: string;
  key: string;
  value: unknown;
  hash: string;
  updatedAt: string; // ISO
  provenance?: Record<string, unknown>;
};

type TenantStore = Map<string, EvidenceSourceRecord>; // key -> record

const storeByTenant: Map<string, TenantStore> = new Map();

function getTenantStore(tenantId: string): TenantStore {
  const key = String(tenantId || '');
  let t = storeByTenant.get(key);
  if (!t) {
    t = new Map();
    storeByTenant.set(key, t);
  }
  return t;
}

export function upsertEvidenceSource(params: {
  tenantId: string;
  key: string;
  value: unknown;
  provenance?: Record<string, unknown>;
}): EvidenceSourceRecord {
  const tenantId = String(params.tenantId || '');
  const key = String(params.key || '').trim();

  const canonical = stableStringify({ key, value: params.value, provenance: params.provenance || {} });
  const hash = sha256Hex(canonical);
  const record: EvidenceSourceRecord = {
    tenantId,
    key,
    value: params.value,
    hash,
    updatedAt: new Date().toISOString(),
    provenance: params.provenance,
  };

  getTenantStore(tenantId).set(key, record);
  return record;
}

export function getEvidenceSource(tenantId: string, key: string): EvidenceSourceRecord | undefined {
  return getTenantStore(String(tenantId || '')).get(String(key || '').trim());
}

function getPath(value: unknown, pathSegments: string[]): { ok: true; value: unknown } | { ok: false } {
  let current: unknown = value;
  for (const seg of pathSegments) {
    if (current === null || current === undefined) return { ok: false };
    if (typeof current !== 'object') return { ok: false };
    const obj = current as Record<string, unknown>;
    if (!(seg in obj)) return { ok: false };
    current = obj[seg];
  }
  return { ok: true, value: current };
}

export function resolveEvidenceTag(tenantId: string, tagKey: string): EvidenceResolveResult {
  const tenant = String(tenantId || '');
  const key = String(tagKey || '').trim();

  const direct = getEvidenceSource(tenant, key);
  if (direct) {
    return {
      ok: true,
      tagKey: key,
      sourceKey: direct.key,
      value: direct.value,
      hash: direct.hash,
      updatedAt: direct.updatedAt,
      provenance: direct.provenance,
    };
  }

  // Nested path resolution: foo.bar.baz can resolve from source "foo" with value {bar:{baz:...}}
  const parts = key.split('.').filter(Boolean);
  if (parts.length >= 2) {
    const rootKey = parts[0];
    const root = getEvidenceSource(tenant, rootKey);
    if (!root) return { ok: false, tagKey: key, reason: 'MISSING_SOURCE' };

    const path = parts.slice(1);
    const atPath = getPath(root.value, path);
    if (!atPath.ok) return { ok: false, tagKey: key, reason: 'MISSING_PATH' };

    return {
      ok: true,
      tagKey: key,
      sourceKey: root.key,
      value: atPath.value,
      hash: root.hash,
      updatedAt: root.updatedAt,
      provenance: root.provenance,
    };
  }

  return { ok: false, tagKey: key, reason: 'MISSING_SOURCE' };
}

export function listEvidenceSources(tenantId: string): EvidenceSourceRecord[] {
  return Array.from(getTenantStore(String(tenantId || '')).values());
}
