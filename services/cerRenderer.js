/**
 * CER Renderer Service
 *
 * Efficient PDF generation for Clinical Evaluation Reports using puppeteer-cluster
 * for improved performance and PDFKit for graceful fallback.
 *
 * Features:
 * - Maintains a pool of browser instances for concurrent rendering
 * - Graceful fallback to PDFKit if Puppeteer rendering fails
 * - Resource-efficient with proper browser cleanup
 * - Error tracking and reporting
 */

const { Cluster } = require('puppeteer-cluster');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Track if cluster is initialized
let cluster;
let clusterInitializing = false;
let initPromise;

// Configuration for the cluster
const CLUSTER_CONFIG = {
  concurrency: Cluster.CONCURRENCY_BROWSER,
  maxConcurrency: parseInt(process.env.MAX_BROWSER_INSTANCES) || 2,
  retryLimit: 3,
  timeout: 60000, // 60 second timeout per task
  monitor: true,
  puppeteerOptions: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-extensions',
    ],
    // Set a reasonable default viewport for A4 PDF generation
    defaultViewport: {
      width: 1240,
      height: 1754,
      deviceScaleFactor: 1,
    },
  },
};

/**
 * Initialize the puppeteer cluster if not already initialized
 * @returns {Promise<Cluster>} The initialized cluster
 */
async function initCluster() {
  // If the cluster is already available, return it
  if (cluster) return cluster;

  // If initialization is in progress, wait for it to complete
  if (clusterInitializing) {
    return initPromise;
  }

  // Start initialization
  clusterInitializing = true;
  console.log('[CerRenderer] Initializing puppeteer cluster...');

  initPromise = (async () => {
    try {
      cluster = await Cluster.launch(CLUSTER_CONFIG);

      // Set up error handling
      cluster.on('taskerror', (err, data) => {
        console.error(`[CerRenderer] Task error: ${err.message}`, {
          jobId: data.jobId,
          error: err.stack,
        });
      });

      // Set up graceful shutdown handling
      process.on('SIGTERM', async () => {
        console.log('[CerRenderer] Received SIGTERM, closing cluster gracefully...');
        if (cluster) {
          await cluster.idle();
          await cluster.close();
        }
      });

      console.log(
        `[CerRenderer] Puppeteer cluster initialized with ${CLUSTER_CONFIG.maxConcurrency} workers`
      );
      return cluster;
    } catch (err) {
      console.error('[CerRenderer] Failed to initialize puppeteer cluster:', err);
      clusterInitializing = false;
      throw err;
    }
  })();

  try {
    const result = await initPromise;
    clusterInitializing = false;
    return result;
  } catch (err) {
    clusterInitializing = false;
    throw err;
  }
}

/**
 * Render a PDF using the puppeteer cluster
 * @param {string} htmlContent - HTML content to render
 * @param {string} jobId - Unique job identifier
 * @returns {Promise<string>} - Path to the generated PDF file
 */
async function renderPdfWithCluster(htmlContent, jobId) {
  console.log(`[CerRenderer] Rendering PDF for job ${jobId}`);

  try {
    // Initialize cluster if needed
    const cluster = await initCluster();

    // Set up output path
    const pdfDir = process.env.PDF_OUTPUT_DIR || path.join(os.tmpdir(), 'cer-pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, `cer-job-${jobId}.pdf`);

    // Execute rendering task
    const result = await cluster.execute(
      {
        html: htmlContent,
        jobId,
        outputPath: pdfPath,
      },
      async ({ page, data }) => {
        const { html, outputPath } = data;

        // Set content to the page
        await page.setContent(html, {
          waitUntil: 'networkidle0',
          timeout: 30000,
        });

        // Generate PDF with A4 format
        await page.pdf({
          path: outputPath,
          format: 'A4',
          printBackground: true,
          margin: {
            top: '1cm',
            right: '1cm',
            bottom: '1cm',
            left: '1cm',
          },
          displayHeaderFooter: true,
          headerTemplate:
            '<div style="font-size: 8px; width: 100%; text-align: center; color: #999;">TrialSage™ CER Generator</div>',
          footerTemplate:
            '<div style="font-size: 8px; width: 100%; text-align: center; color: #999;"><span class="pageNumber"></span> of <span class="totalPages"></span></div>',
        });

        return outputPath;
      }
    );

    console.log(`[CerRenderer] PDF successfully rendered to ${result}`);
    return result;
  } catch (err) {
    console.error(`[CerRenderer] Error rendering PDF for job ${jobId}:`, err);
    console.log(`[CerRenderer] Falling back to PDFKit renderer for job ${jobId}`);
    return renderPdfWithPdfKit(htmlContent, jobId);
  }
}

/**
 * Fallback PDF generator using PDFKit
 * @param {string} htmlContent - HTML content to render
 * @param {string} jobId - Unique job identifier
 * @returns {Promise<string>} - Path to the generated PDF file
 */
function renderPdfWithPdfKit(htmlContent, jobId) {
  // Set up output path
  const pdfDir = process.env.PDF_OUTPUT_DIR || path.join(os.tmpdir(), 'cer-pdfs');
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  const pdfPath = path.join(pdfDir, `cer-job-${jobId}-fallback.pdf`);

  return new Promise((resolve, reject) => {
    try {
      console.log(`[CerRenderer] Creating fallback PDF for job ${jobId} using PDFKit`);
      const doc = new PDFDocument({
        size: 'A4',
        info: {
          Title: `Clinical Evaluation Report - Job ${jobId}`,
          Author: 'TrialSage CER Generator',
          Subject: 'Clinical Evaluation Report',
          Creator: 'TrialSage PDF Engine',
        },
      });

      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);

      // Add a header
      doc
        .fontSize(16)
        .text('CLINICAL EVALUATION REPORT', { align: 'center' })
        .fontSize(12)
        .text('TrialSage CER Generator - Fallback Mode', { align: 'center' })
        .text(`Job ID: ${jobId}`, { align: 'center' })
        .moveDown(2);

      // Extract and sanitize text
      const text = htmlContent
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
        .replace(/<[^>]+>/g, '') // Remove remaining HTML tags
        .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
        .replace(/\s+/g, ' ') // Collapse whitespace
        .trim(); // Trim whitespace

      // Split text into sections by looking for likely headings
      const sections = text.split(/\d+\.\s+[A-Z][A-Z\s]+/);

      // Add content
      doc.fontSize(11).text('CONTENT PREVIEW (FALLBACK FORMAT)', { align: 'center' }).moveDown();

      doc.fontSize(10);
      sections.forEach(section => {
        if (section.trim().length > 0) {
          doc.text(section.trim(), {
            align: 'justify',
            lineGap: 5,
          });
          doc.moveDown();
        }
      });

      // Add a footer
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(8)
          .text(
            `Page ${i + 1} of ${pageCount} - This is a fallback rendering due to an error with the primary renderer.`,
            50,
            doc.page.height - 50,
            { align: 'center', width: doc.page.width - 100 }
          );
      }

      // Finalize the document
      doc.end();

      stream.on('finish', () => {
        console.log(`[CerRenderer] Fallback PDF created successfully at ${pdfPath}`);
        resolve(pdfPath);
      });

      stream.on('error', err => {
        console.error('[CerRenderer] Error creating fallback PDF:', err);
        reject(err);
      });
    } catch (err) {
      console.error('[CerRenderer] Critical error in fallback PDF generation:', err);
      reject(err);
    }
  });
}

module.exports = {
  renderPdfWithCluster,
  renderPdfWithPdfKit,
};
