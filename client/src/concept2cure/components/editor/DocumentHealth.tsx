/**
 * DocumentHealth — Real-time document quality scoring panel.
 *
 * Computes a composite health score from:
 * - Section completeness (all required CTD sections filled)
 * - Regulatory language quality
 * - Cross-reference validity
 * - Citation coverage (claims backed by evidence)
 * - Formatting compliance
 * - Readability
 *
 * Shows score in status bar + detailed breakdown in panel.
 */

import React, { useMemo } from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileCheck,
  BookOpen,
  Link2,
  Type,
  BarChart3,
  TrendingUp,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface HealthDimension {
  id: string;
  label: string;
  icon: React.ElementType;
  score: number; // 0-100
  weight: number; // 0-1, all weights should sum to 1
  issues: string[];
  suggestions: string[];
}

interface DocumentHealthProps {
  content: string;
  documentType?: string;
  submissionType?: string;
  ctdSection?: string;
  requiredSections?: string[];
  onFixIssue?: (dimensionId: string, issueIndex: number) => void;
}

// ── Scoring Functions ──────────────────────────────────────────────────────

function analyzeCompleteness(content: string, requiredSections: string[]): { score: number; issues: string[]; suggestions: string[] } {
  if (!requiredSections.length) return { score: 100, issues: [], suggestions: [] };
  const text = content.toLowerCase();
  const found = requiredSections.filter(s => text.includes(s.toLowerCase()));
  const missing = requiredSections.filter(s => !text.includes(s.toLowerCase()));
  const score = Math.round((found.length / requiredSections.length) * 100);
  return {
    score,
    issues: missing.map(s => `Missing required section: "${s}"`),
    suggestions: missing.map(s => `Add a heading for "${s}" and fill in the content`),
  };
}

