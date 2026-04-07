import React, { useState, useEffect } from 'react';

/**
 * Annotation Panel Component
 * Displays section-specific notes and AI guidance for the selected node
 */
export default function AnnotationPanel({ section, onClose }) {
  const [notes, setNotes] = useState('');
  const [aiAdvice, setAiAdvice] = useState('');
  const [loading, setLoading] = useState(false);

  // Load existing notes if stored
  useEffect(() => {
    if (!section) return;
    fetch(`/api/coauthor/annotation/${section.id}`)
      .then(r => r.json())
      .then(data => setNotes(data.notes || ''))
      .catch(() => {});
  }, [section]);

  // Request AI guidance
  const fetchAdvice = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/coauthor/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: section.id, text: section.title }),
      });
      const { advice } = await res.json();
      setAiAdvice(advice);
    } catch (e) {
      setAiAdvice('Failed to load AI advice.');
    } finally {
      setLoading(false);
    }
  };

  // Save manual notes
  const saveNotes = () => {
    fetch(`/api/coauthor/annotation/${section.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
  };

  if (!section) return null;

  return (
    <aside className="annotation-panel bg-white border border-gray-200 p-4 rounded-lg shadow-md w-72 absolute right-4 top-20 z-10">
      <header className="flex justify-between items-center border-b pb-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
        <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-700">
          ✕
        </button>
      </header>

      <section>
        <h3 className="text-sm font-medium text-gray-700">AI Guidance</h3>
        <button
          onClick={fetchAdvice}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded text-sm mt-1 disabled:opacity-60"
        >
          {loading ? 'Thinking…' : 'Ask AnA for Advice'}
        </button>
        {aiAdvice && (
          <p className="mt-2 text-sm italic text-gray-700 bg-gray-50 p-2 rounded">{aiAdvice}</p>
        )}
      </section>

      <section className="mt-4">
        <h3 className="text-sm font-medium text-gray-700">Your Notes</h3>
        <textarea
          rows={4}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full border border-gray-300 rounded p-2 text-sm mt-1"
        />
        <button
          onClick={saveNotes}
          className="bg-green-500 hover:bg-green-600 text-white py-1 px-3 rounded text-sm mt-2"
        >
          Save Notes
        </button>
      </section>
    </aside>
  );
}
