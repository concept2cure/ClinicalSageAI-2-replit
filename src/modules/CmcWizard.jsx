
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Factory,
  Settings,
  BarChart3,
  Clock,
  Users,
  Target,
  Activity,
  Shield,
  AlertTriangle,
  FileText,
  Sparkles,
  Loader,
  Copy,
  Check,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ManufacturingProcessPanel from '../components/cmc/ManufacturingProcessPanel';
import ControlStrategyPanel from '../components/cmc/ControlStrategyPanel';
import QualityRiskAssessment from '../components/cmc/QualityRiskAssessment';

const PROJECT_DATA = {
  name: 'CMC Manufacturing Project',
  drugName: 'Lisinopril Tablets',
  drugType: 'Generic Drug Product',
  dosageForm: 'Immediate Release Tablets',
  indication: 'Hypertension and Heart Failure',
  developmentStage: 'Phase III Development',
  regulatoryRegion: 'FDA',
  manufacturingSite: 'Main Manufacturing Facility',
  targetSubmissionDate: '2025-12-31',
  projectManager: 'Sarah Johnson, PhD',
};

const MANUFACTURING_METRICS = {
  processReadiness: 78,
  ppqProgress: 45,
  deviationRate: 2.3,
  releaseTime: 4.2,
  oeeScore: 72,
  complianceScore: 94,
};

const MODULE_OPTIONS = [
  { label: '3.2.S - Drug Substance', value: '3.2.S' },
  { label: '3.2.P - Drug Product', value: '3.2.P' },
];

const getErrorMessage = error => {
  return error instanceof Error ? error.message : String(error);
};

