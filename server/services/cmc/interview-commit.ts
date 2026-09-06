/**
 * Interview → register commit: project a completed CMC interview onto the
 * CMC registers that feed Module 3.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * The guided CMC interview (flows/cmc-specification.ts) ends in a completion
 * event whose `answers` went nowhere: no register row, no canonical source
 * object, nothing Module 3 could compose from (CMC capture evaluation item 5).
 *
 * ── Two halves, deliberately separated ───────────────────────────────────────
 *
 *   buildInterviewCommitPlan   PURE. answers → [{ register, body }]. One entry
 *                              per record the answers describe. A field the
 *                              interview did not ask, or the user did not
 *                              answer, is ABSENT from the body — never
 *                              defaulted. A register column the answers cannot
 *                              fill stays unfilled; the write path refuses the
 *                              record and the refusal is reported. Every
 *                              answered field is either consumed by an entry or
 *                              returned in `unprojected` with the reason, so no
 *                              answer evaporates silently.
 *
 *   commitInterviewSession     Bookkeeping around an injected RegisterWriter:
 *                              load the session (org-scoped), refuse without a
 *                              project or an incomplete session, write each
 *                              entry, record every ref, and move the session to
 *                              'committed' only when EVERY entry landed. A
 *                              failure mid-way leaves the status at 'complete',
 *                              persists what did land (so a retry skips it) and
 *                              reports it. Partial commits are reported, not
 *                              hidden.
 *
 * ── Why the production writer is NOT wired ───────────────────────────────────
 * Every register's canonical write path is an HTTP handler in
 * server/api/cmc/routes.ts — zod body parse, governed-field stripping, the
 * drizzle insert, and `linkToModule3` (the awaited canonical write-through) —
 * with no service function beneath it and no in-process way to invoke it with
 * a tenant context. Re-implementing those steps here would be a second write
 * path for the same registers, which the working agreement forbids; editing
 * routes.ts is outside this change. So `notWiredRegisterWriter` refuses, by
 * name, and the commit reports the refusal. The extraction it needs is listed
 * on INTERVIEW_REGISTER_WRITE_PATHS.
 *
 * ── Projection rules ─────────────────────────────────────────────────────────
 *   • prose answers go to the register's TEXT columns as typed;
 *   • a select/multi-select answer is recorded as its option LABEL, resolved
 *     from the flow definition (the register is read by people, and 'pilot'
 *     is the interview's vocabulary, not the record's);
 *   • a jsonb ROW column (components, CPPs, IPCs, equipment) takes ONE ROW PER
 *     LINE of the answer, the line as typed with its bullet stripped — never a
 *     parsed structure the user did not enter;
 *   • several short answers that belong to one text column (§3.2.S.2.6
 *     process development) are joined as "Label: value" paragraphs.
 *   • a constant appears only where the QUESTION fixes it: the container
 *     closure node asks about the drug product's primary system, so that entry
 *     is scope 'drug_product' / componentType 'primary'.
 *
 * @module server/services/cmc/interview-commit
 */

import type { FlowCategory, FlowDefinition } from '../../../shared/types/intelligence-questions.js';
import { createCmcSpecificationFlow } from '../ana/intelligence-questions/flows/cmc-specification.js';
import {
  loadInterviewSession,
  markInterviewSessionCommitted,
  recordCommittedRecordRefs,
  InterviewSessionError,
  type CommittedRecordRef,
  type InterviewSession,
  type InterviewSessionStatus,
  type Queryable,
} from './interview-sessions.js';

/* ─── Registers ──────────────────────────────────────────────────────────── */

export type InterviewRegister =
  | 'drug_substance'
  | 'drug_product'
  | 'container_closure'
  | 'manufacturing_process'
  | 'formulation_record'
  | 'material_spec'
  | 'characterization_study';

/**
 * Where each register is written today, and what a production writer needs
 * extracted from it. `handler` names the Express handler whose body — parse,
 * insert, Module 3 link — is the one canonical write for that register.
 */
export const INTERVIEW_REGISTER_WRITE_PATHS: Record<
  InterviewRegister,
  { path: string; table: string; handler: string }
