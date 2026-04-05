/**
 * CompanyContextEditor — Global.md viewer/editor for Concept2Cure / AnA 1.0 RI.
 *
 * Shows what AnA knows about the company in a clean, compact document.
 * Simple Surface, Complex Engine: executives see a polished one-page summary,
 * each section editable inline with a pencil icon.
 *
 * Sections (progressive disclosure):
 *   Always visible: About, Regulatory Markets, Pipeline, Communication Preferences
 *   Expandable: Agency Relationships, Team, Quality & SOPs, Cross-Project Patterns
 */

import React, { useState, useCallback } from 'react';
import {
  Building2,
  Globe,
  FlaskConical,
  MessageSquare,
  Handshake,
  Users,
  ShieldCheck,
  GitBranch,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { useToast } from '@/hooks/use-toast';
import { DataStateWrapper } from '@/components/ui/statesV2';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DocumentUploadZone } from './DocumentUploadZone';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CompanyContextEditorProps {
  onClose?: () => void;
}

interface CompanyProfile {
  companyName?: string;
  industry?: string;
  stage?: string;
  regulatoryMarkets?: string[];
  pipeline?: PipelineAsset[];
  communicationPreferences?: string;
  agencyRelationships?: string;
  teamAndStakeholders?: string;
  qualityAndSOPs?: string;
  crossProjectPatterns?: string;
}

interface PipelineAsset {
  name: string;
  indication?: string;
  phase?: string;
}

type SectionKey = keyof CompanyProfile;

// ── Regulatory Market Options ──────────────────────────────────────────────────

const REGULATORY_MARKETS = [
  'FDA',
  'EMA',
  'PMDA',
  'Health Canada',
  'MHRA',
  'TGA',
  'NMPA',
  'ANVISA',
  'Swissmedic',
  'KFDA',
] as const;

// ── Section Configuration ──────────────────────────────────────────────────────

interface SectionConfig {
  key: SectionKey;
  label: string;
  icon: React.ElementType;
  description: string;
  alwaysVisible: boolean;
}

const SECTIONS: SectionConfig[] = [
  {
    key: 'companyName',
    label: 'About Your Company',
    icon: Building2,
    description: 'Company name, industry, and development stage',
    alwaysVisible: true,
  },
  {
    key: 'regulatoryMarkets',
    label: 'Regulatory Markets',
    icon: Globe,
    description: 'Markets where you file or plan to file',
    alwaysVisible: true,
  },
  {
    key: 'pipeline',
    label: 'Your Pipeline',
    icon: FlaskConical,
    description: 'Active programs and development assets',
    alwaysVisible: true,
  },
  {
    key: 'communicationPreferences',
    label: 'How AnA Should Work For You',
    icon: MessageSquare,
    description: 'Tone, detail level, and communication style',
    alwaysVisible: true,
  },
  {
    key: 'agencyRelationships',
    label: 'Agency Relationships',
    icon: Handshake,
    description: 'Past and current regulatory agency interactions',
    alwaysVisible: false,
  },
  {
    key: 'teamAndStakeholders',
    label: 'Team & Stakeholders',
    icon: Users,
    description: 'Key people and decision-makers',
    alwaysVisible: false,
  },
  {
    key: 'qualityAndSOPs',
    label: 'Quality & SOPs',
    icon: ShieldCheck,
    description: 'Quality systems, SOPs, and compliance frameworks',
    alwaysVisible: false,
  },
  {
    key: 'crossProjectPatterns',
    label: 'Cross-Project Patterns',
    icon: GitBranch,
    description: 'Patterns AnA has observed across your projects',
    alwaysVisible: false,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function isProfileEmpty(profile: CompanyProfile | undefined): boolean {
  if (!profile) return true;
  return (
    !profile.companyName &&
    !profile.industry &&
    (!profile.regulatoryMarkets || profile.regulatoryMarkets.length === 0) &&
    (!profile.pipeline || profile.pipeline.length === 0) &&
    !profile.communicationPreferences
  );
}

function renderSectionContent(section: SectionConfig, profile: CompanyProfile): string | null {
  switch (section.key) {
    case 'companyName': {
      const parts = [profile.companyName, profile.industry, profile.stage].filter(Boolean);
      return parts.length > 0 ? parts.join(' · ') : null;
    }
    case 'regulatoryMarkets':
      return profile.regulatoryMarkets?.length
        ? profile.regulatoryMarkets.join(', ')
        : null;
    case 'pipeline':
      return profile.pipeline?.length
        ? profile.pipeline
            .map((a) => [a.name, a.indication, a.phase].filter(Boolean).join(' — '))
            .join('\n')
        : null;
    case 'communicationPreferences':
      return profile.communicationPreferences || null;
    case 'agencyRelationships':
      return profile.agencyRelationships || null;
    case 'teamAndStakeholders':
      return profile.teamAndStakeholders || null;
    case 'qualityAndSOPs':
      return profile.qualityAndSOPs || null;
    case 'crossProjectPatterns':
      return profile.crossProjectPatterns || null;
    default:
      return null;
  }
}

// ── Market Chip Selector ───────────────────────────────────────────────────────

function MarketChipSelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (markets: string[]) => void;
}) {
  const toggle = (market: string) => {
    if (selected.includes(market)) {
      onChange(selected.filter((m) => m !== market));
    } else {
      onChange([...selected, market]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Regulatory markets">
      {REGULATORY_MARKETS.map((market) => {
        const isSelected = selected.includes(market);
        return (
          <Badge
            key={market}
            variant={isSelected ? 'default' : 'outline'}
            className="cursor-pointer select-none transition-colors"
            onClick={() => toggle(market)}
            role="checkbox"
            aria-checked={isSelected}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle(market);
              }
            }}
          >
            {market}
          </Badge>
        );
      })}
    </div>
  );
}

