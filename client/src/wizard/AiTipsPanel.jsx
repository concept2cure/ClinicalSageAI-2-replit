/**
 * AiTipsPanel Component
 *
 * AI-generated tips and guidance for each step of the IND Wizard 3.0
 * With regulatory-purple theme and dark mode support
 */

import { useState, useEffect } from 'react';
import { Lightbulb, ChevronUp, ChevronDown } from 'lucide-react'
import clsx from 'clsx';

export default function AiTipsPanel({ step }) {
  const [expanded, setExpanded] = useState(true);
  const [tips, setTips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    // Fetch AI tips for the current step
    fetch(`/api/ai/tips?step=${step}`)
      .then(r => r.json())
      .then(data => {
        setTips(data.tips || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching AI tips:', err);
        // Fallback data based on step
        const fallbackTips = getFallbackTips(step);
        setTips(fallbackTips);
        setLoading(false);
      });
  }, [step]);

  // Toggle panel expansion
  const toggleExpanded = () => setExpanded(!expanded);

  return (
    <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div
        className="bg-gradient-to-r from-regulatory-50 to-regulatory-100/70 dark:from-regulatory-900/30 dark:to-regulatory-800/20 p-4 flex items-center justify-between cursor-pointer"
        onClick={toggleExpanded}
      >
        <div className="flex items-center">
          <Lightbulb size={18} className="text-regulatory-600 dark:text-regulatory-400 mr-2" />
          <h3 className="font-medium">Executive AI Insights</h3>
        </div>
        <button className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {expanded && (
        <div className="p-4">
          {loading ? (
            <div className="animate-pulse flex space-x-4">
              <div className="flex-1 space-y-4 py-1">
                <div className="h-4 bg-regulatory-100 dark:bg-regulatory-900/30 rounded w-3/4"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-regulatory-100 dark:bg-regulatory-900/30 rounded"></div>
                  <div className="h-4 bg-regulatory-100 dark:bg-regulatory-900/30 rounded w-5/6"></div>
                </div>
              </div>
            </div>
          ) : tips.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-2">
              No insights available for this step
            </p>
          ) : (
            <ul className="space-y-3">
              {tips.map((tip, index) => (
                <li key={index} className="text-sm">
                  <div className="flex items-start">
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-regulatory-100 dark:bg-regulatory-900/40 text-regulatory-800 dark:text-regulatory-200 text-xs mr-2 mt-0.5">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{tip.title}</p>
                      <p className="text-gray-600 dark:text-gray-300 mt-1">{tip.description}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Fallback tips by step if API fails
function getFallbackTips(step) {
  const tipsByStep = [
    // Step 0: Initial Planning
    [
      {
        title: 'Complete Pre-IND meeting request',
        description:
          'Submit the meeting request form at least 60 days before your desired meeting date to discuss your development plan with the FDA.',
      },
      {
        title: 'Prepare a target product profile (TPP)',
        description:
          'A well-defined TPP helps align your development program with your therapeutic goals and regulatory strategy.',
      },
      {
        title: 'Outline your development timeline',
        description:
          'Map out key milestones from pre-IND through Phase 1 to help manage resources and set realistic expectations.',
      },
    ],
    // Step 1: Nonclinical Data
    [
      {
        title: 'Include both GLP and non-GLP studies',
        description:
          'While pivotal toxicology studies should be GLP-compliant, include relevant non-GLP studies to support your overall safety assessment.',
      },
      {
        title: 'Address dosing rationale clearly',
        description:
          'Provide strong scientific justification for your first-in-human dosing based on nonclinical findings and safety margins.',
      },
      {
        title: 'Consider specialized studies based on indication',
        description:
          'For oncology products, include specialized assessments like genotoxicity or cardiac safety studies that are indication-specific.',
      },
    ],
    // Step 2: CMC Data
    [
      {
        title: 'Focus on batch consistency',
        description:
          'Demonstrate consistency between your toxicology, clinical, and stability batches with appropriate analytical testing.',
      },
      {
        title: 'Include stability data projections',
        description:
          'Provide stability data and projected shelf-life with justification based on accelerated and real-time testing.',
      },
      {
        title: 'Detail analytical methods validation status',
        description:
          'Clearly state the validation status of all analytical methods with a timeline for full validation if not yet complete.',
      },
    ],
    // Step 3: Clinical Protocol
    [
      {
        title: 'Define clear primary endpoints',
        description:
          'Ensure your primary endpoints are specific, measurable, and directly related to your study objectives.',
      },
      {
        title: 'Include robust safety monitoring plan',
        description:
          "Detail safety monitoring procedures, stopping rules, and the data monitoring committee's role if applicable.",
      },
      {
        title: 'Address special populations',
        description:
          'Clearly define inclusion/exclusion criteria with scientific rationale, especially for vulnerable populations.',
      },
    ],
    // Step 4: Investigator Brochure
    [
      {
        title: 'Summarize key findings concisely',
        description:
          "Present nonclinical and clinical data in a way that's easily understood by investigators without technical background.",
      },
      {
        title: 'Highlight potential risks clearly',
        description:
          'Include a dedicated section on potential risks to subjects with monitoring guidance for investigators.',
      },
      {
        title: 'Include detailed dosing instructions',
        description:
          'Provide clear dosing instructions, preparation details, and administration guidance for clinical sites.',
      },
    ],
    // Step 5: FDA Forms
    [
      {
        title: 'Double-check FDA Form 1571 completeness',
        description:
          'Ensure all sections are complete and consistent with your submission package, particularly the contents section.',
      },
      {
        title: 'Verify investigator credentials',
        description:
          'Confirm all Form 1572s are complete with current CV and medical licenses for each listed investigator.',
      },
      {
        title: 'Include comprehensive cover letter',
        description:
          'Your cover letter should succinctly summarize your development program and highlight any special considerations.',
      },
    ],
    // Step 6: Final Assembly
    [
      {
        title: 'Follow the CTD format structure',
        description:
          'Organize your submission according to the Common Technical Document (CTD) format for consistency with regulatory expectations.',
      },
      {
        title: 'Include hyperlinked table of contents',
        description:
          'Create a detailed, hyperlinked table of contents to help reviewers navigate your submission efficiently.',
      },
      {
        title: 'Run final QC check on submission',
        description:
          'Perform a comprehensive quality check for consistency, completeness, and formatting before final submission.',
      },
    ],
  ];

  return tipsByStep[step] || [];
}
