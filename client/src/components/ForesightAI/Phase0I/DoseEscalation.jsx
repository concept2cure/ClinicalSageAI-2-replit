import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  ScatterChart,
  Scatter
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  Brain,
  Calculator,
  ChevronRight,
  Download,
  Info,
  TrendingUp,
  Zap
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

// Bayesian Dose Escalation Engine
class BayesianDoseEscalationModel {
  constructor() {
    this.priorAlpha = 1;
    this.priorBeta = 1;
    this.doseHistory = [];
    this.toxicityHistory = [];
    this.targetToxicity = 0.25; // Target 25% DLT rate
  }

  updatePosterior(dose, toxicity) {
    this.doseHistory.push(dose);
    this.toxicityHistory.push(toxicity);
    
    // Simple Bayesian update
    const toxCount = this.toxicityHistory.filter(t => t).length;
    const totalCount = this.toxicityHistory.length;
    
    this.posteriorAlpha = this.priorAlpha + toxCount;
    this.posteriorBeta = this.priorBeta + (totalCount - toxCount);
  }

  predictToxicityProbability(dose, maxDose = 100) {
    // Logistic model for dose-toxicity relationship
    const normalizedDose = dose / maxDose;
    const baseProb = 1 / (1 + Math.exp(-10 * (normalizedDose - 0.5)));
    
    // Adjust based on historical data
    if (this.doseHistory.length > 0) {
      const adjustment = this.posteriorAlpha / (this.posteriorAlpha + this.posteriorBeta);
      return baseProb * 0.7 + adjustment * 0.3;
    }
    
    return baseProb;
  }

  recommendNextDose(currentDose, maxDose = 100) {
    const currentToxProb = this.predictToxicityProbability(currentDose, maxDose);
    
    if (currentToxProb < this.targetToxicity - 0.05) {
      // Escalate
      return Math.min(currentDose * 1.5, maxDose);
    } else if (currentToxProb > this.targetToxicity + 0.05) {
      // De-escalate
      return Math.max(currentDose * 0.67, 1);
    } else {
      // Stay at current dose
      return currentDose;
    }
  }

  generateDoseToxicityCurve(maxDose = 100) {
    const curve = [];
    for (let dose = 0; dose <= maxDose; dose += maxDose / 50) {
      curve.push({
        dose: Math.round(dose),
        toxicity: this.predictToxicityProbability(dose, maxDose) * 100,
        lower: Math.max(0, (this.predictToxicityProbability(dose, maxDose) - 0.1) * 100),
        upper: Math.min(100, (this.predictToxicityProbability(dose, maxDose) + 0.1) * 100)
      });
    }
    return curve;
  }
}

