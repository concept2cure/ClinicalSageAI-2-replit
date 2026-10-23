import React from 'react';
import { isDeviceFamily, isIvdFamily, productTypeForFilingType } from '@shared/constants/domain/product-types';
import { compileWorkPackages, type Specialization, type WorkPackage } from '@shared/regulatory/work-packages';
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
const PATHWAY_FEATURES: Record<string, string> = { '510k': 'device-510k', pma: 'device-pma', mdr: 'device-cer', ivdr: 'device-diagnostics' };
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
    title: `${filingLabel ? `${filingLabel} · ` : ''}${diagnostic ? 'Diagnostic' : 'Device'} project workflow`,
    lead: clinicalSummary ? 'Clinical Affairs' : 'Regulatory Affairs',
    summary: clinicalSummary ?? 'Regulatory Affairs owns the filing. Engineering, Quality and Risk Management supply the technical evidence; Medical Writing authors the narrative and Regulatory Operations assembles the submission.',
    cadence: clinicalSummary
      ? 'Living evaluation: update from new literature, surveillance and product changes on the evaluation schedule.'
      : 'Submission snapshot: approved evidence supports the filing; later changes and agency questions return to this project.',
    packages: compileWorkPackages({ specialization, pathways, markets: [], deviceFlags: project.device_flags }),
  };
}

/** Destinations are existing features or the project's own evidence/document stages. */
type WorkDestination = { surface?: string; stage?: string; label: string };
const ENGINEERING_DESTINATION = { surface: 'device-engineering', label: 'Open engineering evidence' };
const EVIDENCE_DESTINATION = { stage: 'evidence', label: 'Open project evidence' };
const DOCUMENT_DESTINATION = { stage: 'author', label: 'Open project documents' };
const WORK_DESTINATIONS: Record<string, WorkDestination> = {
  'design-controls': ENGINEERING_DESTINATION, 'risk-management': ENGINEERING_DESTINATION,
  'manufacturing-transfer': ENGINEERING_DESTINATION,
  'software-cybersecurity': { surface: 'device-software', label: 'Open software evidence' },
  'medical-writing': DOCUMENT_DESTINATION, labeling: DOCUMENT_DESTINATION, 'registration-udi': DOCUMENT_DESTINATION,
  'authority-review': { stage: 'respond', label: 'Open agency responses' },
  postmarket: { surface: 'device-postmarket', label: 'Open surveillance' },
};
function packageDestination(item: WorkPackage, primary: string | null): WorkDestination {
  const { id, filingSectionsSupported } = item;
  const pathway = PATHWAY_FEATURES[primary ?? ''];
  if (id === 'regulatory-strategy' && pathway) return { surface: pathway, label: 'Open pathway work' };
  if (id === 'submission-assembly') return pathway
    ? { surface: pathway, label: primary === '510k' ? 'Open eSTAR assembly' : 'Open filing documents' }
    : DOCUMENT_DESTINATION;
  if (id === 'clinical-evidence') return filingSectionsSupported.some(section => section.startsWith('mdr:'))
    ? { surface: 'device-cer', label: 'Open clinical evaluation' } : { surface: 'device-clinical-studies', label: 'Open clinical studies' };
  if (['analytical-performance', 'clinical-performance', 'performance-evaluation'].includes(id)) return filingSectionsSupported.some(section => section.startsWith('ivdr:'))
    ? { surface: 'device-diagnostics', label: 'Open IVDR evidence' } : EVIDENCE_DESTINATION;
  return WORK_DESTINATIONS[id] ?? EVIDENCE_DESTINATION;
}

function Workstream({ item, plan, onNav, onStage, onAsk, available, projectName }: {
  item: WorkPackage;
  plan: NonNullable<ReturnType<typeof mdxProjectPlan>>;
  onNav: (id: string) => void;
  onStage: (id: string) => void;
  onAsk: (text: string) => void;
  available: (id: string) => boolean;
  projectName: string;
}) {
  const destination = packageDestination(item, plan.primary);
  const canOpen = !destination.surface || available(destination.surface);
  return (
    <details className="pj-mdx-workstream" data-work-package={item.id}>
      <summary><span>{item.title}</span><span className="pj-mdx-owner">{item.ownerDiscipline}</span></summary>
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
            if (destination.surface && canOpen) onNav(destination.surface);
            else onStage(destination.stage ?? 'evidence');
          }}>{canOpen ? destination.label : 'Open project evidence'}</button>
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

export function ProjectMdxWorkflow({ project, otherFilings, marketsState, onNav, onStage, onAsk, available }: {
  project: MdxWorkflowProject;
  otherFilings: string[];
  marketsState: 'loading' | 'unavailable' | 'ready';
  onNav: (id: string) => void;
  onStage: (id: string) => void;
  onAsk: (text: string) => void;
  available: (id: string) => boolean;
}) {
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
      <p className="pj-mdx-note">Shared evidence appears once and feeds each applicable filing. Discipline owners below describe responsibilities; named assignments and approvals remain in the project team and document reviews.</p>
      <div className="pj-mdx-workstreams" aria-label="Project workstreams">
        {plan.packages.map(item => <Workstream key={item.id} item={item} plan={plan} onNav={onNav} onStage={onStage} onAsk={onAsk} available={available} projectName={project.name || 'in context'} />)}
      </div>
    </section>
  );
}
