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
