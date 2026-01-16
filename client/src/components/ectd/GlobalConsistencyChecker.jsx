import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Replace, RefreshCw, CheckCircle, AlertTriangle, FileText, ArrowRight } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';

// Mock Search Results
const MOCK_MATCHES = [
  { id: 'm1', file: 'm2-5-clinical-overview.pdf', context: '...efficacy results from Study 101 showed...', match: 'Study 101' },
  { id: 'm2', file: 'm2-7-3-summary-clin-efficacy.pdf', context: '...primary endpoint of Study 101 was met...', match: 'Study 101' },
  { id: 'm3', file: 'm5-3-5-1-study-report.pdf', context: '...Study 101: A Phase 3 Randomized Trial...', match: 'Study 101' },
  { id: 'm4', file: 'm1-cover-letter.pdf', context: '...submission of data from Study 101...', match: 'Study 101' },
];

export default function GlobalConsistencyChecker() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedMatches, setSelectedMatches] = useState([]);

  const handleSearch = () => {
    if (!searchTerm) return;
    setIsSearching(true);
    // Simulate search
    setTimeout(() => {
      setResults(MOCK_MATCHES);
      setSelectedMatches(MOCK_MATCHES.map(m => m.id)); // Select all by default
      setIsSearching(false);
    }, 1000);
  };

  const handleReplace = () => {
    if (!replaceTerm) return;
    toast({
      title: "Global Replace Initiated",
      description: `Replacing "${searchTerm}" with "${replaceTerm}" in ${selectedMatches.length} files.`,
    });
    // Simulate replace
    setResults([]);
    setSearchTerm('');
    setReplaceTerm('');
  };

  const toggleMatch = (id) => {
    if (selectedMatches.includes(id)) {
      setSelectedMatches(selectedMatches.filter(m => m !== id));
    } else {
      setSelectedMatches([...selectedMatches, id]);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
      {/* Left Panel: Search Configuration */}
      <div className="lg:col-span-1 flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-blue-600" /> Consistency Checker
            </CardTitle>
            <CardDescription>
              Ensure terminology consistency across the entire eCTD dossier.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Find Term</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                <Input 
                  placeholder="e.g., Study 101" 
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Replace With</label>
              <div className="relative">
                <Replace className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                <Input 
                  placeholder="e.g., Study 101-B" 
                  className="pl-9"
                  value={replaceTerm}
                  onChange={(e) => setReplaceTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex gap-2 items-start">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <p className="text-xs text-amber-800">
                Global replacement affects all selected documents. This action is logged in the Audit Trail.
              </p>
            </div>

            <Button 
              className="w-full" 
              onClick={handleSearch}
              disabled={isSearching || !searchTerm}
            >
              {isSearching ? 'Scanning Dossier...' : 'Find All Occurrences'}
            </Button>
          </CardContent>
        </Card>

        <Card className="flex-1 bg-blue-50 border-blue-100">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-blue-900">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start bg-white text-blue-700 border-blue-200 hover:bg-blue-100">
              <CheckCircle className="h-4 w-4 mr-2" /> Check Product Name Spelling
            </Button>
            <Button variant="outline" className="w-full justify-start bg-white text-blue-700 border-blue-200 hover:bg-blue-100">
              <CheckCircle className="h-4 w-4 mr-2" /> Verify Study IDs
            </Button>
            <Button variant="outline" className="w-full justify-start bg-white text-blue-700 border-blue-200 hover:bg-blue-100">
              <CheckCircle className="h-4 w-4 mr-2" /> Standardize Date Formats
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel: Results */}
      <div className="lg:col-span-2 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle>Search Results</CardTitle>
              <Badge variant="secondary">{results.length} matches found</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[500px]">
              {results.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Search className="h-12 w-12 mb-2 opacity-20" />
                  <p>No results to display</p>
                </div>
              ) : (
                <div className="divide-y">
                  {results.map((match) => (
                    <div key={match.id} className="p-4 hover:bg-gray-50 flex items-start gap-3">
                      <Checkbox 
                        checked={selectedMatches.includes(match.id)}
                        onCheckedChange={() => toggleMatch(match.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="h-4 w-4 text-blue-500" />
                          <span className="font-medium text-sm">{match.file}</span>
                        </div>
                        <p className="text-sm text-gray-600 font-mono bg-gray-100 p-2 rounded">
                          {match.context.split(match.match).map((part, i, arr) => (
                            <React.Fragment key={i}>
                              {part}
                              {i < arr.length - 1 && (
                                <span className="bg-yellow-200 font-bold text-black px-1 rounded-sm">
                                  {match.match}
                                </span>
                              )}
                            </React.Fragment>
                          ))}
                        </p>
                        {replaceTerm && (
                          <div className="flex items-center gap-2 mt-2 text-xs text-green-600">
                            <ArrowRight className="h-3 w-3" />
                            Will become: <span className="font-bold">{replaceTerm}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
          <CardFooter className="justify-between border-t pt-4">
            <div className="text-sm text-muted-foreground">
              {selectedMatches.length} items selected
            </div>
            <Button 
              onClick={handleReplace}
              disabled={selectedMatches.length === 0 || !replaceTerm}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Replace All Selected
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
