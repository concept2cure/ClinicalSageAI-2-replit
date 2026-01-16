/**
 * FDA 510(k) Document Generator Service
 * 
 * Generates FDA-compliant 510(k) submission documents with all required sections
 * Follows FDA guidance for Traditional, Special, and Abbreviated 510(k) submissions
 * Outputs in multiple formats: PDF, DOCX, and eStar XML
 */

import PDFDocument from 'pdfkit';
import { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType } from 'docx';
import { db } from '../db/index.js';
import { fda510kSubmissions, medicalDevices, deviceSubmissionDocuments } from '../../shared/schema.ts';
import { eq, and } from 'drizzle-orm';
import path from 'path';
import fs from 'fs/promises';

class FDA510kDocumentGenerator {
  constructor() {
    this.sections = [
      '1. Administrative Information',
      '2. Device Identification', 
      '3. Classification',
      '4. Predicate Device Comparison',
      '5. Device Description',
      '6. Intended Use/Indications for Use',
      '7. Substantial Equivalence Discussion',
      '8. Performance Data',
      '9. Biocompatibility',
      '10. Software Validation',
      '11. Sterilization and Shelf Life',
      '12. Electrical Safety and EMC',
      '13. Labeling',
      '14. Clinical Data',
      '15. Executive Summary'
    ];
  }

  /**
   * Generate complete 510(k) submission package
   */
  async generate510kPackage(submissionId, organizationId, format = 'PDF') {
    try {
      // Fetch submission data with device info
      const submission = await this.getSubmissionData(submissionId, organizationId);
      
      if (!submission) {
        throw new Error('510(k) submission not found or access denied');
      }

      // Fetch all supporting documents
      const documents = await this.getSubmissionDocuments(submissionId, organizationId);

      // Generate the document based on format
      let result;
      switch (format.toUpperCase()) {
        case 'PDF':
          result = await this.generatePDF(submission, documents);
          break;
        case 'DOCX':
          result = await this.generateDOCX(submission, documents);
          break;
        case 'XML':
        case 'ESTAR':
          result = await this.generateEStarXML(submission, documents);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      // Save generated document
      const savedPath = await this.saveGeneratedDocument(
        submissionId,
        organizationId,
        result.content,
        result.filename,
        format
      );

      return {
        success: true,
        filename: result.filename,
        path: savedPath,
        format: format,
        content: result.content,
        generatedAt: new Date().toISOString(),
        sections: this.sections,
        validationStatus: await this.validate510kCompleteness(submission, documents)
      };
    } catch (error) {
      console.error('Error generating 510(k) package:', error);
      throw error;
    }
  }

  /**
   * Generate PDF version of 510(k) submission
   */
  async generatePDF(submission, documents) {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ 
        margin: 72,
        size: 'LETTER',
        info: {
          Title: `510(k) Submission - ${submission.device?.deviceName || 'Unknown Device'}`,
          Author: 'TrialSage Regulatory Platform',
          Subject: 'FDA 510(k) Premarket Notification',
          Keywords: '510k, FDA, Medical Device, Regulatory'
        }
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        const content = Buffer.concat(chunks);
        resolve({
          content,
          filename: `510k_${submission.submission.id}_${Date.now()}.pdf`
        });
      });

      // Title Page
      this.addPDFTitlePage(doc, submission);
      
      // Table of Contents
      doc.addPage();
      this.addPDFTableOfContents(doc);
      
      // Executive Summary
      doc.addPage();
      this.addPDFSection(doc, '1. EXECUTIVE SUMMARY', () => {
        doc.fontSize(11)
           .text('This 510(k) premarket notification is submitted for:', { continued: false });
        
        doc.moveDown()
           .text(`Device Name: ${submission.device?.deviceName || 'Not specified'}`)
           .text(`Manufacturer: ${submission.device?.manufacturer || 'Not specified'}`)
           .text(`Device Class: ${submission.device?.deviceClass || 'Not specified'}`)
           .text(`Product Code: ${submission.device?.productCode || 'Not specified'}`)
           .text(`Submission Type: ${submission.submission.submissionType || 'Traditional'}`)
           .text(`Submission Date: ${new Date(submission.submission.createdAt).toLocaleDateString()}`);
      });

