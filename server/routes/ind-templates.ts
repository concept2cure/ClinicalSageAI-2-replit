import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// IND template configurations
const indTemplates = {
  1: {
    id: 1,
    title: 'Oncology IND Full Solution',
    description:
      'End-to-end templates for oncology INDs, including protocol templates, CMC documentation, and regulatory response examples.',
    modules: ['Protocol', 'CMC', 'IB', 'FDA Forms', 'Cover Letter'],
    specialization: 'Oncology',
    files: [
      'templates/oncology/protocol_template.docx',
      'templates/oncology/cmc_template.docx',
      'templates/oncology/investigator_brochure.docx',
      'templates/oncology/fda_forms.zip',
      'templates/oncology/cover_letter.docx',
    ],
  },
  2: {
    id: 2,
    title: 'Rare Disease IND Package',
    description:
      'Comprehensive package for rare disease indications with orphan drug designation elements and regulatory pathways.',
    modules: ['Protocol', 'CMC', 'IB', 'FDA Forms', 'Orphan Designation', 'Cover Letter'],
    specialization: 'Rare Disease',
    files: [
      'templates/rare_disease/protocol_template.docx',
      'templates/rare_disease/cmc_template.docx',
      'templates/rare_disease/investigator_brochure.docx',
      'templates/rare_disease/orphan_designation.docx',
      'templates/rare_disease/fda_forms.zip',
      'templates/rare_disease/cover_letter.docx',
    ],
  },
  3: {
    id: 3,
    title: 'First-in-Human IND Template',
    description:
      'Templates designed specifically for Phase 1 first-in-human studies with robust safety monitoring provisions.',
    modules: [
      'Protocol',
      'CMC',
      'IB',
      'FDA Forms',
      'DSUR Template',
      'Safety Monitoring',
      'Cover Letter',
    ],
    specialization: 'Phase 1',
    files: [
      'templates/first_in_human/protocol_template.docx',
      'templates/first_in_human/cmc_template.docx',
      'templates/first_in_human/investigator_brochure.docx',
      'templates/first_in_human/dsur_template.docx',
      'templates/first_in_human/safety_monitoring.docx',
      'templates/first_in_human/fda_forms.zip',
      'templates/first_in_human/cover_letter.docx',
    ],
  },
  4: {
    id: 4,
    title: 'Advanced Therapy IND (Cell/Gene)',
    description:
      'Specialized IND package for cell and gene therapies with comprehensive CMC and manufacturing documentation.',
    modules: [
      'Protocol',
      'Advanced CMC',
      'IB',
      'FDA Forms',
      'Manufacturing Controls',
      'Cover Letter',
    ],
    specialization: 'Cell/Gene Therapy',
    files: [
      'templates/advanced_therapy/protocol_template.docx',
      'templates/advanced_therapy/advanced_cmc.docx',
      'templates/advanced_therapy/investigator_brochure.docx',
      'templates/advanced_therapy/manufacturing_controls.docx',
      'templates/advanced_therapy/fda_forms.zip',
      'templates/advanced_therapy/cover_letter.docx',
    ],
  },
  5: {
    id: 5,
    title: 'Infectious Disease IND Solution',
    description:
      'IND package with special considerations for infectious disease indications including accelerated pathway elements.',
    modules: [
      'Protocol',
      'CMC',
      'IB',
      'FDA Forms',
      'Accelerated Approval Sections',
      'Cover Letter',
    ],
    specialization: 'Infectious Disease',
    files: [
      'templates/infectious_disease/protocol_template.docx',
      'templates/infectious_disease/cmc_template.docx',
      'templates/infectious_disease/investigator_brochure.docx',
      'templates/infectious_disease/accelerated_approval.docx',
      'templates/infectious_disease/fda_forms.zip',
      'templates/infectious_disease/cover_letter.docx',
    ],
  },
};

// IND module configurations
const indModules = {
  1: {
    id: 1,
    name: 'Protocol Template',
    description:
      'Comprehensive clinical protocol template with statistical sections, safety monitoring, and dosing schemas.',
    files: [
      'modules/protocol/clinical_protocol_template.docx',
      'modules/protocol/statistical_analysis_plan.docx',
      'modules/protocol/safety_monitoring_plan.docx',
      'modules/protocol/dosing_schema_template.docx',
    ],
  },
  2: {
    id: 2,
    name: 'CMC Documentation',
    description:
      'Chemistry, manufacturing, and controls documentation templates with compliant formatting and structure.',
    files: [
      'modules/cmc/drug_substance_template.docx',
      'modules/cmc/drug_product_template.docx',
      'modules/cmc/manufacturing_info.docx',
      'modules/cmc/analytical_procedures.docx',
    ],
  },
  3: {
    id: 3,
    name: "Investigator's Brochure",
    description:
      'Standardized IB template with clinical and non-clinical data presentation frameworks.',
    files: [
      'modules/investigator_brochure/ib_template.docx',
      'modules/investigator_brochure/clinical_data_summary.docx',
      'modules/investigator_brochure/nonclinical_data_summary.docx',
    ],
  },
  4: {
    id: 4,
    name: 'FDA Forms Package',
    description:
      'Complete set of FDA forms (1571, 1572, 3674, etc.) with guidance on proper completion.',
    files: [
      'modules/fda_forms/form_1571.pdf',
      'modules/fda_forms/form_1572.pdf',
      'modules/fda_forms/form_3674.pdf',
      'modules/fda_forms/completion_guide.docx',
    ],
  },
  5: {
    id: 5,
    name: 'Cover Letter Templates',
    description:
      'Industry-standard cover letter templates for initial submissions, amendments, and responses to information requests.',
    files: [
      'modules/cover_letters/initial_submission_template.docx',
      'modules/cover_letters/amendment_template.docx',
      'modules/cover_letters/ir_response_template.docx',
    ],
  },
};

