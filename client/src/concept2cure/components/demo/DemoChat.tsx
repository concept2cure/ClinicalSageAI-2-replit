/**
 * @fileoverview DemoChat — AnA narration panel with typewriter effect
 * @module concept2cure/components/demo/DemoChat
 *
 * Left panel of the interactive demo. Renders a chat-style conversation
 * where AnA narrates and the client makes choices.
 */

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { DemoChoice } from './demo-content';

marked.setOptions({ breaks: true, gfm: true });

const renderMarkdown = (content: string): string => {
  try {
    const raw = marked.parse(content) as string;
    return DOMPurify.sanitize(raw);
  } catch {
    return content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'ana' | 'user';
  content: string;
  /** Choices to show after this message (ana only) */
  choices?: DemoChoice[];
}

interface DemoChatProps {
  messages: ChatMessage[];
  /** Whether AnA is currently "typing" the latest message */
  isTyping: boolean;
  /** The partially revealed text during typewriter animation */
  typedText: string;
  /** Called when user clicks a choice */
  onChoiceSelect: (choice: DemoChoice) => void;
  /** Whether choices should be visible (only after typing completes) */
  showChoices: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const DemoChat: React.FC<DemoChatProps> = ({
  messages,
  isTyping,
  typedText,
  onChoiceSelect,
  showChoices,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or typing progress
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, typedText]);

  return (
    <div className="flex flex-col h-full bg-white/80 backdrop-blur-sm border-r border-stone-200/60">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-200/60">
        <div className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-stone-900">AnA 1.0</p>
          <p className="text-xs text-stone-500">Regulatory Intelligence Co-Pilot</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => {
            const isLast = idx === messages.length - 1;
            const isAnaLastTyping = isLast && msg.role === 'ana' && isTyping;

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'flex gap-2',
                  msg.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                {msg.role === 'ana' && (
                  <div className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center flex-shrink-0 mt-1">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                )}

                <div
                  className={cn(
                    'max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'ana'
                      ? 'bg-stone-100 text-stone-900'
                      : 'bg-stone-700 text-white',
                  )}
                >
                  {msg.role === 'ana' ? (
                    <div
                      className="prose prose-sm prose-stone max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ul]:pl-4"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(
                          isAnaLastTyping ? typedText : msg.content,
                        ),
                      }}
                    />
                  ) : (
                    <span>{msg.content}</span>
                  )}

                  {/* Typing cursor */}
                  {isAnaLastTyping && (
                    <motion.span
                      animate={{ opacity: [1, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                      className="inline-block w-0.5 h-4 bg-violet-500 ml-0.5 align-middle"
                    />
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Choices — shown after the latest AnA message finishes typing */}
        {showChoices && messages.length > 0 && (() => {
          const lastMsg = messages[messages.length - 1];
          if (lastMsg.role !== 'ana' || !lastMsg.choices?.length) return null;

          return (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-2 pl-8"
            >
              {lastMsg.choices.map((choice, i) => (
                <motion.button
                  key={choice.nextStepId}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.2 }}
                  onClick={() => onChoiceSelect(choice)}
                  className={cn(
                    'text-left px-4 py-2.5 rounded-xl border text-sm transition-all duration-150',
                    'border-blue-200 bg-white hover:bg-blue-50 hover:border-violet-400',
                    'text-stone-700 hover:text-stone-700',
                    'shadow-sm hover:shadow-md',
                  )}
                >
                  <span className="font-medium">{choice.label}</span>
                  {choice.description && (
                    <span className="text-xs text-stone-400 ml-2">{choice.description}</span>
                  )}
                </motion.button>
              ))}
            </motion.div>
          );
        })()}
      </div>
    </div>
  );
};
