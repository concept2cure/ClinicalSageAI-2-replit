/**
 * Evidence Linker Component
 *
 * UI for linking evidence objects to claims, sections, and requirements.
 * Supports drag-and-drop, search, and bulk linking operations.
 *
 * @version 1.0.0
 * @module client/src/components/evidence
 */

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LoadingState, ErrorState, EmptyState, DataStateWrapper } from '@/components/ui/states';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface EvidenceObject {
  id: string;
  title: string;
  code: string;
  evidenceType: string;
  evidenceCategory: string;
  evidenceLevel?: string;
  qualityScore?: number;
  relevanceScore?: number;
  status: string;
  isVerified: boolean;
}

interface EvidenceLink {
  id: string;
  evidenceId: string;
  targetType: 'claim' | 'section' | 'requirement' | 'standard' | 'question';
  targetId: string;
  targetPath?: string;
  linkType: 'supports' | 'contradicts' | 'references' | 'supersedes';
  strength: 'strong' | 'moderate' | 'weak';
  rationale?: string;
  isVerified: boolean;
}

interface LinkTarget {
  id: string;
  type: 'claim' | 'section' | 'requirement' | 'standard' | 'question';
  title: string;
  path?: string;
  linkedEvidence: number;
}

interface EvidenceLinkerProps {
  programId: string;
  targetType?: 'claim' | 'section' | 'requirement' | 'standard' | 'question';
  targetId?: string;
  onLinkCreated?: (link: EvidenceLink) => void;
  onLinkRemoved?: (linkId: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const fetchEvidence = async (programId: string): Promise<EvidenceObject[]> => {
  const response = await fetch(`/api/evidence?programId=${programId}`);
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to fetch evidence');
  return data.data;
};

const fetchLinks = async (evidenceId: string): Promise<EvidenceLink[]> => {
  const response = await fetch(`/api/evidence/${evidenceId}/links`);
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to fetch links');
  return data.data;
};

const createLink = async (
  linkData: Omit<EvidenceLink, 'id' | 'isVerified'>
): Promise<EvidenceLink> => {
  const response = await fetch('/api/evidence/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(linkData),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to create link');
  return data.data;
};

const deleteLink = async (linkId: string): Promise<void> => {
  const response = await fetch(`/api/evidence/links/${linkId}`, { method: 'DELETE' });
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to delete link');
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Evidence type badge */
const EvidenceTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const colors: Record<string, string> = {
    literature: 'bg-blue-100 text-blue-700',
    test_report: 'bg-green-100 text-green-700',
    clinical_data: 'bg-purple-100 text-purple-700',
    standard: 'bg-orange-100 text-orange-700',
    guidance: 'bg-cyan-100 text-cyan-700',
    expert_opinion: 'bg-pink-100 text-pink-700',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[type] || 'bg-gray-100 text-gray-700'}`}
    >
      {type.replace('_', ' ')}
    </span>
  );
};

/** Evidence level indicator */
const EvidenceLevelIndicator: React.FC<{ level?: string }> = ({ level }) => {
  if (!level) return null;

  const colors: Record<string, string> = {
    I: 'text-green-600 bg-green-100',
    II: 'text-blue-600 bg-blue-100',
    III: 'text-yellow-600 bg-yellow-100',
    IV: 'text-orange-600 bg-orange-100',
    V: 'text-gray-600 bg-gray-100',
  };

  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${colors[level] || 'bg-gray-100 text-gray-600'}`}
    >
      {level}
    </span>
  );
};

/** Quality score bar */
const QualityBar: React.FC<{ score?: number; label: string }> = ({ score, label }) => {
  if (score === undefined) return null;

  const percent = Math.round(score * 100);
  const color =
    percent >= 80
      ? 'bg-green-500'
      : percent >= 60
        ? 'bg-blue-500'
        : percent >= 40
          ? 'bg-yellow-500'
          : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-16">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-gray-600 w-8">{percent}%</span>
    </div>
  );
};

