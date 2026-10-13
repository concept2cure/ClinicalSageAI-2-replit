/**
 * What a completed `project_setup` interview configures on the programme
 * record (founder's directive, 2026-10-12; task #15).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Nine slices of this batch made AnA's project-setup interview governed and
 * subject-matter intelligent: the agency is a position, the route comes from
 * the filing registry, the class is checked against the Annex VIII rules, a
 * programme that is not filing in the US can say so. All of it went into a
 * completion event and stopped there, and `start_intelligence_flow` refuses
 * the flow in production for exactly that reason — an interview whose answers
 * reach no record is an empty result standing in for a refusal.
 *
 * This is the projection: answers in, one programme-profile patch out, and
 * every answered field either consumed or REPORTED with the reason nothing
 * consumed it. Pure — the same answers always give the same patch.
 *
 * ── The rule that shapes it ──────────────────────────────────────────────────
 * A fact is projected only where a column holds it and a governed reader or
 * mapping already exists for it. Nothing is coerced:
 *
 *   • the US class comes from `programmeFactsFrom`, the same reader the route
 *     cautions use, so 'no_us_filing' and 'not_classified' state no class
 *     rather than becoming one;
 *   • the agencies come from `agencyFor`, so a region code never reaches the
 *     column as 'US' where the record says 'FDA';
 *   • the premarket path comes from the position the person took, through a
 *     named bridge — and an EU conformity route maps to NO US path, which is
 *     reported rather than guessed;
 *   • the interview's 'standard' priority is the column's 'medium'. Two
 *     vocabularies, mapped once, where a silent pass-through would have
 *     written a value the column does not have.
 *
 * ── What it deliberately does not project ────────────────────────────────────
 * Forty-odd answers, each with its reason in `NOT_PROJECTED`. They fall into
 * three kinds, and the distinction matters because only one of them is work
 * remaining:
 *
 *   refused   the write refuses the column (`PROFILE_WRITE_REFUSALS`): the
 *             programme's name, code, filing type, product class, primary
 *             agency, lifecycle and workflow phase.
 *   no column no column holds the fact — the notified body, the filing
 *             strategy, the partners, the preferences. THIS is the column work
 *             this projection documents, and naming it is what got the two
 *             European classifications their columns
 *             (migrations/20261012b_regulatory_programs_eu_device_classes.sql).
 *   not a fact a gate ('is this multi-country?'), a confirmation, or a
 *             preference about how AnA behaves rather than about the programme.
 *
 * @module server/services/c2c/project-setup-projection
 */

import { agencyFor } from '../../../shared/regulatory/agency-positions.js';
import {
  IVDR_CLASSES,
  MDR_DECLARED_CLASSES,
  euDeviceClassOf,
} from '../../../shared/regulatory/device-class.js';
import { programmeFactsFrom } from '../ana/intelligence-questions/programme-facts.js';
import type { ProgrammeProfilePatch } from './programme-profile-write.js';

type Answers = Record<string, Record<string, unknown>>;

export interface UnprojectedProgrammeAnswer {
  fieldId: string;
  reason: string;
}

export interface ProgrammeConfigurationProjection {
  patch: ProgrammeProfilePatch;
  /** Answered fields no column took, each with the reason. Never silent. */
  unprojected: UnprojectedProgrammeAnswer[];
}

/**
 * The position a sponsor took → the US premarket path the record holds.
 *
 * The bridge is named rather than derived from the id's spelling: `US_510K`
 * and `US_510K_IVD` are different filings and the same path, and `US_513G` and
 * `US_QSUB` are neither — they clear nothing. An EU conformity route has no US
 * path at all, which is reported.
 */
const POSITION_TO_US_PATH: Readonly<Record<string, string>> = {
  US_510K: '510k',
  US_510K_IVD: '510k',
  US_CDX_510K: '510k',
  US_DE_NOVO: 'de_novo',
  US_DE_NOVO_IVD: 'de_novo',
  US_PMA: 'pma',
  US_PMA_IVD: 'pma',
  US_CDX_PMA: 'pma',
  US_HDE: 'hde',
  US_IDE: 'ide',
};

