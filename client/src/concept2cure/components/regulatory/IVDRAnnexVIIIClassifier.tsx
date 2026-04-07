/**
 * IVDR Annex VIII Classifier Wizard
 *
 * Interactive step-by-step wizard implementing the EU IVDR 2017/746
 * Annex VIII classification rules. Determines IVD Risk Class (A/B/C/D)
 * with an explicit, auditable rule trace showing exactly which rule
 * matched and why.
 *
 * Regulatory basis:
 *   - EU 2017/746 Annex VIII (Classification Rules)
 *   - Rule 1 (D): Transmissible agent screening
 *   - Rule 2 (D): Blood grouping / tissue typing
 *   - Rule 3a-d (C): CDx, cancer, genetic, prenatal
 *   - Rule 4 (B): Self-testing
 *   - Rule 5 (B): Near-patient testing
 *   - Rule 6 (B): Medium/high risk to patient
 *   - Rule 7 (A): All other IVDs
 *
 * @module components/regulatory/IVDRAnnexVIIIClassifier
 * @version 1.0.0
 */

import React, { useState, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Shield,
  Microscope,
  Dna,
  Baby,
  Droplets,
  User,
  Building2,
  FileCheck,
  ClipboardList,
  ArrowRight,
  Info,
  Download,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type IVDRClass = 'A' | 'B' | 'C' | 'D';

interface RuleTraceEntry {
  rule: string;
  description: string;
  matched: boolean;
}

interface ClassificationResult {
  classification: IVDRClass;
  ruleTrace: RuleTraceEntry[];
  matchedRules: RuleTraceEntry[];
  regulatoryPath: RegulatoryPath;
}

interface RegulatoryPath {
  class: string;
  conformityAssessment: string;
  technicalDocumentation: string;
  performanceEvaluation: string;
  qualityManagement: string;
  postMarket: string;
  euDeclaration: string;
  timeline: string;
}

interface WizardAnswers {
  deviceName: string;
  intendedPurpose: string;
  isSelfTest: boolean | null;
  isNearPatient: boolean | null;
  isCompanionDiagnostic: boolean | null;
  detectsTransmissibleAgent: boolean | null;
  bloodScreening: boolean | null;
  detectsCancer: boolean | null;
  prenatalScreening: boolean | null;
  riskToPatient: 'low' | 'medium' | 'high' | null;
  isGeneticTest: boolean | null;
  analytes: string;
}

interface ClassificationRecord {
  id: number;
  device_name: string;
  intended_purpose: string;
  classification: IVDRClass;
  is_cdx: boolean;
  rule_trace: RuleTraceEntry[];
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'basic', label: 'Device Info', icon: Microscope },
  { id: 'blood', label: 'Blood / Tissue', icon: Droplets },
  { id: 'cdx', label: 'CDx / Cancer', icon: Dna },
  { id: 'genetic', label: 'Genetic / Prenatal', icon: Baby },
  { id: 'setting', label: 'Use Setting', icon: User },
  { id: 'risk', label: 'Risk Level', icon: AlertTriangle },
  { id: 'result', label: 'Classification', icon: Shield },
] as const;

const CLASS_COLORS: Record<IVDRClass, string> = {
  A: 'bg-green-100 text-green-800 border-green-300',
  B: 'bg-blue-100 text-blue-800 border-blue-300',
  C: 'bg-orange-100 text-orange-800 border-orange-300',
  D: 'bg-red-100 text-red-800 border-red-300',
};

const CLASS_DESCRIPTIONS: Record<IVDRClass, string> = {
  A: 'Low individual risk and low public health risk. Self-certification pathway.',
  B: 'Moderate individual risk. Notified Body involvement for QMS and some technical documentation.',
  C: 'High individual risk and/or moderate public health risk. Full Notified Body assessment required.',
  D: 'Highest risk to individual and public health. EU Reference Laboratory + Notified Body + full annexes.',
};

