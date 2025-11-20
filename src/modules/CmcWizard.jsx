
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Factory,
  Settings,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  Target,
  Activity,
  Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ManufacturingProcessPanel from '../components/cmc/ManufacturingProcessPanel';

const CmcWizard = () => {
  const [activeTab, setActiveTab] = useState('manufacturing');
  const [projectData, setProjectData] = useState({
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
  });

  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    document.title = 'TrialSage | CMC Wizard';
  }, []);

  // Manufacturing readiness metrics
  const manufacturingMetrics = {
    processReadiness: 78,
    ppqProgress: 45,
    deviationRate: 2.3,
    releaseTime: 4.2,
    oeeScore: 72,
    complianceScore: 94
  };

  const handleSave = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast({
        title: "Project Saved",
        description: "Your CMC manufacturing project has been saved successfully.",
      });
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
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
              <Button onClick={handleSave} disabled={loading}>
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

      {/* Project Overview */}
      <div className="container mx-auto py-6 px-6">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              {projectData.name}
            </CardTitle>
            <CardDescription>
              {projectData.drugName} • {projectData.dosageForm} • {projectData.indication}
            </CardDescription>
          </CardHeader>
          <CardContent>
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

        {/* Manufacturing Readiness Overview */}
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
                <div className="text-2xl font-bold text-blue-600">{manufacturingMetrics.processReadiness}%</div>
                <p className="text-sm text-gray-600">Process Readiness</p>
                <Progress value={manufacturingMetrics.processReadiness} className="mt-2" />
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{manufacturingMetrics.ppqProgress}%</div>
                <p className="text-sm text-gray-600">PPQ Progress</p>
                <Progress value={manufacturingMetrics.ppqProgress} className="mt-2" />
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{manufacturingMetrics.complianceScore}%</div>
                <p className="text-sm text-gray-600">Compliance Score</p>
                <Progress value={manufacturingMetrics.complianceScore} className="mt-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main CMC Wizard Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="manufacturing" className="flex items-center gap-2">
              <Factory className="w-4 h-4" />
              Manufacturing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manufacturing" className="mt-6">
            <ManufacturingProcessPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CmcWizard;
