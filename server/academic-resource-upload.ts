import multer from 'multer';
import path from 'path';
import fs from 'fs';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { makeUploadFileFilter, receiveUpload } from './middleware/uploadAllowlist';
import { assertUploadSafe, UploadSafetyError } from './middleware/uploadSafety';
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

// The declared types an academic resource may carry. Until 2026-09-25 this list
// was the whole check: the declared type is chosen by the client, the bytes were
// stored on disk without being compared against it, and no malware scan ran
// (security audit 2026-09-24, IAM-14; plan P1-5). Same list; the byte check and
// scan run in validateAcademicUpload below through the shared guard.
const ACADEMIC_ALLOWED_MIME_TYPES = [
  'application/pdf', // PDF
  'text/plain', // Text
  'application/xml',
  'text/xml', // XML
  'application/json', // JSON
  'application/msword', // DOC
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
];
const ACADEMIC_UPLOAD_MAX_BYTES = 50 * 1024 * 1024; // 50MB limit

// Create the uploader
export const academicUpload = multer({
  storage: academicStorage,
  fileFilter: makeUploadFileFilter({
    extensions: [],
    mimeTypes: ACADEMIC_ALLOWED_MIME_TYPES,
    allowMimePrefixes: [],
  }),
  limits: {
    fileSize: ACADEMIC_UPLOAD_MAX_BYTES,
  },
});

/**
 * Byte check + malware scan on the file multer has already written to disk. A
 * refused file is removed before the response; a request with no file is left
 * to the handler.
 */
export async function validateAcademicUpload(req: Request, res: Response, next: NextFunction) {
  const file = req.file;
  if (!file) return next();
  try {
    await assertUploadSafe(file.path, file.mimetype, file.originalname);
  } catch (err) {
    if (err instanceof UploadSafetyError) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* best-effort cleanup of the refused file */
      }
      return res.status(err.status).json(err.body);
    }
    return next(err);
  }
  return next();
}

/**
 * The receiver a route mounts for one academic resource: multer's outcomes as
 * the 4xx they are (413 over the limit, 415 a refused type), then the byte
 * check and scan. One handler, not a pair (an array argument costs the route's
 * inline handler its contextual types). Mount this, not `academicUpload.single()`
 * on its own.
 */
export function receiveAcademicResource(field = 'file'): RequestHandler {
  const receive = receiveUpload(academicUpload.single(field), { maxBytes: ACADEMIC_UPLOAD_MAX_BYTES });
  return (req, res, next) => {
    receive(req, res, (err?: unknown) => {
      if (err) return next(err);
      void validateAcademicUpload(req, res, next).catch(next);
    });
  };
}

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
