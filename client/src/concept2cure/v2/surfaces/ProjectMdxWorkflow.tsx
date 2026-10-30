import React from 'react';
import { isDeviceFamily, isIvdFamily, productTypeForFilingType } from '@shared/constants/domain/product-types';
import { compileWorkPackages, type Specialization, type WorkPackage } from '@shared/regulatory/work-packages';
import { DEVICE_DOORS } from '../projectDoors';
import '../styles/mdx-project-workflow.css';

/** The verified project read, not the shell handoff or an organization default. */
export interface MdxWorkflowProject {
  id: string;
  name: string | null;
  program_type: string | null;
  product_type?: string | null;
  regulatory_path?: string | null;
  primary_agency: string | null;
  device_flags?: string[] | null;
}

function filingToken(value: string | null | undefined): string | null {
  const key = String(value ?? '').trim().toLowerCase().replace(/[\s()_-]/g, '');
  const aliases: Record<string, string> = {
    '510k': '510k', k510: '510k', denovo: 'de_novo', pma: 'pma',
    cer: 'mdr', mdr: 'mdr', mdrtd: 'mdr', eumdr: 'mdr', ivdr: 'ivdr', ivdrtd: 'ivdr', euivdr: 'ivdr',
  };
  return aliases[key] ?? null;
}

const FILING_LABELS: Record<string, string> = { '510k': '510(k)', de_novo: 'De Novo', pma: 'PMA', mdr: 'EU MDR CER', ivdr: 'EU IVDR PER' };
/** Each primary pathway's own feature, and the names of its strategy and assembly doors (section 9: a device
 *  door's name depends on the pathway the project files). A De Novo or an unrecorded route has none. */
export const PATHWAY_FEATURES: Record<string, { surface: string; doors: { strategy: string; assembly: string } }> = {
  '510k': { surface: 'device-510k', doors: DEVICE_DOORS.pathway['510k'] },
  pma: { surface: 'device-pma', doors: DEVICE_DOORS.pathway.pma },
  mdr: { surface: 'device-cer', doors: DEVICE_DOORS.pathway.mdr },
  ivdr: { surface: 'device-diagnostics', doors: DEVICE_DOORS.pathway.ivdr },
};
/** The recorded routes FDA's Q-Submission programme serves. HDE is not recorded as a route here (filingToken). */
const FDA_ROUTES = new Set(['510k', 'de_novo', 'pma']);
const CLINICAL_SUMMARIES: Record<string, string> = {
  mdr: 'Clinical Affairs and a qualified evaluator lead the clinical evaluation. Literature specialists, clinicians, biostatistics and surveillance supply the evidence; Regulatory Affairs maps the conclusions to GSPR and the conformity route.',
  ivdr: 'Clinical Affairs coordinates the performance evaluation with assay development and laboratory medicine: scientific validity, analytical performance and clinical performance feed the PER and its PMPF updates.',
};

/** Reach the existing compiler using the project's recorded filing/product facts. */
export function mdxProjectPlan(project: MdxWorkflowProject, otherFilings: string[] = []) {
  const product = project.product_type || productTypeForFilingType(project.program_type);
  if (!isDeviceFamily(product)) return null;
  const diagnostic = isIvdFamily(product);
  const specialization: Specialization = product === 'samd' ? 'samd'
    : product === 'cdx' ? 'companion_diagnostic' : diagnostic ? 'ivd_diagnostics' : 'medical_device';
  const primary = filingToken(project.program_type) ?? filingToken(project.regulatory_path);
  const pathways = [...new Set([primary, ...otherFilings.map(filingToken)].filter((v): v is string => v !== null))];
  const filingLabel = FILING_LABELS[primary ?? ''];
  const clinicalSummary = CLINICAL_SUMMARIES[primary ?? ''];
  return {
    primary,
    /* A recorded FDA route: the Q-Submission programme applies. EU MDR and IVDR have no Pre-Sub. */
    fdaRoute: pathways.some(pathway => FDA_ROUTES.has(pathway)),
    /* Named as Plan names a US IND's list ("What this IND needs"), by the filing (section 9). */
    title: `What this ${filingLabel ?? (diagnostic ? 'diagnostic filing' : 'device filing')} needs`,
    lead: clinicalSummary ? 'Clinical Affairs' : 'Regulatory Affairs',
    summary: clinicalSummary ?? 'Regulatory Affairs owns the filing. Engineering, Quality and Risk Management supply the technical evidence; Medical Writing authors the narrative and Regulatory Operations assembles the submission.',
    cadence: clinicalSummary
      ? 'Living evaluation: update from new literature, surveillance and product changes on the evaluation schedule.'
      : 'Submission snapshot: approved evidence supports the filing; later changes and agency questions return to this project.',
    packages: compileWorkPackages({ specialization, pathways, markets: [], deviceFlags: project.device_flags }),
  };
}

