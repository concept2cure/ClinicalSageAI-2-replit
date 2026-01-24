import React, { useState, useEffect } from 'react';
import { Info, ExternalLink, BookOpen, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Comprehensive regulatory terms database
const REGULATORY_TERMS = {
  IND: {
    fullName: 'Investigational New Drug',
    definition:
      'An application filed with FDA for permission to transport and administer an experimental drug to human volunteers.',
    category: 'FDA Application',
    agency: 'FDA',
    examples: ['Phase I clinical trials', 'First-in-human studies'],
    relatedTerms: ['NDA', 'BLA', 'Clinical Trial'],
    guidance: '21 CFR 312',
    complexity: 'intermediate',
  },
  NDA: {
    fullName: 'New Drug Application',
    definition:
      'A comprehensive document submitted to FDA seeking approval to market a new prescription drug in the United States.',
    category: 'FDA Application',
    agency: 'FDA',
    examples: ['Marketing approval applications', 'Post-market surveillance'],
    relatedTerms: ['IND', 'BLA', 'ANDA'],
    guidance: '21 CFR 314',
    complexity: 'advanced',
  },
  BLA: {
    fullName: 'Biologics License Application',
    definition:
      'Application submitted to FDA for approval to market biological products for human use.',
    category: 'FDA Application',
    agency: 'FDA',
    examples: ['Vaccines', 'Blood products', 'Gene therapy'],
    relatedTerms: ['IND', 'NDA', 'Biological product'],
    guidance: '21 CFR 601',
    complexity: 'advanced',
  },
  '510k': {
    fullName: '510(k) Premarket Notification',
    definition:
      'FDA submission required to demonstrate that a medical device is substantially equivalent to a predicate device.',
    category: 'Medical Device',
    agency: 'FDA',
    examples: ['Class II medical devices', 'Predicate comparison'],
    relatedTerms: ['PMA', 'De Novo', 'Substantial equivalence'],
    guidance: '21 CFR 807',
    complexity: 'intermediate',
  },
  PMA: {
    fullName: 'Premarket Approval',
    definition:
      'FDA approval process for Class III medical devices that are life-sustaining or life-supporting.',
    category: 'Medical Device',
    agency: 'FDA',
    examples: ['Implantable pacemakers', 'Heart valves'],
    relatedTerms: ['510k', 'IDE', 'Class III device'],
    guidance: '21 CFR 814',
    complexity: 'advanced',
  },
  ICH: {
    fullName: 'International Council for Harmonisation',
    definition:
      'International body that develops technical guidelines for pharmaceutical product registration.',
    category: 'International Standards',
    agency: 'ICH',
    examples: ['ICH E6 (GCP)', 'ICH M4 (CTD)', 'ICH Q8 (QbD)'],
    relatedTerms: ['CTD', 'GCP', 'Quality by Design'],
    guidance: 'ICH Guidelines',
    complexity: 'intermediate',
  },
  CTD: {
    fullName: 'Common Technical Document',
    definition: 'Standardized format for regulatory submissions to ICH regions (US, EU, Japan).',
    category: 'International Standards',
    agency: 'ICH',
    examples: ['Module 1: Regional Information', 'Module 2: CTD Summaries'],
    relatedTerms: ['eCTD', 'ICH M4', 'Module structure'],
    guidance: 'ICH M4',
    complexity: 'advanced',
  },
  eCTD: {
    fullName: 'Electronic Common Technical Document',
    definition: 'Electronic format specification for regulatory submissions based on the ICH CTD.',
    category: 'Electronic Submission',
    agency: 'ICH',
    examples: ['XML backbone', 'PDF documents', 'Hyperlinks'],
    relatedTerms: ['CTD', 'ICH M8', 'Electronic submission'],
    guidance: 'ICH M8',
    complexity: 'advanced',
  },
  GCP: {
    fullName: 'Good Clinical Practice',
    definition:
      'International ethical and scientific quality standard for designing, conducting, recording and reporting trials.',
    category: 'Clinical Standards',
    agency: 'ICH',
    examples: ['Protocol compliance', 'Data integrity', 'Patient safety'],
    relatedTerms: ['ICH E6', 'Clinical trial', 'Data integrity'],
    guidance: 'ICH E6',
    complexity: 'intermediate',
  },
  GMP: {
    fullName: 'Good Manufacturing Practice',
    definition:
      'Quality assurance system ensuring pharmaceutical products are consistently produced to quality standards.',
    category: 'Manufacturing',
    agency: 'FDA/EMA',
    examples: ['Process validation', 'Quality control', 'Batch records'],
    relatedTerms: ['cGMP', 'Quality system', 'Manufacturing compliance'],
    guidance: '21 CFR 210, 21 CFR 211',
    complexity: 'intermediate',
  },
  PMDA: {
    fullName: 'Pharmaceuticals and Medical Devices Agency',
    definition:
      'Japanese regulatory agency responsible for ensuring safety and efficacy of pharmaceuticals and medical devices.',
    category: 'Regulatory Agency',
    agency: 'PMDA',
    examples: ['J-NDA applications', 'Consultation procedures'],
    relatedTerms: ['MHLW', 'Japanese regulations', 'Asia-Pacific region'],
    guidance: 'Japanese Pharmaceutical Law',
    complexity: 'intermediate',
  },
  EMA: {
    fullName: 'European Medicines Agency',
    definition:
      'EU agency responsible for scientific evaluation, supervision and safety monitoring of medicines.',
    category: 'Regulatory Agency',
    agency: 'EMA',
    examples: ['Centralized procedure', 'MAA submissions'],
    relatedTerms: ['CHMP', 'MAA', 'European Union'],
    guidance: 'EU Regulation 726/2004',
    complexity: 'intermediate',
  },
  CDER: {
    fullName: 'Center for Drug Evaluation and Research',
    definition: 'FDA center responsible for drug regulation and approval in the United States.',
    category: 'FDA Center',
    agency: 'FDA',
    examples: ['Drug approvals', 'Post-market surveillance'],
    relatedTerms: ['CBER', 'CDRH', 'FDA centers'],
    guidance: 'FDA regulations',
    complexity: 'beginner',
  },
  CBER: {
    fullName: 'Center for Biologics Evaluation and Research',
    definition:
      'FDA center regulating biological products including vaccines, blood products, and cellular therapies.',
    category: 'FDA Center',
    agency: 'FDA',
    examples: ['Vaccine approvals', 'Gene therapy regulation'],
    relatedTerms: ['CDER', 'CDRH', 'Biological products'],
    guidance: 'FDA regulations',
    complexity: 'beginner',
  },
  CDRH: {
    fullName: 'Center for Devices and Radiological Health',
    definition:
      'FDA center responsible for medical device regulation and radiological health protection.',
    category: 'FDA Center',
    agency: 'FDA',
    examples: ['Medical device approvals', 'Radiological safety'],
    relatedTerms: ['CDER', 'CBER', 'Medical devices'],
    guidance: 'FDA regulations',
    complexity: 'beginner',
  },
};

// Get complexity color for badges
const getComplexityColor = complexity => {
  switch (complexity) {
    case 'beginner':
      return 'bg-green-100 text-green-800';
    case 'intermediate':
      return 'bg-yellow-100 text-yellow-800';
    case 'advanced':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

// Get agency color for badges
const getAgencyColor = agency => {
  switch (agency) {
    case 'FDA':
      return 'bg-blue-100 text-blue-800';
    case 'EMA':
      return 'bg-purple-100 text-purple-800';
    case 'ICH':
      return 'bg-indigo-100 text-indigo-800';
    case 'PMDA':
      return 'bg-pink-100 text-pink-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const RegulatoryTooltip = ({ term, children, className = '' }) => {
  const [termData, setTermData] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Find term data (case-insensitive)
    const termKey = Object.keys(REGULATORY_TERMS).find(
      key => key.toLowerCase() === term.toLowerCase()
    );

    if (termKey) {
      setTermData(REGULATORY_TERMS[termKey]);
    } else {
      // If term not found, try to fetch from API
      fetchTermDefinition(term);
    }
  }, [term]);

  const fetchTermDefinition = async searchTerm => {
    try {
      const response = await fetch('/api/regulatory/terms/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: searchTerm }),
      });

      if (response.ok) {
        const data = await response.json();
        setTermData(data);
      }
    } catch (error) {
      console.warn('Failed to fetch term definition:', error);
    }
  };

  if (!termData) {
    return children;
  }

  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild>
          <span
            className={`relative inline-block cursor-help border-b border-dotted border-blue-500 hover:border-blue-700 ${className}`}
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
          >
            {children}
            <Info className="inline w-3 h-3 ml-1 text-blue-500" />
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-md p-0 bg-white border shadow-lg"
          sideOffset={5}
        >
          <Card className="border-0 shadow-none">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-gray-900">
                    {termData.fullName}
                  </CardTitle>
                  <div className="flex gap-1 mt-1">
                    <Badge className={getAgencyColor(termData.agency)}>{termData.agency}</Badge>
                    <Badge className={getComplexityColor(termData.complexity)}>
                      {termData.complexity}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => window.open(`/regulatory-glossary?term=${term}`, '_blank')}
                >
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <p className="text-xs text-gray-700 mb-2">{termData.definition}</p>

              {termData.examples && termData.examples.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-gray-800 mb-1">Examples:</p>
                  <ul className="text-xs text-gray-600 list-disc list-inside">
                    {termData.examples.map((example, idx) => (
                      <li key={idx}>{example}</li>
                    ))}
                  </ul>
                </div>
              )}

              {termData.relatedTerms && termData.relatedTerms.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-gray-800 mb-1">Related:</p>
                  <div className="flex flex-wrap gap-1">
                    {termData.relatedTerms.map((relatedTerm, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs px-1 py-0">
                        {relatedTerm}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {termData.guidance && (
                <div className="flex items-center gap-1 text-xs text-blue-600">
                  <BookOpen className="w-3 h-3" />
                  <span>Guidance: {termData.guidance}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Auto-detect and wrap regulatory terms in text
export const RegulatoryTextProcessor = ({ children, className = '' }) => {
  const processText = text => {
    if (typeof text !== 'string') return text;

    // Find all regulatory terms in the text
    const termKeys = Object.keys(REGULATORY_TERMS);
    let processedText = text;

    termKeys.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      processedText = processedText.replace(regex, match => {
        return `<RegulatoryTooltip term="${match}">${match}</RegulatoryTooltip>`;
      });
    });

    return processedText;
  };

  const processChildren = children => {
    if (typeof children === 'string') {
      const termKeys = Object.keys(REGULATORY_TERMS);
      let parts = [children];

      termKeys.forEach(term => {
        const newParts = [];
        parts.forEach(part => {
          if (typeof part === 'string') {
            const regex = new RegExp(`\\b${term}\\b`, 'gi');
            const segments = part.split(regex);
            const matches = part.match(regex) || [];

            for (let i = 0; i < segments.length; i++) {
              if (segments[i]) newParts.push(segments[i]);
              if (matches[i]) {
                newParts.push(
                  <RegulatoryTooltip key={`${term}-${i}`} term={matches[i]}>
                    {matches[i]}
                  </RegulatoryTooltip>
                );
              }
            }
          } else {
            newParts.push(part);
          }
        });
        parts = newParts;
      });

      return parts;
    }

    return children;
  };

  return <div className={className}>{processChildren(children)}</div>;
};

export default RegulatoryTooltip;
