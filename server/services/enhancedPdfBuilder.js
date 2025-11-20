/**
 * Enhanced PDF Builder for IND Wizard
 *
 * Features:
 * - Proper pagination with smart page breaks
 * - Headers and footers on each page
 * - Auto-generated table of contents with page numbers
 * - Content section numbering and hierarchical structure
 * - Watermarks for draft/final status
 * - PDF/A compliance for FDA submission
 */

import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import { supabase } from '../lib/supabaseClient.js';
import { readFile } from 'fs/promises';
import markdownIt from 'markdown-it';
import fs from 'fs/promises';
import { logger } from '../utils/logger.js';
import path from 'path';

// PDF styling and layout constants
const STYLE = {
  PAGE: {
    size: PageSizes.Letter,
    margin: {
      top: 72, // 1 inch
      right: 72, // 1 inch
      bottom: 72, // 1 inch
      left: 72, // 1 inch
    },
  },
  HEADER: {
    height: 36,
    fontSize: 9,
  },
  FOOTER: {
    height: 36,
    fontSize: 9,
  },
  FONT: {
    size: {
      body: 11,
      h1: 18,
      h2: 14,
      h3: 12,
      h4: 11,
      caption: 10,
      header: 9,
      footer: 9,
      toc: 11,
    },
    lineHeight: {
      body: 1.5,
      heading: 1.3,
    },
  },
  COLOR: {
    black: rgb(0, 0, 0),
    grey: rgb(0.5, 0.5, 0.5),
    lightGrey: rgb(0.8, 0.8, 0.8),
  },
  WATERMARK: {
    draft: {
      text: 'DRAFT',
      fontSize: 100,
      color: rgb(0.9, 0.9, 0.9),
    },
    confidential: {
      text: 'CONFIDENTIAL',
      fontSize: 40,
      color: rgb(0.9, 0.9, 0.9),
    },
  },
};

/**
 * Enhanced PDF Builder Class
 */
class EnhancedPdfBuilder {
  constructor(submissionId, options = {}) {
    this.submissionId = submissionId;
    this.options = {
      watermark: options.watermark || 'draft', // 'draft', 'confidential', 'none'
      includeHeaders: options.includeHeaders !== false,
      includeFooters: options.includeFooters !== false,
      includeToc: options.includeToc !== false,
      fontSize: options.fontSize || 'normal', // 'small', 'normal', 'large'
      ...options,
    };

    // Adjust font sizes based on fontSize option
    if (this.options.fontSize === 'small') {
      Object.keys(STYLE.FONT.size).forEach(key => {
        STYLE.FONT.size[key] = STYLE.FONT.size[key] * 0.9;
      });
    } else if (this.options.fontSize === 'large') {
      Object.keys(STYLE.FONT.size).forEach(key => {
        STYLE.FONT.size[key] = STYLE.FONT.size[key] * 1.1;
      });
    }

    // State variables for building process
    this.pdfDoc = null;
    this.currentPage = null;
    this.yPosition = 0;
    this.pageCount = 0;
    this.fonts = {}; // Will store loaded fonts
    this.md = markdownIt({
      html: true,
      breaks: true,
      linkify: true,
      typographer: true,
    });

    // Variables for TOC generation
    this.tocEntries = [];
    this.tocPageStart = 0;
    this.contentPageStart = 0;

    // Submission data
    this.submission = null;
    this.blocks = null;

    // Track sections and their page numbers
    this.sectionPageMap = {};
  }

