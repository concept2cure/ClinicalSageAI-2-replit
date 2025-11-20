import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { XCircle } from 'lucide-react';
import EndpointRecommender from '@/components/EndpointRecommender';
import EndpointEvaluator from '@/components/EndpointEvaluator';
import { apiRequest } from '@/lib/queryClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * EndpointDesigner Page
 *
 * Endpoint design and evaluation tool that combines recommendations
 * with detailed analyses for clinical trial protocol development
 */
export default function EndpointDesigner() {
  const [indication, setIndication] = useState('');
  const [phase, setPhase] = useState('Phase 2');
  const [endpoints, setEndpoints] = useState([]);
  const [indications, setIndications] = useState([]);
  const [activeTab, setActiveTab] = useState('recommend');

  // Load available indications
  useEffect(() => {
    const fetchIndications = async () => {
      try {
        const response = await apiRequest('GET', '/api/stats');
        const data = await response.json();

        if (data.reportsByIndication) {
          const indicationsList = Object.keys(data.reportsByIndication).sort();
          setIndications(indicationsList);
        }
      } catch (error) {
        console.error('Error fetching indications:', error);
      }
    };

    fetchIndications();
  }, []);

  // Add new endpoint
  const handleAddEndpoint = endpoint => {
    // Check if endpoint already exists
    if (!endpoints.some(e => e.text === endpoint.text && e.type === endpoint.type)) {
      setEndpoints([...endpoints, endpoint]);
    }
  };

  // Remove endpoint
  const handleRemoveEndpoint = index => {
    const newEndpoints = [...endpoints];
    newEndpoints.splice(index, 1);
    setEndpoints(newEndpoints);
  };

  // Handle evaluation completion
  const handleEvaluationComplete = evaluations => {
    // Could save or process evaluation results if needed
    console.log('Evaluations complete:', evaluations);

    // Automatically switch to the Results tab
    setActiveTab('results');
  };

  // Group endpoints by type
  const endpointsByType = endpoints.reduce((acc, endpoint) => {
    const type = endpoint.type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(endpoint);
    return acc;
  }, {});

  // Get type label
  const getTypeLabel = type => {
    const labels = {
      primary: 'Primary',
      secondary: 'Secondary',
      exploratory: 'Exploratory',
      safety: 'Safety',
    };
    return labels[type] || type;
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Clinical Trial Endpoint Designer</h1>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Study Parameters</CardTitle>
            <CardDescription>Select the indication and phase</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="indication">Indication</Label>
                <Select value={indication} onValueChange={setIndication}>
                  <SelectTrigger id="indication">
                    <SelectValue placeholder="Select indication" />
                  </SelectTrigger>
                  <SelectContent>
                    {indications.map(ind => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="phase">Study Phase</Label>
                <Select value={phase} onValueChange={setPhase}>
                  <SelectTrigger id="phase">
                    <SelectValue placeholder="Select phase" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Phase 1">Phase 1</SelectItem>
                    <SelectItem value="Phase 1/Phase 2">Phase 1/2</SelectItem>
                    <SelectItem value="Phase 2">Phase 2</SelectItem>
                    <SelectItem value="Phase 2/Phase 3">Phase 2/3</SelectItem>
                    <SelectItem value="Phase 3">Phase 3</SelectItem>
                    <SelectItem value="Phase 4">Phase 4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Selected Endpoints</CardTitle>
            <CardDescription>
              {endpoints.length > 0
                ? `${endpoints.length} endpoint${endpoints.length !== 1 ? 's' : ''} selected`
                : 'No endpoints selected yet'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(endpointsByType).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Use the endpoint recommender below to add endpoints
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(endpointsByType).map(([type, typeEndpoints]) => (
                  <div key={type}>
                    <h3 className="text-sm font-medium mb-2">{getTypeLabel(type)} Endpoints</h3>
                    <div className="flex flex-wrap gap-2">
                      {typeEndpoints.map((endpoint, index) => (
                        <Badge
                          key={`${type}-${index}`}
                          variant="outline"
                          className="flex items-center gap-1 py-1.5"
                        >
                          {endpoint.text}
                          <XCircle
                            className="h-3.5 w-3.5 ml-1 cursor-pointer text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveEndpoint(endpoints.indexOf(endpoint))}
                          />
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="recommend">Recommender</TabsTrigger>
            <TabsTrigger value="evaluate" disabled={endpoints.length === 0}>
              Evaluator
            </TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
          </TabsList>

          <TabsContent value="recommend" className="py-4">
            <EndpointRecommender
              indication={indication}
              phase={phase}
              onAddEndpoint={handleAddEndpoint}
            />
          </TabsContent>

          <TabsContent value="evaluate" className="py-4">
            <EndpointEvaluator
              indication={indication}
              phase={phase}
              endpoints={endpoints}
              onEvaluationComplete={handleEvaluationComplete}
            />
          </TabsContent>

          <TabsContent value="results" className="py-4">
            <Card>
              <CardHeader>
                <CardTitle>Endpoint Analysis Results</CardTitle>
                <CardDescription>
                  Summary of endpoint evaluation for {indication} ({phase})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {endpoints.length > 0 ? (
                  <div className="space-y-4">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Endpoint</th>
                          <th className="text-left py-2">Type</th>
                          <th className="text-left py-2">Risk Level</th>
                          <th className="text-left py-2">Success Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {endpoints.map((endpoint, index) => (
                          <tr key={index} className="border-b">
                            <td className="py-2">{endpoint.text}</td>
                            <td className="py-2">{getTypeLabel(endpoint.type)}</td>
                            <td className="py-2">
                              <Badge variant="outline">Pending Evaluation</Badge>
                            </td>
                            <td className="py-2">-</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="text-sm text-muted-foreground mt-4">
                      Switch to the Evaluator tab to perform detailed evaluation of these endpoints
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No endpoints selected. Use the recommender to add endpoints first.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
