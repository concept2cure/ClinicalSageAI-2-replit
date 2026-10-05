/**
 * The platform's cited CMC regulatory record, and the deterministic lookups
 * AnA answers CMC regulatory questions from.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * AnA had CMC ENGINES (shelf life, poolability, impurity classification,
 * specifications) but no record of what agencies REQUIRE of a CMC dossier: what
 * an IND, an IMPD under the EU CTR, a Japanese CTN or a Chinese IND must carry
 * for the quality part, by phase and modality, and which guideline says so and
 * in which version. The ICH index in ana-ri carries titles and "verify on
 * ich.org"; nothing carried a date, a status established as of a day, or a
 * citation a client could check. So AnA answered those questions from training,
 * which is the one thing a regulated client cannot accept.
 *
 * ── What the record is ───────────────────────────────────────────────────────
 * cmc-regulatory-record.json: sources (each official document with its code,
 * status, date and URL), requirements (each one statement tied to the sources
 * that make it), pathways (how each authority receives the quality dossier of
 * a clinical-trial or marketing application) and knowledge notes (the science
 * behind the requirements, citing guidelines and peer-reviewed literature by
 * PMID / PMCID / DOI). It records its own method and the date its statuses are
 * established as of, and every entry carries a confidence; a low-confidence
 * entry is returned as such, never promoted.
 *
 * ── Rules ────────────────────────────────────────────────────────────────────
 *   - Pure and deterministic: nothing here asks a model for anything.
 *   - A question the record cannot answer is answered "not indexed", and the
 *     caller is told not to supply the requirement from memory.
 *
 * @module server/services/cmc/knowledge
 */
import record from './cmc-regulatory-record.json';
import type {
  CmcKnowledgeNote,
  CmcPathway,
  CmcRegulatoryRecord,
  CmcRequirement,
  CmcSource,
} from './types';

export * from './types';

export const CMC_RECORD = record as unknown as CmcRegulatoryRecord;

const SOURCE_BY_ID = new Map<string, CmcSource>(CMC_RECORD.sources.map((s) => [s.id, s]));

export function getCmcSource(id: string): CmcSource | undefined {
  return SOURCE_BY_ID.get(id);
}

// ── Normalisation ───────────────────────────────────────────────────────────

/** Words that name an authority (or a group of them), to the record's names. */
const AUTHORITY_ALIASES: Record<string, string[]> = {
  ich: ['ICH'],
  fda: ['FDA'], us: ['FDA'], usa: ['FDA'], cder: ['FDA'], cber: ['FDA'], ind: ['FDA'],
  eu: ['EC', 'EMA'], ema: ['EMA', 'EC'], ec: ['EC', 'EMA'], europe: ['EC', 'EMA'], european: ['EC', 'EMA'], ctr: ['EC', 'EMA'], impd: ['EC', 'EMA'],
  uk: ['MHRA'], mhra: ['MHRA'], britain: ['MHRA'],
  swiss: ['Swissmedic'], switzerland: ['Swissmedic'], swissmedic: ['Swissmedic'],
  japan: ['PMDA', 'MHLW'], pmda: ['PMDA', 'MHLW'], mhlw: ['MHLW', 'PMDA'], ctn: ['PMDA', 'MHLW', 'TGA'],
  korea: ['MFDS'], mfds: ['MFDS'],
  china: ['NMPA'], nmpa: ['NMPA'], cde: ['NMPA'],
  canada: ['Health Canada'], hc: ['Health Canada'], 'health canada': ['Health Canada'],
  australia: ['TGA'], tga: ['TGA'],
  brazil: ['ANVISA'], anvisa: ['ANVISA'],
  india: ['CDSCO'], cdsco: ['CDSCO'],
  singapore: ['HSA'], hsa: ['HSA'],
  who: ['WHO'],
  pics: ['PIC/S'], 'pic/s': ['PIC/S'],
  edqm: ['EDQM'], 'ph. eur.': ['EDQM'], 'ph.eur': ['EDQM'],
  usp: ['USP'],
  literature: ['Literature'], academic: ['Literature'], 'peer-reviewed': ['Literature'], papers: ['Literature'],
};

