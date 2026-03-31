/**
 * ProjectWorkspaceShell — Regulated document workspace.
 *
 * Layout: far-left nav rail (ZenSidebar) → [this shell]
 *   left: File/Dossier/Template/Outline tree (220px) with mode toggle
 *   center: DocumentListPane (browse) or EditorPanel (edit) with doc header
 *   right: Inspector panel (provenance/compare/audit) — only when doc open
 *
 * Phase 3 additions:
 *   - Persistent active-document context band across all modes
 *   - Template structure view (Outline | Structure segmented subview)
 *   - Create missing subsection from template structure
 *   - Enhanced cut/paste: locked blocking, approved warning, destination preview
 *   - Expanded section requirements panel
 *   - DnD feature flag groundwork (ENABLE_GOVERNED_DND)
 *   - Scale discipline for 1366x768
 */

import React, { useState, useCallback, useEffect, useMemo, lazy, Suspense, useRef } from 'react';
// @ts-expect-error -- error-boundary is a .jsx file without type declarations
import ErrorBoundary from '@/components/ui/error-boundary';

import { ProjectFileTree, type TreeArtifact } from './ProjectFileTree';
import { DocumentListPane } from './DocumentListPane';
import { DossierTree } from './DossierTree';
import { useSubmissionSections, type SectionNode } from '../../hooks/useSubmissionSections';
import type { DossierNode } from '../../models/ctdHierarchy';
import { TemplateTree } from './TemplateTree';
import { DocumentOutlineTree } from './DocumentOutlineTree';
import {
  PlacementDialog,
  type PlacementConfirmation,
  type PlacementOperation,
} from './PlacementDialog';
import { GovernedDocumentPanel } from './GovernedDocumentPanel';
import {
  getSectionLabel,
  getSectionRequirements,
  type SectionRequirement,
} from '../../models/ctdHierarchy';
import { ProjectDashboard } from './ProjectDashboard';
import { OperatingSystemRegistryPanel, type RegistryKind } from './OperatingSystemRegistryPanel';
import { DocumentStudioSurface } from './DocumentStudioSurface';
import { RegulatoryTransformCanvas } from './RegulatoryTransformCanvas';
import { GoldenDossierVerificationPanel } from './GoldenDossierVerificationPanel';
import { ProgramTwinPanel } from './ProgramTwinPanel';
import { SubmissionAppsPanel } from './SubmissionAppsPanel';
import { ReviewPulseDashboard } from './ReviewPulseDashboard';
import { NotificationCenter } from './NotificationCenter';
import { ComputeJobPanel } from '../compute/ComputeJobPanel';
import { IndEvidenceAskPanel } from './IndEvidenceAskPanel';
import RegulatoryCommunicationsHub from '../correspondence/RegulatoryCommunicationsHub';
import {
  ChevronLeft,
  Loader2,
  FileText,
  Plus,
  FolderOpen,
  Brain,
  Files,
  BookOpen,
  Layers,
  List,
  Scissors,
  X,
  MapPin,
  Copy,
  Info,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Target,
  AppWindow,
  Activity,
  GitBranch,
  Eye,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { SkeletonText, LoadingState } from '@/components/ui/statesV2';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DocumentModeProvider,
  resolveDocumentMode,
  MODE_CAPABILITIES,
  type WorkflowStage,
} from '../../contexts/DocumentModeContext';
import { buildDocumentConsequenceRows, type ConsequenceComputeJob } from './documentConsequence';

// Feature flag for governed drag-and-drop (Phase 3C groundwork)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ENABLE_GOVERNED_DND = false;

// Lazy-load the existing EditorPanel
const EditorPanel = lazy(() => import('../editor/EditorPanel').then(m => ({ default: m.default })));

import { NewDocumentDialog } from './NewDocumentDialog';
import { canEscalateToEdit } from '../../contexts/DocumentModeContext';

// ── Left-rail mode type ──────────────────────────────────────────────────────
type LeftRailMode = 'files' | 'dossier' | 'templates' | 'outline' | 'registry';
type OperatingLayer = 'document_studio' | 'vault' | 'reports' | 'documents';
type WorkspaceWorkbench = 'cmc' | 'biostats' | 'device' | 'clinical';
type ProjectNav =
  | 'submission_builder'
  | 'communications'
  | 'cmc'
  | 'clinical_module5'
  | 'verify'
  | 'review'
  | 'publish'
  | 'haq'
  | 'vault'
  | 'overview'
  | 'reports'
  | 'activity'
  | 'documents';
type DocumentTab =
  | 'content'
  | 'evidence'
  | 'versions'
  | 'review'
  | 'signatures'
  | 'provenance'
  | 'export';

// ── Dossier metrics types ────────────────────────────────────────────────────
interface SectionMetrics {
  artifactCount: number;
  draftCount: number;
  reviewCount: number;
  approvedCount: number;
  lockedCount: number;
  completionPercent: number;
  templateCoverageAvailable: boolean;
  evidenceCount: number;
  precedentCount: number;
}

interface OperatingLayerConfig {
  id: OperatingLayer;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface WorkbenchConfig {
  id: WorkspaceWorkbench;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultFolder: string;
}

// ── Cut/paste move state ─────────────────────────────────────────────────────
interface PendingMove {
  artifact: TreeArtifact;
  fromSection: string | null;
  targetSection?: string;
}

// ── Folder label map ─────────────────────────────────────────────────────────
const FOLDER_LABELS: Record<string, string> = {
  drafts: 'Drafts',
  generated: 'Generated',
  dossier: 'Dossier',
  evidence: 'Evidence Packs',
  cmc: 'CMC',
  ind: 'IND',
  ectd: 'eCTD',
  clinical: 'Clinical / CSR Evidence',
  audit: 'Audit / Provenance',
  final: 'Submitted / Final',
};

const OPERATING_LAYERS: OperatingLayerConfig[] = [
  {
    id: 'document_studio',
    label: 'Document Studio',
    description: 'Core authoring + governed workflow',
    icon: FileText,
  },
  {
    id: 'vault',
    label: 'Evidence',
    description: 'Evidence and document operations',
    icon: Files,
  },
  {
    id: 'reports',
    label: 'Readiness',
    description: 'Readiness, review, and executive reporting',
    icon: Activity,
  },
];

const WORKBENCHES: WorkbenchConfig[] = [
  {
    id: 'cmc',
    label: 'CMC',
    description: 'Module 3 authoring',
    icon: Layers,
    defaultFolder: 'cmc',
  },
  {
    id: 'biostats',
    label: 'Biostats',
    description: 'Statistical narratives',
    icon: Brain,
    defaultFolder: 'clinical',
  },
  {
    id: 'device',
    label: 'Device',
    description: 'Device evidence and equivalence',
    icon: Target,
    defaultFolder: 'evidence',
  },
  {
    id: 'clinical',
    label: 'Clinical',
    description: 'Clinical studies and summaries',
    icon: BookOpen,
    defaultFolder: 'clinical',
  },
];

const PROJECT_NAV_ITEMS: Array<{ id: ProjectNav; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'submission_builder', label: 'Documents' },
  { id: 'communications', label: 'Communications' },
  { id: 'verify', label: 'Verify' },
  { id: 'review', label: 'Review' },
  { id: 'publish', label: 'Publish' },
];

const DOCUMENT_TAB_ITEMS: Array<{ id: DocumentTab; label: string }> = [
  { id: 'content', label: 'Content' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'versions', label: 'Versions' },
  { id: 'review', label: 'Review' },
  { id: 'signatures', label: 'Signatures' },
  { id: 'provenance', label: 'Provenance' },
  { id: 'export', label: 'Export' },
];

// ── Template content builder ─────────────────────────────────────────────────

const CTD_TEMPLATE_CONTENT: Record<string, string> = {
  // Module 1 — Administrative
  '1.1': `<h2>Cover Letter</h2>
<p>Dear [Agency Contact],</p>
<p>We hereby submit this [application type] for [product name] ([generic name]), [dosage form], [strength], for the proposed indication of [indication].</p>
<h3>Submission Contents</h3>
<p>This submission contains the following modules:</p>
<ul><li>Module 1: Administrative Information and Prescribing Information</li><li>Module 2: Common Technical Document Summaries</li><li>Module 3: Quality (CMC)</li><li>Module 4: Nonclinical Study Reports</li><li>Module 5: Clinical Study Reports</li></ul>
<h3>Contact Information</h3>
<p>For questions regarding this submission, please contact:</p>
<p>[Name], [Title]<br/>[Organization]<br/>[Address]<br/>[Phone] | [Email]</p>`,

  // Module 2 — Summaries
  '2.2': `<h2>Introduction to Summary</h2>
<h3>Product Overview</h3>
<p>[Product name] ([generic name]) is a [mechanism of action] indicated for [proposed indication]. The drug substance is [chemical description] with a molecular weight of [MW].</p>
<h3>Regulatory History</h3>
<p>This application represents [first submission / supplement / amendment] for [product name].</p>
<h3>Development Rationale</h3>
<p>The development program for [product name] was designed to [rationale]. The nonclinical and clinical programs provide [describe evidence base].</p>`,

  '2.3': `<h2>Quality Overall Summary</h2>
<h3>2.3.S Drug Substance</h3>
<h4>General Information</h4>
<p>[Drug substance name] is manufactured by [manufacturer] at [site]. The drug substance is [physical description].</p>
<h4>Manufacture</h4>
<p>The manufacturing process for [drug substance] consists of [number] synthetic steps. Process validation data demonstrate consistent production of drug substance meeting all specifications.</p>
<h4>Characterization</h4>
<p>The structure of [drug substance] has been confirmed by [analytical methods: NMR, MS, IR, X-ray crystallography].</p>
<h3>2.3.P Drug Product</h3>
<h4>Description and Composition</h4>
<p>[Product name] is formulated as [dosage form] containing [strength] of [drug substance]. Excipients include [list excipients with function].</p>
<h4>Pharmaceutical Development</h4>
<p>The formulation was developed to [objectives]. Key development studies include [dissolution, stability, bioequivalence].</p>`,

  '2.5': `<h2>Clinical Overview</h2>
<h3>Product Development Rationale</h3>
<p>[Product name] was developed for the treatment of [indication]. The clinical development program included [number] studies enrolling approximately [N] subjects.</p>
<h3>Overview of Clinical Pharmacology</h3>
<p>The pharmacokinetic profile of [product name] is characterized by [PK summary]. Drug-drug interaction studies demonstrated [DDI findings].</p>
<h3>Overview of Efficacy</h3>
<p>Efficacy was evaluated in [number] pivotal studies. The primary endpoint of [endpoint] was met with statistical significance (p [value]). [Product name] demonstrated [efficacy summary].</p>
<h3>Overview of Safety</h3>
<p>The safety database includes [N] subjects exposed to [product name]. The most common adverse events were [AE list]. Serious adverse events occurred in [%] of subjects.</p>
<h3>Benefit-Risk Assessment</h3>
<p>[Product name] provides [benefit summary] with a safety profile that [safety characterization]. The benefit-risk balance supports [conclusion].</p>`,

  '2.7': `<h2>Clinical Summary</h2>
<h3>2.7.1 Summary of Biopharmaceutic Studies and Associated Analytical Methods</h3>
<p>[Describe bioanalytical methods, bioavailability, bioequivalence studies]</p>
<h3>2.7.2 Summary of Clinical Pharmacology Studies</h3>
<p>[PK studies, PD studies, exposure-response, special populations, drug interactions]</p>
<h3>2.7.3 Summary of Clinical Efficacy</h3>
<p>[Study design overview, demographics, efficacy results, subgroup analyses]</p>
<h3>2.7.4 Summary of Clinical Safety</h3>
<p>[Exposure, adverse events, deaths, laboratory findings, vital signs, safety in special populations]</p>`,

  // Module 3 — Quality
  '3.2.S': `<h2>Drug Substance</h2>
<h3>3.2.S.1 General Information</h3>
<h4>Nomenclature</h4>
<p>INN: [name]<br/>Chemical name: [IUPAC name]<br/>CAS number: [number]</p>
<h4>Structure</h4>
<p>Molecular formula: [formula]<br/>Molecular weight: [weight]<br/>[Structure description]</p>
<h3>3.2.S.2 Manufacture</h3>
<p>[Manufacturer name and address. Description of manufacturing process with flow diagram reference.]</p>
<h3>3.2.S.3 Characterisation</h3>
<p>[Elucidation of structure, impurity profile]</p>
<h3>3.2.S.4 Control of Drug Substance</h3>
<p>[Specifications, analytical procedures, validation, batch analyses, justification of specifications]</p>
<h3>3.2.S.5 Reference Standards</h3>
<p>[Primary and secondary reference standards used]</p>
<h3>3.2.S.6 Container Closure System</h3>
<p>[Description of container closure system for drug substance storage]</p>
<h3>3.2.S.7 Stability</h3>
<p>[Stability summary, storage conditions, shelf life proposal]</p>`,

  '3.2.P': `<h2>Drug Product</h2>
<h3>3.2.P.1 Description and Composition</h3>
<p>[Dosage form description, composition table with quantities per unit dose]</p>
<h3>3.2.P.2 Pharmaceutical Development</h3>
<p>[Formulation development rationale, excipient compatibility, manufacturing process development, container closure selection]</p>
<h3>3.2.P.3 Manufacture</h3>
<p>[Manufacturer information, batch formula, process description, process validation]</p>
<h3>3.2.P.4 Control of Excipients</h3>
<p>[Excipient specifications and testing]</p>
<h3>3.2.P.5 Control of Drug Product</h3>
<p>[Release and shelf-life specifications, analytical procedures, validation, batch analyses]</p>
<h3>3.2.P.6 Reference Standards</h3>
<p>[Reference standards used for drug product testing]</p>
<h3>3.2.P.7 Container Closure System</h3>
<p>[Primary packaging description, extractables/leachables if applicable]</p>
<h3>3.2.P.8 Stability</h3>
<p>[Stability data summary, proposed shelf life and storage conditions]</p>`,

  // Module 5 — Clinical
  '5.3': `<h2>Clinical Study Reports</h2>
<h3>5.3.1 Reports of Biopharmaceutic Studies</h3>
<p>[List bioavailability, bioequivalence, in-vitro dissolution, and PK study reports]</p>
<h3>5.3.2 Reports of Studies Pertinent to Pharmacokinetics Using Human Biomaterials</h3>
<p>[Plasma protein binding, hepatic metabolism, drug interaction studies using human biomaterials]</p>
<h3>5.3.3 Reports of Human PK Studies</h3>
<p>[Healthy subject PK, patient PK, intrinsic/extrinsic factor studies, population PK]</p>
<h3>5.3.4 Reports of Human PD Studies</h3>
<p>[PD studies and PK/PD relationship studies]</p>
<h3>5.3.5 Reports of Efficacy and Safety Studies</h3>
<p>[Controlled clinical studies, uncontrolled clinical studies, analyses of data across studies]</p>`,
};

