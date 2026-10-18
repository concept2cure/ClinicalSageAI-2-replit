import { buildIndPyramid } from '../../../services/regulatory/pyramids/ind-pyramid';
import { getAllINDSections } from '../../../services/regulatory/ind-ectd-sections';
import { normalizeCtdCode } from '../../../shared/regulatory/section-code';
import type { IndDocumentCatalog, IndDocumentCatalogDeliverable, IndDocumentCatalogPhase, IndDocumentCatalogSection } from '../../../shared/authoring/ind-document-catalog';
import type { INDSection } from '../../../services/regulatory/ind-ectd-sections';
import type { PyramidTask, SubTask } from '../../../services/regulatory/pyramids/types';

/** A source definition may be worked on without being a model-authored
 * deliverable. Exact canonical section limits take precedence. The pyramid's
 * signed forms/receipts lack section bindings, so their recorded output labels
 * also rule out producing an official record as narrative prose. */
function narrativeDraftable(title: string, taskId: string, sectionCodes: string[], artifactTypes: string[], sections: INDSection[]): boolean {
  const codes = new Set(sectionCodes.map(code => normalizeCtdCode(code)).filter(Boolean));
  const associated = sections.filter(section => section.pyramidTaskId === taskId || codes.has(normalizeCtdCode(section.code)));
  if (associated.some(section => !section.aiDraftable)) return false;
  if (artifactTypes.some(type => /(?:^fda_form$|_data$|dataset|signature|acknowledg|^glp_statement$)/i.test(type))) return false;
  return !/\b(?:signed|signatures?|(?:FDA\s+)?form\s+(?:FDA\s+)?(?:1571|1572|3674)|acknowledg(?:e)?ment|raw\s+data|data\s+tables|tabulated|certificates?|datasets?|GLP\s+(?:compliance\s+)?statements?|eCTD|archived\s+submission|attendance\s+log)\b/i.test(title);
}

function catalogSections(canonical: INDSection[], tasks: Map<string, PyramidTask>): IndDocumentCatalogSection[] {
  return canonical.filter(section => section.depth > 0).map(section => ({
    id: `section:${section.code}`, code: section.code, title: section.title, module: section.module,
    parentCode: section.parentCode, taskId: section.pyramidTaskId,
    phaseId: section.pyramidTaskId ? tasks.get(section.pyramidTaskId)?.phaseId ?? null : null,
    required: section.required, aiDraftable: section.aiDraftable, authoringMode: section.authoringMode,
    description: section.description, regulatoryRef: section.regulatoryRef,
  }));
}

type DeliverableContext = Omit<IndDocumentCatalogDeliverable, 'id' | 'title' | 'aiDraftable'>;

function taskDeliverableContext(task: PyramidTask, phase: IndDocumentCatalogPhase | undefined): DeliverableContext {
  const bindings = task.documentBindings ?? [];
  const sectionCodes = [...new Set(bindings.map(binding => binding.ctdSection))];
  const moduleCode = sectionCodes.map(code => normalizeCtdCode(code)).find(Boolean);
  return { phaseId: task.phaseId, phaseName: phase?.name ?? task.phaseId, taskId: task.id,
    taskName: task.name, module: moduleCode ? `M${moduleCode[0]}` : null, sectionCodes,
    artifactTypes: [...new Set(bindings.flatMap(binding => binding.artifactTypes ?? []))],
    description: task.description ?? null, guidance: task.guidance ?? null };
}

function subtaskDeliverable(subtask: SubTask, base: DeliverableContext, sections: INDSection[]): IndDocumentCatalogDeliverable[] {
  const title = subtask.deliverable ?? subtask.documentBinding?.sectionTitle;
  if (!title) return [];
  const code = subtask.documentBinding?.ctdSection;
  const normalized = normalizeCtdCode(code);
  const sectionCodes = code ? [code] : base.sectionCodes;
  const artifactTypes = subtask.documentBinding?.artifactTypes ?? base.artifactTypes;
  return [{ ...base, id: `${base.taskId}:subtask:${subtask.id}`, title,
    sectionCodes, module: normalized ? `M${normalized[0]}` : base.module, artifactTypes,
    aiDraftable: narrativeDraftable(title, base.taskId, sectionCodes, artifactTypes, sections) }];
}

function taskDeliverables(task: PyramidTask, phase: IndDocumentCatalogPhase | undefined, sections: INDSection[]): IndDocumentCatalogDeliverable[] {
  const base = taskDeliverableContext(task, phase);
  const deliverables = (task.deliverables ?? []).map((title, index) => ({
    ...base, id: `${task.id}:deliverable:${index}`, title,
    aiDraftable: narrativeDraftable(title, task.id, base.sectionCodes, base.artifactTypes, sections),
  }));
  const subtaskOutputs = (task.subTasks ?? []).flatMap(subtask => subtaskDeliverable(subtask, base, sections));
  return [...deliverables, ...subtaskOutputs];
}

/** Include the entire work pyramid, including preparation, FDA engagement,
 * quality, nonclinical, clinical, summaries, administration and submission.
 * Section metadata retains the canonical limits on forms and AI drafting. */
export function buildIndDocumentCatalogSource(): IndDocumentCatalog {
  const pyramid = buildIndPyramid();
  const phases = pyramid.phases.map(({ id, name, order }) => ({ id, name, order }));
  const tasks = new Map(pyramid.tasks.map(task => [task.id, task]));
  const canonicalSections = getAllINDSections();
  const sections = catalogSections(canonicalSections, tasks);
  const deliverables = pyramid.tasks.flatMap(task => taskDeliverables(task, phases.find(phase => phase.id === task.phaseId), canonicalSections));
  return { submissionType: 'IND', phases, sections, deliverables };
}
