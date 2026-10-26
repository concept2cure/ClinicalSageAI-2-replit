/** Explicit AnA proposals, never inferred from prose. Application stays with
 * the editor's version/quote/model-checked tracked-change door. */

export type AuthoringRemedyOperation = 'replace' | 'insert-before' | 'insert-after' | 'insert-empty';

export interface AuthoringRemedyEdit {
  /** Omitted by existing replacement/deletion remedies. */
  operation?: AuthoringRemedyOperation;
  quote: string;
  replacement: string;
  prefix?: string;
  suffix?: string;
}
export interface AuthoringRemedy extends AuthoringRemedyEdit {
  sectionId: string;
  baseSha256?: string;
  baseUpdatedAt?: string;
  reason: string;
}
export interface RemedyAnswer {
  prose: string;
  proposals: AuthoringRemedy[];
  errors: string[];
  hasRemedies: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const MAX_PROPOSALS = 6;
const ALLOWED = new Set(['sectionId', 'baseSha256', 'baseUpdatedAt', 'operation', 'quote', 'replacement', 'reason', 'prefix', 'suffix']);
const FENCE = /^```authoring-remedy[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;

function boundedText(value: unknown, max: number, allowEmpty = false): boolean {
  return typeof value === 'string' && value.length <= max && (allowEmpty || !!value.trim());
}

function validBase(p: Record<string, unknown>): boolean {
  const hash = p.baseSha256;
  const at = p.baseUpdatedAt;
  if (hash !== undefined && (typeof hash !== 'string' || !SHA.test(hash))) return false;
  if (at !== undefined && (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(at) || !Number.isFinite(Date.parse(at)))) return false;
  return typeof hash === 'string' || typeof at === 'string';
}

/** Shared by decoded turn attribution and the live editor's proposal door. */
export function validRemedyEdit(p: { operation?: unknown; quote?: unknown; replacement?: unknown; prefix?: unknown; suffix?: unknown }): boolean {
  const operation = p.operation === undefined ? 'replace' : p.operation;
  if (operation === 'insert-empty') {
    return p.quote === '' && p.prefix === undefined && p.suffix === undefined && boundedText(p.replacement, 16000);
  }
  if (operation !== 'replace' && operation !== 'insert-before' && operation !== 'insert-after') return false;
  if (!boundedText(p.quote, 8000) || !boundedText(p.replacement, 16000, operation === 'replace')) return false;
  if (operation === 'replace' && p.replacement === p.quote) return false;
  return [p.prefix, p.suffix].every(value => value === undefined || boundedText(value, 4000, true));
}

function validRemedy(value: unknown): value is AuthoringRemedy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  if (Object.keys(p).some(k => !ALLOWED.has(k))) return false;
  return typeof p.sectionId === 'string' && UUID.test(p.sectionId) && validRemedyEdit(p) && boundedText(p.reason, 2000) && validBase(p);
}

export function parseRemedyAnswer(text: string): RemedyAnswer {
  const hasRemedies = /^```authoring-remedy(?:[ \t]*\r?$)/m.test(text);
  if (!hasRemedies) return { prose: text, proposals: [], errors: [], hasRemedies: false };
  if (text.length > 150000) return { prose: '', proposals: [], errors: ['The remedy response exceeds the size limit. Ask AnA for up to six focused fixes.'], hasRemedies };
  const blocks = [...text.matchAll(FENCE)];
  const prose = text.replace(FENCE, '').replace(/^```authoring-remedy[ \t]*\r?\n[\s\S]*$/m, '').trim();
  if (blocks.length > MAX_PROPOSALS) {
    return { prose, proposals: [], errors: ['The remedy response exceeds the size limit. Ask AnA for up to six focused fixes.'], hasRemedies };
  }
  const proposals: AuthoringRemedy[] = [];
  const errors: string[] = [];
  for (const [i, block] of blocks.entries()) {
    try {
      if (block[1].length > 36000) throw new Error('oversized');
      const parsed: unknown = JSON.parse(block[1]);
      if (!validRemedy(parsed)) throw new Error('invalid');
      proposals.push(parsed);
    } catch {
      errors.push(`Fix ${i + 1} is incomplete or invalid. Ask AnA to re-read the saved section and prepare a versioned fix.`);
    }
  }
  if (/^```authoring-remedy[ \t]*\r?\n/m.test(text.replace(FENCE, ''))) errors.push('A fix was cut off. Ask AnA for a complete versioned fix.');
  return { prose, proposals, errors, hasRemedies };
}