/** Destinations are existing features or the project's own evidence/document stages. Each door is named for its
 *  job (projectDoors.ts, section 9's Door names), not for where it goes. */
type WorkDestination = { surface?: string; stage?: string; label: string;
  /** Where the door goes when the organization cannot open `surface`. Evidence when absent. */
  fallback?: WorkDestination };
const ENGINEERING_DESTINATION = { surface: 'device-engineering', label: DEVICE_DOORS.engineering };
const EVIDENCE_DESTINATION = { stage: 'evidence', label: DEVICE_DOORS.evidence };
const DOCUMENT_DESTINATION = { stage: 'author', label: DEVICE_DOORS.documents };
const WORK_DESTINATIONS: Record<string, WorkDestination> = {
  'design-controls': ENGINEERING_DESTINATION, 'risk-management': ENGINEERING_DESTINATION,
  'manufacturing-transfer': ENGINEERING_DESTINATION,
  'software-cybersecurity': { surface: 'device-software', label: DEVICE_DOORS.software },
  'medical-writing': DOCUMENT_DESTINATION,
  /* The label and the UDI check read the open project (2026-10-29), so the two packages open them, as section 6
     and slice 20 place them. Without the feature they keep the Author door they had. */
  labeling: { surface: 'labeling', label: DEVICE_DOORS.label, fallback: DOCUMENT_DESTINATION },
  'registration-udi': { surface: 'device-udi', label: DEVICE_DOORS.udi, fallback: DOCUMENT_DESTINATION },
  /* The usability engineering file reads the open project's file (2026-10-29), so the package opens it, as section 5
     and slice 19 place it. Without the feature it keeps the Evidence door it had. */
  'human-factors-usability': { surface: 'human-factors', label: DEVICE_DOORS.humanFactors, fallback: EVIDENCE_DESTINATION },
  'authority-review': { stage: 'respond', label: DEVICE_DOORS.agencyResponses },
  postmarket: { surface: 'device-postmarket', label: DEVICE_DOORS.surveillance },
};
function packageDestination(item: WorkPackage, primary: string | null): WorkDestination {
  const { id, filingSectionsSupported } = item;
  const pathway = PATHWAY_FEATURES[primary ?? ''];
  if (id === 'regulatory-strategy' && pathway) return { surface: pathway.surface, label: pathway.doors.strategy };
  if (id === 'submission-assembly') return pathway
    ? { surface: pathway.surface, label: pathway.doors.assembly }
    : DOCUMENT_DESTINATION;
  if (id === 'clinical-evidence') return filingSectionsSupported.some(section => section.startsWith('mdr:'))
    ? { surface: 'device-cer', label: DEVICE_DOORS.clinicalEvaluation } : { surface: 'device-clinical-studies', label: DEVICE_DOORS.clinicalStudies };
  if (['analytical-performance', 'clinical-performance', 'performance-evaluation'].includes(id)) return filingSectionsSupported.some(section => section.startsWith('ivdr:'))
    ? { surface: 'device-diagnostics', label: DEVICE_DOORS.ivdrEvidence } : EVIDENCE_DESTINATION;
  return WORK_DESTINATIONS[id] ?? EVIDENCE_DESTINATION;
}
/** A workstream's further doors, each to an existing feature. The Pre-Sub manager reads the open project
 *  (2026-10-29) and is a Plan destination (section 5, slice 12), offered on regulatory strategy only for a
 *  recorded FDA route. */
function packageFurtherDoors(item: WorkPackage, plan: { fdaRoute: boolean }): Array<{ surface: string; label: string }> {
  return item.id === 'regulatory-strategy' && plan.fdaRoute ? [{ surface: 'device-presub', label: DEVICE_DOORS.preSub }] : [];
}

/** What the Plan step adds to each workstream: who it is assigned to, and Assign. */
export interface WorkstreamPlanSlots {
  assignmentOf?: (packageId: string) => React.ReactNode;
  assignAction?: (deliverable: { id: string; title: string; group: string }) => React.ReactNode;
}

