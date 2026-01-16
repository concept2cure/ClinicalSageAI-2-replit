import React from 'react';
import { useLocation } from 'wouter';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  FileText, Upload, CheckCircle, AlertTriangle, ClipboardCheck, Search, ArrowRight } from 'lucide-react'

export default function ProtocolOptimizerLanding() {
  const [, navigate] = useLocation();

  return (
    <div className="container p-6 max-w-6xl mx-auto">
      <div className="space-y-6 text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight">Protocol Optimizer</h1>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          Enhance your clinical trial protocols with evidence-based suggestions from our
          comprehensive database of successful clinical study reports and global academic guidance.
        </p>
      </div>

      <Tabs defaultValue="features" className="space-y-8">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="features">Key Features</TabsTrigger>
          <TabsTrigger value="benefits">Benefits</TabsTrigger>
          <TabsTrigger value="howitworks">How It Works</TabsTrigger>
        </TabsList>

        <TabsContent value="features" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <Search className="h-8 w-8 text-blue-600 mb-2" />
                <CardTitle>CSR Alignment Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <p>
                  Compares your protocol against similar CSRs from our library of 779 published
                  clinical study reports.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <CheckCircle className="h-8 w-8 text-emerald-600 mb-2" />
                <CardTitle>Section-by-Section Review</CardTitle>
              </CardHeader>
              <CardContent>
                <p>
                  Provides targeted suggestions for each major protocol section with concrete
                  examples and rationales.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <AlertTriangle className="h-8 w-8 text-amber-600 mb-2" />
                <CardTitle>Risk Identification</CardTitle>
              </CardHeader>
              <CardContent>
                <p>
                  Highlights potential protocol risks and design issues that could affect trial
                  success or delay regulatory approval.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="benefits" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-800">
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <CheckCircle className="text-green-600 h-5 w-5 mr-2" />
                Improved Regulatory Alignment
              </h3>
              <p>
                Ensures protocols adhere to the latest FDA, EMA, and ICH guidelines, reducing the
                risk of regulatory delays.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-800">
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <CheckCircle className="text-green-600 h-5 w-5 mr-2" />
                Evidence-Based Design
              </h3>
              <p>
                Leverages patterns from successful trials to optimize endpoints, statistical
                approaches, and study populations.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-800">
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <CheckCircle className="text-green-600 h-5 w-5 mr-2" />
                Time and Resource Savings
              </h3>
              <p>
                Reduces protocol amendments and optimizes trial design up front, saving valuable
                time and resources.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-800">
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <CheckCircle className="text-green-600 h-5 w-5 mr-2" />
                Academic Rigor
              </h3>
              <p>
                Incorporates insights from leading academic research and peer-reviewed publications
                on trial design.
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="howitworks" className="space-y-6">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 p-8 rounded-lg border border-blue-100 dark:border-blue-900">
            <ol className="space-y-8">
              <li className="flex items-start">
                <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white font-bold">
                  1
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium">Upload Your Protocol</h3>
                  <p className="mt-1 text-muted-foreground">
                    Upload your draft protocol document (PDF or DOCX) or enter a protocol summary.
                  </p>
                </div>
              </li>
              <li className="flex items-start">
                <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white font-bold">
                  2
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium">Select Target Parameters</h3>
                  <p className="mt-1 text-muted-foreground">
                    Specify the therapeutic area, phase, and other key parameters to find relevant
                    CSRs.
                  </p>
                </div>
              </li>
              <li className="flex items-start">
                <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white font-bold">
                  3
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium">Review Comprehensive Analysis</h3>
                  <p className="mt-1 text-muted-foreground">
                    Get detailed optimization suggestions across all protocol sections with
                    evidence-based rationales.
                  </p>
                </div>
              </li>
              <li className="flex items-start">
                <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white font-bold">
                  4
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium">Export Actionable Insights</h3>
                  <p className="mt-1 text-muted-foreground">
                    Download a comprehensive report with all optimization suggestions for your team.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-12 flex flex-col items-center space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
          <Card className="hover:shadow-lg transition-shadow border-2 border-transparent hover:border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Upload className="mr-2 h-5 w-5 text-blue-600" />
                Upload Protocol
              </CardTitle>
              <CardDescription>Analyze an existing protocol document</CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                Upload your protocol as a PDF or DOCX file for comprehensive AI-powered analysis
                against our CSR database.
              </p>
            </CardContent>
            <CardFooter>
              <Button onClick={() => navigate('/protocol/upload')} className="w-full">
                Upload Protocol <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-2 border-transparent hover:border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-5 w-5 text-blue-600" />
                Summary Review
              </CardTitle>
              <CardDescription>Analyze a protocol summary or abstract</CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                Enter a text summary of your protocol to receive high-level optimization suggestions
                and insights.
              </p>
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => navigate('/protocol/optimizer')}
                className="w-full"
                variant="outline"
              >
                Enter Summary <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            For additional assistance or custom protocol review services, please contact our
            clinical consulting team.
          </p>
        </div>
      </div>
    </div>
  );
}
