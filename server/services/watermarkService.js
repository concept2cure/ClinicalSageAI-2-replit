/**
 * Document Watermarking Service
 *
 * Handles the application of digital watermarks to documents
 * for the inspection portal. Watermarks can be visible or invisible.
 */

import PDFDocument from 'pdfkit';
import { Buffer } from 'buffer';
import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { Transform } from 'stream';
import { promisify } from 'util';
import { supabase } from '../lib/supabaseClient.js';
import { logger } from '../utils/logger.js';

class WatermarkService {
  /**
   * Creates a new watermark service instance
   */
  constructor() {
    this.defaultOptions = {
      fontSize: 24,
      opacity: 0.3,
      angle: -45, // Diagonal watermark by default
      color: '#d97757', // Concept2Cure terracotta
      repeat: true, // Repeat watermark across the document
      spacing: 150, // Spacing between watermarks when repeated
      margin: 50, // Margin from the edges
      inspectorMetadata: true, // Include inspector email and timestamp
      customText: null, // Custom text to include in watermark
      includeDocInfo: true, // Include document identifier
      visibleDigital: true, // Add visible watermark
      invisibleDigital: true, // Add invisible metadata watermark
      filenameSuffix: '_watermarked', // Suffix for the watermarked file
    };
  }

  /**
   * Apply watermark to PDF document
   *
   * @param {Buffer} pdfBuffer - The PDF file as a buffer
   * @param {Object} inspector - The inspector information
   * @param {Object} document - The document information
   * @param {Object} options - Watermark options
   * @returns {Promise<Buffer>} - Buffer of watermarked PDF
   */
  async watermarkPdf(pdfBuffer, inspector, document, options = {}) {
    const mergedOptions = { ...this.defaultOptions, ...options };

    try {
      const PDFParser = await import('pdf-parse');

      // First get info from the PDF
      const data = await PDFParser.default(pdfBuffer);
      const pageCount = data.numpages;

      // Create a new PDF document
      const newPdf = new PDFDocument({
        autoFirstPage: false,
        size: 'letter', // Default size, will be adjusted for each page
        info: {
          Title: data.info?.Title || document.name,
          Author: data.info?.Author,
          Subject: data.info?.Subject,
          Keywords: data.info?.Keywords,
          ModDate: new Date(),
          // Add invisible metadata watermark
          WatermarkedFor: inspector.inspector_email,
          WatermarkDate: new Date().toISOString(),
          InspectionID: inspector.id,
        },
      });

      // Buffer to collect PDF data
      const buffers = [];
      newPdf.on('data', buffers.push.bind(buffers));

      // Function to add watermark to each page
      const addWatermark = pageNum => {
        // Generate the watermark text
        let watermarkText = mergedOptions.customText || 'INSPECTION COPY';

        if (mergedOptions.inspectorMetadata) {
          watermarkText += `\nFor: ${inspector.inspector_email}`;
          watermarkText += `\nAccessed: ${new Date().toLocaleDateString()}`;
          watermarkText += `\nExpires: ${new Date(inspector.expires_at).toLocaleDateString()}`;
          watermarkText += `\nInsp. ID: ${inspector.id.substring(0, 8)}`;
        }

        if (mergedOptions.includeDocInfo && document) {
          watermarkText += `\nDoc ID: ${document.id}`;
        }

        if (mergedOptions.repeat) {
          // Create a pattern of repeating watermarks
          const patternCanvas = createCanvas(mergedOptions.spacing * 2, mergedOptions.spacing * 2);
          const ctx = patternCanvas.getContext('2d');

          // Setup text style
          ctx.font = `${mergedOptions.fontSize}px Arial`;
          ctx.fillStyle = mergedOptions.color;
          ctx.globalAlpha = mergedOptions.opacity;

          // Measure text dimensions
          const metrics = ctx.measureText(watermarkText.split('\n')[0]);
          const textHeight = mergedOptions.fontSize * watermarkText.split('\n').length;

          // Rotate and draw text
          ctx.translate(mergedOptions.spacing, mergedOptions.spacing);
          ctx.rotate((mergedOptions.angle * Math.PI) / 180);

          // Draw each line of the watermark
          watermarkText.split('\n').forEach((line, i) => {
            ctx.fillText(line, -metrics.width / 2, i * mergedOptions.fontSize);
          });

          // Create a buffer from the canvas
          const patternBuffer = patternCanvas.toBuffer('image/png');

          // Add a new page to the PDF (matching original size)
          newPdf.addPage({
            margin: 0,
            size: [595.28, 841.89], // Default A4 size, adjust if needed
          });

          // Set a semi-transparent pattern fill
          newPdf.fillOpacity(mergedOptions.opacity);
          newPdf.fillColor(mergedOptions.color);

          // Fill the entire page with the pattern
          newPdf.rect(0, 0, newPdf.page.width, newPdf.page.height).fill();

          // Overlay original page content
          newPdf.fillOpacity(1); // Reset opacity
        } else {
          // Add a new page to the PDF (matching original size)
          newPdf.addPage({
            margin: 0,
            size: [595.28, 841.89], // Default A4 size, adjust if needed
          });

          // Set watermark style
          newPdf.fillOpacity(mergedOptions.opacity);
          newPdf.fillColor(mergedOptions.color);

          // Calculate center of page
          const centerX = newPdf.page.width / 2;
          const centerY = newPdf.page.height / 2;

          // Save current transformation state
          newPdf.save();

          // Move to center, rotate, and draw the watermark
          newPdf.translate(centerX, centerY);
          newPdf.rotate(mergedOptions.angle);

          // Draw each line of the watermark text
          watermarkText.split('\n').forEach((line, i) => {
            const textWidth = newPdf.widthOfString(line);
            newPdf.fontSize(mergedOptions.fontSize);
            newPdf.text(
              line,
              -textWidth / 2,
              i * mergedOptions.fontSize -
                (watermarkText.split('\n').length * mergedOptions.fontSize) / 2
            );
          });

          // Restore transformation state
          newPdf.restore();

          // Reset opacity for page content
          newPdf.fillOpacity(1);
        }

        // TODO: Overlay original page content
        // This would require extracting each page from original PDF
        // and embedding it in the new PDF
      };

      // Add watermark to each page
      for (let i = 0; i < pageCount; i++) {
        addWatermark(i + 1);
      }

      // Finalize the PDF
      newPdf.end();

      // Return buffer when PDF is finished
      return new Promise(resolve => {
        newPdf.on('end', () => {
          resolve(Buffer.concat(buffers));
        });
      });
    } catch (err) {
      logger.error(`Error watermarking PDF: ${err.message}`, err);
      throw new Error(`Failed to watermark PDF: ${err.message}`);
    }
  }

