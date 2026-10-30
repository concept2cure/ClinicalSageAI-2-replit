/**
 * Canonical lifecycle source records for the two FDA formal meetings that had
 * a reference timeline but no lifecycle record: Type D and INTERACT
 * (docs/design/US_BIOTECH_FILING_COMPLETION_2026-10-27.md, interfaces item 2).
 *
 * The records are built from the existing meeting core in
 * lifecycle-document-types.ts (FDA_FORMAL_MEETING_TIMELINES,
 * FDA_MEETING_PACKAGE_CORE, meetingTiming, meetingPackageDeadline), passed in as
 * builder arguments. Nothing here restates a figure or a core heading: the
 * timing, package deadline and core titles come from that owner, so a
 * correction there reaches these records. This module imports no value from
 * lifecycle-document-types.ts, so that file can append these records into
 * LIFECYCLE_DOCUMENT_TYPES without a circular initialization.
 *
 * Confidence: every basis is `recall`. The PDUFA VII commitment letter and the
 * formal-meetings guidance were read only in search extracts (the meeting core
 * records this); 21 CFR 312.47 is cited from knowledge and was not re-read on
 * eCFR for this record (egress to regulator hosts is blocked here).
 *
 * AnA eligibility follows the existing projection rule
 * (market-specs/us-biotech-lifecycle-templates.ts): `table`/`form`/`data`
 * components are manual/source-controlled. The attendee list is a `table`.
 * No FDA form number is cited: FDA prescribes no form for a meeting request.
 *
 * @module server/services/ind/ctd/us-biotech-meetings-sources
 */
import type {
  CtdContentType, E3Basis, LifecycleComponent, LifecycleDocumentType,
} from './types.js';

/** The meeting types these records cover; keys of FDA_FORMAL_MEETING_TIMELINES. */
export type UsBiotechMeetingType = 'D' | 'INTERACT';

/** The slice of the existing meeting core the builder reads. */
export interface UsBiotechMeetingCore {
  /** FDA_FORMAL_MEETINGS_GUIDANCE. */
  guidance: string;
  /** FDA_FORMAL_MEETING_TIMELINES (only the D and INTERACT rows are read). */
  timelines: Record<UsBiotechMeetingType, { packageDueBasis: E3Basis; eligibility: string; basis: E3Basis[] }>;
  /** FDA_MEETING_PACKAGE_CORE. */
  packageCore: ReadonlyArray<{ code: string; title: string; required: boolean; guidance: string; basis: E3Basis[] }>;
  /** meetingTypeName. */
  meetingTypeName: (type: UsBiotechMeetingType) => string;
  /** meetingPackageDeadline. */
  meetingPackageDeadline: (type: UsBiotechMeetingType) => string;
  /** The private meetingTiming(type, when) of lifecycle-document-types.ts. */
  meetingTiming: (type: UsBiotechMeetingType, when: string) => string;
}

/** Lifecycle ids and the registry ids the root creates for them. */
export const US_BIOTECH_MEETING_SOURCE_IDS = {
  D: { id: 'us_type_d_meeting', registryId: 'US_TYPE_D_MEETING' },
  INTERACT: { id: 'us_interact_meeting', registryId: 'US_INTERACT' },
} as const;

const PDUFA_VII_LETTER = 'PDUFA VII commitment letter (FY 2023-2027), meeting management goals for Type D and INTERACT meetings (recall: read only in a search extract)';
const CFR_312_47 = '21 CFR 312.47 (meetings with FDA during the IND process) (recall: not re-read on eCFR for this record)';

const label = (b: E3Basis): string => `${b.ref} (${b.confidence})`;

/** The core component's own basis, minus other meeting types' package-deadline rows. */
function coreBasisFor(core: UsBiotechMeetingCore, type: UsBiotechMeetingType, basis: E3Basis[]): string {
  const otherDeadlines = new Set(Object.entries(core.timelines)
    .filter(([key]) => key !== type).map(([, row]) => row.packageDueBasis.ref));
  return basis.filter((b) => !otherDeadlines.has(b.ref)).map(label).join('; ');
}

