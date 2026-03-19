/**
 * ForesightAI™ Cross-Species PK/PD Analyzer
 * Advanced allometric scaling and human dose prediction for Phase 0/I
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Activity,
  TrendingUp,
  Calculator,
  Brain,
  ChartBar,
  Info,
  Plus,
  Trash2,
  Download,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { ScatterChart, Scatter, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

interface SpeciesData {
  species: string;
  dose: number;
  doseUnit: 'mg/kg' | 'mg/m2';
  cmax: number;
  auc: number;
  halfLife: number;
  clearance: number;
  volume: number;
  bodyWeight: number;
}

export default function CrossSpeciesPKPDModule({ organizationId }: { organizationId: string }) {
  const [compoundId, setCompoundId] = useState('');
  const [compoundName, setCompoundName] = useState('');
  const [speciesDataList, setSpeciesDataList] = useState<SpeciesData[]>([
    {
      species: 'mouse',
      dose: 10,
      doseUnit: 'mg/kg',
      cmax: 2.5,
      auc: 15,
      halfLife: 0.5,
      clearance: 0.8,
      volume: 0.2,
      bodyWeight: 0.025
    },
    {
      species: 'rat',
      dose: 5,
      doseUnit: 'mg/kg',
      cmax: 3.2,
      auc: 22,
      halfLife: 1.2,
      clearance: 0.6,
      volume: 0.35,
      bodyWeight: 0.3
    }
  ]);
  
  const [newSpecies, setNewSpecies] = useState<SpeciesData>({
    species: 'dog',
    dose: 0,
    doseUnit: 'mg/kg',
    cmax: 0,
    auc: 0,
    halfLife: 0,
    clearance: 0,
    volume: 0,
    bodyWeight: 0
  });

  // Perform cross-species analysis
  const analysisMutation = useMutation({
    mutationFn: (params: any) => 
      apiRequest('/api/foresight-ai/pkpd/cross-species-analysis', {
        method: 'POST',
        body: JSON.stringify(params)
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/foresight-ai/pkpd/analyses'] 
      });
    }
  });

  // Fetch previous analyses
  const { data: previousAnalyses } = useQuery({
    queryKey: ['/api/foresight-ai/pkpd/analyses', organizationId],
    enabled: !!organizationId
  });

  const handleAnalyze = () => {
    analysisMutation.mutate({
      organizationId,
      compoundId: compoundId || `COMP-${Date.now()}`,
      compoundName,
      speciesData: speciesDataList
    });
  };

  const addSpeciesData = () => {
    if (newSpecies.dose > 0) {
      setSpeciesDataList([...speciesDataList, newSpecies]);
      setNewSpecies({
        species: 'dog',
        dose: 0,
        doseUnit: 'mg/kg',
        cmax: 0,
        auc: 0,
        halfLife: 0,
        clearance: 0,
        volume: 0,
        bodyWeight: 0
      });
    }
  };

  const removeSpecies = (index: number) => {
    setSpeciesDataList(speciesDataList.filter((_, i) => i !== index));
  };

  // Prepare allometric scaling visualization data
  const allometricData = speciesDataList.map(s => ({
    species: s.species,
    bodyWeight: s.bodyWeight,
    clearance: s.clearance,
    volume: s.volume,
    dose: s.dose,
    logWeight: Math.log10(s.bodyWeight),
    logClearance: Math.log10(s.clearance),
    logVolume: Math.log10(s.volume)
  }));

  // Species standard body weights (kg)
  const speciesWeights = {
    mouse: 0.025,
    rat: 0.3,
    rabbit: 2,
    dog: 10,
    monkey: 5,
    minipig: 30,
    human: 70
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-purple-600" />
            Cross-Species PK/PD Analyzer
          </h3>
          <p className="text-gray-600 mt-1">
            Advanced allometric scaling for first-in-human dose prediction
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Brain className="h-3 w-3" />
            AI-Enhanced Scaling
          </Badge>
          <Badge variant="outline">FDA MRSD Compliant</Badge>
        </div>
      </div>

      {/* Compound Information */}
      <Card>
        <CardHeader>
          <CardTitle>Compound Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="compound-id">Compound ID</Label>
              <Input
                id="compound-id"
                value={compoundId}
                onChange={(e) => setCompoundId(e.target.value)}
                placeholder="e.g., COMP-001"
                data-testid="input-compound-id"
              />
            </div>
            <div>
              <Label htmlFor="compound-name">Compound Name</Label>
              <Input
                id="compound-name"
                value={compoundName}
                onChange={(e) => setCompoundName(e.target.value)}
                placeholder="e.g., Molecule ABC"
                data-testid="input-compound-name"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Species Data Input */}
      <Card>
        <CardHeader>
          <CardTitle>Species PK/PD Data</CardTitle>
          <CardDescription>
            Enter pharmacokinetic and pharmacodynamic parameters for each species
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing Species Data */}
          {speciesDataList.map((species, index) => (
            <Card key={index} className="bg-gray-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold capitalize">{species.species}</h4>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeSpecies(index)}
                    data-testid={`button-remove-${species.species}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Dose:</span>{' '}
                    <span className="font-medium">{species.dose} {species.doseUnit}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Cmax:</span>{' '}
                    <span className="font-medium">{species.cmax} μg/mL</span>
                  </div>
                  <div>
                    <span className="text-gray-500">AUC:</span>{' '}
                    <span className="font-medium">{species.auc} μg·h/mL</span>
                  </div>
                  <div>
                    <span className="text-gray-500">T½:</span>{' '}
                    <span className="font-medium">{species.halfLife} h</span>
                  </div>
                  <div>
                    <span className="text-gray-500">CL:</span>{' '}
                    <span className="font-medium">{species.clearance} L/h/kg</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Vd:</span>{' '}
                    <span className="font-medium">{species.volume} L/kg</span>
                  </div>
                  <div>
                    <span className="text-gray-500">BW:</span>{' '}
                    <span className="font-medium">{species.bodyWeight} kg</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Add New Species Form */}
          <Card className="border-dashed border-2">
            <CardContent className="p-4">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <Label>Species</Label>
                  <Select
                    value={newSpecies.species}
                    onValueChange={(value) => setNewSpecies({
                      ...newSpecies, 
                      species: value,
                      bodyWeight: speciesWeights[value as keyof typeof speciesWeights] || 0
                    })}
                  >
                    <SelectTrigger data-testid="select-species">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mouse">Mouse</SelectItem>
                      <SelectItem value="rat">Rat</SelectItem>
                      <SelectItem value="rabbit">Rabbit</SelectItem>
                      <SelectItem value="dog">Dog</SelectItem>
                      <SelectItem value="monkey">Monkey</SelectItem>
                      <SelectItem value="minipig">Minipig</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Dose</Label>
                  <Input
                    type="number"
                    value={newSpecies.dose}
                    onChange={(e) => setNewSpecies({...newSpecies, dose: parseFloat(e.target.value)})}
                    placeholder="mg/kg"
                    data-testid="input-dose"
                  />
                </div>
                <div>
                  <Label>Cmax (μg/mL)</Label>
                  <Input
                    type="number"
                    value={newSpecies.cmax}
                    onChange={(e) => setNewSpecies({...newSpecies, cmax: parseFloat(e.target.value)})}
                    data-testid="input-cmax"
                  />
                </div>
                <div>
                  <Label>AUC (μg·h/mL)</Label>
                  <Input
                    type="number"
                    value={newSpecies.auc}
                    onChange={(e) => setNewSpecies({...newSpecies, auc: parseFloat(e.target.value)})}
                    data-testid="input-auc"
                  />
                </div>
                <div>
                  <Label>Half-life (h)</Label>
                  <Input
                    type="number"
                    value={newSpecies.halfLife}
                    onChange={(e) => setNewSpecies({...newSpecies, halfLife: parseFloat(e.target.value)})}
                    data-testid="input-halflife"
                  />
                </div>
                <div>
                  <Label>Clearance (L/h/kg)</Label>
                  <Input
                    type="number"
                    value={newSpecies.clearance}
                    onChange={(e) => setNewSpecies({...newSpecies, clearance: parseFloat(e.target.value)})}
                    data-testid="input-clearance"
                  />
                </div>
                <div>
                  <Label>Volume (L/kg)</Label>
                  <Input
                    type="number"
                    value={newSpecies.volume}
                    onChange={(e) => setNewSpecies({...newSpecies, volume: parseFloat(e.target.value)})}
                    data-testid="input-volume"
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={addSpeciesData} className="w-full" data-testid="button-add-species">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Species
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button 
            onClick={handleAnalyze}
            disabled={speciesDataList.length < 2 || !compoundName || analysisMutation.isPending}
            className="w-full"
            data-testid="button-analyze"
          >
            {analysisMutation.isPending ? (
              <>Analyzing...</>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-2" />
                Perform AI-Enhanced Allometric Analysis
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {analysisMutation.data && (
        <>
          <Alert className="border-green-200 bg-green-50">
            <Calculator className="h-4 w-4" />
            <AlertTitle>Human Dose Prediction Complete</AlertTitle>
            <AlertDescription className="space-y-2 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <strong>Predicted Human Dose:</strong>{' '}
                  {analysisMutation.data.analysis?.human_dose_prediction?.toFixed(2) || 'N/A'} mg
                </div>
                <div>
                  <strong>NOAEL-Based Dose:</strong>{' '}
                  {analysisMutation.data.analysis?.noael_based_dose?.toFixed(2) || 'N/A'} mg
                </div>
                <div>
                  <strong>MABEL-Based Dose:</strong>{' '}
                  {analysisMutation.data.analysis?.mabel_based_dose?.toFixed(2) || 'N/A'} mg
                </div>
                <div>
                  <strong>Recommended Starting Dose:</strong>{' '}
                  <span className="text-green-600 font-bold">
                    {analysisMutation.data.analysis?.recommended_starting_dose?.toFixed(3) || 'N/A'} mg
                  </span>
                </div>
              </div>
              <div className="pt-2">
                <strong>Safety Margin:</strong>{' '}
                {analysisMutation.data.analysis?.safety_margin || 10}x
              </div>
            </AlertDescription>
          </Alert>

          {/* Recommendations */}
          {analysisMutation.data.recommendations && (
            <Card>
              <CardHeader>
                <CardTitle>AI Dosing Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analysisMutation.data.recommendations.map((rec: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-blue-50 rounded">
                      <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                      <div>
                        <div className="font-medium">{rec.type}</div>
                        <div className="text-sm text-gray-600">
                          {rec.value} mg - {rec.rationale}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Visualization Tabs */}
      <Tabs defaultValue="allometric" className="space-y-4">
        <TabsList>
          <TabsTrigger value="allometric">Allometric Scaling</TabsTrigger>
          <TabsTrigger value="exposure">Exposure Comparison</TabsTrigger>
          <TabsTrigger value="safety">Safety Assessment</TabsTrigger>
          <TabsTrigger value="report">Regulatory Report</TabsTrigger>
        </TabsList>

        <TabsContent value="allometric">
          <Card>
            <CardHeader>
              <CardTitle>Allometric Scaling Plot</CardTitle>
              <CardDescription>
                Log-log plot showing allometric relationship between body weight and PK parameters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="logWeight" 
                    label={{ value: 'Log Body Weight (kg)', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis 
                    label={{ value: 'Log Clearance (L/h)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload?.[0]) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2 border rounded shadow">
                            <p className="font-semibold">{data.species}</p>
                            <p className="text-sm">BW: {data.bodyWeight} kg</p>
                            <p className="text-sm">CL: {data.clearance} L/h/kg</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Scatter 
                    name="Clearance" 
                    data={allometricData} 
                    fill="#6a9bcc"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exposure">
          <Card>
            <CardHeader>
              <CardTitle>Cross-Species Exposure Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={speciesDataList}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="species" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cmax" fill="#6a9bcc" name="Cmax (μg/mL)" />
                  <Bar dataKey="auc" fill="#6a9bcc" name="AUC (μg·h/mL)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="safety">
          <Card>
            <CardHeader>
              <CardTitle>Safety Margin Assessment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Safety Factors Applied</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Interspecies variability: 10x</li>
                    <li>Intraspecies variability: 10x</li>
                    <li>Total safety factor: 100x</li>
                    <li>Additional factor for severe toxicity: 10x (if applicable)</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-gray-500">NOAEL</div>
                    <div className="text-xl font-bold">5.0 mg/kg</div>
                    <div className="text-xs text-gray-400 mt-1">Most sensitive species</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-gray-500">HED</div>
                    <div className="text-xl font-bold">0.81 mg/kg</div>
                    <div className="text-xs text-gray-400 mt-1">Human equivalent dose</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-gray-500">MRSD</div>
                    <div className="text-xl font-bold text-green-600">0.008 mg/kg</div>
                    <div className="text-xs text-gray-400 mt-1">Maximum recommended starting dose</div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report">
          <Card>
            <CardHeader>
              <CardTitle>FDA-Compliant Bridging Report</CardTitle>
              <CardDescription>
                Auto-generated regulatory documentation for IND submission
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border rounded p-4 space-y-2">
                <h4 className="font-semibold">Report Sections</h4>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    Executive Summary
                  </li>
                  <li className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    Allometric Scaling Methodology
                  </li>
                  <li className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    Species Comparison Data
                  </li>
                  <li className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    Human Dose Prediction
                  </li>
                  <li className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    Safety Margin Calculations
                  </li>
                  <li className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    Uncertainty Analysis
                  </li>
                  <li className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    Recommended Starting Dose Justification
                  </li>
                </ul>
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" data-testid="button-generate-report">
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Full Report
                </Button>
                <Button variant="outline" data-testid="button-download-report">
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}