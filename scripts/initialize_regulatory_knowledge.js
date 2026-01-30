/**
 * Initialize Regulatory Knowledge Base
 *
 * This script sets up the initial structure for the regulatory knowledge base
 * and processes PDFs from the attached_assets folder.
 */

const path = require('path');
const fs = require('fs');
const { setupKnowledgeBase, importDocuments } = require('../server/services/documentProcessor');

async function initializeKnowledgeBase() {
  logger.info('Setting up regulatory knowledge base structure...');

  // Create directory structure
  const directories = [
    'data/ich_guidelines',
    'data/fda_guidelines',
    'data/ema_guidelines',
    'data/pmda_guidelines',
    'data/nmpa_guidelines',
    'data/health_canada_guidelines',
    'data/tga_guidelines',
  ];

  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created directory: ${dir}`);
    }
  }

  // Setup database
  try {
    await setupKnowledgeBase();
    logger.info('Knowledge base database initialized successfully');
  } catch (error) {
    logger.error('Error setting up knowledge base:', error);
    return;
  }

  // Process attached regulatory PDFs
  try {
    const attachedAssetsDir = path.join(__dirname, '../attached_assets');

    // Check if directory exists
    if (fs.existsSync(attachedAssetsDir)) {
      logger.info(`Processing PDFs from ${attachedAssetsDir}`);
      const result = await importDocuments(attachedAssetsDir);
      logger.info(result.message);

      // Log sample of processed files
      const pdfFiles = fs
        .readdirSync(attachedAssetsDir)
        .filter(file => file.toLowerCase().endsWith('.pdf'))
        .slice(0, 10); // Take first 10 files as a sample

      if (pdfFiles.length > 0) {
        logger.info('\nSample of processed PDFs:');
        pdfFiles.forEach(file => logger.info(` - ${file}`));
      }
    } else {
      logger.info(`Directory not found: ${attachedAssetsDir}`);
    }
  } catch (error) {
    logger.error('Error processing documents:', error);
  }
}

// Create taxonomy of regulatory topics
function createRegulatoryTaxonomy() {
  const taxonomy = {
    'Clinical Trials': {
      'Trial Design': ['Randomized Control', 'Adaptive Design', 'Non-inferiority'],
      'Subject Selection': ['Inclusion/Exclusion', 'Demographics', 'Special Populations'],
      Endpoints: ['Primary', 'Secondary', 'Exploratory', 'Surrogate'],
      'Statistical Analysis': ['Powering', 'Multiplicity', 'Missing Data'],
    },
    'Medical Devices': {
      Classification: ['Class I', 'Class II', 'Class III'],
      'Quality System': ['Design Controls', 'CAPA', 'Production Controls'],
      'Clinical Evidence': ['Performance Testing', 'Clinical Data', 'Real-world Evidence'],
      '510(k)': ['Substantial Equivalence', 'Special 510(k)', 'Traditional 510(k)'],
    },
    Pharmaceuticals: {
      Development: ['Preclinical', 'Phase I', 'Phase II', 'Phase III', 'Phase IV'],
      Manufacturing: ['GMP', 'Process Validation', 'Quality Control'],
      Labeling: ['Prescribing Information', 'Patient Information', 'Carton/Container'],
      'Post-Market': ['Pharmacovigilance', 'REMS', 'Risk Management'],
    },
    'Regulatory Submissions': {
      FDA: ['NDA', 'BLA', 'ANDA', 'PMA', '510(k)', 'IDE', 'IND'],
      EMA: ['MAA', 'Scientific Advice', 'Orphan Designation'],
      'Health Canada': ['NOC', 'NOC/c', 'DIN Application'],
      PMDA: ['New Drug Application', 'Quasi-Drug Approval'],
      'Other Authorities': ['NMPA', 'TGA', 'ANVISA'],
    },
    'Standards & Guidelines': {
      ICH: ['Quality (Q)', 'Safety (S)', 'Efficacy (E)', 'Multidisciplinary (M)'],
      ISO: ['ISO 13485', 'ISO 14971', 'ISO 10993'],
      Regional: ['FDA Guidance', 'EMA Guidelines', 'PMDA Guidelines'],
      Industry: ['PhRMA', 'AdvaMed', 'EFPIA'],
    },
  };

  // Save taxonomy to file
  const taxonomyPath = path.join(__dirname, '../data/regulatory_taxonomy.json');
  fs.writeFileSync(taxonomyPath, JSON.stringify(taxonomy, null, 2));
  logger.info(`Regulatory taxonomy created and saved to ${taxonomyPath}`);
}

// Main function
async function main() {
  try {
    logger.info('Starting regulatory knowledge base initialization...');
    await initializeKnowledgeBase();
    createRegulatoryTaxonomy();
    logger.info('Regulatory knowledge base initialization complete');
  } catch (error) {
    logger.error('Error in initialization:', error);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = {
  initializeKnowledgeBase,
  createRegulatoryTaxonomy,
};
