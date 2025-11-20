/**
 * eCTD Templates Service
 * Handles loading and processing of authentic FDA and EMA eCTD templates
 * Phase 4: eCTD Templates and Compliance Implementation
 */

import { DOMParser } from '@xmldom/xmldom';

class ECTDTemplatesService {
  constructor() {
    this.templates = {
      fda: null,
      ema: null,
    };
    this.initialized = false;
  }

  /**
   * Initialize the service by loading templates
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await this.loadTemplates();
      this.initialized = true;
      console.log('eCTD Templates Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize eCTD Templates Service:', error);
      throw error;
    }
  }

  /**
   * Load all available templates
   */
  async loadTemplates() {
    try {
      // Load FDA template
      const fdaResponse = await fetch('/templates/ectd/fda_template.xml');
      if (fdaResponse.ok) {
        const fdaXml = await fdaResponse.text();
        this.templates.fda = this.parseTemplate(fdaXml, 'FDA');
      }

      // Load EMA template
      const emaResponse = await fetch('/templates/ectd/ema_template.xml');
      if (emaResponse.ok) {
        const emaXml = await emaResponse.text();
        this.templates.ema = this.parseTemplate(emaXml, 'EMA');
      }

      console.log('All eCTD templates loaded successfully');
    } catch (error) {
      console.error('Error loading eCTD templates:', error);
      throw error;
    }
  }

  /**
   * Parse XML template into structured format
   */
  parseTemplate(xmlString, region) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

      const template = {
        region,
        version: xmlDoc.documentElement.getAttribute('version'),
        modules: this.extractModules(xmlDoc),
        complianceRequirements: this.extractComplianceRequirements(xmlDoc),
        metadata: this.extractMetadata(xmlDoc),
      };

