// ROICalculator.jsx - Interactive ROI calculator for marketing leads
import React, { useState } from 'react';
import { Link } from 'wouter';
import { ChevronLeft, Calculator, DollarSign, Clock, Users } from 'lucide-react';

export default function ROICalculator() {
  const [formData, setFormData] = useState({
    teamSize: 5,
    hourlyRate: 150,
    annualSubmissions: 4,
    regulatoryHours: 400,
  });

  const [showResults, setShowResults] = useState(false);

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: Number(value),
    }));
  };

  const handleSubmit = e => {
    e.preventDefault();
    setShowResults(true);
  };

  // Calculate ROI metrics
  const calculateMetrics = () => {
    const { teamSize, hourlyRate, annualSubmissions, regulatoryHours } = formData;

    // Current costs (without TrialSage)
    const currentAnnualCost = teamSize * hourlyRate * regulatoryHours * annualSubmissions;

    // Estimated savings with TrialSage (60% efficiency gain)
    const hoursWithTrialSage = regulatoryHours * 0.4; // 60% reduction
    const costWithTrialSage = teamSize * hourlyRate * hoursWithTrialSage * annualSubmissions;

    // Annual savings
    const annualSavings = currentAnnualCost - costWithTrialSage;

    // Time savings (hours)
    const timeSavings = (regulatoryHours - hoursWithTrialSage) * annualSubmissions;

    // 3-year ROI (assuming $250k annual cost for TrialSage Enterprise)
    const trialSageAnnualCost = 250000;
    const threeYearSavings = annualSavings * 3;
    const threeYearCost = trialSageAnnualCost * 3;
    const threeYearROI = ((threeYearSavings - threeYearCost) / threeYearCost) * 100;

    return {
      currentAnnualCost: formatCurrency(currentAnnualCost),
      costWithTrialSage: formatCurrency(costWithTrialSage),
      annualSavings: formatCurrency(annualSavings),
      timeSavings: Math.round(timeSavings).toLocaleString(),
      threeYearROI: Math.round(threeYearROI),
    };
  };

  const formatCurrency = value => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const metrics = calculateMetrics();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            <ChevronLeft size={16} />
            Back to Home
          </Link>
        </div>

        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">TrialSage ROI Calculator</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-8">
            See how much time and budget you can save with TrialSage's AI-powered regulatory
            automation.
          </p>

          <div className="bg-white dark:bg-slate-800 shadow-md rounded-lg p-6 mb-8">
            <form onSubmit={handleSubmit}>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 mb-2">
                    <Users size={16} className="inline mr-1" />
                    Regulatory Team Size
                  </label>
                  <input
                    type="number"
                    name="teamSize"
                    value={formData.teamSize}
                    onChange={handleChange}
                    min="1"
                    max="100"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 mb-2">
                    <DollarSign size={16} className="inline mr-1" />
                    Average Hourly Rate (USD)
                  </label>
                  <input
                    type="number"
                    name="hourlyRate"
                    value={formData.hourlyRate}
                    onChange={handleChange}
                    min="50"
                    max="500"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 mb-2">
                    <Clock size={16} className="inline mr-1" />
                    Hours Per Submission
                  </label>
                  <input
                    type="number"
                    name="regulatoryHours"
                    value={formData.regulatoryHours}
                    onChange={handleChange}
                    min="100"
                    max="2000"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 mb-2">
                    <Calculator size={16} className="inline mr-1" />
                    Annual Submissions
                  </label>
                  <input
                    type="number"
                    name="annualSubmissions"
                    value={formData.annualSubmissions}
                    onChange={handleChange}
                    min="1"
                    max="50"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-slate-700"
                  />
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Calculate ROI
                </button>
              </div>
            </form>
          </div>

          {showResults && (
            <div className="bg-white dark:bg-slate-800 shadow-md rounded-lg p-6 border-t-4 border-emerald-500">
              <h2 className="text-2xl font-bold mb-6">Your Potential Savings</h2>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="bg-gray-50 dark:bg-slate-700 p-4 rounded">
                  <h3 className="text-lg font-medium mb-1">Current Annual Cost</h3>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {metrics.currentAnnualCost}
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-slate-700 p-4 rounded">
                  <h3 className="text-lg font-medium mb-1">Cost with TrialSage</h3>
                  <p className="text-3xl font-bold text-emerald-600">{metrics.costWithTrialSage}</p>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded border border-emerald-200 dark:border-emerald-800">
                  <h3 className="text-lg font-medium mb-1 text-emerald-700 dark:text-emerald-300">
                    Annual Savings
                  </h3>
                  <p className="text-3xl font-bold text-emerald-600">{metrics.annualSavings}</p>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded border border-emerald-200 dark:border-emerald-800">
                  <h3 className="text-lg font-medium mb-1 text-emerald-700 dark:text-emerald-300">
                    Hours Saved Annually
                  </h3>
                  <p className="text-3xl font-bold text-emerald-600">{metrics.timeSavings} hours</p>
                </div>
              </div>

              <div className="bg-emerald-100 dark:bg-emerald-900/30 p-6 rounded-lg border border-emerald-200 dark:border-emerald-800 text-center">
                <h3 className="text-xl font-medium mb-2 text-emerald-800 dark:text-emerald-200">
                  3-Year ROI
                </h3>
                <p className="text-5xl font-bold text-emerald-600">{metrics.threeYearROI}%</p>
                <p className="mt-2 text-emerald-700 dark:text-emerald-300">
                  Return on Investment over 3 years
                </p>
              </div>

              <div className="mt-8 text-center">
                <Link
                  href="/demo"
                  className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Schedule a Demo
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