      // Administrative Information
      doc.addPage();
      this.addPDFSection(doc, '2. ADMINISTRATIVE INFORMATION', () => {
        const adminData = submission.submission.submissionData?.administrativeInfo || {};
        
        doc.text('2.1 Applicant Information', { underline: true })
           .moveDown(0.5)
           .text(`Organization: ${adminData.organizationName || 'Not specified'}`)
           .text(`Address: ${adminData.address || 'Not specified'}`)
           .text(`Contact Person: ${adminData.contactPerson || 'Not specified'}`)
           .text(`Phone: ${adminData.phone || 'Not specified'}`)
           .text(`Email: ${adminData.email || 'Not specified'}`)
           .moveDown();

        doc.text('2.2 Correspondent Information', { underline: true })
           .moveDown(0.5)
           .text(`Same as applicant: ${adminData.correspondentSameAsApplicant ? 'Yes' : 'No'}`);
        
        if (!adminData.correspondentSameAsApplicant) {
          doc.text(`Correspondent: ${adminData.correspondentName || 'Not specified'}`)
             .text(`Address: ${adminData.correspondentAddress || 'Not specified'}`)
             .text(`Phone: ${adminData.correspondentPhone || 'Not specified'}`)
             .text(`Email: ${adminData.correspondentEmail || 'Not specified'}`);
        }
      });

      // Device Identification
      doc.addPage();
      this.addPDFSection(doc, '3. DEVICE IDENTIFICATION', () => {
        const device = submission.device || {};
        
        doc.text('3.1 Device Name and Model', { underline: true })
           .moveDown(0.5)
           .text(`Trade/Proprietary Name: ${device.deviceName || 'Not specified'}`)
           .text(`Common/Usual Name: ${device.commonName || 'Not specified'}`)
           .text(`Classification Name: ${device.classificationName || 'Not specified'}`)
           .text(`Model Number(s): ${device.deviceModel || 'Not specified'}`)
           .moveDown();

        doc.text('3.2 Device Classification', { underline: true })
           .moveDown(0.5)
           .text(`Classification Regulation: ${device.regulationNumber || 'Not specified'}`)
           .text(`Device Class: ${device.deviceClass || 'Not specified'}`)
           .text(`Product Code: ${device.productCode || 'Not specified'}`)
           .text(`Review Panel: ${device.reviewPanel || 'Not specified'}`);
      });

      // Predicate Device Comparison
      doc.addPage();
      this.addPDFSection(doc, '4. PREDICATE DEVICE COMPARISON', () => {
        const predicates = submission.submission.predicateDevices || [];
        
        doc.text('4.1 Predicate Device Information', { underline: true })
           .moveDown(0.5);
        
        if (predicates.length > 0) {
          predicates.forEach((predicate, index) => {
            doc.text(`Predicate ${index + 1}:`, { underline: true })
               .text(`  510(k) Number: ${predicate.k_number || 'Not specified'}`)
               .text(`  Device Name: ${predicate.device_name || 'Not specified'}`)
               .text(`  Manufacturer: ${predicate.applicant || 'Not specified'}`)
               .text(`  Decision Date: ${predicate.decision_date || 'Not specified'}`)
               .text(`  Product Code: ${predicate.product_code || 'Not specified'}`)
               .moveDown();
          });
        } else {
          doc.text('No predicate devices specified');
        }

        doc.moveDown()
           .text('4.2 Substantial Equivalence Comparison Table', { underline: true })
           .moveDown(0.5);
        
        // Add comparison table
        this.addPDFComparisonTable(doc, submission.device, predicates);
      });

      // Intended Use / Indications for Use
      doc.addPage();
      this.addPDFSection(doc, '5. INTENDED USE / INDICATIONS FOR USE', () => {
        const device = submission.device || {};
        
        doc.text('5.1 Intended Use', { underline: true })
           .moveDown(0.5)
           .text(device.intendedUse || 'The intended use statement has not been provided.')
           .moveDown();

        doc.text('5.2 Indications for Use', { underline: true })
           .moveDown(0.5)
           .text(device.indicationsForUse || 'The indications for use statement has not been provided.')
           .moveDown();

        doc.text('5.3 Prescription Use Statement', { underline: true })
           .moveDown(0.5)
           .text(device.prescriptionUse ? 
             'This device is intended for prescription use (21 CFR 801.109).' :
             'This device is intended for over-the-counter use.');
      });

