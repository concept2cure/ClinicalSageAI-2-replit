/**
 * The document open in front of AnA: what type it is, and what that type must
 * contain, for the turn (D2, 2026-10-15; founder-directed: "enhance her acumen
 * … protocols, SOPs, IND documentation, BLA").
 *
 * Before this, nothing told a turn the open document's type: the client sent
 * `document_context` as {section, module}, the editor's recorded template
 * identity went into `module_context` (which the stream route never reads),
 * and `orchestrate()` chose a template from the words of the message alone.
 *
 * The type comes from, in order:
 *   1. the exact saved section's retained reference, or its saved document's
 *      recorded template when no section is selected. Current actor, project
 *      and VIEW admission precede these reads on the request's executor;
 *   2. a `documentType` the surface states (Protocol Development, QMS, IB …),
 *      accepted only when it resolves to a registry id.
 * A section's validated assembly reference overrides its parent. Anything else
 * is no type, never a guess. Whole-document requirements are the registry
 * outline the platform already holds (`getRegistryDocumentTemplate`), with its
 * basis label, so a recall or platform-convention outline reads as such.
 */
import { parseRecordedTemplateSource } from '../../../shared/authoring/recorded-template-source.js';
import { getApplicationType, GLOBAL_REGISTRY } from '../../../shared/regulatory/global-document-registry.js';
import { resolveToRegistryId } from '../../../shared/regulatory/submission-type-bridge.js';
import {
  componentTemplateIdForRegistry,
  getRegistryDocumentTemplate,
  type DocumentTemplateStructure,
} from '../market-specs/document-template-library.js';
import { sanitizeLine } from './surface-context-block.js';
import { builtinTemplateSnapshot, getBuiltinAuthoringTemplate } from '../authoring/builtin-authoring-templates.js';
import { readSavedOpenTemplate, type OpenDocumentAccess, type SavedOpenSectionReference } from './saved-open-template';
export type { OpenDocumentAccess } from './saved-open-template';

/** The most the open-document brief may weigh, in characters (it rides the cached system prefix). */
export const OPEN_DOCUMENT_BRIEF_CHARS = 3200;

export type OpenDocumentSource = 'saved-template' | 'surface';

export interface OpenDocument {
  registryId: string;
  /** The registry's name for the type. */
  label: string;
  source: OpenDocumentSource;
  /** The registry outline, when the platform holds one for this type. */
  outline: DocumentTemplateStructure | null;
  /**
   * A saved document whose recorded template snapshot is not the template's
   * current one: the outline shown is today's, not the one it was built from
   * (review finding, 2026-10-18, when the PAS, CBE, IND annual report and
   * meeting outlines changed under the same template id). Absent otherwise.
   */
  builtFromEarlierOutline?: true;
}

export const OPEN_DOCUMENT_UNREAD: OpenDocumentResult = {
  document: null,
  problem: "the saved document's template could not be read this turn",
};

export interface OpenDocumentResult {
  document: OpenDocument | null;
  /** Actual persisted state observed by the admitted VIEW policy. */
  documentStatus?: string;
  /** Exact section reference replaces the parent-only current outline. */
  sectionReference?: { block: string; registryId: string | null; label: string; sectionCode: string | null };
  /** Set when a stated or recorded type could not be read; said to the model, never hidden. */
  problem?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only these identities select saved authoring context; codes alone are advisory surface data. */
export function hasSavedAuthoringSelector(context?: Record<string, unknown> | null): boolean {
  if (!context) return false;
  return (typeof context.artifactId === 'string' && UUID.test(context.artifactId)) ||
    context.workflowStage === 'section-workspace' || Object.hasOwn(context, 'sectionId');
}

/** The registry id a recorded template entry names: `registry:<id>`, or a component outline's registry. */
export function registryIdForTemplateEntry(entryId: string, filingRegistryId: string | null | undefined): string | null {
  if (filingRegistryId && getApplicationType(filingRegistryId)) return filingRegistryId;
  const m = /^(registry|component):(.+)$/.exec(entryId);
  if (!m) return null;
  if (m[1] === 'registry') return getApplicationType(m[2]) ? m[2] : null;
  const owner = GLOBAL_REGISTRY.find((e) => componentTemplateIdForRegistry(e.id) === m[2]);
  return owner ? owner.id : null;
}

/** A surface-stated type, accepted only when it resolves to a registry id. */
export function registryIdForStatedType(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 80) return null;
  const direct = value.trim().toUpperCase();
  if (getApplicationType(direct)) return direct;
  const resolved = resolveToRegistryId(value);
  return resolved && getApplicationType(resolved) ? resolved : null;
}

/**
 * The document-type line the persona may print for a client-stated type: the
 * registry id and its name, or that the stated type is not a registry type.
 * Never the client's own text.
 */
export function statedTypeLine(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const id = registryIdForStatedType(value);
  return id ? `${id} (${getApplicationType(id)!.displayName})` : 'stated by the client, not a platform registry type';
}

