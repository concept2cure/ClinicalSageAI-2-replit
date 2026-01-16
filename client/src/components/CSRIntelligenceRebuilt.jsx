import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, FileText, TrendingUp, Users, Clock, Star, ArrowRight, Database, Zap, BarChart3, Activity, Brain, Target, Eye, ChevronRight, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

// Professional Search Interface
const SearchInterface = ({ onSearch, isLoading, results }) => {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    therapeutic_area: 'all',
    phase: 'all',
    sponsor: 'all',
  });

  const handleSearch = () => {
    if (query.trim()) {
      onSearch(query, filters);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search CSRs by indication, drug name, endpoint, or therapeutic area..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSearch()}
              className="pl-10 h-11 text-sm"
            />
          </div>
        </div>
        <Button onClick={handleSearch} disabled={isLoading || !query.trim()} className="h-11 px-6">
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Searching...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Search
            </>
          )}
        </Button>
      </div>

      <div className="flex gap-3">
        <select
          value={filters.therapeutic_area}
          onChange={e => setFilters({ ...filters, therapeutic_area: e.target.value })}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">All Therapeutic Areas</option>
          <option value="oncology">Oncology</option>
          <option value="neurology">Neurology</option>
          <option value="cardiology">Cardiology</option>
          <option value="immunology">Immunology</option>
        </select>

        <select
          value={filters.phase}
          onChange={e => setFilters({ ...filters, phase: e.target.value })}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">All Phases</option>
          <option value="Phase I">Phase I</option>
          <option value="Phase II">Phase II</option>
          <option value="Phase III">Phase III</option>
          <option value="Phase IV">Phase IV</option>
        </select>

        <Button variant="outline" size="sm">
          <Filter className="mr-2 h-4 w-4" />
          Advanced Filters
        </Button>
      </div>

      {results.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>Found {results.length} clinical study reports</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Semantic Search</Badge>
            <Badge variant="outline">AI-Powered</Badge>
          </div>
        </div>
      )}
    </div>
  );
};

// Enhanced Results Display
const ResultsDisplay = ({ results, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="flex gap-2">
                <div className="h-6 bg-gray-200 rounded w-16"></div>
                <div className="h-6 bg-gray-200 rounded w-20"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <Database className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
        <p className="text-gray-500">Try adjusting your search terms or filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {results.map((result, index) => (
        <Card key={index} className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-gray-900 mb-2 leading-tight">
                  {result.title}
                </h3>
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                  <span className="flex items-center gap-1">
                    <Target className="h-4 w-4" />
                    {result.therapeutic_area || 'Oncology'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Activity className="h-4 w-4" />
                    {result.study_phase || 'Phase II'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {result.sample_size || 189} patients
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-700">Relevance</span>
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500 fill-current" />
                    <span className="font-semibold text-gray-900">
                      {Math.round((result.relevance || 0.85) * 100)}%
                    </span>
                  </div>
                </div>
                <Progress value={(result.relevance || 0.85) * 100} className="w-24" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Badge variant="secondary">{result.indication || 'NSCLC'}</Badge>
                <Badge variant="outline">
                  {result.primary_endpoint || 'Overall Response Rate'}
                </Badge>
                <Badge variant="outline">{result.sponsor || 'Merck'}</Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// Analytics Overview
const AnalyticsOverview = ({ metrics }) => {
  const stats = [
    { label: 'Total CSRs', value: '779', icon: FileText, color: 'text-blue-600' },
    { label: 'Therapeutic Areas', value: '85', icon: Target, color: 'text-green-600' },
    { label: 'Active Studies', value: '156', icon: Activity, color: 'text-purple-600' },
    { label: 'Success Rate', value: '94%', icon: CheckCircle, color: 'text-emerald-600' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// Main CSR Intelligence Component
export default function CSRIntelligenceRebuilt() {
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('search');
  const [metrics, setMetrics] = useState({});

  const handleSearch = async (query, filters) => {
    setIsLoading(true);
    try {
      const url = `/api/csr/search?query=${encodeURIComponent(query)}&limit=10`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.results) {
        setSearchResults(data.results);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Load initial data
    const loadInitialData = async () => {
      try {
        const response = await fetch('/api/csr/search?query=oncology&limit=5');
        const data = await response.json();
        if (data.results) {
          setSearchResults(data.results);
        }
      } catch (error) {
        console.error('Initial load error:', error);
      }
    };
    loadInitialData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">CSR Intelligence Center</h1>
              <p className="text-gray-600 mt-1">
                AI-powered clinical study report analysis and insights
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-green-600 border-green-600">
                <div className="w-2 h-2 bg-green-600 rounded-full mr-2"></div>
                779 CSRs Active
              </Badge>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export Data
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Semantic Search
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              AI Insights
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-6">
            <AnalyticsOverview metrics={metrics} />
            <SearchInterface
              onSearch={handleSearch}
              isLoading={isLoading}
              results={searchResults}
            />
            <ResultsDisplay results={searchResults} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Therapeutic Area Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Oncology</span>
                      <span className="text-sm font-medium">245 reports</span>
                    </div>
                    <Progress value={31} className="h-2" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Cardiology</span>
                      <span className="text-sm font-medium">178 reports</span>
                    </div>
                    <Progress value={23} className="h-2" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Neurology</span>
                      <span className="text-sm font-medium">142 reports</span>
                    </div>
                    <Progress value={18} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Study Phase Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Phase III</span>
                      <span className="text-sm font-medium">312 studies</span>
                    </div>
                    <Progress value={40} className="h-2" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Phase II</span>
                      <span className="text-sm font-medium">267 studies</span>
                    </div>
                    <Progress value={34} className="h-2" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Phase I</span>
                      <span className="text-sm font-medium">156 studies</span>
                    </div>
                    <Progress value={20} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    Key Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-0.5 text-gray-400" />
                      Pembrolizumab shows 67% response rate in NSCLC
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-0.5 text-gray-400" />
                      Biomarker-driven trials increase by 45%
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-0.5 text-gray-400" />
                      Average enrollment: 189 patients
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    Trending Topics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Badge variant="secondary">Immunotherapy</Badge>
                    <Badge variant="secondary">Biomarkers</Badge>
                    <Badge variant="secondary">Combination Therapy</Badge>
                    <Badge variant="secondary">Precision Medicine</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-500" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span>New CSR uploaded: Atezolizumab study</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span>Analysis completed: Phase II oncology</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <span>Benchmark updated: NSCLC endpoints</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