// ── Pipeline Editor ────────────────────────────────────────────────────────────

function PipelineEditor({
  assets,
  onChange,
}: {
  assets: PipelineAsset[];
  onChange: (assets: PipelineAsset[]) => void;
}) {
  const addAsset = () => {
    onChange([...assets, { name: '', indication: '', phase: '' }]);
  };

  const updateAsset = (index: number, field: keyof PipelineAsset, value: string) => {
    const updated = [...assets];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeAsset = (index: number) => {
    onChange(assets.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {assets.map((asset, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder="Asset name"
            value={asset.name}
            onChange={(e) => updateAsset(i, 'name', e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Indication"
            value={asset.indication ?? ''}
            onChange={(e) => updateAsset(i, 'indication', e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Phase"
            value={asset.phase ?? ''}
            onChange={(e) => updateAsset(i, 'phase', e.target.value)}
            className="w-24"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeAsset(i)}
            className="text-stone-400 hover:text-stone-900"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addAsset} className="text-sm">
        + Add asset
      </Button>
    </div>
  );
}

// ── Section Editor (inline) ────────────────────────────────────────────────────

function SectionEditor({
  section,
  profile,
  onSave,
  onCancel,
  isSaving,
}: {
  section: SectionConfig;
  profile: CompanyProfile;
  onSave: (patch: Partial<CompanyProfile>) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const form = useForm<CompanyProfile>({
    defaultValues: profile,
  });

  const handleSubmit = form.handleSubmit((data) => {
    const patch: Partial<CompanyProfile> = {};

    switch (section.key) {
      case 'companyName':
        patch.companyName = data.companyName;
        patch.industry = data.industry;
        patch.stage = data.stage;
        break;
      case 'regulatoryMarkets':
        patch.regulatoryMarkets = data.regulatoryMarkets;
        break;
      case 'pipeline':
        patch.pipeline = data.pipeline;
        break;
      default:
        patch[section.key] = data[section.key];
        break;
    }

    onSave(patch);
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {section.key === 'companyName' && (
        <div className="space-y-2">
          <Input
            placeholder="Company name"
            {...form.register('companyName')}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Industry (e.g., Oncology, Rare Disease)"
              {...form.register('industry')}
              className="flex-1"
            />
            <Input
              placeholder="Stage (e.g., Phase II, Pre-IND)"
              {...form.register('stage')}
              className="flex-1"
            />
          </div>
        </div>
      )}

      {section.key === 'regulatoryMarkets' && (
        <MarketChipSelector
          selected={form.watch('regulatoryMarkets') ?? []}
          onChange={(markets) => form.setValue('regulatoryMarkets', markets)}
        />
      )}

      {section.key === 'pipeline' && (
        <PipelineEditor
          assets={form.watch('pipeline') ?? []}
          onChange={(assets) => form.setValue('pipeline', assets)}
        />
      )}

      {section.key !== 'companyName' &&
        section.key !== 'regulatoryMarkets' &&
        section.key !== 'pipeline' && (
          <Textarea
            placeholder={section.description}
            rows={4}
            {...form.register(section.key)}
            className="resize-none"
          />
        )}

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Saving
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" />
              Save
            </span>
          )}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1" />
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── Section Row (read + edit toggle) ───────────────────────────────────────────

function SectionRow({
  section,
  profile,
  editingSection,
  onStartEdit,
  onSave,
  onCancel,
  isSaving,
}: {
  section: SectionConfig;
  profile: CompanyProfile;
  editingSection: SectionKey | null;
  onStartEdit: (key: SectionKey) => void;
  onSave: (patch: Partial<CompanyProfile>) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const isEditing = editingSection === section.key;
  const content = renderSectionContent(section, profile);
  const Icon = section.icon;

  return (
    <div
      className={cn(
        'group rounded-lg border transition-colors',
        isEditing
          ? 'border-stone-200 bg-stone-100/30 p-4'
          : 'border-transparent hover:border-stone-200 p-4',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="mt-0.5 flex-shrink-0 rounded-md bg-stone-100 p-1.5 text-stone-500">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-stone-800">{section.label}</h3>
            {!isEditing && (
              <div className="mt-1">
                {content ? (
                  <p className="text-sm text-stone-600 whitespace-pre-line leading-relaxed">
                    {content}
                  </p>
                ) : (
                  <p className="text-sm text-stone-400 italic">
                    Not set — click the pencil to add
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        {!isEditing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStartEdit(section.key)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-stone-600"
            aria-label={`Edit ${section.label}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {isEditing && (
        <div className="mt-3 pl-10">
          <SectionEditor
            section={section}
            profile={profile}
            onSave={onSave}
            onCancel={onCancel}
            isSaving={isSaving}
          />
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function CompanyContextEditor({ onClose }: CompanyContextEditorProps) {
  const [editingSection, setEditingSection] = useState<SectionKey | null>(null);
  const [showExpandable, setShowExpandable] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Data fetching ──────────────────────────────────────────────────────────

  const {
    data: profile,
    isLoading,
    error,
    refetch,
  } = useQuery<CompanyProfile>({
    queryKey: queryKeys.anaIntelligence.companyContext,
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/client-intelligence/profile');
      const json = await res.json();
      return json?.profile ?? null;
    },
  });

  // ── Mutation ───────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<CompanyProfile>) => {
      const res = await apiRequest('POST', '/api/client-intelligence/profile', {
        ...profile,
        ...patch,
      });
      const json = await res.json();
      return json?.profile ?? null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.anaIntelligence.companyContext,
      });
      setEditingSection(null);
      toast({
        title: 'Saved',
        description: 'Company context updated. AnA will use this in future conversations.',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Save failed',
        description: err.message || 'Could not update company context. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleStartEdit = useCallback((key: SectionKey) => {
    setEditingSection(key);
  }, []);

  const handleSave = useCallback(
    (patch: Partial<CompanyProfile>) => {
      saveMutation.mutate(patch);
    },
    [saveMutation],
  );

  const handleCancel = useCallback(() => {
    setEditingSection(null);
  }, []);

  // ── Section splits ─────────────────────────────────────────────────────────

  const visibleSections = SECTIONS.filter((s) => s.alwaysVisible);
  const expandableSections = SECTIONS.filter((s) => !s.alwaysVisible);
  const isEmpty = isProfileEmpty(profile);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Card className="mx-auto max-w-2xl border-stone-200 shadow-sm" data-testid="company-context-editor">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">
              What AnA Knows About Your Company
            </h2>
            <p className="text-sm text-stone-500 mt-0.5">
              This context helps AnA provide more relevant regulatory intelligence.
            </p>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Document Upload Zone */}
        <div className="mb-5">
          <DocumentUploadZone scope="company" />
        </div>

        {/* Content */}
        <DataStateWrapper<CompanyProfile>
          isLoading={isLoading}
          error={error as Error | null}
          data={profile ?? ({} as CompanyProfile)}
          emptyTitle="Tell AnA about your company"
          emptyDescription="Fill in details below so AnA can tailor regulatory guidance to your needs."
          isEmpty={() => isEmpty && !isLoading}
          retry={() => refetch()}
        >
          {(data) => (
            <div className="space-y-1">
              {/* First-time prompt */}
              {isEmpty && (
                <div className="rounded-lg border border-dashed border-stone-200 bg-stone-100/50 p-5 text-center mb-4">
                  <Building2 className="mx-auto h-8 w-8 text-stone-400 mb-2" />
                  <p className="text-sm font-medium text-stone-700">
                    Tell AnA about your company
                  </p>
                  <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                    Click any section below to get started. The more AnA knows,
                    the better it can tailor regulatory guidance to your needs.
                  </p>
                </div>
              )}

              {/* Always-visible sections */}
              {visibleSections.map((section) => (
                <SectionRow
                  key={section.key}
                  section={section}
                  profile={data}
                  editingSection={editingSection}
                  onStartEdit={handleStartEdit}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  isSaving={saveMutation.isPending}
                />
              ))}

              {/* Expandable sections */}
              <div className="pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowExpandable((prev) => !prev)}
                  className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors"
                >
                  {showExpandable ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {showExpandable ? 'Show less' : `${expandableSections.length} more sections`}
                </Button>

                {showExpandable && (
                  <div className="mt-1 space-y-1">
                    {expandableSections.map((section) => (
                      <SectionRow
                        key={section.key}
                        section={section}
                        profile={data}
                        editingSection={editingSection}
                        onStartEdit={handleStartEdit}
                        onSave={handleSave}
                        onCancel={handleCancel}
                        isSaving={saveMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DataStateWrapper>
      </div>
    </Card>
  );
}

export default CompanyContextEditor;
