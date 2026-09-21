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

export function askAnaToDraftPrompt(programName: string | null): string {
  return programName
    ? `Draft a document for ${programName} — tell me which document type and I will draft it into the project as an editable authoring document.`
    : 'Draft a document into this project — tell me which document type and I will draft it as an editable authoring document.';
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
