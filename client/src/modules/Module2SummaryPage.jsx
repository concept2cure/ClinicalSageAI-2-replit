// /client/src/modules/Module2SummaryPage.jsx

import { useState } from 'react';
import IntroSummaryForm from '../components/ind-wizard/IntroSummaryForm';
import OverallQualitySummaryForm from '../components/ind-wizard/OverallQualitySummaryForm';
import NonclinicalOverviewUploader from '../components/ind-wizard/NonclinicalOverviewUploader';
import ClinicalOverviewUploader from '../components/ind-wizard/ClinicalOverviewUploader';
import WrittenTabulatedSummaryUploader from '../components/ind-wizard/WrittenTabulatedSummaryUploader';
import UploadStatusTrackerModule2 from '../components/ind-wizard/UploadStatusTrackerModule2';
import Module2NextButton from '../components/ind-wizard/Module2NextButton';
import InfoTooltipModule2 from '../components/ind-wizard/InfoTooltipModule2';
import AdvisorSidebarV3 from '../components/advisor/AdvisorSidebarV3';

export default function Module2SummaryPage() {
  // Form status state to track completion of each section
  const [formStatus, setFormStatus] = useState({
    introSummary: false,
    overallQualitySummary: false,
    nonclinicalOverview: false,
    clinicalOverview: false,
    writtenTabulatedSummaries: false,
  });

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center">
          CTD Module 2: Common Technical Document Summaries
          <InfoTooltipModule2 />
        </h1>
        <p className="text-gray-600">
          Module 2 contains the summaries of Modules 3, 4, and 5. It includes the overall Quality
          Summary, Nonclinical Overview, Clinical Overview, and detailed Written and Tabulated
          Summaries.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <IntroSummaryForm setFormStatus={setFormStatus} />
          <OverallQualitySummaryForm setFormStatus={setFormStatus} />
          <NonclinicalOverviewUploader setFormStatus={setFormStatus} />
          <ClinicalOverviewUploader setFormStatus={setFormStatus} />
          <WrittenTabulatedSummaryUploader setFormStatus={setFormStatus} />
          <Module2NextButton formStatus={formStatus} />
        </div>

        <div className="md:col-span-1">
          <div className="sticky top-6 space-y-6">
            <UploadStatusTrackerModule2 formStatus={formStatus} />

            <div className="bg-white rounded-lg shadow-md p-4">
              <h3 className="font-semibold mb-3">Module 2 Guidance</h3>
              <div className="text-sm text-gray-600 space-y-4">
                <p>
                  The CTD Module 2 presents scientific information in summary documents. It bridges
                  detailed technical reports with high-level overviews needed by regulatory
                  reviewers.
                </p>
                <div>
                  <strong>Required components:</strong>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li>Introduction (M2.1)</li>
                    <li>Quality Overall Summary (M2.3)</li>
                    <li>Nonclinical Overview (M2.4)</li>
                  </ul>
                </div>
                <div className="mt-2">
                  <strong>Optional for some INDs:</strong>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li>Clinical Overview (M2.5)</li>
                    <li>Written Summaries (M2.6)</li>
                    <li>Tabulated Summaries (M2.7)</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* AI Regulatory Advisor */}
            <AdvisorSidebarV3 />
          </div>
        </div>
      </div>
    </div>
  );
}