interface TypeSpecific {
  authoring: string;
  elements: string[];
  prompt: string;
  contentType?: CtdContentType;
}

/** One core component, in the meeting type's words, citing the core's basis. */
function coreComponent(core: UsBiotechMeetingCore, type: UsBiotechMeetingType, code: string, own: TypeSpecific): LifecycleComponent {
  const part = core.packageCore.find((c) => c.code === code);
  if (!part) throw new Error(`FDA_MEETING_PACKAGE_CORE has no ${code}; the ${type} meeting record cannot be built.`);
  return {
    code: part.code, title: part.title, required: part.required,
    contentType: own.contentType ?? 'narrative',
    guidance: `${part.guidance} Basis: ${coreBasisFor(core, type, part.basis)}.`,
    authoringGuidance: own.authoring, keyContentElements: own.elements, generationPrompt: own.prompt,
  };
}

const ATTENDEE_MANUAL = 'Prepare from the sponsor\'s confirmed attendee roster; names, titles and affiliations are source records, not drafted text.';

function typeDComponents(core: UsBiotechMeetingCore): LifecycleComponent[] {
  const name = core.meetingTypeName('D');
  const due = core.meetingPackageDeadline('D');
  const scopeBasis = `${label(core.timelines.D.packageDueBasis)}; ${core.guidance} (recall)`;
  return [
    coreComponent(core, 'D', 'MTG-REQ-CL', {
      authoring: `Request a ${name} meeting only when the issues fit its narrow scope (${core.timelines.D.eligibility}). State the two or fewer topics, the disciplines whose input is needed, and the IND or application number. The meeting package goes ${due}, so the request and package are one submission.`,
      elements: ['Meeting type requested (Type D) and why the scope fits it', 'Product, IND/application number and proposed indication', 'No more than two focused topics', 'Disciplines or divisions whose input is needed (no more than three)', 'Numbered questions', 'Requested format and dates', `Statement that the meeting package is enclosed (${due})`],
      prompt: `Draft a Type D meeting request for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}} ({{PHASE}}), stating why the issue fits a Type D meeting (no more than two focused topics, input from no more than three disciplines), listing the numbered questions and requested format and dates, and enclosing the meeting package ${due}. Do not state a date or an FDA commitment that the source records do not give.`,
    }),
    {
      code: 'MTG-D-SCOPE', title: 'Focused Topics and Disciplines Scope Statement', required: true, contentType: 'narrative',
      guidance: `States the focused topics (no more than two) and the disciplines or divisions whose input is needed (no more than three) that make the request a ${name} meeting. Basis: ${scopeBasis}.`,
      authoringGuidance: 'Name each topic in one sentence and map each numbered question to one topic. If the questions need a third topic or a fourth discipline, the request is not a Type D meeting; say so and request a Type C meeting instead of narrowing the questions until they lose their purpose.',
      keyContentElements: ['Topic 1 and, if any, topic 2', 'Disciplines or divisions whose input is needed', 'Mapping of each numbered question to its topic', 'Prior FDA interaction the topics follow from, if any (by date and minutes reference)'],
      generationPrompt: 'Write the Type D scope statement for {{PRODUCT_NAME}} in {{INDICATION}}: the focused topics (no more than two), the disciplines whose input is needed (no more than three), and which numbered question belongs to which topic, from the sponsor\'s question list.',
    },
    coreComponent(core, 'D', 'MTG-AGENDA', {
      contentType: 'list',
      authoring: 'Keep the agenda to the focused topics; one item per numbered question, with most of the time reserved for FDA discussion.',
      elements: ['Logistics header', 'One item per numbered question, grouped by topic', 'Sponsor speaker per item', 'Time reserved for FDA discussion and action items'],
      prompt: 'Create a short agenda for the Type D meeting on {{PRODUCT_NAME}}, one item per numbered question grouped under its topic, with the sponsor speaker and time per item.',
    }),
    coreComponent(core, 'D', 'MTG-ATTEND', { contentType: 'table', authoring: ATTENDEE_MANUAL, elements: ['Name, title, role and affiliation of each attendee', 'Requested FDA disciplines (no more than three)'], prompt: 'Not drafted: populate from the confirmed attendee roster.' }),
    coreComponent(core, 'D', 'MTG-BKGD', {
      authoring: 'Give only the background the focused topics need: the product, its regulatory status, and the prior FDA advice the topics build on. A full development history belongs in a Type B or C package.',
      elements: ['Product and proposed indication', 'Regulatory status and application numbers', 'Prior FDA advice the topics follow from (cited by date and minutes reference)', 'Data summary the questions rely on (summary only; source data attached as controlled originals)'],
      prompt: 'Write a concise background for the Type D meeting package on {{SPONSOR}}\'s {{PRODUCT_NAME}} in {{INDICATION}}, limited to what the focused topics need, citing prior FDA advice by date from the source records.',
    }),
    coreComponent(core, 'D', 'MTG-QUES', {
      authoring: 'Each question sits under one focused topic and carries the sponsor position and the rationale, so FDA can answer each one in writing if it responds without a meeting.',
      elements: ['Numbered question', 'Topic it belongs to', 'Sponsor position', 'Supporting rationale and source reference'],
      prompt: 'Draft the numbered questions for the Type D meeting on {{PRODUCT_NAME}}, each under its topic, with the sponsor position and rationale from the source records.',
    }),
  ];
}

