/**
 * HAQ Manager — Health Authority Question Response Workflow
 *
 * Per the Final Document System Architecture Directive §H:
 * "HAQ Response Workflow Must Become Visible"
 *
 * Workflow: Ingest questions → Organize → AI-draft responses → Review → Export
 *
 * Backend: ema-question-taxonomy-service.ts, crl-trigger-service.ts
 * This component surfaces that capability as a visible workflow.
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { WorkspaceCanvas, PageTitleHeader } from '@/components/ui/workspace-primitives';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquareMore,
  Plus,
  Sparkles,
  CheckCircle2,
  Clock,
  FileText,
  ArrowRight,
  Send,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface HAQuestion {
  id: string;
  questionNumber: string;
  questionText: string;
  category: string;
  status: 'pending' | 'drafting' | 'drafted' | 'reviewed' | 'finalized';
  responseText?: string;
  sources?: string[];
}

interface HAQManagerProps {
  projectId?: string;
  projectName?: string;
  onOpenInEditor?: (content: string, title: string) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export const HAQManager: React.FC<HAQManagerProps> = ({
  projectId,
  projectName,
  onOpenInEditor,
}) => {
  const [questions, setQuestions] = useState<HAQuestion[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);

  const handleIngestQuestions = useCallback(() => {
    if (!inputText.trim()) return;

    // Parse questions from pasted text (split by numbered lines or double newlines)
    const lines = inputText.split(/\n(?=\d+[\.\)]\s)/).filter(l => l.trim());
    const parsed: HAQuestion[] = lines.map((line, idx) => ({
      id: `haq_${Date.now()}_${idx}`,
      questionNumber: `Q${idx + 1}`,
      questionText: line.replace(/^\d+[\.\)]\s*/, '').trim(),
      category: 'general',
      status: 'pending' as const,
    }));

    if (parsed.length === 0) {
      // Single question
      parsed.push({
        id: `haq_${Date.now()}_0`,
        questionNumber: 'Q1',
        questionText: inputText.trim(),
        category: 'general',
        status: 'pending',
      });
    }

    setQuestions(prev => [...prev, ...parsed]);
    setInputText('');
  }, [inputText]);

  const handleDraftResponse = useCallback(async (questionId: string) => {
    setQuestions(prev =>
      prev.map(q => (q.id === questionId ? { ...q, status: 'drafting' as const } : q))
    );

    // Call the evidence/ask endpoint for AI-drafted response
    try {
      const question = questions.find(q => q.id === questionId);
      if (!question) return;

      const response = await fetch('/api/evidence/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('trialsage_access_token') || ''}`,
        },
        body: JSON.stringify({
          question: question.questionText,
          projectId,
          context: `This is a Health Authority Question requiring a formal regulatory response. Provide a complete, defensible response with source citations.`,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setQuestions(prev =>
          prev.map(q =>
            q.id === questionId
              ? {
                  ...q,
                  status: 'drafted' as const,
                  responseText: data.answer || 'Response generation pending — please draft manually.',
                  sources: data.sources?.map((s: { docTitle: string }) => s.docTitle) || [],
                }
              : q
          )
        );
      } else {
        setQuestions(prev =>
          prev.map(q =>
            q.id === questionId
              ? { ...q, status: 'drafted' as const, responseText: 'AI drafting unavailable — please draft manually.' }
              : q
          )
        );
      }
    } catch {
      setQuestions(prev =>
        prev.map(q =>
          q.id === questionId
            ? { ...q, status: 'drafted' as const, responseText: 'AI drafting unavailable — please draft manually.' }
            : q
        )
      );
    }
  }, [questions, projectId]);

  const handleOpenInEditor = useCallback((question: HAQuestion) => {
    if (!onOpenInEditor || !question.responseText) return;
    const content = `## ${question.questionNumber}: ${question.questionText}\n\n${question.responseText}`;
    onOpenInEditor(content, `HAQ Response — ${question.questionNumber}`);
  }, [onOpenInEditor]);

  const statusConfig = {
    pending: { label: 'Pending', color: 'bg-zinc-100 text-zinc-600', icon: Clock },
    drafting: { label: 'Drafting...', color: 'bg-blue-50 text-blue-700', icon: Sparkles },
    drafted: { label: 'Drafted', color: 'bg-amber-50 text-amber-700', icon: FileText },
    reviewed: { label: 'Reviewed', color: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
    finalized: { label: 'Finalized', color: 'bg-blue-50 text-blue-700', icon: Send },
  };

  const selected = questions.find(q => q.id === selectedQuestion);

  return (
    <WorkspaceCanvas maxWidth="3xl" testId="haq-manager">
      <PageTitleHeader
        title="HAQ Response Manager"
        subtitle={projectName ? `for ${projectName}` : 'Health Authority Question workflow'}
      />

      {/* ── Ingest area ── */}
      <div className="mt-4 mb-6">
        <label className="text-xs font-medium text-zinc-500 block mb-1.5">
          Paste Health Authority Questions
        </label>
        <Textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder="Paste questions from FDA, EMA, or other health authority. Numbered questions will be parsed automatically."
          className="min-h-[80px] text-sm"
        />
        <Button
          size="sm"
          className="mt-2"
          onClick={handleIngestQuestions}
          disabled={!inputText.trim()}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Ingest Questions
        </Button>
      </div>

      {/* ── Questions list ── */}
      {questions.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          <MessageSquareMore className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No questions ingested yet.</p>
          <p className="text-xs mt-1">Paste questions above to start the HAQ response workflow.</p>
        </div>
      ) : (
        <div className="flex gap-4 min-h-[400px]">
          {/* Question list */}
          <div className="w-1/3 space-y-1 border-r border-zinc-100 pr-4">
            <p className="text-xs font-medium text-zinc-500 mb-2">
              {questions.length} question{questions.length !== 1 ? 's' : ''}
            </p>
            {questions.map(q => {
              const config = statusConfig[q.status];
              return (
                <button
                  key={q.id}
                  onClick={() => setSelectedQuestion(q.id)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg transition-colors text-sm',
                    selectedQuestion === q.id
                      ? 'bg-zinc-100 border border-zinc-200'
                      : 'hover:bg-zinc-50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-700">{q.questionNumber}</span>
                    <Badge variant="outline" className={cn('text-[10px]', config.color)}>
                      {config.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{q.questionText}</p>
                </button>
              );
            })}
          </div>

          {/* Selected question detail */}
          <div className="flex-1">
            {selected ? (
              <div>
                <h3 className="text-sm font-semibold text-zinc-800">
                  {selected.questionNumber}: {selected.questionText}
                </h3>

                <div className="flex gap-2 mt-3">
                  {selected.status === 'pending' && (
                    <Button size="sm" onClick={() => handleDraftResponse(selected.id)}>
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      AI Draft Response
                    </Button>
                  )}
                  {selected.responseText && onOpenInEditor && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenInEditor(selected)}
                    >
                      <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                      Open in Editor
                    </Button>
                  )}
                </div>

                {selected.status === 'drafting' && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    Drafting response from project documents...
                  </div>
                )}

                {selected.responseText && (
                  <div className="mt-4 p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                    <p className="text-xs font-medium text-zinc-500 mb-1">Draft Response</p>
                    <div className="text-sm text-zinc-700 whitespace-pre-wrap">
                      {selected.responseText}
                    </div>
                    {selected.sources && selected.sources.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-zinc-200">
                        <p className="text-[10px] font-medium text-zinc-400 mb-1">Sources</p>
                        {selected.sources.map((source, i) => (
                          <span key={i} className="text-[10px] text-zinc-500 mr-2">
                            [{i + 1}] {source}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-16 text-zinc-400">
                <p className="text-sm">Select a question to view or draft a response</p>
              </div>
            )}
          </div>
        </div>
      )}
    </WorkspaceCanvas>
  );
};

export default HAQManager;
