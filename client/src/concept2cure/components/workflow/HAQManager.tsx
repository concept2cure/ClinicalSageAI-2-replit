/**
 * HAQ Manager — Health Authority Question Response Workflow
 *
 * Per the Final Document System Architecture Directive §H:
 * "HAQ Response Workflow Must Become Visible"
 *
 * Workflow: Ingest questions → Organize → AI-draft responses → Review → Export
 *
 * Persistence: HAQ sessions stored as governed artifacts (type: haq_session)
 * AI Drafting: Routes through AnA streaming for full intelligence overlay
 */

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  WorkspaceCanvas,
  PageTitleHeader,
  WorkspaceStatusBadge,
} from '@/components/ui/workspace-primitives';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/design-system/patterns/EmptyState';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  MessageSquareMore,
  Plus,
  Sparkles,
  ArrowRight,
  Save,
  RotateCcw,
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

interface HAQSession {
  questions: HAQuestion[];
  savedArtifactId?: string;
}

interface AskResponse {
  answer: string;
  sources: Array<{ docTitle: string }>;
  confidence: number;
}

interface HAQManagerProps {
  projectId?: string;
  projectName?: string;
  onOpenInEditor?: (content: string, title: string) => void;
}

// ─── Status mapping for WorkspaceStatusBadge ───────────────────────────────────

const STATUS_TO_BADGE: Record<HAQuestion['status'], string> = {
  pending: 'not-started',
  drafting: 'drafting',
  drafted: 'in-review',
  reviewed: 'approved',
  finalized: 'locked',
};

// ─── Persistence helpers ───────────────────────────────────────────────────────

function getSessionKey(projectId?: string): string {
  return `haq_session_${projectId || 'global'}`;
}

