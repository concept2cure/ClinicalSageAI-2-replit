import React, { useState } from 'react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

export default function GatedSalesInvestorAssets() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = e => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid work email.');
      return;
    }
    // TODO: integrate with CRM / marketing automation
    setSubmitted(true);
  };

  // Helper function to get icon based on file extension
  const getFileIconClass = link => {
    if (link.endsWith('.pdf')) return '📄';
    if (link.endsWith('.docx')) return '📝';
    if (link.endsWith('.xlsx')) return '📊';
    if (link.endsWith('.json')) return '📋';
    if (link.endsWith('.pptx')) return '📈';
    return '📚';
  };

  const resourcesByCategory = [
    {
      category: 'AI Solutions Toolkit',
      color: 'bg-blue-600',
      description:
        'Deployment guides and API documentation for our AI-powered regulatory intelligence tools.',
      items: [
        {
          title: 'AI Integration Guide',
          link: '/downloads/ai-integration-guide.pdf',
          type: 'Guide',
        },
        {
          title: 'Custom AI Agent Playbook',
          link: '/downloads/ai-agent-playbook.pdf',
          type: 'Playbook',
        },
        {
          title: 'Semantic Search API Reference',
          link: '/downloads/semantic-search-api.pdf',
          type: 'API Docs',
        },
      ],
    },
    {
      category: 'IND Solutions Suite',
      color: 'bg-green-600',
      description:
        'Essential tools and templates for successful IND submissions and regulatory compliance.',
      items: [
        {
          title: 'eCTD Submission Blueprint',
          link: '/downloads/ectd-blueprint.pdf',
          type: 'Blueprint',
        },
        {
          title: 'IND Gap Analysis Template',
          link: '/downloads/ind-gap-template.xlsx',
          type: 'Template',
        },
        {
          title: 'Regulatory Checklist & Workflows',
          link: '/downloads/regulatory-checklist.pdf',
          type: 'Checklist',
        },
      ],
    },
    {
      category: 'CER Solutions Package',
      color: 'bg-purple-600',
      description:
        'Templates and guides for building compliant Clinical Evaluation Reports for medical devices.',
      items: [
        { title: 'MDR/IVDR CER Template', link: '/downloads/cer-template.docx', type: 'Template' },
        {
          title: 'Literature Review Guide',
          link: '/downloads/lit-review-guide.pdf',
          type: 'Guide',
        },
        {
          title: 'Benefit-Risk Rationale Examples',
          link: '/downloads/benefit-risk-examples.pdf',
          type: 'Examples',
        },
      ],
    },
    {
      category: 'CSR Intelligence Engine Assets',
      color: 'bg-orange-600',
      description:
        'Technical documentation and visualization tools for our CSR intelligence platform.',
      items: [
        {
          title: 'CSR Semantic Data Model',
          link: '/downloads/csr-data-model.json',
          type: 'Data Model',
        },
        {
          title: 'Dashboard Demo Slides',
          link: '/downloads/dashboard-demo.pptx',
          type: 'Presentation',
        },
        { title: 'CSR Extraction API Docs', link: '/downloads/csr-api-docs.pdf', type: 'API Docs' },
      ],
    },
  ];

  return (
    <div className="font-sans bg-gray-50 min-h-screen py-20">
      <Container>
        <div className="text-center mb-12">
          <h1 className="text-5xl font-extrabold text-gray-900 mb-4">TrialSage Resource Hub</h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Comprehensive resources for biotech and pharmaceutical experts to accelerate regulatory
            success.
          </p>
        </div>

        {!submitted ? (
          <div className="max-w-2xl mx-auto bg-white p-12 rounded-2xl shadow-lg border border-gray-100">
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4">
              Access Premium Solution Resources
            </h2>
            <p className="mb-6 text-gray-700 text-lg">
              Enter your corporate email to unlock in-depth guides, templates, and API references
              for our AI, IND, CER, and CSR Intelligence solutions—crafted for biotech innovators.
            </p>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  className="w-full px-4 py-3 border-gray-300 rounded-lg"
                />
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
              >
                Unlock All Resources
              </Button>
            </form>
            <p className="mt-8 text-center text-sm text-gray-500">
              Your email remains private and secure.
            </p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white p-8 rounded-2xl shadow-md border border-gray-100">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Your Premium Resources</h2>
              <p className="text-gray-600 mb-6">
                Thank you for your interest in TrialSage. Access all resources below by clicking on
                each category.
              </p>

              <div className="space-y-6">
                {resourcesByCategory.map((cat, idx) => (
                  <Accordion
                    key={idx}
                    type="single"
                    collapsible
                    className="border rounded-xl overflow-hidden"
                  >
                    <AccordionItem value={cat.category} className="border-0">
                      <AccordionTrigger
                        className={`px-5 py-4 text-white rounded-t-lg hover:no-underline ${cat.color}`}
                      >
                        <div className="flex flex-col items-start text-left">
                          <h3 className="text-xl font-bold">{cat.category}</h3>
                          <p className="text-sm font-normal mt-1 opacity-90">{cat.description}</p>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="bg-white p-4">
                        <ul className="divide-y divide-gray-100">
                          {cat.items.map((res, i) => (
                            <li key={i} className="py-3 flex items-center justify-between">
                              <div className="flex items-center">
                                <span className="text-xl mr-2">{getFileIconClass(res.link)}</span>
                                <div className="ml-3">
                                  <p className="text-gray-800 font-medium">{res.title}</p>
                                  <p className="text-gray-500 text-sm">{res.type}</p>
                                </div>
                              </div>
                              <a
                                href={res.link}
                                className="flex items-center text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1 rounded-lg transition-colors"
                                download
                              >
                                <span className="text-sm mr-1">⬇️</span>
                                <span>Download</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                ))}
              </div>
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}
