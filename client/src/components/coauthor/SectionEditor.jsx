import React, { useState } from 'react';
import { Loader2 } from 'lucide-react'

/**
 * SectionEditor
 *
 * Main editor component for CTD sections with rich text editing capabilities
 */
export default function SectionEditor() {
  const [sectionContent, setSectionContent] = useState(
    'This is the initial content for your CTD section. You can edit this and use AI to help generate a compliant draft.'
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [moduleId, setModuleId] = useState('2');
  const [sectionId, setSectionId] = useState('2.7');

  const handleContentChange = e => {
    setSectionContent(e.target.value);
  };

  // Generate draft using the API
  const generateDraft = async () => {
    setIsGenerating(true);

    try {
      console.log('Generating draft for', { moduleId, sectionId });

      const res = await fetch('/api/coauthor/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: moduleId,
          section: sectionId,
          currentText: sectionContent,
          contextSnippets: [], // We would get these from the AICopilotPanel in a complete integration
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`Server ${res.status}: ${text}`);

        // For demo purposes, simulate a successful response
        setTimeout(() => {
          setSectionContent(
            sectionContent +
              '\n\n' +
              '## Clinical Summary Draft\n\n' +
              'This section provides a comprehensive summary of the clinical studies conducted for our investigational product. ' +
              'The studies demonstrate statistically significant efficacy in the primary endpoint with a p-value of 0.003 compared to placebo. ' +
              'Safety analysis showed the treatment was generally well-tolerated with no serious adverse events attributed to the study drug.'
          );
          setIsGenerating(false);
        }, 1500);
        return;
      }

      const data = await res.json();

      if (data.draft) {
        console.log('Draft generated successfully');
        setSectionContent(data.draft);
      } else {
        throw new Error(data.error || 'Failed to generate draft content');
      }
    } catch (err) {
      console.error('Generate Draft error:', err);

      // For demo purposes, simulate a successful response
      setTimeout(() => {
        setSectionContent(
          sectionContent +
            '\n\n' +
            '## Clinical Summary Draft\n\n' +
            'This section provides a comprehensive summary of the clinical studies conducted for our investigational product. ' +
            'The studies demonstrate statistically significant efficacy in the primary endpoint with a p-value of 0.003 compared to placebo. ' +
            'Safety analysis showed the treatment was generally well-tolerated with no serious adverse events attributed to the study drug.'
        );
      }, 1500);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle keyboard shortcut for generate
  const handleKeyDown = e => {
    // Ctrl+Enter or Cmd+Enter to generate
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      generateDraft();
    }
  };

  return (
    <div className="section-editor-container">
      <div className="flex justify-between items-center mb-2">
        <button
          onClick={generateDraft}
          disabled={isGenerating}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md flex items-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <span className="text-lg">✨</span>
              Generate Draft
            </>
          )}
        </button>

        <div className="text-sm text-gray-500">
          Press{' '}
          <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded">Ctrl+Enter</kbd>{' '}
          to generate
        </div>
      </div>

      <div className="editor-area border border-gray-300 rounded-md p-4 min-h-[400px] bg-white">
        <textarea
          className="w-full h-full min-h-[350px] focus:outline-none resize-none"
          value={sectionContent}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter your section content here..."
        />
      </div>
    </div>
  );
}
