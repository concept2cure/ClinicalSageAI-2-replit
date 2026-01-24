import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedTypes = /\.(pdf|doc|docx|txt|csv|xlsx|xls)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  },
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('✅ File uploaded successfully:', {
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      path: req.file.path,
    });

    // Read and process the file content
    let fileContent = '';
    let analysis = '';

    try {
      if (req.file.mimetype === 'text/plain' || req.file.originalname.endsWith('.txt')) {
        fileContent = fs.readFileSync(req.file.path, 'utf8');
      } else if (req.file.originalname.endsWith('.json')) {
        fileContent = fs.readFileSync(req.file.path, 'utf8');
      } else {
        fileContent = `Binary file: ${req.file.originalname} (${req.file.size} bytes)`;
      }

      // Analyze with OpenAI if we have content
      if (process.env.OPENAI_API_KEY && fileContent.length > 0 && fileContent.length < 10000) {
        console.log('🧠 Analyzing file with OpenAI...');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content:
                  'You are a document analysis expert. Analyze the uploaded file and provide a concise summary of its contents, key points, and any actionable insights. Be specific and helpful.',
              },
              {
                role: 'user',
                content: `Please analyze this file "${req.file.originalname}":\n\n${fileContent.substring(0, 8000)}`,
              },
            ],
            max_tokens: 500,
            temperature: 0.3,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          analysis = data.choices[0].message.content;
          console.log('✅ OpenAI analysis completed');
        }
      }
    } catch (processError) {
      console.error('⚠️ File processing error:', processError);
      analysis = 'File uploaded successfully, but automatic analysis encountered an issue.';
    }

    res.status(200).json({
      success: true,
      message: 'File uploaded and analyzed successfully',
      file: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
      },
      analysis:
        analysis ||
        `File "${req.file.originalname}" has been uploaded successfully. ${req.file.size > 1024 * 1024 ? 'Large file - manual review recommended.' : 'Ready for manual review or further processing.'}`,
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
