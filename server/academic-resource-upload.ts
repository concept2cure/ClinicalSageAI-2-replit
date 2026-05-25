import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { academicKnowledgeTracker } from './academic-knowledge-tracker';

// Set up storage for academic resources
const academicStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads/academic');

    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename with timestamp
    const timestamp = Date.now();
    const originalName = file.originalname;
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);

    // Sanitize the base name to remove special characters
    const sanitizedName = baseName.replace(/[^a-zA-Z0-9]/g, '_');

    // Final format: timestamp_sanitizedName.extension
    cb(null, `${timestamp}_${sanitizedName}${extension}`);
  },
});

// File filter for allowed file types
const academicFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Define allowed file types
  const allowedTypes = [
    'application/pdf', // PDF
    'text/plain', // Text
    'application/xml',
    'text/xml', // XML
    'application/json', // JSON
    'application/msword', // DOC
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Allowed types: PDF, TXT, XML, JSON, DOC, DOCX`));
  }
};

// Create the uploader
export const academicUpload = multer({
  storage: academicStorage,
  fileFilter: academicFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Process uploaded academic resource
export async function processAcademicResource(filePath: string, metadata: any): Promise<number> {
  try {
    // Register the resource with the knowledge tracker. The uploaded file path
    // is preserved as the source so the full text can be extracted later.
    const resource = await academicKnowledgeTracker.addResource({
      title: metadata?.title ?? path.basename(filePath),
      authors: metadata?.authors ?? null,
      resourceType: metadata?.resourceType ?? 'document',
      source: metadata?.source ?? filePath,
      url: metadata?.url ?? null,
      category: metadata?.category ?? null,
      summary: metadata?.summary ?? null,
      publishedDate: metadata?.publishedDate ? new Date(metadata.publishedDate) : null,
    });
    return resource.id;
  } catch (error) {
    console.error('Error processing academic resource:', error);
    throw error;
  }
}
