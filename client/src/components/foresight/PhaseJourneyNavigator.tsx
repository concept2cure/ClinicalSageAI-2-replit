import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  ArrowRight,
  Brain,
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Activity,
  Beaker,
  Users,
  FileText,
  BarChart3,
  Lightbulb,
  Zap,
  FlaskConical,
  Shield,
  Rocket,
  Package,
  Globe,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface PhaseModule {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'coming_soon' | 'locked';
  icon?: any;
}

interface Prediction {
  id: string;
  studyId: string;
  phase: string;
  successScore: number;
  confidenceInterval: { lower: number; upper: number };
  riskFactors: Array<{ factor: string; impact: number; description: string }>;
  recommendations: Array<{ type: string; priority: string; action: string }>;
  similarTrials: Array<{ id: string; title: string; similarity: number }>;
}

const PhaseJourneyNavigator: React.FC = () => {
  const [selectedPhase, setSelectedPhase] = useState<string>('II');
  const [selectedStudy, setSelectedStudy] = useState<string>('');
  const queryClient = useQueryClient();

  // Fetch phase modules
  const { data: phaseModules, isLoading: modulesLoading } = useQuery({
    queryKey: ['/api/foresight/phase', selectedPhase, 'modules'],
    queryFn: async () => {
      const response = await fetch(`/api/foresight/phase/${selectedPhase}/modules`);
      if (!response.ok) throw new Error('Failed to fetch phase modules');
      return response.json();
    },
  });

  // Fetch predictions for current study
  const { data: prediction, isLoading: predictionLoading } = useQuery({
    queryKey: ['/api/foresight/predictions', selectedStudy],
    queryFn: async () => {
      if (!selectedStudy) return null;
      const response = await apiRequest(`/api/foresight/score`, 'POST', {
        studyId: selectedStudy,
        phase: selectedPhase,
        indication: 'Type 2 Diabetes', // This would come from study data
        sampleSize: 150,
      });
      return response.prediction;
    },
    enabled: !!selectedStudy,
  });

  // Phase journey stages
  const phases = [
    { id: '0', label: 'Phase 0', description: 'Exploratory', icon: Beaker },
    { id: 'I', label: 'Phase I', description: 'First-in-Human', icon: Shield },
    { id: 'II', label: 'Phase II', description: 'Proof of Concept', icon: Target },
    { id: 'III', label: 'Phase III', description: 'Pivotal', icon: Users },
    { id: 'IV', label: 'Phase IV', description: 'Post-Market', icon: Globe },
  ];

  const getPhaseIcon = (phaseId: string) => {
    const phase = phases.find(p => p.id === phaseId);
    return phase?.icon || Brain;
  };

  const getSuccessColor = (score: number) => {
    if (score >= 0.7) return 'text-green-600';
    if (score >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSuccessLabel = (score: number) => {
    if (score >= 0.7) return 'High Success Probability';
    if (score >= 0.5) return 'Moderate Success Probability';
    return 'Low Success Probability';
  };

  const moduleIcons: Record<string, any> = {
    'dose-escalation': FlaskConical,
    'ind-narrative': FileText,
    'pk-pd-translation': Activity,
    'enrollment-stratifier': Users,
    'april': Zap,
    'saecin': AlertTriangle,
    'sca-generator': Brain,
    'ctd-builder': Package,
    'patient-narrative': FileText,
    'regulatory-benchmark': BarChart3,
    'label-claims': Shield,
    'rwe-bridging': Globe,
    'indication-expansion': Rocket,
  };

  return (
    <div className="space-y-6">
      {/* Header with Success Score */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">ForesightAI™ Phase Journey</h2>
          <p className="text-muted-foreground mt-1">
            Translational intelligence predicting clinical success across all phases
          </p>
        </div>
        {prediction && (
          <Card className="w-64">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Success Prediction</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className={`text-2xl font-bold ${getSuccessColor(prediction.successScore)}`}>
                    {(prediction.successScore * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {prediction.confidenceInterval.lower.toFixed(2)} - {prediction.confidenceInterval.upper.toFixed(2)}
                  </p>
                </div>
                {prediction.successScore >= 0.7 ? (
                  <CheckCircle className="h-8 w-8 text-green-600" />
                ) : prediction.successScore >= 0.5 ? (
                  <Activity className="h-8 w-8 text-yellow-600" />
                ) : (
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                )}
              </div>
              <Badge variant="outline" className="mt-2">
                {getSuccessLabel(prediction.successScore)}
              </Badge>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Phase Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Clinical Development Timeline</CardTitle>
          <CardDescription>Navigate through development phases</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {phases.map((phase, index) => {
              const Icon = phase.icon;
              const isActive = phase.id === selectedPhase;
              const isCompleted = phases.findIndex(p => p.id === selectedPhase) > index;
              
              return (
                <div key={phase.id} className="flex items-center">
                  <button
                    onClick={() => setSelectedPhase(phase.id)}
                    className={`flex flex-col items-center p-3 rounded-lg transition-all ${
                      isActive 
                        ? 'bg-primary text-primary-foreground' 
                        : isCompleted 
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    <Icon className="h-6 w-6 mb-1" />
                    <span className="text-sm font-medium">{phase.label}</span>
                    <span className="text-xs opacity-75">{phase.description}</span>
                  </button>
                  {index < phases.length - 1 && (
                    <ArrowRight className={`mx-2 h-5 w-5 ${
                      isCompleted ? 'text-green-500' : 'text-gray-300'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Phase-Specific Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {phaseModules?.modules?.map((module: PhaseModule) => {
          const Icon = moduleIcons[module.id] || Brain;
          
          return (
            <Card 
              key={module.id} 
              className={`transition-all hover:shadow-lg ${
                module.status === 'locked' ? 'opacity-60' : ''
              }`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <Icon className="h-8 w-8 text-primary" />
                  <Badge 
                    variant={
                      module.status === 'active' ? 'default' : 
                      module.status === 'coming_soon' ? 'secondary' : 
                      'outline'
                    }
                  >
                    {module.status === 'active' ? 'Active' : 
                     module.status === 'coming_soon' ? 'Coming Soon' : 
                     'Locked'}
                  </Badge>
                </div>
                <CardTitle className="text-lg mt-2">{module.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {module.description}
                </p>
                <Button 
                  className="w-full" 
                  variant={module.status === 'active' ? 'default' : 'outline'}
                  disabled={module.status !== 'active'}
                  data-testid={`button-launch-${module.id}`}
                >
                  {module.status === 'active' ? 'Launch Module' : 
                   module.status === 'coming_soon' ? 'Coming Soon' : 
                   'Unlock with Upgrade'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Risk Factors and Recommendations */}
      {prediction && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Risk Factors */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Risk Factors
              </CardTitle>
              <CardDescription>
                Factors impacting success probability
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {prediction.riskFactors?.map((risk: any, index: number) => (
                  <Alert key={index} variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{risk.factor.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</AlertTitle>
                    <AlertDescription>
                      {risk.description} (Impact: {(risk.impact * 100).toFixed(0)}%)
                    </AlertDescription>
                  </Alert>
                ))}
                {(!prediction.riskFactors || prediction.riskFactors.length === 0) && (
                  <p className="text-sm text-muted-foreground">No significant risk factors identified</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                AI Recommendations
              </CardTitle>
              <CardDescription>
                Actions to improve success probability
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {prediction.recommendations?.map((rec: any, index: number) => (
                  <div key={index} className="border-l-4 border-primary pl-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'}>
                        {rec.priority}
                      </Badge>
                      <span className="text-sm font-medium capitalize">{rec.type}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{rec.action}</p>
                  </div>
                ))}
                {(!prediction.recommendations || prediction.recommendations.length === 0) && (
                  <p className="text-sm text-muted-foreground">No recommendations at this time</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Knowledge Graph Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Translational Knowledge Graph
          </CardTitle>
          <CardDescription>
            Biomarker-endpoint relationships from {selectedPhase === '0' ? 'Phase 0' : `Phase ${selectedPhase}`} studies
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-gradient-to-br from-primary/5 to-secondary/5 rounded-lg flex items-center justify-center">
            <div className="text-center">
              <Brain className="h-12 w-12 text-primary mb-2 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Knowledge graph visualization
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                data-testid="button-explore-graph"
              >
                Explore Full Graph
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PhaseJourneyNavigator;