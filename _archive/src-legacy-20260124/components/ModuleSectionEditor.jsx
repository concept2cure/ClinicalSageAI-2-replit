import React, { useEffect, useRef, useState } from 'react';
import ContextPreview from './ai/ContextPreview';

/**
 * Module Section Editor
 *
 * This component provides a rich editing experience for regulatory document sections,
 * with AI-assisted drafting and context retrieval capabilities.
 */
export default function ModuleSectionEditor({
  initialContent = '',
  moduleId,
  sectionId,
  onSave,
  onCancel,
  onContentChange,
  contextSnippets: externalContextSnippets = [],
}) {
  const [content, setContentInternal] = useState(initialContent);
  const [contextQuery, setContextQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false); // Controls the loading state for draft generation
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [isFetchingContext, setIsFetchingContext] = useState(false);
  const [contextSnippets, setContextSnippets] = useState(externalContextSnippets || []);
  const [error, setError] = useState(null);
  const [contextError, setContextError] = useState(null);
  const [phase, setPhase] = useState('editing'); // editing, retrieving, drafting

  // Update content and notify parent component
  const setContent = newContent => {
    setContentInternal(newContent);
    if (onContentChange) {
      onContentChange(newContent);
    }
  };

  // Sync with initialContent when it changes from parent
  useEffect(() => {
    // Only update if it's different to avoid unnecessary re-renders
    if (initialContent !== content) {
      setContentInternal(initialContent);
      console.log('ModuleSectionEditor: Content updated from parent');
    }
  }, [initialContent]);

  // Update contextSnippets when externalContextSnippets changes
  useEffect(() => {
    if (externalContextSnippets && externalContextSnippets.length > 0) {
      setContextSnippets(externalContextSnippets);
    }
  }, [externalContextSnippets]);

  const textareaRef = useRef(null);

  // Fetch context based on query
  const fetchContext = async () => {
    if (!contextQuery.trim()) return;

    setContextError(null);
    setIsFetchingContext(true);
    setPhase('retrieving');

    try {
      const response = await fetch('/api/ai/retrieve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: contextQuery, k: 3 }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch context');
      }

      const data = await response.json();

      if (data.success && data.chunks) {
        setContextSnippets(data.chunks);
      } else {
        throw new Error(data.error || 'No relevant context found');
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
      setContextError(err.message || 'Failed to fetch context');
      setContextSnippets([]);
    } finally {
      setIsFetchingContext(false);
    }
  };

  // Generate draft using AI
  const generateDraft = async () => {
    setError(null);
    setIsGenerating(true);
    setPhase('drafting');

    try {
      // Use the CoAuthor endpoint which we confirmed is working
      const response = await fetch('/api/coauthor/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          moduleId,
          sectionId,
          prompt: content,
          context: contextSnippets.map(s => s.text),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Draft API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (data.success && data.draft) {
        setContent(data.draft);
        setIsDraftReady(true);
      } else {
        throw new Error(data.error || 'Failed to generate draft content');
      }
    } catch (err) {
      console.error('Error generating draft:', err);
      setError(err.message || 'Failed to generate draft');
    } finally {
      setIsGenerating(false);
      setPhase('editing');
    }
  };

  // Handle context snippet click
  const handleSnippetClick = id => {
    // Find the snippet with this ID
    const snippet = contextSnippets.find(s => s.chunkId === id || s.id === id);

    if (!snippet) return;

    // Focus textarea and insert a reference to the snippet
    if (textareaRef.current) {
      textareaRef.current.focus();
      const insertText = `\n\nReference from document ${snippet.docId || 'unknown'}:\n${snippet.text}\n\n`;
      const cursorPos = textareaRef.current.selectionStart;
      const textBefore = content.substring(0, cursorPos);
      const textAfter = content.substring(cursorPos);

      setContent(textBefore + insertText + textAfter);

      // Set cursor position after inserted text
      setTimeout(() => {
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd =
          cursorPos + insertText.length;
      }, 0);
    }
  };

  // Keyboard shortcut for generating draft (Ctrl+Enter)
  useEffect(() => {
    const handleKey = e => {
      // Ctrl+Enter or Cmd+Enter
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        generateDraft();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [content, contextSnippets]); // Re-attach when content or context changes

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Main editor column */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Section Editor</h2>
          <div className="text-sm text-gray-500">
            Press <kbd className="px-1 py-0.5 bg-gray-100 border rounded">Ctrl+Enter</kbd> to
            generate
          </div>
        </div>

        <label htmlFor="draft-area" className="sr-only">
          Section content
        </label>
        <textarea
          id="draft-area"
          ref={textareaRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          className="w-full border rounded-lg p-3 min-h-[300px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="Start writing your section content here..."
        />

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onSave}
            disabled={isGenerating}
            className="bg-green-600 text-white rounded-lg px-4 py-2 hover:bg-green-700 
                      focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
            aria-label="Save section content"
          >
            Save Changes
          </button>

          <button
            onClick={generateDraft}
            disabled={isGenerating}
            className="bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700 
                      focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50
                      flex items-center"
            aria-label="Generate draft for this section"
          >
            {isGenerating ? (
              <>
                <span
                  className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                  aria-hidden="true"
                ></span>
                Generating...
              </>
            ) : (
              'Generate Draft'
            )}
          </button>

          <button
            onClick={onCancel}
            className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 hover:bg-gray-50 
                      focus:outline-none focus:ring-2 focus:ring-gray-400"
            aria-label="Cancel editing"
          >
            Cancel
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-2 p-3 border border-red-200 bg-red-50 rounded-lg text-sm text-red-600"
          >
            ⚠ {error}
          </div>
        )}

        {isDraftReady && (
          <div
            role="status"
            className="mt-2 p-3 border border-green-200 bg-green-50 rounded-lg text-sm text-green-600"
          >
            ✓ Draft generation complete
          </div>
        )}
      </div>

      {/* Context sidebar */}
      <div className="space-y-4 border rounded-lg p-4">
        <h3 className="font-medium">Context Retrieval</h3>
        <p className="text-sm text-gray-600">
          Enter regulatory terms to find relevant context for your draft.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={contextQuery}
            onChange={e => setContextQuery(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="e.g., clinical safety data"
          />

          <button
            onClick={fetchContext}
            disabled={isFetchingContext || !contextQuery.trim()}
            className="bg-gray-800 text-white rounded-lg px-3 py-2 hover:bg-gray-900 
                      focus:outline-none focus:ring-2 focus:ring-gray-600 disabled:opacity-50
                      flex items-center"
            aria-label="Search for context"
          >
            {isFetchingContext ? (
              <span
                className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                aria-hidden="true"
              ></span>
            ) : (
              'Search'
            )}
          </button>
        </div>

        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2">Context Snippets</h4>
          <ContextPreview
            snippets={contextSnippets}
            onSnippetClick={handleSnippetClick}
            isLoading={isFetchingContext}
            error={contextError}
          />
        </div>
      </div>
    </div>
  );
}
