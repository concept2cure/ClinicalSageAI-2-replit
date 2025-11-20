const express = require('express');
const OpenAI = require('openai');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/documents/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOCX, TXT, and MD files are allowed'));
    }
  },
});

// Document version storage for comparison
let documentVersions = new Map();
let changeAnalyses = new Map();

// Upload and analyze large document for changes
router.post('/upload-analyze', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No document file provided',
      });
    }

    const { projectId, documentId, version, userId } = req.body;

    if (!projectId || !documentId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID and Document ID are required',
      });
    }

    // Extract text from uploaded document
    const filePath = req.file.path;
    let extractedText = '';

    try {
      if (req.file.originalname.toLowerCase().endsWith('.pdf')) {
        const pdfBuffer = await fs.readFile(filePath);
        const pdfData = await pdfParse(pdfBuffer);
        extractedText = pdfData.text;
      } else {
        extractedText = await fs.readFile(filePath, 'utf-8');
      }
    } catch (extractError) {
      console.error('Error extracting text:', extractError);
      return res.status(500).json({
        success: false,
        error: 'Failed to extract text from document',
      });
    }

    // Clean up uploaded file
    await fs.unlink(filePath);

    const documentKey = `${projectId}:${documentId}`;
    const currentVersion = version || `v${Date.now()}`;

    // Store current version
    if (!documentVersions.has(documentKey)) {
      documentVersions.set(documentKey, new Map());
    }

    const versionMap = documentVersions.get(documentKey);
    versionMap.set(currentVersion, {
      content: extractedText,
      uploadedAt: new Date(),
      uploadedBy: userId,
      filename: req.file.originalname,
      size: req.file.size,
    });

    // Get previous version for comparison
    const versions = Array.from(versionMap.keys()).sort();
    const previousVersion = versions[versions.length - 2]; // Second to last

    let changeAnalysis = null;
    if (previousVersion) {
      const previousContent = versionMap.get(previousVersion).content;
      changeAnalysis = await analyzeDocumentChanges(
        previousContent,
        extractedText,
        currentVersion,
        previousVersion
      );

      // Store analysis
      changeAnalyses.set(`${documentKey}:${currentVersion}`, changeAnalysis);
    }

    res.json({
      success: true,
      documentId,
      version: currentVersion,
      previousVersion,
      hasChanges: !!changeAnalysis,
      changeAnalysis,
      documentSize: req.file.size,
      filename: req.file.originalname,
      message: changeAnalysis
        ? 'Document analyzed and changes detected'
        : 'Document uploaded (no previous version for comparison)',
    });
  } catch (error) {
    console.error('Error in document analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze document',
    });
  }
});

// Get change summary for a specific document version
router.get('/changes/:projectId/:documentId/:version', (req, res) => {
  try {
    const { projectId, documentId, version } = req.params;
    const analysisKey = `${projectId}:${documentId}:${version}`;

    const changeAnalysis = changeAnalyses.get(analysisKey);

    if (!changeAnalysis) {
      return res.status(404).json({
        success: false,
        error: 'Change analysis not found for this document version',
      });
    }

    res.json({
      success: true,
      changeAnalysis,
    });
  } catch (error) {
    console.error('Error retrieving change analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve change analysis',
    });
  }
});

// Get all versions of a document
router.get('/versions/:projectId/:documentId', (req, res) => {
  try {
    const { projectId, documentId } = req.params;
    const documentKey = `${projectId}:${documentId}`;

    const versionMap = documentVersions.get(documentKey);

    if (!versionMap) {
      return res.json({
        success: true,
        versions: [],
        message: 'No versions found for this document',
      });
    }

    const versions = Array.from(versionMap.entries())
      .map(([version, data]) => ({
        version,
        uploadedAt: data.uploadedAt,
        uploadedBy: data.uploadedBy,
        filename: data.filename,
        size: data.size,
      }))
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    res.json({
      success: true,
      versions,
    });
  } catch (error) {
    console.error('Error retrieving document versions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve document versions',
    });
  }
});

// AI-powered document change analysis
async function analyzeDocumentChanges(
  previousContent,
  currentContent,
  currentVersion,
  previousVersion
) {
  try {
    const prompt = `
You are a regulatory document expert analyzing changes between two versions of a regulatory document.

Previous Version: ${previousVersion}
Current Version: ${currentVersion}

Please analyze the differences and provide a comprehensive change summary in the following JSON format:

{
  "summary": "Brief overview of the main changes",
  "keyChanges": [
    {
      "section": "Section name or reference",
      "type": "addition|deletion|modification|restructuring",
      "description": "Description of the change",
      "impact": "low|medium|high",
      "regulatoryRelevance": "Brief note on regulatory significance"
    }
  ],
  "addedSections": ["List of new sections added"],
  "deletedSections": ["List of sections removed"],
  "modifiedSections": ["List of sections with significant modifications"],
  "statisticalSummary": {
    "totalChanges": number,
    "additionsCount": number,
    "deletionsCount": number,
    "modificationsCount": number,
    "wordsAdded": estimated_number,
    "wordsRemoved": estimated_number
  },
  "criticalChanges": [
    {
      "change": "Description of critical change",
      "reason": "Why this change is critical for regulatory compliance"
    }
  ],
  "recommendations": [
    "Action items for reviewers based on the changes"
  ]
}

Previous Document Content:
${previousContent.substring(0, 8000)}

Current Document Content:
${currentContent.substring(0, 8000)}

Focus on regulatory compliance implications, clinical impact, and changes that would require reviewer attention.
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content:
            'You are an expert regulatory affairs professional specializing in document change analysis for FDA, ICH, and EMA submissions. Provide detailed, accurate analysis focused on regulatory compliance implications.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
    });

    const analysisResult = JSON.parse(response.choices[0].message.content);

    // Add metadata
    analysisResult.metadata = {
      analyzedAt: new Date(),
      previousVersion,
      currentVersion,
      aiModel: 'gpt-4o',
      analysisType: 'regulatory_document_comparison',
    };

    return analysisResult;
  } catch (error) {
    console.error('Error in AI change analysis:', error);
    return {
      error: 'Failed to analyze changes with AI',
      summary: 'AI analysis failed - manual review required',
      keyChanges: [],
      addedSections: [],
      deletedSections: [],
      modifiedSections: [],
      statisticalSummary: {
        totalChanges: 0,
        additionsCount: 0,
        deletionsCount: 0,
        modificationsCount: 0,
        wordsAdded: 0,
        wordsRemoved: 0,
      },
      criticalChanges: [],
      recommendations: ['Manual document comparison required due to AI analysis failure'],
    };
  }
}

module.exports = router;
