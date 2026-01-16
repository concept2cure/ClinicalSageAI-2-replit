// UseCaseGallery.jsx (subscription modules version)
import { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Check, Plus, ChevronRight, Star, Users, FileText, Shield, Microscope, PresentationIcon } from 'lucide-react'

const useCases = [
  {
    id: 'biotech-ceo',
    role: 'Emerging Biotech CEO',
    title: 'Strategic Trial Design Package',
    description: 'Design smarter, without expensive CRO services',
    icon: <Star className="h-5 w-5 text-blue-600" />,
    accountability: 'Final signoff on trial design, budget, and investor disclosures.',
    risk: 'Investor rejection, IRB delay, credibility loss.',
    whyBuy: 'Upload protocol → get validated AI protocol + IND + risk map.',
    benefit: 'Replaced 3 consultants. Presented an investor-ready packet in 48 hours.',
    features: [
      'AI Protocol Generator',
      'Investor Presentation Export',
      'Risk Assessment',
      'Budget Optimization',
    ],
    price: '$199/mo',
    popular: true,
    color: 'blue',
  },
  {
    id: 'program-lead',
    role: 'Clinical Program Lead',
    title: 'Execution Excellence Package',
    description: 'Plan for execution, not just approval',
    icon: <Users className="h-5 w-5 text-purple-600" />,
    accountability: 'Timelines, site engagement, dropout management.',
    risk: 'Amendments, enrollment failure, slippage.',
    whyBuy: 'Enter assumptions → predict dropout + simulate screen fail.',
    benefit: 'Fixed dropout in Arm B before it derailed our study.',
    features: [
      'Dropout Prediction',
      'Screen Fail Simulation',
      'Site Selection Insights',
      'Amendment Risk Analysis',
    ],
    price: '$149/mo',
    popular: false,
    color: 'purple',
  },
  {
    id: 'regulatory',
    role: 'Regulatory Affairs Lead',
    title: 'Regulatory Intelligence Package',
    description: 'Own the FDA conversation with confidence',
    icon: <Shield className="h-5 w-5 text-green-600" />,
    accountability: 'Submission quality, traceability, rejection prevention.',
    risk: 'RTFs, FDA 483s, delay letters.',
    whyBuy: 'AI drafts IND 2.5/2.7 + links every element to CSR precedent.',
    benefit: 'This is the only system that predicted what the FDA would push back on.',
    features: [
      'IND Section Generator',
      'CSR Precedent Linking',
      'Regulatory Response Templates',
      'Historical FDA Query Analysis',
    ],
    price: '$179/mo',
    popular: false,
    color: 'green',
  },
  {
    id: 'investigator',
    role: 'Principal Investigator',
    title: 'Scientific Evidence Package',
    description: 'Design rare trials with real evidence',
    icon: <Microscope className="h-5 w-5 text-amber-600" />,
    accountability: 'Ethical justification, power, scientific rigor.',
    risk: 'IRB rejection, underpowered result, publication risk.',
    whyBuy: 'Find molecule-similar CSRs, simulate dropout, autogenerate SAP.',
    benefit: 'Our IRB submission was 3x stronger with real CSR support.',
    features: [
      'Molecule Similarity Search',
      'Statistical Analysis Plan Generator',
      'IRB Submission Support',
      'Publication-Ready Figures',
    ],
    price: '$129/mo',
    popular: false,
    color: 'amber',
  },
  {
    id: 'board-member',
    role: 'Biotech Board Member',
    title: 'Governance & Oversight Package',
    description: 'Demand confidence before greenlighting trials',
    icon: <PresentationIcon className="h-5 w-5 text-indigo-600" />,
    accountability: 'Oversight of clinical credibility + investor confidence.',
    risk: 'Funding poor designs, loss of trust.',
    whyBuy: 'Receive a PDF with design, risk, IND, comparator logic.',
    benefit: 'The entire board voted yes in under 30 minutes.',
    features: [
      'Executive Summary Generator',
      'Confidence Assessment',
      'Comparative Trial Analysis',
      'Decision Support Dashboard',
    ],
    price: '$99/mo',
    popular: false,
    color: 'indigo',
  },
];

