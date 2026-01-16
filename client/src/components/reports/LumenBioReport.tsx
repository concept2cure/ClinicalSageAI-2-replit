import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Beaker, Microscope, BookOpen, ArrowRight, PieChart, BarChart, Users } from 'lucide-react'

const therapeuticAreas = [
  {
    id: 'cancer',
    name: 'Cancer',
    description: 'Oncology focused candidates including LUM-1',
    status: 'Phase 2',
    progress: 65,
  },
  {
    id: 'immunology',
    name: 'Immunology',
    description: 'Includes LUM-2 for inflammatory conditions',
    status: 'Phase 1',
    progress: 40,
  },
  {
    id: 'neurology',
    name: 'Neurology',
    description: 'Neurodegenerative disease candidates including LUM-3',
    status: 'Preclinical',
    progress: 25,
  },
];

type Pipeline = {
  id: string;
  name: string;
  mechanism: string;
  indication: string;
  phase: string;
  status: string;
  progress: number;
  nextMilestone: string;
  relatedReports: number;
};

const pipelineCandidates: Pipeline[] = [
  {
    id: 'lum-1',
    name: 'LUM-1',
    mechanism: 'Novel Checkpoint Inhibitor',
    indication: 'Non-Small Cell Lung Cancer',
    phase: 'Phase 2',
    status: 'Recruiting',
    progress: 60,
    nextMilestone: 'Interim Analysis Q3 2025',
    relatedReports: 12,
  },
  {
    id: 'lum-2',
    name: 'LUM-2',
    mechanism: 'Dual Cytokine Inhibitor',
    indication: 'Inflammatory Bowel Disease',
    phase: 'Phase 1',
    status: 'Active',
    progress: 35,
    nextMilestone: 'Safety Data Q4 2025',
    relatedReports: 5,
  },
  {
    id: 'lum-3',
    name: 'LUM-3',
    mechanism: 'Tau Protein Modulator',
    indication: "Alzheimer's Disease",
    phase: 'Preclinical',
    status: 'IND-Enabling',
    progress: 15,
    nextMilestone: 'IND Filing Q1 2026',
    relatedReports: 3,
  },
  {
    id: 'lum-4',
    name: 'LUM-4',
    mechanism: 'CD19-Targeted CAR-T',
    indication: 'B-Cell Lymphoma',
    phase: 'Phase 1/2',
    status: 'Recruiting',
    progress: 45,
    nextMilestone: 'Initial Response Data Q2 2025',
    relatedReports: 8,
  },
  {
    id: 'lum-5',
    name: 'LUM-5',
    mechanism: 'RNA Polymerase Inhibitor',
    indication: 'Multiple Solid Tumors',
    phase: 'Preclinical',
    status: 'Lead Optimization',
    progress: 10,
    nextMilestone: 'Candidate Selection Q3 2025',
    relatedReports: 2,
  },
];

