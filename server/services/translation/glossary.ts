/**
 * Translation service — GLOSSARY + DO-NOT-TRANSLATE (DNT) engine.
 *
 * Pure, runtime-isolated module (no db / network / env reads) so it is trivially
 * unit-testable and safe to call from the workflow state machine, the provider
 * adapter, and tests alike. It does ONE job: protect the identifiers a reviewer
 * or the system reads — citations, agency names, eCTD module labels, codes,
 * JSON keys, slash commands, INN/drug names, MedDRA terms — from machine
 * translation, then restore them verbatim.
 *
 * REGULATED-PLATFORM PRINCIPLE (mirrors server/services/ana-ri/locale-overlays.ts):
 * "translate meaning, never the identifiers." Concretely:
 *  - mask() replaces every DNT span (built-in patterns + tenant locked terms)
 *    with a stable, opaque placeholder token BEFORE the text is handed to a
 *    DRAFT engine, returning a MaskResult whose tokens restore the originals.
 *  - unmask() puts the originals back AFTER translation. mask→unmask is identity.
 *  - applyLockedTargetTerms() enforces mandated target renderings (preferred,
 *    non-DNT controlled vocabulary) on a translated string.
 *
 * Masking is IDEMPOTENT: masking already-masked text does not double-wrap or
 * corrupt placeholders, because placeholders themselves are added to the DNT
 * set for the duration of a pass and the placeholder grammar (see PLACEHOLDER_RE)
 * is never produced by, nor a substring target of, any DNT matcher.
 *
 * Provenance note: the categories here are the SAME GlossaryCategory union the
 * shared contract pins (shared/types/translation.ts) and the same five strict
 * DNT classes recon found in locale-overlays.ts (regulatory_citation,
 * agency_name, evidence_label, slash_command, json_block) plus inn_drug_name,
 * meddra_term and code. Every produced MaskToken carries its category so the
 * audit trail can record WHY a span was protected.
 *
 * @module server/services/translation/glossary
 */