const CmcHeader = ({ projectData, loading, onSave, onValidate }) => {
  return (
    <div className="border-b bg-white sticky top-0 z-10 shadow-sm">
      <div className="container mx-auto py-4 px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Factory className="h-7 w-7 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">CMC Wizard</h1>
              <p className="text-sm text-gray-600">Chemistry, Manufacturing, and Controls Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
              {projectData.regulatoryRegion}
            </Badge>
            <Button variant="outline" onClick={onValidate} disabled={loading}>
              <AlertTriangle className="w-4 h-4 mr-2" />
              Validate Compliance
            </Button>
            <Button onClick={onSave} disabled={loading}>
              {loading ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Settings className="w-4 h-4 mr-2" />
                  Save Project
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProjectOverview = ({ projectData, projectTitle, onTitleChange, moduleType, onModuleTypeChange }) => {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-600" />
          {projectTitle}
        </CardTitle>
        <CardDescription>
          {projectData.drugName} • {projectData.dosageForm} • {projectData.indication}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-900">Project Title</label>
            <Input value={projectTitle} onChange={event => onTitleChange(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-900">Module Type</label>
            <Select value={moduleType} onValueChange={onModuleTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select module" />
              </SelectTrigger>
              <SelectContent>
                {MODULE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Development Stage</p>
              <p className="text-sm text-gray-600">{projectData.developmentStage}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Project Manager</p>
              <p className="text-sm text-gray-600">{projectData.projectManager}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Target Submission</p>
              <p className="text-sm text-gray-600">{projectData.targetSubmissionDate}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const ReadinessOverview = ({ metrics }) => {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          Manufacturing Readiness Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{metrics.processReadiness}%</div>
            <p className="text-sm text-gray-600">Process Readiness</p>
            <Progress value={metrics.processReadiness} className="mt-2" />
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{metrics.ppqProgress}%</div>
            <p className="text-sm text-gray-600">PPQ Progress</p>
            <Progress value={metrics.ppqProgress} className="mt-2" />
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{metrics.complianceScore}%</div>
            <p className="text-sm text-gray-600">Compliance Score</p>
            <Progress value={metrics.complianceScore} className="mt-2" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const WizardTabs = ({ activeTab, onTabChange, tabs }) => {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-1 md:grid-cols-4">
        {tabs.map(tab => (
          <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2">
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map(tab => (
        <TabsContent key={tab.value} value={tab.value} className="mt-6">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
};

const buildWizardTabs = (impurityPanel) => [
  {
    value: 'manufacturing',
    label: 'Manufacturing',
    icon: Factory,
    content: <ManufacturingProcessPanel />,
  },
  {
    value: 'control-strategy',
    label: 'Control Strategy',
    icon: Shield,
    content: <ControlStrategyPanel />,
  },
  {
    value: 'risk-assessment',
    label: 'Risk Assessment',
    icon: AlertTriangle,
    content: <QualityRiskAssessment />,
  },
  {
    value: 'impurities',
    label: 'Impurities',
    icon: AlertTriangle,
    content: impurityPanel,
  },
];

const ImpuritiesPanel = ({
  impurities,
  onChange,
  onAdd,
  onRemove,
  complianceIssues,
  onGenerate,
  narrative,
  generating,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async content => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Clipboard copy failed', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Impurities</CardTitle>
        <CardDescription>Capture impurity levels for ICH Q3A/Q3B screening</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {impurities.map((impurity, index) => (
          <div key={`${impurity.name}-${index}`} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2">
              <Input
                placeholder="Impurity name"
                value={impurity.name}
                onChange={event => onChange(index, 'name', event.target.value)}
              />
            </div>
            <div>
              <Input
                placeholder="Result (%)"
                value={impurity.result}
                onChange={event => onChange(index, 'result', event.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={impurity.identified}
                onCheckedChange={checked => onChange(index, 'identified', Boolean(checked))}
              />
              <span className="text-sm text-slate-600">Identified</span>
            </div>
            <div className="flex items-center justify-end">
              <Button variant="outline" size="sm" onClick={() => onRemove(index)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button variant="outline" onClick={onAdd}>
            Add impurity
          </Button>
        </div>
        {complianceIssues.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div className="font-semibold mb-2">Compliance Issues</div>
            <ul className="list-disc list-inside space-y-1">
              {complianceIssues.map(issue => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 border-t border-slate-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <FileText size={16} className="text-purple-600" />
              Module 3.2.S.4.5 Justification
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerate}
              disabled={generating}
              className="text-purple-600 border-purple-200 hover:bg-purple-50"
            >
              {generating ? <Loader className="animate-spin mr-2" size={14} /> : <Sparkles className="mr-2" size={14} />}
              Generate Narrative
            </Button>
          </div>

          {narrative && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-sm text-slate-800">{narrative.title}</h4>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${
                    narrative.risk_assessment?.toLowerCase().includes('high')
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  Risk: {narrative.risk_assessment}
                </span>
              </div>
              <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 rounded border border-slate-100">
                {narrative.content_body}
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(narrative.content_body)}
                  className="text-slate-500 hover:text-purple-600"
                >
                  {copied ? <Check className="mr-2" size={12} /> : <Copy className="mr-2" size={12} />}
                  {copied ? 'Copied' : 'Copy to clipboard'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const CmcWizard = () => {
  const [activeTab, setActiveTab] = useState('manufacturing');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [projectId, setProjectId] = useState(() => localStorage.getItem('cmcProjectId') || '');
  const [projectTitle, setProjectTitle] = useState(PROJECT_DATA.name);
  const [moduleType, setModuleType] = useState('3.2.P');
  const [impurities, setImpurities] = useState([
    { name: '', result: '', identified: false },
  ]);
  const [complianceIssues, setComplianceIssues] = useState([]);
  const [narrative, setNarrative] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    document.title = 'TrialSage | CMC Wizard';
  }, []);

  const getAuthToken = () => {
    return localStorage.getItem('accessToken') || localStorage.getItem('token');
  };

  const getOrganizationId = () => {
    return (
      localStorage.getItem('organizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      ''
    );
  };

  const buildPayloadData = () => {
    return {
      manufacturing: {
        metrics: MANUFACTURING_METRICS,
        site: PROJECT_DATA.manufacturingSite,
      },
      control_strategy: {
        stage: PROJECT_DATA.developmentStage,
      },
      impurities: impurities.map(impurity => ({
        name: impurity.name,
        result: impurity.result,
        identified: impurity.identified,
      })),
      project_meta: {
        drugName: PROJECT_DATA.drugName,
        dosageForm: PROJECT_DATA.dosageForm,
        indication: PROJECT_DATA.indication,
      },
    };
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const organizationId = getOrganizationId();
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (organizationId) headers['x-organization-id'] = organizationId;

      const payload = {
        id: projectId || undefined,
        title: projectTitle,
        type: moduleType,
        data: buildPayloadData(),
      };

      const response = await fetch('/api/cmc/save', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save project');
      }

      if (result.id) {
        setProjectId(result.id);
        localStorage.setItem('cmcProjectId', result.id);
      }

      toast({
        title: 'Project Saved',
        description: 'Your CMC manufacturing project has been saved successfully.',
      });
    } catch (error) {
      toast({
        title: 'Save failed',
        description: getErrorMessage(error) || 'Failed to save project',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const runComplianceCheck = async () => {
    try {
      const token = getAuthToken();
      const organizationId = getOrganizationId();
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (organizationId) headers['x-organization-id'] = organizationId;

      const response = await fetch('/api/cmc/audit', {
        method: 'POST',
        headers,
        body: JSON.stringify({ impurities, type: moduleType }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Compliance audit failed');
      }

      setComplianceIssues(result.issues || []);

      toast({
        title: result.compliant ? 'Compliance passed' : 'Compliance issues detected',
        description: result.compliant
          ? 'No ICH Q3A/Q3B issues detected.'
          : 'Review the compliance issues list.',
        variant: result.compliant ? 'default' : 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Compliance check failed',
        description: getErrorMessage(error) || 'Failed to validate compliance',
        variant: 'destructive',
      });
    }
  };

  const generateJustification = async () => {
    setGenerating(true);
    try {
      const token = getAuthToken();
      const organizationId = getOrganizationId();
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (organizationId) headers['x-organization-id'] = organizationId;

      const response = await fetch('/api/writer/draft', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sectionType: 'cmc_justification',
          context: projectTitle,
          cmcData: buildPayloadData(),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate narrative');
      }

      setNarrative(result.data || null);
    } catch (error) {
      toast({
        title: 'Narrative generation failed',
        description: getErrorMessage(error) || 'Failed to generate narrative',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleImpurityChange = (index, field, value) => {
    setImpurities(prev =>
      prev.map((impurity, idx) => (idx === index ? { ...impurity, [field]: value } : impurity))
    );
  };

  const handleAddImpurity = () => {
    setImpurities(prev => [...prev, { name: '', result: '', identified: false }]);
  };

  const handleRemoveImpurity = index => {
    setImpurities(prev => prev.filter((_, idx) => idx !== index));
  };

  useEffect(() => {
    const loadProject = async () => {
      if (!projectId) return;
      try {
        const token = getAuthToken();
        const organizationId = getOrganizationId();
        const headers = {
          'Content-Type': 'application/json',
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (organizationId) headers['x-organization-id'] = organizationId;

        const response = await fetch(`/api/cmc/${projectId}`, { headers });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Failed to load project');
        }

        setProjectTitle(result.project_title || PROJECT_DATA.name);
        setModuleType(result.module_type || '3.2.P');
        const storedImpurities = Array.isArray(result.data?.impurities)
          ? result.data.impurities
          : [];
        if (storedImpurities.length > 0) {
          setImpurities(
            storedImpurities.map(item => ({
              name: item.name || '',
              result: item.result ?? '',
              identified: Boolean(item.identified),
            }))
          );
        }
      } catch (error) {
        toast({
          title: 'Load failed',
          description: getErrorMessage(error) || 'Unable to load CMC project',
          variant: 'destructive',
        });
      }
    };

    loadProject();
  }, [projectId, toast]);

  const impurityPanel = (
    <ImpuritiesPanel
      impurities={impurities}
      onChange={handleImpurityChange}
      onAdd={handleAddImpurity}
      onRemove={handleRemoveImpurity}
      complianceIssues={complianceIssues}
      onGenerate={generateJustification}
      narrative={narrative}
      generating={generating}
    />
  );

  const wizardTabs = buildWizardTabs(impurityPanel);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <CmcHeader
        projectData={PROJECT_DATA}
        loading={loading}
        onSave={handleSave}
        onValidate={runComplianceCheck}
      />

      <div className="container mx-auto py-6 px-6">
        <ProjectOverview
          projectData={PROJECT_DATA}
          projectTitle={projectTitle}
          onTitleChange={setProjectTitle}
          moduleType={moduleType}
          onModuleTypeChange={setModuleType}
        />

        <ReadinessOverview metrics={MANUFACTURING_METRICS} />

        <WizardTabs activeTab={activeTab} onTabChange={setActiveTab} tabs={wizardTabs} />
      </div>
    </div>
  );
};

export default CmcWizard;