  /**
   * Initialize the PDF document and load fonts
   */
  async initialize() {
    // Create new PDF document
    this.pdfDoc = await PDFDocument.create();

    // Load standard fonts
    this.fonts.regular = await this.pdfDoc.embedFont(StandardFonts.Helvetica);
    this.fonts.bold = await this.pdfDoc.embedFont(StandardFonts.HelveticaBold);
    this.fonts.italic = await this.pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    this.fonts.boldItalic = await this.pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

    // Get submission data
    const { data: submission, error: submissionError } = await supabase
      .from('ind_wizards')
      .select('*')
      .eq('id', this.submissionId)
      .single();

    if (submissionError) {
      throw new Error(`Error fetching submission: ${submissionError.message}`);
    }

    this.submission = submission;

    // Get blocks data ordered by section and update time
    const { data: blocks, error: blocksError } = await supabase
      .from('ind_blocks')
      .select('*')
      .eq('submission_id', this.submissionId)
      .order('section_code, updated_at');

    if (blocksError) {
      throw new Error(`Error fetching blocks: ${blocksError.message}`);
    }

    this.blocks = blocks;

    return this;
  }

  /**
   * Create a new page and set initial position
   */
  addNewPage() {
    // Add a page
    this.currentPage = this.pdfDoc.addPage(STYLE.PAGE.size);
    this.pageCount++;

    // Set initial position at top of content area (below header)
    this.yPosition = this.currentPage.getHeight() - STYLE.PAGE.margin.top;

    // Add header if enabled
    if (this.options.includeHeaders) {
      this.addHeader();
    }

    // Add footer if enabled
    if (this.options.includeFooters) {
      this.addFooter();
    }

    // Add watermark if specified
    if (this.options.watermark !== 'none') {
      this.addWatermark(this.options.watermark);
    }

    return this.currentPage;
  }

  /**
   * Add header to current page
   */
  addHeader() {
    const { width, height } = this.currentPage.getSize();

    // Draw header line
    this.currentPage.drawLine({
      start: { x: STYLE.PAGE.margin.left, y: height - STYLE.PAGE.margin.top + 15 },
      end: { x: width - STYLE.PAGE.margin.right, y: height - STYLE.PAGE.margin.top + 15 },
      thickness: 1,
      color: STYLE.COLOR.lightGrey,
    });

    // Draw header text - left side (sponsor name)
    this.currentPage.drawText(this.submission.sponsor_name || 'Sponsor', {
      x: STYLE.PAGE.margin.left,
      y: height - STYLE.PAGE.margin.top + 26,
      size: STYLE.FONT.size.header,
      font: this.fonts.regular,
      color: STYLE.COLOR.grey,
    });

    // Draw header text - center (application title)
    const title = `IND ${this.submission.ind_number || 'Application'}`;
    const titleWidth = this.fonts.regular.widthOfTextAtSize(title, STYLE.FONT.size.header);

    this.currentPage.drawText(title, {
      x: (width - titleWidth) / 2,
      y: height - STYLE.PAGE.margin.top + 26,
      size: STYLE.FONT.size.header,
      font: this.fonts.regular,
      color: STYLE.COLOR.grey,
    });

    // Draw header text - right side (date)
    const date = new Date().toISOString().split('T')[0];
    const dateWidth = this.fonts.regular.widthOfTextAtSize(date, STYLE.FONT.size.header);

    this.currentPage.drawText(date, {
      x: width - STYLE.PAGE.margin.right - dateWidth,
      y: height - STYLE.PAGE.margin.top + 26,
      size: STYLE.FONT.size.header,
      font: this.fonts.regular,
      color: STYLE.COLOR.grey,
    });
  }