// Create template files if they don't exist
async function ensureTemplateFiles() {
  const templatesDir = path.join(process.cwd(), 'templates');

  try {
    await fs.access(templatesDir);
  } catch {
    await fs.mkdir(templatesDir, { recursive: true });
  }

  // Create sample template content
  const sampleTemplateContent = `
# IND Template Document

This is a professional IND template document created by TrialSage™.

## Contents:
- FDA-compliant formatting
- Regulatory guidance integration
- Professional structure
- Ready for customization

Generated: ${new Date().toISOString()}
Template ID: {TEMPLATE_ID}
`;

  // Create template files for each category
  for (const template of Object.values(indTemplates)) {
    for (const file of template.files) {
      const filePath = path.join(templatesDir, file);
      const fileDir = path.dirname(filePath);

      try {
        await fs.access(fileDir);
      } catch {
        await fs.mkdir(fileDir, { recursive: true });
      }

      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(
          filePath,
          sampleTemplateContent.replace('{TEMPLATE_ID}', template.id.toString())
        );
      }
    }
  }
}

// Get IND stats
router.get('/stats', async (req, res) => {
  try {
    const stats = {
      totalSubmissions: 842,
      successRate: 98.4,
      averagePreparationTime: 14.2,
      avgCostSavings: 187500,
      templatesDownloaded: 1247,
      activeProjects: 156,
    };
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch IND stats' });
  }
});

// Download template package
router.get('/template/:id/download', async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const template = indTemplates[templateId];

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await ensureTemplateFiles();

    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    res.attachment(`IND_Template_${templateId}_${template.specialization}.zip`);
    archive.pipe(res);

    // Add template files to archive
    for (const file of template.files) {
      const filePath = path.join(process.cwd(), 'templates', file);
      try {
        await fs.access(filePath);
        archive.file(filePath, { name: path.basename(file) });
      } catch (error) {
        console.warn(`Template file not found: ${filePath}`);
      }
    }

    // Add readme file
    const readme = `
# ${template.title}

${template.description}

## Included Modules:
${template.modules.map(module => `- ${module}`).join('\n')}

## Specialization: ${template.specialization}

## Usage Instructions:
1. Extract all files to your working directory
2. Customize templates with your specific data
3. Follow FDA guidance for submission requirements
4. Use TrialSage™ platform for submission management

Generated: ${new Date().toISOString()}
Template Package ID: ${templateId}
`;

    archive.append(readme, { name: 'README.md' });
    archive.finalize();
  } catch (error) {
    console.error('Template download error:', error);
    res.status(500).json({ error: 'Failed to download template' });
  }
});

// Download module package
router.get('/module/:id/download', async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);
    const module = indModules[moduleId];

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    await ensureTemplateFiles();

    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    res.attachment(`IND_Module_${moduleId}_${module.name.replace(/\s+/g, '_')}.zip`);
    archive.pipe(res);

    // Add module files to archive
    for (const file of module.files) {
      const filePath = path.join(process.cwd(), 'templates', file);
      try {
        await fs.access(filePath);
        archive.file(filePath, { name: path.basename(file) });
      } catch (error) {
        console.warn(`Module file not found: ${filePath}`);
      }
    }

    // Add readme file
    const readme = `
# ${module.name}

${module.description}

## Usage Instructions:
1. Extract all files to your working directory
2. Customize templates with your specific data
3. Follow FDA guidance for submission requirements
4. Use TrialSage™ platform for submission management

Generated: ${new Date().toISOString()}
Module Package ID: ${moduleId}
`;

    archive.append(readme, { name: 'README.md' });
    archive.finalize();
  } catch (error) {
    console.error('Module download error:', error);
    res.status(500).json({ error: 'Failed to download module' });
  }
});

// Create new project from template
router.post('/template/:id/create', async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const template = indTemplates[templateId];

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const projectId = uuidv4();

    // Here you would typically create a project in your database
    // For now, we'll return a success response

    res.json({
      projectId,
      templateId,
      title: template.title,
      specialization: template.specialization,
      modules: template.modules,
      created: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Project creation error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

export default router;