> = {
  drug_substance: {
    path: '/api/cmc/drug-substances',
    table: 'drug_substances',
    handler: "router.post('/drug-substances') in server/api/cmc/routes.ts (drugSubstanceBody.parse → db.insert(drugSubstances) → writeThroughDrugSubstance)",
  },
  drug_product: {
    path: '/api/cmc/drug-products',
    table: 'drug_products',
    handler: "router.post('/drug-products') in server/api/cmc/routes.ts (drugProductBody.parse → db.insert(drugProducts) → writeThroughDrugProduct)",
  },
  container_closure: {
    path: '/api/cmc/container-closures',
    table: 'cmc_container_closures',
    handler: "router.post('/container-closures') in server/api/cmc/routes.ts (containerClosureBody.parse → refusesUngovernedQualification → withoutGovernedFields → db.insert(cmcContainerClosures) → linkToModule3(writeThroughContainerClosure))",
  },
  manufacturing_process: {
    path: '/api/cmc/manufacturing-processes',
    table: 'manufacturing_processes',
    handler: "router.post('/manufacturing-processes') in server/api/cmc/routes.ts (manufacturingProcessBody.parse → refusesUngovernedQualification(PROCESS_VOCAB) → db.insert(manufacturingProcesses) → linkToModule3(writeThroughManufacturingProcess))",
  },
  formulation_record: {
    path: '/api/cmc/formulation-records',
    table: 'cmc_formulation_records',
    handler: "router.post('/formulation-records') in server/api/cmc/routes.ts (formulationRecordBody.parse → currentFormulationConflict → db.insert(cmcFormulationRecords) → linkToModule3(writeThroughFormulationRecord))",
  },
  material_spec: {
    path: '/api/cmc/material-specs',
    table: 'cmc_material_specs',
    handler: "router.post('/material-specs') in server/api/cmc/routes.ts (materialSpecBody.parse → withoutOrgId → db.insert(cmcMaterialSpecs) → linkToModule3(writeThroughMaterialSpec))",
  },
  characterization_study: {
    path: '/api/cmc/characterization-studies',
    table: 'cmc_characterization_studies',
    handler: "router.post('/characterization-studies') in server/api/cmc/routes.ts (characterizationStudyBody.parse → db.insert(cmcCharacterizationStudies) → linkToModule3(writeThroughCharacterizationStudy))",
  },
};

/* ─── Plan types ─────────────────────────────────────────────────────────── */

export interface InterviewCommitPlanEntry {
  /** `${register}:${nodeIds.join('+')}` — stable across runs; the retry key. */
  key: string;
  register: InterviewRegister;
  /** The request body for the register's POST, camelCase as the route's zod body expects. */
  body: Record<string, unknown>;
  /** Provenance: the interview nodes and fields this record was projected from. */
  source: { nodeIds: string[]; fieldIds: string[] };
}

export interface UnprojectedAnswer {
  nodeId: string;
  fieldId: string;
  reason: string;
}

export interface InterviewCommitPlan {
  flowCategory: FlowCategory;
  entries: InterviewCommitPlanEntry[];
  /** Answered fields no entry consumed, each with the reason. */
  unprojected: UnprojectedAnswer[];
}

/* ─── Answer access ──────────────────────────────────────────────────────── */

type Answers = Record<string, Record<string, unknown>>;

function isAnswered(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.some(isAnswered);
  return false;
}

/**
 * Reads answers and remembers which ones an entry consumed, so the plan can
 * report the ones nothing consumed.
 */
class AnswerReader {
  private readonly consumed = new Set<string>();

  constructor(private readonly answers: Answers, private readonly definition: FlowDefinition | null) {}

  /** The node was reached and has at least one answered field. */
  reached(nodeId: string): boolean {
    const node = this.answers[nodeId];
    return Boolean(node) && Object.values(node).some(isAnswered);
  }

  private take(nodeId: string, fieldId: string): unknown {
    const v = this.answers[nodeId]?.[fieldId];
    if (!isAnswered(v)) return undefined;
    this.consumed.add(`${nodeId} ${fieldId}`);
    return v;
  }

  text(nodeId: string, fieldId: string): string | undefined {
    const v = this.take(nodeId, fieldId);
    if (v === undefined) return undefined;
    return typeof v === 'string' ? v.trim() : String(v);
  }

  /** A number field's answer as the decimal string a numeric column takes. */
  numeric(nodeId: string, fieldId: string): string | undefined {
    const v = this.take(nodeId, fieldId);
    if (v === undefined) return undefined;
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    return Number.isFinite(n) ? String(n) : String(v).trim();
  }

  yesNo(nodeId: string, fieldId: string): 'Yes' | 'No' | undefined {
    const v = this.take(nodeId, fieldId);
    if (v === undefined) return undefined;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    const s = String(v).trim().toLowerCase();
    if (['yes', 'true', 'y', '1'].includes(s)) return 'Yes';
    if (['no', 'false', 'n', '0'].includes(s)) return 'No';
    return undefined;
  }

  /** A select answer as its option label (the raw value when the option is unknown). */
  label(nodeId: string, fieldId: string): string | undefined {
    const v = this.take(nodeId, fieldId);
    if (v === undefined) return undefined;
    return this.optionLabel(nodeId, fieldId, String(v));
  }

  /** The raw select value — for a branch the projection keys on. */
  value(nodeId: string, fieldId: string): string | undefined {
    const v = this.take(nodeId, fieldId);
    return v === undefined ? undefined : String(v).trim();
  }

  /** A multi-select answer as its option labels. */
  labels(nodeId: string, fieldId: string): string[] | undefined {
    const v = this.take(nodeId, fieldId);
    if (v === undefined) return undefined;
    const values = Array.isArray(v) ? v : [v];
    const out = values.filter(isAnswered).map(x => this.optionLabel(nodeId, fieldId, String(x)));
    return out.length > 0 ? out : undefined;
  }

  private optionLabel(nodeId: string, fieldId: string, value: string): string {
    const field = this.definition?.nodes.find(n => n.id === nodeId)?.fields.find(f => f.id === fieldId);
    const option = field?.options?.find(o => o.value === value);
    return option ? option.label : value;
  }

  /** Every answered field nothing consumed. */
  leftovers(): Array<{ nodeId: string; fieldId: string }> {
    const out: Array<{ nodeId: string; fieldId: string }> = [];
    for (const [nodeId, fields] of Object.entries(this.answers)) {
      if (!fields || typeof fields !== 'object') continue;
      for (const [fieldId, v] of Object.entries(fields)) {
        if (isAnswered(v) && !this.consumed.has(`${nodeId} ${fieldId}`)) out.push({ nodeId, fieldId });
      }
    }
    return out;
  }
}

/* ─── Text helpers ───────────────────────────────────────────────────────── */

