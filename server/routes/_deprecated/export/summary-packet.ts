import { Request, Response, Router } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

const router = Router();

// Ensure the static directory exists
const STATIC_DIR = path.join(process.cwd(), 'client', 'public', 'static');
fs.mkdirSync(STATIC_DIR, { recursive: true });

// Create archive directory for session-based packet history
const ARCHIVE_PATH = path.join(process.cwd(), 'data', 'summary_packet_history.json');
const ARCHIVE_DIR = path.dirname(ARCHIVE_PATH);
fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

// Validation schema for summary packet request
const PacketRequestSchema = z.object({
  protocol: z.string(),
  ind25: z.string(),
  ind27: z.string(),
  sap: z.string(),
  risks: z.array(z.string()),
  success_probability: z.number(),
  sample_size: z.number(),
  session_id: z.string(),
});

type PacketRequest = z.infer<typeof PacketRequestSchema>;

// POST endpoint for generating a summary packet
router.post('/summary-packet', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const requestData = PacketRequestSchema.parse(req.body);

    // Generate filename for the PDF
    const filename = `summary_packet_${requestData.session_id}.pdf`;
    const fullPath = path.join(STATIC_DIR, filename);

    // Create PDF document
    const pdf = new PDFDocument();
    const writeStream = fs.createWriteStream(fullPath);
    pdf.pipe(writeStream);

    // Add content to the PDF
    pdf
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(`Study Packet (${requestData.session_id})`, { align: 'center' })
      .moveDown();

    pdf
      .font('Helvetica')
      .fontSize(11)
      .text(`Success Probability: ${requestData.success_probability}%`)
      .text(`Sample Size Estimate: ${requestData.sample_size} participants`)
      .moveDown();

    // IND Module 2.5
    pdf
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('IND Module 2.5', { underline: true })
      .moveDown(0.5);
    pdf.font('Helvetica').fontSize(11).text(requestData.ind25).moveDown();

    // IND Module 2.7
    pdf
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('IND Module 2.7', { underline: true })
      .moveDown(0.5);
    pdf.font('Helvetica').fontSize(11).text(requestData.ind27).moveDown();

    // SAP Draft
    pdf.font('Helvetica-Bold').fontSize(12).text('SAP Draft', { underline: true }).moveDown(0.5);
    pdf.font('Helvetica').fontSize(11).text(requestData.sap).moveDown();

    // Key Risk Flags
    pdf
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Key Risk Flags', { underline: true })
      .moveDown(0.5);
    pdf.font('Helvetica').fontSize(11);

    requestData.risks.forEach(risk => {
      pdf.text(`• ${risk}`);
    });

    // Protocol Content Summary
    pdf.addPage();
    pdf
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Protocol Content', { underline: true })
      .moveDown(0.5);
    pdf
      .font('Helvetica')
      .fontSize(11)
      .text(requestData.protocol.substring(0, Math.min(1000, requestData.protocol.length)));

    if (requestData.protocol.length > 1000) {
      pdf.text('...(content truncated for brevity)...');
    }

    // Finalize the PDF
    pdf.end();

    // Wait for PDF to finish writing
    writeStream.on('finish', async () => {
      // Save archive entry
      const archiveEntry = {
        session_id: requestData.session_id,
        filename,
        success_probability: requestData.success_probability,
        sample_size: requestData.sample_size,
        risks: requestData.risks,
        created_at: new Date().toISOString(),
      };

      try {
        let db: Record<string, any[]> = {};

        if (fs.existsSync(ARCHIVE_PATH)) {
          const fileContent = fs.readFileSync(ARCHIVE_PATH, 'utf-8');
          db = JSON.parse(fileContent);
        }

        if (!db[requestData.session_id]) {
          db[requestData.session_id] = [];
        }

        db[requestData.session_id].push(archiveEntry);

        fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(db, null, 2));
      } catch (error) {
        console.error('Archive save error:', error);
      }

      res.status(200).json({ pdf_url: `/static/${filename}` });
    });

    writeStream.on('error', err => {
      console.error('Error writing PDF:', err);
      res.status(500).json({ error: 'Failed to generate PDF' });
    });
  } catch (error) {
    console.error('Summary packet generation error:', error);
    res.status(400).json({ error: 'Invalid request data' });
  }
});

export default router;
