import React from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  BookOpen,
  CheckCircle,
  AlertCircle,
  Search,
  Download,
  FileSearch,
  Highlighter,
  NotebookPen,
  Brain,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const CsrExtractionGuide = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-6 px-4 max-w-7xl"
    >
      <div className="flex flex-col space-y-2 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">CSR Data Extraction Guide</h1>
        <p className="text-muted-foreground">
          A comprehensive guide for extracting data from Clinical Study Reports (CSRs) for
          systematic reviews and analysis.
        </p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="structure">CSR Structure</TabsTrigger>
          <TabsTrigger value="extraction">Extraction Process</TabsTrigger>
          <TabsTrigger value="bestpractices">Best Practices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Understanding Clinical Study Reports</CardTitle>
                <CardDescription>
                  Key information about CSRs and their use in systematic reviews
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg mb-2">What is a Clinical Study Report?</h3>
                  <p className="text-sm text-muted-foreground">
                    A Clinical Study Report (CSR) is an "integrated full report of an individual
                    study of any therapeutic, prophylactic or diagnostic agent conducted in
                    patients, in which the clinical and statistical description, presentations, and
                    analyses are integrated into a single report" (ICH 1995).
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-lg mb-2">Benefits of using CSRs</h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    <li>
                      Access to unpublished results (entire outcomes, subgroups, adverse events)
                    </li>
                    <li>
                      Standardization of analysis methods (population analysis, handling missing
                      data)
                    </li>
                    <li>Fine details of trial conduct</li>
                    <li>Ability to assess validity of other data sources</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-lg mb-2">Challenges of using CSRs</h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    <li>Difficult to obtain</li>
                    <li>Extremely lengthy (average length can be thousands of pages)</li>
                    <li>May contain contradictory information</li>
                    <li>Organization can be complex and inconsistent across sponsors</li>
                  </ul>
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full mt-2">
                  <Download className="h-4 w-4 mr-2" />
                  Download Full Guide
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Reference</CardTitle>
                <CardDescription>Essential information for CSR extraction</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start space-x-2">
                  <FileText className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium text-sm">Key CSR Contents</h4>
                    <p className="text-xs text-muted-foreground">
                      Study design, risk of bias, analysis methods, and results
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <Search className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium text-sm">Search Tips</h4>
                    <p className="text-xs text-muted-foreground">
                      Ensure PDF is searchable and use ctrl+F to find key terms
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium text-sm">Common Issues</h4>
                    <p className="text-xs text-muted-foreground">
                      Conflicting information, missing data, unclear definitions
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium text-sm">Validation Steps</h4>
                    <p className="text-xs text-muted-foreground">
                      Cross-reference with protocol, publications, and IPD
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-primary/5 rounded-md mt-3">
                  <h4 className="font-medium text-sm mb-1">Critical Data Points</h4>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• Population definitions (ITT, PP, safety)</li>
                    <li>• Primary & secondary outcomes</li>
                    <li>• Statistical analysis methods</li>
                    <li>• Adverse events reporting</li>
                    <li>• Handling of missing data</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="structure" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>CSR Document Structure</CardTitle>
              <CardDescription>
                Standard components of a Clinical Study Report and where to find key information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      <th className="text-left p-2 border">Section</th>
                      <th className="text-left p-2 border">Description</th>
                      <th className="text-left p-2 border">Key Information</th>
                      <th className="text-left p-2 border">Typical Page Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-2 border font-medium">Title page/Synopsis</td>
                      <td className="p-2 border text-sm">
                        Brief overview of the study and main results
                      </td>
                      <td className="p-2 border text-sm">
                        Quick summary, may not match detailed results
                      </td>
                      <td className="p-2 border text-sm">5-10</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-medium">Table of contents</td>
                      <td className="p-2 border text-sm">Document structure and page numbers</td>
                      <td className="p-2 border text-sm">Navigation aid for finding sections</td>
                      <td className="p-2 border text-sm">5-10</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-medium">Ethics</td>
                      <td className="p-2 border text-sm">
                        IRB approvals and ethical considerations
                      </td>
                      <td className="p-2 border text-sm">Ethical standards, approvals</td>
                      <td className="p-2 border text-sm">1-5</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-medium">
                        Study objectives, plan, and procedures
                      </td>
                      <td className="p-2 border text-sm">Detailed description of study design</td>
                      <td className="p-2 border text-sm">
                        Hypotheses, endpoints, population definitions
                      </td>
                      <td className="p-2 border text-sm">30-50</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-medium">Study subjects</td>
                      <td className="p-2 border text-sm">
                        Description of participant characteristics
                      </td>
                      <td className="p-2 border text-sm">
                        Demographics, inclusion/exclusion criteria
                      </td>
                      <td className="p-2 border text-sm">10-20</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-medium">Efficacy results</td>
                      <td className="p-2 border text-sm">
                        Results for primary and secondary endpoints
                      </td>
                      <td className="p-2 border text-sm">
                        Primary analysis, subgroups, sensitivity analyses
                      </td>
                      <td className="p-2 border text-sm">20-100</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-medium">Safety results</td>
                      <td className="p-2 border text-sm">Adverse events and safety findings</td>
                      <td className="p-2 border text-sm">AEs, SAEs, withdrawals due to AEs</td>
                      <td className="p-2 border text-sm">30-100</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-medium">Tables, figures, graphs</td>
                      <td className="p-2 border text-sm">Supporting data visualizations</td>
                      <td className="p-2 border text-sm">Detailed results in tabular format</td>
                      <td className="p-2 border text-sm">500-2000</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-medium">Appendices</td>
                      <td className="p-2 border text-sm">Protocol, CRFs, SAP, publications</td>
                      <td className="p-2 border text-sm">Original study documentation</td>
                      <td className="p-2 border text-sm">1000-5000</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-medium">Subject data listings</td>
                      <td className="p-2 border text-sm">Individual patient data</td>
                      <td className="p-2 border text-sm">Raw data for reanalysis</td>
                      <td className="p-2 border text-sm">1000-5000</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-6 space-y-4">
                <h3 className="font-semibold text-lg">Tips for Navigating CSR Structure</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-md">
                    <div className="flex items-start space-x-2 mb-2">
                      <BookOpen className="h-5 w-5 text-primary mt-0.5" />
                      <h4 className="font-medium">Start with the synopsis</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Begin with the synopsis for an overview, but be aware it may not contain all
                      details or may differ from the main report.
                    </p>
                  </div>

                  <div className="p-4 border rounded-md">
                    <div className="flex items-start space-x-2 mb-2">
                      <FileSearch className="h-5 w-5 text-primary mt-0.5" />
                      <h4 className="font-medium">Use the table of contents</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      The table of contents is your roadmap. Make note of key section page numbers
                      for reference.
                    </p>
                  </div>

                  <div className="p-4 border rounded-md">
                    <div className="flex items-start space-x-2 mb-2">
                      <Search className="h-5 w-5 text-primary mt-0.5" />
                      <h4 className="font-medium">Search for key terms</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Use search functionality to find specific terms like "primary endpoint,"
                      "ITT," or "adverse events."
                    </p>
                  </div>

                  <div className="p-4 border rounded-md">
                    <div className="flex items-start space-x-2 mb-2">
                      <Highlighter className="h-5 w-5 text-primary mt-0.5" />
                      <h4 className="font-medium">Annotate as you go</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Use PDF annotation tools to mark important information for easy reference
                      later.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extraction" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Data Extraction Process</CardTitle>
              <CardDescription>
                Step-by-step guidance for extracting key information from CSRs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="step1">
                  <AccordionTrigger>
                    <div className="flex items-center">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm mr-2">
                        1
                      </div>
                      <span>Prepare the document for extraction</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-8">
                    <ul className="space-y-3">
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <span className="text-sm">
                          Ensure the PDF is searchable (use OCR software if needed)
                        </span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <span className="text-sm">
                          Review the table of contents to understand the document structure
                        </span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <span className="text-sm">
                          Create a data extraction template based on your research questions
                        </span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <span className="text-sm">
                          Set up an annotation system for marking key sections
                        </span>
                      </li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="step2">
                  <AccordionTrigger>
                    <div className="flex items-center">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm mr-2">
                        2
                      </div>
                      <span>Identify study populations</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-8">
                    <p className="text-sm mb-3 text-muted-foreground">
                      Search for and extract detailed definitions of all analysis populations:
                    </p>
                    <ul className="space-y-3">
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">
                            Intent-to-treat (ITT) population
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Usually all randomized subjects regardless of protocol violations
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">Per protocol (PP) population</span>
                          <p className="text-xs text-muted-foreground">
                            Subjects who completed the study without major protocol deviations
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">Safety population</span>
                          <p className="text-xs text-muted-foreground">
                            Typically all subjects who received at least one dose of study treatment
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">Modified ITT (mITT)</span>
                          <p className="text-xs text-muted-foreground">
                            Variation of ITT with specific modifications (document exactly how
                            defined)
                          </p>
                        </div>
                      </li>
                    </ul>
                    <div className="bg-muted p-3 rounded-md mt-3">
                      <p className="text-xs italic">
                        <span className="font-medium">Key locations:</span> Look in the "Study
                        objectives, plan, and procedures" section, "Statistical methods" subsection,
                        or in the Statistical Analysis Plan (SAP) in the appendices.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="step3">
                  <AccordionTrigger>
                    <div className="flex items-center">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm mr-2">
                        3
                      </div>
                      <span>Extract outcome definitions and results</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-8">
                    <p className="text-sm mb-3 text-muted-foreground">
                      For each primary and secondary outcome:
                    </p>
                    <ul className="space-y-3">
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">
                            Exact definition of the outcome
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Including measurement tools, time points, and units
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">Analysis method</span>
                          <p className="text-xs text-muted-foreground">
                            Statistical tests, handling of missing data, adjustments
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">
                            Results for each analysis population
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Sample sizes, effect sizes, confidence intervals, p-values
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">Subgroup analyses</span>
                          <p className="text-xs text-muted-foreground">
                            Results broken down by demographic or clinical characteristics
                          </p>
                        </div>
                      </li>
                    </ul>
                    <div className="bg-muted p-3 rounded-md mt-3">
                      <p className="text-xs italic">
                        <span className="font-medium">Example:</span> For an outcome like "change
                        from baseline in MADRS at day 57," extract the baseline values, day 57
                        values, change scores, statistical test results, and note whether this was
                        LOCF, MMRM, or another approach.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="step4">
                  <AccordionTrigger>
                    <div className="flex items-center">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm mr-2">
                        4
                      </div>
                      <span>Extract safety and adverse event data</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-8">
                    <ul className="space-y-3">
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">Adverse event definitions</span>
                          <p className="text-xs text-muted-foreground">
                            How AEs were collected, coded, and categorized
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">
                            Summary tables of adverse events
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Overall incidence, serious AEs, AEs by severity and relatedness
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">Withdrawals due to AEs</span>
                          <p className="text-xs text-muted-foreground">
                            Numbers and reasons for discontinuation
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">
                            Deaths and other serious outcomes
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Details on timing and potential relationship to treatment
                          </p>
                        </div>
                      </li>
                    </ul>
                    <div className="bg-muted p-3 rounded-md mt-3">
                      <p className="text-xs italic">
                        <span className="font-medium">Key considerations:</span> Check both the
                        safety results section and appendices for complete listings. Be aware that
                        AEs may be coded differently across studies (e.g., MedDRA vs. WHO-ART).
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="step5">
                  <AccordionTrigger>
                    <div className="flex items-center">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm mr-2">
                        5
                      </div>
                      <span>Reconcile and document contradictions</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-8">
                    <p className="text-sm mb-3 text-muted-foreground">
                      When you encounter contradictory information:
                    </p>
                    <ul className="space-y-3">
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">Document all versions</span>
                          <p className="text-xs text-muted-foreground">
                            Record the conflicting information and its source locations
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">
                            Establish a hierarchy of sources
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Decide which sections of the CSR take precedence
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">
                            Cross-reference with other documents
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Check protocol, SAP, and individual patient data if available
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <div>
                          <span className="text-sm font-medium">
                            Consider impact on interpretation
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Assess how contradictions might affect your analysis
                          </p>
                        </div>
                      </li>
                    </ul>
                    <div className="bg-muted p-3 rounded-md mt-3">
                      <p className="text-xs italic">
                        <span className="font-medium">Recommendation:</span> Create a
                        "contradictions log" to track all instances where information differed
                        between sections and your decision for resolving each one.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="bg-primary/5 p-4 rounded-lg mt-6">
                <h3 className="font-semibold text-lg mb-2 flex items-center">
                  <NotebookPen className="h-5 w-5 mr-2 text-primary" />
                  Sample Data Extraction Template
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="text-left p-2 border">Data Category</th>
                        <th className="text-left p-2 border">Information to Extract</th>
                        <th className="text-left p-2 border">Source Location in CSR</th>
                        <th className="text-left p-2 border">Notes/Contradictions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-2 border">Study Population(s)</td>
                        <td className="p-2 border">
                          <ul className="list-disc pl-4 text-xs space-y-1">
                            <li>ITT definition</li>
                            <li>PP definition</li>
                            <li>Safety population</li>
                            <li>Number of subjects in each</li>
                          </ul>
                        </td>
                        <td className="p-2 border">pp. 43-48</td>
                        <td className="p-2 border">
                          Different ITT definition in synopsis vs. methods section
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 border">Primary Outcome</td>
                        <td className="p-2 border">
                          <ul className="list-disc pl-4 text-xs space-y-1">
                            <li>MADRS change from baseline at day 57</li>
                            <li>Analysis method (MMRM)</li>
                            <li>Effect size, CI, p-value</li>
                            <li>Handling of missing data</li>
                          </ul>
                        </td>
                        <td className="p-2 border">pp. 72-78, Tables 14-22</td>
                        <td className="p-2 border">
                          Primary analysis uses MMRM but sensitivity uses LOCF
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 border">Secondary Outcomes</td>
                        <td className="p-2 border">
                          <ul className="list-disc pl-4 text-xs space-y-1">
                            <li>CGI-S change at day 57</li>
                            <li>Response rate (≥50% reduction)</li>
                            <li>Remission rate (MADRS ≤10)</li>
                          </ul>
                        </td>
                        <td className="p-2 border">pp. 79-92, Tables 23-35</td>
                        <td className="p-2 border">
                          Protocol listed 5 secondary outcomes but CSR reports 7
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 border">Adverse Events</td>
                        <td className="p-2 border">
                          <ul className="list-disc pl-4 text-xs space-y-1">
                            <li>AE definition and collection</li>
                            <li>Common AEs (≥5%)</li>
                            <li>Serious AEs</li>
                            <li>Withdrawals due to AEs</li>
                          </ul>
                        </td>
                        <td className="p-2 border">pp. 110-158, Tables 36-50</td>
                        <td className="p-2 border">
                          Individual narratives for SAEs in Appendix 16.2.7
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bestpractices" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Best Practices for CSR Data Extraction</CardTitle>
                <CardDescription>
                  Expert recommendations for efficient and accurate extraction
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <h3 className="font-semibold text-lg mb-3">Document Management</h3>
                  <ul className="space-y-2">
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span className="text-sm">
                        Ensure all CSR PDFs are searchable (use OCR if needed)
                      </span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span className="text-sm">
                        Use PDF annotation tools to mark key sections and findings
                      </span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span className="text-sm">
                        Create bookmarks for frequently referenced sections
                      </span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span className="text-sm">
                        Maintain organized file structures for CSRs and extracted data
                      </span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-lg mb-3">Data Extraction Approach</h3>
                  <ul className="space-y-2">
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span className="text-sm">
                        Use standardized extraction forms or templates
                      </span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span className="text-sm">
                        Extract verbatim definitions and methodologies
                      </span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span className="text-sm">
                        Document page numbers and section locations for all extracted data
                      </span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span className="text-sm">
                        Use dual extraction with reconciliation when possible
                      </span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-lg mb-3">Handling Discrepancies</h3>
                  <ul className="space-y-2">
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span className="text-sm">
                        Establish a hierarchy of trusted sources within CSRs
                      </span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span className="text-sm">
                        Document all contradictions with their locations
                      </span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span className="text-sm">
                        Consult the study protocol and SAP to resolve conflicts
                      </span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span className="text-sm">
                        Consider conducting sensitivity analyses when discrepancies exist
                      </span>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Common Challenges and Solutions</CardTitle>
                  <CardDescription>
                    Addressing frequent issues in CSR data extraction
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-3 border rounded-md">
                      <h4 className="font-medium text-sm mb-1">Non-searchable PDFs</h4>
                      <p className="text-xs text-muted-foreground">
                        Use OCR software like Adobe Acrobat Pro or free alternatives like Tesseract
                        to convert scanned documents to searchable text.
                      </p>
                    </div>

                    <div className="p-3 border rounded-md">
                      <h4 className="font-medium text-sm mb-1">Conflicting outcome definitions</h4>
                      <p className="text-xs text-muted-foreground">
                        Extract all versions and prioritize the Statistical Analysis Plan (SAP)
                        definition, then the methods section, and lastly the synopsis.
                      </p>
                    </div>

                    <div className="p-3 border rounded-md">
                      <h4 className="font-medium text-sm mb-1">Multiple analysis populations</h4>
                      <p className="text-xs text-muted-foreground">
                        Extract results for all populations and note which was designated as
                        primary. For meta-analysis, prioritize ITT results when available.
                      </p>
                    </div>

                    <div className="p-3 border rounded-md">
                      <h4 className="font-medium text-sm mb-1">Missing or incomplete data</h4>
                      <p className="text-xs text-muted-foreground">
                        Look in appendices and individual patient data listings. Document what is
                        missing and consider contacting study sponsors for clarification.
                      </p>
                    </div>

                    <div className="p-3 border rounded-md">
                      <h4 className="font-medium text-sm mb-1">
                        Inconsistent adverse event reporting
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Document the coding system used (MedDRA, WHO-ART) and version. Extract at
                        multiple levels (preferred terms, system organ class) when available.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Lessons from Expert Extractors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                        1
                      </div>
                      <div>
                        <h4 className="font-medium text-sm">Make the CSR searchable</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          "If the CSR is in PDF format, make sure the text is searchable. This saves
                          countless hours when looking for specific information."
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                        2
                      </div>
                      <div>
                        <h4 className="font-medium text-sm">Use PDF annotation tools</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          "Utilize the 'Add note to text' function to mark key sections and findings
                          as you go through the document. This creates a trail of breadcrumbs for
                          later reference."
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                        3
                      </div>
                      <div>
                        <h4 className="font-medium text-sm">Establish a hierarchy of sources</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          "Make a priori rules about which sections you will 'trust' when there are
                          discrepancies. The Statistical Analysis Plan (SAP) is often the most
                          reliable source."
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                        4
                      </div>
                      <div>
                        <h4 className="font-medium text-sm">Completely specify outcomes</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          "Comparing outcomes in CSRs with outcomes in other sources can help
                          identify potential for reporting bias. Ensure complete specification of
                          measurement, time point, and analysis method."
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>AI-Assisted CSR Extraction with TrialSage</CardTitle>
                <CardDescription>
                  Leverage our AI tools to streamline your CSR data extraction process
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-md">
                    <div className="flex items-start mb-2">
                      <FileSearch className="h-5 w-5 text-primary mr-2" />
                      <h4 className="font-medium">Automated Information Extraction</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Our AI can automatically locate and extract key elements from your CSR,
                      including population definitions, outcome measures, and statistical methods.
                    </p>
                    <Button variant="outline" size="sm" className="w-full">
                      Try Extraction Assistant
                    </Button>
                  </div>

                  <div className="p-4 border rounded-md">
                    <div className="flex items-start mb-2">
                      <AlertCircle className="h-5 w-5 text-primary mr-2" />
                      <h4 className="font-medium">Discrepancy Detection</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Our system identifies contradictions between different sections of a CSR,
                      flagging potential issues that require manual verification.
                    </p>
                    <Button variant="outline" size="sm" className="w-full">
                      Run Consistency Check
                    </Button>
                  </div>

                  <div className="p-4 border rounded-md">
                    <div className="flex items-start mb-2">
                      <Brain className="h-5 w-5 text-primary mr-2" />
                      <h4 className="font-medium">Study Design Agent</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Ask our AI assistant questions about complex aspects of the CSR, such as
                      statistical methods or outcome definitions.
                    </p>
                    <Button variant="outline" size="sm" className="w-full">
                      Chat with Study Design Agent
                    </Button>
                  </div>
                </div>

                <div className="mt-6">
                  <Button className="w-full sm:w-auto">
                    <FileText className="h-4 w-4 mr-2" />
                    Upload a CSR for AI Analysis
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default CsrExtractionGuide;
