/**
 * ProjectContextEditor — Local.md viewer/editor for C2C / AnA 1.0 RI
 *
 * Displays and edits what AnA knows about a specific project.
 * Progressive disclosure: 4 always-visible sections, 6 expandable sections.
 * Progress bar tracks 5 key fields for completeness.
 *
 * Fetch: GET  /api/client-intelligence/project/{projectId}/profile
 * Save:  POST /api/client-intelligence/project/{projectId}/profile
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { useToast } from '@/hooks/use-toast';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataStateWrapper } from '@/components/ui/statesV2';
import { DocumentUploadZone } from './DocumentUploadZone';

import {
  ChevronDown,
  ChevronRight,
  Pencil,
  X,
  Check,
  Plus,
  Trash2,
  FileText,
  Brain,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_TYPES = [
  'IND',
  'NDA',
  'BLA',
  '510k',
  'PMA',
  'ANDA',
  'biosimilar',
  'device',
  'combination',
] as const;

const DEVELOPMENT_PHASES = [
  { value: 'preclinical', label: 'Preclinical' },
  { value: 'phase1', label: 'Phase 1' },
  { value: 'phase2', label: 'Phase 2' },
  { value: 'phase3', label: 'Phase 3' },
  { value: 'phase4', label: 'Phase 4' },
  { value: 'nda_bla', label: 'NDA / BLA' },
] as const;

const AGENCIES = [
  'FDA',
  'EMA',
  'PMDA',
  'Health Canada',
  'TGA',
  'NMPA',
  'MHRA',
] as const;

type ProjectType = (typeof PROJECT_TYPES)[number];
type DevelopmentPhase = (typeof DEVELOPMENT_PHASES)[number]['value'];
type Agency = (typeof AGENCIES)[number];

// ── Types ─────────────────────────────────────────────────────────────────────

interface DecisionEntry {
  date: string;
  decision: string;
  rationale: string;
}

interface RiskEntry {
  description: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
}

interface OpenQuestion {
  question: string;
  priority: 'low' | 'medium' | 'high';
}

interface DocumentStatus {
  type: string;
  status: 'missing' | 'uploaded' | 'processing' | 'ready';
  lastUpdated?: string;
}

interface Capability {
  name: string;
  enabled: boolean;
}

interface ProjectProfile {
  // Section 1: About This Project
  projectName: string;
  projectType: ProjectType | '';
  developmentPhase: DevelopmentPhase | '';
  drugDeviceName: string;
  therapeuticArea: string;
  mechanismOfAction: string;
  indication: string;
  // Section 2: Target Agencies
  targetAgencies: Agency[];
  // Section 3: Clinical Design
  clinicalDesign: string;
  // Section 4: Project Instructions
  projectInstructions: string;
  // Section 5: Document Status
  documentStatuses: DocumentStatus[];
  // Section 6: Decisions Log
  decisions: DecisionEntry[];
  // Section 7: Risk Factors
  risks: RiskEntry[];
  // Section 8: Open Questions
  openQuestions: OpenQuestion[];
  // Section 9: Submission Timeline
  submissionTimeline: string;
  // Section 10: AnA Capabilities
  capabilities: Capability[];
}

const EMPTY_PROFILE: ProjectProfile = {
  projectName: '',
  projectType: '',
  developmentPhase: '',
  drugDeviceName: '',
  therapeuticArea: '',
  mechanismOfAction: '',
  indication: '',
  targetAgencies: [],
  clinicalDesign: '',
  projectInstructions: '',
  documentStatuses: [],
  decisions: [],
  risks: [],
  openQuestions: [],
  submissionTimeline: '',
  capabilities: [],
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProjectContextEditorProps {
  projectId: string | number;
  projectName?: string;
  onClose?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Calculates progress from 5 key fields: projectType, drugDeviceName, therapeuticArea, targetAgencies, clinicalDesign */
function computeKeyFieldProgress(profile: ProjectProfile): { filled: number; total: 5 } {
  let filled = 0;
  if (profile.projectType) filled++;
  if (profile.drugDeviceName?.trim()) filled++;
  if (profile.therapeuticArea?.trim()) filled++;
  if (profile.targetAgencies?.length > 0) filled++;
  if (profile.clinicalDesign?.trim()) filled++;
  return { filled, total: 5 };
}