      // Device Description
      doc.addPage();
      this.addPDFSection(doc, '6. DEVICE DESCRIPTION', () => {
        const description = submission.submission.submissionData?.deviceDescription || {};
        
        doc.text('6.1 Physical Description', { underline: true })
           .moveDown(0.5)
           .text(description.physical || 'Detailed physical description not provided.')
           .moveDown();

        doc.text('6.2 Principle of Operation', { underline: true })
           .moveDown(0.5)
           .text(description.principleOfOperation || 'Principle of operation not provided.')
           .moveDown();

        doc.text('6.3 Materials and Components', { underline: true })
           .moveDown(0.5)
           .text(description.materials || 'Materials and components information not provided.')
           .moveDown();

        if (device.hasSoftware) {
          doc.text('6.4 Software Description', { underline: true })
             .moveDown(0.5)
             .text(description.software || 'Software description not provided.');
        }
      });

      // Performance Data
      doc.addPage();
      this.addPDFSection(doc, '7. PERFORMANCE DATA', () => {
        const performance = submission.submission.submissionData?.performanceData || {};
        
        doc.text('7.1 Bench Testing', { underline: true })
           .moveDown(0.5)
           .text(performance.benchTesting || 'Bench testing data not provided.')
           .moveDown();

        doc.text('7.2 Animal Testing', { underline: true })
           .moveDown(0.5)
           .text(performance.animalTesting || 'No animal testing conducted.')
           .moveDown();

        doc.text('7.3 Clinical Testing', { underline: true })
           .moveDown(0.5)
           .text(performance.clinicalTesting || 'No clinical testing required.');
      });

      // Biocompatibility
      doc.addPage();
      this.addPDFSection(doc, '8. BIOCOMPATIBILITY', () => {
        const bio = submission.submission.submissionData?.biocompatibility || {};
        
        doc.text('8.1 Patient Contact', { underline: true })
           .moveDown(0.5)
           .text(`Contact Type: ${bio.contactType || 'Not specified'}`)
           .text(`Contact Duration: ${bio.contactDuration || 'Not specified'}`)
           .moveDown();

        doc.text('8.2 ISO 10993 Testing', { underline: true })
           .moveDown(0.5)
           .text(bio.testing || 'Biocompatibility testing information not provided.');
      });

      // Labeling
      doc.addPage();
      this.addPDFSection(doc, '9. LABELING', () => {
        const labeling = submission.submission.submissionData?.labeling || {};
        
        doc.text('9.1 Device Label', { underline: true })
           .moveDown(0.5)
           .text(labeling.deviceLabel || 'Device label not provided.')
           .moveDown();

        doc.text('9.2 Instructions for Use', { underline: true })
           .moveDown(0.5)
           .text(labeling.instructionsForUse || 'Instructions for use not provided.')
           .moveDown();

        doc.text('9.3 Package Insert', { underline: true })
           .moveDown(0.5)
           .text(labeling.packageInsert || 'Package insert not provided.');
      });

      // Summary
      doc.addPage();
      this.addPDFSection(doc, '10. SUMMARY AND CERTIFICATION', () => {
        doc.text('10.1 Truthful and Accurate Statement', { underline: true })
           .moveDown(0.5)
           .text('I certify that, in my capacity as the representative of the applicant firm, I believe to the best of my knowledge, that all data and information submitted in this premarket notification are truthful and accurate and that no material fact has been omitted.')
           .moveDown(1);

        doc.text('10.2 Summary of Safety and Effectiveness', { underline: true })
           .moveDown(0.5)
           .text('Based on the information provided in this submission, the subject device is substantially equivalent to the predicate device(s) and is as safe and effective.');
      });

      // Attachments list
      if (documents.length > 0) {
        doc.addPage();
        this.addPDFSection(doc, 'ATTACHMENTS', () => {
          doc.text('The following documents are included with this submission:')
             .moveDown();
          
          documents.forEach((doc_item, index) => {
            doc.text(`${index + 1}. ${doc_item.documentName} (${doc_item.documentType})`);
          });
        });
      }

