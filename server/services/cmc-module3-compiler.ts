import crypto from 'crypto';

/*
 * 2026-11-09 (R1 S29, founder-approved): the second Module 3 compile path that
 * lived here (`compileModule3Sections`, `markStaleSections` and their
 * `SECTION_MAP`) is retired. Only tests used it, and its source-to-section map
 * disagreed with the composer the product runs. Module 3 is compiled by
 * POST /api/cmc/module3-os/compile/:projectId → `composeProjectModule3`
 * (services/cmc/module3-compile.ts) → `composeModule3FromCanonicalSources`
 * (services/module3Composer.ts); staleness is `impactedSectionsForSourceType`
 * and services/cmc/section-drift.ts. The hash, diff and finalize helpers below
 * are live.
 */

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

export function canFinalizeExport(input: { approvalState: string; contradictions: Array<{ severity: string; status: string }> }): boolean {
  if (input.approvalState !== 'approved') return false;
  return !input.contradictions.some((c) => c.status !== 'resolved' && c.severity === 'critical');
}
