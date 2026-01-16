import React, { useEffect, useState } from 'react';
import { Send, Bot, Sparkles, FileText, X } from 'lucide-react';

export function AIPanel({ initialContext, onClearContext }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'I am ready to help. Drag a table or listing here to start drafting.' }
  ]);
  const [input, setInput] = useState('');
  const [context, setContext] = useState(null); // Stores the dropped artifact
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!initialContext) return;
    setContext(initialContext);

    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `I have analyzed **${initialContext.label}**. Would you like me to draft a summary of the efficacy results?`,
      },
    ]);
  }, [initialContext]);

  const parseDroppedPayload = (dt) => {
    if (!dt) return null;

    const candidates = [
      dt.getData('application/x-clinical-data'),
      dt.getData('application/json'),
      dt.getData('text/plain'),
    ].filter(Boolean);

    for (const raw of candidates) {
      const trimmed = String(raw).trim();
      if (!trimmed) continue;
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue;
      try {
        return JSON.parse(trimmed);
      } catch {
        // try next
      }
    }

    return null;
  };

  // --- 1. HANDLE DROPPED DATA ---
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const payload = parseDroppedPayload(e.dataTransfer);
    if (!payload) return;

    const label = payload.sourceId || payload.label || payload.id || 'Clinical Artifact';
    setContext({
      label,
      type: payload.type || 'Clinical Artifact',
      meta: payload,
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  // --- 2. HANDLE SEND ---
  const handleSend = () => {
    if (!input.trim() && !context) return;

    // User Message
    const userMsg = { role: 'user', content: input, context };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setContext(null);

    // Mock AI Response (Simulating "Grounding")
    setTimeout(() => {
      let aiContent = "I can help with that.";
      
      // If user provided specific context, give a specific answer
      const contextKey = String(userMsg.context?.label || userMsg.context?.meta?.label || userMsg.context?.meta?.sourceId || '');
      if (userMsg.context && contextKey.includes('14.2.1')) {
        aiContent = "Based on **Table 14.2.1 (PFS)**, here is a draft summary:\n\n" +
        "> The study met its primary endpoint. Treatment with the study drug resulted in a statistically significant improvement in PFS compared to placebo (HR: 0.45; 95% CI: 0.32, 0.58; p<0.0001). The median PFS was 18.2 months vs 8.4 months in the control arm.";
      } else if (userMsg.context) {
        aiContent = `I have analyzed **${userMsg.context.label}**. Would you like me to summarize the safety signals or efficacy trends?`;
      }

      setMessages(prev => [...prev, { role: 'assistant', content: aiContent }]);
    }, 1200);
  };

  return (
    <div 
        className={`flex flex-col h-full bg-gray-50 ${isDragOver ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
    >
      {/* MESSAGES AREA */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.role === 'assistant' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
              {m.role === 'assistant' ? <Bot size={16} /> : <div className="text-xs font-bold">ME</div>}
            </div>
            <div className={`max-w-[85%] space-y-2`}>
              {/* RENDER ATTACHED CONTEXT CHIP */}
              {m.context && (
                <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs flex items-center gap-2 text-blue-800">
                    <FileText size={12} />
                    <span className="font-mono font-bold">{m.context.label}</span>
                </div>
              )}
              {/* MESSAGE BUBBLE */}
              <div className={`p-3 text-sm rounded-lg shadow-sm whitespace-pre-wrap ${m.role === 'assistant' ? 'bg-white text-gray-800 border border-gray-200' : 'bg-blue-600 text-white'}`}>
                {m.content}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* INPUT AREA */}
      <div className="p-3 bg-white border-t border-gray-200">
        {/* STAGED CONTEXT INDICATOR */}
        {context && (
            <div className="mb-2 flex items-center justify-between bg-blue-50 px-3 py-1.5 rounded text-xs border border-blue-100 text-blue-700 animate-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2">
                    <Sparkles size={12} />
                    <span>Context: <strong>{context.label}</strong></span>
                </div>
                <button
                  onClick={() => {
                    setContext(null);
                    onClearContext?.();
                  }}
                  className="hover:bg-blue-100 p-1 rounded"
                  aria-label="Clear context"
                >
                  <X size={12} />
                </button>
            </div>
        )}
        
        <div className="relative">
          <input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={context ? "Ask about this data..." : "Ask AI or drag data here..."}
            className="w-full pl-4 pr-10 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button 
            onClick={handleSend}
            className="absolute right-2 top-2 p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