/** The record's authority names for a caller's word, or null when it names none. */
export function resolveAuthorities(word: string | undefined | null): string[] | null {
  const w = String(word ?? '').trim().toLowerCase();
  if (!w) return null;
  const direct = AUTHORITY_ALIASES[w];
  if (direct) return direct;
  const exact = CMC_RECORD.sources.find((s) => s.authority.toLowerCase() === w);
  return exact ? [exact.authority] : [];
}

/** "3.2.s.4.1" / "m3.2.S.4.1" / "3.2.S.4.1." → "3.2.S.4.1". */
export function normalizeCtd(code: string): string {
  return String(code ?? '')
    .trim()
    .replace(/^m(?=\d)/i, '')
    .replace(/\.$/, '')
    .split('.')
    .map((p) => (/^[spar]$/i.test(p) ? p.toUpperCase() : p))
    .join('.');
}

/** A section and its ancestors or descendants are the same question. */
function ctdOverlaps(query: string, candidates: string[]): boolean {
  const q = normalizeCtd(query);
  return candidates.some((c) => {
    const n = normalizeCtd(c);
    return n === q || n.startsWith(`${q}.`) || q.startsWith(`${n}.`);
  });
}

const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'in', 'on', 'what', 'is', 'are', 'how', 'do', 'does', 'we', 'our', 'my', 'with', 'at', 'by', 'be', 'it', 'need', 'needs', 'required', 'requirement', 'requirements']);

function tokens(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9()/.+-]+/)
    .map((t) => t.replace(/^[.()]+|[.()]+$/g, ''))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function score(queryTokens: string[], weighted: Array<[string, number]>): number {
  let total = 0;
  for (const q of queryTokens) {
    for (const [field, weight] of weighted) {
      if (field.toLowerCase().includes(q)) total += weight;
    }
  }
  return total;
}

function phaseMatches(wanted: string, stated: string): boolean {
  const w = wanted.toLowerCase().replace(/\s+/g, '');
  const s = stated.toLowerCase().replace(/\s+/g, '');
  if (!w) return true;
  if (/all|any|general/.test(s)) return true;
  if (/^(1|phase1|fih|firstinhuman)$/.test(w)) return /phase1|phasei\b|fih|first-in-human|early/.test(s) || s.includes('clinical');
  if (/^(2|3|2-3|phase2|phase3|phase2-3|late)$/.test(w)) return /phase2|phase3|phaseii|late/.test(s) || s.includes('clinical');
  if (/marketing|registration|nda|bla|maa/.test(w)) return /marketing|registration|approval|nda|bla|maa/.test(s);
  return s.includes(w);
}

function modalityMatches(wanted: string, stated: string): boolean {
  const w = wanted.toLowerCase();
  const s = stated.toLowerCase();
  if (!w || !s || s === 'all' || s.includes('all')) return true;
  const family: Record<string, string[]> = {
    small_molecule: ['small', 'chemical', 'synthetic'],
    biologic: ['biolog', 'biotech', 'protein', 'antibod', 'mab'],
    atmp: ['atmp', 'gene', 'cell', 'advanced'],
    vaccine: ['vaccin'],
  };
  const words = family[w] ?? [w];
  return words.some((x) => s.includes(x));
}

// ── Lookups ─────────────────────────────────────────────────────────────────

export interface RequirementQuery {
  authority?: string;
  applicationType?: string;
  phase?: string;
  ctdSection?: string;
  modality?: string;
  topic?: string;
}

