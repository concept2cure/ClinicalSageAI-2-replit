const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { PdfReader } = require('pdfreader');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure storage for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const upload = multer({ storage: storage });

// In-memory document storage for demo purposes
// In production, this would be replaced with a database
let documents = [];
let cerVersions = [];

// Upload a document
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let metadata = {};
    if (req.body.metadata) {
      metadata = JSON.parse(req.body.metadata);
    }

    const document = {
      id: uuidv4(),
      filename: file.filename,
      originalName: file.originalname,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size,
      uploadDate: new Date(),
      metadata,
    };

    documents.push(document);

    res.status(201).json(document);
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Get all documents with optional filters
router.get('/', (req, res) => {
  try {
    let filteredDocs = [...documents];

    // Apply filters if provided
    if (req.query.type) {
      filteredDocs = filteredDocs.filter(
        doc => doc.metadata && doc.metadata.type === req.query.type
      );
    }

    if (req.query.status) {
      filteredDocs = filteredDocs.filter(
        doc => doc.metadata && doc.metadata.status === req.query.status
      );
    }

    if (req.query.deviceId) {
      filteredDocs = filteredDocs.filter(
        doc => doc.metadata && doc.metadata.deviceId === req.query.deviceId
      );
    }

    res.json(filteredDocs);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Download a document
router.get('/:id/download', (req, res) => {
  try {
    const documentId = req.params.id;
    const document = documents.find(doc => doc.id === documentId);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.download(document.path, document.originalName);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// Get document metadata
router.get('/:id/metadata', (req, res) => {
  try {
    const documentId = req.params.id;
    const document = documents.find(doc => doc.id === documentId);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      id: document.id,
      originalName: document.originalName,
      mimetype: document.mimetype,
      size: document.size,
      uploadDate: document.uploadDate,
      metadata: document.metadata,
    });
  } catch (error) {
    console.error('Error fetching document metadata:', error);
    res.status(500).json({ error: 'Failed to fetch document metadata' });
  }
});

// Extract text from a document
router.post('/extract-text', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let text = '';

    // Extract text based on file type
    if (file.mimetype === 'application/pdf') {
      // Use pdfreader to extract text from PDF
      const extractText = () => {
        return new Promise((resolve, reject) => {
          let text = '';
          let lastY, lastPage;

          new PdfReader().parseFileItems(file.path, (err, item) => {
            if (err) {
              reject(err);
            } else if (!item) {
              resolve(text);
            } else if (item.page) {
              if (lastPage !== undefined && lastPage !== item.page) {
                text += '\n\n--- Page ' + item.page + ' ---\n\n';
              }
              lastPage = item.page;
              lastY = null;
            } else if (item.text) {
              if (lastY !== item.y) {
                text += '\n';
              }
              lastY = item.y;
              text += item.text;
            }
          });
        });
      };

      text = await extractText();
    } else {
      // For other file types, we'd need other parsers
      // This is just a placeholder
      text = 'Text extraction for this file type is not supported yet.';
    }

    res.json({ text });
  } catch (error) {
    console.error('Error extracting text:', error);
    res.status(500).json({ error: 'Failed to extract text from document' });
  }
});

// Save a CER document
router.post('/cer', async (req, res) => {
  try {
    const cerData = req.body;

    if (!cerData.deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    // Generate a version ID and timestamp
    const versionId = uuidv4();
    const timestamp = new Date();

    // Create the CER version entry
    const cerVersion = {
      id: versionId,
      deviceId: cerData.deviceId,
      deviceName: cerData.deviceName || 'Unnamed Device',
      version: cerData.version || '1.0.0',
      createdAt: timestamp,
      createdBy: cerData.createdBy || 'System',
      status: cerData.status || 'draft',
      data: cerData,
    };

    cerVersions.push(cerVersion);

    res.status(201).json({
      id: versionId,
      deviceId: cerData.deviceId,
      version: cerVersion.version,
      createdAt: timestamp,
    });
  } catch (error) {
    console.error('Error saving CER:', error);
    res.status(500).json({ error: 'Failed to save CER' });
  }
});

// Get CER history for a device
router.get('/cer/history', (req, res) => {
  try {
    const deviceId = req.query.deviceId;

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    const history = cerVersions
      .filter(ver => ver.deviceId === deviceId)
      .map(ver => ({
        id: ver.id,
        deviceId: ver.deviceId,
        deviceName: ver.deviceName,
        version: ver.version,
        createdAt: ver.createdAt,
        createdBy: ver.createdBy,
        status: ver.status,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(history);
  } catch (error) {
    console.error('Error fetching CER history:', error);
    res.status(500).json({ error: 'Failed to fetch CER history' });
  }
});

// Compare two CER versions
router.post('/cer/compare', (req, res) => {
  try {
    const { versionA, versionB } = req.body;

    if (!versionA || !versionB) {
      return res.status(400).json({ error: 'Both version IDs are required' });
    }

    const cerA = cerVersions.find(ver => ver.id === versionA);
    const cerB = cerVersions.find(ver => ver.id === versionB);

    if (!cerA || !cerB) {
      return res.status(404).json({ error: 'One or both versions not found' });
    }

    // Simple comparison - in a real system we'd do a deep diff
    const comparison = {
      versionA: {
        id: cerA.id,
        version: cerA.version,
        createdAt: cerA.createdAt,
        createdBy: cerA.createdBy,
      },
      versionB: {
        id: cerB.id,
        version: cerB.version,
        createdAt: cerB.createdAt,
        createdBy: cerB.createdBy,
      },
      differences: [
        // In a real app, we'd calculate actual differences here
        {
          section: 'Executive Summary',
          changes: [
            { type: 'added', path: 'summary.conclusion', content: 'New conclusion paragraph' },
          ],
        },
        {
          section: 'Risk Assessment',
          changes: [
            { type: 'modified', path: 'risks[2].severity', oldValue: 'Medium', newValue: 'Low' },
          ],
        },
      ],
    };

    res.json(comparison);
  } catch (error) {
    console.error('Error comparing CER versions:', error);
    res.status(500).json({ error: 'Failed to compare CER versions' });
  }
});

// Generate a PDF from CER data
router.post('/cer/generate-pdf', async (req, res) => {
  try {
    const cerData = req.body;

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size

    // Get the font
    const font = await pdfDoc.embedFont(PDFDocument.StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(PDFDocument.StandardFonts.HelveticaBold);

    // Set some basic content
    const { width, height } = page.getSize();

    // Add title
    page.drawText('Clinical Evaluation Report', {
      x: 50,
      y: height - 50,
      size: 18,
      font: boldFont,
    });

    // Add device name
    page.drawText(`Device: ${cerData.deviceName || 'Unnamed Device'}`, {
      x: 50,
      y: height - 80,
      size: 12,
      font: font,
    });

    // Add version
    page.drawText(`Version: ${cerData.version || '1.0.0'}`, {
      x: 50,
      y: height - 100,
      size: 12,
      font: font,
    });

    // Add date
    page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
      x: 50,
      y: height - 120,
      size: 12,
      font: font,
    });

    // Add content placeholder
    page.drawText('This is a sample CER PDF. In a production system, this would contain', {
      x: 50,
      y: height - 160,
      size: 10,
      font: font,
    });

    page.drawText('formatted content from the CER data including sections such as:', {
      x: 50,
      y: height - 175,
      size: 10,
      font: font,
    });

    // List of sections
    const sections = [
      'Executive Summary',
      'Device Description',
      'Literature Review',
      'Clinical Data Analysis',
      'Risk Assessment',
      'Conclusions',
    ];

    sections.forEach((section, index) => {
      page.drawText(`• ${section}`, {
        x: 70,
        y: height - 200 - index * 15,
        size: 10,
        font: font,
      });
    });

    // Serialize the PDF to bytes
    const pdfBytes = await pdfDoc.save();

    // Send the PDF as a response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="cer-${cerData.deviceId}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Error generating CER PDF:', error);
    res.status(500).json({ error: 'Failed to generate CER PDF' });
  }
});

// Share a document
router.post('/:id/share', (req, res) => {
  try {
    const documentId = req.params.id;
    const { recipients, permission } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Recipients are required' });
    }

    const document = documents.find(doc => doc.id === documentId);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // In a real app, we'd send emails and manage permissions here
    // For demo, we just return success

    res.json({
      success: true,
      documentId,
      recipients,
      permission,
      message: `Document shared with ${recipients.length} recipient(s)`,
    });
  } catch (error) {
    console.error('Error sharing document:', error);
    res.status(500).json({ error: 'Failed to share document' });
  }
});

// Delete a document
router.delete('/:id', (req, res) => {
  try {
    const documentId = req.params.id;
    const documentIndex = documents.findIndex(doc => doc.id === documentId);

    if (documentIndex === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = documents[documentIndex];

    // Remove file from filesystem
    if (fs.existsSync(document.path)) {
      fs.unlinkSync(document.path);
    }

    // Remove from array
    documents.splice(documentIndex, 1);

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