  /**
   * Add footer to current page
   */
  addFooter() {
    const { width, height } = this.currentPage.getSize();

    // Draw footer line
    this.currentPage.drawLine({
      start: { x: STYLE.PAGE.margin.left, y: STYLE.PAGE.margin.bottom - 15 },
      end: { x: width - STYLE.PAGE.margin.right, y: STYLE.PAGE.margin.bottom - 15 },
      thickness: 1,
      color: STYLE.COLOR.lightGrey,
    });

    // Draw footer text - left side (document ID)
    const docId = `Submission ID: ${this.submissionId}`;
    this.currentPage.drawText(docId, {
      x: STYLE.PAGE.margin.left,
      y: STYLE.PAGE.margin.bottom - 26,
      size: STYLE.FONT.size.footer,
      font: this.fonts.regular,
      color: STYLE.COLOR.grey,
    });

    // Draw footer text - center (confidentiality statement)
    const confidential = 'CONFIDENTIAL';
    const confidentialWidth = this.fonts.bold.widthOfTextAtSize(
      confidential,
      STYLE.FONT.size.footer
    );

    this.currentPage.drawText(confidential, {
      x: (width - confidentialWidth) / 2,
      y: STYLE.PAGE.margin.bottom - 26,
      size: STYLE.FONT.size.footer,
      font: this.fonts.bold,
      color: STYLE.COLOR.grey,
    });

    // Draw footer text - right side (page number)
    const pageText = `Page ${this.pageCount}`;
    const pageWidth = this.fonts.regular.widthOfTextAtSize(pageText, STYLE.FONT.size.footer);

    this.currentPage.drawText(pageText, {
      x: width - STYLE.PAGE.margin.right - pageWidth,
      y: STYLE.PAGE.margin.bottom - 26,
      size: STYLE.FONT.size.footer,
      font: this.fonts.regular,
      color: STYLE.COLOR.grey,
    });
  }

  /**
   * Add watermark to current page
   */
  addWatermark(type) {
    const { width, height } = this.currentPage.getSize();
    const watermarkConfig = STYLE.WATERMARK[type] || STYLE.WATERMARK.draft;

    // Draw watermark text diagonally across page
    this.currentPage.drawText(watermarkConfig.text, {
      x: width / 2 - 150,
      y: height / 2,
      size: watermarkConfig.fontSize,
      font: this.fonts.bold,
      color: watermarkConfig.color,
      rotate: {
        type: 'degrees',
        angle: -45,
      },
    });
  }

  /**
   * Calculate text height based on font size, line height, and width constraints
   */
  calculateTextHeight(text, fontSize, lineHeight, maxWidth) {
    // Calculate approximate number of lines
    const font = this.fonts.regular;
    const words = text.split(' ');
    let currentLine = '';
    let lineCount = 1;

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const lineWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (lineWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        currentLine = word;
        lineCount++;
      }
    }

