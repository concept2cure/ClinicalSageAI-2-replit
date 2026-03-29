/**
 * CSRWorkflow — Guided CSR Authoring (ICH E3, Sections 1-16)
 *
 * Walks the user through each ICH E3 section with:
 * - Section status tracking (not started → drafting → review → approved)
 * - AI draft generation per section
 * - Section-specific guidance and requirements
 * - Progress tracking across all 16 sections
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  FileText,
  ChevronRight,
  ChevronDown,
  Circle,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowLeft,
  BarChart3,
  Beaker,
  Shield,
  Users,
  BookOpen,
  ClipboardList,
  FlaskConical,
  Activity,
  Zap,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { DataStateWrapper } from '@/components/ui/statesV2';

// ── ICH E3 Section Structure ─────────────────────────────────────────────────

interface CSRSection {
  code: string;
  title: string;
  icon: React.ElementType;
  children?: { code: string; title: string }[];
  guidance: string;
}

const ICH_E3_SECTIONS: CSRSection[] = [
  { code: '1', title: 'Title Page', icon: FileText, guidance: 'Study title, protocol number, sponsor, investigators, report date.' },
  {
    code: '2', title: 'Synopsis', icon: ClipboardList,
    guidance: 'Concise overview of entire study — should stand alone as a document.',
    children: [
      { code: '2.1', title: 'Study Information' },
      { code: '2.2', title: 'Objectives' },
      { code: '2.3', title: 'Methodology' },
      { code: '2.4', title: 'Number of Subjects' },
      { code: '2.5', title: 'Diagnosis & Main Criteria' },
      { code: '2.6', title: 'Duration of Treatment' },
      { code: '2.7', title: 'Test Product, Dose, Mode' },
      { code: '2.8', title: 'Efficacy Results' },
      { code: '2.9', title: 'Safety Results' },
      { code: '2.10', title: 'Conclusions' },
    ],
  },
  { code: '3', title: 'Table of Contents', icon: BookOpen, guidance: 'Auto-generated from final section structure.' },
  { code: '4', title: 'List of Abbreviations', icon: BookOpen, guidance: 'All abbreviations used in the report, alphabetically sorted.' },
  { code: '5', title: 'Ethics', icon: Shield, guidance: 'IRB/IEC approvals, informed consent, GCP compliance statement.' },
  { code: '6', title: 'Investigators & Study Admin', icon: Users, guidance: 'Principal investigators, study centers, administrative structure.' },
  { code: '7', title: 'Introduction', icon: BookOpen, guidance: 'Disease background, rationale for the study, mechanism of action.' },
  {
    code: '8', title: 'Study Objectives', icon: Zap,
    guidance: 'Primary and secondary objectives, clearly linked to endpoints.',
    children: [
      { code: '8.1', title: 'Primary Objectives' },
      { code: '8.2', title: 'Secondary Objectives' },
    ],
  },
  {
    code: '9', title: 'Investigational Plan', icon: FlaskConical,
    guidance: 'Study design, population selection, treatments, endpoints, statistical methods.',
    children: [
      { code: '9.1', title: 'Overall Study Design' },
      { code: '9.2', title: 'Discussion of Study Design' },
      { code: '9.3', title: 'Selection of Study Population' },
      { code: '9.4', title: 'Treatments' },
      { code: '9.5', title: 'Efficacy & Safety Variables' },
      { code: '9.6', title: 'Data Quality Assurance' },
      { code: '9.7', title: 'Statistical Methods' },
    ],
  },
  {
    code: '10', title: 'Study Patients', icon: Users,
    guidance: 'Patient disposition, protocol deviations.',
    children: [
      { code: '10.1', title: 'Disposition of Patients' },
      { code: '10.2', title: 'Protocol Deviations' },
    ],
  },
  {
    code: '11', title: 'Efficacy Evaluation', icon: BarChart3,
    guidance: 'Primary and secondary efficacy analyses, statistical results.',
    children: [
      { code: '11.1', title: 'Data Sets Analyzed' },
      { code: '11.2', title: 'Demographics & Baseline' },
      { code: '11.3', title: 'Compliance Measurements' },
      { code: '11.4', title: 'Efficacy Results & Tabulations' },
    ],
  },
  {
    code: '12', title: 'Safety Evaluation', icon: Shield,
    guidance: 'Adverse events, SAEs, deaths, lab results, vital signs.',
    children: [
      { code: '12.1', title: 'Extent of Exposure' },
      { code: '12.2', title: 'Adverse Events' },
      { code: '12.3', title: 'Deaths, SAEs & Narratives' },
      { code: '12.4', title: 'Clinical Laboratory Evaluation' },
      { code: '12.5', title: 'Vital Signs & Physical Findings' },
    ],
  },
  { code: '13', title: 'Discussion & Conclusions', icon: Activity, guidance: 'Interpretation of efficacy and safety findings, benefit-risk assessment.' },
  { code: '14', title: 'Tables, Figures, Graphs', icon: BarChart3, guidance: 'All referenced tables, figures, and graphical analyses.' },
  { code: '15', title: 'Reference List', icon: BookOpen, guidance: 'All literature and regulatory guidance cited in the report.' },
  { code: '16', title: 'Appendices', icon: FileText, guidance: 'Study protocol, SAP, CRF, listing of study sites, individual patient data.' },
];

// ── Types ────────────────────────────────────────────────────────────────────

type SectionStatus = 'not_started' | 'drafting' | 'review' | 'approved';

interface SectionState {
  code: string;
  status: SectionStatus;
  artifactId?: string;
}

interface CSRWorkflowProps {
  projectId: string | number;
  projectName?: string;
  onSectionClick: (sectionCode: string) => void;
  onAIDraft: (sectionCode: string, sectionTitle: string) => void;
  onBack: () => void;
}

const STATUS_CONFIG: Record<SectionStatus, { label: string; color: string; icon: React.ElementType; dot: string }> = {
  not_started: { label: 'Not Started', color: 'text-stone-400', icon: Circle, dot: 'bg-stone-300' },
  drafting: { label: 'Drafting', color: 'text-amber-600', icon: Clock, dot: 'bg-amber-500' },
  review: { label: 'In Review', color: 'text-blue-600', icon: AlertCircle, dot: 'bg-stone-600' },
  approved: { label: 'Approved', color: 'text-emerald-600', icon: CheckCircle2, dot: 'bg-emerald-500' },
};

// ── Component ────────────────────────────────────────────────────────────────

export function CSRWorkflow({ projectId, projectName, onSectionClick, onAIDraft, onBack }: CSRWorkflowProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['2', '9', '11', '12']));
  const [draftingSection, setDraftingSection] = useState<string | null>(null);

  // Fetch section statuses from project artifacts
  const { data: sectionStates, isLoading } = useQuery<SectionState[]>({
    queryKey: ['csr-sections', projectId],
    queryFn: async () => {
      const token = sessionStorage.getItem('trialsage_access_token') || localStorage.getItem('trialsage_access_token');
      const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      const data = await res.json();
      const artifacts = Array.isArray(data) ? data : (data?.data ?? []);

      // Map artifacts to CSR sections by ctdSection matching
      return ICH_E3_SECTIONS.flatMap(section => {
        const codes = [section.code, ...(section.children?.map(c => c.code) || [])];
        return codes.map(code => {
          const artifact = artifacts.find((a: any) =>
            a.ctdSection === `csr-${code}` || a.ctdSection === code ||
            a.title?.toLowerCase().includes(section.title.toLowerCase())
          );
          let status: SectionStatus = 'not_started';
          if (artifact) {
            if (artifact.status === 'approved' || artifact.status === 'locked') status = 'approved';
            else if (artifact.status === 'review') status = 'review';
            else status = 'drafting';
          }
          return { code, status, artifactId: artifact?.id };
        });
      });
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const statusMap = useMemo(() => {
    const map = new Map<string, SectionState>();
    (sectionStates || []).forEach(s => map.set(s.code, s));
    return map;
  }, [sectionStates]);

  // Progress stats
  const stats = useMemo(() => {
    const allCodes = ICH_E3_SECTIONS.flatMap(s => [s.code, ...(s.children?.map(c => c.code) || [])]);
    const total = allCodes.length;
    let approved = 0, drafting = 0, review = 0;
    for (const code of allCodes) {
      const state = statusMap.get(code);
      if (state?.status === 'approved') approved++;
      else if (state?.status === 'review') review++;
      else if (state?.status === 'drafting') drafting++;
    }
    const started = approved + drafting + review;
    const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
    return { total, approved, drafting, review, started, pct };
  }, [statusMap]);

  const toggleSection = useCallback((code: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const handleAIDraft = useCallback(async (code: string, title: string) => {
    setDraftingSection(code);
    try {
      await onAIDraft(code, title);
    } finally {
      setDraftingSection(null);
    }
  }, [onAIDraft]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-stone-50/50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="text-stone-500 hover:text-stone-700">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">CSR Authoring — ICH E3</h1>
            <p className="text-xs text-stone-500">{projectName || 'Clinical Study Report'}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${stats.pct}%` }}
            />
          </div>
          <span className="text-xs font-medium text-stone-600 tabular-nums">
            {stats.approved}/{stats.total} sections approved
          </span>
        </div>

        {/* Quick stats */}
        <div className="flex gap-4 mt-2">
          {[
            { label: 'Drafting', value: stats.drafting, color: 'text-amber-600' },
            { label: 'In Review', value: stats.review, color: 'text-blue-600' },
            { label: 'Approved', value: stats.approved, color: 'text-emerald-600' },
            { label: 'Not Started', value: stats.total - stats.started, color: 'text-stone-400' },
          ].map(s => (
            <span key={s.label} className={cn('text-xs', s.color)}>
              {s.value} {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Section list */}
      <DataStateWrapper data={ICH_E3_SECTIONS} isLoading={isLoading} error={null}>
        {(sections) => (
          <div className="px-6 py-4 space-y-1">
            {sections.map(section => {
              const state = statusMap.get(section.code);
              const statusCfg = STATUS_CONFIG[state?.status || 'not_started'];
              const StatusIcon = statusCfg.icon;
              const SectionIcon = section.icon;
              const hasChildren = section.children && section.children.length > 0;
              const isExpanded = expandedSections.has(section.code);
              const isDrafting = draftingSection === section.code;

              return (
                <div key={section.code}>
                  {/* Parent section */}
                  <div className="group flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 hover:shadow-sm transition-all">
                    {/* Expand toggle */}
                    {hasChildren ? (
                      <button onClick={() => toggleSection(section.code)} className="text-stone-400 hover:text-stone-600">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    ) : (
                      <span className="w-4" />
                    )}

                    {/* Status indicator */}
                    <StatusIcon className={cn('h-4 w-4 flex-shrink-0', statusCfg.color)} />

                    {/* Section info */}
                    <button
                      onClick={() => onSectionClick(section.code)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <SectionIcon className="h-3.5 w-3.5 text-stone-400" />
                        <span className="text-xs font-mono text-stone-400">{section.code}</span>
                        <span className="text-sm font-medium text-stone-900">{section.title}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-stone-500 line-clamp-1">{section.guidance}</p>
                    </button>

                    {/* Status badge */}
                    <span className={cn(
                      'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                      state?.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                      state?.status === 'review' ? 'bg-blue-50 text-stone-700' :
                      state?.status === 'drafting' ? 'bg-amber-50 text-amber-700' :
                      'bg-stone-50 text-stone-400'
                    )}>
                      {statusCfg.label}
                    </span>

                    {/* AI Draft button */}
                    {(!state || state.status === 'not_started') && (
                      <button
                        onClick={() => handleAIDraft(section.code, section.title)}
                        disabled={isDrafting}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 rounded-md bg-stone-900 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-opacity"
                      >
                        {isDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        AI Draft
                      </button>
                    )}
                  </div>

                  {/* Child sections */}
                  {hasChildren && isExpanded && (
                    <div className="ml-8 mt-1 space-y-1">
                      {section.children!.map(child => {
                        const childState = statusMap.get(child.code);
                        const childStatusCfg = STATUS_CONFIG[childState?.status || 'not_started'];
                        const ChildStatusIcon = childStatusCfg.icon;
                        const isChildDrafting = draftingSection === child.code;

                        return (
                          <div
                            key={child.code}
                            className="group flex items-center gap-3 rounded-lg border border-stone-100 bg-stone-50 px-4 py-2.5 hover:bg-white hover:border-stone-200 transition-all"
                          >
                            <ChildStatusIcon className={cn('h-3.5 w-3.5 flex-shrink-0', childStatusCfg.color)} />
                            <button
                              onClick={() => onSectionClick(child.code)}
                              className="flex-1 min-w-0 text-left flex items-center gap-2"
                            >
                              <span className="text-xs font-mono text-stone-400">{child.code}</span>
                              <span className="text-sm text-stone-700">{child.title}</span>
                            </button>
                            <span className={cn(
                              'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                              childState?.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                              childState?.status === 'review' ? 'bg-blue-50 text-stone-700' :
                              childState?.status === 'drafting' ? 'bg-amber-50 text-amber-700' :
                              'bg-stone-50 text-stone-400'
                            )}>
                              {childStatusCfg.label}
                            </span>
                            {(!childState || childState.status === 'not_started') && (
                              <button
                                onClick={() => handleAIDraft(child.code, `${section.title} — ${child.title}`)}
                                disabled={isChildDrafting}
                                className="flex-shrink-0 opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 rounded-md bg-stone-900 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-opacity"
                              >
                                {isChildDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                AI Draft
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DataStateWrapper>
    </div>
  );
}

export default CSRWorkflow;
