import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle,
  FileText,
  Search,
  ClipboardCheck,
  FileCheck,
  Download,
  ChevronRight,
  BookOpen,
} from 'lucide-react';

/**
 * Welcome dialog for new clients starting a 510(k) submission
 * Provides an overview of the process and initial guidance
 */
const WelcomeDialog = ({ open, onOpenChange, onContinue }) => {
  const [currentTab, setCurrentTab] = useState('overview');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-blue-800">
            Welcome to the FDA 510(k) Submission Process
          </DialogTitle>
          <DialogDescription className="text-base text-blue-700">
            This guided system will help you create a complete 510(k) submission for the FDA
          </DialogDescription>
        </DialogHeader>

        <Tabs value={currentTab} onValueChange={setCurrentTab} className="mt-5">
          <TabsList className="grid grid-cols-4 mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="steps">Key Steps</TabsTrigger>
            <TabsTrigger value="requirements">Requirements</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-5">
            <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
              <h3 className="text-lg font-medium text-blue-800 mb-3">
                What is a 510(k) Submission?
              </h3>
              <p className="text-blue-700 mb-2">
                A 510(k) is a premarket submission made to the FDA to demonstrate that your device
                is substantially equivalent to a legally marketed device that is not subject to
                premarket approval.
              </p>
              <p className="text-blue-700">
                Our platform guides you through each step of the 510(k) submission process, from
                device profile creation to final submission generation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg border shadow-sm">
                <div className="flex items-center mb-3">
                  <div className="bg-green-100 p-2 rounded-full mr-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <h4 className="font-medium">Streamlined Process</h4>
                </div>
                <p className="text-sm text-gray-600">
                  Our step-by-step workflow guides you through the entire 510(k) submission process,
                  ensuring you complete all required sections.
                </p>
              </div>

              <div className="bg-white p-4 rounded-lg border shadow-sm">
                <div className="flex items-center mb-3">
                  <div className="bg-blue-100 p-2 rounded-full mr-3">
                    <Search className="h-5 w-5 text-blue-600" />
                  </div>
                  <h4 className="font-medium">Predicate Device Finder</h4>
                </div>
                <p className="text-sm text-gray-600">
                  Our AI-powered system helps you identify appropriate predicate devices for your
                  substantial equivalence claim.
                </p>
              </div>

              <div className="bg-white p-4 rounded-lg border shadow-sm">
                <div className="flex items-center mb-3">
                  <div className="bg-amber-100 p-2 rounded-full mr-3">
                    <ClipboardCheck className="h-5 w-5 text-amber-600" />
                  </div>
                  <h4 className="font-medium">Compliance Checks</h4>
                </div>
                <p className="text-sm text-gray-600">
                  Automated validation ensures your submission meets all FDA requirements before
                  final document generation.
                </p>
              </div>

              <div className="bg-white p-4 rounded-lg border shadow-sm">
                <div className="flex items-center mb-3">
                  <div className="bg-purple-100 p-2 rounded-full mr-3">
                    <FileCheck className="h-5 w-5 text-purple-600" />
                  </div>
                  <h4 className="font-medium">Document Generation</h4>
                </div>
                <p className="text-sm text-gray-600">
                  Generate submission-ready documents formatted according to FDA specifications with
                  just a few clicks.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="steps" className="space-y-6">
            <div className="space-y-4">
              <div className="relative pl-8 pb-8 border-l-2 border-blue-200">
                <div className="absolute left-[-8px] top-0 bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                  1
                </div>
                <h3 className="font-medium text-lg text-blue-800">Create Device Profile</h3>
                <p className="text-gray-600 mt-1 mb-3">
                  Enter detailed information about your medical device, including its name,
                  classification, intended use, and technical specifications.
                </p>
                <div className="bg-blue-50 p-3 rounded-md border border-blue-100 text-sm text-blue-700 flex items-start">
                  <FileText className="h-4 w-4 mr-2 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>
                    This information forms the foundation of your 510(k) submission and will be used
                    throughout the rest of the process.
                  </span>
                </div>
              </div>

              <div className="relative pl-8 pb-8 border-l-2 border-blue-200">
                <div className="absolute left-[-8px] top-0 bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                  2
                </div>
                <h3 className="font-medium text-lg text-blue-800">Find Predicate Devices</h3>
                <p className="text-gray-600 mt-1 mb-3">
                  Search for and select appropriate predicate devices that your device can claim
                  substantial equivalence to.
                </p>
                <div className="bg-blue-50 p-3 rounded-md border border-blue-100 text-sm text-blue-700 flex items-start">
                  <Search className="h-4 w-4 mr-2 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>
                    Our AI system analyzes the FDA database to recommend suitable predicates based
                    on your device attributes.
                  </span>
                </div>
              </div>

              <div className="relative pl-8 pb-8 border-l-2 border-blue-200">
                <div className="absolute left-[-8px] top-0 bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                  3
                </div>
                <h3 className="font-medium text-lg text-blue-800">Build Substantial Equivalence</h3>
                <p className="text-gray-600 mt-1 mb-3">
                  Create detailed comparisons between your device and the selected predicate
                  device(s), highlighting similarities and differences.
                </p>
                <div className="bg-blue-50 p-3 rounded-md border border-blue-100 text-sm text-blue-700 flex items-start">
                  <ClipboardCheck className="h-4 w-4 mr-2 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>
                    The substantial equivalence demonstration is the core of your 510(k) submission.
                  </span>
                </div>
              </div>

              <div className="relative pl-8 pb-8 border-l-2 border-blue-200">
                <div className="absolute left-[-8px] top-0 bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                  4
                </div>
                <h3 className="font-medium text-lg text-blue-800">FDA Compliance Check</h3>
                <p className="text-gray-600 mt-1 mb-3">
                  Validate your submission against FDA requirements to ensure completeness and
                  regulatory compliance.
                </p>
                <div className="bg-blue-50 p-3 rounded-md border border-blue-100 text-sm text-blue-700 flex items-start">
                  <FileCheck className="h-4 w-4 mr-2 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>
                    Our system automatically checks for missing information and compliance issues
                    before finalizing your submission.
                  </span>
                </div>
              </div>

              <div className="relative pl-8">
                <div className="absolute left-[-8px] top-0 bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                  5
                </div>
                <h3 className="font-medium text-lg text-blue-800">Generate FDA Submission</h3>
                <p className="text-gray-600 mt-1 mb-3">
                  Generate the final 510(k) submission package with all required documentation in
                  FDA-compliant format.
                </p>
                <div className="bg-blue-50 p-3 rounded-md border border-blue-100 text-sm text-blue-700 flex items-start">
                  <Download className="h-4 w-4 mr-2 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>
                    Download your completed 510(k) submission package, ready for submission to the
                    FDA.
                  </span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="requirements" className="space-y-6">
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 mb-4">
              <h3 className="text-amber-800 font-medium mb-2 flex items-center">
                <BookOpen className="h-5 w-5 mr-2 text-amber-600" />
                Preparation Materials Needed
              </h3>
              <p className="text-amber-700 text-sm">
                Before starting, gather the following information to streamline your 510(k)
                submission process.
              </p>
            </div>

            <div className="space-y-3">
              <div className="bg-white p-4 rounded-md border">
                <h4 className="font-medium mb-2">Device Information</h4>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                    <span>Complete device name, model number, and classification</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                    <span>Detailed description of device components and functionality</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                    <span>Intended use and indications for use statements</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                    <span>Technology specifications and product code information</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white p-4 rounded-md border">
                <h4 className="font-medium mb-2">Technical Documentation</h4>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                    <span>Testing data and performance specifications</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                    <span>Design and engineering specifications</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                    <span>Material composition and biocompatibility data (if applicable)</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                    <span>Software documentation (if applicable)</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white p-4 rounded-md border">
                <h4 className="font-medium mb-2">Regulatory Information</h4>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                    <span>Manufacturer registration information</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                    <span>Quality system documentation references</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                    <span>Previous regulatory history (if applicable)</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                    <span>Knowledge of potential predicate devices</span>
                  </li>
                </ul>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="space-y-6">
            <div className="bg-white p-5 rounded-lg border shadow-sm">
              <h3 className="text-lg font-medium text-gray-800 mb-4">Typical 510(k) Timeline</h3>

              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="bg-blue-100 rounded-full p-1.5 mr-3 mt-0.5">
                    <div className="bg-blue-600 rounded-full w-2.5 h-2.5"></div>
                  </div>
                  <div>
                    <h4 className="font-medium text-blue-800">Preparation Phase</h4>
                    <p className="text-sm text-gray-600 mt-1">2-4 weeks</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Gathering documentation, creating device profile, and identifying predicates
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="bg-blue-100 rounded-full p-1.5 mr-3 mt-0.5">
                    <div className="bg-blue-600 rounded-full w-2.5 h-2.5"></div>
                  </div>
                  <div>
                    <h4 className="font-medium text-blue-800">
                      Substantial Equivalence Development
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">2-6 weeks</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Creating detailed comparisons to predicate devices and developing supporting
                      evidence
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="bg-blue-100 rounded-full p-1.5 mr-3 mt-0.5">
                    <div className="bg-blue-600 rounded-full w-2.5 h-2.5"></div>
                  </div>
                  <div>
                    <h4 className="font-medium text-blue-800">Testing and Verification</h4>
                    <p className="text-sm text-gray-600 mt-1">4-12 weeks</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Conducting necessary performance testing and validation to support claims
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="bg-blue-100 rounded-full p-1.5 mr-3 mt-0.5">
                    <div className="bg-blue-600 rounded-full w-2.5 h-2.5"></div>
                  </div>
                  <div>
                    <h4 className="font-medium text-blue-800">Submission Preparation</h4>
                    <p className="text-sm text-gray-600 mt-1">2-4 weeks</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Finalizing documentation, conducting compliance checks, and generating
                      submission package
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="bg-blue-100 rounded-full p-1.5 mr-3 mt-0.5">
                    <div className="bg-blue-600 rounded-full w-2.5 h-2.5"></div>
                  </div>
                  <div>
                    <h4 className="font-medium text-blue-800">FDA Review</h4>
                    <p className="text-sm text-gray-600 mt-1">90 days (typical)</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Standard FDA review period for traditional 510(k) submissions
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 bg-amber-50 p-4 rounded-md border border-amber-100">
                <p className="text-sm text-amber-700">
                  <strong>Note:</strong> Timelines may vary based on device complexity, testing
                  requirements, and FDA interactions. Our platform helps streamline the preparation
                  process to minimize delays.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:space-x-4 mt-6">
          <div className="flex items-center mb-4 sm:mb-0">
            <div className="flex items-center space-x-1 text-blue-600">
              <span className="text-xs">
                {currentTab === 'overview'
                  ? '1'
                  : currentTab === 'steps'
                    ? '2'
                    : currentTab === 'requirements'
                      ? '3'
                      : '4'}
              </span>
              <span className="text-xs">/</span>
              <span className="text-xs">4</span>
            </div>
            <div className="flex space-x-1 ml-3">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                disabled={currentTab === 'overview'}
                onClick={() => {
                  if (currentTab === 'steps') setCurrentTab('overview');
                  else if (currentTab === 'requirements') setCurrentTab('steps');
                  else if (currentTab === 'timeline') setCurrentTab('requirements');
                }}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                disabled={currentTab === 'timeline'}
                onClick={() => {
                  if (currentTab === 'overview') setCurrentTab('steps');
                  else if (currentTab === 'steps') setCurrentTab('requirements');
                  else if (currentTab === 'requirements') setCurrentTab('timeline');
                }}
              >
                Next
              </Button>
            </div>
          </div>
          <Button onClick={onContinue} className="bg-green-600 hover:bg-green-700 text-white">
            Begin 510(k) Process
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WelcomeDialog;