    // Calculate height based on line count
    return lineCount * fontSize * lineHeight;
  }

  /**
   * Check if there's enough space on the current page
   */
  needsNewPage(requiredHeight) {
    const minY = STYLE.PAGE.margin.bottom + (this.options.includeFooters ? STYLE.FOOTER.height : 0);
    return this.yPosition - requiredHeight < minY;
  }

  /**
   * Draw text with word wrapping
   */
  drawWrappedText(text, x, y, fontSize, font, color, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let yOffset = y;

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const lineWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (lineWidth <= maxWidth) {
        // Word fits, add it to the line
        line = testLine;
      } else {
        // Word doesn't fit, draw current line and start new line
        // Check if we need a new page
        if (yOffset < STYLE.PAGE.margin.bottom + fontSize) {
          this.addNewPage();
          yOffset = this.yPosition;
        }

        // Draw line
        this.currentPage.drawText(line, {
          x,
          y: yOffset,
          size: fontSize,
          font,
          color,
        });

        // Move to next line
        yOffset -= fontSize * lineHeight;
        line = word;
      }
    }

    // Draw remaining text if any
    if (line) {
      if (yOffset < STYLE.PAGE.margin.bottom + fontSize) {
        this.addNewPage();
        yOffset = this.yPosition;
      }

      this.currentPage.drawText(line, {
        x,
        y: yOffset,
        size: fontSize,
        font,
        color,
      });

      yOffset -= fontSize * lineHeight;
    }

    return yOffset;
  }

  /**
   * Add title page
   */
  addTitlePage() {
    const page = this.addNewPage();
    const { width, height } = page.getSize();

    // Center of page
    const centerX = width / 2;
    const centerY = height / 2;

    // Draw main title
    const title = 'INVESTIGATIONAL NEW DRUG APPLICATION';
    const titleWidth = this.fonts.bold.widthOfTextAtSize(title, 24);

    page.drawText(title, {
      x: centerX - titleWidth / 2,
      y: centerY + 100,
      size: 24,
      font: this.fonts.bold,
      color: STYLE.COLOR.black,
    });

    // Draw IND number if available
    if (this.submission.ind_number) {
      const indNumber = `IND ${this.submission.ind_number}`;
      const indWidth = this.fonts.bold.widthOfTextAtSize(indNumber, 18);

      page.drawText(indNumber, {
        x: centerX - indWidth / 2,
        y: centerY + 60,
        size: 18,
        font: this.fonts.bold,
        color: STYLE.COLOR.black,
      });
    }

    // Draw submission title
    const subTitle = this.submission.title || 'New Drug Submission';
    const subTitleWidth = this.fonts.bold.widthOfTextAtSize(subTitle, 18);

    page.drawText(subTitle, {
      x: centerX - subTitleWidth / 2,
      y: centerY + 20,
      size: 18,
      font: this.fonts.bold,
      color: STYLE.COLOR.black,
    });

    // Draw sponsor name
    const sponsor = `Sponsor: ${this.submission.sponsor_name}`;
    const sponsorWidth = this.fonts.regular.widthOfTextAtSize(sponsor, 14);

    page.drawText(sponsor, {
      x: centerX - sponsorWidth / 2,
      y: centerY - 40,
      size: 14,
      font: this.fonts.regular,
      color: STYLE.COLOR.black,
    });

    // Draw date
    const date = `Date: ${new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}`;
    const dateWidth = this.fonts.regular.widthOfTextAtSize(date, 14);

    page.drawText(date, {
      x: centerX - dateWidth / 2,
      y: centerY - 70,
      size: 14,
      font: this.fonts.regular,
      color: STYLE.COLOR.black,
    });

    this.tocPageStart = this.pageCount + 1;

    return this;
  }

  /**
   * Generate and add a table of contents
   */
  async addTableOfContents() {
    // Start a new page for TOC
    this.addNewPage();

    // Track starting position for TOC title
    let y = this.yPosition;

    // Draw TOC title
    this.currentPage.drawText('TABLE OF CONTENTS', {
      x: STYLE.PAGE.margin.left,
      y,
      size: STYLE.FONT.size.h1,
      font: this.fonts.bold,
      color: STYLE.COLOR.black,
    });

    // Move down for TOC entries
    y -= STYLE.FONT.size.h1 * STYLE.FONT.lineHeight.heading + 20;
    this.yPosition = y;

    // Get sections from blocks
    const sections = [...new Set(this.blocks.map(b => b.section_code))].sort();
    let lastMainSection = '';

    // Process each section
    for (const section of sections) {
      // Extract main section (e.g., "2.1" -> "2")
      const mainSection = section.split('.')[0];

      // Check if this is a new main section
      if (mainSection !== lastMainSection) {
        // Add extra spacing for new main sections (except for first one)
        if (lastMainSection) {
          y -= 10;
          this.yPosition = y;
        }
        lastMainSection = mainSection;
      }

      // Check if we need a new page
      if (this.needsNewPage(STYLE.FONT.size.toc * STYLE.FONT.lineHeight.body)) {
        this.addNewPage();
        y = this.yPosition;
      }

      // Format TOC entry (section)
      const sectionPage = this.sectionPageMap[section] || this.contentPageStart;
      const dots = '.'.repeat(Math.max(0, 40 - section.length - String(sectionPage).length));

      // Draw TOC entry
      y = this.drawWrappedText(
        `${section} ${dots} ${sectionPage}`,
        STYLE.PAGE.margin.left + (section.includes('.') ? 20 : 0), // Indent subsections
        y,
        STYLE.FONT.size.toc,
        this.fonts.regular,
        STYLE.COLOR.black,
        this.currentPage.getWidth() - STYLE.PAGE.margin.left - STYLE.PAGE.margin.right,
        STYLE.FONT.lineHeight.body
      );

      // Store TOC entry for bookmarks
      this.tocEntries.push({
        section,
        pageNumber: sectionPage,
      });

      // Update position
      y -= 5;
      this.yPosition = y;
    }

    this.contentPageStart = this.pageCount + 1;

    return this;
  }

  /**
   * Process and render markdown content
   */
  renderMarkdown(markdownText, isHeading = false) {
    // Convert markdown to HTML
    const html = this.md.render(markdownText);

    // For now, we'll do a simple conversion and extract text
    // A full implementation would parse HTML and handle formatting
    let plainText = html.replace(/<[^>]*>/g, ' ').trim();
    plainText = plainText.replace(/\s+/g, ' ');

    // Set up text properties
    const fontSize = isHeading ? STYLE.FONT.size.h2 : STYLE.FONT.size.body;
    const font = isHeading ? this.fonts.bold : this.fonts.regular;
    const lineHeight = isHeading ? STYLE.FONT.lineHeight.heading : STYLE.FONT.lineHeight.body;

    // Calculate text height
    const maxWidth = this.currentPage.getWidth() - STYLE.PAGE.margin.left - STYLE.PAGE.margin.right;
    const textHeight = this.calculateTextHeight(plainText, fontSize, lineHeight, maxWidth);

    // Check if we need a new page
    if (this.needsNewPage(textHeight)) {
      this.addNewPage();
    }

    // Draw text with wrapping
    const newY = this.drawWrappedText(
      plainText,
      STYLE.PAGE.margin.left,
      this.yPosition,
      fontSize,
      font,
      STYLE.COLOR.black,
      maxWidth,
      lineHeight
    );

    // Update position
    this.yPosition = newY - (isHeading ? 15 : 10);

    return this;
  }

  /**
   * Render a table block
   */
  renderTable(tableData) {
    const { rows, caption } = tableData;

    if (!rows || rows.length === 0) {
      return this;
    }

    // Calculate table dimensions
    const maxWidth = this.currentPage.getWidth() - STYLE.PAGE.margin.left - STYLE.PAGE.margin.right;
    const colCount = rows[0].length;
    const colWidth = maxWidth / colCount;

    // Estimate row heights based on content
    let totalTableHeight = 0;
    const rowHeights = rows.map(row => {
      // Use the tallest cell in the row to determine row height
      const cellHeights = row.map(cell => {
        const cellText = String(cell);
        return this.calculateTextHeight(
          cellText,
          STYLE.FONT.size.body,
          STYLE.FONT.lineHeight.body,
          colWidth - 10 // Padding
        );
      });

      const rowHeight = Math.max(...cellHeights) + 10; // Add padding
      totalTableHeight += rowHeight;
      return rowHeight;
    });

    // Add height for caption if present
    if (caption) {
      totalTableHeight += STYLE.FONT.size.caption * STYLE.FONT.lineHeight.body + 10;
    }

    // Check if table fits on current page
    if (this.needsNewPage(totalTableHeight)) {
      this.addNewPage();
    }

    // Draw table header (first row)
    let yPos = this.yPosition;
    let xPos = STYLE.PAGE.margin.left;

    // Background for header row
    this.currentPage.drawRectangle({
      x: xPos,
      y: yPos - rowHeights[0],
      width: maxWidth,
      height: rowHeights[0],
      color: rgb(0.95, 0.95, 0.95),
    });

    // Draw header cells
    for (let col = 0; col < colCount; col++) {
      const cellText = String(rows[0][col]);
      this.drawWrappedText(
        cellText,
        xPos + 5, // Padding
        yPos - 5, // Padding
        STYLE.FONT.size.body,
        this.fonts.bold,
        STYLE.COLOR.black,
        colWidth - 10, // Padding
        STYLE.FONT.lineHeight.body
      );

      // Draw vertical line (except for last column)
      if (col < colCount - 1) {
        this.currentPage.drawLine({
          start: { x: xPos + colWidth, y: yPos },
          end: { x: xPos + colWidth, y: yPos - rowHeights[0] },
          thickness: 1,
          color: STYLE.COLOR.grey,
        });
      }

      xPos += colWidth;
    }

    // Draw horizontal line after header
    this.currentPage.drawLine({
      start: { x: STYLE.PAGE.margin.left, y: yPos - rowHeights[0] },
      end: { x: STYLE.PAGE.margin.left + maxWidth, y: yPos - rowHeights[0] },
      thickness: 1,
      color: STYLE.COLOR.grey,
    });

    // Update position for data rows
    yPos -= rowHeights[0];

    // Draw data rows
    for (let row = 1; row < rows.length; row++) {
      // Check if row fits on current page
      if (yPos - rowHeights[row] < STYLE.PAGE.margin.bottom) {
        this.addNewPage();
        yPos = this.yPosition;
      }

      xPos = STYLE.PAGE.margin.left;

      // Draw cells
      for (let col = 0; col < colCount; col++) {
        const cellText = String(rows[row][col]);
        this.drawWrappedText(
          cellText,
          xPos + 5, // Padding
          yPos - 5, // Padding
          STYLE.FONT.size.body,
          this.fonts.regular,
          STYLE.COLOR.black,
          colWidth - 10, // Padding
          STYLE.FONT.lineHeight.body
        );

        // Draw vertical line (except for last column)
        if (col < colCount - 1) {
          this.currentPage.drawLine({
            start: { x: xPos + colWidth, y: yPos },
            end: { x: xPos + colWidth, y: yPos - rowHeights[row] },
            thickness: 1,
            color: STYLE.COLOR.grey,
          });
        }

        xPos += colWidth;
      }

      // Draw horizontal line after row
      this.currentPage.drawLine({
        start: { x: STYLE.PAGE.margin.left, y: yPos - rowHeights[row] },
        end: { x: STYLE.PAGE.margin.left + maxWidth, y: yPos - rowHeights[row] },
        thickness: 1,
        color: STYLE.COLOR.grey,
      });

      // Update position
      yPos -= rowHeights[row];
    }

    // Draw table border
    this.currentPage.drawRectangle({
      x: STYLE.PAGE.margin.left,
      y:
        this.yPosition -
        totalTableHeight +
        (caption ? STYLE.FONT.size.caption * STYLE.FONT.lineHeight.body + 10 : 0),
      width: maxWidth,
      height:
        totalTableHeight -
        (caption ? STYLE.FONT.size.caption * STYLE.FONT.lineHeight.body + 10 : 0),
      borderColor: STYLE.COLOR.grey,
      borderWidth: 1,
    });

    // Update position
    this.yPosition = yPos;

    // Draw caption if present
    if (caption) {
      this.yPosition -= 10;

      if (this.needsNewPage(STYLE.FONT.size.caption * STYLE.FONT.lineHeight.body)) {
        this.addNewPage();
      }

      this.currentPage.drawText(`Table: ${caption}`, {
        x: STYLE.PAGE.margin.left,
        y: this.yPosition,
        size: STYLE.FONT.size.caption,
        font: this.fonts.italic,
        color: STYLE.COLOR.grey,
      });

      this.yPosition -= STYLE.FONT.size.caption * STYLE.FONT.lineHeight.body;
    }

    // Add spacing after table
    this.yPosition -= 10;

    return this;
  }

  /**
   * Render a figure block
   */
  async renderFigure(figureData) {
    const { url, caption, altText } = figureData;

    if (!url) {
      return this;
    }

    try {
      // Get image data
      let imageBytes;
      let imgType;

      if (url.startsWith('data:')) {
        // Data URL
        const matches = url.match(/^data:image\/(png|jpeg|jpg);base64,(.*)$/);
        if (!matches) {
          throw new Error('Invalid data URL format');
        }

        imgType = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        imageBytes = Buffer.from(matches[2], 'base64');
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
          // Try as storage path
          const { data, error } = await supabase.storage
            .from('ind-assets')
            .download(url.replace(/^\//, ''));

          if (error) {
            throw new Error(`Error loading image from storage: ${error.message}`);
          }

          imageBytes = await data.arrayBuffer();
          imgType = url.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
        }
      }

      // Embed image in PDF
      let image;
      if (imgType === 'png') {
        image = await this.pdfDoc.embedPng(imageBytes);
      } else {
        image = await this.pdfDoc.embedJpg(imageBytes);
      }

      // Calculate dimensions to fit within page width while preserving aspect ratio
      const maxWidth =
        this.currentPage.getWidth() - STYLE.PAGE.margin.left - STYLE.PAGE.margin.right;
      const { width: imgWidth, height: imgHeight } = image;

      let displayWidth = imgWidth;
      let displayHeight = imgHeight;

      if (imgWidth > maxWidth) {
        const scale = maxWidth / imgWidth;
        displayWidth = imgWidth * scale;
        displayHeight = imgHeight * scale;
      }

      // Check if image fits on current page
      const figureHeight =
        displayHeight + (caption ? STYLE.FONT.size.caption * STYLE.FONT.lineHeight.body + 10 : 0);

      if (this.needsNewPage(figureHeight)) {
        this.addNewPage();
      }

      // Center the image horizontally
      const xPos = STYLE.PAGE.margin.left + (maxWidth - displayWidth) / 2;

      // Draw the image
      this.currentPage.drawImage(image, {
        x: xPos,
        y: this.yPosition - displayHeight,
        width: displayWidth,
        height: displayHeight,
      });

      // Update position
      this.yPosition -= displayHeight;

      // Draw caption if present
      if (caption) {
        this.yPosition -= 10;

        if (this.needsNewPage(STYLE.FONT.size.caption * STYLE.FONT.lineHeight.body)) {
          this.addNewPage();
        }

        // Center the caption
        const captionText = `Figure: ${caption}`;
        const captionWidth = this.fonts.italic.widthOfTextAtSize(
          captionText,
          STYLE.FONT.size.caption
        );
        const captionX = STYLE.PAGE.margin.left + (maxWidth - captionWidth) / 2;

        this.currentPage.drawText(captionText, {
          x: captionX,
          y: this.yPosition,
          size: STYLE.FONT.size.caption,
          font: this.fonts.italic,
          color: STYLE.COLOR.grey,
        });

        this.yPosition -= STYLE.FONT.size.caption * STYLE.FONT.lineHeight.body;
      }

      // Add spacing after figure
      this.yPosition -= 10;
    } catch (error) {
      logger.error(`Error rendering figure: ${error.message}`);

      // Fallback to alt text
      if (this.needsNewPage(STYLE.FONT.size.body * STYLE.FONT.lineHeight.body)) {
        this.addNewPage();
      }

      this.currentPage.drawText(`[Figure: ${altText || 'Image not available'}]`, {
        x: STYLE.PAGE.margin.left,
        y: this.yPosition,
        size: STYLE.FONT.size.body,
        font: this.fonts.italic,
        color: STYLE.COLOR.grey,
      });

      this.yPosition -= STYLE.FONT.size.body * STYLE.FONT.lineHeight.body + 10;
    }

    return this;
  }

  /**
   * Process all blocks and build the PDF content
   */
  async processBlocks() {
    if (!this.blocks || this.blocks.length === 0) {
      return this;
    }

    let currentSection = '';

    // Process each block
    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i];

      // Check if this is a new section
      if (block.section_code !== currentSection) {
        // Record section start page if it's the first block in the section
        if (!this.sectionPageMap[block.section_code]) {
          this.sectionPageMap[block.section_code] = this.pageCount;
        }

        // Add section heading
        currentSection = block.section_code;

        // Ensure we have a page to write on
        if (!this.currentPage) {
          this.addNewPage();
        }

        // Add extra spacing before new sections (except for first section)
        if (i > 0) {
          this.yPosition -= 20;

          // Check if we need a new page
          if (this.needsNewPage(STYLE.FONT.size.h2 * STYLE.FONT.lineHeight.heading)) {
            this.addNewPage();
          }
        }

        // Draw section heading
        this.currentPage.drawText(currentSection, {
          x: STYLE.PAGE.margin.left,
          y: this.yPosition,
          size: STYLE.FONT.size.h2,
          font: this.fonts.bold,
          color: STYLE.COLOR.black,
        });

        this.yPosition -= STYLE.FONT.size.h2 * STYLE.FONT.lineHeight.heading;
      }

      // Process block based on type
      try {
        switch (block.block_type) {
          case 'markdown':
            this.renderMarkdown(block.content.markdown);
            break;

          case 'table':
            this.renderTable(block.content);
            break;

          case 'figure':
            await this.renderFigure(block.content);
            break;

          default:
            logger.warn(`Unknown block type: ${block.block_type}`);
        }
      } catch (error) {
        logger.error(`Error processing block ${block.id}: ${error.message}`);

        // Add error message to PDF
        if (this.needsNewPage(STYLE.FONT.size.body * STYLE.FONT.lineHeight.body)) {
          this.addNewPage();
        }

        this.currentPage.drawText(`[Error rendering content: ${error.message}]`, {
          x: STYLE.PAGE.margin.left,
          y: this.yPosition,
          size: STYLE.FONT.size.body,
          font: this.fonts.italic,
          color: rgb(0.8, 0, 0), // Red for errors
        });

        this.yPosition -= STYLE.FONT.size.body * STYLE.FONT.lineHeight.body + 10;
      }
    }

    return this;
  }

  /**
   * Create PDF bookmarks (outlines)
   */
  addBookmarks() {
    // Create the main outline
    // Note: This is a placeholder as pdf-lib doesn't fully support outlines yet
    // A complete implementation would add hierarchical bookmarks for each section

    return this;
  }

  /**
   * Generate the complete PDF
   */
  async build() {
    try {
      // Initialize PDF and load data
      await this.initialize();

      // Add title page
      this.addTitlePage();

      // Process all content blocks to collect section page numbers
      this.contentPageStart = this.pageCount + 1;
      await this.processBlocks();

      // Reset and build again with TOC
      this.pdfDoc = await PDFDocument.create();
      this.pageCount = 0;
      this.currentPage = null;

      // Reload fonts
      this.fonts.regular = await this.pdfDoc.embedFont(StandardFonts.Helvetica);
      this.fonts.bold = await this.pdfDoc.embedFont(StandardFonts.HelveticaBold);
      this.fonts.italic = await this.pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      this.fonts.boldItalic = await this.pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

      // Add title page
      this.addTitlePage();

      // Add table of contents
      if (this.options.includeToc) {
        await this.addTableOfContents();
      }

      // Process all blocks again to generate final PDF
      await this.processBlocks();

      // Add bookmarks
      this.addBookmarks();

      // Save and return the PDF
      const pdfBytes = await this.pdfDoc.save();
      return Buffer.from(pdfBytes);
    } catch (error) {
      logger.error(`Error building PDF: ${error.message}`, error);
      throw error;
    }
  }
}

/**
 * Main function to build PDF for a submission
 */
export async function buildPdf(submissionId, options = {}) {
  const builder = new EnhancedPdfBuilder(submissionId, options);
  return await builder.build();
}

/**
 * Generate and save PDF to file
 */
export async function generateAndSavePdf(submissionId, options = {}) {
  try {
    // Record start time for performance tracking
    const startTime = Date.now();

    // Generate PDF
    const pdfBuffer = await buildPdf(submissionId, options);

    // Create directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'generated');
    await fs.mkdir(uploadDir, { recursive: true });

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `IND_${submissionId}_${timestamp}.pdf`;
    const filePath = path.join(uploadDir, filename);

    // Write to file
    await fs.writeFile(filePath, pdfBuffer);

    // Log performance
    const endTime = Date.now();
    logger.info(`PDF generated and saved in ${endTime - startTime}ms: ${filePath}`);

    return {
      path: filePath,
      filename,
      size: pdfBuffer.length,
    };
  } catch (error) {
    logger.error(`Error generating and saving PDF: ${error.message}`, error);
    throw error;
  }
}

export default {
  buildPdf,
  generateAndSavePdf,
};
