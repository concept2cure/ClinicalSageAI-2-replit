/**
 * IVDR Clinical Evidence Tracker
 *
 * Manages the clinical performance evaluation required under
 * EU IVDR 2017/746 Annex XIII Part A (Clinical Evidence) and
 * Article 56 (Performance Studies).
 *
 * Features:
 *   - 2×2 contingency table builder (TP / FP / TN / FN)
 *   - Auto-calculated: sensitivity, specificity, PPV, NPV, accuracy
 *   - 95% confidence interval calculation (Wilson score)
 *   - Study registry linking (ClinicalTrials.gov, ISRCTN)
 *   - Performance claims documentation
 *   - Method comparison study tracking
 *   - Clinical evidence summary report generation
 *
 * @module components/regulatory/ClinicalEvidenceTracker
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Activity,
  FileText,
  Calculator,
  Plus,
  Save,
  ExternalLink,
  Users,
  BarChart3,
  AlertTriangle,
  History,
  Link2,
  X,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface EvidenceRecord {
  id: number;
  classification_id: number | null;
  validation_id: number | null;
  study_title: string;
  study_type: string;
  registry_id: string | null;
  sample_size: number | null;
  true_positive: number | null;
  false_positive: number | null;
  true_negative: number | null;
  false_negative: number | null;
  calculated_sensitivity: number | null;
  calculated_specificity: number | null;
  calculated_ppv: number | null;
  calculated_npv: number | null;
  calculated_accuracy: number | null;
  performance_claims: any;
  comparison_method: string | null;
  conclusion_text: string | null;
  population_definition: string | null;
  inclusion_criteria: string | null;
  exclusion_criteria: string | null;
  source_documents: string[] | null;
  status: string;
  device_name: string | null;
  classification: string | null;
  is_cdx: boolean | null;
  created_at: string;
}

interface ContingencyTable {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

interface CalculatedMetrics {
  sensitivity: number | null;
  specificity: number | null;
  ppv: number | null;
  npv: number | null;
  accuracy: number | null;
  prevalence: number | null;
  total: number;
  sensitivityCI: [number, number] | null;
  specificityCI: [number, number] | null;
  ppvCI: [number, number] | null;
  npvCI: [number, number] | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wilson score confidence interval for a proportion.
 * More accurate than Wald for small samples or extreme proportions.
 */
function wilsonCI(successes: number, total: number, z = 1.96): [number, number] | null {
  if (total === 0) return null;
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return [Math.max(0, (centre - margin) / denom), Math.min(1, (centre + margin) / denom)];
}

function calcMetrics(table: ContingencyTable): CalculatedMetrics {
  const { tp, fp, tn, fn } = table;
  const total = tp + fp + tn + fn;
  if (total === 0) {
    return {
      sensitivity: null,
      specificity: null,
      ppv: null,
      npv: null,
      accuracy: null,
      prevalence: null,
      total: 0,
      sensitivityCI: null,
      specificityCI: null,
      ppvCI: null,
      npvCI: null,
    };
  }

  const sensitivity = tp + fn > 0 ? tp / (tp + fn) : null;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : null;
  const ppv = tp + fp > 0 ? tp / (tp + fp) : null;
  const npv = tn + fn > 0 ? tn / (tn + fn) : null;
  const accuracy = (tp + tn) / total;
  const prevalence = (tp + fn) / total;

  return {
    sensitivity,
    specificity,
    ppv,
    npv,
    accuracy,
    prevalence,
    total,
    sensitivityCI: tp + fn > 0 ? wilsonCI(tp, tp + fn) : null,
    specificityCI: tn + fp > 0 ? wilsonCI(tn, tn + fp) : null,
    ppvCI: tp + fp > 0 ? wilsonCI(tp, tp + fp) : null,
    npvCI: tn + fn > 0 ? wilsonCI(tn, tn + fn) : null,
  };
}

