/**
 * ProjectConfigPanel — Right-side Sheet flyout for project configuration.
 *
 * Replaces the legacy EditProjectModal with a tabbed flyout that stays open
 * while the user continues chatting. Opens from the gear icon in ProjectHeaderBar.
 *
 * Tabs: General | Instructions | Team | Compliance
 *
 * @module concept2cure/components/projects/ProjectConfigPanel
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import {
  Settings,
  FileText,
  Users,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  Lock,
  AlertTriangle,
} from 'lucide-react';

import type { Project, SubmissionType, ProjectStatus } from '@/concept2cure/types';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const SUBMISSION_TYPES: { value: SubmissionType; label: string }[] = [
  { value: '510K', label: '510(k)' },
  { value: 'IND', label: 'IND' },
  { value: 'NDA', label: 'NDA' },
  { value: 'BLA', label: 'BLA' },
  { value: 'PMA', label: 'PMA' },
  { value: 'MAA', label: 'MAA' },
  { value: 'DE_NOVO', label: 'De Novo' },
  { value: 'EUA', label: 'EUA' },
  { value: 'IVDR', label: 'IVDR' },
];

const TARGET_AGENCIES = ['FDA', 'EMA', 'PMDA', 'Health Canada'] as const;

const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'in_review', label: 'In Review' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'archived', label: 'Archived' },
];

const MAX_INSTRUCTIONS_LENGTH = 5000;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onUpdateProject: (project: Project) => void;
}

interface GeneralFormValues {
  name: string;
  submissionType: SubmissionType;
  product: string;
  sponsor: string;
  targetAgency: string;
  targetSubmissionDate: string;
  status: ProjectStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const ProjectConfigPanel: React.FC<ProjectConfigPanelProps> = ({
  open,
  onOpenChange,
  project,
  onUpdateProject,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── General tab form ────────────────────────────────────────────────────
  const generalForm = useForm<GeneralFormValues>({
    defaultValues: buildGeneralDefaults(project),
  });

  // ── Instructions state ──────────────────────────────────────────────────
  const [customInstructions, setCustomInstructions] = React.useState(
    project?.customInstructions ?? ''
  );
  const instructionsLength = customInstructions.length;

  // Re-sync form when project changes or panel opens
  useEffect(() => {
    if (open && project) {
      generalForm.reset(buildGeneralDefaults(project));
      setCustomInstructions(project.customInstructions ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id]);

  // ── Persist helper ──────────────────────────────────────────────────────
  const persistField = useCallback(
    async (fieldName: string, value: unknown) => {
      if (!project) return;

      try {
        const response = await apiRequest('PATCH', `/api/concept2cure/projects/${project.id}`, {
          [fieldName]: value,
        });

        if (!response.ok) {
          throw new Error('Failed to save');
        }

        const updatedProject = await response.json();

        // Optimistic update via callback
        onUpdateProject({ ...project, [fieldName]: value });

        // Invalidate project queries so other components pick up changes
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });

        toast({
          title: 'Saved',
          description: `${formatFieldLabel(fieldName)} updated successfully.`,
        });
      } catch {
        toast({
          title: 'Save failed',
          description: `Could not update ${formatFieldLabel(fieldName)}. Please try again.`,
          variant: 'destructive',
        });
      }
    },
    [project, onUpdateProject, queryClient, toast]
  );

  // ── Auto-save on blur for text inputs ───────────────────────────────────
  const handleBlur = useCallback(
    (fieldName: keyof GeneralFormValues) => {
      const currentValue = generalForm.getValues(fieldName);
      const originalValue = buildGeneralDefaults(project)[fieldName];
      if (currentValue !== originalValue) {
        persistField(fieldName, currentValue);
      }
    },
    [generalForm, project, persistField]
  );

  // ── Auto-save for select / radio changes ────────────────────────────────
  const handleSelectChange = useCallback(
    (fieldName: keyof GeneralFormValues, value: string) => {
      generalForm.setValue(fieldName, value as any);
      persistField(fieldName, value);
    },
    [generalForm, persistField]
  );

  // ── Instructions save on blur ───────────────────────────────────────────
  const handleInstructionsBlur = useCallback(() => {
    if (customInstructions !== (project?.customInstructions ?? '')) {
      persistField('customInstructions', customInstructions);
    }
  }, [customInstructions, project?.customInstructions, persistField]);

  const handleResetInstructions = useCallback(() => {
    setCustomInstructions('');
    persistField('customInstructions', '');
  }, [persistField]);

  if (!project) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto"
        data-testid="project-config-panel"
      >
        <SheetHeader className="pb-4 border-b border-zinc-200">
          <SheetTitle className="flex items-center gap-2 text-zinc-900">
            <Settings className="h-5 w-5 text-zinc-500" />
            Project Configuration
          </SheetTitle>
          <SheetDescription className="text-sm text-zinc-500">
            Configure project settings, instructions, and compliance.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="general" className="mt-4">
          <TabsList className="w-full grid grid-cols-4" aria-label="Project configuration tabs">
            <TabsTrigger value="general" className="text-xs gap-1">
              <Settings className="h-3.5 w-3.5" />
              General
            </TabsTrigger>
            <TabsTrigger value="instructions" className="text-xs gap-1">
              <FileText className="h-3.5 w-3.5" />
              Instructions
            </TabsTrigger>
            <TabsTrigger value="team" className="text-xs gap-1">
              <Users className="h-3.5 w-3.5" />
              Team
            </TabsTrigger>
            <TabsTrigger value="compliance" className="text-xs gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Compliance
            </TabsTrigger>
          </TabsList>

          {/* ── General Tab ──────────────────────────────────────────── */}
          <TabsContent value="general" className="mt-4 space-y-5" data-testid="config-tab-general">
            {/* Project Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Project Name</label>
              <Input
                {...generalForm.register('name', { required: true })}
                placeholder="e.g., CardioFlow Heart Monitor"
                onBlur={() => handleBlur('name')}
                data-testid="config-project-name"
              />
            </div>

            {/* Submission Type */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Submission Type</label>
              <Select
                value={generalForm.watch('submissionType')}
                onValueChange={(v) => handleSelectChange('submissionType', v)}
              >
                <SelectTrigger data-testid="config-submission-type">
                  <SelectValue placeholder="Select submission type" />
                </SelectTrigger>
                <SelectContent>
                  {SUBMISSION_TYPES.map((st) => (
                    <SelectItem key={st.value} value={st.value}>
                      {st.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Product / Device Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Product / Device Name</label>
              <Input
                {...generalForm.register('product')}
                placeholder="e.g., CardioFlow, Atorvastatin 20 mg"
                onBlur={() => handleBlur('product')}
                data-testid="config-product"
              />
            </div>

            {/* Sponsor */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Sponsor</label>
              <Input
                {...generalForm.register('sponsor')}
                placeholder="e.g., Acme Biotech, Inc."
                onBlur={() => handleBlur('sponsor')}
                data-testid="config-sponsor"
              />
            </div>

            {/* Target Agency */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Target Agency</label>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Target agency">
                {TARGET_AGENCIES.map((agency) => {
                  const isSelected = generalForm.watch('targetAgency') === agency;
                  return (
                    <Button
                      key={agency}
                      type="button"
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleSelectChange('targetAgency', agency)}
                      data-testid={`config-agency-${agency.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {agency}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Target Submission Date */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Target Submission Date</label>
              <Input
                type="date"
                {...generalForm.register('targetSubmissionDate')}
                onBlur={() => handleBlur('targetSubmissionDate')}
                data-testid="config-target-date"
              />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Status</label>
              <Select
                value={generalForm.watch('status')}
                onValueChange={(v) => handleSelectChange('status', v)}
              >
                <SelectTrigger data-testid="config-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* ── Instructions Tab ─────────────────────────────────────── */}
          <TabsContent
            value="instructions"
            className="mt-4 space-y-4"
            data-testid="config-tab-instructions"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-zinc-900">Custom Instructions</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Project-specific guidance injected into every AnA conversation.
                </p>
              </div>
              <Badge
                variant="outline"
                className="text-xs border-emerald-200 text-emerald-700 bg-emerald-50"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Active
              </Badge>
            </div>

            <Textarea
              value={customInstructions}
              onChange={(e) => {
                if (e.target.value.length <= MAX_INSTRUCTIONS_LENGTH) {
                  setCustomInstructions(e.target.value);
                }
              }}
              onBlur={handleInstructionsBlur}
              placeholder="Add custom instructions for AnA in this project. For example: 'Focus on FDA Class II device requirements. Always cite 21 CFR 820 when discussing QMS. Our predicate device is...'"
              rows={10}
              className="resize-none font-mono text-sm"
              data-testid="config-custom-instructions"
            />

            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                {instructionsLength.toLocaleString()} / {MAX_INSTRUCTIONS_LENGTH.toLocaleString()} characters
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetInstructions}
                disabled={!customInstructions}
                className="text-xs text-zinc-500 hover:text-zinc-700"
                data-testid="config-reset-instructions"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset to default
              </Button>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
              <p className="text-xs text-blue-700">
                These instructions are injected into every AnA 1.0 RI conversation within this
                project. They help AnA understand your regulatory context, product specifics, and
                preferred output style.
              </p>
            </div>
          </TabsContent>

          {/* ── Team Tab ─────────────────────────────────────────────── */}
          <TabsContent value="team" className="mt-4 space-y-4" data-testid="config-tab-team">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-zinc-100 p-3 mb-4">
                <Users className="h-6 w-6 text-zinc-400" />
              </div>
              <h3 className="text-sm font-medium text-zinc-900 mb-1">Team Management</h3>
              <p className="text-xs text-zinc-500 max-w-xs mb-4">
                Invite team members, assign roles, and manage permissions for this project.
              </p>
              <Badge variant="outline" className="text-xs border-amber-200 text-amber-700 bg-amber-50">
                <Lock className="h-3 w-3 mr-1" />
                Available in Enterprise tier
              </Badge>
            </div>

            {/* Structure ready for future team list */}
            <div className="space-y-2" aria-label="Team members list">
              {/* Future: map over project.team members here */}
            </div>
          </TabsContent>

          {/* ── Compliance Tab ───────────────────────────────────────── */}
          <TabsContent
            value="compliance"
            className="mt-4 space-y-5"
            data-testid="config-tab-compliance"
          >
            {/* 21 CFR Part 11 Status */}
            <div className="rounded-lg border border-zinc-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-zinc-900 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  21 CFR Part 11 Compliance
                </h3>
                <Badge
                  variant="outline"
                  className="text-xs border-emerald-200 text-emerald-700 bg-emerald-50"
                >
                  Enabled
                </Badge>
              </div>
              <p className="text-xs text-zinc-500">
                Electronic records and signatures comply with FDA 21 CFR Part 11 requirements.
                Audit trails, access controls, and data integrity measures are enforced.
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md bg-zinc-50 p-2.5">
                  <span className="text-zinc-500 block mb-0.5">Audit Trail</span>
                  <span className="font-medium text-zinc-800">
                    {project.auditTrail?.length ?? 0} entries
                  </span>
                </div>
                <div className="rounded-md bg-zinc-50 p-2.5">
                  <span className="text-zinc-500 block mb-0.5">E-Signatures</span>
                  <span className="font-medium text-zinc-800">
                    {project.signatures?.length ?? 0} recorded
                  </span>
                </div>
              </div>
            </div>

            {/* Audit Trail Info */}
            <div className="rounded-lg border border-zinc-200 p-4 space-y-2">
              <h3 className="text-sm font-medium text-zinc-900">Audit Trail</h3>
              <p className="text-xs text-zinc-500">
                All project changes are automatically tracked with user identity, timestamp, and
                action details. The audit trail is append-only and tamper-evident.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs">
                  Append-only
                </Badge>
                <Badge variant="outline" className="text-xs">
                  SHA-256 integrity
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Tamper-evident
                </Badge>
              </div>
            </div>

            {/* Regulatory Lead Assignment */}
            <div className="rounded-lg border border-zinc-200 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-zinc-900">Regulatory Lead</h3>
                <Badge
                  variant="outline"
                  className="text-xs border-amber-200 text-amber-700 bg-amber-50"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Not assigned
                </Badge>
              </div>
              <p className="text-xs text-zinc-500">
                Assign a regulatory lead responsible for submission oversight, review approvals,
                and compliance sign-off.
              </p>
              <Button variant="outline" size="sm" disabled className="text-xs mt-1">
                <Users className="h-3 w-3 mr-1.5" />
                Assign Regulatory Lead
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildGeneralDefaults(project: Project | null): GeneralFormValues {
  return {
    name: project?.name ?? '',
    submissionType: project?.submissionType ?? '510K',
    product: project?.product ?? '',
    sponsor: project?.sponsor ?? '',
    targetAgency: project?.targetAgency ?? project?.region ?? 'FDA',
    targetSubmissionDate: project?.targetSubmissionDate ?? '',
    status: project?.status ?? 'draft',
  };
}

function formatFieldLabel(fieldName: string): string {
  const labels: Record<string, string> = {
    name: 'Project name',
    submissionType: 'Submission type',
    product: 'Product name',
    sponsor: 'Sponsor',
    targetAgency: 'Target agency',
    targetSubmissionDate: 'Target date',
    status: 'Status',
    customInstructions: 'Custom instructions',
  };
  return labels[fieldName] ?? fieldName;
}

export default ProjectConfigPanel;
