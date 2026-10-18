/**
 * "Ask AnA to draft" — the empty state's route into the conversation.
 *
 * Two hosts, one prompt. Inside a conversation the prompt is handed to that
 * composer (the person keeps talking where they are). On the Authoring
 * surface it opens the conversation thread seeded with the prompt through the
 * shell's ONE conversation channel — `window.C2C_CONVO = { id, seed }` then
 * navigate — the same protocol V2App.startShellConversation and the Home
 * composer use. No second channel.
 */
import type { AuthoringContextPack } from '@shared/types/authoring-context';

/** The existing conversation-origin chip; saved editor identity is optional. */
export interface AskOrigin {
  surfaceId: string;
  label: string;
  moduleContext?: Record<string, unknown> | null;
  authoringContext?: AuthoringContextPack | null;
  authoringDocument?: { docId: string; programId: string; sectionId?: string };
}

export interface SavedSectionVersion { sectionId: string; updatedAt: string | null }

/** A successful PATCH supplies the version before React adopts its row. */
export function originWithSavedVersion(origin: AskOrigin, version?: SavedSectionVersion | null): AskOrigin {
  if (!version || origin.authoringContext?.sectionId !== version.sectionId) return origin;
  const loadedAt = Date.parse(origin.authoringContext.sectionUpdatedAt ?? '');
  const confirmedAt = Date.parse(version.updatedAt ?? '');
  if (Number.isFinite(loadedAt) && Number.isFinite(confirmedAt) && loadedAt > confirmedAt) return origin;
  const authoringContext = { ...origin.authoringContext };
  delete authoringContext.sectionUpdatedAt;
  return {
    ...origin,
    authoringContext: { ...authoringContext, ...(version.updatedAt ? { sectionUpdatedAt: version.updatedAt } : {}) },
    moduleContext: { ...origin.moduleContext, sectionUpdatedAt: version.updatedAt },
  };
}

/** The shell's existing prefill protocol: continue the conversation; wait for Enter. */
export function prefillConversation(prompt: string, origin: AskOrigin, onNav: (id: string) => void): void {
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = {
    id: 'current', seed: null, prefill: prompt.trim() || null, sendOnArrival: false, origin,
  };
  onNav('conversation-thread');
}

/**
 * One fixed sentence, whatever the program is called. The prompt is sent as
 * the clicking person's own words, and a program's name is stored text any
 * member can set, so splicing it in let an instruction planted there speak
 * as that person, outside the fence the server puts around screen context
 * (periodic review 2026-09-28, editor family, SEC-C-4 class). AnA still
 * knows the project: the conversation forwards it as `project_id`. The
 * argument is kept, unused, so existing callers compile unchanged.
 */
export function askAnaToDraftPrompt(_programName?: string | null): string {
  return 'Draft a document into this project — tell me which document type and I will draft it as an editable authoring document.';
}

/**
 * Open the conversation thread. With a `conversationId` it reopens THAT
 * conversation (the "Back to conversation" route); otherwise a new one,
 * seeded with `prompt` when given.
 */
export function openConversationWithPrompt(
  prompt: string | null,
  onNav: ((id: string) => void) | undefined,
  conversationId?: string | null,
): void {
  if (typeof window !== 'undefined') {
    (window as unknown as { C2C_CONVO?: { id: string; seed?: string | null } }).C2C_CONVO = {
      id: conversationId && conversationId.trim() ? conversationId.trim() : 'new',
      seed: prompt && prompt.trim() ? prompt.trim() : null,
    };
  }
  onNav?.('conversation-thread');
}