function loadSession(projectId?: string): HAQSession | null {
  try {
    const raw = sessionStorage.getItem(getSessionKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    /* corrupted storage — start fresh */
    return null;
  }
}

function saveSession(session: HAQSession, projectId?: string): void {
  try {
    sessionStorage.setItem(getSessionKey(projectId), JSON.stringify(session));
  } catch {
    /* quota exceeded — silent */
  }
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
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Load persisted session on mount
  useEffect(() => {
    const session = loadSession(projectId);
    if (session?.questions?.length) {
      setQuestions(session.questions);
      toast({ title: `Restored ${session.questions.length} question${session.questions.length > 1 ? 's' : ''} from previous session` });
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save session when questions change
  useEffect(() => {
    if (questions.length > 0) {
      saveSession({ questions }, projectId);
    }
  }, [questions, projectId]);

  const handleIngestQuestions = useCallback(() => {
    if (!inputText.trim()) return;

    const lines = inputText.split(/\n(?=\d+[\.\)]\s)/).filter(l => l.trim());
    const existingCount = questions.length;
    const parsed: HAQuestion[] = lines.length > 0
      ? lines.map((line, idx) => ({
          id: `haq_${Date.now()}_${idx}`,
          questionNumber: `Q${existingCount + idx + 1}`,
          questionText: line.replace(/^\d+[\.\)]\s*/, '').trim(),
          category: 'general',
          status: 'pending' as const,
        }))
      : [{
          id: `haq_${Date.now()}_0`,
          questionNumber: `Q${existingCount + 1}`,
          questionText: inputText.trim(),
          category: 'general',
          status: 'pending' as const,
        }];

    setQuestions(prev => [...prev, ...parsed]);
    setInputText('');
    toast({ title: `${parsed.length} question${parsed.length > 1 ? 's' : ''} ingested` });
  }, [inputText, questions.length, toast]);

  const handleDraftResponse = useCallback(async (questionId: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    setDraftingId(questionId);
    setQuestions(prev =>
      prev.map(q => (q.id === questionId ? { ...q, status: 'drafting' as const } : q))
    );

    try {
      const res = await apiRequest('POST', '/api/evidence/ask', {
        question: question.questionText,
        projectId,
        context: `This is a Health Authority Question (HAQ) requiring a formal, defensible regulatory response. The response must:
- Directly address the question with specific evidence
- Reference source documents and data
- Use regulatory-appropriate language
- Anticipate follow-up questions
Submission type context: ${projectName || 'regulatory submission'}`,
      });
      const json = await res.json();
      const data = (json.data || json) as AskResponse;

      setQuestions(prev =>
        prev.map(q =>
          q.id === questionId
            ? {
                ...q,
                status: 'drafted' as const,
                responseText: data.answer || 'Response generation pending — please draft manually.',
                sources: data.sources?.map(s => s.docTitle) || [],
              }
            : q
        )
      );
      toast({ title: `Response drafted for ${question.questionNumber}` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI drafting unavailable';
      setQuestions(prev =>
        prev.map(q =>
          q.id === questionId
            ? { ...q, status: 'drafted' as const, responseText: 'AI drafting unavailable — please draft manually.' }
            : q
        )
      );
      toast({ title: 'Draft failed', description: message, variant: 'destructive' });
    } finally {
      setDraftingId(null);
    }
  }, [questions, projectId, projectName, toast]);

  const handleDraftAll = useCallback(async () => {
    const pending = questions.filter(q => q.status === 'pending');
    if (pending.length === 0) return;

    for (const q of pending) {
      await handleDraftResponse(q.id);
    }
  }, [questions, handleDraftResponse]);

  const handleSaveAsArtifact = useCallback(async () => {
    if (!projectId || questions.length === 0) return;
    setSaving(true);

    try {
      // Build combined HAQ response document
      const sections = questions
        .filter(q => q.responseText)
        .map(q => `## ${q.questionNumber}: ${q.questionText}\n\n${q.responseText}\n\n${
          q.sources?.length ? `**Sources:** ${q.sources.map((s, i) => `[${i + 1}] ${s}`).join(', ')}` : ''
        }`);

      const content = `# Health Authority Question Responses\n\n**Project:** ${projectName || projectId}\n**Date:** ${new Date().toISOString().split('T')[0]}\n**Questions:** ${questions.length}\n\n---\n\n${sections.join('\n\n---\n\n')}`;

      await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
        title: `HAQ Responses — ${new Date().toISOString().split('T')[0]}`,
        content,
        type: 'markdown',
        category: 'document',
        metadata: {
          documentType: 'haq_response',
          sourceSystem: 'haq_manager',
          generationMethod: 'ai',
          questionCount: questions.length,
          draftedCount: questions.filter(q => q.responseText).length,
        },
      });

      toast({ title: 'HAQ responses saved as governed artifact' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Save failed';
      toast({ title: 'Save failed', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [projectId, projectName, questions, toast]);

  const handleOpenInEditor = useCallback((question: HAQuestion) => {
    if (!onOpenInEditor || !question.responseText) return;
    const content = `## ${question.questionNumber}: ${question.questionText}\n\n${question.responseText}`;
    onOpenInEditor(content, `HAQ Response — ${question.questionNumber}`);
  }, [onOpenInEditor]);

  const handleOpenAllInEditor = useCallback(() => {
    if (!onOpenInEditor) return;
    const sections = questions
      .filter(q => q.responseText)
      .map(q => `## ${q.questionNumber}: ${q.questionText}\n\n${q.responseText}`);
    if (sections.length === 0) return;
    onOpenInEditor(sections.join('\n\n---\n\n'), `HAQ Responses — ${projectName || 'Complete'}`);
  }, [onOpenInEditor, questions, projectName]);

  const handleClearSession = useCallback(() => {
    if (questions.length > 0 && !window.confirm(`Clear all ${questions.length} questions? This cannot be undone.`)) {
      return;
    }
    setQuestions([]);
    setSelectedQuestion(null);
    sessionStorage.removeItem(getSessionKey(projectId));
    toast({ title: 'HAQ session cleared' });
  }, [projectId, questions.length, toast]);

  const selected = questions.find(q => q.id === selectedQuestion);
  const pendingCount = questions.filter(q => q.status === 'pending').length;
  const draftedCount = questions.filter(q => q.responseText).length;

  return (
    <WorkspaceCanvas maxWidth="3xl" testId="haq-manager">
      <PageTitleHeader
        title="HAQ Response Manager"
        subtitle={projectName ? `for ${projectName}` : 'Health Authority Question workflow'}
      />

      {/* ── Ingest area ── */}
      <div className="mt-4 mb-6">
        <label htmlFor="haq-input" className="text-xs font-medium text-zinc-500 block mb-1.5">
          Paste Health Authority Questions
        </label>
        <Textarea
          id="haq-input"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder="Paste questions from FDA, EMA, or other health authority. Numbered questions will be parsed automatically."
          className="min-h-[80px] text-sm"
          aria-label="Health Authority Questions input"
        />
        <div className="flex items-center gap-2 mt-2">
          <Button
            size="sm"
            onClick={handleIngestQuestions}
            disabled={!inputText.trim()}
            aria-label="Ingest questions"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Ingest Questions
          </Button>
          {questions.length > 0 && (
            <>
              {pendingCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDraftAll}
                  disabled={!!draftingId}
                  aria-label="Draft all pending responses"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Draft All ({pendingCount})
                </Button>
              )}
              {draftedCount > 0 && projectId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveAsArtifact}
                  disabled={saving}
                  aria-label="Save all responses as artifact"
                >
                  {saving ? <Spinner size="sm" className="mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                  Save as Artifact
                </Button>
              )}
              {draftedCount > 1 && onOpenInEditor && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenAllInEditor}
                  aria-label="Open all responses in editor"
                >
                  <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                  Open All in Editor
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={handleClearSession}
                aria-label="Clear HAQ session"
                className="ml-auto text-zinc-400 hover:text-zinc-600"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Clear
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Questions list ── */}
      {questions.length === 0 ? (
        <EmptyState
          icon={<MessageSquareMore className="w-8 h-8" />}
          title="No questions ingested yet"
          description="Paste questions above to start the HAQ response workflow. Also available: type /haq in AnA chat."
          testId="haq-empty"
        />
      ) : (
        <div className="flex gap-4 min-h-[400px]" role="region" aria-label="HAQ questions and responses">
          {/* Question list */}
          <div className="w-1/3 space-y-1 border-r border-zinc-100 pr-4" role="listbox" aria-label="Questions">
            <p className="text-xs font-medium text-zinc-500 mb-2">
              {questions.length} question{questions.length !== 1 ? 's' : ''} · {draftedCount} drafted
            </p>
            {questions.map(q => (
              <Button
                key={q.id}
                variant="ghost"
                size="sm"
                onClick={() => setSelectedQuestion(q.id)}
                role="option"
                aria-selected={selectedQuestion === q.id}
                aria-label={`${q.questionNumber}: ${q.questionText.slice(0, 50)}`}
                data-testid={`haq-question-${q.questionNumber}`}
                className={cn(
                  'w-full justify-start text-left h-auto py-2 px-3',
                  selectedQuestion === q.id && 'bg-zinc-100 border border-zinc-200'
                )}
              >
                <div className="w-full">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-700 text-xs">{q.questionNumber}</span>
                    <WorkspaceStatusBadge status={STATUS_TO_BADGE[q.status]} />
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{q.questionText}</p>
                </div>
              </Button>
            ))}
          </div>

          {/* Selected question detail */}
          <div className="flex-1" role="region" aria-label="Question detail" aria-live="polite">
            {selected ? (
              <div data-testid="haq-detail">
                <h3 className="text-sm font-semibold text-zinc-800">
                  {selected.questionNumber}: {selected.questionText}
                </h3>

                <div className="flex gap-2 mt-3">
                  {selected.status === 'pending' && (
                    <Button
                      size="sm"
                      onClick={() => handleDraftResponse(selected.id)}
                      disabled={draftingId === selected.id}
                      aria-label={`AI draft response for ${selected.questionNumber}`}
                    >
                      {draftingId === selected.id ? (
                        <Spinner size="sm" className="mr-1.5" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      {draftingId === selected.id ? 'Drafting...' : 'AI Draft Response'}
                    </Button>
                  )}
                  {selected.responseText && onOpenInEditor && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenInEditor(selected)}
                      aria-label={`Open ${selected.questionNumber} response in editor`}
                    >
                      <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                      Open in Editor
                    </Button>
                  )}
                </div>

                {draftingId === selected.id && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-blue-600" role="status" aria-live="polite" aria-busy="true">
                    <Spinner size="sm" />
                    Drafting response from project documents...
                  </div>
                )}

                {selected.responseText && (
                  <div className="mt-4 p-3 rounded-lg bg-zinc-50 border border-zinc-200" data-testid="haq-response">
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
              <EmptyState
                title="Select a question"
                description="Click a question on the left to view or draft a response."
                testId="haq-no-selection"
              />
            )}
          </div>
        </div>
      )}
    </WorkspaceCanvas>
  );
};

export default HAQManager;
