/**
 * Word Document Generation Service
 *
 * This service handles the generation of Word documents (.docx) for reports.
 * It's designed to be flexible and support different types of regulatory documents.
 */

const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');

/**
 * Generate a Word document from structured content
 *
 * @param {Object} content - Structured content for the document
 * @param {String} filename - Target filename for the generated document
 * @returns {Buffer} Word document as a buffer
 */
async function generateDocx(content, filename) {
  try {
    // Convert content structure to HTML (which we'll use as an intermediate format)
    const html = generateHtml(content);

    // For this simplified implementation, we're returning HTML with Word-specific styles
    // In a production environment, you would use a library like docx.js or similar
    const wordMLHeader = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word'
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
      <meta charset="utf-8">
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <meta name="ProgId" content="Word.Document">
      <meta name="Generator" content="Microsoft Word 15">
      <meta name="Originator" content="Microsoft Word 15">
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
    `;

    // Replace the HTML header with Word-specific header
    const wordDoc = html.replace('<!DOCTYPE html>\n    <html>', wordMLHeader);

    // Return as buffer
    const docxBuffer = Buffer.from(wordDoc);

    return docxBuffer;
  } catch (error) {
    console.error('Error generating Word document:', error);
    throw new Error(`Word document generation failed: ${error.message}`);
  }
}

/**
 * Generate HTML from structured content
 *
 * @param {Object} content - Structured content for the document
 * @returns {String} Generated HTML
 */
function generateHtml(content) {
  // Start with HTML boilerplate
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${content.title || 'Generated Document'}</title>
      <style>
        /* Word document styling */
        body {
          font-family: 'Calibri', sans-serif;
          font-size: 11pt;
          line-height: 1.15;
          margin: 1in;
        }
        h1 {
          font-family: 'Calibri', sans-serif;
          font-size: 16pt;
          font-weight: bold;
          text-align: center;
          color: #000;
          margin-top: 24pt;
          margin-bottom: 12pt;
        }
        h2 {
          font-family: 'Calibri', sans-serif;
          font-size: 14pt;
          font-weight: bold;
          color: #000;
          margin-top: 12pt;
          margin-bottom: 6pt;
          border-bottom: 1pt solid #DDD;
          padding-bottom: 4pt;
          page-break-after: avoid;
        }
        h3 {
          font-family: 'Calibri', sans-serif;
          font-size: 12pt;
          font-weight: bold;
          color: #000;
          margin-top: 10pt;
          margin-bottom: 6pt;
          page-break-after: avoid;
        }
        p {
          margin: 6pt 0;
          text-align: justify;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 12pt 0;
        }
        th, td {
          border: 1pt solid #DDD;
          padding: 5pt;
          vertical-align: top;
        }
        th {
          font-weight: bold;
          text-align: left;
          background-color: #F2F2F2;
        }
        .footer {
          margin-top: 24pt;
          border-top: 1pt solid #DDD;
          padding-top: 6pt;
          text-align: center;
          font-size: 9pt;
          color: #777;
        }
      </style>
    </head>
    <body>
  `;

  // Add document title
  html += `<h1>${content.title}</h1>`;

  // Add subtitle if present
  if (content.subtitle) {
    html += `<h2 style="text-align: center; border-bottom: none;">${content.subtitle}</h2>`;
  }

  // Process each section
  if (content.sections && Array.isArray(content.sections)) {
    content.sections.forEach(section => {
      html += `<h2>${section.title}</h2>`;

      // Process section content
      if (section.content && Array.isArray(section.content)) {
        section.content.forEach(item => {
          // Add heading if present
          if (item.heading) {
            html += `<h3>${item.heading}</h3>`;
          }

          // Add text if present
          if (item.text) {
            html += `<p>${item.text.replace(/\\n/g, '<br>')}</p>`;
          }

          // Add table if present
          if (item.table) {
            html += '<table>';

            // Add table headers
            if (item.table.headers && Array.isArray(item.table.headers)) {
              html += '<thead><tr>';
              item.table.headers.forEach(header => {
                html += `<th>${header}</th>`;
              });
              html += '</tr></thead>';
            }

            // Add table rows
            if (item.table.rows && Array.isArray(item.table.rows)) {
              html += '<tbody>';
              item.table.rows.forEach(row => {
                html += '<tr>';
                row.forEach(cell => {
                  html += `<td>${cell}</td>`;
                });
                html += '</tr>';
              });
              html += '</tbody>';
            }

            html += '</table>';
          }
        });
      }
    });
  }

  // Add footer if present
  if (content.footer) {
    html += `<div class="footer">${content.footer.text || ''}</div>`;
  }

  // Close HTML tags
  html += `
    </body>
    </html>
  `;

  return html;
}

/**
 * Initialize Word Generation Service
 */
async function initialize() {
  try {
    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), 'generated_documents');
    // In case fs.promises is not available, handle both ways
    if (fs.promises) {
      await fs.promises.mkdir(outputDir, { recursive: true });
    } else {
      // Use fs with promisify as a fallback
      const { promisify } = require('util');
      const mkdir = promisify(fs.mkdir);
      await mkdir(outputDir, { recursive: true });
    }

    console.log(`Word Generation Service initialized. Output directory: ${outputDir}`);
    return true;
  } catch (error) {
    console.error('Failed to initialize Word generation service:', error);
    return false;
  }
}

module.exports = {
  initialize,
  generateDocx,
};
