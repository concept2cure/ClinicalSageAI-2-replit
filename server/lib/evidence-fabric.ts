import crypto from 'crypto';

export type EvidenceTagKey = string;

export type EvidenceFabricManifest = {
  version: 'v1';
  createdAt: string; // ISO
  sources: Record<string, { hash: string; updatedAt?: string; provenance?: Record<string, unknown> }>;
  bindings: Record<EvidenceTagKey, { sourceKey: string; hash: string }>; // tagKey -> source used
};

const TAG_RE = /\{\{\s*([a-zA-Z0-9_.:-]{1,200})\s*\}\}/g;

export function extractEvidenceTags(text: string): EvidenceTagKey[] {
  const found = new Set<string>();
  const input = typeof text === 'string' ? text : '';
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(input)) !== null) {
    if (match[1]) found.add(match[1]);
  }
  return Array.from(found);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

export function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  // Fallback for Dates, Maps, etc.
  return JSON.stringify(value);
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export type EvidenceResolveResult =
  | { ok: true; tagKey: EvidenceTagKey; sourceKey: string; value: unknown; hash: string; updatedAt?: string; provenance?: Record<string, unknown> }
  | { ok: false; tagKey: EvidenceTagKey; reason: 'MISSING_SOURCE' | 'MISSING_PATH' };

export type EvidenceResolver = (tagKey: EvidenceTagKey) => EvidenceResolveResult;

export function renderEvidenceTags(text: string, resolver: EvidenceResolver): {
  rendered: string;
  tags: EvidenceTagKey[];
  resolved: EvidenceResolveResult[];
  manifest: EvidenceFabricManifest;
} {
  const tags = extractEvidenceTags(text);
  const resolved: EvidenceResolveResult[] = tags.map((t) => resolver(t));

  const sources: EvidenceFabricManifest['sources'] = {};
  const bindings: EvidenceFabricManifest['bindings'] = {};

  for (const r of resolved) {
    if (!r.ok) continue;
    sources[r.sourceKey] = {
      hash: r.hash,
      updatedAt: r.updatedAt,
      provenance: r.provenance,
    };
    bindings[r.tagKey] = { sourceKey: r.sourceKey, hash: r.hash };
  }

  const manifest: EvidenceFabricManifest = {
    version: 'v1',
    createdAt: new Date().toISOString(),
    sources,
    bindings,
  };

  const rendered = (typeof text === 'string' ? text : '').replace(TAG_RE, (_full, rawKey) => {
    const key = String(rawKey || '');
    const r = resolver(key);
    if (!r.ok) return `{{${key}}}`;
    if (typeof r.value === 'string') return r.value;
    if (typeof r.value === 'number' || typeof r.value === 'boolean') return String(r.value);
    if (r.value === null || r.value === undefined) return '';
    return stableStringify(r.value);
  });

  return { rendered, tags, resolved, manifest };
}

export function isManifestStale(previous: EvidenceFabricManifest | undefined, current: EvidenceFabricManifest): {
  stale: boolean;
  reason: string;
  changedSources: string[];
  newBindings: EvidenceTagKey[];
} {
  if (!previous) {
    return { stale: true, reason: 'NO_PREVIOUS_MANIFEST', changedSources: [], newBindings: Object.keys(current.bindings) };
  }

  const changedSources: string[] = [];
  for (const [sourceKey, s] of Object.entries(current.sources)) {
    const prev = previous.sources?.[sourceKey];
    if (!prev) {
      changedSources.push(sourceKey);
      continue;
    }
    if (prev.hash !== s.hash) changedSources.push(sourceKey);
  }

  const newBindings: EvidenceTagKey[] = [];
  for (const tagKey of Object.keys(current.bindings)) {
    if (!previous.bindings?.[tagKey]) newBindings.push(tagKey);
  }

  const stale = changedSources.length > 0 || newBindings.length > 0;
  const reason = stale
    ? changedSources.length > 0
      ? 'SOURCE_HASH_CHANGED'
      : 'NEW_TAG_BINDINGS'
    : 'FRESH';

  return { stale, reason, changedSources, newBindings };
}
