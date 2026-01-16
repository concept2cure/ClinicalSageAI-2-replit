import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../lib/database';
import { 
  MessageSquare, CheckCircle, User, Bot, 
  MoreHorizontal, Reply, X, Zap, ArrowRight,
  AlertTriangle, Eye
} from 'lucide-react';

// --- MOCK INTELLIGENT THREADS ---
const INITIAL_THREADS = [
  {
    id: 't1',
    status: 'OPEN',
    target: 'Section 2.1 (Efficacy)',
    anchorId: 'sec-2.1', // ID for auto-scroll
    comments: [
      { 
        id: 'c1', 
        author: 'Dr. Sarah J.', 
        role: 'Medical Director', 
        text: 'The estimand definition here seems vague. Please align with the new SAP amendment.', 
        time: '2h ago' 
      }
    ]
  },
  {
    id: 't2',
    status: 'CRITICAL', // System Flag
    target: 'Table 14.2.1 (Primary Endpoint)',
    anchorId: 'tbl-14.2',
    type: 'SYSTEM', 
    comments: [
      { 
        id: 'c2', 
        author: 'ClinicalSage System', 
        role: 'BOT', 
        text: '⚠️ Data Update Detected: Primary Endpoint HR changed from 0.48 to 0.45 in the source database.', 
        time: '10m ago',
        actionable: true // Triggers the "Fix It" button
      }
    ]
  }
];

