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

import { Router } from 'express';
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

router.post('/upload', uploadHandler);

router.get('/threads', listThreads);
router.get('/threads/:threadId/messages', listThreadMessages);
router.get('/thread/:threadId', getThread);
router.patch('/thread/:threadId', patchThread);
router.delete('/thread/:threadId', deleteThread);

router.post('/stream', streamHandler);

router.get('/health', healthHandler);

export default router;
