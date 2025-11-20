// /client/src/modules/Module5ClinicalPage.jsx

import { useState } from 'react';
import ClinicalProtocolsUploader from '../components/ind-wizard/ClinicalProtocolsUploader';
import ClinicalStudyReportsUploader from '../components/ind-wizard/ClinicalStudyReportsUploader';
import InvestigatorBrochureUpdatesUploader from '../components/ind-wizard/InvestigatorBrochureUpdatesUploader';
import ClinicalSafetyReportsUploader from '../components/ind-wizard/ClinicalSafetyReportsUploader';
import UploadStatusTrackerModule5 from '../components/ind-wizard/UploadStatusTrackerModule5';
import Module5SubmissionButton from '../components/ind-wizard/Module5SubmissionButton';
import InfoTooltip from '../components/ind-wizard/InfoTooltip';

export default function Module5ClinicalPage() {
  const [formStatus, setFormStatus] = useState({
    clinicalProtocolsUploaded: false,
    clinicalStudyReportsUploaded: false,
    investigatorBrochureUpdatesUploaded: false,
    clinicalSafetyReportsUploaded: false,
  });

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold flex items-center">
        CTD Module 5: Clinical Study Reports
        <InfoTooltip text="Module 5 includes Clinical Study Protocols, Clinical Study Reports (CSRs), updated Investigator Brochures, and Clinical Safety Reports such as DSURs. Required by FDA, EMA, and PMDA for full clinical evaluation before approval." />
      </h1>
      <p className="text-gray-600">
        Upload clinical study protocols, full clinical study reports (CSRs), safety narratives, and
        investigator brochure updates as required by FDA, EMA, and PMDA for regulatory submissions.
      </p>

      <UploadStatusTrackerModule5 formStatus={formStatus} />

      <div className="space-y-8">
        <ClinicalProtocolsUploader setFormStatus={setFormStatus} />
        <ClinicalStudyReportsUploader setFormStatus={setFormStatus} />
        <InvestigatorBrochureUpdatesUploader setFormStatus={setFormStatus} />
        <ClinicalSafetyReportsUploader setFormStatus={setFormStatus} />
      </div>

      <Module5SubmissionButton formStatus={formStatus} />
    </div>
  );
}
