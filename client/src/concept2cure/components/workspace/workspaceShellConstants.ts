/**
 * workspaceShellConstants — Static configuration, template content,
 * and display constants extracted from ProjectWorkspaceShell.
 */

import type { ComponentType } from 'react';
import { FileText, Files, Activity, Layers, Brain, Target, BookOpen } from 'lucide-react';
import type { OperatingLayer, WorkspaceWorkbench, ProjectNav } from './workspaceShellControllers';

// ── Types ────────────────────────────────────────────────────────────────────

export type DocumentTab =
  | 'content'
  | 'evidence'
  | 'versions'
  | 'review'
  | 'signatures'
  | 'provenance'
  | 'export';

export interface OperatingLayerConfig {
  id: OperatingLayer;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

export interface WorkbenchConfig {
  id: WorkspaceWorkbench;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  defaultFolder: string;
}

// ── Folder label map ─────────────────────────────────────────────────────────
export const FOLDER_LABELS: Record<string, string> = {
  drafts: 'Drafts',
  generated: 'Generated',
  dossier: 'Dossier',
  evidence: 'Evidence Packs',
  cmc: 'CMC',
  ind: 'IND',
  ectd: 'eCTD',
  clinical: 'Clinical / CSR Evidence',
  audit: 'Audit / Provenance',
  final: 'Submitted / Final',
};

export const OPERATING_LAYERS: OperatingLayerConfig[] = [
  {
    id: 'document_studio',
    label: 'Document Studio',
    description: 'Core authoring + governed workflow',
    icon: FileText,
  },
  {
    id: 'vault',
    label: 'Evidence',
    description: 'Evidence and document operations',
    icon: Files,
  },
  {
    id: 'reports',
    label: 'Readiness',
    description: 'Readiness, review, and executive reporting',
    icon: Activity,
  },
];

export const WORKBENCHES: WorkbenchConfig[] = [
  {
    id: 'cmc',
    label: 'CMC',
    description: 'Module 3 authoring',
    icon: Layers,
    defaultFolder: 'cmc',
  },
  {
    id: 'biostats',
    label: 'Biostats',
    description: 'Statistical narratives',
    icon: Brain,
    defaultFolder: 'clinical',
  },
  {
    id: 'device',
    label: 'Device',
    description: 'Device evidence and equivalence',
    icon: Target,
    defaultFolder: 'evidence',
  },
  {
    id: 'clinical',
    label: 'Clinical',
    description: 'Clinical studies and summaries',
    icon: BookOpen,
    defaultFolder: 'clinical',
  },
];

export const PROJECT_NAV_ITEMS: Array<{ id: ProjectNav; label: string }> = [
  { id: 'communication_center', label: 'Communication Center' },
  { id: 'submission_builder', label: 'Documents' },
  { id: 'communications', label: 'Communications' },
  { id: 'verify', label: 'Verify' },
  { id: 'review', label: 'Review' },
  { id: 'publish', label: 'Publish' },
];

export const DOCUMENT_TAB_ITEMS: Array<{ id: DocumentTab; label: string }> = [
  { id: 'content', label: 'Content' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'versions', label: 'Versions' },
  { id: 'review', label: 'Review' },
  { id: 'signatures', label: 'Signatures' },
  { id: 'provenance', label: 'Provenance' },
  { id: 'export', label: 'Export' },
];

// ── Template content builder ─────────────────────────────────────────────────

const CTD_TEMPLATE_CONTENT: Record<string, string> = {
  '1.1': `<h2>Cover Letter</h2>
<p>Dear [Agency Contact],</p>
<p>We hereby submit this [application type] for [product name] ([generic name]), [dosage form], [strength], for the proposed indication of [indication].</p>
<h3>Submission Contents</h3>
<p>This submission contains the following modules:</p>
<ul><li>Module 1: Administrative Information and Prescribing Information</li><li>Module 2: Common Technical Document Summaries</li><li>Module 3: Quality (CMC)</li><li>Module 4: Nonclinical Study Reports</li><li>Module 5: Clinical Study Reports</li></ul>
<h3>Contact Information</h3>
<p>For questions regarding this submission, please contact:</p>
<p>[Name], [Title]<br/>[Organization]<br/>[Address]<br/>[Phone] | [Email]</p>`,

  '2.2': `<h2>Introduction to Summary</h2>
<h3>Product Overview</h3>
<p>[Product name] ([generic name]) is a [mechanism of action] indicated for [proposed indication]. The drug substance is [chemical description] with a molecular weight of [MW].</p>
<h3>Regulatory History</h3>
<p>This application represents [first submission / supplement / amendment] for [product name].</p>
<h3>Development Rationale</h3>
<p>The development program for [product name] was designed to [rationale]. The nonclinical and clinical programs provide [describe evidence base].</p>`,

  '2.3': `<h2>Quality Overall Summary</h2>
<h3>2.3.S Drug Substance</h3>
<h4>General Information</h4>
<p>[Drug substance name] is manufactured by [manufacturer] at [site]. The drug substance is [physical description].</p>
<h4>Manufacture</h4>
<p>The manufacturing process for [drug substance] consists of [number] synthetic steps. Process validation data demonstrate consistent production of drug substance meeting all specifications.</p>
<h4>Characterization</h4>
<p>The structure of [drug substance] has been confirmed by [analytical methods: NMR, MS, IR, X-ray crystallography].</p>
<h3>2.3.P Drug Product</h3>
<h4>Description and Composition</h4>
<p>[Product name] is formulated as [dosage form] containing [strength] of [drug substance]. Excipients include [list excipients with function].</p>
<h4>Pharmaceutical Development</h4>
<p>The formulation was developed to [objectives]. Key development studies include [dissolution, stability, bioequivalence].</p>`,

  '2.5': `<h2>Clinical Overview</h2>
<h3>Product Development Rationale</h3>
<p>[Product name] was developed for the treatment of [indication]. The clinical development program included [number] studies enrolling approximately [N] subjects.</p>
<h3>Overview of Clinical Pharmacology</h3>
<p>The pharmacokinetic profile of [product name] is characterized by [PK summary]. Drug-drug interaction studies demonstrated [DDI findings].</p>
<h3>Overview of Efficacy</h3>
<p>Efficacy was evaluated in [number] pivotal studies. The primary endpoint of [endpoint] was met with statistical significance (p [value]). [Product name] demonstrated [efficacy summary].</p>
<h3>Overview of Safety</h3>
<p>The safety database includes [N] subjects exposed to [product name]. The most common adverse events were [AE list]. Serious adverse events occurred in [%] of subjects.</p>
<h3>Benefit-Risk Assessment</h3>
<p>[Product name] provides [benefit summary] with a safety profile that [safety characterization]. The benefit-risk balance supports [conclusion].</p>`,

  '2.7': `<h2>Clinical Summary</h2>
<h3>2.7.1 Summary of Biopharmaceutic Studies and Associated Analytical Methods</h3>
<p>[Describe bioanalytical methods, bioavailability, bioequivalence studies]</p>
<h3>2.7.2 Summary of Clinical Pharmacology Studies</h3>
<p>[PK studies, PD studies, exposure-response, special populations, drug interactions]</p>
<h3>2.7.3 Summary of Clinical Efficacy</h3>
<p>[Study design overview, demographics, efficacy results, subgroup analyses]</p>
<h3>2.7.4 Summary of Clinical Safety</h3>
<p>[Exposure, adverse events, deaths, laboratory findings, vital signs, safety in special populations]</p>`,

  '3.2.S': `<h2>Drug Substance</h2>
<h3>3.2.S.1 General Information</h3>
<h4>Nomenclature</h4>
<p>INN: [name]<br/>Chemical name: [IUPAC name]<br/>CAS number: [number]</p>
<h4>Structure</h4>
<p>Molecular formula: [formula]<br/>Molecular weight: [weight]<br/>[Structure description]</p>
<h3>3.2.S.2 Manufacture</h3>
<p>[Manufacturer name and address. Description of manufacturing process with flow diagram reference.]</p>
<h3>3.2.S.3 Characterisation</h3>
<p>[Elucidation of structure, impurity profile]</p>
<h3>3.2.S.4 Control of Drug Substance</h3>
<p>[Specifications, analytical procedures, validation, batch analyses, justification of specifications]</p>
<h3>3.2.S.5 Reference Standards</h3>
<p>[Primary and secondary reference standards used]</p>
<h3>3.2.S.6 Container Closure System</h3>
<p>[Description of container closure system for drug substance storage]</p>
<h3>3.2.S.7 Stability</h3>
<p>[Stability summary, storage conditions, shelf life proposal]</p>`,

  '3.2.P': `<h2>Drug Product</h2>
<h3>3.2.P.1 Description and Composition</h3>
<p>[Dosage form description, composition table with quantities per unit dose]</p>
<h3>3.2.P.2 Pharmaceutical Development</h3>
<p>[Formulation development rationale, excipient compatibility, manufacturing process development, container closure selection]</p>
<h3>3.2.P.3 Manufacture</h3>
<p>[Manufacturer information, batch formula, process description, process validation]</p>
<h3>3.2.P.4 Control of Excipients</h3>
<p>[Excipient specifications and testing]</p>
<h3>3.2.P.5 Control of Drug Product</h3>
<p>[Release and shelf-life specifications, analytical procedures, validation, batch analyses]</p>
<h3>3.2.P.6 Reference Standards</h3>
<p>[Reference standards used for drug product testing]</p>
<h3>3.2.P.7 Container Closure System</h3>
<p>[Primary packaging description, extractables/leachables if applicable]</p>
<h3>3.2.P.8 Stability</h3>
<p>[Stability data summary, proposed shelf life and storage conditions]</p>`,

  '5.3': `<h2>Clinical Study Reports</h2>
<h3>5.3.1 Reports of Biopharmaceutic Studies</h3>
<p>[List bioavailability, bioequivalence, in-vitro dissolution, and PK study reports]</p>
<h3>5.3.2 Reports of Studies Pertinent to Pharmacokinetics Using Human Biomaterials</h3>
<p>[Plasma protein binding, hepatic metabolism, drug interaction studies using human biomaterials]</p>
<h3>5.3.3 Reports of Human PK Studies</h3>
<p>[Healthy subject PK, patient PK, intrinsic/extrinsic factor studies, population PK]</p>
<h3>5.3.4 Reports of Human PD Studies</h3>
<p>[PD studies and PK/PD relationship studies]</p>
<h3>5.3.5 Reports of Efficacy and Safety Studies</h3>
<p>[Controlled clinical studies, uncontrolled clinical studies, analyses of data across studies]</p>`,
};

export function buildTemplateContent(
  title: string,
  ctdSection: string,
  templateKey?: string
): string {
  const sectionContent =
    CTD_TEMPLATE_CONTENT[ctdSection] ||
    CTD_TEMPLATE_CONTENT[ctdSection.split('.').slice(0, 2).join('.')] ||
    CTD_TEMPLATE_CONTENT[ctdSection.charAt(0) === '3' ? '3.2.P' : ''];

  if (sectionContent) {
    return `<h1>${title}</h1>\n${sectionContent}`;
  }

  if (templateKey === 'cover-letter') {
    return `<h1>${title}</h1>
<h2>Addressee</h2>
<p>Address this cover letter to the reviewing agency and division responsible for your program.</p>
<h2>Submission Purpose</h2>
<p>State the submission type, product name, indication, and the regulatory objective of this package.</p>
<h2>Contents Summary</h2>
<p>Summarize the included documents, key updates since the prior interaction, and any referenced attachments.</p>
<h2>Contact Information</h2>
<p>Provide sponsor regulatory contact details, including name, title, email, and phone number.</p>`;
  }
  if (templateKey === 'csr-synopsis') {
    return `<h1>${title}</h1>
<h2>Study Information</h2>
<p>Document protocol number, trial phase, indication, sponsor, and study dates.</p>
<h2>Objectives</h2>
<p>Summarize primary and secondary objectives with endpoints and statistical intent.</p>
<h2>Methodology</h2>
<p>Describe trial design, population, treatment arms, analysis populations, and endpoint definitions.</p>
<h2>Results</h2>
<p>Provide concise efficacy and safety outcomes, including key tables and clinically meaningful findings.</p>
<h2>Conclusions</h2>
<p>Conclude with benefit-risk interpretation and implications for subsequent development or submission steps.</p>`;
  }
  if (templateKey === 'quality-overall-summary') {
    return `<h1>${title}</h1>
<h2>Drug Substance</h2>
<p>Summarize drug substance manufacture, control strategy, critical quality attributes, and release specifications.</p>
<h2>Drug Product</h2>
<p>Summarize formulation, process controls, container closure rationale, and comparability or process validation status.</p>
<h2>Stability</h2>
<p>Summarize stability program design, key findings, proposed shelf life, and storage conditions.</p>`;
  }

  return `<h1>${title}</h1>
<h2>Purpose</h2>
<p>Describe the purpose of this section and its role in the regulatory submission package.</p>
<h2>Scope</h2>
<p>Define the scope of data, analyses, and references included in this section.</p>
<h2>Summary</h2>
<p>Provide a concise summary of key findings, supporting evidence, and conclusions.</p>
<h2>Detailed Content</h2>
<p>Draft section content with explicit traceability to evidence and clear regulatory rationale.</p>`;
}
