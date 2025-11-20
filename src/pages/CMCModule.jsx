import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Select,
} from '../components/ui';
import {
  FileText,
  FlaskConical,
  Factory,
  Beaker,
  Brain,
  Settings,
  BarChart,
  Upload,
  FileCheck,
  Share2,
  ListChecks,
  Sparkles,
} from 'lucide-react';
import { Separator } from '../components/ui/separator';
import { useToast } from '../hooks/use-toast';
import { useCERGenerator } from '../hooks/useCERGenerator';
import { useTenantContext } from '../contexts/TenantContext';
import CmcNavigation from '../components/cmc-module/CmcNavigation';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Shield as ShieldAlert, Activity, Landmark, Eye, ClipboardCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import NavigationBanner from '../components/common/NavigationBanner';

import withAuthGuard from '../utils/withAuthGuard';

function CMCModule() {
  const [loading, setLoading] = useState(false);
  const [blueprints, setBlueprints] = useState([]);
  const [selectedBlueprint, setSelectedBlueprint] = useState(null);
  const [moduleView, setModuleView] = useState('blueprint');
  const [searchTerm, setSearchTerm] = useState('');
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { tenant } = useTenantContext();

  // Sample data
  const cmcSections = [
    {
      id: 1,
      title: 'Drug Substance Manufacturing Process',
      section: 'S.2.2',
      status: 'Approved',
      content:
        'The active pharmaceutical ingredient (API) is manufactured via a six-step synthetic process. The process begins with the reaction of Compound A with Compound B in the presence of a palladium catalyst to form the key intermediate C. After purification by recrystallization, Intermediate C undergoes further transformations including reduction, protection, coupling, and deprotection steps. Quality is ensured through in-process controls at critical steps, with special attention to impurity profiles and stereochemical purity.',
      nextRevision: 'June 15, 2025',
      feedbackCount: 0,
    },
    {
      id: 2,
      title: 'Manufacturing Process Controls',
      section: 'S.2.4',
      status: 'In Review',
      content:
        'Critical process parameters have been identified through risk assessment and design of experiments (DoE). Temperature control during the coupling reaction (Step 4) is maintained at 55±2°C, as higher temperatures lead to formation of Impurity X, while lower temperatures reduce yield. Reaction time is controlled between 4-6 hours with in-process testing to ensure completion. Catalyst concentration impacts both yield and impurity profile, with optimal range established as 0.2-0.3 mol%. Process validation has demonstrated that these controls ensure consistent quality across multiple batches.',
      nextRevision: 'July 30, 2025',
      feedbackCount: 2,
    },
    {
      id: 3,
      title: 'Control of Materials',
      section: 'S.2.3',
      status: 'Draft',
      content:
        'Starting materials and reagents are sourced from qualified suppliers with robust quality agreements in place. Each batch of starting material A is tested for purity (≥99.0%), residual solvents, and specific impurities including compound Z (NMT 0.1%). Catalyst systems are qualified through rigorous testing to ensure consistent performance and low metal contamination in the final API. Reference standards have been established for all critical intermediates and impurities to enable accurate quantification during in-process testing.',
      nextRevision: 'August 10, 2025',
      feedbackCount: 5,
    },
    {
      id: 4,
      title: 'Container Closure System',
      section: 'S.6',
      status: 'Approved',
      content:
        'The drug substance is packaged in a multi-layer laminate pouch consisting of polyethylene (inner layer), aluminum foil (middle layer), and polyester (outer layer). The pouch is heat-sealed under nitrogen atmosphere to ensure product stability. Extractables and leachables studies have confirmed the suitability of the packaging materials, with no significant migration detected under accelerated conditions. The packaging system provides adequate protection against light, moisture, and oxygen, as demonstrated in stability studies.',
      nextRevision: 'September 22, 2025',
      feedbackCount: 0,
    },
  ];

  const recentActivity = [
    {
      id: 1,
      action: 'Updated Control Strategy',
      user: 'Maria Chen',
      timestamp: '2 hours ago',
      section: 'S.2.4',
    },
    {
      id: 2,
      action: 'Added Stability Data',
      user: 'James Wilson',
      timestamp: '4 hours ago',
      section: 'S.7.3',
    },
    {
      id: 3,
      action: 'Approved Manufacturing Controls',
      user: 'Sarah Ahmed',
      timestamp: '1 day ago',
      section: 'S.2.2',
    },
    {
      id: 4,
      action: 'Generated New CMC Blueprint',
      user: 'David Park',
      timestamp: '2 days ago',
      section: 'P.1',
    },
  ];

  useEffect(() => {
    // Fetch blueprints
    const loadBlueprints = async () => {
      setLoading(true);
      try {
        // Simulate API call - in production, replace with actual API
        setTimeout(() => {
          setBlueprints([
            {
              id: 1,
              name: 'Compound XY-123 API',
              description: 'Small molecule drug substance',
              version: '1.2',
              status: 'In Progress',
              lastUpdated: '2025-05-08',
            },
            {
              id: 2,
              name: 'Tablet Formulation TS-500',
              description: 'Oral solid dosage form',
              version: '2.0',
              status: 'Approved',
              lastUpdated: '2025-05-01',
            },
            {
              id: 3,
              name: 'Injectable Solution IS-472',
              description: 'Sterile parenteral product',
              version: '1.0',
              status: 'Draft',
              lastUpdated: '2025-05-09',
            },
            {
              id: 4,
              name: 'Topical Cream TC-890',
              description: 'Semi-solid formulation',
              version: '1.5',
              status: 'In Review',
              lastUpdated: '2025-04-28',
            },
          ]);
          setLoading(false);
        }, 800);
      } catch (error) {
        toast({
          title: 'Error loading blueprints',
          description: error.message || 'Failed to load CMC blueprints',
          variant: 'destructive',
        });
        setLoading(false);
      }
    };

    loadBlueprints();
  }, [toast]);

  const filteredBlueprints = blueprints.filter(
    blueprint =>
      blueprint.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      blueprint.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateBlueprint = () => {
    setLocation('/cmc/blueprints/new');
  };

  const handleSelectBlueprint = blueprint => {
    setSelectedBlueprint(blueprint);
  };

  const handleExportDocument = () => {
    toast({
      title: 'Export initiated',
      description: 'Your document is being prepared for export',
    });
  };

  const generateRecommendations = () => {
    return [
      {
        id: 1,
        recommendation: 'Add batch analysis data to support specification ranges',
        priority: 'High',
        section: 'S.4.4',
      },
      {
        id: 2,
        recommendation: 'Include process validation for critical step 3',
        priority: 'Medium',
        section: 'S.2.5',
      },
      {
        id: 3,
        recommendation: 'Update reference standard certification',
        priority: 'Low',
        section: 'S.5',
      },
    ];
  };

  const openHighContrastView = () => {
    window.open('/high-contrast.html', '_blank');
  };

  if (loading) {
    return <LoadingSpinner message="Loading CMC Module..." />;
  }

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      {/* Accessibility Controls - Fixed Position */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <Button
          onClick={openHighContrastView}
          variant="outline"
          className="bg-black text-white hover:bg-gray-800 border-2 border-white font-bold"
        >
          <Eye className="mr-2 h-4 w-4" />
          High Contrast View
        </Button>
      </div>
      {/* Top Navigation Banner */}
      <NavigationBanner currentModule="cmc-module" />

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Chemistry, Manufacturing, and Controls
            </h1>
            <p className="text-muted-foreground">
              Create and manage ICH-compliant CMC documentation with AI assistance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportDocument}>
              <Share2 className="mr-2 h-4 w-4" />
              Export Document
            </Button>
            <Button onClick={handleCreateBlueprint}>
              <FileText className="mr-2 h-4 w-4" />
              Create New Blueprint
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left sidebar for navigation */}
          <div className="md:col-span-1">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>CMC Navigation</CardTitle>
                <CardDescription>Access all CMC Module features</CardDescription>
              </CardHeader>
              <CardContent>
                <CmcNavigation currentBlueprintId={selectedBlueprint?.id} />

                <Separator className="my-4" />

                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Recent Activity
                  </h3>
                  <div className="space-y-2 text-sm">
                    {recentActivity.map(activity => (
                      <div
                        key={activity.id}
                        className="flex justify-between p-2 rounded-md hover:bg-muted"
                      >
                        <div>
                          <p className="font-medium">{activity.action}</p>
                          <p className="text-xs text-muted-foreground">
                            {activity.user} • {activity.section}
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground">{activity.timestamp}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle>AI Features</CardTitle>
                <CardDescription>CMC intelligent assistance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">
                      <Brain className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <span className="font-medium">Assistants API</span>
                      <p className="text-gray-500 dark:text-gray-400">
                        Specialized CMC regulatory assistant with retrieval augmentation for
                        compliance guidance
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">
                      <FlaskConical className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <span className="font-medium">DALL-E 3</span>
                      <p className="text-gray-500 dark:text-gray-400">
                        Generate high-quality visualizations of crystalline structures and
                        manufacturing processes
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">
                      <Sparkles className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <span className="font-medium">GPT-4o Analysis</span>
                      <p className="text-gray-500 dark:text-gray-400">
                        Identify potential regulatory compliance gaps with AI-powered analysis
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main content area */}
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>CMC Blueprints</CardTitle>
                <CardDescription>Manage your regulatory documentation structure</CardDescription>
                <div className="mt-2">
                  <Input
                    placeholder="Search blueprints..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="active" className="w-full">
                  <TabList className="grid w-full grid-cols-3">
                    <Tab value="active">Active</Tab>
                    <Tab value="recent">Recent</Tab>
                    <Tab value="all">All Blueprints</Tab>
                  </TabList>
                  <TabPanel value="active" className="pt-4">
                    <div className="space-y-4">
                      {filteredBlueprints
                        .filter(bp => bp.status !== 'Archived')
                        .map(blueprint => (
                          <div
                            key={blueprint.id}
                            className={`p-4 border rounded-lg cursor-pointer transition-colors
                            ${
                              selectedBlueprint?.id === blueprint.id
                                ? 'border-primary bg-primary/5'
                                : 'hover:bg-accent'
                            }
                          `}
                            onClick={() => handleSelectBlueprint(blueprint)}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="font-medium">{blueprint.name}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {blueprint.description}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-primary/10 text-primary">
                                  {blueprint.status}
                                </span>
                                <p className="text-xs text-muted-foreground mt-1">
                                  v{blueprint.version}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              Last updated: {blueprint.lastUpdated}
                            </div>
                          </div>
                        ))}
                    </div>
                  </TabPanel>
                  <TabPanel value="recent">
                    <div className="py-4">
                      <p className="text-muted-foreground text-sm">
                        Recently updated blueprints appear here.
                      </p>
                    </div>
                  </TabPanel>
                  <TabPanel value="all">
                    <div className="py-4">
                      <p className="text-muted-foreground text-sm">
                        View all your CMC blueprints regardless of status.
                      </p>
                    </div>
                  </TabPanel>
                </Tabs>
              </CardContent>
            </Card>

            {selectedBlueprint && (
              <Card className="mt-4">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>{selectedBlueprint.name}</CardTitle>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Configure
                    </Button>
                  </div>
                  <CardDescription>
                    Version {selectedBlueprint.version} • {selectedBlueprint.status}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="sections">
                    <TabList>
                      <Tab value="sections">Sections</Tab>
                      <Tab value="recommendations">Recommendations</Tab>
                      <Tab value="visualization">Visualization</Tab>
                    </TabList>
                    <TabPanel value="sections" className="pt-4">
                      <div className="space-y-4">
                        {cmcSections.map(section => (
                          <div key={section.id} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="font-medium">{section.title}</h3>
                                <p className="text-xs text-muted-foreground">
                                  Section {section.section}
                                </p>
                              </div>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium 
                                ${
                                  section.status === 'Approved'
                                    ? 'bg-green-100 text-green-800'
                                    : section.status === 'In Review'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-amber-100 text-amber-800'
                                }
                              `}
                              >
                                {section.status}
                              </span>
                            </div>
                            <p className="mt-2 text-sm">{section.content.substring(0, 120)}...</p>
                            <div className="mt-3 flex items-center justify-between">
                              <div className="text-xs text-muted-foreground">
                                Next revision: {section.nextRevision}
                              </div>
                              <div className="flex gap-2">
                                {section.feedbackCount > 0 && (
                                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                                    {section.feedbackCount} feedback items
                                  </span>
                                )}
                                <Button variant="ghost" size="sm">
                                  Edit
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabPanel>
                    <TabPanel value="recommendations" className="pt-4">
                      <div className="space-y-4">
                        {generateRecommendations().map(rec => (
                          <div key={rec.id} className="border rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <div
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full 
                                ${
                                  rec.priority === 'High'
                                    ? 'bg-red-100'
                                    : rec.priority === 'Medium'
                                      ? 'bg-amber-100'
                                      : 'bg-blue-100'
                                }`}
                              >
                                <FileCheck
                                  className={`h-4 w-4 
                                  ${
                                    rec.priority === 'High'
                                      ? 'text-red-600'
                                      : rec.priority === 'Medium'
                                        ? 'text-amber-600'
                                        : 'text-blue-600'
                                  }`}
                                />
                              </div>
                              <div>
                                <h4 className="font-medium">{rec.recommendation}</h4>
                                <p className="text-xs text-muted-foreground">
                                  Section {rec.section} • {rec.priority} Priority
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 flex justify-end gap-2">
                              <Button variant="outline" size="sm">
                                Dismiss
                              </Button>
                              <Button size="sm">Apply</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabPanel>
                    <TabPanel value="visualization" className="pt-4">
                      <div className="flex flex-col items-center justify-center p-8 border rounded-lg border-dashed">
                        <Factory className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="font-medium text-center">Manufacturing Process Flow</h3>
                        <p className="text-sm text-muted-foreground text-center mt-2">
                          Visualize the manufacturing workflow with interactive process diagrams
                        </p>
                        <Button className="mt-4">
                          <Upload className="mr-2 h-4 w-4" />
                          Generate Visualization
                        </Button>
                      </div>
                    </TabPanel>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Export the component wrapped with the auth guard
export default withAuthGuard(CMCModule);
