import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search, Filter, FileText, Download, ArrowUpRight, CheckCircle2, XCircle, AlertCircle, Clock, CalendarRange } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

// Sample search results
const searchResults = [
  {
    id: 'CSR-2023-A109',
    title: 'Phase 2b Efficacy Study in Metabolic Disease',
    indication: 'Type 2 Diabetes',
    sponsor: 'PharmaCorp, Inc.',
    phase: 'Phase 2b',
    date: '2023-11-15',
    status: 'complete',
    score: 89,
    studyDesign: 'Randomized, double-blind, placebo-controlled, parallel-group',
    primaryEndpoint: 'Change from baseline in HbA1c at Week 24',
    sampleSize: 423,
    keywords: ['diabetes', 'glycemic control', 'metabolic', 'HbA1c'],
  },
  {
    id: 'CSR-2023-B241',
    title: 'Phase 1 PK/PD Study in Healthy Volunteers',
    indication: 'Hypertension',
    sponsor: 'BioScience Labs',
    phase: 'Phase 1',
    date: '2023-10-22',
    status: 'complete',
    score: 92,
    studyDesign: 'Single-ascending dose, randomized, placebo-controlled',
    primaryEndpoint: 'Safety and tolerability; pharmacokinetic parameters',
    sampleSize: 48,
    keywords: ['pharmacokinetics', 'healthy volunteers', 'safety', 'dose escalation'],
  },
  {
    id: 'CSR-2023-C187',
    title: 'Phase 3 Pivotal Trial for Oncology Indication',
    indication: 'Non-small Cell Lung Cancer',
    sponsor: 'Oncovita Therapeutics',
    phase: 'Phase 3',
    date: '2023-09-05',
    status: 'complete',
    score: 84,
    studyDesign: 'Randomized, open-label, active-controlled, multicenter',
    primaryEndpoint: 'Overall survival; progression-free survival',
    sampleSize: 814,
    keywords: ['oncology', 'NSCLC', 'survival', 'progression-free'],
  },
  {
    id: 'CSR-2023-D023',
    title: 'Phase 2a Dose-Finding Study in CNS Disorder',
    indication: 'Major Depressive Disorder',
    sponsor: 'NeuroCure Pharmaceuticals',
    phase: 'Phase 2a',
    date: '2023-08-17',
    status: 'complete',
    score: 78,
    studyDesign: 'Randomized, double-blind, placebo-controlled, dose-ranging',
    primaryEndpoint: 'Change from baseline in MADRS total score at Week 6',
    sampleSize: 216,
    keywords: ['psychiatry', 'depression', 'CNS', 'MADRS'],
  },
  {
    id: 'CSR-2023-E305',
    title: 'Phase 1b Safety Extension Study',
    indication: 'Rheumatoid Arthritis',
    sponsor: 'ImmunoGene Therapies',
    phase: 'Phase 1b',
    date: '2023-07-29',
    status: 'complete',
    score: 95,
    studyDesign: 'Open-label, single-arm extension study',
    primaryEndpoint: 'Incidence of treatment-emergent adverse events over 52 weeks',
    sampleSize: 72,
    keywords: ['immunology', 'rheumatoid arthritis', 'safety', 'long-term'],
  },
];

// Filter options
const phaseOptions = ['All Phases', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];
const indicationOptions = [
  'All Indications',
  'Oncology',
  'Cardiology',
  'Neurology',
  'Immunology',
  'Infectious Disease',
  'Metabolic Disorders',
];
const yearOptions = ['All Years', '2025', '2024', '2023', '2022', '2021'];

