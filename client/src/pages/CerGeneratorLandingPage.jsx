import React from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Brain,
  ChevronRight,
  FileCheck,
  BarChart4,
  Shield,
  Database,
  LineChart,
  Laptop,
} from 'lucide-react';

const CerGeneratorLandingPage = () => {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-indigo-800 mb-8">
          Medical Device & Diagnostics Regulatory Module
        </h1>

        {/* Hero Section */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex flex-col lg:flex-row items-center space-y-8 lg:space-y-0 lg:space-x-8">
            <div className="lg:w-1/2 space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-indigo-700 mb-2">
                  Jurisdiction-Agnostic Regulatory Automation
                </h2>
                <h3 className="text-xl text-indigo-600 mb-4">
                  FDA 510(k) • PMA • EU MDR CER
                </h3>
              </div>

              <p className="text-gray-600">
                This module models a single regulatory truth (claims, evidence, standards, outcomes)
                and deterministically renders it into FDA 510(k), FDA PMA, and EU MDR CER formats
                without rewriting or losing traceability.
              </p>

              <p className="text-gray-600">
                Jurisdictions are rendering targets, not separate workflows. The underlying evidence
                graph remains consistent across every export.
              </p>

              <div className="pt-4">
                <Button
                  onClick={() => setLocation('/cerv2')}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Start Using Medical Device & Diagnostics <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="lg:w-1/2 bg-indigo-50 p-6 rounded-lg border border-indigo-100">
              <h3 className="text-lg font-semibold text-indigo-700 mb-4">
                Full Generation Pipeline
              </h3>

              <div className="space-y-4">
                <div className="flex">
                  <div className="flex-shrink-0 mr-4">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                      1
                    </div>
                  </div>
                  <div>
                    <h4 className="text-md font-medium text-indigo-700">
                      Intelligent Input Capture
                    </h4>
                    <p className="text-sm text-gray-600">
                      Captures device details, manufacturer identity, clinical data references
                      through a guided wizard interface.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="flex-shrink-0 mr-4">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                      2
                    </div>
                  </div>
                  <div>
                    <h4 className="text-md font-medium text-indigo-700">
                      Real-World Safety Signal Ingestion
                    </h4>
                    <p className="text-sm text-gray-600">
                      Pulls and analyzes FDA FAERS adverse event data, maps to pharmacologic groups,
                      and calculates weighted risk scores.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="flex-shrink-0 mr-4">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                      3
                    </div>
                  </div>
                  <div>
                    <h4 className="text-md font-medium text-indigo-700">
                      Comparator Product Analysis
                    </h4>
                    <p className="text-sm text-gray-600">
                      Dynamically determines pharmacologic peers and benchmarks their risk profiles
                      against your product.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="flex-shrink-0 mr-4">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                      4
                    </div>
                  </div>
                  <div>
                    <h4 className="text-md font-medium text-indigo-700">AI Document Generation</h4>
                    <p className="text-sm text-gray-600">
                      Uses GPT-4o to generate compliant sections with live citations from PubMed,
                      Google Scholar, and preprint servers.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="flex-shrink-0 mr-4">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                      5
                    </div>
                  </div>
                  <div>
                    <h4 className="text-md font-medium text-indigo-700">
                      Compliance QA & Output Compilation
                    </h4>
                    <p className="text-sm text-gray-600">
                      Applies AI confidence metrics, scores regulatory alignment, and compiles into
                      exportable PDF and Word formats.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-indigo-700">Advanced Features</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="block bg-indigo-50 hover:bg-indigo-100 rounded-lg p-4 transition duration-200 h-full">
              <div className="text-indigo-700 mb-3">
                <Database className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-indigo-700 mb-2">FAERS Integration</h3>
              <p className="text-gray-600 text-sm">
                Real-time FDA adverse event data analysis with risk scoring and weighting.
              </p>
            </div>

            <div className="block bg-indigo-50 hover:bg-indigo-100 rounded-lg p-4 transition duration-200 h-full">
              <div className="text-indigo-700 mb-3">
                <LineChart className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-indigo-700 mb-2">Comparator Analysis</h3>
              <p className="text-gray-600 text-sm">
                Automated benchmarking against similar products using ATC-class based scoring.
              </p>
            </div>

            <div className="block bg-indigo-50 hover:bg-indigo-100 rounded-lg p-4 transition duration-200 h-full">
              <div className="text-indigo-700 mb-3">
                <Brain className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-indigo-700 mb-2">AI Document Generation</h3>
              <p className="text-gray-600 text-sm">
                GPT-4o powered document creation with automated literature citations.
              </p>
            </div>

            <div className="block bg-indigo-50 hover:bg-indigo-100 rounded-lg p-4 transition duration-200 h-full">
              <div className="text-indigo-700 mb-3">
                <Shield className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-indigo-700 mb-2">Regulatory Compliance</h3>
              <p className="text-gray-600 text-sm">
                Live scoring for EU MDR, FDA, and ISO 14155 compliance requirements.
              </p>
            </div>
          </div>
        </div>

        {/* Metrics Example */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-indigo-700">System Metrics</h2>
          </div>

          <h3 className="text-md font-medium text-indigo-700 mb-4">
            Example Metrics from CardioMonitor Pro 3000
          </h3>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>AI Confidence Score</TableCell>
                  <TableCell>92%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Completion Rate</TableCell>
                  <TableCell>96%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Regulatory Compliance</TableCell>
                  <TableCell>89%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Citations Used</TableCell>
                  <TableCell>47</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Total Word Count</TableCell>
                  <TableCell>28,506</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Sections Generated</TableCell>
                  <TableCell>14</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Processing Time</TableCell>
                  <TableCell>3 minutes, 42 sec</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>AI Model Used</TableCell>
                  <TableCell>GPT-4o</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-indigo-700">
              What Makes TrialSage Different
            </h2>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>TrialSage CER Module</TableHead>
                  <TableHead>Traditional CER Tools</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Real-time FAERS integration</TableCell>
                  <TableCell className="text-green-600">
                    ✓ Yes (via OpenFDA + risk scoring)
                  </TableCell>
                  <TableCell className="text-red-600">✗ Manual PDF parsing</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Comparator analysis engine</TableCell>
                  <TableCell className="text-green-600">✓ ATC-class based scoring</TableCell>
                  <TableCell className="text-red-600">✗ Not available</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Literature auto-citation</TableCell>
                  <TableCell className="text-green-600">✓ Structured & AI-verified</TableCell>
                  <TableCell className="text-red-600">✗ Manual or semi-automated</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>End-to-end report build</TableCell>
                  <TableCell className="text-green-600">✓ PDF, Word, Preview & Vault</TableCell>
                  <TableCell className="text-red-600">✗ Requires MS Word authors</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Regulatory alignment</TableCell>
                  <TableCell className="text-green-600">
                    ✓ EU MDR, FDA, ISO 14155 scored live
                  </TableCell>
                  <TableCell className="text-red-600">✗ Offline manual review</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8 text-center">
          <h2 className="text-2xl font-semibold text-indigo-700 mb-4">
            Ready to Transform Your Clinical Evaluation Process?
          </h2>
          <p className="text-gray-600 mb-6">
            Generate compliant, data-driven Clinical Evaluation Reports in minutes, not months.
          </p>
          <Button
            onClick={() => setLocation('/cerv2')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Get Started Now <ChevronRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CerGeneratorLandingPage;
