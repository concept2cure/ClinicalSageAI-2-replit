import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Brain,
  Lightbulb,
  FileText,
  BookOpenCheck,
  Filter,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  LineChart,
  BookOpen,
  Beaker,
  Scale,
  BrainCircuit,
  Network,
  FileSearch,
  MessageSquare,
  Activity,
  Link,
  ArrowUpRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Mock data for the wisdom trace example
const mockWisdomTrace = {
  id: 'wt-2025-04-13-001',
  query: 'What endpoints should I use for my Phase 2 NASH trial?',
  recommendation:
    'For your Phase 2 NASH trial, I recommend a composite primary endpoint of liver fat reduction (≥30% from baseline measured by MRI-PDFF) AND improvement in at least one of the following: (1) ALT decrease ≥30% from baseline, or (2) resolution of NASH with no worsening of fibrosis on histology. Secondary endpoints should include changes in histologic features, non-invasive fibrosis markers, and quality of life measures.',
  confidenceScore: 92,
  dataSources: {
    csrDocuments: 47,
    regulatoryGuidance: 8,
    academicPublications: 16,
    expertGuidelines: 5,
  },
  reasoningPath: [
    {
      step: 1,
      title: 'Data Collection & Analysis',
      description: 'System gathered and analyzed data from multiple sources',
      substeps: [
        {
          title: 'CSR Analysis',
          description: 'Analyzed 47 NASH trial CSRs for endpoint patterns',
          confidence: 96,
        },
        {
          title: 'FDA Guidance',
          description: 'Incorporated latest FDA NASH guidance on endpoints',
          confidence: 95,
        },
        {
          title: 'EMA Guidance',
          description: 'Assessed EMA position on NASH trial endpoints',
          confidence: 93,
        },
        {
          title: 'Academic Literature',
          description: 'Synthesized 16 recent publications on NASH biomarkers',
          confidence: 89,
        },
      ],
    },
    {
      step: 2,
      title: 'Pattern Recognition',
      description: 'Identified critical patterns in NASH trial designs',
      substeps: [
        {
          title: 'Success Pattern Detection',
          description: 'Identified endpoints with highest success rate in Phase 2→3 transition',
          confidence: 91,
        },
        {
          title: 'Failure Analysis',
          description: 'Analyzed common reasons for endpoint failure in NASH trials',
          confidence: 94,
        },
        {
          title: 'Biomarker Correlation',
          description: 'Mapped relationships between biomarkers and clinical outcomes',
          confidence: 88,
        },
      ],
    },
    {
      step: 3,
      title: 'Regulatory Context Analysis',
      description: 'Evaluated regulatory acceptance patterns',
      substeps: [
        {
          title: 'FDA Acceptance Analysis',
          description: 'Analyzed recent FDA decisions on NASH endpoints',
          confidence: 92,
        },
        {
          title: 'Regulatory Trend Detection',
          description: 'Identified shifting requirements for NASH endpoints',
          confidence: 90,
        },
      ],
    },
    {
      step: 4,
      title: 'Risk-Benefit Calculation',
      description: 'Calculated optimal risk-benefit balance',
      substeps: [
        {
          title: 'Statistical Power Analysis',
          description: 'Modeled statistical power for different endpoint combinations',
          confidence: 94,
        },
        {
          title: 'Invasiveness Consideration',
          description: 'Balanced need for biopsy vs. non-invasive measures',
          confidence: 91,
        },
        {
          title: 'Correlation Strength',
          description: 'Assessed surrogate-to-clinical outcome correlations',
          confidence: 89,
        },
      ],
    },
  ],
  evidenceHighlights: [
    {
      title: 'MRI-PDFF Response Predicts Histologic Improvement',
      source: 'Loomba et al., Gastroenterology 2021',
      excerpt:
        '≥30% relative reduction in MRI-PDFF is associated with improved histological features of NASH, with positive predictive value of 72%.',
      weight: 'Primary',
    },
    {
      title: 'ALT Improvement Correlation',
      source: 'Trial NCT03976401 CSR',
      excerpt:
        'Subjects with ≥30% ALT reduction showed 2.8× higher odds of NASH resolution in Phase 2 studies.',
      weight: 'Primary',
    },
    {
      title: 'FDA Draft Guidance on NASH Trials',
      source: 'FDA Guidance Document, 2024',
      excerpt:
        'For Phase 2 trials, a composite endpoint including both a biomarker and histologic component may be appropriate.',
      weight: 'Primary',
    },
    {
      title: 'Non-Invasive Test Validation',
      source: 'European NASH Consortium Position Paper, 2023',
      excerpt:
        'Combinations of imaging and serum biomarkers are increasingly accepted as surrogate endpoints in early-phase NASH trials.',
      weight: 'Supporting',
    },
    {
      title: 'Phase 2 to Phase 3 Translation',
      source: 'Analysis of 29 NASH Development Programs',
      excerpt:
        'Programs using composite endpoints in Phase 2 had 37% higher success rate in Phase 3 trial outcomes.',
      weight: 'Supporting',
    },
  ],
  alternativeOptions: [
    {
      title: 'Histology-Only Primary Endpoint',
      pros: ['Established regulatory acceptance path', 'Direct measure of disease activity'],
      cons: [
        'Requires invasive biopsies',
        'Higher screen failure rates',
        'Subject recruitment challenges',
      ],
      recommendationStrength: 'Moderate (68%)',
    },
    {
      title: 'Non-Invasive Markers Only',
      pros: [
        'Better patient acceptance',
        'Larger potential recruitment pool',
        'Lower cost per patient',
      ],
      cons: ['Less established regulatory path', 'Lower correlation with disease outcomes'],
      recommendationStrength: 'Low (45%)',
    },
  ],
  timestamp: '2025-04-13T10:27:44Z',
  userContext: {
    program: 'Early-stage NASH candidate',
    phase: 'Phase 2',
    mechanism: 'FGF21 analog',
    priorData: 'Positive Phase 1 with 25% fat reduction',
  },
};

