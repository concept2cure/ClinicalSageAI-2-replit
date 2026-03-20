import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Zap } from 'lucide-react';

// Check mark component
const CheckMark = ({ type = 'full' }) => {
  if (type === 'full') {
    return <CheckCircle size={20} className="text-emerald-500 inline-flex" />;
  } else if (type === 'partial') {
    return <AlertCircle size={20} className="text-amber-500 inline-flex" />;
  } else {
    return <XCircle size={20} className="text-gray-300 dark:text-gray-600 inline-flex" />;
  }
};

// Feature Row component
const FeatureRow = ({ label, values, isHighlighted = false }) => (
  <tr className={isHighlighted ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}>
    <td className="py-3 px-4 font-medium text-left">{label}</td>
    {values.map((value, i) => (
      <td key={i} className="py-3 px-4 text-center">
        {typeof value === 'string' ? (
          value
        ) : (
          <div className="flex justify-center">
            <CheckMark type={value} />
          </div>
        )}
      </td>
    ))}
  </tr>
);

// Main Competitor Comparison Component
const CompetitorComparison = ({ t }) => {
  // Define headers - the first one is TrialSage, followed by competitors
  const tableHeaders = [
    { name: 'TrialSage', isHighlighted: true },
    { name: t('Traditional CRO') },
    { name: t('Document Portal') },
    { name: t('Regulatory Software') },
  ];

  // Define features and their values for each competitor
  // Values can be: "full", "partial", "none", or a string for pricing
  const features = [
    {
      label: t('CSR Library'),
      values: ['full', 'none', 'partial', 'none'],
    },
    {
      label: t('CER Generation'),
      values: ['full', 'none', 'none', 'partial'],
    },
    {
      label: t('FAERS Integration'),
      values: ['full', 'none', 'none', 'none'],
    },
    {
      label: t('eCTD Compliant'),
      values: ['full', 'none', 'none', 'full'],
    },
    {
      label: t('AI Insights'),
      values: ['full', 'none', 'none', 'partial'],
    },
    {
      label: t('Protocol Design'),
      values: ['full', 'partial', 'none', 'none'],
    },
    {
      label: t('Pricing'),
      values: ['$$$', '$$$$$', '$$', '$$$$'],
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-white dark:bg-slate-900">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            {t('Comparison with Traditional Solutions')}
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            {t(
              'See how TrialSage compares to traditional solutions in the clinical intelligence space.'
            )}
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl shadow-lg border border-gray-100 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white">
                <th className="py-4 px-4 text-left font-medium">{t('Features')}</th>
                {tableHeaders.map((header, i) => (
                  <th
                    key={i}
                    className={`py-4 px-4 text-center font-medium ${header.isHighlighted ? 'relative' : ''}`}
                  >
                    {header.isHighlighted && (
                      <div className="absolute top-0 right-0 left-0 -translate-y-1/2 flex justify-center">
                        <span className="bg-amber-400 text-amber-800 text-[11px] px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                          <Zap size={10} strokeWidth={3} /> {t('RECOMMENDED')}
                        </span>
                      </div>
                    )}
                    {header.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {features.map((feature, i) => (
                <FeatureRow
                  key={i}
                  label={feature.label}
                  values={feature.values}
                  isHighlighted={false}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-center mt-8 text-sm text-gray-500 dark:text-gray-400 italic">
          {t('Based on public information and customer feedback as of April 2025')}
        </div>
      </div>
    </section>
  );
};

export default CompetitorComparison;
