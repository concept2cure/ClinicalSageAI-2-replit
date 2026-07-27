/**
 * Chat API Routes — AnA AI Chat Interface.
 *
 * Thin router: binds `/api/chat/*` paths to handler modules under
 * `./chat/`. The 9-step provenance-tracked RAG pipeline, SSE streaming,
 * file uploads, and thread CRUD all route through the AI Gateway
 * (`server/services/ai-gateway/`) — no direct provider calls.
 *
 * @module server/routes/chat
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { makeUploadFileFilter } from '../middleware/uploadAllowlist';
import { sendMessageHandler } from './chat/send-message.js';
import { uploadHandler } from './chat/upload.js';
import {
  listThreads,
  listThreadMessages,
  getThread,
  patchThread,
  deleteThread,
} from './chat/threads.js';
import { streamHandler } from './chat/stream.js';
import { healthHandler } from './chat/health.js';

const router = Router();

// Primary chat endpoint — useChat hook also posts to bare POST /api/chat.
router.post('/send-message', sendMessageHandler);
router.post('/', sendMessageHandler);

/**
 * Evidence upload.
 *
 * THE PARSER IS THE FIX. This route was mounted as `router.post('/upload',
 * uploadHandler)` with no multipart middleware, and the only body parsers on
 * /api are express.json and express.urlencoded — neither of which consumes
 * multipart/form-data. Every client surface posts a FormData body
 * (client/src/concept2cure/hooks/useChatUpload.ts), so `req.file` was always
 * undefined and `req.body` was always `{}`.
 *
 * The handler, written as though multer had run, degraded instead of failing:
 * it wrote a file_uploads row named 'uploaded_file' with file_size 0 and a
 * storage_path no file was ever written to, minted a cre_evidence_sources
 * client_document stamped ingestion_status='ingested', and returned
 * 200 {status:'ready'}. The magic-byte signature check sat inside the
 * `fileBuffer && fileBuffer.length > 0` guard, so it never ran either.
 *
 * The existing route test hand-assigns `req.file` and calls the handler
 * directly, which is why it passed against a route that could not work.
 */
const uploadEvidence = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
  },
  fileFilter: makeUploadFileFilter(),
});

/**
 * Turn multer's own rejections into the route's error shape. Without this an
 * over-size or disallowed file surfaces as an unhandled 500 rather than a
 * 4xx the composer can render.
 */
function uploadErrors(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!err) return next();
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({ error: { code: err.code, message } });
    return;
  }
  if (/Unsupported file type/i.test(message)) {
    res.status(415).json({ error: { code: 'UNSUPPORTED_FILE_TYPE', message } });
    return;
  }
  next(err);
}

router.post('/upload', uploadEvidence.single('file'), uploadErrors, uploadHandler);

router.get('/threads', listThreads);
router.get('/threads/:threadId/messages', listThreadMessages);
router.get('/thread/:threadId', getThread);
router.patch('/thread/:threadId', patchThread);
router.delete('/thread/:threadId', deleteThread);

router.post('/stream', streamHandler);

router.get('/health', healthHandler);

export default router;