      return template;
    } catch (error) {
      console.error(`Error parsing ${region} template:`, error);
      return null;
    }
  }

  /**
   * Extract module structure from XML
   */
  extractModules(xmlDoc) {
    const modules = {};

    // Extract all modules (module-1 through module-5)
    for (let i = 1; i <= 5; i++) {
      const moduleElement = xmlDoc.querySelector(`module-${i}`);
      if (moduleElement) {
        modules[`module-${i}`] = {
          title: moduleElement.getAttribute('title'),
          sections: this.extractSections(moduleElement),
          required: true,
        };
      }
    }

    return modules;
  }

  /**
   * Extract sections from a module
   */
  extractSections(moduleElement) {
    const sections = {};
    const sectionElements = moduleElement.children;

    for (let i = 0; i < sectionElements.length; i++) {
      const section = sectionElements[i];
      const sectionId = section.tagName;

      sections[sectionId] = {
        title: section.getAttribute('title'),
        subsections: this.extractSubsections(section),
        required: true,
      };
    }

    return sections;
  }

  /**
   * Extract subsections recursively
   */
  extractSubsections(sectionElement) {
    const subsections = {};
    const children = sectionElement.children;

    for (let i = 0; i < children.length; i++) {
      const subsection = children[i];
      const subsectionId = subsection.tagName;

      subsections[subsectionId] = {
        title: subsection.getAttribute('title'),
        required: true,
      };
    }

    return subsections;
  }

  /**
   * Extract compliance requirements
   */
  extractComplianceRequirements(xmlDoc) {
    const complianceElement = xmlDoc.querySelector('compliance-requirements');
    if (!complianceElement) return {};

    const requirements = {
      requiredSections: [],
      validationRules: [],
      specificRequirements: {},
    };

    // Extract required sections
    const requiredSections = complianceElement.querySelectorAll('required-sections section');
    for (let i = 0; i < requiredSections.length; i++) {
      const section = requiredSections[i];
      requirements.requiredSections.push({
        id: section.getAttribute('id'),
        mandatory: section.getAttribute('mandatory') === 'true',
        description: section.getAttribute('description'),
      });
    }

    // Extract validation rules
    const validationRules = complianceElement.querySelectorAll('validation-rules rule');
    for (let i = 0; i < validationRules.length; i++) {
      const rule = validationRules[i];
      requirements.validationRules.push({
        id: rule.getAttribute('id'),
        minWords: parseInt(rule.getAttribute('min-words')) || null,
        maxWords: parseInt(rule.getAttribute('max-words')) || null,
        mandatoryContent: rule.getAttribute('mandatory-content')?.split(',') || [],
        sections: rule.getAttribute('sections')?.split(',') || [],
      });
    }

    return requirements;
  }

  /**
   * Extract metadata from template
   */
  extractMetadata(xmlDoc) {
    const adminInfo = xmlDoc.querySelector('administrative-information');
    if (!adminInfo) return {};

    return {
      submissionType: adminInfo.querySelector('submission-type')?.textContent || '',
      applicationType: adminInfo.querySelector('application-type')?.textContent || '',
      version: xmlDoc.documentElement.getAttribute('version') || '4.0',
    };
  }

  /**
   * Load a specific template by name
   */
  async loadTemplate(templateName) {
    if (!this.initialized) {
      await this.initialize();
    }

    const template = this.templates[templateName.toLowerCase()];
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    return this.convertToEditorFormat(template);
  }

  /**
   * Convert template structure to editor-compatible format
   */
  convertToEditorFormat(template) {
    const editorDocument = {
      title: `${template.region} eCTD Submission`,
      type: 'ectd',
      region: template.region,
      version: template.version,
      sections: [],
      metadata: template.metadata,
      compliance: template.complianceRequirements,
    };

    // Convert modules to editor sections
    Object.entries(template.modules).forEach(([moduleId, module]) => {
      const editorSection = {
        id: moduleId,
        title: module.title,
        content: this.generateModuleContent(moduleId, module),
        subsections: [],
        required: module.required,
      };

      // Convert sections to subsections
      Object.entries(module.sections).forEach(([sectionId, section]) => {
        editorSection.subsections.push({
          id: sectionId,
          title: section.title,
          content: this.generateSectionContent(sectionId, section),
          required: section.required,
        });
      });

      editorDocument.sections.push(editorSection);
    });

    return editorDocument;
  }

  /**
   * Generate starter content for modules
   */
  generateModuleContent(moduleId, module) {
    const contentTemplates = {
      'module-1': `# ${module.title}

This module contains administrative information and prescribing information for the submission.

## Key Components:
- Forms and applications
- Cover letters
- Administrative documentation
- Contact information

*Please complete all required sections according to regulatory guidelines.*`,

      'module-2': `# ${module.title}

This module provides comprehensive summaries of the Common Technical Document.

## Clinical Overview Requirements:
- Product development strategy
- Biopharmaceutics overview
- Clinical pharmacology overview
- Efficacy and safety assessments
- Benefit-risk analysis

*All summaries must be comprehensive yet concise, following ICH guidelines.*`,

      'module-3': `# ${module.title}

This module contains detailed quality information about the drug substance and drug product.

## Quality Documentation:
- Drug substance manufacturing and characterization
- Drug product formulation and manufacturing
- Quality control and specifications
- Stability data

*Ensure all quality data meets current regulatory standards.*`,

      'module-4': `# ${module.title}

This module includes non-clinical study reports supporting the safety profile.

## Non-clinical Studies:
- Pharmacology studies
- Pharmacokinetic studies
- Toxicology studies
- Safety assessments

*All studies must comply with GLP standards where applicable.*`,

      'module-5': `# ${module.title}

This module contains clinical study reports and clinical data.

## Clinical Documentation:
- Clinical study protocols
- Clinical study reports
- Statistical analyses
- Safety updates

*Ensure all clinical data complies with GCP guidelines.*`,
    };

    return (
      contentTemplates[moduleId] ||
      `# ${module.title}\n\n*Content to be provided according to regulatory requirements.*`
    );
  }

  /**
   * Generate starter content for sections
   */
  generateSectionContent(sectionId, section) {
    return `## ${section.title}\n\n*This section should contain detailed information as required by regulatory guidelines.*\n\n### Requirements:\n- Follow applicable regulatory standards\n- Provide comprehensive documentation\n- Ensure compliance with submission guidelines`;
  }

  /**
   * Get available templates
   */
  getAvailableTemplates() {
    return Object.keys(this.templates).filter(key => this.templates[key] !== null);
  }

  /**
   * Validate document against template requirements
   */
  validateDocument(document, templateName) {
    const template = this.templates[templateName.toLowerCase()];
    if (!template) {
      return { valid: false, errors: ['Template not found'] };
    }

    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      complianceScore: 0,
    };

    // Check required sections
    const requiredSections = template.complianceRequirements.requiredSections || [];
    let sectionsFound = 0;

    requiredSections.forEach(reqSection => {
      const found = document.sections?.some(
        section =>
          section.id === reqSection.id || section.subsections?.some(sub => sub.id === reqSection.id)
      );

      if (reqSection.mandatory && !found) {
        validation.errors.push(
          `Required section ${reqSection.id} is missing: ${reqSection.description}`
        );
        validation.valid = false;
      } else if (found) {
        sectionsFound++;
      }
    });

    // Check validation rules
    const validationRules = template.complianceRequirements.validationRules || [];
    validationRules.forEach(rule => {
      if (rule.minWords || rule.maxWords) {
        const wordCount = this.countWords(document);
        if (rule.minWords && wordCount < rule.minWords) {
          validation.warnings.push(
            `Document length (${wordCount} words) is below minimum requirement (${rule.minWords} words)`
          );
        }
        if (rule.maxWords && wordCount > rule.maxWords) {
          validation.warnings.push(
            `Document length (${wordCount} words) exceeds maximum limit (${rule.maxWords} words)`
          );
        }
      }
    });

    // Calculate compliance score
    if (requiredSections.length > 0) {
      validation.complianceScore = Math.round((sectionsFound / requiredSections.length) * 100);
    }

    return validation;
  }

  /**
   * Count words in document
   */
  countWords(document) {
    let totalWords = 0;

    if (document.sections) {
      document.sections.forEach(section => {
        if (section.content) {
          totalWords += section.content.split(/\s+/).length;
        }
        if (section.subsections) {
          section.subsections.forEach(subsection => {
            if (subsection.content) {
              totalWords += subsection.content.split(/\s+/).length;
            }
          });
        }
      });
    }

    return totalWords;
  }
}

// Export singleton instance
export const ectdTemplatesService = new ECTDTemplatesService();
export default ectdTemplatesService;
