import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Download, 
  Plus, 
  FileText, 
  Search, 
  CheckCircle2, 
  HelpCircle,
  ArrowRight,
  LineChart
} from 'lucide-react';

// Types
interface Endpoint {
  name: string;
  description: string;
  frequency: number;
  successRate?: number;
  phaseDistribution?: { [key: string]: number };
  reference?: string;
}

interface EndpointRecommendation {
  endpoints: Endpoint[];
  rationale: string;
  similarTrials: Array<{
    id: string;
    title: string;
    phase: string;
    endpoints: string[];
  }>;
}

export default function EndpointRecommender() {
  const [indication, setIndication] = useState('');
  const [phase, setPhase] = useState('');
  const [therapeuticArea, setTherapeuticArea] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [activeTab, setActiveTab] = useState('recommended');
  const [recommendations, setRecommendations] = useState<EndpointRecommendation | null>(null);
  const { toast } = useToast();

  // Simulated indications and therapeutic areas
  const indications = [
    'Type 2 Diabetes', 
    'Non-Small Cell Lung Cancer', 
    'Heart Failure', 
    'Rheumatoid Arthritis',
    'Multiple Sclerosis',
    'Major Depressive Disorder'
  ];
  
  const therapeuticAreas = [
    'Oncology',
    'Cardiovascular',
    'Neurology',
    'Immunology',
    'Endocrinology',
    'Psychiatry'
  ];
  
  const phases = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];

  // Helper functions for visualization data
  const getEndpointChartData = () => {
    if (!recommendations) return [];
    return recommendations.endpoints.map(endpoint => ({
      name: endpoint.name,
      frequency: endpoint.frequency,
      successRate: endpoint.successRate || 0
    }));
  };

  const getPhaseDistributionData = (endpointName: string) => {
    if (!recommendations) return [];
    const endpoint = recommendations.endpoints.find(e => e.name === endpointName);
    if (!endpoint || !endpoint.phaseDistribution) return [];
    
    return Object.entries(endpoint.phaseDistribution).map(([phase, count]) => ({
      name: phase,
      value: count
    }));
  };

  // Chart colors
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  // Handler for search action
  const handleSearch = async () => {
    if (!indication || !phase) {
      // toast call replaced
  // Original: toast({
        title: "Missing information",
        description: "Please select both indication and phase to search for endpoints.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing information",
        description: "Please select both indication and phase to search for endpoints.",
        variant: "destructive"
      });
      return;
    }
    
    setIsSearching(true);
    setShowResults(false);
    
    try {
      // Simulate API call with a delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Start generating recommendations
      setIsSearching(false);
      setIsGenerating(true);
      
      // Simulate AI processing with a delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock data for the recommendation
      const mockRecommendation: EndpointRecommendation = {
        endpoints: [
          {
            name: indication === 'Type 2 Diabetes' ? 'HbA1c Change from Baseline' : 'Overall Response Rate (ORR)',
            description: indication === 'Type 2 Diabetes' 
              ? 'Change in glycated hemoglobin levels, measuring long-term blood glucose control'
              : 'Percentage of patients with tumor shrinkage of a predefined amount and for a minimum time period',
            frequency: 87,
            successRate: 72,
            phaseDistribution: {
              'Phase 1': 10,
              'Phase 2': 35,
              'Phase 3': 55
            },
            reference: 'NCT03254303'
          },
          {
            name: indication === 'Type 2 Diabetes' ? 'Fasting Plasma Glucose' : 'Progression-Free Survival (PFS)',
            description: indication === 'Type 2 Diabetes'
              ? 'Measurement of blood glucose after an overnight fast, indicating baseline glucose control'
              : 'Time from randomization until tumor progression or death from any cause',
            frequency: 65,
            successRate: 68,
            phaseDistribution: {
              'Phase 1': 5,
              'Phase 2': 30,
              'Phase 3': 65
            },
            reference: 'NCT02908321'
          },
          {
            name: indication === 'Type 2 Diabetes' ? 'Body Weight Change' : 'Overall Survival (OS)',
            description: indication === 'Type 2 Diabetes'
              ? 'Change in body weight from baseline, important for therapies that may impact weight'
              : 'Time from randomization until death from any cause, the gold standard measure',
            frequency: 58,
            successRate: 54,
            phaseDistribution: {
              'Phase 1': 15,
              'Phase 2': 25,
              'Phase 3': 60
            },
            reference: 'NCT04012983'
          },
          {
            name: indication === 'Type 2 Diabetes' ? 'Hypoglycemic Events' : 'Duration of Response (DOR)',
            description: indication === 'Type 2 Diabetes'
              ? 'Frequency of low blood glucose events, a key safety endpoint in diabetes trials'
              : 'Time from documentation of tumor response to disease progression or death',
            frequency: 52,
            successRate: 62,
            phaseDistribution: {
              'Phase 1': 25,
              'Phase 2': 35,
              'Phase 3': 40
            },
            reference: 'NCT03692884'
          }
        ],
        rationale: indication === 'Type 2 Diabetes'
          ? `Based on analysis of 78 similar trials for ${indication}, HbA1c is the most commonly used primary endpoint (87%) with high regulatory success rates. Secondary endpoints typically include fasting plasma glucose and body weight changes to provide a comprehensive assessment of glycemic control and metabolic effects.`
          : `Based on analysis of 92 similar trials for ${indication}, objective response rate and progression-free survival are the most common endpoints for ${phase} studies. For regulatory approval, phase 3 studies typically use overall survival as the gold standard, though PFS is often accepted as a surrogate endpoint in certain indications.`,
        similarTrials: [
          {
            id: 'NCT03254303',
            title: indication === 'Type 2 Diabetes' 
              ? 'Efficacy and Safety of Novel GLP-1 Receptor Agonist in Type 2 Diabetes' 
              : 'Pembrolizumab Plus Chemotherapy for Metastatic NSCLC',
            phase: phase,
            endpoints: indication === 'Type 2 Diabetes' 
              ? ['HbA1c Change', 'Fasting Plasma Glucose', 'Body Weight Change'] 
              : ['ORR', 'PFS', 'OS', 'Safety']
          },
          {
            id: 'NCT02908321',
            title: indication === 'Type 2 Diabetes'
              ? 'SGLT2 Inhibitor Study in Type 2 Diabetes Patients'
              : 'Targeted Therapy for Advanced Non-Small Cell Lung Cancer',
            phase: phase,
            endpoints: indication === 'Type 2 Diabetes'
              ? ['HbA1c Change', 'Hypoglycemic Events', 'Fasting Plasma Glucose']
              : ['PFS', 'ORR', 'Safety', 'DOR']
          }
        ]
      };
      
      setRecommendations(mockRecommendation);
      setIsGenerating(false);
      setShowResults(true);
      
    } catch (error) {
      console.error('Error generating endpoint recommendations:', error);
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: "Failed to generate endpoint recommendations. Please try again.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error",
        description: "Failed to generate endpoint recommendations. Please try again.",
        variant: "destructive"
      });
      setIsSearching(false);
      setIsGenerating(false);
    }
  };
  
  // Add an endpoint to a protocol (simulation)
  const handleAddToProtocol = (endpoint: Endpoint) => {
    // toast call replaced
  // Original: toast({
      title: "Endpoint Added",
      description: `${endpoint.name} has been added to your draft protocol.`,
    })
  console.log('Toast would show:', {
      title: "Endpoint Added",
      description: `${endpoint.name} has been added to your draft protocol.`,
    });
  };
  
  // Export recommendations
  const handleExport = () => {
    if (!recommendations) return;
    
    // In a real implementation, this would generate and download a PDF
    // For now, we'll just show a toast
    // toast call replaced
  // Original: toast({
      title: "Export Initiated",
      description: "Your endpoint recommendations are being exported as PDF.",
    })
  console.log('Toast would show:', {
      title: "Export Initiated",
      description: "Your endpoint recommendations are being exported as PDF.",
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center text-blue-800">
          <LineChart className="h-5 w-5 mr-2" />
          Endpoint Recommender
        </CardTitle>
        <CardDescription>
          Get data-driven endpoint recommendations based on similar clinical trials
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Search form */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="indication">Indication</Label>
              <Select 
                value={indication} 
                onValueChange={setIndication}
                disabled={isSearching || isGenerating}
              >
                <SelectTrigger id="indication">
                  <SelectValue placeholder="Select indication" />
                </SelectTrigger>
                <SelectContent>
                  {indications.map((ind) => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phase">Trial Phase</Label>
              <Select 
                value={phase} 
                onValueChange={setPhase}
                disabled={isSearching || isGenerating}
              >
                <SelectTrigger id="phase">
                  <SelectValue placeholder="Select phase" />
                </SelectTrigger>
                <SelectContent>
                  {phases.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="therapeutic-area">Therapeutic Area (Optional)</Label>
              <Select 
                value={therapeuticArea} 
                onValueChange={setTherapeuticArea}
                disabled={isSearching || isGenerating}
              >
                <SelectTrigger id="therapeutic-area">
                  <SelectValue placeholder="Select therapeutic area" />
                </SelectTrigger>
                <SelectContent>
                  {therapeuticAreas.map((area) => (
                    <SelectItem key={area} value={area}>{area}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex justify-center">
            <Button 
              onClick={handleSearch}
              className="w-full md:w-auto"
              disabled={isSearching || isGenerating || !indication || !phase}
            >
              {isSearching ? (
                <>
                  <span className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  Searching Trials
                </>
              ) : isGenerating ? (
                <>
                  <span className="animate-pulse mr-2">🧠</span>
                  Generating Recommendations
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Get Endpoint Recommendations
                </>
              )}
            </Button>
          </div>
          
          {/* Loading states */}
          {isSearching && (
            <div className="space-y-3 py-4">
              <p className="text-sm text-center">Searching for similar trials...</p>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          )}
          
          {isGenerating && (
            <div className="space-y-3 py-4">
              <p className="text-sm text-center">Analyzing endpoints from similar trials and generating recommendations...</p>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          )}
          
          {/* Results section */}
          {showResults && recommendations && (
            <div className="space-y-6 mt-4">
              <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
                <h3 className="text-md font-medium text-blue-800 mb-2">AI Analysis Summary</h3>
                <p className="text-sm text-gray-700">{recommendations.rationale}</p>
              </div>
              
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="recommended">
                    Recommended Endpoints
                  </TabsTrigger>
                  <TabsTrigger value="visualization">
                    Visualization
                  </TabsTrigger>
                  <TabsTrigger value="similarTrials">
                    Similar Trials
                  </TabsTrigger>
                </TabsList>
                
                {/* Recommended Endpoints Tab */}
                <TabsContent value="recommended" className="space-y-4">
                  {recommendations.endpoints.map((endpoint, i) => (
                    <Card key={i} className="bg-white">
                      <CardContent className="p-4">
                        <div className="flex flex-col md:flex-row justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center">
                              <h4 className="text-md font-semibold">
                                {endpoint.name}
                              </h4>
                              <Badge variant="outline" className="ml-2">
                                {endpoint.frequency}% of trials
                              </Badge>
                              {endpoint.successRate && (
                                <Badge className="ml-2 bg-green-100 text-green-800 hover:bg-green-200">
                                  {endpoint.successRate}% success rate
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mt-1">
                              {endpoint.description}
                            </p>
                          </div>
                          <div className="flex items-center mt-2 md:mt-0 space-x-2">
                            {endpoint.reference && (
                              <Button variant="outline" size="sm">
                                <FileText className="h-4 w-4 mr-1" />
                                View Example
                              </Button>
                            )}
                            <Button size="sm" onClick={() => handleAddToProtocol(endpoint)}>
                              <Plus className="h-4 w-4 mr-1" />
                              Add to Protocol
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
                
                {/* Visualization Tab */}
                <TabsContent value="visualization" className="space-y-6">
                  <Card className="bg-white">
                    <CardHeader>
                      <CardTitle className="text-md">Endpoint Usage Frequency</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={getEndpointChartData()}
                            margin={{
                              top: 20,
                              right: 30,
                              left: 20,
                              bottom: 60,
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                              dataKey="name" 
                              angle={-45} 
                              textAnchor="end"
                              height={60}
                            />
                            <YAxis label={{ value: 'Frequency (%)', angle: -90, position: 'insideLeft' }} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="frequency" name="Usage Frequency (%)" fill="#0088FE" />
                            <Bar dataKey="successRate" name="Success Rate (%)" fill="#00C49F" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {recommendations.endpoints.length > 0 && (
                    <Card className="bg-white">
                      <CardHeader>
                        <CardTitle className="text-md">Phase Distribution: {recommendations.endpoints[0].name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[300px] flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={getPhaseDistributionData(recommendations.endpoints[0].name)}
                                cx="50%"
                                cy="50%"
                                labelLine={true}
                                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                              >
                                {getPhaseDistributionData(recommendations.endpoints[0].name).map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
                
                {/* Similar Trials Tab */}
                <TabsContent value="similarTrials" className="space-y-4">
                  {recommendations.similarTrials.map((trial, i) => (
                    <Card key={i} className="bg-white">
                      <CardContent className="p-4">
                        <div className="flex justify-between">
                          <div>
                            <div className="flex items-center mb-1">
                              <h4 className="text-md font-semibold">{trial.title}</h4>
                              <Badge variant="outline" className="ml-2">{trial.phase}</Badge>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">ID: {trial.id}</p>
                            <div className="flex flex-wrap gap-1">
                              {trial.endpoints.map((endpoint, idx) => (
                                <Badge key={idx} variant="secondary" className="bg-blue-50 text-blue-800">
                                  {endpoint}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            <ArrowRight className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </CardContent>
      {showResults && recommendations && (
        <CardFooter className="flex justify-between">
          <div>
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export Recommendations
            </Button>
          </div>
          <div className="text-xs text-gray-500">
            Results based on analysis of 70+ similar trials
          </div>
        </CardFooter>
      )}
    </Card>
  );
}