/** The interview's priority vocabulary → the column's. */
const PRIORITY: Readonly<Record<string, 'low' | 'medium' | 'high' | 'critical'>> = {
  critical: 'critical',
  high: 'high',
  /* The column has no 'standard'; 'medium' is the same place on the scale and
     is what the create writes when the wizard says nothing. */
  standard: 'medium',
  low: 'low',
};

/** The team roles the interview asks for, as the record names them. */
const TEAM_ROLES: ReadonlyArray<readonly [string, string]> = [
  ['project_lead', 'Project lead'],
  ['regulatory_lead', 'Regulatory lead'],
  ['clinical_lead', 'Clinical lead'],
  ['cmc_lead', 'CMC lead'],
  ['quality_lead', 'Quality assurance lead'],
];

/** The answers this projection reads, so the gate can hold the two agree. */
export const PROJECTED_FIELDS: readonly string[] = [
  'product_name',
  'product_code',
  'indication',
  'project_description',
  'device_class',
  'eu_mdr_class',
  'ivdr_class',
  'submission_type',
  'device_submission_pathway',
  'target_submission_date',
  'project_priority',
  'primary_regulatory_agency',
  'additional_agencies',
  ...TEAM_ROLES.map(([field]) => field),
];

/**
 * Every other answer the interview can hold, with the reason no column takes
 * it. An entry here is a decision; a field in neither list is the gap the gate
 * below refuses.
 */
export const NOT_PROJECTED: Readonly<Record<string, string>> = {
  /* ── The write refuses the column ──────────────────────────────────────── */
  project_name: 'A rename is its own governed action, with its own audit of the field that changed.',
  project_code: 'The programme code is unique per organization and has its own disambiguation in the create.',
  product_type:
    'The product class decides the client type and the document scaffold, written in the create’s transaction.',
  development_phase:
    'The development phase (preclinical, phase 1 …) is not the workflow phase (planning … post_market), and the profile write sets neither.',

  /* ── No column holds it: the work this projection documents ──────────── */
  notified_body: 'No column holds the notified body.',
  predicate_device:
    'The predicate OF RECORD carries the trade name the eSTAR prints beside the submission number, and this question asks only for the identifier. Projecting the identifier as the name would assert one.',
  therapeutic_area: 'No column holds the therapeutic area; the indication is what the record carries.',
  route_of_administration: 'No column holds the route of administration.',
  organization_name: 'The organization is the tenant, not a column of the programme.',
  organization_type: 'As the name: a fact about the tenant.',
  organization_size: 'As the name: a fact about the tenant.',
  headquarters_country: 'As the name: a fact about the tenant.',
  filing_strategy: 'No column holds the multi-country filing strategy.',
  primary_market: 'No column holds the primary market; the agencies are what the record carries.',
  filing_timeline_overview: 'No column holds the filing timeline narrative.',
  local_agent_required: 'No column holds whether a local agent is required.',
  translation_needs: 'No column holds the translation plan.',
  project_lead_email: 'The team list holds a name and a role; an email address is contact data with no column.',
  team_size: 'No column holds the team size; teamMembers holds the people named.',
  cro_partner: 'No column holds the partners.',
  cdmo_partner: 'No column holds the partners.',
  regulatory_consultant: 'No column holds the partners.',
  partner_access_level:
    'Partner access is an authorization fact, and authorization is not set from an interview answer.',
  initial_documents_to_create:
    'Which documents to scaffold is the create’s, in its transaction with the programme row.',
  additional_notes: 'No column holds free notes about the setup.',

  /* ── Not a fact about the programme ───────────────────────────────────── */
  multi_country_submission: 'A gate on the next question, not a fact of its own — the agencies named are the fact.',
  ctd_format: 'A statement about how the dossier will be organised, not a programme column.',
  external_partners_involved: 'A gate on the partner questions.',
  notification_preference: 'A preference about how AnA behaves, not a fact about the programme.',
  document_naming_convention: 'A preference about how AnA behaves.',
  custom_naming_convention: 'A preference about how AnA behaves.',
  project_timezone: 'A preference about how AnA behaves.',
  enable_ai_assistance: 'A preference about how AnA behaves.',
  milestone_tracking: 'A preference about how AnA behaves.',
  setup_confirmation: 'The confirmation that the interview is finished.',
};

