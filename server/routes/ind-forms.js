/**
 * IND Forms API Router
 *
 * This module handles all API endpoints related to FDA forms generation,
 * data retrieval, and management for the IND Wizard.
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const router = express.Router();
// Simplified PDF generation without external dependencies
// We'll use a simulated approach until we can install pdfkit and uuid

// Set up paths for form templates and generated files
const FORMS_DIR = path.join(process.cwd(), 'ind_mock');
const TEMPLATES_DIR = path.join(process.cwd(), 'templates', 'forms');

// Create directories if they don't exist
if (!fs.existsSync(FORMS_DIR)) {
  fs.mkdirSync(FORMS_DIR, { recursive: true });
}

// Helper function to get form data from database or cache
async function getFormData(projectId, formId) {
  try {
    // TODO: Implement database lookup
    // For now, return mock data
    const defaultData = {
      formId,
      projectId,
      data: {},
      status: 'not_started',
      lastUpdated: null,
      version: null,
    };

    // Return form-specific default data
    switch (formId) {
      case '1571':
        return {
          ...defaultData,
          data: {
            sponsor_name: 'Acme Pharmaceuticals',
            sponsor_address: '123 Medical Parkway\nBioCity, CA 90210',
            drug_name: 'ACME-001',
            date_of_submission: new Date().toISOString().split('T')[0],
            ind_number: '',
            phase: 'Phase 1',
          },
        };
      case '1572':
        return {
          ...defaultData,
          data: {
            investigator_name: 'Dr. Jane Smith',
            investigator_address: '456 Research Drive\nClinical Center\nMedicalville, CA 92001',
            investigator_phone: '(555) 123-4567',
            investigator_email: 'jsmith@research.med',
            education:
              'M.D., Stanford University, 2008\nResidency in Oncology, UCSF Medical Center, 2012',
            facility_name: 'Clinical Research Center',
            facility_address: '456 Research Drive\nMedicalville, CA 92001',
            irb_name: 'Medicalville IRB',
            irb_address: '789 Ethics Blvd.\nMedicalville, CA 92001',
            phase: 'Phase 1',
            certification_date: new Date().toISOString().split('T')[0],
            subinvestigators: JSON.stringify([
              { name: 'Dr. Robert Johnson', role: 'Sub-Investigator' },
              { name: 'Dr. Maria Garcia', role: 'Research Coordinator' },
            ]),
          },
        };
      case '3674':
        return {
          ...defaultData,
          data: {
            sponsor_name: 'Acme Pharmaceuticals',
            submission_type: 'Initial IND',
            certify_option: 'requirements_not_applicable',
            certification_date: new Date().toISOString().split('T')[0],
          },
        };
      case '3454':
        return {
          ...defaultData,
          data: {
            sponsor_name: 'Acme Pharmaceuticals',
            application_number: '',
            drug_name: 'ACME-001',
            certification_option: 'no_financial_arrangements',
            certification_date: new Date().toISOString().split('T')[0],
          },
        };
      default:
        return defaultData;
    }
  } catch (error) {
    console.error(`Error fetching form data for project ${projectId}, form ${formId}:`, error);
    throw error;
  }
}

// Helper function to save form data
async function saveFormData(projectId, formId, formData) {
  try {
    // TODO: Implement database storage
    // For now, return success
    return {
      success: true,
      formId,
      projectId,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error saving form data for project ${projectId}, form ${formId}:`, error);
    throw error;
  }
}

// Helper function to generate a sample PDF form (simplified for development)
async function generatePdfForm(projectId, formId, formData) {
  return new Promise((resolve, reject) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `Form_FDA_${formId}_${projectId}_${timestamp}.pdf`;
      const outputPath = path.join(FORMS_DIR, filename);

      // For development, create a simple text file that mimics a PDF
      // This avoids needing to install PDF generation libraries
      const content = [];

      // Add content based on form type
      switch (formId) {
        case '1571':
          content.push('FDA FORM 1571 - INVESTIGATIONAL NEW DRUG APPLICATION');
          content.push('------------------------------------------------------');
          content.push(`Sponsor: ${formData.sponsor_name || 'Not specified'}`);
          content.push(`Drug: ${formData.drug_name || 'Not specified'}`);
          content.push(`Phase: ${formData.phase || 'Not specified'}`);
          content.push(`IND Number: ${formData.ind_number || 'Not yet assigned'}`);
          content.push(`Date: ${formData.date_of_submission || new Date().toLocaleDateString()}`);
          break;
        case '1572':
          content.push('FDA FORM 1572 - STATEMENT OF INVESTIGATOR');
          content.push('------------------------------------------');
          content.push(`Investigator: ${formData.investigator_name || 'Not specified'}`);
          content.push(`Facility: ${formData.facility_name || 'Not specified'}`);
          content.push(`IRB: ${formData.irb_name || 'Not specified'}`);
          content.push(`Phone: ${formData.investigator_phone || 'Not specified'}`);
          content.push(`Email: ${formData.investigator_email || 'Not specified'}`);
          break;
        case '3674':
          content.push('FDA FORM 3674 - CERTIFICATION OF COMPLIANCE');
          content.push('---------------------------------------------');
          content.push(`Sponsor: ${formData.sponsor_name || 'Not specified'}`);
          content.push(`Submission Type: ${formData.submission_type || 'Not specified'}`);
          content.push(`Date: ${formData.certification_date || new Date().toLocaleDateString()}`);
          break;
        case '3454':
          content.push('FDA FORM 3454 - FINANCIAL DISCLOSURE');
          content.push('--------------------------------------');
          content.push(`Sponsor: ${formData.sponsor_name || 'Not specified'}`);
          content.push(`Drug Name: ${formData.drug_name || 'Not specified'}`);
          content.push(`Date: ${formData.certification_date || new Date().toLocaleDateString()}`);
          break;
        default:
          content.push(`FDA FORM ${formId} - PREVIEW`);
          content.push('--------------------------------');
          content.push('Form content would appear here.');
      }

      // Create the directory if it doesn't exist
      if (!fs.existsSync(path.dirname(outputPath))) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      }

      // Write content to file
      fs.writeFileSync(outputPath, content.join('\n\n'));

      // Return success
      resolve({
        filePath: outputPath,
        filename,
        downloadUrl: `/api/ind/${projectId}/forms/${formId}/download/${timestamp}`,
      });
    } catch (error) {
      console.error(`Error generating form for project ${projectId}, form ${formId}:`, error);
      reject(error);
    }
  });
}

// Helper function to generate Form FDA 1571 content
function generateForm1571(doc, formData) {
  // Header
  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .text('DEPARTMENT OF HEALTH AND HUMAN SERVICES', { align: 'center' });
  doc.fontSize(14).font('Helvetica-Bold').text('FOOD AND DRUG ADMINISTRATION', { align: 'center' });
  doc.moveDown(1);
  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('INVESTIGATIONAL NEW DRUG APPLICATION (IND)', { align: 'center' });
  doc.fontSize(18).font('Helvetica-Bold').text('FORM FDA 1571', { align: 'center' });
  doc.moveDown(2);

  // Form content
  doc.fontSize(12).font('Helvetica-Bold').text('1. NAME OF SPONSOR:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.sponsor_name || '[Sponsor Name]');
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica-Bold').text('2. ADDRESS:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.sponsor_address || '[Sponsor Address]');
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica-Bold').text('3. NAME OF DRUG:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.drug_name || '[Drug Name]');
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica-Bold').text('4. PHASE OF CLINICAL INVESTIGATION:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.phase || '[Phase]');
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica-Bold').text('5. IND NUMBER (if previously assigned):');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.ind_number || '[IND Number if available]');
  doc.moveDown(2);

  doc.fontSize(12).font('Helvetica-Bold').text('CONTENTS OF APPLICATION');
  doc.moveDown(0.5);

  // Checkboxes for contents
  const contentOptions = [
    '1. Form FDA 1572',
    '2. Table of Contents',
    '3. Introductory Statement',
    '4. General Investigational Plan',
    "5. Investigator's Brochure",
    '6. Protocol(s)',
  ];

  contentOptions.forEach(option => {
    doc.fontSize(11).font('Helvetica').text(`☑ ${option}`);
    doc.moveDown(0.5);
  });

  doc.moveDown(1);

  // Certification
  doc.fontSize(12).font('Helvetica-Bold').text('CERTIFICATION');
  doc.moveDown(0.5);
  doc
    .fontSize(10)
    .font('Helvetica')
    .text(
      "I agree not to begin clinical investigations until 30 days after FDA's receipt of the IND unless I receive earlier notification by FDA that the studies may begin. I also agree not to begin or continue clinical investigations covered by the IND if those studies are placed on clinical hold. I agree that an Institutional Review Board (IRB) that complies with the requirements set forth in 21 CFR Part 56 will be responsible for initial and continuing review and approval of each of the studies in the proposed clinical investigation. I agree to conduct the investigation in accordance with all other applicable regulatory requirements."
    );
  doc.moveDown(1);

  // Signature
  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .text("SIGNATURE OF SPONSOR OR SPONSOR'S AUTHORIZED REPRESENTATIVE");
  doc.moveDown(3);
  doc.fontSize(11).font('Helvetica').text('______________________________');
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica-Bold').text('DATE:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.date_of_submission || new Date().toLocaleDateString());
}

// Helper function to generate Form FDA 1572 content
function generateForm1572(doc, formData) {
  // Header
  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .text('DEPARTMENT OF HEALTH AND HUMAN SERVICES', { align: 'center' });
  doc.fontSize(14).font('Helvetica-Bold').text('FOOD AND DRUG ADMINISTRATION', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(18).font('Helvetica-Bold').text('STATEMENT OF INVESTIGATOR', { align: 'center' });
  doc.fontSize(16).font('Helvetica-Bold').text('FORM FDA 1572', { align: 'center' });
  doc.moveDown(2);

  // Form content
  doc.fontSize(12).font('Helvetica-Bold').text('1. NAME OF INVESTIGATOR:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.investigator_name || '[Investigator Name]');
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica-Bold').text('2. ADDRESS:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.investigator_address || '[Investigator Address]');
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica-Bold').text('3. TELEPHONE NUMBER:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.investigator_phone || '[Telephone Number]');
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica-Bold').text('4. EMAIL ADDRESS:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.investigator_email || '[Email Address]');
  doc.moveDown(1);

  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('5. EDUCATION, TRAINING, AND EXPERIENCE THAT QUALIFIES THE INVESTIGATOR:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.education || '[Education and Experience]');
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica-Bold').text('6. NAME AND ADDRESS OF RESEARCH FACILITY:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.facility_name || '[Facility Name]');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.facility_address || '[Facility Address]');
  doc.moveDown(1);

  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('7. NAME AND ADDRESS OF INSTITUTIONAL REVIEW BOARD (IRB):');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.irb_name || '[IRB Name]');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.irb_address || '[IRB Address]');
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica-Bold').text('8. PHASE OF CLINICAL INVESTIGATION:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.phase || '[Phase]');
  doc.moveDown(1);

  // Sub-investigators
  doc.fontSize(12).font('Helvetica-Bold').text('9. SUB-INVESTIGATORS:');
  doc.moveDown(0.5);

  try {
    let subInvestigators = [];
    if (formData.subinvestigators) {
      if (typeof formData.subinvestigators === 'string') {
        subInvestigators = JSON.parse(formData.subinvestigators);
      } else if (Array.isArray(formData.subinvestigators)) {
        subInvestigators = formData.subinvestigators;
      }
    }

    if (subInvestigators && subInvestigators.length > 0) {
      subInvestigators.forEach(subInv => {
        doc
          .fontSize(11)
          .font('Helvetica')
          .text(`${subInv.name}${subInv.role ? ` - ${subInv.role}` : ''}`);
        doc.moveDown(0.5);
      });
    } else {
      doc.fontSize(11).font('Helvetica').text('No sub-investigators listed');
    }
  } catch (error) {
    console.error('Error parsing sub-investigators:', error);
    doc.fontSize(11).font('Helvetica').text('No sub-investigators listed');
  }

  doc.moveDown(1);

  // Certification
  doc.fontSize(12).font('Helvetica-Bold').text('CERTIFICATION:');
  doc.moveDown(0.5);
  doc
    .fontSize(10)
    .font('Helvetica')
    .text(
      'I agree to conduct the study(ies) in accordance with the relevant, current protocol(s) and will only make changes in a protocol after notifying the sponsor, except when necessary to protect the safety, rights, or welfare of subjects. I agree to personally conduct or supervise the described investigation(s). I agree to inform any patients, or any persons used as controls, that the drugs are being used for investigational purposes and I will ensure that the requirements relating to obtaining informed consent in 21 CFR Part 50 and institutional review board (IRB) review and approval in 21 CFR Part 56 are met.'
    );
  doc.moveDown(1);

  // Signature
  doc.fontSize(12).font('Helvetica-Bold').text('SIGNATURE OF INVESTIGATOR:');
  doc.moveDown(3);
  doc.fontSize(11).font('Helvetica').text('______________________________');
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica-Bold').text('DATE:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.certification_date || new Date().toLocaleDateString());
}

// Helper function to generate Form FDA 3674 content
function generateForm3674(doc, formData) {
  // Header
  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .text('DEPARTMENT OF HEALTH AND HUMAN SERVICES', { align: 'center' });
  doc.fontSize(14).font('Helvetica-Bold').text('FOOD AND DRUG ADMINISTRATION', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(18).font('Helvetica-Bold').text('CERTIFICATION OF COMPLIANCE', { align: 'center' });
  doc.fontSize(16).font('Helvetica-Bold').text('FORM FDA 3674', { align: 'center' });
  doc.moveDown(1);
  doc
    .fontSize(14)
    .font('Helvetica')
    .text('(Under 42 U.S.C. § 282(j)(5)(B), 402(j)(5)(B) of the Public Health Service Act)', {
      align: 'center',
    });
  doc.moveDown(2);

  // Form content
  doc.fontSize(12).font('Helvetica-Bold').text('SPONSOR NAME:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.sponsor_name || '[Sponsor Name]');
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica-Bold').text('TYPE OF SUBMISSION:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.submission_type || '[Submission Type]');
  doc.moveDown(2);

  // Certification options
  doc.fontSize(12).font('Helvetica-Bold').text('CERTIFICATION:');
  doc.moveDown(0.5);

  const certifyOption = formData.certify_option || 'requirements_not_applicable';

  const certOptions = [
    {
      id: 'requirements_applicable',
      text: 'I certify that the requirements of 42 U.S.C. § 282(j), section 402(j) of the Public Health Service Act, have been met for the applicable clinical trials that are covered by the statute. The appropriate information has been submitted to the National Institutes of Health/National Library of Medicine for inclusion in the registry and results data bank, ClinicalTrials.gov.',
    },
    {
      id: 'requirements_not_applicable',
      text: 'I certify that the requirements of 42 U.S.C. § 282(j), section 402(j) of the Public Health Service Act, do not apply to any clinical trials referenced in or that are intended to be referenced by this submission because the clinical trials are not applicable clinical trials or are otherwise not required to be submitted to the National Institutes of Health/National Library of Medicine data bank.',
    },
    {
      id: 'request_waiver',
      text: 'I am submitting a certification request for a waiver of the requirements of 42 U.S.C. § 282(j), Section 402(j) of the Public Health Service Act. I understand that unless and until I receive such a waiver, I am still responsible for compliance with the requirements of 42 U.S.C. § 282(j).',
    },
  ];

  certOptions.forEach(option => {
    if (option.id === certifyOption) {
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('☑ ' + option.text);
    } else {
      doc
        .fontSize(11)
        .font('Helvetica')
        .text('☐ ' + option.text);
    }
    doc.moveDown(1);
  });

  doc.moveDown(1);

  // Signature
  doc.fontSize(12).font('Helvetica-Bold').text('SIGNATURE OF PERSON MAKING CERTIFICATION:');
  doc.moveDown(3);
  doc.fontSize(11).font('Helvetica').text('______________________________');
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica-Bold').text('DATE:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.certification_date || new Date().toLocaleDateString());
}

// Helper function to generate Form FDA 3454 content
function generateForm3454(doc, formData) {
  // Header
  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .text('DEPARTMENT OF HEALTH AND HUMAN SERVICES', { align: 'center' });
  doc.fontSize(14).font('Helvetica-Bold').text('FOOD AND DRUG ADMINISTRATION', { align: 'center' });
  doc.moveDown(1);
  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .text('CERTIFICATION: FINANCIAL INTERESTS AND ARRANGEMENTS OF CLINICAL INVESTIGATORS', {
      align: 'center',
    });
  doc.fontSize(16).font('Helvetica-Bold').text('FORM FDA 3454', { align: 'center' });
  doc.moveDown(2);

  // Form content
  doc.fontSize(12).font('Helvetica-Bold').text('SPONSOR NAME:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.sponsor_name || '[Sponsor Name]');
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica-Bold').text('APPLICATION/SUBMISSION NUMBER:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.application_number || '[Application Number]');
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica-Bold').text('DRUG, BIOLOGICAL, OR DEVICE PRODUCT NAME:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.drug_name || '[Product Name]');
  doc.moveDown(2);

  // Certification options
  doc.fontSize(12).font('Helvetica-Bold').text('CERTIFICATION:');
  doc.moveDown(0.5);

  const certifyOption = formData.certification_option || 'no_financial_arrangements';

  const certOptions = [
    {
      id: 'no_financial_arrangements',
      text: 'I hereby certify that no financial arrangements with an investigator have been made wherein the value of compensation could be affected by the outcome of the study as defined in 21 CFR 54.2(a).',
    },
    {
      id: 'no_proprietary_interest',
      text: 'I hereby certify that no investigator has a proprietary interest in this product or a significant equity in the sponsor as defined in 21 CFR 54.2(b).',
    },
    {
      id: 'no_financial_interest',
      text: 'I hereby certify that no investigator has received significant payments of other sorts as defined in 21 CFR 54.2(f).',
    },
  ];

  certOptions.forEach(option => {
    if (option.id === certifyOption) {
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('☑ ' + option.text);
    } else {
      doc
        .fontSize(11)
        .font('Helvetica')
        .text('☐ ' + option.text);
    }
    doc.moveDown(1);
  });

  doc.moveDown(1);

  // Signature
  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('SIGNATURE OF SPONSOR REPRESENTATIVE MAKING CERTIFICATION:');
  doc.moveDown(3);
  doc.fontSize(11).font('Helvetica').text('______________________________');
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica-Bold').text('DATE:');
  doc
    .fontSize(11)
    .font('Helvetica')
    .text(formData.certification_date || new Date().toLocaleDateString());
}

// GET /api/ind/:projectId/forms/:formId/data
// Get form data for a specific project and form
router.get('/:projectId/forms/:formId/data', async (req, res) => {
  try {
    const { projectId, formId } = req.params;

    // Get form data
    const formData = await getFormData(projectId, formId);

    // Return form data
    res.json(formData.data);
  } catch (error) {
    console.error('Error retrieving form data:', error);
    res.status(500).json({ error: 'Failed to retrieve form data' });
  }
});

// PUT /api/ind/:projectId/forms/:formId/data
// Save form data for a specific project and form
router.put('/:projectId/forms/:formId/data', async (req, res) => {
  try {
    const { projectId, formId } = req.params;
    const formData = req.body;

    // Save form data
    const result = await saveFormData(projectId, formId, formData);

    // Return result
    res.json(result);
  } catch (error) {
    console.error('Error saving form data:', error);
    res.status(500).json({ error: 'Failed to save form data' });
  }
});

// POST /api/ind/:projectId/forms/:formId/generate
// Generate a form for a specific project
router.post('/:projectId/forms/:formId/generate', async (req, res) => {
  try {
    const { projectId, formId } = req.params;
    const formDataFromClient = req.body || {};

    // Get form data
    const formDataResponse = await getFormData(projectId, formId);
    const formData = { ...formDataResponse.data, ...formDataFromClient };

    // Generate form
    const result = await generatePdfForm(projectId, formId, formData);

    // Return result
    res.json({
      success: true,
      formId,
      projectId,
      downloadUrl: result.downloadUrl,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating form:', error);
    res.status(500).json({ error: 'Failed to generate form' });
  }
});

// GET /api/ind/:projectId/forms/:formId/download/:timestamp?
// Download a generated form
router.get('/:projectId/forms/:formId/download/:timestamp?', async (req, res) => {
  try {
    const { projectId, formId, timestamp } = req.params;

    if (timestamp) {
      // Look for file with specific timestamp
      const filename = `Form_FDA_${formId}_${projectId}_${timestamp}.pdf`;
      const filePath = path.join(FORMS_DIR, filename);

      if (fs.existsSync(filePath)) {
        return res.download(filePath, filename);
      }
    }

    // If no timestamp or file not found, find the latest file
    const files = fs.readdirSync(FORMS_DIR);
    const formFiles = files.filter(file => file.startsWith(`Form_FDA_${formId}_${projectId}_`));

    if (formFiles.length === 0) {
      return res.status(404).json({ error: 'No generated form found for download' });
    }

    // Sort by timestamp (newest first)
    formFiles.sort().reverse();

    // Download the latest file
    const latestFile = formFiles[0];
    const filePath = path.join(FORMS_DIR, latestFile);

    res.download(filePath, latestFile);
  } catch (error) {
    console.error('Error downloading form:', error);
    res.status(500).json({ error: 'Failed to download form' });
  }
});

// GET /api/ind/:projectId/forms/:formId/guidance
// Get form guidance for a specific form
router.get('/:projectId/forms/:formId/guidance', async (req, res) => {
  try {
    const { formId } = req.params;

    // Get form guidance based on form ID
    let guidance = {
      description: `Form FDA ${formId} is required for IND submissions.`,
      tips: [
        'Complete all sections thoroughly and accurately',
        'Ensure consistency with other submission documents',
        'Review all fields carefully before submission',
      ],
      common_issues: [
        'Missing or incomplete information',
        'Inconsistencies with protocol',
        'Failure to update when investigator information changes',
      ],
    };

    // Form-specific guidance
    switch (formId) {
      case '1571':
        guidance = {
          description:
            'Form FDA 1571 (Investigational New Drug Application) is the primary form that initiates the IND process and serves as a cover sheet for your entire submission.',
          tips: [
            'Verify sponsor information accuracy',
            'Clearly indicate the phase of clinical investigation',
            'List all sections included in your submission',
            'Ensure proper signature and date',
          ],
          common_issues: [
            'Missing sections in the IND application',
            'Inconsistent drug names across documents',
            'Incomplete checklist of included documents',
            'Insufficient detail in investigational plan',
          ],
        };
        break;
      case '1572':
        guidance = {
          description:
            'Form FDA 1572 (Statement of Investigator) must be completed by each clinical investigator who participates in the clinical investigation.',
          tips: [
            'Include all sub-investigators',
            'Verify IRB information is current',
            'Provide complete education and training details',
            'List all facilities where the study will be conducted',
          ],
          common_issues: [
            'Outdated investigator credentials',
            'Missing sub-investigators',
            'Incomplete facility information',
            'Inconsistencies with protocol site details',
          ],
        };
        break;
      case '3674':
        guidance = {
          description:
            'Form FDA 3674 (Certification of Compliance) certifies compliance with ClinicalTrials.gov requirements for applicable clinical trials.',
          tips: [
            'Verify ClinicalTrials.gov registration prior to completing',
            'Select appropriate certification option',
            'Include NCT number when applicable',
            'Keep documentation of registration',
          ],
          common_issues: [
            'Selecting incorrect certification option',
            'Failure to register trial before submission',
            'Missing NCT number reference',
            'Inconsistency between form and actual registration status',
          ],
        };
        break;
      case '3454':
        guidance = {
          description:
            'Form FDA 3454 (Financial Disclosure) addresses financial arrangements with clinical investigators.',
          tips: [
            'Collect financial disclosure from all investigators',
            'Maintain documentation of all disclosures',
            'Report any changes that occur during the study',
            'Ensure consistency with 1572 investigator list',
          ],
          common_issues: [
            'Incomplete investigator financial disclosures',
            'Failure to report changes in financial interests',
            'Inconsistency with Form 1572 investigator listings',
            'Inadequate documentation of disclosed arrangements',
          ],
        };
        break;
    }

    res.json(guidance);
  } catch (error) {
    console.error('Error retrieving form guidance:', error);
    res.status(500).json({ error: 'Failed to retrieve form guidance' });
  }
});

// GET /api/ind/:projectId/forms/:formId/status
// Get form status for a specific project and form
router.get('/:projectId/forms/:formId/status', async (req, res) => {
  try {
    const { projectId, formId } = req.params;

    // Get form data
    const formData = await getFormData(projectId, formId);

    // Generate form status with AI recommendations
    const formStatus = {
      status: formData.status || 'not_started',
      lastUpdated: formData.lastUpdated || null,
      version: formData.version || null,
      aiRecommendations: [],
    };

    // Form-specific AI recommendations
    switch (formId) {
      case '1571':
        formStatus.aiRecommendations = [
          'Review sponsor information for accuracy and completeness',
          'Ensure all required sections are included in your submission',
          'Verify the drug name matches throughout all documents',
        ];
        break;
      case '1572':
        formStatus.aiRecommendations = [
          'Verify all sub-investigators are listed with correct roles',
          'Ensure investigator credentials are up-to-date',
          'Check that the IRB information is complete and accurate',
        ];
        break;
      case '3674':
        formStatus.aiRecommendations = [
          'Confirm your trial is properly registered on ClinicalTrials.gov',
          'Select the correct certification option based on your study',
          'Include the NCT number in your submission',
        ];
        break;
      case '3454':
        formStatus.aiRecommendations = [
          'Collect financial disclosure from all investigators',
          'Ensure consistency with the investigators listed on Form 1572',
          'Document any potential conflicts of interest',
        ];
        break;
    }

    res.json(formStatus);
  } catch (error) {
    console.error('Error retrieving form status:', error);
    res.status(500).json({ error: 'Failed to retrieve form status' });
  }
});

// GET /api/ind/:projectId/forms/progress
// Get overall progress for all forms for a specific project
router.get('/:projectId/forms/progress', async (req, res) => {
  try {
    const { projectId } = req.params;

    // For development only - return mock progress data
    const progress = {
      totalForms: 4,
      completedForms: 1,
      inProgressForms: 2,
      notStartedForms: 1,
      formsStatus: {
        1571: 'in_progress',
        1572: 'in_progress',
        3674: 'not_started',
        3454: 'completed',
      },
    };

    res.json(progress);
  } catch (error) {
    console.error('Error retrieving forms progress:', error);
    res.status(500).json({ error: 'Failed to retrieve forms progress' });
  }
});

// GET /api/ind/:projectId/forms/insights
// Get AI insights for forms for a specific project
router.get('/:projectId/forms/insights', async (req, res) => {
  try {
    const { projectId } = req.params;

    // Generate form insights with AI recommendations
    const insights = {
      insights: [
        'Ensure consistent sponsor information across all forms',
        'Double-check investigator credentials on Form 1572',
        'For Form 3674, verify ClinicalTrials.gov registration status before completing',
        'Remember to collect financial disclosure from all investigators for Form 3454',
      ],
      lastUpdated: new Date().toISOString(),
    };

    res.json(insights);
  } catch (error) {
    console.error('Error retrieving forms insights:', error);
    res.status(500).json({ error: 'Failed to retrieve forms insights' });
  }
});

export default router;
