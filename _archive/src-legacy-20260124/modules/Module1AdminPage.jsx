// /client/src/modules/Module1AdminPage.jsx

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Building, Upload, PenLine, Users, ArrowLeft, Brain } from 'lucide-react';

import SponsorInfoForm from '../components/ind-wizard/SponsorInfoForm';
import FDAFormsUploader from '../components/ind-wizard/FDAFormsUploader';
import CoverLetterUploader from '../components/ind-wizard/CoverLetterUploader';
import InvestigatorBrochureUploader from '../components/ind-wizard/InvestigatorBrochureUploader';
import USAgentForm from '../components/ind-wizard/USAgentForm';
import UploadStatusTracker from '../components/ind-wizard/UploadStatusTracker';
import Module1NextButton from '../components/ind-wizard/Module1NextButton';
import LiveFieldMonitor from '../components/ind-wizard/LiveFieldMonitor';
import InfoTooltip from '../components/ind-wizard/InfoTooltip';

export default function Module1AdminPage() {
  // Track the state of various form submissions
  const [formStatus, setFormStatus] = useState({
    sponsorInfo: false,
    fdaFormsUploaded: false,
    coverLetterUploaded: false,
    ibUploaded: false,
    usAgentRequired: false,
    usAgentInfo: false,
  });

  // Track whether the AI advisor is enabled
  const [showAIAdvisor, setShowAIAdvisor] = useState(true);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => window.history.back()}
          className="flex items-center text-gray-600 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          <span>Back to IND Wizard</span>
        </button>

        <button
          onClick={() => setShowAIAdvisor(!showAIAdvisor)}
          className={`flex items-center px-3 py-1.5 rounded text-sm ${
            showAIAdvisor ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
          }`}
        >
          <Brain className="h-4 w-4 mr-1.5" />
          {showAIAdvisor ? 'AI Advisor Active' : 'Enable AI Advisor'}
        </button>
      </div>

      {/* AI Advisor component */}
      {showAIAdvisor && <LiveFieldMonitor formData={formStatus} />}

      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-3/4">
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h1 className="text-2xl font-bold flex items-center mb-2">
              CTD Module 1: Administrative Information
              <InfoTooltip text="Module 1 contains administrative documents like Form FDA 1571, Form FDA 1572, Cover Letters, Investigator Brochures, and U.S. Agent information. These documents provide essential sponsor, contact, and product information required for IND submission compliance with FDA, EMA, and PMDA standards." />
            </h1>
            <p className="text-gray-600">
              Complete all required administrative documents for your IND application.
            </p>
          </div>

          <Tabs defaultValue="sponsor" className="mb-6">
            <TabsList className="w-full bg-gray-100">
              <TabsTrigger value="sponsor" className="flex-1 flex items-center justify-center">
                <Building className="h-4 w-4 mr-2" />
                Sponsor Info
              </TabsTrigger>
              <TabsTrigger value="fda-forms" className="flex-1 flex items-center justify-center">
                <FileText className="h-4 w-4 mr-2" />
                FDA Forms
              </TabsTrigger>
              <TabsTrigger value="cover-letter" className="flex-1 flex items-center justify-center">
                <PenLine className="h-4 w-4 mr-2" />
                Cover Letter
              </TabsTrigger>
              <TabsTrigger
                value="investigator-brochure"
                className="flex-1 flex items-center justify-center"
              >
                <Upload className="h-4 w-4 mr-2" />
                Investigator Brochure
              </TabsTrigger>
              {formStatus.usAgentRequired && (
                <TabsTrigger value="us-agent" className="flex-1 flex items-center justify-center">
                  <Users className="h-4 w-4 mr-2" />
                  US Agent
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="sponsor" className="mt-4">
              <SponsorInfoForm setFormStatus={setFormStatus} />
            </TabsContent>

            <TabsContent value="fda-forms" className="mt-4">
              <FDAFormsUploader setFormStatus={setFormStatus} />
            </TabsContent>

            <TabsContent value="cover-letter" className="mt-4">
              <CoverLetterUploader setFormStatus={setFormStatus} />
            </TabsContent>

            <TabsContent value="investigator-brochure" className="mt-4">
              <InvestigatorBrochureUploader setFormStatus={setFormStatus} />
            </TabsContent>

            {formStatus.usAgentRequired && (
              <TabsContent value="us-agent" className="mt-4">
                <USAgentForm setFormStatus={setFormStatus} />
              </TabsContent>
            )}
          </Tabs>

          <Module1NextButton formStatus={formStatus} />
        </div>

        <div className="w-full md:w-1/4">
          <UploadStatusTracker formStatus={formStatus} />

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 mt-6">
            <h3 className="text-lg font-medium mb-3">Module 1 Guidance</h3>
            <p className="text-sm text-gray-600 mb-3">
              Module 1 contains administrative information and prescribing information required by
              FDA for an IND application.
            </p>
            <ul className="text-sm space-y-2">
              <li className="flex items-start">
                <span className="bg-blue-100 text-blue-800 rounded-full w-5 h-5 flex items-center justify-center mt-0.5 mr-2 flex-shrink-0">
                  1
                </span>
                <span>
                  Complete Sponsor Information first to establish the application identity
                </span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-100 text-blue-800 rounded-full w-5 h-5 flex items-center justify-center mt-0.5 mr-2 flex-shrink-0">
                  2
                </span>
                <span>FDA Forms 1571 and 1572 are required for all IND submissions</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-100 text-blue-800 rounded-full w-5 h-5 flex items-center justify-center mt-0.5 mr-2 flex-shrink-0">
                  3
                </span>
                <span>The Cover Letter should summarize the entire submission</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-100 text-blue-800 rounded-full w-5 h-5 flex items-center justify-center mt-0.5 mr-2 flex-shrink-0">
                  4
                </span>
                <span>
                  The Investigator Brochure provides essential product information to clinical
                  investigators
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
