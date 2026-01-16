import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import AutoCheckerPanel from './regulatory/AutoCheckerPanel';
import {
  AlertTriangle, BookOpen, Calendar, CheckCircle, Clock, FileText, Flag, Globe, Info, Search, Shield, Tag, Zap } from 'lucide-react'

/**
 * RegulatoryIntelligence Component
 *
 * Provides a dashboard for tracking regulatory updates
 * and guidance from major health authorities.
 */
const RegulatoryIntelligence = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('fda');
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredGuidance, setFilteredGuidance] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Sample regulatory guidance data (in a real app, this would come from an API)
  const regulatoryGuidance = {
    fda: [
      {
        id: 'fda-1',
        title: 'Development and Licensure of Vaccines to Prevent COVID-19',
        date: '2025-03-15',
        agency: 'FDA',
        type: 'Guidance',
        status: 'Final',
        impact: 'High',
        summary:
          "This guidance provides recommendations regarding the development and licensure of vaccines to prevent COVID-19. It addresses the FDA's current thinking regarding the non-clinical, clinical, and chemistry, manufacturing, and controls data needed to support licensure of vaccines.",
        url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/development-and-licensure-vaccines-prevent-covid-19',
      },
      {
        id: 'fda-2',
        title: 'Manufacturing Considerations for Drug Products',
        date: '2025-04-02',
        agency: 'FDA',
        type: 'Guidance',
        status: 'Draft',
        impact: 'Medium',
        summary:
          'This draft guidance provides recommendations to drug manufacturers regarding the assessment and control of visible particulate matter in drug products.',
        url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
      },
      {
        id: 'fda-3',
        title: 'ICH Q12 Implementation Guidance',
        date: '2025-03-28',
        agency: 'FDA',
        type: 'Guidance',
        status: 'Final',
        impact: 'High',
        summary:
          "This guidance provides the FDA's implementation recommendations for ICH Q12: Technical and Regulatory Considerations for Pharmaceutical Product Lifecycle Management.",
        url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
      },
    ],
    ema: [
      {
        id: 'ema-1',
        title: 'Reflection Paper on Dissolution Specification',
        date: '2025-03-20',
        agency: 'EMA',
        type: 'Reflection Paper',
        status: 'Final',
        impact: 'Medium',
        summary:
          'This reflection paper provides considerations on the development of dissolution methods and the setting of specifications for immediate release oral dosage forms.',
        url: 'https://www.ema.europa.eu/en/documents',
      },
      {
        id: 'ema-2',
        title: 'Guideline on Process Validation',
        date: '2025-04-01',
        agency: 'EMA',
        type: 'Guideline',
        status: 'Draft',
        impact: 'High',
        summary:
          'This draft guideline replaces the previous process validation guideline and addresses continuous process verification approaches.',
        url: 'https://www.ema.europa.eu/en/documents',
      },
    ],
    pmda: [
      {
        id: 'pmda-1',
        title: 'Technical Guideline on Electronic Study Data Submissions',
        date: '2025-03-25',
        agency: 'PMDA',
        type: 'Guideline',
        status: 'Final',
        impact: 'Medium',
        summary:
          'This guideline provides technical specifications for the electronic submission of study data to PMDA as part of new drug applications.',
        url: 'https://www.pmda.go.jp/english/review-services/regulatory-info/0003.html',
      },
    ],
    nmpa: [
      {
        id: 'nmpa-1',
        title: 'Guidelines for Drug Registration Application',
        date: '2025-03-18',
        agency: 'NMPA',
        type: 'Guideline',
        status: 'Final',
        impact: 'High',
        summary:
          'This guideline outlines the requirements for pharmaceutical companies seeking to register drugs in China, including CMC documentation requirements.',
        url: 'https://www.nmpa.gov.cn/directory/web/nmpa/index.html',
      },
    ],
  };

  // Filter guidance based on search term
  useEffect(() => {
    const currentGuidance = regulatoryGuidance[activeTab] || [];

    if (!searchTerm.trim()) {
      setFilteredGuidance(currentGuidance);
      return;
    }

    const filtered = currentGuidance.filter(
      item =>
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.summary.toLowerCase().includes(searchTerm.toLowerCase())
    );

    setFilteredGuidance(filtered);
  }, [searchTerm, activeTab]);

  // Load guidance when tab changes
  useEffect(() => {
    // In a real app, this would fetch from an API
    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      setFilteredGuidance(regulatoryGuidance[activeTab] || []);
      setIsLoading(false);
    }, 500);
  }, [activeTab]);

  // Subscribe to regulatory update feed
  const handleSubscribe = () => {
    toast({
      title: 'Subscription Activated',
      description: 'You are now subscribed to real-time regulatory updates.',
      duration: 3000,
    });
  };

  const getAgencyBadgeColor = agency => {
    switch (agency) {
      case 'FDA':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'EMA':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'PMDA':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'NMPA':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getImpactBadgeColor = impact => {
    switch (impact) {
      case 'High':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'Medium':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'Low':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getStatusBadgeColor = status => {
    switch (status) {
      case 'Final':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'Draft':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  return (
    <Card className="w-full shadow-md border-0">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-2xl font-bold">Regulatory Intelligence</CardTitle>
            <CardDescription>
              Track guidance, regulations, and updates from global health authorities
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="flex gap-1 items-center"
            onClick={handleSubscribe}
          >
            <Zap className="h-4 w-4" />
            <span>Subscribe to Updates</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="flex items-center mb-4 relative">
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search regulatory guidance..."
            className="pl-9"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-4 mb-4">
            <TabsTrigger value="fda" className="flex gap-1.5 items-center">
              <Flag className="h-4 w-4" />
              <span>FDA</span>
            </TabsTrigger>
            <TabsTrigger value="ema" className="flex gap-1.5 items-center">
              <Flag className="h-4 w-4" />
              <span>EMA</span>
            </TabsTrigger>
            <TabsTrigger value="pmda" className="flex gap-1.5 items-center">
              <Flag className="h-4 w-4" />
              <span>PMDA</span>
            </TabsTrigger>
            <TabsTrigger value="nmpa" className="flex gap-1.5 items-center">
              <Flag className="h-4 w-4" />
              <span>NMPA</span>
            </TabsTrigger>
          </TabsList>

          {Object.keys(regulatoryGuidance).map(authority => (
            <TabsContent key={authority} value={authority} className="m-0">
              <ScrollArea className="h-[calc(100vh-300px)] pr-3">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  </div>
                ) : filteredGuidance.length > 0 ? (
                  <div className="space-y-4">
                    {filteredGuidance.map(item => (
                      <Card key={item.id} className="border hover:border-primary transition-colors">
                        <CardHeader className="py-3">
                          <div className="flex flex-wrap gap-2 mb-1">
                            <Badge className={getAgencyBadgeColor(item.agency)}>
                              {item.agency}
                            </Badge>
                            <Badge className={getStatusBadgeColor(item.status)}>
                              {item.status}
                            </Badge>
                            <Badge className={getImpactBadgeColor(item.impact)}>
                              Impact: {item.impact}
                            </Badge>
                            <Badge variant="outline">
                              <Clock className="mr-1 h-3 w-3" />
                              {item.date}
                            </Badge>
                          </div>
                          <CardTitle className="text-lg font-medium">{item.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="py-2">
                          <p className="text-sm text-muted-foreground">{item.summary}</p>
                        </CardContent>
                        <CardFooter className="pt-0 pb-3 flex justify-between">
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Tag className="h-3.5 w-3.5 mr-1" />
                            <span>{item.type}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8"
                              onClick={() => window.open(item.url, '_blank')}
                            >
                              <FileText className="h-3.5 w-3.5 mr-1" />
                              View Original
                            </Button>
                            <Button
                              size="sm"
                              className="text-xs h-8"
                              onClick={() => {
                                toast({
                                  title: 'Impact Analysis Generated',
                                  description: `Impact analysis for "${item.title}" has been added to your workspace.`,
                                });
                              }}
                            >
                              <Shield className="h-3.5 w-3.5 mr-1" />
                              Generate Impact Analysis
                            </Button>
                          </div>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Info className="h-10 w-10 mb-2 text-muted-foreground" />
                    <h3 className="text-lg font-medium">No guidance found</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {searchTerm
                        ? `No results match "${searchTerm}" in ${activeTab.toUpperCase()} guidance`
                        : `No recent guidance available from ${activeTab.toUpperCase()}`}
                    </p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>

      {/* IR Auto‑Checker */}
      <div className="px-6 pb-4">
        <AutoCheckerPanel submissionId="550e8400-e29b-41d4-a716-446655440000" />
      </div>

      <CardFooter className="pt-0 flex justify-between items-center text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          <span>Last updated: April 24, 2025</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            <span>Connected to regulatory feed</span>
          </div>
          <div className="flex items-center gap-1">
            <Globe className="h-3.5 w-3.5" />
            <span>4 authorities monitored</span>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
};

export default RegulatoryIntelligence;
