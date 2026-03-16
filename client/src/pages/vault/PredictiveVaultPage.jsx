/**
 * Predictive Vault Demo Page
 *
 * Comprehensive demonstration page showcasing the Vault DMS "Predictive" folder
 * with 5 demo IND documents for predictive analytics capabilities.
 *
 * This page serves as the primary showcase for the predictive analytics features
 * integrated with the document management system.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Brain,
  FileText,
  TrendingUp,
  Target,
  Activity,
  BarChart3,
  Zap,
  Shield,
  Users,
  Calendar,
  Database,
  Lightbulb,
  Rocket,
  Eye,
} from 'lucide-react';
import PredictiveVaultBrowser from '@/pages/vault/PredictiveVaultBrowser';
import { useToast } from '@/hooks/use-toast';

const PredictiveVaultPage = () => {
  const [demoStats, setDemoStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Fetch demo statistics
  useEffect(() => {
    const fetchDemoStats = async () => {
      try {
        const response = await fetch('/api/vault/files?folder=Predictive');
        const data = await response.json();

        setDemoStats({
          totalINDDocuments: data.items?.filter(item => item.name.includes('IND_')).length || 5,
          therapeuticAreas: [
            'Oncology',
            'Neurology',
            'Immunology',
            'Cardiovascular',
            'Rare Diseases',
          ],
          phases: ['Phase I', 'Phase II', 'Phase III'],
          totalSize: data.totalSize || 0,
          lastUpdated: new Date().toLocaleDateString(),
        });
      } catch (error) {
        console.error('Error fetching demo stats:', error);
        // Fallback demo data
        setDemoStats({
          totalINDDocuments: 5,
          therapeuticAreas: [
            'Oncology',
            'Neurology',
            'Immunology',
            'Cardiovascular',
            'Rare Diseases',
          ],
          phases: ['Phase I', 'Phase II', 'Phase III'],
          totalSize: 0,
          lastUpdated: new Date().toLocaleDateString(),
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchDemoStats();
  }, []);

  const demoDocuments = [
    {
      id: 'IND_123456',
      name: 'IND_123456_Phase1_Oncology_Demo.txt',
      phase: 'Phase I',
      therapeutic: 'Oncology',
      product: 'BTS-4792 (CDK4/6 Inhibitor)',
      indication: 'Advanced Solid Tumors',
      highlights: ['Safety Monitoring', 'PK Analysis', 'Biomarker Assessment'],
      commitments: 24,
      riskScore: 'Medium',
    },
    {
      id: 'IND_789012',
      name: 'IND_789012_Phase2_Neurology_Demo.txt',
      phase: 'Phase II',
      therapeutic: 'Neurology',
      product: 'NAT-2847 (Neuroprotective Agent)',
      indication: "Early-Stage Alzheimer's Disease",
      highlights: ['Efficacy Monitoring', 'Biomarker Analysis', 'Digital Health'],
      commitments: 32,
      riskScore: 'High',
    },
    {
      id: 'IND_345678',
      name: 'IND_345678_Phase1_Immunology_Demo.txt',
      phase: 'Phase I',
      therapeutic: 'Immunology',
      product: 'IMT-5924 (JAK Inhibitor)',
      indication: 'Rheumatoid Arthritis',
      highlights: ['Immunological Safety', 'AI-Powered Monitoring', 'Digital Biomarkers'],
      commitments: 28,
      riskScore: 'Medium',
    },
    {
      id: 'IND_901234',
      name: 'IND_901234_Phase3_Cardiovascular_Demo.txt',
      phase: 'Phase III',
      therapeutic: 'Cardiovascular',
      product: 'CTG-8901 (PCSK9 Inhibitor)',
      indication: 'Hypercholesterolemia',
      highlights: ['Cardiovascular Outcomes', 'Real-World Evidence', 'Health Economics'],
      commitments: 45,
      riskScore: 'High',
    },
    {
      id: 'IND_567890',
      name: 'IND_567890_Phase2_Rare_Disease_Demo.txt',
      phase: 'Phase II',
      therapeutic: 'Rare Diseases',
      product: 'RGT-3456 (Gene Therapy)',
      indication: 'Spinal Muscular Atrophy',
      highlights: ['Gene Therapy Safety', 'Orphan Drug Development', 'Long-term Follow-up'],
      commitments: 38,
      riskScore: 'High',
    },
  ];

  const formatFileSize = bytes => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getRiskColor = risk => {
    switch (risk) {
      case 'High':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'Medium':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'Low':
        return 'text-green-600 bg-green-50 border-green-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getPhaseColor = phase => {
    switch (phase) {
      case 'Phase I':
        return 'bg-blue-100 text-blue-800';
      case 'Phase II':
        return 'bg-purple-100 text-purple-800';
      case 'Phase III':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Hero Section */}
      <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-3">
            <Brain className="h-8 w-8" />
            Predictive Analytics Vault Demo
          </CardTitle>
          <CardDescription className="text-blue-100 text-lg">
            Explore our comprehensive collection of demo IND documents showcasing advanced
            AI-powered regulatory commitment analysis and predictive analytics capabilities.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{demoStats?.totalINDDocuments || 5}</div>
              <div className="text-sm text-blue-100">Demo IND Documents</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{demoStats?.therapeuticAreas?.length || 5}</div>
              <div className="text-sm text-blue-100">Therapeutic Areas</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{demoStats?.phases?.length || 3}</div>
              <div className="text-sm text-blue-100">Clinical Phases</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">167</div>
              <div className="text-sm text-blue-100">Total Commitments</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Demo Documents
          </TabsTrigger>
          <TabsTrigger value="vault" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Vault Browser
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Key Features */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-blue-600" />
                  Predictive Analytics Features
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Brain className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div>
                    <div className="font-medium">AI-Powered Commitment Extraction</div>
                    <div className="text-sm text-muted-foreground">
                      Automatically identifies and categorizes regulatory commitments
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <div className="font-medium">Predictive Risk Assessment</div>
                    <div className="text-sm text-muted-foreground">
                      Forecasts compliance risks and timeline challenges
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Target className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <div className="font-medium">FDA Review Simulation</div>
                    <div className="text-sm text-muted-foreground">
                      Predicts FDA queries and review outcomes
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Activity className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <div className="font-medium">Real-time Monitoring</div>
                    <div className="text-sm text-muted-foreground">
                      Continuous tracking of commitment status and deadlines
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Therapeutic Areas Coverage */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green-600" />
                  Therapeutic Areas Covered
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3">
                  {demoStats?.therapeuticAreas?.map((area, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <span className="font-medium">{area}</span>
                      <Badge variant="secondary">Demo Available</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Analytics Capabilities */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-purple-600" />
                Advanced Analytics Capabilities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <Lightbulb className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                  <div className="font-medium">Intelligent Insights</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    AI-generated recommendations for commitment management
                  </div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <Zap className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <div className="font-medium">Automated Processing</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Rapid document analysis and commitment identification
                  </div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <Users className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                  <div className="font-medium">Collaborative Workflows</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Multi-user collaboration with real-time updates
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Demo Documents Tab */}
        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Demo IND Document Collection</CardTitle>
              <CardDescription>
                Comprehensive collection of realistic IND documents across multiple therapeutic
                areas and phases
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {demoDocuments.map((doc, index) => (
                  <Card key={index} className="border-l-4 border-l-blue-500">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="h-5 w-5 text-blue-600" />
                            <span className="font-medium text-lg">{doc.id}</span>
                            <Badge className={getPhaseColor(doc.phase)}>{doc.phase}</Badge>
                            <Badge variant="outline">{doc.therapeutic}</Badge>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <div className="text-sm font-medium text-muted-foreground">
                                Product
                              </div>
                              <div className="text-sm">{doc.product}</div>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-muted-foreground">
                                Indication
                              </div>
                              <div className="text-sm">{doc.indication}</div>
                            </div>
                          </div>

                          <div className="mb-4">
                            <div className="text-sm font-medium text-muted-foreground mb-2">
                              Key Highlights
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {doc.highlights.map((highlight, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {highlight}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-1">
                              <Target className="h-4 w-4 text-blue-600" />
                              <span>{doc.commitments} Commitments</span>
                            </div>
                            <Badge className={`text-xs ${getRiskColor(doc.riskScore)}`}>
                              {doc.riskScore} Risk
                            </Badge>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              toast({
                                title: 'Predictive Analysis',
                                description: `Launching analysis for ${doc.id}...`,
                              });
                            }}
                            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                          >
                            <Brain className="h-4 w-4 mr-1" />
                            Analyze
                          </Button>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            Preview
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vault Browser Tab */}
        <TabsContent value="vault">
          <PredictiveVaultBrowser />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PredictiveVaultPage;
