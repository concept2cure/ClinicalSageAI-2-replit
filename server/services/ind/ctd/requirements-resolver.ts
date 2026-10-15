/**
 * What a regulatory document or section must contain: the one place that
 * answers it.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The rule that turns a request into requirements lived only inside the AnA
 * tool get_document_section_requirements (server/services/ana/
 * regulatory-knowledge-tools.ts). The drafting paths — batch_draft_sections
 * through AnaDocumentDraftingService, the CSR builder, the RI artifact
 * generator — need the same answer, and the only way to get it was to write
 * the rule again (D2 findings 28, 40 and 74, 2026-10-05). Two copies of "what
 * must 2.7.4 contain" can disagree; one cannot. The tool is now a thin wrapper
 * over this module, and its JSON output is unchanged
 * (tests/regulatory/requirements-resolver.test.ts pins it byte for byte).
 *
 * ── Routing, in order ────────────────────────────────────────────────────────
 *   1. A CSR alias ("csr", "clinical study report", "e3", ...) → the ICH E3
 *      outline, or one heading of it when `section` is given.
 *   2. A CTD code (normalizeCtdCode, the strict placement gate) → the section
 *      brief: exact entry, nearest registered ancestor, or the listing of a
 *      parent's registered children.
 *   3. Anything else → a lifecycle document type by id (case-insensitive).
 *   4. Nothing matched → not_indexed, with what the record does index. It is
 *      never another entry's answer and never the model's memory.
 *
 * Later steps of docs/design/ANA_REGULATORY_RECORD.md §7 extend this routing
 * (jurisdiction scope, regional Module 1, registry ids, free text with
 * `candidates`); they extend it here, never beside it.
 *
 * Imports the brief renderers and is imported by none of them:
 * csr-e3-guidance.ts already imports `clip` from section-brief.ts, so a
 * resolver inside section-brief.ts would close a cycle.
 *
 * Deterministic and pure: no I/O, no model.
 *
 * @module server/services/ind/ctd/requirements-resolver
 */

import { normalizeCtdCode } from '../../../../shared/regulatory/section-code';
import { e3BasisFor, E3_REPORT_NOTES, getE3Section, renderE3Brief } from './csr-e3-guidance.js';
import { listLifecycleIds, renderLifecycleBrief, renderSectionBrief, resolveSectionBriefSource } from './section-brief.js';
import { LIFECYCLE_DOCUMENT_TYPES } from './lifecycle-document-types.js';
import type { E3Basis } from './types.js';

/** The most one rendered requirements text may weigh, in characters. */
export const REQUIREMENTS_BRIEF_CHARS = 4200;

/** The words that ask for a clinical study report, lower-cased. */
const CSR_ALIASES: ReadonlySet<string> = new Set(['csr', 'clinical study report', 'clinical_study_report', 'e3', 'ich e3']);

export interface RequirementQuery {
  /** A CTD section code, a lifecycle document type id, or a CSR alias. */
  document: string;
  /** With a CSR alias: the ICH E3 heading number. Omit for the outline. */
  section?: string;
}

/** Which record answered. */
export type RequirementSource =
  | { kind: 'ctd-section'; code: string }
  | { kind: 'lifecycle'; id: string }
  | { kind: 'outline'; outlineId: 'csr-e3'; section?: string };

export type RequirementMatch = 'exact' | 'ancestor' | 'parent' | 'outline';

export type RequirementAnswer =
  | {
      kind: 'answer';
      source: RequirementSource;
      match: RequirementMatch;
      title: string;
      /** The rendered brief, at most REQUIREMENTS_BRIEF_CHARS. */
      requirements: string;
      /**
       * The typed basis the answering record carries. ICH E3 headings and the
       * E3 outline carry one; CTD sections and lifecycle types do not yet
       * (their references are in the rendered text), so this is empty for them
       * until the section-basis step gives every code a default.
       */
      basis: E3Basis[];
    }
  /** Ambiguous free text: every reading, never a pick. Declared for the free-text step; nothing returns it yet. */
  | { kind: 'candidates'; candidates: Array<{ source: RequirementSource; title: string }> }
  | {
      kind: 'not_indexed';
      /** Said to the reader as is. */
      reason: string;
      /** The document types the record does index, when listing them helps. */
      indexedDocuments?: string[];
    };

function dedupeBasis(bases: E3Basis[]): E3Basis[] {
  const seen = new Set<string>();
  return bases.filter((b) => (seen.has(b.ref) ? false : (seen.add(b.ref), true)));
}

function resolveCsr(section: string): RequirementAnswer {
  const requirements = renderE3Brief(section || null, REQUIREMENTS_BRIEF_CHARS);
  if (!requirements) {
    return { kind: 'not_indexed', reason: `ICH E3 has no heading "${section}". Omit \`section\` for the outline of §1–§16.` };
  }
  if (!section) {
    return {
      kind: 'answer',
      source: { kind: 'outline', outlineId: 'csr-e3' },
      match: 'outline',
      title: 'ICH E3 clinical study report — outline',
      requirements,
      basis: dedupeBasis(E3_REPORT_NOTES.map((n) => n.basis)),
    };
  }
  const heading = getE3Section(section)!;
  return {
    kind: 'answer',
    source: { kind: 'outline', outlineId: 'csr-e3', section: heading.number },
    match: 'exact',
    title: heading.title,
    requirements,
    basis: e3BasisFor(heading),
  };
}

function resolveCtd(document: string): RequirementAnswer | null {
  const src = resolveSectionBriefSource(document);
  const requirements = renderSectionBrief(document, REQUIREMENTS_BRIEF_CHARS);
  if (!src || !requirements) return null;
  if (src.kind === 'parent') {
    return {
      kind: 'answer',
      source: { kind: 'ctd-section', code: src.requested },
      match: 'parent',
      title: `${src.requested} — the sections it contains`,
      requirements,
      basis: [],
    };
  }
  return {
    kind: 'answer',
    source: { kind: 'ctd-section', code: src.entry!.code },
    match: src.kind,
    title: src.entry!.title,
    requirements,
    basis: [],
  };
}

function resolveLifecycle(key: string): RequirementAnswer | null {
  const requirements = renderLifecycleBrief(key, REQUIREMENTS_BRIEF_CHARS);
  const dt = LIFECYCLE_DOCUMENT_TYPES.find((d) => d.id === key);
  if (!requirements || !dt) return null;
  return { kind: 'answer', source: { kind: 'lifecycle', id: dt.id }, match: 'exact', title: dt.label, requirements, basis: [] };
}

/** What `q` must contain, from the canonical record; `not_indexed` when the record does not say. */
export function resolveRequirements(q: RequirementQuery): RequirementAnswer {
  const document = String(q.document ?? '').trim();
  const section = String(q.section ?? '').trim();
  const key = document.toLowerCase();

  if (CSR_ALIASES.has(key)) return resolveCsr(section);

  const found = normalizeCtdCode(document) ? resolveCtd(document) : resolveLifecycle(key);
  if (found) return found;

  return {
    kind: 'not_indexed',
    reason: `The platform's guidance has no entry for "${document}". It is not stated here; do not supply requirements from memory as if it were.`,
    indexedDocuments: [...listLifecycleIds(), 'csr'],
  };
}
