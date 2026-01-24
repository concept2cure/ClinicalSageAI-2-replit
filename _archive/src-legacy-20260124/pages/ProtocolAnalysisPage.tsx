import React, { useEffect, useState } from 'react';
import { useParams } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ProtocolAnalysis {
  protocol_id: string;
  title: string;
  indication: string;
  phase: string;
  sample_size: number;
  duration_weeks: number;
  primary_endpoints: string[];
  secondary_endpoints: string[];
  inclusion_criteria: string[];
  exclusion_criteria: string[];
  recommendations: {
    endpoint_recommendations: string[];
    sample_size_recommendations: string[];
    design_recommendations: string[];
    risk_factors: string[];
  };
  similar_trials: {
    trial_id: string;
    title: string;
    similarity_score: number;
    key_differences: string[];
  }[];
}

export default function ProtocolAnalysisPage() {
  const { protocolId } = useParams();
  const [analysis, setAnalysis] = useState<ProtocolAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchAnalysis() {
      if (!protocolId) {
        setError('No protocol ID provided');
        setLoading(false);
        return;
      }

      try {
        const response = await apiRequest('GET', `/api/protocol/analysis/${protocolId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch protocol analysis');
        }
        
        const data = await response.json();
        setAnalysis(data);
      } catch (err) {
        console.error('Error fetching protocol analysis:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        // toast call replaced
  // Original: toast({
          title: 'Error',
          description: 'Failed to load protocol analysis. Please try again.',
          variant: 'destructive',
        })
  console.log('Toast would show:', {
          title: 'Error',
          description: 'Failed to load protocol analysis. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }

    fetchAnalysis();
  }, [protocolId, toast]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading protocol analysis...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Error Loading Analysis</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => window.history.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Alert className="mb-6">
          <AlertTitle>No Analysis Found</AlertTitle>
          <AlertDescription>
            We couldn't find the protocol analysis you requested. It may have been deleted or the ID is incorrect.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => window.history.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{analysis.title || 'Protocol Analysis'}</h1>
        <p className="text-muted-foreground">
          Comprehensive analysis of your clinical trial protocol with evidence-based recommendations
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Indication</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{analysis.indication}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Phase</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{analysis.phase}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Sample Size</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{analysis.sample_size} participants</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="mb-8">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="criteria">Eligibility Criteria</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="similar-trials">Similar Trials</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Study Overview</CardTitle>
                <CardDescription>Key parameters of your protocol design</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium">Indication</h3>
                    <p className="text-muted-foreground">{analysis.indication}</p>
                  </div>
                  <div>
                    <h3 className="font-medium">Phase</h3>
                    <p className="text-muted-foreground">{analysis.phase}</p>
                  </div>
                  <div>
                    <h3 className="font-medium">Sample Size</h3>
                    <p className="text-muted-foreground">{analysis.sample_size} participants</p>
                  </div>
                  <div>
                    <h3 className="font-medium">Duration</h3>
                    <p className="text-muted-foreground">{analysis.duration_weeks} weeks</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Quick Summary</CardTitle>
                <CardDescription>Key insights from the analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium">Strongest Elements</h3>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      <li>Well-defined primary endpoints</li>
                      <li>Appropriate eligibility criteria</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-medium">Recommendations Focus</h3>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      <li>Consider endpoint optimization</li>
                      <li>Review sample size calculations</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="endpoints" className="space-y-6 p-4">
          <Card>
            <CardHeader>
              <CardTitle>Primary Endpoints</CardTitle>
              <CardDescription>Main outcomes measured in the study</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2">
                {analysis.primary_endpoints.map((endpoint, index) => (
                  <li key={index}>{endpoint}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Secondary Endpoints</CardTitle>
              <CardDescription>Additional outcomes of interest</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2">
                {analysis.secondary_endpoints.map((endpoint, index) => (
                  <li key={index}>{endpoint}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="criteria" className="space-y-6 p-4">
          <Card>
            <CardHeader>
              <CardTitle>Inclusion Criteria</CardTitle>
              <CardDescription>Requirements for participant eligibility</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2">
                {analysis.inclusion_criteria.map((criterion, index) => (
                  <li key={index}>{criterion}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Exclusion Criteria</CardTitle>
              <CardDescription>Factors that prevent participant eligibility</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2">
                {analysis.exclusion_criteria.map((criterion, index) => (
                  <li key={index}>{criterion}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="recommendations" className="space-y-6 p-4">
          <Card>
            <CardHeader>
              <CardTitle>Endpoint Recommendations</CardTitle>
              <CardDescription>Suggestions to optimize study endpoints</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2">
                {analysis.recommendations.endpoint_recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Sample Size Recommendations</CardTitle>
              <CardDescription>Statistical power considerations</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2">
                {analysis.recommendations.sample_size_recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Design Recommendations</CardTitle>
              <CardDescription>General study design improvements</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2">
                {analysis.recommendations.design_recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Risk Factors</CardTitle>
              <CardDescription>Potential challenges to address</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2">
                {analysis.recommendations.risk_factors.map((risk, index) => (
                  <li key={index}>{risk}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="similar-trials" className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {analysis.similar_trials.map((trial, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-base">{trial.title}</CardTitle>
                  <CardDescription>ID: {trial.trial_id}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-3">
                    <span className="font-medium">Similarity Score:</span>{' '}
                    <span className="text-primary">{(trial.similarity_score * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="font-medium">Key Differences:</span>
                    <ul className="list-disc pl-5 mt-1 text-sm text-muted-foreground">
                      {trial.key_differences.map((diff, i) => (
                        <li key={i}>{diff}</li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      
      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={() => window.history.back()}>
          Back
        </Button>
        <Button>
          Export Analysis
        </Button>
      </div>
    </div>
  );
}