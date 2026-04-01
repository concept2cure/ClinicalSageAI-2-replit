import crypto from 'crypto';

export interface CmcSourceObject {
  id: string;
  sourceType: string;
  sourcePayload: Record<string, any>;
  sourceHash: string;
}

export interface CompiledSection {
  sectionKey: string;
  sectionPath: string;
  deterministicJson: Record<string, any>;
  compiledHash: string;
  stale: boolean;
  staleReason: string | null;
  lineage: Array<{ sourceObjectId: string; sourceHashAtCompile: string }>;
}

const SECTION_MAP: Record<string, string[]> = {
  '3.2.S.1': ['drug_substance'],
  '3.2.S.4': ['specification', 'method'],
  '3.2.S.7': ['stability'],
  '3.2.P.3': ['drug_product', 'batch', 'change_control'],
  '3.2.P.5': ['specification', 'method'],
  '3.2.P.8': ['stability', 'comparability'],
};

function canonicalize(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(canonicalize);
  }
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize(obj[key]);
        return acc;
      }, {});
  }
  return input;
}

function stableHash(input: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(input))).digest('hex');
}

export function createSourceHash(sourcePayload: Record<string, any>): string {
  return stableHash(sourcePayload);
}

export function compileModule3Sections(sourceObjects: CmcSourceObject[]): CompiledSection[] {
  return Object.entries(SECTION_MAP).map(([sectionKey, sourceTypes]) => {
    const matched = sourceObjects.filter((s) => sourceTypes.includes(s.sourceType));
    const deterministicJson = {
      sectionKey,
      sourceTypes,
      objects: matched.map((m) => ({ type: m.sourceType, payload: m.sourcePayload })),
    };

    const lineage = matched.map((m) => ({
      sourceObjectId: m.id,
      sourceHashAtCompile: m.sourceHash,
    }));

    return {
      sectionKey,
      sectionPath: sectionKey,
      deterministicJson,
      compiledHash: stableHash(deterministicJson),
      stale: false,
      staleReason: null,
      lineage,
    };
  });
}

export function summarizeSectionDiff(previous: Record<string, any> | null, next: Record<string, any>) {
  if (!previous) {
    return { addedTopLevelKeys: Object.keys(next), removedTopLevelKeys: [], changedTopLevelKeys: [] };
  }
  const prevKeys = new Set(Object.keys(previous));
  const nextKeys = new Set(Object.keys(next));
  const addedTopLevelKeys = [...nextKeys].filter((k) => !prevKeys.has(k));
  const removedTopLevelKeys = [...prevKeys].filter((k) => !nextKeys.has(k));
  const changedTopLevelKeys = [...nextKeys].filter(
    (k) => prevKeys.has(k) && JSON.stringify(previous[k]) !== JSON.stringify(next[k])
  );
  return { addedTopLevelKeys, removedTopLevelKeys, changedTopLevelKeys };
}

export function markStaleSections(
  sections: CompiledSection[],
  changedSourceType: string,
  reason: string
): CompiledSection[] {
  return sections.map((section) => {
    const impacted = (section.deterministicJson.sourceTypes || []).includes(changedSourceType);
    return impacted ? { ...section, stale: true, staleReason: reason } : section;
  });
}

export function canFinalizeExport(input: { approvalState: string; contradictions: Array<{ severity: string; status: string }> }): boolean {
  if (input.approvalState !== 'approved') return false;
  return !input.contradictions.some((c) => c.status !== 'resolved' && c.severity === 'critical');
}
