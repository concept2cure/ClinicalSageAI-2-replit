import { Router } from 'express';
import multer from 'multer';
import * as docAI from '../services/docAI.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Set up directory for temporary uploads
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Set up multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage });

const documentRouter = Router();

// POST /api/document/process - Process a document with AI
documentRouter.post('/document/process', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Get folder parameter or use default
    const folder = req.body.folder || process.env.DS_DRAFT_FOLDER || 'drafts';

    // Read the file
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);

    // Process with docAI service
    const result = await docAI.processAndStore(fileBuffer, req.file.originalname, folder);

    // Clean up temp file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error processing document:', error);
    next(error);
  }
});

export default documentRouter;
