import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  FileText,
  AlertCircle,
  FilePlus,
  LineChart,
  FileBarChart2,
  BarChart4,
  Laptop,
  DownloadCloud,
} from 'lucide-react';
import { Link } from 'wouter';

export const cerSolutionsUseCase = {
  id: 'cer-solutions',
  title: 'Clinical Evaluation Report (CER) Solutions',
  description:
    'Automate the generation, analysis, and tracking of Clinical Evaluation Reports (CERs) to maintain regulatory compliance and derive actionable insights from post-market surveillance data.',
  category: 'Regulatory Compliance',
  heroImage: '/images/use-cases/cer-solutions-hero.svg',
  lastUpdated: '2025-04-15',
  featured: true,
  tags: ['Clinical Evaluation', 'Regulatory', 'FDA FAERS', 'Post-Market Surveillance'],

  content: () => (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold mb-4">Overview</h2>
        <p className="text-slate-700 dark:text-slate-300 mb-4">
          Clinical Evaluation Reports (CERs) are critical documents required by regulatory bodies to
          demonstrate safety and performance of medical devices and pharmaceutical products
          throughout their lifecycle. Concept2Cure's CER Solutions provide a comprehensive
          suite of tools for generating, analyzing, and maintaining CERs with automated data
          pipelines from FDA FAERS, enhanced visualization capabilities, and AI-powered narrative
          generation.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <FileText className="mr-2 h-5 w-5 text-primary" />
                Automated Generation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Automatically generate comprehensive CERs from NDC codes using FDA FAERS data and AI
                narrative synthesis.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <LineChart className="mr-2 h-5 w-5 text-primary" />
                Advanced Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Visualize adverse event trends, identify potential safety signals, and predict
                future patterns.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <BarChart4 className="mr-2 h-5 w-5 text-primary" />
                Real-time Monitoring
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Track key metrics and receive notifications about emerging safety concerns through
                continuous surveillance.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">Key Features</h2>
        <div className="space-y-4">
          <div className="flex items-start">
            <CheckCircle2 className="h-5 w-5 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-medium">FDA FAERS Data Integration</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                Direct connection to FDA's Adverse Event Reporting System with real-time caching for
                fast data retrieval.
              </p>
            </div>
          </div>
          <div className="flex items-start">
            <CheckCircle2 className="h-5 w-5 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-medium">AI-Powered Narrative Generation</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                Transform raw FAERS data into coherent narratives following regulatory guidelines
                with structured sections.
              </p>
            </div>
          </div>
          <div className="flex items-start">
            <CheckCircle2 className="h-5 w-5 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-medium">Enhanced PDF Reports</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                Generate publication-quality PDF reports with interactive visualizations, data
                tables, and executive summaries.
              </p>
            </div>
          </div>
          <div className="flex items-start">
            <CheckCircle2 className="h-5 w-5 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-medium">Background Task Management</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                Process long-running operations with Celery task queues and receive email
                notifications when reports are ready.
              </p>
            </div>
          </div>
          <div className="flex items-start">
            <CheckCircle2 className="h-5 w-5 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-medium">Real-time Safety Signal Detection</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                Identify potential safety signals with automatic statistical analysis of adverse
                event patterns and anomalies.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
        <h2 className="text-2xl font-bold mb-4">Buyer Profile</h2>
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-2">Regulatory Affairs Directors</h3>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
                  <span className="text-sm">
                    Need to maintain regulatory compliance with post-market surveillance
                    requirements
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
                  <span className="text-sm">
                    Want to streamline CER creation and updates to reduce manual effort
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
                  <span className="text-sm">
                    Require consistent, audit-ready documentation for regulatory submissions
                  </span>
                </li>
              </ul>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-2">Pharmacovigilance Leaders</h3>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
                  <span className="text-sm">
                    Focus on active safety monitoring and signal detection
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
                  <span className="text-sm">
                    Need to analyze adverse event trends across multiple products
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
                  <span className="text-sm">
                    Want predictive insights to anticipate potential safety concerns
                  </span>
                </li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-6 mt-4">
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-2">Medical Affairs Teams</h3>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
                  <span className="text-sm">
                    Need to communicate safety findings to healthcare professionals
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
                  <span className="text-sm">
                    Require evidence-based narratives for risk-benefit assessments
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
                  <span className="text-sm">
                    Want to integrate real-world evidence into product lifecycle management
                  </span>
                </li>
              </ul>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-2">Clinical Development Leaders</h3>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
                  <span className="text-sm">
                    Focus on translating post-market findings into pre-market protocol design
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
                  <span className="text-sm">
                    Need integrated views of both CSR and CER data for comprehensive insights
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-stone-1000 flex-shrink-0 mt-1" />
                  <span className="text-sm">
                    Want to identify potential development opportunities from real-world evidence
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">Example Reports</h2>
        <p className="text-slate-700 dark:text-slate-300 mb-6">
          Our CER Solutions generate comprehensive reports following MEDDEV 2.7/1 Rev. 4 structure
          and ISO 14155 requirements. Below are example reports that showcase the capabilities of
          our system.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="overflow-hidden">
            <div className="h-40 bg-gradient-to-r from-sky-500 to-stone-600 flex items-center justify-center">
              <FileBarChart2 className="h-16 w-16 text-white" />
            </div>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Adalimumab CER</CardTitle>
                <Badge>Enhanced</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                Comprehensive Clinical Evaluation Report for Adalimumab with 5-year safety data
                analysis, literature review, and risk-benefit assessment.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">FDA FAERS</Badge>
                <Badge variant="outline">Literature Review</Badge>
                <Badge variant="outline">Safety Analysis</Badge>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-1" />
                Preview
              </Button>
              <Button size="sm">
                <DownloadCloud className="h-4 w-4 mr-1" />
                Download
              </Button>
            </CardFooter>
          </Card>

          <Card className="overflow-hidden">
            <div className="h-40 bg-gradient-to-r from-stone-1000 to-stone-600 flex items-center justify-center">
              <FileBarChart2 className="h-16 w-16 text-white" />
            </div>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Semaglutide CER</CardTitle>
                <Badge>AI-Generated</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                Post-market surveillance report for Semaglutide with safety signal detection,
                adverse event clustering, and regulatory recommendations.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Adverse Events</Badge>
                <Badge variant="outline">Signal Detection</Badge>
                <Badge variant="outline">Visualizations</Badge>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-1" />
                Preview
              </Button>
              <Button size="sm">
                <DownloadCloud className="h-4 w-4 mr-1" />
                Download
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="mt-6 flex justify-center">
          <Link href="/example-reports">
            <Button variant="outline" className="gap-2">
              <FilePlus className="h-4 w-4" />
              View All Example Reports
            </Button>
          </Link>
        </div>
      </section>

      <section className="bg-gradient-to-r from-stone-600 to-stone-700 text-white p-6 rounded-lg">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-2xl font-bold mb-4">Start Using CER Solutions Today</h2>
            <p className="mb-6">
              Transform your post-market surveillance process with automated CER generation,
              enhanced analytics, and regulatory-compliant reporting.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/cer-generator">
                <Button className="bg-white text-stone-700 hover:bg-slate-100">
                  Try CER Generator
                </Button>
              </Link>
              <Link href="/enhanced-cer-dashboard">
                <Button variant="outline" className="border-white text-white hover:bg-stone-700">
                  View Dashboard
                </Button>
              </Link>
            </div>
          </div>
          <div className="hidden lg:flex justify-end">
            <div className="rounded-lg bg-white/10 backdrop-blur-sm p-6 w-full max-w-md">
              <h3 className="font-semibold text-lg mb-4">Key Benefits</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 mr-2 text-stone-300 flex-shrink-0 mt-0.5" />
                  <span>80% reduction in CER preparation time</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 mr-2 text-stone-300 flex-shrink-0 mt-0.5" />
                  <span>Early detection of safety signals before regulatory flags</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 mr-2 text-stone-300 flex-shrink-0 mt-0.5" />
                  <span>
                    Consistently formatted reports that meet global regulatory requirements
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 mr-2 text-stone-300 flex-shrink-0 mt-0.5" />
                  <span>Seamless integration with existing CSR workflows</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  ),
};
