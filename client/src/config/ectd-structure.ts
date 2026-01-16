export const ECTD_DOCUMENT_TYPE = 'ectd-module';

export type INDSection = {
  moduleNumber: string;
  moduleTitle: string;
  sectionId: string;
  title: string;
  defaultContent: string;
};

export type INDModule = {
  moduleNumber: string;
  moduleTitle: string;
  sections: INDSection[];
};

const trim = (value: string) => value.replace(/^\s+|\s+$/g, '');

export const IND_PYRAMID: INDModule[] = [
  {
    moduleNumber: '1',
    moduleTitle: 'Module 1 – Administrative and Product Information',
    sections: [
      {
        moduleNumber: '1',
        moduleTitle: 'Module 1 – Administrative and Product Information',
        sectionId: '1.1',
        title: 'Forms',
        defaultContent: trim(`
  <h1>1.1 Forms for {{Company}}</h1>
  <p>Complete and include all required administrative forms supporting the {{DrugName}} application submitted on {{Date}}.</p>
<h2>1.1.1 Application Form FDA 356h</h2>
<h2>1.1.2 Field Copy Certification</h2>
<h2>1.1.3 User Fee Cover Sheet</h2>
<h2>1.1.4 Financial Disclosure Certification</h2>
<h2>1.1.5 Other Regional Forms</h2>
`),
      },
      {
        moduleNumber: '1',
        moduleTitle: 'Module 1 – Administrative and Product Information',
        sectionId: '1.2',
        title: 'Cover Letter',
        defaultContent: trim(`
  <h1>1.2 Cover Letter for {{DrugName}}</h1>
  <p>Provide a formal cover letter summarizing the {{DrugName}} submission package prepared by {{Company}} on {{Date}}.</p>
<h2>1.2.1 Submission Overview</h2>
<h2>1.2.2 Purpose of the Application</h2>
<h2>1.2.3 Requested Regulatory Action</h2>
<h2>1.2.4 Contact Information</h2>
<h2>1.2.5 Attachments and Appendices</h2>
`),
      },
    ],
  },
  {
    moduleNumber: '2',
    moduleTitle: 'Module 2 – Common Technical Document Summaries',
    sections: [
      {
        moduleNumber: '2',
        moduleTitle: 'Module 2 – Common Technical Document Summaries',
        sectionId: '2.4',
        title: 'Nonclinical Overview',
        defaultContent: trim(`
  <h1>2.4 Nonclinical Overview for {{DrugName}}</h1>
  <p>Summarize the nonclinical development program supporting the {{DrugName}} application from {{Company}}; reference data current as of {{Date}}.</p>
<h2>2.4.1 Introduction</h2>
<h2>2.4.2 Pharmacology</h2>
<h2>2.4.3 Pharmacokinetics</h2>
<h2>2.4.4 Toxicology</h2>
<h2>2.4.5 Integrated Overview and Conclusions</h2>
<h2>2.4.6 References</h2>
`),
      },
      {
        moduleNumber: '2',
        moduleTitle: 'Module 2 – Common Technical Document Summaries',
        sectionId: '2.5',
        title: 'Clinical Overview',
        defaultContent: trim(`
  <h1>2.5 Clinical Overview for {{DrugName}}</h1>
  <p>Provide a concise interpretation of the {{DrugName}} clinical program led by {{Company}}, noting evidence status at {{Date}}.</p>
<h2>2.5.1 Product Development Rationale</h2>
<h2>2.5.2 Overview of Biopharmaceutics</h2>
<h2>2.5.3 Overview of Clinical Pharmacology</h2>
<h2>2.5.4 Overview of Clinical Efficacy</h2>
<h2>2.5.5 Overview of Clinical Safety</h2>
<h2>2.5.6 Benefits and Risks Conclusions</h2>
<h2>2.5.7 References</h2>
`),
      },
      {
        moduleNumber: '2',
        moduleTitle: 'Module 2 – Common Technical Document Summaries',
        sectionId: '2.6',
        title: 'Nonclinical Summary',
        defaultContent: trim(`
  <h1>2.6 Nonclinical Summary for {{DrugName}}</h1>
  <p>Summarize the nonclinical studies supporting {{DrugName}}, with data curated by {{Company}} and validated on {{Date}}.</p>
<h2>2.6.1 Introduction</h2>
<h2>2.6.2 Pharmacology Written Summary</h2>
<h2>2.6.3 Pharmacokinetics Written Summary</h2>
<h2>2.6.4 Toxicology Written Summary</h2>
<h2>2.6.5 Tabulated Summary of Pharmacology</h2>
<h2>2.6.6 Tabulated Summary of Pharmacokinetics</h2>
<h2>2.6.7 Tabulated Summary of Toxicology</h2>
<h2>2.6.8 References</h2>
`),
      },
      {
        moduleNumber: '2',
        moduleTitle: 'Module 2 – Common Technical Document Summaries',
        sectionId: '2.7',
        title: 'Clinical Summary',
        defaultContent: trim(`
  <h1>2.7 Clinical Summary for {{DrugName}}</h1>
  <p>Present detailed analyses of the {{DrugName}} clinical dossier, integrating results available to {{Company}} as of {{Date}}.</p>
<h2>2.7.1 Introduction</h2>
<h2>2.7.2 Summary of Biopharmaceutics and Associated Analytical Methods</h2>
<h2>2.7.3 Summary of Clinical Pharmacology Studies</h2>
<h2>2.7.4 Summary of Clinical Efficacy</h2>
<h2>2.7.5 Summary of Clinical Safety</h2>
<h2>2.7.6 Benefit-Risk Assessment</h2>
<h2>2.7.7 References</h2>
`),
      },
    ],
  },
  {
    moduleNumber: '3',
    moduleTitle: 'Module 3 – Quality (Chemistry, Manufacturing, and Controls)',
    sections: [
      {
        moduleNumber: '3',
        moduleTitle: 'Module 3 – Quality (Chemistry, Manufacturing, and Controls)',
        sectionId: '3.2.S',
        title: 'Drug Substance',
        defaultContent: trim(`
  <h1>3.2.S Drug Substance for {{DrugName}}</h1>
  <p>Document the chemistry, manufacturing, and controls for the {{DrugName}} drug substance as supplied by {{Company}} with data current to {{Date}}.</p>
<h2>3.2.S.1 General Information</h2>
<h2>3.2.S.2 Manufacture</h2>
<h2>3.2.S.3 Characterisation</h2>
<h2>3.2.S.4 Control of Drug Substance</h2>
<h2>3.2.S.5 Reference Standards or Materials</h2>
<h2>3.2.S.6 Container Closure System</h2>
<h2>3.2.S.7 Stability</h2>
`),
      },
      {
        moduleNumber: '3',
        moduleTitle: 'Module 3 – Quality (Chemistry, Manufacturing, and Controls)',
        sectionId: '3.2.P',
        title: 'Drug Product',
        defaultContent: trim(`
  <h1>3.2.P Drug Product for {{DrugName}}</h1>
  <p>Provide detailed information on the {{DrugName}} finished product, including manufacturing controls overseen by {{Company}} as of {{Date}}.</p>
<h2>3.2.P.1 Description and Composition</h2>
<h2>3.2.P.2 Pharmaceutical Development</h2>
<h2>3.2.P.3 Manufacture</h2>
<h2>3.2.P.4 Control of Excipients</h2>
<h2>3.2.P.5 Control of Drug Product</h2>
<h2>3.2.P.6 Reference Standards or Materials</h2>
<h2>3.2.P.7 Container Closure System</h2>
<h2>3.2.P.8 Stability</h2>
`),
      },
    ],
  },
  {
    moduleNumber: '4',
    moduleTitle: 'Module 4 – Nonclinical Study Reports',
    sections: [
      {
        moduleNumber: '4',
        moduleTitle: 'Module 4 – Nonclinical Study Reports',
        sectionId: '4.2',
        title: 'Study Reports',
        defaultContent: trim(`
  <h1>4.2 Study Reports for {{DrugName}}</h1>
  <p>Compile individual nonclinical study reports supporting the {{DrugName}} safety assessment prepared by {{Company}} through {{Date}}.</p>
<h2>4.2.1 Primary Pharmacodynamics</h2>
<h2>4.2.2 Secondary Pharmacodynamics</h2>
<h2>4.2.3 Safety Pharmacology</h2>
<h2>4.2.4 Pharmacodynamic Drug Interactions</h2>
<h2>4.2.5 Additional Pharmacology Studies</h2>
<h2>4.2.6 Tabulated Summaries</h2>
`),
      },
    ],
  },
  {
    moduleNumber: '5',
    moduleTitle: 'Module 5 – Clinical Study Reports',
    sections: [
      {
        moduleNumber: '5',
        moduleTitle: 'Module 5 – Clinical Study Reports',
        sectionId: '5.3',
        title: 'Clinical Study Reports',
        defaultContent: trim(`
  <h1>5.3 Clinical Study Reports for {{DrugName}}</h1>
  <p>Provide comprehensive clinical study reports and supporting information for {{DrugName}}, incorporating contributions from {{Company}} with data locked on {{Date}}.</p>
<h2>5.3.1 Table of Contents for Clinical Study Reports</h2>
<h2>5.3.2 Tabular Listing of All Clinical Studies</h2>
<h2>5.3.3 Clinical Study Reports</h2>
<h2>5.3.4 Clinical Study Reports of Special Types</h2>
<h2>5.3.5 Integrated Summaries</h2>
<h2>5.3.6 Appendices</h2>
`),
      },
    ],
  },
];

export const IND_SECTION_LOOKUP: Record<string, INDSection> = IND_PYRAMID.reduce(
  (acc, module) => {
    module.sections.forEach(section => {
      acc[section.sectionId] = section;
    });
    return acc;
  },
  {} as Record<string, INDSection>,
);

export const getSectionById = (sectionId: string): INDSection | undefined =>
  IND_SECTION_LOOKUP[sectionId];
