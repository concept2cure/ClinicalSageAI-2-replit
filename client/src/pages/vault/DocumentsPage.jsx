// DocumentsPage.jsx – Document workspace with simple textarea
// Features: file list, version history, comments sidebar

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { File, Clock, Save, MessageCircle } from 'lucide-react';

export default function DocumentsPage() {
  const { session } = useAuth();
  const [docs, setDocs] = useState([
    { id: 1, title: 'CSR Template' },
    { id: 2, title: 'Protocol Draft' },
    { id: 3, title: 'Study Report' },
  ]);
  const [activeId, setActiveId] = useState(null);
  const [content, setContent] = useState('');
  const [versions, setVersions] = useState([
    { id: 1, created_at: new Date().toISOString(), content: 'Version 1 content' },
    {
      id: 2,
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      content: 'Previous version content',
    },
  ]);
  const [showComments, setShowComments] = useState(false);

  /* load doc content */
  const loadDocument = useCallback(docId => {
    setActiveId(docId);
    setContent(`Document ${docId} content goes here. This is a simplified editor.`);
  }, []);

  /* create new doc */
  const createDoc = async () => {
    const newId = Math.max(...docs.map(d => d.id), 0) + 1;
    const newDoc = { id: newId, title: `Untitled ${newId}` };
    setDocs([newDoc, ...docs]);
    loadDocument(newDoc.id);
  };

  return (
    <div className="flex h-full gap-4 bg-zinc-50">
      {/* sidebar */}
      <aside className="w-64 bg-white border-r border-zinc-200/50 p-4 flex flex-col">
        <button
          onClick={createDoc}
          className="mb-3 bg-zinc-900 text-white text-xs px-3 py-2 rounded-full hover:bg-zinc-800"
        >
          + New Doc
        </button>
        <ul className="flex-1 overflow-y-auto space-y-2 text-sm">
          {docs.map(d => (
            <li key={d.id}>
              <button
                onClick={() => loadDocument(d.id)}
                className={`flex gap-2 items-center w-full px-2 py-1 rounded ${
                  activeId === d.id
                    ? 'bg-zinc-100'
                    : 'hover:bg-zinc-100'
                }`}
              >
                <File size={16} /> {d.title || `Untitled ${d.id}`}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* editor & panels */}
      <div className="flex-1 flex flex-col">
        {/* toolbar */}
        <div className="flex items-center gap-4 border-b border-zinc-200/60 bg-white/80 backdrop-blur px-4 py-2">
          <span className="text-sm font-medium">
            {docs.find(d => d.id === activeId)?.title || 'Select a document'}
          </span>
          <button
            onClick={() => setShowComments(!showComments)}
            className="ml-auto text-zinc-500 hover:text-zinc-900"
            title="Toggle comments"
          >
            <MessageCircle size={18} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="flex-1 p-6 overflow-y-auto resize-none bg-white text-zinc-900"
            placeholder="Select a document from the sidebar..."
            readOnly={!session?.user?.canEdit}
          />

          {/* comments / version drawer */}
          {showComments && (
            <aside className="w-80 border-l border-zinc-200/60 bg-zinc-50 p-4 overflow-y-auto">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
                <Clock size={14} /> Versions
              </h3>
              <ul className="text-xs space-y-2 mb-4">
                {versions.map(v => (
                  <li key={v.id} className="flex justify-between items-center">
                    <span>{new Date(v.created_at).toLocaleString()}</span>
                    <button
                      onClick={() => setContent(v.content)}
                      className="text-zinc-700 hover:underline"
                    >
                      Load
                    </button>
                  </li>
                ))}
              </ul>
              {/* Placeholder for comments */}
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
                <MessageCircle size={14} /> Comments
              </h3>
              <p className="text-xs opacity-60">
                Inline comment bubbles appear in the editor; summary thread coming soon.
              </p>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