export function LumenBioReport() {
  // This would fetch real data in production
  const { data: pipelineData, isLoading } = useQuery({
    queryKey: ['/api/lumen-bio/pipeline'],
    initialData: pipelineCandidates,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Lumen Bio Pipeline Analysis</h2>
          <p className="text-slate-600">
            Analysis of Lumen Bio's therapeutic pipeline with comparative analytics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/reports/lumen-bio">
            <Button variant="outline" className="flex items-center gap-1">
              <PieChart className="h-4 w-4" />
              Full Analysis
            </Button>
          </Link>
          <Link href="/analytics/lumen-bio">
            <Button className="flex items-center gap-1">
              <Microscope className="h-4 w-4" />
              Competitive Intelligence
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="candidates" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="candidates">Pipeline Candidates</TabsTrigger>
          <TabsTrigger value="therapeutic">Therapeutic Areas</TabsTrigger>
          <TabsTrigger value="trials">Trial Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="space-y-4 py-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pipelineData.map((candidate: Pipeline) => (
                <Card key={candidate.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{candidate.name}</CardTitle>
                        <CardDescription>{candidate.mechanism}</CardDescription>
                      </div>
                      <Badge
                        variant={
                          candidate.phase.includes('2')
                            ? 'default'
                            : candidate.phase.includes('1')
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {candidate.phase}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-500">Indication</span>
                          <span className="font-medium">{candidate.indication}</span>
                        </div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-500">Status</span>
                          <span className="font-medium">{candidate.status}</span>
                        </div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-500">Next Milestone</span>
                          <span className="font-medium">{candidate.nextMilestone}</span>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-500">Progress</span>
                          <span className="font-medium">{candidate.progress}%</span>
                        </div>
                        <Progress value={candidate.progress} className="h-2" />
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0 flex justify-between">
                    <div className="text-sm text-slate-500">
                      <span className="font-medium">{candidate.relatedReports}</span> related
                      reports
                    </div>
                    <Link href={`/reports/lumen-bio/${candidate.id}`}>
                      <Button variant="ghost" size="sm" className="gap-1">
                        View Details
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="therapeutic" className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {therapeuticAreas.map(area => (
              <Card key={area.id} className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-lg">{area.name}</CardTitle>
                  <CardDescription>{area.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-500">Lead Program Status</span>
                      <Badge variant="outline">{area.status}</Badge>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-500">Portfolio Maturity</span>
                        <span className="font-medium">{area.progress}%</span>
                      </div>
                      <Progress value={area.progress} className="h-2" />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Link href={`/reports/lumen-bio/therapeutic/${area.id}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      Analyze Area
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Beaker className="h-5 w-5 text-blue-600 mr-2" />
                Preclinical to Clinical Success Rates
              </CardTitle>
              <CardDescription>
                Comparison of Lumen Bio's pipeline progress vs industry averages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full bg-primary mr-2"></div>
                    <span className="text-sm">Lumen Bio</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full bg-gray-300 mr-2"></div>
                    <span className="text-sm">Industry Average</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Preclinical to Phase 1</span>
                      <span className="font-medium">68% vs 54%</span>
                    </div>
                    <div className="flex gap-2">
                      <Progress value={68} className="h-2 bg-gray-100" />
                      <Progress
                        value={54}
                        className="h-2 bg-gray-100"
                        indicatorClass="bg-gray-300"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Phase 1 to Phase 2</span>
                      <span className="font-medium">72% vs 59%</span>
                    </div>
                    <div className="flex gap-2">
                      <Progress value={72} className="h-2 bg-gray-100" />
                      <Progress
                        value={59}
                        className="h-2 bg-gray-100"
                        indicatorClass="bg-gray-300"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Phase 2 to Phase 3</span>
                      <span className="font-medium">46% vs 38%</span>
                    </div>
                    <div className="flex gap-2">
                      <Progress value={46} className="h-2 bg-gray-100" />
                      <Progress
                        value={38}
                        className="h-2 bg-gray-100"
                        indicatorClass="bg-gray-300"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trials" className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <BarChart className="h-5 w-5 text-blue-600 mr-2" />
                  Trial Success Metrics
                </CardTitle>
                <CardDescription>Key clinical trial performance indicators</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">Patient Enrollment Rate</p>
                      <p className="text-sm text-slate-500">vs Industry Average</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">+18%</p>
                      <p className="text-sm text-slate-500">Above Average</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">Protocol Amendments</p>
                      <p className="text-sm text-slate-500">per Trial</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">1.4</p>
                      <p className="text-sm text-slate-500">Industry Avg: 2.3</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">Study Completion Rate</p>
                      <p className="text-sm text-slate-500">vs Industry Average</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">92%</p>
                      <p className="text-sm text-slate-500">Industry Avg: 87%</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <BookOpen className="h-5 w-5 text-blue-600 mr-2" />
                  Historical Trial Design Analysis
                </CardTitle>
                <CardDescription>Based on 45 similar oncology trials</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">Inclusion/Exclusion Criteria</p>
                      <p className="text-sm text-slate-500">Average Count</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">15 / 12</p>
                      <p className="text-sm text-slate-500">Industry: 22 / 18</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">Primary Endpoint Success</p>
                      <p className="text-sm text-slate-500">Similar Trials</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">62%</p>
                      <p className="text-sm text-slate-500">Industry: 48%</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">Avg. Sample Size</p>
                      <p className="text-sm text-slate-500">Phase 2 Oncology</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">120 patients</p>
                      <p className="text-sm text-slate-500">Range: 85-175</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Users className="h-5 w-5 text-blue-600 mr-2" />
                Recent Clinical Trial Activity
              </CardTitle>
              <CardDescription>
                Latest updates from Lumen Bio's active clinical trials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border p-3 rounded-md">
                  <div className="flex justify-between">
                    <p className="font-medium">LUM-1 Phase 2 Trial</p>
                    <Badge variant="outline">Updated 3 days ago</Badge>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">
                    Enrollment rate increased by 15% after protocol amendment reducing visit
                    frequency.
                  </p>
                </div>

                <div className="border p-3 rounded-md">
                  <div className="flex justify-between">
                    <p className="font-medium">LUM-4 Phase 1/2 Trial</p>
                    <Badge variant="outline">Updated 1 week ago</Badge>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">
                    First patient dosed in expansion cohort. No dose-limiting toxicities observed to
                    date.
                  </p>
                </div>

                <div className="border p-3 rounded-md">
                  <div className="flex justify-between">
                    <p className="font-medium">LUM-2 Phase 1 Trial</p>
                    <Badge variant="outline">Updated 2 weeks ago</Badge>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">
                    Completed enrollment of low-dose cohort. Safety review committee approved dose
                    escalation.
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Link href="/reports/lumen-bio/trial-updates">
                <Button variant="outline" className="w-full">
                  View All Trial Updates
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
