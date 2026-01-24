import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  FileText,
  PencilRuler,
  Target,
  Download,
  RefreshCw,
  Loader2,
  ChevronRight,
  Lightbulb,
  Brain,
  Scale,
  Beaker,
  Folder,
  Sparkles,
  Database,
  Check,
  Info,
} from 'lucide-react';

const ProtocolBlueprintGenerator = () => {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('input');
  const [formData, setFormData] = useState({
    studyTitle: '',
    indication: '',
    phase: '',
    primaryObjective: '',
    studyDesign: '',
    targetPopulation: '',
    sampleSize: '',
    treatmentGroups: '',
    primaryEndpoint: '',
    secondaryEndpoints: '',
    inclusionCriteria: '',
    exclusionCriteria: '',
    statisticalApproach: '',
    useCsrIntelligence: true,
  });

  // Sample CSR insights that would influence the protocol blueprint
  const csrInsights = [
    {
      id: 'insight-1',
      category: 'Study Design',
      description: 'Adaptive designs show 28% fewer protocol deviations in Type 2 Diabetes studies',
      impact: 'high',
      confidence: 92,
      applied: true,
    },
    {
      id: 'insight-2',
      category: 'Endpoint Selection',
      description:
        'Integration of PROs as secondary endpoints correlates with 34% higher approval rates',
      impact: 'high',
      confidence: 88,
      applied: true,
    },
    {
      id: 'insight-3',
      category: 'Patient Selection',
      description:
        'Biomarker-stratified enrollment approaches yield 3.2x greater treatment effect sizes',
      impact: 'high',
      confidence: 94,
      applied: false,
    },
    {
      id: 'insight-4',
      category: 'Statistical Methods',
      description:
        'Multiple imputation methods show superior acceptance by regulators compared to LOCF approaches',
      impact: 'medium',
      confidence: 89,
      applied: true,
    },
    {
      id: 'insight-5',
      category: 'Safety Reporting',
      description: 'Enhanced AE visualization techniques correlate with 29% faster safety reviews',
      impact: 'medium',
      confidence: 86,
      applied: false,
    },
  ];

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerateBlueprint = async () => {
    setGenerating(true);
    setActiveTab('generating');

    // Simulate generation delay
    await new Promise(resolve => setTimeout(resolve, 3000));

    setGenerating(false);
    setActiveTab('result');
  };

  const toggleInsight = insightId => {
    // This would toggle the application of a specific insight to the blueprint
    console.log(`Toggling insight ${insightId}`);
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PencilRuler className="h-5 w-5 text-blue-600" />
                Protocol Blueprint Generator
              </CardTitle>
              <CardDescription>
                Create a comprehensive protocol blueprint based on study parameters and CSR
                intelligence
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 mb-6">
              <TabsTrigger value="input">Input Parameters</TabsTrigger>
              <TabsTrigger value="generating" disabled={!generating}>
                Generating
              </TabsTrigger>
              <TabsTrigger value="result" disabled={activeTab !== 'result'}>
                Blueprint Result
              </TabsTrigger>
            </TabsList>

            {/* Input Parameters Tab */}
            <TabsContent value="input" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium block mb-1">Study Title</label>
                    <Input
                      value={formData.studyTitle}
                      onChange={e => handleChange('studyTitle', e.target.value)}
                      placeholder="Enter a descriptive study title"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-1">Indication</label>
                      <Input
                        value={formData.indication}
                        onChange={e => handleChange('indication', e.target.value)}
                        placeholder="e.g., Type 2 Diabetes"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium block mb-1">Phase</label>
                      <Select
                        value={formData.phase}
                        onValueChange={value => handleChange('phase', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Phase" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Phase 1">Phase 1</SelectItem>
                          <SelectItem value="Phase 2">Phase 2</SelectItem>
                          <SelectItem value="Phase 2a">Phase 2a</SelectItem>
                          <SelectItem value="Phase 2b">Phase 2b</SelectItem>
                          <SelectItem value="Phase 3">Phase 3</SelectItem>
                          <SelectItem value="Phase 4">Phase 4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Primary Objective</label>
                    <Textarea
                      value={formData.primaryObjective}
                      onChange={e => handleChange('primaryObjective', e.target.value)}
                      placeholder="Describe the primary objective of the study"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Study Design</label>
                    <Select
                      value={formData.studyDesign}
                      onValueChange={value => handleChange('studyDesign', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Study Design" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Randomized, Double-blind, Placebo-controlled">
                          Randomized, Double-blind, Placebo-controlled
                        </SelectItem>
                        <SelectItem value="Randomized, Open-label">
                          Randomized, Open-label
                        </SelectItem>
                        <SelectItem value="Single-arm">Single-arm</SelectItem>
                        <SelectItem value="Crossover">Crossover</SelectItem>
                        <SelectItem value="Adaptive Design">Adaptive Design</SelectItem>
                        <SelectItem value="Non-randomized">Non-randomized</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Target Population</label>
                    <Textarea
                      value={formData.targetPopulation}
                      onChange={e => handleChange('targetPopulation', e.target.value)}
                      placeholder="Describe the target patient population"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Estimated Sample Size</label>
                    <Input
                      value={formData.sampleSize}
                      onChange={e => handleChange('sampleSize', e.target.value)}
                      placeholder="e.g., 120 patients"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium block mb-1">Treatment Groups</label>
                    <Textarea
                      value={formData.treatmentGroups}
                      onChange={e => handleChange('treatmentGroups', e.target.value)}
                      placeholder="Describe treatment groups and dosing regimens"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Primary Endpoint</label>
                    <Textarea
                      value={formData.primaryEndpoint}
                      onChange={e => handleChange('primaryEndpoint', e.target.value)}
                      placeholder="Define the primary endpoint"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Secondary Endpoints</label>
                    <Textarea
                      value={formData.secondaryEndpoints}
                      onChange={e => handleChange('secondaryEndpoints', e.target.value)}
                      placeholder="List key secondary endpoints"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Key Inclusion Criteria</label>
                    <Textarea
                      value={formData.inclusionCriteria}
                      onChange={e => handleChange('inclusionCriteria', e.target.value)}
                      placeholder="List important inclusion criteria"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Key Exclusion Criteria</label>
                    <Textarea
                      value={formData.exclusionCriteria}
                      onChange={e => handleChange('exclusionCriteria', e.target.value)}
                      placeholder="List important exclusion criteria"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Statistical Approach</label>
                    <Select
                      value={formData.statisticalApproach}
                      onValueChange={value => handleChange('statisticalApproach', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Approach" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Frequentist">Frequentist</SelectItem>
                        <SelectItem value="Bayesian">Bayesian</SelectItem>
                        <SelectItem value="Mixed Methods">Mixed Methods</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* CSR Intelligence Integration */}
              <Card className="mt-6 bg-blue-50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Brain className="h-5 w-5 text-blue-600" />
                      CSR Intelligence Integration
                    </CardTitle>
                    <div className="flex items-center">
                      <span className="text-sm mr-2">Apply CSR insights</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.useCsrIntelligence}
                          onChange={e => handleChange('useCsrIntelligence', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                  <CardDescription>
                    Apply intelligence from analyzed CSRs to optimize your protocol blueprint
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {formData.useCsrIntelligence ? (
                    <div className="space-y-3">
                      <p className="text-sm text-blue-700">
                        The following CSR insights will be applied to your protocol blueprint:
                      </p>

                      {csrInsights
                        .filter(i => i.applied)
                        .map(insight => (
                          <div
                            key={insight.id}
                            className="flex items-start gap-2 bg-white p-3 rounded-md shadow-sm"
                          >
                            <div className="flex-shrink-0 mt-0.5">
                              <Lightbulb className="h-5 w-5 text-amber-500" />
                            </div>
                            <div className="flex-grow">
                              <div className="flex justify-between items-start">
                                <span className="font-medium text-sm">{insight.category}</span>
                                <Badge variant="outline" className="text-xs">
                                  {insight.confidence}% confidence
                                </Badge>
                              </div>
                              <p className="text-sm mt-1">{insight.description}</p>
                            </div>
                          </div>
                        ))}

                      <Button className="w-full mt-2" variant="outline" size="sm">
                        <Database className="h-4 w-4 mr-2" />
                        View All Available Insights
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-4">
                      <div className="text-center">
                        <Info className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                        <p className="text-sm text-blue-700">
                          CSR intelligence is disabled. Toggle the switch above to enhance your
                          protocol blueprint with evidence-based insights.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end gap-3 mt-6">
                <Button variant="outline">Reset Form</Button>
                <Button onClick={handleGenerateBlueprint}>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Blueprint
                </Button>
              </div>
            </TabsContent>

            {/* Generating Tab */}
            <TabsContent
              value="generating"
              className="min-h-[400px] flex items-center justify-center"
            >
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Generating Protocol Blueprint</h3>
                <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
                  Analyzing parameters, applying CSR intelligence insights, and generating optimized
                  protocol sections...
                </p>
                <div className="w-full max-w-md mx-auto space-y-2">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Progress</span>
                    <span>68%</span>
                  </div>
                  <Progress value={68} className="h-2" />
                </div>
              </div>
            </TabsContent>

            {/* Result Tab */}
            <TabsContent value="result" className="space-y-6">
              <div className="flex justify-between">
                <div>
                  <h3 className="text-xl font-semibold">Protocol Blueprint</h3>
                  <p className="text-sm text-gray-600">
                    {formData.studyTitle || 'Protocol Blueprint'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Regenerate
                  </Button>
                  <Button size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Download Blueprint
                  </Button>
                </div>
              </div>

              <div className="border rounded-md">
                <div className="border-b p-3 bg-gray-50">
                  <h4 className="font-medium">Protocol Sections</h4>
                </div>

                <div className="divide-y">
                  <div className="p-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-center">
                      <div className="font-medium">1. Study Overview</div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Title, indication, phase, objectives, and rationale
                    </p>
                  </div>

                  <div className="p-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-center">
                      <div className="font-medium">2. Study Design</div>
                      <div className="flex items-center">
                        <Badge variant="outline" className="mr-2">
                          CSR Insights Applied
                        </Badge>
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {formData.studyDesign || 'Study design'}, treatment groups, duration, sample
                      size
                    </p>
                  </div>

                  <div className="p-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-center">
                      <div className="font-medium">3. Study Population</div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Inclusion/exclusion criteria, subject recruitment, and demographics
                    </p>
                  </div>

                  <div className="p-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-center">
                      <div className="font-medium">4. Endpoints and Assessments</div>
                      <div className="flex items-center">
                        <Badge variant="outline" className="mr-2">
                          CSR Insights Applied
                        </Badge>
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Primary and secondary endpoints, assessment schedule
                    </p>
                  </div>

                  <div className="p-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-center">
                      <div className="font-medium">5. Statistical Analysis</div>
                      <div className="flex items-center">
                        <Badge variant="outline" className="mr-2">
                          CSR Insights Applied
                        </Badge>
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {formData.statisticalApproach || 'Statistical methods'}, sample size
                      justification, analysis populations
                    </p>
                  </div>

                  <div className="p-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-center">
                      <div className="font-medium">6. Safety Monitoring</div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Adverse event reporting, safety analyses, risk management
                    </p>
                  </div>

                  <div className="p-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-center">
                      <div className="font-medium">7. Ethical Considerations</div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      IRB/EC approval, informed consent, data privacy
                    </p>
                  </div>
                </div>
              </div>

              {/* CSR Intelligence Summary */}
              {formData.useCsrIntelligence && (
                <Card className="mt-6 bg-blue-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Brain className="h-5 w-5 text-blue-600" />
                      CSR Intelligence Implementation
                    </CardTitle>
                    <CardDescription>
                      Blueprint optimizations based on historical CSR analysis
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="bg-white p-3 rounded-md shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0">
                            <Sparkles className="h-5 w-5 text-amber-500" />
                          </div>
                          <div>
                            <div className="font-medium">Design Optimization</div>
                            <p className="text-sm mt-1">
                              Adaptive design elements have been integrated into the protocol,
                              including interim analyses at 30% and 60% enrollment to assess
                              futility and sample size re-estimation.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-md shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0">
                            <Sparkles className="h-5 w-5 text-amber-500" />
                          </div>
                          <div>
                            <div className="font-medium">Endpoint Enhancement</div>
                            <p className="text-sm mt-1">
                              Patient-reported outcomes have been added as key secondary endpoints
                              based on regulatory approval patterns in similar studies.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-md shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0">
                            <Sparkles className="h-5 w-5 text-amber-500" />
                          </div>
                          <div>
                            <div className="font-medium">Statistical Method Refinement</div>
                            <p className="text-sm mt-1">
                              Multiple imputation methods for missing data have been selected based
                              on superior regulatory acceptance compared to LOCF approaches.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline">
                  <Folder className="h-4 w-4 mr-2" />
                  Save to Projects
                </Button>
                <Button>
                  <Scale className="h-4 w-4 mr-2" />
                  Protocol Success Prediction
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProtocolBlueprintGenerator;
