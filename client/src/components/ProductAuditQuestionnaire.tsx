import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { ChevronRight, CheckCircle2, AlertTriangle, Circle, TrendingUp } from 'lucide-react';

type QuestionStatus = 'yes' | 'no' | 'partial' | null;
type GapSeverity = 'p0' | 'p1' | 'p2' | 'p3' | 'verified' | null;

interface AuditQuestion {
  id: string;
  question: string;
  evidenceItems?: string[];
}

interface AuditSection {
  id: number;
  title: string;
  questions: AuditQuestion[];
}

interface AuditResponse {
  questionId: string;
  status: QuestionStatus;
  notes: string;
  severity: GapSeverity;
  updatedAt: string;
}

const AUDIT_SECTIONS: AuditSection[] = [
  {
    id: 1, title: "Draft & Iterate",
    questions: [
      { id: "1.1", question: "Does C2C have a functional AI template engine with variable population?" },
      { id: "1.2", question: "Can templates maintain context across iterative refinements without losing data?" },
      { id: "1.3", question: "Does the system support Module 1 content generation (including IB)?" },
      { id: "1.4", question: "Does the system support Module 2, 3, and 5 content generation?" },
      { id: "1.5", question: "Is there a user interface for customizing AI templates?" },
      { id: "1.6", question: "Can users refine and improve work over time with full audit trail?" },
      { id: "1.8", question: "Are there purpose-built templates for different submission types (IND, NDA, BLA, MAA)?" },
    ]
  },
  {
    id: 2, title: "Assemble",
    questions: [
      { id: "2.1", question: "Is submission formatting automated (eCTD compliance)?" },
      { id: "2.2", question: "Does the system auto-handle table/figure insertion and formatting?" },
      { id: "2.3", question: "Are intra-document citations automatically managed and kept current?" },
      { id: "2.4", question: "Are inter-document citations automatically managed and kept current?" },
      { id: "2.5", question: "Are literature references automatically managed and kept current?" },
      { id: "2.7", question: "Is there a validation system for eCTD formatting before publishing?" },
    ]
  },
  {
    id: 3, title: "Review",
    questions: [
      { id: "3.1", question: "Is there a live shared workspace for real-time collaboration?" },
      { id: "3.2", question: "Can multiple users comment simultaneously without conflict?" },
      { id: "3.3", question: "Are comments, context, and redline suggestions displayed side-by-side?" },
      { id: "3.4", question: "Is there a resolution workflow for comment threads?" },
      { id: "3.5", question: "Can teams track alignment status and resolution velocity?" },
      { id: "3.7", question: "Are there built-in checks to catch issues early in review?" },
    ]
  },
  {
    id: 4, title: "Verify",
    questions: [
      { id: "4.1", question: "Can users track every claim back to its source at sentence level?" },
      { id: "4.2", question: "Is automated data verification implemented and functional?" },
      { id: "4.3", question: "Can users click any sentence to view exact source file?" },
      { id: "4.4", question: "Are relevant keywords displayed with source linkage?" },
      { id: "4.6", question: "Is there confidence scoring for data integrity?" },
      { id: "4.7", question: "Can verification reports be exported for regulatory inspection?" },
    ]
  },
  {
    id: 5, title: "Publish",
    questions: [
      { id: "5.1", question: "Is there section status tracking for submission progress?" },
      { id: "5.2", question: "Is built-in eCTD publishing functionality available?" },
      { id: "5.3", question: "Is there version history with restore capabilities?" },
      { id: "5.4", question: "Can documents be exported in DOCX format?" },
      { id: "5.5", question: "Are there other export formats (PDF, XML for eCTD)?" },
      { id: "5.7", question: "Is there a final validation check before publishing?" },
    ]
  },
  {
    id: 6, title: "AI/ML: Data Integration",
    questions: [
      { id: "6.1", question: "Does smart extraction pull key data from hundreds of source files?" },
      { id: "6.2", question: "Is extraction automatic without manual hunting?" },
      { id: "6.4", question: "What is the accuracy rate of key data point extraction?" },
      { id: "6.6", question: "Is there a data quality/confidence score for extracted information?" },
      { id: "6.7", question: "Can users verify and correct extracted data before draft generation?" },
    ]
  },
  {
    id: 7, title: "AI/ML: Draft Generation",
    questions: [
      { id: "7.1", question: "Does AI generate structured tables automatically?" },
      { id: "7.2", question: "Does AI insert figures automatically?" },
      { id: "7.3", question: "Does AI write technical text for regulatory submissions?" },
      { id: "7.4", question: "Is the heavy lifting automated so users focus on science?" },
      { id: "7.6", question: "Is the AI trained specifically on regulatory content?" },
      { id: "7.7", question: "Can users control the level of automation vs. manual input?" },
    ]
  },
  {
    id: 8, title: "AI/ML: Content Refinement",
    questions: [
      { id: "8.1", question: "Are precision editing tools available for tone adjustment?" },
      { id: "8.2", question: "Can users refine arguments with AI assistance?" },
      { id: "8.3", question: "Is there polish functionality for final content review?" },
      { id: "8.4", question: "Can content be adjusted to perfectly represent therapeutic story?" },
      { id: "8.6", question: "Is there semantic understanding of regulatory language?" },
    ]
  },
  {
    id: 9, title: "Workflow: Review & Approval",
    questions: [
      { id: "9.1", question: "Are approval workflows streamlined and automated?" },
      { id: "9.2", question: "Is back-and-forth chaos eliminated?" },
      { id: "9.3", question: "Do built-in checks catch issues early?" },
      { id: "9.4", question: "Do reviews move faster with the system?" },
      { id: "9.5", question: "Are submissions staying on track with the platform?" },
    ]
  },
  {
    id: 10, title: "Workflow: Data Verification",
    questions: [
      { id: "10.1", question: "Can users click any sentence to view exact source file?" },
      { id: "10.2", question: "Are relevant keywords displayed with source?" },
      { id: "10.3", question: "Does this ensure traceability?" },
      { id: "10.4", question: "Does this build confidence in data integrity?" },
    ]
  },
  {
    id: 11, title: "Workflow: Traceability & Audibility",
    questions: [
      { id: "11.1", question: "Is there instant source linking for every claim?" },
      { id: "11.2", question: "Is there instant source linking for every table?" },
      { id: "11.3", question: "Is there instant source linking for every figure?" },
      { id: "11.4", question: "Does every element connect directly back to origin?" },
      { id: "11.5", question: "Can regulatory questions be answered in seconds?" },
    ]
  },
  {
    id: 12, title: "Workflow: Collaborative Workflows",
    questions: [
      { id: "12.1", question: "Can multiple people edit simultaneously?" },
      { id: "12.2", question: "Does C2C track who changed what?" },
      { id: "12.3", question: "Are lost edits eliminated?" },
      { id: "12.4", question: "Is version chaos prevented?" },
      { id: "12.6", question: "Is there real-time presence awareness (who's online/editing)?" },
    ]
  },
  {
    id: 13, title: "Workflow: Dossier Management",
    questions: [
      { id: "13.1", question: "Is there a centralized workspace for submission documents?" },
      { id: "13.2", question: "Is supporting content organized in structured workspace?" },
      { id: "13.3", question: "Can teams make updates confidently?" },
      { id: "13.4", question: "Is everything kept aligned over time?" },
      { id: "13.5", question: "Is there dossier-level version control?" },
      { id: "13.6", question: "Can dossiers be cloned/templated for similar submissions?" },
    ]
  },
  {
    id: 14, title: "Validation: Takeda Study",
    questions: [
      { id: "14.1", question: "Was the Takeda study completed independently?" },
      { id: "14.2", question: "Did it measure ~100 hours → 2.6-3.7 hours for IND nonclinical summaries?" },
      { id: "14.3", question: "Was there an independent QC assessment?" },
      { id: "14.4", question: "Were zero critical AI-generated regulatory errors found?" },
      { id: "14.6", question: "Is the study published and available for download?" },
      { id: "14.7", question: "Has the study been replicated with other customers?" },
    ]
  },
  {
    id: 15, title: "Integrations: Veeva",
    questions: [
      { id: "15.1", question: "Is there full Veeva integration?" },
      { id: "15.2", question: "Can documents sync bi-directionally?" },
      { id: "15.3", question: "Is import/export between C2C and Veeva seamless?" },
      { id: "15.4", question: "Can source files be automatically resynced?" },
      { id: "15.5", question: "Are exported docs classified and tagged automatically?" },
      { id: "15.6", question: "Do exported docs slot into existing Veeva workflows?" },
    ]
  },
  {
    id: 16, title: "Security: Platform Security",
    questions: [
      { id: "16.1", question: "Is platform built on AWS infrastructure?" },
      { id: "16.2", question: "Is SOC 2 certification achieved? (Target: Q1 2026)" },
      { id: "16.3", question: "Is multi-factor authentication implemented?" },
      { id: "16.4", question: "Is single sign-on (SSO) supported?" },
      { id: "16.5", question: "Are role-based permissions available?" },
      { id: "16.6", question: "Is there no installation required (browser-based)?" },
    ]
  },
  {
    id: 17, title: "Security: Secure AI Processing",
    questions: [
      { id: "17.1", question: "Do AI models have zero data retention agreements?" },
      { id: "17.2", question: "Is zero data retention technically enforced?" },
      { id: "17.3", question: "Is AI training on customer data prevented?" },
      { id: "17.4", question: "Is end-to-end encryption implemented?" },
      { id: "17.5", question: "Is every interaction and data exchange encrypted?" },
      { id: "17.6", question: "Are complete audit trails available for all AI interactions?" },
    ]
  },
  {
    id: 18, title: "Commercial: Demo & Sales",
    questions: [
      { id: "18.1", question: "Is there a functional demo environment?" },
      { id: "18.2", question: "Does it show 'drafts in minutes' capability?" },
      { id: "18.3", question: "Is there a 'Request a demo' CTA that converts?" },
      { id: "18.4", question: "Is there a newsletter signup ('Keep up with the latest')?" },
      { id: "18.5", question: "Are About us, Careers, Contact, Events pages complete?" },
      { id: "18.6", question: "Is Submission Builder product clearly differentiated?" },
    ]
  },
];

