/**
 * PDF Generator Service for IND Wizard
 *
 * This service renders structured content blocks to PDF format using PDF-Lib.
 * It processes all block types (markdown, tables, figures) and applies consistent styling.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { marked } from 'marked';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { JSDOM } from 'jsdom';
import lodash from 'lodash';
const { chunk } = lodash;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// PDF styling constants
const STYLING = {
  pageSize: { width: 612, height: 792 }, // US Letter
  margins: { top: 72, right: 72, bottom: 72, left: 72 },
  fonts: {
    title: { size: 14, color: rgb(0, 0, 0) },
    heading1: { size: 12, color: rgb(0, 0, 0) },
    heading2: { size: 11, color: rgb(0, 0, 0) },
    heading3: { size: 10, color: rgb(0, 0, 0) },
    body: { size: 10, color: rgb(0, 0, 0) },
    caption: { size: 8, color: rgb(0.3, 0.3, 0.3) },
    footer: { size: 8, color: rgb(0.5, 0.5, 0.5) },
  },
  spacing: {
    paragraph: 12,
    heading1: 24,
    heading2: 18,
    heading3: 14,
    table: 18,
    figure: 24,
  },
  tableStyles: {
    cellPadding: 5,
    borderColor: rgb(0.8, 0.8, 0.8),
    headerBackground: rgb(0.95, 0.95, 0.95),
  },
};

/**
 * Generate PDF from submission blocks
 *
 * @param {string} submissionId - ID of the IND submission
 * @param {Object} options - Generation options
 * @returns {Promise<Buffer>} - The generated PDF as a buffer
 */
export async function generateSubmissionPdf(submissionId, options = {}) {
  try {
    logger.info(`Starting PDF generation for submission ${submissionId}`);

    // Get submission details
    const { data: submission, error: submissionError } = await supabase
      .from('ind_submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (submissionError) {
      throw new Error(`Error fetching submission: ${submissionError.message}`);
    }

    // Get all blocks for this submission, ordered by section code and updated_at
    const { data: blocks, error: blocksError } = await supabase
      .from('ind_blocks')
      .select('*')
      .eq('submission_id', submissionId)
      .order('section_code')
      .order('updated_at');

    if (blocksError) {
      throw new Error(`Error fetching blocks: ${blocksError.message}`);
    }

    // Group blocks by section
    const sectionBlocks = {};
    blocks.forEach(block => {
      if (!sectionBlocks[block.section_code]) {
        sectionBlocks[block.section_code] = [];
      }
      sectionBlocks[block.section_code].push(block);
    });

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();

    // Load standard fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // Get section definitions to include titles
    const { data: sectionDefs, error: sectionsError } = await supabase
      .from('ind_section_definitions')
      .select('id, name')
      .in('id', Object.keys(sectionBlocks));

    if (sectionsError) {
      throw new Error(`Error fetching section definitions: ${sectionsError.message}`);
    }

    // Create a map of section codes to names
    const sectionNames = {};
    sectionDefs.forEach(def => {
      sectionNames[def.id] = def.name;
    });

    // Track current position for new content
    let currentPage = pdfDoc.addPage(STYLING.pageSize);
    let yPosition = currentPage.getHeight() - STYLING.margins.top;

    // Add cover page
    await addCoverPage(pdfDoc, submission);

    // Add table of contents
    await addTableOfContents(pdfDoc, sectionBlocks, sectionNames);

    // Process each section
    for (const [sectionCode, blocks] of Object.entries(sectionBlocks)) {
      // Add section title
      currentPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];

      // Check if we need a new page
      if (yPosition < STYLING.margins.bottom + 100) {
        currentPage = pdfDoc.addPage(STYLING.pageSize);
        yPosition = currentPage.getHeight() - STYLING.margins.top;
      }

      // Draw section header
      currentPage.drawText(`${sectionCode} ${sectionNames[sectionCode] || ''}`, {
        x: STYLING.margins.left,
        y: yPosition,
        size: STYLING.fonts.heading1.size,
        font: helveticaBold,
        color: STYLING.fonts.heading1.color,
      });

      yPosition -= STYLING.spacing.heading1;

      // Process each block in the section
      for (const block of blocks) {
        // Check if we need a new page
        if (yPosition < STYLING.margins.bottom + 50) {
          currentPage = pdfDoc.addPage(STYLING.pageSize);
          yPosition = currentPage.getHeight() - STYLING.margins.top;
        }

        // Process block based on type
        switch (block.block_type) {
          case 'markdown':
            yPosition = await renderMarkdownBlock(
              block.content.markdown,
              pdfDoc,
              currentPage,
              yPosition,
              { helveticaFont, helveticaBold, helveticaOblique }
            );
            break;

          case 'table':
            yPosition = await renderTableBlock(block.content, pdfDoc, currentPage, yPosition, {
              helveticaFont,
              helveticaBold,
            });
            break;

          case 'figure':
            yPosition = await renderFigureBlock(block.content, pdfDoc, currentPage, yPosition, {
              helveticaFont,
              helveticaOblique,
            });
            break;

          default:
            logger.warn(`Unknown block type: ${block.block_type}`);
        }

        // Add spacing between blocks
        yPosition -= STYLING.spacing.paragraph;
      }
    }

    // Add footers to all pages
    addFooters(pdfDoc, submission);

    // Save the PDF
    const pdfBytes = await pdfDoc.save();

    logger.info(`PDF generation complete for submission ${submissionId}`);

    return Buffer.from(pdfBytes);
  } catch (error) {
    logger.error(`Error generating PDF: ${error.message}`, error);
    throw error;
  }
}