export default function UseCaseGallery({ showSubscription = true, compact = false }) {
  const [selectedModules, setSelectedModules] = useState([]);

  const toggleModule = id => {
    if (selectedModules.includes(id)) {
      setSelectedModules(selectedModules.filter(moduleId => moduleId !== id));
    } else {
      setSelectedModules([...selectedModules, id]);
    }
  };

  // Only show 3 modules in compact mode
  const displayedUseCases = compact ? useCases.slice(0, 3) : useCases;

  return (
    <div className="space-y-8">
      {!compact && (
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Role-Based Subscription Modules
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Choose only the modules you need for your specific role. Each module includes
            specialized features designed to solve unique challenges.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayedUseCases.map(uc => (
          <Card
            key={uc.id}
            className={`shadow-md border overflow-hidden transition-all duration-200 ${
              selectedModules.includes(uc.id)
                ? `border-${uc.color}-600 ring-2 ring-${uc.color}-600/20`
                : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
            }`}
          >
            {uc.popular && (
              <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-semibold py-1.5 px-3 text-center">
                MOST POPULAR
              </div>
            )}

            <CardHeader className={`pb-3 pt-6 ${compact ? 'px-5' : 'px-6'}`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  {uc.icon}
                  <h3 className="text-lg font-bold">{uc.role}</h3>
                </div>
                <Badge
                  variant={selectedModules.includes(uc.id) ? 'default' : 'outline'}
                  className="ml-2"
                >
                  {uc.price}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className={`${compact ? 'px-5 pb-4 pt-0' : 'px-6 pb-5 pt-0'} space-y-3`}>
              <p className={`text-base font-semibold text-${uc.color}-600`}>{uc.title}</p>
              <p className="text-sm text-gray-600">{uc.description}</p>

              {!compact && (
                <>
                  <div className="pt-3 space-y-2">
                    <p className="text-sm text-gray-800">
                      ✅ <span className="font-medium">Value proposition:</span> {uc.whyBuy}
                    </p>
                    <p className="text-sm italic text-gray-700">💬 "{uc.benefit}"</p>
                  </div>

                  <div className="pt-3 bg-gray-50 rounded-lg p-3">
                    <p className="text-sm font-medium mb-2">Package Features:</p>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1.5">
                      {uc.features.map((feature, index) => (
                        <li key={index} className="flex items-center text-sm">
                          <Check className={`h-4 w-4 text-${uc.color}-500 mr-2 flex-shrink-0`} />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {compact && (
                <div className="pt-1">
                  <ul className="space-y-1">
                    {uc.features.slice(0, 3).map((feature, index) => (
                      <li key={index} className="flex items-center text-sm">
                        <Check
                          className={`h-3.5 w-3.5 text-${uc.color}-500 mr-1.5 flex-shrink-0`}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                    {uc.features.length > 3 && (
                      <li className="text-sm text-gray-500 pl-5">
                        +{uc.features.length - 3} more features
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </CardContent>

            {showSubscription && (
              <CardFooter className={`${compact ? 'px-5 py-3' : 'px-6 py-4'} bg-gray-50 border-t`}>
                <Button
                  className="w-full"
                  variant={selectedModules.includes(uc.id) ? 'default' : 'outline'}
                  onClick={() => toggleModule(uc.id)}
                  size={compact ? 'sm' : 'default'}
                >
                  {selectedModules.includes(uc.id) ? (
                    <>
                      Subscribed <Check className="ml-2 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Subscribe to Module <Plus className="ml-1.5 h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardFooter>
            )}
          </Card>
        ))}
      </div>

      {showSubscription && selectedModules.length > 0 && (
        <div className="mt-8 p-6 border rounded-lg bg-gradient-to-r from-primary/10 to-blue-500/5 flex flex-col md:flex-row items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-primary">
              Selected Modules: {selectedModules.length}
            </h3>
            <p className="text-gray-600">
              Total Monthly Price:{' '}
              <span className="font-bold">
                $
                {selectedModules.reduce((total, id) => {
                  const module = useCases.find(uc => uc.id === id);
                  return total + parseInt(module.price.replace('$', '').replace('/mo', ''));
                }, 0)}
                /mo
              </span>
            </p>
          </div>
          <Button className="mt-4 md:mt-0" size="lg">
            Complete Subscription <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Show View All button in compact mode */}
      {compact && (
        <div className="flex justify-center mt-6">
          <Button variant="outline" href="/use-cases" className="group">
            View All Subscription Modules
            <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      )}
    </div>
  );
}
