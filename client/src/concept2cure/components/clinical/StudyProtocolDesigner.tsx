/**
 * Concept2Cure - Study Protocol Designer
 *
 * AI-powered clinical protocol design tool supporting:
 * - Multiple study design types (RCT, crossover, adaptive, dose-escalation, etc.)
 * - Endpoints selection and powering
 * - Comparator protocol benchmarking
 * - Regulatory-ready protocol templates
 *
 * Powered by Lumen Cortex AI with study design expertise
 *
 * @module concept2cure/components/clinical/StudyProtocolDesigner
 * @version 1.0.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Beaker,
  Users,
  Target,
  BarChart3,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  FileText,
  Plus,
  ArrowRight,
  Calculator,
  Globe2,
  Layers,
  GitBranch,
  Zap,
  BookOpen,
  Download,
  ChevronRight,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type StudyDesignType =
  | 'parallel_rct'
  | 'crossover'
  | 'adaptive'
  | 'dose_escalation'
  | 'group_sequential'
  | 'basket'
  | 'platform'
  | 'n_of_1'
  | 'observational';

type StudyPhase =
  | 'phase_1'
  | 'phase_1b'
  | 'phase_2'
  | 'phase_2b'
  | 'phase_3'
  | 'phase_4'
  | 'pivotal';

interface StudyDesign {
  id: string;
  name: string;
  type: StudyDesignType;
  description: string;
  icon: React.ElementType;
  bestFor: string[];
  considerations: string[];
}

interface Endpoint {
  id: string;
  name: string;
  type: 'primary' | 'secondary' | 'exploratory';
  measureType: 'continuous' | 'binary' | 'time_to_event' | 'count';
  description: string;
  assessmentSchedule?: string;
}

interface ProtocolDesignInput {
  indication: string;
  phase: StudyPhase;
  designType: StudyDesignType;
  treatmentArms: number;
  controlType: 'placebo' | 'active' | 'soc' | 'none';
  primaryEndpoint: Endpoint | null;
  secondaryEndpoints: Endpoint[];
  targetPower: number;
  significanceLevel: number;
  expectedEffect: number;
  dropout: number;
  enrollmentDuration: number;
  followupDuration: number;
  sites: number;
  regions: string[];
}

interface SampleSizeResult {
  perArm: number;
  total: number;
  adjustedForDropout: number;
  assumptions: string[];
}

interface ProtocolSection {
  id: string;
  title: string;
  status: 'not_started' | 'ai_draft' | 'in_review' | 'approved';
  content?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const STUDY_DESIGNS: StudyDesign[] = [
  {
    id: 'parallel_rct',
    name: 'Parallel-Group RCT',
    type: 'parallel_rct',
    description: 'Subjects randomized to treatment or control, followed concurrently',
    icon: Users,
    bestFor: ['Phase 2/3 efficacy trials', 'Confirmatory studies', 'Registration studies'],
    considerations: [
      'Larger sample size needed',
      'Period effects not an issue',
      'Standard regulatory acceptance',
    ],
  },
  {
    id: 'crossover',
    name: 'Crossover Design',
    type: 'crossover',
    description: 'Subjects receive all treatments in sequence, serving as own control',
    icon: RefreshCw,
    bestFor: ['Chronic conditions', 'Stable diseases', 'Symptomatic endpoints'],
    considerations: ['Carryover effects', 'Washout period needed', 'Smaller N but longer duration'],
  },
  {
    id: 'adaptive',
    name: 'Adaptive Design',
    type: 'adaptive',
    description: 'Pre-planned modifications based on interim data',
    icon: GitBranch,
    bestFor: ['Uncertain dose selection', 'Rare diseases', 'Resource optimization'],
    considerations: [
      'Complex statistical methods',
      'Regulatory pre-alignment',
      'Type I error control',
    ],
  },
  {
    id: 'dose_escalation',
    name: 'Dose-Escalation (3+3)',
    type: 'dose_escalation',
    description: 'Cohorts of 3 patients at increasing doses to find MTD',
    icon: Layers,
    bestFor: ['Phase 1 oncology', 'First-in-human', 'Cytotoxic agents'],
    considerations: [
      'Limited PK/PD data',
      'MTD may not be optimal',
      'Consider BOIN/CRM alternatives',
    ],
  },
  {
    id: 'group_sequential',
    name: 'Group Sequential',
    type: 'group_sequential',
    description: 'Planned interim analyses with early stopping rules',
    icon: BarChart3,
    bestFor: ['Large confirmatory trials', 'Ethical considerations', 'Resource management'],
    considerations: ['Alpha spending function', "O'Brien-Fleming or Pocock", 'Unblinding risk'],
  },
  {
    id: 'basket',
    name: 'Basket Trial',
    type: 'basket',
    description: 'Single drug tested across multiple tumor types/diseases',
    icon: Target,
    bestFor: ['Precision medicine', 'Biomarker-selected', 'Rare mutations'],
    considerations: ['Heterogeneity across baskets', 'Borrowing strength', 'Regulatory novelty'],
  },
  {
    id: 'platform',
    name: 'Platform Trial',
    type: 'platform',
    description: 'Multiple treatments evaluated against shared control',
    icon: Globe2,
    bestFor: ['Multiple candidates', 'Ongoing development', 'Efficiency in rare disease'],
    considerations: ['Complex governance', 'Master protocol', 'Shared infrastructure'],
  },
  {
    id: 'n_of_1',
    name: 'N-of-1 Trial',
    type: 'n_of_1',
    description: 'Single patient crossover for individual treatment decisions',
    icon: Zap,
    bestFor: ['Individualized medicine', 'Chronic symptomatic conditions', 'Rare diseases'],
    considerations: [
      'Limited generalizability',
      'Multiple crossovers needed',
      'Patient commitment',
    ],
  },
];

const PHASES: { value: StudyPhase; label: string; description: string }[] = [
  { value: 'phase_1', label: 'Phase 1', description: 'Safety, PK/PD, dose-finding' },
  { value: 'phase_1b', label: 'Phase 1b', description: 'Expansion cohorts, preliminary efficacy' },
  { value: 'phase_2', label: 'Phase 2', description: 'Efficacy signal, dose optimization' },
  { value: 'phase_2b', label: 'Phase 2b', description: 'Dose-ranging, endpoint refinement' },
  { value: 'phase_3', label: 'Phase 3', description: 'Confirmatory efficacy and safety' },
  { value: 'phase_4', label: 'Phase 4', description: 'Post-marketing commitments' },
  { value: 'pivotal', label: 'Pivotal', description: 'Registration-enabling study' },
];

const PROTOCOL_SECTIONS: ProtocolSection[] = [
  { id: 'synopsis', title: 'Protocol Synopsis', status: 'not_started' },
  { id: 'background', title: 'Background and Rationale', status: 'not_started' },
  { id: 'objectives', title: 'Study Objectives', status: 'not_started' },
  { id: 'design', title: 'Study Design', status: 'not_started' },
  { id: 'population', title: 'Study Population', status: 'not_started' },
  { id: 'treatment', title: 'Study Treatment', status: 'not_started' },
  { id: 'procedures', title: 'Study Procedures', status: 'not_started' },
  { id: 'efficacy', title: 'Efficacy Assessments', status: 'not_started' },
  { id: 'safety', title: 'Safety Assessments', status: 'not_started' },
  { id: 'statistics', title: 'Statistical Considerations', status: 'not_started' },
  { id: 'ethics', title: 'Ethical Considerations', status: 'not_started' },
];

const COMMON_ENDPOINTS: Endpoint[] = [
  {
    id: 'orr',
    name: 'Objective Response Rate (ORR)',
    type: 'primary',
    measureType: 'binary',
    description: 'Proportion achieving CR or PR per RECIST',
  },
  {
    id: 'pfs',
    name: 'Progression-Free Survival (PFS)',
    type: 'primary',
    measureType: 'time_to_event',
    description: 'Time from randomization to progression or death',
  },
  {
    id: 'os',
    name: 'Overall Survival (OS)',
    type: 'primary',
    measureType: 'time_to_event',
    description: 'Time from randomization to death from any cause',
  },
  {
    id: 'dor',
    name: 'Duration of Response (DoR)',
    type: 'secondary',
    measureType: 'time_to_event',
    description: 'Time from first response to progression',
  },
  {
    id: 'dcr',
    name: 'Disease Control Rate (DCR)',
    type: 'secondary',
    measureType: 'binary',
    description: 'Proportion achieving CR, PR, or SD',
  },
  {
    id: 'qol',
    name: 'Quality of Life (HRQoL)',
    type: 'secondary',
    measureType: 'continuous',
    description: 'Change from baseline in validated PRO instrument',
  },
  {
    id: 'safety',
    name: 'Safety/Tolerability',
    type: 'secondary',
    measureType: 'binary',
    description: 'Incidence of TEAEs, SAEs, discontinuations',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE SIZE CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────

const calculateSampleSize = (
  measureType: 'continuous' | 'binary' | 'time_to_event',
  power: number,
  alpha: number,
  effectSize: number,
  dropout: number
): SampleSizeResult => {
  // Simplified calculations (would use proper formulas in production)
  const zAlpha = 1.96; // For alpha = 0.05 two-sided
  const zBeta = power === 0.8 ? 0.84 : power === 0.9 ? 1.28 : 1.04;

  let perArm: number;
  const assumptions: string[] = [];

  if (measureType === 'binary') {
    // Binary endpoint (proportion)
    const p1 = 0.3; // Control proportion (example)
    const p2 = p1 + effectSize;
    const pBar = (p1 + p2) / 2;
    perArm = Math.ceil(
      (2 * pBar * (1 - pBar) * Math.pow(zAlpha + zBeta, 2)) / Math.pow(effectSize, 2)
    );
    assumptions.push(`Control rate: ${(p1 * 100).toFixed(0)}%`);
    assumptions.push(`Treatment rate: ${(p2 * 100).toFixed(0)}%`);
  } else if (measureType === 'continuous') {
    // Continuous endpoint
    const sd = 1; // Standardized
    perArm = Math.ceil(
      (2 * Math.pow(sd, 2) * Math.pow(zAlpha + zBeta, 2)) / Math.pow(effectSize, 2)
    );
    assumptions.push(`Effect size: ${effectSize.toFixed(2)} SD`);
  } else {
    // Time-to-event
    const hr = 1 - effectSize;
    const events = Math.ceil((4 * Math.pow(zAlpha + zBeta, 2)) / Math.pow(Math.log(hr), 2));
    perArm = Math.ceil(events / (2 * 0.7)); // Assuming 70% event rate
    assumptions.push(`Hazard ratio: ${hr.toFixed(2)}`);
    assumptions.push(`Events needed: ${events}`);
  }

  const total = perArm * 2;
  const adjustedForDropout = Math.ceil(total / (1 - dropout / 100));

  assumptions.push(`Power: ${(power * 100).toFixed(0)}%`);
  assumptions.push(`Alpha: ${alpha.toFixed(3)} (two-sided)`);
  assumptions.push(`Dropout: ${dropout}%`);

  return { perArm, total, adjustedForDropout, assumptions };
};

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN SELECTOR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface DesignSelectorProps {
  selectedDesign: StudyDesignType | null;
  onSelect: (design: StudyDesignType) => void;
}

const DesignSelector: React.FC<DesignSelectorProps> = ({ selectedDesign, onSelect }) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {STUDY_DESIGNS.map(design => {
        const Icon = design.icon;
        const isSelected = selectedDesign === design.type;

        return (
          <div
            key={design.id}
            className={cn(
              'border border-border/40 rounded-sm bg-background cursor-pointer transition-all',
              isSelected && 'ring-2 ring-blue-500 bg-blue-50'
            )}
            onClick={() => onSelect(design.type)}
          >
            <div className="px-3 py-2 p-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center',
                    isSelected ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 text-zinc-600'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3
                    className={cn(
                      'font-medium text-sm',
                      isSelected ? 'text-blue-900' : 'text-zinc-900'
                    )}
                  >
                    {design.name}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{design.description}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT SELECTOR
// ─────────────────────────────────────────────────────────────────────────────

interface EndpointSelectorProps {
  selectedEndpoints: Endpoint[];
  onToggle: (endpoint: Endpoint) => void;
  onSetPrimary: (endpoint: Endpoint) => void;
  primaryEndpoint: Endpoint | null;
}

const EndpointSelector: React.FC<EndpointSelectorProps> = ({
  selectedEndpoints,
  onToggle,
  onSetPrimary,
  primaryEndpoint,
}) => {
  return (
    <div className="space-y-3">
      {COMMON_ENDPOINTS.map(endpoint => {
        const isSelected = selectedEndpoints.some(e => e.id === endpoint.id);
        const isPrimary = primaryEndpoint?.id === endpoint.id;

        return (
          <div
            key={endpoint.id}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg border transition-colors',
              isSelected
                ? 'bg-blue-50 border-blue-200'
                : 'bg-white border-zinc-200 hover:border-zinc-300'
            )}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggle(endpoint)}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-900">{endpoint.name}</span>
                {isPrimary && <Badge className="bg-blue-600 text-white text-xs">Primary</Badge>}
                <Badge variant="outline" className="text-xs">
                  {endpoint.measureType.replace('_', ' ')}
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{endpoint.description}</p>
            </div>
            {isSelected && !isPrimary && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSetPrimary(endpoint)}
                className="text-xs"
              >
                Set Primary
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE SIZE PANEL
// ─────────────────────────────────────────────────────────────────────────────

interface SampleSizePanelProps {
  endpoint: Endpoint | null;
  result: SampleSizeResult | null;
  power: number;
  alpha: number;
  effectSize: number;
  dropout: number;
  onPowerChange: (value: number) => void;
  onEffectChange: (value: number) => void;
  onDropoutChange: (value: number) => void;
}

const SampleSizePanel: React.FC<SampleSizePanelProps> = ({
  endpoint,
  result,
  power,
  alpha,
  effectSize,
  dropout,
  onPowerChange,
  onEffectChange,
  onDropoutChange,
}) => {
  if (!endpoint) {
    return (
      <div className="text-center py-8 text-zinc-500">
        <Calculator className="h-12 w-12 mx-auto mb-3 text-zinc-400" />
        <p className="text-sm">Select a primary endpoint to calculate sample size</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Power slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Statistical Power</Label>
          <span className="text-sm font-medium text-blue-600">{(power * 100).toFixed(0)}%</span>
        </div>
        <Slider
          value={[power * 100]}
          min={70}
          max={95}
          step={5}
          onValueChange={([v]) => onPowerChange(v / 100)}
        />
        <p className="text-xs text-zinc-500">Probability of detecting a true effect</p>
      </div>

      {/* Effect size slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Expected Effect Size</Label>
          <span className="text-sm font-medium text-blue-600">
            {endpoint.measureType === 'binary'
              ? `${(effectSize * 100).toFixed(0)}%`
              : effectSize.toFixed(2)}
          </span>
        </div>
        <Slider
          value={[effectSize * 100]}
          min={5}
          max={50}
          step={5}
          onValueChange={([v]) => onEffectChange(v / 100)}
        />
        <p className="text-xs text-zinc-500">
          {endpoint.measureType === 'binary'
            ? 'Absolute difference in rates'
            : 'Standardized difference'}
        </p>
      </div>

      {/* Dropout slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Expected Dropout Rate</Label>
          <span className="text-sm font-medium text-blue-600">{dropout}%</span>
        </div>
        <Slider
          value={[dropout]}
          min={0}
          max={30}
          step={5}
          onValueChange={([v]) => onDropoutChange(v)}
        />
      </div>

      {/* Results */}
      {result && (
        <div className="border border-border/40 rounded-sm bg-background bg-gradient-to-br from-blue-50 to-white border-blue-200">
          <div className="px-3 py-2 border-b border-border/30 pb-2">
            <h3 className="text-sm font-semibold text-base flex items-center gap-2">
              <Calculator className="h-4 w-4 text-blue-600" />
              Sample Size Estimate
            </h3>
          </div>
          <div className="px-3 py-2">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-semibold text-blue-700">{result.perArm}</p>
                <p className="text-xs text-zinc-500">Per Arm</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-blue-700">{result.total}</p>
                <p className="text-xs text-zinc-500">Total</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-green-700">{result.adjustedForDropout}</p>
                <p className="text-xs text-zinc-500">With Dropout</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-blue-100">
              <p className="text-xs font-medium text-zinc-700 mb-2">Assumptions:</p>
              <ul className="text-xs text-zinc-500 space-y-1">
                {result.assumptions.map((assumption, idx) => (
                  <li key={idx} className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    {assumption}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface StudyProtocolDesignerProps {
  projectId?: string;
  onGenerateProtocol?: (design: ProtocolDesignInput) => Promise<void>;
  className?: string;
}

export const StudyProtocolDesigner: React.FC<StudyProtocolDesignerProps> = ({
  projectId,
  onGenerateProtocol,
  className,
}) => {
  const [activeTab, setActiveTab] = useState('design');
  const [isGenerating, setIsGenerating] = useState(false);

  // Design inputs
  const [indication, setIndication] = useState('');
  const [phase, setPhase] = useState<StudyPhase>('phase_2');
  const [designType, setDesignType] = useState<StudyDesignType | null>(null);
  const [treatmentArms, setTreatmentArms] = useState(2);
  const [controlType, setControlType] = useState<'placebo' | 'active' | 'soc' | 'none'>('placebo');

  // Endpoints
  const [selectedEndpoints, setSelectedEndpoints] = useState<Endpoint[]>([]);
  const [primaryEndpoint, setPrimaryEndpoint] = useState<Endpoint | null>(null);

  // Sample size parameters
  const [power, setPower] = useState(0.8);
  const [alpha] = useState(0.05);
  const [effectSize, setEffectSize] = useState(0.2);
  const [dropout, setDropout] = useState(10);

  // Calculate sample size
  const sampleSizeResult = useMemo(() => {
    if (!primaryEndpoint) return null;
    return calculateSampleSize(primaryEndpoint.measureType, power, alpha, effectSize, dropout);
  }, [primaryEndpoint, power, alpha, effectSize, dropout]);

  // Protocol sections state
  const [protocolSections, setProtocolSections] = useState(PROTOCOL_SECTIONS);

  const handleToggleEndpoint = useCallback(
    (endpoint: Endpoint) => {
      setSelectedEndpoints(prev => {
        const exists = prev.some(e => e.id === endpoint.id);
        if (exists) {
          // If removing primary, clear it
          if (primaryEndpoint?.id === endpoint.id) {
            setPrimaryEndpoint(null);
          }
          return prev.filter(e => e.id !== endpoint.id);
        }
        return [...prev, endpoint];
      });
    },
    [primaryEndpoint]
  );

  const handleSetPrimary = useCallback((endpoint: Endpoint) => {
    setPrimaryEndpoint(endpoint);
    // Ensure it's in selected list
    setSelectedEndpoints(prev => {
      if (!prev.some(e => e.id === endpoint.id)) {
        return [...prev, endpoint];
      }
      return prev;
    });
  }, []);

  const handleGenerateAIDraft = async (sectionId: string) => {
    setProtocolSections(prev =>
      prev.map(s => (s.id === sectionId ? { ...s, status: 'ai_draft' } : s))
    );
    // Would call Lumen Cortex API here
  };

  const selectedDesign = STUDY_DESIGNS.find(d => d.type === designType);

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <Beaker className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Study Protocol Designer</h1>
            <p className="text-xs text-zinc-500">RI-powered clinical protocol development</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <BookOpen className="h-4 w-4 mr-2" />
            Load Template
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button size="sm" disabled={!designType || !primaryEndpoint || isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Protocol
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-4 grid w-fit grid-cols-4">
          <TabsTrigger value="design">
            <Target className="h-4 w-4 mr-2" />
            Study Design
          </TabsTrigger>
          <TabsTrigger value="endpoints">
            <BarChart3 className="h-4 w-4 mr-2" />
            Endpoints
          </TabsTrigger>
          <TabsTrigger value="sample">
            <Calculator className="h-4 w-4 mr-2" />
            Sample Size
          </TabsTrigger>
          <TabsTrigger value="protocol">
            <FileText className="h-4 w-4 mr-2" />
            Protocol
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 p-4">
          {/* Study Design Tab */}
          <TabsContent value="design" className="m-0 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Indication / Disease Area</Label>
                <Input
                  value={indication}
                  onChange={e => setIndication(e.target.value)}
                  placeholder="e.g., Non-Small Cell Lung Cancer"
                />
              </div>
              <div className="space-y-2">
                <Label>Study Phase</Label>
                <Select value={phase} onValueChange={v => setPhase(v as StudyPhase)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PHASES.map(p => (
                      <SelectItem key={p.value} value={p.value}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.label}</span>
                          <span className="text-xs text-zinc-500">- {p.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-3 block">Select Study Design</Label>
              <DesignSelector selectedDesign={designType} onSelect={setDesignType} />
            </div>

            {selectedDesign && (
              <div className="border border-border/40 rounded-sm bg-background bg-blue-50 border-blue-200">
                <div className="px-3 py-2 p-4">
                  <div className="flex items-start gap-3">
                    <selectedDesign.icon className="h-6 w-6 text-blue-600 mt-1" />
                    <div>
                      <h3 className="font-semibold text-blue-900">{selectedDesign.name}</h3>
                      <p className="text-sm text-blue-700 mt-1">{selectedDesign.description}</p>
                      <div className="mt-3 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-blue-800">Best For:</p>
                          <ul className="mt-1 text-xs text-blue-600 space-y-0.5">
                            {selectedDesign.bestFor.map((item, idx) => (
                              <li key={idx} className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-blue-800">Considerations:</p>
                          <ul className="mt-1 text-xs text-blue-600 space-y-0.5">
                            {selectedDesign.considerations.map((item, idx) => (
                              <li key={idx} className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Treatment Arms</Label>
                <Select
                  value={treatmentArms.toString()}
                  onValueChange={v => setTreatmentArms(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 arms</SelectItem>
                    <SelectItem value="3">3 arms</SelectItem>
                    <SelectItem value="4">4 arms</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Control Type</Label>
                <Select
                  value={controlType}
                  onValueChange={v => setControlType(v as typeof controlType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placebo">Placebo</SelectItem>
                    <SelectItem value="active">Active Comparator</SelectItem>
                    <SelectItem value="soc">Standard of Care</SelectItem>
                    <SelectItem value="none">No Control (single arm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* Endpoints Tab */}
          <TabsContent value="endpoints" className="m-0 space-y-6">
            <div>
              <Label className="mb-3 block">Select Study Endpoints</Label>
              <EndpointSelector
                selectedEndpoints={selectedEndpoints}
                primaryEndpoint={primaryEndpoint}
                onToggle={handleToggleEndpoint}
                onSetPrimary={handleSetPrimary}
              />
            </div>

            {selectedEndpoints.length > 0 && (
              <div className="border border-border/40 rounded-sm bg-background">
                <div className="px-3 py-2 border-b border-border/30 pb-2">
                  <h3 className="text-sm font-semibold text-base">Selected Endpoints Summary</h3>
                </div>
                <div className="px-3 py-2">
                  <div className="space-y-2">
                    {primaryEndpoint && (
                      <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                        <Badge className="bg-blue-600">Primary</Badge>
                        <span className="text-sm font-medium">{primaryEndpoint.name}</span>
                      </div>
                    )}
                    {selectedEndpoints
                      .filter(e => e.id !== primaryEndpoint?.id)
                      .map(endpoint => (
                        <div
                          key={endpoint.id}
                          className="flex items-center gap-2 p-2 bg-zinc-50 rounded-lg"
                        >
                          <Badge variant="outline">Secondary</Badge>
                          <span className="text-sm">{endpoint.name}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Sample Size Tab */}
          <TabsContent value="sample" className="m-0">
            <div className="max-w-xl">
              <SampleSizePanel
                endpoint={primaryEndpoint}
                result={sampleSizeResult}
                power={power}
                alpha={alpha}
                effectSize={effectSize}
                dropout={dropout}
                onPowerChange={setPower}
                onEffectChange={setEffectSize}
                onDropoutChange={setDropout}
              />
            </div>
          </TabsContent>

          {/* Protocol Tab */}
          <TabsContent value="protocol" className="m-0 space-y-4">
            {protocolSections.map((section, idx) => (
              <div key={section.id} className="border border-border/40 rounded-sm bg-background">
                <div className="px-3 py-2 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-zinc-100 text-zinc-600 text-xs font-medium flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-medium text-zinc-900">{section.title}</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs mt-1',
                          section.status === 'not_started' && 'bg-zinc-100 text-zinc-600',
                          section.status === 'ai_draft' && 'bg-blue-100 text-blue-700',
                          section.status === 'in_review' && 'bg-amber-100 text-amber-700',
                          section.status === 'approved' && 'bg-green-100 text-green-700'
                        )}
                      >
                        {section.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {section.status === 'not_started' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGenerateAIDraft(section.id)}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        RI Draft
                      </Button>
                    )}
                    <Button size="sm" variant="ghost">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};

export default StudyProtocolDesigner;