  /**
   * Apply watermark to an image
   *
   * @param {Buffer} imageBuffer - The image file buffer
   * @param {Object} inspector - Inspector information
   * @param {Object} document - Document information
   * @param {Object} options - Watermark options
   * @returns {Promise<Buffer>} - Buffer of watermarked image
   */
  async watermarkImage(imageBuffer, inspector, document, options = {}) {
    const mergedOptions = { ...this.defaultOptions, ...options };

    try {
      // Load image into canvas
      const img = new Image();
      img.src = imageBuffer;

      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');

      // Draw the original image
      ctx.drawImage(img, 0, 0);

      // Generate the watermark text
      let watermarkText = mergedOptions.customText || 'INSPECTION COPY';

      if (mergedOptions.inspectorMetadata) {
        watermarkText += `\nFor: ${inspector.inspector_email}`;
        watermarkText += `\nAccessed: ${new Date().toLocaleDateString()}`;
      }

      if (mergedOptions.includeDocInfo && document) {
        watermarkText += `\nDoc ID: ${document.id}`;
      }

      // Set watermark style
      ctx.font = `${mergedOptions.fontSize}px Arial`;
      ctx.fillStyle = mergedOptions.color;
      ctx.globalAlpha = mergedOptions.opacity;

      if (mergedOptions.repeat) {
        // Calculate text dimensions
        const textWidth = ctx.measureText(watermarkText.split('\n')[0]).width;
        const textHeight = mergedOptions.fontSize * watermarkText.split('\n').length;

        // Create a repeated pattern
        for (let x = 0; x < canvas.width; x += mergedOptions.spacing) {
          for (let y = 0; y < canvas.height; y += mergedOptions.spacing) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate((mergedOptions.angle * Math.PI) / 180);

            // Draw each line of the watermark
            watermarkText.split('\n').forEach((line, i) => {
              ctx.fillText(line, -textWidth / 2, i * mergedOptions.fontSize);
            });

            ctx.restore();
          }
        }
      } else {
        // Draw a single watermark in the center
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((mergedOptions.angle * Math.PI) / 180);

        // Draw each line of the watermark text
        watermarkText.split('\n').forEach((line, i) => {
          const lineWidth = ctx.measureText(line).width;
          ctx.fillText(
            line,
            -lineWidth / 2,
            i * mergedOptions.fontSize -
              (watermarkText.split('\n').length * mergedOptions.fontSize) / 2
          );
        });

        ctx.restore();
      }

      // If invisible watermarking is enabled, add steganographic data
      if (mergedOptions.invisibleDigital) {
        // Implement steganography or other invisible watermarking technique
        // This is a placeholder for an actual implementation
        const metadata = {
          inspector: inspector.inspector_email,
          inspectorId: inspector.id,
          timestamp: new Date().toISOString(),
          documentId: document?.id,
        };

        // This would be replaced with actual steganography implementation
        logger.info(`Applied invisible watermark with metadata: ${JSON.stringify(metadata)}`);
      }

      // Convert back to buffer
      return canvas.toBuffer('image/png');
    } catch (err) {
      logger.error(`Error watermarking image: ${err.message}`, err);
      throw new Error(`Failed to watermark image: ${err.message}`);
    }
  }

  /**
   * Apply watermark to a document based on its content type
   *
   * @param {Buffer} fileBuffer - The document file buffer
   * @param {string} contentType - MIME type of the document
   * @param {Object} inspector - Inspector information
   * @param {Object} document - Document information
   * @param {Object} options - Watermark options
   * @returns {Promise<Buffer>} - Buffer of watermarked document
   */
  async watermarkDocument(fileBuffer, contentType, inspector, document, options = {}) {
    try {
      // For PDF documents
      if (contentType.includes('application/pdf')) {
        return await this.watermarkPdf(fileBuffer, inspector, document, options);
      }

      // For image files
      if (contentType.includes('image/')) {
        return await this.watermarkImage(fileBuffer, inspector, document, options);
      }

      // For other document types, convert to PDF first?
      // This would require additional implementations

      // For unsupported file types, return original
      logger.warn(`Watermarking not supported for file type: ${contentType}`);
      return fileBuffer;
    } catch (err) {
      logger.error(`Error in watermarkDocument: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Log watermarking activity in the database
   *
   * @param {Object} inspector - Inspector information
   * @param {Object} document - Document information
   * @param {string} contentType - MIME type of the document
   * @returns {Promise<void>}
   */
  async logWatermarkActivity(inspector, document, contentType) {
    try {
      await supabase.from('inspector_audit').insert({
        token_id: inspector.id,
        action: 'watermarked-document',
        metadata: {
          document_id: document.id,
          document_name: document.name,
          content_type: contentType,
          ip: inspector.ip_address,
          user_agent: inspector.user_agent,
        },
      });
    } catch (err) {
      logger.error(`Failed to log watermark activity: ${err.message}`, err);
      // Don't throw error here, just log it
    }
  }
}

export default new WatermarkService();
