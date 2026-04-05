import React, { useState, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataStateWrapper } from '@/components/ui/statesV2';
import { useToast } from '@/hooks/use-toast';
import {
  useProjectCollaborators,
  useProjectTeamMembers,
  type ProjectCollaborator,
  type ProjectCollaboratorPermission,
} from '@/concept2cure/hooks/useProjects';
import {
  useProjectModules,
  useLinkModule,
  useUnlinkModule,
  useUpdateModuleLink,
  type ModuleType,
  type ModuleLinkStatus,
} from '@/concept2cure/hooks/useEnterprise';
import { Settings, FileText, Users, ShieldCheck, Save, Link2, Unlink, Share2, Copy } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  formatModuleTypeLabel,
  buildProjectSharePath,
  hasExistingModuleLink,
  parseModuleInstanceId,
  parseNumericProjectId,
} from './projectConfigPanel.utils';
import { buildProjectModulePath } from '@/concept2cure/router/projectModuleRoutePolicy';

interface ProjectConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  project: {
    id: string;
    name: string;
    description?: string;
    submissionType?: string;
    sponsor?: string;
    product?: string;
    region?: string;
    targetAgency?: string;
    targetSubmissionDate?: string;
    status?: string;
    customInstructions?: string;
    teamMembers?: Array<{ userId: number; name: string; email?: string }>;
  } | null;
  onSave: (data: Record<string, any>) => Promise<void>;
}

const SUBMISSION_TYPES = [
  '510K',
  'IND',
  'NDA',
  'BLA',
  'PMA',
  'MAA',
  'DE_NOVO',
  'EUA',
  'IVDR',
] as const;

const AGENCIES = ['FDA', 'EMA', 'PMDA', 'Health Canada'] as const;

const STATUS_OPTIONS = [
  'planning',
  'active',
  'in_review',
  'submitted',
  'archived',
] as const;

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  active: 'Active',
  in_review: 'In Review',
  submitted: 'Submitted',
  archived: 'Archived',
};
const MODULE_TYPES: ModuleType[] = [
  'cer',
  'csr',
  'ectd',
  'vault',
  'protocol',
  'literature',
  'regulatory_intelligence',
  'analytics',
  'faers',
  'risk',
  'ind',
  '510k',
  'cmc',
  'pma',
];
const MODULE_STATUS_OPTIONS: ModuleLinkStatus[] = ['active', 'inactive', 'completed'];

const INSTRUCTIONS_MAX = 5000;

