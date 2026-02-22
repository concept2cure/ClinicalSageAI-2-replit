/**
 * IVDR Analytical Validation Tracker
 *
 * Manages the full analytical performance evaluation required under
 * EU IVDR 2017/746 Annex I GSPR 9.1(a) and Common Specifications
 * (EU 2022/1107 for Class D).
 *
 * Tracked parameters:
 *   - LoD  (Limit of Detection) — CLSI EP17-A2
 *   - LoQ  (Limit of Quantitation) — CLSI EP17-A2
 *   - Precision: repeatability (within-run), between-run, between-day,
 *     reproducibility — ISO 5725 / CLSI EP05-A3
 *   - Interference studies — CLSI EP07-A3
 *   - Stability: real-time, accelerated, freeze-thaw, in-use — ICH Q5C adapted
 *   - Diagnostic sensitivity / specificity
 *   - Linearity & measuring range — CLSI EP06-A
 *   - Accuracy / bias — CLSI EP09-A3
 *   - Carry-over — CLSI EP10-A3
 *   - Hook effect (high-dose hook)
 *   - Reference range — CLSI EP28-A3c
 *
 * @module components/regulatory/AnalyticalValidationTracker
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  FlaskConical,
  Target,
  BarChart3,
  Clock,
  ShieldCheck,
  Plus,
  Save,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Beaker,
  TrendingUp,
  Thermometer,
  RefreshCw,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ValidationRecord {
  id: number;
  classification_id: number | null;
  device_name: string;
  analyte_name: string;
  validation_type: string;
  status: string;
  lod: number | null;
  loq: number | null;
  precision_cv: number | null;
  within_run_cv: number | null;
  between_run_cv: number | null;
  between_day_cv: number | null;
  reproducibility_cv: number | null;
  interference_study: any;
  stability: any;
  sensitivity: number | null;
  specificity: number | null;
  linearity: any;
  accuracy: number | null;
  carry_over: number | null;
  hook_effect: any;
  reference_range: any;
  classification?: string;
  is_cdx?: boolean;
  created_at: string;
}

interface ParameterEntry {
  key: string;
  label: string;
  value: string;
  unit: string;
  acceptanceCriteria: string;
  status: 'pass' | 'fail' | 'pending';
  standard: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const PARAMETER_GROUPS = [
  {
    id: 'detection',
    label: 'Detection Limits',
    icon: Target,
    params: ['lod', 'loq'],
  },
  {
    id: 'precision',
    label: 'Precision',
    icon: BarChart3,
    params: ['withinRunCV', 'betweenRunCV', 'betweenDayCV', 'reproducibilityCV', 'precisionCV'],
  },
  {
    id: 'performance',
    label: 'Diagnostic Performance',
    icon: ShieldCheck,
    params: ['sensitivity', 'specificity', 'accuracy'],
  },
  {
    id: 'linearity',
    label: 'Linearity & Range',
    icon: TrendingUp,
    params: ['linearityLow', 'linearityHigh', 'linearityR2'],
  },
  {
    id: 'interference',
    label: 'Interference',
    icon: Beaker,
    params: ['interferenceSubstances'],
  },
  {
    id: 'stability',
    label: 'Stability',
    icon: Thermometer,
    params: ['stabilityRealTime', 'stabilityAccelerated', 'stabilityFreezeThaw'],
  },
  {
    id: 'other',
    label: 'Other',
    icon: FlaskConical,
    params: ['carryOver', 'hookEffect'],
  },
] as const;

const PARAM_METADATA: Record<
  string,
  { label: string; unit: string; standard: string; criteria: string }
> = {
  lod: {
    label: 'Limit of Detection (LoD)',
    unit: 'copies/mL or ng/mL',
    standard: 'CLSI EP17-A2',
    criteria: 'Should detect ≥95% of true positive samples at stated concentration',
  },
  loq: {
    label: 'Limit of Quantitation (LoQ)',
    unit: 'copies/mL or ng/mL',
    standard: 'CLSI EP17-A2',
    criteria: 'Quantification with ≤20% CV at stated concentration',
  },
  withinRunCV: {
    label: 'Within-Run Precision (Repeatability)',
    unit: '% CV',
    standard: 'CLSI EP05-A3 / ISO 5725',
    criteria: '≤5% CV for quantitative assays (analyte-dependent)',
  },
  betweenRunCV: {
    label: 'Between-Run Precision',
    unit: '% CV',
    standard: 'CLSI EP05-A3',
    criteria: '≤10% CV for quantitative assays',
  },
  betweenDayCV: {
    label: 'Between-Day Precision',
    unit: '% CV',
    standard: 'CLSI EP05-A3',
    criteria: '≤10% CV for quantitative assays',
  },
  reproducibilityCV: {
    label: 'Reproducibility (Total Precision)',
    unit: '% CV',
    standard: 'CLSI EP05-A3 / ISO 5725',
    criteria: '≤15% CV (total imprecision across sites/operators/lots)',
  },
  precisionCV: {
    label: 'Overall Precision',
    unit: '% CV',
    standard: 'CLSI EP05-A3',
    criteria: 'Within manufacturer specifications',
  },
  sensitivity: {
    label: 'Diagnostic Sensitivity',
    unit: '%',
    standard: 'CLSI EP12-A2',
    criteria: '≥95% for screening assays (indication-specific)',
  },
  specificity: {
    label: 'Diagnostic Specificity',
    unit: '%',
    standard: 'CLSI EP12-A2',
    criteria: '≥95% for screening assays (indication-specific)',
  },
  accuracy: {
    label: 'Accuracy (Trueness / Bias)',
    unit: '% bias',
    standard: 'CLSI EP09-A3',
    criteria: '≤±10% bias vs reference method',
  },
  linearityLow: {
    label: 'Linearity Range — Lower Limit',
    unit: 'concentration units',
    standard: 'CLSI EP06-A',
    criteria: 'Demonstrated linear response across claimed range',
  },
  linearityHigh: {
    label: 'Linearity Range — Upper Limit',
    unit: 'concentration units',
    standard: 'CLSI EP06-A',
    criteria: 'Demonstrated linear response across claimed range',
  },
  linearityR2: {
    label: 'Linearity R² Value',
    unit: '',
    standard: 'CLSI EP06-A',
    criteria: '≥0.99 for quantitative assays',
  },
  interferenceSubstances: {
    label: 'Interference Substances Tested',
    unit: 'count',
    standard: 'CLSI EP07-A3',
    criteria: 'Hemolysis, lipemia, icterus, common medications — <10% effect',
  },
  stabilityRealTime: {
    label: 'Real-Time Stability',
    unit: 'months',
    standard: 'ICH Q5C / ISO 23640',
    criteria: 'Meets specifications throughout claimed shelf life',
  },
  stabilityAccelerated: {
    label: 'Accelerated Stability',
    unit: 'months',
    standard: 'ICH Q5C',
    criteria: 'Predictive of real-time stability at elevated conditions',
  },
  stabilityFreezeThaw: {
    label: 'Freeze-Thaw Stability',
    unit: 'cycles',
    standard: 'ICH Q5C',
    criteria: '≥3 cycles without significant degradation',
  },
  carryOver: {
    label: 'Carry-Over',
    unit: '%',
    standard: 'CLSI EP10-A3',
    criteria: '<0.1% carry-over between samples',
  },
  hookEffect: {
    label: 'High-Dose Hook Effect',
    unit: 'concentration',
    standard: 'CLSI EP34-ED1',
    criteria: 'No hook effect at concentrations ≤10× upper linearity',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function AnalyticalValidationTracker() {
  const [validations, setValidations] = useState<ValidationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create form state
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newAnalyteName, setNewAnalyteName] = useState('');
  const [newValidationType, setNewValidationType] = useState('quantitative');

  // Parameter edit state — flat key/value map
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [paramStatuses, setParamStatuses] = useState<Record<string, 'pass' | 'fail' | 'pending'>>(
    {}
  );

  // ── Load validations ───────────────────────────────────────────────────
  const loadValidations = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/ivdr/validations');
      if (resp.ok) {
        const data = await resp.json();
        setValidations(data.validations || []);
      }
    } catch (err) {
      console.error('Load validations failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadValidations();
  }, [loadValidations]);

  // ── Selected record ────────────────────────────────────────────────────
  const selected = validations.find(v => v.id === selectedId) || null;

  useEffect(() => {
    if (selected) {
      // Pre-populate param values from selected record
      const vals: Record<string, string> = {};
      const stats: Record<string, 'pass' | 'fail' | 'pending'> = {};
      if (selected.lod != null) vals.lod = String(selected.lod);
      if (selected.loq != null) vals.loq = String(selected.loq);
      if (selected.within_run_cv != null) vals.withinRunCV = String(selected.within_run_cv);
      if (selected.between_run_cv != null) vals.betweenRunCV = String(selected.between_run_cv);
      if (selected.between_day_cv != null) vals.betweenDayCV = String(selected.between_day_cv);
      if (selected.reproducibility_cv != null)
        vals.reproducibilityCV = String(selected.reproducibility_cv);
      if (selected.precision_cv != null) vals.precisionCV = String(selected.precision_cv);
      if (selected.sensitivity != null) vals.sensitivity = String(selected.sensitivity);
      if (selected.specificity != null) vals.specificity = String(selected.specificity);
      if (selected.accuracy != null) vals.accuracy = String(selected.accuracy);
      if (selected.carry_over != null) vals.carryOver = String(selected.carry_over);
      if (selected.linearity) {
        vals.linearityLow = String(selected.linearity.rangeLow || '');
        vals.linearityHigh = String(selected.linearity.rangeHigh || '');
        vals.linearityR2 = String(selected.linearity.rSquared || '');
      }
      if (selected.stability) {
        vals.stabilityRealTime = String(selected.stability.realTime?.months || '');
        vals.stabilityAccelerated = String(selected.stability.accelerated?.months || '');
        vals.stabilityFreezeThaw = String(selected.stability.freezeThaw?.cycles || '');
      }
      if (selected.interference_study) {
        vals.interferenceSubstances = String((selected.interference_study.substances || []).length);
      }
      // Determine pass/fail per param
      Object.keys(vals).forEach(k => {
        stats[k] = vals[k] && vals[k] !== '' && vals[k] !== '0' ? 'pass' : 'pending';
      });
      setParamValues(vals);
      setParamStatuses(stats);
    }
  }, [selected]);

  // ── Create validation ──────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newDeviceName.trim() || !newAnalyteName.trim()) return;
    setSaving(true);
    try {
      const resp = await fetch('/api/ivdr/validations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceName: newDeviceName,
          analyteName: newAnalyteName,
          validationType: newValidationType,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setValidations(prev => [data.validation, ...prev]);
        setSelectedId(data.validation.id);
        setShowCreate(false);
        setNewDeviceName('');
        setNewAnalyteName('');
      }
    } catch (err) {
      console.error('Create validation failed:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Save parameters ────────────────────────────────────────────────────
  const handleSaveParams = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const body: Record<string, any> = {};
      if (paramValues.lod) body.lod = Number(paramValues.lod);
      if (paramValues.loq) body.loq = Number(paramValues.loq);
      if (paramValues.precisionCV) body.precisionCV = Number(paramValues.precisionCV);
      if (paramValues.withinRunCV) body.withinRunCV = Number(paramValues.withinRunCV);
      if (paramValues.betweenRunCV) body.betweenRunCV = Number(paramValues.betweenRunCV);
      if (paramValues.betweenDayCV) body.betweenDayCV = Number(paramValues.betweenDayCV);
      if (paramValues.reproducibilityCV)
        body.reproducibilityCV = Number(paramValues.reproducibilityCV);
      if (paramValues.sensitivity) body.sensitivity = Number(paramValues.sensitivity);
      if (paramValues.specificity) body.specificity = Number(paramValues.specificity);
      if (paramValues.accuracy) body.accuracy = Number(paramValues.accuracy);
      if (paramValues.carryOver) body.carryOver = Number(paramValues.carryOver);
      if (paramValues.linearityLow || paramValues.linearityHigh || paramValues.linearityR2) {
        body.linearity = {
          rangeLow: Number(paramValues.linearityLow) || null,
          rangeHigh: Number(paramValues.linearityHigh) || null,
          rSquared: Number(paramValues.linearityR2) || null,
        };
      }
      if (
        paramValues.stabilityRealTime ||
        paramValues.stabilityAccelerated ||
        paramValues.stabilityFreezeThaw
      ) {
        body.stability = {
          realTime: { months: Number(paramValues.stabilityRealTime) || null },
          accelerated: { months: Number(paramValues.stabilityAccelerated) || null },
          freezeThaw: { cycles: Number(paramValues.stabilityFreezeThaw) || null },
        };
      }

      const resp = await fetch(`/api/ivdr/validations/${selectedId}/parameters`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        await loadValidations();
      }
    } catch (err) {
      console.error('Save params failed:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Completeness calculation ───────────────────────────────────────────
  const totalParams = Object.keys(PARAM_METADATA).length;
  const filledParams = Object.values(paramValues).filter(v => v !== '' && v !== undefined).length;
  const completeness = totalParams > 0 ? Math.round((filledParams / totalParams) * 100) : 0;

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <FlaskConical className="h-6 w-6" />
                Analytical Validation Tracker
              </CardTitle>
              <CardDescription className="mt-1">
                IVDR Annex I GSPR 9.1(a) — Analytical performance evaluation per CLSI guidelines and
                EU Common Specifications
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Validation
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Create Form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New Analytical Validation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Device Name *</Label>
                <Input
                  placeholder="e.g., Rapid HbA1c Analyzer"
                  value={newDeviceName}
                  onChange={e => setNewDeviceName(e.target.value)}
                />
              </div>
              <div>
                <Label>Analyte Name *</Label>
                <Input
                  placeholder="e.g., Glycated hemoglobin (HbA1c)"
                  value={newAnalyteName}
                  onChange={e => setNewAnalyteName(e.target.value)}
                />
              </div>
              <div>
                <Label>Validation Type</Label>
                <Select value={newValidationType} onValueChange={setNewValidationType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quantitative">Quantitative</SelectItem>
                    <SelectItem value="qualitative">Qualitative</SelectItem>
                    <SelectItem value="semi_quantitative">Semi-Quantitative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating...' : 'Create'}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Validation List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Validations</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {!loading && validations.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No validations yet. Click "New Validation" to begin.
              </p>
            )}
            <div className="space-y-2">
              {validations.map(v => (
                <div
                  key={v.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedId === v.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
                  }`}
                  onClick={() => setSelectedId(v.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{v.device_name}</span>
                    <Badge
                      variant={v.status === 'completed' ? 'default' : 'outline'}
                      className={v.status === 'completed' ? 'bg-green-600' : ''}
                    >
                      {v.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {v.analyte_name} • {v.validation_type}
                  </p>
                  {v.classification && (
                    <Badge variant="outline" className="mt-1 text-xs">
                      IVDR Class {v.classification}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Parameter Detail */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">
                  {selected
                    ? `${selected.device_name} — ${selected.analyte_name}`
                    : 'Select a Validation'}
                </CardTitle>
                {selected && (
                  <CardDescription className="mt-1">Completeness: {completeness}%</CardDescription>
                )}
              </div>
              {selected && (
                <Button onClick={handleSaveParams} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save All Parameters'}
                </Button>
              )}
            </div>
            {selected && <Progress value={completeness} className="mt-2 h-2" />}
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                Select a validation from the list to view and edit parameters.
              </p>
            ) : (
              <Tabs defaultValue="detection">
                <TabsList className="flex flex-wrap gap-1 h-auto">
                  {PARAMETER_GROUPS.map(group => {
                    const Icon = group.icon;
                    return (
                      <TabsTrigger key={group.id} value={group.id} className="text-xs">
                        <Icon className="h-3 w-3 mr-1" />
                        {group.label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {PARAMETER_GROUPS.map(group => (
                  <TabsContent key={group.id} value={group.id} className="mt-4">
                    <div className="space-y-4">
                      {group.params.map(paramKey => {
                        const meta = PARAM_METADATA[paramKey];
                        if (!meta) return null;
                        const val = paramValues[paramKey] || '';
                        const status = paramStatuses[paramKey] || 'pending';
                        return (
                          <div key={paramKey} className="p-4 rounded-lg border space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="font-semibold">{meta.label}</Label>
                                <p className="text-xs text-muted-foreground">
                                  Standard: {meta.standard}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {status === 'pass' && (
                                  <Badge className="bg-green-100 text-green-800">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Recorded
                                  </Badge>
                                )}
                                {status === 'fail' && (
                                  <Badge className="bg-red-100 text-red-800">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Fail
                                  </Badge>
                                )}
                                {status === 'pending' && (
                                  <Badge variant="outline">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Pending
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <Input
                                className="max-w-[200px]"
                                placeholder={`Value (${meta.unit})`}
                                value={val}
                                onChange={e => {
                                  setParamValues(prev => ({
                                    ...prev,
                                    [paramKey]: e.target.value,
                                  }));
                                  setParamStatuses(prev => ({
                                    ...prev,
                                    [paramKey]: e.target.value.trim() !== '' ? 'pass' : 'pending',
                                  }));
                                }}
                              />
                              {meta.unit && (
                                <span className="text-sm text-muted-foreground">{meta.unit}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground italic">
                              Acceptance: {meta.criteria}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