const flatten = (answers: Answers): Record<string, unknown> => {
  const flat: Record<string, unknown> = {};
  for (const nodeAnswers of Object.values(answers ?? {})) Object.assign(flat, nodeAnswers);
  return flat;
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function answered(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

/** The route the person took, from whichever of the two questions asked it. */
function routeTaken(flat: Record<string, unknown>): string | null {
  return text(flat.device_submission_pathway) ?? text(flat.submission_type);
}

type Say = (fieldId: string, reason: string) => void;

/**
 * One fact of the record, from the answers. Each reads what it needs, writes
 * what it can, and SAYS what it could not — so adding a column later means
 * adding a projector rather than growing one function. (The whole projection
 * as a single function reached a complexity of 23, over the limit of 15, while
 * saying nothing a reader could not get from the list.)
 */
type Projector = (flat: Record<string, unknown>, patch: ProgrammeProfilePatch, say: Say) => void;

/** The prose the record carries as typed. */
const projectProse: Projector = (flat, patch) => {
  const productName = text(flat.product_name);
  if (productName) patch.productName = productName;
  const productCode = text(flat.product_code);
  if (productCode) patch.productCode = productCode;
  const indication = text(flat.indication);
  if (indication) patch.indication = indication;
  const description = text(flat.project_description);
  if (description) patch.description = description;
};

/**
 * The class through the governed reader, so the two non-answers — not
 * classified, and no US filing planned — state no class rather than one.
 */
const projectClass: Projector = (flat, patch, say) => {
  const stated = programmeFactsFrom(flat).deviceClass;
  if (stated) {
    patch.deviceClass = stated;
    return;
  }
  if (answered(flat.device_class)) {
    say('device_class', 'The answer states no class: either it has not been determined, or no US filing is planned.');
  }
};

const projectPath: Projector = (flat, patch, say) => {
  const route = routeTaken(flat);
  if (!route) return;
  const path = POSITION_TO_US_PATH[route];
  if (path) {
    patch.regulatoryPath = path as ProgrammeProfilePatch['regulatoryPath'];
    return;
  }
  say(
    text(flat.device_submission_pathway) === route ? 'device_submission_pathway' : 'submission_type',
    `${route} is not a US premarket path: regulatory_path holds the 21 CFR route, and this filing is either ` +
      'another regulator’s or not a route to market.',
  );
};

const projectDate: Projector = (flat, patch, say) => {
  const day = text(flat.target_submission_date);
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    patch.targetSubmissionDate = day;
    return;
  }
  if (answered(flat.target_submission_date)) {
    say('target_submission_date', 'The column holds a date, and this answer is not one.');
  }
};

const projectPriority: Projector = (flat, patch, say) => {
  const priority = text(flat.project_priority);
  if (priority && PRIORITY[priority]) {
    patch.priority = PRIORITY[priority];
    return;
  }
  if (answered(flat.project_priority)) {
    say('project_priority', 'The column has four priorities and this answer is none of them.');
  }
};

/**
 * The agencies the programme named, as the record names them. The primary one
 * is refused by the write — it keys the Module 1 backbone — so it is projected
 * only as a member of the target list it belongs in.
 */
const projectAgencies: Projector = (flat, patch, say) => {
  /* Through the fact reader, which already knows WHICH answers name an agency
     and reads them onto canonical regions — the same regions the route
     cautions mark against, so the record and the question cannot disagree. */
  const regions = programmeFactsFrom(flat).regions ?? [];
  if (regions.length > 0) patch.targetAgencies = regions.map(agencyFor);
  /* The PRIMARY agency keys the Module 1 backbone, the validation profile and
     the gateway, so the write refuses it — and this projected it only as a
     member of the target list. A programme answering "EMA is primary" was left
     with `primary_agency = 'FDA'` and `target_agencies = ['EMA']`, and nothing
     said the primary answer had not been applied, because the field was on the
     projected list (2026-10-13 audit, DP-96). */
  if (text(flat.primary_regulatory_agency)) {
    say(
      'primary_regulatory_agency',
      'Recorded among the target agencies. The PRIMARY agency keys the Module 1 backbone, the validation profile and the gateway, so it is set when the programme is created rather than reconfigured here — if it has changed, that is a change of programme identity.',
    );
  }
};

const projectTeam: Projector = (flat, patch) => {
  const team = TEAM_ROLES.map(([field, role]) => {
    const name = text(flat[field]);
    return name ? { name, role } : null;
  }).filter((m): m is { name: string; role: string } => m !== null);
  if (team.length > 0) patch.teamMembers = team;
};

/**
 * The European classifications, each onto its own column and its own
 * regulation. The declared class, not the rule class: `programmeFactsFrom`
 * reads Is/Im/Ir onto Class I because the CAUTION rules reason about the four
 * the Annex VIII rules yield, and the RECORD keeps what the sponsor declared.
 *
 * 'Not applicable / No EU filing planned' clears the column rather than
 * standing in it — the answer says there is no European classification, which
 * is not a classification.
 */
const projectEuClasses: Projector = (flat, patch, say) => {
  const mdr = text(flat.eu_mdr_class);
  if (mdr === 'na') patch.euMdrClass = null;
  else if (mdr) {
    const declared = euDeviceClassOf(mdr);
    if (declared && (MDR_DECLARED_CLASSES as readonly string[]).includes(declared)) {
      patch.euMdrClass = declared as (typeof MDR_DECLARED_CLASSES)[number];
    } else {
      say('eu_mdr_class', 'The column holds one of the seven MDR classes a sponsor declares, and this answer is none of them.');
    }
  }

  const ivdr = text(flat.ivdr_class);
  if (!ivdr) return;
  const cls = euDeviceClassOf(ivdr);
  if (cls && (IVDR_CLASSES as readonly string[]).includes(cls)) {
    patch.euIvdrClass = cls as (typeof IVDR_CLASSES)[number];
    return;
  }
  say(
    'ivdr_class',
    'The column holds IVDR class A, B, C or D. A class in the person’s own words is kept as their wording on the session, not as a class on the record.',
  );
};

const PROJECTORS: readonly Projector[] = [
  projectEuClasses,
  projectProse,
  projectClass,
  projectPath,
  projectDate,
  projectPriority,
  projectAgencies,
  projectTeam,
];

/**
 * The programme-profile patch a completed project-setup interview describes,
 * and every answer it does not describe.
 */
export function projectSetupProgrammeConfiguration(answers: Answers): ProgrammeConfigurationProjection {
  const flat = flatten(answers);
  const patch: ProgrammeProfilePatch = {};
  const unprojected: UnprojectedProgrammeAnswer[] = [];
  const say: Say = (fieldId, reason) => unprojected.push({ fieldId, reason });

  for (const project of PROJECTORS) project(flat, patch, say);

  /* Everything answered that no column took, with the reason. An answer in
     neither list would evaporate, which is what the gate refuses. */
  for (const [fieldId, value] of Object.entries(flat)) {
    if (!answered(value)) continue;
    if (PROJECTED_FIELDS.includes(fieldId)) continue;
    if (unprojected.some(u => u.fieldId === fieldId)) continue;
    say(fieldId, NOT_PROJECTED[fieldId] ?? 'No column holds this answer, and no reason has been written for it.');
  }

  return { patch, unprojected };
}