/** Link type selector */
const LinkTypeSelector: React.FC<{
  value: EvidenceLink['linkType'];
  onChange: (value: EvidenceLink['linkType']) => void;
}> = ({ value, onChange }) => {
  const options: Array<{ value: EvidenceLink['linkType']; label: string; color: string }> = [
    { value: 'supports', label: 'Supports', color: 'bg-green-100 text-green-700 border-green-300' },
    { value: 'contradicts', label: 'Contradicts', color: 'bg-red-100 text-red-700 border-red-300' },
    {
      value: 'references',
      label: 'References',
      color: 'bg-blue-100 text-blue-700 border-blue-300',
    },
    {
      value: 'supersedes',
      label: 'Supersedes',
      color: 'bg-purple-100 text-purple-700 border-purple-300',
    },
  ];

  return (
    <div className="flex gap-2">
      {options.map(option => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
            value === option.value
              ? option.color
              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

/** Strength selector */
const StrengthSelector: React.FC<{
  value: EvidenceLink['strength'];
  onChange: (value: EvidenceLink['strength']) => void;
}> = ({ value, onChange }) => {
  const options: Array<{ value: EvidenceLink['strength']; label: string }> = [
    { value: 'strong', label: 'Strong' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'weak', label: 'Weak' },
  ];

  return (
    <div className="flex items-center gap-1">
      {options.map(option => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-2 py-0.5 text-xs rounded ${
            value === option.value
              ? 'bg-gray-800 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

/** Evidence card for linking */
const EvidenceCard: React.FC<{
  evidence: EvidenceObject;
  isSelected: boolean;
  onSelect: () => void;
  onLink: () => void;
}> = ({ evidence, isSelected, onSelect, onLink }) => {
  return (
    <div
      className={`p-4 border rounded-lg transition-all cursor-pointer ${
        isSelected
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <EvidenceTypeBadge type={evidence.evidenceType} />
          <EvidenceLevelIndicator level={evidence.evidenceLevel} />
        </div>
        {evidence.isVerified && (
          <span className="text-green-500" title="Verified">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        )}
      </div>

      <h4 className="font-medium text-gray-900 text-sm mb-1 line-clamp-2">{evidence.title}</h4>
      <p className="text-xs text-gray-500 mb-3">{evidence.code}</p>

      <div className="space-y-1 mb-3">
        <QualityBar score={evidence.qualityScore} label="Quality" />
        <QualityBar score={evidence.relevanceScore} label="Relevance" />
      </div>

      {isSelected && (
        <button
          onClick={e => {
            e.stopPropagation();
            onLink();
          }}
          className="w-full mt-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
        >
          Link to Target
        </button>
      )}
    </div>
  );
};

/** Link card showing existing link */
const LinkCard: React.FC<{
  link: EvidenceLink;
  evidence?: EvidenceObject;
  onRemove: () => void;
}> = ({ link, evidence, onRemove }) => {
  const typeColors: Record<EvidenceLink['linkType'], string> = {
    supports: 'border-l-green-500',
    contradicts: 'border-l-red-500',
    references: 'border-l-blue-500',
    supersedes: 'border-l-purple-500',
  };

  return (
    <div className={`p-3 bg-white border rounded-lg border-l-4 ${typeColors[link.linkType]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase">{link.linkType}</span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-500">{link.strength}</span>
            {link.isVerified && (
              <span className="text-green-500">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            )}
          </div>
          {evidence && (
            <p className="text-sm font-medium text-gray-900 line-clamp-1">{evidence.title}</p>
          )}
          {link.rationale && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{link.rationale}</p>
          )}
        </div>
        <button
          onClick={onRemove}
          className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="Remove link"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const EvidenceLinker: React.FC<EvidenceLinkerProps> = ({
  programId,
  targetType,
  targetId,
  onLinkCreated,
  onLinkRemoved,
}) => {
  const queryClient = useQueryClient();

  // State
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<EvidenceLink['linkType']>('supports');
  const [strength, setStrength] = useState<EvidenceLink['strength']>('moderate');
  const [rationale, setRationale] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // Fetch evidence
  const {
    data: evidence,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['evidence', programId],
    queryFn: () => fetchEvidence(programId),
  });

  // Create link mutation
  const createLinkMutation = useMutation({
    mutationFn: createLink,
    onSuccess: newLink => {
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
      onLinkCreated?.(newLink);
      setSelectedEvidence(null);
      setRationale('');
    },
  });

  // Delete link mutation
  const deleteLinkMutation = useMutation({
    mutationFn: deleteLink,
    onSuccess: (_, linkId) => {
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
      onLinkRemoved?.(linkId);
    },
  });

  // Handle link creation
  const handleCreateLink = useCallback(() => {
    if (!selectedEvidence || !targetType || !targetId) return;

    createLinkMutation.mutate({
      evidenceId: selectedEvidence,
      targetType,
      targetId,
      linkType,
      strength,
      rationale: rationale || undefined,
    });
  }, [selectedEvidence, targetType, targetId, linkType, strength, rationale, createLinkMutation]);

  // Filter evidence
  const filteredEvidence = evidence?.filter(e => {
    if (searchQuery && !e.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterType !== 'all' && e.evidenceType !== filterType) return false;
    return true;
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Link Evidence</h3>
        <p className="text-sm text-gray-500 mt-1">
          Select evidence to link to {targetType || 'target'}
        </p>
      </div>

      {/* Search & Filters */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="relative">
          <input
            type="text"
            placeholder="Search evidence..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
          />
          <svg
            className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <div className="flex gap-2 flex-wrap">
          {['all', 'literature', 'test_report', 'clinical_data', 'standard'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                filterType === type
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {type === 'all' ? 'All' : type.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Link Configuration (shown when evidence selected) */}
      {selectedEvidence && (
        <div className="p-4 border-b border-gray-200 bg-blue-50 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Link Type</label>
            <LinkTypeSelector value={linkType} onChange={setLinkType} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Strength</label>
            <StrengthSelector value={strength} onChange={setStrength} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Rationale (optional)
            </label>
            <textarea
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              placeholder="Explain why this evidence supports the claim..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-blue-500 focus:border-blue-500"
              rows={2}
            />
          </div>
        </div>
      )}

      {/* Evidence List */}
      <div className="p-4 max-h-96 overflow-y-auto">
        <DataStateWrapper
          isLoading={isLoading}
          error={error as Error | null}
          data={filteredEvidence}
          loadingComponent={<LoadingState message="Loading evidence..." size="sm" />}
          emptyComponent={
            <EmptyState
              title="No evidence found"
              description="Add evidence to this program first"
            />
          }
          retry={refetch}
        >
          {evidenceData => (
            <div className="grid grid-cols-1 gap-3">
              {evidenceData.map(ev => (
                <EvidenceCard
                  key={ev.id}
                  evidence={ev}
                  isSelected={selectedEvidence === ev.id}
                  onSelect={() => setSelectedEvidence(ev.id === selectedEvidence ? null : ev.id)}
                  onLink={handleCreateLink}
                />
              ))}
            </div>
          )}
        </DataStateWrapper>
      </div>

      {/* Footer Actions */}
      {selectedEvidence && targetId && (
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={() => setSelectedEvidence(null)}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateLink}
            disabled={createLinkMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {createLinkMutation.isPending ? 'Linking...' : 'Create Link'}
          </button>
        </div>
      )}
    </div>
  );
};

export default EvidenceLinker;
