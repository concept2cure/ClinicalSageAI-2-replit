/**
 * Word Document Generation Service (ESM Version)
 *
 * This service handles the generation of Word documents (.docx) for reports.
 * It's designed to be flexible and support different types of regulatory documents.
 */

import fs from 'fs/promises';
import path from 'path';
import { Buffer } from 'buffer';
import { fileURLToPath } from 'url';

// Get dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate a Word document from structured content
 *
 * @param {Object} content - Structured content for the document
 * @param {String} filename - Target filename for the generated document
 * @returns {Buffer} Word document as a buffer
 */
async function generateDocx(content, filename) {
  try {
    console.log(`Generating Word document for: ${filename}`);

    // Use HTML as an intermediary format
    const html = generateHtml(content);

    // In a production environment, this would use a proper Word document generation library
    // For now, we'll return a pseudo-Word document format container
    const wordDocWrapper = `
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <!-- This is a simplified representation of a Word document -->
    <w:p>
      <w:r>
        <w:t>${html.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>
`;

    return Buffer.from(wordDocWrapper);
  } catch (error) {
    console.error('Error generating Word document:', error);
    throw error;
  }
}

/**
 * Generate HTML from structured content
 *
 * @param {Object} content - Structured content for the document
 * @returns {String} Generated HTML
 */
function generateHtml(content) {
  // Start with basic HTML structure
  let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${content.title || 'Generated Document'}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.5;
          color: #333;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 {
          color: #2563eb;
          text-align: center;
          margin-bottom: 30px;
        }
        h2 {
          color: #1d4ed8;
          margin-top: 40px;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 8px;
        }
        h3 {
          color: #1e40af;
          margin-top: 25px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th, td {
          border: 1px solid #e5e7eb;
          padding: 12px;
          text-align: left;
        }
        th {
          background-color: #f3f4f6;
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
        }
        .footer {
          margin-top: 50px;
          text-align: center;
          font-size: 14px;
          color: #6b7280;
          border-top: 1px solid #e5e7eb;
          padding-top: 20px;
        }
        .section {
          margin-bottom: 30px;
        }
      </style>
    </head>
    <body>
  `;

  // Add header if present
  if (content.header) {
    html += `<div class="header">
      <h1>${content.header.title || content.title || 'Generated Document'}</h1>
      ${content.header.subtitle ? `<p>${content.header.subtitle}</p>` : ''}
      ${content.header.date ? `<p>Date: ${content.header.date}</p>` : ''}
    </div>`;
  }

  // Add main content sections
  if (content.sections && Array.isArray(content.sections)) {
    content.sections.forEach((section, index) => {
      html += `<div class="section" id="section-${index + 1}">
        <h2>${section.title || `Section ${index + 1}`}</h2>
        ${section.content || ''}
      </div>`;
    });
  } else if (content.body) {
    // For simple content structures
    html += `<div class="content">${content.body}</div>`;
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
    await fs.mkdir(outputDir, { recursive: true });

    console.log(`Word Generation Service initialized. Output directory: ${outputDir}`);
    return true;
  } catch (error) {
    console.error('Failed to initialize Word generation service:', error);
    return false;
  }
}

export default {
  initialize,
  generateDocx,
};
