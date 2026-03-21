import { Router } from 'express';
import DocumentOrchestrationService from '../services/DocumentOrchestrationService.js';
import { db } from '../db';
import { fda510kDocuments, fda510kProjects } from '@shared/schema';
import { eq } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { Response } from 'express';

const router = Router();
const orchestrationService = new DocumentOrchestrationService();

/**
 * Generate all documents for a 510(k) project
 */
router.post('/api/510k/:projectId/generate-documents', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.headers['x-user-id'] as string;
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }

    const result = await orchestrationService.orchestrateDocumentGeneration(
      projectId,
      userId,
      organizationId
    );

    res.json(result);
  } catch (error) {
    console.error('Document generation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate documents'
    });
  }
});

/**
 * Lock a document for regulatory compliance
 */
router.post('/api/510k/documents/:documentId/lock', async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.headers['x-user-id'] as string;
    const organizationId = req.headers['x-organization-id'] as string;

    const lockedDocument = await orchestrationService.lockDocument(
      documentId,
      userId,
      organizationId
    );

    res.json({
      success: true,
      document: lockedDocument
    });
  } catch (error) {
    console.error('Document lock error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to lock document'
    });
  }
});

/**
 * Create a new version of a document
 */
router.post('/api/510k/documents/:documentId/version', async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.headers['x-user-id'] as string;
    const organizationId = req.headers['x-organization-id'] as string;

    const newVersion = await orchestrationService.createDocumentVersion(
      documentId,
      userId,
      organizationId
    );

    res.json({
      success: true,
      document: newVersion
    });
  } catch (error) {
    console.error('Document versioning error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create document version'
    });
  }
});

/**
 * Get all documents for a project
 */
router.get('/api/510k/:projectId/documents', async (req, res) => {
  try {
    const { projectId } = req.params;

    const documents = await db!
      .select()
      .from(fda510kDocuments)
      .where(eq(fda510kDocuments.projectId, parseInt(projectId)));

    res.json({
      success: true,
      documents
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch documents'
    });
  }
});

/**
 * Get a specific document
 */
router.get('/api/510k/documents/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;

    const [document] = await db!
      .select()
      .from(fda510kDocuments)
      .where(eq(fda510kDocuments.documentId, documentId));

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    res.json({
      success: true,
      document
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch document'
    });
  }
});

/**
 * Generate PDF for FDA Form 3601
 */
router.get('/api/510k/documents/:documentId/pdf/3601', async (req, res) => {
  try {
    const { documentId } = req.params;

    const [document] = await db!
      .select()
      .from(fda510kDocuments)
      .where(eq(fda510kDocuments.documentId, documentId));

    if (!document || document.documentType !== 'fda-form') {
      return res.status(404).json({
        success: false,
        error: 'FDA form not found'
      });
    }

    const formData = JSON.parse(document.content);
    generateForm3601PDF(res, formData);

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF'
    });
  }
});

/**
 * Generate PDF for FDA Form 3514
 */
router.get('/api/510k/documents/:documentId/pdf/3514', async (req, res) => {
  try {
    const { documentId } = req.params;

    const [document] = await db!
      .select()
      .from(fda510kDocuments)
      .where(eq(fda510kDocuments.documentId, documentId));

    if (!document || document.documentType !== 'fda-form') {
      return res.status(404).json({
        success: false,
        error: 'FDA form not found'
      });
    }

    const formData = JSON.parse(document.content);
    generateForm3514PDF(res, formData);

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF'
    });
  }
});

/**
 * Generate PDF for FDA Form 3881
 */
router.get('/api/510k/documents/:documentId/pdf/3881', async (req, res) => {
  try {
    const { documentId } = req.params;

    const [document] = await db!
      .select()
      .from(fda510kDocuments)
      .where(eq(fda510kDocuments.documentId, documentId));

    if (!document || document.documentType !== 'fda-form') {
      return res.status(404).json({
        success: false,
        error: 'FDA form not found'
      });
    }

    const formData = JSON.parse(document.content);
    generateForm3881PDF(res, formData);

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF'
    });
  }
});

/**
 * Helper function to generate FDA Form 3601 PDF
 */