import type {
  CompiledGlossary,
  GlossaryCategory,
  GlossaryTerm,
  MaskResult,
  MaskToken,
  TargetLanguage,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder grammar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Placeholder format injected in place of a DNT span. The surrounding U+2999
 * (DOTTED FENCE) brackets are characters no engine should translate and that
 * never appear in source regulatory prose, keeping placeholders opaque and
 * unambiguous. Index is monotonic within a single mask() pass.
 *
 * Example: "⦙DNT7⦙".
 */
const PH_OPEN = '⦙';
const PH_CLOSE = '⦙';

/** Build the placeholder for a given index. */
function placeholderFor(index: number): string {
  return `${PH_OPEN}DNT${index}${PH_CLOSE}`;
}

/**
 * Matches any placeholder this module emits. Used to (a) guarantee idempotence
 * — existing placeholders are themselves treated as DNT and skipped over rather
 * than re-masked — and (b) drive unmask().
 */
const PLACEHOLDER_RE = new RegExp(`${PH_OPEN}DNT\\d+${PH_CLOSE}`, 'g');

// ─────────────────────────────────────────────────────────────────────────────
// Built-in regulatory DNT list
// ─────────────────────────────────────────────────────────────────────────────

/** A single built-in DNT matcher: a labelled, categorised regex. */
interface DntPattern {
  category: GlossaryCategory;
  /** Source pattern (compiled with 'g' + sticky-free, global match) per pass. */
  pattern: RegExp;
  /** Human label for audit/debug. */
  label: string;
}

/**
 * Agency / authority acronyms that must survive verbatim. Superset of the names
 * recon found across locale-overlays.ts (FDA/EMA/PMDA/NMPA/MFDS …). Ordered so
 * longer tokens are tried first is handled at compile time, not here.
 */
const AGENCY_NAMES: readonly string[] = [
  'FDA', 'EMA', 'PMDA', 'NMPA', 'MFDS', 'MHRA', 'TGA', 'SFDA', 'CDSCO', 'HSA',
  'TFDA', 'ANVISA', 'COFEPRIS', 'ANMAT', 'INVIMA', 'ANSM', 'BfArM', 'PEI',
  'AEMPS', 'AIFA', 'Infarmed', 'CBG-MEB', 'URPL', 'SUKL', 'SÚKL', 'EOF',
  'OGYÉI', 'ANMDMR', 'Fimea', 'Swissmedic', 'MHLW', 'CHMP', 'CDE',
];

/**
 * Build a word-boundary alternation for a list of fixed tokens. Tokens are
 * escaped and sorted longest-first so e.g. "CBG-MEB" wins over a bare "CBG".
 */
function fixedAlternation(tokens: readonly string[], flags = 'g'): RegExp {
  const escaped = [...tokens]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // \b is unreliable around non-ASCII (e.g. SÚKL, OGYÉI), so we anchor on
  // boundaries that are not letters/digits rather than on \b.
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped.join('|')})(?![\\p{L}\\p{N}])`, flags + 'u');
}

/**
 * The built-in DNT patterns. ORDER MATTERS only insofar as more specific
 * patterns should appear before more general ones (the matcher resolves
 * overlaps by earliest start, then longest span — see findDntSpans).
 */
const BUILTIN_DNT_PATTERNS: readonly DntPattern[] = [
  // ── Regulatory citations ─────────────────────────────────────────────────
  // 21 CFR 312.23(a)(1), 21 CFR Part 11, etc. Capture the full citation incl.
  // optional Part/§, section number and any (a)(1) sub-paragraph chain.
  {
    category: 'regulatory_citation',
    label: 'cfr_citation',
    // NB: the trailing boundary is a non-(letter/digit) lookahead rather than
    // \b, because a citation may legitimately END in a ")" — e.g. "(a)(1)" —
    // and \b is not a boundary between ")" and a following space.
    pattern:
      /\b\d{1,3}\s*CFR(?:\s+(?:Part|Subpart|§+))?\s*\d+(?:\.\d+)?(?:\s*\([a-z0-9]+\))*(?![A-Za-z0-9])/gi,
  },
  // ICH guideline codes: E6(R2), Q8(R2), M4, S7B, E2B(R3) … letter + number +
  // optional (R<n>) revision.
  {
    category: 'regulatory_citation',
    label: 'ich_citation',
    // Trailing non-(letter/digit) lookahead, not \b, so a "(R2)" revision
    // suffix (which ends in ")") is included in the citation.
    pattern: /\bICH\s+[A-Z]\d+[A-Z]?(?:\([Rr]\d+\))?(?![A-Za-z0-9])/g,
  },
  // eCTD module labels: "Module 3", "Module 3.2.P", "M1".."M5" (incl. M2.3 etc.)
  {
    category: 'regulatory_citation',
    label: 'ectd_module',
    pattern: /\b(?:Module\s+[1-5](?:\.\d+)*[A-Z]?|M[1-5](?:\.\d+)*[A-Z]?)\b/g,
  },
  // Bare "eCTD" / "CTD" tokens.
  {
    category: 'regulatory_citation',
    label: 'ctd_token',
    pattern: /\b(?:eCTD|CTD)\b/g,
  },

  // ── Evidence labels ──────────────────────────────────────────────────────
  // [KNOWN] / [INFERRED] / [MISSING] — the AnA evidence markers.
  {
    category: 'evidence_label',
    label: 'evidence_marker',
    pattern: /\[(?:KNOWN|INFERRED|MISSING)\]/g,
  },

  // ── Slash commands ───────────────────────────────────────────────────────
  // /audit, /readiness, /readiness-deep … leading slash + kebab/word token.
  {
    category: 'slash_command',
    label: 'slash_command',
    pattern: /(?<![^\s(])\/[a-z][a-z0-9-]*\b/gi,
  },

  // ── Agency names ─────────────────────────────────────────────────────────
  {
    category: 'agency_name',
    label: 'agency_name',
    pattern: fixedAlternation(AGENCY_NAMES),
  },

  // ── Generic codes / identifiers ──────────────────────────────────────────
  // Mixed alnum tokens that read as identifiers, not words: at least one digit
  // AND one letter, length ≥ 3 (e.g. "ABC-123", "NCT04567890", "R2D2"). Also
  // standalone dotted/numeric version codes like "v3.2".
  {
    category: 'code',
    label: 'alnum_code',
    pattern: /\b(?=[A-Za-z0-9-]*\d)(?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z]+[A-Za-z0-9]*(?:-[A-Za-z0-9]+)*\b/g,
  },
];

/**
 * Default categories considered "do-not-translate" by the masking pass. INN /
 * drug names and MedDRA terms have no reliable built-in surface pattern (they
 * are open vocabularies), so they are protected via registered locked terms —
 * see registerDntTerms / DEFAULT_GLOSSARY's seeds — rather than a regex here.
 */
export const BUILTIN_DNT_CATEGORIES: readonly GlossaryCategory[] = [
  'regulatory_citation',
  'agency_name',
  'evidence_label',
  'slash_command',
  'json_block',
  'code',
];

// ─────────────────────────────────────────────────────────────────────────────
// Glossary shape used by this engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A glossary the masking engine can consume directly. The shared CompiledGlossary
 * (dnt + preferred GlossaryTerm[]) is the persisted/tenant form; this adds the
 * built-in patterns and the toggle for whether to apply them. Use
 * compileGlossary() to turn a CompiledGlossary into a MaskingGlossary.
 */
export interface MaskingGlossary {
  organizationId: number;
  targetLang: TargetLanguage;
  /** Built-in regulatory patterns to apply (default: all). */
  builtinPatterns: readonly DntPattern[];
  /**
   * Tenant/locked DNT terms — exact source strings masked verbatim. Covers
   * INN/drug names, MedDRA terms, and any org-specific identifiers. Sorted
   * longest-first at compile time so multi-word terms win over their prefixes.
   */
  lockedDntTerms: GlossaryTerm[];
  /**
   * Non-DNT mandated target renderings, applied AFTER translation by
   * applyLockedTargetTerms(). source → preferred target for this targetLang.
   */
  lockedTargetTerms: GlossaryTerm[];
}

/**
 * Compile a persisted CompiledGlossary (+ optional built-ins) into a
 * MaskingGlossary. Pure; does no IO. Locked DNT terms are sorted longest-first
 * so the matcher prefers the most specific term.
 */
export function compileGlossary(
  source: CompiledGlossary,
  options: { includeBuiltins?: boolean } = {},
): MaskingGlossary {
  const includeBuiltins = options.includeBuiltins ?? true;
  return {
    organizationId: source.organizationId,
    targetLang: source.targetLang,
    builtinPatterns: includeBuiltins ? BUILTIN_DNT_PATTERNS : [],
    lockedDntTerms: [...source.dnt].sort(
      (a, b) => b.sourceTerm.length - a.sourceTerm.length,
    ),
    lockedTargetTerms: [...source.preferred],
  };
}

/**
 * Convenience: register additional DNT terms (e.g. an INN list, a MedDRA pull)
 * onto a glossary, returning a new glossary (pure — no mutation). organizationId
 * and targetLang are carried from the base glossary.
 */
export function registerDntTerms(
  glossary: MaskingGlossary,
  terms: Array<Pick<GlossaryTerm, 'sourceTerm' | 'category'>>,
): MaskingGlossary {
  const added: GlossaryTerm[] = terms.map((t, i) => ({
    id: -(i + 1),
    organizationId: glossary.organizationId,
    sourceTerm: t.sourceTerm,
    targetTerm: null,
    doNotTranslate: true,
    category: t.category,
  }));
  return {
    ...glossary,
    lockedDntTerms: [...glossary.lockedDntTerms, ...added].sort(
      (a, b) => b.sourceTerm.length - a.sourceTerm.length,
    ),
  };
}

/**
 * An empty starter glossary for a tenant + language. Built-in patterns are on;
 * no locked terms yet. Callers seed INN/MedDRA via registerDntTerms.
 */
export function emptyGlossary(
  organizationId: number,
  targetLang: TargetLanguage,
): MaskingGlossary {
  return {
    organizationId,
    targetLang,
    builtinPatterns: BUILTIN_DNT_PATTERNS,
    lockedDntTerms: [],
    lockedTargetTerms: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Span detection
// ─────────────────────────────────────────────────────────────────────────────

interface Span {
  start: number;
  end: number;
  text: string;
  category: GlossaryCategory;
}

/** Escape a string for use as a literal inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a global, Unicode-aware boundary-anchored matcher for an exact locked
 * term. Word boundaries use the same non-letter/digit lookarounds as agency
 * names so non-ASCII terms match cleanly.
 */
function lockedTermMatcher(term: string): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`,
    'gu',
  );
}

