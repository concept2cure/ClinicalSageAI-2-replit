import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { CheckCircle, AlertCircle, FileText, BarChart, ChevronRight } from 'lucide-react';

// Report bundles for each persona
const SUBSCRIPTION_TIERS = [
  {
    id: 'investor',
    name: 'Investor Readiness Suite',
    description:
      'A complete package showing protocol viability, outcome forecast, and risk profile for funding decisions.',
    price: '$4,999',
    features: [
      'Trial design brief (PDF)',
      'Dropout risk forecast',
      'AI-repaired protocol structure',
      'Investor boardroom slides',
    ],
    highlight: true,
    icon: BarChart,
  },
  {
    id: 'biostats',
    name: 'Biostatistics Intelligence Suite',
    description:
      'Detailed modeling outputs, power calculations, and SAP outlines to support statistical justification.',
    price: '$5,999',
    features: [
      'Sample size calculation (XLSX)',
      'Endpoint sensitivity simulation (PDF)',
      'SAP draft (DOCX)',
      'Dropout distribution model (PNG)',
    ],
    highlight: false,
    icon: FileText,
  },
  {
    id: 'regulatory',
    name: 'Regulatory Affairs Intelligence Suite',
    description:
      'Submission-ready modules, compliance scoring, and risk flagging tailored for FDA/EMA alignment.',
    price: '$6,499',
    features: [
      'IND Module 2.5 draft (PDF)',
      'Compliance scorecard (CSV)',
      'Risk flag table (XLSX)',
      'Submission checklist (PDF)',
    ],
    highlight: false,
    icon: CheckCircle,
  },
];

export default function SubscriptionTiers() {
  const [subscriptions, setSubscriptions] = useState(SUBSCRIPTION_TIERS);
  const [selectedTier, setSelectedTier] = useState(null);
  const [reportFiles, setReportFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch report files for a specific persona
  const fetchReportFiles = async personaId => {
    setLoading(true);
    try {
      const response = await apiRequest('GET', `/api/reports/manifest/${personaId}`);
      const data = await response.json();
      setReportFiles(data.files || []);
      setSelectedTier(personaId);
    } catch (error) {
      console.error('Error fetching report files:', error);
      setReportFiles([]);
    } finally {
      setLoading(false);
    }
  };

  // Simulate downloading a report file
  const downloadReport = file => {
    window.open(`/api/reports/download/${selectedTier}/${file}`, '_blank');
  };

  return (
    <div>
      {/* Subscription Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        {subscriptions.map(tier => (
          <Card
            key={tier.id}
            className={`overflow-hidden ${
              tier.highlight
                ? 'border-2 border-primary shadow-lg'
                : 'border border-gray-200 dark:border-gray-800'
            }`}
          >
            <CardHeader className={`${tier.highlight ? 'bg-primary/5' : ''}`}>
              <div className="flex items-center justify-between">
                <tier.icon className="h-8 w-8 text-primary" />
                {tier.highlight && (
                  <span className="px-3 py-1 text-xs font-semibold text-primary bg-primary/10 rounded-full">
                    Popular
                  </span>
                )}
              </div>
              <CardTitle className="text-2xl mt-4">{tier.name}</CardTitle>
              <CardDescription className="text-md mt-2">{tier.description}</CardDescription>
              <div className="mt-4">
                <span className="text-3xl font-bold">{tier.price}</span>
                <span className="text-gray-500 dark:text-gray-400 ml-2">per protocol</span>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <ul className="space-y-3">
                {tier.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 pt-4">
              <Button
                className="w-full"
                variant={tier.highlight ? 'default' : 'outline'}
                onClick={() => fetchReportFiles(tier.id)}
              >
                View Sample Reports
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Report Files Section (shows when a tier is selected) */}
      {selectedTier && (
        <Card className="mb-8 border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="text-2xl">
              {subscriptions.find(t => t.id === selectedTier)?.name} Files
            </CardTitle>
            <CardDescription>
              Preview the intelligence assets available in this package
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 flex justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {reportFiles.length > 0 ? (
                  reportFiles.map((file, index) => (
                    <div
                      key={index}
                      className="p-4 border border-gray-100 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition flex justify-between items-center cursor-pointer"
                      onClick={() => downloadReport(file)}
                    >
                      <div className="flex items-center">
                        <FileText className="h-6 w-6 text-primary mr-3" />
                        <span className="font-medium">{file}</span>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-gray-500 flex flex-col items-center">
                    <AlertCircle className="h-8 w-8 mb-2" />
                    <p>No sample files available for preview.</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Contact Section */}
      <div className="mt-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 md:p-10">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Need a custom intelligence package?</h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-6">
            We offer tailored solutions for Medical Writers, Operations Teams, Principal
            Investigators, and more. Contact our team to discuss your specific needs.
          </p>
          <Button size="lg">Contact Sales Team</Button>
        </div>
      </div>
    </div>
  );
}