async function fromSavedRecord(
  row: { template_id: unknown; provenance: unknown },
): Promise<OpenDocumentResult | null> {
  // The record exists, so it — not a client label — decides the type.
  const noRegistryType: OpenDocumentResult = { document: null, problem: "the saved document's recorded template is not a platform registry document type" };
  if (row.template_id == null) return { document: null, problem: 'the saved document has no recorded template' };
  const provenance = row.provenance && typeof row.provenance === 'object' ? (row.provenance as Record<string, unknown>) : {};
  let source;
  try {
    source = parseRecordedTemplateSource(provenance.templateSource, row.template_id);
  } catch {
    return { document: null, problem: "the saved document's recorded template could not be verified" };
  }
  if (!source) return { document: null, problem: 'the saved document has no recorded template' };
  const registryId = registryIdForTemplateEntry(source.entryId, source.filingContext?.registryId);
  if (!registryId) return noRegistryType;
  const document = await describe(registryId, 'saved-template');
  const current = await currentTemplateSnapshot(source.id);
  return { document: current && current !== source.sha256 ? { ...document, builtFromEarlierOutline: true } : document };
}

/**
 * A builtin template's current snapshot, built once per process: the outlines
 * are deterministic code, so the snapshot only changes with a deploy. Building
 * it on every turn with a saved document open cost 50–140 ms of blocking CPU
 * (review finding, 2026-10-18). Null for an id that is not a builtin template.
 */
const SNAPSHOTS = new Map<string, Promise<string | null>>();
function currentTemplateSnapshot(templateId: string): Promise<string | null> {
  let snapshot = SNAPSHOTS.get(templateId);
  if (!snapshot) {
    snapshot = getBuiltinAuthoringTemplate(templateId).then((t) => (t ? builtinTemplateSnapshot(t) : null));
    SNAPSHOTS.set(templateId, snapshot);
  }
  return snapshot;
}

async function describe(registryId: string, source: OpenDocumentSource): Promise<OpenDocument> {
  const entry = getApplicationType(registryId)!;
  return { registryId, label: entry.displayName, source, outline: (await getRegistryDocumentTemplate(registryId)) ?? null };
}

interface OpenDocumentParams {
  authoringContext?: Record<string, unknown> | null;
  documentContext?: Record<string, unknown> | null;
  organizationId?: number | null;
  access?: OpenDocumentAccess;
}

function savedSectionId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('Invalid saved section selector');
  return value.toLowerCase();
}

function sectionResult(section: SavedOpenSectionReference): OpenDocumentResult {
  const source = section.source;
  const registryId = typeof source?.entryId === 'string'
    ? registryIdForTemplateEntry(source.entryId, (source.filingContext as { registryId?: string | null } | undefined)?.registryId) : null;
  const label = registryId ? getApplicationType(registryId)!.displayName : String(source?.entryId ?? 'saved section with unverified template identity');
  return { document: null, sectionReference: { block: section.block, registryId, label, sectionCode: section.code } };
}

async function savedResult(params: OpenDocumentParams, artifactId: string): Promise<OpenDocumentResult> {
  const { organizationId } = params;
  if (!organizationId || !Number.isSafeInteger(organizationId) || organizationId < 1) throw new Error('Saved authoring organization could not be verified');
  const saved = await readSavedOpenTemplate({ artifactId: artifactId.toLowerCase(), organizationId,
    sectionId: savedSectionId(params.authoringContext?.sectionId), access: params.access });
  const result = saved.section ? sectionResult(saved.section) : (await fromSavedRecord(saved.header)) ?? { document: null };
  return { ...result, documentStatus: saved.documentStatus };
}

/** Saved selectors require current admission; only a surface-only type can use its stated classification. */
export async function resolveOpenDocument(params: OpenDocumentParams): Promise<OpenDocumentResult> {
  const { authoringContext, documentContext } = params;
  const artifactId = authoringContext?.artifactId;
  if (typeof artifactId === 'string' && UUID.test(artifactId)) return savedResult(params, artifactId);
  if (hasSavedAuthoringSelector(authoringContext)) throw new Error('Saved authoring identity could not be verified');
  const stated = authoringContext?.documentType ?? documentContext?.documentType;
  if (stated === undefined || stated === null || stated === '') return { document: null };
  const registryId = registryIdForStatedType(stated);
  if (!registryId) return { document: null, problem: 'the surface named a document type the platform registry does not hold' };
  return { document: await describe(registryId, 'surface') };
}

function sectionLine(s: DocumentTemplateStructure['sections'][number]): string {
  const purpose = sanitizeLine(s.purpose, 160);
  return `- ${sanitizeLine(s.number, 16)} ${sanitizeLine(s.heading, 120)}${s.required ? '' : ' (optional)'}${purpose ? ` — ${purpose}` : ''}`;
}