/**
 * Find every DNT span in `text`: existing placeholders (to preserve them),
 * locked DNT terms, then built-in patterns. Returns spans resolved so none
 * overlap — earliest start wins, ties broken by longest span. This resolution
 * is what makes masking deterministic and idempotent.
 */
function findDntSpans(text: string, glossary: MaskingGlossary): Span[] {
  const candidates: Span[] = [];

  const collect = (re: RegExp, category: GlossaryCategory) => {
    // Always work on a fresh, global regex to avoid lastIndex bleed.
    const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      if (m[0] === '') {
        rx.lastIndex++;
        continue;
      }
      candidates.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        category,
      });
    }
  };

  // 1. Existing placeholders FIRST — they are inviolable. Treating them as DNT
  //    spans means an already-masked input round-trips through mask() unchanged
  //    (idempotence) and nothing else can match inside them.
  collect(PLACEHOLDER_RE, 'code');

  // 2. Locked DNT terms (already longest-first). Multi-word / exact identifiers
  //    such as INN drug names and MedDRA terms.
  for (const term of glossary.lockedDntTerms) {
    if (!term.sourceTerm) continue;
    collect(lockedTermMatcher(term.sourceTerm), term.category);
  }

  // 3. Built-in regulatory patterns.
  for (const p of glossary.builtinPatterns) {
    collect(p.pattern, p.category);
  }

  // Resolve overlaps: sort by start asc, then by length desc (longest wins),
  // then walk left-to-right keeping non-overlapping spans.
  candidates.sort((a, b) =>
    a.start !== b.start ? a.start - b.start : b.end - a.end,
  );

  const resolved: Span[] = [];
  let cursor = 0;
  for (const span of candidates) {
    if (span.start < cursor) continue; // overlaps an already-accepted span
    resolved.push(span);
    cursor = span.end;
  }
  return resolved;
}