const CSRSearchInterface = ({ searchQuery = '' }) => {
  const [searchTerm, setSearchTerm] = useState(searchQuery);
  const [selectedPhase, setSelectedPhase] = useState('All Phases');
  const [selectedIndication, setSelectedIndication] = useState('All Indications');
  const [selectedYear, setSelectedYear] = useState('All Years');
  const [activeTab, setActiveTab] = useState('all');
  const [filteredResults, setFilteredResults] = useState(searchResults);

  const handleSearch = e => {
    e.preventDefault();
    console.log('Searching for:', searchTerm);
    // In a real implementation, this would call the search API

    // For now, we'll just filter the mock data
    let results = searchResults;

    if (searchTerm) {
      const lowercaseTerm = searchTerm.toLowerCase();
      results = results.filter(
        result =>
          result.title.toLowerCase().includes(lowercaseTerm) ||
          result.indication.toLowerCase().includes(lowercaseTerm) ||
          result.sponsor.toLowerCase().includes(lowercaseTerm) ||
          result.keywords.some(keyword => keyword.includes(lowercaseTerm))
      );
    }

    if (selectedPhase !== 'All Phases') {
      results = results.filter(result => result.phase === selectedPhase);
    }

    if (selectedIndication !== 'All Indications') {
      // Just a simplified version for the demo
      const indicationMap = {
        Oncology: ['Non-small Cell Lung Cancer'],
        Cardiology: ['Hypertension'],
        Neurology: ['Major Depressive Disorder'],
        Immunology: ['Rheumatoid Arthritis'],
        'Metabolic Disorders': ['Type 2 Diabetes'],
      };

      const indicationList = indicationMap[selectedIndication] || [];
      results = results.filter(result => indicationList.includes(result.indication));
    }

    if (selectedYear !== 'All Years') {
      results = results.filter(result => result.date.includes(selectedYear));
    }

    setFilteredResults(results);
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle>CSR Search</CardTitle>
          <CardDescription>
            Find and analyze clinical study reports across therapeutic areas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-grow relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search by keyword, indication, treatment, sponsor..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <Button type="submit" className="gap-1">
                <Search className="h-4 w-4" />
                Search
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div>
                <Select value={selectedPhase} onValueChange={setSelectedPhase}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select phase" />
                  </SelectTrigger>
                  <SelectContent>
                    {phaseOptions.map(phase => (
                      <SelectItem key={phase} value={phase}>
                        {phase}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={selectedIndication} onValueChange={setSelectedIndication}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select indication" />
                  </SelectTrigger>
                  <SelectContent>
                    {indicationOptions.map(indication => (
                      <SelectItem key={indication} value={indication}>
                        {indication}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map(year => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" type="button" className="gap-1 w-full md:w-auto">
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">Advanced Filters</span>
                </Button>
              </div>
            </div>
          </form>

          <div className="mt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="all">All CSRs</TabsTrigger>
                <TabsTrigger value="oncology">Oncology</TabsTrigger>
                <TabsTrigger value="cardio">Cardiology</TabsTrigger>
                <TabsTrigger value="neurology">Neurology</TabsTrigger>
                <TabsTrigger value="immunology">Immunology</TabsTrigger>
                <TabsTrigger value="metabolic">Metabolic</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab}>
                <div className="text-sm text-gray-500 mb-4">
                  Showing {filteredResults.length} results
                </div>

                <div className="space-y-4">
                  {filteredResults.length === 0 ? (
                    <div className="text-center py-6 border border-dashed rounded-md">
                      <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <h3 className="text-lg font-medium text-gray-900 mb-1">No CSRs Found</h3>
                      <p className="text-gray-500 mb-4">Try adjusting your search criteria</p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearchTerm('');
                          setSelectedPhase('All Phases');
                          setSelectedIndication('All Indications');
                          setSelectedYear('All Years');
                        }}
                      >
                        Reset Filters
                      </Button>
                    </div>
                  ) : (
                    filteredResults.map(result => (
                      <Card key={result.id} className="shadow-sm">
                        <CardHeader className="pb-2">
                          <div className="flex justify-between">
                            <div>
                              <CardTitle className="text-lg flex items-center gap-2">
                                {result.title}
                                <Badge variant="outline">{result.phase}</Badge>
                              </CardTitle>
                              <CardDescription>
                                {result.sponsor} · {result.indication}
                              </CardDescription>
                            </div>
                            <Badge variant={result.status === 'complete' ? 'success' : 'secondary'}>
                              {result.status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="pb-2">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                              <div className="text-sm font-medium">Study Design</div>
                              <div className="text-sm text-gray-600">{result.studyDesign}</div>
                            </div>
                            <div>
                              <div className="text-sm font-medium">Primary Endpoint</div>
                              <div className="text-sm text-gray-600">{result.primaryEndpoint}</div>
                            </div>
                            <div>
                              <div className="text-sm font-medium">Sample Size</div>
                              <div className="text-sm text-gray-600">
                                {result.sampleSize} subjects
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {result.keywords.map((keyword, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                        <CardFooter className="pt-2 border-t flex justify-between">
                          <div className="flex items-center text-sm text-gray-500">
                            <CalendarRange className="h-4 w-4 mr-1" />
                            {result.date}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              <FileText className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <Button size="sm">
                              <ArrowUpRight className="h-4 w-4 mr-1" />
                              Analyze
                            </Button>
                          </div>
                        </CardFooter>
                      </Card>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CSRSearchInterface;
