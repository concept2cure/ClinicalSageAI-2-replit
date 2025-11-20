import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertCircle, Search, Sparkles, FileQuestion, Target, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';
import SimilarStudyResults from './SimilarStudyResults';

const SearchModes = {
  FREE_TEXT: 'free-text',
  STRUCTURED: 'structured',
  PROTOCOL: 'protocol',
};

const defaultPhases = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];
const defaultIndications = [
  'Oncology',
  'Neurology',
  'Cardiology',
  'Infectious Diseases',
  'Psychiatry',
  'Rare Diseases',
  'Diabetes',
  'Rheumatology',
  'Ophthalmology',
  'Respiratory',
];

const SimilarityGoalSearch = () => {
  // Common state
  const [searchMode, setSearchMode] = useState(SearchModes.FREE_TEXT);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  // Free text search state
  const [searchQuery, setSearchQuery] = useState('');

  // Structured search state
  const [indication, setIndication] = useState('');
  const [phase, setPhase] = useState('');
  const [primaryEndpoint, setPrimaryEndpoint] = useState('');
  const [sampleSize, setSampleSize] = useState(100);
  const [includePlaceboControl, setIncludePlaceboControl] = useState(true);

  // Protocol search state
  const [protocolTitle, setProtocolTitle] = useState('');
  const [protocolDescription, setProtocolDescription] = useState('');
  const [protocolEndpoints, setProtocolEndpoints] = useState('');
  const [protocolCriteria, setProtocolCriteria] = useState('');
  const [matchSimilarity, setMatchSimilarity] = useState(70);

  const handleSearch = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let endpoint = '';
      let payload = {};

      switch (searchMode) {
        case SearchModes.FREE_TEXT:
          endpoint = '/api/similar-goals';
          payload = { query: searchQuery };
          break;

        case SearchModes.STRUCTURED:
          endpoint = '/api/similar-goals/structured';
          payload = {
            indication,
            phase,
            primaryEndpoint,
            sampleSize: Number(sampleSize),
            includePlaceboControl,
          };
          break;

        case SearchModes.PROTOCOL:
          endpoint = '/api/similar-goals/protocol';
          payload = {
            title: protocolTitle,
            description: protocolDescription,
            endpoints: protocolEndpoints,
            criteria: protocolCriteria,
            matchThreshold: matchSimilarity / 100,
          };
          break;

        default:
          throw new Error('Invalid search mode');
      }

      const response = await apiRequest('POST', endpoint, payload);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.results || data.results.length === 0) {
        setError('No matching studies found. Please try different search criteria.');
        setResults(null);
      } else {
        setResults(data.results);
      }
    } catch (err) {
      console.error('Search error:', err);
      setError(err.message || 'An error occurred while searching for similar studies');
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearResults = () => {
    setResults(null);
    setError(null);
  };

  // Get current search query text for results display
  const getCurrentSearchText = () => {
    switch (searchMode) {
      case SearchModes.FREE_TEXT:
        return searchQuery;
      case SearchModes.STRUCTURED:
        return `${indication} Phase ${phase} trial with ${primaryEndpoint} endpoint`;
      case SearchModes.PROTOCOL:
        return protocolTitle || 'Protocol-based search';
      default:
        return '';
    }
  };

  if (results) {
    return (
      <SimilarStudyResults
        results={results}
        searchQuery={getCurrentSearchText()}
        onClear={handleClearResults}
      />
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Find Studies with Similar Goals</CardTitle>
        <CardDescription>
          Search for clinical studies with similar objectives, endpoints, and design principles
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <Tabs defaultValue={searchMode} onValueChange={setSearchMode} className="w-full">
          <TabsList className="grid grid-cols-3 mb-6">
            <TabsTrigger value={SearchModes.FREE_TEXT}>
              <Search className="h-4 w-4 mr-2" />
              Text Search
            </TabsTrigger>
            <TabsTrigger value={SearchModes.STRUCTURED}>
              <Target className="h-4 w-4 mr-2" />
              Structured Search
            </TabsTrigger>
            <TabsTrigger value={SearchModes.PROTOCOL}>
              <FileQuestion className="h-4 w-4 mr-2" />
              Protocol Match
            </TabsTrigger>
          </TabsList>

          <TabsContent value={SearchModes.FREE_TEXT} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="search-query">Search Query</Label>
              <Input
                id="search-query"
                placeholder="e.g., Phase 2 oncology trials with progression-free survival endpoints"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Describe the type of study you're looking for in natural language
              </p>
            </div>
          </TabsContent>

          <TabsContent value={SearchModes.STRUCTURED} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="indication">Therapeutic Area</Label>
                <Select value={indication} onValueChange={setIndication}>
                  <SelectTrigger id="indication">
                    <SelectValue placeholder="Select indication" />
                  </SelectTrigger>
                  <SelectContent>
                    {defaultIndications.map(ind => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
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
                    {defaultPhases.map(p => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="primary-endpoint">Primary Endpoint</Label>
                <Input
                  id="primary-endpoint"
                  placeholder="e.g., Overall Survival"
                  value={primaryEndpoint}
                  onChange={e => setPrimaryEndpoint(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sample-size">Target Sample Size: {sampleSize}</Label>
                <Slider
                  id="sample-size"
                  min={10}
                  max={1000}
                  step={10}
                  value={[sampleSize]}
                  onValueChange={values => setSampleSize(values[0])}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="placebo-control"
                  checked={includePlaceboControl}
                  onCheckedChange={setIncludePlaceboControl}
                />
                <Label htmlFor="placebo-control" className="cursor-pointer">
                  Include placebo control
                </Label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value={SearchModes.PROTOCOL} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="protocol-title">Protocol Title</Label>
              <Input
                id="protocol-title"
                placeholder="Enter protocol title"
                value={protocolTitle}
                onChange={e => setProtocolTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="protocol-description">Study Description</Label>
              <Textarea
                id="protocol-description"
                placeholder="Brief description of the study objectives and design"
                rows={3}
                value={protocolDescription}
                onChange={e => setProtocolDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="protocol-endpoints">Primary and Secondary Endpoints</Label>
              <Textarea
                id="protocol-endpoints"
                placeholder="List the endpoints, one per line"
                rows={3}
                value={protocolEndpoints}
                onChange={e => setProtocolEndpoints(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="protocol-criteria">Key Inclusion/Exclusion Criteria</Label>
              <Textarea
                id="protocol-criteria"
                placeholder="Main eligibility criteria, one per line"
                rows={3}
                value={protocolCriteria}
                onChange={e => setProtocolCriteria(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="match-similarity">Match Similarity: {matchSimilarity}%</Label>
              </div>
              <Slider
                id="match-similarity"
                min={50}
                max={95}
                step={5}
                value={[matchSimilarity]}
                onValueChange={values => setMatchSimilarity(values[0])}
              />
              <p className="text-xs text-muted-foreground">
                Higher values require closer matches to your protocol
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <div className="text-sm text-muted-foreground">
          Powered by AI-assisted semantic matching
        </div>
        <Button
          onClick={handleSearch}
          disabled={isLoading || (searchMode === SearchModes.FREE_TEXT && !searchQuery.trim())}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Find Similar Studies
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default SimilarityGoalSearch;
