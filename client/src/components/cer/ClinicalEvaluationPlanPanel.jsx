import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ClipboardList,
  BookMarked,
  FilePlus2,
  CheckSquare,
  AlertCircle,
  Info,
  CalendarClock,
  FileCheck,
  FolderOpen,
  FileText,
} from 'lucide-react';
import CerTooltipWrapper from './CerTooltipWrapper';

// GSPRs based on MDR
const GSPRs = [
  {
    id: '1',
    title: 'GSPR 1 - General safety and performance',
    description:
      'Devices shall achieve their intended performance and be designed and manufactured in such a way that, during normal conditions of use, they are suitable for their intended purpose.',
  },
  {
    id: '2',
    title: 'GSPR 2 - Risk reduction',
    description:
      'The manufacturer shall establish, implement, document and maintain a risk management system.',
  },
  {
    id: '3',
    title: 'GSPR 3 - Risk control measures',
    description:
      'Devices shall be designed and manufactured in such a way that they remove or reduce risks as far as possible through safe design and manufacture.',
  },
  {
    id: '4',
    title: 'GSPR 4 - Product lifetime and stability',
    description:
      'The characteristics and performance of a device shall not be adversely affected to such a degree that the health or safety of the patient or user is compromised during the lifetime of the device.',
  },
  {
    id: '5a',
    title: 'GSPR 5a - Transport and storage',
    description:
      'Devices shall be designed, manufactured and packaged in such a way that their characteristics and performance during their intended use are not adversely affected during transport and storage.',
  },
  {
    id: '5b',
    title: 'GSPR 5b - Environmental conditions',
    description:
      'Consideration of the environment must account for temperature, humidity, pressure, light exposure, etc.',
  },
  {
    id: '6',
    title: 'GSPR 6 - Comparison to similar devices',
    description:
      'Any performance or safety requirements shall be comparable to state-of-the-art solutions generally accepted as safe and effective.',
  },
  {
    id: '7',
    title: 'GSPR 7 - Chemical, physical, and biological properties',
    description:
      'Devices shall be designed and manufactured in such a way as to ensure the characteristics and performance requirements referred to in risk reduction regarding compatibility with materials.',
  },
  {
    id: '8',
    title: 'GSPR 8 - Infection and microbial contamination',
    description:
      'Devices and manufacturing processes shall be designed in such a way as to eliminate or reduce as far as possible the risk of infection to patients, users, and third parties.',
  },
  {
    id: '10.1',
    title: 'GSPR 10.1 - Devices with a measuring function',
    description:
      'Devices with a primary analytical measuring function shall be designed and manufactured in such a way as to provide appropriate analytical performance in accordance with Annex I Section 9.1(a) of MDR.',
  },
  {
    id: '10.3',
    title: 'GSPR 10.3 - Protection against radiation',
    description:
      'Devices shall be designed and manufactured in such a way that exposure of patients, users and other persons to radiation is reduced as far as possible.',
  },
  {
    id: '11',
    title: 'GSPR 11 - Protection against electrical, mechanical, and thermal risks',
    description:
      'Devices shall be designed and manufactured in such a way as to protect patients and users against mechanical risks connected with, for example, resistance to movement, instability and moving parts.',
  },
  {
    id: '14',
    title: 'GSPR 14 - Clinical evaluation requirements',
    description:
      'Demonstration of conformity with the general safety and performance requirements shall include a clinical evaluation in accordance with Article 61 of MDR.',
  },
  {
    id: '14.1',
    title: 'GSPR 14.1 - Clinical investigations',
    description:
      'Clinical investigations shall be performed in accordance with MDR Annex XV on an equivalent or similar device to obtain data regarding safety and performance, including clinical benefits.',
  },
  {
    id: '14.2',
    title: 'GSPR 14.2 - Clinical evidence',
    description:
      'Clinical evidence must be sufficient to demonstrate compliance with relevant GSPRs when the device is used as intended by the manufacturer.',
  },
  {
    id: '14.3',
    title: 'GSPR 14.3 - Clinical benefits',
    description:
      'Demonstration of clinical benefit must be based on available clinical data relevant to the intended purpose, target population, and performance of the device.',
  },
  {
    id: '23',
    title: 'GSPR 23 - Information supplied by the manufacturer',
    description:
      'Each device shall be accompanied by information needed to identify the device and manufacturer, safety and performance information for the user or patient, and information on risks, warnings, and precautions.',
  },
];