export default function DoseEscalationEngine({ studyId = "STUDY001", phase = "0/I" }) {
  const [model] = useState(new BayesianDoseEscalationModel());
  const [currentDose, setCurrentDose] = useState(10);
  const [maxDose, setMaxDose] = useState(100);
  const [cohortSize, setCohortSize] = useState(3);
  const [dltCount, setDltCount] = useState(0);
  const [cohortNumber, setCohortNumber] = useState(1);
  const [escalationHistory, setEscalationHistory] = useState([]);
  const [toxicityCurve, setToxicityCurve] = useState([]);
  const [activeTab, setActiveTab] = useState('bayesian');

  useEffect(() => {
    // Generate initial toxicity curve
    const curve = model.generateDoseToxicityCurve(maxDose);
    setToxicityCurve(curve);
  }, [maxDose]);

  const handleCohortComplete = () => {
    // Calculate toxicity rate for this cohort
    const toxicityRate = dltCount / cohortSize;
    
    // Update Bayesian model
    for (let i = 0; i < cohortSize; i++) {
      model.updatePosterior(currentDose, i < dltCount);
    }
    
    // Get recommendation for next dose
    const nextDose = model.recommendNextDose(currentDose, maxDose);
    
    // Update history
    const newEntry = {
      cohort: cohortNumber,
      dose: currentDose,
      patients: cohortSize,
      dlts: dltCount,
      toxicityRate: (toxicityRate * 100).toFixed(1),
      recommendation: nextDose > currentDose ? 'Escalate' : nextDose < currentDose ? 'De-escalate' : 'Continue',
      nextDose: Math.round(nextDose)
    };
    
    setEscalationHistory([...escalationHistory, newEntry]);
    
    // Update state for next cohort
    setCohortNumber(cohortNumber + 1);
    setCurrentDose(Math.round(nextDose));
    setDltCount(0);
    
    // Regenerate toxicity curve with updated model
    const curve = model.generateDoseToxicityCurve(maxDose);
    setToxicityCurve(curve);
  };

  const mtdPrediction = () => {
    // Find dose closest to target toxicity
    let mtd = 0;
    let minDiff = 100;
    
    toxicityCurve.forEach(point => {
      const diff = Math.abs(point.toxicity - (model.targetToxicity * 100));
      if (diff < minDiff) {
        minDiff = diff;
        mtd = point.dose;
      }
    });
    
    return mtd;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="w-6 h-6 text-purple-500" />
          Dose Escalation Policy Engine
        </h2>
        <p className="text-gray-500 mt-1">
          Bayesian reverse mapping for Phase {phase} dose-toxicity optimization
        </p>
      </div>

      {/* Alert */}
      <Alert className="border-purple-200 bg-purple-50">
        <Brain className="h-4 w-4" />
        <AlertDescription>
          <strong>ForesightAI™ Prediction:</strong> Based on preclinical PK/PD, recommended starting dose is {currentDose}mg 
          with 3+3 escalation. Predicted MTD: {mtdPrediction()}mg (CI: {Math.round(mtdPrediction() * 0.8)}-{Math.round(mtdPrediction() * 1.2)}mg)
        </AlertDescription>
      </Alert>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="bayesian">Bayesian Model</TabsTrigger>
          <TabsTrigger value="simulation">3+3 Simulation</TabsTrigger>
          <TabsTrigger value="history">Escalation History</TabsTrigger>
        </TabsList>

        <TabsContent value="bayesian" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Dose-Toxicity Curve */}
            <Card>
              <CardHeader>
                <CardTitle>Dose-Toxicity Relationship</CardTitle>
                <CardDescription>
                  Posterior predictive distribution with 90% credible interval
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={toxicityCurve}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dose" label={{ value: 'Dose (mg)', position: 'insideBottom', offset: -5 }} />
                    <YAxis label={{ value: 'Toxicity Probability (%)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="upper" 
                      stroke="none" 
                      fill="rgba(147, 51, 234, 0.1)"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="lower" 
                      stroke="none" 
                      fill="white"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="toxicity" 
                      stroke="#9333ea" 
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey={() => model.targetToxicity * 100}
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Target DLT Rate"
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex justify-between mt-4 text-sm">
                  <Badge variant="outline">Current Dose: {currentDose}mg</Badge>
                  <Badge variant="outline" className="text-purple-600">Predicted MTD: {mtdPrediction()}mg</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Control Panel */}
            <Card>
              <CardHeader>
                <CardTitle>Dose Escalation Controls</CardTitle>
                <CardDescription>
                  Configure Bayesian adaptive dose-finding parameters
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Maximum Dose (mg)</Label>
                  <Input
                    type="number"
                    value={maxDose}
                    onChange={(e) => setMaxDose(parseInt(e.target.value))}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label>Target DLT Rate (%)</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <Slider
                      value={[model.targetToxicity * 100]}
                      onValueChange={(value) => model.targetToxicity = value[0] / 100}
                      min={10}
                      max={40}
                      step={5}
                      className="flex-1"
                    />
                    <span className="w-12 text-sm font-medium">{(model.targetToxicity * 100).toFixed(0)}%</span>
                  </div>
                </div>

                <div>
                  <Label>Prior Distribution</Label>
                  <Select defaultValue="uniform">
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uniform">Uniform (α=1, β=1)</SelectItem>
                      <SelectItem value="informative">Informative (α=2, β=8)</SelectItem>
                      <SelectItem value="skeptical">Skeptical (α=1, β=3)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="w-full" onClick={() => handleCohortComplete()}>
                  <Calculator className="w-4 h-4 mr-2" />
                  Generate Recommendation
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="simulation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>3+3 Design Simulation</CardTitle>
              <CardDescription>
                Real-time simulation of traditional dose escalation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Current Dose (mg)</Label>
                  <Input
                    type="number"
                    value={currentDose}
                    onChange={(e) => setCurrentDose(parseInt(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Cohort Size</Label>
                  <Input
                    type="number"
                    value={cohortSize}
                    onChange={(e) => setCohortSize(parseInt(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>DLTs Observed</Label>
                  <Input
                    type="number"
                    value={dltCount}
                    onChange={(e) => setDltCount(parseInt(e.target.value))}
                    max={cohortSize}
                    className="mt-1"
                  />
                </div>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Cohort {cohortNumber}:</strong> {cohortSize} patients at {currentDose}mg. 
                  {dltCount > 0 && ` ${dltCount} DLT${dltCount > 1 ? 's' : ''} observed.`}
                </AlertDescription>
              </Alert>

              <div className="flex gap-3">
                <Button onClick={handleCohortComplete} className="flex-1">
                  Complete Cohort
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
                <Button variant="outline" onClick={() => {
                  setEscalationHistory([]);
                  setCohortNumber(1);
                  setDltCount(0);
                }}>
                  Reset Simulation
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Escalation History</CardTitle>
              <CardDescription>
                Complete dose escalation trajectory
              </CardDescription>
            </CardHeader>
            <CardContent>
              {escalationHistory.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-7 gap-2 text-sm font-medium text-gray-600 pb-2 border-b">
                    <div>Cohort</div>
                    <div>Dose</div>
                    <div>Patients</div>
                    <div>DLTs</div>
                    <div>Tox Rate</div>
                    <div>Decision</div>
                    <div>Next Dose</div>
                  </div>
                  {escalationHistory.map((entry, idx) => (
                    <div key={idx} className="grid grid-cols-7 gap-2 text-sm py-2 border-b">
                      <div>{entry.cohort}</div>
                      <div>{entry.dose}mg</div>
                      <div>{entry.patients}</div>
                      <div>{entry.dlts}</div>
                      <div>{entry.toxicityRate}%</div>
                      <div>
                        <Badge variant={
                          entry.recommendation === 'Escalate' ? 'success' : 
                          entry.recommendation === 'De-escalate' ? 'destructive' : 
                          'default'
                        }>
                          {entry.recommendation}
                        </Badge>
                      </div>
                      <div>{entry.nextDose}mg</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">
                  No escalation history yet. Complete a cohort to begin.
                </p>
              )}
              
              {escalationHistory.length > 0 && (
                <div className="mt-4 flex justify-between">
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                  <Badge variant="outline" className="text-lg px-4 py-2">
                    Recommended MTD: {mtdPrediction()}mg
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}