/**
 * Translation service — QA LAYER: STRUCTURAL checks.
 *
 * The "structural" tier of the pre-review quality gate: deterministic,
 * surface-level invariants that hold regardless of meaning. They catch the
 * machine-translation failure modes that corrupt the SHAPE of a segment —
 * dropped/altered DNT identifiers, mangled placeholders/markup, an empty or
 * verbatim-copied target, mojibake — BEFORE a human reviewer adjudicates.
 *
 * REGULATED-PLATFORM PRINCIPLE (mirrors ../glossary.ts and the invariants pinned
 * in shared/types/translation.ts): "translate meaning, never the identifiers." A
 * dropped or altered DNT identifier — a 21 CFR / ICH citation, an eCTD M1..M5
 * module label, an agency name, a gene symbol, a unit — is an ERROR, because the
 * target must carry it verbatim. An error forces QaReport.passed = false and
 * blocks auto-advance, while the human reviewer always retains adjudication.
 *
 * Each export conforms to the QaCheck contract (./types): a PURE, synchronous,
 * deterministic function — no I/O, no LLM, no clock — taking a QaCheckInput and
 * returning QaFinding[] (empty array = passed). We REUSE ../glossary.ts for DNT
 * detection rather than re-implementing identifier patterns, so the QA layer and
 * the masking engine agree on exactly which spans are protected.
 *
 * @module server/services/translation/qa/structural-checks
 */

import {
  compileGlossary,
  detectDntSpans,
  type MaskingGlossary,
} from '../glossary';
import type { CompiledGlossary, GlossaryTerm } from '../types';
import type { QaCheck, QaCheckInput, QaFinding } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a built-ins-on MaskingGlossary from the bare GlossaryTerm[] a check
 * receives. The check input carries a flat term list (mixed DNT + preferred);
 * compileGlossary expects the split CompiledGlossary shape, so we partition by
 * the doNotTranslate flag. organizationId/targetLang are not load-bearing for
 * DETECTION (only the built-in patterns + locked DNT terms drive findDntSpans),
 * so we feed neutral placeholders — the call stays pure and side-effect-free.
 */
function maskingGlossaryFrom(glossary?: GlossaryTerm[]): MaskingGlossary {
  const dnt = (glossary ?? []).filter((t) => t.doNotTranslate);
  const preferred = (glossary ?? []).filter((t) => !t.doNotTranslate);
  // targetLang is irrelevant to source-side DNT detection; 'fr' is an arbitrary
  // valid TargetLanguage placeholder (never used by detectDntSpans).
  const compiled: CompiledGlossary = {
    organizationId: glossary?.[0]?.organizationId ?? 0,
    targetLang: 'fr',
    dnt,
    preferred,
  };
  return compileGlossary(compiled, { includeBuiltins: true });
}

/**
 * Count NON-overlapping occurrences of an exact literal `needle` in `haystack`.
 * We count rather than test presence so a source with TWO copies of the same
 * identifier requires TWO copies in the target — dropping a duplicate is still a
 * dropped identifier. Literal (not regex) scan; needles are verbatim DNT spans.
 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    count += 1;
    from = at + needle.length; // non-overlapping advance
  }
  return count;
}

/** Trim + collapse internal whitespace, for "is this effectively empty?" tests. */
function isBlank(s: string): boolean {
  return s.trim() === '';
}

// ─────────────────────────────────────────────────────────────────────────────
// (1) DNT preservation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify every do-not-translate identifier/token present in the SOURCE appears
 * UNCHANGED (verbatim, same multiplicity) in the TARGET. Uses ../glossary.ts's
 * detectDntSpans so the QA layer protects exactly the spans the masking engine
 * would have masked: 21 CFR / ICH citations, eCTD M1..M5 module labels, agency
 * names, codes/gene-symbol-shaped identifiers, units, plus any tenant locked DNT
 * terms (INN/drug names, MedDRA) supplied via input.glossary.
 *
 * A source DNT span that is MISSING from the target — or present fewer times
 * than in the source — is an ERROR: the identifier was dropped or altered by the
 * engine, which the workflow must not auto-advance over. We emit one finding per
 * distinct offending identifier (de-duplicated on the verbatim text), carrying
 * the dropped identifier in sourceExcerpt so the reviewer sees exactly what to
 * restore.
 */