function ProjectConfigPanel({ isOpen, onClose, project, onSave }: ProjectConfigPanelProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state — General tab
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submissionType, setSubmissionType] = useState('');
  const [productName, setProductName] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [targetAgency, setTargetAgency] = useState('');
  const [targetSubmissionDate, setTargetSubmissionDate] = useState('');
  const [status, setStatus] = useState('');

  // Form state — Instructions tab
  const [customInstructions, setCustomInstructions] = useState('');
  const [newCollaboratorUserId, setNewCollaboratorUserId] = useState('');
  const [newCollaboratorPermission, setNewCollaboratorPermission] =
    useState<ProjectCollaboratorPermission>('can_use');
  const [localCollaborators, setLocalCollaborators] = useState<ProjectCollaborator[] | null>(null);
  const [newModuleType, setNewModuleType] = useState<ModuleType>('cer');
  const [newModuleInstanceId, setNewModuleInstanceId] = useState('');
  const [isCopyingShareLink, setIsCopyingShareLink] = useState(false);

  const {
    collaborators,
    isLoading: isLoadingCollaborators,
    error: collaboratorsError,
    updateCollaborators,
    isUpdating: isUpdatingCollaborators,
  } = useProjectCollaborators(project?.id ?? null);
  const {
    data: teamMembers = [],
    isLoading: isLoadingTeamMembers,
    error: teamMembersError,
  } = useProjectTeamMembers(project?.id ?? null);
  const numericProjectId = parseNumericProjectId(project?.id);
  const canManageModules = numericProjectId !== undefined;
  const {
    data: linkedModules = [],
    isLoading: isLoadingModules,
    error: modulesError,
  } = useProjectModules(canManageModules ? numericProjectId : undefined);
  const linkModuleMutation = useLinkModule();
  const updateModuleLinkMutation = useUpdateModuleLink();
  const unlinkModuleMutation = useUnlinkModule();

  const effectiveCollaborators = localCollaborators ?? collaborators;
  const assignedIds = useMemo(
    () => new Set(effectiveCollaborators.map(c => c.userId)),
    [effectiveCollaborators]
  );
  const projectTeamCandidates = useMemo(
    () => teamMembers.filter(member => !assignedIds.has(member.userId)),
    [teamMembers, assignedIds]
  );

  // Sync form state when project prop changes or panel opens
  useEffect(() => {
    if (isOpen && project) {
      setName(project.name || '');
      setDescription(project.description || '');
      setSubmissionType(project.submissionType || '');
      setProductName(project.product || '');
      setSponsor(project.sponsor || '');
      setTargetAgency(project.targetAgency || project.region || '');
      setTargetSubmissionDate(project.targetSubmissionDate || '');
      setStatus(project.status || '');
      setCustomInstructions(project.customInstructions || '');
      setLocalCollaborators(null);
      setNewCollaboratorUserId('');
      setNewCollaboratorPermission('can_use');
      setSaved(false);
    }
  }, [isOpen, project]);

  useEffect(() => {
    if (!isOpen) return;
    setLocalCollaborators(collaborators);
  }, [isOpen, collaborators]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        submissionType: submissionType || undefined,
        product: productName.trim() || undefined,
        sponsor: sponsor.trim() || undefined,
        targetAgency: targetAgency || undefined,
        region: targetAgency || undefined,
        targetSubmissionDate: targetSubmissionDate || undefined,
        status: status || undefined,
        customInstructions: customInstructions.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleResetInstructions = () => {
    setCustomInstructions('');
  };

  const handleAddCollaborator = () => {
    const userId = Number(newCollaboratorUserId);
    if (!Number.isInteger(userId) || userId <= 0) return;
    if (assignedIds.has(userId)) return;

    const userMeta = projectTeamCandidates.find((m: any) => Number(m.userId) === userId);
    setLocalCollaborators(prev => [
      ...(prev ?? collaborators),
      {
        userId,
        permission: newCollaboratorPermission,
        name: userMeta?.name ?? null,
        email: userMeta?.email ?? null,
      },
    ]);
    setNewCollaboratorUserId('');
    setNewCollaboratorPermission('can_use');
  };

  const handleRemoveCollaborator = (userId: number) => {
    setLocalCollaborators(prev => (prev ?? collaborators).filter(c => c.userId !== userId));
  };

  const handlePermissionChange = (userId: number, permission: ProjectCollaboratorPermission) => {
    setLocalCollaborators(prev =>
      (prev ?? collaborators).map(c => (c.userId === userId ? { ...c, permission } : c))
    );
  };

  const handleSaveTeam = async () => {
    try {
      await updateCollaborators(effectiveCollaborators);
      toast({
        title: 'Team permissions updated',
        description: 'Project collaborator access has been saved.',
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      toast({
        title: 'Failed to update team permissions',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleLinkModule = async () => {
    if (!canManageModules || numericProjectId === undefined) return;
    const projectId = numericProjectId;
    const moduleInstanceId = parseModuleInstanceId(newModuleInstanceId);
    if (!moduleInstanceId) {
      toast({
        title: 'Invalid module instance ID',
        description: 'Use a positive integer (e.g., 42).',
        variant: 'destructive',
      });
      return;
    }
    if (hasExistingModuleLink(linkedModules, newModuleType, moduleInstanceId)) {
      toast({
        title: 'Module already linked',
        description: `${newModuleType.toUpperCase()} #${moduleInstanceId} is already connected.`,
      });
      return;
    }
    try {
      await linkModuleMutation.mutateAsync({
        projectId,
        moduleType: newModuleType,
        moduleInstanceId,
      });
      setNewModuleInstanceId('');
      toast({
        title: 'Module linked',
        description: `${newModuleType.toUpperCase()} module ${moduleInstanceId} is now connected.`,
      });
    } catch (error) {
      toast({
        title: 'Failed to link module',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleModuleStatusChange = async (
    moduleType: ModuleType,
    moduleInstanceId: number,
    nextStatus: ModuleLinkStatus
  ) => {
    if (!canManageModules || numericProjectId === undefined) return;
    const projectId = numericProjectId;
    try {
      await updateModuleLinkMutation.mutateAsync({
        projectId,
        moduleType,
        moduleInstanceId,
        data: { status: nextStatus },
      });
    } catch (error) {
      toast({
        title: 'Failed to update module status',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleUnlinkModule = async (moduleType: ModuleType, moduleInstanceId: number) => {
    if (!canManageModules || numericProjectId === undefined) return;
    const projectId = numericProjectId;
    try {
      await unlinkModuleMutation.mutateAsync({
        projectId,
        moduleType,
        moduleInstanceId,
      });
    } catch (error) {
      toast({
        title: 'Failed to unlink module',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleOpenModule = (moduleType: ModuleType) => {
    if (!project?.id) return;
    const modulePath = buildProjectModulePath(project.id, moduleType);
    if (!modulePath) {
      toast({
        title: 'Module route not available',
        description: `${formatModuleTypeLabel(moduleType)} does not yet have a project route.`,
      });
      return;
    }
    setLocation(modulePath);
    onClose();
  };

  const handleCopyShareLink = async () => {
    if (!project?.id) return;
    const path = buildProjectSharePath(project.id);
    const absoluteUrl =
      typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

    setIsCopyingShareLink(true);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteUrl);
      }
      toast({
        title: 'Project link copied',
        description: 'Share link copied to clipboard.',
      });
    } catch (error) {
      toast({
        title: 'Unable to copy link',
        description: error instanceof Error ? error.message : 'Copy the URL manually from the browser.',
        variant: 'destructive',
      });
    } finally {
      setIsCopyingShareLink(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-[420px] sm:max-w-[420px] p-0 flex flex-col bg-[#FAFAF8] border-l border-[#E8E6DC]"
      >
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle className="text-lg font-semibold text-[#4D4B45] flex items-center gap-2">
            <Settings className="h-5 w-5 text-[#4D4B45]/60" />
            Project Configuration
          </SheetTitle>
          <SheetDescription className="text-sm text-[#4D4B45]/60">
            {project?.name || 'Configure project settings'}
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="mx-6 bg-transparent border-b border-[#E8E6DC] rounded-none h-auto p-0 gap-0">
            <TabsTrigger
              value="general"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4D4B45] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2.5 text-sm text-[#4D4B45]/60 data-[state=active]:text-[#4D4B45] font-medium"
            >
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              General
            </TabsTrigger>
            <TabsTrigger
              value="instructions"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4D4B45] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2.5 text-sm text-[#4D4B45]/60 data-[state=active]:text-[#4D4B45] font-medium"
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Instructions
            </TabsTrigger>
            <TabsTrigger
              value="team"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4D4B45] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2.5 text-sm text-[#4D4B45]/60 data-[state=active]:text-[#4D4B45] font-medium"
            >
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Team
            </TabsTrigger>
            <TabsTrigger
              value="sharing"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4D4B45] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2.5 text-sm text-[#4D4B45]/60 data-[state=active]:text-[#4D4B45] font-medium"
            >
              <Share2 className="h-3.5 w-3.5 mr-1.5" />
              Sharing
            </TabsTrigger>
            <TabsTrigger
              value="modules"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4D4B45] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2.5 text-sm text-[#4D4B45]/60 data-[state=active]:text-[#4D4B45] font-medium"
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Modules
            </TabsTrigger>
            <TabsTrigger
              value="compliance"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4D4B45] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2.5 text-sm text-[#4D4B45]/60 data-[state=active]:text-[#4D4B45] font-medium"
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
              Compliance
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            {/* ── General Tab ── */}
            <TabsContent value="general" className="px-6 py-5 space-y-5 m-0">
              {/* Project Name */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., CardioFlow Heart Monitor"
                  className="border-[#E8E6DC] bg-white text-[#4D4B45] placeholder:text-[#4D4B45]/40 focus-visible:ring-[#4D4B45]/20 focus-visible:border-[#4D4B45]/40"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Description <span className="text-[#4D4B45]/40 font-normal">(optional)</span>
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the project..."
                  rows={2}
                  className="border-[#E8E6DC] bg-white text-[#4D4B45] placeholder:text-[#4D4B45]/40 focus-visible:ring-[#4D4B45]/20 focus-visible:border-[#4D4B45]/40 resize-none"
                />
              </div>

              {/* Submission Type */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Submission Type
                </label>
                <Select value={submissionType} onValueChange={setSubmissionType}>
                  <SelectTrigger className="border-[#E8E6DC] bg-white text-[#4D4B45] focus:ring-[#4D4B45]/20">
                    <SelectValue placeholder="Select submission type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBMISSION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product / Device Name */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Product / Device / Molecule{' '}
                  <span className="text-[#4D4B45]/40 font-normal">(optional)</span>
                </label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g., CardioFlow™, Atorvastatin 20 mg"
                  className="border-[#E8E6DC] bg-white text-[#4D4B45] placeholder:text-[#4D4B45]/40 focus-visible:ring-[#4D4B45]/20 focus-visible:border-[#4D4B45]/40"
                />
              </div>

              {/* Sponsor */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Sponsor / Client{' '}
                  <span className="text-[#4D4B45]/40 font-normal">(optional)</span>
                </label>
                <Input
                  value={sponsor}
                  onChange={(e) => setSponsor(e.target.value)}
                  placeholder="e.g., Acme Biotech, Inc."
                  className="border-[#E8E6DC] bg-white text-[#4D4B45] placeholder:text-[#4D4B45]/40 focus-visible:ring-[#4D4B45]/20 focus-visible:border-[#4D4B45]/40"
                />
              </div>

              {/* Target Agency */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Target Agency
                </label>
                <div className="flex gap-2 flex-wrap">
                  {AGENCIES.map((agency) => (
                    <button
                      key={agency}
                      type="button"
                      onClick={() => setTargetAgency(agency)}
                      className={`px-3.5 py-1.5 text-sm font-medium rounded-lg border transition-all duration-150 ${
                        targetAgency === agency
                          ? 'bg-[#4D4B45] text-white border-[#4D4B45]'
                          : 'bg-white text-[#4D4B45] border-[#E8E6DC] hover:border-[#4D4B45]/30'
                      }`}
                    >
                      {agency}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Submission Date */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Target Submission Date
                </label>
                <Input
                  type="date"
                  value={targetSubmissionDate}
                  onChange={(e) => setTargetSubmissionDate(e.target.value)}
                  className="border-[#E8E6DC] bg-white text-[#4D4B45] focus-visible:ring-[#4D4B45]/20 focus-visible:border-[#4D4B45]/40"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-[#4D4B45] mb-1.5">
                  Status
                </label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="border-[#E8E6DC] bg-white text-[#4D4B45] focus:ring-[#4D4B45]/20">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s] || s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* ── Instructions Tab ── */}
            <TabsContent value="instructions" className="px-6 py-5 space-y-4 m-0">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-[#4D4B45]">
                    Custom Instructions
                  </label>
                  {customInstructions.trim().length > 0 && (
                    <Badge
                      variant="secondary"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-medium"
                    >
                      Active — injected into every conversation
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-[#4D4B45]/50 mb-3">
                  Provide context or rules that AnA should follow for this project.
                  These instructions are included in every conversation within this project.
                </p>
                <Textarea
                  value={customInstructions}
                  onChange={(e) => {
                    if (e.target.value.length <= INSTRUCTIONS_MAX) {
                      setCustomInstructions(e.target.value);
                    }
                  }}
                  placeholder="e.g., Always reference ICH E6(R2) guidelines. Focus on Class III device requirements. Use formal language in all outputs."
                  rows={10}
                  className="border-[#E8E6DC] bg-white text-[#4D4B45] placeholder:text-[#4D4B45]/40 focus-visible:ring-[#4D4B45]/20 focus-visible:border-[#4D4B45]/40 resize-none text-sm leading-relaxed"
                />
                <div className="flex items-center justify-between mt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetInstructions}
                    className="text-xs text-[#4D4B45]/50 hover:text-[#4D4B45] h-auto py-1 px-2"
                    disabled={!customInstructions.trim()}
                  >
                    Reset to default
                  </Button>
                  <span className="text-xs text-[#4D4B45]/40">
                    {customInstructions.length.toLocaleString()} / {INSTRUCTIONS_MAX.toLocaleString()} characters
                  </span>
                </div>
              </div>
            </TabsContent>

            {/* ── Team Tab ── */}
            <TabsContent value="team" className="px-6 py-5 m-0">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-[#4D4B45] mb-1.5">Project collaborators</h3>
                  <p className="text-xs text-[#4D4B45]/50">
                    Assign project-specific access controls. <strong>Can use</strong> grants project
                    access in AnA; <strong>Can edit</strong> grants full editing rights.
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-[#E8E6DC] bg-white space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    <Select value={newCollaboratorUserId} onValueChange={setNewCollaboratorUserId}>
                      <SelectTrigger className="border-[#E8E6DC] bg-white text-[#4D4B45]">
                        <SelectValue placeholder="Select organization user" />
                      </SelectTrigger>
                      <SelectContent>
                        {projectTeamCandidates.map((member: any) => (
                          <SelectItem key={String(member.userId)} value={String(member.userId)}>
                            {member.name} {member.email ? `(${member.email})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {teamMembersError && (
                      <p className="text-xs text-red-600">
                        Failed to load team members: {teamMembersError.message}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Select
                        value={newCollaboratorPermission}
                        onValueChange={value =>
                          setNewCollaboratorPermission(value as ProjectCollaboratorPermission)
                        }
                      >
                        <SelectTrigger className="border-[#E8E6DC] bg-white text-[#4D4B45]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="can_use">Can use</SelectItem>
                          <SelectItem value="can_edit">Can edit</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddCollaborator}
                        disabled={!newCollaboratorUserId || isLoadingTeamMembers}
                        className="bg-[#4D4B45] text-white hover:bg-[#3A3935] disabled:opacity-40"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </div>

                <DataStateWrapper<ProjectCollaborator[]>
                  isLoading={isLoadingCollaborators}
                  error={collaboratorsError as Error | null}
                  data={effectiveCollaborators}
                  emptyTitle="No collaborators yet"
                  emptyDescription="Add users to share this project with your organization."
                  testId="project-config-team"
                >
                  {items => (
                    <div className="space-y-2">
                      {items.map(member => (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[#E8E6DC] bg-white px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#4D4B45] truncate">
                              {member.name || `User ${member.userId}`}
                            </p>
                            <p className="text-xs text-[#4D4B45]/55 truncate">
                              {member.email || `ID: ${member.userId}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={member.permission}
                              onValueChange={value =>
                                handlePermissionChange(
                                  member.userId,
                                  value as ProjectCollaboratorPermission
                                )
                              }
                            >
                              <SelectTrigger className="h-8 w-[120px] border-[#E8E6DC]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="can_use">Can use</SelectItem>
                                <SelectItem value="can_edit">Can edit</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-[#4D4B45]/60 hover:text-red-600"
                              onClick={() => handleRemoveCollaborator(member.userId)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </DataStateWrapper>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveTeam}
                    disabled={isUpdatingCollaborators}
                    className="bg-[#4D4B45] text-white hover:bg-[#3A3935] disabled:opacity-40"
                  >
                    {isUpdatingCollaborators ? 'Saving team...' : 'Save team permissions'}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ── Sharing Tab ── */}
            <TabsContent value="sharing" className="px-6 py-5 m-0">
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-[#4D4B45]">Project sharing controls</h3>
                <p className="text-xs text-[#4D4B45]/55">
                  Sharing is organization-scoped and fail-closed by default. Grant explicit access
                  and distribute a project URL for approved collaborators.
                </p>
                <div className="rounded-lg border border-[#E8E6DC] bg-white p-3">
                  <p className="text-xs text-[#4D4B45]/70">
                    Current collaborators: <strong>{effectiveCollaborators.length}</strong>
                  </p>
                  <p className="text-xs text-[#4D4B45]/50 mt-1">
                    Required: explicit user assignment with <em>Can use</em> or <em>Can edit</em>.
                  </p>
                  <p className="text-xs text-[#4D4B45]/50 mt-2">
                    Share path: <code className="text-[11px]">{project?.id ? buildProjectSharePath(project.id) : 'N/A'}</code>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#E8E6DC] text-[#4D4B45]"
                    onClick={handleCopyShareLink}
                    disabled={!project?.id || isCopyingShareLink}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    {isCopyingShareLink ? 'Copying…' : 'Copy share link'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#E8E6DC] text-[#4D4B45]"
                    onClick={() => setActiveTab('team')}
                  >
                    Manage collaborators
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ── Modules Tab ── */}
            <TabsContent value="modules" className="px-6 py-5 m-0 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-[#4D4B45] mb-1.5">Module linking</h3>
                <p className="text-xs text-[#4D4B45]/55">
                  Connect operational modules to this project to stabilize navigation paths and
                  preserve context.
                </p>
              </div>
              {!canManageModules && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Module links require a numeric project ID.
                </div>
              )}
              <div className="rounded-lg border border-[#E8E6DC] bg-white p-3 space-y-2">
                <div className="grid grid-cols-1 gap-2">
                  <Select value={newModuleType} onValueChange={v => setNewModuleType(v as ModuleType)}>
                    <SelectTrigger className="border-[#E8E6DC] bg-white text-[#4D4B45]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODULE_TYPES.map(moduleType => (
                        <SelectItem key={moduleType} value={moduleType}>
                          {formatModuleTypeLabel(moduleType)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={newModuleInstanceId}
                    onChange={e => setNewModuleInstanceId(e.target.value)}
                    placeholder="Module instance ID (e.g., 42)"
                    className="border-[#E8E6DC] bg-white text-[#4D4B45]"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleLinkModule}
                  disabled={!canManageModules || linkModuleMutation.isPending}
                  className="bg-[#4D4B45] text-white hover:bg-[#3A3935] disabled:opacity-40"
                >
                  {linkModuleMutation.isPending ? 'Linking…' : 'Link module'}
                </Button>
              </div>
              <DataStateWrapper
                isLoading={isLoadingModules}
                error={modulesError as Error | null}
                data={linkedModules}
                emptyTitle="No module links"
                emptyDescription="Link CER, eCTD, Vault, and other modules to this project."
                testId="project-config-modules"
              >
                {items => (
                  <div className="space-y-2">
                    {items.map(item => (
                      <div
                        key={`${item.moduleType}-${item.moduleInstanceId}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[#E8E6DC] bg-white px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-[#4D4B45]">
                            {formatModuleTypeLabel(item.moduleType)} #{item.moduleInstanceId}
                          </p>
                          <p className="text-xs text-[#4D4B45]/50">
                            Linked {new Date(item.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={item.status}
                            onValueChange={value =>
                              handleModuleStatusChange(
                                item.moduleType,
                                item.moduleInstanceId,
                                value as ModuleLinkStatus
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-[120px] border-[#E8E6DC]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MODULE_STATUS_OPTIONS.map(statusOption => (
                                <SelectItem key={statusOption} value={statusOption}>
                                  {statusOption}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-[#4D4B45]/60 hover:text-[#4D4B45]"
                            onClick={() => handleOpenModule(item.moduleType)}
                          >
                            Open
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-[#4D4B45]/60 hover:text-red-600"
                            onClick={() => handleUnlinkModule(item.moduleType, item.moduleInstanceId)}
                            disabled={unlinkModuleMutation.isPending}
                          >
                            <Unlink className="h-3.5 w-3.5 mr-1" />
                            Unlink
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DataStateWrapper>
            </TabsContent>

            {/* ── Compliance Tab (placeholder) ── */}
            <TabsContent value="compliance" className="px-6 py-5 m-0">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-[#E8E6DC]/50 flex items-center justify-center mb-4">
                  <ShieldCheck className="h-6 w-6 text-[#4D4B45]/40" />
                </div>
                <h3 className="text-sm font-medium text-[#4D4B45] mb-1.5">
                  21 CFR Part 11 Compliance Tracking
                </h3>
                <p className="text-sm text-[#4D4B45]/50 max-w-[260px]">
                  Audit trail summary, electronic signature tracking, and compliance
                  verification controls for this project.
                </p>
              </div>
            </TabsContent>
          </div>

          {/* ── Footer with Save ── */}
          <div className="px-6 py-4 border-t border-[#E8E6DC] bg-white flex items-center justify-between">
            <div className="text-xs text-[#4D4B45]/40">
              {saved && (
                <span className="text-emerald-600 font-medium">Changes saved</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-[#4D4B45]/60 hover:text-[#4D4B45]"
              >
                Close
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={!name.trim() || saving}
                className="bg-[#4D4B45] text-white hover:bg-[#3A3935] disabled:opacity-40"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export default ProjectConfigPanel;