/** One row per line as typed, bullets and numbering stripped, blanks dropped. */
function lines(text: string | undefined): string[] | undefined {
  if (text === undefined) return undefined;
  const rows = text
    .split(/\r?\n/)
    .map(l => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
  return rows.length > 0 ? rows : undefined;
}

/** "Label: value" paragraphs for the values that exist; undefined when none. */
function paragraphs(pairs: Array<[string, string | undefined]>): string | undefined {
  const present = pairs.filter((p): p is [string, string] => p[1] !== undefined && p[1] !== '');
  return present.length > 0 ? present.map(([label, value]) => `${label}: ${value}`).join('\n\n') : undefined;
}

/** A yes/no with the detail the interview asked for when it was yes. */
function yesNoWithDetail(answer: 'Yes' | 'No' | undefined, detail: string | undefined): string | undefined {
  if (answer === undefined) return detail;
  if (answer === 'Yes' && detail) return `Yes — ${detail}`;
  return answer;
}

/** Drop undefined values so an unanswered field is absent, not null. */
function compact(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
}

/* ─── Why an answer has no register home ─────────────────────────────────── */

const GAP_REASONS: Record<string, string> = {
  'substance_identification.chemical_name':
    'drug_substances has no chemical/IUPAC-name column (structural_formula holds a structure, not a name); record the chemical name on the drug substance record by hand',
  'substance_identification.structural_diagram_upload':
    'file uploads are not projected; attach the structural diagram to the drug substance record',
  'substance_classification.molecule_type':
    'drug_substances has no molecule-type column',
  'substance_classification.molecule_type_other':
    'drug_substances has no molecule-type column',
  'substance_classification.therapeutic_area':
    'no CMC register records the therapeutic area; it belongs to the program, not the substance',
  'substance_classification.is_sterile':
    'the sterility of the product is recorded on the drug product manufacturing process, which the interview did not reach',
  'physicochemical_properties':
    'physicochemical properties are recorded one per property in cmc_characterization_studies (study_type physicochemical) with a measured result; the interview captured them as a summary — record each property with its value',
  'synthetic_route':
    'manufacturing_processes takes this only with a process name; the drug substance process node was not reached',
  'critical_process_parameters':
    'critical process parameters file under the drug substance manufacturing process, whose node was not reached',
  'starting_materials':
    'cmc_material_specs is one row per named material; the interview captured the starting materials as one list — record each starting material separately',
  'impurity_profile':
    'cmc_impurity_profiles is one row per named impurity with its observed level and unit; the interview captured the profile as prose — record each impurity with its level',
  'genotoxic_impurities':
    'cmc_impurity_profiles is one row per named impurity; the ICH M7 assessment was captured as prose and counts, not per impurity',
  'formulation_composition.formulation_rationale':
    'no register holds §3.2.P.2 pharmaceutical development text; it is authored in the Module 3 section, not recorded as data',
  'excipient_selection':
    'cmc_material_specs is one row per excipient; compatibility studies and functional excipients were captured as prose — record each excipient with its specification',
  'novel_excipient_characterization':
    'cmc_material_specs takes the novel excipient only with its name; the node was not reached',
  'manufacturing_overview':
    'manufacturing_processes takes this only with a process name; the drug product process node was not reached',
  'process_validation':
    'process validation state files under the drug product manufacturing process, whose node was not reached',
  'in_process_controls':
    'in-process controls file under the drug product manufacturing process, whose node was not reached',
  'analytical_methods':
    'analytical_methods is one row per method with its validation status; the interview captured the methods as a list — record each method',
  'specification_setting':
    'quality_specifications is one row per material with structured test parameters and acceptance criteria; the interview captured the tests as prose — record the specification per material',
  'reference_standards':
    'cmc_reference_standards requires a standard code and name; the interview captured the standard as prose — record the standard with its code, lot and assigned value',
  'container_closure.secondary_packaging':
    'cmc_container_closures records one system per row with its own closure description; record the secondary/tertiary packaging as its own system',
  'stability_program':
    'stability_studies is one row per batch study with a batch number, start date and test parameters; the interview captured the programme summary — register each study',
};

function gapReason(flowCategory: FlowCategory, nodeId: string, fieldId: string): string {
  if (flowCategory !== 'cmc_specification') {
    return `no register projection is defined for the ${flowCategory} flow; its answers stay in the session`;
  }
  return (
    GAP_REASONS[`${nodeId}.${fieldId}`] ??
    GAP_REASONS[nodeId] ??
    `no CMC register column receives ${nodeId}.${fieldId}; the answer stays in the session`
  );
}

/* ─── The plan ───────────────────────────────────────────────────────────── */

let cmcDefinition: FlowDefinition | null = null;
function definitionFor(flowCategory: FlowCategory): FlowDefinition | null {
  if (flowCategory !== 'cmc_specification') return null;
  if (!cmcDefinition) cmcDefinition = createCmcSpecificationFlow();
  return cmcDefinition;
}

function entry(
  register: InterviewRegister,
  nodeIds: string[],
  fieldIds: string[],
  body: Record<string, unknown>,
): InterviewCommitPlanEntry {
  return { key: `${register}:${nodeIds.join('+')}`, register, body: compact(body), source: { nodeIds, fieldIds } };
}

/**
 * The projection of a completed cmc_specification interview. Pure: the same
 * answers always produce the same plan.
 */
export function buildInterviewCommitPlan(flowCategory: FlowCategory, answers: Answers): InterviewCommitPlan {
  const a = new AnswerReader(answers ?? {}, definitionFor(flowCategory));
  const entries: InterviewCommitPlanEntry[] = [];

  if (flowCategory === 'cmc_specification') {
    /* §3.2.S.1 — the drug substance identity. */
    if (a.reached('substance_identification')) {
      const inn = a.text('substance_identification', 'inn_name');
      entries.push(entry('drug_substance', ['substance_identification', 'substance_classification'],
        ['inn_name', 'cas_number', 'molecular_formula', 'molecular_weight', 'development_phase'], {
          substanceName: inn,
          inn,
          casNumber: a.text('substance_identification', 'cas_number'),
          molecularFormula: a.text('substance_identification', 'molecular_formula'),
          molecularWeight: a.numeric('substance_identification', 'molecular_weight'),
          developmentPhase: a.label('substance_classification', 'development_phase'),
        }));
    }

    /* §3.2.P.1 — the drug product, and its formulation version. */
    if (a.reached('formulation_composition')) {
      const dosageForm = a.label('formulation_composition', 'dosage_form');
      const strength = a.text('formulation_composition', 'strengths');
      entries.push(entry('drug_product', ['formulation_composition'],
        ['product_name', 'dosage_form', 'strengths', 'route_of_administration'], {
          productName: a.text('formulation_composition', 'product_name'),
          dosageForm,
          strength,
          routeOfAdministration: a.label('formulation_composition', 'route_of_administration'),
        }));
      entries.push(entry('formulation_record', ['formulation_composition', 'manufacturing_overview'],
        ['formulation_name', 'dosage_form', 'strengths', 'formulation_composition_detail', 'batch_formula'], {
          formulationName: a.text('formulation_composition', 'formulation_name'),
          dosageForm,
          strength,
          components: lines(a.text('formulation_composition', 'formulation_composition_detail'))?.map(component => ({ component })),
          batchSize: a.text('manufacturing_overview', 'batch_formula'),
        }));
    }

    /* §3.2.P.7 — the drug product's primary container closure system. The
       question fixes the side and the component: "the container closure
       system for the drug product", "Primary Container ...". */
    if (a.reached('container_closure')) {
      const el = a.yesNo('container_closure', 'el_assessment');
      const elDetails = a.text('container_closure', 'el_assessment_details');
      const cci = a.value('container_closure', 'cci_testing');
      entries.push(entry('container_closure', ['container_closure'],
        ['container_system_name', 'primary_packaging', 'closure_description', 'el_assessment', 'el_assessment_details', 'cci_testing'], {
          scope: 'drug_product',
          componentType: 'primary',
          systemName: a.text('container_closure', 'container_system_name'),
          containerDescription: a.text('container_closure', 'primary_packaging'),
          closureDescription: a.text('container_closure', 'closure_description'),
          extractablesLeachables: el === 'Yes' && elDetails ? { conclusion: elDetails } : undefined,
          integrityTesting: cci && cci !== 'not_applicable'
            ? { method: a.label('container_closure', 'cci_testing') ?? cci }
            : undefined,
        }));
    }

    /* §3.2.S.2 — the drug substance manufacturing process. */
    if (a.reached('synthetic_route')) {
      entries.push(entry('manufacturing_process', ['synthetic_route', 'critical_process_parameters'],
        ['ds_process_name', 'synthesis_overview', 'number_of_steps', 'manufacturing_sites', 'manufacturing_scale',
         'process_changes', 'process_change_details', 'cqas_identified', 'cpps_identified',
         'design_space_established', 'design_space_description', 'risk_assessment_method'], {
          processName: a.text('synthetic_route', 'ds_process_name'),
          processType: 'drug_substance',
          processDescription: a.text('synthetic_route', 'synthesis_overview'),
          facilityInfo: (() => {
            const sites = a.text('synthetic_route', 'manufacturing_sites');
            return sites ? { manufacturingSites: sites } : undefined;
          })(),
          batchSize: a.label('synthetic_route', 'manufacturing_scale'),
          criticalProcessParameters: lines(a.text('critical_process_parameters', 'cpps_identified'))?.map(parameter => ({ parameter })),
          processDevelopment: paragraphs([
            ['Number of synthetic / process steps', a.numeric('synthetic_route', 'number_of_steps')],
            ['Process changes during development', yesNoWithDetail(
              a.yesNo('synthetic_route', 'process_changes'), a.text('synthetic_route', 'process_change_details'))],
            ['Critical Quality Attributes (CQAs)', a.text('critical_process_parameters', 'cqas_identified')],
            ['Design space established', yesNoWithDetail(
              a.yesNo('critical_process_parameters', 'design_space_established'),
              a.text('critical_process_parameters', 'design_space_description'))],
            ['Risk assessment methodology', a.labels('critical_process_parameters', 'risk_assessment_method')?.join('; ')],
          ]),
        }));
    }

    /* §3.2.P.3 — the drug product manufacturing process. */
    if (a.reached('manufacturing_overview')) {
      entries.push(entry('manufacturing_process',
        ['manufacturing_overview', 'process_validation', 'in_process_controls', 'substance_classification'],
        ['dp_process_name', 'dp_manufacturing_description', 'dp_manufacturing_site', 'equipment_type', 'sterile_manufacturing',
         'is_sterile', 'validation_stage', 'ppq_batches', 'ppq_acceptance_criteria', 'process_validation_complete',
         'ipc_list', 'pat_implemented', 'pat_details', 'rtrt_planned'], {
          processName: a.text('manufacturing_overview', 'dp_process_name'),
          processType: 'drug_product',
          processDescription: a.text('manufacturing_overview', 'dp_manufacturing_description'),
          facilityInfo: (() => {
            const sites = a.text('manufacturing_overview', 'dp_manufacturing_site');
            return sites ? { manufacturingSites: sites } : undefined;
          })(),
          equipmentList: lines(a.text('manufacturing_overview', 'equipment_type'))?.map(equipment => ({ equipment })),
          processControls: lines(a.text('in_process_controls', 'ipc_list'))?.map(control => ({ control })),
          processDevelopment: paragraphs([
            ['Sterile product', a.yesNo('substance_classification', 'is_sterile')],
            ['Sterilization approach', a.label('manufacturing_overview', 'sterile_manufacturing')],
            ['Process validation stage', a.label('process_validation', 'validation_stage')],
            ['PPQ batches planned / completed', a.text('process_validation', 'ppq_batches')],
            ['PPQ acceptance criteria', a.text('process_validation', 'ppq_acceptance_criteria')],
            ['Process validation complete', a.yesNo('process_validation', 'process_validation_complete')],
            ['PAT implemented', yesNoWithDetail(
              a.yesNo('in_process_controls', 'pat_implemented'), a.text('in_process_controls', 'pat_details'))],
            ['Real-time release testing planned', a.yesNo('in_process_controls', 'rtrt_planned')],
          ]),
        }));
    }

    /* §3.2.P.4.6 — a novel excipient, as a material specification. The node
       is reached only when the interview said a novel excipient is used. */
    if (a.reached('novel_excipient_characterization')) {
      entries.push(entry('material_spec', ['novel_excipient_characterization'],
        ['novel_excipient_name', 'novel_excipient_function', 'novel_excipient_safety_data', 'novel_excipient_amount'], {
          materialRole: 'excipient',
          materialName: a.text('novel_excipient_characterization', 'novel_excipient_name'),
          functionInFormulation: a.text('novel_excipient_characterization', 'novel_excipient_function'),
          novelExcipient: true,
          novelExcipientJustification: paragraphs([
            ['Safety data available', a.labels('novel_excipient_characterization', 'novel_excipient_safety_data')?.join('; ')],
            ['Amount per dose (mg)', a.numeric('novel_excipient_characterization', 'novel_excipient_amount')],
          ]),
        }));
    }

    /* §3.2.S.3.1 — the structural characterization study. */
    if (a.reached('structural_characterization')) {
      const chiral = a.yesNo('structural_characterization', 'chirality');
      const chiralControl = a.text('structural_characterization', 'chirality_control');
      const supporting: Array<{ label: string; value: string }> = [];
      if (chiral !== undefined) supporting.push({ label: 'Chiral centers', value: chiral });
      if (chiralControl) supporting.push({ label: 'Chirality control strategy', value: chiralControl });
      entries.push(entry('characterization_study', ['structural_characterization'],
        ['characterization_study_title', 'characterization_methods', 'characterization_summary', 'chirality', 'chirality_control'], {
          scope: 'drug_substance',
          studyType: 'structural',
          studyTitle: a.text('structural_characterization', 'characterization_study_title'),
          technique: a.labels('structural_characterization', 'characterization_methods')?.join('; '),
          conclusion: a.text('structural_characterization', 'characterization_summary'),
          supportingData: supporting.length > 0 ? supporting : undefined,
        }));
    }
  }

  const unprojected = a.leftovers().map(({ nodeId, fieldId }) => ({
    nodeId,
    fieldId,
    reason: gapReason(flowCategory, nodeId, fieldId),
  }));

  return { flowCategory, entries, unprojected };
}

/* ─── Execution ──────────────────────────────────────────────────────────── */

export interface RegisterWriteScope {
  organizationId: number;
  projectId: string;
  userId: number | null;
}

export interface RegisterWriteResult {
  id: string | number;
  module3Linked?: boolean;
  module3Warning?: string;
}

/** Writes ONE plan entry through the register's canonical write path. */
export type RegisterWriter = (entry: InterviewCommitPlanEntry, scope: RegisterWriteScope) => Promise<RegisterWriteResult>;

/**
 * The production writer, until the register write paths are extracted from
 * their HTTP handlers into service functions. Refuses by name; never claims.
 */
export const notWiredRegisterWriter: RegisterWriter = async (planEntry) => {
  const target = INTERVIEW_REGISTER_WRITE_PATHS[planEntry.register];
  throw new Error(
    `NOT_WIRED: no in-process write path exists for the ${planEntry.register} register (${target.table}). ` +
      `Its only canonical write is POST ${target.path} — ${target.handler}. ` +
      `That handler body must be extracted into a service function taking (orgId, projectId, body) ` +
      `so both the route and this commit call it; nothing was written.`,
  );
};

export type InterviewCommitFailureCode =
  | 'ORGANIZATION_REQUIRED'
  | 'INVALID_SESSION_ID'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_COMPLETE'
  | 'PROJECT_REQUIRED'
  | 'NOTHING_TO_COMMIT'
  | 'WRITE_FAILED'
  | 'BOOKKEEPING_FAILED';

export type InterviewCommitOutcome =
  | {
      ok: true;
      sessionId: string;
      status: 'committed';
      /** Every record on the session after this call — earlier partial commits included. */
      refs: CommittedRecordRef[];
      /** Entries a previous partial commit had already written; not written again. */
      skipped: CommittedRecordRef[];
      /** The session was already committed; nothing was written by this call. */
      alreadyCommitted: boolean;
      unprojected: UnprojectedAnswer[];
    }
  | {
      ok: false;
      sessionId: string;
      status: InterviewSessionStatus | null;
      code: InterviewCommitFailureCode;
      error: string;
      /** Records THIS call wrote before stopping — reported, never hidden. */
      committed: CommittedRecordRef[];
      failed?: { key: string; register: InterviewRegister; error: string };
      /** Plan entry keys not attempted because an earlier one failed. */
      remaining?: string[];
      unprojected: UnprojectedAnswer[];
    };

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Project a completed interview session onto the registers through `writer`.
 *
 * Refusals (nothing written): the session is not this org's, not complete,
 * has no project, or its answers describe no record. A write failure stops
 * the commit at that entry; the refs written so far are persisted on the
 * session (status unchanged) and returned. Only when every entry has a ref is
 * the session marked 'committed'.
 */
export async function commitInterviewSession(
  params: {
    organizationId: number | string | null | undefined;
    sessionId: unknown;
    userId: number | null | undefined;
    /** Binds a session that was started without a project. Never overrides one the session has. */
    projectId?: string | null;
  },
  deps: { writer: RegisterWriter; q?: Queryable },
): Promise<InterviewCommitOutcome> {
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : String(params.sessionId ?? '');

  let session: InterviewSession;
  try {
    session = await loadInterviewSession({ organizationId: params.organizationId, sessionId: params.sessionId }, deps.q);
  } catch (err) {
    const code: InterviewCommitFailureCode =
      err instanceof InterviewSessionError &&
      (err.code === 'ORGANIZATION_REQUIRED' || err.code === 'INVALID_SESSION_ID' || err.code === 'SESSION_NOT_FOUND')
        ? err.code
        : 'SESSION_NOT_FOUND';
    return { ok: false, sessionId, status: null, code, error: message(err), committed: [], unprojected: [] };
  }

  const plan = buildInterviewCommitPlan(session.flowCategory, session.state.answers);

  if (session.status === 'committed') {
    return {
      ok: true,
      sessionId: session.id,
      status: 'committed',
      refs: session.committedRecordRefs ?? [],
      skipped: session.committedRecordRefs ?? [],
      alreadyCommitted: true,
      unprojected: plan.unprojected,
    };
  }
  if (session.status !== 'complete' || !session.state.complete) {
    return {
      ok: false, sessionId: session.id, status: session.status, code: 'SESSION_NOT_COMPLETE',
      error: `Interview session ${session.id} is ${session.status}; only a complete interview can be committed.`,
      committed: [], unprojected: plan.unprojected,
    };
  }

  const suppliedProject = typeof params.projectId === 'string' && params.projectId.trim() ? params.projectId.trim() : null;
  const projectId = session.projectId ?? suppliedProject;
  if (!projectId) {
    return {
      ok: false, sessionId: session.id, status: session.status, code: 'PROJECT_REQUIRED',
      error: 'The interview session is not bound to a project, so its records cannot feed a Module 3 dossier. Supply project_id.',
      committed: [], unprojected: plan.unprojected,
    };
  }

  if (plan.entries.length === 0) {
    return {
      ok: false, sessionId: session.id, status: session.status, code: 'NOTHING_TO_COMMIT',
      error: `The answers of this ${session.flowCategory} interview describe no CMC register record.`,
      committed: [], unprojected: plan.unprojected,
    };
  }

  const existing = session.committedRecordRefs ?? [];
  const existingKeys = new Set(existing.map(r => r.key));
  const skipped = existing.filter(r => plan.entries.some(e => e.key === r.key));
  const pending = plan.entries.filter(e => !existingKeys.has(e.key));
  const scope: RegisterWriteScope = { organizationId: session.organizationId, projectId, userId: params.userId ?? null };
  const written: CommittedRecordRef[] = [];

  for (let i = 0; i < pending.length; i += 1) {
    const planEntry = pending[i];
    try {
      const result = await deps.writer(planEntry, scope);
      written.push(compact({
        key: planEntry.key,
        register: planEntry.register,
        id: result.id,
        module3Linked: result.module3Linked,
        module3Warning: result.module3Warning,
        committedAt: new Date().toISOString(),
      }) as unknown as CommittedRecordRef);
    } catch (err) {
      const failed = { key: planEntry.key, register: planEntry.register, error: message(err) };
      const remaining = pending.slice(i + 1).map(e => e.key);
      let bookkeeping = '';
      if (written.length > 0) {
        try {
          await recordCommittedRecordRefs(
            { organizationId: session.organizationId, sessionId: session.id, refs: [...existing, ...written] },
            deps.q,
          );
        } catch (bkErr) {
          bookkeeping = ` The ${written.length} record(s) written before the failure could not be recorded on the session: ${message(bkErr)}.`;
        }
      }
      return {
        ok: false, sessionId: session.id, status: session.status, code: 'WRITE_FAILED',
        error:
          `Commit stopped at ${planEntry.register} (${planEntry.key}): ${failed.error}. ` +
          `${written.length} record(s) were written by this call and ${remaining.length} plan entr${remaining.length === 1 ? 'y was' : 'ies were'} not attempted; ` +
          `the session stays 'complete'.${bookkeeping}`,
        committed: written, failed, remaining, unprojected: plan.unprojected,
      };
    }
  }

  const refs = [...existing, ...written];
  try {
    await markInterviewSessionCommitted({ organizationId: session.organizationId, sessionId: session.id, refs }, deps.q);
  } catch (err) {
    return {
      ok: false, sessionId: session.id, status: session.status, code: 'BOOKKEEPING_FAILED',
      error: `Every register record was written but the session could not be marked committed: ${message(err)}`,
      committed: written, unprojected: plan.unprojected,
    };
  }

  return { ok: true, sessionId: session.id, status: 'committed', refs, skipped, alreadyCommitted: false, unprojected: plan.unprojected };
}