const INITIAL_ANSWERS: WizardAnswers = {
  deviceName: '',
  intendedPurpose: '',
  isSelfTest: null,
  isNearPatient: null,
  isCompanionDiagnostic: null,
  detectsTransmissibleAgent: null,
  bloodScreening: null,
  detectsCancer: null,
  prenatalScreening: null,
  riskToPatient: null,
  isGeneticTest: null,
  analytes: '',
};

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL CLASSIFIER (mirrors server logic for instant preview)
// ─────────────────────────────────────────────────────────────────────────────

function classifyLocally(answers: WizardAnswers): ClassificationResult {
  const ruleTrace: RuleTraceEntry[] = [];
  let classResult: IVDRClass = 'A';

  // Rule 1 — Class D: Blood/tissue screening for transmissible agents
  const rule1 = answers.bloodScreening === true && answers.detectsTransmissibleAgent === true;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 1 (Class D)',
    description:
      'IVDs for blood/tissue screening detecting transmissible agents (HIV, HBV, HCV, HTLV, Treponema pallidum, CMV, Chlamydia, RhD, Kell, Duffy/Kidd)',
    matched: rule1,
  });
  if (rule1) classResult = 'D';

  // Rule 2 — Class D: Blood group typing
  const rule2 =
    answers.intendedPurpose.toLowerCase().includes('blood group') ||
    answers.intendedPurpose.toLowerCase().includes('blood typing');
  ruleTrace.push({
    rule: 'Annex VIII, Rule 2 (Class D)',
    description:
      'IVDs for blood grouping or tissue typing to ensure immunological compatibility (ABO, Rh, anti-Kell)',
    matched: rule2,
  });
  if (rule2 && classResult !== 'D') classResult = 'D';

  // Rule 3a — Class C: Companion Diagnostics
  const rule3a = answers.isCompanionDiagnostic === true;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 3a (Class C)',
    description:
      'Companion diagnostics essential for safe/effective use of a corresponding medicinal product',
    matched: rule3a,
  });
  if (rule3a && classResult < 'C') classResult = 'C';

  // Rule 3b — Class C: Cancer screening/diagnosis
  const rule3b = answers.detectsCancer === true;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 3b (Class C)',
    description: 'IVDs for screening, diagnosis, or staging of cancer',
    matched: rule3b,
  });
  if (rule3b && classResult < 'C') classResult = 'C';

  // Rule 3c — Class C: Genetic testing
  const rule3c = answers.isGeneticTest === true;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 3c (Class C)',
    description:
      'IVDs providing information about genetic predisposition with direct patient management impact',
    matched: rule3c,
  });
  if (rule3c && classResult < 'C') classResult = 'C';

  // Rule 3d — Class C: Prenatal screening
  const rule3d = answers.prenatalScreening === true;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 3d (Class C)',
    description:
      'IVDs for prenatal screening, immune status determination, or detecting foetal congenital abnormalities',
    matched: rule3d,
  });
  if (rule3d && classResult < 'C') classResult = 'C';

  // Rule 4 — Class B: Self-testing
  const rule4 = answers.isSelfTest === true;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 4 (Class B)',
    description: 'IVDs for self-testing by lay persons',
    matched: rule4,
  });
  if (rule4 && classResult < 'B') classResult = 'B';

  // Rule 5 — Class B: Near-patient testing
  const rule5 = answers.isNearPatient === true && !answers.isSelfTest;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 5 (Class B)',
    description: 'IVDs for near-patient / point-of-care testing outside a laboratory',
    matched: rule5,
  });
  if (rule5 && classResult < 'B') classResult = 'B';

  // Rule 6 — Class B: Risk-based
  const rule6 = answers.riskToPatient === 'high' || answers.riskToPatient === 'medium';
  ruleTrace.push({
    rule: 'Annex VIII, Rule 6 (Class B)',
    description:
      'IVDs whose results could pose medium/high risk to the individual or public health',
    matched: rule6,
  });
  if (rule6 && classResult < 'B') classResult = 'B';

  // Rule 7 — Class A: Default
  ruleTrace.push({
    rule: 'Annex VIII, Rule 7 (Class A)',
    description: 'All other IVDs not covered by Rules 1–6',
    matched: classResult === 'A',
  });

  return {
    classification: classResult,
    ruleTrace,
    matchedRules: ruleTrace.filter(r => r.matched),
    regulatoryPath: getRegulatoryPath(classResult),
  };
}

