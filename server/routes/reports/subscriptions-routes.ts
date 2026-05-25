import { Request, Response, Router, Express } from 'express';
import fs from 'fs';
import path from 'path';

const REPORTS_ROOT_DIR = 'lumen_reports_backend/static/example_reports';

/**
 * Register subscription routes for the reports
 */
export function registerSubscriptionsRoutes(app: Express) {
  /**
   * Get download link for report file
   */
  app.get('/api/reports/download/:personaId/:filename', (req: Request, res: Response) => {
    try {
      const personaId = String(req.params.personaId);
      const filename = String(req.params.filename);
      const filePath = path.join(REPORTS_ROOT_DIR, personaId, 'files', filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: `Report file ${filename} not found for persona ${personaId}`,
        });
      }

      // Determine content type based on file extension
      const ext = path.extname(filename).toLowerCase();
      let contentType = 'application/octet-stream';

      if (ext === '.pdf') {
        contentType = 'application/pdf';
      } else if (ext === '.docx') {
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (ext === '.xlsx') {
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Stream the file to the response
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error: any) {
      console.error(`Error downloading report file:`, error);
      res.status(500).json({
        success: false,
        message: `Error downloading report file: ${error.message}`,
      });
    }
  });

  /**
   * Get preview image for report
   */
  app.get('/api/reports/preview/:personaId/:imageFile', (req: Request, res: Response) => {
    try {
      const personaId = String(req.params.personaId);
      const imageFile = String(req.params.imageFile);
      const imagePath = path.join(REPORTS_ROOT_DIR, personaId, 'images', imageFile);

      if (!fs.existsSync(imagePath)) {
        return res.status(404).json({
          success: false,
          message: `Preview image ${imageFile} not found for persona ${personaId}`,
        });
      }

      // Determine content type based on file extension
      const ext = path.extname(imageFile).toLowerCase();
      let contentType = 'image/png'; // Default

      if (ext === '.jpg' || ext === '.jpeg') {
        contentType = 'image/jpeg';
      } else if (ext === '.png') {
        contentType = 'image/png';
      } else if (ext === '.svg') {
        contentType = 'image/svg+xml';
      } else if (ext === '.gif') {
        contentType = 'image/gif';
      }

      res.setHeader('Content-Type', contentType);

      // Stream the image to the response
      const imageStream = fs.createReadStream(imagePath);
      imageStream.pipe(res);
    } catch (error: any) {
      console.error(`Error serving preview image:`, error);
      res.status(500).json({
        success: false,
        message: `Error serving preview image: ${error.message}`,
      });
    }
  });

  /**
   * Generate a custom report based on persona template
   */
  app.post('/api/reports/generate/:personaId', async (req: Request, res: Response) => {
    try {
      const { personaId } = req.params;
      const { customization } = req.body;

      // Would normally generate a custom report here based on the persona template
      // For now, we'll just return a success message

      res.json({
        success: true,
        message: `Your custom report has been queued for generation. You will receive an email when it's ready.`,
        reportId: `custom_${personaId}_${Date.now()}`,
        estimatedTime: '3-5 minutes',
      });
    } catch (error: any) {
      console.error(`Error generating custom report:`, error);
      res.status(500).json({
        success: false,
        message: `Error generating custom report: ${error.message}`,
      });
    }
  });

  /**
   * Subscribe to a persona's report bundle
   */
  app.post('/api/reports/subscribe/:personaId', async (req: Request, res: Response) => {
    try {
      const { personaId } = req.params;
      const { email, plan } = req.body;

      if (!email || !plan) {
        return res.status(400).json({
          success: false,
          message: 'Email and plan are required for subscription',
        });
      }

      // Would normally create a subscription here
      // For now, we'll just return a success message

      res.json({
        success: true,
        message: `Thank you for subscribing to the ${personaId} report bundle. You will receive an email with access instructions.`,
        subscriptionId: `sub_${personaId}_${Date.now()}`,
        activationTime: 'immediate',
      });
    } catch (error: any) {
      console.error(`Error subscribing to report bundle:`, error);
      res.status(500).json({
        success: false,
        message: `Error subscribing to report bundle: ${error.message}`,
      });
    }
  });

  /**
   * Create placeholder directories for file and image directories
   */
  const personas = [
    'cxo',
    'planner',
    'biostat',
    'regulatory',
    'med_writer',
    'clin_ops',
    'investor',
    'pi',
    'data_sci',
    'comm',
  ];

  for (const persona of personas) {
    const filesDir = path.join(REPORTS_ROOT_DIR, persona, 'files');
    const imagesDir = path.join(REPORTS_ROOT_DIR, persona, 'images');

    // Create directories if they don't exist
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
    }

    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
  }

  console.log('Report subscription routes registered');
}
