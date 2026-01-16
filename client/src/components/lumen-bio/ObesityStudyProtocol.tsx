import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText, Weight, Microscope, Target, Users, Calendar, Pill, ChevronRight, AlertTriangle, CheckCircle, BookOpenCheck, Download } from 'lucide-react'
import { Link } from 'wouter';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import ProtocolComparisonTab from './ProtocolComparisonTab';
import ProtocolVersionCompare from './ProtocolVersionCompare';
import { getObesityProtocolText } from '../../utils/pdfUtils';

const ObesityStudyProtocol = () => {
  const [protocolText, setProtocolText] = useState<string>('');

  useEffect(() => {
    // Load the protocol text when the component mounts
    setProtocolText(getObesityProtocolText());
  }, []);
  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="border-b bg-slate-50 dark:bg-slate-900 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Weight className="h-5 w-5 text-indigo-600" />
            <CardTitle className="text-lg">Obesity POC Study (WT02) - LMN-0801</CardTitle>
          </div>
          <Badge variant="outline" className="bg-white">
            Australia
          </Badge>
        </div>
        <CardDescription>
          A Dose-Ranging Study Evaluating the Safety and Efficacy of LMN-0801 for Weight Loss
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full grid grid-cols-6 rounded-none border-b">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            <TabsTrigger value="population">Population</TabsTrigger>
            <TabsTrigger value="design">Study Design</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="recommendations">
              <div className="flex items-center">
                <BookOpenCheck className="h-4 w-4 mr-1" />
                Recommendations
              </div>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-medium mb-4">Protocol Summary</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-2">
                    <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Protocol ID</p>
                      <p className="text-sm text-gray-600">WT02</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Pill className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Study Product</p>
                      <p className="text-sm text-gray-600">LMN-0801 (novel leptin analog)</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Protocol Version</p>
                      <p className="text-sm text-gray-600">Version 1.1, March 2025</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Target className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Therapeutic Area</p>
                      <p className="text-sm text-gray-600">Obesity/Weight Management</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Users className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Study Population</p>
                      <p className="text-sm text-gray-600">
                        Adults with BMI ≥30 kg/m² or ≥27 kg/m² with weight-related comorbidity
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-4">Study Overview</h3>
                <p className="text-sm text-gray-600 mb-4">
                  This is a dose-ranging study to evaluate the safety and efficacy of LMN-0801, a
                  novel leptin analog, for weight loss in adults with obesity. The study employs a
                  randomized, double-blind, placebo-controlled design with multiple dose cohorts.
                </p>

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Study Status</span>
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200"
                      >
                        Active - Planning
                      </Badge>
                    </div>
                    <Progress value={20} className="h-2" />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Recruitment Status</span>
                      <span className="text-xs">0 of 90 participants</span>
                    </div>
                    <Progress value={0} className="h-2" />
                  </div>

                  <div className="pt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Link href="/lumen-bio/dashboard/wt02/recommendations">
                        <Button variant="outline" size="sm" className="w-full">
                          <Target className="h-4 w-4 mr-1" />
                          Optimize Protocol
                        </Button>
                      </Link>
                      <Link href="/lumen-bio/dashboard/wt02/similar-trials">
                        <Button variant="outline" size="sm" className="w-full">
                          <Weight className="h-4 w-4 mr-1" />
                          Similar Trials
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="endpoints" className="p-6">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-3">Primary Endpoint</h3>
                <Card className="bg-blue-50 border-blue-100">
                  <CardContent className="p-4">
                    <div className="flex gap-2">
                      <Target className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium">Safety and tolerability of LMN-0801</p>
                        <p className="text-sm text-gray-600 mt-1">
                          Assessment of adverse events, laboratory assessments, physical
                          examinations, and vital signs
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-medium">Secondary Endpoints</h3>
                  <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">
                    Weight-related
                  </Badge>
                </div>
                <div className="space-y-3">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                        <div>
                          <p className="font-medium">Percent change in body weight at Week 12</p>
                          <p className="text-sm text-gray-600 mt-1">Compared to baseline</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                        <div>
                          <p className="font-medium">
                            Proportion of participants losing ≥5% body weight at Week 12
                          </p>
                          <p className="text-sm text-gray-600 mt-1">
                            Responder analysis for clinically meaningful weight loss
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                        <div>
                          <p className="font-medium">Change in waist circumference at Week 12</p>
                          <p className="text-sm text-gray-600 mt-1">Compared to baseline</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-medium">Exploratory Endpoints</h3>
                  <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200">
                    Multiple categories
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Endpoint</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Body Composition</TableCell>
                      <TableCell>Change in fat mass, lean mass, and visceral fat</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Metabolic Parameters</TableCell>
                      <TableCell>
                        Changes in lipid profile, insulin sensitivity, and glucose tolerance
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Biomarkers</TableCell>
                      <TableCell>
                        Leptin levels, inflammatory markers, and appetite-related hormones
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Patient-Reported</TableCell>
                      <TableCell>
                        Food cravings, hunger/satiety, and quality of life assessments
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="population" className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-medium mb-4">Inclusion Criteria</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Adults aged 18-75 years</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>
                      BMI ≥30 kg/m² or ≥27 kg/m² with at least one weight-related comorbidity
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>
                      Generally healthy by medical history, physical examination, and laboratory
                      assessment
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Weight stable (±5%) for at least 3 months before screening</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Willing to maintain stable physical activity throughout the study</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Women of childbearing potential must use effective contraception</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-4">Exclusion Criteria</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <span>Prior bariatric surgery or planned during study period</span>
                  </li>
                  <li className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <span>
                      Use of weight loss medications or participation in structured weight loss
                      program within 3 months
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <span>History of eating disorders including binge eating disorder</span>
                  </li>
                  <li className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <span>Uncontrolled hypertension (BP {`>`}160/100 mmHg)</span>
                  </li>
                  <li className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <span>
                      History of cardiovascular disease including MI, stroke, or heart failure
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <span>Type 1 diabetes or uncontrolled Type 2 diabetes (HbA1c {`>`}9.0%)</span>
                  </li>
                  <li className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <span>Significant renal or hepatic impairment</span>
                  </li>
                  <li className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <span>Known hypersensitivity to leptin or related proteins</span>
                  </li>
                </ul>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="design" className="p-6">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-4">Study Design Overview</h3>
                <div className="bg-slate-50 p-4 rounded-lg border">
                  <ul className="space-y-3 text-sm">
                    <li className="flex gap-2">
                      <div className="h-5 w-5 bg-blue-600 rounded-full text-white flex items-center justify-center text-xs">
                        1
                      </div>
                      <div>
                        <p className="font-medium">Study Type</p>
                        <p className="text-gray-600">
                          Randomized, double-blind, placebo-controlled, dose-ranging study
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-2">
                      <div className="h-5 w-5 bg-blue-600 rounded-full text-white flex items-center justify-center text-xs">
                        2
                      </div>
                      <div>
                        <p className="font-medium">Planned Enrollment</p>
                        <p className="text-gray-600">
                          90 participants total (72 active, 18 placebo)
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-2">
                      <div className="h-5 w-5 bg-blue-600 rounded-full text-white flex items-center justify-center text-xs">
                        3
                      </div>
                      <div>
                        <p className="font-medium">Study Duration</p>
                        <p className="text-gray-600">
                          12-week treatment period with 2-week follow-up
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-2">
                      <div className="h-5 w-5 bg-blue-600 rounded-full text-white flex items-center justify-center text-xs">
                        4
                      </div>
                      <div>
                        <p className="font-medium">Treatment Groups</p>
                        <p className="text-gray-600">4 dose cohorts of LMN-0801 plus placebo</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-4">Dosing Regimen</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group</TableHead>
                      <TableHead>Dose</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Number of Participants</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Cohort 1</TableCell>
                      <TableCell>25 mg LMN-0801</TableCell>
                      <TableCell>Once daily</TableCell>
                      <TableCell>18</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Cohort 2</TableCell>
                      <TableCell>50 mg LMN-0801</TableCell>
                      <TableCell>Once daily</TableCell>
                      <TableCell>18</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Cohort 3</TableCell>
                      <TableCell>100 mg LMN-0801</TableCell>
                      <TableCell>Once daily</TableCell>
                      <TableCell>18</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Cohort 4</TableCell>
                      <TableCell>200 mg LMN-0801</TableCell>
                      <TableCell>Once daily</TableCell>
                      <TableCell>18</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Placebo</TableCell>
                      <TableCell>Matching placebo</TableCell>
                      <TableCell>Once daily</TableCell>
                      <TableCell>18</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-4">Study Schedule</h3>
                <div className="relative">
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                  <div className="space-y-6">
                    <div className="relative">
                      <div className="absolute left-0 w-12 h-12 rounded-full bg-blue-100 border-2 border-blue-600 flex items-center justify-center">
                        <span className="font-medium text-blue-800">Week 0</span>
                      </div>
                      <div className="ml-16 pt-2">
                        <h4 className="font-medium">Baseline/Randomization</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Baseline assessments, randomization, and first dose administration
                        </p>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="absolute left-0 w-12 h-12 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center">
                        <span className="font-medium text-gray-700">Week 2</span>
                      </div>
                      <div className="ml-16 pt-2">
                        <h4 className="font-medium">Early Safety Assessment</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Safety labs, adverse events assessment, vital signs
                        </p>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="absolute left-0 w-12 h-12 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center">
                        <span className="font-medium text-gray-700">Week 4</span>
                      </div>
                      <div className="ml-16 pt-2">
                        <h4 className="font-medium">Interim Assessment</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Weight, safety labs, metabolic parameters, biomarkers
                        </p>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="absolute left-0 w-12 h-12 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center">
                        <span className="font-medium text-gray-700">Week 8</span>
                      </div>
                      <div className="ml-16 pt-2">
                        <h4 className="font-medium">Interim Assessment</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Weight, safety labs, body composition (DEXA), patient-reported outcomes
                        </p>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="absolute left-0 w-12 h-12 rounded-full bg-blue-100 border-2 border-blue-600 flex items-center justify-center">
                        <span className="font-medium text-blue-800">Week 12</span>
                      </div>
                      <div className="ml-16 pt-2">
                        <h4 className="font-medium">End of Treatment</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Primary and secondary endpoint assessments, comprehensive evaluation
                        </p>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="absolute left-0 w-12 h-12 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center">
                        <span className="font-medium text-gray-700">Week 14</span>
                      </div>
                      <div className="ml-16 pt-2">
                        <h4 className="font-medium">Safety Follow-up</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Final safety assessment, study completion
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="analysis" className="p-6">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-4">Statistical Analysis Plan</h3>
                <Card className="border-blue-100">
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-600">
                      Primary analysis will be conducted on the Safety Population (all participants
                      who receive at least one dose of study drug) and the Full Analysis Set (all
                      randomized participants who receive at least one dose of study drug and have
                      at least one post-baseline efficacy measurement).
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-4">Safety Analysis</h3>
                <div className="space-y-3">
                  <div className="bg-gray-50 p-3 rounded-lg border">
                    <p className="font-medium">Adverse Events</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Summarized by treatment group using descriptive statistics (counts,
                      percentages, incidence rates)
                    </p>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-lg border">
                    <p className="font-medium">Laboratory Parameters</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Change from baseline analyzed using descriptive statistics and shift tables
                    </p>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-lg border">
                    <p className="font-medium">Vital Signs</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Change from baseline analyzed using descriptive statistics and shift tables
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-4">Efficacy Analysis</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Analysis Method</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Percent change in body weight</TableCell>
                      <TableCell>
                        MMRM with treatment, visit, treatment×visit interaction as fixed effects;
                        baseline weight as covariate
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Proportion with ≥5% weight loss</TableCell>
                      <TableCell>
                        Logistic regression with treatment as factor and baseline weight as
                        covariate
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Change in waist circumference</TableCell>
                      <TableCell>
                        ANCOVA with treatment as factor and baseline value as covariate
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Body composition changes</TableCell>
                      <TableCell>
                        ANCOVA with treatment as factor and baseline values as covariates
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Metabolic parameters</TableCell>
                      <TableCell>MMRM or ANCOVA depending on measurement frequency</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-4">Sample Size Justification</h3>
                <Card className="border-indigo-100 bg-indigo-50">
                  <CardContent className="p-4">
                    <p className="text-sm">
                      With 18 participants per group, the study has approximately 80% power to
                      detect a difference in percent weight change of 4.5% between any LMN-0801 dose
                      group and placebo at Week 12, assuming a standard deviation of 5%, a two-sided
                      alpha of 0.05, and using Dunnett's procedure to adjust for multiple
                      comparisons.
                    </p>
                    <p className="text-sm mt-3">
                      The sample size also allows for preliminary assessment of safety and
                      dose-response relationship to inform future phase 2b/3 studies.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="recommendations" className="p-6">
            <ProtocolComparisonTab protocolText={protocolText} />

            <div className="mt-8 border-t pt-6">
              <h3 className="text-lg font-medium mb-4">Version History</h3>
              <ProtocolVersionCompare protocolId="obesity_wt02_v1" />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="bg-slate-50 flex justify-between p-4 border-t">
        <div className="text-sm text-gray-500">Protocol Version: 1.1 (March 2025)</div>
        <div className="flex gap-2">
          <Link href="/lumen-bio/dashboard/wt02/endpoint-recommendations">
            <Button variant="outline" size="sm">
              <Target className="h-4 w-4 mr-1" />
              Endpoint Recommendations
            </Button>
          </Link>
          <Link href="/lumen-bio/dashboard/wt02/full-protocol">
            <Button size="sm">
              View Full Protocol <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
};

export default ObesityStudyProtocol;
