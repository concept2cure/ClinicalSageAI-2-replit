/**
 * CDx (Companion Diagnostic) Workflow Manager
 *
 * Implements the specialized regulatory workflow for Companion Diagnostics
 * under EU IVDR 2017/746 Article 2(7) and Annex IX Chapter II.
 *
 * CDx devices are IVDs essential for the safe and effective use of a
 * corresponding medicinal product. They require:
 *   - Parallel/coordinated development with the therapeutic product
 *   - Class C classification minimum (Annex VIII Rule 3a)
 *   - Notified Body consultation with EMA-competent authority
 *   - Joint labelling considerations
 *   - Co-development timeline tracking
 *
 * Workflow stages:
 *   1. Initiation — IVD/drug pairing, biomarker definition
 *   2. Analytical Validation — analyte-specific validation
 *   3. Clinical Validation — bridging to therapeutic study
 *   4. Notified Body Review — EU NB + Reference Laboratory
 *   5. EU Declaration — CE mark, DoC, EUDAMED registration
 *   6. Post-Market — PSUR, PMCF, vigilance
 *
 * @module components/regulatory/CDxWorkflow
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { LIFECYCLE } from '../ui/enterprise';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { LoadingState } from '@/components/ui/statesV2';

import {
  Pill,
  ArrowRight,
  Plus,
  CheckCircle2,
  Clock,
  Building2,
  FileCheck,
  AlertTriangle,
  Target,
  Dna,
  FlaskConical,
  Stethoscope,
  Eye,
  History,
  X,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface CDxWorkflowRecord {
  id: number;
  classification_id: number | null;
  medicinal_product_name: string;
  active_substance: string | null;
  therapeutic_indication: string | null;
  biomarker: string;
  treatment_decision: string | null;
  regulatory_reference: string | null;
  notified_body_id: string | null;
  intended_use_statement: string | null;
  biomarker_type: string | null;
  clinical_evidence_ids: number[] | null;
  status: CDxStatus;
  device_name: string | null;
  classification: string | null;
  organization_id: number;
  created_at: string;
  updated_at: string | null;
}

type CDxStatus =
  | 'initiation'
  | 'analytical_validation'
  | 'clinical_validation'
  | 'notified_body_review'
  | 'eu_declaration'
  | 'post_market';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const CDX_STAGES: Array<{
  id: CDxStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  regulatoryRef: string;
}> = [
  {
    id: 'initiation',
    label: 'Initiation',
    icon: Target,
    description:
      'Define the IVD/drug pairing, biomarker, and treatment decision. Establish co-development plan with the marketing authorisation holder (MAH).',
    regulatoryRef: 'IVDR Art. 2(7), Art. 56(1)',
  },
  {
    id: 'analytical_validation',
    label: 'Analytical Validation',
    icon: FlaskConical,
    description:
      'Complete analytical performance evaluation of the CDx assay for the target biomarker. LoD, precision, interference, stability per CLSI standards.',
    regulatoryRef: 'IVDR Annex I GSPR 9.1(a), Common Specifications',
  },
  {
    id: 'clinical_validation',
    label: 'Clinical Validation',
    icon: Stethoscope,
    description:
      'Clinical performance evaluation bridging IVD results to therapeutic outcomes. 2×2 contingency tables, clinical utility, pivotal trial alignment.',
    regulatoryRef: 'IVDR Annex XIII Part A, Art. 56(2)',
  },
  {
    id: 'notified_body_review',
    label: 'Notified Body Review',
    icon: Building2,
    description:
      'Submit technical documentation to Notified Body. For Class D CDx, EU Reference Laboratory batch testing. NB consults competent authority of MAH.',
    regulatoryRef: 'IVDR Annex IX Ch. I & III, Art. 48(3)',
  },
  {
    id: 'eu_declaration',
    label: 'EU Declaration',
    icon: FileCheck,
    description:
      'Issue EU Declaration of Conformity, affix CE mark with NB number. Register in EUDAMED. Coordinate labelling with MAH product information.',
    regulatoryRef: 'IVDR Art. 17, Art. 18, Art. 29',
  },
  {
    id: 'post_market',
    label: 'Post-Market Surveillance',
    icon: Eye,
    description:
      'Active PMCF, annual PSUR (Class C), vigilance reporting. Monitor for changes in therapeutic product that may affect CDx performance.',
    regulatoryRef: 'IVDR Art. 78-82, Annex XIII Part B',
  },
];

const STATUS_COLORS: Record<CDxStatus, string> = {
  initiation: `${LIFECYCLE.not_started.bg} ${LIFECYCLE.not_started.text}`,
  analytical_validation: `${LIFECYCLE.draft.bg} ${LIFECYCLE.draft.text}`,
  clinical_validation: `${LIFECYCLE.in_review.bg} ${LIFECYCLE.in_review.text}`,
  notified_body_review: `${LIFECYCLE.in_review.bg} ${LIFECYCLE.in_review.text}`,
  eu_declaration: `${LIFECYCLE.approved.bg} ${LIFECYCLE.approved.text}`,
  post_market: `${LIFECYCLE.published.bg} ${LIFECYCLE.published.text}`,
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface CDxCreateForm {
  product: string;
  substance: string;
  indication: string;
  biomarker: string;
  decision: string;
  regRef: string;
  nb: string;
  intendedUse: string;
  biomarkerType: string;
  evidenceInput: string;
}

export default function CDxWorkflow() {
  const [workflows, setWorkflows] = useState<CDxWorkflowRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const { toast } = useToast();

  // Create form — canonical react-hook-form pattern
  const createForm = useForm<CDxCreateForm>({
    defaultValues: {
      product: '', substance: '', indication: '', biomarker: '',
      decision: '', regRef: '', nb: '', intendedUse: '', biomarkerType: '',
      evidenceInput: '',
    },
  });

  // Status update
  const [advanceNotes, setAdvanceNotes] = useState('');

  // Immutable transition history
  const [workflowHistory, setWorkflowHistory] = useState<any[]>([]);

  // ── Load workflows ─────────────────────────────────────────────────────
  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await apiRequest('GET', '/api/ivdr/cdx-workflows');
      const data = await resp.json();
      setWorkflows(data.workflows || []);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load CDx workflows', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const selected = workflows.find(w => w.id === selectedId) || null;

  // Fetch workflow transition history on selection
  useEffect(() => {
    if (selected) {
      apiRequest('GET', `/api/ivdr/cdx-workflows/${selected.id}/history`)
        .then(r => r.json())
        .then(data => setWorkflowHistory(data.history || []))
        .catch(() => {
          setWorkflowHistory([]);
          toast({ title: 'Warning', description: 'Could not load workflow history', variant: 'destructive' });
        });
    }
  }, [selected, toast]);

  // ── Create workflow ────────────────────────────────────────────────────
  const handleCreate = async () => {
    const vals = createForm.getValues();
    if (!vals.product.trim() || !vals.biomarker.trim()) return;
    setSaving(true);
    try {
      const resp = await apiRequest('POST', '/api/ivdr/cdx-workflows', {
          medicinalProductName: vals.product,
          activeSubstance: vals.substance || undefined,
          therapeuticIndication: vals.indication || undefined,
          biomarker: vals.biomarker,
          treatmentDecision: vals.decision || undefined,
          regulatoryReference: vals.regRef || undefined,
          notifiedBodyId: vals.nb || undefined,
          intendedUseStatement: vals.intendedUse || undefined,
          biomarkerType: vals.biomarkerType || undefined,
          clinicalEvidenceIds:
            evidenceIds.length > 0
              ? evidenceIds.map(Number).filter(n => !isNaN(n))
              : undefined,
        });
      const data = await resp.json();
      setWorkflows(prev => [data.workflow, ...prev]);
      setSelectedId(data.workflow.id);
      setShowCreate(false);
      createForm.reset();
      setEvidenceIds([]);
      toast({ title: 'CDx Pairing Created', description: `Created "${vals.product}" pairing.` });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to create CDx workflow', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Advance status ─────────────────────────────────────────────────────
  const handleAdvanceStatus = async (newStatus: CDxStatus) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const resp = await apiRequest('PUT', `/api/ivdr/cdx-workflows/${selectedId}/status`, {
          status: newStatus,
          notes: advanceNotes || undefined,
        });
      if (resp.ok) {
        setAdvanceNotes('');
        await loadWorkflows();
        toast({ title: 'Status Updated', description: `Advanced to ${newStatus.replace(/_/g, ' ')}` });
      }
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to advance status', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Current stage index ────────────────────────────────────────────────
  const currentStageIdx = selected ? CDX_STAGES.findIndex(s => s.id === selected.status) : -1;
  const stageProgress =
    currentStageIdx >= 0 ? Math.round(((currentStageIdx + 1) / CDX_STAGES.length) * 100) : 0;

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-stone-200 rounded-md">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-xl font-semibold">
                <Pill className="h-6 w-6" />
                Companion Diagnostic (CDx) Workflow
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                IVDR Article 2(7) — Manage IVD/therapeutic product co-development through the full
                CDx regulatory lifecycle (initiation → post-market)
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New CDx Pairing
            </Button>
          </div>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="border border-stone-200 rounded-md">
          <div className="px-4 py-3 border-b border-stone-200">
            <h3 className="text-lg font-semibold">New CDx Pairing</h3>
            <p className="text-sm text-muted-foreground">
              Define the IVD — Medicinal Product pairing for companion diagnostic co-development
            </p>
          </div>
          <div className="px-4 py-3 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Medicinal Product Name *</Label>
                <Input
                  placeholder="e.g., Keytruda® (pembrolizumab)"
                  {...createForm.register('product')}
                />
              </div>
              <div>
                <Label>Active Substance</Label>
                <Input
                  placeholder="e.g., Pembrolizumab"
                  {...createForm.register('substance')}
                />
              </div>
              <div>
                <Label>Therapeutic Indication</Label>
                <Input
                  placeholder="e.g., Non-small cell lung cancer (NSCLC)"
                  {...createForm.register('indication')}
                />
              </div>
              <div>
                <Label>Biomarker *</Label>
                <Input
                  placeholder="e.g., PD-L1 (22C3 antibody, TPS ≥50%)"
                  {...createForm.register('biomarker')}
                />
              </div>
              <div>
                <Label>Treatment Decision</Label>
                <Input
                  placeholder="e.g., Patient selection for first-line monotherapy"
                  {...createForm.register('decision')}
                />
              </div>
              <div>
                <Label>Regulatory Reference</Label>
                <Input
                  placeholder="e.g., EMA/CHMP/BWP/187338/2014"
                  {...createForm.register('regRef')}
                />
              </div>
              <div>
                <Label>Notified Body ID</Label>
                <Input
                  placeholder="e.g., NB 0123 (TÜV SÜD)"
                  {...createForm.register('nb')}
                />
              </div>
              <div>
                <Label>Biomarker Type</Label>
                <Select value={createForm.watch('biomarkerType')} onValueChange={(v) => createForm.setValue('biomarkerType', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select biomarker type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="genomic">Genomic (DNA mutation / amplification)</SelectItem>
                    <SelectItem value="proteomic">Proteomic (protein expression / IHC)</SelectItem>
                    <SelectItem value="transcriptomic">
                      Transcriptomic (RNA / gene expression)
                    </SelectItem>
                    <SelectItem value="metabolomic">Metabolomic</SelectItem>
                    <SelectItem value="epigenetic">Epigenetic (methylation)</SelectItem>
                    <SelectItem value="circulating">Circulating (ctDNA / liquid biopsy)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Intended Use & Clinical Evidence Links — IVDR Art. 2(7) */}
            <div className="space-y-3 border-t pt-4 mt-4">
              <h4 className="text-sm font-semibold text-muted-foreground">
                Intended Use & Evidence Linking (IVDR Art. 2(7))
              </h4>
              <div>
                <Label>Intended Use Statement</Label>
                <Textarea
                  className="min-h-[80px]"
                  placeholder="e.g., This in vitro diagnostic device is intended for the qualitative detection of PD-L1 protein expression in FFPE tissue specimens from patients with NSCLC, as an aid in identifying patients for treatment with pembrolizumab..."
                  {...createForm.register('intendedUse')}
                />
              </div>
              <div>
                <Label>Link Clinical Evidence Studies</Label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <Input
                      placeholder="Enter clinical evidence study ID"
                      type="number"
                      {...createForm.register('evidenceInput')}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && createForm.getValues('evidenceInput').trim()) {
                          e.preventDefault();
                          if (!evidenceIds.includes(createForm.getValues('evidenceInput').trim())) {
                            setEvidenceIds(prev => [...prev, createForm.getValues('evidenceInput').trim()]);
                          }
                          createForm.setValue('evidenceInput', '');
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!createForm.getValues('evidenceInput').trim()}
                    onClick={() => {
                      if (!evidenceIds.includes(createForm.getValues('evidenceInput').trim())) {
                        setEvidenceIds(prev => [...prev, createForm.getValues('evidenceInput').trim()]);
                      }
                      createForm.setValue('evidenceInput', '');
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Link
                  </Button>
                </div>
                {evidenceIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {evidenceIds.map((eid, idx) => (
                      <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                        Study #{eid}
                        <button
                          className="ml-1 hover:text-red-500"
                          onClick={() =>
                            setEvidenceIds(prev => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Link to Clinical Evidence Tracker study IDs to establish traceability between CDx
                  and clinical performance data.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating...' : 'Create CDx Pairing'}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workflow List */}
        <div className="border border-stone-200 rounded-md lg:col-span-1">
          <div className="px-4 py-3 border-b border-stone-200">
            <h3 className="text-lg font-semibold">CDx Pairings</h3>
          </div>
          <div className="px-4 py-3">
            {loading && <LoadingState message="Loading CDx workflows..." size="sm" testId="cdx-loading" />}
            {!loading && workflows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No CDx pairings yet. Click "New CDx Pairing" to begin.
              </p>
            )}
            <div className="space-y-2">
              {workflows.map(w => (
                <div
                  key={w.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedId === w.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
                  }`}
                  onClick={() => setSelectedId(w.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate max-w-[180px]">
                      {w.medicinal_product_name}
                    </span>
                    <Badge className={STATUS_COLORS[w.status] || ''}>
                      {CDX_STAGES.find(s => s.id === w.status)?.label || w.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Dna className="h-3 w-3" />
                    {w.biomarker}
                  </p>
                  {w.device_name && (
                    <p className="text-xs text-muted-foreground mt-1">
                      IVD: {w.device_name}
                      {w.classification && (
                        <Badge variant="outline" className="ml-1 text-xs">
                          Class {w.classification}
                        </Badge>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Workflow Detail */}
        <div className="border border-stone-200 rounded-md lg:col-span-2">
          <div className="px-4 py-3 border-b border-stone-200">
            <h3 className="text-lg font-semibold">
              {selected ? selected.medicinal_product_name : 'Select a CDx Pairing'}
            </h3>
            {selected && (
              <p className="text-sm text-muted-foreground">
                Biomarker: {selected.biomarker}
                {selected.therapeutic_indication &&
                  ` | Indication: ${selected.therapeutic_indication}`}
              </p>
            )}
          </div>
          <div className="px-4 py-3">
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                Select a CDx pairing from the list to view the co-development workflow.
              </p>
            ) : (
              <div className="space-y-6">
                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Workflow Progress</span>
                    <span className="text-sm text-muted-foreground">{stageProgress}%</span>
                  </div>
                  <Progress value={stageProgress} className="h-2" />
                </div>

                {/* Workflow Pipeline */}
                <div className="space-y-3">
                  {CDX_STAGES.map((stage, idx) => {
                    const Icon = stage.icon;
                    const isCurrent = stage.id === selected.status;
                    const isCompleted = idx < currentStageIdx;
                    const isNext = idx === currentStageIdx + 1;

                    return (
                      <div
                        key={stage.id}
                        className={`p-4 rounded-lg border transition-all ${
                          isCurrent
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : isCompleted
                              ? 'border-green-200 bg-green-50/50'
                              : 'border-muted/50 bg-muted/10 opacity-60'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 rounded-full p-1.5 ${
                              isCurrent
                                ? 'bg-primary text-primary-foreground'
                                : isCompleted
                                  ? 'bg-green-600 text-white'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : isCurrent ? (
                              <Clock className="h-4 w-4" />
                            ) : (
                              <Icon className="h-4 w-4" />
                            )}
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold text-sm">
                                Stage {idx + 1}: {stage.label}
                              </h4>
                              {isCurrent && (
                                <Badge className="bg-primary text-primary-foreground text-xs">
                                  CURRENT
                                </Badge>
                              )}
                              {isCompleted && (
                                <Badge className="bg-green-600 text-white text-xs">COMPLETED</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {stage.description}
                            </p>
                            <p className="text-xs font-mono text-muted-foreground mt-1">
                              Ref: {stage.regulatoryRef}
                            </p>

                            {/* Advance button for current stage */}
                            {isCurrent && isNext === false && idx < CDX_STAGES.length - 1 && (
                              <div className="mt-3 space-y-2">
                                <Textarea
                                  className="text-sm min-h-[60px]"
                                  placeholder="Notes for advancing to next stage (optional)..."
                                  value={advanceNotes}
                                  onChange={e => setAdvanceNotes(e.target.value)}
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleAdvanceStatus(CDX_STAGES[idx + 1].id)}
                                  disabled={saving}
                                >
                                  <ArrowRight className="h-3 w-3 mr-1" />
                                  {saving
                                    ? 'Advancing...'
                                    : `Advance to ${CDX_STAGES[idx + 1].label}`}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* CDx Details Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4 border-t">
                  {[
                    { label: 'Active Substance', value: selected.active_substance },
                    { label: 'Therapeutic Indication', value: selected.therapeutic_indication },
                    { label: 'Treatment Decision', value: selected.treatment_decision },
                    { label: 'Regulatory Reference', value: selected.regulatory_reference },
                    { label: 'Notified Body', value: selected.notified_body_id },
                    { label: 'Biomarker Type', value: selected.biomarker_type },
                    {
                      label: 'Created',
                      value: new Date(selected.created_at).toLocaleDateString(),
                    },
                  ]
                    .filter(item => item.value)
                    .map(item => (
                      <div key={item.label} className="p-3 rounded-lg border bg-muted/20">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {item.label}
                        </p>
                        <p className="text-sm mt-1">{item.value}</p>
                      </div>
                    ))}
                </div>

                {/* Intended Use Statement */}
                {selected.intended_use_statement && (
                  <div className="p-4 rounded-lg border bg-blue-50/50 border-blue-200 space-y-1">
                    <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
                      Intended Use Statement
                    </p>
                    <p className="text-sm text-blue-900">{selected.intended_use_statement}</p>
                  </div>
                )}

                {/* Linked Clinical Evidence */}
                {selected.clinical_evidence_ids &&
                  Array.isArray(selected.clinical_evidence_ids) &&
                  selected.clinical_evidence_ids.length > 0 && (
                    <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Linked Clinical Evidence Studies
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selected.clinical_evidence_ids.map((eid: number, idx: number) => (
                          <Badge key={idx} variant="outline">
                            Study #{eid}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Status Transition History */}
                <div className="pt-4 border-t space-y-3">
                  <h4 className="font-semibold flex items-center gap-2 text-sm">
                    <History className="h-4 w-4" />
                    Status Transition History
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Immutable audit trail of all status transitions (IVDR traceability).
                  </p>
                  {workflowHistory.length === 0 ? (
                    <div className="p-4 border rounded-lg bg-muted/20 text-center text-sm text-muted-foreground">
                      No transition history yet. Advance the workflow to create audit records.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {workflowHistory.map((entry: any, idx: number) => (
                        <div
                          key={entry.id || idx}
                          className="p-3 border rounded-lg bg-muted/10 flex items-start gap-3"
                        >
                          <div className="mt-0.5">
                            <Badge
                              className={STATUS_COLORS[entry.status as CDxStatus] || 'bg-muted'}
                            >
                              {CDX_STAGES.find(s => s.id === entry.status)?.label || entry.status}
                            </Badge>
                          </div>
                          <div className="flex-1">
                            {entry.notes && <p className="text-sm">{entry.notes}</p>}
                            <p className="text-xs text-muted-foreground mt-1">
                              {entry.updated_by || 'system'} —{' '}
                              {entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* CDx-specific regulatory note */}
                <div className="p-4 rounded-lg border bg-amber-50 border-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-semibold text-amber-800">CDx Regulatory Note</p>
                      <p className="text-amber-700 mt-1">
                        Under IVDR Article 2(7), companion diagnostics are classified as{' '}
                        <strong>Class C minimum</strong> (Rule 3a). The Notified Body must consult
                        the competent authority or EMA regarding the therapeutic product before
                        issuing a certificate. Joint labelling review with the MAH is required per
                        Article 7 of Regulation (EU) No 726/2004.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