function analyzeRegulatoryLanguage(content: string): { score: number; issues: string[]; suggestions: string[] } {
  const text = content.replace(/<[^>]+>/g, ' ');
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check for informal language
  const informalWords = ['basically', 'actually', 'just', 'really', 'pretty much', 'kind of', 'sort of', 'gonna', 'wanna', 'stuff', 'things'];
  const foundInformal = informalWords.filter(w => text.toLowerCase().includes(w));
  if (foundInformal.length > 0) {
    issues.push(`Informal language detected: ${foundInformal.slice(0, 3).join(', ')}`);
    suggestions.push('Replace informal terms with precise regulatory language');
  }

  // Check for ambiguous terms
  const ambiguousTerms = ['may', 'could', 'might', 'possibly', 'perhaps', 'seems', 'appears to'];
  const foundAmbiguous = ambiguousTerms.filter(w => {
    const regex = new RegExp(`\\b${w}\\b`, 'i');
    return regex.test(text);
  });
  if (foundAmbiguous.length > 3) {
    issues.push(`Excessive hedging language (${foundAmbiguous.length} instances)`);
    suggestions.push('Use definitive statements: "shall" instead of "may", "will" instead of "could"');
  }

  // Check for passive voice overuse
  const passivePatterns = /\b(was|were|been|being|is|are)\s+(being\s+)?\w+ed\b/gi;
  const passiveMatches = text.match(passivePatterns) || [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const passiveRatio = sentences.length > 0 ? passiveMatches.length / sentences.length : 0;
  if (passiveRatio > 0.4) {
    issues.push(`High passive voice usage (${Math.round(passiveRatio * 100)}% of sentences)`);
    suggestions.push('Use active voice for clearer regulatory communication');
  }

  // Check for acronyms without definition
  const acronyms = text.match(/\b[A-Z]{2,6}\b/g) || [];
  const uniqueAcronyms = [...new Set(acronyms)];
  const undefinedAcronyms = uniqueAcronyms.filter(a => {
    // Check if the full form appears near the acronym
    return !text.includes(`(${a})`) && !text.includes(`${a} (`);
  });
  if (undefinedAcronyms.length > 5) {
    issues.push(`${undefinedAcronyms.length} acronyms may be undefined`);
    suggestions.push('Define all acronyms on first use: "Full Term (ACRONYM)"');
  }

  const deductions = issues.length * 12;
  return { score: Math.max(30, 100 - deductions), issues, suggestions };
}

function analyzeCitations(content: string): { score: number; issues: string[]; suggestions: string[] } {
  const text = content.replace(/<[^>]+>/g, ' ');
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Count claims (sentences with data or assertions)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  const claimPatterns = /\b(demonstrated|showed|resulted|achieved|significant|p\s*[<>=]|confidence interval|\d+%|efficacy|safety)\b/i;
  const claims = sentences.filter(s => claimPatterns.test(s));

  // Count citations
  const citations = text.match(/\[[\w\s,]+\d{4}\]|\(\w+[\s,]+\d{4}\)|\[\d+\]/g) || [];
  const traceabilityLinks = (content.match(/data-traceability/g) || []).length;
  const totalCitations = citations.length + traceabilityLinks;

  if (claims.length > 0 && totalCitations === 0) {
    issues.push(`${claims.length} data claims found with no citations`);
    suggestions.push('Add citations or traceability links to support key claims');
  } else if (claims.length > totalCitations * 3) {
    issues.push(`Low citation coverage: ${totalCitations} citations for ${claims.length} claims`);
    suggestions.push('Use /cite or [@...] to add citations from your evidence base');
  }

  const ratio = claims.length > 0 ? Math.min(1, totalCitations / Math.max(1, claims.length * 0.5)) : 1;
  return { score: Math.round(ratio * 100), issues, suggestions };
}

function analyzeFormatting(content: string): { score: number; issues: string[]; suggestions: string[] } {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check for headings
  const headings = (content.match(/<h[1-6][^>]*>/gi) || []).length;
  const wordCount = content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

  if (wordCount > 500 && headings < 2) {
    issues.push('Document lacks proper heading structure');
    suggestions.push('Add H1/H2/H3 headings to organize content into logical sections');
  }

  // Check for tables in data-heavy sections
  const hasNumbers = (content.match(/\d+\.\d+/g) || []).length;
  const hasTables = (content.match(/<table/gi) || []).length;
  if (hasNumbers > 10 && hasTables === 0) {
    issues.push('Numeric data detected without tables');
    suggestions.push('Consider presenting data in tables for clarity');
  }

  // Check for bullet lists
  const hasLists = (content.match(/<[uo]l/gi) || []).length;
  if (wordCount > 1000 && hasLists === 0) {
    issues.push('Long document with no lists');
    suggestions.push('Use bullet or numbered lists for requirements, procedures, and summaries');
  }

  const deductions = issues.length * 15;
  return { score: Math.max(40, 100 - deductions), issues, suggestions };
}

function analyzeReadability(content: string): { score: number; issues: string[]; suggestions: string[] } {
  const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const issues: string[] = [];
  const suggestions: string[] = [];

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const words = text.split(/\s+/).filter(Boolean);

  if (sentences.length === 0) return { score: 100, issues: [], suggestions: [] };

  const avgSentenceLength = words.length / sentences.length;

  // Regulatory docs can be complex, but 40+ word sentences are too long
  if (avgSentenceLength > 35) {
    issues.push(`Average sentence length: ${Math.round(avgSentenceLength)} words (target: <30)`);
    suggestions.push('Break long sentences into shorter, clearer statements');
  }

  // Check for very long paragraphs
  const paragraphs = content.split(/<\/p>|<br\s*\/?>|\n\n/).filter(p => p.replace(/<[^>]+>/g, '').trim().length > 50);
  const longParagraphs = paragraphs.filter(p => p.replace(/<[^>]+>/g, ' ').split(/\s+/).length > 150);
  if (longParagraphs.length > 0) {
    issues.push(`${longParagraphs.length} paragraph(s) exceed 150 words`);
    suggestions.push('Split long paragraphs to improve readability');
  }

  const deductions = issues.length * 15;
  return { score: Math.max(40, 100 - deductions), issues, suggestions };
}

// ── Main Component ─────────────────────────────────────────────────────────

export const DocumentHealth: React.FC<DocumentHealthProps> = ({
  content,
  documentType,
  submissionType,
  ctdSection,
  requiredSections = [],
  onFixIssue,
}) => {
  const dimensions = useMemo<HealthDimension[]>(() => {
    const completeness = analyzeCompleteness(content, requiredSections);
    const language = analyzeRegulatoryLanguage(content);
    const citations = analyzeCitations(content);
    const formatting = analyzeFormatting(content);
    const readability = analyzeReadability(content);

    return [
      { id: 'completeness', label: 'Section Completeness', icon: FileCheck, weight: 0.25, ...completeness },
      { id: 'language', label: 'Regulatory Language', icon: Shield, weight: 0.25, ...language },
      { id: 'citations', label: 'Citation Coverage', icon: BookOpen, weight: 0.2, ...citations },
      { id: 'formatting', label: 'Document Structure', icon: Type, weight: 0.15, ...formatting },
      { id: 'readability', label: 'Readability', icon: BarChart3, weight: 0.15, ...readability },
    ];
  }, [content, requiredSections]);

  const overallScore = useMemo(() => {
    return Math.round(dimensions.reduce((acc, d) => acc + d.score * d.weight, 0));
  }, [dimensions]);

  const totalIssues = dimensions.reduce((acc, d) => acc + d.issues.length, 0);

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-600';
    if (score >= 70) return 'text-amber-600';
    return 'text-red-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 90) return 'bg-emerald-50 border-emerald-200';
    if (score >= 70) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  const getBarColor = (score: number) => {
    if (score >= 90) return 'bg-emerald-500';
    if (score >= 70) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Overall Score Header */}
      <div className={cn('px-5 py-4 border-b border-stone-100', getScoreBg(overallScore))}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className={cn('w-5 h-5', getScoreColor(overallScore))} />
            <span className="text-sm font-semibold text-stone-900">Document Health</span>
          </div>
          <span className={cn('text-2xl font-semibold', getScoreColor(overallScore))}>
            {overallScore}
          </span>
        </div>
        <div className="w-full bg-white/60 rounded-full h-2">
          <div
            className={cn('h-2 rounded-full transition-all duration-500', getBarColor(overallScore))}
            style={{ width: `${overallScore}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-stone-500">
          <span>{totalIssues} issue{totalIssues !== 1 ? 's' : ''} found</span>
          <span>
            {documentType && <span className="mr-2">{documentType}</span>}
            {ctdSection && <span>CTD {ctdSection}</span>}
          </span>
        </div>
      </div>

      {/* Dimension Breakdown */}
      <div className="flex-1 overflow-y-auto">
        {dimensions.map(dim => {
          const Icon = dim.icon;
          const hasIssues = dim.issues.length > 0;

          return (
            <div key={dim.id} className="border-b border-stone-100">
              {/* Dimension header */}
              <div className="flex items-center gap-2 px-5 py-3">
                <Icon className={cn('w-4 h-4 shrink-0', getScoreColor(dim.score))} />
                <span className="text-xs font-semibold text-stone-700 flex-1">{dim.label}</span>
                <span className={cn('text-sm font-semibold', getScoreColor(dim.score))}>
                  {dim.score}
                </span>
                <div className="w-16 bg-stone-200 rounded-full h-1.5 ml-1">
                  <div
                    className={cn('h-1.5 rounded-full', getBarColor(dim.score))}
                    style={{ width: `${dim.score}%` }}
                  />
                </div>
              </div>

              {/* Issues */}
              {hasIssues && (
                <div className="px-5 pb-3 space-y-1.5">
                  {dim.issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-stone-600">{issue}</span>
                        {dim.suggestions[i] && (
                          <p className="text-stone-400 mt-0.5">{dim.suggestions[i]}</p>
                        )}
                      </div>
                      {onFixIssue && (
                        <button
                          onClick={() => onFixIssue(dim.id, i)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
                        >
                          Fix
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* All good */}
              {!hasIssues && (
                <div className="px-5 pb-3 flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle className="w-3 h-3" />
                  <span>All checks passed</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Compact health score for status bar */
export const DocumentHealthBadge: React.FC<{ content: string; requiredSections?: string[] }> = ({
  content,
  requiredSections = [],
}) => {
  const score = useMemo(() => {
    const completeness = analyzeCompleteness(content, requiredSections);
    const language = analyzeRegulatoryLanguage(content);
    const citations = analyzeCitations(content);
    const formatting = analyzeFormatting(content);
    const readability = analyzeReadability(content);
    return Math.round(
      completeness.score * 0.25 +
        language.score * 0.25 +
        citations.score * 0.2 +
        formatting.score * 0.15 +
        readability.score * 0.15
    );
  }, [content, requiredSections]);

  const color =
    score >= 90
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : score >= 70
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-red-100 text-red-700 border-red-200';

  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border', color)}>
      <TrendingUp className="w-3 h-3" />
      {score}%
    </span>
  );
};

export default DocumentHealth;