function Workstream({ item, plan, onNav, onStage, onAsk, available, projectName, assignmentOf, assignAction }: {
  item: WorkPackage;
  plan: NonNullable<ReturnType<typeof mdxProjectPlan>>;
  onNav: (id: string) => void;
  onStage: (id: string) => void;
  onAsk: (text: string) => void;
  available: (id: string) => boolean;
  projectName: string;
} & WorkstreamPlanSlots) {
  const planned = packageDestination(item, plan.primary);
  /* A feature the organization cannot open is never offered: the door goes where its fallback says, or Evidence. */
  const destination: WorkDestination = planned.surface && !available(planned.surface) ? planned.fallback ?? EVIDENCE_DESTINATION : planned;
  const further = packageFurtherDoors(item, plan).filter(door => available(door.surface));
  return (
    <details className="pj-mdx-workstream" data-work-package={item.id}>
      <summary><span>{item.title}</span>{assignmentOf?.(item.id)}<span className="pj-mdx-owner">{item.ownerDiscipline}</span></summary>
      <div className="pj-mdx-detail">
        <p>{item.regulatoryPurpose}</p>
        <dl className="pj-mdx-facts">
          <div><dt>Contributors</dt><dd>{item.contributors.join(' · ')}</dd></div>
          <div><dt>Applicability</dt><dd>{item.applicability}</dd></div>
          {item.dependsOn.length > 0 && <div><dt>Inputs from</dt><dd>{item.dependsOn.map(id => plan.packages.find(p => p.id === id)?.title ?? id).join(' · ')}</dd></div>}
          {item.filingSectionsSupported.length > 0 && <div><dt>Feeds</dt><dd>{item.filingSectionsSupported.join(' · ')}</dd></div>}
        </dl>
        <h3>Deliverables</h3>
        <ul>{item.deliverables.map(text => <li key={text}>{text}</li>)}</ul>
        <h3>Acceptance criteria</h3>
        <ul>{item.acceptanceCriteria.map(text => <li key={text}>{text}</li>)}</ul>
        <div className="pj-mdx-actions">
          <button type="button" className="btn ghost" onClick={() => {
            if (destination.surface) onNav(destination.surface);
            else onStage(destination.stage ?? 'evidence');
          }}>{destination.label}</button>
          {further.map(door => (
            <button key={door.surface} type="button" className="btn ghost" onClick={() => onNav(door.surface)}>{door.label}</button>
          ))}
          {assignAction?.({ id: item.id, title: item.title, group: item.ownerDiscipline })}
          <button type="button" className="btn" onClick={() => onAsk(
            `For the open project ${projectName}, prepare the ${item.title.toLowerCase()} work with ${item.ownerDiscipline}. ` +
            `Use the project's recorded evidence to identify inputs, gaps, deliverables and review handoffs. ` +
            `Deliverables: ${item.deliverables.join('; ')}.`,
          )}>Prepare this work with AnA</button>
        </div>
      </div>
    </details>
  );
}

export function ProjectMdxWorkflow({ project, otherFilings, marketsState, onNav, onStage, onAsk, available, assignmentOf, assignAction }: {
  project: MdxWorkflowProject;
  otherFilings: string[];
  marketsState: 'loading' | 'unavailable' | 'ready';
  onNav: (id: string) => void;
  onStage: (id: string) => void;
  onAsk: (text: string) => void;
  available: (id: string) => boolean;
} & WorkstreamPlanSlots) {
  const plan = mdxProjectPlan(project, otherFilings);
  if (!plan) return null;
  return (
    <section className="pj-sec pj-mdx-workflow" aria-labelledby="pj-mdx-heading" data-testid="pj-mdx-workflow">
      <div className="pj-sec-h"><h2 id="pj-mdx-heading">{plan.title}</h2></div>
      <p>{plan.summary}</p>
      <p className="pj-mdx-cadence">{plan.cadence}</p>
      {marketsState !== 'ready' && <p role="status">{marketsState === 'loading'
        ? 'Reading additional project filings. The plan currently reflects the primary filing.'
        : 'Additional project filings could not be read. The plan reflects the primary filing only.'}</p>}
      <p className="pj-mdx-note">Shared evidence appears once and feeds each applicable filing. Discipline owners below describe responsibilities; {assignAction
        ? 'Assign a workstream to name the person who does it. Approvals remain in document reviews.'
        : 'named assignments and approvals remain in the project team and document reviews.'}</p>
      <div className="pj-mdx-workstreams" aria-label="Project workstreams">
        {plan.packages.map(item => <Workstream key={item.id} item={item} plan={plan} onNav={onNav} onStage={onStage} onAsk={onAsk} available={available} projectName={project.name || 'in context'}
          assignmentOf={assignmentOf} assignAction={assignAction} />)}
      </div>
    </section>
  );
}
