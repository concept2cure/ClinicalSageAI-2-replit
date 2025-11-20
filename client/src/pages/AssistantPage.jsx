// AssistantPage.jsx – streaming assistant with clickable citations & doc viewer
import React, { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { v4 as uuid } from 'uuid';
import { Send, Loader } from 'lucide-react';
import DocumentViewerModal from '../components/modals/DocumentViewerModal';

export default function AssistantPage() {
  const [messages, setMessages] = useState([]); // chat history
  const [input, setInput] = useState('');
  const [citations, setCitations] = useState([]); // [{idx,doc_id,snippet}]
  const [viewDoc, setViewDoc] = useState(null); // {doc_id,snippet}
  const containerRef = useRef(null);

  /* auto‑scroll */
  useEffect(() => {
    containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async body => {
      const res = await fetch('/api/assistant/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('stream error');
      return res.body;
    },
    onSuccess: async stream => {
      const reader = stream.getReader();
      let bot = { id: uuid(), role: 'assistant', content: '' };
      setMessages(p => [...p, bot]);
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        buffer += chunk;
        const cut = buffer.indexOf('<CITATIONS>');
        if (cut !== -1) {
          bot.content += buffer.slice(0, cut);
          setMessages(prev => prev.map(m => (m.id === bot.id ? { ...bot } : m)));
          setCitations(JSON.parse(buffer.slice(cut + 11)));
          break;
        }
        bot.content += chunk;
        setMessages(prev => prev.map(m => (m.id === bot.id ? { ...bot } : m)));
        buffer = '';
      }
    },
  });

  const send = () => {
    if (!input.trim()) return;
    const userMsg = { id: uuid(), role: 'user', content: input.trim() };
    const context = [...messages, userMsg].slice(-15);
    setMessages([...messages, userMsg]);
    setInput('');
    setCitations([]);
    chatMutation.mutate({ messages: context });
  };

  /* render citations as superscript numbers */
  const renderers = {
    text: ({ children }) => {
      let text = children;
      citations.forEach(c => {
        const sup = ` [${c.idx}]`;
        text = text.replaceAll(sup, ``); // remove raw footnote markers
      });
      return text;
    },
  };

  return (
    <div className="h-full flex flex-col">
      {/* chat history */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50 dark:bg-slate-900/40"
      >
        {messages.map(m => (
          <div
            key={m.id}
            className={`max-w-prose px-4 py-2 rounded-lg ${
              m.role === 'assistant'
                ? 'bg-white dark:bg-slate-800'
                : 'bg-emerald-600 text-white self-end'
            }`}
          >
            <ReactMarkdown components={renderers} className="prose dark:prose-invert text-sm">
              {m.content || '…'}
            </ReactMarkdown>
          </div>
        ))}
        {chatMutation.isLoading && <Loader className="animate-spin text-emerald-600" />}
      </div>

      {/* citation footer */}
      {citations.length > 0 && (
        <div className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-xs space-y-1">
          {citations.map(c => (
            <button
              key={c.idx}
              onClick={() =>
                setViewDoc({
                  doc_id: c.doc_id,
                  snippet: c.snippet,
                  page: c.page,
                })
              }
              className="hover:underline text-left w-full"
            >
              <sup className="font-bold">[{c.idx}]</sup>
              {c.page && (
                <span className="text-emerald-600 dark:text-emerald-400">p{c.page}</span>
              )}{' '}
              Doc {c.doc_id}: {c.snippet.slice(0, 90)}…
            </button>
          ))}
        </div>
      )}

      {/* compose */}
      <div className="border-t border-gray-200 dark:border-slate-700 p-4 flex gap-3 bg-white dark:bg-slate-800">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask regulatory‑grade questions…"
          className="flex-1 h-12 resize-none border rounded px-3 py-2 text-sm focus:outline-emerald-600 bg-gray-50 dark:bg-slate-700 dark:border-slate-600"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          onClick={send}
          disabled={chatMutation.isLoading}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded flex items-center gap-1 text-sm disabled:opacity-50"
        >
          <Send size={16} /> Send
        </button>
      </div>

      {viewDoc && (
        <DocumentViewerModal
          docId={viewDoc.doc_id}
          snippet={viewDoc.snippet}
          page={viewDoc.page}
          onClose={() => setViewDoc(null)}
        />
      )}
    </div>
  );
}
