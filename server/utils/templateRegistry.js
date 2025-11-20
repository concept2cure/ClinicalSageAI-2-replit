// Template Registry - Mock IND Templates Data
// In production, this would import from actual template data files

// Generate mock IND templates to simulate the 588+ templates
function generateINDTemplates() {
  const templates = [];
  const sections = [
    { id: 'cover-letter', name: 'Cover Letter', category: 'Administrative' },
    { id: 'form-1571', name: 'Form FDA 1571', category: 'Forms' },
    { id: 'form-1572', name: 'Form FDA 1572', category: 'Forms' },
    { id: 'investigator-cv', name: 'Investigator CV', category: 'Administrative' },
    { id: 'protocol', name: 'Clinical Protocol', category: 'Clinical' },
    { id: 'investigator-brochure', name: 'Investigator\'s Brochure', category: 'Clinical' },
    { id: 'informed-consent', name: 'Informed Consent Form', category: 'Clinical' },
    { id: 'drug-substance', name: 'Drug Substance Information', category: 'CMC' },
    { id: 'drug-product', name: 'Drug Product Information', category: 'CMC' },
    { id: 'manufacturing', name: 'Manufacturing Information', category: 'CMC' },
    { id: 'analytical-methods', name: 'Analytical Methods', category: 'CMC' },
    { id: 'stability', name: 'Stability Data', category: 'CMC' },
    { id: 'pharmacology', name: 'Pharmacology Studies', category: 'Nonclinical' },
    { id: 'toxicology', name: 'Toxicology Studies', category: 'Nonclinical' },
    { id: 'pharmacokinetics', name: 'Pharmacokinetics', category: 'Nonclinical' },
    { id: 'previous-human', name: 'Previous Human Experience', category: 'Clinical' },
    { id: 'additional-info', name: 'Additional Information', category: 'Administrative' }
  ];

  // Generate variations for each section to reach 588+ templates
  sections.forEach((section, idx) => {
    // Base template
    templates.push({
      id: `ind-${section.id}-base`,
      name: section.name,
      category: section.category,
      content: generateTemplateContent(section),
      format: 'html',
      description: `Standard template for ${section.name}`,
      tags: ['ind', 'fda', section.category.toLowerCase()],
    });

    // Phase-specific variations
    ['phase-1', 'phase-2', 'phase-3'].forEach(phase => {
      templates.push({
        id: `ind-${section.id}-${phase}`,
        name: `${section.name} - ${phase.toUpperCase()}`,
        category: section.category,
        content: generateTemplateContent(section, phase),
        format: 'html',
        description: `${phase.toUpperCase()} specific template for ${section.name}`,
        tags: ['ind', 'fda', phase, section.category.toLowerCase()],
      });
    });

    // Therapeutic area variations
    ['oncology', 'cardiology', 'neurology', 'immunology', 'infectious-disease'].forEach(area => {
      templates.push({
        id: `ind-${section.id}-${area}`,
        name: `${section.name} - ${area.charAt(0).toUpperCase() + area.slice(1)}`,
        category: section.category,
        content: generateTemplateContent(section, null, area),
        format: 'html',
        description: `${area.charAt(0).toUpperCase() + area.slice(1)} specific template for ${section.name}`,
        tags: ['ind', 'fda', area, section.category.toLowerCase()],
      });
    });

    // Device combination products
    if (section.category === 'CMC' || section.category === 'Clinical') {
      templates.push({
        id: `ind-${section.id}-device-combo`,
        name: `${section.name} - Device Combination Product`,
        category: section.category,
        content: generateTemplateContent(section, null, null, true),
        format: 'html',
        description: `Device combination product template for ${section.name}`,
        tags: ['ind', 'fda', 'device-combo', section.category.toLowerCase()],
      });
    }

    // Expedited programs
    ['fast-track', 'breakthrough', 'accelerated', 'priority-review'].forEach(program => {
      templates.push({
        id: `ind-${section.id}-${program}`,
        name: `${section.name} - ${program.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`,
        category: section.category,
        content: generateTemplateContent(section, null, null, false, program),
        format: 'html',
        description: `${program.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} template for ${section.name}`,
        tags: ['ind', 'fda', program, section.category.toLowerCase()],
      });
    });
  });

  // Add specialized templates for different IND types
  const indTypes = ['initial', 'amendment', 'annual-report', 'safety-report', 'protocol-amendment'];
  indTypes.forEach(type => {
    templates.push({
      id: `ind-${type}`,
      name: `IND ${type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`,
      category: 'IND Types',
      content: generateINDTypeContent(type),
      format: 'html',
      description: `Template for ${type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`,
      tags: ['ind', 'fda', type],
    });
  });

  // Add more templates to reach 588+
  for (let i = templates.length; i < 600; i++) {
    const moduleNumber = Math.floor(i / 50) + 1;
    const subSection = i % 50 + 1;
    templates.push({
      id: `ind-module-${moduleNumber}-section-${subSection}`,
      name: `Module ${moduleNumber} - Section ${moduleNumber}.${subSection}`,
      category: `Module ${moduleNumber}`,
      content: `<h1>Module ${moduleNumber} - Section ${moduleNumber}.${subSection}</h1>\n<p>Template content for this section.</p>`,
      format: 'html',
      description: `Standard template for Module ${moduleNumber}, Section ${subSection}`,
      tags: ['ind', 'fda', `module-${moduleNumber}`],
    });
  }

  return templates;
}

