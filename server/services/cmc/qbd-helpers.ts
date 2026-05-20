/**
 * Pure helpers for the QbD analyzer. Lives outside the DB-bound analyzer
 * so unit tests can exercise the extraction + ICH-classification logic
 * without a database. Every function here is a pure deterministic
 * transformation over plain inputs.
 *
 * @module server/services/cmc/qbd-helpers
 */

export interface CppEntry {
  name: string;
  step?: string;
  range?: string;
  impacts?: string[];
}

// ─── Parameter / impurity / characterization extractors ──────────────────────

export function extractParameterNames(params: unknown): string[] {
  if (Array.isArray(params)) {
    return params.flatMap(p => {
      if (typeof p === 'string') return [p];
      if (typeof p === 'object' && p !== null) {
        const obj = p as Record<string, unknown>;
        const candidates = [obj.name, obj.parameter, obj.test, obj.attribute];
        const first = candidates.find(c => typeof c === 'string' && c.length > 0);
        return first ? [String(first)] : [];
      }
      return [];
    });
  }
  if (typeof params === 'object' && params !== null) {
    return Object.keys(params as Record<string, unknown>);
  }
  return [];
}

export function extractImpurityNames(impurities: unknown): string[] {
  if (Array.isArray(impurities)) {
    return impurities.flatMap(i => {
      if (typeof i === 'string') return [i];
      if (typeof i === 'object' && i !== null) {
        const obj = i as Record<string, unknown>;
        const candidates = [obj.name, obj.impurityName, obj.identifier];
        const first = candidates.find(c => typeof c === 'string' && c.length > 0);
        return first ? [String(first)] : [];
      }
      return [];
    });
  }
  if (typeof impurities === 'object' && impurities !== null) {
    return Object.keys(impurities as Record<string, unknown>);
  }
  return [];
}

export function extractCharacterizationAttrs(characterization: unknown): string[] {
  if (typeof characterization !== 'object' || characterization === null) return [];
  return Object.keys(characterization as Record<string, unknown>);
}

export function extractCppEntries(data: unknown): CppEntry[] {
  if (Array.isArray(data)) {
    return data.flatMap(d => {
      if (typeof d === 'string') return [{ name: d }];
      if (typeof d === 'object' && d !== null) {
        const obj = d as Record<string, unknown>;
        const name = String(obj.name ?? obj.parameter ?? obj.cpp ?? '');
        if (!name) return [];
        return [{
          name,
          step: typeof obj.step === 'string' ? obj.step : typeof obj.processStep === 'string' ? obj.processStep : undefined,
          range: typeof obj.range === 'string' ? obj.range : typeof obj.acceptableRange === 'string' ? obj.acceptableRange : undefined,
          impacts: Array.isArray(obj.impacts) ? (obj.impacts as unknown[]).map(s => String(s)) : undefined,
        }];
      }
      return [];
    });
  }
  if (typeof data === 'object' && data !== null) {
    return Object.entries(data as Record<string, unknown>).map(([name, val]) => ({
      name,
      range: typeof val === 'string' ? val : undefined,
    }));
  }
  return [];
}

export function extractCppFromPayload(payload: Record<string, unknown>): CppEntry[] {
  const candidates: CppEntry[] = [];
  const cppField = payload.criticalProcessParameters ?? payload.cpps ?? payload.cpp;
  if (cppField !== undefined) {
    candidates.push(...extractCppEntries(cppField));
  }
  return candidates;
}

// ─── ICH classification of a CQA attribute ───────────────────────────────────

const ICH_HINTS: Array<{ match: RegExp; basis: string[] }> = [
  { match: /assay|content|potency/i,                      basis: ['ICH Q6A', 'ICH Q6B'] },
  { match: /impur|related substances|degrad/i,            basis: ['ICH Q3A(R2)', 'ICH Q3B(R2)'] },
  { match: /elemental|heavy metal|metals/i,               basis: ['ICH Q3D(R2)'] },
  { match: /residual solvent/i,                           basis: ['ICH Q3C(R8)'] },
  { match: /nitrosamine/i,                                basis: ['FDA Nitrosamine Guidance', 'ICH M7(R2)'] },
  { match: /aggregation|hmw|sec|size variant/i,           basis: ['ICH Q6B'] },
  { match: /charge variant|iex|cex/i,                     basis: ['ICH Q6B'] },
  { match: /glyco/i,                                      basis: ['ICH Q6B'] },
  { match: /dissolution|disintegration/i,                 basis: ['ICH Q6A', 'USP <711>', 'USP <701>'] },
  { match: /endotoxin|pyrogen/i,                          basis: ['USP <85>', 'ICH Q6A'] },
  { match: /sterility/i,                                  basis: ['USP <71>', 'FDA Aseptic Processing Guidance (2004)'] },
  { match: /water content|loss on drying|kf/i,            basis: ['ICH Q6A'] },
  { match: /particulate matter/i,                         basis: ['USP <788>', 'ICH Q6A'] },
];

export function classifyCqaIchBasis(attribute: string, materialContext?: unknown): string[] {
  const matched = ICH_HINTS.filter(h => h.match.test(attribute)).flatMap(h => h.basis);
  if (matched.length === 0) {
    return materialContext === 'drug_substance_biologic'
      ? ['ICH Q6B']
      : ['ICH Q6A'];
  }
  return Array.from(new Set(matched));
}

// ─── Misc helpers ────────────────────────────────────────────────────────────

export function matchesAnyPurpose(attribute: string, purposes: Set<string>): boolean {
  const a = attribute.toLowerCase();
  for (const p of purposes) {
    if (p.includes(a) || a.includes(p)) return true;
  }
  return false;
}

export function prettifyAttribute(s: string): string {
  if (!s) return s;
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase());
}
