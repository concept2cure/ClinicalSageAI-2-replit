import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  Upload,
  BarChart2,
  FileText,
  Layers,
  Database,
  Zap,
  BookOpen,
  ArrowUpRight,
  Box,
  Package2,
  Brain,
} from 'lucide-react';

// Import CSR Analyzer Components
import CSRDashboard from '@/components/csr-analyzer/CSRDashboard';
import CSRSearchInterface from '@/components/csr-analyzer/CSRSearchInterface';
import CSRSemanticAnalysis from '@/components/csr-analyzer/CSRSemanticAnalysis';
import CSRIntelligenceInsights from '@/components/csr-analyzer/CSRIntelligenceInsights';
import CSRComparison from '@/components/csr-analyzer/CSRComparison';
import CSRUploader from '@/components/csr-analyzer/CSRUploader';
import CSRUnderstandingHub from '@/components/csr-analyzer/CSRUnderstandingHub';

const CSRAnalyzer = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = e => {
    e.preventDefault();
    console.log('Searching for:', searchQuery);
    // Implement search functionality
  };

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CSR Analyzer™</h1>
          <p className="text-muted-foreground">
            Intelligent analysis and insights for Clinical Study Reports
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => setActiveTab('upload')}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Upload size={16} />
            Upload CSR
          </Button>
          <Button
            onClick={() => setActiveTab('insights')}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <Brain size={16} />
            View Insights
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex w-full max-w-3xl gap-2">
        <Input
          placeholder="Search CSRs by indication, intervention, or ID..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-grow"
        />
        <Button type="submit">
          <Search className="h-4 w-4 mr-2" />
          Search
        </Button>
      </form>

      {/* Main Content Area */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <TabsTrigger value="dashboard" className="flex items-center gap-1">
            <BarChart2 className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="search" className="flex items-center gap-1">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search</span>
          </TabsTrigger>
          <TabsTrigger value="semantic" className="flex items-center gap-1">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Semantic Analysis</span>
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-1">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Intelligence Insights</span>
          </TabsTrigger>
          <TabsTrigger value="compare" className="flex items-center gap-1">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Compare CSRs</span>
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex items-center gap-1">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
          </TabsTrigger>
          <TabsTrigger value="understanding" className="flex items-center gap-1">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Understanding Hub</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="dashboard">
            <CSRDashboard />
          </TabsContent>

          <TabsContent value="search">
            <CSRSearchInterface searchQuery={searchQuery} />
          </TabsContent>

          <TabsContent value="semantic">
            <CSRSemanticAnalysis />
          </TabsContent>

          <TabsContent value="insights">
            <CSRIntelligenceInsights />
          </TabsContent>

          <TabsContent value="compare">
            <CSRComparison />
          </TabsContent>

          <TabsContent value="upload">
            <CSRUploader />
          </TabsContent>

          <TabsContent value="understanding">
            <CSRUnderstandingHub />
          </TabsContent>
        </div>
      </Tabs>

      {/* Quick Access Cards */}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Recent CSRs</CardTitle>
              <FileText className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">328</p>
              <p className="text-xs text-muted-foreground">+12% from last month</p>
              <Button variant="link" className="px-0 mt-2 h-auto">
                View all CSRs
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Semantic Models</CardTitle>
              <Box className="h-5 w-5 text-indigo-600" />
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">17</p>
              <p className="text-xs text-muted-foreground">Updated semantic analysis models</p>
              <Button variant="link" className="px-0 mt-2 h-auto">
                View model details
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Therapeutic Areas</CardTitle>
              <Package2 className="h-5 w-5 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">32</p>
              <p className="text-xs text-muted-foreground">
                Across 12 different regulatory environments
              </p>
              <Button variant="link" className="px-0 mt-2 h-auto">
                Filter by therapeutic area
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Intelligence Hub</CardTitle>
              <Brain className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">2.8K</p>
              <p className="text-xs text-muted-foreground">Knowledge points extracted from CSRs</p>
              <Button
                variant="link"
                className="px-0 mt-2 h-auto"
                onClick={() => setActiveTab('understanding')}
              >
                Explore the hub
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CSRAnalyzer;