// ─────────────────────────────────────────────────────────────────────────────
// mask / unmask
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace every DNT span in `text` with a stable placeholder, returning the
 * masked text + the ordered tokens needed to restore it. Idempotent: passing
 * already-masked text yields the same text and an empty (or equivalent) token
 * set for the already-present placeholders — placeholders are never re-wrapped.
 *
 * Identical source spans collapse to the SAME placeholder, so repeated
 * identifiers stay consistent and the token list stays minimal.
 */
export function mask(text: string, glossary: MaskingGlossary): MaskResult {
  const spans = findDntSpans(text, glossary);

  // Pre-existing placeholders are left exactly as-is (no token emitted; they are
  // already their own restoration). Only NEW DNT spans get fresh placeholders.
  const tokens: MaskToken[] = [];
  const byOriginal = new Map<string, MaskToken>();
  let nextIndex = 0;

  // Find the highest existing placeholder index so we never collide with one
  // already in the text (keeps idempotence + re-mask safety).
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const n = Number.parseInt(m[0].replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n >= nextIndex) nextIndex = n + 1;
  }

  // Rebuild the string left-to-right, swapping in placeholders.
  let out = '';
  let pos = 0;
  for (const span of spans) {
    out += text.slice(pos, span.start);

    if (PLACEHOLDER_RE.test(span.text)) {
      // An existing placeholder — keep verbatim, emit no new token.
      PLACEHOLDER_RE.lastIndex = 0;
      out += span.text;
      pos = span.end;
      continue;
    }
    PLACEHOLDER_RE.lastIndex = 0;

    let token = byOriginal.get(span.text);
    if (!token) {
      token = {
        placeholder: placeholderFor(nextIndex++),
        original: span.text,
        category: span.category,
      };
      byOriginal.set(span.text, token);
      tokens.push(token);
    }
    out += token.placeholder;
    pos = span.end;
  }
  out += text.slice(pos);

  return { maskedText: out, tokens };
}

