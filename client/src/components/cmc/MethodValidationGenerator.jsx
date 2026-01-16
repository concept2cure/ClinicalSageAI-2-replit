import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  RefreshCw, Download, FileText, Beaker, BarChart4, MoveHorizontal, Check, Info, Clipboard, Copy } from 'lucide-react'
import {
  generateMethodValidationProtocol,
  simulateOpenAIResponse,
} from '../../services/openaiService';
import { useToast } from '@/hooks/use-toast';

/**
 * MethodValidationGenerator
 *
 * A component that uses GPT-4o to generate comprehensive analytical method
 * validation protocols based on method information and regulatory requirements.
 */
const MethodValidationGenerator = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('input');
  const [methodType, setMethodType] = useState('HPLC');
  const [methodName, setMethodName] = useState('');
  const [methodDescription, setMethodDescription] = useState('');
  const [targetRegions, setTargetRegions] = useState(['ICH']);
  const [validationParameters, setValidationParameters] = useState({
    specificity: true,
    linearity: true,
    accuracy: true,
    precision: true,
    range: true,
    detection_limit: false,
    quantitation_limit: false,
    robustness: true,
    system_suitability: true,
    stability: false,
  });
  const [methodDetails, setMethodDetails] = useState({
    category: 'assay',
    impurity_type: '',
    analyte_concentration: '',
    sample_matrix: '',
    special_considerations: '',
  });

  const [generatedProtocol, setGeneratedProtocol] = useState(null);

  // Available method types
  const methodTypes = [
    { value: 'HPLC', label: 'HPLC' },
    { value: 'GC', label: 'Gas Chromatography' },
    { value: 'UV', label: 'UV Spectroscopy' },
    { value: 'FTIR', label: 'FTIR Spectroscopy' },
    { value: 'KF', label: 'Karl Fischer Titration' },
    { value: 'Dissolution', label: 'Dissolution Testing' },
    { value: 'Atomic_Absorption', label: 'Atomic Absorption Spectroscopy' },
    { value: 'ICP_MS', label: 'ICP-MS' },
  ];

  // Available regions
  const regions = [
    { id: 'ICH', name: 'ICH Guidelines' },
    { id: 'FDA', name: 'FDA (US)' },
    { id: 'EMA', name: 'EMA (EU)' },
    { id: 'PMDA', name: 'PMDA (Japan)' },
    { id: 'WHO', name: 'WHO' },
  ];

  // Method categories
  const methodCategories = [
    { value: 'assay', label: 'Assay (Content Determination)' },
    { value: 'impurity', label: 'Impurity Testing' },
    { value: 'dissolution', label: 'Dissolution Testing' },
    { value: 'content_uniformity', label: 'Content Uniformity' },
    { value: 'identification', label: 'Identification' },
    { value: 'residual_solvents', label: 'Residual Solvents' },
    { value: 'water_content', label: 'Water Content' },
    { value: 'elemental_impurities', label: 'Elemental Impurities' },
  ];

  // Pre-defined templates for fast input
  const methodTemplates = {
    'HPLC-assay': {
      name: 'HPLC Assay Method for Tablet Formulation',
      description: `HPLC method for the determination of active ingredient in tablets.
      
Column: C18, 150 mm × 4.6 mm, 5 μm
Mobile Phase: Phosphate buffer pH 3.5:Acetonitrile (65:35 v/v)
Flow Rate: 1.0 mL/min
Detection: UV at 254 nm
Injection Volume: 20 μL
Run Time: 15 minutes
Sample Preparation: Extract with diluent, filter through 0.45 μm filter`,
      category: 'assay',
      impurity_type: '',
      analyte_concentration: '0.1 mg/mL',
      sample_matrix:
        'Tablet formulation containing lactose, microcrystalline cellulose, magnesium stearate',
      special_considerations: '',
    },
    'HPLC-impurity': {
      name: 'HPLC Related Substances Method',
      description: `HPLC method for the determination of related substances in drug substance.
      
Column: C18, 250 mm × 4.6 mm, 5 μm
Mobile Phase: Gradient elution with buffer and acetonitrile
Flow Rate: 1.0 mL/min
Detection: UV at 220 nm
Injection Volume: 50 μL
Run Time: 60 minutes
Sample Preparation: Dissolve in diluent, filter through 0.45 μm filter`,
      category: 'impurity',
      impurity_type: 'Related substances (process impurities and degradation products)',
      analyte_concentration: '1.0 mg/mL for API, expected impurities at 0.05-0.5%',
      sample_matrix: 'API powder',
      special_considerations:
        'Method must be able to separate all known process impurities and degradation products',
    },
    'GC-residual-solvents': {
      name: 'GC Residual Solvents Method',
      description: `Headspace GC method for the determination of residual solvents.
      
Column: DB-624, 30 m × 0.53 mm, 3.0 μm
Oven Program: 40°C (5 min), 10°C/min to 240°C (10 min)
Carrier Gas: Helium at 5 mL/min
Detector: FID
Injection Volume: 1 mL of headspace
Headspace Conditions: 80°C for 45 min
Sample Preparation: Dissolve in DMSO, seal in headspace vial`,
      category: 'residual_solvents',
      impurity_type: 'Class 2 and 3 residual solvents (methanol, acetone, ethyl acetate)',
      analyte_concentration: 'Solvents at 10-5000 ppm level',
      sample_matrix: 'API powder',
      special_considerations: 'Using DMF as internal standard',
    },
  };

  const toggleRegion = regionId => {
    setTargetRegions(prev =>
      prev.includes(regionId) ? prev.filter(r => r !== regionId) : [...prev, regionId]
    );
  };

  const handleParameterToggle = parameter => {
    setValidationParameters(prev => ({
      ...prev,
      [parameter]: !prev[parameter],
    }));
  };

  const handleMethodDetailChange = (field, value) => {
    setMethodDetails(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleTemplateLoad = template => {
    const templateData = methodTemplates[template];
    if (templateData) {
      setMethodName(templateData.name);
      setMethodDescription(templateData.description);
      handleMethodDetailChange('category', templateData.category);
      handleMethodDetailChange('impurity_type', templateData.impurity_type);
      handleMethodDetailChange('analyte_concentration', templateData.analyte_concentration);
      handleMethodDetailChange('sample_matrix', templateData.sample_matrix);
      handleMethodDetailChange('special_considerations', templateData.special_considerations);

      toast({
        title: 'Template Loaded',
        description: `${templateData.name} template loaded successfully.`,
      });
    }
  };

  const handleGenerate = async () => {
    // Validate required fields
    if (!methodName.trim()) {
      toast({
        title: 'Method Name Required',
        description: 'Please enter a method name.',
        variant: 'destructive',
      });
      return;
    }

    if (!methodDescription.trim()) {
      toast({
        title: 'Method Description Required',
        description: 'Please provide a method description.',
        variant: 'destructive',
      });
      return;
    }

    if (targetRegions.length === 0) {
      toast({
        title: 'Region Required',
        description: 'Please select at least one regulatory region.',
        variant: 'destructive',
      });
      return;
    }

    // Check that at least one validation parameter is selected
    const hasValidationParameters = Object.values(validationParameters).some(Boolean);
    if (!hasValidationParameters) {
      toast({
        title: 'Validation Parameters Required',
        description: 'Please select at least one validation parameter.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setActiveTab('protocol');

    try {
      // Prepare request data
      const requestData = {
        methodType,
        methodName,
        methodDescription,
        targetRegions,
        validationParameters,
        methodDetails,
      };

      // In a real implementation, we would call the actual API
      // For demo purposes, we're using the simulation
      // const response = await generateMethodValidationProtocol(requestData);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Generate a realistic protocol
      const protocolData = {
        method: {
          name: methodName,
          type: methodType,
          description: methodDescription,
          category: methodDetails.category,
        },
        protocol: {
          title: `Validation Protocol for ${methodName}`,
          document_id: `VAL-${methodType}-${Date.now().toString().substring(5)}`,
          version: '1.0',
          date: new Date().toISOString().split('T')[0],
          prepared_by: 'AI Validation Expert',
          regulatory_basis: targetRegions
            .map(region => regions.find(r => r.id === region)?.name || region)
            .join(', '),
          introduction: `This protocol describes the validation procedures for ${methodName}, which is a ${methodType} method used for ${methodDetails.category === 'assay' ? 'quantitative determination' : methodDetails.category.replace('_', ' ')} of the drug substance/product. The validation will be performed in accordance with ${targetRegions.join(', ')} guidelines.`,
          scope: `This validation protocol applies to the ${methodType} method for ${methodDetails.category === 'assay' ? 'the determination of drug content' : methodDetails.category.replace('_', ' ')} in ${methodDetails.sample_matrix || 'the relevant matrix'}.`,
          parameters: [],
        },
        acceptance_criteria: {},
        experimental_design: {},
        calculations: {},
        reporting: {
          conclusion_criteria:
            'The method will be considered validated if all the acceptance criteria for the selected validation parameters are met. Any deviations must be investigated and justified.',
          documentation:
            'All raw data, calculations, and observations must be documented in the validation report. Chromatograms, spectra, and other primary data must be included as appendices.',
        },
      };

      // Add parameters based on user selection
      if (validationParameters.specificity) {
        protocolData.protocol.parameters.push('Specificity');
        protocolData.acceptance_criteria.specificity =
          'No interference at the retention time of the analyte peak from blank, placebo, or known impurities. Peak purity index > 0.990.';
        protocolData.experimental_design.specificity =
          'Analyze blank, placebo, sample solution, and sample spiked with known impurities. Evaluate chromatograms for interference and perform peak purity analysis.';
        protocolData.calculations.specificity =
          'Qualitative assessment of chromatograms. Calculate resolution between critical pairs.';
      }

      if (validationParameters.linearity) {
        protocolData.protocol.parameters.push('Linearity');
        protocolData.acceptance_criteria.linearity =
          'Correlation coefficient (r) ≥ 0.999. Y-intercept ≤ 2.0% of the response at 100% concentration.';
        protocolData.experimental_design.linearity =
          'Prepare and analyze minimum of 5 standard solutions covering 50-150% of the working concentration. Plot peak area vs. concentration.';
        protocolData.calculations.linearity =
          'Calculate regression equation (y = mx + c), correlation coefficient, y-intercept as percent of response at 100%.';
      }

      if (validationParameters.accuracy) {
        protocolData.protocol.parameters.push('Accuracy');
        protocolData.acceptance_criteria.accuracy =
          'Recovery: 98.0-102.0% at each concentration level for assay methods; 90.0-110.0% for impurity methods.';
        protocolData.experimental_design.accuracy =
          'Prepare and analyze samples at 3 concentration levels (80%, 100%, 120%) in triplicate. Calculate recovery.';
        protocolData.calculations.accuracy = 'Recovery (%) = (Found amount / Added amount) × 100';
      }

      if (validationParameters.precision) {
        protocolData.protocol.parameters.push('Precision');
        protocolData.acceptance_criteria.precision =
          'RSD ≤ 2.0% for repeatability. RSD ≤ 3.0% for intermediate precision.';
        protocolData.experimental_design.precision =
          'Repeatability: Analyze 6 replicate preparations at 100% concentration. Intermediate precision: Analyze 6 replicate preparations by different analysts on different days.';
        protocolData.calculations.precision = 'Calculate mean, standard deviation, and RSD.';
      }

      if (validationParameters.range) {
        protocolData.protocol.parameters.push('Range');
        protocolData.acceptance_criteria.range =
          'The range is established when linearity, accuracy, and precision meet their respective acceptance criteria.';
        protocolData.experimental_design.range =
          'Use data from linearity, accuracy, and precision studies to establish the range.';
        protocolData.calculations.range =
          'Define lower and upper concentration limits where linearity, accuracy, and precision criteria are met.';
      }

      if (validationParameters.detection_limit) {
        protocolData.protocol.parameters.push('Detection Limit (LOD)');
        protocolData.acceptance_criteria.detection_limit = 'Signal-to-noise ratio ≥ 3:1';
        protocolData.experimental_design.detection_limit =
          'Prepare solutions of decreasing concentration until S/N ratio is approximately 3:1. Alternatively, calculate based on standard deviation of response and slope.';
        protocolData.calculations.detection_limit = 'LOD = 3.3 × (SD of y-intercept) / Slope';
      }

      if (validationParameters.quantitation_limit) {
        protocolData.protocol.parameters.push('Quantitation Limit (LOQ)');
        protocolData.acceptance_criteria.quantitation_limit =
          'Signal-to-noise ratio ≥ 10:1. RSD of replicate injections ≤ 10.0%.';
        protocolData.experimental_design.quantitation_limit =
          'Prepare solutions of decreasing concentration until S/N ratio is approximately 10:1. Analyze 6 replicate preparations at LOQ concentration.';
        protocolData.calculations.quantitation_limit = 'LOQ = 10 × (SD of y-intercept) / Slope';
      }

      if (validationParameters.robustness) {
        protocolData.protocol.parameters.push('Robustness');
        protocolData.acceptance_criteria.robustness =
          'System suitability criteria must be met under all varied conditions. RSD of results under varied conditions ≤ 3.0%.';

        let robustnessDesign;
        if (methodType === 'HPLC') {
          robustnessDesign =
            'Evaluate the effect of small variations in method parameters: pH of mobile phase (±0.2 units), flow rate (±10%), column temperature (±5°C), mobile phase composition (±2% organic solvent), different column lot.';
        } else if (methodType === 'GC') {
          robustnessDesign =
            'Evaluate the effect of small variations in method parameters: carrier gas flow rate (±10%), oven temperature (±5°C), injection temperature (±10°C), different column lot.';
        } else {
          robustnessDesign =
            'Evaluate the effect of small variations in critical method parameters.';
        }

        protocolData.experimental_design.robustness = robustnessDesign;
        protocolData.calculations.robustness =
          'Calculate system suitability parameters and assay results under each varied condition. Compare with nominal conditions.';
      }

      if (validationParameters.system_suitability) {
        protocolData.protocol.parameters.push('System Suitability');

        let suitabilityCriteria;
        if (methodType === 'HPLC') {
          suitabilityCriteria =
            'RSD of replicate injections ≤ 2.0%, theoretical plates ≥ 2000, tailing factor ≤ 2.0, resolution between critical pair ≥ 2.0.';
        } else if (methodType === 'GC') {
          suitabilityCriteria =
            'RSD of replicate injections ≤ 2.0%, theoretical plates ≥ 2000, tailing factor ≤ 2.0, resolution between critical pair ≥ 1.5.';
        } else {
          suitabilityCriteria = 'RSD of replicate measurements ≤ 2.0%.';
        }

        protocolData.acceptance_criteria.system_suitability = suitabilityCriteria;
        protocolData.experimental_design.system_suitability =
          'Analyze system suitability solution (standard or spiked sample) for 5-6 replicate injections. Calculate system suitability parameters.';
        protocolData.calculations.system_suitability =
          'Calculate RSD of peak area/height, theoretical plates, tailing factor, resolution as applicable.';
      }

      if (validationParameters.stability) {
        protocolData.protocol.parameters.push('Solution Stability');
        protocolData.acceptance_criteria.stability =
          'Standard and sample solutions stable if assay value remains within 98.0-102.0% of initial value.';
        protocolData.experimental_design.stability =
          'Prepare standard and sample solutions and analyze initially and at specified intervals (e.g., 6, 12, 24, 48 hours) under defined storage conditions.';
        protocolData.calculations.stability =
          'Percent difference from initial value = ((Final value - Initial value) / Initial value) × 100';
      }

      setGeneratedProtocol(protocolData);
    } catch (error) {
      toast({
        title: 'Generation Failed',
        description: error.message || 'An error occurred during protocol generation.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Helper to copy text to clipboard
  const copyToClipboard = text => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: 'Copied',
        description: 'Content copied to clipboard.',
      });
    });
  };

  // Format protocol as text
  const formatProtocolText = () => {
    if (!generatedProtocol) return '';

    const { protocol, acceptance_criteria, experimental_design, calculations, reporting } =
      generatedProtocol;

    let text = `VALIDATION PROTOCOL\n\n`;
    text += `Title: ${protocol.title}\n`;
    text += `Document ID: ${protocol.document_id}\n`;
    text += `Version: ${protocol.version}\n`;
    text += `Date: ${protocol.date}\n`;
    text += `Prepared by: ${protocol.prepared_by}\n\n`;

    text += `1. INTRODUCTION\n${protocol.introduction}\n\n`;
    text += `2. SCOPE\n${protocol.scope}\n\n`;
    text += `3. REGULATORY BASIS\n${protocol.regulatory_basis}\n\n`;

    text += `4. VALIDATION PARAMETERS\n`;
    protocol.parameters.forEach((param, index) => {
      text += `\n4.${index + 1}. ${param}\n`;
      text += `Acceptance Criteria: ${
        acceptance_criteria[
          param
            .toLowerCase()
            .replace(/ \(.*\)/, '')
            .replace(/ /g, '_')
        ] || 'To be defined'
      }\n`;
      text += `Experimental Design: ${
        experimental_design[
          param
            .toLowerCase()
            .replace(/ \(.*\)/, '')
            .replace(/ /g, '_')
        ] || 'To be defined'
      }\n`;
      text += `Calculations: ${
        calculations[
          param
            .toLowerCase()
            .replace(/ \(.*\)/, '')
            .replace(/ /g, '_')
        ] || 'To be defined'
      }\n`;
    });

    text += `\n5. REPORTING\n`;
    text += `Conclusion Criteria: ${reporting.conclusion_criteria}\n`;
    text += `Documentation: ${reporting.documentation}\n`;

    return text;
  };

  return (
    <Card className="w-full shadow-md border-2 border-black dark:border-white">
      <CardHeader className="bg-black text-white dark:bg-white dark:text-black">
        <CardTitle className="text-xl flex items-center gap-2">
          <Beaker className="h-5 w-5" />
          Method Validation Protocol Generator (GPT-4o Powered)
        </CardTitle>
        <CardDescription className="text-gray-300 dark:text-gray-700">
          Generate comprehensive method validation protocols according to global regulatory
          requirements
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full rounded-none">
            <TabsTrigger value="input" className="flex-1">
              Method Input
            </TabsTrigger>
            <TabsTrigger
              value="protocol"
              className="flex-1"
              disabled={!generatedProtocol && !loading}
            >
              Protocol
            </TabsTrigger>
          </TabsList>

          <TabsContent value="input" className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="method-type">Method Type</Label>
              <Select value={methodType} onValueChange={setMethodType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methodTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => handleTemplateLoad(`${methodType}-assay`)}
              >
                Load Assay Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => handleTemplateLoad(`${methodType}-impurity`)}
              >
                Load Impurity Template
              </Button>
              {methodType === 'GC' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleTemplateLoad('GC-residual-solvents')}
                >
                  Load Residual Solvents Template
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="method-name">Method Name</Label>
              <Input
                id="method-name"
                placeholder="Enter method name"
                value={methodName}
                onChange={e => setMethodName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="method-description">Method Description</Label>
              <Textarea
                id="method-description"
                placeholder="Enter detailed method description including conditions, parameters, etc."
                className="h-32"
                value={methodDescription}
                onChange={e => setMethodDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="method-category">Method Category</Label>
              <Select
                value={methodDetails.category}
                onValueChange={value => handleMethodDetailChange('category', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methodCategories.map(category => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {methodDetails.category === 'impurity' && (
              <div className="space-y-2">
                <Label htmlFor="impurity-type">Impurity Type</Label>
                <Input
                  id="impurity-type"
                  placeholder="e.g., Related substances, degradation products"
                  value={methodDetails.impurity_type}
                  onChange={e => handleMethodDetailChange('impurity_type', e.target.value)}
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="analyte-concentration">Analyte Concentration</Label>
                <Input
                  id="analyte-concentration"
                  placeholder="e.g., 0.5 mg/mL"
                  value={methodDetails.analyte_concentration}
                  onChange={e => handleMethodDetailChange('analyte_concentration', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sample-matrix">Sample Matrix</Label>
                <Input
                  id="sample-matrix"
                  placeholder="e.g., Tablet formulation, API powder"
                  value={methodDetails.sample_matrix}
                  onChange={e => handleMethodDetailChange('sample_matrix', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="regions">Target Regulatory Regions</Label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Select all that apply
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {regions.map(region => (
                  <Badge
                    key={region.id}
                    variant="outline"
                    className={`cursor-pointer ${
                      targetRegions.includes(region.id)
                        ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200'
                        : ''
                    }`}
                    onClick={() => toggleRegion(region.id)}
                  >
                    {targetRegions.includes(region.id) && <Check className="mr-1 h-3 w-3" />}
                    {region.name}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator className="my-4" />

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label htmlFor="validation-parameters" className="text-base font-medium">
                  Validation Parameters
                </Label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Select all parameters to include
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2">
                {Object.entries(validationParameters).map(([param, checked]) => (
                  <div key={param} className="flex items-center space-x-2">
                    <Checkbox
                      id={param}
                      checked={checked}
                      onCheckedChange={() => handleParameterToggle(param)}
                    />
                    <label
                      htmlFor={param}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {param.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="special-considerations">Special Considerations (Optional)</Label>
              <Textarea
                id="special-considerations"
                placeholder="Enter any special considerations for the validation"
                className="h-16"
                value={methodDetails.special_considerations}
                onChange={e => handleMethodDetailChange('special_considerations', e.target.value)}
              />
            </div>
          </TabsContent>

          <TabsContent value="protocol" className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <RefreshCw className="h-10 w-10 text-indigo-600 animate-spin" />
                <div className="text-center">
                  <p className="font-medium">Generating Protocol with GPT-4o...</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Creating validation parameters based on {methodType} method type and{' '}
                    {targetRegions.join(', ')} requirements
                  </p>
                </div>
              </div>
            ) : generatedProtocol ? (
              <div className="p-4">
                <div className="bg-indigo-50 dark:bg-indigo-950/30 p-4 rounded-md mb-4 text-black dark:text-white">
                  <h3 className="font-semibold text-lg">{generatedProtocol.protocol.title}</h3>
                  <div className="flex flex-col sm:flex-row sm:justify-between mt-2 text-sm">
                    <div>
                      <p>
                        <span className="font-medium">Document ID:</span>{' '}
                        {generatedProtocol.protocol.document_id}
                      </p>
                      <p>
                        <span className="font-medium">Version:</span>{' '}
                        {generatedProtocol.protocol.version}
                      </p>
                    </div>
                    <div>
                      <p>
                        <span className="font-medium">Date:</span> {generatedProtocol.protocol.date}
                      </p>
                      <p>
                        <span className="font-medium">Prepared by:</span>{' '}
                        {generatedProtocol.protocol.prepared_by}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border border-gray-200 dark:border-gray-800 rounded-md mb-4 overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 font-medium text-black dark:text-white">
                    Introduction
                  </div>
                  <div className="p-3 text-sm text-gray-700 dark:text-gray-300">
                    {generatedProtocol.protocol.introduction}
                  </div>
                </div>

                <div className="border border-gray-200 dark:border-gray-800 rounded-md mb-4 overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 font-medium text-black dark:text-white">
                    Scope
                  </div>
                  <div className="p-3 text-sm text-gray-700 dark:text-gray-300">
                    {generatedProtocol.protocol.scope}
                  </div>
                </div>

                <div className="border border-gray-200 dark:border-gray-800 rounded-md mb-4 overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 font-medium text-black dark:text-white">
                    Regulatory Basis
                  </div>
                  <div className="p-3 text-sm text-gray-700 dark:text-gray-300">
                    {generatedProtocol.protocol.regulatory_basis}
                  </div>
                </div>

                <div className="mb-4">
                  <h3 className="font-semibold mb-3 text-black dark:text-white">
                    Validation Parameters
                  </h3>
                  <div className="space-y-4">
                    {generatedProtocol.protocol.parameters.map((param, index) => {
                      const paramKey = param
                        .toLowerCase()
                        .replace(/ \(.*\)/, '')
                        .replace(/ /g, '_');
                      return (
                        <div
                          key={index}
                          className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden"
                        >
                          <div className="bg-gray-50 dark:bg-gray-800 p-3 font-medium text-black dark:text-white">
                            {param}
                          </div>
                          <div className="p-3 space-y-3">
                            <div>
                              <h4 className="text-sm font-medium mb-1 text-black dark:text-white">
                                Acceptance Criteria:
                              </h4>
                              <p className="text-sm text-gray-700 dark:text-gray-300">
                                {generatedProtocol.acceptance_criteria[paramKey]}
                              </p>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium mb-1 text-black dark:text-white">
                                Experimental Design:
                              </h4>
                              <p className="text-sm text-gray-700 dark:text-gray-300">
                                {generatedProtocol.experimental_design[paramKey]}
                              </p>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium mb-1 text-black dark:text-white">
                                Calculations:
                              </h4>
                              <p className="text-sm text-gray-700 dark:text-gray-300">
                                {generatedProtocol.calculations[paramKey]}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 font-medium text-black dark:text-white">
                    Reporting
                  </div>
                  <div className="p-3 space-y-3">
                    <div>
                      <h4 className="text-sm font-medium mb-1 text-black dark:text-white">
                        Conclusion Criteria:
                      </h4>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {generatedProtocol.reporting.conclusion_criteria}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-1 text-black dark:text-white">
                        Documentation:
                      </h4>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {generatedProtocol.reporting.documentation}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-gray-500 dark:text-gray-400">
                  Enter method details and click "Generate Protocol" to see results.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between p-4 border-t border-gray-200 dark:border-gray-800">
        {activeTab === 'input' ? (
          <>
            <Button variant="outline" onClick={() => setMethodDescription('')}>
              Clear Description
            </Button>
            <Button
              disabled={loading}
              onClick={handleGenerate}
              className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Beaker className="mr-2 h-4 w-4" />
                  Generate Protocol
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setActiveTab('input')}>
              Back to Input
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => copyToClipboard(formatProtocolText())}>
                <Clipboard className="mr-2 h-4 w-4" />
                Copy as Text
              </Button>
              <Button className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200">
                <FileText className="mr-2 h-4 w-4" />
                Export as PDF
              </Button>
            </div>
          </>
        )}
      </CardFooter>
    </Card>
  );
};

export default MethodValidationGenerator;
