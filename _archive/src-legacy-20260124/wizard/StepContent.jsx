/**
 * StepContent Component
 *
 * Main content for each step of the IND Wizard 2.0
 */

import { useState, useEffect } from 'react';
import AiTipsPanel from './AiTipsPanel.jsx';
import UploadValidateCard from './UploadValidateCard.jsx';

const titles = [
  'Initial Planning & Pre‑IND',
  'Nonclinical Data Collection',
  'CMC Data',
  'Clinical Protocol',
  'Investigator Brochure',
  'FDA Forms',
  'Final Assembly & Submission',
];

const descriptions = [
  'Plan your Pre-IND meeting and assemble initial development strategy documents.',
  'Upload and organize nonclinical study reports including toxicology and pharmacology data.',
  'Compile Chemistry, Manufacturing, and Controls documentation for your drug substance and product.',
  'Develop your Phase 1 clinical protocol(s) with study design, endpoints, and safety monitoring.',
  "Create the Investigator's Brochure with relevant preclinical and clinical information.",
  'Complete required FDA forms including Form 1571 (IND Application) and attachments.',
  'Review, finalize, and prepare your complete IND submission package.',
];

export default function StepContent({ step, onOpenDrawer }) {
  const [stepData, setStepData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    // Fetch data for the current step
    fetch(`/api/ind/steps/${step}`)
      .then(r => r.json())
      .then(data => {
        setStepData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(`Error fetching data for step ${step}:`, err);
        setStepData(null);
        setLoading(false);
      });
  }, [step]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold">{titles[step]}</h2>
        <p className="text-gray-600 dark:text-gray-300 mt-1">{descriptions[step]}</p>
      </div>

      <UploadValidateCard step={step} onOpenDrawer={onOpenDrawer} />

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded"></div>
          <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-5/6"></div>
        </div>
      ) : (
        <>
          {/* Step-specific content could be rendered here based on stepData */}
          {stepData && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
              <h3 className="text-lg font-medium mb-3">Step Progress</h3>

              {/* This would be populated with step-specific content */}
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {stepData.completedItems?.length > 0 ? (
                  <ul className="space-y-2">
                    {stepData.completedItems.map((item, i) => (
                      <li key={i} className="flex items-center">
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 mr-2">
                          ✓
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Begin this step by uploading relevant documents above.</p>
                )}
              </div>
            </div>
          )}

          <AiTipsPanel step={step} />
        </>
      )}

      {step === 6 && (
        <div className="mt-8 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-5">
          <h3 className="text-lg font-medium text-green-800 dark:text-green-200 mb-2">
            Ready for Submission
          </h3>
          <p className="text-green-700 dark:text-green-300 mb-4">
            Your IND is ready for final review and submission to the FDA.
          </p>
          <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors">
            Generate Complete IND Package
          </button>
        </div>
      )}
    </div>
  );
}