export const dntPreservationCheck: QaCheck = (input: QaCheckInput): QaFinding[] => {
  const { source, target, glossary } = input;
  const findings: QaFinding[] = [];

  const mg = maskingGlossaryFrom(glossary);
  const spans = detectDntSpans(source, mg);

  // Aggregate required multiplicity per distinct identifier text, so two copies
  // of "21 CFR 312.23" in the source demand two copies in the target and we
  // report each distinct identifier at most once.
  const requiredCounts = new Map<string, number>();
  for (const span of spans) {
    requiredCounts.set(span.text, (requiredCounts.get(span.text) ?? 0) + 1);
  }

  for (const [identifier, required] of requiredCounts) {
    const present = countOccurrences(target, identifier);
    if (present < required) {
      findings.push({
        checkId: 'dnt-identifier-preserved',
        severity: 'error',
        message:
          present === 0
            ? `Do-not-translate identifier "${identifier}" is missing from the target; it must be preserved verbatim.`
            : `Do-not-translate identifier "${identifier}" appears ${present}× in the target but ${required}× in the source; every occurrence must be preserved verbatim.`,
        sourceExcerpt: identifier,
        // No targetExcerpt: the failure is an ABSENCE — there is no offending
        // span to point at on the target side.
      });
    }
  }

  return findings;
};

// ─────────────────────────────────────────────────────────────────────────────
// (2) Placeholders & markup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * {{placeholders}} and HTML/XML-ish tags are structural tokens an engine must
 * carry across unchanged — they are interpolation slots and markup, not prose.
 * We extract them from BOTH sides and require the source multiset to be a subset
 * of (in practice, equal to) the target multiset. A token present in the source
 * but missing/short in the target is an ERROR (the slot/tag was dropped or
 * mangled); an EXTRA token in the target that was never in the source is a
 * WARNING (the engine hallucinated markup — worth surfacing, not auto-blocking).
 */

/** {{ mustache-style }} interpolation placeholders, captured verbatim incl. braces. */
const PLACEHOLDER_RE = /\{\{[^{}]*\}\}/g;
/** HTML/XML-ish tags: opening, closing, or self-closing, captured verbatim. */
const TAG_RE = /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s[^<>]*?)?\/?>/g;

/** Collect verbatim matches of `re` into a multiplicity map. */
function tokenCounts(text: string, re: RegExp): Map<string, number> {
  const counts = new Map<string, number>();
  // Fresh global regex per call to avoid lastIndex bleed across invocations.
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    if (m[0] === '') {
      rx.lastIndex += 1;
      continue;
    }
    counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
  }
  return counts;
}

export const placeholderMarkupCheck: QaCheck = (input: QaCheckInput): QaFinding[] => {
  const { source, target } = input;
  const findings: QaFinding[] = [];

  // Both placeholder and markup tokens share the same preserve-verbatim rule, so
  // we run the same comparison over each token class.
  const classes: Array<{ label: string; re: RegExp }> = [
    { label: 'placeholder', re: PLACEHOLDER_RE },
    { label: 'tag', re: TAG_RE },
  ];

  for (const { label, re } of classes) {
    const srcCounts = tokenCounts(source, re);
    const tgtCounts = tokenCounts(target, re);

    // Source token missing/short in target → dropped or mangled markup → error.
    for (const [token, required] of srcCounts) {
      const present = tgtCounts.get(token) ?? 0;
      if (present < required) {
        findings.push({
          checkId: 'placeholder-markup-preserved',
          severity: 'error',
          message:
            present === 0
              ? `Source ${label} "${token}" is missing from the target; ${label}s must be preserved identically.`
              : `Source ${label} "${token}" appears ${present}× in the target but ${required}× in the source; every ${label} must be preserved identically.`,
          sourceExcerpt: token,
        });
      }
    }

    // Token in target that was never in source (or in excess) → hallucinated
    // markup → warning (surfaced for the reviewer, does not block auto-advance).
    for (const [token, present] of tgtCounts) {
      const required = srcCounts.get(token) ?? 0;
      if (present > required) {
        findings.push({
          checkId: 'placeholder-markup-added',
          severity: 'warning',
          message:
            required === 0
              ? `Target contains ${label} "${token}" that is not present in the source.`
              : `Target contains ${present - required} extra occurrence(s) of ${label} "${token}" beyond the source.`,
          targetExcerpt: token,
        });
      }
    }
  }

  return findings;
};

