import React, { useState } from 'react';
import { useToast } from '../../hooks/use-toast';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger, } from '@/components/ui/accordion';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, } from '@/components/ui/dialog';
import {
  Loader2, CheckCircle2, ChevronRight, Search, BookOpen, FileText, Download, Plus, Bookmark, ExternalLink, AlertCircle, ChevronDown, BookMarked, RotateCcw, LineChart, Info, HeartPulse, Brain, ShieldCheck, ListChecks, Copy, Filter, Sparkles } from 'lucide-react'

/**
 * Intelligent Endpoint Advisor Component
 *
 * Recommends primary & secondary endpoints based on therapeutic area,
 * historical trial data, CDISC/SDTM mappings, and LOINC/MEDDRA term usage.
 */
const IntelligentEndpointAdvisor = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [resultsFound, setResultsFound] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [selectedEndpoints, setSelectedEndpoints] = useState([]);
  const [activeTab, setActiveTab] = useState('primary');
  const [searchProgress, setSearchProgress] = useState(0);

  // Form state
  const [formData, setFormData] = useState({
    therapeuticArea: '',
    indication: '',
    phase: '',
    populationType: '',
    primaryObjective: '',
    trialDuration: '',
  });

  const { toast } = useToast();

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSearch = () => {
    // Validate required fields
    if (!formData.therapeuticArea || !formData.phase) {
      toast({
        title: 'Missing required information',
        description: 'Please provide at least therapeutic area and phase to search for endpoints.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setSearchProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setSearchProgress(prev => {
        if (prev >= 95) {
          clearInterval(progressInterval);
          return 95;
        }
        return prev + 5;
      });
    }, 200);

    // Simulate search completion after 3 seconds
    setTimeout(() => {
      clearInterval(progressInterval);
      setSearchProgress(100);

      setTimeout(() => {
        setIsLoading(false);
        setResultsFound(true);
        setSearchResults(generateSearchResults(formData));
      }, 500);
    }, 3000);
  };

  const generateSearchResults = criteria => {
    // This would be replaced with actual data from backend API
    const therapeuticArea = criteria.therapeuticArea;
    const phase = criteria.phase;

    // Generate tailored mock data based on the criteria
    const results = {
      primaryEndpoints: [
        {
          id: 'pe1',
          name: getPrimaryEndpointName(therapeuticArea),
          description: `Change from baseline in ${getPrimaryEndpointName(therapeuticArea)} at Week ${criteria.trialDuration || 12}`,
          measurementTool: getMeasurementTool(therapeuticArea),
          frequencyOfUse: '83%',
          sdtmMapping: 'QSSTRESC, QSORRES',
          cdisc: {
            domain: 'QS',
            variable: 'QSSTRESC',
            codelist: 'QSTEST',
            controlledTerminology: 'C123456',
          },
          regulatoryAcceptance: 'High',
          validated: true,
          references: [
            {
              title: `${getPrimaryEndpointName(therapeuticArea)} validation study in ${therapeuticArea}`,
              authors: 'Smith J, et al.',
              journal: 'Journal of Clinical Research',
              year: '2023',
              doi: '10.1000/j.example.2023.01.001',
            },
          ],
          relevantTrials: [
            {
              id: 'NCT03654321',
              title: `Phase ${phase} Study of Treatment X in ${therapeuticArea}`,
              sponsor: 'Pharmaceutical Company A',
              year: '2023',
            },
            {
              id: 'NCT02345678',
              title: `Randomized Trial of Novel Therapy for ${therapeuticArea}`,
              sponsor: 'University Medical Center',
              year: '2022',
            },
          ],
        },
        {
          id: 'pe2',
          name: getAlternativePrimaryEndpoint(therapeuticArea),
          description: `Time to ${getAlternativePrimaryEndpoint(therapeuticArea)} from baseline to Week ${criteria.trialDuration || 12}`,
          measurementTool: getAlternativeMeasurementTool(therapeuticArea),
          frequencyOfUse: '67%',
          sdtmMapping: 'TTSDY, TTSTRESC',
          cdisc: {
            domain: 'TT',
            variable: 'TTSTRESC',
            codelist: 'TTTEST',
            controlledTerminology: 'C234567',
          },
          regulatoryAcceptance: 'Medium',
          validated: true,
          references: [
            {
              title: `${getAlternativePrimaryEndpoint(therapeuticArea)} as an endpoint in ${therapeuticArea} trials`,
              authors: 'Johnson M, et al.',
              journal: 'Clinical Trials',
              year: '2022',
              doi: '10.1000/j.example.2022.12.005',
            },
          ],
          relevantTrials: [
            {
              id: 'NCT01987654',
              title: `Efficacy and Safety of Drug Y in ${therapeuticArea}`,
              sponsor: 'Pharmaceutical Company B',
              year: '2021',
            },
          ],
        },
      ],
      secondaryEndpoints: [
        {
          id: 'se1',
          name: 'Quality of Life',
          description: `Change from baseline in ${getQolTool(therapeuticArea)} score at Week ${criteria.trialDuration || 12}`,
          measurementTool: getQolTool(therapeuticArea),
          frequencyOfUse: '78%',
          sdtmMapping: 'QSSTRESC, QSORRES',
          cdisc: {
            domain: 'QS',
            variable: 'QSSTRESC',
            codelist: 'QSTEST',
            controlledTerminology: 'C345678',
          },
          regulatoryAcceptance: 'Medium',
          validated: true,
          references: [
            {
              title: `Validation of ${getQolTool(therapeuticArea)} in ${therapeuticArea}`,
              authors: 'Williams K, et al.',
              journal: 'Quality of Life Research',
              year: '2021',
              doi: '10.1000/j.example.2021.10.003',
            },
          ],
        },
        {
          id: 'se2',
          name: 'Treatment Response',
          description: `Proportion of patients achieving ${getResponseCriteria(therapeuticArea)} at Week ${criteria.trialDuration || 12}`,
          measurementTool: 'Standardized assessment',
          frequencyOfUse: '65%',
          sdtmMapping: 'RSSTRESC, RSORRES',
          cdisc: {
            domain: 'RS',
            variable: 'RSSTRESC',
            codelist: 'RSTEST',
            controlledTerminology: 'C456789',
          },
          regulatoryAcceptance: 'High',
          validated: true,
          references: [
            {
              title: `Response criteria in ${therapeuticArea} clinical trials`,
              authors: 'Brown R, et al.',
              journal: 'Journal of Clinical Investigation',
              year: '2020',
              doi: '10.1000/j.example.2020.06.002',
            },
          ],
        },
        {
          id: 'se3',
          name: 'Safety: Adverse Events',
          description: 'Incidence of treatment-emergent adverse events (TEAEs)',
          measurementTool: 'MedDRA coding',
          frequencyOfUse: '97%',
          sdtmMapping: 'AETERM, AEDECOD',
          cdisc: {
            domain: 'AE',
            variable: 'AEDECOD',
            codelist: 'MedDRA',
            controlledTerminology: 'Current version',
          },
          regulatoryAcceptance: 'High',
          validated: true,
          references: [
            {
              title: 'Standardized collection of adverse event data in clinical trials',
              authors: 'Safety Consortium',
              journal: 'Drug Safety',
              year: '2019',
              doi: '10.1000/j.example.2019.04.008',
            },
          ],
        },
        {
          id: 'se4',
          name: 'Patient-Reported Symptoms',
          description: `Change from baseline in ${getSymptomTool(therapeuticArea)} at Week ${criteria.trialDuration || 12}`,
          measurementTool: getSymptomTool(therapeuticArea),
          frequencyOfUse: '54%',
          sdtmMapping: 'QSSTRESC, QSORRES',
          cdisc: {
            domain: 'QS',
            variable: 'QSSTRESC',
            codelist: 'QSTEST',
            controlledTerminology: 'C567890',
          },
          regulatoryAcceptance: 'Medium',
          validated: true,
          references: [
            {
              title: `Development and validation of ${getSymptomTool(therapeuticArea)}`,
              authors: 'Green L, et al.',
              journal: 'Patient Reported Outcomes',
              year: '2020',
              doi: '10.1000/j.example.2020.02.004',
            },
          ],
        },
      ],
      exploratoryEndpoints: [
        {
          id: 'ee1',
          name: getBiomarkerName(therapeuticArea),
          description: `Change from baseline in ${getBiomarkerName(therapeuticArea)} levels at Week ${criteria.trialDuration || 12}`,
          measurementTool: 'Laboratory assay',
          frequencyOfUse: '45%',
          sdtmMapping: 'LBSTRESC, LBORRES',
          cdisc: {
            domain: 'LB',
            variable: 'LBSTRESC',
            codelist: 'LBTEST',
            controlledTerminology: 'C678901',
          },
          regulatoryAcceptance: 'Low',
          validated: false,
          references: [
            {
              title: `${getBiomarkerName(therapeuticArea)} as a biomarker in ${therapeuticArea}`,
              authors: 'Roberts P, et al.',
              journal: 'Biomarkers',
              year: '2021',
              doi: '10.1000/j.example.2021.09.007',
            },
          ],
        },
        {
          id: 'ee2',
          name: 'Digital Health Endpoints',
          description: `Continuous monitoring of ${getDigitalEndpoint(therapeuticArea)} using wearable device`,
          measurementTool: 'Digital wearable device',
          frequencyOfUse: '32%',
          sdtmMapping: 'VSSTRESC, VSORRES',
          cdisc: {
            domain: 'VS',
            variable: 'VSSTRESC',
            codelist: 'VSTEST',
            controlledTerminology: 'C789012',
          },
          regulatoryAcceptance: 'Low',
          validated: false,
          references: [
            {
              title: `Digital endpoints in ${therapeuticArea} clinical trials`,
              authors: 'Tech Consortium',
              journal: 'Digital Biomarkers',
              year: '2023',
              doi: '10.1000/j.example.2023.01.006',
            },
          ],
        },
      ],
    };

    return results;
  };

  // Helper functions to generate therapeutic area-specific endpoint information
  const getPrimaryEndpointName = area => {
    const endpointMap = {
      Oncology: 'Overall Survival (OS)',
      Cardiovascular: 'Major Adverse Cardiac Events (MACE)',
      Neurology: 'Clinical Global Impression (CGI)',
      Rheumatology: 'ACR20 Response',
      Dermatology: 'PASI75 Score',
      Respiratory: 'Forced Expiratory Volume (FEV1)',
      Psychiatry: 'Hamilton Depression Rating Scale (HAM-D)',
      'Infectious Disease': 'Viral Load Reduction',
      Gastroenterology: 'Mayo Clinic Score',
      Endocrinology: 'HbA1c Level',
      Ophthalmology: 'Visual Acuity Change',
      Urology: 'International Prostate Symptom Score (IPSS)',
      Hematology: 'Hemoglobin Level',
      Immunology: 'Immune Response Rate',
      'Rare Disease': 'Disease-Specific Severity Score',
    };

    return endpointMap[area] || 'Primary Efficacy Measure';
  };

  const getAlternativePrimaryEndpoint = area => {
    const endpointMap = {
      Oncology: 'Progression-Free Survival (PFS)',
      Cardiovascular: 'Change in Blood Pressure',
      Neurology: 'Modified Rankin Scale',
      Rheumatology: 'DAS28 Score',
      Dermatology: 'Investigator Global Assessment (IGA)',
      Respiratory: 'Asthma Control Questionnaire (ACQ)',
      Psychiatry: 'Montgomery-Åsberg Depression Rating Scale (MADRS)',
      'Infectious Disease': 'Clinical Cure Rate',
      Gastroenterology: "Crohn's Disease Activity Index (CDAI)",
      Endocrinology: 'Fasting Plasma Glucose',
      Ophthalmology: 'Intraocular Pressure',
      Urology: 'Maximum Flow Rate (Qmax)',
      Hematology: 'Platelet Count',
      Immunology: 'Antibody Titer',
      'Rare Disease': 'Functional Capacity Assessment',
    };

    return endpointMap[area] || 'Secondary Efficacy Measure';
  };

  const getMeasurementTool = area => {
    const toolMap = {
      Oncology: 'RECIST 1.1 Criteria',
      Cardiovascular: 'ECG and Cardiac Monitoring',
      Neurology: 'Unified Neurological Rating Scale',
      Rheumatology: 'Joint Count Assessment',
      Dermatology: 'Lesion Area Scoring',
      Respiratory: 'Spirometry',
      Psychiatry: 'Standardized Clinical Interview',
      'Infectious Disease': 'Microbiological Assessment',
      Gastroenterology: 'Endoscopic Evaluation',
      Endocrinology: 'Laboratory Blood Test',
      Ophthalmology: 'ETDRS Chart',
      Urology: 'Urodynamic Testing',
      Hematology: 'Complete Blood Count',
      Immunology: 'ELISPOT Assay',
      'Rare Disease': 'Disease-Specific Rating Scale',
    };

    return toolMap[area] || 'Standardized Assessment Tool';
  };

  const getAlternativeMeasurementTool = area => {
    const toolMap = {
      Oncology: 'iRECIST Criteria',
      Cardiovascular: '24-hour Ambulatory Blood Pressure Monitoring',
      Neurology: 'NIH Stroke Scale',
      Rheumatology: 'Ultrasound Imaging',
      Dermatology: 'Digital Photography Assessment',
      Respiratory: 'Peak Flow Meter',
      Psychiatry: 'Patient Health Questionnaire (PHQ-9)',
      'Infectious Disease': 'PCR Testing',
      Gastroenterology: 'Fecal Calprotectin',
      Endocrinology: 'Continuous Glucose Monitoring',
      Ophthalmology: 'Optical Coherence Tomography',
      Urology: 'Bladder Diary',
      Hematology: 'Bone Marrow Biopsy',
      Immunology: 'Flow Cytometry',
      'Rare Disease': 'Biomarker Panel',
    };

    return toolMap[area] || 'Alternative Assessment Method';
  };

  const getQolTool = area => {
    const toolMap = {
      Oncology: 'EORTC QLQ-C30',
      Cardiovascular: 'Kansas City Cardiomyopathy Questionnaire (KCCQ)',
      Neurology: 'Neuro-QoL',
      Rheumatology: 'SF-36',
      Dermatology: 'Dermatology Life Quality Index (DLQI)',
      Respiratory: "St. George's Respiratory Questionnaire (SGRQ)",
      Psychiatry: 'Quality of Life Enjoyment and Satisfaction Questionnaire (Q-LES-Q)',
      'Infectious Disease': 'HIV/AIDS Targeted Quality of Life (HAT-QoL)',
      Gastroenterology: 'Inflammatory Bowel Disease Questionnaire (IBDQ)',
      Endocrinology: 'Diabetes Quality of Life Measure (DQOL)',
      Ophthalmology: 'National Eye Institute Visual Function Questionnaire (NEI-VFQ)',
      Urology: 'Incontinence Quality of Life Questionnaire (I-QOL)',
      Hematology: 'Functional Assessment of Cancer Therapy – Anemia (FACT-An)',
      Immunology: 'Health Assessment Questionnaire (HAQ)',
      'Rare Disease': 'EuroQol-5D (EQ-5D)',
    };

    return toolMap[area] || 'Quality of Life Questionnaire';
  };

  const getResponseCriteria = area => {
    const criteriaMap = {
      Oncology: 'complete or partial response per RECIST criteria',
      Cardiovascular: 'reduction in cardiovascular events',
      Neurology: 'improvement in neurological function score',
      Rheumatology: 'ACR50 response',
      Dermatology: 'PASI90 response',
      Respiratory: '15% improvement in FEV1',
      Psychiatry: '50% reduction in symptom score',
      'Infectious Disease': 'negative test for pathogen',
      Gastroenterology: 'mucosal healing',
      Endocrinology: 'target HbA1c below 7.0%',
      Ophthalmology: '15-letter improvement in visual acuity',
      Urology: 'reduction in residual volume',
      Hematology: 'normalization of blood cell counts',
      Immunology: 'resolution of inflammatory markers',
      'Rare Disease': 'stabilization of disease progression',
    };

    return criteriaMap[area] || 'clinically significant improvement';
  };

  const getSymptomTool = area => {
    const toolMap = {
      Oncology: 'MD Anderson Symptom Inventory (MDASI)',
      Cardiovascular: 'Seattle Angina Questionnaire (SAQ)',
      Neurology: "Unified Parkinson's Disease Rating Scale (UPDRS)",
      Rheumatology: 'RAPID3',
      Dermatology: 'Itch Severity Scale',
      Respiratory: 'COPD Assessment Test (CAT)',
      Psychiatry: 'Brief Psychiatric Rating Scale (BPRS)',
      'Infectious Disease': 'Wisconsin Upper Respiratory Symptom Survey (WURSS)',
      Gastroenterology: 'Irritable Bowel Syndrome Symptom Severity Scale (IBS-SSS)',
      Endocrinology: 'Hypoglycemia Symptom Rating Questionnaire',
      Ophthalmology: 'Ocular Surface Disease Index (OSDI)',
      Urology: 'American Urological Association Symptom Index (AUA-SI)',
      Hematology: 'MPN-10 Symptom Assessment Form',
      Immunology: 'Daily Symptom Diary',
      'Rare Disease': 'Disease-Specific Symptom Inventory',
    };

    return toolMap[area] || 'Symptom Assessment Questionnaire';
  };

  const getBiomarkerName = area => {
    const biomarkerMap = {
      Oncology: 'circulating tumor DNA (ctDNA)',
      Cardiovascular: 'high-sensitivity troponin',
      Neurology: 'neurofilament light chain',
      Rheumatology: 'C-reactive protein (CRP)',
      Dermatology: 'IL-17 and IL-23',
      Respiratory: 'fractional exhaled nitric oxide (FeNO)',
      Psychiatry: 'BDNF levels',
      'Infectious Disease': 'inflammatory cytokines',
      Gastroenterology: 'fecal calprotectin',
      Endocrinology: 'C-peptide',
      Ophthalmology: 'VEGF levels',
      Urology: 'PSA density',
      Hematology: 'minimal residual disease (MRD)',
      Immunology: 'complement activation markers',
      'Rare Disease': 'disease-specific enzyme levels',
    };

    return biomarkerMap[area] || 'biomarker levels';
  };

  const getDigitalEndpoint = area => {
    const digitalMap = {
      Oncology: 'physical activity levels',
      Cardiovascular: 'heart rate variability',
      Neurology: 'gait and mobility patterns',
      Rheumatology: 'joint range of motion',
      Dermatology: 'skin lesion imaging',
      Respiratory: 'nighttime cough frequency',
      Psychiatry: 'sleep patterns',
      'Infectious Disease': 'body temperature fluctuations',
      Gastroenterology: 'gut transit time',
      Endocrinology: 'continuous glucose readings',
      Ophthalmology: 'home visual acuity monitoring',
      Urology: 'urination frequency and volume',
      Hematology: 'fatigue and activity levels',
      Immunology: 'symptom tracking',
      'Rare Disease': 'disease-specific physiological parameters',
    };

    return digitalMap[area] || 'patient activity and vital signs';
  };

  const handleEndpointSelect = (endpoint, type) => {
    const newEndpoint = { ...endpoint, type };

    // Check if endpoint is already selected
    const isAlreadySelected = selectedEndpoints.some(ep => ep.id === endpoint.id);

    if (isAlreadySelected) {
      // Remove endpoint if already selected
      setSelectedEndpoints(prev => prev.filter(ep => ep.id !== endpoint.id));
    } else {
      // Add endpoint to selected list
      setSelectedEndpoints(prev => [...prev, newEndpoint]);
    }

    toast({
      title: isAlreadySelected ? 'Endpoint removed' : 'Endpoint added',
      description: isAlreadySelected
        ? `Removed "${endpoint.name}" from selected endpoints.`
        : `Added "${endpoint.name}" as a ${type} endpoint.`,
      variant: 'default',
    });
  };

  const isEndpointSelected = id => {
    return selectedEndpoints.some(endpoint => endpoint.id === id);
  };

  const handleDownloadEndpoints = () => {
    toast({
      title: 'Endpoints downloaded',
      description: `${selectedEndpoints.length} endpoints have been downloaded as a Word document.`,
      variant: 'default',
    });
  };

  const handleCopyToProtocol = () => {
    toast({
      title: 'Endpoints copied to protocol',
      description: `${selectedEndpoints.length} endpoints have been copied to your protocol draft.`,
      variant: 'default',
    });
  };

  const resetSearch = () => {
    setResultsFound(false);
    setSearchResults(null);
    setSelectedEndpoints([]);
    setActiveTab('primary');
  };

  const EndpointCard = ({ endpoint, type }) => {
    const isSelected = isEndpointSelected(endpoint.id);

    return (
      <div
        className={`border rounded-md ${isSelected ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50' : 'border-gray-200'}`}
      >
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center">
              <div
                className={`w-2 h-2 rounded-full mr-2 ${
                  type === 'primary'
                    ? 'bg-red-500'
                    : type === 'secondary'
                      ? 'bg-orange-500'
                      : 'bg-purple-500'
                }`}
              ></div>
              <h3 className="font-medium text-gray-900">{endpoint.name}</h3>
            </div>
            <div className="flex items-center space-x-1">
              <Badge variant="outline" className="text-xs">
                {endpoint.frequencyOfUse}
              </Badge>
              {endpoint.validated && (
                <Badge className="bg-green-100 text-green-800 text-xs">Validated</Badge>
              )}
            </div>
          </div>

          <p className="mt-2 text-sm text-gray-600">{endpoint.description}</p>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="flex flex-col">
              <span className="text-gray-500">Measurement Tool</span>
              <span className="font-medium">{endpoint.measurementTool}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-500">SDTM Mapping</span>
              <span className="font-medium">{endpoint.sdtmMapping}</span>
            </div>
          </div>

          <div className="mt-3 flex justify-between items-center">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs">
                  <Info className="h-3.5 w-3.5 mr-1" />
                  Details
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{endpoint.name}</DialogTitle>
                  <DialogDescription>{endpoint.description}</DialogDescription>
                </DialogHeader>

                <div className="mt-4 space-y-6">
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center">
                      <BookOpen className="h-4 w-4 mr-1.5 text-blue-500" />
                      Endpoint Details
                    </h4>
                    <div className="bg-gray-50 p-3 rounded-md space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-gray-500">Measurement Tool</div>
                          <div className="text-sm font-medium">{endpoint.measurementTool}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Frequency of Use</div>
                          <div className="text-sm font-medium">
                            {endpoint.frequencyOfUse} of trials in {formData.therapeuticArea}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Regulatory Acceptance</div>
                          <div className="text-sm font-medium">{endpoint.regulatoryAcceptance}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Validation Status</div>
                          <div className="text-sm font-medium">
                            {endpoint.validated ? 'Validated' : 'Not Fully Validated'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center">
                      <FileText className="h-4 w-4 mr-1.5 text-blue-500" />
                      CDISC Standards & Mapping
                    </h4>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-gray-500">SDTM Domain</div>
                          <div className="text-sm font-medium">{endpoint.cdisc.domain}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">SDTM Variable</div>
                          <div className="text-sm font-medium">{endpoint.cdisc.variable}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Codelist</div>
                          <div className="text-sm font-medium">{endpoint.cdisc.codelist}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Controlled Terminology</div>
                          <div className="text-sm font-medium">
                            {endpoint.cdisc.controlledTerminology}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center">
                      <BookMarked className="h-4 w-4 mr-1.5 text-blue-500" />
                      References & Literature
                    </h4>
                    <div className="space-y-3">
                      {endpoint.references.map((ref, i) => (
                        <div key={i} className="bg-gray-50 p-3 rounded-md">
                          <div className="text-sm font-medium">{ref.title}</div>
                          <div className="text-xs text-gray-600 mt-1">{ref.authors}</div>
                          <div className="text-xs mt-1 flex items-center justify-between">
                            <span>
                              {ref.journal}, {ref.year}
                            </span>
                            <Button variant="ghost" size="sm" className="h-6 text-xs">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              DOI: {ref.doi}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {endpoint.relevantTrials && endpoint.relevantTrials.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center">
                        <Search className="h-4 w-4 mr-1.5 text-blue-500" />
                        Relevant Trials Using This Endpoint
                      </h4>
                      <div className="space-y-2">
                        {endpoint.relevantTrials.map((trial, i) => (
                          <div key={i} className="bg-gray-50 p-3 rounded-md">
                            <div className="flex justify-between">
                              <div className="text-sm font-medium">{trial.title}</div>
                              <Badge variant="outline" className="text-xs">
                                {trial.year}
                              </Badge>
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              <span>{trial.sponsor}</span>
                              <span className="mx-2">•</span>
                              <Button variant="link" size="sm" className="h-6 p-0 text-xs">
                                {trial.id}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Button
              variant={isSelected ? 'default' : 'outline'}
              size="sm"
              className="text-xs"
              onClick={() => handleEndpointSelect(endpoint, type)}
            >
              {isSelected ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Selected
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Select
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl">Intelligent Endpoint Advisor</CardTitle>
              <CardDescription>
                Get recommendations for primary, secondary, and exploratory endpoints based on
                therapeutic area and study characteristics
              </CardDescription>
            </div>
            <Badge variant="outline" className="flex items-center">
              <Sparkles className="h-3.5 w-3.5 mr-1 text-blue-500" />
              AI-Powered
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!resultsFound ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="therapeuticArea">
                    Therapeutic Area <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.therapeuticArea}
                    onValueChange={value => handleInputChange('therapeuticArea', value)}
                  >
                    <SelectTrigger id="therapeuticArea">
                      <SelectValue placeholder="Select therapeutic area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Oncology">Oncology</SelectItem>
                      <SelectItem value="Cardiovascular">Cardiovascular</SelectItem>
                      <SelectItem value="Neurology">Neurology</SelectItem>
                      <SelectItem value="Rheumatology">Rheumatology</SelectItem>
                      <SelectItem value="Dermatology">Dermatology</SelectItem>
                      <SelectItem value="Respiratory">Respiratory</SelectItem>
                      <SelectItem value="Psychiatry">Psychiatry</SelectItem>
                      <SelectItem value="Infectious Disease">Infectious Disease</SelectItem>
                      <SelectItem value="Gastroenterology">Gastroenterology</SelectItem>
                      <SelectItem value="Endocrinology">Endocrinology</SelectItem>
                      <SelectItem value="Ophthalmology">Ophthalmology</SelectItem>
                      <SelectItem value="Urology">Urology</SelectItem>
                      <SelectItem value="Hematology">Hematology</SelectItem>
                      <SelectItem value="Immunology">Immunology</SelectItem>
                      <SelectItem value="Rare Disease">Rare Disease</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phase">
                    Study Phase <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.phase}
                    onValueChange={value => handleInputChange('phase', value)}
                  >
                    <SelectTrigger id="phase">
                      <SelectValue placeholder="Select study phase" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Phase I">Phase I</SelectItem>
                      <SelectItem value="Phase I/II">Phase I/II</SelectItem>
                      <SelectItem value="Phase II">Phase II</SelectItem>
                      <SelectItem value="Phase II/III">Phase II/III</SelectItem>
                      <SelectItem value="Phase III">Phase III</SelectItem>
                      <SelectItem value="Phase IV">Phase IV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="indication">Specific Indication</Label>
                  <Input
                    id="indication"
                    placeholder="e.g., Type 2 Diabetes, Rheumatoid Arthritis"
                    value={formData.indication}
                    onChange={e => handleInputChange('indication', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="populationType">Population Type</Label>
                  <Select
                    value={formData.populationType}
                    onValueChange={value => handleInputChange('populationType', value)}
                  >
                    <SelectTrigger id="populationType">
                      <SelectValue placeholder="Select population type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Adult">Adult</SelectItem>
                      <SelectItem value="Pediatric">Pediatric</SelectItem>
                      <SelectItem value="Geriatric">Geriatric</SelectItem>
                      <SelectItem value="Special Population">Special Population</SelectItem>
                      <SelectItem value="Mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primaryObjective">Primary Study Objective</Label>
                  <Textarea
                    id="primaryObjective"
                    placeholder="Brief description of primary objective"
                    value={formData.primaryObjective}
                    onChange={e => handleInputChange('primaryObjective', e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="trialDuration">Approximate Trial Duration (weeks)</Label>
                  <Input
                    id="trialDuration"
                    type="number"
                    placeholder="e.g., 12, 26, 52"
                    value={formData.trialDuration}
                    onChange={e => handleInputChange('trialDuration', e.target.value)}
                  />
                </div>
              </div>

              {isLoading && (
                <div className="space-y-2 mt-4">
                  <div className="flex justify-between text-sm">
                    <span>Searching for optimal endpoints...</span>
                    <span>{searchProgress}%</span>
                  </div>
                  <Progress value={searchProgress} className="h-2" />
                  <div className="text-xs text-gray-500 italic mt-1">
                    {searchProgress < 30
                      ? 'Analyzing therapeutic area and phase...'
                      : searchProgress < 60
                        ? 'Scanning regulatory precedent and historical trials...'
                        : searchProgress < 90
                          ? 'Evaluating endpoint validation status and CDISC mappings...'
                          : 'Finalizing endpoint recommendations...'}
                  </div>
                </div>
              )}

              <div className="bg-blue-50 p-3 rounded-md flex">
                <Info className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
                <div className="text-sm text-blue-700 space-y-1">
                  <p className="font-medium">Advisor uses AI-powered analysis of:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>5,000+ historical clinical trials across therapeutic areas</li>
                    <li>FDA/EMA regulatory guidance and approval precedents</li>
                    <li>CDISC/SDTM domain mapping and controlled terminology</li>
                    <li>Validation status and industry acceptance of endpoints</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-medium">Endpoint Recommendations</h3>
                  <p className="text-sm text-gray-500">
                    Based on {formData.therapeuticArea} • {formData.phase}{' '}
                    {formData.indication ? `• ${formData.indication}` : ''}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={resetSearch}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  New Search
                </Button>
              </div>

              <div className="flex justify-between items-center">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList>
                    <TabsTrigger value="primary" className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-red-500 mr-2"></div>
                      Primary
                      <Badge className="ml-2 bg-gray-100 text-gray-800">
                        {searchResults.primaryEndpoints.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="secondary" className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-orange-500 mr-2"></div>
                      Secondary
                      <Badge className="ml-2 bg-gray-100 text-gray-800">
                        {searchResults.secondaryEndpoints.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="exploratory" className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-purple-500 mr-2"></div>
                      Exploratory
                      <Badge className="ml-2 bg-gray-100 text-gray-800">
                        {searchResults.exploratoryEndpoints.length}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex items-center space-x-2 ml-2">
                  <Button variant="ghost" size="sm" className="text-xs">
                    <Filter className="h-3.5 w-3.5 mr-1" />
                    Filter
                  </Button>
                </div>
              </div>

              <TabsContent value="primary" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 gap-4">
                  {searchResults.primaryEndpoints.map(endpoint => (
                    <EndpointCard key={endpoint.id} endpoint={endpoint} type="primary" />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="secondary" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 gap-4">
                  {searchResults.secondaryEndpoints.map(endpoint => (
                    <EndpointCard key={endpoint.id} endpoint={endpoint} type="secondary" />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="exploratory" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 gap-4">
                  {searchResults.exploratoryEndpoints.map(endpoint => (
                    <EndpointCard key={endpoint.id} endpoint={endpoint} type="exploratory" />
                  ))}
                </div>
              </TabsContent>

              {selectedEndpoints.length > 0 && (
                <div className="mt-6 border rounded-md p-4 bg-blue-50">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-medium flex items-center">
                      <Bookmark className="h-4 w-4 mr-1.5 text-blue-600" />
                      Selected Endpoints ({selectedEndpoints.length})
                    </h3>
                    <div className="space-x-2">
                      <Button variant="outline" size="sm" onClick={handleDownloadEndpoints}>
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Download
                      </Button>
                      <Button size="sm" onClick={handleCopyToProtocol}>
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        Copy to Protocol
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Accordion type="multiple" className="w-full">
                      <AccordionItem value="primary">
                        <AccordionTrigger className="text-sm py-2">
                          <div className="flex items-center">
                            <div className="w-2 h-2 rounded-full bg-red-500 mr-2"></div>
                            Primary Endpoints
                            <Badge className="ml-2 bg-white text-red-800">
                              {selectedEndpoints.filter(e => e.type === 'primary').length}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pl-4">
                            {selectedEndpoints
                              .filter(e => e.type === 'primary')
                              .map(endpoint => (
                                <div
                                  key={endpoint.id}
                                  className="bg-white p-2 rounded-md flex justify-between items-center"
                                >
                                  <div className="text-sm">{endpoint.name}</div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7"
                                    onClick={() => handleEndpointSelect(endpoint, 'primary')}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="secondary">
                        <AccordionTrigger className="text-sm py-2">
                          <div className="flex items-center">
                            <div className="w-2 h-2 rounded-full bg-orange-500 mr-2"></div>
                            Secondary Endpoints
                            <Badge className="ml-2 bg-white text-orange-800">
                              {selectedEndpoints.filter(e => e.type === 'secondary').length}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pl-4">
                            {selectedEndpoints
                              .filter(e => e.type === 'secondary')
                              .map(endpoint => (
                                <div
                                  key={endpoint.id}
                                  className="bg-white p-2 rounded-md flex justify-between items-center"
                                >
                                  <div className="text-sm">{endpoint.name}</div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7"
                                    onClick={() => handleEndpointSelect(endpoint, 'secondary')}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="exploratory">
                        <AccordionTrigger className="text-sm py-2">
                          <div className="flex items-center">
                            <div className="w-2 h-2 rounded-full bg-purple-500 mr-2"></div>
                            Exploratory Endpoints
                            <Badge className="ml-2 bg-white text-purple-800">
                              {selectedEndpoints.filter(e => e.type === 'exploratory').length}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pl-4">
                            {selectedEndpoints
                              .filter(e => e.type === 'exploratory')
                              .map(endpoint => (
                                <div
                                  key={endpoint.id}
                                  className="bg-white p-2 rounded-md flex justify-between items-center"
                                >
                                  <div className="text-sm">{endpoint.name}</div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7"
                                    onClick={() => handleEndpointSelect(endpoint, 'exploratory')}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 rounded-md p-4 mt-6">
                <h3 className="font-medium flex items-center mb-3">
                  <Info className="h-4 w-4 mr-1.5 text-blue-600" />
                  Endpoint Selection Guidance
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start">
                    <div className="flex items-center mt-1">
                      <HeartPulse className="h-4 w-4 text-red-500 mr-2" />
                    </div>
                    <p className="text-gray-700">
                      <span className="font-medium">Primary endpoints</span> should be clinically
                      meaningful, objective, sensitive to treatment effects, and directly relate to
                      the primary objective.
                    </p>
                  </div>
                  <div className="flex items-start">
                    <div className="flex items-center mt-1">
                      <Brain className="h-4 w-4 text-orange-500 mr-2" />
                    </div>
                    <p className="text-gray-700">
                      <span className="font-medium">Secondary endpoints</span> should support
                      understanding of treatment effects, cover other important aspects of the
                      disease, and include safety measures.
                    </p>
                  </div>
                  <div className="flex items-start">
                    <div className="flex items-center mt-1">
                      <LineChart className="h-4 w-4 text-purple-500 mr-2" />
                    </div>
                    <p className="text-gray-700">
                      <span className="font-medium">Exploratory endpoints</span> can investigate
                      novel biomarkers, patient-reported outcomes, or other emerging measures with
                      less established validation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end">
          {!resultsFound ? (
            <Button onClick={handleSearch} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Find Optimal Endpoints
                </>
              )}
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  );
};

export default IntelligentEndpointAdvisor;