/** Requirements matching every filter given, best topical match first. */
export function findCmcRequirements(q: RequirementQuery, limit = 12): { matches: CmcRequirement[]; total: number } {
  const authorities = resolveAuthorities(q.authority);
  const topic = tokens(q.topic ?? '');
  const filtered = CMC_RECORD.requirements.filter((r) => {
    if (authorities && !authorities.includes(r.authority) && !(r.authority === 'ICH')) return false;
    if (q.applicationType && r.applicationType !== 'all' && r.applicationType !== q.applicationType) return false;
    if (q.phase && !phaseMatches(q.phase, r.phase)) return false;
    if (q.modality && !modalityMatches(q.modality, r.modality)) return false;
    if (q.ctdSection && !ctdOverlaps(q.ctdSection, r.ctdSections)) return false;
    return true;
  });
  const ranked = filtered
    .map((r) => {
      const sources = r.sourceIds.map((id) => SOURCE_BY_ID.get(id)).filter((s): s is CmcSource => Boolean(s));
      const topical = topic.length
        ? score(topic, [[r.statement, 2], [sources.map((s) => `${s.code} ${s.title}`).join(' '), 3]])
        : 0;
      // The named authority's own requirements before the ICH baseline it adopts.
      const own = authorities && authorities.includes(r.authority) ? 1 : 0;
      return { r, rank: topical * 10 + own * 5 + (r.confidence === 'high' ? 2 : r.confidence === 'medium' ? 1 : 0) };
    })
    .filter((x) => !topic.length || x.rank >= 10)
    .sort((a, b) => b.rank - a.rank || a.r.id.localeCompare(b.r.id));
  return { matches: ranked.slice(0, limit).map((x) => x.r), total: ranked.length };
}

/** Documents whose code, title or scope match the query, best match first. */
export function findCmcGuidance(query: string, authority?: string, limit = 12): { matches: CmcSource[]; total: number } {
  const authorities = resolveAuthorities(authority);
  const qTokens = tokens(query);
  const compactQuery = query.toLowerCase().replace(/\s+/g, '');
  const ranked = CMC_RECORD.sources
    .filter((s) => !authorities || authorities.includes(s.authority))
    .map((s) => {
      const codeHit = compactQuery && s.code.toLowerCase().replace(/\s+/g, '').includes(compactQuery) ? 50 : 0;
      return { s, rank: codeHit + score(qTokens, [[s.code, 6], [s.title, 3], [s.scope, 1], [s.ctdSections.join(' '), 2]]) };
    })
    .filter((x) => x.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.s.id.localeCompare(b.s.id));
  return { matches: ranked.slice(0, limit).map((x) => x.s), total: ranked.length };
}

/** How the named authority receives the quality part of an application. */
export function findCmcPathways(authority?: string, applicationType?: string): CmcPathway[] {
  const authorities = resolveAuthorities(authority);
  return CMC_RECORD.pathways.filter((p) => {
    if (authorities && !authorities.includes(p.authority)) return false;
    if (!applicationType) return true;
    const name = `${p.applicationName} ${p.legalBasis}`.toLowerCase();
    return applicationType === 'clinical_trial'
      ? /clinical|trial|ind\b|ctn|cta|impd|investigational/.test(name)
      : /marketing|registration|nda|bla|maa|approval|nds/.test(name);
  });
}

/** Knowledge notes on a topic, best match first. */
export function findCmcNotes(query: string, opts: { ctdSection?: string; modality?: string } = {}, limit = 5): { matches: CmcKnowledgeNote[]; total: number } {
  const qTokens = tokens(query);
  const ranked = CMC_RECORD.notes
    .filter((n) => !opts.ctdSection || ctdOverlaps(opts.ctdSection, n.ctdSections))
    .filter((n) => !opts.modality || n.modality === 'all' || n.modality === opts.modality)
    .map((n) => ({
      n,
      rank: score(qTokens, [[n.topic, 5], [n.summary, 2], [n.keyPoints.join(' '), 1], [n.citations.map((c) => `${c.id} ${c.title}`).join(' '), 1]]),
    }))
    .filter((x) => x.rank > 0 || (!qTokens.length && (opts.ctdSection || opts.modality)))
    .sort((a, b) => b.rank - a.rank || a.n.id.localeCompare(b.n.id));
  return { matches: ranked.slice(0, limit).map((x) => x.n), total: ranked.length };
}

/** How a source is cited in an answer: code, status and date, and where to read it. */
export function citeSource(s: CmcSource): string {
  const status = s.status === 'final' ? '' : ` — ${s.status.toUpperCase()}`;
  const by = s.supersededBy ? `; superseded by ${s.supersededBy}` : '';
  return `${s.authority} ${s.code} (${s.date}${status}${by})`;
}