export default function ClinicalEvaluationPlanPanel({
  deviceName = '',
  manufacturer = '',
  initialData = null,
  cerData = {},
  onUpdateCEP = () => {},
}) {
  const defaultCEPData = {
    deviceName: deviceName,
    manufacturer: manufacturer,
    modelNumbers: '',
    deviceDescription: '',
    intendedPurpose: '',
    targetPopulation: '',
    clinicalBenefits: '',
    riskProfile: '',
    safetyQuestions: '',
    performanceQuestions: '',
    riskBenefitQuestions: '',
    useClinicalInvestigations: false,
    usePMCF: false,
    useLiterature: true,
    useRegistries: false,
    useComplaints: true,
    useNonClinical: false,
    useEquivalentDevices: false,
    equivalentDeviceDetails: '',
    selectedGSPRs: ['1', '2', '3', '14', '14.2'],
    gspr_justifications: {},
    literatureSearchStrategy: '',
    dataAnalysisMethods: '',
    clinicalEvaluationTeam: '',
    evaluationCriteria: '',
    // Base MDR Annex XIV compliance fields
    deviceClass: '',
    mdrClassificationRule: '',
    referenceStandards: '',
    stateOfArt: '',

    // CER Update Schedule fields
    updateFrequency: 'Annual',
    nextUpdateDate: '',
    updateCriteria: '',
    enableReminders: false,
    reminderLeadTime: '30',
    reminderRecipients: '',

    // PMCF Plan fields (MDCG 2020-7 compliant)
    pmcfPlan: '',
    pmcfJustification: '',
    highRiskDevice: false,
    pmcfObjectives: '',
    pmcfMethods: '',
    pmcfDataAnalysis: '',
    pmcfIndicators: '',
    pmcfTimelines: '',
    pmcfReportFrequency: 'Annual',
    firstPmcfReportDate: '',

    // PMCF Related Documents
    pmcfPlanDocId: '',
    psurReference: '',
    referenceDocuments: '',

    // Other fields
    clinicalDataGaps: '',
    summaryOfSafetyAndPerformance: '',
    alternativePMS: '',
    exemptionReferences: '',
  };

  const [cepData, setCepData] = useState(initialData || defaultCEPData);
  const [changes, setChanges] = useState(false);

  // Update data when props change
  useEffect(() => {
    if (initialData) {
      setCepData(initialData);
    } else if (deviceName !== cepData.deviceName || manufacturer !== cepData.manufacturer) {
      setCepData(prev => ({
        ...prev,
        deviceName: deviceName || prev.deviceName,
        manufacturer: manufacturer || prev.manufacturer,
      }));
    }
  }, [initialData, deviceName, manufacturer]);

  // Handle field changes
  const handleChange = (field, value) => {
    setCepData(prev => ({
      ...prev,
      [field]: value,
    }));
    setChanges(true);
  };

  // Handle GSPR selection
  const handleGsprSelection = gsprId => {
    setCepData(prev => {
      const selected = [...prev.selectedGSPRs];
      const index = selected.indexOf(gsprId);

      if (index >= 0) {
        selected.splice(index, 1);
      } else {
        selected.push(gsprId);
      }

      return {
        ...prev,
        selectedGSPRs: selected,
      };
    });
    setChanges(true);
  };

  // Handle GSPR justification change
  const handleJustificationChange = (gsprId, justification) => {
    setCepData(prev => ({
      ...prev,
      gspr_justifications: {
        ...prev.gspr_justifications,
        [gsprId]: justification,
      },
    }));
    setChanges(true);
  };

  // Save/update the CEP
  const handleSave = (linkToCER = false) => {
    onUpdateCEP(cepData, linkToCER);
    setChanges(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#141413]">Clinical Evaluation Plan</h2>
          <p className="text-[#6b6963] mt-1">
            Document the clinical evaluation methodology according to MEDDEV 2.7/1 Rev 4 and MDR
            requirements.
          </p>
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            className="border-[#292524] text-[#292524] hover:bg-[#faf0ec]"
            onClick={() => handleSave(false)}
            disabled={!changes}
          >
            Save Draft
          </Button>
          <CerTooltipWrapper
            tooltipContent="Add this CEP as a dedicated section in your CER document. This creates a structured Clinical Evaluation Plan section that documents your evaluation methodology."
            whyThisMatters="A comprehensive CEP is required by MEDDEV 2.7/1 Rev 4. It demonstrates a systematic approach to clinical evaluation and helps regulatory reviewers understand your evaluation methodology."
          >
            <Button
              className="bg-[#292524] hover:bg-[#1c1917] text-white"
              onClick={() => handleSave(true)}
            >
              <ClipboardList className="h-4 w-4 mr-2" />
              Add to CER
            </Button>
          </CerTooltipWrapper>
        </div>
      </div>

      <Card className="border-[#e8e6dc]">
        <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
          <CardTitle className="text-lg text-[#141413]">Device Information</CardTitle>
          <CardDescription>Basic information about the device being evaluated</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="device-name" className="text-[#141413]">
                Device Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="device-name"
                value={cepData.deviceName}
                onChange={e => handleChange('deviceName', e.target.value)}
                placeholder="Enter device name"
                className="border-[#e8e6dc]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manufacturer" className="text-[#141413]">
                Manufacturer <span className="text-red-500">*</span>
              </Label>
              <Input
                id="manufacturer"
                value={cepData.manufacturer}
                onChange={e => handleChange('manufacturer', e.target.value)}
                placeholder="Enter manufacturer"
                className="border-[#e8e6dc]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-numbers" className="text-[#141413]">
              Model Numbers / Part Numbers
            </Label>
            <Input
              id="model-numbers"
              value={cepData.modelNumbers}
              onChange={e => handleChange('modelNumbers', e.target.value)}
              placeholder="Enter model numbers or product codes"
              className="border-[#e8e6dc]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="device-description" className="text-[#141413]">
              Device Description
            </Label>
            <Textarea
              id="device-description"
              value={cepData.deviceDescription}
              onChange={e => handleChange('deviceDescription', e.target.value)}
              placeholder="Provide a comprehensive description of the device"
              className="border-[#e8e6dc] h-24"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#e8e6dc]">
        <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
          <CardTitle className="text-lg text-[#141413]">Scope of the Clinical Evaluation</CardTitle>
          <CardDescription>Define the scope and focus of the clinical evaluation</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="intended-purpose" className="text-[#141413]">
              Intended Purpose <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="intended-purpose"
              value={cepData.intendedPurpose}
              onChange={e => handleChange('intendedPurpose', e.target.value)}
              placeholder="Describe the exact medical purpose intended for this device"
              className="border-[#e8e6dc] h-20"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-population" className="text-[#141413]">
              Target Population
            </Label>
            <Textarea
              id="target-population"
              value={cepData.targetPopulation}
              onChange={e => handleChange('targetPopulation', e.target.value)}
              placeholder="Detail the patient populations for which the device is intended"
              className="border-[#e8e6dc] h-20"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clinical-benefits" className="text-[#141413]">
              Clinical Benefits
            </Label>
            <Textarea
              id="clinical-benefits"
              value={cepData.clinicalBenefits}
              onChange={e => handleChange('clinicalBenefits', e.target.value)}
              placeholder="List the primary and secondary clinical benefits to be demonstrated"
              className="border-[#e8e6dc] h-20"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="risk-profile" className="text-[#141413]">
              Risk Profile
            </Label>
            <Textarea
              id="risk-profile"
              value={cepData.riskProfile}
              onChange={e => handleChange('riskProfile', e.target.value)}
              placeholder="Summarize key risks that will be evaluated"
              className="border-[#e8e6dc] h-20"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#e8e6dc]">
        <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
          <CardTitle className="text-lg text-[#141413]">
            Clinical Questions to be Addressed
          </CardTitle>
          <CardDescription>
            Define key clinical questions that will guide the evaluation
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="safety-questions" className="text-[#141413]">
              Safety Questions <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="safety-questions"
              value={cepData.safetyQuestions}
              onChange={e => handleChange('safetyQuestions', e.target.value)}
              placeholder="What safety questions must be addressed? (e.g., 'What is the adverse event profile?')"
              className="border-[#e8e6dc] h-24"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="performance-questions" className="text-[#141413]">
              Performance Questions <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="performance-questions"
              value={cepData.performanceQuestions}
              onChange={e => handleChange('performanceQuestions', e.target.value)}
              placeholder="What performance questions must be addressed? (e.g., 'Does the device achieve its intended technical performance?')"
              className="border-[#e8e6dc] h-24"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="risk-benefit-questions" className="text-[#141413]">
              Risk-Benefit Questions
            </Label>
            <Textarea
              id="risk-benefit-questions"
              value={cepData.riskBenefitQuestions}
              onChange={e => handleChange('riskBenefitQuestions', e.target.value)}
              placeholder="What risk-benefit questions must be addressed? (e.g., 'Does the clinical benefit outweigh the risks?')"
              className="border-[#e8e6dc] h-24"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#e8e6dc]">
        <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
          <CardTitle className="text-lg text-[#141413]">
            Data Sources for Clinical Evaluation
          </CardTitle>
          <CardDescription>Select data sources that will be used in the evaluation</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="use-clinical-investigations"
                  checked={cepData.useClinicalInvestigations}
                  onCheckedChange={checked => handleChange('useClinicalInvestigations', checked)}
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="use-clinical-investigations"
                    className="text-[#141413] font-medium cursor-pointer"
                  >
                    Clinical Investigations
                  </Label>
                  <p className="text-[#6b6963] text-sm">
                    Studies specifically conducted for this device
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="use-pmcf"
                  checked={cepData.usePMCF}
                  onCheckedChange={checked => handleChange('usePMCF', checked)}
                />
                <div className="space-y-1">
                  <Label htmlFor="use-pmcf" className="text-[#141413] font-medium cursor-pointer">
                    Post-Market Clinical Follow-up
                  </Label>
                  <p className="text-[#6b6963] text-sm">PMCF studies and reports</p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="use-literature"
                  checked={cepData.useLiterature}
                  onCheckedChange={checked => handleChange('useLiterature', checked)}
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="use-literature"
                    className="text-[#141413] font-medium cursor-pointer"
                  >
                    Scientific Literature
                  </Label>
                  <p className="text-[#6b6963] text-sm">Published studies and papers</p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="use-registries"
                  checked={cepData.useRegistries}
                  onCheckedChange={checked => handleChange('useRegistries', checked)}
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="use-registries"
                    className="text-[#141413] font-medium cursor-pointer"
                  >
                    Registry Data
                  </Label>
                  <p className="text-[#6b6963] text-sm">Data from device registries</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="use-complaints"
                  checked={cepData.useComplaints}
                  onCheckedChange={checked => handleChange('useComplaints', checked)}
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="use-complaints"
                    className="text-[#141413] font-medium cursor-pointer"
                  >
                    Complaints & Vigilance
                  </Label>
                  <p className="text-[#6b6963] text-sm">Post-market surveillance data</p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="use-non-clinical"
                  checked={cepData.useNonClinical}
                  onCheckedChange={checked => handleChange('useNonClinical', checked)}
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="use-non-clinical"
                    className="text-[#141413] font-medium cursor-pointer"
                  >
                    Non-Clinical Studies
                  </Label>
                  <p className="text-[#6b6963] text-sm">Lab tests, bench testing, animal studies</p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="use-equivalent-devices"
                  checked={cepData.useEquivalentDevices}
                  onCheckedChange={checked => handleChange('useEquivalentDevices', checked)}
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="use-equivalent-devices"
                    className="text-[#141413] font-medium cursor-pointer"
                  >
                    Equivalent Device Data
                  </Label>
                  <p className="text-[#6b6963] text-sm">Clinical data from equivalent devices</p>
                </div>
              </div>
            </div>
          </div>

          {cepData.useEquivalentDevices && (
            <div className="mt-4 space-y-2">
              <Label htmlFor="equivalent-device-details" className="text-[#141413]">
                Equivalent Device Details
              </Label>
              <Textarea
                id="equivalent-device-details"
                value={cepData.equivalentDeviceDetails}
                onChange={e => handleChange('equivalentDeviceDetails', e.target.value)}
                placeholder="Describe the equivalent devices and justify their equivalence"
                className="border-[#e8e6dc] h-24"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[#e8e6dc]">
        <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
          <CardTitle className="text-lg text-[#141413]">
            GSPRs to be Addressed in the Clinical Evaluation
          </CardTitle>
          <CardDescription>
            Select which General Safety and Performance Requirements will be addressed through
            clinical evaluation
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="bg-[#f4f3ee] p-4 rounded border border-[#e8e6dc] mb-4">
            <div className="flex items-start space-x-3">
              <Info className="h-5 w-5 text-[#292524] mt-0.5" />
              <div>
                <h4 className="text-[#141413] font-medium">GSPR Selection Guidance</h4>
                <p className="text-[#6b6963] text-sm">
                  Select all GSPRs that require clinical evidence for demonstration of conformity.
                  For each selected GSPR, provide the approach for how clinical data will be used to
                  demonstrate conformity.
                </p>
              </div>
            </div>
          </div>

          <Accordion type="multiple" className="w-full">
            {GSPRs.map(gspr => (
              <AccordionItem value={gspr.id} key={gspr.id} className="border-b border-[#e8e6dc]">
                <div className="flex items-center">
                  <Checkbox
                    id={`gspr-${gspr.id}`}
                    checked={cepData.selectedGSPRs.includes(gspr.id)}
                    onCheckedChange={() => handleGsprSelection(gspr.id)}
                    className="mr-2 ml-1"
                  />
                  <AccordionTrigger className="hover:no-underline py-4 flex-1">
                    <span className="font-medium text-[#141413]">{gspr.title}</span>
                  </AccordionTrigger>
                </div>
                <AccordionContent className="px-6 pb-4">
                  <div className="space-y-3">
                    <p className="text-[#6b6963]">{gspr.description}</p>

                    {cepData.selectedGSPRs.includes(gspr.id) && (
                      <div className="space-y-2 pt-2">
                        <Label htmlFor={`justification-${gspr.id}`} className="text-[#141413]">
                          Clinical Evaluation Approach
                        </Label>
                        <Textarea
                          id={`justification-${gspr.id}`}
                          value={cepData.gspr_justifications[gspr.id] || ''}
                          onChange={e => handleJustificationChange(gspr.id, e.target.value)}
                          placeholder="Describe how clinical data will be used to demonstrate conformity with this GSPR"
                          className="border-[#e8e6dc] h-24"
                        />
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <Card className="border-[#e8e6dc]">
        <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
          <CardTitle className="text-lg text-[#141413]">Methods</CardTitle>
          <CardDescription>
            Define the methodology for data collection, analysis, and evaluation
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="literature-search-strategy" className="text-[#141413]">
              Literature Search Strategy
            </Label>
            <Textarea
              id="literature-search-strategy"
              value={cepData.literatureSearchStrategy}
              onChange={e => handleChange('literatureSearchStrategy', e.target.value)}
              placeholder="Describe the literature search methodology including databases, search terms, inclusion/exclusion criteria"
              className="border-[#e8e6dc] h-24"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="data-analysis-methods" className="text-[#141413]">
              Data Analysis Methods
            </Label>
            <Textarea
              id="data-analysis-methods"
              value={cepData.dataAnalysisMethods}
              onChange={e => handleChange('dataAnalysisMethods', e.target.value)}
              placeholder="Describe the methods for analyzing clinical data, including statistical approaches if applicable"
              className="border-[#e8e6dc] h-24"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clinical-evaluation-team" className="text-[#141413]">
              Clinical Evaluation Team
            </Label>
            <Textarea
              id="clinical-evaluation-team"
              value={cepData.clinicalEvaluationTeam}
              onChange={e => handleChange('clinicalEvaluationTeam', e.target.value)}
              placeholder="List the individuals involved in the clinical evaluation and their qualifications"
              className="border-[#e8e6dc] h-24"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="evaluation-criteria" className="text-[#141413]">
              Evaluation Criteria
            </Label>
            <Textarea
              id="evaluation-criteria"
              value={cepData.evaluationCriteria}
              onChange={e => handleChange('evaluationCriteria', e.target.value)}
              placeholder="Describe the criteria that will be used to determine if the clinical evidence is sufficient"
              className="border-[#e8e6dc] h-24"
            />
          </div>

          <div className="mt-6 border-t border-gray-200 pt-4">
            <div className="flex items-center mb-2">
              <h3 className="text-md font-semibold text-[#141413]">
                Post-Market Clinical Follow-up (PMCF) Plan
              </h3>
              <CerTooltipWrapper
                tooltipContent="PMCF is a continuous process to update the clinical evaluation, required under EU MDR Annex XIV Part B and MDCG 2020-7"
                whyThisMatters="MDR requires manufacturers to actively and systematically gather clinical data on device use in the real-world setting after market introduction"
              >
                <Info className="h-4 w-4 ml-2 text-gray-500" />
              </CerTooltipWrapper>
            </div>

            <div className="bg-[#faf0ec] p-3 rounded mb-4 text-sm">
              <div className="flex items-start space-x-2">
                <FileCheck className="h-4 w-4 text-[#292524] mt-0.5" />
                <p className="text-[#292524]">
                  The PMCF Plan is a mandatory document for EU MDR compliance and should align with
                  MDCG 2020-7 requirements.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="use-pmcf"
                  checked={cepData.usePMCF}
                  onCheckedChange={checked => handleChange('usePMCF', checked)}
                />
                <Label htmlFor="use-pmcf" className="text-sm text-[#141413]">
                  PMCF is required for this device
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="high-risk-device"
                  checked={cepData.highRiskDevice || false}
                  onCheckedChange={checked => handleChange('highRiskDevice', checked)}
                />
                <Label htmlFor="high-risk-device" className="text-sm text-[#141413]">
                  This is a high-risk device (Class III or implantable)
                </Label>
              </div>
            </div>

            <div className="border border-[#e8e6dc] rounded-md bg-white mb-5">
              <div className="p-3 bg-[#faf9f5] border-b border-[#e8e6dc] flex items-center justify-between">
                <div className="flex items-center">
                  <CalendarClock className="h-4 w-4 text-[#292524] mr-2" />
                  <h4 className="text-sm font-medium text-[#141413]">CER Update Schedule</h4>
                </div>
                <CerTooltipWrapper
                  tooltipContent="Under EU MDR, the CER must be a 'living document' that is updated throughout the device lifecycle"
                  whyThisMatters="Regular CER updates are essential for maintaining regulatory compliance and ensuring continued device safety and performance"
                >
                  <Info className="h-4 w-4 text-[#6b6963]" />
                </CerTooltipWrapper>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="update-frequency" className="text-sm text-[#141413]">
                      CER Update Frequency
                      <span className="text-xs text-[#292524] ml-1">*</span>
                    </Label>
                    <Select
                      value={cepData.updateFrequency}
                      onValueChange={value => handleChange('updateFrequency', value)}
                    >
                      <SelectTrigger className="border-[#e8e6dc] h-9">
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Biannual">Every 6 months</SelectItem>
                        <SelectItem value="Annual">Annual</SelectItem>
                        <SelectItem value="Biennial">Every 2 years</SelectItem>
                        <SelectItem value="AnnualWithThreshold">
                          Annual (if threshold criteria met)
                        </SelectItem>
                        <SelectItem value="Other">Other (specify in plan)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="next-update-date" className="text-sm text-[#141413]">
                      Next Scheduled Update
                      <span className="text-xs text-[#292524] ml-1">*</span>
                    </Label>
                    <Input
                      id="next-update-date"
                      type="date"
                      value={cepData.nextUpdateDate || ''}
                      onChange={e => handleChange('nextUpdateDate', e.target.value)}
                      className="border-[#e8e6dc] h-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="update-criteria" className="text-sm text-[#141413]">
                    Criteria Triggering Unscheduled Updates
                  </Label>
                  <Textarea
                    id="update-criteria"
                    value={cepData.updateCriteria || ''}
                    onChange={e => handleChange('updateCriteria', e.target.value)}
                    placeholder="E.g., new safety signals, significant changes in benefit-risk ratio, substantial changes to the device..."
                    className="border-[#e8e6dc] h-16 text-sm"
                  />
                </div>

                <div className="bg-[#F5F5F5] p-3 rounded-md">
                  <div className="flex items-center justify-between mb-2">
                    <Label
                      htmlFor="enable-reminders"
                      className="flex items-center text-sm text-[#141413] cursor-pointer"
                    >
                      <div className="flex items-center mr-2">
                        <Checkbox
                          id="enable-reminders"
                          checked={cepData.enableReminders || false}
                          onCheckedChange={checked => handleChange('enableReminders', checked)}
                          className="mr-2"
                        />
                        Enable Update Reminders
                      </div>
                      <Badge
                        variant="outline"
                        className="ml-1 bg-[#E8F5FC] text-[#292524] border-[#85C6E8] px-2 py-0.5"
                      >
                        MDR Recommendation
                      </Badge>
                    </Label>
                  </div>

                  {cepData.enableReminders && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                      <div className="space-y-2">
                        <Label htmlFor="reminder-lead-time" className="text-xs text-[#141413]">
                          Send Reminder (days before deadline)
                        </Label>
                        <Select
                          value={cepData.reminderLeadTime || '30'}
                          onValueChange={value => handleChange('reminderLeadTime', value)}
                        >
                          <SelectTrigger className="border-[#e8e6dc] h-8 text-sm">
                            <SelectValue placeholder="Select days" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="15">15 days</SelectItem>
                            <SelectItem value="30">30 days</SelectItem>
                            <SelectItem value="45">45 days</SelectItem>
                            <SelectItem value="60">60 days</SelectItem>
                            <SelectItem value="90">90 days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reminder-recipients" className="text-xs text-[#141413]">
                          Notification Recipients
                        </Label>
                        <Input
                          id="reminder-recipients"
                          value={cepData.reminderRecipients || ''}
                          onChange={e => handleChange('reminderRecipients', e.target.value)}
                          placeholder="Email addresses (comma separated)"
                          className="border-[#e8e6dc] h-8 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {cepData.usePMCF && (
              <div className="border border-[#e8e6dc] rounded-md bg-white mb-5">
                <div className="p-3 bg-[#faf9f5] border-b border-[#e8e6dc]">
                  <h4 className="text-sm font-medium text-[#141413]">
                    PMCF Plan Components (MDCG 2020-7)
                  </h4>
                </div>
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="pmcf-objectives" className="text-sm text-[#141413]">
                      General & Specific Objectives
                      <span className="text-xs text-[#292524] ml-1">*</span>
                    </Label>
                    <Textarea
                      id="pmcf-objectives"
                      value={cepData.pmcfObjectives || ''}
                      onChange={e => handleChange('pmcfObjectives', e.target.value)}
                      placeholder="Define the objectives of your PMCF activities in line with MDCG 2020-7 (e.g., confirm safety and performance, identify previously unknown side-effects, identify emerging risks...)"
                      className="border-[#e8e6dc] h-20 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pmcf-methods" className="text-sm text-[#141413]">
                      PMCF Methods & Procedures
                      <span className="text-xs text-[#292524] ml-1">*</span>
                    </Label>
                    <Textarea
                      id="pmcf-methods"
                      value={cepData.pmcfMethods || ''}
                      onChange={e => handleChange('pmcfMethods', e.target.value)}
                      placeholder="Describe your specific PMCF methodologies (e.g., patient/user surveys, registry studies, clinical follow-up studies, etc.)"
                      className="border-[#e8e6dc] h-20 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pmcf-data-analysis" className="text-sm text-[#141413]">
                        Data Analysis Methodology
                      </Label>
                      <Textarea
                        id="pmcf-data-analysis"
                        value={cepData.pmcfDataAnalysis || ''}
                        onChange={e => handleChange('pmcfDataAnalysis', e.target.value)}
                        placeholder="Describe how PMCF data will be analyzed, including statistical methodology if applicable"
                        className="border-[#e8e6dc] h-16 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pmcf-indicators" className="text-sm text-[#141413]">
                        Criteria & Indicators
                      </Label>
                      <Textarea
                        id="pmcf-indicators"
                        value={cepData.pmcfIndicators || ''}
                        onChange={e => handleChange('pmcfIndicators', e.target.value)}
                        placeholder="List specific indicators that will be monitored (e.g., adverse event rates, specific clinical outcomes, etc.)"
                        className="border-[#e8e6dc] h-16 text-sm"
                      />
                    </div>
                  </div>

                  <div className="border-t border-dashed border-gray-200 pt-4 mt-4">
                    <h5 className="text-sm font-medium text-[#141413] mb-3 flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-[#292524]" />
                      PMCF Reporting Schedule
                      <Badge
                        variant="outline"
                        className="ml-2 bg-[#FCF4FF] text-[#8F7098] border-[#E6BEEE] px-2 py-0.5 text-xs"
                      >
                        MDCG 2020-7
                      </Badge>
                    </h5>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="space-y-2">
                        <Label htmlFor="pmcf-report-frequency" className="text-xs text-[#141413]">
                          PMCF Report Frequency
                          <span className="text-xs text-[#292524] ml-1">*</span>
                        </Label>
                        <Select
                          value={cepData.pmcfReportFrequency || 'Annual'}
                          onValueChange={value => handleChange('pmcfReportFrequency', value)}
                        >
                          <SelectTrigger className="border-[#e8e6dc] h-8 text-sm">
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Biannual">Every 6 months</SelectItem>
                            <SelectItem value="Annual">Annual</SelectItem>
                            <SelectItem value="Biennial">Every 2 years</SelectItem>
                            <SelectItem value="Other">Other (specify below)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="first-pmcf-report-date" className="text-xs text-[#141413]">
                          First PMCF Report Due
                        </Label>
                        <Input
                          id="first-pmcf-report-date"
                          type="date"
                          value={cepData.firstPmcfReportDate || ''}
                          onChange={e => handleChange('firstPmcfReportDate', e.target.value)}
                          className="border-[#e8e6dc] h-8 text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pmcf-timelines" className="text-sm text-[#141413]">
                        Detailed Timeline & Activities
                        <span className="text-xs text-[#292524] ml-1">*</span>
                      </Label>
                      <Textarea
                        id="pmcf-timelines"
                        value={cepData.pmcfTimelines || ''}
                        onChange={e => handleChange('pmcfTimelines', e.target.value)}
                        placeholder="Specify the detailed timelines for PMCF activities (data collection periods, interim analyses, etc.) and when PMCF evaluation reports will be generated"
                        className="border-[#e8e6dc] h-16 text-sm"
                      />
                    </div>
                  </div>

                  {/* PMCF Reference Documents */}
                  <div className="border-t border-dashed border-gray-200 pt-4 mt-4">
                    <h5 className="text-sm font-medium text-[#141413] mb-3 flex items-center">
                      <FolderOpen className="h-4 w-4 mr-2 text-[#292524]" />
                      Related PMCF Documents
                    </h5>

                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="pmcf-plan-doc-id" className="text-xs text-[#141413]">
                            PMCF Plan Document ID
                          </Label>
                          <Input
                            id="pmcf-plan-doc-id"
                            value={cepData.pmcfPlanDocId || ''}
                            onChange={e => handleChange('pmcfPlanDocId', e.target.value)}
                            placeholder="e.g., PMCF-PLAN-001"
                            className="border-[#e8e6dc] h-8 text-sm"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="psur-ref" className="text-xs text-[#141413]">
                            PSUR Reference
                          </Label>
                          <Input
                            id="psur-ref"
                            value={cepData.psurReference || ''}
                            onChange={e => handleChange('psurReference', e.target.value)}
                            placeholder="e.g., PSUR-2024-001"
                            className="border-[#e8e6dc] h-8 text-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reference-docs" className="text-xs text-[#141413]">
                          Additional Reference Documents
                        </Label>
                        <Textarea
                          id="reference-docs"
                          value={cepData.referenceDocuments || ''}
                          onChange={e => handleChange('referenceDocuments', e.target.value)}
                          placeholder="List any additional documents related to this PMCF plan (e.g., survey templates, registry documentation, etc.)"
                          className="border-[#e8e6dc] h-16 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!cepData.usePMCF && (
              <div className="border border-[#F2C811] bg-[#FFFCE5] rounded-md p-4 space-y-3 mb-5">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-[#141413] mb-1">
                      PMCF Exemption Justification
                    </h4>
                    <p className="text-xs text-[#6b6963] mb-3">
                      According to MDCG 2020-7, PMCF may be exempted only in exceptional cases with
                      a strong scientific justification. Notified Bodies scrutinize these
                      justifications very carefully.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="pmcf-justification"
                    className="text-sm text-[#141413] flex items-center"
                  >
                    Scientific Justification for PMCF Exemption
                    <span className="text-xs text-[#292524] ml-1">*</span>
                  </Label>
                  <Textarea
                    id="pmcf-justification"
                    value={cepData.pmcfJustification}
                    onChange={e => handleChange('pmcfJustification', e.target.value)}
                    placeholder="Provide a detailed scientific justification explaining why PMCF is not required. Reference MDCG 2020-7 specifically and address all related exemption criteria."
                    className="border-[#e8e6dc] h-24 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="alternative-pms" className="text-sm text-[#141413]">
                      Alternative PMS Activities
                    </Label>
                    <Textarea
                      id="alternative-pms"
                      value={cepData.alternativePMS || ''}
                      onChange={e => handleChange('alternativePMS', e.target.value)}
                      placeholder="Describe alternative post-market surveillance activities that will be used instead of PMCF"
                      className="border-[#e8e6dc] h-16 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="exemption-references" className="text-sm text-[#141413]">
                      Supporting References
                    </Label>
                    <Textarea
                      id="exemption-references"
                      value={cepData.exemptionReferences || ''}
                      onChange={e => handleChange('exemptionReferences', e.target.value)}
                      placeholder="List published literature, clinical data or other references supporting the exemption"
                      className="border-[#e8e6dc] h-16 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="border-t border-[#e8e6dc] bg-[#faf9f5] px-6 py-4">
          <div className="flex justify-end space-x-2 w-full">
            <Button
              variant="outline"
              className="border-[#292524] text-[#292524] hover:bg-[#faf0ec]"
              onClick={() => handleSave(false)}
              disabled={!changes}
            >
              Save Draft
            </Button>
            <CerTooltipWrapper
              tooltipContent="Add this CEP as a dedicated section in your CER document. This creates a structured Clinical Evaluation Plan section that documents your evaluation methodology."
              whyThisMatters="A comprehensive CEP is required by MEDDEV 2.7/1 Rev 4. It demonstrates a systematic approach to clinical evaluation and helps regulatory reviewers understand your evaluation methodology."
            >
              <Button
                className="bg-[#292524] hover:bg-[#1c1917] text-white"
                onClick={() => handleSave(true)}
              >
                <ClipboardList className="h-4 w-4 mr-2" />
                Add to CER
              </Button>
            </CerTooltipWrapper>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