function generateForm3601PDF(res: Response, formData: any) {
  const doc = new PDFDocument({ margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=FDA-Form-3601.pdf');

  doc.pipe(res);

  // Form header
  doc.fontSize(16).text('FDA Form 3601', { align: 'center' });
  doc.fontSize(14).text('Medical Device User Fee Cover Sheet', { align: 'center' });
  doc.moveDown();

  // Applicant Information
  doc.fontSize(12).text('APPLICANT INFORMATION', { underline: true });
  doc.fontSize(10);
  doc.text(`Applicant Name: ${formData.applicantName}`);
  doc.text(`Address: ${formData.applicantAddress}`);
  doc.text(`City, State, ZIP: ${formData.applicantCity}, ${formData.applicantState} ${formData.applicantZip}`);
  doc.text(`Phone: ${formData.applicantPhone}`);
  doc.text(`Email: ${formData.applicantEmail}`);
  doc.moveDown();

  // Device Information
  doc.fontSize(12).text('DEVICE INFORMATION', { underline: true });
  doc.fontSize(10);
  doc.text(`Device Trade Name: ${formData.deviceTradeName}`);
  doc.text(`Device Classification: ${formData.deviceClassification}`);
  doc.text(`Product Code: ${formData.productCode}`);
  doc.text(`Regulation Number: ${formData.regulationNumber}`);
  doc.moveDown();

  // Fee Information
  doc.fontSize(12).text('FEE INFORMATION', { underline: true });
  doc.fontSize(10);
  doc.text(`Fee Type: ${formData.feeType}`);
  doc.text(`Payment Method: ${formData.paymentMethod}`);
  doc.text(`Small Business: ${formData.smallBusiness ? 'Yes' : 'No'}`);

  doc.end();
}

/**
 * Helper function to generate FDA Form 3514 PDF
 */
function generateForm3514PDF(res: Response, formData: any) {
  const doc = new PDFDocument({ margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=FDA-Form-3514.pdf');

  doc.pipe(res);

  // Form header
  doc.fontSize(16).text('FDA Form 3514', { align: 'center' });
  doc.fontSize(14).text('CDRH Premarket Review Submission Cover Sheet', { align: 'center' });
  doc.moveDown();

  // Submission Information
  doc.fontSize(12).text('SUBMISSION INFORMATION', { underline: true });
  doc.fontSize(10);
  doc.text(`Submission Type: ${formData.submissionType}`);
  doc.text(`Device Name: ${formData.deviceName}`);
  doc.text(`Common Name: ${formData.commonName}`);
  doc.text(`Classification Name: ${formData.classificationName}`);
  doc.text(`Product Code: ${formData.productCode}`);
  doc.text(`Regulation Number: ${formData.regulationNumber}`);
  doc.text(`Panel: ${formData.panel}`);
  doc.moveDown();

  // Applicant Information
  doc.fontSize(12).text('APPLICANT INFORMATION', { underline: true });
  doc.fontSize(10);
  doc.text(`Name: ${formData.applicantInfo.name}`);
  doc.text(`Address: ${formData.applicantInfo.address}`);
  doc.text(`Contact: ${formData.applicantInfo.contact}`);
  doc.text(`Phone: ${formData.applicantInfo.phone}`);
  doc.text(`Email: ${formData.applicantInfo.email}`);

  doc.end();
}

/**
 * Helper function to generate FDA Form 3881 PDF
 */
function generateForm3881PDF(res: Response, formData: any) {
  const doc = new PDFDocument({ margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=FDA-Form-3881.pdf');

  doc.pipe(res);

  // Form header
  doc.fontSize(16).text('FDA Form 3881', { align: 'center' });
  doc.fontSize(14).text('Indications for Use', { align: 'center' });
  doc.moveDown();

  // Device Information
  doc.fontSize(10);
  doc.text(`510(k) Number: ${formData.kNumber}`);
  doc.text(`Device Name: ${formData.deviceName}`);
  doc.moveDown();

  // Indications for Use
  doc.fontSize(12).text('INDICATIONS FOR USE:', { underline: true });
  doc.fontSize(10);
  doc.text(formData.indicationsForUse, {
    width: 500,
    align: 'justify'
  });
  doc.moveDown();

  // Use Type
  doc.fontSize(10);
  if (formData.prescriptionUse) {
    doc.text('[✓] Prescription Use (Part 21 CFR 801 Subpart D)');
  } else {
    doc.text('[ ] Prescription Use (Part 21 CFR 801 Subpart D)');
  }
  
  if (formData.overTheCounterUse) {
    doc.text('[✓] Over-The-Counter Use (Part 21 CFR 801 Subpart C)');
  } else {
    doc.text('[ ] Over-The-Counter Use (Part 21 CFR 801 Subpart C)');
  }

  doc.end();
}

export default router;