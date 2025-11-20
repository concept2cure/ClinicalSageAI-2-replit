import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Header, Footer, PageNumber, Packer } from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Professional FDA 510(k) Export Service
 * Generates FDA-compliant submission documents in Word and PDF formats
 */
class Fda510kExportService {
  constructor() {
    this.documentMetadata = {
      title: 'FDA 510(k) Premarket Notification',
      subject: 'Medical Device Submission',
      creator: 'CERV2 Regulatory Platform',
      company: 'Concept2Cure',
      revision: 1,
      lastModifiedBy: 'Regulatory Affairs'
    };
  }

  /**
   * Export FDA 510(k) submission to Word format (.docx)
   * Generates a properly formatted document ready for FDA submission
   */
  async exportToWord(documentData) {
    const { deviceName, manufacturer, documentId, sections, sectionData, overallProgress } = documentData;
    
    // Create document sections
    const docSections = [];
    
    // Title Page
    docSections.push(
      new Paragraph({
        text: "FDA 510(k) PREMARKET NOTIFICATION",
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
      }),
      new Paragraph({
        text: deviceName || '[Device Name]',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }),
      new Paragraph({
        text: manufacturer || '[Manufacturer]',
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 }
      }),
      new Paragraph({
        text: `Document ID: ${documentId}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 }
      }),
      new Paragraph({
        text: `Submission Date: ${new Date().toLocaleDateString()}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 }
      }),
      new Paragraph({
        text: `Completion Status: ${overallProgress}%`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 1000 }
      }),
      new Paragraph({
        text: "",
        spacing: { after: 1000 }
      })
    );
    
    // Add each section with FDA-compliant formatting
    sections.forEach((section, idx) => {
      const data = sectionData[section.id] || {};
      
      // Section heading
      docSections.push(
        new Paragraph({
          text: `${idx + 1}. ${section.title}`,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 }
        })
      );
      
      // Add section content
      section.fields.forEach(field => {
        const value = data[field.id];
        if (value && value !== '') {
          // Field label
          docSections.push(
            new Paragraph({
              text: field.label,
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 200, after: 100 }
            })
          );
          
          // Field value with proper formatting
          const valueText = Array.isArray(value) ? value.join('\n') : String(value);
          docSections.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: valueText,
                  size: 24 // 12pt font
                })
              ],
              spacing: { after: 200 }
            })
          );
        }
      });
      
      // Page break after major sections (except last)
      if (idx < sections.length - 1) {
        docSections.push(
          new Paragraph({
            text: "",
            pageBreakBefore: true
          })
        );
      }
    });
    
    // Add regulatory statement footer
    docSections.push(
      new Paragraph({
        text: "",
        pageBreakBefore: true
      }),
      new Paragraph({
        text: "CONFIDENTIAL - FDA SUBMISSION",
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { before: 600, after: 200 }
      }),
      new Paragraph({
        text: "This document contains confidential and proprietary information intended solely for FDA review.",
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 }
      }),
      new Paragraph({
        text: "Generated in compliance with 21 CFR Part 807 Subpart E",
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 }
      })
    );
    
    // Create the document
    const doc = new Document({
      creator: this.documentMetadata.creator,
      title: this.documentMetadata.title,
      subject: this.documentMetadata.subject,
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1440,    // 1 inch
              bottom: 1440,
              left: 1440,
              right: 1440
            }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                text: `510(k) Submission - ${deviceName || 'Medical Device'}`,
                alignment: AlignmentType.RIGHT
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun("Page "),
                  new TextRun({
                    children: [PageNumber.CURRENT]
                  }),
                  new TextRun(" of "),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES]
                  })
                ]
              })
            ]
          })
        },
        children: docSections
      }]
    });
    
    // Generate and download
    const blob = await Packer.toBlob(doc);
    const fileName = `FDA_510k_${documentId}_${new Date().toISOString().split('T')[0]}.docx`;
    saveAs(blob, fileName);
    
    return fileName;
  }
  
  /**
   * Export FDA 510(k) submission to PDF format
   * Creates a professional PDF ready for electronic submission
   */
  async exportToPDF(elementId, documentData) {
    const { deviceName, documentId } = documentData;
    const element = document.getElementById(elementId);
    
    if (!element) {
      throw new Error('Preview element not found');
    }
    
    // Create high-quality canvas
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    
    // Initialize PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    // Calculate dimensions
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    
    // Add pages as needed
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    
    // Add metadata
    pdf.setProperties({
      title: `FDA 510(k) Submission - ${deviceName}`,
      subject: 'Medical Device Premarket Notification',
      author: 'CERV2 Regulatory Platform',
      keywords: '510k, FDA, medical device',
      creator: 'Concept2Cure'
    });
    
    // Save PDF
    const fileName = `FDA_510k_${documentId}_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(fileName);
    
    return fileName;
  }
  
  /**
   * Generate FDA eCopy format (structured data for electronic submission)
   */
  generateECopy(documentData) {
    const { deviceName, manufacturer, documentId, sections, sectionData } = documentData;
    
    // Create structured data following FDA eCopy requirements
    const eCopyData = {
      submissionType: '510(k)',
      documentId: documentId,
      submissionDate: new Date().toISOString(),
      device: {
        name: deviceName,
        manufacturer: manufacturer,
        classification: sectionData['cover-letter']?.device_class || 'Class II'
      },
      sections: {}
    };
    
    // Structure each section
    sections.forEach((section, idx) => {
      const data = sectionData[section.id] || {};
      eCopyData.sections[`section_${idx + 1}`] = {
        title: section.title,
        number: idx + 1,
        required: section.required,
        content: {}
      };
      
      section.fields.forEach(field => {
        if (data[field.id]) {
          eCopyData.sections[`section_${idx + 1}`].content[field.id] = {
            label: field.label,
            value: data[field.id],
            type: field.type,
            required: field.required
          };
        }
      });
    });
    
    // Download as JSON for FDA eCopy
    const blob = new Blob([JSON.stringify(eCopyData, null, 2)], {
      type: 'application/json'
    });
    const fileName = `FDA_510k_eCopy_${documentId}_${new Date().toISOString().split('T')[0]}.json`;
    saveAs(blob, fileName);
    
    return fileName;
  }
  
  /**
   * Validate document completeness before export
   */
  validateForExport(sections, sectionData) {
    const issues = [];
    let requiredSectionsComplete = 0;
    let totalRequiredSections = 0;
    
    sections.forEach(section => {
      if (section.required) {
        totalRequiredSections++;
        const data = sectionData[section.id] || {};
        let sectionComplete = true;
        
        section.fields.forEach(field => {
          if (field.required && (!data[field.id] || data[field.id] === '')) {
            issues.push({
              section: section.title,
              field: field.label,
              type: 'missing_required'
            });
            sectionComplete = false;
          }
        });
        
        if (sectionComplete) {
          requiredSectionsComplete++;
        }
      }
    });
    
    return {
      isValid: issues.length === 0,
      completeness: Math.round((requiredSectionsComplete / totalRequiredSections) * 100),
      issues: issues
    };
  }
}

export default new Fda510kExportService();