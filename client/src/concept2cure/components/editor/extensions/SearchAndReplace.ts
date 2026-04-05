// @ts-nocheck — TipTap extension types don't align with addCommands() callback signatures
/**
 * SearchAndReplace — TipTap extension for Find & Replace functionality.
 *
 * Features:
 * - Text search with match highlighting via ProseMirror decorations
 * - Replace single or replace all
 * - Case-sensitive toggle
 * - Regex support toggle
 * - Navigate between matches (next/prev)
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface SearchAndReplaceOptions {
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  useRegex: boolean;
}

export interface SearchAndReplaceStorage {
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  useRegex: boolean;
  results: Array<{ from: number; to: number }>;
  currentIndex: number;
}

const searchAndReplacePluginKey = new PluginKey('searchAndReplace');

function findMatches(
  doc: { textContent: string; nodesBetween: (from: number, to: number, cb: (node: { isText: boolean; text?: string }, pos: number) => void) => void; content: { size: number } },
  searchTerm: string,
  caseSensitive: boolean,
  useRegex: boolean
): Array<{ from: number; to: number }> {
  if (!searchTerm) return [];

  const results: Array<{ from: number; to: number }> = [];
  const fullText: { text: string; pos: number }[] = [];

  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (node.isText && node.text) {
      fullText.push({ text: node.text, pos });
    }
  });

  for (const { text, pos } of fullText) {
    let regex: RegExp;
    try {
      if (useRegex) {
        regex = new RegExp(searchTerm, caseSensitive ? 'g' : 'gi');
      } else {
        const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
      }
    } catch {
      continue;
    }

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: pos + match.index,
        to: pos + match.index + match[0].length,
      });
      if (match[0].length === 0) break; // prevent infinite loop on zero-length matches
    }
  }

  return results;
}

export const SearchAndReplace = Extension.create<SearchAndReplaceOptions, SearchAndReplaceStorage>({
  name: 'searchAndReplace',

  addStorage() {
    return {
      searchTerm: '',
      replaceTerm: '',
      caseSensitive: false,
      useRegex: false,
      results: [],
      currentIndex: -1,
    };
  },

  addCommands() {
    return {
      setSearchTerm:
        (term: string) =>
        ({ editor }) => {
          editor.storage.searchAndReplace.searchTerm = term;
          editor.storage.searchAndReplace.results = findMatches(
            editor.state.doc,
            term,
            editor.storage.searchAndReplace.caseSensitive,
            editor.storage.searchAndReplace.useRegex
          );
          editor.storage.searchAndReplace.currentIndex =
            editor.storage.searchAndReplace.results.length > 0 ? 0 : -1;
          // Force re-render
          editor.view.dispatch(editor.state.tr);
          return true;
        },

      setReplaceTerm:
        (term: string) =>
        ({ editor }) => {
          editor.storage.searchAndReplace.replaceTerm = term;
          return true;
        },

      toggleCaseSensitive:
        () =>
        ({ editor }) => {
          editor.storage.searchAndReplace.caseSensitive =
            !editor.storage.searchAndReplace.caseSensitive;
          // Re-run search
          editor.storage.searchAndReplace.results = findMatches(
            editor.state.doc,
            editor.storage.searchAndReplace.searchTerm,
            editor.storage.searchAndReplace.caseSensitive,
            editor.storage.searchAndReplace.useRegex
          );
          editor.view.dispatch(editor.state.tr);
          return true;
        },

      toggleUseRegex:
        () =>
        ({ editor }) => {
          editor.storage.searchAndReplace.useRegex =
            !editor.storage.searchAndReplace.useRegex;
          editor.storage.searchAndReplace.results = findMatches(
            editor.state.doc,
            editor.storage.searchAndReplace.searchTerm,
            editor.storage.searchAndReplace.caseSensitive,
            editor.storage.searchAndReplace.useRegex
          );
          editor.view.dispatch(editor.state.tr);
          return true;
        },

      nextMatch:
        () =>
        ({ editor }) => {
          const { results, currentIndex } = editor.storage.searchAndReplace;
          if (results.length === 0) return false;
          const next = (currentIndex + 1) % results.length;
          editor.storage.searchAndReplace.currentIndex = next;
          editor.chain().focus().setTextSelection(results[next]).run();
          editor.view.dispatch(editor.state.tr);
          return true;
        },

      prevMatch:
        () =>
        ({ editor }) => {
          const { results, currentIndex } = editor.storage.searchAndReplace;
          if (results.length === 0) return false;
          const prev = (currentIndex - 1 + results.length) % results.length;
          editor.storage.searchAndReplace.currentIndex = prev;
          editor.chain().focus().setTextSelection(results[prev]).run();
          editor.view.dispatch(editor.state.tr);
          return true;
        },

      replaceCurrent:
        () =>
        ({ editor }) => {
          const { results, currentIndex, replaceTerm } =
            editor.storage.searchAndReplace;
          if (results.length === 0 || currentIndex < 0) return false;
          const { from, to } = results[currentIndex];
          editor.chain().focus().insertContentAt({ from, to }, replaceTerm).run();
          // Re-run search
          editor.storage.searchAndReplace.results = findMatches(
            editor.state.doc,
            editor.storage.searchAndReplace.searchTerm,
            editor.storage.searchAndReplace.caseSensitive,
            editor.storage.searchAndReplace.useRegex
          );
          return true;
        },

      replaceAll:
        () =>
        ({ editor }) => {
          const { results, replaceTerm } = editor.storage.searchAndReplace;
          if (results.length === 0) return false;
          // Replace from end to start to preserve positions
          const tr = editor.state.tr;
          for (let i = results.length - 1; i >= 0; i--) {
            tr.insertText(replaceTerm, results[i].from, results[i].to);
          }
          editor.view.dispatch(tr);
          editor.storage.searchAndReplace.results = [];
          editor.storage.searchAndReplace.currentIndex = -1;
          return true;
        },

      clearSearch:
        () =>
        ({ editor }) => {
          editor.storage.searchAndReplace.searchTerm = '';
          editor.storage.searchAndReplace.replaceTerm = '';
          editor.storage.searchAndReplace.results = [];
          editor.storage.searchAndReplace.currentIndex = -1;
          editor.view.dispatch(editor.state.tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extensionThis = this;

    return [
      new Plugin({
        key: searchAndReplacePluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(_tr, _oldState, _old, newState) {
            const { results, currentIndex } = extensionThis.storage;
            if (!results || results.length === 0) return DecorationSet.empty;

            const decorations: Decoration[] = [];
            for (let i = 0; i < results.length; i++) {
              const { from, to } = results[i];
              if (from >= 0 && to <= newState.doc.content.size) {
                decorations.push(
                  Decoration.inline(from, to, {
                    class:
                      i === currentIndex
                        ? 'search-result-active bg-stone-300 ring-2 ring-stone-1000'
                        : 'search-result bg-stone-200',
                  })
                );
              }
            }

            return DecorationSet.create(newState.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return searchAndReplacePluginKey.getState(state);
          },
        },
      }),
    ];
  },
});

export default SearchAndReplace;
