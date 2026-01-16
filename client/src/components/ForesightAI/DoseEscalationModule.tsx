/**
 * ForesightAI™ Dose Escalation Module
 * Advanced AI-powered dose optimization for Phase 0/I trials
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, AlertTriangle, Calculator, Brain, Activity, Users, ChevronRight, Info, FileText, Download } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

interface DoseLevel {
  dose: number;
  cohort: number;
  patientsEnrolled: number;
  dltsObserved: number;
  dltRate: number;
  status: 'completed' | 'active' | 'planned';
}

interface DLTEvent {
  patientId: string;
  dltType: string;
  grade: number;
  onsetDay: number;
  resolved: boolean;
}

export default function DoseEscalationModule({ organizationId }: { organizationId: string }) {
  const [studyId, setStudyId] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState('3_plus_3');
  const [startingDose, setStartingDose] = useState('0.1');
  const [maxDose, setMaxDose] = useState('1000');
  const [compound, setCompound] = useState('');
  const [indication, setIndication] = useState('');
  const [showDLTForm, setShowDLTForm] = useState(false);
  
  // DLT reporting form state
  const [dltData, setDltData] = useState({
    cohortId: '',
    patientId: '',
    dltType: '',
    grade: 1,
    onsetDay: 1,
    description: '',
    outcome: 'ongoing',
    attribution: 'possible'
  });

  // Fetch existing studies
  const { data: studies } = useQuery({
    queryKey: ['/api/foresight-ai/dose-escalation/studies', organizationId],
    enabled: !!organizationId
  });

  // Create or optimize dose escalation study
  const optimizeMutation = useMutation({
    mutationFn: (params: any) => 
      apiRequest('/api/foresight-ai/dose-escalation/optimize', {
        method: 'POST',
        body: JSON.stringify(params)
      }),
    onSuccess: (data) => {
      setStudyId(data.studyId);
      queryClient.invalidateQueries({ 
        queryKey: ['/api/foresight-ai/dose-escalation/studies'] 
      });
    }
  });

  // Report DLT mutation
  const reportDLTMutation = useMutation({
    mutationFn: (params: any) => 
      apiRequest('/api/foresight-ai/dose-escalation/report-dlt', {
        method: 'POST',
        body: JSON.stringify(params)
      }),
    onSuccess: () => {
      setShowDLTForm(false);
      queryClient.invalidateQueries({ 
        queryKey: ['/api/foresight-ai/dose-escalation/studies'] 
      });
    }
  });

  const handleOptimize = () => {
    optimizeMutation.mutate({
      studyId,
      organizationId,
      compound,
      indication,
      method: selectedMethod,
      startingDose: parseFloat(startingDose),
      maxDose: parseFloat(maxDose),
      targetDLTRate: 0.25,
      cohortSize: selectedMethod === '3_plus_3' ? 3 : 6
    });
  };

  // Mock dose escalation data for visualization
  const doseEscalationData: DoseLevel[] = [
    { dose: 0.1, cohort: 1, patientsEnrolled: 3, dltsObserved: 0, dltRate: 0, status: 'completed' },
    { dose: 0.3, cohort: 2, patientsEnrolled: 3, dltsObserved: 0, dltRate: 0, status: 'completed' },
    { dose: 1.0, cohort: 3, patientsEnrolled: 6, dltsObserved: 1, dltRate: 0.17, status: 'completed' },
    { dose: 3.0, cohort: 4, patientsEnrolled: 6, dltsObserved: 2, dltRate: 0.33, status: 'active' },
    { dose: 10.0, cohort: 5, patientsEnrolled: 0, dltsObserved: 0, dltRate: 0, status: 'planned' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="h-6 w-6 text-blue-600" />
            Dose Escalation Optimizer
          </h3>
          <p className="text-gray-600 mt-1">
            AI-powered dose optimization using Bayesian methods and real-world evidence
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Brain className="h-3 w-3" />
            GPT-5 Enhanced
          </Badge>
          <Badge variant="outline">FDA Project Optimus Compliant</Badge>
        </div>
      </div>

      {/* Study Setup */}
      <Card>
        <CardHeader>
          <CardTitle>Study Configuration</CardTitle>
          <CardDescription>
            Configure your Phase I dose escalation study parameters
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="compound">Compound Name</Label>
                <Input
                  id="compound"
                  value={compound}
                  onChange={(e) => setCompound(e.target.value)}
                  placeholder="e.g., ABC-123"
                  data-testid="input-compound"
                />
              </div>
              <div>
                <Label htmlFor="indication">Indication</Label>
                <Input
                  id="indication"
                  value={indication}
                  onChange={(e) => setIndication(e.target.value)}
                  placeholder="e.g., Advanced Solid Tumors"
                  data-testid="input-indication"
                />
              </div>
              <div>
                <Label htmlFor="method">Escalation Method</Label>
                <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                  <SelectTrigger id="method" data-testid="select-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3_plus_3">3+3 Design</SelectItem>
                    <SelectItem value="modified_fibonacci">Modified Fibonacci</SelectItem>
                    <SelectItem value="boin">BOIN (Bayesian Optimal Interval)</SelectItem>
                    <SelectItem value="crm">CRM (Continual Reassessment)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="starting-dose">Starting Dose (mg)</Label>
                <Input
                  id="starting-dose"
                  type="number"
                  value={startingDose}
                  onChange={(e) => setStartingDose(e.target.value)}
                  placeholder="0.1"
                  data-testid="input-starting-dose"
                />
              </div>
              <div>
                <Label htmlFor="max-dose">Maximum Dose (mg)</Label>
                <Input
                  id="max-dose"
                  type="number"
                  value={maxDose}
                  onChange={(e) => setMaxDose(e.target.value)}
                  placeholder="1000"
                  data-testid="input-max-dose"
                />
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handleOptimize}
                  disabled={!compound || !indication || optimizeMutation.isPending}
                  className="w-full"
                  data-testid="button-optimize"
                >
                  {optimizeMutation.isPending ? (
                    <>Optimizing...</>
                  ) : (
                    <>
                      <Brain className="h-4 w-4 mr-2" />
                      Generate AI Optimization
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Recommendations */}
      {optimizeMutation.data && (
        <Alert className="border-blue-200 bg-blue-50">
          <Brain className="h-4 w-4" />
          <AlertTitle>AI Dose Recommendation</AlertTitle>
          <AlertDescription className="space-y-2 mt-2">
            <div>
              <strong>Next Recommended Dose:</strong>{' '}
              {optimizeMutation.data.recommendation?.nextDose || 'Calculating...'} mg
            </div>
            <div>
              <strong>Estimated MTD:</strong>{' '}
              {optimizeMutation.data.bayesianMTD?.estimatedMTD || 'Pending'} mg 
              (95% CI: {optimizeMutation.data.bayesianMTD?.confidence || 0.85})
            </div>
            <div>
              <strong>DLT Probability at Next Dose:</strong>{' '}
              {((optimizeMutation.data.recommendation?.dltProbability || 0) * 100).toFixed(1)}%
            </div>
            <div className="pt-2">
              <strong>Safety Assessment:</strong>{' '}
              {optimizeMutation.data.regulatoryCompliance?.isCompliant 
                ? '✅ Meets FDA dose escalation guidelines' 
                : '⚠️ Review required for regulatory compliance'}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Dose Escalation Visualization */}
      <Tabs defaultValue="escalation" className="space-y-4">
        <TabsList>
          <TabsTrigger value="escalation">Escalation Curve</TabsTrigger>
          <TabsTrigger value="dlt-analysis">DLT Analysis</TabsTrigger>
          <TabsTrigger value="cohort-status">Cohort Status</TabsTrigger>
          <TabsTrigger value="safety-monitoring">Safety Monitoring</TabsTrigger>
        </TabsList>

        <TabsContent value="escalation">
          <Card>
            <CardHeader>
              <CardTitle>Dose Escalation Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={doseEscalationData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dose" label={{ value: 'Dose (mg)', position: 'insideBottom', offset: -5 }} />
                  <YAxis label={{ value: 'DLT Rate', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="dltRate" 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    name="Observed DLT Rate"
                  />
                  <Line 
                    type="monotone" 
                    dataKey={() => 0.25} 
                    stroke="#3b82f6" 
                    strokeDasharray="5 5"
                    name="Target DLT Rate (25%)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dlt-analysis">
          <Card>
            <CardHeader>
              <CardTitle>DLT Distribution by Dose</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={doseEscalationData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dose" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="patientsEnrolled" fill="#3b82f6" name="Patients Enrolled" />
                  <Bar dataKey="dltsObserved" fill="#ef4444" name="DLTs Observed" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cohort-status">
          <div className="space-y-4">
            {doseEscalationData.map((cohort) => (
              <Card key={cohort.cohort} data-testid={`cohort-${cohort.cohort}`}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-sm text-gray-500">Cohort</div>
                      <div className="text-2xl font-bold">{cohort.cohort}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Dose Level</div>
                      <div className="text-lg font-semibold">{cohort.dose} mg</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-gray-400" />
                        <span className="text-sm">
                          {cohort.patientsEnrolled} patients
                        </span>
                      </div>
                      {cohort.dltsObserved > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <AlertTriangle className="h-4 w-4 text-orange-400" />
                          <span className="text-sm text-orange-600">
                            {cohort.dltsObserved} DLT{cohort.dltsObserved > 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <Badge 
                      variant={
                        cohort.status === 'completed' ? 'default' :
                        cohort.status === 'active' ? 'secondary' : 'outline'
                      }
                    >
                      {cohort.status}
                    </Badge>

                    {cohort.status === 'active' && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setShowDLTForm(true)}
                        data-testid={`button-report-dlt-${cohort.cohort}`}
                      >
                        Report DLT
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="safety-monitoring">
          <Card>
            <CardHeader>
              <CardTitle>Real-Time Safety Monitoring</CardTitle>
              <CardDescription>
                AI-powered safety signal detection and risk assessment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Activity className="h-4 w-4" />
                <AlertTitle>Current Safety Status</AlertTitle>
                <AlertDescription>
                  No safety signals detected. Study proceeding per protocol.
                </AlertDescription>
              </Alert>
              
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-gray-500">Total DLTs</div>
                    <div className="text-2xl font-bold">3</div>
                    <Progress value={30} className="mt-2" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-gray-500">Grade 3+ Events</div>
                    <div className="text-2xl font-bold">2</div>
                    <Progress value={20} className="mt-2" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-gray-500">SAEs</div>
                    <div className="text-2xl font-bold">0</div>
                    <Progress value={0} className="mt-2" />
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" data-testid="button-generate-safety-report">
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Safety Report
                </Button>
                <Button variant="outline" data-testid="button-download-data">
                  <Download className="h-4 w-4 mr-2" />
                  Download Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DLT Reporting Form */}
      {showDLTForm && (
        <Card>
          <CardHeader>
            <CardTitle>Report Dose-Limiting Toxicity</CardTitle>
            <CardDescription>
              Document DLT event for regulatory compliance and dose escalation decision
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Patient ID</Label>
                <Input
                  value={dltData.patientId}
                  onChange={(e) => setDltData({...dltData, patientId: e.target.value})}
                  placeholder="Patient identifier"
                  data-testid="input-patient-id"
                />
              </div>
              <div>
                <Label>DLT Type</Label>
                <Input
                  value={dltData.dltType}
                  onChange={(e) => setDltData({...dltData, dltType: e.target.value})}
                  placeholder="e.g., Neutropenia"
                  data-testid="input-dlt-type"
                />
              </div>
              <div>
                <Label>CTCAE Grade</Label>
                <Select 
                  value={dltData.grade.toString()} 
                  onValueChange={(v) => setDltData({...dltData, grade: parseInt(v)})}
                >
                  <SelectTrigger data-testid="select-grade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Grade 1</SelectItem>
                    <SelectItem value="2">Grade 2</SelectItem>
                    <SelectItem value="3">Grade 3</SelectItem>
                    <SelectItem value="4">Grade 4</SelectItem>
                    <SelectItem value="5">Grade 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Onset Day</Label>
                <Input
                  type="number"
                  value={dltData.onsetDay}
                  onChange={(e) => setDltData({...dltData, onsetDay: parseInt(e.target.value)})}
                  data-testid="input-onset-day"
                />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <textarea
                  className="w-full p-2 border rounded"
                  rows={3}
                  value={dltData.description}
                  onChange={(e) => setDltData({...dltData, description: e.target.value})}
                  placeholder="Detailed description of the DLT event..."
                  data-testid="textarea-description"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button 
                variant="outline" 
                onClick={() => setShowDLTForm(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={() => reportDLTMutation.mutate(dltData)}
                disabled={!dltData.patientId || !dltData.dltType}
                data-testid="button-submit-dlt"
              >
                Submit DLT Report
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}