function buildTemplateContent(title: string, ctdSection: string, _templateKey: string): string {
  // Try exact match first, then prefix match (e.g., "2.5" matches "2.5.x")
  const sectionContent = CTD_TEMPLATE_CONTENT[ctdSection]
    || CTD_TEMPLATE_CONTENT[ctdSection.split('.').slice(0, 2).join('.')]
    || CTD_TEMPLATE_CONTENT[ctdSection.charAt(0) === '3' ? '3.2.P' : ''];

  if (sectionContent) {
    return `<h1>${title}</h1>\n${sectionContent}`;
  }

  // Fallback: structured starter for unknown sections
  return `<h1>${title}</h1>
<h2>Purpose</h2>
<p>[Describe the purpose of this section and its role in the submission.]</p>
<h2>Scope</h2>
<p>[Define the scope of data and analyses presented in this section.]</p>
<h2>Summary</h2>
<p>[Provide a concise summary of key findings and conclusions.]</p>
<h2>Detailed Content</h2>
<p>[Begin drafting section content here. Use AnA to help generate regulatory-compliant language.]</p>`;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectWorkspaceShellProps {
  projectId?: string;
  projectName?: string;
  projectType?: string;
  submissionType?: string;
  industryMode?: string;
  onBackToProjects: () => void;
  onSelectProject: () => void;
  /** Switch to AnA intelligence view */
  onSwitchToIntelligence?: () => void;
  /** Pending content from IND/eCTD handoff */
  initialContent?: string;
  initialTitle?: string;
  initialCtdSection?: string;
  onInitialContentConsumed?: () => void;
  /** Open a specific existing artifact directly (no creation) */
  openArtifactId?: string;
  onOpenArtifactConsumed?: () => void;
  /** Callback when the active document changes — used for chat/authoring context awareness */
  onActiveDocumentChange?: (
    doc: {
      id?: string;
      title: string;
      ctdSection?: string;
      excerpt: string;
      version?: number;
      status?: string;
    } | null
  ) => void;
  /** Navigate to a different layout mode (e.g., submission-builder, template-library) */
  onNavigate?: (mode: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export const ProjectWorkspaceShell: React.FC<ProjectWorkspaceShellProps> = ({
  projectId,
  projectName,
  projectType,
  submissionType,
  industryMode,
  onBackToProjects,
  onSelectProject,
  onSwitchToIntelligence,
  initialContent,
  initialTitle,
  initialCtdSection,
  onInitialContentConsumed,
  openArtifactId,
  onOpenArtifactConsumed,
  onActiveDocumentChange,
  onNavigate,
}) => {
  // ── Local state ──────────────────────────────────────────────────────────
  const [artifacts, setArtifacts] = useState<TreeArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>('drafts');
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
  const [mode, setMode] = useState<'dashboard' | 'browse' | 'edit'>('dashboard');
  const [showContextBars, setShowContextBars] = useState(false);
  const [projectNav, setProjectNav] = useState<ProjectNav>('submission_builder');
  const [documentTab, setDocumentTab] = useState<DocumentTab>('content');
  const [leftRailMode, setLeftRailMode] = useState<LeftRailMode>('files');
  const [activeLayer, setActiveLayer] = useState<OperatingLayer>('document_studio');
  const [activeWorkbench, setActiveWorkbench] = useState<WorkspaceWorkbench>('clinical');
  const [activeRegistry, setActiveRegistry] = useState<RegistryKind>('documents');

  // Submission-type-aware section tree for dossier mode
  const { sections: submissionSections, readinessPercent } = useSubmissionSections(projectId, submissionType || projectType);
  const normalizedSubmissionType = String(submissionType || projectType || '').toUpperCase();
  const isINDWorkspace = ['IND', 'NDA', 'BLA', 'MAA'].includes(normalizedSubmissionType);
  const nextRecommendedSection = useMemo(() => {
    const flatten = (nodes: SectionNode[]): SectionNode[] =>
      nodes.flatMap(n => [n, ...(n.children ? flatten(n.children) : [])]);
    return flatten(submissionSections).find(
      section =>
        section.depth > 0 &&
        section.required &&
        (section.status === 'empty' || section.status === 'drafting')
    );
  }, [submissionSections]);

  // Convert SectionNode[] to DossierNode[] for DossierTree when submission-specific sections are available
  const submissionDossierHierarchy = useMemo<DossierNode[] | undefined>(() => {
    if (!submissionSections || submissionSections.length === 0) return undefined;
    function convertToDossierNode(node: SectionNode): DossierNode {
      return {
        nodeId: `${node.module.toLowerCase()}-${node.code}`,
        parentNodeId: null,
        label: node.title,
        ctdSection: node.code,
        nodeType: node.depth === 0 ? 'module' : node.depth === 1 ? 'section' : 'subsection',
        children: node.children ? node.children.map(convertToDossierNode) : [],
      };
    }
    return submissionSections.map(convertToDossierNode);
  }, [submissionSections]);
  // operatingLayer maps 'document_studio' -> 'documents' for OperatingSystemRegistryPanel compatibility
  const operatingLayer = activeLayer === 'document_studio' ? 'documents' : activeLayer;
  const setOperatingLayer = (layer: string) => {
    if (layer === 'documents') setActiveLayer('document_studio');
    else if (layer === 'vault') setActiveLayer('vault');
    else if (layer === 'reports') setActiveLayer('reports');
  };
  const [selectedCtdSection, setSelectedCtdSection] = useState<string | undefined>();

  // New document creation
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  // Feedback message when cut/move is blocked by capability
  const [cutBlockedMessage, setCutBlockedMessage] = useState<string | null>(null);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);

  // Inspector panel to auto-open in EditorPanel (set via GovernedDocumentPanel)
  const [editorInitialInspector, setEditorInitialInspector] = useState<
    'compare' | 'provenance' | 'audit' | null
  >(null);

  // Placement dialog state
  const [placementDialog, setPlacementDialog] = useState<{
    open: boolean;
    artifact: TreeArtifact | null;
    operation: PlacementOperation;
    targetSection?: string;
  }>({ open: false, artifact: null, operation: 'place' });
  const [placementLoading, setPlacementLoading] = useState(false);

  // Cut/paste move state
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  // Dossier metrics
  const [dossierMetrics, setDossierMetrics] = useState<Record<string, SectionMetrics>>({});

  // Active document content for outline
  const [activeDocContent, setActiveDocContent] = useState<string>('');
  const [activeDocTitle, setActiveDocTitle] = useState<string>('');

  // Section requirements panel
  const [sectionReqs, setSectionReqs] = useState<SectionRequirement | null>(null);
  const [conversationSnapshot, setConversationSnapshot] = useState<{
    manifestMode?: string;
    latestFinding?: string;
    latestPlanTask?: string;
    proposals: Array<{
      id: string;
      status: string;
      governanceState?: 'ACCEPTED_GOVERNED' | 'ACCEPTED_PERSISTED_NO_GOVERNANCE' | 'REJECTED';
      artifactId?: string;
      artifactVersion?: number;
      artifactStatus?: string;
      placementState?: string;
      provenanceRef?: string;
      auditRef?: string;
    }>;
  }>({ proposals: [] });
  const [computeJobs, setComputeJobs] = useState<ConsequenceComputeJob[]>([]);

  // Governed document panel (right inspector)
  const [showGovernedPanel, setShowGovernedPanel] = useState(false);

  // Editor ref for outline scroll
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // ── Phase 4 overlay state ──────────────────────────────────────────────
  type Phase4Panel = 'none' | 'transform' | 'verification' | 'twin' | 'apps' | 'pulse';
  const [phase4Panel, setPhase4Panel] = useState<Phase4Panel>('none');
  const [phase4Ctx, setPhase4Ctx] = useState<{
    ctdSection?: string;
    templateKey?: string;
    artifactId?: string;
    artifactTitle?: string;
  }>({});

  // If initialContent is provided, go straight to edit mode
  useEffect(() => {
    if (initialContent && initialTitle) {
      setMode('edit');
    }
  }, [initialContent, initialTitle]);

  useEffect(() => {
    if (!projectId || mode !== 'dashboard') return;
    const conversationId = `project-${projectId}`;
    const qs = `?projectId=${encodeURIComponent(projectId)}`;
    Promise.all([
      apiRequest('POST', `/api/conversation-os/conversations/${conversationId}/tools`, {
        mode: 'on-demand',
        projectId,
      }).catch(() => null),
      apiRequest('GET', `/api/conversation-os/conversations/${conversationId}/scout${qs}`).catch(
        () => null
      ),
      apiRequest(
        'GET',
        `/api/conversation-os/conversations/${conversationId}/plan-summary${qs}`
      ).catch(() => null),
      apiRequest(
        'GET',
        `/api/conversation-os/conversations/${conversationId}/proposals${qs}`
      ).catch(() => null),
    ]).then(([manifestRes, scoutRes, planRes, proposalRes]) => {
      setConversationSnapshot({
        manifestMode: (manifestRes as any)?.manifest?.mode,
        latestFinding: (scoutRes as any)?.findings?.[0]?.summary,
        latestPlanTask: (planRes as any)?.plan?.task,
        proposals: ((proposalRes as any)?.proposals ?? []).slice(0, 3).map((p: any) => ({
          id: p.id,
          status: p.status,
          governanceState: p.governanceState,
          artifactId: p.artifactId,
          artifactVersion: p.artifactVersion,
          artifactStatus: p.artifactStatus,
          placementState: p.placementState,
          provenanceRef: p.provenanceRef,
          auditRef: p.auditRef,
        })),
      });
    });
  }, [projectId, mode]);

  useEffect(() => {
    if (!projectId || !isINDWorkspace) return;
    setActiveLayer('document_studio');
    setLeftRailMode('dossier');
    if (!selectedDocId) {
      setMode('browse');
    }
  }, [projectId, isINDWorkspace, selectedDocId]);

  useEffect(() => {
    if (!isINDWorkspace || selectedCtdSection || submissionSections.length === 0) return;
    const firstLeaf = submissionSections.find(s => s.depth > 0)?.code || submissionSections[0]?.code;
    if (firstLeaf) setSelectedCtdSection(firstLeaf);
  }, [isINDWorkspace, selectedCtdSection, submissionSections]);

  // ── Load artifacts (must be defined before actOnProposal) ────────────────
  const loadArtifacts = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts`);
      const payload = await res.json();
      const list = payload.data ?? payload;
      setArtifacts(Array.isArray(list) ? list : []);
    } catch {
      pushShellToast('Failed to load artifacts', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadComputeJobs = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await apiRequest('GET', `/api/concept2cure/compute/projects/${projectId}/jobs`);
      const payload = await res.json();
      setComputeJobs(payload.data ?? []);
    } catch {
      setComputeJobs([]);
    }
  }, [projectId]);

  const actOnProposal = useCallback(
    async (proposalId: string, action: 'accept' | 'reject') => {
      if (!projectId) return;
      const conversationId = `project-${projectId}`;
      const res = await apiRequest(
        'POST',
        `/api/conversation-os/conversations/${conversationId}/proposals/${proposalId}/${action}`,
        { projectId }
      );
      const payload = (await res.json()) as {
        success: boolean;
        result?: {
          state: string;
          proposalId: string;
          artifactId?: string;
          governedConsequence?: {
            artifactId: string;
            version: number;
            artifactStatus: string;
            placementState: string;
            provenanceEventId: string;
            auditId: string;
          };
        };
      };

      const result = payload.result;
      setConversationSnapshot(prev => ({
        ...prev,
        proposals: prev.proposals.map(p =>
          p.id === proposalId
            ? {
                ...p,
                status: action === 'accept' ? 'accepted' : 'rejected',
                governanceState: result?.state as any,
                artifactId: result?.governedConsequence?.artifactId ?? result?.artifactId,
                artifactVersion: result?.governedConsequence?.version,
                artifactStatus: result?.governedConsequence?.artifactStatus,
                placementState: result?.governedConsequence?.placementState,
                provenanceRef: result?.governedConsequence?.provenanceEventId,
                auditRef: result?.governedConsequence?.auditId,
              }
            : p
        ),
      }));

      // Reload artifacts so governed artifact appears in project context
      if (action === 'accept') {
        await loadArtifacts();
      }
    },
    [projectId, loadArtifacts]
  );

  // ── Resume where left off — persist last active artifact per project ───
  const resumeAttemptedRef = useRef(false);

  // Save last active artifact to localStorage whenever it changes
  useEffect(() => {
    if (!projectId || !selectedDocId) return;
    try {
      localStorage.setItem(`c2c_last_artifact_${projectId}`, selectedDocId);
    } catch { /* storage full — non-critical */ }
  }, [projectId, selectedDocId]);

  // On workspace mount, auto-restore last active artifact if nothing else is requesting a specific doc
  useEffect(() => {
    if (resumeAttemptedRef.current) return;
    if (!projectId || artifacts.length === 0) return;
    // Don't override explicit openArtifactId or initialContent
    if (openArtifactId || initialContent) return;
    resumeAttemptedRef.current = true;

    try {
      const lastDocId = localStorage.getItem(`c2c_last_artifact_${projectId}`);
      if (!lastDocId) return;
      const art = artifacts.find(a => a.id === lastDocId);
      if (!art) return;
      // Resume: open the document in browse mode (user can escalate to edit)
      setSelectedDocId(lastDocId);
      setMode('browse');
    } catch { /* localStorage unavailable */ }
  }, [projectId, artifacts, openArtifactId, initialContent]);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  useEffect(() => {
    loadComputeJobs();
  }, [loadComputeJobs]);

  // ── Load dossier metrics ─────────────────────────────────────────────────
  const loadDossierMetrics = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await apiRequest(
        'GET',
        `/api/concept2cure/projects/${projectId}/dossier-metrics`
      );
      const payload = await res.json();
      if (payload.data) {
        setDossierMetrics(payload.data);
      }
    } catch {
      // Metrics are non-critical — degrade gracefully
    }
  }, [projectId]);

  useEffect(() => {
    loadDossierMetrics();
  }, [loadDossierMetrics, artifacts]);

  // ── Clear pending move on project change ─────────────────────────────────
  useEffect(() => {
    setPendingMove(null);
  }, [projectId]);

  // ── Toast notification queue ─────────────────────────────────────────────
  type ShellToast = { id: number; message: string; type: 'success' | 'error' | 'info' };
  const [shellToasts, setShellToasts] = useState<ShellToast[]>([]);
  const shellToastIdRef = useRef(0);
  const pushShellToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = ++shellToastIdRef.current;
      setShellToasts(prev => [...prev.slice(-2), { id, message, type }]);
      setTimeout(() => setShellToasts(prev => prev.filter(t => t.id !== id)), 5000);
    },
    []
  );

  // ── Escalation gate — checks if opening an existing artifact in edit mode is allowed ──
  const tryOpenForEdit = useCallback(
    (artifactStatus?: string): boolean => {
      const check = canEscalateToEdit('section-workspace', artifactStatus as any);
      if (!check.allowed) {
        pushShellToast(check.reason || 'Editing is not available for this document', 'error');
        return false;
      }
      if (check.reason) {
        // Allowed with warning (e.g. approved → editing will reset to draft)
        pushShellToast(check.reason, 'info');
      }
      return true;
    },
    [pushShellToast]
  );

  // If openArtifactId is provided, switch to edit mode for that artifact (gated)
  useEffect(() => {
    if (!openArtifactId) return;
    const art = artifacts.find(a => a.id === openArtifactId);
    if (!tryOpenForEdit(art?.status)) {
      // Still select the doc for viewing, but don't enter edit mode
      setSelectedDocId(openArtifactId);
      setMode('browse');
      return;
    }
    setSelectedDocId(openArtifactId);
    setMode('edit');
  }, [openArtifactId, artifacts, tryOpenForEdit]);

  useEffect(() => {
    if (activeLayer === 'vault') {
      setProjectNav('vault');
      return;
    }
    if (activeLayer === 'reports') {
      setProjectNav('reports');
      return;
    }
    if (phase4Panel === 'pulse') {
      setProjectNav('activity');
      return;
    }
    if (mode === 'dashboard') {
      setProjectNav('overview');
      return;
    }
    setProjectNav('documents');
  }, [activeLayer, mode, phase4Panel]);

  useEffect(() => {
    if (mode !== 'edit') {
      setDocumentTab('content');
      setEditorInitialInspector(null);
      return;
    }
    switch (documentTab) {
      case 'content':
        setShowGovernedPanel(false);
        setEditorInitialInspector(null);
        break;
      case 'evidence':
        setShowGovernedPanel(true);
        setEditorInitialInspector('provenance');
        break;
      case 'versions':
        setShowGovernedPanel(false);
        setEditorInitialInspector('compare');
        break;
      case 'review':
      case 'signatures':
      case 'export':
        setShowGovernedPanel(true);
        setEditorInitialInspector('audit');
        break;
      case 'provenance':
        setShowGovernedPanel(true);
        setEditorInitialInspector('provenance');
        break;
    }
  }, [documentTab, mode]);

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape — cancel pending move
      if (e.key === 'Escape' && pendingMove) {
        setPendingMove(null);
      }
      // Escape — dismiss phase4 panel
      if (e.key === 'Escape' && phase4Panel !== 'none') {
        setPhase4Panel('none');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pendingMove, phase4Panel]);

  // ── Outline navigation ───────────────────────────────────────────────────
  const handleOutlineNavigate = useCallback((nodeId: string) => {
    const container = editorContainerRef.current;
    if (!container) return;
    // Try to find element by id, then fallback to heading text match
    let target: Element | null = null;
    try {
      target = container.querySelector(`#${globalThis.CSS?.escape?.(nodeId) ?? nodeId}`);
    } catch {
      /* invalid selector */
    }
    if (!target) {
      // Try data-outline-id
      target = container.querySelector(`[data-outline-id="${nodeId}"]`);
    }
    if (!target) {
      // Fallback: find headings and tables and match by index
      const allAnchors = container.querySelectorAll('h1, h2, h3, table, [data-evidence]');
      const idx = parseInt(nodeId.replace(/\D/g, ''), 10);
      if (!isNaN(idx) && allAnchors[idx]) {
        target = allAnchors[idx];
      }
    }
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // ── Classify artifacts into folders ──────────────────────────────────────
  function classifyArtifact(a: TreeArtifact): string {
    const t = (a.type || '').toLowerCase();
    const cat = (a.category || '').toLowerCase();
    const status = (a.status || '').toLowerCase();
    const ctd = (a.ctdSection || '').toLowerCase();
    if (status === 'approved' || status === 'locked' || status === 'published') return 'final';
    if (t.includes('audit') || cat.includes('audit') || t.includes('provenance')) return 'audit';
    if (t.includes('clinical') || t.includes('csr') || cat.includes('clinical')) return 'clinical';
    if (ctd.startsWith('3.2') || t.includes('cmc') || cat.includes('cmc')) return 'cmc';
    if (t.includes('ind') || cat.includes('ind')) return 'ind';
    if (t.includes('ectd') || cat.includes('ectd') || cat.includes('dossier')) return 'dossier';
    if (t.includes('evidence') || cat.includes('evidence')) return 'evidence';
    if (t.includes('generated') || cat.includes('generated')) return 'generated';
    return 'drafts';
  }

  // folderDocs: used in Files mode
  const folderDocs = useMemo(() => {
    return artifacts.filter(a => classifyArtifact(a) === selectedFolder);
  }, [artifacts, selectedFolder]);

  // sectionDocs: used in Dossier mode — filter by ctdSection
  const sectionDocs = useMemo(() => {
    if (!selectedCtdSection) return [];
    return artifacts.filter(a => {
      const s = a.ctdSection || '';
      return s === selectedCtdSection || s.startsWith(selectedCtdSection + '.');
    });
  }, [artifacts, selectedCtdSection]);

  // ── Create new document ──────────────────────────────────────────────────
  const handleCreateNew = useCallback(async () => {
    if (!projectId || !newDocTitle.trim()) return;
    setCreatingNew(true);
    try {
      const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
        title: newDocTitle.trim(),
        content: '<p>Begin editing your document here...</p>',
        type: 'regulatory_document',
        category: 'document',
      });
      if (res.ok) {
        const payload = await res.json();
        const created = payload.data ?? payload;
        setNewDocTitle('');
        setShowNewDoc(false);
        await loadArtifacts();
        setSelectedDocId(created.id);
        setMode('edit');
        pushShellToast(`Created "${newDocTitle.trim()}"`, 'success');
      } else {
        pushShellToast('Document creation failed', 'error');
      }
    } catch {
      pushShellToast('Network error — document not created', 'error');
    } finally {
      setCreatingNew(false);
    }
  }, [projectId, newDocTitle, loadArtifacts, pushShellToast]);

  // ── Create from template ─────────────────────────────────────────────────
  const handleCreateFromTemplate = useCallback(
    async (templateKey: string, ctdSection: string, label: string) => {
      if (!projectId) return;
      setCreatingNew(true);
      try {
        const content = buildTemplateContent(label, ctdSection, templateKey);
        const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
          title: label,
          content,
          type: 'regulatory_document',
          category: 'document',
          ctdSection,
          templateId: templateKey,
        });
        if (res.ok) {
          const payload = await res.json();
          const created = payload.data ?? payload;
          await loadArtifacts();
          setSelectedDocId(created.id);
          setMode('edit');
          setLeftRailMode('dossier');
          pushShellToast(`Created "${label}" from template`, 'success');
        } else {
          pushShellToast('Template creation failed', 'error');
        }
      } catch {
        pushShellToast('Network error', 'error');
      } finally {
        setCreatingNew(false);
      }
    },
    [projectId, loadArtifacts, pushShellToast]
  );

  // ── Create from dialog (blank or template) ─────────────────────────────
  const handleDialogCreateBlank = useCallback(
    async (title: string, ctdSection?: string) => {
      if (!projectId) return;
      setCreatingNew(true);
      try {
        const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
          title,
          content: '<p>Begin editing your document here...</p>',
          type: 'regulatory_document',
          category: 'document',
          ...(ctdSection ? { ctdSection } : {}),
        });
        if (res.ok) {
          const payload = await res.json();
          const created = payload.data ?? payload;
          setShowNewDocDialog(false);
          await loadArtifacts();
          setSelectedDocId(created.id);
          setMode('edit');
          pushShellToast(`Created "${title}"`, 'success');
        } else {
          pushShellToast('Document creation failed', 'error');
        }
      } catch {
        pushShellToast('Network error — document not created', 'error');
      } finally {
        setCreatingNew(false);
      }
    },
    [projectId, loadArtifacts, pushShellToast]
  );

  const handleDialogCreateFromTemplate = useCallback(
    async (templateId: string, title: string, ctdSection?: string) => {
      if (!projectId) return;
      setCreatingNew(true);
      try {
        const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
          title,
          content: `<h1>${title}</h1><p>Generated from template <code>${templateId}</code>${
            ctdSection ? ` for CTD section ${ctdSection}` : ''
          }.</p>`,
          type: 'regulatory_document',
          category: 'document',
          ...(ctdSection ? { ctdSection } : {}),
          templateId,
        });
        if (res.ok) {
          const payload = await res.json();
          const created = payload.data ?? payload;
          setShowNewDocDialog(false);
          await loadArtifacts();
          setSelectedDocId(created.id);
          setMode('edit');
          pushShellToast(`Created "${title}" from template`, 'success');
        } else {
          pushShellToast('Template creation failed', 'error');
        }
      } catch {
        pushShellToast('Network error', 'error');
      } finally {
        setCreatingNew(false);
      }
    },
    [projectId, loadArtifacts, pushShellToast]
  );

  const handleCreateSectionDraftWithRI = useCallback(async () => {
    if (!projectId || !selectedCtdSection) return;
    setCreatingNew(true);
    try {
      const sectionLabel = getSectionLabel(selectedCtdSection);
      const riContext = [
        `Project: ${projectName || 'Untitled Project'}`,
        `Submission Type: ${submissionType || projectType || 'IND'}`,
        `Section Code: ${selectedCtdSection}`,
        `Section Title: ${sectionLabel}`,
      ].join('\n');
      const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, {
        title: `${selectedCtdSection} — ${sectionLabel}`,
        content: `<h1>${sectionLabel}</h1><p>RI draft scaffold initialized.</p><pre>${riContext}</pre>`,
        type: 'regulatory_document',
        category: 'document',
        ctdSection: selectedCtdSection,
        metadata: {
          draftingMode: 'ri',
          projectId,
          projectName: projectName || 'Untitled Project',
          submissionType: submissionType || projectType || 'IND',
          sectionCode: selectedCtdSection,
          moduleCode: selectedCtdSection.split('.')[0],
        },
      });
      if (!res.ok) throw new Error('Failed to create draft');
      const payload = await res.json();
      const created = payload.data ?? payload;
      await loadArtifacts();
      setSelectedDocId(created.id);
      setMode('edit');
      pushShellToast(`RI draft started for ${selectedCtdSection}`, 'success');
    } catch {
      pushShellToast('RI draft creation failed', 'error');
    } finally {
      setCreatingNew(false);
    }
  }, [
    projectId,
    selectedCtdSection,
    projectName,
    submissionType,
    projectType,
    loadArtifacts,
    pushShellToast,
  ]);

  // ── Placement confirmation handler ───────────────────────────────────────
  const handlePlacementConfirm = useCallback(
    async (params: PlacementConfirmation) => {
      if (!projectId) return;
      setPlacementLoading(true);
      try {
        const res = await apiRequest(
          'PUT',
          `/api/concept2cure/projects/${projectId}/artifacts/${params.artifactId}/placement`,
          {
            operation: params.operation,
            fromSection: params.fromSection,
            toSection: params.toSection,
            reason: params.reason,
          }
        );
        if (res.ok) {
          await loadArtifacts();
          setPlacementDialog({ open: false, artifact: null, operation: 'place' });
          pushShellToast(`Placed in ${params.toSection}`, 'success');
          setPendingMove(null);
        } else {
          pushShellToast('Placement failed', 'error');
        }
      } catch {
        pushShellToast('Placement error — try again', 'error');
      } finally {
        setPlacementLoading(false);
      }
    },
    [projectId, loadArtifacts, pushShellToast]
  );

  // ── Open placement dialog from dossier tree ──────────────────────────────
  const handlePlaceArtifact = useCallback(
    (ctdSection: string) => {
      if (pendingMove) {
        setPendingMove(prev => (prev ? { ...prev, targetSection: ctdSection } : null));
        setPlacementDialog({
          open: true,
          artifact: pendingMove.artifact,
          operation: pendingMove.fromSection ? 'relocate' : 'place',
          targetSection: ctdSection,
        });
        return;
      }
      const art = artifacts.find(a => a.id === selectedDocId);
      if (art) {
        const hasExistingSection = !!art.ctdSection;
        setPlacementDialog({
          open: true,
          artifact: art,
          operation: hasExistingSection ? 'relocate' : 'place',
          targetSection: ctdSection,
        });
      }
    },
    [artifacts, selectedDocId, pendingMove]
  );

  const workflowStage: WorkflowStage = (() => {
    if (mode === 'dashboard') return 'project-home';
    if (mode === 'edit') return 'section-workspace';
    if (leftRailMode === 'dossier') return 'dossier';
    return 'documents';
  })();

  // ── Cut (start pending move) — capability-gated ──────────────────────────
  const handleCutDocument = useCallback(
    (art: TreeArtifact) => {
      // Derive capabilities from canonical mode resolution
      const artMode = resolveDocumentMode(workflowStage, art.status as any);
      const artCaps = MODE_CAPABILITIES[artMode];
      if (!artCaps.canMoveDocument) {
        // Provide user feedback instead of silent return
        setCutBlockedMessage(`"${art.title}" cannot be moved in the current mode.`);
        setTimeout(() => setCutBlockedMessage(null), 4000);
        return;
      }
      setPendingMove({ artifact: art, fromSection: art.ctdSection || null });
    },
    [workflowStage]
  );

  // ── Paste here (complete pending move via governed dialog) ───────────────
  const handlePasteHere = useCallback(
    (ctdSection: string) => {
      if (!pendingMove) return;
      // Re-check capabilities at paste time (status may have changed)
      const artMode = resolveDocumentMode(workflowStage, pendingMove.artifact.status as any);
      const artCaps = MODE_CAPABILITIES[artMode];
      if (!artCaps.canMoveDocument) {
        setCutBlockedMessage(`"${pendingMove.artifact.title}" can no longer be moved.`);
        setTimeout(() => setCutBlockedMessage(null), 4000);
        setPendingMove(null);
        return;
      }
      setPendingMove(prev => (prev ? { ...prev, targetSection: ctdSection } : null));
      setPlacementDialog({
        open: true,
        artifact: pendingMove.artifact,
        operation: pendingMove.fromSection ? 'relocate' : 'place',
        targetSection: ctdSection,
      });
    },
    [pendingMove]
  );

  // ── Cancel pending move ──────────────────────────────────────────────────
  const handleCancelMove = useCallback(() => {
    setPendingMove(null);
  }, []);

  // ── Placement confirm with move cleanup ──────────────────────────────────
  const handlePlacementConfirmWithCleanup = useCallback(
    async (params: PlacementConfirmation) => {
      await handlePlacementConfirm(params);
      setPendingMove(null);
    },
    [handlePlacementConfirm]
  );

  // ── Copy CTD path ────────────────────────────────────────────────────────
  const handleCopyCtdPath = useCallback((art: TreeArtifact) => {
    const section = art.ctdSection || 'unplaced';
    const label = art.ctdSection ? getSectionLabel(art.ctdSection) : 'Unplaced';
    const text = `${section} — ${label} → ${art.title}`;
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  // ── Open placement dialog for a specific doc ─────────────────────────────
  const handleOpenPlacementForDoc = useCallback((art: TreeArtifact, op: PlacementOperation) => {
    setPlacementDialog({
      open: true,
      artifact: art,
      operation: op,
      targetSection: undefined,
    });
  }, []);

  // ── View section requirements ────────────────────────────────────────────
  const handleViewSectionReqs = useCallback((ctdSection: string) => {
    const reqs = getSectionRequirements(ctdSection);
    setSectionReqs(reqs);
  }, []);

  // ── Track active document content for outline ────────────────────────────
  const handleDocContentChange = useCallback((content: string, title: string) => {
    setActiveDocContent(content);
    setActiveDocTitle(title);
  }, []);

  // ── Handle governed status change from panel ────────────────────────────
  const handleGovernedStatusChange = useCallback(
    (_newStatus: string) => {
      // Refresh artifacts and metrics after status change
      loadArtifacts();
      loadDossierMetrics();
    },
    [loadArtifacts, loadDossierMetrics]
  );

  // Active artifact for doc-header and outline (must be before callbacks that reference it)
  const activeArtifact = useMemo(() => {
    if (!selectedDocId) return null;
    return artifacts.find(a => a.id === selectedDocId) || null;
  }, [selectedDocId, artifacts]);
  const reviewInFlight = useMemo(
    () =>
      artifacts.filter(a => ['review', 'approved'].includes((a.status || '').toLowerCase())).length,
    [artifacts]
  );

  // Ref for use in callbacks that need current activeArtifact
  const activeArtifactRef = useRef(activeArtifact);
  activeArtifactRef.current = activeArtifact;

  // Bubble active document context up for chat awareness
  useEffect(() => {
    if (!onActiveDocumentChange) return;
    if (activeArtifact) {
      const plainText = (activeDocContent || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      onActiveDocumentChange({
        id: String(activeArtifact.id),
        title: activeArtifact.title,
        ctdSection: activeArtifact.ctdSection,
        excerpt: plainText.slice(0, 300),
        version: activeArtifact.version,
        status: activeArtifact.status,
      });
    } else {
      onActiveDocumentChange(null);
    }
  }, [activeArtifact?.id, activeArtifact?.title, activeDocContent, onActiveDocumentChange]);

  // ── Phase 4 panel openers ──────────────────────────────────────────────
  const openTransformCanvas = useCallback(
    (ctdSection?: string, templateKey?: string, artifactId?: string, artifactTitle?: string) => {
      setPhase4Ctx({ ctdSection, templateKey, artifactId, artifactTitle });
      setPhase4Panel('transform');
    },
    []
  );

  const openVerification = useCallback(
    (artifactId?: string) => {
      const art = artifactId ? artifacts.find(a => a.id === artifactId) : activeArtifactRef.current;
      setPhase4Ctx({ artifactId: art?.id, artifactTitle: art?.title });
      setPhase4Panel('verification');
    },
    [artifacts]
  );

  const openProgramTwin = useCallback(() => {
    setPhase4Panel('twin');
  }, []);

  const openSubmissionApps = useCallback((ctdSection?: string, templateKey?: string) => {
    setPhase4Ctx({ ctdSection, templateKey });
    setPhase4Panel('apps');
  }, []);

  const openReviewPulse = useCallback(() => {
    setPhase4Panel('pulse');
  }, []);

  const closePhase4Panel = useCallback(() => {
    setPhase4Panel('none');
    setPhase4Ctx({});
  }, []);

  const openComputeArtifact = useCallback(
    (artifactId: string, inspector: 'compare' | 'provenance' | 'audit' | null = null) => {
      const art = artifacts.find(a => a.id === artifactId);
      if (!art) {
        pushShellToast('Computed artifact not found in project context', 'error');
        return;
      }
      setSelectedDocId(artifactId);
      setMode('edit');
      if (inspector === 'compare') setDocumentTab('versions');
      else if (inspector === 'provenance') setDocumentTab('provenance');
      else if (inspector === 'audit') setDocumentTab('review');
      else setDocumentTab('content');
    },
    [artifacts, pushShellToast]
  );

  /** Called when Transform Canvas / Submission App creates a draft */
  const handlePhase4CreateDraft = useCallback(
    async (
      title: string,
      ctdSection: string,
      templateKey?: string,
      existingArtifactId?: string
    ) => {
      if (!projectId) return;
      try {
        let createdId = existingArtifactId;
        if (!createdId) {
          const res = await apiRequest(
            'POST',
            `/api/concept2cure/projects/${projectId}/artifacts`,
            {
              title,
              content: `<h1>${title}</h1><p>Begin editing this document.</p>`,
              type: 'regulatory_document',
              category: 'document',
              ctdSection,
              templateId: templateKey,
              metadata: {
                source: 'generated_draft',
                governed: true,
              },
            }
          );
          const payload = await res.json();
          const created = payload.data ?? payload;
          createdId = created.id;
        }
        await loadArtifacts();
        if (!createdId) return;
        setSelectedDocId(createdId);
        setMode('edit');
        closePhase4Panel();
      } catch {
        pushShellToast('Failed to create draft', 'error');
      }
    },
    [projectId, loadArtifacts, closePhase4Panel, pushShellToast]
  );

  const documentConsequenceRows = useMemo(
    () =>
      buildDocumentConsequenceRows({
        artifacts,
        computeJobs,
        proposals: conversationSnapshot.proposals,
        canOpenArtifact: (artifactId: string, status: string) =>
          artifacts.some(a => a.id === artifactId) &&
          MODE_CAPABILITIES[resolveDocumentMode(workflowStage, status)].editable,
      }),
    [artifacts, computeJobs, conversationSnapshot.proposals]
  );

  // ── Create missing subsection from template structure ────────────────────
  const handleCreateSubsection = useCallback(
    async (subsectionKey: string, label: string) => {
      if (!projectId || !activeArtifactRef.current) return;
      const art = activeArtifactRef.current;
      try {
        const scaffoldHtml = `<h2>${label}</h2><p>[Content for ${label} — fill this section per regulatory requirements.]</p>`;
        const res = await apiRequest(
          'POST',
          `/api/concept2cure/projects/${projectId}/artifacts/${art.id}/versions`,
          {
            content: (activeDocContent || '') + '\n' + scaffoldHtml,
            changeDescription: `Added template subsection: ${label}`,
            changeType: 'template_subsection_insert',
          }
        );
        if (res.ok) {
          await loadArtifacts();
        }
      } catch {
        pushShellToast('Failed to add subsection', 'error');
      }
    },
    [projectId, activeDocContent, loadArtifacts, pushShellToast]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectDoc = useCallback(
    (doc: TreeArtifact) => {
      if (!tryOpenForEdit(doc.status)) return;
      setSelectedDocId(doc.id);
      setMode('edit');
      setDocumentTab('content');
      setSectionReqs(null); // close reqs panel when opening governed panel
    },
    [tryOpenForEdit]
  );

  const handleSelectFolder = useCallback((folderKey: string) => {
    setSelectedFolder(folderKey);
    setSelectedDocId(undefined);
    setMode('browse');
    setSectionReqs(null);
  }, []);

  const handleSelectSection = useCallback((ctdSection: string, _label: string) => {
    setSelectedCtdSection(ctdSection);
    const sectionArtifact = artifacts
      .filter(
        a => a.ctdSection === ctdSection || (a.ctdSection || '').startsWith(`${ctdSection}.`)
      )
      .sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      })[0];
    if (sectionArtifact) {
      setSelectedDocId(sectionArtifact.id);
      if (tryOpenForEdit(sectionArtifact.status)) {
        setMode('edit');
      } else {
        setMode('browse');
      }
    } else {
      setSelectedDocId(undefined);
      setMode('browse');
    }
    setSectionReqs(null);
  }, [artifacts, tryOpenForEdit]);

  const handleBackToList = useCallback(() => {
    setSelectedDocId(undefined);
    setMode('dashboard');
  }, []);

  const handleLayerChange = useCallback((layer: OperatingLayer) => {
    setActiveLayer(layer);
    if (layer === 'document_studio') {
      setPhase4Panel('none');
      return;
    }
    if (layer === 'vault') {
      setPhase4Panel('none');
      setMode('browse');
      setLeftRailMode('files');
      return;
    }
    setMode('browse');
    setPhase4Panel('pulse');
  }, []);

  const handleWorkbenchChange = useCallback((workbench: WorkspaceWorkbench) => {
    setActiveWorkbench(workbench);
    const config = WORKBENCHES.find(item => item.id === workbench);
    if (!config) return;
    setSelectedFolder(config.defaultFolder);
    setLeftRailMode('files');
    setMode('browse');
    setPhase4Panel('none');
  }, []);

  // Which docs to show in the center pane when browsing
  const browseLabel =
    leftRailMode === 'dossier'
      ? selectedCtdSection
        ? `Section ${selectedCtdSection}`
        : 'Select a section'
      : FOLDER_LABELS[selectedFolder] || selectedFolder;
  const browseDocs = leftRailMode === 'dossier' ? sectionDocs : folderDocs;

  // Outline available only when doc is open
  const outlineAvailable = mode === 'edit' && !!selectedDocId;

  // ── No project guard ────────────────────────────────────────────────────
  if (!projectId) {
    return (
      <div
        className="flex-1 flex items-center justify-center bg-stone-50/30 p-8"
        data-testid="no-project-selected"
      >
        <div className="max-w-sm text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-blue-50 flex items-center justify-center">
            <FolderOpen className="w-7 h-7 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-stone-900 mb-2">Select a Project</h2>
          <p className="text-sm text-stone-500 mb-5">
            Choose a project from the sidebar to access its documents, version history, and audit
            trail.
          </p>
          <button
            onClick={onSelectProject}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-800 text-white text-sm font-medium hover:bg-stone-900 transition-colors shadow-sm"
          >
            <FolderOpen className="w-4 h-4" />
            Select Project
          </button>
        </div>
      </div>
    );
  }

  return (
    <DocumentModeProvider initialStage={workflowStage} key={workflowStage}>
      <div className="flex-1 flex flex-col min-h-0" data-testid="project-workspace-shell">
        {/* ── Compact breadcrumb bar — minimal chrome ─────────────────────── */}
        <div className="flex items-center gap-2.5 px-4 h-10 border-b border-stone-150 bg-white shrink-0">
          <button
            onClick={onBackToProjects}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors duration-150"
            aria-label="Back to projects"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          {projectType && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 font-medium uppercase tracking-tight flex-shrink-0">
              {projectType}
            </span>
          )}
          <span className="text-[14px] font-semibold text-stone-800 truncate">
            {projectName || 'Untitled Project'}
          </span>
          {(mode === 'edit' || mode === 'browse') && (
            <div className="flex items-center gap-1.5 text-stone-300">
              <span>/</span>
              <button
                onClick={() => {
                  setSelectedDocId(undefined);
                  setMode('dashboard');
                }}
                className="text-[11px] text-stone-500 hover:text-stone-700 font-medium transition-colors"
              >
                Home
              </button>
              {mode === 'edit' && selectedDocId && (
                <>
                  <span>/</span>
                  <button
                    onClick={() => setMode('browse')}
                    className="text-[11px] text-stone-500 hover:text-stone-700 font-medium transition-colors"
                  >
                    Files
                  </button>
                </>
              )}
            </div>
          )}
          {/* Spacer */}
          <div className="flex-1" />
          {/* Intelligence link — subtle, not a toggle */}
          {onSwitchToIntelligence && (
            <button
              onClick={onSwitchToIntelligence}
              className="text-[11px] font-medium text-stone-400 hover:text-stone-600 transition-colors flex items-center gap-1"
            >
              <Brain className="w-3 h-3" />
              Intelligence
            </button>
          )}
          {/* Context bars expand/collapse */}
          <button
            onClick={() => setShowContextBars(prev => !prev)}
            className="flex items-center justify-center w-5 h-5 rounded text-stone-300 hover:text-stone-600 hover:bg-stone-100 transition-colors"
            title={showContextBars ? 'Hide advanced controls' : 'Show advanced controls'}
            aria-label={showContextBars ? 'Hide advanced controls' : 'Show advanced controls'}
          >
            {showContextBars ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* ── Collapsible context bars (AnA Shell, Context Band, CTD Flow) ──── */}
        <div className={cn('overflow-hidden transition-all duration-200', showContextBars ? 'max-h-48' : 'max-h-0')} aria-hidden={!showContextBars}>

        {/* ── Work modes / workbench bar ─────────────────────────────────── */}
        {!isINDWorkspace && (
        <div className="flex items-center gap-3 px-4 h-10 border-b border-stone-150 bg-stone-50/50 shrink-0 overflow-x-auto">
          <div className="text-[10px] font-medium tracking-wide text-stone-400 uppercase whitespace-nowrap">
            Mode
          </div>
          <div className="flex items-center gap-1.5">
            {OPERATING_LAYERS.map(layer => {
              const LayerIcon = layer.icon;
              const selected = activeLayer === layer.id;
              return (
                <button
                  key={layer.id}
                  onClick={() => handleLayerChange(layer.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                    selected
                      ? 'bg-stone-900 text-white'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  )}
                  title={layer.description}
                >
                  <LayerIcon className="w-3.5 h-3.5" />
                  {layer.label}
                </button>
              );
            })}
          </div>
          <span className="text-stone-200">|</span>
          <div className="text-[10px] font-medium tracking-wide text-stone-400 uppercase whitespace-nowrap">
            Focus
          </div>
          <div className="flex items-center gap-1.5">
            {WORKBENCHES.map(workbench => {
              const WorkbenchIcon = workbench.icon;
              const selected = activeWorkbench === workbench.id;
              return (
                <button
                  key={workbench.id}
                  onClick={() => handleWorkbenchChange(workbench.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                    selected
                      ? 'bg-stone-800 text-white'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-blue-50'
                  )}
                  title={workbench.description}
                >
                  <WorkbenchIcon className="w-3.5 h-3.5" />
                  {workbench.label}
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* ── Context band ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 h-9 border-b border-stone-150 bg-white/95 shrink-0">
          <span className="text-[11px] text-stone-500 truncate max-w-[240px]">
            {activeArtifact?.title ? activeArtifact.title.slice(0, 50) : 'No document selected'}
          </span>
          {reviewInFlight > 0 && (
            <>
              <span className="text-stone-200">·</span>
              <span className="text-[11px] text-amber-600">{reviewInFlight} in review</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => {
                setMode('dashboard');
                setPhase4Panel('pulse');
              }}
              className="text-[11px] px-2 py-0.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
            >
              Reviews
            </button>
            <button
              onClick={() => setOperatingLayer('reports')}
              className="text-[11px] px-2 py-0.5 rounded border border-blue-200 text-stone-700 hover:bg-blue-50"
            >
              Reports
            </button>
            <button
              onClick={() => {
                setProjectNav('submission_builder');
                setActiveLayer('document_studio');
                setLeftRailMode('dossier');
                setMode(selectedDocId ? 'edit' : 'browse');
              }}
              className="text-[11px] px-2 py-0.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              Submission Builder
            </button>
          </div>
        </div>

        {!isINDWorkspace && (
        <div className="flex items-center gap-2 px-4 h-9 border-b border-zinc-200 bg-emerald-50/40 shrink-0 overflow-x-auto">
          <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wide whitespace-nowrap">
            Dossier modules
          </span>
          {[
            { module: 'Module 1', focus: 'Administrative / regional' },
            { module: 'Module 2', focus: 'Summaries & overviews' },
            { module: 'Module 3', focus: 'CMC' },
            { module: 'Module 5', focus: 'Clinical reports' },
          ].map(step => (
            <span
              key={step.module}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-[11px] text-emerald-800 whitespace-nowrap"
              title={step.focus}
            >
              <MapPin className="w-3 h-3 text-emerald-600" />
              <span className="font-medium">{step.module}</span>
              <span className="text-emerald-600">{step.focus}</span>
            </span>
          ))}
        </div>
        )}

        {!isINDWorkspace && (
        <div className="flex items-center gap-1 px-4 h-9 border-b border-zinc-200 bg-zinc-50/70 shrink-0 overflow-x-auto">
          {PROJECT_NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setProjectNav(item.id);
                if (item.id === 'overview') {
                  setMode('dashboard');
                  setPhase4Panel('none');
                } else if (item.id === 'submission_builder') {
                  setActiveLayer('document_studio');
                  setLeftRailMode('dossier');
                  setMode(selectedDocId ? 'edit' : 'browse');
                  setPhase4Panel('none');
                } else if (item.id === 'cmc') {
                  setActiveLayer('document_studio');
                  setActiveWorkbench('cmc');
                  setSelectedFolder('cmc');
                  setLeftRailMode('dossier');
                  setMode('browse');
                  setPhase4Panel('none');
                } else if (item.id === 'clinical_module5') {
                  setActiveLayer('document_studio');
                  setActiveWorkbench('clinical');
                  setSelectedCtdSection('5');
                  setLeftRailMode('dossier');
                  setMode('browse');
                  setPhase4Panel('none');
                } else if (item.id === 'verify') {
                  setActiveLayer('reports');
                  setMode('browse');
                  setPhase4Panel('verification');
                } else if (item.id === 'review') {
                  setActiveLayer('reports');
                  setMode('browse');
                  setPhase4Panel('pulse');
                } else if (item.id === 'publish') {
                  onNavigate ? onNavigate('submissions') : setMode('dashboard');
                } else if (item.id === 'haq') {
                  setActiveLayer('reports');
                  setMode('dashboard');
                  setPhase4Panel('pulse');
                } else if (item.id === 'vault') {
                  setActiveLayer('vault');
                  setMode('browse');
                  setLeftRailMode('files');
                }
              }}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md border whitespace-nowrap transition-colors',
                projectNav === item.id
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        )}
        </div>{/* close collapsible context bars container */}

        {isINDWorkspace && (
          <div className="border-b border-blue-200 bg-blue-50/50 px-4 py-2.5 shrink-0">
            <div className="flex items-center gap-2 text-xs text-blue-900">
              <span className="font-semibold">IND / eCTD Workspace</span>
              <span className="text-blue-300">•</span>
              <span>Readiness {readinessPercent}%</span>
              <span className="text-blue-300">•</span>
              <span>
                Next step:{' '}
                {nextRecommendedSection
                  ? `${nextRecommendedSection.code} ${nextRecommendedSection.title}`
                  : selectedCtdSection
                    ? `Open ${selectedCtdSection}`
                    : 'Select a section'}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => {
                    setLeftRailMode('dossier');
                    setMode('browse');
                  }}
                  className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-blue-100"
                >
                  Section tree
                </button>
                <button
                  onClick={() => {
                    if (nextRecommendedSection?.code) {
                      setSelectedCtdSection(nextRecommendedSection.code);
                    }
                    setLeftRailMode('dossier');
                    setMode('browse');
                    setTimeout(() => {
                      handleCreateSectionDraftWithRI();
                    }, 0);
                  }}
                  className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  Start next with RI
                </button>
                <button
                  onClick={() => onNavigate?.('haq')}
                  className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-blue-100"
                >
                  HAQ path
                </button>
                <button
                  onClick={() => onNavigate?.('submissions')}
                  className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-blue-100"
                >
                  Assemble/export
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Pending move banner ───────────────────────────────────────────── */}
        {pendingMove && (
          <div className="flex items-center gap-2.5 px-4 h-10 border-b border-amber-200 bg-amber-50 shrink-0">
            <Scissors className="w-4 h-4 text-amber-600" />
            <span className="text-xs text-amber-900 font-medium truncate">
              Moving: {pendingMove.artifact.title}
            </span>
            {pendingMove.fromSection && (
              <span className="text-xs text-amber-700">from {pendingMove.fromSection}</span>
            )}
            {pendingMove.targetSection ? (
              <>
                <span className="text-xs text-amber-500">→</span>
                <span className="text-xs text-amber-800 font-semibold">
                  {pendingMove.targetSection}
                </span>
              </>
            ) : (
              <span className="text-xs text-amber-600 ml-1">Select a dossier section to paste</span>
            )}
            {pendingMove.artifact.status === 'approved' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                ⚠ Approved
              </span>
            )}
            <button
              onClick={handleCancelMove}
              className="ml-auto text-xs text-amber-800 hover:text-red-600 font-medium flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
              <kbd className="ml-1 text-xs px-1.5 py-0.5 rounded bg-amber-200/60 text-amber-800 font-mono">
                Esc
              </kbd>
            </button>
          </div>
        )}

        {/* ── Cut/move blocked feedback ───────────────────────────────────── */}
        {cutBlockedMessage && (
          <div className="flex items-center gap-2.5 px-4 h-9 border-b border-red-200 bg-red-50 shrink-0 animate-in fade-in duration-200">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs text-red-800 font-medium">{cutBlockedMessage}</span>
            <button onClick={() => setCutBlockedMessage(null)} className="ml-auto">
              <X className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
            </button>
          </div>
        )}

        {/* ── Persistent context band (browse mode — selected doc reminder) */}
        {mode === 'browse' && activeArtifact && (
          <div className="flex items-center gap-2.5 px-4 h-9 border-b border-blue-100 bg-blue-50/40 shrink-0">
            <FileText className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs text-blue-800 font-medium truncate">
              {activeArtifact.title}
            </span>
            {activeArtifact.ctdSection && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100/60 text-blue-600 font-medium">
                {activeArtifact.ctdSection}
              </span>
            )}
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded font-medium',
                activeArtifact.status === 'locked'
                  ? 'bg-red-100/60 text-red-600'
                  : activeArtifact.status === 'approved'
                    ? 'bg-green-100/60 text-green-600'
                    : 'bg-stone-100 text-stone-500'
              )}
            >
              {activeArtifact.status || 'draft'}
            </span>
            <button
              onClick={() => {
                if (tryOpenForEdit(activeArtifact.status)) setMode('edit');
              }}
              className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Open →
            </button>
          </div>
        )}

        {/* ── Compact doc context bar (shown when editing) — document-led, minimal chrome */}
        {mode === 'edit' && activeArtifact && (
          <div className="flex items-center gap-2 px-4 h-8 border-b border-stone-100 bg-white shrink-0">
            <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <span className="text-xs font-semibold text-stone-800 truncate">
              {activeArtifact.title}
            </span>
            {activeArtifact.ctdSection && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium shrink-0">
                {activeArtifact.ctdSection}
              </span>
            )}
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
                activeArtifact.status === 'locked'
                  ? 'bg-red-50 text-red-600'
                  : activeArtifact.status === 'approved'
                    ? 'bg-green-50 text-green-600'
                    : activeArtifact.status === 'review'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-stone-50 text-stone-400'
              )}
            >
              {(activeArtifact.status || 'draft')}
            </span>
            {activeArtifact.version && (
              <span className="text-[10px] text-stone-400 tabular-nums">v{activeArtifact.version}</span>
            )}
            {/* Essential doc-level actions — secondary actions available in EditorPanel overflow */}
            <div className="ml-auto flex items-center gap-0.5">
              <button
                onClick={() => openVerification(activeArtifact.id)}
                className="p-1 text-stone-300 hover:text-emerald-600 rounded hover:bg-emerald-50 transition-colors"
                title="Verify document"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() =>
                  openTransformCanvas(
                    activeArtifact.ctdSection,
                    activeArtifact.templateId,
                    activeArtifact.id,
                    activeArtifact.title
                  )
                }
                className="p-1.5 text-stone-400 hover:text-violet-600 rounded-md hover:bg-blue-50"
                title="Transform Canvas"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={openProgramTwin}
                className="p-1.5 text-stone-400 hover:text-blue-600 rounded-md hover:bg-blue-50"
                title="Program Twin"
              >
                <Target className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() =>
                  openSubmissionApps(activeArtifact.ctdSection, activeArtifact.templateId)
                }
                className="p-1.5 text-stone-400 hover:text-orange-600 rounded-md hover:bg-orange-50"
                title="AI Assistants"
              >
                <AppWindow className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={openReviewPulse}
                className={cn(
                  'p-1 rounded transition-colors',
                  phase4Panel === 'pulse'
                    ? 'text-rose-600 bg-rose-50'
                    : 'text-stone-300 hover:text-rose-600 hover:bg-rose-50'
                )}
                title="Review Pulse"
              >
                <Activity className="w-3.5 h-3.5" />
              </button>
              <NotificationCenter projectId={projectId} industryMode={industryMode} />
            </div>
          </div>
        )}

        {/* Trust strip and document tabs removed from edit mode —
            EditorPanel's InspectorRibbon provides all these capabilities
            (Provenance, Compare, Audit, Versions, Review, Compliance, etc.)
            with better stage-aware progressive disclosure. */}

        {/* ── 3-pane body ───────────────────────────────────────────────────── */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Tree panel with mode toggle — hidden in dashboard mode for full-width layout */}
          {mode !== 'dashboard' && (
            <div className="w-[200px] 2xl:w-[240px] border-r border-zinc-200 shrink-0 flex flex-col bg-white">
              {!isINDWorkspace && (
              <div className="grid grid-cols-3 gap-1 p-1.5 border-b border-zinc-200 bg-white">
                {[
                  { key: 'documents' as OperatingLayer, label: 'Docs' },
                  { key: 'vault' as OperatingLayer, label: 'Vault' },
                  { key: 'reports' as OperatingLayer, label: 'Readiness' },
                ].map(layer => (
                  <button
                    key={layer.key}
                    onClick={() => {
                      setOperatingLayer(layer.key);
                      if (layer.key === 'vault') setActiveRegistry('vault');
                      if (layer.key === 'reports') setActiveRegistry('reports');
                      if (layer.key === 'documents' && activeRegistry !== 'projects') {
                        setActiveRegistry('documents');
                      }
                    }}
                    className={cn(
                      'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      operatingLayer === layer.key
                        ? 'bg-stone-900 text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    )}
                  >
                    {layer.label}
                  </button>
                ))}
              </div>
              )}
              {/* Mode toggle tabs */}
              <div className="flex border-b border-zinc-200 shrink-0 bg-zinc-50/60">
                {(isINDWorkspace
                  ? [
                      {
                        key: 'dossier' as LeftRailMode,
                        icon: BookOpen,
                        label: 'Sections',
                        disabled: false,
                      },
                      {
                        key: 'outline' as LeftRailMode,
                        icon: List,
                        label: 'Outline',
                        disabled: !outlineAvailable,
                      },
                    ]
                  : [
                  { key: 'files' as LeftRailMode, icon: Files, label: 'Files', disabled: false },
                  {
                    key: 'dossier' as LeftRailMode,
                    icon: BookOpen,
                    label: 'Dossier',
                    disabled: false,
                  },
                  {
                    key: 'templates' as LeftRailMode,
                    icon: Layers,
                    label: 'Tmpl',
                    disabled: false,
                  },
                  {
                    key: 'outline' as LeftRailMode,
                    icon: List,
                    label: 'Outline',
                    disabled: !outlineAvailable,
                  },
                  {
                    key: 'registry' as LeftRailMode,
                    icon: Brain,
                    label: 'OS',
                    disabled: false,
                  },
                  ]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => !tab.disabled && setLeftRailMode(tab.key)}
                    disabled={tab.disabled}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors duration-150',
                      leftRailMode === tab.key
                        ? 'text-stone-900 bg-white border-b-2 border-stone-900'
                        : tab.disabled
                          ? 'text-stone-400 cursor-not-allowed'
                          : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100/60'
                    )}
                    data-testid={`rail-mode-${tab.key}`}
                    title={tab.disabled ? 'Open a document to use Outline' : tab.label}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* ── Active document context band ──────────────────────────────── */}
              {activeArtifact && (
                <div
                  className="border-b border-stone-200 bg-stone-50/60 px-2.5 py-2 shrink-0"
                  data-testid="active-doc-context"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="text-xs font-medium text-stone-700 truncate flex-1">
                      {activeArtifact.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {activeArtifact.ctdSection && (
                      <span className="text-xs px-1.5 py-0.5 rounded-md bg-blue-50 text-stone-700 font-medium">
                        {activeArtifact.ctdSection}
                      </span>
                    )}
                    {activeArtifact.templateId && (
                      <span className="text-xs px-1.5 py-0.5 rounded-md bg-violet-50 text-stone-700">
                        {activeArtifact.templateId.replace('tpl-', '')}
                      </span>
                    )}
                    <span
                      className={cn(
                        'text-xs px-1.5 py-0.5 rounded-md font-medium',
                        activeArtifact.status === 'locked'
                          ? 'bg-red-50 text-red-700'
                          : activeArtifact.status === 'approved'
                            ? 'bg-green-50 text-green-700'
                            : activeArtifact.status === 'review'
                              ? 'bg-yellow-50 text-yellow-700'
                              : 'bg-stone-100 text-stone-500'
                      )}
                    >
                      {activeArtifact.status || 'draft'}
                    </span>
                    {activeArtifact.version && (
                      <span className="text-xs text-stone-400">v{activeArtifact.version}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Tree content based on mode */}
              {loading && artifacts.length === 0 ? (
                <div className="flex-1 p-4" data-testid="workspace-files-loading">
                  <SkeletonText lines={6} label="Loading files" testId="workspace-skeleton" />
                </div>
              ) : leftRailMode === 'files' ? (
                <ProjectFileTree
                  artifacts={artifacts}
                  selectedId={selectedDocId}
                  onSelect={handleSelectDoc}
                  onSelectFolder={handleSelectFolder}
                  selectedFolder={selectedFolder}
                  onCreateNew={() => setShowNewDoc(true)}
                  onCutDocument={handleCutDocument}
                  onOpenPlacement={art =>
                    handleOpenPlacementForDoc(art, art.ctdSection ? 'relocate' : 'place')
                  }
                  onCopyCtdPath={handleCopyCtdPath}
                  pendingMove={pendingMove}
                  onPasteHere={pendingMove ? handlePasteHere : undefined}
                />
              ) : leftRailMode === 'dossier' ? (
                <DossierTree
                  artifacts={artifacts}
                  selectedSection={selectedCtdSection}
                  onSelectSection={handleSelectSection}
                  onPlaceArtifact={selectedDocId || pendingMove ? handlePlaceArtifact : undefined}
                  customHierarchy={submissionDossierHierarchy}
                  metrics={dossierMetrics}
                  pendingMove={pendingMove}
                  onPasteHere={pendingMove ? handlePasteHere : undefined}
                  onViewRequirements={handleViewSectionReqs}
                  onOpenTransformCanvas={(ctdSection: string) => openTransformCanvas(ctdSection)}
                  onOpenProgramTwin={openProgramTwin}
                  onOpenSubmissionApps={(ctdSection: string) => openSubmissionApps(ctdSection)}
                  onCreateFromTemplate={(ctdSection: string) => {
                    setLeftRailMode('templates');
                    setSelectedCtdSection(ctdSection);
                  }}
                  onDraftWithAI={(ctdSection: string) => {
                    setSelectedCtdSection(ctdSection);
                    setShowNewDocDialog(true);
                  }}
                  onAttachExisting={(ctdSection: string) => {
                    setSelectedCtdSection(ctdSection);
                    setLeftRailMode('files');
                    setMode('browse');
                  }}
                />
              ) : leftRailMode === 'outline' ? (
                outlineAvailable ? (
                  <DocumentOutlineTree
                    content={activeDocContent}
                    title={activeDocTitle || activeArtifact?.title || ''}
                    templateKey={activeArtifact?.templateId}
                    ctdSection={activeArtifact?.ctdSection}
                    onNavigate={handleOutlineNavigate}
                    onCreateSubsection={handleCreateSubsection}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center p-4">
                    <p className="text-xs text-stone-400 text-center">
                      Open a document to view its outline
                    </p>
                  </div>
                )
              ) : leftRailMode === 'registry' ? (
                <OperatingSystemRegistryPanel
                  projectId={projectId}
                  projectName={projectName}
                  artifacts={artifacts}
                  activeRegistry={activeRegistry}
                  onRegistryChange={setActiveRegistry}
                />
              ) : (
                <TemplateTree
                  submissionType={submissionType || projectType}
                  onCreateFromTemplate={handleCreateFromTemplate}
                  onOpenTransformCanvas={(ctdSection: string, templateKey: string) =>
                    openTransformCanvas(ctdSection, templateKey)
                  }
                />
              )}

              {/* Project-level Review Pulse button */}
              <div className="shrink-0 border-t border-stone-200 p-2">
                <button
                  onClick={openReviewPulse}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-colors duration-150',
                    phase4Panel === 'pulse'
                      ? 'text-rose-700 bg-rose-50'
                      : 'text-stone-500 hover:text-rose-600 hover:bg-rose-50'
                  )}
                  title="Review Pulse — project-wide review status"
                >
                  <Activity className="w-3.5 h-3.5" />
                  Review Pulse
                </button>
              </div>
            </div>
          )}

          {/* Center + Right: Content area */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* New document input strip */}
            {showNewDoc && (
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-stone-200 bg-stone-50/60 shrink-0">
                <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={e => setNewDocTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateNew();
                    if (e.key === 'Escape') {
                      setShowNewDoc(false);
                      setNewDocTitle('');
                    }
                  }}
                  placeholder="New document title..."
                  className="flex-1 px-2 py-1 text-sm border border-stone-200 rounded focus-visible:ring-2 focus-visible:ring-stone-400 outline-none/30"
                  autoFocus
                />
                <button
                  onClick={handleCreateNew}
                  disabled={creatingNew || !newDocTitle.trim()}
                  className="px-2.5 py-1 text-xs bg-stone-800 text-white rounded hover:bg-stone-900 disabled:opacity-60 font-medium flex items-center gap-1"
                >
                  {creatingNew ? (
                    <Loader2 className="w-3 h-3 animate-spin" aria-label="Creating document" />
                  ) : (
                    <Plus className="w-3 h-3" />
                  )}
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewDoc(false);
                    setNewDocTitle('');
                  }}
                  className="px-2 py-1 text-xs text-stone-500 hover:text-stone-700"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Mode: browse = DocumentListPane, edit = EditorPanel, Phase 4 overlay */}
            <DocumentStudioSurface
              osLayer={operatingLayer}
              onOpenWorkbench={domain => {
                if (domain === 'biostatistics') onNavigate?.('biostatistics');
                if (domain === 'safety-narrative') onNavigate?.('safety-narrative');
                if (domain === 'precedent-intelligence') onNavigate?.('precedent-intelligence');
              }}
            >
              {phase4Panel === 'transform' ? (
                <RegulatoryTransformCanvas
                  projectId={projectId}
                  projectName={projectName || 'Project'}
                  ctdSection={phase4Ctx.ctdSection}
                  templateKey={phase4Ctx.templateKey}
                  artifactId={phase4Ctx.artifactId}
                  artifactTitle={phase4Ctx.artifactTitle}
                  onClose={closePhase4Panel}
                  onCreateDraft={handlePhase4CreateDraft}
                  onOpenEditor={(artId: string) => {
                    const art = artifacts.find(a => a.id === artId);
                    if (!tryOpenForEdit(art?.status)) return;
                    setSelectedDocId(artId);
                    setMode('edit');
                    closePhase4Panel();
                  }}
                  onOpenPlacement={(artId?: string) => {
                    if (artId) {
                      const art = artifacts.find(a => a.id === artId);
                      if (art)
                        handleOpenPlacementForDoc(art, art.ctdSection ? 'relocate' : 'place');
                    }
                    closePhase4Panel();
                  }}
                  onOpenVerification={(artId: string) => openVerification(artId)}
                />
              ) : phase4Panel === 'verification' && phase4Ctx.artifactId ? (
                <GoldenDossierVerificationPanel
                  projectId={projectId}
                  artifactId={phase4Ctx.artifactId}
                  onClose={closePhase4Panel}
                  onOpenEditor={(artId: string) => {
                    const art = artifacts.find(a => a.id === artId);
                    if (!tryOpenForEdit(art?.status)) return;
                    setSelectedDocId(artId);
                    setMode('edit');
                    closePhase4Panel();
                  }}
                  onOpenPlacement={(artId: string) => {
                    const art = artifacts.find(a => a.id === artId);
                    if (art) handleOpenPlacementForDoc(art, art.ctdSection ? 'relocate' : 'place');
                    closePhase4Panel();
                  }}
                  onOpenProvenance={() => {
                    if (phase4Ctx.artifactId) {
                      const art = artifacts.find(a => a.id === phase4Ctx.artifactId);
                      if (!tryOpenForEdit(art?.status)) {
                        closePhase4Panel();
                        return;
                      }
                      setSelectedDocId(phase4Ctx.artifactId);
                      setMode('edit');
                    }
                    closePhase4Panel();
                  }}
                  onOpenAudit={() => closePhase4Panel()}
                  onOpenCompare={() => closePhase4Panel()}
                  onOpenTransformCanvas={() =>
                    openTransformCanvas(
                      undefined,
                      undefined,
                      phase4Ctx.artifactId,
                      phase4Ctx.artifactTitle
                    )
                  }
                  onCreateSubsection={handleCreateSubsection}
                />
              ) : phase4Panel === 'twin' ? (
                <ProgramTwinPanel
                  projectId={projectId}
                  projectName={projectName || 'Project'}
                  onClose={closePhase4Panel}
                  onOpenVerification={openVerification}
                  onOpenTransformCanvas={() => openTransformCanvas()}
                  onSelectSection={(section: string) => {
                    setSelectedCtdSection(section);
                    setMode('browse');
                    closePhase4Panel();
                  }}
                />
              ) : phase4Panel === 'apps' ? (
                <SubmissionAppsPanel
                  projectId={projectId}
                  projectName={projectName || 'Project'}
                  onClose={closePhase4Panel}
                  onCreateDraft={handlePhase4CreateDraft}
                  onOpenTransformCanvas={(ctdSec?: string, tmplKey?: string) =>
                    openTransformCanvas(ctdSec, tmplKey)
                  }
                />
              ) : phase4Panel === 'pulse' ? (
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <ReviewPulseDashboard
                    projectId={projectId}
                    onNavigateToArtifact={artifactId => {
                      const art = artifacts.find(a => a.id === artifactId);
                      closePhase4Panel();
                      if (!tryOpenForEdit(art?.status)) {
                        setSelectedDocId(artifactId);
                        setMode('browse');
                        return;
                      }
                      setSelectedDocId(artifactId);
                      setMode('edit');
                    }}
                  />
                </div>
              ) : mode === 'dashboard' ? (
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {projectNav === 'communications' && (
                    <div className="rounded-xl border border-stone-200 overflow-hidden bg-white">
                      <RegulatoryCommunicationsHub projectId={projectId} />
                    </div>
                  )}
                  {projectNav !== 'communications' && (
                    <>
                  <ComputeJobPanel
                    projectId={projectId}
                    onJobsLoaded={jobs => setComputeJobs(jobs)}
                    onOpenArtifact={artifactId => openComputeArtifact(artifactId)}
                    onOpenProvenance={artifactId => openComputeArtifact(artifactId, 'provenance')}
                    onOpenAudit={artifactId => openComputeArtifact(artifactId, 'audit')}
                    onPlaceArtifact={artifactId => {
                      const art = artifacts.find(a => a.id === artifactId);
                      if (!art) return;
                      handleOpenPlacementForDoc(art, art.ctdSection ? 'relocate' : 'place');
                    }}
                  />
                  <ProjectDashboard
                    projectId={projectId}
                    projectName={projectName || 'Untitled Project'}
                    projectType={projectType}
                    submissionType={submissionType}
                    artifacts={artifacts}
                    onOpenDocument={(docId: string) => {
                      const art = artifacts.find(a => a.id === docId);
                      if (!tryOpenForEdit(art?.status)) {
                        setSelectedDocId(docId);
                        setMode('browse');
                        return;
                      }
                      setSelectedDocId(docId);
                      setMode('edit');
                      setShowGovernedPanel(true);
                    }}
                    onCreateDocument={() => setShowNewDocDialog(true)}
                    onOpenEditor={() => setMode('browse')}
                    onOpenDossier={() => {
                      setLeftRailMode('dossier');
                      setMode('browse');
                    }}
                    onOpenIntelligence={onSwitchToIntelligence}
                    onOpenSubmissions={onNavigate ? () => onNavigate('submissions') : undefined}
                    onOpenTemplates={onNavigate ? () => onNavigate('template-library') : undefined}
                    onOpenTaskBoard={onNavigate ? () => onNavigate('task-board') : undefined}
                    onOpenCSRWorkflow={onNavigate ? () => onNavigate('csr-workflow') : undefined}
                    onOpenINDChecklist={onNavigate ? () => onNavigate('ind-checklist') : undefined}
                  />
                  {projectNav === 'haq' && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-700" />
                        <span className="text-sm font-semibold text-emerald-900">
                          HAQ Manager — Governed Artifact Queue
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] ml-auto border-emerald-200 text-emerald-700"
                        >
                          {
                            artifacts.filter(a => a.status === 'review' || a.status === 'draft')
                              .length
                          }{' '}
                          open
                        </Badge>
                      </div>
                      <p className="text-xs text-emerald-800">
                        Triage governed artifacts, review pulse signals, and proposal accept/reject
                        actions in one quality queue.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="rounded border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-800">
                          Draft artifacts:{' '}
                          <span className="font-semibold">
                            {artifacts.filter(a => a.status === 'draft').length}
                          </span>
                        </div>
                        <div className="rounded border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-800">
                          Reviews in flight: <span className="font-semibold">{reviewInFlight}</span>
                        </div>
                        <div className="rounded border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-800">
                          Pending proposals:{' '}
                          <span className="font-semibold">
                            {
                              conversationSnapshot.proposals.filter(p => p.status === 'pending')
                                .length
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-semibold text-slate-900">
                        Document Consequence Ledger
                      </span>
                      <Badge variant="outline" className="text-[10px] ml-auto">
                        {documentConsequenceRows.length} tracked
                      </Badge>
                    </div>
                    {documentConsequenceRows.length === 0 ? (
                      <div className="text-xs text-slate-500">
                        No generated or accepted document consequences yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {documentConsequenceRows.map(row => (
                          <div
                            key={row.rowKey}
                            className="rounded border border-slate-100 px-3 py-2 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-medium text-slate-800 truncate">
                                {row.title}
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px]',
                                  row.status === 'draft' && 'text-amber-700 border-amber-200',
                                  row.status === 'approved' &&
                                    'text-emerald-700 border-emerald-200',
                                  row.status === 'review' && 'text-stone-700 border-blue-200',
                                  row.status === 'locked' && 'text-slate-700 border-slate-200'
                                )}
                              >
                                {row.status}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                              <span>v{row.version}</span>
                              <span className="text-slate-300">·</span>
                              <span>{row.placement}</span>
                              <span className="text-slate-300">·</span>
                              <span>
                                {row.sourceType === 'compute'
                                  ? 'Compute'
                                  : row.sourceType === 'proposal_accept'
                                    ? 'Proposal'
                                    : 'Generated'}
                              </span>
                              {row.provenancePresent && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span className="text-violet-600">Prov ✓</span>
                                </>
                              )}
                              {row.auditPresent && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span className="text-sky-600">Audit ✓</span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2 pt-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px] text-blue-600"
                                disabled={!row.openable}
                                onClick={() => openComputeArtifact(row.artifactId)}
                              >
                                {row.openable ? 'Open in editor' : 'View only'}
                              </Button>
                              {row.provenancePresent && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] text-violet-600"
                                  onClick={() => openComputeArtifact(row.artifactId, 'provenance')}
                                >
                                  Provenance
                                </Button>
                              )}
                              {row.auditPresent && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] text-emerald-600"
                                  onClick={() => openComputeArtifact(row.artifactId, 'audit')}
                                >
                                  Audit
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Conversation proposals with governed consequence visibility */}
                  {conversationSnapshot.proposals.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold text-slate-900">
                          Document Proposals
                        </span>
                        <Badge variant="outline" className="text-[10px] ml-auto">
                          {conversationSnapshot.proposals.length}
                        </Badge>
                      </div>
                      {conversationSnapshot.proposals.map(p => (
                        <div
                          key={p.id}
                          className="rounded border border-slate-100 px-3 py-2 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-800">
                              {p.id.slice(0, 12)}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px]',
                                p.status === 'pending' && 'text-amber-700 border-amber-200',
                                p.status === 'accepted' && 'text-emerald-700 border-emerald-200',
                                p.status === 'rejected' && 'text-rose-700 border-rose-200'
                              )}
                            >
                              {p.status}
                            </Badge>
                          </div>

                          {/* Governance consequence (visible after accept) */}
                          {p.status === 'accepted' && p.governanceState && (
                            <div className="rounded bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-[11px] space-y-1">
                              <div className="flex items-center gap-1.5">
                                <ShieldCheck
                                  className={cn(
                                    'w-3 h-3',
                                    p.governanceState === 'ACCEPTED_GOVERNED'
                                      ? 'text-emerald-600'
                                      : 'text-amber-500'
                                  )}
                                />
                                <span
                                  className={cn(
                                    'font-medium',
                                    p.governanceState === 'ACCEPTED_GOVERNED'
                                      ? 'text-emerald-700'
                                      : 'text-amber-700'
                                  )}
                                >
                                  {p.governanceState === 'ACCEPTED_GOVERNED'
                                    ? 'Governed'
                                    : 'Persisted (no governance)'}
                                </span>
                              </div>
                              {p.artifactId && (
                                <div className="text-slate-600 space-y-0.5">
                                  <div>
                                    Artifact:{' '}
                                    <span className="font-medium text-slate-800">
                                      {p.artifactId.slice(0, 20)}
                                    </span>{' '}
                                    · v{p.artifactVersion ?? 1} · {p.artifactStatus || 'draft'}
                                  </div>
                                  <div>
                                    Placement: {p.placementState || 'unplaced'} · Provenance:{' '}
                                    {p.provenanceRef ? p.provenanceRef.slice(0, 12) : 'none'} ·
                                    Audit: {p.auditRef ? p.auditRef.slice(0, 12) : 'none'}
                                  </div>
                                </div>
                              )}
                              {p.artifactId && (
                                <div className="flex items-center gap-2 pt-0.5">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-[10px] text-blue-600"
                                    onClick={() => openComputeArtifact(p.artifactId!)}
                                  >
                                    Open in editor
                                  </Button>
                                  {p.provenanceRef && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-[10px] text-violet-600"
                                      onClick={() =>
                                        openComputeArtifact(p.artifactId!, 'provenance')
                                      }
                                    >
                                      Provenance
                                    </Button>
                                  )}
                                  {p.auditRef && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-[10px] text-emerald-600"
                                      onClick={() => openComputeArtifact(p.artifactId!, 'audit')}
                                    >
                                      Audit
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Actions for pending proposals */}
                          {p.status === 'pending' && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2.5 text-[11px] text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                onClick={() => actOnProposal(p.id, 'accept')}
                              >
                                Accept
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2.5 text-[11px] text-rose-700 border-rose-200 hover:bg-rose-50"
                                onClick={() => actOnProposal(p.id, 'reject')}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                    </>
                  )}
                </div>
              ) : mode === 'browse' ? (
                <div className="flex-1 min-h-0 flex flex-col">
                  {isINDWorkspace && leftRailMode === 'dossier' && (
                    <div className="px-4 pt-3">
                      <IndEvidenceAskPanel
                        projectId={projectId}
                        sectionCode={selectedCtdSection}
                        sectionTitle={
                          selectedCtdSection ? getSectionLabel(selectedCtdSection) : undefined
                        }
                      />
                    </div>
                  )}
                  <div className="flex-1 min-h-0">
                    <DocumentListPane
                      folderLabel={browseLabel}
                      documents={browseDocs}
                      selectedId={selectedDocId}
                      onSelect={handleSelectDoc}
                      onCreateNew={() => setShowNewDoc(true)}
                      onAIDraft={
                        leftRailMode === 'dossier' && selectedCtdSection
                          ? handleCreateSectionDraftWithRI
                          : undefined
                      }
                      onStartFromTemplate={
                        leftRailMode === 'dossier' && selectedCtdSection
                          ? () =>
                              handleDialogCreateFromTemplate(
                                'clinical-overview',
                                `${selectedCtdSection} — ${getSectionLabel(selectedCtdSection)}`,
                                selectedCtdSection
                              )
                          : undefined
                      }
                      onWriteManually={
                        leftRailMode === 'dossier' && selectedCtdSection
                          ? () =>
                              handleDialogCreateBlank(
                                `${selectedCtdSection} — ${getSectionLabel(selectedCtdSection)}`,
                                selectedCtdSection
                              )
                          : undefined
                      }
                      sectionAIDraftable={leftRailMode === 'dossier' && !!selectedCtdSection}
                      onCutDocument={handleCutDocument}
                      onCopyCtdPath={handleCopyCtdPath}
                      onOpenPlacement={handleOpenPlacementForDoc}
                    />
                  </div>
                </div>
              ) : (
                <div ref={editorContainerRef} className="flex-1 flex min-h-0 min-w-0">
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <div
                          className="flex-1 flex flex-col items-center justify-center gap-3"
                          data-testid="editor-loading"
                        >
                          <LoadingState
                            message="Loading editor..."
                            size="sm"
                            testId="editor-suspense"
                          />
                        </div>
                      }
                    >
                      <EditorPanel
                        projectId={projectId}
                        submissionType={submissionType || projectType}
                        initialContent={initialContent}
                        initialTitle={initialTitle}
                        initialCtdSection={initialCtdSection}
                        onInitialContentConsumed={onInitialContentConsumed}
                        openArtifactId={openArtifactId}
                        onOpenArtifactConsumed={onOpenArtifactConsumed}
                        onContentChange={handleDocContentChange}
                        initialInspector={editorInitialInspector}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}
            </DocumentStudioSurface>
          </div>

          {/* ── Section requirements side panel ─────────────────────────────── */}
          {sectionReqs && !showGovernedPanel && (
            <SectionRequirementsPanel
              reqs={sectionReqs}
              metrics={dossierMetrics[sectionReqs.section]}
              onClose={() => setSectionReqs(null)}
            />
          )}

          {/* ── Governed document panel ─────────────────────────────────────── */}
          {showGovernedPanel && selectedDocId && activeArtifact && projectId && (
            <GovernedDocumentPanel
              projectId={projectId}
              artifact={activeArtifact}
              industryMode={industryMode}
              onStatusChange={handleGovernedStatusChange}
              onClose={() => setShowGovernedPanel(false)}
              onOpenDiff={() => {
                if (!tryOpenForEdit(activeArtifact.status)) return;
                setMode('edit');
                setDocumentTab('versions');
              }}
            />
          )}
        </div>

        {/* ── Placement dialog ──────────────────────────────────────────────── */}
        {placementDialog.artifact && (
          <PlacementDialog
            open={placementDialog.open}
            onClose={() => setPlacementDialog({ open: false, artifact: null, operation: 'place' })}
            artifact={placementDialog.artifact}
            operation={placementDialog.operation}
            targetSection={placementDialog.targetSection}
            onConfirm={handlePlacementConfirmWithCleanup}
            loading={placementLoading}
          />
        )}

        {/* ── New Document Dialog ── */}
        <NewDocumentDialog
          isOpen={showNewDocDialog}
          onClose={() => setShowNewDocDialog(false)}
          onCreateBlank={handleDialogCreateBlank}
          onCreateFromTemplate={handleDialogCreateFromTemplate}
          onAIGenerate={handleDialogCreateFromTemplate}
          submissionType={submissionType}
          isCreating={creatingNew}
        />

        {/* ── Toast notifications ── */}
        {shellToasts.length > 0 && (
          <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
            {shellToasts.map(t => (
              <div
                key={t.id}
                className={cn(
                  'pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg shadow-sm text-xs font-medium',
                  t.type === 'success' && 'bg-emerald-600 text-white',
                  t.type === 'error' && 'bg-red-600 text-white',
                  t.type === 'info' && 'bg-stone-700 text-white'
                )}
              >
                <span>{t.message}</span>
                <button
                  onClick={() => setShellToasts(prev => prev.filter(x => x.id !== t.id))}
                  className="ml-1 opacity-60 hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </DocumentModeProvider>
  );
};

// ── Section requirements panel (extracted) ───────────────────────────────────

interface SectionReqsPanelProps {
  reqs: SectionRequirement;
  metrics?: SectionMetrics;
  onClose: () => void;
}

function SectionRequirementsPanel({ reqs, metrics, onClose }: SectionReqsPanelProps) {
  const [showChildren, setShowChildren] = useState(false);

  return (
    <div className="w-[200px] 2xl:w-[240px] border-l border-stone-200 shrink-0 flex flex-col bg-white overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-stone-200 bg-stone-50/60">
        <div className="flex items-center gap-1.5">
          <Info className="w-3 h-3 text-blue-600" />
          <span className="text-xs font-semibold text-stone-700">Section Requirements</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-stone-400 hover:text-stone-600 rounded hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
          aria-label="Close panel"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2.5 space-y-2.5 text-xs">
        {/* Section */}
        <div>
          <div className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">Section</div>
          <div className="font-semibold text-stone-900">{reqs.ctdSection}</div>
          <div className="text-stone-600 mt-0.5">{reqs.label}</div>
        </div>

        {/* Description */}
        <div>
          <div className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">Description</div>
          <p className="text-stone-600 leading-relaxed">{reqs.description}</p>
        </div>

        {/* Expected doc types */}
        <div>
          <div className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">
            Expected Documents
          </div>
          <ul className="space-y-0.5">
            {reqs.requiredDocTypes.map((dt, i) => (
              <li key={i} className="text-stone-700 flex items-center gap-1">
                <FileText className="w-2.5 h-2.5 text-stone-400" />
                {dt}
              </li>
            ))}
          </ul>
        </div>

        {/* Required / Optional */}
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-stone-50">
          {reqs.optional ? (
            <>
              <Info className="w-3 h-3 text-blue-500" />
              <span className="text-xs text-stone-700 font-medium">Optional section</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              <span className="text-xs text-amber-700 font-medium">Required section</span>
            </>
          )}
        </div>

        {/* Templates available */}
        {reqs.starterTemplatesAvailable.length > 0 && (
          <div>
            <div className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">
              Starter Templates
            </div>
            {reqs.starterTemplatesAvailable.map((t, i) => (
              <div key={i} className="text-stone-600 flex items-center gap-1 py-0.5">
                <Layers className="w-2.5 h-2.5 text-violet-500" />
                {t}
              </div>
            ))}
          </div>
        )}

        {/* Common missing blocks */}
        {reqs.commonMissingBlocks.length > 0 && (
          <div>
            <div className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">
              Expected Content Blocks
            </div>
            {reqs.commonMissingBlocks.map((b, i) => (
              <div key={i} className="text-stone-500 text-xs py-0.5">
                • {b}
              </div>
            ))}
          </div>
        )}

        {/* Children sections */}
        {(reqs.requiredChildren.length > 0 || reqs.optionalChildren.length > 0) && (
          <div>
            <button
              onClick={() => setShowChildren(!showChildren)}
              className="flex items-center gap-1 text-xs text-stone-400 uppercase tracking-wide mb-0.5 hover:text-stone-600"
            >
              {showChildren ? (
                <ChevronDown className="w-2.5 h-2.5" />
              ) : (
                <ChevronRight className="w-2.5 h-2.5" />
              )}
              Child Sections ({reqs.requiredChildren.length + reqs.optionalChildren.length})
            </button>
            {showChildren && (
              <div className="space-y-0.5 mt-0.5">
                {reqs.requiredChildren.map((c, i) => (
                  <div key={i} className="text-stone-600 text-xs">
                    ▸ {c}
                  </div>
                ))}
                {reqs.optionalChildren.map((c, i) => (
                  <div key={i} className="text-stone-400 text-xs italic">
                    ▹ {c}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Current metrics */}
        {metrics && (
          <div>
            <div className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">
              Current Status
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Artifacts</span>
                <span className="font-medium text-stone-700">{metrics.artifactCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Completion</span>
                <span className="font-medium text-stone-700">{metrics.completionPercent}%</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-1.5">
                <div
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-150',
                    metrics.completionPercent >= 75
                      ? 'bg-emerald-500'
                      : metrics.completionPercent >= 25
                        ? 'bg-amber-500'
                        : 'bg-red-400'
                  )}
                  style={{ width: `${Math.min(100, metrics.completionPercent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Evidence</span>
                <span className="font-medium text-stone-700">{metrics.evidenceCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Precedents</span>
                <span className="font-medium text-stone-700">{metrics.precedentCount}</span>
              </div>
              {/* Warning signals */}
              {metrics.artifactCount > 0 && metrics.evidenceCount === 0 && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-xs">
                  <AlertTriangle className="w-2.5 h-2.5" /> No evidence linked
                </div>
              )}
              {metrics.artifactCount > 0 && metrics.precedentCount === 0 && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 text-xs">
                  <AlertTriangle className="w-2.5 h-2.5" /> No precedents
                </div>
              )}
              {metrics.artifactCount === 0 && reqs.hasTemplates && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-xs">
                  <Info className="w-2.5 h-2.5" /> Template available, no doc created
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectWorkspaceShell;
