/** Pure, versioned assembly planning. Every existing row remains untouched. */
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import type { AssemblyPlan, AssemblyPlanRow, AssemblyPreviewInput, AssemblyCommitInput, AssemblySelection } from '../../../shared/authoring/assembly';
import type { TemplateSectionSeed } from './authoring-template-sections';
import { readAssemblySourceSelectors, type AssemblySourceManifest } from '../../../shared/authoring/assembly-sources';

export class AssemblyError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 404 | 409 | 503, readonly code: string, message: string) { super(message); }
}
export const assemblyCodeKey = (code: string): string => code.trim().toUpperCase();
export const assemblyHash = (value: unknown): string => createHash('sha256').update(stableStringify(value)).digest('hex');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT32_MAX = 2_147_483_647;
export type AssemblyDocument = Record<string, unknown> & { id: string; module: string | null; client_program_id: string; status: string };
export type AssemblyStoredSection = Record<string, unknown> & {
  id: string; doc_id: string; code: string; title: string; content: string | null; order_index: number; updated_at: string | Date | null;
};
export interface AssemblyTemplate {
  id: string; name: string; snapshot: string; sections: TemplateSectionSeed[];
  aiDraftable: boolean; aiDraftableReason: string; limitations: string[];
  draftRegion: string | null;
  /** Actual bound filing identity, independent of immutable template provenance. */
  filingSnapshot?: string;
  /** Server-read immutable source and guide metadata, not accepted from a client. */
  metadataFor: (code: string) => Record<string, unknown>;
  guidanceFor: (code: string) => string | undefined;
  draftingModeFor?: (code: string) => 'narrative' | 'manual' | undefined;
}

export function parseAssemblyInput(raw: unknown, commit = false): AssemblyPreviewInput | AssemblyCommitInput {
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (typeof body.programId !== 'string' || !UUID.test(body.programId) || typeof body.templateId !== 'string' || !UUID.test(body.templateId)) {
    throw new AssemblyError(400, 'ASSEMBLY_INPUT_INVALID', 'Choose an exact project and template. Nothing was changed.');
  }
  const value: AssemblyPreviewInput = { programId: body.programId.toLowerCase(), templateId: body.templateId.toLowerCase(), selection: parseSelection(body.selection) };
  if (body.sources !== undefined) {
    const sources = readAssemblySourceSelectors(body.sources);
    if (!sources) throw new AssemblyError(400, 'ASSEMBLY_SOURCES_INVALID', 'Choose one to five exact sources from this project. Nothing was changed.');
    value.sources = sources;
  }
  return commit ? parseCommit(body, value) : value;
}

function parseSelection(raw: unknown): AssemblySelection {
  const selection = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  if (selection.target !== 'document' && !(selection.target === 'section' && typeof selection.code === 'string' && selection.code.trim())) {
    throw new AssemblyError(400, 'ASSEMBLY_SELECTION_INVALID', 'Choose the whole document or an exact template section. Nothing was changed.');
  }
  return selection.target === 'document' ? { target: 'document' } : { target: 'section', code: String(selection.code).trim() };
}

function parseCommit(body: Record<string, unknown>, value: AssemblyPreviewInput): AssemblyCommitInput {
  if (typeof body.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.fingerprint) ||
      typeof body.reason !== 'string' || body.reason.trim().length < 8 || body.reason.trim().length > 2000) {
    throw new AssemblyError(400, 'ASSEMBLY_CONFIRMATION_REQUIRED', 'Preview the plan and state a reason of 8 to 2000 characters before building. Nothing was changed.');
  }
  return { ...value, fingerprint: body.fingerprint, reason: body.reason.trim() };
}

function checkedTemplateRows(template: AssemblyTemplate): TemplateSectionSeed[] {
  if (template.sections.length < 1) throw new AssemblyError(409, 'ASSEMBLY_TEMPLATE_INVALID', 'The template has no sections to assemble. Nothing was changed.');
  const keys = new Set<string>();
  const rows = template.sections.map((row, index) => {
    if (!row.code.trim() || !row.title.trim() || !Number.isFinite(row.ordering) || keys.has(assemblyCodeKey(row.code))) {
      throw new AssemblyError(409, 'ASSEMBLY_TEMPLATE_INVALID', 'The template has missing or repeated section identities. Repair the template before building. Nothing was changed.');
    }
    keys.add(assemblyCodeKey(row.code));
    return { ...row, index };
  });
  return rows.sort((a, b) => a.ordering - b.ordering || a.index - b.index);
}