/**
 * Add a cover page to the PDF
 *
 * @param {PDFDocument} pdfDoc - The PDF document
 * @param {Object} submission - Submission details
 */
async function addCoverPage(pdfDoc, submission) {
  let page = pdfDoc.addPage(STYLING.pageSize);
  const { width, height } = page.getSize();
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Title
  page.drawText('INVESTIGATIONAL NEW DRUG APPLICATION', {
    x: width / 2 - 180,
    y: height - 200,
    size: 16,
    font: helveticaBold,
    color: rgb(0, 0, 0),
  });

  // IND Number
  if (submission.ind_number) {
    page.drawText(`IND ${submission.ind_number}`, {
      x: width / 2 - 50,
      y: height - 250,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
  }

  // Submission Title
  page.drawText(submission.title, {
    x: width / 2 - submission.title.length * 4,
    y: height - 300,
    size: 14,
    font: helveticaBold,
    color: rgb(0, 0, 0),
  });

  // Sponsor
  page.drawText('Sponsor:', {
    x: width / 2 - 150,
    y: height - 350,
    size: 12,
    font: helveticaBold,
    color: rgb(0, 0, 0),
  });

  page.drawText(submission.sponsor_name, {
    x: width / 2 - 80,
    y: height - 350,
    size: 12,
    font: helvetica,
    color: rgb(0, 0, 0),
  });

  // Date
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  page.drawText('Date:', {
    x: width / 2 - 150,
    y: height - 380,
    size: 12,
    font: helveticaBold,
    color: rgb(0, 0, 0),
  });

  page.drawText(currentDate, {
    x: width / 2 - 80,
    y: height - 380,
    size: 12,
    font: helvetica,
    color: rgb(0, 0, 0),
  });

  // Footer
  page.drawText('CONFIDENTIAL', {
    x: width / 2 - 40,
    y: 30,
    size: 10,
    font: helveticaBold,
    color: rgb(0, 0, 0),
  });
}

/**
 * Add a table of contents to the PDF
 *
 * @param {PDFDocument} pdfDoc - The PDF document
 * @param {Object} sectionBlocks - Blocks grouped by section
 * @param {Object} sectionNames - Map of section codes to names
 */
async function addTableOfContents(pdfDoc, sectionBlocks, sectionNames) {
  let page = pdfDoc.addPage(STYLING.pageSize);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let yPosition = page.getHeight() - STYLING.margins.top;

  // Title
  page.drawText('TABLE OF CONTENTS', {
    x: STYLING.margins.left,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: rgb(0, 0, 0),
  });

  yPosition -= 40;

  // Add each section to the TOC
  for (const [sectionCode, blocks] of Object.entries(sectionBlocks)) {
    if (yPosition < STYLING.margins.bottom + 20) {
      page = pdfDoc.addPage(STYLING.pageSize);
      yPosition = page.getHeight() - STYLING.margins.top;
    }

    // Section entry
    page.drawText(`${sectionCode}`, {
      x: STYLING.margins.left,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    page.drawText(`${sectionNames[sectionCode] || ''}`, {
      x: STYLING.margins.left + 80,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: rgb(0, 0, 0),
    });

    yPosition -= 20;
  }
}

/**
 * Add footers to all pages in the PDF
 *
 * @param {PDFDocument} pdfDoc - The PDF document
 * @param {Object} submission - Submission details
 */
function addFooters(pdfDoc, submission) {
  const pages = pdfDoc.getPages();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();

    // Page number
    page.drawText(`Page ${i + 1} of ${pages.length}`, {
      x: width - STYLING.margins.right - 75,
      y: STYLING.margins.bottom - 15,
      size: STYLING.fonts.footer.size,
      color: STYLING.fonts.footer.color,
    });

    // Submission ID
    page.drawText(`Submission ID: ${submission.id}`, {
      x: STYLING.margins.left,
      y: STYLING.margins.bottom - 15,
      size: STYLING.fonts.footer.size,
      color: STYLING.fonts.footer.color,
    });
  }
}

/**
 * Render a markdown block to the PDF
 *
 * @param {string} markdown - Markdown content
 * @param {PDFDocument} pdfDoc - The PDF document
 * @param {PDFPage} currentPage - Current PDF page
 * @param {number} yPosition - Current Y position
 * @param {Object} fonts - Font objects
 * @returns {number} - New Y position
 */
async function renderMarkdownBlock(markdown, pdfDoc, currentPage, yPosition, fonts) {
  // Parse markdown to HTML
  const htmlContent = marked.parse(markdown);

  // Create a DOM to parse the HTML
  const dom = new JSDOM(htmlContent);
  const elements = dom.window.document.body.children;

  // Process each HTML element
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];

    // Check if we need a new page
    if (yPosition < STYLING.margins.bottom + 50) {
      currentPage = pdfDoc.addPage(STYLING.pageSize);
      yPosition = currentPage.getHeight() - STYLING.margins.top;
    }

    // Render based on element type
    switch (element.tagName) {
      case 'H1':
        currentPage.drawText(element.textContent, {
          x: STYLING.margins.left,
          y: yPosition,
          size: STYLING.fonts.heading1.size,
          font: fonts.helveticaBold,
          color: STYLING.fonts.heading1.color,
        });
        yPosition -= STYLING.spacing.heading1;
        break;

      case 'H2':
        currentPage.drawText(element.textContent, {
          x: STYLING.margins.left,
          y: yPosition,
          size: STYLING.fonts.heading2.size,
          font: fonts.helveticaBold,
          color: STYLING.fonts.heading2.color,
        });
        yPosition -= STYLING.spacing.heading2;
        break;

      case 'H3':
        currentPage.drawText(element.textContent, {
          x: STYLING.margins.left,
          y: yPosition,
          size: STYLING.fonts.heading3.size,
          font: fonts.helveticaBold,
          color: STYLING.fonts.heading3.color,
        });
        yPosition -= STYLING.spacing.heading3;
        break;

      case 'P':
        // Split paragraph into lines that fit within page width
        const text = element.textContent;
        const fontSize = STYLING.fonts.body.size;
        const maxWidth = currentPage.getWidth() - STYLING.margins.left - STYLING.margins.right;

        // Split text into words
        const words = text.split(' ');
        let line = '';

        for (const word of words) {
          // Calculate width of current line + new word
          const testLine = line ? `${line} ${word}` : word;
          const lineWidth = fonts.helveticaFont.widthOfTextAtSize(testLine, fontSize);

          if (lineWidth <= maxWidth) {
            // Word fits, add it to the line
            line = testLine;
          } else {
            // Word doesn't fit, draw current line and start new line
            // Check if we need a new page
            if (yPosition < STYLING.margins.bottom + fontSize) {
              currentPage = pdfDoc.addPage(STYLING.pageSize);
              yPosition = currentPage.getHeight() - STYLING.margins.top;
            }

            // Draw current line
            currentPage.drawText(line, {
              x: STYLING.margins.left,
              y: yPosition,
              size: fontSize,
              font: fonts.helveticaFont,
              color: STYLING.fonts.body.color,
            });

            // Move to next line
            yPosition -= fontSize * 1.2;
            line = word;
          }
        }

        // Draw remaining text
        if (line) {
          // Check if we need a new page
          if (yPosition < STYLING.margins.bottom + fontSize) {
            currentPage = pdfDoc.addPage(STYLING.pageSize);
            yPosition = currentPage.getHeight() - STYLING.margins.top;
          }

          currentPage.drawText(line, {
            x: STYLING.margins.left,
            y: yPosition,
            size: fontSize,
            font: fonts.helveticaFont,
            color: STYLING.fonts.body.color,
          });

          yPosition -= fontSize * 1.2;
        }

        // Add paragraph spacing
        yPosition -= STYLING.spacing.paragraph;
        break;

      case 'UL':
      case 'OL':
        // Process list items
        const items = element.querySelectorAll('li');
        for (let j = 0; j < items.length; j++) {
          // Check if we need a new page
          if (yPosition < STYLING.margins.bottom + 30) {
            currentPage = pdfDoc.addPage(STYLING.pageSize);
            yPosition = currentPage.getHeight() - STYLING.margins.top;
          }

          const itemText = items[j].textContent;
          const bulletPrefix = element.tagName === 'UL' ? '• ' : `${j + 1}. `;

          // Split text into lines that fit within page width
          const itemFontSize = STYLING.fonts.body.size;
          const itemMaxWidth =
            currentPage.getWidth() - STYLING.margins.left - STYLING.margins.right - 20;

          // Calculate bullet width
          const bulletWidth = fonts.helveticaFont.widthOfTextAtSize(bulletPrefix, itemFontSize);

          // Draw bullet/number
          currentPage.drawText(bulletPrefix, {
            x: STYLING.margins.left,
            y: yPosition,
            size: itemFontSize,
            font: fonts.helveticaFont,
            color: STYLING.fonts.body.color,
          });

          // Split item text into words
          const itemWords = itemText.split(' ');
          let itemLine = '';
          let firstLine = true;

          for (const word of itemWords) {
            // Calculate width of current line + new word
            const testLine = itemLine ? `${itemLine} ${word}` : word;
            const lineWidth = fonts.helveticaFont.widthOfTextAtSize(testLine, itemFontSize);

            if (lineWidth <= itemMaxWidth) {
              // Word fits, add it to the line
              itemLine = testLine;
            } else {
              // Word doesn't fit, draw current line and start new line
              // Check if we need a new page
              if (yPosition < STYLING.margins.bottom + itemFontSize) {
                currentPage = pdfDoc.addPage(STYLING.pageSize);
                yPosition = currentPage.getHeight() - STYLING.margins.top;
              }

              // Draw current line
              currentPage.drawText(itemLine, {
                x: firstLine ? STYLING.margins.left + bulletWidth : STYLING.margins.left + 20,
                y: yPosition,
                size: itemFontSize,
                font: fonts.helveticaFont,
                color: STYLING.fonts.body.color,
              });

              // Move to next line
              yPosition -= itemFontSize * 1.2;
              firstLine = false;
              itemLine = word;
            }
          }

          // Draw remaining text
          if (itemLine) {
            // Check if we need a new page
            if (yPosition < STYLING.margins.bottom + itemFontSize) {
              currentPage = pdfDoc.addPage(STYLING.pageSize);
              yPosition = currentPage.getHeight() - STYLING.margins.top;
            }

            currentPage.drawText(itemLine, {
              x: firstLine ? STYLING.margins.left + bulletWidth : STYLING.margins.left + 20,
              y: yPosition,
              size: itemFontSize,
              font: fonts.helveticaFont,
              color: STYLING.fonts.body.color,
            });

            yPosition -= itemFontSize * 1.2;
          }

          // Add item spacing
          yPosition -= 5;
        }

        // Add list spacing
        yPosition -= STYLING.spacing.paragraph;
        break;

      default:
        // Skip unknown elements
        logger.warn(`Skipping unknown HTML element: ${element.tagName}`);
    }
  }

  return yPosition;
}

/**
 * Render a table block to the PDF
 *
 * @param {Object} tableData - Table data
 * @param {PDFDocument} pdfDoc - The PDF document
 * @param {PDFPage} currentPage - Current PDF page
 * @param {number} yPosition - Current Y position
 * @param {Object} fonts - Font objects
 * @returns {number} - New Y position
 */
async function renderTableBlock(tableData, pdfDoc, currentPage, yPosition, fonts) {
  const { rows, caption } = tableData;

  if (!rows || rows.length === 0) {
    return yPosition;
  }

  // Calculate column widths
  const tableWidth = currentPage.getWidth() - STYLING.margins.left - STYLING.margins.right;
  const numColumns = rows[0].length;
  const colWidth = tableWidth / numColumns;

  // Calculate row height (based on content)
  const rowHeight = STYLING.fonts.body.size * 2;
  const headerRowHeight = rowHeight * 1.2;

  // Check if table fits on current page
  const tableHeight = rows.length * rowHeight + 20; // Add space for caption

  if (yPosition - tableHeight < STYLING.margins.bottom) {
    // Table doesn't fit, add a new page
    currentPage = pdfDoc.addPage(STYLING.pageSize);
    yPosition = currentPage.getHeight() - STYLING.margins.top;
  }

  // Draw header row
  const headerRow = rows[0];
  let x = STYLING.margins.left;

  // Header background
  currentPage.drawRectangle({
    x,
    y: yPosition - headerRowHeight,
    width: tableWidth,
    height: headerRowHeight,
    color: STYLING.tableStyles.headerBackground,
  });

  // Header cells
  for (let col = 0; col < headerRow.length; col++) {
    currentPage.drawText(String(headerRow[col]), {
      x: x + STYLING.tableStyles.cellPadding,
      y: yPosition - headerRowHeight / 2 + STYLING.fonts.body.size / 2,
      size: STYLING.fonts.body.size,
      font: fonts.helveticaBold,
      color: STYLING.fonts.body.color,
    });

    // Draw vertical grid line (except for last column)
    if (col < headerRow.length - 1) {
      currentPage.drawLine({
        start: { x: x + colWidth, y: yPosition },
        end: { x: x + colWidth, y: yPosition - headerRowHeight },
        color: STYLING.tableStyles.borderColor,
        thickness: 1,
      });
    }

    x += colWidth;
  }

  // Draw horizontal line under header
  currentPage.drawLine({
    start: { x: STYLING.margins.left, y: yPosition - headerRowHeight },
    end: { x: STYLING.margins.left + tableWidth, y: yPosition - headerRowHeight },
    color: STYLING.tableStyles.borderColor,
    thickness: 1,
  });

  // Move position down past header
  yPosition -= headerRowHeight;

  // Draw data rows
  for (let row = 1; row < rows.length; row++) {
    // Check if we need a new page
    if (yPosition - rowHeight < STYLING.margins.bottom) {
      currentPage = pdfDoc.addPage(STYLING.pageSize);
      yPosition = currentPage.getHeight() - STYLING.margins.top;
    }

    x = STYLING.margins.left;

    for (let col = 0; col < rows[row].length; col++) {
      currentPage.drawText(String(rows[row][col]), {
        x: x + STYLING.tableStyles.cellPadding,
        y: yPosition - rowHeight / 2 + STYLING.fonts.body.size / 2,
        size: STYLING.fonts.body.size,
        font: fonts.helveticaFont,
        color: STYLING.fonts.body.color,
      });

      // Draw vertical grid line (except for last column)
      if (col < rows[row].length - 1) {
        currentPage.drawLine({
          start: { x: x + colWidth, y: yPosition },
          end: { x: x + colWidth, y: yPosition - rowHeight },
          color: STYLING.tableStyles.borderColor,
          thickness: 1,
        });
      }

      x += colWidth;
    }

    // Draw horizontal line under row
    currentPage.drawLine({
      start: { x: STYLING.margins.left, y: yPosition - rowHeight },
      end: { x: STYLING.margins.left + tableWidth, y: yPosition - rowHeight },
      color: STYLING.tableStyles.borderColor,
      thickness: 1,
    });

    // Move position down past row
    yPosition -= rowHeight;
  }

  // Draw table borders
  currentPage.drawRectangle({
    x: STYLING.margins.left,
    y: yPosition,
    width: tableWidth,
    height: rows.length * rowHeight + headerRowHeight - rowHeight,
    borderColor: STYLING.tableStyles.borderColor,
    borderWidth: 1,
    color: rgb(1, 1, 1, 0), // Transparent fill
  });

  // Draw caption if present
  if (caption) {
    // Check if we need a new page for caption
    if (yPosition - STYLING.fonts.caption.size - 5 < STYLING.margins.bottom) {
      currentPage = pdfDoc.addPage(STYLING.pageSize);
      yPosition = currentPage.getHeight() - STYLING.margins.top;
    }

    yPosition -= STYLING.fonts.caption.size;

    currentPage.drawText(`Table: ${caption}`, {
      x: STYLING.margins.left,
      y: yPosition,
      size: STYLING.fonts.caption.size,
      font: fonts.helveticaOblique,
      color: STYLING.fonts.caption.color,
    });

    yPosition -= 10;
  }

  // Add spacing after table
  yPosition -= STYLING.spacing.table;

  return yPosition;
}

/**
 * Render a figure block to the PDF
 *
 * @param {Object} figureData - Figure data
 * @param {PDFDocument} pdfDoc - The PDF document
 * @param {PDFPage} currentPage - Current PDF page
 * @param {number} yPosition - Current Y position
 * @param {Object} fonts - Font objects
 * @returns {number} - New Y position
 */
async function renderFigureBlock(figureData, pdfDoc, currentPage, yPosition, fonts) {
  const { url, caption, altText } = figureData;

  if (!url) {
    return yPosition;
  }

  try {
    // Estimate image height (we can't know actual dimensions until embedded)
    const estimatedHeight = 200; // Placeholder

    // Check if figure fits on current page
    if (yPosition - estimatedHeight - 30 < STYLING.margins.bottom) {
      // Figure doesn't fit, add a new page
      currentPage = pdfDoc.addPage(STYLING.pageSize);
      yPosition = currentPage.getHeight() - STYLING.margins.top;
    }

    // Determine the image source
    let imageBytes;
    let imgType;

    if (url.startsWith('data:')) {
      // Data URL
      const dataUrlParts = url.split(',');
      const mimeType = dataUrlParts[0].split(':')[1].split(';')[0];
      imageBytes = Buffer.from(dataUrlParts[1], 'base64');
      imgType = mimeType.includes('png') ? 'png' : 'jpg';
    } else if (url.startsWith('http')) {
      // Remote URL
      const response = await fetch(url);
      imageBytes = await response.arrayBuffer();
      imgType = url.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    } else {
      // Assume local file path
      try {
        imageBytes = await fs.readFile(url);
        imgType = url.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
      } catch (fileError) {
        // Try as a storage URL
        const storagePath = url.replace(/^\//, '');
        const { data, error } = await supabase.storage.from('ind-assets').download(storagePath);

        if (error) {
          throw new Error(`Could not load image: ${error.message}`);
        }

        imageBytes = await data.arrayBuffer();
        imgType = url.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
      }
    }

    // Embed the image
    let image;
    if (imgType === 'png') {
      image = await pdfDoc.embedPng(imageBytes);
    } else {
      image = await pdfDoc.embedJpg(imageBytes);
    }

    // Calculate dimensions to fit within page width while maintaining aspect ratio
    const { width: imgWidth, height: imgHeight } = image;
    const pageWidth = currentPage.getWidth() - STYLING.margins.left - STYLING.margins.right;

    let scaledWidth = imgWidth;
    let scaledHeight = imgHeight;

    if (imgWidth > pageWidth) {
      const scale = pageWidth / imgWidth;
      scaledWidth = imgWidth * scale;
      scaledHeight = imgHeight * scale;
    }

    // Check if the image fits on the current page with new dimensions
    if (yPosition - scaledHeight - 30 < STYLING.margins.bottom) {
      // Image doesn't fit, add a new page
      currentPage = pdfDoc.addPage(STYLING.pageSize);
      yPosition = currentPage.getHeight() - STYLING.margins.top;
    }

    // Center the image horizontally
    const xPosition = STYLING.margins.left + (pageWidth - scaledWidth) / 2;

    // Draw the image
    currentPage.drawImage(image, {
      x: xPosition,
      y: yPosition - scaledHeight,
      width: scaledWidth,
      height: scaledHeight,
    });

    // Move the y position past the image
    yPosition -= scaledHeight;

    // Draw caption if present
    if (caption) {
      yPosition -= STYLING.fonts.caption.size + 5;

      // Check if we need a new page for caption
      if (yPosition < STYLING.margins.bottom) {
        currentPage = pdfDoc.addPage(STYLING.pageSize);
        yPosition = currentPage.getHeight() - STYLING.margins.top;
      }

      currentPage.drawText(`Figure: ${caption}`, {
        x: STYLING.margins.left,
        y: yPosition,
        size: STYLING.fonts.caption.size,
        font: fonts.helveticaOblique,
        color: STYLING.fonts.caption.color,
      });

      yPosition -= 10;
    }

    // Add spacing after figure
    yPosition -= STYLING.spacing.figure;

    return yPosition;
  } catch (error) {
    logger.error(`Error rendering figure: ${error.message}`);

    // Draw alt text as fallback
    if (altText) {
      currentPage.drawText(`[Figure: ${altText}]`, {
        x: STYLING.margins.left,
        y: yPosition - 20,
        size: STYLING.fonts.body.size,
        font: fonts.helveticaOblique,
        color: STYLING.fonts.body.color,
      });

      yPosition -= 30;
    }

    return yPosition;
  }
}

/**
 * Generate and save PDF for a submission
 *
 * @param {string} submissionId - ID of the IND submission
 * @returns {Promise<string>} - Path to the saved PDF file
 */
export async function generateAndSavePdf(submissionId) {
  try {
    // Record start time for performance tracking
    const startTime = Date.now();

    // Generate the PDF
    const pdfBuffer = await generateSubmissionPdf(submissionId);

    // Create the directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'generated');
    await fs.mkdir(uploadDir, { recursive: true });

    // Save the PDF to file
    const pdfPath = path.join(uploadDir, `submission_${submissionId}.pdf`);
    await fs.writeFile(pdfPath, pdfBuffer);

    // Log performance
    const endTime = Date.now();
    logger.info(`PDF generated and saved in ${endTime - startTime}ms`);

    // Create rendering record
    const { data, error } = await supabase
      .from('ind_renderings')
      .insert({
        submission_id: submissionId,
        format: 'pdf',
        file_path: pdfPath,
        status: 'completed',
        created_by: 'system',
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      logger.error(`Error recording PDF rendering: ${error.message}`);
    }

    return pdfPath;
  } catch (error) {
    logger.error(`Error generating and saving PDF: ${error.message}`);

    // Record the error
    await supabase.from('ind_renderings').insert({
      submission_id: submissionId,
      format: 'pdf',
      file_path: '',
      status: 'failed',
      error_message: error.message,
      created_by: 'system',
    });

    throw error;
  }
}

export default {
  generateSubmissionPdf,
  generateAndSavePdf,
};
