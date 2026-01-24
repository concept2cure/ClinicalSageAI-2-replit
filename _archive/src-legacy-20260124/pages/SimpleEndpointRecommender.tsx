import { useState } from 'react';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Clipboard, ArrowRight, Target, FileText, LineChart } from 'lucide-react';
import EndpointFrequencyHeatmap from '@/components/EndpointFrequencyHeatmap';

interface EndpointRecommendation {
  endpoint: string;
  summary: string;
  matchCount: number;
  successRate?: number;
  reference?: string;
}

export default function SimpleEndpointRecommender() {
  const [indication, setIndication] = useState('');
  const [phase, setPhase] = useState('');
  const [keywords, setKeywords] = useState('');
  const [recommendations, setRecommendations] = useState<EndpointRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('recommendations');
  const [selectedEndpoints, setSelectedEndpoints] = useState<string[]>([]);
  const { toast } = useToast();
  const [_, setLocation] = useLocation();

  // Sample indications and phases for the dropdown
  const indications = [
    'Oncology',
    'Cardiovascular',
    'Neurology',
    'Immunology',
    'Infectious Disease',
    'Metabolic Disorders'
  ];
  
  const phases = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];

  const fetchRecommendations = async () => {
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
    
    setLoading(true);
    try {
      const res = await fetch('/api/endpoint/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indication, phase, keywords }),
      });

      const data = await res.json();
      setRecommendations(data);
      setActiveTab('recommendations');
    } catch (error) {
      console.error('Error fetching endpoint recommendations:', error);
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: "Failed to fetch endpoint recommendations. Please try again.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error",
        description: "Failed to fetch endpoint recommendations. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleEndpointSelection = (endpoint: string) => {
    setSelectedEndpoints(prev => {
      if (prev.includes(endpoint)) {
        return prev.filter(e => e !== endpoint);
      } else {
        return [...prev, endpoint];
      }
    });
  };

  const sendToProtocolOptimizer = () => {
    if (selectedEndpoints.length === 0) {
      // toast call replaced
  // Original: toast({
        title: "No endpoints selected",
        description: "Please select at least one endpoint to continue.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "No endpoints selected",
        description: "Please select at least one endpoint to continue.",
        variant: "destructive"
      });
      return;
    }

    // In a real implementation, we would save these selected endpoints to state/storage
    // and navigate to the protocol optimizer with this data
    
    // toast call replaced
  // Original: toast({
      title: "Endpoints Selected",
      description: `${selectedEndpoints.length} endpoints have been selected for the Protocol Optimizer.`,
    })
  console.log('Toast would show:', {
      title: "Endpoints Selected",
      description: `${selectedEndpoints.length} endpoints have been selected for the Protocol Optimizer.`,
    });

    // Simulate navigation to protocol optimizer
    // In a real app, you would pass the selected endpoints to the protocol optimizer
    setTimeout(() => {
      setLocation('/protocol-optimizer');
    }, 1000);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Endpoint Recommender</h1>
          <p className="text-slate-500">Find optimal endpoints based on historical clinical trial data</p>
        </div>
        
        <div className="flex items-center space-x-2">
          {selectedEndpoints.length > 0 && (
            <Button onClick={sendToProtocolOptimizer} className="bg-green-600 hover:bg-green-700">
              <Clipboard className="mr-2 h-4 w-4" />
              Send to Protocol Optimizer
              <Badge className="ml-2 bg-white text-green-800">{selectedEndpoints.length}</Badge>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-md">Search Parameters</CardTitle>
          <CardDescription>
            Enter your study details to find the most appropriate endpoints
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="indication">Indication</Label>
              <Select value={indication} onValueChange={setIndication}>
                <SelectTrigger id="indication">
                  <SelectValue placeholder="Select indication" />
                </SelectTrigger>
                <SelectContent>
                  {indications.map(ind => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phase">Trial Phase</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger id="phase">
                  <SelectValue placeholder="Select phase" />
                </SelectTrigger>
                <SelectContent>
                  {phases.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords (Optional)</Label>
              <Input
                id="keywords"
                placeholder="e.g. survival, biomarker"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-4 flex justify-between">
          <Button
            onClick={fetchRecommendations}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? 'Searching...' : 'Find Endpoints'}
          </Button>
        </CardFooter>
      </Card>

      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Results</CardTitle>
            <CardDescription>
              Based on analysis of similar clinical trials for {indication} in {phase}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="recommendations">
                  <Target className="mr-2 h-4 w-4" />
                  Recommendations
                </TabsTrigger>
                <TabsTrigger value="heatmap">
                  <LineChart className="mr-2 h-4 w-4" />
                  Frequency Heatmap
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="recommendations" className="space-y-4">
                {recommendations.map((rec, idx) => (
                  <Card key={idx} className={selectedEndpoints.includes(rec.endpoint) ? "border-blue-400 shadow-md" : ""}>
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row justify-between">
                        <div className="flex-1">
                          <div className="flex items-center">
                            <h4 className="text-lg font-semibold text-blue-800">📌 {rec.endpoint}</h4>
                            <Badge className="ml-2 bg-blue-100 text-blue-800 hover:bg-blue-200">
                              {rec.matchCount} trial{rec.matchCount !== 1 ? 's' : ''}
                            </Badge>
                            {rec.successRate && (
                              <Badge className="ml-2 bg-green-100 text-green-800 hover:bg-green-200">
                                {rec.successRate}% success rate
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 mt-1">{rec.summary}</p>
                        </div>
                        <div className="flex items-center mt-2 md:mt-0 space-x-2">
                          {rec.reference && (
                            <Button variant="outline" size="sm">
                              <FileText className="h-4 w-4 mr-1" />
                              View Example
                            </Button>
                          )}
                          <Button 
                            variant={selectedEndpoints.includes(rec.endpoint) ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleEndpointSelection(rec.endpoint)}
                            className={selectedEndpoints.includes(rec.endpoint) ? "bg-blue-600" : ""}
                          >
                            {selectedEndpoints.includes(rec.endpoint) ? (
                              <>Selected</>
                            ) : (
                              <>Select</>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {selectedEndpoints.length > 0 && (
                  <div className="pt-4 mt-4 border-t">
                    <Button 
                      onClick={sendToProtocolOptimizer}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Clipboard className="mr-2 h-4 w-4" />
                      Send {selectedEndpoints.length} endpoint{selectedEndpoints.length !== 1 ? 's' : ''} to Protocol Optimizer
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="heatmap">
                <EndpointFrequencyHeatmap indication={indication} phase={phase} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}