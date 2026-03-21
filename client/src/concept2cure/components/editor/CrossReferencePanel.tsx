/**
 * CrossReferencePanel — eCTD Cross-Reference Manager
 *
 * Auto-detects potential cross-references in document content, validates them
 * against available artifacts/sections, and provides tools to insert properly
 * formatted references and navigate to target sections.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Link2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus,
  Search,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

type ReferenceStatus = 'valid' | 'broken' | 'unlinked';

interface DetectedReference {
  id: string;
  matchedText: string;
  targetSection: string;
  targetArtifactId: string | null;
  targetArtifactTitle: string | null;
  status: ReferenceStatus;
  position: number;
  suggestion?: string;
}

interface CrossReferencePanelProps {
  content: string;
  projectId?: string;
  artifacts?: Array<{
    id: string;
    title: string;
    ctdSection?: string;
    content?: string;
  }>;
  onInsertReference?: (refText: string, targetSection: string) => void;
  onNavigateToSection?: (sectionId: string) => void;
  onClose?: () => void;
}

// ── CTD Module Map ───────────────────────────────────────────────────────────

const CTD_MODULES: Record<string, string> = {
  '1': 'Administrative Information',
  '1.1': 'Forms',
  '1.2': 'Cover Letters',
  '1.3': 'Administrative Information',
  '2': 'Common Technical Document Summaries',
  '2.1': 'CTD Table of Contents',
  '2.2': 'CTD Introduction',
  '2.3': 'Quality Overall Summary',
  '2.4': 'Nonclinical Overview',
  '2.5': 'Clinical Overview',
  '2.6': 'Nonclinical Written and Tabulated Summaries',
  '2.7': 'Clinical Summary',
  '2.7.1': 'Summary of Biopharmaceutic Studies',
  '2.7.2': 'Summary of Clinical Pharmacology Studies',
  '2.7.3': 'Summary of Clinical Efficacy',
  '2.7.4': 'Summary of Clinical Safety',
  '2.7.5': 'References',
  '2.7.6': 'Synopses of Individual Studies',
  '3': 'Quality',
  '3.1': 'Table of Contents',
  '3.2': 'Body of Data',
  '3.2.S': 'Drug Substance',
  '3.2.P': 'Drug Product',
  '4': 'Nonclinical Study Reports',
  '4.1': 'Table of Contents',
  '4.2': 'Study Reports',
  '4.3': 'Literature References',
  '5': 'Clinical Study Reports',
  '5.1': 'Table of Contents',
  '5.2': 'Tabular Listing of All Clinical Studies',
  '5.3': 'Clinical Study Reports',
  '5.4': 'Literature References',
};

// ── Detection Patterns ───────────────────────────────────────────────────────

const REFERENCE_PATTERNS: Array<{ pattern: RegExp; extractor: (match: RegExpExecArray) => string }> = [
  {
    pattern: /Section\s+(\d+(?:\.\d+)*)/gi,
    extractor: (m) => m[1],
  },
  {
    pattern: /Module\s+(\d+(?:\.\d+)*)/gi,
    extractor: (m) => m[1],
  },
  {
    pattern: /See\s+(?:also\s+)?(?:the\s+)?((?:Section|Module|Table|Figure|Appendix)\s+[\w\d.]+(?:\s*[-—]\s*[^.;,\n]+)?)/gi,
    extractor: (m) => {
      const sub = m[1].match(/(\d+(?:\.\d+)*)/);
      return sub ? sub[1] : '';
    },
  },
  {
    pattern: /as\s+described\s+in\s+(?:the\s+)?(?:Section|Module)\s+(\d+(?:\.\d+)*)/gi,
    extractor: (m) => m[1],
  },
  {
    pattern: /refer\s+to\s+(?:the\s+)?(?:Section|Module)\s+(\d+(?:\.\d+)*)/gi,
    extractor: (m) => m[1],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function getStatusColor(status: ReferenceStatus): string {
  switch (status) {
    case 'valid':
      return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'broken':
      return 'text-red-700 bg-red-50 border-red-200';
    case 'unlinked':
      return 'text-amber-700 bg-amber-50 border-amber-200';
  }
}

function getStatusIcon(status: ReferenceStatus): React.ReactNode {
  switch (status) {
    case 'valid':
      return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />;
    case 'broken':
      return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    case 'unlinked':
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
  }
}

function getStatusLabel(status: ReferenceStatus): string {
  switch (status) {
    case 'valid':
      return 'Valid';
    case 'broken':
      return 'Broken';
    case 'unlinked':
      return 'Unlinked';
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function CrossReferencePanel({
  content,
  projectId,
  artifacts = [],
  onInsertReference,
  onNavigateToSection,
  onClose,
}: CrossReferencePanelProps) {
  const [references, setReferences] = useState<DetectedReference[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ReferenceStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInsertForm, setShowInsertForm] = useState(false);
  const [insertModule, setInsertModule] = useState('');
  const [insertSection, setInsertSection] = useState('');

  // Resolve a section number to an artifact if available
  const resolveSection = useCallback(
    (sectionNum: string): { artifactId: string | null; title: string | null; status: ReferenceStatus } => {
      // Check if any artifact matches this CTD section
      const matchingArtifact = artifacts.find((a) => {
        if (!a.ctdSection) return false;
        return a.ctdSection === sectionNum || a.ctdSection.startsWith(sectionNum + '.');
      });

      if (matchingArtifact) {
        const hasContent = matchingArtifact.content && matchingArtifact.content.trim().length > 0;
        return {
          artifactId: matchingArtifact.id,
          title: matchingArtifact.title,
          status: hasContent ? 'valid' : 'broken',
        };
      }

      // Check if the section exists in the CTD module map
      const ctdTitle = CTD_MODULES[sectionNum];
      if (ctdTitle) {
        return {
          artifactId: null,
          title: ctdTitle,
          status: 'unlinked',
        };
      }

      // Unknown section
      return {
        artifactId: null,
        title: null,
        status: 'broken',
      };
    },
    [artifacts]
  );

  // Find a suggestion for a broken reference
  const findSuggestion = useCallback(
    (sectionNum: string): string | undefined => {
      // Try parent section
      const parts = sectionNum.split('.');
      while (parts.length > 1) {
        parts.pop();
        const parentNum = parts.join('.');
        const parentArtifact = artifacts.find(
          (a) => a.ctdSection === parentNum
        );
        if (parentArtifact) {
          return `Did you mean Section ${parentNum} (${parentArtifact.title})?`;
        }
        if (CTD_MODULES[parentNum]) {
          return `Did you mean Module ${parentNum} — ${CTD_MODULES[parentNum]}?`;
        }
      }

      // Try to find a close match in artifacts
      const baseModule = sectionNum.split('.')[0];
      const sameModule = artifacts.filter(
        (a) => a.ctdSection && a.ctdSection.startsWith(baseModule + '.')
      );
      if (sameModule.length > 0) {
        const first = sameModule[0];
        return `Closest match: Section ${first.ctdSection} (${first.title})`;
      }

      return undefined;
    },
    [artifacts]
  );

  // Scan the content for cross-references
  const scanDocument = useCallback(() => {
    setIsScanning(true);

    // Small delay to show scanning state
    setTimeout(() => {
      const detected: DetectedReference[] = [];
      const seen = new Set<string>();

      for (const { pattern, extractor } of REFERENCE_PATTERNS) {
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(content)) !== null) {
          const sectionNum = extractor(match);
          if (!sectionNum) continue;

          // Deduplicate by matched text + position
          const key = `${match[0]}@${match.index}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const resolved = resolveSection(sectionNum);
          const suggestion =
            resolved.status === 'broken'
              ? findSuggestion(sectionNum)
              : undefined;

          detected.push({
            id: generateId(),
            matchedText: match[0].trim(),
            targetSection: sectionNum,
            targetArtifactId: resolved.artifactId,
            targetArtifactTitle: resolved.title,
            status: resolved.status,
            position: match.index,
            suggestion,
          });
        }
      }

      // Sort by position in document
      detected.sort((a, b) => a.position - b.position);

      setReferences(detected);
      setHasScanned(true);
      setIsScanning(false);
    }, 300);
  }, [content, resolveSection, findSuggestion]);

  // Summary stats
  const stats = useMemo(() => {
    const total = references.length;
    const valid = references.filter((r) => r.status === 'valid').length;
    const broken = references.filter((r) => r.status === 'broken').length;
    const unlinked = references.filter((r) => r.status === 'unlinked').length;
    return { total, valid, broken, unlinked };
  }, [references]);

  // Filtered references
  const filteredReferences = useMemo(() => {
    let result = references;

    if (filterStatus !== 'all') {
      result = result.filter((r) => r.status === filterStatus);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.matchedText.toLowerCase().includes(q) ||
          r.targetSection.toLowerCase().includes(q) ||
          (r.targetArtifactTitle && r.targetArtifactTitle.toLowerCase().includes(q))
      );
    }

    return result;
  }, [references, filterStatus, searchQuery]);

  // Handle insert reference
  const handleInsertReference = useCallback(() => {
    if (!insertModule && !insertSection) return;

    const sectionNum = insertSection
      ? `${insertModule}.${insertSection}`
      : insertModule;
    const ctdTitle = CTD_MODULES[sectionNum];
    const matchingArtifact = artifacts.find((a) => a.ctdSection === sectionNum);
    const title = matchingArtifact?.title || ctdTitle || '';

    const refText = title
      ? `See Module ${insertModule}${insertSection ? `, Section ${sectionNum}` : ''} \u2014 ${title}`
      : `See Module ${insertModule}${insertSection ? `, Section ${sectionNum}` : ''}`;

    onInsertReference?.(refText, sectionNum);
    setShowInsertForm(false);
    setInsertModule('');
    setInsertSection('');
  }, [insertModule, insertSection, artifacts, onInsertReference]);

  return (
    <div className="flex flex-col h-full bg-white border-l border-zinc-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-zinc-50">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-indigo-600" />
          <span className="text-sm font-semibold text-zinc-900">
            Cross-Reference Manager
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowInsertForm((v) => !v)}
            className={cn(
              'p-1.5 rounded-md text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors',
              showInsertForm && 'text-indigo-600 bg-indigo-50'
            )}
            title="Insert Reference"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={scanDocument}
            disabled={isScanning}
            className="p-1.5 rounded-md text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
            title="Scan Document"
          >
            <RefreshCw
              className={cn('w-4 h-4', isScanning && 'animate-spin')}
            />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors duration-150"
              title="Close"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Insert Reference Form */}
      {showInsertForm && (
        <div className="px-4 py-3 border-b border-zinc-200 bg-indigo-50/50 space-y-2">
          <div className="text-xs font-medium text-zinc-700">
            Insert Cross-Reference
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
                CTD Module
              </label>
              <select
                value={insertModule}
                onChange={(e) => {
                  setInsertModule(e.target.value);
                  setInsertSection('');
                }}
                className="w-full text-xs border border-zinc-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
              >
                <option value="">Select module...</option>
                <option value="1">Module 1 — Administrative</option>
                <option value="2">Module 2 — Summaries</option>
                <option value="3">Module 3 — Quality</option>
                <option value="4">Module 4 — Nonclinical</option>
                <option value="5">Module 5 — Clinical</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
                Section (optional)
              </label>
              <input
                type="text"
                value={insertSection}
                onChange={(e) => setInsertSection(e.target.value)}
                placeholder="e.g. 3.2"
                className="w-full text-xs border border-zinc-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
              />
            </div>
          </div>
          {insertModule && (
            <div className="text-[11px] text-zinc-500 italic">
              Preview:{' '}
              <span className="text-zinc-700 not-italic">
                {(() => {
                  const sNum = insertSection
                    ? `${insertModule}.${insertSection}`
                    : insertModule;
                  const t =
                    artifacts.find((a) => a.ctdSection === sNum)?.title ||
                    CTD_MODULES[sNum] ||
                    '';
                  return t
                    ? `See Module ${insertModule}${insertSection ? `, Section ${sNum}` : ''} \u2014 ${t}`
                    : `See Module ${insertModule}${insertSection ? `, Section ${sNum}` : ''}`;
                })()}
              </span>
            </div>
          )}
          <button
            onClick={handleInsertReference}
            disabled={!insertModule}
            className="w-full text-xs font-medium py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            Insert Reference
          </button>
        </div>
      )}

      {/* Summary Stats */}
      {hasScanned && (
        <div className="px-4 py-2.5 border-b border-zinc-200 bg-zinc-50/50">
          <div className="flex items-center gap-3 text-[11px]">
            <button
              onClick={() => setFilterStatus('all')}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors',
                filterStatus === 'all'
                  ? 'bg-zinc-200 text-zinc-900 font-medium'
                  : 'text-zinc-500 hover:text-zinc-700'
              )}
            >
              <MapPin className="w-3 h-3" />
              {stats.total} Total
            </button>
            <button
              onClick={() => setFilterStatus('valid')}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors',
                filterStatus === 'valid'
                  ? 'bg-emerald-100 text-emerald-800 font-medium'
                  : 'text-emerald-600 hover:text-emerald-800'
              )}
            >
              <CheckCircle className="w-3 h-3" />
              {stats.valid}
            </button>
            <button
              onClick={() => setFilterStatus('broken')}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors',
                filterStatus === 'broken'
                  ? 'bg-red-100 text-red-800 font-medium'
                  : 'text-red-600 hover:text-red-800'
              )}
            >
              <XCircle className="w-3 h-3" />
              {stats.broken}
            </button>
            <button
              onClick={() => setFilterStatus('unlinked')}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors',
                filterStatus === 'unlinked'
                  ? 'bg-amber-100 text-amber-800 font-medium'
                  : 'text-amber-600 hover:text-amber-800'
              )}
            >
              <AlertTriangle className="w-3 h-3" />
              {stats.unlinked}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      {hasScanned && references.length > 0 && (
        <div className="px-4 py-2 border-b border-zinc-200">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter references..."
              className="w-full text-xs border border-zinc-200 rounded-md pl-7 pr-2 py-1.5 bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
            />
          </div>
        </div>
      )}

      {/* Reference List */}
      <div className="flex-1 overflow-y-auto">
        {!hasScanned ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <Link2 className="w-10 h-10 text-zinc-300 mb-3" />
            <p className="text-sm text-zinc-500 mb-1">
              No scan performed yet
            </p>
            <p className="text-xs text-zinc-400 mb-4">
              Scan the document to detect cross-references, validate links, and
              find broken references.
            </p>
            <button
              onClick={scanDocument}
              disabled={isScanning}
              className="flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors duration-150"
            >
              <RefreshCw
                className={cn('w-3.5 h-3.5', isScanning && 'animate-spin')}
              />
              Scan Document
            </button>
          </div>
        ) : isScanning ? (
          <div className="flex flex-col items-center justify-center h-full">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
            <p className="text-sm text-zinc-500">Scanning document...</p>
          </div>
        ) : filteredReferences.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <CheckCircle className="w-10 h-10 text-zinc-300 mb-3" />
            <p className="text-sm text-zinc-500 mb-1">
              {references.length === 0
                ? 'No cross-references detected'
                : 'No references match the current filter'}
            </p>
            <p className="text-xs text-zinc-400">
              {references.length === 0
                ? 'The document does not contain recognizable eCTD cross-references.'
                : 'Try adjusting the filter or search query.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredReferences.map((ref) => (
              <div
                key={ref.id}
                className="px-4 py-3 hover:bg-zinc-50/80 transition-colors group"
              >
                {/* Matched text */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {getStatusIcon(ref.status)}
                    <span className="text-xs font-medium text-zinc-900 truncate">
                      {ref.matchedText}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0',
                      getStatusColor(ref.status)
                    )}
                  >
                    {getStatusLabel(ref.status)}
                  </span>
                </div>

                {/* Target info */}
                <div className="ml-5 space-y-1">
                  <div className="text-[11px] text-zinc-500">
                    <span className="font-medium text-zinc-600">Target:</span>{' '}
                    Section {ref.targetSection}
                    {ref.targetArtifactTitle && (
                      <>
                        {' '}
                        &mdash;{' '}
                        <span className="text-zinc-700">
                          {ref.targetArtifactTitle}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Suggestion for broken refs */}
                  {ref.status === 'broken' && ref.suggestion && (
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 rounded px-2 py-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>{ref.suggestion}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-0.5">
                    {ref.targetArtifactId && onNavigateToSection && (
                      <button
                        onClick={() => onNavigateToSection(ref.targetArtifactId!)}
                        className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 transition-colors duration-150"
                      >
                        <ArrowRight className="w-3 h-3" />
                        Go to section
                      </button>
                    )}
                    {ref.status === 'unlinked' && onNavigateToSection && (
                      <button
                        onClick={() => onNavigateToSection(ref.targetSection)}
                        className="flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-800 transition-colors duration-150"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Create section
                      </button>
                    )}
                    {ref.status === 'broken' && onInsertReference && ref.suggestion && (
                      <button
                        onClick={() => {
                          // Extract suggested section number from suggestion text
                          const sugMatch = ref.suggestion?.match(/(\d+(?:\.\d+)*)/);
                          if (sugMatch) {
                            const sugSection = sugMatch[1];
                            const sugTitle =
                              CTD_MODULES[sugSection] ||
                              artifacts.find((a) => a.ctdSection === sugSection)?.title ||
                              '';
                            const refText = sugTitle
                              ? `See Module ${sugSection.split('.')[0]}, Section ${sugSection} \u2014 ${sugTitle}`
                              : `See Section ${sugSection}`;
                            onInsertReference(refText, sugSection);
                          }
                        }}
                        className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 transition-colors duration-150"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Fix reference
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {hasScanned && references.length > 0 && (
        <div className="px-4 py-2 border-t border-zinc-200 bg-zinc-50">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>
              {filteredReferences.length} of {references.length} references shown
            </span>
            <button
              onClick={scanDocument}
              disabled={isScanning}
              className="flex items-center gap-1 text-indigo-500 hover:text-indigo-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={cn('w-3 h-3', isScanning && 'animate-spin')}
              />
              Re-scan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CrossReferencePanel;
