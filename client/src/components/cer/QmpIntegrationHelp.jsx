import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InfoIcon, CheckCircleIcon, AlertTriangleIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import CerTooltipWrapper from './CerTooltipWrapper';

/**
 * QmpIntegrationHelp Component
 *
 * This component provides detailed help information about the integration of
 * Quality Management Plan (QMP) with ICH E6(R3) principles throughout the CER process.
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} [props.className] - Additional CSS classes
 * @param {boolean} [props.isDialogOpen] - Control dialog open state externally
 * @param {function} [props.setIsDialogOpen] - Function to update dialog state externally
 * @param {string} [props.focusSection] - Specific section to highlight (e.g., 'regulatory-traceability')
 */
const QmpIntegrationHelp = ({
  className = '',
  isDialogOpen,
  setIsDialogOpen,
  focusSection = '',
}) => {
  // State for dialog if not controlled externally
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);

  // Use external state if provided, otherwise use internal state
  const dialogOpen = isDialogOpen !== undefined ? isDialogOpen : internalDialogOpen;
  const setDialogOpen = setIsDialogOpen || setInternalDialogOpen;

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={`flex items-center gap-2 ${className}`}
          title="Learn about QMP and ICH E6(R3) integration"
        >
          <InfoIcon size={16} />
          <span>QMP Integration Guide</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2 text-[#d97757]">
            <InfoIcon size={20} />
            Quality Management Plan Integration
          </DialogTitle>
          <DialogDescription className="text-base">
            Learn how ICH E6(R3) quality principles are integrated throughout the CER process
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Alert className="mb-6 bg-blue-50 border-blue-200">
            <InfoIcon className="h-5 w-5 text-blue-500" />
            <AlertTitle className="text-blue-700">
              ICH E6(R3) Risk-Based Quality Management
            </AlertTitle>
            <AlertDescription className="text-blue-600">
              ICH E6(R3) introduces a paradigm shift to risk-based, technology-enabled quality
              management. This integration ensures compliance with both EU MDR requirements and
              quality standards.
            </AlertDescription>
          </Alert>

          <h3 className="font-semibold text-lg mb-2">Integration Throughout CER Process</h3>
          <p className="mb-4 text-gray-700">
            The Quality Management Plan is woven into every phase of the CER process, from data
            ingestion through AI generation, compliance checking, preview, export, and post-market
            maintenance.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-md flex items-center gap-2">
                  <CheckCircleIcon size={16} className="text-green-500" />
                  Critical-to-Quality Factors
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm">
                <p>
                  CtQ factors are identified for each CER component, ensuring a risk-based approach
                  to quality that aligns with ICH E6(R3) principles.
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-md flex items-center gap-2">
                  <CheckCircleIcon size={16} className="text-blue-500" />
                  Risk Assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm">
                <p>
                  Each section's risk profile is evaluated against regulatory requirements, with
                  mitigation strategies implemented at every stage.
                </p>
              </CardContent>
            </Card>
          </div>

          <Accordion
            type="single"
            collapsible
            className="mb-6"
            defaultValue={
              focusSection === 'regulatory-traceability' ? 'traceability-matrix' : undefined
            }
          >
            <AccordionItem value="ich-principles">
              <AccordionTrigger className="text-[#d97757]">
                ICH E6(R3) Key Principles
              </AccordionTrigger>
              <AccordionContent>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Risk-Based Approach:</strong> Focus quality management efforts where
                    they matter most
                  </li>
                  <li>
                    <strong>Critical-to-Quality:</strong> Identify factors essential to reliability
                    and regulatory compliance
                  </li>
                  <li>
                    <strong>Systematic Risk Management:</strong> Proactively identify, evaluate, and
                    control risks
                  </li>
                  <li>
                    <strong>Technology Enablement:</strong> Leverage AI and automation with
                    appropriate controls
                  </li>
                  <li>
                    <strong>Data Integrity:</strong> Ensure data reliability throughout the clinical
                    evaluation process
                  </li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="integration-points">
              <AccordionTrigger className="text-[#d97757]">QMP Integration Points</AccordionTrigger>
              <AccordionContent>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Data Ingestion:</strong> Validated connections to FDA FAERS, literature,
                    and clinical data sources
                  </li>
                  <li>
                    <strong>AI Content Generation:</strong> Verification of AI outputs against
                    regulatory standards
                  </li>
                  <li>
                    <strong>Compliance Checking:</strong> Automated validation with ICH E6(R3) and
                    EU MDR requirements
                  </li>
                  <li>
                    <strong>Document Preview:</strong> Real-time quality indicators and compliance
                    scoring
                  </li>
                  <li>
                    <strong>Export:</strong> Full audit trail and quality attestation included in
                    final documents
                  </li>
                  <li>
                    <strong>Post-Market:</strong> Continuous monitoring of new evidence against
                    established assessments
                  </li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="traceability-matrix"
              className={
                focusSection === 'regulatory-traceability'
                  ? 'bg-blue-50 border border-blue-200 rounded-md'
                  : ''
              }
            >
              <AccordionTrigger className="text-[#d97757]">
                Regulatory Traceability Matrix
              </AccordionTrigger>
              <AccordionContent>
                <div className={focusSection === 'regulatory-traceability' ? 'p-2' : ''}>
                  <p className="mb-3">
                    The Regulatory Traceability Matrix is a critical component of the Quality
                    Management Plan that ensures continuous alignment between clinical evidence and
                    regulatory requirements throughout the CER lifecycle.
                  </p>

                  <h4 className="font-semibold text-[#d97757] mb-2 mt-4">Key Features</h4>
                  <ul className="list-disc pl-6 space-y-2 mb-4">
                    <li>
                      <strong>Bidirectional Mapping:</strong> Links each evidence piece to specific
                      regulatory requirements (GSPR, EU MDR, etc.)
                    </li>
                    <li>
                      <strong>Risk-Based Indicators:</strong> Visual cues identify high-risk areas
                      requiring additional evidence
                    </li>
                    <li>
                      <strong>ICH E6(R3) Alignment:</strong> Implements Critical-to-Quality factors
                      for each regulatory requirement
                    </li>
                    <li>
                      <strong>Gap Analysis:</strong> Real-time identification of evidence gaps
                      requiring additional data
                    </li>
                    <li>
                      <strong>Compliance Scoring:</strong> Quantitative assessment of overall
                      regulatory readiness
                    </li>
                  </ul>

                  <div className="bg-white p-3 border border-gray-200 rounded-md mb-4">
                    <h4 className="font-semibold text-[#d97757] mb-2">Technical Implementation</h4>
                    <p className="mb-2">
                      The Regulatory Traceability Matrix leverages several advanced capabilities:
                    </p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>GPT-4o-powered evidence mapping and classification</li>
                      <li>Real-time API connections to regulatory databases</li>
                      <li>Bidirectional synchronization with CER document sections</li>
                      <li>Audit trail of all evidence-to-requirement mappings</li>
                    </ul>
                  </div>

                  <div className="bg-amber-50 p-3 border border-amber-200 rounded-md">
                    <h4 className="font-semibold text-amber-700 mb-2">Usage Guidance</h4>
                    <p className="text-amber-800">
                      The Regulatory Traceability Matrix should be continuously updated throughout
                      the CER development process. Review the matrix before finalizing any CER to
                      ensure complete regulatory coverage.
                    </p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="technical-details">
              <AccordionTrigger className="text-[#d97757]">
                Technical Implementation
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-3">
                  The QMP principles are implemented through several key technical components:
                </p>

                <div className="space-y-2">
                  <div className="flex items-start">
                    <Badge className="mt-1 mr-2 bg-[#d97757]">API</Badge>
                    <span>Enhanced endpoints with ICH E6(R3) validation controls</span>
                  </div>

                  <div className="flex items-start">
                    <Badge className="mt-1 mr-2 bg-[#d97757]">AI</Badge>
                    <span>
                      GPT-4o integration specifically tuned for regulatory writing with quality
                      controls
                    </span>
                  </div>

                  <div className="flex items-start">
                    <Badge className="mt-1 mr-2 bg-[#d97757]">Validation</Badge>
                    <span>Real-time compliance checking with ICH E6(R3) and MDR requirements</span>
                  </div>

                  <div className="flex items-start">
                    <Badge className="mt-1 mr-2 bg-[#d97757]">UI</Badge>
                    <span>Microsoft 365-aligned interface with quality indicators throughout</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="benefits">
              <AccordionTrigger className="text-[#d97757]">Benefits for Users</AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border border-gray-200">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Regulatory Compliance</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm">
                      <p>
                        Simultaneous compliance with both EU MDR 2017/745 and ICH E6(R3) quality
                        requirements
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border border-gray-200">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Submission Readiness</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm">
                      <p>
                        Documents prepared to withstand rigorous Notified Body scrutiny with quality
                        evidence
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border border-gray-200">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Risk Reduction</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm">
                      <p>
                        Systematic identification and mitigation of documentation and compliance
                        risks
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border border-gray-200">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Time Efficiency</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm">
                      <p>Automated quality checks reduce manual review cycles and rework</p>
                    </CardContent>
                  </Card>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Alert className="mb-4 bg-amber-50 border-amber-200">
            <AlertTriangleIcon className="h-5 w-5 text-amber-500" />
            <AlertTitle className="text-amber-700">Important Consideration</AlertTitle>
            <AlertDescription className="text-amber-600">
              While the ICH E6(R3) integration automates many quality controls, human oversight
              remains essential. Always review AI-generated content and validation results.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QmpIntegrationHelp;
