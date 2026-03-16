/**
 * CER QA Checklist PDF Generator
 *
 * Utility function to generate a downloadable PDF version of the CER QA Checklist
 */
import { jsPDF } from 'jspdf';

/**
 * Generates and downloads a PDF version of the QA Checklist
 */
export function generateQAChecklistPDF() {
  // Initialize PDF document
  const doc = new jsPDF();

  // Add title
  doc.setFontSize(20);
  doc.setTextColor(0, 51, 153); // Corporate blue
  doc.text('Concept2Cure CER Generator - QA Checklist', 20, 20);

  // Add subtitle
  doc.setFontSize(12);
  doc.setTextColor(80, 80, 80); // Dark gray
  doc.text('Final Review Checklist for Stakeholder Presentation', 20, 30);

  // Add date
  const today = new Date();
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100); // Medium gray
  doc.text(`Generated: ${today.toLocaleDateString()}`, 20, 38);

  // Document sections
  const sections = [
    {
      title: '1. Navigation & Entry',
      items: [
        'Sidebar shows "CER Generator" in blue highlight',
        'Clicking it routes to /cer',
        'Page loads without console errors',
      ],
    },
    {
      title: '2. Instructional Flow',
      items: [
        'Instruction card shows all 3 steps',
        '- Select section',
        '- Generate content',
        '- Preview/export',
      ],
    },
    {
      title: '3. Section Builder Panel',
      items: [
        'Section type dropdown works (4 types)',
        'Textarea accepts input',
        '"Generate Section" calls /api/cer/generate-section',
        'Generated content is displayed clearly',
        'New section is added to live draft',
      ],
    },
    {
      title: '4. Live Preview',
      items: [
        'CER title renders at top',
        'Drafted sections display correctly with formatting',
        'FAERS table displays adverse events (if present)',
        'Comparator list shows risk scores',
      ],
    },
    {
      title: '5. Export Buttons',
      items: [
        '"Export as PDF" downloads a file with FAERS + sections',
        '"Export as Word" downloads same in .docx format',
        'Files are readable and professionally formatted',
      ],
    },
    {
      title: '6. Backend API Test',
      items: [
        '/api/cer/fetch-faers works with valid product name',
        '/api/cer/export-docx and /api/cer/export-pdf respond with correct files',
        '/api/cer/generate-section generates expected content using GPT-4o',
      ],
    },
    {
      title: '7. State Sync (Advanced)',
      items: [
        'Generated sections are stored in local state',
        'Preview reflects all added sections without page reload',
        'Export pulls the correct title, FAERS, and comparators at time of click',
      ],
    },
  ];

  // Generate the content
  let yPosition = 50;
  const pageWidth = doc.internal.pageSize.width;

  sections.forEach((section, index) => {
    // Add section header
    doc.setFontSize(14);
    doc.setTextColor(44, 62, 80); // Dark blue
    doc.text(section.title, 20, yPosition);
    yPosition += 10;

    // Add section items
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60); // Dark gray

    section.items.forEach(item => {
      // Check if we need a new page
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }

      doc.text(`□ ${item}`, 25, yPosition);
      yPosition += 7;
    });

    // Add space between sections
    yPosition += 5;
  });

  // Add footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150); // Light gray
  doc.text(
    `Concept2Cure™ by Concept2Cures, Inc. - Confidential Internal Document`,
    pageWidth / 2,
    285,
    { align: 'center' }
  );

  // Save the PDF
  doc.save('Concept2Cure-CER-QA-Checklist.pdf');

  return true;
}