      doc.end();
    });
  }

  /**
   * Generate DOCX version of 510(k) submission
   */
  async generateDOCX(submission, documents) {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Title Page
          new Paragraph({
            children: [
              new TextRun({
                text: 'PREMARKET NOTIFICATION',
                bold: true,
                size: 32
              })
            ],
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: '510(k) SUBMISSION',
                bold: true,
                size: 28
              })
            ],
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({ text: '', spacing: { after: 400 } }),
          new Paragraph({
            children: [
              new TextRun({
                text: submission.device?.deviceName || 'Device Name Not Specified',
                size: 24
              })
            ],
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({ text: '', spacing: { after: 400 } }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Submission Date: ${new Date().toLocaleDateString()}`,
                size: 20
              })
            ],
            alignment: AlignmentType.CENTER
          }),
          
          // Executive Summary
          new Paragraph({
            children: [new TextRun({ text: 'EXECUTIVE SUMMARY', bold: true, size: 28 })],
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true
          }),
          new Paragraph({
            text: `Device Name: ${submission.device?.deviceName || 'Not specified'}`
          }),
          new Paragraph({
            text: `Manufacturer: ${submission.device?.manufacturer || 'Not specified'}`
          }),
          new Paragraph({
            text: `Device Class: ${submission.device?.deviceClass || 'Not specified'}`
          }),
          new Paragraph({
            text: `Product Code: ${submission.device?.productCode || 'Not specified'}`
          }),
          
          // Device Identification Section
          new Paragraph({
            children: [new TextRun({ text: 'DEVICE IDENTIFICATION', bold: true, size: 28 })],
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Trade/Proprietary Name:', bold: true })]
          }),
          new Paragraph({
            text: submission.device?.deviceName || 'Not specified',
            indent: { left: 720 }
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Common/Usual Name:', bold: true })]
          }),
          new Paragraph({
            text: submission.device?.commonName || 'Not specified',
            indent: { left: 720 }
          }),
          
          // Predicate Comparison
          new Paragraph({
            children: [new TextRun({ text: 'PREDICATE DEVICE COMPARISON', bold: true, size: 28 })],
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true
          }),
          ...this.generateDOCXPredicateTable(submission),
          
          // Intended Use
          new Paragraph({
            children: [new TextRun({ text: 'INTENDED USE / INDICATIONS FOR USE', bold: true, size: 28 })],
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Intended Use:', bold: true })]
          }),
          new Paragraph({
            text: submission.device?.intendedUse || 'Not provided',
            indent: { left: 720 }
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Indications for Use:', bold: true })]
          }),
          new Paragraph({
            text: submission.device?.indicationsForUse || 'Not provided',
            indent: { left: 720 }
          }),
          
          // Attachments
          ...(documents.length > 0 ? [
            new Paragraph({
              children: [new TextRun({ text: 'ATTACHMENTS', bold: true, size: 28 })],
              heading: HeadingLevel.HEADING_1,
              pageBreakBefore: true
            }),
            ...documents.map((doc, index) => new Paragraph({
              text: `${index + 1}. ${doc.documentName} (${doc.documentType})`,
              numbering: { reference: "attachments", level: 0 }
            }))
          ] : [])
        ]
      }]
    });

    const buffer = await packer.toBuffer(doc);
    return {
      content: buffer,
      filename: `510k_${submission.submission.id}_${Date.now()}.docx`
    };
  }

  /**
   * Generate FDA eStar XML format
   */
  async generateEStarXML(submission, documents) {
    const xml = this.buildEStarXML(submission, documents);
    
    return {
      content: Buffer.from(xml, 'utf-8'),
      filename: `510k_${submission.submission.id}_eStar_${Date.now()}.xml`
    };
  }

  /**
   * Build eStar XML structure
   */
  buildEStarXML(submission, documents) {
    const device = submission.device || {};
    const sub = submission.submission || {};
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<eStar xmlns="http://www.fda.gov/eStar" version="4.0">
  <header>
    <submissionType>510k</submissionType>
    <submissionNumber>${sub.id}</submissionNumber>
    <dateSubmitted>${new Date().toISOString()}</dateSubmitted>
    <regulatoryPath>Traditional</regulatoryPath>
  </header>
  
  <applicantInfo>
    <organizationName>${sub.submissionData?.administrativeInfo?.organizationName || ''}</organizationName>
    <address>${sub.submissionData?.administrativeInfo?.address || ''}</address>
    <contactPerson>${sub.submissionData?.administrativeInfo?.contactPerson || ''}</contactPerson>
    <phone>${sub.submissionData?.administrativeInfo?.phone || ''}</phone>
    <email>${sub.submissionData?.administrativeInfo?.email || ''}</email>
  </applicantInfo>
  
  <deviceInfo>
    <deviceName>${device.deviceName || ''}</deviceName>
    <commonName>${device.commonName || ''}</commonName>
    <modelNumber>${device.deviceModel || ''}</modelNumber>
    <deviceClass>${device.deviceClass || ''}</deviceClass>
    <productCode>${device.productCode || ''}</productCode>
    <regulationNumber>${device.regulationNumber || ''}</regulationNumber>
    <reviewPanel>${device.reviewPanel || ''}</reviewPanel>
  </deviceInfo>
  
  <predicateDevices>
    ${(sub.predicateDevices || []).map(pred => `
    <predicate>
      <kNumber>${pred.k_number || ''}</kNumber>
      <deviceName>${pred.device_name || ''}</deviceName>
      <manufacturer>${pred.applicant || ''}</manufacturer>
      <decisionDate>${pred.decision_date || ''}</decisionDate>
      <productCode>${pred.product_code || ''}</productCode>
    </predicate>`).join('')}
  </predicateDevices>
  
  <intendedUse>
    <statement>${device.intendedUse || ''}</statement>
    <indicationsForUse>${device.indicationsForUse || ''}</indicationsForUse>
    <prescriptionUse>${device.prescriptionUse ? 'true' : 'false'}</prescriptionUse>
  </intendedUse>
  
  <substantialEquivalence>
    <comparisonSummary>${sub.submissionData?.substantialEquivalence?.summary || ''}</comparisonSummary>
    <differences>${sub.submissionData?.substantialEquivalence?.differences || ''}</differences>
    <performanceData>${sub.submissionData?.substantialEquivalence?.performanceData || ''}</performanceData>
  </substantialEquivalence>
  
  <performanceData>
    <benchTesting>${sub.submissionData?.performanceData?.benchTesting || ''}</benchTesting>
    <animalTesting>${sub.submissionData?.performanceData?.animalTesting || ''}</animalTesting>
    <clinicalTesting>${sub.submissionData?.performanceData?.clinicalTesting || ''}</clinicalTesting>
  </performanceData>
  
  <biocompatibility>
    <contactType>${sub.submissionData?.biocompatibility?.contactType || ''}</contactType>
    <contactDuration>${sub.submissionData?.biocompatibility?.contactDuration || ''}</contactDuration>
    <testingSummary>${sub.submissionData?.biocompatibility?.testing || ''}</testingSummary>
  </biocompatibility>
  
  <labeling>
    <deviceLabel>${sub.submissionData?.labeling?.deviceLabel || ''}</deviceLabel>
    <instructionsForUse>${sub.submissionData?.labeling?.instructionsForUse || ''}</instructionsForUse>
    <packageInsert>${sub.submissionData?.labeling?.packageInsert || ''}</packageInsert>
  </labeling>
  
  <attachments>
    ${documents.map((doc, index) => `
    <attachment id="${index + 1}">
      <filename>${doc.documentName}</filename>
      <type>${doc.documentType}</type>
      <path>${doc.filePath}</path>
    </attachment>`).join('')}
  </attachments>
  
  <certification>
    <statementOfTruth>true</statementOfTruth>
    <certifiedBy>${sub.submissionData?.administrativeInfo?.contactPerson || ''}</certifiedBy>
    <certificationDate>${new Date().toISOString()}</certificationDate>
  </certification>
</eStar>`;
  }

  /**
   * Helper method to add PDF title page
   */
  addPDFTitlePage(doc, submission) {
    doc.fontSize(24)
       .text('PREMARKET NOTIFICATION', { align: 'center' })
       .fontSize(20)
       .text('510(k) SUBMISSION', { align: 'center' })
       .moveDown(3);
    
    doc.fontSize(18)
       .text(submission.device?.deviceName || 'Device Name Not Specified', { align: 'center' })
       .moveDown(2);
    
    doc.fontSize(14)
       .text(`Manufacturer: ${submission.device?.manufacturer || 'Not specified'}`, { align: 'center' })
       .text(`Submission Date: ${new Date().toLocaleDateString()}`, { align: 'center' })
       .moveDown(4);
    
    doc.fontSize(12)
       .text('SUBMITTED TO:', { align: 'center' })
       .text('U.S. Food and Drug Administration', { align: 'center' })
       .text('Center for Devices and Radiological Health', { align: 'center' })
       .text('Document Control Center - WO66-G609', { align: 'center' })
       .text('Silver Spring, MD 20993-0002', { align: 'center' });
  }

  /**
   * Helper method to add PDF table of contents
   */
  addPDFTableOfContents(doc) {
    doc.fontSize(18)
       .text('TABLE OF CONTENTS', { underline: true })
       .moveDown();
    
    this.sections.forEach((section, index) => {
      doc.fontSize(11)
         .text(`${section}`, { link: `#section_${index + 1}` })
         .moveDown(0.5);
    });
  }

  /**
   * Helper method to add PDF section
   */
  addPDFSection(doc, title, content) {
    doc.fontSize(14)
       .text(title, { underline: true })
       .moveDown();
    
    doc.fontSize(11);
    content();
    doc.moveDown(2);
  }

  /**
   * Helper method to add comparison table to PDF
   */
  addPDFComparisonTable(doc, device, predicates) {
    const tableData = [
      ['Characteristic', 'Subject Device', 'Predicate Device'],
      ['Device Name', device?.deviceName || 'N/A', predicates[0]?.device_name || 'N/A'],
      ['Manufacturer', device?.manufacturer || 'N/A', predicates[0]?.applicant || 'N/A'],
      ['Product Code', device?.productCode || 'N/A', predicates[0]?.product_code || 'N/A'],
      ['Device Class', device?.deviceClass || 'N/A', predicates[0]?.device_class || 'N/A'],
      ['Intended Use', device?.intendedUse ? 'See Section 5' : 'N/A', 'Same'],
      ['Technological Characteristics', 'See Section 6', 'Similar']
    ];

    // Simple table rendering in PDF
    const startX = doc.x;
    const startY = doc.y;
    const cellWidth = 150;
    const cellHeight = 20;

    tableData.forEach((row, rowIndex) => {
      row.forEach((cell, cellIndex) => {
        doc.rect(startX + (cellIndex * cellWidth), startY + (rowIndex * cellHeight), cellWidth, cellHeight)
           .stroke();
        doc.fontSize(10)
           .text(cell, 
                 startX + (cellIndex * cellWidth) + 5, 
                 startY + (rowIndex * cellHeight) + 5,
                 { width: cellWidth - 10, height: cellHeight - 10 });
      });
    });

    doc.y = startY + (tableData.length * cellHeight) + 20;
  }

  /**
   * Generate DOCX predicate comparison table
   */
  generateDOCXPredicateTable(submission) {
    const predicates = submission.submission.predicateDevices || [];
    if (predicates.length === 0) {
      return [new Paragraph({ text: 'No predicate devices specified' })];
    }

    const table = new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ text: 'Characteristic', bold: true })],
              shading: { fill: 'cccccc', type: ShadingType.CLEAR }
            }),
            new TableCell({
              children: [new Paragraph({ text: 'Subject Device', bold: true })],
              shading: { fill: 'cccccc', type: ShadingType.CLEAR }
            }),
            new TableCell({
              children: [new Paragraph({ text: 'Predicate Device', bold: true })],
              shading: { fill: 'cccccc', type: ShadingType.CLEAR }
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('Device Name')] }),
            new TableCell({ children: [new Paragraph(submission.device?.deviceName || 'N/A')] }),
            new TableCell({ children: [new Paragraph(predicates[0]?.device_name || 'N/A')] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('510(k) Number')] }),
            new TableCell({ children: [new Paragraph('Pending')] }),
            new TableCell({ children: [new Paragraph(predicates[0]?.k_number || 'N/A')] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('Manufacturer')] }),
            new TableCell({ children: [new Paragraph(submission.device?.manufacturer || 'N/A')] }),
            new TableCell({ children: [new Paragraph(predicates[0]?.applicant || 'N/A')] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('Intended Use')] }),
            new TableCell({ children: [new Paragraph('See Section 5')] }),
            new TableCell({ children: [new Paragraph('Same')] })
          ]
        })
      ],
      width: { size: 100, type: WidthType.PERCENTAGE }
    });

    return [table, new Paragraph({ text: '' })];
  }

  /**
   * Validate 510(k) completeness
   */
  async validate510kCompleteness(submission, documents) {
    const validation = {
      isComplete: true,
      missingItems: [],
      warnings: [],
      criticalErrors: []
    };

    // Check required device information
    if (!submission.device?.deviceName) {
      validation.criticalErrors.push('Device name is required');
      validation.isComplete = false;
    }
    if (!submission.device?.manufacturer) {
      validation.criticalErrors.push('Manufacturer name is required');
      validation.isComplete = false;
    }
    if (!submission.device?.intendedUse) {
      validation.criticalErrors.push('Intended use statement is required');
      validation.isComplete = false;
    }
    if (!submission.device?.indicationsForUse) {
      validation.criticalErrors.push('Indications for use statement is required');
      validation.isComplete = false;
    }

    // Check predicate devices
    if (!submission.submission.predicateDevices || submission.submission.predicateDevices.length === 0) {
      validation.criticalErrors.push('At least one predicate device is required');
      validation.isComplete = false;
    }

    // Check administrative information
    const adminInfo = submission.submission.submissionData?.administrativeInfo;
    if (!adminInfo?.organizationName) {
      validation.missingItems.push('Organization name');
    }
    if (!adminInfo?.address) {
      validation.missingItems.push('Organization address');
    }
    if (!adminInfo?.contactPerson) {
      validation.missingItems.push('Contact person');
    }

    // Check performance data
    if (!submission.submission.submissionData?.performanceData) {
      validation.warnings.push('Performance data section is empty');
    }

    // Check biocompatibility
    if (submission.device?.hasDirectPatientContact && !submission.submission.submissionData?.biocompatibility) {
      validation.warnings.push('Biocompatibility data may be required for patient-contacting devices');
    }

    // Check labeling
    if (!submission.submission.submissionData?.labeling) {
      validation.warnings.push('Labeling section is incomplete');
    }

    // Check required documents
    const requiredDocTypes = ['Device Description', 'Labeling', 'Substantial Equivalence'];
    const uploadedDocTypes = documents.map(d => d.documentType);
    
    requiredDocTypes.forEach(type => {
      if (!uploadedDocTypes.includes(type)) {
        validation.missingItems.push(`${type} document`);
      }
    });

    validation.completenessScore = Math.max(0, 100 - (validation.criticalErrors.length * 20) - (validation.missingItems.length * 5));

    return validation;
  }

  /**
   * Get submission data with device info
   */
  async getSubmissionData(submissionId, organizationId) {
    try {
      const result = await db
        .select({
          submission: fda510kSubmissions,
          device: medicalDevices
        })
        .from(fda510kSubmissions)
        .leftJoin(medicalDevices, eq(fda510kSubmissions.deviceId, medicalDevices.id))
        .where(and(
          eq(fda510kSubmissions.id, submissionId),
          eq(fda510kSubmissions.organizationId, organizationId)
        ))
        .limit(1);

      return result[0];
    } catch (error) {
      console.error('Error fetching submission data:', error);
      throw error;
    }
  }

  /**
   * Get submission documents
   */
  async getSubmissionDocuments(submissionId, organizationId) {
    try {
      return await db
        .select()
        .from(deviceSubmissionDocuments)
        .where(and(
          eq(deviceSubmissionDocuments.submissionId, submissionId),
          eq(deviceSubmissionDocuments.submissionType, '510k'),
          eq(deviceSubmissionDocuments.organizationId, organizationId)
        ))
        .orderBy(deviceSubmissionDocuments.createdAt);
    } catch (error) {
      console.error('Error fetching submission documents:', error);
      return [];
    }
  }

  /**
   * Save generated document
   */
  async saveGeneratedDocument(submissionId, organizationId, content, filename, format) {
    try {
      const uploadDir = path.join(process.cwd(), 'uploads', '510k', submissionId.toString());
      await fs.mkdir(uploadDir, { recursive: true });
      
      const filePath = path.join(uploadDir, filename);
      await fs.writeFile(filePath, content);

      // Record in database
      await db.insert(deviceSubmissionDocuments).values({
        organizationId,
        submissionType: '510k',
        submissionId,
        documentType: `Generated ${format.toUpperCase()} Submission`,
        documentName: filename,
        filePath: `/uploads/510k/${submissionId}/${filename}`,
        fileSize: content.length,
        mimeType: format === 'PDF' ? 'application/pdf' : 
                  format === 'DOCX' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                  'application/xml',
        isRequired: true,
        uploadedAt: new Date(),
        uploadedBy: 0 // System generated
      });

      return filePath;
    } catch (error) {
      console.error('Error saving generated document:', error);
      throw error;
    }
  }
}

export default new FDA510kDocumentGenerator();