function chosenTemplateRows(template: AssemblyTemplate, selection: AssemblySelection): TemplateSectionSeed[] {
  const rows = checkedTemplateRows(template);
  const key = selection.target === 'section' ? assemblyCodeKey(selection.code) : null;
  const chosen = key === null ? rows : rows.filter(row => assemblyCodeKey(row.code) === key);
  if (!chosen.length) throw new AssemblyError(404, 'ASSEMBLY_SECTION_NOT_FOUND', 'The selected section is not in this template. Nothing was changed.');
  return chosen;
}

/** Reference terms choose an excerpt; they do not establish source support. */
export function assemblySourceQuery(module: string | null, template: AssemblyTemplate, selection: AssemblySelection): string {
  if (selection.target === 'document') return `${module ?? ''} ${template.name} `;
  const [row] = chosenTemplateRows(template, selection);
  return `${row.title} ${template.guidanceFor(row.code) ?? ''}`;
}

function currentSections(rows: AssemblyStoredSection[]): Map<string, AssemblyStoredSection> {
  const map = new Map<string, AssemblyStoredSection>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.order_index) || row.order_index > INT32_MAX || row.order_index < -2_147_483_648 || map.has(assemblyCodeKey(row.code))) {
      throw new AssemblyError(409, 'ASSEMBLY_STRUCTURE_REQUIRES_REVIEW', 'The current document has ambiguous codes or missing section order. Review its structure before building. Nothing was changed.');
    }
    map.set(assemblyCodeKey(row.code), row);
  }
  return map;
}

function rowDrafting(template: AssemblyTemplate, code: string) {
  if (template.draftingModeFor?.(code) === 'manual') return { aiDraftable: false,
    aiDraftableReason: 'This section requires manual source preparation; retain the original outputs, forms and signed records.' };
  return { aiDraftable: template.aiDraftable, aiDraftableReason: template.aiDraftableReason };
}

function plannedRow(row: TemplateSectionSeed, saved: AssemblyStoredSection | undefined, ordering: number, template: AssemblyTemplate): AssemblyPlanRow {
  const content = saved ? saved.content ?? '' : row.content;
  const gaps = content.trim() ? [] : ['No authored text is stored for this section.'];
  const draftingGuidance = template.guidanceFor(row.code);
  return { code: saved?.code ?? row.code, title: saved?.title ?? row.title, content,
    ordering: saved?.order_index ?? ordering, disposition: saved ? 'preserve' : 'append',
    ...(saved ? { existingSectionId: saved.id } : {}), ...rowDrafting(template, row.code),
    ...(draftingGuidance ? { draftingGuidance } : {}), gaps };
}

export function buildAssemblyPlan(doc: AssemblyDocument, existing: AssemblyStoredSection[], template: AssemblyTemplate, input: AssemblyPreviewInput, sources?: AssemblySourceManifest): AssemblyPlan {
  const current = currentSections(existing);
  const chosen = chosenTemplateRows(template, input.selection);
  let next = existing.length ? Math.max(...existing.map(row => row.order_index)) + 1 : 0;
  const rows = chosen.map(row => {
    const saved = current.get(assemblyCodeKey(row.code));
    const plan = plannedRow(row, saved, next, template);
    if (!saved) next++;
    return plan;
  });
  if (next - 1 > INT32_MAX) throw new AssemblyError(409, 'ASSEMBLY_ORDER_OVERFLOW', 'The document has no remaining section order positions. Review its structure before building. Nothing was changed.');
  const base = { version: 1 as const, docId: doc.id, programId: input.programId, templateId: template.id, selection: input.selection,
    targetSnapshot: assemblyHash({ document: doc, sections: existing,
      ...(template.filingSnapshot ? { filingSnapshot: template.filingSnapshot } : {}) }), templateSnapshot: template.snapshot,
    templateName: template.name, draftRegion: template.draftRegion, limitations: template.limitations, rows,
    gaps: rows.flatMap(row => row.gaps.map(gap => `${row.code}: ${gap}`)), ...(sources ? { sources } : {}) };
  return { ...base, fingerprint: assemblyHash(base) };
}