/**
 * The block the turn carries: the type, its outline with basis and limitations,
 * capped. Every value is sanitized; the outline comes from the platform's
 * records, never from the client.
 */
export function renderOpenDocumentBlock(result: OpenDocumentResult): string {
  if (result.sectionReference) return result.sectionReference.block;
  const { document, problem } = result;
  if (!document) {
    return problem ? `## OPEN DOCUMENT\nThe type of the document open in front of you is not known: ${problem}. Ask, or read it, before relying on a type.` : '';
  }
  const lines = [
    '## OPEN DOCUMENT',
    `The person is working in a ${sanitizeLine(document.label, 120)} (registry ${document.registryId}; ${document.source === 'saved-template' ? "from the saved document's recorded template" : 'stated by the surface'}).`,
  ];
  const o = document.outline;
  if (!o) {
    lines.push('The platform holds no outline for this type. Use the agency or client template; do not supply a structure from memory as if it were the requirement.');
    return lines.join('\n');
  }
  if (document.builtFromEarlierOutline) {
    lines.push("This document was built from an earlier version of its template. The outline below is the platform's current one, so the document's own sections may differ from it: read them before relying on this outline.");
  }
  lines.push(`What it contains (${sanitizeLine(o.regulatoryBasis, 240)}):`);
  for (const lim of o.outlineLimitations ?? []) lines.push(`Limitation: ${sanitizeLine(lim, 240)}`);
  if (o.frontMatter?.length) lines.push(`Front matter: ${o.frontMatter.map((f) => sanitizeLine(f.heading, 80)).join('; ')}`);
  let body = lines.join('\n');
  let shown = 0;
  for (const s of o.sections) {
    const subs = (s.subsections ?? []).map((c) => `\n  ${sectionLine(c)}`).join('');
    const next = `\n${sectionLine(s)}${subs}`;
    if (body.length + next.length > OPEN_DOCUMENT_BRIEF_CHARS - 120) break;
    body += next;
    shown++;
  }
  if (shown < o.sections.length) {
    body += `\n… ${o.sections.length - shown} more sections: call get_document_template with registry_id ${document.registryId}.`;
  }
  return `${body}\nAnswer for this document type. Where the section in front of you has its own requirements, those are given separately.`;
}

/**
 * The authoring context the open-document read sees: the turn's pack, plus a
 * type the surface stated in `document_context` (useAnaChat, from
 * surfaceContext.documentType) when the pack names none. Still only a stated
 * type — resolveOpenDocument accepts it only as a registry id.
 */
export function withStatedDocumentType(
  authoringContext: Record<string, unknown> | undefined,
  documentContext: unknown,
): Record<string, unknown> | undefined {
  const stated = documentContext && typeof documentContext === 'object'
    ? (documentContext as Record<string, unknown>).documentType
    : undefined;
  if (typeof stated !== 'string' || authoringContext?.documentType) return authoringContext;
  return { ...(authoringContext ?? {}), documentType: stated };
}

/** What the route prefetch returns about the open document. */
export interface OpenDocumentTurnFields {
  /** The open document's type and outline ('' when no type is known or stated). */
  openDocumentBlock?: string;
  /** The open document's registry id, when one was resolved — never a client label. */
  openDocumentRegistryId?: string | null;
  /** Its registry name, for the tool-selection signal. */
  openDocumentLabel?: string | null;
  /** Actual admitted saved section code; never its mutable client copy. */
  openDocumentSectionCode?: string | null;
  /** Actual state read for current VIEW; unknown when saved context is unavailable. */
  openDocumentStatus?: string | null;
}

type Bounded = <T>(source: string, load: () => Promise<T>) => Promise<T>;

/** The prefetch's read of the open document, under its deadline ('open document type' when it fails). */
export function openDocumentForTurn(
  authoringContext: Record<string, unknown> | null | undefined,
  organizationId: number | null | undefined,
  bounded: Bounded,
  access?: OpenDocumentAccess,
): Promise<OpenDocumentResult> {
  if (!authoringContext) return Promise.resolve({ document: null });
  return bounded('open document type', () => resolveOpenDocument({ authoringContext, organizationId, access }));
}

/** The settled read as turn fields: a failed read is said to be unread, never a turn with no type. */
export function openDocumentFields(settled: PromiseSettledResult<OpenDocumentResult>): OpenDocumentTurnFields {
  const result = settled.status === 'fulfilled' ? settled.value : OPEN_DOCUMENT_UNREAD;
  return {
    openDocumentBlock: renderOpenDocumentBlock(result),
    openDocumentRegistryId: result.sectionReference ? result.sectionReference.registryId : result.document?.registryId ?? null,
    openDocumentLabel: result.sectionReference?.label ?? result.document?.label ?? null,
    openDocumentSectionCode: result.sectionReference?.sectionCode ?? null,
    openDocumentStatus: result.documentStatus ?? null,
  };
}