function toRelativeTime(isoString) {
  if (!isoString) return 'Just now';
  const timestamp = new Date(isoString).getTime();
  if (Number.isNaN(timestamp)) return 'Just now';
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

export function ReviewPanel({ onFocusNode, onApplyFix, docId, tenantId, focusThreadId }) {
  const [threads, setThreads] = useState(INITIAL_THREADS);
  const [replyText, setReplyText] = useState('');
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [highlightThreadId, setHighlightThreadId] = useState(null);

  const getThreadTargetLabel = (thread) => {
    const target = thread?.target;
    if (typeof target === 'string') return target;
    if (target && typeof target === 'object') {
      return target.artifactId || target.sourceId || 'Data refresh';
    }
    return 'Comment';
  };

  const handleOpenThread = (thread) => {
    if (!thread) return;
    setHighlightThreadId(thread.id);
    if (onFocusNode && thread.anchorId) onFocusNode(thread.anchorId);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!docId) return;
      try {
        const live = await db.getThreads(docId, tenantId);
        if (!cancelled && Array.isArray(live) && live.length) {
          // Normalize timestamps for display
          const normalized = live.map((t) => ({
            ...t,
            comments: (t.comments ?? []).map((c) => ({
              ...c,
              time: c.time ?? toRelativeTime(c.timestamp),
            })),
          }));
          setThreads(normalized);
        }
      } catch {
        // ignore (fallback to demo threads)
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [docId, tenantId]);

  useEffect(() => {
    if (!focusThreadId) return;
    setHighlightThreadId(focusThreadId);
    const t = setTimeout(() => setHighlightThreadId(null), 6000);
    return () => clearTimeout(t);
  }, [focusThreadId]);

  const handleResolve = (id, e) => {
    e.stopPropagation();
    setThreads(prev => prev.map(t => t.id === id ? { ...t, status: 'RESOLVED' } : t));
  };

  const handleReply = (threadId) => {
    if (!replyText.trim()) return;
    setThreads(prev => prev.map(t => {
      if (t.id === threadId) {
        return {
          ...t,
          comments: [...t.comments, { 
             id: `c${Date.now()}`, 
             author: 'You', 
             role: 'Medical Writer', 
             text: replyText, 
             time: 'Just now' 
          }]
        };
      }
      return t;
    }));
    setReplyText('');
    setActiveThreadId(null);
  };

  // --- THE "ACTIONABLE BOT" HANDLER ---
  const handleSystemAction = (thread) => {
    const threadId = thread?.id;

    // 1. Execute the fix (Update document)
    // Prefer a targeted SmartTag update when we have an anchorId.
    onApplyFix && onApplyFix({
      target: 'HR_PFS',
      value: '0.45',
      smartTagId: thread?.anchorId || null,
    });
    
    // 2. Auto-resolve the thread with a success message
    setThreads(prev => prev.map(t => {
      if (t.id === threadId) {
        return {
          ...t,
          status: 'RESOLVED',
          comments: [...t.comments, {
             id: `c${Date.now()}`,
             author: 'System',
             role: 'BOT',
             text: '✅ Update applied. Document is now consistent with Source v2.1.',
             time: 'Just now',
             isSuccess: true
          }]
        };
      }
      return t;
    }));
  };

  const activeThreads = threads.filter(t => t.status !== 'HIDDEN');
  const criticalCount = useMemo(
    () => activeThreads.filter((t) => t.status === 'CRITICAL' || t.type === 'SYSTEM').length,
    [activeThreads]
  );

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* HEADER */}
      <div className="p-3 border-b border-gray-200 bg-white shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
          <MessageSquare size={16} className="text-orange-500" />
          <span>Collaboration Hub</span>
        </div>
        <div className="flex gap-2">
            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 rounded font-bold flex items-center gap-1">
              <AlertTriangle size={8} /> {criticalCount} Critical
            </span>
            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 rounded font-bold">
               {activeThreads.filter(t => t.status === 'OPEN').length} Open
            </span>
        </div>
      </div>

      {/* THREAD LIST */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeThreads.map(thread => (
          <div 
            key={thread.id} 
            className={`
                bg-white rounded-lg border shadow-sm transition-all relative group
                ${thread.type === 'SYSTEM' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-orange-400'}
                ${thread.status === 'RESOLVED' ? 'opacity-60 grayscale' : ''}
                ${highlightThreadId === thread.id ? 'ring-2 ring-red-300' : ''}
            `}
          >
             {/* ANCHOR HEADER (Click to Jump) */}
             <div 
               onClick={() => handleOpenThread(thread)}
               className="p-2 border-b border-gray-50 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
               title="Click to jump to section"
             >
                <div className="flex items-center gap-1 text-[10px] text-gray-500 font-bold uppercase tracking-wide">
                   <Eye size={10} className="text-gray-400" />
                   {getThreadTargetLabel(thread)}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenThread(thread);
                    }}
                    className="hidden group-hover:inline-flex text-gray-400 hover:text-orange-600 p-1"
                    title="Open in editor"
                  >
                    <ArrowRight size={14} />
                  </button>
                  {thread.status !== 'RESOLVED' && (
                      <button onClick={(e) => handleResolve(thread.id, e)} className="text-gray-400 hover:text-green-600 p-1" title="Mark Resolved">
                      <CheckCircle size={14} />
                      </button>
                  )}
                </div>
             </div>

             {/* COMMENTS STREAM */}
             <div className="p-3 space-y-3">
                {thread.comments.map(comment => (
                   <div key={comment.id} className="flex gap-2 relative">
                      {/* AVATAR */}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 border border-white shadow-sm
                          ${comment.role === 'BOT' ? (comment.isSuccess ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600') : 'bg-blue-100 text-blue-600'}
                      `}>
                         {comment.role === 'BOT' ? <Bot size={12} /> : <User size={12} />}
                      </div>
                      
                      {/* MESSAGE CONTENT */}
                      <div className="flex-1">
                         <div className="flex items-baseline justify-between">
                            <span className="text-xs font-bold text-gray-900">{comment.author}</span>
                            <span className="text-[9px] text-gray-400">{comment.time}</span>
                         </div>
                         <p className={`text-xs mt-0.5 leading-relaxed ${comment.isSuccess ? 'text-green-700 font-medium' : 'text-gray-700'}`}>
                            {comment.text}
                         </p>

                         {/* SYSTEM ACTION BUTTON */}
                         {comment.actionable && thread.status !== 'RESOLVED' && (
                             <button 
                               onClick={() => handleSystemAction(thread)}
                               className="mt-2 flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded text-[10px] font-bold hover:bg-red-100 transition-colors"
                             >
                                <Zap size={10} />
                                Accept System Update
                             </button>
                         )}
                      </div>
                   </div>
                ))}
             </div>

             {/* REPLY FOOTER */}
             {thread.status !== 'RESOLVED' && (
                 <div className="p-2 border-t border-gray-100 bg-gray-50/50 rounded-b-lg">
                    {activeThreadId === thread.id ? (
                    <div className="flex items-center gap-2 animate-in slide-in-from-top-1">
                        <input 
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleReply(thread.id)}
                            placeholder="Type reply..."
                            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-orange-500 outline-none"
                            autoFocus
                        />
                        <button onClick={() => handleReply(thread.id)} className="p-1 bg-orange-500 text-white rounded hover:bg-orange-600"><ArrowRight size={12} /></button>
                        <button onClick={() => setActiveThreadId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={12} /></button>
                    </div>
                    ) : (
                    <button 
                        onClick={() => setActiveThreadId(thread.id)}
                        className="w-full text-left text-[10px] text-gray-400 hover:text-orange-600 flex items-center gap-1 transition-colors"
                    >
                        <Reply size={10} /> Reply...
                    </button>
                    )}
                 </div>
             )}
          </div>
        ))}
        
        {/* EMPTY STATE */}
        {activeThreads.length === 0 && (
           <div className="text-center py-10 text-gray-400">
              <CheckCircle size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-xs font-medium">Collaboration complete.</p>
           </div>
        )}
      </div>
    </div>
  );
}
