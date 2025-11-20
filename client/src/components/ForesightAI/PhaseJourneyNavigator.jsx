import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Activity, 
  Brain, 
  Target, 
  TrendingUp, 
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
  Zap
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

const phaseConfig = {
  '0/I': {
    title: 'Phase 0/I: IND & FIH',
    color: 'bg-purple-500',
    icon: <Zap className="w-5 h-5" />,
    modules: ['Dose Escalation', 'IND Narrative', 'Cross-Species PK/PD']
  },
  'II': {
    title: 'Phase II: Proof-of-Concept',
    color: 'bg-blue-500',
    icon: <Target className="w-5 h-5" />,
    modules: ['Enrollment Stratifier', 'APRIL', 'SAECIN', 'SCA Generator']
  },
  'III': {
    title: 'Phase III: Execution',
    color: 'bg-green-500',
    icon: <TrendingUp className="w-5 h-5" />,
    modules: ['CTD Builder', 'Patient Narratives', 'Regulatory Benchmarking', 'Label Claims']
  },
  'IV': {
    title: 'Phase IV: Post-Market',
    color: 'bg-red-500',
    icon: <Activity className="w-5 h-5" />,
    modules: ['RWE Bridging', 'Indication Expansion']
  }
};

function PhaseCard({ phase, status, score, isActive, onClick }) {
  const config = phaseConfig[phase];
  const statusIcons = {
    completed: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    active: <Circle className="w-4 h-4 text-blue-500 animate-pulse" />,
    upcoming: <Clock className="w-4 h-4 text-gray-400" />,
    future: <Circle className="w-4 h-4 text-gray-300" />
  };

  return (
    <div 
      onClick={onClick}
      className={`relative cursor-pointer transition-all duration-300 ${
        isActive ? 'scale-105' : 'hover:scale-102'
      }`}
    >
      <Card className={`border-2 ${isActive ? 'border-blue-500 shadow-lg' : 'border-gray-200'}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${config.color} text-white`}>
                {config.icon}
              </div>
              <div>
                <h3 className="font-semibold text-sm">{phase}</h3>
                <p className="text-xs text-gray-500 capitalize">{status}</p>
              </div>
            </div>
            {statusIcons[status]}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {score !== null && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Success Score</span>
                <span className={`font-bold ${score > 70 ? 'text-green-600' : score > 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {score}%
                </span>
              </div>
              <Progress value={score} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>
      {isActive && (
        <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-blue-500"></div>
      )}
    </div>
  );
}

function ActivePhaseModules({ phase, studyId }) {
  const config = phaseConfig[phase];
  
  // Mock data for now - will connect to real endpoints
  const moduleStatus = {
    'Dose Escalation': { status: 'active', progress: 65 },
    'IND Narrative': { status: 'completed', progress: 100 },
    'Cross-Species PK/PD': { status: 'pending', progress: 0 },
    'Enrollment Stratifier': { status: 'active', progress: 45 },
    'APRIL': { status: 'pending', progress: 0 },
    'SAECIN': { status: 'active', progress: 30 },
    'SCA Generator': { status: 'pending', progress: 0 },
    'CTD Builder': { status: 'pending', progress: 0 },
    'Patient Narratives': { status: 'pending', progress: 0 },
    'Regulatory Benchmarking': { status: 'pending', progress: 0 },
    'Label Claims': { status: 'pending', progress: 0 },
    'RWE Bridging': { status: 'pending', progress: 0 },
    'Indication Expansion': { status: 'pending', progress: 0 }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {config.modules.map((module) => {
        const status = moduleStatus[module] || { status: 'pending', progress: 0 };
        return (
          <Card key={module} className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{module}</CardTitle>
                <Badge variant={
                  status.status === 'completed' ? 'success' : 
                  status.status === 'active' ? 'default' : 
                  'secondary'
                }>
                  {status.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={status.progress} className="h-2 mb-2" />
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full"
                disabled={status.status === 'pending'}
              >
                {status.status === 'completed' ? 'View Results' : 
                 status.status === 'active' ? 'Continue' : 
                 'Start'}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function InsightsPanel({ studyId, phase }) {
  // Mock insights data - will connect to ForesightAI API
  const insights = {
    translational: {
      score: 78,
      trend: 'up',
      message: 'Strong preclinical-clinical correlation detected'
    },
    risk: {
      level: 'medium',
      factors: ['Small sample size', 'Novel endpoint'],
      score: 45
    },
    probability: {
      success: 72,
      confidence: [65, 79],
      similar_trials: 12
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-500" />
            Translational Feedback
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Correlation Score</span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{insights.translational.score}%</span>
              {insights.translational.trend === 'up' && 
                <TrendingUp className="w-4 h-4 text-green-500" />
              }
            </div>
          </div>
          <p className="text-xs text-gray-500">{insights.translational.message}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            Risk Evolution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Risk Level</span>
              <Badge variant={insights.risk.level === 'high' ? 'destructive' : 'warning'}>
                {insights.risk.level}
              </Badge>
            </div>
            <div className="space-y-1">
              {insights.risk.factors.map((factor, idx) => (
                <div key={idx} className="text-xs text-gray-500 flex items-center gap-1">
                  <Circle className="w-2 h-2" />
                  {factor}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-500" />
            Success Probability
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">
              {insights.probability.success}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              CI: {insights.probability.confidence[0]}-{insights.probability.confidence[1]}%
            </div>
            <div className="text-xs text-gray-400 mt-2">
              Based on {insights.probability.similar_trials} similar trials
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PhaseJourneyNavigator({ studyId = "STUDY001" }) {
  const [currentPhase, setCurrentPhase] = useState('II');
  const [activeTab, setActiveTab] = useState('modules');

  // Query for study predictions from ForesightAI
  const { data: predictions, isLoading } = useQuery({
    queryKey: ['/api/foresight/score', studyId, currentPhase],
    enabled: false // Will enable when API is connected
  });

  const phaseData = [
    { phase: '0/I', status: 'completed', score: 92 },
    { phase: 'II', status: 'active', score: 78 },
    { phase: 'III', status: 'upcoming', score: null },
    { phase: 'IV', status: 'future', score: null }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-8 h-8 text-purple-500" />
            ForesightAI™ Journey Navigator
          </h1>
          <p className="text-gray-500 mt-1">
            Intelligent guidance through your drug development journey
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          Study: {studyId}
        </Badge>
      </div>

      {/* Phase Journey Bar */}
      <div className="grid grid-cols-4 gap-4">
        {phaseData.map((data) => (
          <PhaseCard
            key={data.phase}
            phase={data.phase}
            status={data.status}
            score={data.score}
            isActive={data.phase === currentPhase}
            onClick={() => setCurrentPhase(data.phase)}
          />
        ))}
      </div>

      {/* Current Phase Alert */}
      <Alert className="border-blue-200 bg-blue-50">
        <Activity className="h-4 w-4" />
        <AlertDescription>
          <strong>Current Phase:</strong> {phaseConfig[currentPhase].title} | 
          <strong className="ml-2">Next Milestone:</strong> Interim Analysis (Week 12)
        </AlertDescription>
      </Alert>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="modules">Active Modules</TabsTrigger>
              <TabsTrigger value="recommendations">AI Recommendations</TabsTrigger>
            </TabsList>
            <TabsContent value="modules" className="mt-4">
              <ActivePhaseModules phase={currentPhase} studyId={studyId} />
            </TabsContent>
            <TabsContent value="recommendations" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>ForesightAI™ Recommendations</CardTitle>
                  <CardDescription>
                    Based on your Phase {currentPhase} progress
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Alert>
                    <Zap className="h-4 w-4" />
                    <AlertDescription>
                      <strong>High Priority:</strong> Consider adaptive dose ranging based on Phase I results
                    </AlertDescription>
                  </Alert>
                  <Alert>
                    <Target className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Enrollment:</strong> 3 sites showing 87% enrollment probability
                    </AlertDescription>
                  </Alert>
                  <Alert>
                    <TrendingUp className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Endpoint:</strong> Modified primary endpoint increases success by 23%
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
        
        <div>
          <h3 className="text-lg font-semibold mb-4">Cross-Phase Insights</h3>
          <InsightsPanel studyId={studyId} phase={currentPhase} />
        </div>
      </div>
    </div>
  );
}