/**
 * Restore the original DNT identifiers in `text` using a MaskResult's tokens.
 * Order-independent and safe to call on partially-translated text: every
 * occurrence of each placeholder is replaced by its original. mask→unmask is
 * the identity transform on the source string.
 *
 * Any placeholder NOT present in the token set is left untouched (it cannot be
 * fabricated by translation, but if a token list is incomplete we fail safe by
 * preserving the opaque marker rather than guessing).
 */
export function unmask(text: string, maskResult: MaskResult): string {
  let out = text;
  // Replace longer placeholders first is unnecessary (placeholders are mutually
  // non-substring thanks to the ⦙…⦙ fences), but we still split on exact tokens.
  for (const token of maskResult.tokens) {
    // Global, literal replacement of the exact placeholder string.
    out = out.split(token.placeholder).join(token.original);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Locked target-term substitution (preferred, non-DNT)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply mandated target-term substitutions to a TRANSLATED string. These are
 * non-DNT preferred renderings (controlled clinical vocabulary) whose source
 * form should be replaced by the org-/language-mandated target form. Only terms
 * matching the glossary's targetLang (or language-agnostic, targetLang null)
 * with a non-empty targetTerm are applied.
 *
 * Substitution is boundary-anchored and longest-first so a multi-word mandated
 * term wins over a shorter overlapping one, and is a no-op when no source form
 * is present. It does NOT touch placeholders (they contain no letters/digits
 * matchable by a term, and the fences are not word characters).
 */
export function applyLockedTargetTerms(
  text: string,
  glossary: MaskingGlossary,
): string {
  const applicable = glossary.lockedTargetTerms
    .filter(
      (t) =>
        !t.doNotTranslate &&
        !!t.targetTerm &&
        (t.targetLang == null || t.targetLang === glossary.targetLang),
    )
    .sort((a, b) => b.sourceTerm.length - a.sourceTerm.length);

  let out = text;
  for (const term of applicable) {
    out = out.replace(lockedTermMatcher(term.sourceTerm), term.targetTerm as string);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Introspection helpers (audit / debug)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the DNT spans that WOULD be masked in `text`, without rewriting it.
 * Useful for surfacing "these identifiers are protected" in a review UI and for
 * audit evidence. Categories mirror MaskToken.category.
 */
export function detectDntSpans(
  text: string,
  glossary: MaskingGlossary,
): Array<{ text: string; category: GlossaryCategory; start: number; end: number }> {
  return findDntSpans(text, glossary).filter(
    (s) => !isPlaceholder(s.text),
  );
}

/** True if `s` is exactly one placeholder this module emits. */
export function isPlaceholder(s: string): boolean {
  const re = new RegExp(`^${PH_OPEN}DNT\\d+${PH_CLOSE}$`);
  return re.test(s);
}
