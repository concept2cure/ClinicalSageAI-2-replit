/**
 * IND AutoDraft Dashboard — Compete with Weave.bio AutoIND
 *
 * Closes Gap #2: Full IND auto-drafting with source traceability.
 *
 * Features:
 *  - Section-by-section IND overview with auto-draft capability
 *  - One-click "Generate Full IND" (all sections in parallel)
 *  - Sentence-level source traceability (Gap #3)
 *  - Word counts, coverage metrics, time savings display
 *  - Source reference popovers for every generated claim
 *
 * Claude UI: warm sand, terracotta, minimal, generous whitespace.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Sparkles, ChevronRight, Clock, Check,
  Loader2, AlertCircle, Link2, Eye, Download,
  Zap, Shield, ArrowRight, FileCode, ChevronDown,
  ExternalLink,
} from 'lucide-react';

interface INDSection {
  id: string;
  module: string;
  sectionCode: string;
  title: string;
  required: boolean;
  autoGeneratable: boolean;
  sourceTypes: string[];
  estimatedMinutes: number;
}

interface SourceLink {
  sentenceIndex: number;
  sourceDoc: string;
  sourceSection: string;
  sourceExcerpt: string;
  confidence: number;
}

interface DraftResult {
  sectionId: string;
  sectionCode: string;
  title: string;
  status: 'generated' | 'pending' | 'error';
  content?: string;
  wordCount?: number;
  sourceLinks?: SourceLink[];
  generatedAt?: string;
}

interface SectionCatalog {
  sections: INDSection[];
  totalSections: number;
  autoGeneratable: number;
  estimatedTotalMinutes: number;
  estimatedHours: number;
  manualEquivalentHours: number;
  timeSavingsPercent: number;
}

export default function INDAutoDraftDashboard() {
  const [catalog, setCatalog] = useState<SectionCatalog | null>(null);
  const [drafts, setDrafts] = useState<DraftResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);
  const [hoveredSource, setHoveredSource] = useState<SourceLink | null>(null);

  useEffect(() => {
    fetch('/api/ind-autodraft/sections')
      .then(r => r.json())
      .then(d => setCatalog(d.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const generateFullIND = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ind-autodraft/generate-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectContext: {} }),
      });
      if (res.ok) {
        const data = await res.json();
        setDrafts(data.data.sections);
        if (data.data.sections.length > 0) {
          setExpandedDraft(data.data.sections[0].sectionId);
        }
      }
    } finally {
      setGenerating(false);
    }
  }, []);

  const generateSection = useCallback(async (sectionId: string) => {
    setGeneratingSection(sectionId);
    try {
      const res = await fetch('/api/ind-autodraft/generate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId, projectContext: {} }),
      });
      if (res.ok) {
        const data = await res.json();
        setDrafts(prev => {
          const existing = prev.findIndex(d => d.sectionId === sectionId);
          if (existing >= 0) {
            return prev.map(d => d.sectionId === sectionId ? data.data : d);
          }
          return [...prev, data.data];
        });
        setExpandedDraft(sectionId);
      }
    } finally {
      setGeneratingSection(null);
    }
  }, []);

  const totalWords = drafts.reduce((sum, d) => sum + (d.wordCount ?? 0), 0);
  const totalSources = drafts.reduce((sum, d) => sum + (d.sourceLinks?.length ?? 0), 0);
  const generatedCount = drafts.filter(d => d.status === 'generated').length;

  // Group sections by module
  const modules = catalog ? Array.from(new Set(catalog.sections.map(s => s.module))).sort() : [];

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F5' }}>
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm mb-2" style={{ color: '#8A8880' }}>
            <Zap size={14} />
            <span>IND Automation</span>
            <ChevronRight size={14} />
            <span>AutoDraft</span>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: '#141413' }}>
                IND AutoDraft Engine
              </h1>
              <p className="mt-1 text-sm" style={{ color: '#6B6962' }}>
                AI-powered IND section generation with sentence-level source traceability.
                Generate a complete IND first draft in minutes, not months.
              </p>
            </div>
            <button
              onClick={generateFullIND}
              disabled={generating}
              className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
              style={{ background: generating ? '#E8E6DC' : '#D97757', color: generating ? '#8A8880' : '#FAF9F5' }}
            >
              {generating ? (
                <><Loader2 size={16} className="animate-spin" /> Generating Full IND...</>
              ) : (
                <><Sparkles size={16} /> Generate Full IND</>
              )}
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {catalog && (
          <div className="grid grid-cols-5 gap-3 mb-8">
            {[
              { label: 'Sections', value: catalog.totalSections, sub: `${catalog.autoGeneratable} auto-generatable` },
              { label: 'Est. Time', value: `${catalog.estimatedHours}h`, sub: `vs ${catalog.manualEquivalentHours}h manual` },
              { label: 'Time Savings', value: `${catalog.timeSavingsPercent}%`, sub: 'faster than manual' },
              { label: 'Generated', value: generatedCount, sub: `${totalWords.toLocaleString()} words` },
              { label: 'Source Links', value: totalSources, sub: 'sentence-level traces' },
            ].map(s => (
              <div key={s.label} className="rounded-lg border p-3 text-center" style={{ background: '#FFFFFF', borderColor: '#E8E6DC' }}>
                <p className="text-xl font-semibold" style={{ color: '#D97757' }}>{s.value}</p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: '#8A8880' }}>{s.label}</p>
                <p className="text-[10px]" style={{ color: '#B0AEA5' }}>{s.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Section catalog + drafts */}
        <div className="space-y-4">
          {modules.map(mod => {
            const sections = catalog?.sections.filter(s => s.module === mod) ?? [];
            const moduleLabel = mod === '1' ? 'Module 1 — Administrative' :
              mod === '2' ? 'Module 2 — CTD Summaries' :
              mod === '3' ? 'Module 3 — Quality (CMC)' :
              mod === '4' ? 'Module 4 — Nonclinical' :
              `Module ${mod} — Clinical`;

            return (
              <div key={mod} className="rounded-lg border overflow-hidden" style={{ background: '#FFFFFF', borderColor: '#E8E6DC' }}>
                <div className="px-4 py-3 border-b" style={{ background: '#FAF9F5', borderColor: '#F5F4EF' }}>
                  <span className="text-sm font-semibold" style={{ color: '#141413' }}>{moduleLabel}</span>
                  <span className="ml-2 text-xs" style={{ color: '#8A8880' }}>{sections.length} sections</span>
                </div>
                {sections.map(section => {
                  const draft = drafts.find(d => d.sectionId === section.id);
                  const isExpanded = expandedDraft === section.id;
                  const isGenerating = generatingSection === section.id;

                  return (
                    <div key={section.id} className="border-b last:border-b-0" style={{ borderColor: '#F5F4EF' }}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* Status icon */}
                        {draft?.status === 'generated' ? (
                          <Check size={14} style={{ color: '#788C5D' }} />
                        ) : (
                          <CircleIcon style={{ color: '#B0AEA5' }} />
                        )}
                        {/* Section info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono" style={{ color: '#8A8880' }}>{section.sectionCode}</span>
                            <span className="text-sm font-medium" style={{ color: '#141413' }}>{section.title}</span>
                            {section.required && (
                              <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: '#FEE2E2', color: '#991B1B' }}>Required</span>
                            )}
                          </div>
                          {draft && (
                            <div className="flex items-center gap-3 text-[10px] mt-0.5" style={{ color: '#B0AEA5' }}>
                              <span>{draft.wordCount?.toLocaleString()} words</span>
                              <span className="flex items-center gap-0.5"><Link2 size={8} /> {draft.sourceLinks?.length ?? 0} sources</span>
                            </div>
                          )}
                        </div>
                        {/* Actions */}
                        {draft?.status === 'generated' ? (
                          <button
                            onClick={() => setExpandedDraft(isExpanded ? null : section.id)}
                            className="text-xs px-2 py-1 rounded border"
                            style={{ borderColor: '#E8E6DC', color: '#4D4B45' }}
                          >
                            {isExpanded ? 'Collapse' : 'View Draft'}
                          </button>
                        ) : section.autoGeneratable ? (
                          <button
                            onClick={() => generateSection(section.id)}
                            disabled={isGenerating}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded"
                            style={{ background: '#D97757', color: '#FAF9F5' }}
                          >
                            {isGenerating ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                            Draft
                          </button>
                        ) : (
                          <span className="text-[10px]" style={{ color: '#B0AEA5' }}>Manual upload</span>
                        )}
                      </div>

                      {/* Expanded draft content with source traceability */}
                      {isExpanded && draft?.content && (
                        <div className="px-4 pb-4">
                          <div
                            className="rounded-md border p-4 text-sm leading-relaxed font-mono"
                            style={{ background: '#FAF9F5', borderColor: '#E8E6DC', color: '#4D4B45', fontSize: '12px', whiteSpace: 'pre-wrap' }}
                          >
                            {draft.content.split('\n').map((line, lineIdx) => (
                              <div key={lineIdx} className="relative group">
                                {line}
                                {/* Source indicators */}
                                {draft.sourceLinks?.filter(s => {
                                  // Simple heuristic: map sentenceIndex to line
                                  return s.sentenceIndex === lineIdx;
                                }).map((src, srcIdx) => (
                                  <span
                                    key={srcIdx}
                                    className="inline-flex items-center gap-0.5 ml-1 px-1 py-0.5 rounded text-[9px] cursor-pointer"
                                    style={{ background: '#DBEAFE', color: '#1E40AF' }}
                                    onMouseEnter={() => setHoveredSource(src)}
                                    onMouseLeave={() => setHoveredSource(null)}
                                    title={`${src.sourceDoc} — ${src.sourceSection}: "${src.sourceExcerpt}" (${Math.round(src.confidence * 100)}% confidence)`}
                                  >
                                    <Link2 size={8} /> {src.sourceDoc.split(' ')[0]}
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>

                          {/* Source traceability panel */}
                          {draft.sourceLinks && draft.sourceLinks.length > 0 && (
                            <div className="mt-3">
                              <p className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: '#8A8880' }}>
                                Source Traceability ({draft.sourceLinks.length} links)
                              </p>
                              <div className="space-y-1">
                                {draft.sourceLinks.map((src, i) => (
                                  <div
                                    key={i}
                                    className="flex items-start gap-2 px-2 py-1.5 rounded text-[11px]"
                                    style={{
                                      background: hoveredSource === src ? '#DBEAFE' : '#FAF9F5',
                                      transition: 'background 0.15s',
                                    }}
                                  >
                                    <FileCode size={10} style={{ color: '#6A9BCC', marginTop: 2 }} />
                                    <div className="flex-1 min-w-0">
                                      <span className="font-medium" style={{ color: '#4D4B45' }}>{src.sourceDoc}</span>
                                      <span style={{ color: '#8A8880' }}> — {src.sourceSection}</span>
                                    </div>
                                    <span
                                      className="px-1 py-0.5 rounded text-[9px] font-mono whitespace-nowrap"
                                      style={{
                                        background: src.confidence >= 0.95 ? '#D1FAE5' : src.confidence >= 0.85 ? '#FEF3C7' : '#FEE2E2',
                                        color: src.confidence >= 0.95 ? '#065F46' : src.confidence >= 0.85 ? '#92400E' : '#991B1B',
                                      }}
                                    >
                                      {Math.round(src.confidence * 100)}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Compliance footer */}
        <div className="mt-12 pt-6 border-t flex items-center gap-2 text-xs" style={{ borderColor: '#E8E6DC', color: '#B0AEA5' }}>
          <Shield size={12} />
          <span>
            ICH M3(R2) &middot; ICH CTD Module 1-5 &middot; 21 CFR 312 &middot;
            FDA Guidance for IND Applications &middot; Sentence-level source traceability
          </span>
        </div>
      </div>
    </div>
  );
}

function CircleIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={style}>
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
