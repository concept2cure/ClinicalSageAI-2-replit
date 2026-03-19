/**
 * Tutorial Guide Component
 *
 * Comprehensive guide covering all modules in the Client Portal with
 * hyperlinks that navigate users to specific sections and features.
 */

import React, { useState } from 'react';
import { useLocation } from 'wouter';
import {
  Book,
  ChevronRight,
  ExternalLink,
  FileText,
  Users,
  Beaker,
  Brain,
  Shield,
  Zap,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const TutorialGuide = () => {
  const [, setLocation] = useLocation();
  const [expandedSections, setExpandedSections] = useState({});

  const toggleSection = sectionId => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const navigateToSection = path => {
    setLocation(path);
  };

  // Role-based tutorial sections
  const roleBasedTutorials = {
    'regulatory-affairs': {
      title: 'Regulatory Affairs Professional',
      icon: <Shield className="h-5 w-5" />,
      color: 'blue',
      objectives: [
        'Submit FDA-compliant INDs efficiently',
        'Manage regulatory documentation',
        'Track submission timelines',
        'Ensure compliance across regions',
      ],
      modules: [
        {
          name: 'eCTD Co-Author™',
          path: '/client-portal/ectd-coauthor',
          description: 'Complete FDA IND & eCTD submission automation',
          features: [
            'FDA Form 1571 auto-generation',
            'Module 2-5 template system',
            'Real-time compliance validation',
            'ESG Gateway submission',
          ],
        },
        {
          name: 'eCTD Co-Author',
          path: '/client-portal/ectd-coauthor',
          description: 'AI-powered document authoring platform',
          features: [
            'Structured document creation',
            'Real-time regulatory guidance',
            'Version control and tracking',
            'Cross-reference validation',
          ],
        },
      ],
    },
    'cmc-scientist': {
      title: 'CMC Scientist',
      icon: <Beaker className="h-5 w-5" />,
      color: 'green',
      objectives: [
        'Generate CMC documentation efficiently',
        'Ensure analytical method compliance',
        'Manage manufacturing processes',
        'Track quality control metrics',
      ],
      modules: [
        {
          name: 'CMC Wizard',
          path: '/client-portal/cmc-module',
          description: 'Complete CMC documentation suite',
          features: [
            'Module 3 auto-generation',
            'Analytical method validation',
            'Manufacturing process mapping',
            'Stability study tracking',
          ],
        },
      ],
    },
    'clinical-researcher': {
      title: 'Clinical Researcher',
      icon: <Users className="h-5 w-5" />,
      color: 'purple',
      objectives: [
        'Design optimal clinical protocols',
        'Analyze clinical study reports',
        'Predict trial success factors',
        'Benchmark against industry data',
      ],
      modules: [
        {
          name: 'CSR Intelligence',
          path: '/client-portal/csr-intelligence',
          description: 'Clinical study report analysis and insights',
          features: [
            'CSR semantic analysis',
            'Success/failure prediction',
            'Endpoint optimization',
            'Benchmark comparisons',
          ],
        },
      ],
    },
    'medical-writer': {
      title: 'Medical Writer',
      icon: <FileText className="h-5 w-5" />,
      color: 'orange',
      objectives: [
        'Create compliant medical documents',
        'Collaborate on regulatory submissions',
        'Maintain document version control',
        'Ensure consistent formatting',
      ],
      modules: [
        {
          name: 'eCTD Co-Author',
          path: '/client-portal/ectd-coauthor',
          description: 'Collaborative document authoring',
          features: [
            'Template-based authoring',
            'Real-time collaboration',
            'AI writing assistance',
            'Regulatory compliance checks',
          ],
        },
      ],
    },
  };

  const aiTechnologies = [
    {
      name: 'Large Language Models (LLMs)',
      description: 'Advanced AI for document generation and analysis',
      compliance: 'FDA 21 CFR Part 11 compliant',
      security: 'End-to-end encryption, audit trails',
      applications: [
        'Automated document drafting',
        'Regulatory text analysis',
        'Compliance checking',
        'Cross-reference validation',
      ],
    },
    {
      name: 'Machine Learning Predictive Analytics',
      description: 'Proprietary models trained on regulatory data',
      compliance: 'GxP validated algorithms',
      security: 'Federated learning, data anonymization',
      applications: [
        'Trial success prediction',
        'Risk assessment',
        'Timeline forecasting',
        'Quality trending',
      ],
    },
    {
      name: 'Natural Language Processing (NLP)',
      description: 'Specialized regulatory text processing',
      compliance: 'Validated against FDA guidance',
      security: 'On-premise processing, no data retention',
      applications: [
        'Document classification',
        'Information extraction',
        'Semantic search',
        'Content summarization',
      ],
    },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center space-x-2">
          <Book className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold">Concept2Cure Platform Tutorial</h1>
        </div>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Comprehensive guide to mastering the Concept2Cure platform for efficient regulatory
          submissions
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Platform Overview</TabsTrigger>
          <TabsTrigger value="roles">Role-Based Guides</TabsTrigger>
          <TabsTrigger value="modules">Module Deep Dive</TabsTrigger>
          <TabsTrigger value="ai-technology">AI Technology</TabsTrigger>
          <TabsTrigger value="quick-start">Quick Start</TabsTrigger>
        </TabsList>

        {/* Platform Overview */}
        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                <span>Platform Architecture</span>
              </CardTitle>
              <CardDescription>
                Understanding the Concept2Cure ecosystem and module integration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="font-semibold">Core Modules</h4>
                  <div className="space-y-2">
                    {[
                      {
                        name: 'eCTD Co-Author™',
                        path: '/client-portal/ectd-coauthor',
                        desc: 'IND & eCTD submission automation',
                      },
                      {
                        name: 'CMC Wizard',
                        path: '/client-portal/cmc-module',
                        desc: 'Chemistry, Manufacturing & Controls',
                      },
                      {
                        name: 'eCTD Co-Author',
                        path: '/client-portal/ectd-coauthor',
                        desc: 'Collaborative document authoring',
                      },
                      {
                        name: 'CSR Intelligence',
                        path: '/client-portal/csr-intelligence',
                        desc: 'Clinical study report analysis',
                      },
                    ].map(module => (
                      <div
                        key={module.name}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div>
                          <div className="font-medium">{module.name}</div>
                          <div className="text-sm text-muted-foreground">{module.desc}</div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigateToSection(module.path)}
                          className="flex items-center space-x-1"
                        >
                          <span>Open</span>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="font-semibold">Support Features</h4>
                  <div className="space-y-2">
                    {[
                      {
                        name: 'Document Vault',
                        path: '/client-portal/vault',
                        desc: '21 CFR Part 11 compliant storage',
                      },
                      {
                        name: 'Analytics Dashboard',
                        path: '/client-portal/analytics',
                        desc: 'Performance metrics and insights',
                      },
                      {
                        name: 'Collaboration Hub',
                        path: '/client-portal/collaboration',
                        desc: 'Team communication and workflows',
                      },
                      {
                        name: 'Compliance Monitor',
                        path: '/client-portal/compliance',
                        desc: 'Real-time regulatory tracking',
                      },
                    ].map(feature => (
                      <div
                        key={feature.name}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div>
                          <div className="font-medium">{feature.name}</div>
                          <div className="text-sm text-muted-foreground">{feature.desc}</div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigateToSection(feature.path)}
                          className="flex items-center space-x-1"
                        >
                          <span>Open</span>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Role-Based Guides */}
        <TabsContent value="roles" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Object.entries(roleBasedTutorials).map(([roleId, role]) => (
              <Card key={roleId} className="h-fit">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <div className={`p-2 rounded-lg bg-${role.color}-100 text-${role.color}-600`}>
                      {role.icon}
                    </div>
                    <span>{role.title}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Key Objectives</h4>
                    <ul className="space-y-1">
                      {role.objectives.map((objective, idx) => (
                        <li key={idx} className="flex items-start space-x-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{objective}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold">Recommended Modules</h4>
                    {role.modules.map((module, idx) => (
                      <Collapsible key={idx}>
                        <CollapsibleTrigger
                          className="flex items-center justify-between w-full p-3 border rounded-lg hover:bg-gray-50"
                          onClick={() => toggleSection(`${roleId}-${idx}`)}
                        >
                          <div className="text-left">
                            <div className="font-medium">{module.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {module.description}
                            </div>
                          </div>
                          <ChevronRight
                            className={`h-4 w-4 transition-transform ${
                              expandedSections[`${roleId}-${idx}`] ? 'rotate-90' : ''
                            }`}
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 p-3 bg-gray-50 rounded-lg">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h5 className="font-medium">Key Features</h5>
                              <Button
                                size="sm"
                                onClick={() => navigateToSection(module.path)}
                                className="flex items-center space-x-1"
                              >
                                <span>Launch Module</span>
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            </div>
                            <ul className="space-y-1">
                              {module.features.map((feature, featureIdx) => (
                                <li key={featureIdx} className="flex items-start space-x-2 text-sm">
                                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                                  <span>{feature}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Module Deep Dive */}
        <TabsContent value="modules" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>eCTD Co-Author™</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToSection('/client-portal/ectd-coauthor')}
                  >
                    Launch <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </CardTitle>
                <CardDescription>
                  FDA-compliant IND & eCTD submission automation platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Workflow Steps</h4>
                  <div className="space-y-2">
                    {[
                      {
                        step: 'Module 1',
                        desc: 'Administrative Information',
                        path: '/client-portal/ectd-coauthor?step=1',
                      },
                      {
                        step: 'Module 2',
                        desc: 'Quality Overall Summary',
                        path: '/client-portal/ectd-coauthor?step=2',
                      },
                      {
                        step: 'Module 3',
                        desc: 'Quality Documentation',
                        path: '/client-portal/ectd-coauthor?step=3',
                      },
                      {
                        step: 'Module 4',
                        desc: 'Nonclinical Study Reports',
                        path: '/client-portal/ectd-coauthor?step=4',
                      },
                      {
                        step: 'Module 5',
                        desc: 'Clinical Study Reports',
                        path: '/client-portal/ectd-coauthor?step=5',
                      },
                    ].map(item => (
                      <div
                        key={item.step}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div>
                          <span className="font-medium">{item.step}</span>
                          <span className="text-sm text-muted-foreground ml-2">{item.desc}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigateToSection(item.path)}
                        >
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>CMC Wizard</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToSection('/client-portal/cmc-module')}
                  >
                    Launch <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </CardTitle>
                <CardDescription>
                  Chemistry, Manufacturing & Controls documentation suite
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Key Features</h4>
                  <div className="space-y-2">
                    {[
                      {
                        feature: 'Module 3 Generator',
                        desc: 'Automated CMC documentation',
                        path: '/client-portal/cmc-module?tab=generator',
                      },
                      {
                        feature: 'Analytical Methods',
                        desc: 'Method validation and tracking',
                        path: '/client-portal/cmc-module?tab=analytical',
                      },
                      {
                        feature: 'Manufacturing',
                        desc: 'Process documentation and control',
                        path: '/client-portal/cmc-module?tab=manufacturing',
                      },
                      {
                        feature: 'Stability Studies',
                        desc: 'Study design and data management',
                        path: '/client-portal/cmc-module?tab=stability',
                      },
                    ].map(item => (
                      <div
                        key={item.feature}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div>
                          <span className="font-medium">{item.feature}</span>
                          <span className="text-sm text-muted-foreground ml-2">{item.desc}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigateToSection(item.path)}
                        >
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>eCTD Co-Author</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToSection('/client-portal/ectd-coauthor')}
                  >
                    Launch <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </CardTitle>
                <CardDescription>
                  AI-powered collaborative document authoring platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Authoring Tools</h4>
                  <div className="space-y-2">
                    {[
                      {
                        tool: 'Document Editor',
                        desc: 'Rich text editing with AI assistance',
                        path: '/client-portal/ectd-coauthor?view=editor',
                      },
                      {
                        tool: 'Template Library',
                        desc: 'Pre-approved regulatory templates',
                        path: '/client-portal/ectd-coauthor?view=templates',
                      },
                      {
                        tool: 'Collaboration Hub',
                        desc: 'Real-time team collaboration',
                        path: '/client-portal/ectd-coauthor?view=collaboration',
                      },
                      {
                        tool: 'Version Control',
                        desc: 'Document versioning and approval',
                        path: '/client-portal/ectd-coauthor?view=versions',
                      },
                    ].map(item => (
                      <div
                        key={item.tool}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div>
                          <span className="font-medium">{item.tool}</span>
                          <span className="text-sm text-muted-foreground ml-2">{item.desc}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigateToSection(item.path)}
                        >
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>CSR Intelligence</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToSection('/client-portal/csr-intelligence')}
                  >
                    Launch <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </CardTitle>
                <CardDescription>
                  Clinical study report analysis and intelligence platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Analysis Tools</h4>
                  <div className="space-y-2">
                    {[
                      {
                        tool: 'CSR Library',
                        desc: 'Searchable database of clinical reports',
                        path: '/client-portal/csr-intelligence?view=library',
                      },
                      {
                        tool: 'Success Predictor',
                        desc: 'AI-powered trial outcome prediction',
                        path: '/client-portal/csr-intelligence?view=predictor',
                      },
                      {
                        tool: 'Benchmark Analysis',
                        desc: 'Compare against industry standards',
                        path: '/client-portal/csr-intelligence?view=benchmark',
                      },
                      {
                        tool: 'Endpoint Optimizer',
                        desc: 'Optimize clinical endpoints',
                        path: '/client-portal/csr-intelligence?view=endpoints',
                      },
                    ].map(item => (
                      <div
                        key={item.tool}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div>
                          <span className="font-medium">{item.tool}</span>
                          <span className="text-sm text-muted-foreground ml-2">{item.desc}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigateToSection(item.path)}
                        >
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* AI Technology */}
        <TabsContent value="ai-technology" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="h-5 w-5 text-purple-600" />
                <span>AI Technology Stack</span>
              </CardTitle>
              <CardDescription>
                Industry-compliant artificial intelligence powering Concept2Cure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {aiTechnologies.map((tech, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{tech.name}</h4>
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      {tech.compliance}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{tech.description}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h5 className="font-medium text-sm mb-2">Security & Compliance</h5>
                      <p className="text-sm text-muted-foreground">{tech.security}</p>
                    </div>
                    <div>
                      <h5 className="font-medium text-sm mb-2">Applications</h5>
                      <ul className="space-y-1">
                        {tech.applications.map((app, appIdx) => (
                          <li key={appIdx} className="flex items-start space-x-2 text-sm">
                            <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-2 flex-shrink-0" />
                            <span>{app}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-green-600" />
                <span>Compliance & Safety</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-green-600">21 CFR Part 11</div>
                  <div className="text-sm text-muted-foreground">Electronic Records</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">GxP Validated</div>
                  <div className="text-sm text-muted-foreground">Good Practice Standards</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">SOC 2 Type II</div>
                  <div className="text-sm text-muted-foreground">Security Controls</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quick Start */}
        <TabsContent value="quick-start" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Start Guide</CardTitle>
              <CardDescription>Get started with Concept2Cure in 5 easy steps</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {[
                  {
                    step: 1,
                    title: 'Access Your Dashboard',
                    description: 'Navigate to your personalized client portal dashboard',
                    action: 'Go to Dashboard',
                    path: '/client-portal',
                  },
                  {
                    step: 2,
                    title: 'Choose Your Module',
                    description: 'Select the module that matches your current project needs',
                    action: 'Browse Modules',
                    path: '/client-portal#modules',
                  },
                  {
                    step: 3,
                    title: 'Upload Your Documents',
                    description: 'Import existing documents or start with our templates',
                    action: 'Document Vault',
                    path: '/client-portal/vault',
                  },
                  {
                    step: 4,
                    title: 'Generate Content',
                    description: 'Use AI-powered tools to create regulatory documents',
                    action: 'Start Creating',
                    path: '/client-portal/ectd-coauthor',
                  },
                  {
                    step: 5,
                    title: 'Review & Submit',
                    description: 'Validate compliance and submit to regulatory authorities',
                    action: 'Submission Center',
                    path: '/client-portal/submissions',
                  },
                ].map(item => (
                  <div key={item.step} className="flex items-start space-x-4 p-4 border rounded-lg">
                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">{item.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigateToSection(item.path)}
                      className="flex items-center space-x-1"
                    >
                      <span>{item.action}</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TutorialGuide;