const RISK_COLORS: Record<string, string> = {
  low: 'bg-stone-100 text-stone-800',
  medium: 'bg-stone-100 text-stone-800',
  high: 'bg-stone-100 text-stone-800',
};

const STATUS_COLORS: Record<string, string> = {
  missing: 'bg-stone-100 text-stone-600',
  uploaded: 'bg-stone-100 text-stone-700',
  processing: 'bg-stone-100 text-stone-700',
  ready: 'bg-stone-100 text-stone-800',
};

// ── Section wrapper ───────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  readOnly?: boolean;
  children: React.ReactNode;
  editContent?: React.ReactNode;
}

function Section({
  title,
  collapsible = false,
  defaultOpen = true,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  readOnly = false,
  children,
  editContent,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = useCallback(() => {
    if (collapsible) setOpen((v) => !v);
  }, [collapsible]);

  return (
    <div className="border-b border-stone-100 last:border-b-0">
      <div
        className={`flex items-center justify-between px-4 py-3 ${
          collapsible ? 'cursor-pointer hover:bg-stone-50' : ''
        }`}
        onClick={collapsible && !editing ? toggle : undefined}
        role={collapsible ? 'button' : undefined}
        aria-expanded={collapsible ? open : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={collapsible && !editing ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        } : undefined}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          {collapsible && (
            <span className="text-stone-400">
              {open ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
          )}
          {title}
        </div>
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onSave} disabled={saving}>
                <Check className="h-3.5 w-3.5 text-stone-700" />
              </Button>
            </>
          ) : !readOnly ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="opacity-0 group-hover/section:opacity-100 transition-opacity"
              aria-label={`Edit ${title}`}
            >
              <Pencil className="h-3.5 w-3.5 text-stone-400" />
            </Button>
          ) : null}
        </div>
      </div>
      {(open || !collapsible) && (
        <div className="px-4 pb-3">
          {editing && editContent ? editContent : children}
        </div>
      )}
    </div>
  );
}

// ── Fact line ─────────────────────────────────────────────────────────────────