export default function WisdomTrace() {
  const [selectedTab, setSelectedTab] = useState('trace');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-purple-600 text-transparent bg-clip-text">
              Wisdom Trace
            </h1>
            <Badge
              variant="outline"
              className="ml-2 bg-purple-50 text-purple-700 hover:bg-purple-100"
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Strategic Reasoning
            </Badge>
          </div>
          <p className="mt-1 text-slate-500">
            Understanding how and why LumenTrialGuide.AI arrived at its recommendations
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Export Trace
          </Button>
          <Button className="flex items-center gap-2">
            <BookOpenCheck className="h-4 w-4" />
            New Analysis
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div>
        <Tabs
          defaultValue="trace"
          className="space-y-4"
          onValueChange={value => setSelectedTab(value)}
        >
          <TabsList className="grid grid-cols-3 md:w-[500px]">
            <TabsTrigger value="trace">
              <BrainCircuit className="h-4 w-4 mr-2" />
              Reasoning Path
            </TabsTrigger>
            <TabsTrigger value="evidence">
              <FileSearch className="h-4 w-4 mr-2" />
              Evidence
            </TabsTrigger>
            <TabsTrigger value="alternatives">
              <Network className="h-4 w-4 mr-2" />
              Alternatives
            </TabsTrigger>
          </TabsList>

          {/* The query and recommendation section - this appears in all tabs */}
          <Card className="bg-slate-50">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-medium text-slate-500">Original Query</h3>
                  </div>
                  <p className="text-slate-900 font-medium">"{mockWisdomTrace.query}"</p>
                </div>

                <Separator />

                <div>
                  <div className="flex items-start gap-2 mb-2">
                    <div className="mt-1">
                      <Lightbulb className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-slate-900">Recommendation</h3>
                        <Badge className="bg-primary/10 text-primary border-primary/20">
                          {mockWisdomTrace.confidenceScore}% Confidence
                        </Badge>
                        <Badge
                          variant="outline"
                          className="bg-blue-50 text-blue-700 border-blue-200"
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          {new Date(mockWisdomTrace.timestamp).toLocaleString()}
                        </Badge>
                      </div>
                      <p className="text-slate-700 mt-1">{mockWisdomTrace.recommendation}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-2">
                  <div className="flex flex-col items-center p-3 bg-white rounded-lg border">
                    <div className="text-sm font-medium text-slate-500 mb-1 flex items-center">
                      <FileText className="h-4 w-4 mr-1 text-blue-500" />
                      CSR Documents
                    </div>
                    <div className="text-2xl font-bold text-blue-600">
                      {mockWisdomTrace.dataSources.csrDocuments}
                    </div>
                  </div>
                  <div className="flex flex-col items-center p-3 bg-white rounded-lg border">
                    <div className="text-sm font-medium text-slate-500 mb-1 flex items-center">
                      <Scale className="h-4 w-4 mr-1 text-purple-500" />
                      Regulatory Sources
                    </div>
                    <div className="text-2xl font-bold text-purple-600">
                      {mockWisdomTrace.dataSources.regulatoryGuidance}
                    </div>
                  </div>
                  <div className="flex flex-col items-center p-3 bg-white rounded-lg border">
                    <div className="text-sm font-medium text-slate-500 mb-1 flex items-center">
                      <BookOpen className="h-4 w-4 mr-1 text-emerald-500" />
                      Academic Papers
                    </div>
                    <div className="text-2xl font-bold text-emerald-600">
                      {mockWisdomTrace.dataSources.academicPublications}
                    </div>
                  </div>
                  <div className="flex flex-col items-center p-3 bg-white rounded-lg border">
                    <div className="text-sm font-medium text-slate-500 mb-1 flex items-center">
                      <Beaker className="h-4 w-4 mr-1 text-amber-500" />
                      Expert Guidelines
                    </div>
                    <div className="text-2xl font-bold text-amber-600">
                      {mockWisdomTrace.dataSources.expertGuidelines}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reasoning Trace Tab Content */}
          <TabsContent value="trace" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-slate-700" />
                  Reasoning Process
                </CardTitle>
                <CardDescription>
                  Step-by-step reasoning that led to the recommendation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative border-l-2 border-slate-200 pl-8 space-y-8 py-2">
                  {mockWisdomTrace.reasoningPath.map((step, index) => (
                    <div key={index} className="relative">
                      {/* Step marker */}
                      <div className="absolute -left-10 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-sm font-medium">
                        {step.step}
                      </div>

                      {/* Step content */}
                      <div>
                        <h3 className="text-xl font-semibold text-slate-900">{step.title}</h3>
                        <p className="text-slate-600 mt-1">{step.description}</p>

                        {/* Sub-steps */}
                        <div className="mt-4 space-y-3">
                          {step.substeps.map((substep, subIndex) => (
                            <div key={subIndex} className="bg-slate-50 p-4 rounded-lg border">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                <div>
                                  <h4 className="font-medium text-slate-900">{substep.title}</h4>
                                  <p className="text-slate-600 text-sm mt-1">
                                    {substep.description}
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={`
                                    ${
                                      substep.confidence >= 90
                                        ? 'bg-green-50 text-green-700 border-green-200'
                                        : substep.confidence >= 80
                                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                                          : 'bg-amber-50 text-amber-700 border-amber-200'
                                    }
                                  `}
                                >
                                  <Activity className="h-3 w-3 mr-1" />
                                  {substep.confidence}% Confidence
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Connector arrow for all but the last step */}
                        {index < mockWisdomTrace.reasoningPath.length - 1 && (
                          <div className="flex justify-center my-4">
                            <ArrowRight className="h-6 w-6 text-slate-400" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Final recommendation node */}
                  <div className="relative">
                    <div className="absolute -left-10 flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-green-700">
                        Final Recommendation Generated
                      </h3>
                      <p className="text-slate-600 mt-1">
                        The system synthesized all evidence and reasoning into a comprehensive
                        recommendation
                      </p>
                      <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2 mb-1">
                          <Sparkles className="h-4 w-4 text-green-600" />
                          <span className="font-medium text-green-800">
                            Recommendation Confidence: {mockWisdomTrace.confidenceScore}%
                          </span>
                        </div>
                        <p className="text-slate-700">{mockWisdomTrace.recommendation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Evidence Tab Content */}
          <TabsContent value="evidence" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSearch className="h-5 w-5 text-slate-700" />
                  Evidence Base
                </CardTitle>
                <CardDescription>Key evidence that supports the recommendation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">
                      Primary Evidence
                    </Badge>
                    <span className="text-slate-500 text-sm font-normal">
                      Highest weight in recommendation
                    </span>
                  </h3>

                  {mockWisdomTrace.evidenceHighlights
                    .filter(evidence => evidence.weight === 'Primary')
                    .map((evidence, index) => (
                      <Card key={index} className="bg-blue-50/50">
                        <CardHeader className="pb-2">
                          <div className="flex justify-between">
                            <CardTitle className="text-lg text-blue-900">
                              {evidence.title}
                            </CardTitle>
                            <Badge
                              variant="outline"
                              className="bg-blue-100 text-blue-800 border-blue-200"
                            >
                              Primary Evidence
                            </Badge>
                          </div>
                          <CardDescription className="flex items-center gap-2">
                            <Link className="h-3 w-3" />
                            {evidence.source}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="bg-white p-3 rounded-md border border-blue-200">
                            <p className="text-slate-700 italic">"{evidence.excerpt}"</p>
                          </div>
                        </CardContent>
                        <CardFooter className="pt-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            View Full Source
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}

                  <h3 className="text-lg font-semibold pt-4 flex items-center gap-2">
                    <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-200">
                      Supporting Evidence
                    </Badge>
                    <span className="text-slate-500 text-sm font-normal">
                      Contributed to recommendation confidence
                    </span>
                  </h3>

                  {mockWisdomTrace.evidenceHighlights
                    .filter(evidence => evidence.weight === 'Supporting')
                    .map((evidence, index) => (
                      <Card key={index} className="bg-slate-50/80">
                        <CardHeader className="pb-2">
                          <div className="flex justify-between">
                            <CardTitle className="text-lg text-slate-800">
                              {evidence.title}
                            </CardTitle>
                            <Badge
                              variant="outline"
                              className="bg-slate-100 text-slate-700 border-slate-200"
                            >
                              Supporting Evidence
                            </Badge>
                          </div>
                          <CardDescription className="flex items-center gap-2">
                            <Link className="h-3 w-3" />
                            {evidence.source}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="bg-white p-3 rounded-md border border-slate-200">
                            <p className="text-slate-700 italic">"{evidence.excerpt}"</p>
                          </div>
                        </CardContent>
                        <CardFooter className="pt-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            View Full Source
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-3">Context Factors</h3>
                  <Card className="bg-amber-50/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-md">User-Provided Context</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(mockWisdomTrace.userContext).map(([key, value], index) => (
                          <div
                            key={index}
                            className="bg-white p-3 rounded-md border border-amber-200"
                          >
                            <div className="text-sm font-medium text-amber-800 capitalize mb-1">
                              {key}
                            </div>
                            <div className="text-slate-700">{value}</div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Alternatives Tab Content */}
          <TabsContent value="alternatives" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5 text-slate-700" />
                  Alternative Approaches
                </CardTitle>
                <CardDescription>
                  Other approaches considered and their comparative analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold text-green-800">Recommended Approach</h3>
                  </div>
                  <p className="text-slate-700 mb-3 bg-white p-3 rounded-md border border-green-200">
                    {mockWisdomTrace.recommendation}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-100 text-green-800">
                      {mockWisdomTrace.confidenceScore}% Confidence
                    </Badge>
                    <span className="text-sm text-green-700">
                      Optimal balance of evidence, regulatory acceptance, and feasibility
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Alternative Options Considered</h3>

                  {mockWisdomTrace.alternativeOptions.map((option, index) => (
                    <Card key={index} className="bg-slate-50">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between">
                          <CardTitle className="text-lg">{option.title}</CardTitle>
                          <Badge
                            variant="outline"
                            className={
                              option.recommendationStrength.startsWith('Moderate')
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            }
                          >
                            {option.recommendationStrength}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-sm font-medium text-green-700 mb-2 flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" />
                              Advantages
                            </h4>
                            <ul className="space-y-2">
                              {option.pros.map((pro, proIndex) => (
                                <li
                                  key={proIndex}
                                  className="bg-white p-2 rounded-md border border-green-100 text-slate-700"
                                >
                                  {pro}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1">
                              <AlertCircle className="h-4 w-4" />
                              Disadvantages
                            </h4>
                            <ul className="space-y-2">
                              {option.cons.map((con, conIndex) => (
                                <li
                                  key={conIndex}
                                  className="bg-white p-2 rounded-md border border-red-100 text-slate-700"
                                >
                                  {con}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <div className="w-full">
                          <div className="flex justify-between text-sm text-slate-500 mb-1">
                            <span>Recommendation Strength</span>
                            <span>{option.recommendationStrength}</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2.5">
                            <div
                              className={`h-2.5 rounded-full ${
                                option.recommendationStrength.startsWith('Moderate')
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                              }`}
                              style={{
                                width: `${parseInt(option.recommendationStrength.match(/\d+/)[0])}%`,
                              }}
                            ></div>
                          </div>
                        </div>
                      </CardFooter>
                    </Card>
                  ))}
                </div>

                <Card className="border-dashed border-2">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
                        <Sparkles className="h-6 w-6 text-slate-600" />
                      </div>
                      <h3 className="text-lg font-medium">Why the Recommendation Is Optimal</h3>
                      <p className="text-slate-600 max-w-2xl">
                        The recommended composite endpoint approach balances regulatory requirements
                        with practical implementation considerations. It has the strongest evidence
                        base and highest likelihood of demonstrating treatment effect while
                        maintaining regulatory acceptance.
                      </p>
                      <Button variant="outline" className="mt-2">
                        <LineChart className="h-4 w-4 mr-2" />
                        Compare All Approaches
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}