function pct(val: number | null): string {
  if (val === null) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

function ciStr(ci: [number, number] | null): string {
  if (!ci) return '';
  return `(${(ci[0] * 100).toFixed(1)}% – ${(ci[1] * 100).toFixed(1)}%)`;
}

const STUDY_TYPES = [
  { value: 'prospective', label: 'Prospective Clinical Study' },
  { value: 'retrospective', label: 'Retrospective Clinical Study' },
  { value: 'method_comparison', label: 'Method Comparison Study' },
  { value: 'lot_to_lot', label: 'Lot-to-Lot Variation Study' },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function ClinicalEvidenceTracker() {
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create form
  const [newStudyTitle, setNewStudyTitle] = useState('');
  const [newStudyType, setNewStudyType] = useState('prospective');
  const [newRegistryId, setNewRegistryId] = useState('');
  const [newSampleSize, setNewSampleSize] = useState('');
  const [newPopulationDef, setNewPopulationDef] = useState('');
  const [newInclusionCriteria, setNewInclusionCriteria] = useState('');
  const [newExclusionCriteria, setNewExclusionCriteria] = useState('');
  const [newSourceDocs, setNewSourceDocs] = useState<string[]>([]);
  const [newSourceDocInput, setNewSourceDocInput] = useState('');

  // 2×2 table edit
  const [table, setTable] = useState<ContingencyTable>({ tp: 0, fp: 0, tn: 0, fn: 0 });
  const [comparisonMethod, setComparisonMethod] = useState('');
  const [conclusionText, setConclusionText] = useState('');

  // Population & evidence fields for selected study
  const [populationDef, setPopulationDef] = useState('');
  const [inclusionCriteria, setInclusionCriteria] = useState('');
  const [exclusionCriteria, setExclusionCriteria] = useState('');
  const [sourceDocUrls, setSourceDocUrls] = useState<string[]>([]);
  const [sourceDocInput, setSourceDocInput] = useState('');

  // Immutable audit history
  const [evidenceHistory, setEvidenceHistory] = useState<any[]>([]);

  const metrics = useMemo(() => calcMetrics(table), [table]);

  // ── Load records ───────────────────────────────────────────────────────
  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/ivdr/clinical-evidence');
      if (resp.ok) {
        const data = await resp.json();
        setRecords(data.evidence || []);
      }
    } catch (err) {
      console.error('Load clinical evidence failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // When selecting a record, pre-populate the 2×2 table and population fields
  const selected = records.find(r => r.id === selectedId) || null;
  useEffect(() => {
    if (selected) {
      setTable({
        tp: selected.true_positive || 0,
        fp: selected.false_positive || 0,
        tn: selected.true_negative || 0,
        fn: selected.false_negative || 0,
      });
      setComparisonMethod(selected.comparison_method || '');
      setConclusionText(selected.conclusion_text || '');
      setPopulationDef(selected.population_definition || '');
      setInclusionCriteria(selected.inclusion_criteria || '');
      setExclusionCriteria(selected.exclusion_criteria || '');
      setSourceDocUrls(
        Array.isArray(selected.source_documents)
          ? selected.source_documents
          : typeof selected.source_documents === 'string'
            ? (() => {
                try {
                  return JSON.parse(selected.source_documents as string);
                } catch {
                  return [];
                }
              })()
            : []
      );
      setSourceDocInput('');

      // Fetch immutable audit history
      fetch(`/api/ivdr/clinical-evidence/${selected.id}/history`)
        .then(r => (r.ok ? r.json() : { history: [] }))
        .then(data => setEvidenceHistory(data.history || []))
        .catch(() => setEvidenceHistory([]));
    }
  }, [selected]);

  // ── Create study ───────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newStudyTitle.trim() || !newStudyType) return;
    setSaving(true);
    try {
      const resp = await fetch('/api/ivdr/clinical-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studyTitle: newStudyTitle,
          studyType: newStudyType,
          registryId: newRegistryId || undefined,
          sampleSize: newSampleSize ? Number(newSampleSize) : undefined,
          populationDefinition: newPopulationDef || undefined,
          inclusionCriteria: newInclusionCriteria || undefined,
          exclusionCriteria: newExclusionCriteria || undefined,
          sourceDocuments: newSourceDocs.length > 0 ? newSourceDocs : undefined,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setRecords(prev => [data.evidence, ...prev]);
        setSelectedId(data.evidence.id);
        setShowCreate(false);
        setNewStudyTitle('');
        setNewStudyType('prospective');
        setNewRegistryId('');
        setNewSampleSize('');
        setNewPopulationDef('');
        setNewInclusionCriteria('');
        setNewExclusionCriteria('');
        setNewSourceDocs([]);
        setNewSourceDocInput('');
      }
    } catch (err) {
      console.error('Create study failed:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Save 2×2 results ──────────────────────────────────────────────────
  const handleSaveResults = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const resp = await fetch(`/api/ivdr/clinical-evidence/${selectedId}/results`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truePositive: table.tp,
          falsePositive: table.fp,
          trueNegative: table.tn,
          falseNegative: table.fn,
          comparisonMethod,
          conclusionText,
          populationDefinition: populationDef || undefined,
          inclusionCriteria: inclusionCriteria || undefined,
          exclusionCriteria: exclusionCriteria || undefined,
          sourceDocuments: sourceDocUrls.length > 0 ? sourceDocUrls : undefined,
        }),
      });
      if (resp.ok) {
        await loadRecords();
      }
    } catch (err) {
      console.error('Save results failed:', err);
    } finally {
      setSaving(false);
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 border-b border-border/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 text-xl">
                <Activity className="h-6 w-6" />
                Clinical Evidence Tracker
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 mt-1">
                IVDR Annex XIII Part A — Clinical performance evaluation, 2×2 contingency tables,
                and performance claims with Wilson score confidence intervals
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Study
            </Button>
          </div>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="border border-border/40 rounded-sm bg-background">
          <div className="px-3 py-2 border-b border-border/30">
            <h3 className="text-sm font-semibold text-lg">New Clinical Study</h3>
          </div>
          <div className="px-3 py-2 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Study Title *</Label>
                <Input
                  placeholder="e.g., Prospective evaluation of XYZ IVD vs reference PCR"
                  value={newStudyTitle}
                  onChange={e => setNewStudyTitle(e.target.value)}
                />
              </div>
              <div>
                <Label>Study Type *</Label>
                <Select value={newStudyType} onValueChange={setNewStudyType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STUDY_TYPES.map(st => (
                      <SelectItem key={st.value} value={st.value}>
                        {st.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Registry ID</Label>
                <Input
                  placeholder="e.g., NCT12345678 or ISRCTN12345678"
                  value={newRegistryId}
                  onChange={e => setNewRegistryId(e.target.value)}
                />
              </div>
              <div>
                <Label>Target Sample Size</Label>
                <Input
                  type="number"
                  placeholder="e.g., 500"
                  value={newSampleSize}
                  onChange={e => setNewSampleSize(e.target.value)}
                />
              </div>
            </div>

            {/* Population & Criteria — IVDR Annex XIII Part A required fields */}
            <div className="space-y-3 border-t pt-4 mt-4">
              <h4 className="text-sm font-semibold text-muted-foreground">
                Population & Eligibility (IVDR Annex XIII)
              </h4>
              <div>
                <Label>Population Definition</Label>
                <Textarea
                  className="min-h-[80px]"
                  placeholder="Define the target population, e.g., adult patients ≥18 y presenting with suspected SARS-CoV-2 infection at point-of-care facilities..."
                  value={newPopulationDef}
                  onChange={e => setNewPopulationDef(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Inclusion Criteria</Label>
                  <Textarea
                    className="min-h-[80px]"
                    placeholder="• Aged ≥18 years&#10;• Symptomatic within 7 days of onset&#10;• Willing to provide informed consent"
                    value={newInclusionCriteria}
                    onChange={e => setNewInclusionCriteria(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Exclusion Criteria</Label>
                  <Textarea
                    className="min-h-[80px]"
                    placeholder="• Immunocompromised patients on biologics&#10;• Previous participation in the same study&#10;• Unable to provide adequate specimen"
                    value={newExclusionCriteria}
                    onChange={e => setNewExclusionCriteria(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Source Documents</Label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <Input
                      placeholder="Add URL or document reference (e.g., DOI, protocol ID)"
                      value={newSourceDocInput}
                      onChange={e => setNewSourceDocInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newSourceDocInput.trim()) {
                          e.preventDefault();
                          const trimmed = newSourceDocInput.trim();
                          if (!newSourceDocs.includes(trimmed)) {
                            setNewSourceDocs(prev => [...prev, trimmed]);
                          }
                          setNewSourceDocInput('');
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!newSourceDocInput.trim()}
                    onClick={() => {
                      const trimmed = newSourceDocInput.trim();
                      if (!newSourceDocs.includes(trimmed)) {
                        setNewSourceDocs(prev => [...prev, trimmed]);
                      }
                      setNewSourceDocInput('');
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                {newSourceDocs.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {newSourceDocs.map((doc, idx) => (
                      <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                        <Link2 className="h-3 w-3" />
                        <span className="max-w-[200px] truncate">{doc}</span>
                        <button
                          className="ml-1 hover:text-red-500"
                          onClick={() => setNewSourceDocs(prev => prev.filter((_, i) => i !== idx))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating...' : 'Create Study'}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Study List */}
        <div className="border border-border/40 rounded-sm bg-background lg:col-span-1">
          <div className="px-3 py-2 border-b border-border/30">
            <h3 className="text-sm font-semibold text-lg">Studies</h3>
          </div>
          <div className="px-3 py-2">
            {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {!loading && records.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No clinical evidence studies yet. Click "New Study" to begin.
              </p>
            )}
            <div className="space-y-2">
              {records.map(r => (
                <div
                  key={r.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedId === r.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
                  }`}
                  onClick={() => setSelectedId(r.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate max-w-[200px]">
                      {r.study_title}
                    </span>
                    <Badge
                      variant={r.status === 'completed' ? 'default' : 'outline'}
                      className={r.status === 'completed' ? 'bg-green-600' : ''}
                    >
                      {r.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {STUDY_TYPES.find(s => s.value === r.study_type)?.label || r.study_type}
                  </p>
                  {r.registry_id && (
                    <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" />
                      {r.registry_id}
                    </p>
                  )}
                  {r.calculated_sensitivity != null && (
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        Se: {pct(r.calculated_sensitivity)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Sp: {pct(r.calculated_specificity)}
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Study Detail */}
        <div className="border border-border/40 rounded-sm bg-background lg:col-span-2">
          <div className="px-3 py-2 border-b border-border/30">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-lg">
                {selected ? selected.study_title : 'Select a Study'}
              </h3>
              {selected && (
                <Button onClick={handleSaveResults} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Results'}
                </Button>
              )}
            </div>
          </div>
          <div className="px-3 py-2">
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                Select a study from the list to enter 2×2 contingency table results.
              </p>
            ) : (
              <Tabs defaultValue="contingency">
                <TabsList>
                  <TabsTrigger value="contingency">
                    <Calculator className="h-3 w-3 mr-1" />
                    2×2 Table
                  </TabsTrigger>
                  <TabsTrigger value="metrics">
                    <BarChart3 className="h-3 w-3 mr-1" />
                    Performance Metrics
                  </TabsTrigger>
                  <TabsTrigger value="details">
                    <FileText className="h-3 w-3 mr-1" />
                    Study Details
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <History className="h-3 w-3 mr-1" />
                    Change History
                  </TabsTrigger>
                </TabsList>

                {/* 2×2 Contingency Table */}
                <TabsContent value="contingency" className="mt-4 space-y-6">
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Calculator className="h-4 w-4" />
                      2×2 Contingency Table
                    </h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Enter the number of patients/samples in each cell. Performance metrics are
                      calculated automatically using Wilson score 95% CI.
                    </p>

                    <div className="overflow-x-auto">
                      <table className="border-collapse border border-gray-300 mx-auto">
                        <thead>
                          <tr>
                            <th className="border border-gray-300 p-3 bg-muted/50" />
                            <th
                              className="border border-gray-300 p-3 bg-muted/50 font-semibold text-center"
                              colSpan={2}
                            >
                              Reference Standard
                            </th>
                          </tr>
                          <tr>
                            <th className="border border-gray-300 p-3 bg-muted/50 font-semibold">
                              Index Test
                            </th>
                            <th className="border border-gray-300 p-3 bg-green-50 font-medium text-center w-[160px]">
                              Condition +
                            </th>
                            <th className="border border-gray-300 p-3 bg-red-50 font-medium text-center w-[160px]">
                              Condition −
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="border border-gray-300 p-3 bg-green-50 font-medium">
                              Test +
                            </td>
                            <td className="border border-gray-300 p-2 bg-green-50/50">
                              <div className="text-center">
                                <Label className="text-xs text-green-700 font-bold">
                                  True Positive (TP)
                                </Label>
                                <Input
                                  type="number"
                                  min={0}
                                  className="mx-auto w-24 text-center mt-1"
                                  value={table.tp || ''}
                                  onChange={e =>
                                    setTable(p => ({
                                      ...p,
                                      tp: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                    }))
                                  }
                                />
                              </div>
                            </td>
                            <td className="border border-gray-300 p-2 bg-red-50/30">
                              <div className="text-center">
                                <Label className="text-xs text-red-700 font-bold">
                                  False Positive (FP)
                                </Label>
                                <Input
                                  type="number"
                                  min={0}
                                  className="mx-auto w-24 text-center mt-1"
                                  value={table.fp || ''}
                                  onChange={e =>
                                    setTable(p => ({
                                      ...p,
                                      fp: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                    }))
                                  }
                                />
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td className="border border-gray-300 p-3 bg-red-50 font-medium">
                              Test −
                            </td>
                            <td className="border border-gray-300 p-2 bg-red-50/30">
                              <div className="text-center">
                                <Label className="text-xs text-red-700 font-bold">
                                  False Negative (FN)
                                </Label>
                                <Input
                                  type="number"
                                  min={0}
                                  className="mx-auto w-24 text-center mt-1"
                                  value={table.fn || ''}
                                  onChange={e =>
                                    setTable(p => ({
                                      ...p,
                                      fn: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                    }))
                                  }
                                />
                              </div>
                            </td>
                            <td className="border border-gray-300 p-2 bg-green-50/50">
                              <div className="text-center">
                                <Label className="text-xs text-green-700 font-bold">
                                  True Negative (TN)
                                </Label>
                                <Input
                                  type="number"
                                  min={0}
                                  className="mx-auto w-24 text-center mt-1"
                                  value={table.tn || ''}
                                  onChange={e =>
                                    setTable(p => ({
                                      ...p,
                                      tn: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                    }))
                                  }
                                />
                              </div>
                            </td>
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr>
                            <td className="border border-gray-300 p-2 bg-muted/50 font-medium text-sm">
                              Total
                            </td>
                            <td className="border border-gray-300 p-2 bg-muted/50 text-center font-mono text-sm">
                              {table.tp + table.fn}
                            </td>
                            <td className="border border-gray-300 p-2 bg-muted/50 text-center font-mono text-sm">
                              {table.fp + table.tn}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="text-center mt-3 text-sm text-muted-foreground">
                      Total subjects: <strong>{metrics.total}</strong>
                      {selected.sample_size && (
                        <span>
                          {' '}
                          / Target: <strong>{selected.sample_size}</strong> (
                          {Math.round((metrics.total / selected.sample_size) * 100)}% enrolled)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick metrics preview */}
                  {metrics.total > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {[
                        {
                          label: 'Sensitivity',
                          value: metrics.sensitivity,
                          ci: metrics.sensitivityCI,
                        },
                        {
                          label: 'Specificity',
                          value: metrics.specificity,
                          ci: metrics.specificityCI,
                        },
                        { label: 'PPV', value: metrics.ppv, ci: metrics.ppvCI },
                        { label: 'NPV', value: metrics.npv, ci: metrics.npvCI },
                        { label: 'Accuracy', value: metrics.accuracy, ci: null },
                      ].map(m => (
                        <div
                          key={m.label}
                          className="p-3 rounded-lg border bg-muted/20 text-center"
                        >
                          <p className="text-xs text-muted-foreground">{m.label}</p>
                          <p className="text-xl font-bold mt-1">{pct(m.value)}</p>
                          {m.ci && <p className="text-xs text-muted-foreground">{ciStr(m.ci)}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Performance Metrics Detail */}
                <TabsContent value="metrics" className="mt-4 space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Diagnostic Performance Summary
                  </h4>

                  {metrics.total === 0 ? (
                    <div className="p-4 border rounded-lg bg-muted/20 text-center text-sm text-muted-foreground">
                      <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-amber-500" />
                      Enter 2×2 contingency table data to calculate performance metrics.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Metric</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                          <TableHead className="text-right">95% CI (Wilson)</TableHead>
                          <TableHead>Formula</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">Clinical Sensitivity</TableCell>
                          <TableCell className="text-right font-mono">
                            {pct(metrics.sensitivity)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">
                            {ciStr(metrics.sensitivityCI)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            TP / (TP + FN) = {table.tp} / {table.tp + table.fn}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Clinical Specificity</TableCell>
                          <TableCell className="text-right font-mono">
                            {pct(metrics.specificity)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">
                            {ciStr(metrics.specificityCI)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            TN / (TN + FP) = {table.tn} / {table.tn + table.fp}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">
                            Positive Predictive Value (PPV)
                          </TableCell>
                          <TableCell className="text-right font-mono">{pct(metrics.ppv)}</TableCell>
                          <TableCell className="text-right text-xs font-mono">
                            {ciStr(metrics.ppvCI)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            TP / (TP + FP) = {table.tp} / {table.tp + table.fp}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">
                            Negative Predictive Value (NPV)
                          </TableCell>
                          <TableCell className="text-right font-mono">{pct(metrics.npv)}</TableCell>
                          <TableCell className="text-right text-xs font-mono">
                            {ciStr(metrics.npvCI)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            TN / (TN + FN) = {table.tn} / {table.tn + table.fn}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Diagnostic Accuracy</TableCell>
                          <TableCell className="text-right font-mono">
                            {pct(metrics.accuracy)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">—</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            (TP + TN) / Total = {table.tp + table.tn} / {metrics.total}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Apparent Prevalence</TableCell>
                          <TableCell className="text-right font-mono">
                            {pct(metrics.prevalence)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">—</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            (TP + FN) / Total = {table.tp + table.fn} / {metrics.total}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                {/* Study Details */}
                <TabsContent value="details" className="mt-4 space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Study Details
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3 p-4 border rounded-lg">
                      <div>
                        <Label className="text-xs text-muted-foreground">Study Type</Label>
                        <p className="font-medium">
                          {STUDY_TYPES.find(s => s.value === selected.study_type)?.label ||
                            selected.study_type}
                        </p>
                      </div>
                      {selected.registry_id && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Registry ID</Label>
                          <p className="font-medium flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />
                            {selected.registry_id}
                          </p>
                        </div>
                      )}
                      {selected.sample_size && (
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Target Sample Size
                          </Label>
                          <p className="font-medium">{selected.sample_size}</p>
                        </div>
                      )}
                      {selected.device_name && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Device</Label>
                          <p className="font-medium">{selected.device_name}</p>
                        </div>
                      )}
                      {selected.classification && (
                        <div>
                          <Label className="text-xs text-muted-foreground">IVDR Class</Label>
                          <Badge variant="outline">Class {selected.classification}</Badge>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label>Comparison / Reference Method</Label>
                        <Input
                          placeholder="e.g., Gold-standard RT-PCR (Cepheid GeneXpert)"
                          value={comparisonMethod}
                          onChange={e => setComparisonMethod(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Conclusion</Label>
                        <Textarea
                          className="min-h-[120px]"
                          placeholder="Summarize the clinical performance findings and whether the device meets the claimed performance characteristics..."
                          value={conclusionText}
                          onChange={e => setConclusionText(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Population & Eligibility — IVDR Annex XIII Part A */}
                  <div className="border-t pt-4 space-y-4">
                    <h4 className="font-semibold flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4" />
                      Population & Eligibility (IVDR Annex XIII)
                    </h4>
                    <div>
                      <Label>Population Definition</Label>
                      <Textarea
                        className="min-h-[80px]"
                        placeholder="Define the target population for this study..."
                        value={populationDef}
                        onChange={e => setPopulationDef(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Inclusion Criteria</Label>
                        <Textarea
                          className="min-h-[80px]"
                          placeholder="List the inclusion criteria..."
                          value={inclusionCriteria}
                          onChange={e => setInclusionCriteria(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Exclusion Criteria</Label>
                        <Textarea
                          className="min-h-[80px]"
                          placeholder="List the exclusion criteria..."
                          value={exclusionCriteria}
                          onChange={e => setExclusionCriteria(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Source Documents */}
                  <div className="border-t pt-4 space-y-3">
                    <h4 className="font-semibold flex items-center gap-2 text-sm">
                      <Link2 className="h-4 w-4" />
                      Source Documents
                    </h4>
                    <div className="flex gap-2 items-center">
                      <div className="flex-1">
                        <Input
                          placeholder="Add URL or document reference"
                          value={sourceDocInput}
                          onChange={e => setSourceDocInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && sourceDocInput.trim()) {
                              e.preventDefault();
                              setSourceDocUrls(prev => [...prev, sourceDocInput.trim()]);
                              setSourceDocInput('');
                            }
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!sourceDocInput.trim()}
                        onClick={() => {
                          setSourceDocUrls(prev => [...prev, sourceDocInput.trim()]);
                          setSourceDocInput('');
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    {sourceDocUrls.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {sourceDocUrls.map((doc, idx) => (
                          <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                            <Link2 className="h-3 w-3" />
                            <span className="max-w-[250px] truncate">{doc}</span>
                            <button
                              className="ml-1 hover:text-red-500"
                              onClick={() =>
                                setSourceDocUrls(prev => prev.filter((_, i) => i !== idx))
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No source documents linked yet.
                      </p>
                    )}
                  </div>
                </TabsContent>

                {/* Change History (Immutable Audit Trail) */}
                <TabsContent value="history" className="mt-4 space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Immutable Change History
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Every result update is append-only. Records cannot be modified or deleted (IVDR
                    Annex XIII traceability requirement).
                  </p>
                  {evidenceHistory.length === 0 ? (
                    <div className="p-4 border rounded-lg bg-muted/20 text-center text-sm text-muted-foreground">
                      No change history yet. Save results to create the first audit record.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {evidenceHistory.map((entry: any, idx: number) => {
                        let parsedResults: any = {};
                        try {
                          parsedResults =
                            typeof entry.results === 'string'
                              ? JSON.parse(entry.results)
                              : entry.results || {};
                        } catch {
                          /* ignore parse error */
                        }

                        return (
                          <div key={entry.id || idx} className="p-3 border rounded-lg bg-muted/10">
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="outline" className="text-xs">
                                Rev #{evidenceHistory.length - idx}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {entry.updated_by || 'system'} —{' '}
                                {entry.created_at
                                  ? new Date(entry.created_at).toLocaleString()
                                  : '—'}
                              </span>
                            </div>
                            {entry.reason && (
                              <p className="text-xs text-muted-foreground italic mb-1">
                                Reason: {entry.reason}
                              </p>
                            )}
                            {parsedResults.calculatedMetrics && (
                              <div className="flex gap-3 text-xs font-mono mt-1">
                                <span>Se: {pct(parsedResults.calculatedMetrics.sensitivity)}</span>
                                <span>Sp: {pct(parsedResults.calculatedMetrics.specificity)}</span>
                                <span>PPV: {pct(parsedResults.calculatedMetrics.ppv)}</span>
                                <span>NPV: {pct(parsedResults.calculatedMetrics.npv)}</span>
                                <span>N: {parsedResults.calculatedMetrics.total ?? '—'}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
