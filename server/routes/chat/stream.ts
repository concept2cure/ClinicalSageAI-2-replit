/**
 * POST /api/chat/stream
 *
 * Legacy alias for the canonical AnA streaming turn.
 *
 * This route previously carried its own hand-rolled streaming implementation.
 * That copy had drifted badly from the canonical path and was silently serving
 * a degraded assistant: no tools at all (so no search, no guidance lookup, no
 * precedent, no authoring, no governed actions beyond prose parsing), no memory
 * assembly, no RIM signal capture, no working-memory write-back, no per-turn
 * tool selection, no Live Drive, only ten turns of history, and it never
 * persisted the assistant reply to the thread.
 *
 * None of that was surfaced to the caller. The stream looked identical to the
 * real one — same `text`/`done` events — just from a visibly less capable AnA.
 * That is precisely the failure the working agreement forbids: a degraded
 * result rendered as if it were the whole thing.
 *
 * So the parallel implementation is deleted and this route now delegates to the
 * one canonical handler (POST /api/ana-ri/stream). Callers keep their URL and
 * their SSE contract — the canonical handler emits a superset of the events this
 * path used to (`text` and `done`, plus `thread_id`, `run_started`, `tool_use`,
 * `tool_result`, `post_done`) — and they get the full assistant instead of the
 * stripped-down one.
 *
 * Delegation goes through the canonical route's own mount function rather than a
 * direct handler import, deliberately: `server/routes/ana-ri/stream.ts` is a
 * ~1,600-line hot path, and this keeps that file untouched. The canonical router
 * is built once at module load and each request is re-dispatched into it.
 *
 * Per CLAUDE.md: one canonical implementation per capability; a parallel path is
 * migrated onto the canonical one and deleted in the same change.
 */
import { Router, type Request, type Response } from 'express';
import { mountStreamRoute } from '../ana-ri/stream.js';
import { normalizeBody } from './shared.js';

/**
 * The canonical streaming route, mounted onto a private router once at module
 * load. `mountStreamRoute` registers POST /stream (plus its /stream/:runId/control
 * sibling) exactly as it does for the real /api/ana-ri router.
 */
const canonicalRouter = Router();
mountStreamRoute(canonicalRouter);

export async function streamHandler(req: Request, res: Response) {
  normalizeBody(req);
  // The private router matches on its own path space, so present this request
  // as POST /stream regardless of the mount point the caller arrived through.
  req.url = '/stream';
  return new Promise<void>((resolve) => {
    canonicalRouter(req, res, () => resolve());
    res.on('close', () => resolve());
    res.on('finish', () => resolve());
  });
}
