/**
 * HAQ Response Manager Dashboard
 *
 * Closes Weave.bio Gap #1: Dedicated Health Authority Question management.
 *
 * Features:
 *  - Dashboard: active letters, question counts, urgency indicators
 *  - Question-by-question tracking with status pipeline
 *  - AI-generated draft responses with source traceability
 *  - Cross-functional assignment (CMC, Nonclinical, Clinical, Regulatory)
 *  - Review/approval workflow with comments
 *  - Deadline tracking with urgency alerts
 *
 * Claude UI: warm sand, terracotta, minimal, generous whitespace.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquareWarning, ChevronRight, Clock, AlertTriangle,
  User, Sparkles, Send, CheckCircle2, Eye, FileText,
  ArrowRight, Loader2, MessageCircle, Shield, Building2,
  CircleDot, ExternalLink,
} from 'lucide-react';

interface HAQDashboardStats {
  activeLetters: number;
  totalQuestions: number;
  unanswered: number;
  inDrafting: number;
  inReview: number;
  approved: number;
  overdue: number;
  urgent: number;
  byAgency: Record<string, number>;
  byPriority: Record<string, number>;
}

interface HAQuestion {
  id: string;
  submissionId: string;
  agency: string;
  questionNumber: number;
  questionText: string;
  section: string;
  module: string;
  priority: 'critical' | 'major' | 'minor';
  status: string;
  assignee?: string;
  assigneeDepartment?: string;
  draftResponse?: string;
  aiConfidence?: number;
  sourceReferences?: { docId: string; section: string; excerpt: string }[];
  reviewComments?: { reviewer: string; comment: string; timestamp: string }[];
  deadline: string;
  daysRemaining: number;
}

interface HAQLetter {
  id: string;
  submissionId: string;
  agency: string;
  letterType: string;
  receivedDate: string;
  responseDeadline: string;
  totalQuestions: number;
  answeredQuestions: number;
  status: string;
  questions: HAQuestion[];
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: '#FEF3C7', text: '#92400E', label: 'New' },
  assigned: { bg: '#DBEAFE', text: '#1E40AF', label: 'Assigned' },
  drafting: { bg: '#E0E7FF', text: '#3730A3', label: 'Drafting' },
  in_review: { bg: '#FDE68A', text: '#78350F', label: 'In Review' },
  approved: { bg: '#D1FAE5', text: '#065F46', label: 'Approved' },
  submitted: { bg: '#D1FAE5', text: '#065F46', label: 'Submitted' },
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: '#FEE2E2', text: '#991B1B' },
  major: { bg: '#FEF3C7', text: '#92400E' },
  minor: { bg: '#F5F4EF', text: '#6B6962' },
};

const AGENCY_LABELS: Record<string, string> = {
  fda: 'FDA', ema: 'EMA', pmda: 'PMDA', hc: 'Health Canada',
};

export default function HAQManagerDashboard() {
  const [stats, setStats] = useState<HAQDashboardStats | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<HAQLetter | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<HAQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiDrafting, setAiDrafting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/haq-manager/dashboard').then(r => r.json()),
      fetch('/api/haq-manager/letters/letter-001').then(r => r.json()),
    ]).then(([dashData, letterData]) => {
      setStats(dashData.data);
      setSelectedLetter(letterData.data);
    }).catch(() => {
      // Fallback demo data
      setStats({
        activeLetters: 1, totalQuestions: 4, unanswered: 2,
        inDrafting: 1, inReview: 0, approved: 1, overdue: 0, urgent: 0,
        byAgency: { fda: 4, ema: 0, pmda: 0, hc: 0 },
        byPriority: { critical: 2, major: 2, minor: 0 },
      });
    }).finally(() => setLoading(false));
  }, []);

  const generateAIDraft = useCallback(async (letterId: string, questionId: string) => {
    setAiDrafting(true);
    try {
      const res = await fetch(`/api/haq-manager/letters/${letterId}/questions/${questionId}/ai-draft`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (res.ok) {
        const data = await res.json();
        if (selectedLetter) {
          const updated = {
            ...selectedLetter,
            questions: selectedLetter.questions.map(q =>
              q.id === questionId ? data.data : q
            ),
          };
          setSelectedLetter(updated);
          setSelectedQuestion(data.data);
        }
      }
    } finally {
      setAiDrafting(false);
    }
  }, [selectedLetter]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAF9F5' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: '#D97757' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F5' }}>
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm mb-2" style={{ color: '#8A8880' }}>
            <MessageSquareWarning size={14} />
            <span>Regulatory Response</span>
            <ChevronRight size={14} />
            <span>HAQ Manager</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: '#141413' }}>
            Health Authority Question Manager
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#6B6962' }}>
            Track, draft, review, and approve responses to FDA IR, EMA D120, PMDA queries, and HC screening notices.
          </p>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-6 gap-3 mb-8">
            {[
              { label: 'Active Letters', value: stats.activeLetters, color: '#D97757' },
              { label: 'Total Questions', value: stats.totalQuestions, color: '#141413' },
              { label: 'Unanswered', value: stats.unanswered, color: '#DC2626' },
              { label: 'In Drafting', value: stats.inDrafting, color: '#3730A3' },
              { label: 'In Review', value: stats.inReview, color: '#78350F' },
              { label: 'Approved', value: stats.approved, color: '#065F46' },
            ].map(s => (
              <div
                key={s.label}
                className="rounded-lg border p-3 text-center"
                style={{ background: '#FFFFFF', borderColor: '#E8E6DC' }}
              >
                <p className="text-xl font-semibold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: '#8A8880' }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-5 gap-6">
          {/* Left: Question list */}
          <div className="col-span-2 space-y-2">
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#141413' }}>
              Questions — {selectedLetter?.letterType ?? 'FDA Information Request'}
            </h3>
            <div className="rounded-lg border overflow-hidden" style={{ background: '#FFFFFF', borderColor: '#E8E6DC' }}>
              {/* Letter header */}
              {selectedLetter && (
                <div className="px-4 py-3 border-b" style={{ borderColor: '#F5F4EF', background: '#FAF9F5' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 size={14} style={{ color: '#D97757' }} />
                    <span className="text-xs font-semibold" style={{ color: '#D97757' }}>
                      {AGENCY_LABELS[selectedLetter.agency] ?? selectedLetter.agency}
                    </span>
                    <span className="text-xs" style={{ color: '#8A8880' }}>
                      {selectedLetter.submissionId}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]" style={{ color: '#8A8880' }}>
                    <span>Received: {selectedLetter.receivedDate}</span>
                    <span className="font-semibold" style={{ color: '#DC2626' }}>
                      Deadline: {selectedLetter.responseDeadline}
                    </span>
                    <span>{selectedLetter.answeredQuestions}/{selectedLetter.totalQuestions} answered</span>
                  </div>
                </div>
              )}
              {/* Question rows */}
              {selectedLetter?.questions.map(q => {
                const statusInfo = STATUS_COLORS[q.status] ?? STATUS_COLORS.new;
                const priorityInfo = PRIORITY_COLORS[q.priority] ?? PRIORITY_COLORS.minor;
                const isSelected = selectedQuestion?.id === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => setSelectedQuestion(q)}
                    className="w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors"
                    style={{
                      borderColor: '#F5F4EF',
                      background: isSelected ? '#FAF9F5' : 'transparent',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-semibold" style={{ color: '#4D4B45' }}>
                        Q{q.questionNumber}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: priorityInfo.bg, color: priorityInfo.text }}
                      >
                        {q.priority}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto"
                        style={{ background: statusInfo.bg, color: statusInfo.text }}
                      >
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-xs line-clamp-2" style={{ color: '#4D4B45' }}>
                      {q.questionText}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px]" style={{ color: '#B0AEA5' }}>
                      <span>{q.section}</span>
                      {q.assignee && (
                        <span className="flex items-center gap-1">
                          <User size={9} /> {q.assignee}
                        </span>
                      )}
                      <span className="flex items-center gap-1 ml-auto">
                        <Clock size={9} /> {q.daysRemaining}d remaining
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Question detail */}
          <div className="col-span-3">
            {selectedQuestion ? (
              <div className="rounded-lg border" style={{ background: '#FFFFFF', borderColor: '#E8E6DC' }}>
                {/* Question header */}
                <div className="px-5 py-4 border-b" style={{ borderColor: '#F5F4EF' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <CircleDot size={14} style={{ color: '#D97757' }} />
                    <span className="text-sm font-semibold" style={{ color: '#141413' }}>
                      Question {selectedQuestion.questionNumber}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                      background: PRIORITY_COLORS[selectedQuestion.priority]?.bg,
                      color: PRIORITY_COLORS[selectedQuestion.priority]?.text,
                    }}>
                      {selectedQuestion.priority}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{
                      background: STATUS_COLORS[selectedQuestion.status]?.bg,
                      color: STATUS_COLORS[selectedQuestion.status]?.text,
                    }}>
                      {STATUS_COLORS[selectedQuestion.status]?.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]" style={{ color: '#8A8880' }}>
                    <span>{selectedQuestion.module}</span>
                    <span>{selectedQuestion.section}</span>
                    {selectedQuestion.assignee && (
                      <span className="flex items-center gap-1">
                        <User size={9} /> {selectedQuestion.assignee} ({selectedQuestion.assigneeDepartment})
                      </span>
                    )}
                  </div>
                </div>

                {/* Question text */}
                <div className="px-5 py-4 border-b" style={{ borderColor: '#F5F4EF' }}>
                  <p className="text-xs uppercase tracking-wider mb-2 font-medium" style={{ color: '#8A8880' }}>
                    Agency Question
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: '#141413' }}>
                    {selectedQuestion.questionText}
                  </p>
                </div>

                {/* Draft Response */}
                <div className="px-5 py-4 border-b" style={{ borderColor: '#F5F4EF' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-xs uppercase tracking-wider font-medium" style={{ color: '#8A8880' }}>
                      Draft Response
                    </p>
                    {selectedQuestion.aiConfidence && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#D1FAE5', color: '#065F46' }}>
                        AI Confidence: {Math.round(selectedQuestion.aiConfidence * 100)}%
                      </span>
                    )}
                  </div>

                  {selectedQuestion.draftResponse ? (
                    <div
                      className="text-sm leading-relaxed p-3 rounded-md border"
                      style={{ background: '#FAF9F5', borderColor: '#E8E6DC', color: '#4D4B45' }}
                    >
                      {selectedQuestion.draftResponse}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-xs mb-3" style={{ color: '#8A8880' }}>
                        No draft response yet
                      </p>
                      <button
                        onClick={() => selectedLetter && generateAIDraft(selectedLetter.id, selectedQuestion.id)}
                        disabled={aiDrafting}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
                        style={{ background: '#D97757', color: '#FAF9F5' }}
                      >
                        {aiDrafting ? (
                          <><Loader2 size={14} className="animate-spin" /> Generating AI Draft...</>
                        ) : (
                          <><Sparkles size={14} /> Generate AI Draft</>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Source References */}
                {selectedQuestion.sourceReferences && selectedQuestion.sourceReferences.length > 0 && (
                  <div className="px-5 py-4 border-b" style={{ borderColor: '#F5F4EF' }}>
                    <p className="text-xs uppercase tracking-wider mb-2 font-medium" style={{ color: '#8A8880' }}>
                      Source References
                    </p>
                    <div className="space-y-2">
                      {selectedQuestion.sourceReferences.map((ref, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 p-2 rounded text-xs"
                          style={{ background: '#FAF9F5' }}
                        >
                          <FileText size={12} style={{ color: '#6A9BCC', marginTop: 2 }} />
                          <div>
                            <p className="font-medium" style={{ color: '#4D4B45' }}>
                              {ref.docId} — {ref.section}
                            </p>
                            <p style={{ color: '#8A8880' }}>{ref.excerpt}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="px-5 py-4 flex items-center gap-2">
                  {selectedQuestion.draftResponse && selectedQuestion.status === 'drafting' && (
                    <>
                      <button
                        onClick={async () => {
                          if (!selectedLetter) return;
                          await fetch(`/api/haq-manager/letters/${selectedLetter.id}/questions/${selectedQuestion.id}/review`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reviewer: 'Current User' }),
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
                        style={{ background: '#D97757', color: '#FAF9F5' }}
                      >
                        <Eye size={12} /> Submit for Review
                      </button>
                      <button
                        onClick={() => selectedLetter && generateAIDraft(selectedLetter.id, selectedQuestion.id)}
                        disabled={aiDrafting}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border"
                        style={{ borderColor: '#E8E6DC', color: '#4D4B45' }}
                      >
                        <Sparkles size={12} /> Regenerate
                      </button>
                    </>
                  )}
                  {!selectedQuestion.draftResponse && selectedQuestion.status !== 'approved' && (
                    <button
                      onClick={() => selectedLetter && generateAIDraft(selectedLetter.id, selectedQuestion.id)}
                      disabled={aiDrafting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
                      style={{ background: '#D97757', color: '#FAF9F5' }}
                    >
                      {aiDrafting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      Generate AI Draft
                    </button>
                  )}
                  {selectedQuestion.status === 'approved' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: '#065F46' }}>
                      <CheckCircle2 size={14} /> Response Approved
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border p-12 text-center" style={{ background: '#FFFFFF', borderColor: '#E8E6DC' }}>
                <MessageSquareWarning size={32} className="mx-auto mb-3" style={{ color: '#B0AEA5' }} />
                <p className="text-sm" style={{ color: '#8A8880' }}>
                  Select a question from the left panel to view details, draft responses, and manage the review workflow.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Compliance footer */}
        <div className="mt-12 pt-6 border-t flex items-center gap-2 text-xs" style={{ borderColor: '#E8E6DC', color: '#B0AEA5' }}>
          <Shield size={12} />
          <span>
            FDA IR &middot; EMA D120 &middot; PMDA Inquiries &middot; HC SDN &middot;
            21 CFR Part 11 audit trails &middot; Cross-functional review gates
          </span>
        </div>
      </div>
    </div>
  );
}