function interactComponents(core: UsBiotechMeetingCore): LifecycleComponent[] {
  const due = core.meetingPackageDeadline('INTERACT');
  const eligibility = core.timelines.INTERACT.eligibility;
  const novelBasis = `${core.timelines.INTERACT.basis.map(label).join('; ')}; ${core.guidance} (recall)`;
  return [
    coreComponent(core, 'INTERACT', 'MTG-REQ-CL', {
      authoring: `Request an INTERACT meeting only for novel, product-specific questions early in development (${eligibility}). The meeting package goes ${due}. No IND number exists yet; identify the product by its proposed name and class.`,
      elements: ['Meeting requested (INTERACT) and why the questions are novel', 'Product name, class and mechanism; no IND submitted', 'Review center (CBER or CDER) and division, if known', 'Numbered preliminary questions', 'Requested format and dates', `Statement that the meeting package is enclosed (${due})`],
      prompt: `Draft an INTERACT meeting request for {{SPONSOR}}'s {{PRODUCT_NAME}} for {{INDICATION}}, explaining why the questions are novel and product-specific, confirming that no pre-IND meeting has been held and no IND submitted, listing the numbered questions and requested format and dates, and enclosing the meeting package ${due}.`,
    }),
    {
      code: 'MTG-INTERACT-NOVEL', title: 'Novel Issue and INTERACT Eligibility Statement', required: true, contentType: 'narrative',
      guidance: `Explains why the development issues are novel and not answered by existing guidance, and confirms that no pre-IND meeting has been held and no IND has been submitted. Basis: ${novelBasis}.`,
      authoringGuidance: 'Name the novel element (for example an untested product class, a novel manufacturing platform, a novel nonclinical model or first-in-human design) and the existing guidance consulted that does not resolve it. Questions an existing guidance answers, or a full pre-IND package, belong in a pre-IND (Type B) meeting.',
      keyContentElements: ['The novel element of the product or program', 'Existing FDA guidance consulted and why it does not resolve the question', 'Confirmation: no pre-IND meeting held and no IND submitted', 'Stage of development and planned next steps'],
      generationPrompt: 'Write the INTERACT eligibility statement for {{PRODUCT_NAME}} in {{INDICATION}}: the novel element, the existing guidance that does not resolve it, and confirmation that no pre-IND meeting has been held and no IND submitted, from the sponsor\'s source records.',
    },
    coreComponent(core, 'INTERACT', 'MTG-AGENDA', {
      contentType: 'list',
      authoring: 'One item per numbered question; INTERACT meetings are short, so reserve most of the time for FDA discussion.',
      elements: ['Logistics header', 'One item per numbered question', 'Sponsor speaker per item', 'Time reserved for FDA discussion'],
      prompt: 'Create a short agenda for the INTERACT meeting on {{PRODUCT_NAME}}, one item per numbered question, with speaker and time per item.',
    }),
    coreComponent(core, 'INTERACT', 'MTG-ATTEND', { contentType: 'table', authoring: ATTENDEE_MANUAL, elements: ['Name, title, role and affiliation of each attendee', 'Requested FDA disciplines'], prompt: 'Not drafted: populate from the confirmed attendee roster.' }),
    coreComponent(core, 'INTERACT', 'MTG-BKGD', {
      authoring: 'Describe the product, its mechanism, the intended population and the preliminary nonclinical and CMC data available. Summarize data only; the study reports and data stay as controlled originals.',
      elements: ['Product description, class and mechanism of action', 'Intended indication and population', 'Preliminary proof-of-concept, nonclinical and CMC data available (summary)', 'Planned development path to a pre-IND meeting and IND'],
      prompt: 'Write the product background for the INTERACT meeting package on {{SPONSOR}}\'s {{PRODUCT_NAME}} in {{INDICATION}}, summarizing mechanism and the preliminary nonclinical and CMC data from the source records without restating results they do not contain.',
    }),
    coreComponent(core, 'INTERACT', 'MTG-QUES', {
      authoring: 'Questions should be specific to the novel element and carry the sponsor\'s proposed approach, so FDA can give early, non-binding advice on it.',
      elements: ['Numbered question tied to the novel element', 'Sponsor proposed approach', 'Supporting rationale and source reference'],
      prompt: 'Draft the numbered questions for the INTERACT meeting on {{PRODUCT_NAME}}, each tied to the novel element, with the sponsor proposed approach and rationale from the source records.',
    }),
  ];
}