function generateTemplateContent(section, phase = null, therapeuticArea = null, isDeviceCombo = false, program = null) {
  let content = `<h1>${section.name}</h1>\n`;
  
  if (phase) {
    content += `<h2>${phase.toUpperCase()} Study</h2>\n`;
  }
  
  if (therapeuticArea) {
    content += `<h2>${therapeuticArea.charAt(0).toUpperCase() + therapeuticArea.slice(1)} Indication</h2>\n`;
  }
  
  if (isDeviceCombo) {
    content += `<h2>Device Combination Product Information</h2>\n`;
  }
  
  if (program) {
    content += `<h2>${program.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Designation</h2>\n`;
  }
  
  // Add section-specific content
  switch (section.id) {
    case 'cover-letter':
      content += `
<p>[Date]</p>
<p>Food and Drug Administration<br/>
Center for Drug Evaluation and Research<br/>
Document Control Center<br/>
5901-B Ammendale Rd<br/>
Beltsville, MD 20705-1266</p>

<p>RE: IND [NUMBER] - [DRUG NAME]</p>

<p>Dear Review Team:</p>

<p>We are submitting this Investigational New Drug (IND) application for [DRUG NAME] for the treatment of [INDICATION]. This submission contains all required sections per 21 CFR 312.</p>

<p>The proposed clinical development program includes [BRIEF DESCRIPTION].</p>

<p>Sincerely,<br/>
[Name]<br/>
[Title]<br/>
[Company]</p>`;
      break;
      
    case 'drug-substance':
      content += `
<h2>3.2.S Drug Substance</h2>
<h3>3.2.S.1 General Information</h3>
<p>[Nomenclature, structure, general properties]</p>

<h3>3.2.S.2 Manufacture</h3>
<p>[Manufacturing process and controls]</p>

<h3>3.2.S.3 Characterization</h3>
<p>[Elucidation of structure and other characteristics]</p>

<h3>3.2.S.4 Control of Drug Substance</h3>
<p>[Specification, analytical procedures, validation]</p>

<h3>3.2.S.5 Reference Standards</h3>
<p>[Reference standards or materials]</p>

<h3>3.2.S.6 Container Closure System</h3>
<p>[Container closure system description]</p>

<h3>3.2.S.7 Stability</h3>
<p>[Stability summary and conclusions]</p>`;
      break;
      
    case 'protocol':
      content += `
<h2>Clinical Study Protocol</h2>
<h3>1. Protocol Title</h3>
<p>[Full protocol title including phase, indication, and drug name]</p>

<h3>2. Protocol Number</h3>
<p>[Unique protocol identifier]</p>

<h3>3. Objectives</h3>
<h4>3.1 Primary Objectives</h4>
<p>[Primary study objectives]</p>

<h4>3.2 Secondary Objectives</h4>
<p>[Secondary study objectives]</p>

<h3>4. Study Design</h3>
<p>[Description of study design, including randomization, blinding, controls]</p>

<h3>5. Study Population</h3>
<h4>5.1 Inclusion Criteria</h4>
<p>[List of inclusion criteria]</p>

<h4>5.2 Exclusion Criteria</h4>
<p>[List of exclusion criteria]</p>

<h3>6. Study Drug</h3>
<p>[Dosing, administration, modifications]</p>

<h3>7. Study Assessments</h3>
<p>[Schedule of assessments and procedures]</p>

<h3>8. Statistical Analysis</h3>
<p>[Statistical methods and sample size calculation]</p>`;
      break;
      
    default:
      content += `
<h2>Section Overview</h2>
<p>This section provides comprehensive information about ${section.name.toLowerCase()}.</p>

<h2>Key Information</h2>
<p>[Detailed content specific to this section]</p>

<h2>Supporting Data</h2>
<p>[References to supporting documentation and data]</p>`;
  }
  
  return content;
}

