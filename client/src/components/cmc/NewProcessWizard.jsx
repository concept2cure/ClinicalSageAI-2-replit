import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Zap,
  Users,
  CheckCircle,
  FileText,
  Settings,
  Target,
  Users2,
  Globe,
} from 'lucide-react';

const NewProcessWizard = ({ draftId, onClose, onSuccess }) => {
  const [location, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Form state for each step
  const [overview, setOverview] = useState({
    dosage_form: '',
    dosage_strength: '',
    target_markets: [],
    notes: '',
  });
  const [cqas, setCqas] = useState([]);
  const [units, setUnits] = useState([]);
  const [controlStrategy, setControlStrategy] = useState({});
  const [designSpace, setDesignSpace] = useState({ factors: [], status: 'DRAFT' });
  const [validation, setValidation] = useState({ ppq_plan: '', cpv_rules: '' });
  const [team, setTeam] = useState([]);

  const steps = [
    { id: 'OVERVIEW', title: 'Overview', icon: FileText },
    { id: 'CQAS', title: 'CQAs', icon: Target },
    { id: 'FLOW', title: 'Process Flow', icon: Settings },
    { id: 'CONTROL', title: 'Control Strategy', icon: CheckCircle },
    { id: 'DESIGN_SPACE', title: 'Design Space', icon: Globe },
    { id: 'VALIDATION', title: 'Validation', icon: Users2 },
    { id: 'TEAM', title: 'Team', icon: Users },
  ];

  // Load draft if editing existing
  useEffect(() => {
    if (draftId) {
      loadDraft();
    }
  }, [draftId]);

  const loadDraft = async () => {
    try {
      const response = await fetch(`/api/process/wizard/drafts/${draftId}`);
      if (response.ok) {
        const data = await response.json();
        setDraft(data);
        setOverview(data.overview_json || {});
        setCqas(data.cqas_json || []);
        setUnits(data.units_json || []);
        setControlStrategy(data.control_strategy_json || {});
        setDesignSpace(data.design_space_json || { factors: [], status: 'DRAFT' });
        setValidation(data.validation_plan_json || {});
        setTeam(data.team_json || []);
      }
    } catch (error) {
      console.error('Failed to load draft:', error);
    }
  };

  const saveStep = async (stepId, state) => {
    if (!draft?.draft_id) return;

    setSaving(true);
    try {
      await fetch('/api/process/wizard/drafts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_id: draft.draft_id,
          step: stepId,
          state,
        }),
      });
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAIBootstrap = async () => {
    if (!draft?.draft_id) return;

    setGenerating(true);
    try {
      const response = await fetch(`/api/process/wizard/drafts/${draft.draft_id}/ai/bootstrap`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.suggestion) {
          setUnits(result.suggestion.units || []);
          setControlStrategy(result.suggestion.control || {});
          // Auto-advance to flow step
          setCurrentStep(2);
        }
      }
    } catch (error) {
      console.error('AI bootstrap failed:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleFinalize = async () => {
    if (!draft?.draft_id) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/process/wizard/drafts/${draft.draft_id}/finalize`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        onSuccess?.(result);
        setLocation(`/cmc-blueprint`);
      }
    } catch (error) {
      console.error('Finalize failed:', error);
    } finally {
      setSaving(false);
    }
  };

  const nextStep = () => {
    const step = steps[currentStep];
    const stateMap = {
      OVERVIEW: overview,
      CQAS: cqas,
      FLOW: units,
      CONTROL: controlStrategy,
      DESIGN_SPACE: designSpace,
      VALIDATION: validation,
      TEAM: team,
    };

    saveStep(step.id, stateMap[step.id]);

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  const StepIcon = steps[currentStep].icon;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <StepIcon className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold">New Process Wizard</h1>
            <Badge variant="outline">{draft?.scope || 'DP'}</Badge>
          </div>
          <Button variant="ghost" onClick={onClose}>
            ✕
          </Button>
        </div>

        <Progress value={progress} className="mb-4" />

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>
            Step {currentStep + 1} of {steps.length}:
          </span>
          <span className="font-medium">{steps[currentStep].title}</span>
          {saving && <Badge variant="secondary">Saving...</Badge>}
        </div>
      </div>

      {/* Step Content */}
      <Card className="mb-6">
        <CardContent className="p-6">
          {currentStep === 0 && (
            <OverviewStep
              overview={overview}
              setOverview={setOverview}
              draft={draft}
              setDraft={setDraft}
            />
          )}

          {currentStep === 1 && (
            <CQAStep
              cqas={cqas}
              setCqas={setCqas}
              onAIBootstrap={handleAIBootstrap}
              generating={generating}
            />
          )}

          {currentStep === 2 && <ProcessFlowStep units={units} setUnits={setUnits} />}

          {currentStep === 3 && (
            <ControlStrategyStep
              controlStrategy={controlStrategy}
              setControlStrategy={setControlStrategy}
              units={units}
            />
          )}

          {currentStep === 4 && (
            <DesignSpaceStep designSpace={designSpace} setDesignSpace={setDesignSpace} />
          )}

          {currentStep === 5 && (
            <ValidationStep validation={validation} setValidation={setValidation} />
          )}

          {currentStep === 6 && <TeamStep team={team} setTeam={setTeam} />}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={prevStep} disabled={currentStep === 0}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => saveStep(steps[currentStep].id, {})}>
            <Save className="h-4 w-4 mr-2" />
            Save Draft
          </Button>

          {currentStep === steps.length - 1 ? (
            <Button onClick={handleFinalize} disabled={saving}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Create Process
            </Button>
          ) : (
            <Button onClick={nextStep}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// Step Components
const OverviewStep = ({ overview, setOverview, draft, setDraft }) => {
  const [name, setName] = useState(draft?.name || '');
  const [scope, setScope] = useState(draft?.scope || 'DP');

  const createDraft = async () => {
    try {
      const response = await fetch('/api/process/wizard/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scope }),
      });

      if (response.ok) {
        const newDraft = await response.json();
        setDraft({ ...newDraft, name, scope });
      }
    } catch (error) {
      console.error('Failed to create draft:', error);
    }
  };

  useEffect(() => {
    if (!draft && name) {
      createDraft();
    }
  }, [name]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Process Overview</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Process Name</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Tablet Manufacturing Process"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Scope</label>
            <select
              value={scope}
              onChange={e => setScope(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="DP">Drug Product (DP)</option>
              <option value="DS">Drug Substance (DS)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Dosage Form</label>
          <Input
            value={overview.dosage_form || ''}
            onChange={e => setOverview({ ...overview, dosage_form: e.target.value })}
            placeholder="e.g., Immediate Release Tablet"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Dosage Strength</label>
          <Input
            value={overview.dosage_strength || ''}
            onChange={e => setOverview({ ...overview, dosage_strength: e.target.value })}
            placeholder="e.g., 10 mg, 20 mg"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Target Markets</label>
        <Input
          value={overview.target_markets?.join(', ') || ''}
          onChange={e =>
            setOverview({
              ...overview,
              target_markets: e.target.value.split(',').map(s => s.trim()),
            })
          }
          placeholder="e.g., US, EU, Canada"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Notes</label>
        <Textarea
          value={overview.notes || ''}
          onChange={e => setOverview({ ...overview, notes: e.target.value })}
          placeholder="Additional process details, special considerations..."
          rows={3}
        />
      </div>
    </div>
  );
};

const CQAStep = ({ cqas, setCqas, onAIBootstrap, generating }) => {
  const commonCQAs = [
    'Assay (potency)',
    'Content Uniformity',
    'Dissolution',
    'Disintegration',
    'Hardness',
    'Friability',
    'Weight Variation',
    'Microbial Limits',
    'Related Substances',
    'Residual Solvents',
    'Heavy Metals',
    'Water Content',
  ];

  const toggleCQA = cqa => {
    setCqas(prev => (prev.includes(cqa) ? prev.filter(c => c !== cqa) : [...prev, cqa]));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Critical Quality Attributes (CQAs)</h3>
        <Button
          onClick={onAIBootstrap}
          disabled={generating || cqas.length === 0}
          className="bg-purple-600 hover:bg-purple-700"
        >
          <Zap className="h-4 w-4 mr-2" />
          {generating ? 'Generating...' : 'AI Suggest Process'}
        </Button>
      </div>

      <p className="text-gray-600">Select the CQAs that will be controlled in this process:</p>

      <div className="grid grid-cols-3 gap-3">
        {commonCQAs.map(cqa => (
          <div
            key={cqa}
            onClick={() => toggleCQA(cqa)}
            className={`p-3 border rounded cursor-pointer transition-all ${
              cqas.includes(cqa)
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm">{cqa}</span>
              {cqas.includes(cqa) && <CheckCircle className="h-4 w-4 text-blue-600" />}
            </div>
          </div>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Custom CQAs (one per line)</label>
        <Textarea
          placeholder="Enter additional CQAs..."
          rows={3}
          onChange={e => {
            const custom = e.target.value.split('\n').filter(line => line.trim());
            setCqas(prev => [...prev.filter(c => commonCQAs.includes(c)), ...custom]);
          }}
        />
      </div>

      {cqas.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium mb-2">Selected CQAs ({cqas.length}):</h4>
          <div className="flex flex-wrap gap-2">
            {cqas.map(cqa => (
              <Badge
                key={cqa}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => toggleCQA(cqa)}
              >
                {cqa} ✕
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ProcessFlowStep = ({ units, setUnits }) => {
  const addUnit = () => {
    setUnits([
      ...units,
      {
        name: '',
        type: 'Blender',
        parameters: [],
      },
    ]);
  };

  const updateUnit = (index, field, value) => {
    const updated = [...units];
    updated[index] = { ...updated[index], [field]: value };
    setUnits(updated);
  };

  const removeUnit = index => {
    setUnits(units.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Process Flow & Unit Operations</h3>
        <Button onClick={addUnit} variant="outline">
          + Add Unit
        </Button>
      </div>

      <div className="space-y-4">
        {units.map((unit, index) => (
          <Card key={index} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">Unit {index + 1}</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeUnit(index)}
                className="text-red-600"
              >
                Remove
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Unit Name</label>
                <Input
                  value={unit.name}
                  onChange={e => updateUnit(index, 'name', e.target.value)}
                  placeholder="e.g., Blend"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Unit Type</label>
                <select
                  value={unit.type}
                  onChange={e => updateUnit(index, 'type', e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  <option value="Blender">Blender</option>
                  <option value="HighShearGran">High Shear Granulator</option>
                  <option value="FluidBedDryer">Fluid Bed Dryer</option>
                  <option value="TabletPress">Tablet Press</option>
                  <option value="Coater">Coater</option>
                  <option value="Mill">Mill</option>
                </select>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {units.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Settings className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>No unit operations defined yet.</p>
          <p className="text-sm">Add units to build your process flow.</p>
        </div>
      )}
    </div>
  );
};

const ControlStrategyStep = ({ controlStrategy, setControlStrategy, units }) => {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Control Strategy</h3>
      <p className="text-gray-600">Define control parameters and test methods for your process.</p>

      {Object.keys(controlStrategy).length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>Control strategy will be populated based on your process flow.</p>
          <p className="text-sm">Complete the Process Flow step to see suggestions here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(controlStrategy).map(([param, control]) => (
            <Card key={param} className="p-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Parameter</label>
                  <Input value={param} readOnly className="bg-gray-50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Test Method</label>
                  <Input
                    value={control.test || ''}
                    onChange={e =>
                      setControlStrategy({
                        ...controlStrategy,
                        [param]: { ...control, test: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Acceptance Limit</label>
                  <Input
                    value={control.limit || ''}
                    onChange={e =>
                      setControlStrategy({
                        ...controlStrategy,
                        [param]: { ...control, limit: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const DesignSpaceStep = ({ designSpace, setDesignSpace }) => {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Design Space</h3>
      <p className="text-gray-600">Define the design space for process parameters.</p>

      <div className="text-center py-8 text-gray-500">
        <Globe className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p>Design space definition coming soon.</p>
        <p className="text-sm">This will be populated based on your process parameters.</p>
      </div>
    </div>
  );
};

const ValidationStep = ({ validation, setValidation }) => {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Validation Planning</h3>

      <div>
        <label className="block text-sm font-medium mb-2">PPQ Plan</label>
        <Textarea
          value={validation.ppq_plan || ''}
          onChange={e => setValidation({ ...validation, ppq_plan: e.target.value })}
          placeholder="Describe the Process Performance Qualification plan..."
          rows={4}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">CPV Strategy</label>
        <Textarea
          value={validation.cpv_rules || ''}
          onChange={e => setValidation({ ...validation, cpv_rules: e.target.value })}
          placeholder="Define Continued Process Verification strategy..."
          rows={4}
        />
      </div>
    </div>
  );
};

const TeamStep = ({ team, setTeam }) => {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Team & Assignments</h3>
      <p className="text-gray-600">Assign team members to work on this process.</p>

      <div className="text-center py-8 text-gray-500">
        <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p>Team assignment functionality coming soon.</p>
        <p className="text-sm">
          You'll be able to assign roles and responsibilities to team members.
        </p>
      </div>
    </div>
  );
};

export default NewProcessWizard;