/** Build the Type D and INTERACT lifecycle records from the existing meeting core. */
export function buildUsBiotechMeetingSources(core: UsBiotechMeetingCore): LifecycleDocumentType[] {
  const basis = [core.guidance, PDUFA_VII_LETTER, CFR_312_47];
  return [
    {
      id: US_BIOTECH_MEETING_SOURCE_IDS.D.id, registryId: US_BIOTECH_MEETING_SOURCE_IDS.D.registryId,
      label: 'Type D Meeting Request and Package', category: 'meeting', family: 'MEETING', agency: 'FDA',
      description: `Request and enclosed meeting package for an FDA ${core.meetingTypeName('D')} formal meeting on a PDUFA product: ${core.timelines.D.eligibility} Issues beyond that scope belong in a Type C request.`,
      regulatoryBasis: basis,
      timing: core.meetingTiming('D', 'Requested when a narrow issue arises during development or review, including a follow-up to earlier FDA advice'),
      components: typeDComponents(core), meetingPackage: true,
    },
    {
      id: US_BIOTECH_MEETING_SOURCE_IDS.INTERACT.id, registryId: US_BIOTECH_MEETING_SOURCE_IDS.INTERACT.registryId,
      label: 'INTERACT Meeting Request and Package', category: 'meeting', family: 'MEETING', agency: 'FDA',
      description: `Request and enclosed meeting package for an FDA INTERACT meeting (CBER or CDER) on a novel product early in development: ${core.timelines.INTERACT.eligibility}`,
      regulatoryBasis: [core.guidance, PDUFA_VII_LETTER],
      timing: core.meetingTiming('INTERACT', 'Requested early in development, before a pre-IND meeting and before an IND is submitted'),
      components: interactComponents(core), meetingPackage: true,
    },
  ];
}