function generateINDTypeContent(type) {
  const typeFormatted = type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  
  return `
<h1>IND ${typeFormatted}</h1>

<h2>Submission Information</h2>
<p>IND Number: [IND NUMBER]</p>
<p>Submission Date: [DATE]</p>
<p>Sponsor: [SPONSOR NAME]</p>

<h2>${typeFormatted} Details</h2>
<p>[Specific information for this ${type} submission]</p>

<h2>Summary of Changes</h2>
<p>[If applicable, summary of changes from previous submission]</p>

<h2>Supporting Documentation</h2>
<p>[List of attached documents and appendices]</p>
`;
}

// Generate eCTD templates
function generateECTDTemplates() {
  const templates = [];
  const modules = [
    { number: 1, name: 'Administrative Information', sections: 10 },
    { number: 2, name: 'Common Technical Document Summaries', sections: 7 },
    { number: 3, name: 'Quality', sections: 15 },
    { number: 4, name: 'Nonclinical Study Reports', sections: 8 },
    { number: 5, name: 'Clinical Study Reports', sections: 12 }
  ];
  
  modules.forEach(module => {
    for (let i = 1; i <= module.sections; i++) {
      templates.push({
        id: `ectd-m${module.number}-s${i}`,
        name: `Module ${module.number}.${i} - ${module.name}`,
        category: `eCTD Module ${module.number}`,
        content: `<h1>Module ${module.number}.${i}</h1>\n<h2>${module.name}</h2>\n<p>Content for this eCTD section.</p>`,
        format: 'html',
        description: `eCTD Module ${module.number} Section ${i}`,
        tags: ['ectd', 'fda', `module-${module.number}`],
      });
    }
  });
  
  return templates;
}

// Main export functions
export function getAllTemplates() {
  const templates = [];
  
  // Add IND templates (588+)
  const indTemplates = generateINDTemplates();
  templates.push(...indTemplates);
  
  // Add eCTD templates
  const ectdTemplates = generateECTDTemplates();
  templates.push(...ectdTemplates);
  
  return templates;
}

export function getTemplateById(id) {
  const templates = getAllTemplates();
  return templates.find(t => t.id === id);
}

export function getTemplatesByCategory(category) {
  const templates = getAllTemplates();
  return templates.filter(t => t.category === category);
}

export function getTemplatesByTag(tag) {
  const templates = getAllTemplates();
  return templates.filter(t => t.tags && t.tags.includes(tag));
}

export function searchTemplates(query) {
  const templates = getAllTemplates();
  const searchTerm = query.toLowerCase();
  
  return templates.filter(t => 
    t.name.toLowerCase().includes(searchTerm) ||
    t.description.toLowerCase().includes(searchTerm) ||
    t.category.toLowerCase().includes(searchTerm) ||
    (t.tags && t.tags.some(tag => tag.includes(searchTerm)))
  );
}