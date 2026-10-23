/** Canonical formatting upload/preview used by the template library and company
 * letterhead setup. Callers establish their current tenant/actor authority
 * before receiving bytes. Preview extracts formatting only; it never saves. */
import type { Request, Response } from 'express';
import multer from 'multer';
import { receiveUpload } from '../../middleware/uploadAllowlist';
import { assertUploadSafe, UploadSafetyError } from '../../middleware/uploadSafety';
import { extractTemplateFromFile } from '../../services/templates';

const TEMPLATE_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TEMPLATE_UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.(docx|pdf)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only .docx or .pdf files are supported'));
    }
  },
});

export const receiveTemplateFile = receiveUpload(upload.single('file'), { maxBytes: TEMPLATE_UPLOAD_MAX_BYTES });

/**
 * The bytes are what the declared type says, and clean (magic number + malware
 * scan through the platform guard; fail-closed in production). Answers the
 * refusal itself and returns false (audit IAM-14, P1-5).
 */
export async function uploadedTemplateIsSafe(req: Request, res: Response): Promise<boolean> {
  const file = req.file!;
  try {
    await assertUploadSafe(file.buffer, file.mimetype, file.originalname);
    return true;
  } catch (err) {
    if (err instanceof UploadSafetyError) {
      res.status(err.status).json({ error: err.body.code, detail: err.body.error });
      return false;
    }
    throw err;
  }
}

export async function extractTemplatePreview(req: Request, res: Response) {
  if (!req.file) return res.status(400).json({ error: 'FILE_REQUIRED' });
  if (!(await uploadedTemplateIsSafe(req, res))) return;
  try {
    const result = await extractTemplateFromFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );
    return res.json(result);
  } catch (err: any) {
    console.error('[c2c/templates] extract', err?.message);
    return res.status(500).json({ error: 'EXTRACTION_FAILED' });
  }
}
