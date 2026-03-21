/**
 * AIAutocomplete — TipTap extension for inline AI ghost text completions.
 *
 * GitHub Copilot-style experience for regulatory document authoring:
 * - Shows faded purple ghost text after 1.5s typing pause
 * - Press Tab to accept, Escape to dismiss
 * - Context-aware: uses document type, CTD section, and surrounding text
 * - Toggle on/off with Ctrl+Shift+Space
 *
 * Architecture:
 * - ProseMirror plugin renders ghost text as a widget decoration
 * - Debounced API call on content change (1.5s delay)
 * - Cancels in-flight requests when user continues typing
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface AIAutocompleteOptions {
  /** Delay in ms before requesting completion (default: 1500) */
  delay: number;
  /** Max tokens for completion (default: 80) */
  maxTokens: number;
  /** Whether autocomplete is enabled (default: true) */
  enabled: boolean;
  /** Document context for better completions */
  context: {
    documentType?: string;
    submissionType?: string;
    ctdSection?: string;
    projectName?: string;
  };
}

export interface AIAutocompleteStorage {
  enabled: boolean;
  ghostText: string | null;
  isLoading: boolean;
  cursorPos: number;
}

const autocompletePluginKey = new PluginKey('aiAutocomplete');

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('trialsage_access_token') ||
        localStorage.getItem('trialsage_access_token')
      : '';
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function fetchCompletion(
  textBefore: string,
  context: AIAutocompleteOptions['context'],
  maxTokens: number,
  signal: AbortSignal
): Promise<string | null> {
  try {
    const res = await fetch('/api/concept2cure/ai/autocomplete', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        textBefore: textBefore.slice(-600), // last 600 chars for context
        context,
        maxTokens,
      }),
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.completion || null;
  } catch {
    return null; // Aborted or network error
  }
}

export const AIAutocomplete = Extension.create<AIAutocompleteOptions, AIAutocompleteStorage>({
  name: 'aiAutocomplete',

  addOptions() {
    return {
      delay: 1500,
      maxTokens: 80,
      enabled: true,
      context: {},
    };
  },

  addStorage() {
    return {
      enabled: this.options.enabled,
      ghostText: null,
      isLoading: false,
      cursorPos: 0,
    };
  },

  addCommands() {
    return {
      toggleAutocomplete:
        () =>
        ({ editor }) => {
          editor.storage.aiAutocomplete.enabled = !editor.storage.aiAutocomplete.enabled;
          // Clear ghost text when disabling
          if (!editor.storage.aiAutocomplete.enabled) {
            editor.storage.aiAutocomplete.ghostText = null;
          }
          return true;
        },
      dismissGhostText:
        () =>
        ({ editor }) => {
          editor.storage.aiAutocomplete.ghostText = null;
          return true;
        },
      acceptGhostText:
        () =>
        ({ editor, tr }) => {
          const ghost = editor.storage.aiAutocomplete.ghostText;
          if (!ghost) return false;
          const pos = editor.state.selection.from;
          tr.insertText(ghost, pos);
          editor.storage.aiAutocomplete.ghostText = null;
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.storage.aiAutocomplete.ghostText) {
          return editor.commands.acceptGhostText();
        }
        return false;
      },
      Escape: ({ editor }) => {
        if (editor.storage.aiAutocomplete.ghostText) {
          return editor.commands.dismissGhostText();
        }
        return false;
      },
      'Mod-Shift-Space': ({ editor }) => {
        return editor.commands.toggleAutocomplete();
      },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: autocompletePluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, _old, _oldState, newState) {
            const storage = extension.storage;
            if (!storage.enabled || !storage.ghostText) {
              return DecorationSet.empty;
            }

            const pos = newState.selection.from;
            const widget = Decoration.widget(pos, () => {
              const span = document.createElement('span');
              span.className = 'ai-ghost-text';
              span.textContent = storage.ghostText || '';
              span.style.cssText =
                'color: #a78bfa; opacity: 0.6; pointer-events: none; font-style: italic;';
              return span;
            });

            return DecorationSet.create(newState.doc, [widget]);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state) ?? DecorationSet.empty;
          },
        },
        view() {
          let abortController: AbortController | null = null;
          let debounceTimer: ReturnType<typeof setTimeout> | null = null;

          return {
            update: (view) => {
              const storage = extension.storage;
              if (!storage.enabled) return;

              // Cancel previous request
              if (abortController) {
                abortController.abort();
                abortController = null;
              }
              if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
              }

              // Clear ghost text on any edit
              storage.ghostText = null;

              const { state } = view;
              const { from } = state.selection;

              // Only suggest at end of text content (after a space or punctuation)
              const textBefore = state.doc.textBetween(
                Math.max(0, from - 600),
                from,
                '\n'
              );

              if (!textBefore || textBefore.length < 10) return;

              // Only trigger after sentence-ending or space
              const lastChar = textBefore.slice(-1);
              if (!/[\s.,;:!?)\]]/.test(lastChar)) return;

              debounceTimer = setTimeout(async () => {
                abortController = new AbortController();
                storage.isLoading = true;

                const completion = await fetchCompletion(
                  textBefore,
                  extension.options.context,
                  extension.options.maxTokens,
                  abortController.signal
                );

                storage.isLoading = false;

                if (completion && completion.trim().length > 0) {
                  storage.ghostText = completion;
                  storage.cursorPos = from;
                  // Trigger re-render
                  view.dispatch(view.state.tr.setMeta('aiAutocomplete', true));
                }
              }, extension.options.delay);
            },
            destroy: () => {
              if (abortController) abortController.abort();
              if (debounceTimer) clearTimeout(debounceTimer);
            },
          };
        },
      }),
    ];
  },
});

export default AIAutocomplete;