// ─────────────────────────────────────────────────────────────────────────────
// (3) Untranslated / empty target
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Two surface failure modes around an "un-done" translation:
 *  - An EMPTY (or whitespace-only) target when the source has content is an
 *    ERROR — there is nothing for a reviewer to adjudicate; the draft never ran.
 *  - A target byte-identical to a NON-TRIVIAL, NON-DNT source is a WARNING —
 *    likely the engine echoed the source back untranslated. We exempt:
 *      • trivial sources (too short to be meaningfully translatable — numbers,
 *        single short tokens), which legitimately survive verbatim, and
 *      • sources that are ENTIRELY a DNT identifier (e.g. "21 CFR 312.23"),
 *        which are SUPPOSED to be identical on both sides (dntPreservationCheck
 *        owns that case), so flagging them here would be a false positive.
 */

/** A source is "trivial" if, ignoring surrounding space, it is too small to translate. */
function isTrivialSource(source: string): boolean {
  const t = source.trim();
  if (t.length < 3) return true; // single chars / tiny tokens
  // Pure punctuation/digits/symbols carry no translatable lexical content.
  if (!/\p{L}/u.test(t)) return true;
  return false;
}

export const untranslatedCheck: QaCheck = (input: QaCheckInput): QaFinding[] => {
  const { source, target, glossary } = input;
  const findings: QaFinding[] = [];

  // Empty target against a non-empty source: nothing was produced → error.
  if (isBlank(target) && !isBlank(source)) {
    findings.push({
      checkId: 'empty-target',
      severity: 'error',
      message: 'Target is empty while the source has content; no translation was produced.',
      sourceExcerpt: source.slice(0, 80),
    });
    // Once empty, the identical-copy check below is moot.
    return findings;
  }

  // Identical copy of a non-trivial source → probably untranslated → warning,
  // unless the whole source is a single DNT identifier (legitimately verbatim).
  if (
    !isBlank(source) &&
    source === target &&
    !isTrivialSource(source)
  ) {
    const mg = maskingGlossaryFrom(glossary);
    const spans = detectDntSpans(source, mg);
    // "Entirely a DNT span" iff a single span covers the trimmed source. We
    // compare against the trimmed source so leading/trailing space doesn't
    // defeat the exemption.
    const trimmed = source.trim();
    const wholeSourceIsDnt =
      spans.length === 1 && spans[0].text === trimmed;

    if (!wholeSourceIsDnt) {
      findings.push({
        checkId: 'untranslated-copy',
        severity: 'warning',
        message:
          'Target is identical to the source; the segment may not have been translated.',
        sourceExcerpt: source.slice(0, 80),
        targetExcerpt: target.slice(0, 80),
      });
    }
  }

  return findings;
};

// ─────────────────────────────────────────────────────────────────────────────
// (4) Control characters / mojibake
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Surface the corruption fingerprints a broken encoding round-trip leaves in the
 * TARGET: the U+FFFD REPLACEMENT CHARACTER (lost bytes), classic UTF-8-decoded-
 * as-Latin1 mojibake sequences (Ã©, Â£, â€™ …), and stray literal escape
 * sequences (\\n, \\u00e9, \\x41) that leaked into prose instead of being
 * rendered. These are WARNINGS, not errors: they are strong signals of an
 * encoding/escaping fault for the reviewer, but a human still adjudicates, and a
 * stray backslash is occasionally legitimate (e.g. a path or LaTeX fragment).
 *
 * We deliberately do NOT flag ordinary control whitespace (\n, \t, \r) — those
 * are valid in segment text — only the C0/C1 control range that should never
 * appear in reviewer-facing prose.
 */

