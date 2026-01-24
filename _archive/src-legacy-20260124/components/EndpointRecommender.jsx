import { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, PlusCircle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * EndpointRecommender Component
 * 
 * Provides AI-powered endpoint recommendations based on indication and phase
 * Uses Hugging Face models for generating endpoint suggestions
 */
export default function EndpointRecommender({ 
  indication, 
  phase,
  onAddEndpoint = () => {} 
}) {
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [selectedEndpoints, setSelectedEndpoints] = useState([]);
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [endpointType, setEndpointType] = useState('primary');
  const { toast } = useToast();

  // Request endpoint recommendations from API
  const fetchRecommendations = async () => {
    if (!indication) {
      // toast call replaced
  // Original: toast({
        title: "Missing Information",
        description: "Please select an indication first",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing Information",
        description: "Please select an indication first",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest('POST', '/api/endpoint/recommend', {
        indication,
        phase: phase || 'Phase 2',
        count: 5
      });
      
      const data = await response.json();
      
      if (data.recommendations && Array.isArray(data.recommendations)) {
        setRecommendations(data.recommendations);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("Error fetching endpoint recommendations:", error);
      // toast call replaced
  // Original: toast({
        title: "Recommendation Error",
        description: "Unable to generate endpoint recommendations. Please try again.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Recommendation Error",
        description: "Unable to generate endpoint recommendations. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Add a recommendation to selected endpoints
  const addRecommendation = (endpoint) => {
    if (!selectedEndpoints.includes(endpoint)) {
      const newSelected = [...selectedEndpoints, endpoint];
      setSelectedEndpoints(newSelected);
      
      // Notify parent component
      onAddEndpoint({
        text: endpoint,
        type: endpointType
      });
      
      // toast call replaced
  // Original: toast({
        title: "Endpoint Added",
        description: `Added ${endpoint} as a ${endpointType} endpoint`,
      })
  console.log('Toast would show:', {
        title: "Endpoint Added",
        description: `Added ${endpoint} as a ${endpointType} endpoint`,
      });
    }
  };

  // Add custom endpoint
  const addCustomEndpoint = () => {
    if (customEndpoint.trim() && !selectedEndpoints.includes(customEndpoint)) {
      const newSelected = [...selectedEndpoints, customEndpoint];
      setSelectedEndpoints(newSelected);
      
      // Notify parent component
      onAddEndpoint({
        text: customEndpoint,
        type: endpointType
      });
      
      // toast call replaced
  // Original: toast({
        title: "Custom Endpoint Added",
        description: `Added ${customEndpoint} as a ${endpointType} endpoint`,
      })
  console.log('Toast would show:', {
        title: "Custom Endpoint Added",
        description: `Added ${customEndpoint} as a ${endpointType} endpoint`,
      });
      
      setCustomEndpoint('');
    }
  };

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Endpoint Recommender
        </CardTitle>
        <CardDescription>
          Get AI-powered endpoint recommendations based on similar trials
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="grid gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="endpoint-type">Endpoint Type</Label>
            <Select value={endpointType} onValueChange={setEndpointType}>
              <SelectTrigger id="endpoint-type" className="w-full">
                <SelectValue placeholder="Select Endpoint Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="secondary">Secondary</SelectItem>
                <SelectItem value="exploratory">Exploratory</SelectItem>
                <SelectItem value="safety">Safety</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="default" 
              className="w-full"
              onClick={fetchRecommendations}
              disabled={loading || !indication}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Recommendations"
              )}
            </Button>
          </div>
          
          {recommendations.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Recommendations for {indication}</h3>
              <div className="flex flex-wrap gap-2">
                {recommendations.map((endpoint, index) => (
                  <Badge 
                    key={index} 
                    variant={selectedEndpoints.includes(endpoint) ? "outline" : "secondary"}
                    className="cursor-pointer hover:bg-primary/10 flex items-center gap-1"
                    onClick={() => addRecommendation(endpoint)}
                  >
                    {selectedEndpoints.includes(endpoint) ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : (
                      <PlusCircle className="h-3 w-3" />
                    )}
                    {endpoint}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          <div className="mt-6">
            <h3 className="text-sm font-medium mb-2">Add Custom Endpoint</h3>
            <div className="flex gap-2">
              <Input 
                placeholder="Enter custom endpoint" 
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={addCustomEndpoint}
                disabled={!customEndpoint.trim()}
              >
                <PlusCircle className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="flex justify-between flex-wrap">
        <div className="text-xs text-muted-foreground">
          Based on analysis of {phase || 'all phases'} trials for {indication || 'selected indication'}
        </div>
        {selectedEndpoints.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {selectedEndpoints.length} endpoint{selectedEndpoints.length !== 1 ? 's' : ''} added
          </div>
        )}
      </CardFooter>
    </Card>
  );
}