const STORAGE_KEY = 'c2c-audit-responses';

export default function ProductAuditQuestionnaire({ projectId }: { projectId?: string } = {}) {
  const [responses, setResponses] = useState<Record<string, AuditResponse>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  
  const [selectedSectionId, setSelectedSectionId] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'questionnaire' | 'summary'>('questionnaire');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  // Save to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }, [responses]);

  const updateResponse = useCallback((questionId: string, updates: Partial<AuditResponse>) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: {
        questionId,
        status: null,
        notes: '',
        severity: null,
        updatedAt: new Date().toISOString(),
        ...prev[questionId],
        ...updates,
      }
    }));
  }, []);

  const toggleStatus = useCallback((questionId: string, newStatus: QuestionStatus) => {
    const current = responses[questionId]?.status;
    // If clicking the same status, toggle it off
    const status = current === newStatus ? null : newStatus;
    updateResponse(questionId, { 
      status,
      // Clear severity if status is 'yes' or null
      severity: (status === 'yes' || status === null) ? null : responses[questionId]?.severity
    });
  }, [responses, updateResponse]);

  const toggleNotes = useCallback((questionId: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }, []);

  // Calculate statistics
  const stats = useMemo(() => {
    const totalQuestions = AUDIT_SECTIONS.reduce((sum, section) => sum + section.questions.length, 0);
    const answered = Object.values(responses).filter(r => r.status !== null).length;
    const p0Count = Object.values(responses).filter(r => r.severity === 'p0').length;
    const p1Count = Object.values(responses).filter(r => r.severity === 'p1').length;
    const p2Count = Object.values(responses).filter(r => r.severity === 'p2').length;
    const p3Count = Object.values(responses).filter(r => r.severity === 'p3').length;
    const verifiedCount = Object.values(responses).filter(r => r.severity === 'verified').length;
    const yesCount = Object.values(responses).filter(r => r.status === 'yes').length;
    
    return {
      totalQuestions,
      answered,
      answeredPercent: totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0,
      p0Count,
      p1Count,
      p2Count,
      p3Count,
      verifiedCount,
      yesCount,
      readinessPercent: totalQuestions > 0 ? Math.round((yesCount / totalQuestions) * 100) : 0,
    };
  }, [responses]);

  // Calculate section statistics
  const sectionStats = useMemo(() => {
    return AUDIT_SECTIONS.map(section => {
      const sectionResponses = section.questions.map(q => responses[q.id]).filter(Boolean);
      const answered = sectionResponses.filter(r => r.status !== null).length;
      const total = section.questions.length;
      const p0 = sectionResponses.filter(r => r.severity === 'p0').length;
      const p1 = sectionResponses.filter(r => r.severity === 'p1').length;
      const p2 = sectionResponses.filter(r => r.severity === 'p2').length;
      const p3 = sectionResponses.filter(r => r.severity === 'p3').length;
      const verified = sectionResponses.filter(r => r.severity === 'verified').length;
      const allYes = section.questions.every(q => responses[q.id]?.status === 'yes');
      const hasP0 = p0 > 0;
      const hasP1 = p1 > 0;
      const inProgress = answered > 0 && answered < total;
      const notStarted = answered === 0;
      
      let statusColor = 'bg-zinc-200'; // not started
      if (allYes) statusColor = 'bg-emerald-500';
      else if (hasP0 || hasP1) statusColor = 'bg-red-500';
      else if (inProgress) statusColor = 'bg-amber-500';
      
      return {
        sectionId: section.id,
        answered,
        total,
        percent: total > 0 ? Math.round((answered / total) * 100) : 0,
        p0,
        p1,
        p2,
        p3,
        verified,
        statusColor,
        allYes,
        notStarted,
      };
    });
  }, [responses]);

  const selectedSection = AUDIT_SECTIONS.find(s => s.id === selectedSectionId) || AUDIT_SECTIONS[0];

  const criticalGaps = useMemo(() => {
    return Object.values(responses)
      .filter(r => r.severity === 'p0')
      .map(r => {
        const question = AUDIT_SECTIONS
          .flatMap(s => s.questions)
          .find(q => q.id === r.questionId);
        return question ? { id: r.questionId, question: question.question } : null;
      })
      .filter(Boolean);
  }, [responses]);

  const goNoGo = useMemo(() => {
    if (stats.p0Count > 0) return { status: 'NO-GO', color: 'text-red-700 bg-red-100', reason: `${stats.p0Count} critical gaps must be resolved` };
    if (stats.p1Count > 3) return { status: 'CAUTION', color: 'text-amber-700 bg-amber-100', reason: `${stats.p1Count} high-priority gaps require attention` };
    if (stats.readinessPercent < 70) return { status: 'CAUTION', color: 'text-amber-700 bg-amber-100', reason: `Only ${stats.readinessPercent}% ready` };
    return { status: 'GO', color: 'text-emerald-700 bg-emerald-100', reason: 'System is ready for deployment' };
  }, [stats]);

  return (
    <div className="flex flex-col h-full bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">C2C Product Audit Questionnaire</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Full Product Audit & Gap Analysis Framework · {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-emerald-600">{stats.answeredPercent}%</div>
            <div className="text-xs text-zinc-500">{stats.answered} of {stats.totalQuestions} answered</div>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-2 bg-zinc-200 rounded-full overflow-hidden mt-3">
          <div 
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${stats.answeredPercent}%` }}
          />
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setViewMode('questionnaire')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'questionnaire' 
                ? 'bg-zinc-900 text-white' 
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            Questionnaire
          </button>
          <button
            onClick={() => setViewMode('summary')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'summary' 
                ? 'bg-zinc-900 text-white' 
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            Gap Summary
          </button>
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'questionnaire' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-80 bg-zinc-50 border-r border-zinc-200 overflow-y-auto">
            <div className="p-4 space-y-1">
              {AUDIT_SECTIONS.map((section, idx) => {
                const sectionStat = sectionStats[idx];
                return (
                  <button
                    key={section.id}
                    onClick={() => setSelectedSectionId(section.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      selectedSectionId === section.id
                        ? 'bg-white shadow-sm border border-zinc-200'
                        : 'hover:bg-white/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${sectionStat.statusColor}`} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-zinc-900 text-sm truncate">
                          {section.id}. {section.title}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {sectionStat.answered}/{sectionStat.total} · {sectionStat.percent}%
                        </div>
                      </div>
                      {selectedSectionId === section.id && (
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Questions Panel */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-xl font-bold text-zinc-900 mb-6">
                {selectedSection.id}. {selectedSection.title}
              </h2>
              
              <div className="space-y-4">
                {selectedSection.questions.map((question) => {
                  const response = responses[question.id];
                  const isNotesExpanded = expandedNotes.has(question.id);
                  
                  return (
                    <div key={question.id} className="bg-white rounded-lg border border-zinc-200 p-4">
                      {/* Question Header */}
                      <div className="flex items-start gap-4 mb-3">
                        <div className="text-sm font-mono text-zinc-500 mt-1">{question.id}</div>
                        <div className="flex-1">
                          <div className="text-zinc-900">{question.question}</div>
                        </div>
                      </div>

                      {/* Status Buttons */}
                      <div className="flex items-center gap-2 mb-3 ml-14">
                        <button
                          onClick={() => toggleStatus(question.id, 'yes')}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            response?.status === 'yes'
                              ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-300'
                              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 border-2 border-transparent'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4 inline mr-1" />
                          Yes
                        </button>
                        <button
                          onClick={() => toggleStatus(question.id, 'no')}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            response?.status === 'no'
                              ? 'bg-red-100 text-red-700 border-2 border-red-300'
                              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 border-2 border-transparent'
                          }`}
                        >
                          <AlertTriangle className="w-4 h-4 inline mr-1" />
                          No
                        </button>
                        <button
                          onClick={() => toggleStatus(question.id, 'partial')}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            response?.status === 'partial'
                              ? 'bg-amber-100 text-amber-700 border-2 border-amber-300'
                              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 border-2 border-transparent'
                          }`}
                        >
                          <Circle className="w-4 h-4 inline mr-1" />
                          Partial
                        </button>
                      </div>

                      {/* Severity Dropdown (only shown if status is no or partial) */}
                      {(response?.status === 'no' || response?.status === 'partial') && (
                        <div className="ml-14 mb-3">
                          <label className="block text-xs font-medium text-zinc-700 mb-1">Gap Severity</label>
                          <select
                            value={response?.severity || ''}
                            onChange={(e) => updateResponse(question.id, { severity: (e.target.value || null) as GapSeverity })}
                            className="w-64 px-3 py-1.5 text-sm border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900"
                          >
                            <option value="">Select severity...</option>
                            <option value="p0">🔴 P0 - Critical (Must Fix)</option>
                            <option value="p1">🟠 P1 - High Priority</option>
                            <option value="p2">🟡 P2 - Medium Priority</option>
                            <option value="p3">🔵 P3 - Low Priority</option>
                            <option value="verified">✅ Verified (Not a Gap)</option>
                          </select>
                        </div>
                      )}

                      {/* Notes Section */}
                      <div className="ml-14">
                        <button
                          onClick={() => toggleNotes(question.id)}
                          className="text-xs text-zinc-600 hover:text-zinc-900 font-medium mb-2"
                        >
                          {isNotesExpanded ? '▼' : '▶'} Notes
                        </button>
                        {isNotesExpanded && (
                          <textarea
                            value={response?.notes || ''}
                            onChange={(e) => updateResponse(question.id, { notes: e.target.value })}
                            placeholder="Add notes, evidence, or action items..."
                            className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
                            rows={3}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Gap Summary View */
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Stats Bar */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-lg border border-zinc-200 p-4">
                <div className="text-sm text-zinc-600 mb-1">Total Questions</div>
                <div className="text-3xl font-bold text-zinc-900">{stats.totalQuestions}</div>
                <div className="text-xs text-zinc-500 mt-1">{stats.answeredPercent}% answered</div>
              </div>
              <div className="bg-white rounded-lg border border-zinc-200 p-4">
                <div className="text-sm text-zinc-600 mb-1">Critical Gaps (P0)</div>
                <div className="text-3xl font-bold text-red-700">{stats.p0Count}</div>
                <div className="text-xs text-zinc-500 mt-1">Must resolve</div>
              </div>
              <div className="bg-white rounded-lg border border-zinc-200 p-4">
                <div className="text-sm text-zinc-600 mb-1">High Priority (P1)</div>
                <div className="text-3xl font-bold text-orange-700">{stats.p1Count}</div>
                <div className="text-xs text-zinc-500 mt-1">Should address</div>
              </div>
              <div className="bg-white rounded-lg border border-zinc-200 p-4">
                <div className="text-sm text-zinc-600 mb-1">Readiness</div>
                <div className="text-3xl font-bold text-emerald-600">{stats.readinessPercent}%</div>
                <div className="text-xs text-zinc-500 mt-1">{stats.yesCount} verified yes</div>
              </div>
            </div>

            {/* Go/No-Go Indicator */}
            <div className={`rounded-lg border-2 p-6 ${
              goNoGo.status === 'GO' ? 'border-emerald-300 bg-emerald-50' :
              goNoGo.status === 'NO-GO' ? 'border-red-300 bg-red-50' :
              'border-amber-300 bg-amber-50'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`px-4 py-2 rounded-lg font-bold text-lg ${goNoGo.color}`}>
                  {goNoGo.status}
                </div>
                <div className="flex-1">
                  <div className="text-sm text-zinc-900 font-medium">{goNoGo.reason}</div>
                </div>
                {goNoGo.status === 'GO' && <TrendingUp className="w-8 h-8 text-emerald-600" />}
              </div>
            </div>

            {/* Section Summary Table */}
            <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-200">
                <h3 className="text-lg font-bold text-zinc-900">Section Gap Analysis</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-700 uppercase tracking-wider">Section</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-zinc-700 uppercase tracking-wider">P0</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-zinc-700 uppercase tracking-wider">P1</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-zinc-700 uppercase tracking-wider">P2</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-zinc-700 uppercase tracking-wider">P3</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-zinc-700 uppercase tracking-wider">Verified</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-zinc-700 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-zinc-700 uppercase tracking-wider">Complete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {AUDIT_SECTIONS.map((section, idx) => {
                      const stat = sectionStats[idx];
                      return (
                        <tr key={section.id} className="hover:bg-zinc-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${stat.statusColor}`} />
                              <div className="text-sm font-medium text-zinc-900">
                                {section.id}. {section.title}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                              stat.p0 > 0 ? 'bg-red-100 text-red-700' : 'text-zinc-400'
                            }`}>
                              {stat.p0 || '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                              stat.p1 > 0 ? 'bg-orange-100 text-orange-700' : 'text-zinc-400'
                            }`}>
                              {stat.p1 || '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                              stat.p2 > 0 ? 'bg-yellow-100 text-yellow-700' : 'text-zinc-400'
                            }`}>
                              {stat.p2 || '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                              stat.p3 > 0 ? 'bg-blue-100 text-blue-700' : 'text-zinc-400'
                            }`}>
                              {stat.p3 || '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                              stat.verified > 0 ? 'bg-emerald-100 text-emerald-700' : 'text-zinc-400'
                            }`}>
                              {stat.verified || '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {stat.allYes ? '🟢' : stat.p0 > 0 ? '🔴' : stat.p1 > 0 ? '🟠' : stat.answered > 0 ? '🟡' : '⚪'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="text-sm font-medium text-zinc-900">{stat.percent}%</div>
                            <div className="text-xs text-zinc-500">{stat.answered}/{stat.total}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Executive Summary */}
            <div className="bg-white rounded-lg border border-zinc-200 p-6">
              <h3 className="text-lg font-bold text-zinc-900 mb-4">Executive Summary</h3>
              
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-zinc-700 mb-2">Overall Readiness</div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-4 bg-zinc-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${stats.readinessPercent}%` }}
                      />
                    </div>
                    <div className="text-2xl font-bold text-emerald-600">{stats.readinessPercent}%</div>
                  </div>
                </div>

                {stats.p0Count > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="text-sm font-bold text-red-900 mb-2">
                      ⚠️ Top Critical Gaps (P0) — Must Resolve Before Launch
                    </div>
                    <ul className="space-y-1 text-sm text-red-800">
                      {criticalGaps.map((gap: any) => (
                        <li key={gap.id} className="flex items-start gap-2">
                          <span className="font-mono text-xs text-red-600 mt-0.5">{gap.id}</span>
                          <span>{gap.question}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-200">
                  <div>
                    <div className="text-sm text-zinc-600 mb-1">Gaps Identified</div>
                    <div className="text-xl font-bold text-zinc-900">
                      {stats.p0Count + stats.p1Count + stats.p2Count + stats.p3Count}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-zinc-600 mb-1">Verified Complete</div>
                    <div className="text-xl font-bold text-emerald-600">
                      {stats.yesCount}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