function FactLine({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value || (typeof value === 'string' && !value.trim())) {
    return (
      <div className="flex items-start gap-2 py-0.5 text-sm">
        <span className="text-stone-400 min-w-[140px] shrink-0">{label}</span>
        <span className="text-stone-300 italic">Not set</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 py-0.5 text-sm">
      <span className="text-stone-500 min-w-[140px] shrink-0">{label}</span>
      <span className="text-stone-800">{value}</span>
    </div>
  );
}

// ── Agency chips ──────────────────────────────────────────────────────────────

function AgencyChips({
  selected,
  onChange,
  readOnly = true,
}: {
  selected: Agency[];
  onChange?: (agencies: Agency[]) => void;
  readOnly?: boolean;
}) {
  const toggle = (agency: Agency) => {
    if (readOnly || !onChange) return;
    if (selected.includes(agency)) {
      onChange(selected.filter((a) => a !== agency));
    } else {
      onChange([...selected, agency]);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Target agencies">
      {AGENCIES.map((agency) => {
        const active = selected.includes(agency);
        return (
          <Badge
            key={agency}
            variant={active ? 'default' : 'outline'}
            className={`${readOnly ? 'cursor-default' : 'cursor-pointer'} text-xs ${
              active ? '' : 'text-stone-400 border-stone-200'
            }`}
            onClick={() => toggle(agency)}
            role="checkbox"
            aria-checked={active}
            tabIndex={readOnly ? -1 : 0}
            onKeyDown={(e) => {
              if (!readOnly && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                toggle(agency);
              }
            }}
          >
            {agency}
          </Badge>
        );
      })}
    </div>
  );
}

// ── Phase label helper ────────────────────────────────────────────────────────

function phaseLabel(value: string): string {
  const match = DEVELOPMENT_PHASES.find((p) => p.value === value);
  return match ? match.label : value;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProjectContextEditor({
  projectId,
  projectName,
  onClose,
}: ProjectContextEditorProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editingSection, setEditingSection] = useState<string | null>(null);

  // ── Fetch profile ───────────────────────────────────────────────────────
  const {
    data: profile,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.anaIntelligence.projectContext(projectId),
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/client-intelligence/project/${projectId}/profile`,
      );
      const json = await res.json();
      return { ...EMPTY_PROFILE, ...json?.data, ...json?.profile } as ProjectProfile;
    },
  });

  // ── Save mutation ───────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<ProjectProfile>) => {
      const res = await apiRequest(
        'POST',
        `/api/client-intelligence/project/${projectId}/profile`,
        patch,
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.anaIntelligence.projectContext(projectId),
      });
      toast({ title: 'Saved', description: 'Project context updated.' });
      setEditingSection(null);
    },
    onError: (err: Error) => {
      toast({
        title: 'Save failed',
        description: err.message || 'Could not update project context.',
        variant: 'destructive',
      });
    },
  });

  // ── Form for current editing section ────────────────────────────────────
  const form = useForm<ProjectProfile>({
    defaultValues: profile ?? EMPTY_PROFILE,
  });

  const startEditing = useCallback(
    (section: string) => {
      form.reset(profile ?? EMPTY_PROFILE);
      setEditingSection(section);
    },
    [form, profile],
  );

  const cancelEditing = useCallback(() => {
    setEditingSection(null);
  }, []);

  const saveSection = useCallback(
    (fields: (keyof ProjectProfile)[]) => {
      const values = form.getValues();
      const patch: Partial<ProjectProfile> = {};
      for (const f of fields) {
        (patch as Record<string, unknown>)[f] = values[f];
      }
      saveMutation.mutate(patch);
    },
    [form, saveMutation],
  );

  const progress = useMemo(
    () => computeKeyFieldProgress(profile ?? EMPTY_PROFILE),
    [profile],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-sm" data-testid="project-context-editor">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-stone-900" />
            <CardTitle className="text-base">
              {projectName
                ? `${projectName} -- Project Context`
                : 'Project Context'}
            </CardTitle>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-stone-500 mt-1">
          What AnA knows about this project. The more you fill in, the better AnA
          can assist.
        </p>
        {/* Progress bar -- 5 key fields */}
        <div className="mt-3 flex items-center gap-3">
          <Progress
            value={(progress.filled / progress.total) * 100}
            className="h-2 flex-1"
          />
          <span className="text-xs font-medium text-stone-600 whitespace-nowrap">
            {progress.filled}/{progress.total} key fields filled
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <DataStateWrapper<ProjectProfile>
          data={profile}
          isLoading={isLoading}
          error={error as Error | null}
          loadingMessage="Loading project context..."
          emptyTitle="No project context found"
          emptyDescription="Start editing to teach AnA about this project."
          retry={() => refetch()}
        >
          {(data) => (
            <div className="divide-y divide-stone-100">
              {/* ── 1. About This Project ─────────────────────────── */}
              <div className="group/section">
                <Section
                  title="About This Project"
                  editing={editingSection === 'about'}
                  onEdit={() => startEditing('about')}
                  onCancel={cancelEditing}
                  onSave={() =>
                    saveSection([
                      'projectName',
                      'projectType',
                      'developmentPhase',
                      'drugDeviceName',
                      'therapeuticArea',
                      'mechanismOfAction',
                      'indication',
                    ])
                  }
                  saving={saveMutation.isPending}
                  editContent={
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="project-field-projectName" className="text-xs text-stone-500 mb-1 block">
                          Project Name
                        </label>
                        <Input
                          id="project-field-projectName"
                          {...form.register('projectName')}
                          placeholder="Project name"
                        />
                      </div>
                      <div>
                        <label htmlFor="project-field-projectType" className="text-xs text-stone-500 mb-1 block">
                          Project Type
                        </label>
                        <Controller
                          control={form.control}
                          name="projectType"
                          render={({ field }) => (
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger id="project-field-projectType">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                {PROJECT_TYPES.map((t) => (
                                  <SelectItem key={t} value={t}>
                                    {t}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div>
                        <label htmlFor="project-field-developmentPhase" className="text-xs text-stone-500 mb-1 block">
                          Development Phase
                        </label>
                        <Controller
                          control={form.control}
                          name="developmentPhase"
                          render={({ field }) => (
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger id="project-field-developmentPhase">
                                <SelectValue placeholder="Select phase" />
                              </SelectTrigger>
                              <SelectContent>
                                {DEVELOPMENT_PHASES.map((p) => (
                                  <SelectItem key={p.value} value={p.value}>
                                    {p.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div>
                        <label htmlFor="project-field-drugDeviceName" className="text-xs text-stone-500 mb-1 block">
                          Drug / Device Name
                        </label>
                        <Input
                          id="project-field-drugDeviceName"
                          {...form.register('drugDeviceName')}
                          placeholder="Drug or device name"
                        />
                      </div>
                      <div>
                        <label htmlFor="project-field-therapeuticArea" className="text-xs text-stone-500 mb-1 block">
                          Therapeutic Area
                        </label>
                        <Input
                          id="project-field-therapeuticArea"
                          {...form.register('therapeuticArea')}
                          placeholder="e.g. Oncology, Cardiology, Rare Disease"
                        />
                      </div>
                      <div>
                        <label htmlFor="project-field-mechanismOfAction" className="text-xs text-stone-500 mb-1 block">
                          Mechanism of Action
                        </label>
                        <Input
                          id="project-field-mechanismOfAction"
                          {...form.register('mechanismOfAction')}
                          placeholder="e.g. PD-1 inhibitor, mRNA vaccine"
                        />
                      </div>
                      <div>
                        <label htmlFor="project-field-indication" className="text-xs text-stone-500 mb-1 block">
                          Indication
                        </label>
                        <Input
                          id="project-field-indication"
                          {...form.register('indication')}
                          placeholder="Target indication"
                        />
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-0.5">
                    <FactLine
                      label="Name"
                      value={data.projectName || projectName}
                    />
                    <FactLine label="Type" value={data.projectType} />
                    <FactLine
                      label="Phase"
                      value={
                        data.developmentPhase
                          ? phaseLabel(data.developmentPhase)
                          : null
                      }
                    />
                    <FactLine label="Drug / Device" value={data.drugDeviceName} />
                    <FactLine
                      label="Therapeutic Area"
                      value={data.therapeuticArea}
                    />
                    <FactLine label="Mechanism" value={data.mechanismOfAction} />
                    <FactLine label="Indication" value={data.indication} />
                  </div>
                </Section>
              </div>

              {/* ── 2. Target Agencies ────────────────────────────── */}
              <div className="group/section">
                <Section
                  title="Target Agencies"
                  editing={editingSection === 'agencies'}
                  onEdit={() => startEditing('agencies')}
                  onCancel={cancelEditing}
                  onSave={() => saveSection(['targetAgencies'])}
                  saving={saveMutation.isPending}
                  editContent={
                    <Controller
                      control={form.control}
                      name="targetAgencies"
                      render={({ field }) => (
                        <AgencyChips
                          selected={field.value}
                          onChange={field.onChange}
                          readOnly={false}
                        />
                      )}
                    />
                  }
                >
                  <AgencyChips selected={data.targetAgencies} />
                </Section>
              </div>

              {/* ── 3. Clinical Design ───────────────────────────── */}
              <div className="group/section">
                <Section
                  title="Clinical Design"
                  editing={editingSection === 'clinical'}
                  onEdit={() => startEditing('clinical')}
                  onCancel={cancelEditing}
                  onSave={() => saveSection(['clinicalDesign'])}
                  saving={saveMutation.isPending}
                  editContent={
                    <Textarea
                      {...form.register('clinicalDesign')}
                      placeholder="Brief description of endpoints, population, and study design..."
                      rows={4}
                      className="resize-none"
                    />
                  }
                >
                  <p className="text-sm text-stone-700 whitespace-pre-wrap">
                    {data.clinicalDesign || (
                      <span className="text-stone-300 italic">
                        No clinical design details set
                      </span>
                    )}
                  </p>
                </Section>
              </div>

              {/* ── 4. Project Instructions ───────────────────────── */}
              <div className="group/section">
                <Section
                  title="Project Instructions"
                  editing={editingSection === 'instructions'}
                  onEdit={() => startEditing('instructions')}
                  onCancel={cancelEditing}
                  onSave={() => saveSection(['projectInstructions'])}
                  saving={saveMutation.isPending}
                  editContent={
                    <Textarea
                      {...form.register('projectInstructions')}
                      placeholder="What should AnA focus on for this project? Priorities, guardrails, persona preferences..."
                      rows={4}
                      className="resize-none"
                    />
                  }
                >
                  <p className="text-sm text-stone-700 whitespace-pre-wrap">
                    {data.projectInstructions || (
                      <span className="text-stone-300 italic">
                        No project instructions set
                      </span>
                    )}
                  </p>
                </Section>
              </div>

              {/* ── 5. Document Status (collapsible, read-only) ──── */}
              <div className="group/section">
                <Section
                  title="Document Status"
                  collapsible
                  defaultOpen={false}
                  editing={false}
                  onEdit={() => {}}
                  onCancel={() => {}}
                  onSave={() => {}}
                  readOnly
                >
                  {data.documentStatuses.length === 0 ? (
                    <p className="text-sm text-stone-300 italic">
                      No documents tracked yet
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {data.documentStatuses.map((doc, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-stone-400" />
                            <span className="text-stone-700">{doc.type}</span>
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-xs ${STATUS_COLORS[doc.status] ?? ''}`}
                          >
                            {doc.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3">
                    <DocumentUploadZone scope="project" scopeId={String(projectId)} />
                  </div>
                </Section>
              </div>

              {/* ── 6. Decisions Log (collapsible) ───────────────── */}
              <div className="group/section">
                <Section
                  title="Decisions Log"
                  collapsible
                  defaultOpen={false}
                  editing={editingSection === 'decisions'}
                  onEdit={() => startEditing('decisions')}
                  onCancel={cancelEditing}
                  onSave={() => saveSection(['decisions'])}
                  saving={saveMutation.isPending}
                  editContent={<DecisionsEditor form={form} />}
                >
                  {data.decisions.length === 0 ? (
                    <p className="text-sm text-stone-300 italic">
                      No decisions recorded
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.decisions.map((d, i) => (
                        <div
                          key={i}
                          className="text-sm border-l-2 border-stone-200 pl-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-stone-400">
                              {d.date}
                            </span>
                            <span className="text-stone-800 font-medium">
                              {d.decision}
                            </span>
                          </div>
                          {d.rationale && (
                            <p className="text-xs text-stone-500 mt-0.5">
                              {d.rationale}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>

              {/* ── 7. Risk Factors (collapsible) ────────────────── */}
              <div className="group/section">
                <Section
                  title="Risk Factors"
                  collapsible
                  defaultOpen={false}
                  editing={editingSection === 'risks'}
                  onEdit={() => startEditing('risks')}
                  onCancel={cancelEditing}
                  onSave={() => saveSection(['risks'])}
                  saving={saveMutation.isPending}
                  editContent={<RisksEditor form={form} />}
                >
                  {data.risks.length === 0 ? (
                    <p className="text-sm text-stone-300 italic">
                      No risks identified
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.risks.map((r, i) => (
                        <div key={i} className="text-sm">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-xs ${RISK_COLORS[r.likelihood] ?? ''}`}
                            >
                              L:{r.likelihood}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-xs ${RISK_COLORS[r.impact] ?? ''}`}
                            >
                              I:{r.impact}
                            </Badge>
                            <span className="text-stone-800">
                              {r.description}
                            </span>
                          </div>
                          {r.mitigation && (
                            <p className="text-xs text-stone-500 mt-0.5 ml-[100px]">
                              Mitigation: {r.mitigation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>

              {/* ── 8. Open Questions (collapsible) ──────────────── */}
              <div className="group/section">
                <Section
                  title="Open Questions"
                  collapsible
                  defaultOpen={false}
                  editing={editingSection === 'questions'}
                  onEdit={() => startEditing('questions')}
                  onCancel={cancelEditing}
                  onSave={() => saveSection(['openQuestions'])}
                  saving={saveMutation.isPending}
                  editContent={<QuestionsEditor form={form} />}
                >
                  {data.openQuestions.length === 0 ? (
                    <p className="text-sm text-stone-300 italic">
                      No open questions
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {data.openQuestions.map((q, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm"
                        >
                          <Badge
                            variant="outline"
                            className={`text-xs shrink-0 ${RISK_COLORS[q.priority] ?? ''}`}
                          >
                            {q.priority}
                          </Badge>
                          <span className="text-stone-700">{q.question}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>

              {/* ── 9. Submission Timeline (collapsible) ─────────── */}
              <div className="group/section">
                <Section
                  title="Submission Timeline"
                  collapsible
                  defaultOpen={false}
                  editing={editingSection === 'timeline'}
                  onEdit={() => startEditing('timeline')}
                  onCancel={cancelEditing}
                  onSave={() => saveSection(['submissionTimeline'])}
                  saving={saveMutation.isPending}
                  editContent={
                    <Textarea
                      {...form.register('submissionTimeline')}
                      placeholder="Key milestones, target submission dates, and timeline notes..."
                      rows={4}
                      className="resize-none"
                    />
                  }
                >
                  <p className="text-sm text-stone-700 whitespace-pre-wrap">
                    {data.submissionTimeline || (
                      <span className="text-stone-300 italic">
                        No submission timeline set
                      </span>
                    )}
                  </p>
                </Section>
              </div>

              {/* ── 10. AnA Capabilities (collapsible, read-only) ── */}
              <div className="group/section">
                <Section
                  title="AnA Capabilities for This Project"
                  collapsible
                  defaultOpen={false}
                  editing={false}
                  onEdit={() => {}}
                  onCancel={() => {}}
                  onSave={() => {}}
                  readOnly
                >
                  {data.capabilities.length === 0 ? (
                    <p className="text-sm text-stone-300 italic">
                      Capabilities are auto-detected based on project type and data
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {data.capabilities.map((cap, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-sm"
                        >
                          <div
                            className={`h-2 w-2 rounded-full ${
                              cap.enabled ? 'bg-stone-900' : 'bg-stone-300'
                            }`}
                          />
                          <span
                            className={
                              cap.enabled ? 'text-stone-700' : 'text-stone-400'
                            }
                          >
                            {cap.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            </div>
          )}
        </DataStateWrapper>
      </CardContent>
    </Card>
  );
}

// ── Sub-editors for array fields ──────────────────────────────────────────────

function DecisionsEditor({
  form,
}: {
  form: ReturnType<typeof useForm<ProjectProfile>>;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'decisions',
  });

  return (
    <div className="space-y-3">
      {fields.map((field, i) => (
        <div key={field.id} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <Input
              {...form.register(`decisions.${i}.date`)}
              placeholder="YYYY-MM-DD"
              className="text-xs"
            />
            <Input
              {...form.register(`decisions.${i}.decision`)}
              placeholder="Decision"
            />
            <Input
              {...form.register(`decisions.${i}.rationale`)}
              placeholder="Rationale"
              className="text-xs"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => remove(i)}>
            <Trash2 className="h-3.5 w-3.5 text-stone-400" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          append({
            date: new Date().toISOString().slice(0, 10),
            decision: '',
            rationale: '',
          })
        }
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Decision
      </Button>
    </div>
  );
}

function RisksEditor({
  form,
}: {
  form: ReturnType<typeof useForm<ProjectProfile>>;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'risks',
  });

  return (
    <div className="space-y-3">
      {fields.map((field, i) => (
        <div key={field.id} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <Input
              {...form.register(`risks.${i}.description`)}
              placeholder="Risk description"
            />
            <div className="flex gap-2">
              <Controller
                control={form.control}
                name={`risks.${i}.likelihood`}
                render={({ field: f }) => (
                  <Select value={f.value} onValueChange={f.onChange}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Likelihood" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <Controller
                control={form.control}
                name={`risks.${i}.impact`}
                render={({ field: f }) => (
                  <Select value={f.value} onValueChange={f.onChange}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Impact" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <Input
              {...form.register(`risks.${i}.mitigation`)}
              placeholder="Mitigation"
              className="text-xs"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => remove(i)}>
            <Trash2 className="h-3.5 w-3.5 text-stone-400" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          append({
            description: '',
            likelihood: 'medium',
            impact: 'medium',
            mitigation: '',
          })
        }
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Risk
      </Button>
    </div>
  );
}

function QuestionsEditor({
  form,
}: {
  form: ReturnType<typeof useForm<ProjectProfile>>;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'openQuestions',
  });

  return (
    <div className="space-y-3">
      {fields.map((field, i) => (
        <div key={field.id} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <Input
              {...form.register(`openQuestions.${i}.question`)}
              placeholder="Question"
            />
            <Controller
              control={form.control}
              name={`openQuestions.${i}.priority`}
              render={({ field: f }) => (
                <Select value={f.value} onValueChange={f.onChange}>
                  <SelectTrigger className="text-xs w-32">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => remove(i)}>
            <Trash2 className="h-3.5 w-3.5 text-stone-400" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => append({ question: '', priority: 'medium' })}
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Question
      </Button>
    </div>
  );
}

export default ProjectContextEditor;