function getRegulatoryPath(cls: IVDRClass): RegulatoryPath {
  const paths: Record<IVDRClass, RegulatoryPath> = {
    D: {
      class: 'D',
      conformityAssessment: 'EU Reference Laboratory + Notified Body (Annex IX Ch. I & III)',
      technicalDocumentation: 'Full Annex II + Annex III',
      performanceEvaluation:
        'Required: Annex XIII Part A (scientific validity, analytical & clinical performance)',
      qualityManagement: 'Full QMS, ISO 13485 certified, Notified Body audits',
      postMarket: 'PMCF plan mandatory, PSUR every year, proactive safety updates',
      euDeclaration: 'Required, CE mark with Notified Body number',
      timeline: '18–24 months typical',
    },
    C: {
      class: 'C',
      conformityAssessment: 'Notified Body (Annex IX Ch. I & III or Annex X + XI)',
      technicalDocumentation: 'Full Annex II + Annex III',
      performanceEvaluation: 'Required: Annex XIII Part A',
      qualityManagement: 'Full QMS, ISO 13485 certified',
      postMarket: 'PMCF plan mandatory, PSUR every 2 years',
      euDeclaration: 'Required, CE mark with Notified Body number',
      timeline: '12–18 months typical',
    },
    B: {
      class: 'B',
      conformityAssessment: 'Notified Body (Annex IX Ch. I + III or Annex XI Part A)',
      technicalDocumentation: 'Full Annex II',
      performanceEvaluation: 'Required: Annex XIII Part A',
      qualityManagement: 'QMS, ISO 13485 recommended',
      postMarket: 'PMCF plan, PSUR every 2 years',
      euDeclaration: 'Required',
      timeline: '9–12 months typical',
    },
    A: {
      class: 'A',
      conformityAssessment: 'Self-declaration (Annex IX Ch. I — manufacturer QMS only)',
      technicalDocumentation: 'Annex II (basic)',
      performanceEvaluation: 'Required: Annex XIII Part A (basic performance evaluation)',
      qualityManagement: 'QMS minimum, ISO 13485 recommended',
      postMarket: 'PMS plan, report rather than PSUR',
      euDeclaration: 'Self-declaration, CE mark without Notified Body number',
      timeline: '3–6 months typical',
    },
  };
  return paths[cls];
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function IVDRAnnexVIIIClassifier() {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>({ ...INITIAL_ANSWERS });
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [records, setRecords] = useState<ClassificationRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // ── Step navigation ────────────────────────────────────────────────────
  const totalSteps = STEPS.length;
  const progress = Math.round(((currentStep + 1) / totalSteps) * 100);

  const canAdvance = useCallback((): boolean => {
    switch (currentStep) {
      case 0:
        return answers.deviceName.trim().length > 0 && answers.intendedPurpose.trim().length > 0;
      case 1:
        return answers.bloodScreening !== null && answers.detectsTransmissibleAgent !== null;
      case 2:
        return answers.isCompanionDiagnostic !== null && answers.detectsCancer !== null;
      case 3:
        return answers.isGeneticTest !== null && answers.prenatalScreening !== null;
      case 4:
        return answers.isSelfTest !== null && answers.isNearPatient !== null;
      case 5:
        return answers.riskToPatient !== null;
      default:
        return true;
    }
  }, [currentStep, answers]);

  const handleNext = () => {
    if (currentStep === totalSteps - 2) {
      // Moving to result step — run classification
      const res = classifyLocally(answers);
      setResult(res);
      setCurrentStep(totalSteps - 1);
    } else if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      if (currentStep === totalSteps - 1) setResult(null);
    }
  };

  const handleReset = () => {
    setAnswers({ ...INITIAL_ANSWERS });
    setResult(null);
    setCurrentStep(0);
  };

  const setBool = (field: keyof WizardAnswers, val: boolean) =>
    setAnswers(prev => ({ ...prev, [field]: val }));

  // ── Save to server ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const resp = await apiRequest('POST', '/api/ivdr/classify', {
          ...answers,
          analytes: answers.analytes
            .split(',')
            .map(a => a.trim())
            .filter(Boolean),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      setRecords(prev => [data.record, ...prev]);
    } catch (err) {
      console.error('Save classification failed:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Load history ───────────────────────────────────────────────────────
  const loadHistory = async () => {
    try {
      const resp = await apiRequest('GET', '/api/ivdr/classifications');
      if (resp.ok) {
        const data = await resp.json();
        setRecords(data.classifications || []);
      }
    } catch (err) {
      console.error('Load classifications failed:', err);
    }
    setShowHistory(true);
  };
  // ── Export classification report as JSON artifact ─────────────────
  const handleExportReport = () => {
    if (!result) return;
    const report = {
      reportType: 'IVDR Annex VIII Classification Report',
      generatedAt: new Date().toISOString(),
      regulation: 'EU 2017/746 (IVDR)',
      device: {
        name: answers.deviceName,
        intendedPurpose: answers.intendedPurpose,
        analytes: answers.analytes
          .split(',')
          .map(a => a.trim())
          .filter(Boolean),
      },
      classification: {
        class: result.classification,
        isCDx: answers.isCompanionDiagnostic,
        isSelfTest: answers.isSelfTest,
        isNearPatient: answers.isNearPatient,
      },
      ruleTrace: result.ruleTrace,
      matchedRules: result.matchedRules,
      regulatoryPath: result.regulatoryPath,
      deviceJustification:
        result.matchedRules.length > 0
          ? `Device "${answers.deviceName}" is classified as Class ${result.classification} because it matched: ${result.matchedRules.map(r => r.rule).join('; ')}. The device's intended purpose "${answers.intendedPurpose}" specifically triggers ${result.matchedRules.length === 1 ? 'this rule' : 'these rules'} under Annex VIII of IVDR 2017/746.`
          : `Device "${answers.deviceName}" is classified as Class A (default) because no higher-risk classification rules (Rules 1–6) were triggered. The device's intended purpose "${answers.intendedPurpose}" falls under the general Rule 7 catch-all category.`,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ivdr-classification-${answers.deviceName.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  // ── Render helpers ─────────────────────────────────────────────────────
  const BoolButton = ({
    label,
    value,
    selected,
    onClick,
  }: {
    label: string;
    value: boolean;
    selected: boolean | null;
    onClick: () => void;
  }) => (
    <Button
      variant={selected === value ? 'default' : 'outline'}
      className={`min-w-[80px] ${selected === value ? '' : 'opacity-70'}`}
      onClick={onClick}
    >
      {label}
    </Button>
  );

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
              <h3 className="text-sm font-semibold flex items-center gap-2 text-base">
                <Shield className="h-6 w-6" />
                IVDR Annex VIII — Classification Wizard
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 mt-1">
                EU 2017/746 In Vitro Diagnostic Regulation — Risk-based device classification (Rules
                1–7) with full rule trace for regulatory audit
              </p>
            </div>
            <Button variant="outline" onClick={loadHistory}>
              <ClipboardList className="h-4 w-4 mr-2" />
              History
            </Button>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className={`flex items-center gap-1 ${
                  idx === currentStep
                    ? 'text-primary font-semibold'
                    : idx < currentStep
                      ? 'text-green-600'
                      : ''
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{step.label}</span>
              </div>
            );
          })}
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Wizard Steps */}
      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 pt-6">
          {/* Step 0: Device Info */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Microscope className="h-5 w-5" />
                Step 1: Device Information
              </h3>
              <p className="text-sm text-muted-foreground">
                Provide the device name and intended purpose. The intended purpose is the basis for
                classification under IVDR Annex VIII.
              </p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="deviceName">Device Name *</Label>
                  <Input
                    id="deviceName"
                    placeholder="e.g., Rapid COVID-19 Antigen Test"
                    value={answers.deviceName}
                    onChange={e => setAnswers(prev => ({ ...prev, deviceName: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="intendedPurpose">Intended Purpose *</Label>
                  <Textarea
                    id="intendedPurpose"
                    className="min-h-[100px]"
                    placeholder="e.g., In vitro qualitative detection of SARS-CoV-2 nucleocapsid protein antigen in human nasopharyngeal swab specimens from individuals suspected of COVID-19 by their healthcare provider."
                    value={answers.intendedPurpose}
                    onChange={e =>
                      setAnswers(prev => ({ ...prev, intendedPurpose: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="analytes">Analytes (comma-separated)</Label>
                  <Input
                    id="analytes"
                    placeholder="e.g., SARS-CoV-2 N protein, IgG, IgM"
                    value={answers.analytes}
                    onChange={e => setAnswers(prev => ({ ...prev, analytes: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Blood/Tissue Screening */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Droplets className="h-5 w-5" />
                Step 2: Blood / Tissue Screening
              </h3>
              <p className="text-sm text-muted-foreground">
                Determines applicability of <strong>Rule 1 (Class D)</strong> — blood/tissue
                donation screening for transmissible agents, and <strong>Rule 2 (Class D)</strong> —
                blood grouping / tissue typing.
              </p>
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">
                    Is this device used for blood/tissue donation screening?
                  </Label>
                  <div className="flex gap-2">
                    <BoolButton
                      label="Yes"
                      value={true}
                      selected={answers.bloodScreening}
                      onClick={() => setBool('bloodScreening', true)}
                    />
                    <BoolButton
                      label="No"
                      value={false}
                      selected={answers.bloodScreening}
                      onClick={() => setBool('bloodScreening', false)}
                    />
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">
                    Does it detect transmissible agents (HIV, HBV, HCV, HTLV, etc.)?
                  </Label>
                  <div className="flex gap-2">
                    <BoolButton
                      label="Yes"
                      value={true}
                      selected={answers.detectsTransmissibleAgent}
                      onClick={() => setBool('detectsTransmissibleAgent', true)}
                    />
                    <BoolButton
                      label="No"
                      value={false}
                      selected={answers.detectsTransmissibleAgent}
                      onClick={() => setBool('detectsTransmissibleAgent', false)}
                    />
                  </div>
                </div>
                {(answers.bloodScreening || answers.detectsTransmissibleAgent) && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm">
                    <AlertTriangle className="inline h-4 w-4 mr-1 text-red-600" />
                    <strong>Rule 1 / Rule 2 trigger:</strong> Devices for blood/tissue donation
                    screening or blood grouping are classified as <strong>Class D</strong> — the
                    highest risk category.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: CDx / Cancer */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Dna className="h-5 w-5" />
                Step 3: Companion Diagnostic & Cancer
              </h3>
              <p className="text-sm text-muted-foreground">
                Determines applicability of <strong>Rule 3a (Class C)</strong> — companion
                diagnostics, and <strong>Rule 3b (Class C)</strong> — cancer detection.
              </p>
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">
                    Is this a companion diagnostic (CDx) — essential for safe/effective use of a
                    specific medicinal product?
                  </Label>
                  <div className="flex gap-2">
                    <BoolButton
                      label="Yes"
                      value={true}
                      selected={answers.isCompanionDiagnostic}
                      onClick={() => setBool('isCompanionDiagnostic', true)}
                    />
                    <BoolButton
                      label="No"
                      value={false}
                      selected={answers.isCompanionDiagnostic}
                      onClick={() => setBool('isCompanionDiagnostic', false)}
                    />
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">
                    Is this device intended for screening, diagnosis, or staging of cancer?
                  </Label>
                  <div className="flex gap-2">
                    <BoolButton
                      label="Yes"
                      value={true}
                      selected={answers.detectsCancer}
                      onClick={() => setBool('detectsCancer', true)}
                    />
                    <BoolButton
                      label="No"
                      value={false}
                      selected={answers.detectsCancer}
                      onClick={() => setBool('detectsCancer', false)}
                    />
                  </div>
                </div>
                {(answers.isCompanionDiagnostic || answers.detectsCancer) && (
                  <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-sm">
                    <Info className="inline h-4 w-4 mr-1 text-orange-600" />
                    <strong>Rule 3a/3b trigger:</strong> CDx and cancer-related IVDs are classified
                    as <strong>Class C</strong> — requiring full Notified Body assessment.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Genetic / Prenatal */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Baby className="h-5 w-5" />
                Step 4: Genetic Testing & Prenatal Screening
              </h3>
              <p className="text-sm text-muted-foreground">
                Determines applicability of <strong>Rule 3c (Class C)</strong> — genetic testing,
                and <strong>Rule 3d (Class C)</strong> — prenatal screening.
              </p>
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">
                    Does this device provide information about genetic predisposition or
                    pharmacogenomics?
                  </Label>
                  <div className="flex gap-2">
                    <BoolButton
                      label="Yes"
                      value={true}
                      selected={answers.isGeneticTest}
                      onClick={() => setBool('isGeneticTest', true)}
                    />
                    <BoolButton
                      label="No"
                      value={false}
                      selected={answers.isGeneticTest}
                      onClick={() => setBool('isGeneticTest', false)}
                    />
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">
                    Is this device used for prenatal screening or detecting foetal congenital
                    abnormalities?
                  </Label>
                  <div className="flex gap-2">
                    <BoolButton
                      label="Yes"
                      value={true}
                      selected={answers.prenatalScreening}
                      onClick={() => setBool('prenatalScreening', true)}
                    />
                    <BoolButton
                      label="No"
                      value={false}
                      selected={answers.prenatalScreening}
                      onClick={() => setBool('prenatalScreening', false)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Use Setting */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <User className="h-5 w-5" />
                Step 5: Use Setting
              </h3>
              <p className="text-sm text-muted-foreground">
                Determines applicability of <strong>Rule 4 (Class B)</strong> — self-testing, and{' '}
                <strong>Rule 5 (Class B)</strong> — near-patient / point-of-care testing.
              </p>
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">
                    Is this device intended for self-testing by lay persons (non-professionals)?
                  </Label>
                  <div className="flex gap-2">
                    <BoolButton
                      label="Yes"
                      value={true}
                      selected={answers.isSelfTest}
                      onClick={() => setBool('isSelfTest', true)}
                    />
                    <BoolButton
                      label="No"
                      value={false}
                      selected={answers.isSelfTest}
                      onClick={() => setBool('isSelfTest', false)}
                    />
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">
                    Is this device intended for near-patient / point-of-care testing outside a
                    laboratory?
                  </Label>
                  <div className="flex gap-2">
                    <BoolButton
                      label="Yes"
                      value={true}
                      selected={answers.isNearPatient}
                      onClick={() => setBool('isNearPatient', true)}
                    />
                    <BoolButton
                      label="No"
                      value={false}
                      selected={answers.isNearPatient}
                      onClick={() => setBool('isNearPatient', false)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Risk Level */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Step 6: Risk Assessment
              </h3>
              <p className="text-sm text-muted-foreground">
                Determines applicability of <strong>Rule 6 (Class B)</strong> — devices whose
                incorrect results could pose medium/high risk to the patient or public health.
              </p>
              <div>
                <Label className="mb-2 block">
                  If this device provides an incorrect result, what is the risk to the patient?
                </Label>
                <Select
                  value={answers.riskToPatient || ''}
                  onValueChange={val =>
                    setAnswers(prev => ({
                      ...prev,
                      riskToPatient: val as 'low' | 'medium' | 'high',
                    }))
                  }
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue placeholder="Select risk level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low — Minimal clinical consequence</SelectItem>
                    <SelectItem value="medium">
                      Medium — Could lead to suboptimal treatment
                    </SelectItem>
                    <SelectItem value="high">High — Could cause serious harm or death</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 6: Classification Result */}
          {currentStep === totalSteps - 1 && result && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Classification Result
              </h3>

              {/* Classification Badge */}
              <div className="flex items-center gap-4">
                <div
                  className={`inline-flex items-center justify-center w-20 h-20 rounded-xl text-lg font-semibold border-2 ${
                    CLASS_COLORS[result.classification]
                  }`}
                >
                  {result.classification}
                </div>
                <div>
                  <h4 className="text-lg font-semibold">IVDR Class {result.classification}</h4>
                  <p className="text-sm text-muted-foreground max-w-lg">
                    {CLASS_DESCRIPTIONS[result.classification]}
                  </p>
                </div>
              </div>

              {/* Rule Trace Table */}
              <div>
                <h4 className="font-semibold mb-2">Rule Trace (Audit Trail)</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Rule</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[100px] text-center">Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.ruleTrace.map((entry, idx) => (
                      <TableRow key={idx} className={entry.matched ? 'bg-green-50' : ''}>
                        <TableCell className="font-mono text-xs">{entry.rule}</TableCell>
                        <TableCell className="text-sm">{entry.description}</TableCell>
                        <TableCell className="text-center">
                          {entry.matched ? (
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              MATCH
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              —
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Regulatory Path */}
              <div>
                <h4 className="font-semibold mb-2">Regulatory Pathway</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(result.regulatoryPath).map(([key, value]) => (
                    <div key={key} className="p-3 rounded-lg border bg-muted/30">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </p>
                      <p className="text-sm mt-1">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Device-Specific Justification */}
              {result.matchedRules.length > 0 && (
                <div className="p-4 rounded-lg border bg-blue-50 border-blue-200">
                  <h4 className="font-semibold mb-2 text-blue-800">
                    Device-Specific Classification Justification
                  </h4>
                  <p className="text-sm text-stone-700">
                    Device <strong>"{answers.deviceName}"</strong> is classified as{' '}
                    <strong>Class {result.classification}</strong> because its intended purpose
                    triggers: {result.matchedRules.map(r => r.rule).join('; ')}.
                    {answers.intendedPurpose && (
                      <>
                        {' '}
                        The stated intended purpose —{' '}
                        <em>
                          "{answers.intendedPurpose.slice(0, 200)}
                          {answers.intendedPurpose.length > 200 ? '...' : ''}"
                        </em>{' '}
                        — directly satisfies the criteria of{' '}
                        {result.matchedRules.length === 1 ? 'this rule' : 'these rules'}.
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button onClick={handleSave} disabled={saving}>
                  <FileCheck className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Classification'}
                </Button>
                <Button variant="outline" onClick={handleExportReport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Report (JSON)
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  New Classification
                </Button>
              </div>
            </div>
          )}

          {/* Navigation */}
          {currentStep < totalSteps - 1 && (
            <div className="flex justify-between mt-8 pt-4 border-t">
              <Button variant="outline" onClick={handleBack} disabled={currentStep === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleNext} disabled={!canAdvance()}>
                {currentStep === totalSteps - 2 ? 'Classify' : 'Next'}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="border border-border/40 rounded-sm bg-background">
          <div className="px-3 py-2 border-b border-border/30">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-lg">Classification History</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                Close
              </Button>
            </div>
          </div>
          <div className="px-3 py-2">
            {records.length === 0 ? (
              <p className="text-sm text-muted-foreground">No classifications saved yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>CDx</TableHead>
                    <TableHead>Rules Matched</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map(rec => (
                    <TableRow key={rec.id}>
                      <TableCell className="font-medium">{rec.device_name}</TableCell>
                      <TableCell>
                        <Badge className={CLASS_COLORS[rec.classification]}>
                          {rec.classification}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {rec.is_cdx ? <Badge variant="default">CDx</Badge> : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {(rec.rule_trace || [])
                          .filter((r: RuleTraceEntry) => r.matched)
                          .map((r: RuleTraceEntry) => r.rule.split('(')[0].trim())
                          .join(', ') || 'Rule 7'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(rec.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