/** U+FFFD replacement char — the unambiguous "bytes were lost" marker. */
const REPLACEMENT_CHAR_RE = /�/g;
/**
 * Mojibake from UTF-8 mis-decoded as Latin-1/CP1252: a leading \u00C3 (Ã) or
 * \u00C2 (Â) immediately followed by another high byte (U+0080..U+00FF), or the
 * \u00E2\u20AC lead (â€) of mis-decoded smart punctuation (the ”’“
 * family). Catches the common Ã©, Â£, â€™ shapes without flagging a
 * legitimate standalone accented letter.
 */
const MOJIBAKE_RE = /[\u00C3\u00C2][\u0080-\u00FF]|\u00E2\u20AC/g;
/**
 * Disallowed C0 (U+0000..U+001F) and C1 (U+007F..U+009F) control characters,
 * excluding the three legitimate whitespace controls \t (U+0009), \n (U+000A)
 * and \r (U+000D) that are valid in segment text.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
/** Literal (un-rendered) escape sequences that leaked into prose as text. */
const STRAY_ESCAPE_RE = /\\(?:u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[nrtfvb0])/g;

/** First match of `re` in `text`, or undefined. Fresh regex to avoid bleed. */
function firstMatch(text: string, re: RegExp): string | undefined {
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const m = rx.exec(text);
  return m ? m[0] : undefined;
}

export const controlCharacterCheck: QaCheck = (input: QaCheckInput): QaFinding[] => {
  const { target } = input;
  const findings: QaFinding[] = [];

  // Each probe emits at most one finding (first offending span) so a heavily
  // corrupted target doesn't drown the report; the reviewer-facing message names
  // the class and shows the first occurrence.
  const replacement = firstMatch(target, REPLACEMENT_CHAR_RE);
  if (replacement !== undefined) {
    findings.push({
      checkId: 'replacement-character',
      severity: 'warning',
      message: 'Target contains the Unicode replacement character (U+FFFD), indicating lost or undecodable bytes.',
      targetExcerpt: replacement,
    });
  }

  const moji = firstMatch(target, MOJIBAKE_RE);
  if (moji !== undefined) {
    findings.push({
      checkId: 'mojibake',
      severity: 'warning',
      message: `Target contains a mojibake sequence ("${moji}"), indicating a UTF-8/Latin-1 encoding mismatch.`,
      targetExcerpt: moji,
    });
  }

  const control = firstMatch(target, CONTROL_CHAR_RE);
  if (control !== undefined) {
    // Render the code point, since the raw control char is invisible/garbled.
    const cp = control.codePointAt(0) ?? 0;
    findings.push({
      checkId: 'control-character',
      severity: 'warning',
      message: `Target contains a disallowed control character (U+${cp.toString(16).toUpperCase().padStart(4, '0')}).`,
      targetExcerpt: control,
    });
  }

  const escape = firstMatch(target, STRAY_ESCAPE_RE);
  if (escape !== undefined) {
    findings.push({
      checkId: 'stray-escape',
      severity: 'warning',
      message: `Target contains a literal escape sequence ("${escape}") that appears to have leaked into prose unrendered.`,
      targetExcerpt: escape,
    });
  }

  return findings;
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All structural checks in registration order, for the QA runner to fold over.
 * Co-located so a new structural check is wired in one place (the runner imports
 * this array rather than each check by name).
 */
export const STRUCTURAL_CHECKS: readonly QaCheck[] = [
  dntPreservationCheck,
  placeholderMarkupCheck,
  untranslatedCheck,
  controlCharacterCheck,
];
