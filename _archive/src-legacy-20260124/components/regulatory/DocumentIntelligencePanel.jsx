import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  FileText,
  Search,
  Download,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  BookOpen,
  Shield,
  Target,
  Zap,
  BarChart3,
  Calendar,
  Users,
  Globe,
} from 'lucide-react';

export default function DocumentIntelligencePanel() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('all');

  // Fetch regulatory document intelligence
  const { data: docIntelligence, isLoading } = useQuery({
    queryKey: ['/api/regulatory-intelligence/documents'],
    queryFn: async () => {
      const response = await fetch('/api/regulatory-intelligence/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'comprehensive document intelligence analysis',
          include_templates: true,
          include_guidance_updates: true,
          include_submission_insights: true,
        }),
      });

      if (!response.ok) throw new Error('Failed to load document intelligence');
      return response.json();
    },
    retry: 2,
  });

  const documentTypes = [
    { id: 'all', name: 'All Documents', count: 847 },
    { id: 'protocols', name: 'Protocols', count: 156 },
    { id: 'csr', name: 'CSRs', count: 234 },
    { id: 'submissions', name: 'Submissions', count: 89 },
    { id: 'guidance', name: 'Guidance Docs', count: 368 },
  ];

  const recentUpdates = [
    {
      title: 'FDA AI Guidance Final',
      type: 'FDA Guidance',
      date: '2025-01-06',
      impact: 'High',
      category: 'AI/ML Medical Devices',
    },
    {
      title: 'ICH E6(R3) Implementation',
      type: 'ICH Guideline',
      date: '2025-01-06',
      impact: 'Critical',
      category: 'GCP Quality Management',
    },
    {
      title: 'EMA Digital Health Update',
      type: 'EMA Guidance',
      date: '2024-12-15',
      impact: 'Medium',
      category: 'Digital Therapeutics',
    },
  ];

  const submissionInsights = {
    success_rate: 94,
    avg_review_time: 287,
    common_deficiencies: [
      'Incomplete QMS documentation',
      'Insufficient clinical data',
      'Protocol deviations not addressed',
      'Statistical analysis plan gaps',
    ],
    trending_requirements: [
      'AI/ML algorithm validation',
      'Real-world evidence integration',
      'Patient-centric endpoints',
      'Digital biomarker validation',
    ],
  };

  const templates = [
    {
      name: 'ICH E6(R3) Quality Management Plan',
      type: 'Protocol Template',
      compliance: 'ICH E6(R3)',
      downloads: 1247,
      updated: '2025-01-10',
    },
    {
      name: 'FDA AI/ML Pre-Sub Package',
      type: 'Submission Template',
      compliance: 'FDA AI Guidance',
      downloads: 856,
      updated: '2025-01-08',
    },
    {
      name: 'CSR Executive Summary',
      type: 'Report Template',
      compliance: 'ICH E3',
      downloads: 2134,
      updated: '2024-12-20',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Search className="mr-2 h-5 w-5" />
            Document Intelligence Search
          </CardTitle>
          <CardDescription>
            Search across 50,000+ regulatory documents with AI-powered insights
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4 mb-4">
            <Input
              placeholder="Search protocols, guidance, templates..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Button className="px-6">
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {documentTypes.map(type => (
              <Button
                key={type.id}
                variant={selectedDocType === type.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDocType(type.id)}
              >
                {type.name} ({type.count})
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Regulatory Updates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="mr-2 h-5 w-5" />
              Latest Regulatory Updates
            </CardTitle>
            <CardDescription>Critical guidance and regulatory changes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentUpdates.map((update, index) => (
                <div key={index} className="flex items-start justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-medium">{update.title}</h4>
                    <p className="text-sm text-gray-600">{update.category}</p>
                    <p className="text-xs text-gray-500">{update.date}</p>
                  </div>
                  <Badge
                    variant={
                      update.impact === 'Critical'
                        ? 'destructive'
                        : update.impact === 'High'
                          ? 'default'
                          : 'secondary'
                    }
                  >
                    {update.impact}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Submission Success Analytics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="mr-2 h-5 w-5" />
              Submission Analytics
            </CardTitle>
            <CardDescription>Industry benchmarks and success metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Success Rate</span>
                  <span>{submissionInsights.success_rate}%</span>
                </div>
                <Progress value={submissionInsights.success_rate} className="h-2" />
              </div>

              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-3 bg-blue-50 rounded">
                  <div className="text-2xl font-bold text-blue-600">
                    {submissionInsights.avg_review_time}
                  </div>
                  <div className="text-xs text-gray-600">Avg Review Days</div>
                </div>
                <div className="p-3 bg-green-50 rounded">
                  <div className="text-2xl font-bold text-green-600">23%</div>
                  <div className="text-xs text-gray-600">Time Reduction</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Document Templates and Common Deficiencies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Regulatory Templates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="mr-2 h-5 w-5" />
              Regulatory Templates
            </CardTitle>
            <CardDescription>Current, compliant document templates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {templates.map((template, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{template.name}</h4>
                    <p className="text-xs text-gray-600">
                      {template.type} • {template.compliance}
                    </p>
                    <p className="text-xs text-gray-500">
                      {template.downloads} downloads • Updated {template.updated}
                    </p>
                  </div>
                  <Button size="sm" variant="outline">
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Common Deficiencies */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5 text-orange-500" />
              Common Submission Issues
            </CardTitle>
            <CardDescription>Avoid these frequent deficiencies</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <h4 className="font-medium text-sm mb-2">Top Deficiencies (2024)</h4>
                {submissionInsights.common_deficiencies.map((deficiency, index) => (
                  <div key={index} className="flex items-center text-sm mb-2">
                    <div className="w-2 h-2 bg-red-400 rounded-full mr-2"></div>
                    {deficiency}
                  </div>
                ))}
              </div>

              <div>
                <h4 className="font-medium text-sm mb-2">Trending Requirements</h4>
                {submissionInsights.trending_requirements.map((req, index) => (
                  <div key={index} className="flex items-center text-sm mb-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                    {req}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
