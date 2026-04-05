import React, { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  BookOpen,
  AlertTriangle,
  CheckSquare,
  FileText,
  ExternalLink,
  Lightbulb,
} from 'lucide-react';

interface GuidanceItem {
  id: string;
  title: string;
  content: string;
  type: 'requirement' | 'guideline' | 'best-practice' | 'warning';
  source: string;
  url?: string;
  section: string;
  region: string[];
}

interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
  section: string;
}

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  required: boolean;
  reference?: string;
}

interface GuidancePanelProps {
  region: 'FDA' | 'EMA' | 'PMDA' | 'WHO';
  section: string;
}

export default function GuidancePanel({ region, section }: GuidancePanelProps) {
  const [guidance, setGuidance] = useState<GuidanceItem[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('guidance');

  useEffect(() => {
    loadGuidanceContent();
  }, [region, section]);

  const loadGuidanceContent = async () => {
    setLoading(true);
    try {
      // In production, this would fetch from regulatory guidance API
      const mockGuidance: GuidanceItem[] = [
        {
          id: '1',
          title: 'Drug Product Description Requirements',
          content:
            'The drug product description should include the dosage form, route of administration, strength, and a complete list of ingredients. All components should be identified by established names.',
          type: 'requirement',
          source: region === 'FDA' ? 'FDA M3(R2)' : 'ICH M3(R2)',
          url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/m3r2-nonclinical-safety-studies-conduct-human-clinical-trials-pharmaceuticals-marketing',
          section: '3.2.P.1',
          region: [region],
        },
        {
          id: '2',
          title: 'Specification Setting Principles',
          content:
            'Specifications should be based on data from batches used in preclinical and clinical studies, stability studies, and experience from routine production. Include tests and acceptance criteria for identity, strength, purity, and quality.',
          type: 'guideline',
          source: region === 'FDA' ? 'FDA Q6A' : 'ICH Q6A',
          section: '3.2.P.5',
          region: [region],
        },
        {
          id: '3',
          title: 'Stability Protocol Design',
          content:
            'Design stability studies according to climatic zones. For Zone II (temperate climate), use 25°C/60% RH as long-term conditions. Accelerated studies should be conducted at 40°C/75% RH.',
          type: 'guideline',
          source: region === 'EMA' ? 'ICH Q1A(R2)' : 'FDA Q1A(R2)',
          section: '3.2.P.8',
          region: [region],
        },
        {
          id: '4',
          title: 'Regional Terminology Alert',
          content: `For ${region} submissions, use "${region === 'FDA' ? 'drug substance' : 'active substance'}" terminology. Ensure consistency throughout the dossier.`,
          type: 'warning',
          source: `${region} Terminology Guidelines`,
          section: 'all',
          region: [region],
        },
      ];

      const mockChecklists: Checklist[] = [
        {
          id: '1',
          title: '3.2.P.1 Submission Checklist',
          section: '3.2.P.1',
          items: [
            {
              id: '1',
              text: 'Description of dosage form provided',
              completed: true,
              required: true,
            },
            {
              id: '2',
              text: 'Complete list of all ingredients with quantities',
              completed: false,
              required: true,
            },
            {
              id: '3',
              text: 'Function of each excipient described',
              completed: false,
              required: true,
            },
            {
              id: '4',
              text: 'Overage information provided if applicable',
              completed: false,
              required: false,
            },
            {
              id: '5',
              text: 'Container closure system described',
              completed: true,
              required: true,
              reference: '3.2.P.7',
            },
          ],
        },
        {
          id: '2',
          title: '3.2.P.5 Control Strategy Checklist',
          section: '3.2.P.5',
          items: [
            {
              id: '1',
              text: 'Release specifications established',
              completed: false,
              required: true,
            },
            {
              id: '2',
              text: 'Shelf-life specifications established',
              completed: false,
              required: true,
            },
            {
              id: '3',
              text: 'Analytical methods referenced or described',
              completed: false,
              required: true,
            },
            {
              id: '4',
              text: 'Method validation summaries provided',
              completed: false,
              required: true,
            },
            { id: '5', text: 'Batch analysis data included', completed: false, required: true },
            {
              id: '6',
              text: 'Specification justifications provided',
              completed: false,
              required: true,
            },
          ],
        },
      ];

      setGuidance(mockGuidance.filter(item => item.section === section || item.section === 'all'));
      setChecklists(mockChecklists.filter(item => item.section === section));
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type: GuidanceItem['type']) => {
    switch (type) {
      case 'requirement':
        return <FileText className="h-4 w-4" />;
      case 'guideline':
        return <BookOpen className="h-4 w-4" />;
      case 'best-practice':
        return <Lightbulb className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeBadgeColor = (type: GuidanceItem['type']) => {
    switch (type) {
      case 'requirement':
        return 'destructive';
      case 'guideline':
        return 'default';
      case 'best-practice':
        return 'secondary';
      case 'warning':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const toggleChecklistItem = (checklistId: string, itemId: string) => {
    setChecklists(prev =>
      prev.map(checklist =>
        checklist.id === checklistId
          ? {
              ...checklist,
              items: checklist.items.map(item =>
                item.id === itemId ? { ...item, completed: !item.completed } : item
              ),
            }
          : checklist
      )
    );
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-muted rounded mb-2" />
            <div className="h-12 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="guidance-panel">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <div className="p-3 border-b">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="guidance" data-testid="tab-guidance-content">
              Guidance
            </TabsTrigger>
            <TabsTrigger value="checklist" data-testid="tab-checklist">
              Checklist
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="guidance" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-4">
                {guidance.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BookOpen className="h-8 w-8 mx-auto mb-2" />
                    <p>No guidance available for this section</p>
                  </div>
                ) : (
                  guidance.map(item => (
                    <Card key={item.id} className="text-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-2">
                            {getTypeIcon(item.type)}
                            <CardTitle className="text-sm">{item.title}</CardTitle>
                          </div>
                          <Badge variant={getTypeBadgeColor(item.type)} className="text-xs">
                            {item.type}
                          </Badge>
                        </div>
                      </CardHeader>

                      <CardContent className="pt-0">
                        <p className="text-muted-foreground mb-3">{item.content}</p>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Source: {item.source}</span>

                          {item.url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              data-testid={`guidance-link-${item.id}`}
                            >
                              <a href={item.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="checklist" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-4">
                {checklists.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckSquare className="h-8 w-8 mx-auto mb-2" />
                    <p>No checklist available for this section</p>
                  </div>
                ) : (
                  checklists.map(checklist => (
                    <Card key={checklist.id}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center justify-between">
                          {checklist.title}
                          <Badge variant="outline" className="text-xs">
                            {checklist.items.filter(i => i.completed).length}/
                            {checklist.items.length}
                          </Badge>
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {checklist.items.map((item, index) => (
                            <div key={item.id}>
                              <div className="flex items-start space-x-3">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="p-0 h-auto"
                                  onClick={() => toggleChecklistItem(checklist.id, item.id)}
                                  data-testid={`checklist-item-${item.id}`}
                                >
                                  <CheckSquare
                                    className={`h-4 w-4 ${
                                      item.completed
                                        ? 'text-stone-700 fill-stone-100'
                                        : 'text-muted-foreground'
                                    }`}
                                  />
                                </Button>

                                <div className="flex-1 space-y-1">
                                  <div
                                    className={`text-sm ${
                                      item.completed ? 'line-through text-muted-foreground' : ''
                                    }`}
                                  >
                                    {item.text}
                                    {item.required && (
                                      <Badge variant="destructive" className="ml-2 text-xs">
                                        Required
                                      </Badge>
                                    )}
                                  </div>

                                  {item.reference && (
                                    <p className="text-xs text-muted-foreground">
                                      Reference: {item.reference}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {index < checklist.items.length - 1 && <Separator className="my-2" />}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
