const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { PDFDocument } = require('pdf-lib');

/**
 * CER Reports API Routes
 *
 * These routes provide endpoints for generating and exporting comprehensive CER reports,
 * section-specific reports, and specialized report formats.
 */

// Generate and return a comprehensive CER report as PDF
router.get('/export-comprehensive-report', async (req, res) => {
  try {
    const { deviceName, manufacturer, includeSections = 'all' } = req.query;

    if (!deviceName || !manufacturer) {
      return res.status(400).json({
        error: 'Missing required parameters. Please provide deviceName and manufacturer.',
      });
    }

    console.log(`Generating comprehensive report for ${deviceName} from ${manufacturer}`);

    // Call the Python script to generate the PDF
    const outputPath = path.join(
      __dirname,
      '../..',
      'generated_documents',
      `${deviceName.replace(/[^a-z0-9]/gi, '_')}_CER_Report.pdf`
    );

    // Ensure directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // In a production environment, you would generate the actual PDF here
    // For this implementation, we'll use pdf-lib to create a simple PDF

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size

    // Add some simple content
    const { width, height } = page.getSize();
    page.drawText('Clinical Evaluation Report (CER)', {
      x: 50,
      y: height - 50,
      size: 24,
    });

    page.drawText(`Device: ${deviceName}`, {
      x: 50,
      y: height - 100,
      size: 14,
    });

    page.drawText(`Manufacturer: ${manufacturer}`, {
      x: 50,
      y: height - 130,
      size: 14,
    });

    page.drawText('This is a comprehensive CER report including all sections', {
      x: 50,
      y: height - 180,
      size: 12,
    });

    // Add more pages with section data
    const sections = [
      'Device Description',
      'Literature Review',
      'Clinical Evidence',
      'Risk Analysis',
      'Benefit-Risk Analysis',
      'Post-Market Surveillance',
      'Conclusion',
    ];

    for (const section of sections) {
      if (
        includeSections === 'all' ||
        includeSections.includes(section.toLowerCase().replace(/\s+/g, '-'))
      ) {
        const sectionPage = pdfDoc.addPage([595.28, 841.89]);
        sectionPage.drawText(`${section}`, {
          x: 50,
          y: height - 50,
          size: 20,
        });

        sectionPage.drawText(
          `Content for ${section} would appear here in a production environment.`,
          {
            x: 50,
            y: height - 100,
            size: 12,
          }
        );
      }
    }

    const pdfBytes = await pdfDoc.save();

    // Write the PDF to disk
    fs.writeFileSync(outputPath, pdfBytes);

    // Send the PDF as a response
    res.contentType('application/pdf');
    res.send(pdfBytes);
  } catch (error) {
    console.error('Error generating comprehensive report:', error);
    res.status(500).json({
      error: 'Failed to generate comprehensive report',
      details: error.message,
    });
  }
});

// Generate and return a section-specific report as PDF
router.get('/export-section-report/:section', async (req, res) => {
  try {
    const { section } = req.params;
    const { deviceName, manufacturer } = req.query;

    if (!deviceName || !manufacturer) {
      return res.status(400).json({
        error: 'Missing required parameters. Please provide deviceName and manufacturer.',
      });
    }

    console.log(`Generating ${section} report for ${deviceName} from ${manufacturer}`);

    // Format the section name for display
    const formattedSection = section
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Create a simple PDF for the section
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size

    // Add some content
    const { width, height } = page.getSize();
    page.drawText(`${formattedSection} Report`, {
      x: 50,
      y: height - 50,
      size: 24,
    });

    page.drawText(`Device: ${deviceName}`, {
      x: 50,
      y: height - 100,
      size: 14,
    });

    page.drawText(`Manufacturer: ${manufacturer}`, {
      x: 50,
      y: height - 130,
      size: 14,
    });

    page.drawText(`This report focuses on the ${formattedSection} section of the CER.`, {
      x: 50,
      y: height - 180,
      size: 12,
    });

    // Add more specific content based on the section
    if (section === 'quality-management') {
      const qmpPage = pdfDoc.addPage([595.28, 841.89]);
      qmpPage.drawText('Quality Management Plan Overview', {
        x: 50,
        y: height - 50,
        size: 20,
      });

      qmpPage.drawText(
        'This report includes Quality Management Plan data, including objectives, CtQ factors, and compliance metrics.',
        {
          x: 50,
          y: height - 100,
          size: 12,
        }
      );
    } else if (section === 'literature-review') {
      const litPage = pdfDoc.addPage([595.28, 841.89]);
      litPage.drawText('Literature Review Results', {
        x: 50,
        y: height - 50,
        size: 20,
      });

      litPage.drawText(
        'This report includes the literature review methodology, search results, and analysis.',
        {
          x: 50,
          y: height - 100,
          size: 12,
        }
      );
    }

    const pdfBytes = await pdfDoc.save();

    // Send the PDF as a response
    res.contentType('application/pdf');
    res.send(pdfBytes);
  } catch (error) {
    console.error(`Error generating ${req.params.section} report:`, error);
    res.status(500).json({
      error: `Failed to generate ${req.params.section} report`,
      details: error.message,
    });
  }
});

module.exports = router;
