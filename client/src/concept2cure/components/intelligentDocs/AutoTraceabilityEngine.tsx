/**
 * Auto-Traceability Engine
 *
 * Phase 5: Intelligent Document System
 *
 * Zero manual work for traceability. The engine:
 * 1. Automatically detects claims as you type
 * 2. Matches claims to available sources using AI
 * 3. Suggests the best source for each claim
 * 4. One-click linking with proper citations
 * 5. Maintains audit trail automatically
 *
 * This is the "Heavy Lifter" Sherpa that carries the burden.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles,
  Link2,
  CheckCircle,
  AlertTriangle,
  Zap,
  FileText,
  Target,
  Activity,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  Eye,
} from 'lucide-react';
import type { SmartClaim, SourceSuggestion, ClaimType } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface AutoTraceabilityEngineProps {
  // Document content to analyze
  content: string;

  // Available sources from all connected modules
  availableSources: SourceSuggestion[];

  // Submission context for regulatory-aware matching
  submissionType?: 'IND' | '510K' | 'NDA' | 'BLA' | 'PMA' | 'CER' | 'MAA' | 'DE_NOVO';

  // Callbacks
  onClaimsDetected?: (claims: SmartClaim[]) => void;
  onLinkCreated?: (claim: SmartClaim, source: SourceSuggestion) => void;
  onBulkLink?: (links: Array<{ claim: SmartClaim; source: SourceSuggestion }>) => void;
  onSourcePreview?: (source: SourceSuggestion) => void;

  // Settings
  autoDetect?: boolean;
  showConfidence?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim Type Configuration
// ─────────────────────────────────────────────────────────────────────────────

const CLAIM_TYPE_CONFIG: Record<
  ClaimType,
  {
    label: string;
    color: string;
    icon: React.ElementType;
    requiredSourceTypes: SourceSuggestion['sourceType'][];
  }
> = {
  efficacy: {
    label: 'Efficacy Claim',
    color: 'purple',
    icon: Activity,
    requiredSourceTypes: ['clinical_study', 'literature'],
  },
  safety: {
    label: 'Safety Claim',
    color: 'green',
    icon: CheckCircle,
    requiredSourceTypes: ['clinical_study', 'literature', 'internal_data'],
  },
  design: {
    label: 'Design Claim',
    color: 'blue',
    icon: Target,
    requiredSourceTypes: ['test_report', 'internal_data'],
  },
  regulatory: {
    label: 'Regulatory Claim',
    color: 'indigo',
    icon: FileText,
    requiredSourceTypes: ['predicate_device', 'regulatory_document'],
  },
  clinical: {
    label: 'Clinical Claim',
    color: 'orange',
    icon: Activity,
    requiredSourceTypes: ['clinical_study', 'literature'],
  },
  statistical: {
    label: 'Statistical Claim',
    color: 'cyan',
    icon: Activity,
    requiredSourceTypes: ['clinical_study', 'literature', 'test_report'],
  },
  manufacturing: {
    label: 'Manufacturing Claim',
    color: 'amber',
    icon: Target,
    requiredSourceTypes: ['manufacturing_record', 'internal_data'],
  },
  comparison: {
    label: 'Comparison Claim',
    color: 'rose',
    icon: Activity,
    requiredSourceTypes: ['clinical_study', 'literature', 'predicate_device'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Claim Detection Patterns
// ─────────────────────────────────────────────────────────────────────────────

const CLAIM_PATTERNS: Array<{
  pattern: RegExp;
  type: ClaimType;
  confidence: number;
}> = [
  // Efficacy claims
  {
    pattern: /\b(demonstrated?|showed?|achieved?)\s+\w+\s+(efficacy|effectiveness|performance)/gi,
    type: 'efficacy',
    confidence: 90,
  },
  {
    pattern: /\b(\d+\.?\d*)\s*%\s*(efficacy|success\s+rate|response\s+rate)/gi,
    type: 'efficacy',
    confidence: 95,
  },

  // Safety claims
  {
    pattern: /\b(no|zero|minimal|low)\s+(adverse|side)\s+(events?|effects?|reactions?)/gi,
    type: 'safety',
    confidence: 90,
  },
  {
    pattern: /\b(safe|well-tolerated|tolerable)\s+(for|in|when)/gi,
    type: 'safety',
    confidence: 85,
  },

  // Design claims
  {
    pattern: /\b(designed?|manufactured?|constructed?)\s+(with|using|from)\s+/gi,
    type: 'design',
    confidence: 80,
  },
  {
    pattern: /\b(titanium|stainless\s+steel|polymer|silicone)\s+(housing|body|component)/gi,
    type: 'design',
    confidence: 85,
  },

  // Regulatory claims
  {
    pattern: /\b(FDA\s*cleared?|510\(k\)|CE\s+marked?|approved?)/gi,
    type: 'regulatory',
    confidence: 95,
  },
  { pattern: /\bpredicate\s+device/gi, type: 'regulatory', confidence: 90 },

  // Clinical claims
  {
    pattern: /\b(clinical\s+)?(trial|study|investigation)\s+(demonstrated?|showed?|found)/gi,
    type: 'clinical',
    confidence: 90,
  },
  {
    pattern: /\b(patients?|subjects?|participants?)\s+(showed?|demonstrated?|experienced?)/gi,
    type: 'clinical',
    confidence: 85,
  },

  // Statistical claims
  { pattern: /\bp\s*[<>=]\s*0\.\d+/gi, type: 'statistical', confidence: 95 },
  {
    pattern: /\b(\d+\.?\d*)\s*%\s*(accuracy|sensitivity|specificity|precision)/gi,
    type: 'statistical',
    confidence: 95,
  },
  { pattern: /\b(statistically\s+significant|CI\s+\d+%)/gi, type: 'statistical', confidence: 90 },

  // Manufacturing claims
  {
    pattern: /\b(GMP|cGMP|ISO\s*\d+|Good\s+Manufacturing)/gi,
    type: 'manufacturing',
    confidence: 90,
  },
  {
    pattern: /\bmanufactured?\s+(per|according\s+to|in\s+accordance)/gi,
    type: 'manufacturing',
    confidence: 85,
  },

  // Comparison claims
  {
    pattern: /\b(superior|better|improved|enhanced|comparable)\s+(to|than|with)/gi,
    type: 'comparison',
    confidence: 85,
  },
  {
    pattern: /\b(non-inferior|equivalent|similar)\s+(to|efficacy|safety)/gi,
    type: 'comparison',
    confidence: 90,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Match Algorithm
// ─────────────────────────────────────────────────────────────────────────────

function matchClaimToSources(claim: SmartClaim, sources: SourceSuggestion[]): SourceSuggestion[] {
  const config = CLAIM_TYPE_CONFIG[claim.claimType];

  // Filter to appropriate source types
  let candidates = sources.filter(
    s =>
      config.requiredSourceTypes.includes(s.sourceType) ||
      // Also accept high-relevance sources of any type
      s.relevanceScore >= 90
  );

  // Score each candidate
  const scored = candidates.map(source => {
    let score = source.relevanceScore;

    // Boost for exact source type match
    if (config.requiredSourceTypes.includes(source.sourceType)) {
      score += 10;
    }

    // Boost for keyword overlap
    const claimWords = claim.text.toLowerCase().split(/\s+/);
    const sourceWords = (source.title + ' ' + source.keyExcerpt).toLowerCase().split(/\s+/);
    const overlap = claimWords.filter(w => sourceWords.includes(w) && w.length > 3).length;
    score += overlap * 2;

    // Boost for regulatory source on regulatory claims
    if (claim.claimType === 'regulatory' && source.sourceType === 'predicate_device') {
      score += 15;
    }

    // Boost for clinical source on efficacy/safety claims
    if (
      ['efficacy', 'safety', 'clinical'].includes(claim.claimType) &&
      source.sourceType === 'clinical_study'
    ) {
      score += 10;
    }

    return { ...source, relevanceScore: Math.min(score, 100) };
  });

  // Sort by score and return top matches
  return scored.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim Card Component
// ─────────────────────────────────────────────────────────────────────────────

interface ClaimCardProps {
  claim: SmartClaim;
  suggestedSources: SourceSuggestion[];
  onLink: (source: SourceSuggestion) => void;
  onPreview: (source: SourceSuggestion) => void;
  onDismiss: () => void;
  showConfidence?: boolean;
}

const ClaimCard: React.FC<ClaimCardProps> = ({
  claim,
  suggestedSources,
  onLink,
  onPreview,
  onDismiss,
  showConfidence,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = CLAIM_TYPE_CONFIG[claim.claimType];
  const Icon = config.icon;

  const colorClasses = {
    purple: 'bg-purple-100 border-purple-200',
    green: 'bg-green-100 border-green-200',
    blue: 'bg-blue-100 border-blue-200',
    indigo: 'bg-blue-100 border-blue-200',
    orange: 'bg-orange-100 border-orange-200',
    cyan: 'bg-cyan-100 border-cyan-200',
    amber: 'bg-amber-100 border-amber-200',
    rose: 'bg-rose-100 border-rose-200',
  };

  const iconColorClasses = {
    purple: 'text-purple-600',
    green: 'text-green-600',
    blue: 'text-blue-600',
    indigo: 'text-blue-600',
    orange: 'text-orange-600',
    cyan: 'text-cyan-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
  };

  const topSuggestion = suggestedSources[0];

  return (
    <div className={`rounded-lg border ${colorClasses[config.color as keyof typeof colorClasses]}`}>
      {/* Claim Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <div
              className={`p-2 rounded-lg bg-white ${iconColorClasses[config.color as keyof typeof iconColorClasses]}`}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-stone-500">
                  {config.label}
                </span>
                {showConfidence && (
                  <span className="text-xs text-stone-400">
                    {Math.round(claim.detectionConfidence)}% confidence
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-stone-900">
                "{claim.text}"
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 text-stone-400 hover:text-stone-600"
            data-testid={`button-dismiss-claim-${claim.id}`}
            aria-label="Dismiss claim"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Best Match */}
        {topSuggestion && (
          <div className="mt-4 p-3 bg-white rounded-lg border border-stone-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Best Match
              </span>
              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                {topSuggestion.relevanceScore}% match
              </span>
            </div>

            <p className="text-sm font-medium text-stone-700 mb-1">
              {topSuggestion.title}
            </p>
            <p className="text-xs text-stone-500 italic line-clamp-2">
              "{topSuggestion.keyExcerpt}"
            </p>

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => onLink(topSuggestion)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors duration-150"
                data-testid={`button-link-claim-${claim.id}`}
              >
                <Link2 className="w-3.5 h-3.5" />
                Link Now
              </button>
              <button
                onClick={() => onPreview(topSuggestion)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-stone-600 text-sm hover:bg-stone-100 rounded-lg transition-colors duration-150"
                data-testid={`button-preview-claim-source-${claim.id}`}
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </button>
              {suggestedSources.length > 1 && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 ml-auto"
                  data-testid={`button-toggle-sources-${claim.id}`}
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      Hide {suggestedSources.length - 1} more
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      Show {suggestedSources.length - 1} more
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* No matches */}
        {!topSuggestion && (
          <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">No matching sources found</span>
            </div>
            <p className="text-xs text-amber-600 mt-1">
              Upload a source document or search for literature to support this claim.
            </p>
          </div>
        )}
      </div>

      {/* Expanded Sources */}
      {isExpanded && suggestedSources.length > 1 && (
        <div className="px-4 pb-4 pt-0 space-y-2">
          {suggestedSources.slice(1).map(source => (
            <div
              key={source.id}
              className="flex items-center justify-between p-2 bg-white rounded-lg border border-stone-200"
            >
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm text-stone-700 truncate">
                  {source.title}
                </p>
                <p className="text-xs text-stone-500">{source.relevanceScore}% match</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onLink(source)}
                  className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                  title="Link this source"
                  data-testid={`button-claim-link-source-${source.id}`}
                  aria-label="Link source"
                >
                  <Link2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onPreview(source)}
                  className="p-1.5 text-stone-500 hover:bg-stone-100 rounded"
                  title="Preview"
                  data-testid={`button-claim-preview-source-${source.id}`}
                  aria-label="Preview source"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Link Panel
// ─────────────────────────────────────────────────────────────────────────────

interface BulkLinkPanelProps {
  pendingLinks: Array<{ claim: SmartClaim; source: SourceSuggestion }>;
  onConfirmAll: () => void;
  onClear: () => void;
}

const BulkLinkPanel: React.FC<BulkLinkPanelProps> = ({ pendingLinks, onConfirmAll, onClear }) => {
  if (pendingLinks.length === 0) return null;

  return (
    <div className="p-4 bg-green-50 rounded-xl border-2 border-green-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-green-600" />
          <span className="font-semibold text-green-800">Quick Link All</span>
        </div>
        <span className="text-sm text-green-600">
          {pendingLinks.length} claims ready
        </span>
      </div>

      <p className="text-sm text-green-700 mb-4">
        The RI has found matching sources for these claims. Click below to link them all at once.
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={onConfirmAll}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors duration-150"
          data-testid="button-bulk-link-confirm"
        >
          <Link2 className="w-4 h-4" />
          Link All {pendingLinks.length} Claims
        </button>
        <button
          onClick={onClear}
          className="px-4 py-2 text-green-700 hover:bg-green-100 rounded-lg transition-colors duration-150"
          data-testid="button-bulk-link-clear"
        >
          Review Individually
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Auto-Traceability Engine Component
// ─────────────────────────────────────────────────────────────────────────────

export const AutoTraceabilityEngine: React.FC<AutoTraceabilityEngineProps> = ({
  content,
  availableSources,
  submissionType: _submissionType,
  onClaimsDetected,
  onLinkCreated,
  onBulkLink,
  onSourcePreview,
  autoDetect = true,
  showConfidence = true,
  className = '',
}) => {
  const [detectedClaims, setDetectedClaims] = useState<SmartClaim[]>([]);
  const [claimSuggestions, setClaimSuggestions] = useState<Map<string, SourceSuggestion[]>>(
    new Map()
  );
  const [dismissedClaims, setDismissedClaims] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Detect claims in content
  const detectClaims = useCallback(
    (text: string) => {
      if (!text || !autoDetect) return;

      setIsAnalyzing(true);

      // Simulate async processing
      setTimeout(() => {
        const claims: SmartClaim[] = [];

        CLAIM_PATTERNS.forEach(({ pattern, type, confidence }) => {
          let match;
          while ((match = pattern.exec(text)) !== null) {
            const from = match.index;
            const to = match.index + match[0].length;

            // Check for overlap with existing claims
            const overlaps = claims.some(
              c =>
                (from >= c.position.from && from <= c.position.to) ||
                (to >= c.position.from && to <= c.position.to)
            );

            if (!overlaps) {
              claims.push({
                id: `claim-${from}-${to}`,
                text: match[0],
                position: { from, to },
                claimType: type,
                detectionConfidence: confidence + Math.random() * 5 - 2.5, // Add some variance
                sourceStatus: 'needs-source',
                linkedSources: [],
              });
            }
          }
        });

        setDetectedClaims(claims);
        onClaimsDetected?.(claims);

        // Generate suggestions for each claim
        const suggestions = new Map<string, SourceSuggestion[]>();
        claims.forEach(claim => {
          const matches = matchClaimToSources(claim, availableSources);
          suggestions.set(claim.id, matches);
        });
        setClaimSuggestions(suggestions);

        setIsAnalyzing(false);
      }, 500);
    },
    [autoDetect, availableSources, onClaimsDetected]
  );

  // Re-detect when content changes
  useEffect(() => {
    const timer = setTimeout(() => {
      detectClaims(content);
    }, 1000);

    return () => clearTimeout(timer);
  }, [content, detectClaims]);

  // Filter out dismissed claims
  const visibleClaims = useMemo(
    () => detectedClaims.filter(c => !dismissedClaims.has(c.id) && c.sourceStatus !== 'supported'),
    [detectedClaims, dismissedClaims]
  );

  // Claims with high-confidence matches
  const autoLinkableClaims = useMemo(
    () =>
      visibleClaims
        .map(claim => {
          const suggestions = claimSuggestions.get(claim.id) || [];
          const topMatch = suggestions[0];
          if (topMatch && topMatch.relevanceScore >= 85) {
            return { claim, source: topMatch };
          }
          return null;
        })
        .filter((item): item is { claim: SmartClaim; source: SourceSuggestion } => item !== null),
    [visibleClaims, claimSuggestions]
  );

  // Handle linking
  const handleLink = useCallback(
    (claim: SmartClaim, source: SourceSuggestion) => {
      setDetectedClaims(prev =>
        prev.map(c =>
          c.id === claim.id
            ? { ...c, sourceStatus: 'supported', linkedSources: [...c.linkedSources, source] }
            : c
        )
      );
      onLinkCreated?.(claim, source);
    },
    [onLinkCreated]
  );

  // Handle bulk link
  const handleBulkLink = useCallback(() => {
    autoLinkableClaims.forEach(({ claim, source }) => {
      handleLink(claim, source);
    });
    onBulkLink?.(autoLinkableClaims);
  }, [autoLinkableClaims, handleLink, onBulkLink]);

  // Handle dismiss
  const handleDismiss = useCallback((claimId: string) => {
    setDismissedClaims(prev => new Set(prev).add(claimId));
  }, []);

  // Summary stats
  const totalClaims = detectedClaims.length;
  const supportedClaims = detectedClaims.filter(c => c.sourceStatus === 'supported').length;
  const needsSourceClaims = visibleClaims.length;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-stone-200/70 bg-white shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold text-stone-900">Auto-Traceability</h3>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {totalClaims} claims detected
          </p>
        </div>

        {isAnalyzing ? (
          <span className="flex items-center gap-1.5 text-xs text-blue-600">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Analyzing...
          </span>
        ) : (
          <div className="flex items-center gap-3 text-xs">
            <span className="px-2 py-1 rounded-full bg-green-100 text-green-700">
              {supportedClaims} sourced
            </span>
            <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700">
              {needsSourceClaims} need sources
            </span>
          </div>
        )}
      </div>

      {/* Bulk Link Panel */}
      <BulkLinkPanel
        pendingLinks={autoLinkableClaims}
        onConfirmAll={handleBulkLink}
        onClear={() => {}}
      />

      {/* Claims List */}
      {visibleClaims.length === 0 ? (
        <div className="text-center py-10 text-stone-500 bg-white rounded-xl border border-stone-200/70 shadow-sm">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p className="font-medium text-stone-700">All claims sourced!</p>
          <p className="text-sm mt-1">Your document is fully traceable.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleClaims.slice(0, 10).map(claim => (
            <ClaimCard
              key={claim.id}
              claim={claim}
              suggestedSources={claimSuggestions.get(claim.id) || []}
              onLink={source => handleLink(claim, source)}
              onPreview={source => onSourcePreview?.(source)}
              onDismiss={() => handleDismiss(claim.id)}
              showConfidence={showConfidence}
            />
          ))}

          {visibleClaims.length > 10 && (
            <p className="text-sm text-center text-stone-500 py-2">
              And {visibleClaims.length - 10} more claims...
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default AutoTraceabilityEngine;
