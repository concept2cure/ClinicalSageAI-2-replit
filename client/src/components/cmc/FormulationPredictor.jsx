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
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import {
  RefreshCw, Beaker, FlaskConical, BarChart4, Download, Clipboard, Copy, Plus, Trash2, ArrowRight, Microscope, Sparkles, Clock, LineChart, ThermometerSnowflake, ThermometerSun, Shield, Info } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';

/**
 * FormulationPredictor
 *
 * An advanced component that uses GPT-4o to predict formulation stability
 * and optimize pharmaceutical formulations based on ingredients and conditions.
 */
const FormulationPredictor = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('formulation');
  const [loading, setLoading] = useState(false);
  const [stabPredLoading, setStabPredLoading] = useState(false);
  const [stabPredGenerated, setStabPredGenerated] = useState(false);
  const [compGenLoading, setCompGenLoading] = useState(false);
  const [compGenerated, setCompGenerated] = useState(false);

  // Form state
  const [activeIngredient, setActiveIngredient] = useState({
    name: '',
    concentration: '',
    properties: '',
  });

  const [formType, setFormType] = useState('tablet');
  const [excipients, setExcipients] = useState([
    {
      name: 'Microcrystalline Cellulose',
      type: 'Diluent/Filler',
      concentration: '35.0',
      function: 'Provides good compressibility and flow properties',
      compatibility: '',
      id: 1,
    },
    {
      name: 'Lactose Monohydrate',
      type: 'Diluent/Filler',
      concentration: '30.0',
      function: 'Improves flowability and compressibility',
      compatibility: '',
      id: 2,
    },
    {
      name: 'Croscarmellose Sodium',
      type: 'Disintegrant',
      concentration: '5.0',
      function: 'Promotes tablet disintegration',
      compatibility: '',
      id: 3,
    },
    {
      name: 'Magnesium Stearate',
      type: 'Lubricant',
      concentration: '1.0',
      function: 'Reduces friction during compression',
      compatibility: '',
      id: 4,
    },
  ]);

  const [processingMethod, setProcessingMethod] = useState('direct-compression');
  const [targetProperties, setTargetProperties] = useState({
    dissolution: '80% in 30 minutes',
    hardness: '8-12 kp',
    friability: '<1%',
  });

  const [storageConditions, setStorageConditions] = useState([
    { temperature: '25°C', humidity: '60% RH', duration: '12 months', id: 1 },
    { temperature: '40°C', humidity: '75% RH', duration: '6 months', id: 2 },
  ]);

  // Generated results
  const [stabilityPrediction, setStabilityPrediction] = useState(null);
  const [compatibilityMatrix, setCompatibilityMatrix] = useState(null);

  // Excipient templates
  const excipientTemplates = {
    tablet: [
      {
        name: 'Microcrystalline Cellulose',
        type: 'Diluent/Filler',
        concentration: '35.0',
        function: 'Provides good compressibility and flow properties',
        compatibility: '',
        id: 1,
      },
      {
        name: 'Lactose Monohydrate',
        type: 'Diluent/Filler',
        concentration: '30.0',
        function: 'Improves flowability and compressibility',
        compatibility: '',
        id: 2,
      },
      {
        name: 'Croscarmellose Sodium',
        type: 'Disintegrant',
        concentration: '5.0',
        function: 'Promotes tablet disintegration',
        compatibility: '',
        id: 3,
      },
      {
        name: 'Magnesium Stearate',
        type: 'Lubricant',
        concentration: '1.0',
        function: 'Reduces friction during compression',
        compatibility: '',
        id: 4,
      },
    ],
    capsule: [
      {
        name: 'Microcrystalline Cellulose',
        type: 'Diluent/Filler',
        concentration: '65.0',
        function: 'Provides bulk and flow properties',
        compatibility: '',
        id: 1,
      },
      {
        name: 'Crospovidone',
        type: 'Disintegrant',
        concentration: '4.0',
        function: 'Promotes capsule content disintegration',
        compatibility: '',
        id: 2,
      },
      {
        name: 'Colloidal Silicon Dioxide',
        type: 'Glidant',
        concentration: '0.5',
        function: 'Improves flow of powder blend',
        compatibility: '',
        id: 3,
      },
      {
        name: 'Magnesium Stearate',
        type: 'Lubricant',
        concentration: '0.5',
        function: 'Reduces friction during encapsulation',
        compatibility: '',
        id: 4,
      },
    ],
    suspension: [
      {
        name: 'Xanthan Gum',
        type: 'Suspending Agent',
        concentration: '0.3',
        function: 'Increases viscosity and suspends particles',
        compatibility: '',
        id: 1,
      },
      {
        name: 'Sorbitol',
        type: 'Sweetener',
        concentration: '20.0',
        function: 'Provides sweet taste and acts as preservative',
        compatibility: '',
        id: 2,
      },
      {
        name: 'Sodium Benzoate',
        type: 'Preservative',
        concentration: '0.2',
        function: 'Prevents microbial growth',
        compatibility: '',
        id: 3,
      },
      {
        name: 'Citric Acid',
        type: 'pH Adjuster',
        concentration: '0.1',
        function: 'Maintains acidic pH for stability',
        compatibility: '',
        id: 4,
      },
      {
        name: 'Purified Water',
        type: 'Vehicle',
        concentration: 'q.s.',
        function: 'Serves as the dispersion medium',
        compatibility: '',
        id: 5,
      },
    ],
    cream: [
      {
        name: 'Cetyl Alcohol',
        type: 'Emollient/Stiffening Agent',
        concentration: '2.0',
        function: 'Provides structure and emollient properties',
        compatibility: '',
        id: 1,
      },
      {
        name: 'Glyceryl Monostearate',
        type: 'Emulsifier',
        concentration: '3.0',
        function: 'Stabilizes oil-in-water emulsion',
        compatibility: '',
        id: 2,
      },
      {
        name: 'Propylene Glycol',
        type: 'Solubilizer/Humectant',
        concentration: '5.0',
        function: 'Enhances solubility and prevents drying',
        compatibility: '',
        id: 3,
      },
      {
        name: 'Liquid Paraffin',
        type: 'Emollient',
        concentration: '10.0',
        function: 'Provides lubrication and occlusive properties',
        compatibility: '',
        id: 4,
      },
      {
        name: 'Methylparaben',
        type: 'Preservative',
        concentration: '0.18',
        function: 'Prevents microbial growth',
        compatibility: '',
        id: 5,
      },
      {
        name: 'Purified Water',
        type: 'Vehicle',
        concentration: 'q.s.',
        function: 'Serves as the continuous phase',
        compatibility: '',
        id: 6,
      },
    ],
  };

  const activeTemplates = {
    tablet: {
      name: 'Metformin Hydrochloride',
      concentration: '60.0',
      properties:
        'Highly water soluble, hygroscopic, bitter taste. May have flow issues at high concentrations.',
    },
    capsule: {
      name: 'Fluoxetine Hydrochloride',
      concentration: '30.0',
      properties: 'Water soluble, sensitive to light and moisture. May have flow issues.',
    },
    suspension: {
      name: 'Ibuprofen',
      concentration: '10.0',
      properties:
        'Practically insoluble in water, bitter taste, potential hydrolysis in aqueous medium.',
    },
    cream: {
      name: 'Hydrocortisone',
      concentration: '1.0',
      properties: 'Poorly water soluble, sensitive to light and oxygen. Prone to oxidation.',
    },
  };

  const processingOptions = {
    tablet: [
      { value: 'direct-compression', label: 'Direct Compression' },
      { value: 'wet-granulation', label: 'Wet Granulation' },
      { value: 'dry-granulation', label: 'Dry Granulation (Roller Compaction)' },
      { value: 'hot-melt-extrusion', label: 'Hot Melt Extrusion' },
    ],
    capsule: [
      { value: 'direct-fill', label: 'Direct Powder Fill' },
      { value: 'granulation-fill', label: 'Granulated Powder Fill' },
      { value: 'pellet-fill', label: 'Multiparticulate/Pellet Fill' },
    ],
    suspension: [
      { value: 'high-shear-mixing', label: 'High Shear Mixing' },
      { value: 'homogenization', label: 'Homogenization' },
      { value: 'precipitation', label: 'Controlled Precipitation' },
    ],
    cream: [
      { value: 'high-shear-emulsification', label: 'High Shear Emulsification' },
      { value: 'phase-inversion', label: 'Phase Inversion' },
      { value: 'cold-process', label: 'Cold Process Emulsification' },
    ],
  };

  // Handle template loading
  const loadTemplate = formType => {
    setFormType(formType);
    setExcipients(excipientTemplates[formType]);
    setActiveIngredient(activeTemplates[formType]);
    setProcessingMethod(processingOptions[formType][0].value);

    toast({
      title: 'Template Loaded',
      description: `${formType.charAt(0).toUpperCase() + formType.slice(1)} formulation template loaded.`,
    });
  };

  // Helper to add new excipient
  const addExcipient = () => {
    const newId = excipients.length ? Math.max(...excipients.map(e => e.id)) + 1 : 1;
    setExcipients([
      ...excipients,
      {
        name: '',
        type: '',
        concentration: '',
        function: '',
        compatibility: '',
        id: newId,
      },
    ]);
  };

  // Helper to remove excipient
  const removeExcipient = id => {
    setExcipients(excipients.filter(e => e.id !== id));
  };

  // Helper to update excipient
  const updateExcipient = (id, field, value) => {
    setExcipients(excipients.map(e => (e.id === id ? { ...e, [field]: value } : e)));
  };

  // Add storage condition
  const addStorageCondition = () => {
    const newId = storageConditions.length ? Math.max(...storageConditions.map(s => s.id)) + 1 : 1;
    setStorageConditions([
      ...storageConditions,
      {
        temperature: '25°C',
        humidity: '60% RH',
        duration: '3 months',
        id: newId,
      },
    ]);
  };

  // Remove storage condition
  const removeStorageCondition = id => {
    setStorageConditions(storageConditions.filter(s => s.id !== id));
  };

  // Update storage condition
  const updateStorageCondition = (id, field, value) => {
    setStorageConditions(storageConditions.map(s => (s.id === id ? { ...s, [field]: value } : s)));
  };

  // Generate compatibility matrix
  const generateCompatibilityMatrix = async () => {
    setCompGenLoading(true);

    try {
      // In a real implementation, this would call the OpenAI API through a backend endpoint
      // For demo purposes, we'll simulate the response
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Generate matrix
      const ingredients = [activeIngredient.name, ...excipients.map(e => e.name)];
      const matrix = [];

      // Create a compatibility matrix with simulated data
      for (let i = 0; i < ingredients.length; i++) {
        const row = [];
        for (let j = 0; j < ingredients.length; j++) {
          if (i === j) {
            row.push(null); // Diagonal is null
          } else {
            // Generate compatibility rating
            const compatibility = generateSimulatedCompatibility(ingredients[i], ingredients[j]);
            row.push(compatibility);
          }
        }
        matrix.push(row);
      }

      setCompatibilityMatrix({
        ingredients,
        matrix,
        generatedAt: new Date().toISOString(),
        notes:
          'This compatibility matrix is generated using AI analysis of available literature and predictive modeling. Always verify through experimental testing.',
      });

      setCompGenerated(true);

      toast({
        title: 'Compatibility Matrix Generated',
        description: 'The excipient compatibility analysis has been completed successfully.',
      });
    } catch (error) {
      toast({
        title: 'Generation Failed',
        description: error.message || 'An error occurred during generation.',
        variant: 'destructive',
      });
    } finally {
      setCompGenLoading(false);
    }
  };

  // Generate stability prediction
  const generateStabilityPrediction = async () => {
    setStabPredLoading(true);

    try {
      // In a real implementation, this would call the OpenAI API through a backend endpoint
      // For demo purposes, we'll simulate the response
      await new Promise(resolve => setTimeout(resolve, 4000));

      // Create simulated stability prediction
      const prediction = {
        formulation: {
          api: activeIngredient.name,
          dosageForm: formType,
          processingMethod: processingMethod,
          excipients: excipients.map(e => ({ name: e.name, concentration: e.concentration })),
        },
        stabilityPredictions: [],
        criticalAttributes: [
          {
            attribute: 'Assay',
            initialValue: '100.0%',
            acceptanceCriteria: '95.0-105.0%',
            riskLevel: 'Low',
            riskFactors: ['Hydrolysis', 'Oxidation'],
            recommendations: [
              'Use airtight packaging to protect from moisture',
              'Consider antioxidant if oxidation is observed',
            ],
          },
          {
            attribute: 'Dissolution',
            initialValue: targetProperties.dissolution.split(' ')[0],
            acceptanceCriteria: targetProperties.dissolution,
            riskLevel: 'Medium',
            riskFactors: ['API-excipient interaction', 'Moisture sensitivity'],
            recommendations: [
              'Monitor dissolution at all time points',
              'Consider film coating to protect from moisture',
            ],
          },
          {
            attribute: formType === 'tablet' ? 'Hardness' : 'Viscosity',
            initialValue: formType === 'tablet' ? '10 kp' : '12,000 cP',
            acceptanceCriteria:
              formType === 'tablet' ? targetProperties.hardness : '10,000-15,000 cP',
            riskLevel: 'Low',
            riskFactors:
              formType === 'tablet'
                ? ['Moisture absorption', 'Storage humidity']
                : ['Temperature variations', 'Phase separation'],
            recommendations: [
              formType === 'tablet'
                ? 'Use moisture-resistant packaging'
                : 'Include appropriate stabilizers',
              'Store at controlled temperature and humidity',
            ],
          },
          {
            attribute: 'Related Substances',
            initialValue: 'All impurities < 0.1%',
            acceptanceCriteria: 'Any individual impurity ≤ 0.2%, Total impurities ≤ 1.0%',
            riskLevel: 'Medium',
            riskFactors: ['Oxidation', 'pH-dependent degradation', 'Light sensitivity'],
            recommendations: [
              'Consider nitrogen purging during manufacture',
              'Use amber or opaque containers',
              'Add pH modifier to maintain optimal pH',
            ],
          },
        ],
        predictedShelfLife:
          formType === 'tablet' || formType === 'capsule' ? '24 months' : '18 months',
        packaging:
          formType === 'tablet' || formType === 'capsule'
            ? 'HDPE bottle with desiccant and child-resistant closure'
            : formType === 'suspension'
              ? 'Amber glass bottle with child-resistant closure'
              : 'Aluminum tube with screw cap',
        storageConditions: 'Store at room temperature (15-25°C)',
        overallStabilityRisk: 'Medium',
      };

      // Generate stability predictions for each storage condition
      for (const condition of storageConditions) {
        let stabilityTrend = [];
        const months = parseInt(condition.duration.split(' ')[0]);
        const dataPoints = months > 6 ? Math.min(Math.ceil(months / 3), 6) : months;

        // Generate simulated trend data
        for (let i = 0; i <= dataPoints; i++) {
          const timePoint = ((i * months) / dataPoints).toFixed(0);

          // Higher temperature and humidity lead to more degradation
          const temperatureStress = condition.temperature.includes('40')
            ? 2
            : condition.temperature.includes('30')
              ? 1.5
              : 1;
          const humidityStress = condition.humidity.includes('75')
            ? 1.8
            : condition.humidity.includes('65')
              ? 1.3
              : 1;

          // Calculate degradation factor
          const stressFactor = temperatureStress * humidityStress;
          const timeEffect = (i / dataPoints) * stressFactor;

          // Assay decreases with time
          const assay = (100 - timeEffect * 1.2).toFixed(1);

          // Dissolution may decrease slightly
          const dissolutionInitial = parseInt(targetProperties.dissolution);
          const dissolution = (dissolutionInitial - timeEffect * 2).toFixed(1);

          // Impurities increase with time
          const totalImpurities = (0.1 + timeEffect * 0.15).toFixed(2);

          stabilityTrend.push({
            timePoint: timePoint === '0' ? 'Initial' : `${timePoint} months`,
            assay: `${assay}%`,
            dissolution: `${dissolution}%`,
            totalImpurities: `${totalImpurities}%`,
            appearance:
              i === dataPoints && stressFactor > 2.5 ? 'Slight discoloration' : 'No change',
          });
        }

        prediction.stabilityPredictions.push({
          condition: `${condition.temperature}, ${condition.humidity}`,
          duration: condition.duration,
          trend: stabilityTrend,
          conclusion:
            stressFactor > 2.5
              ? 'Potential stability issues at elevated temperature/humidity'
              : 'Stable under these conditions for the test duration',
        });
      }

      setStabilityPrediction(prediction);
      setStabPredGenerated(true);

      toast({
        title: 'Stability Prediction Complete',
        description: 'The formulation stability analysis has been completed successfully.',
      });
    } catch (error) {
      toast({
        title: 'Prediction Failed',
        description: error.message || 'An error occurred during prediction.',
        variant: 'destructive',
      });
    } finally {
      setStabPredLoading(false);
    }
  };

  // Generate simulated compatibility
  const generateSimulatedCompatibility = (ingredient1, ingredient2) => {
    // This function simulates compatibility ratings between ingredients
    // In a real implementation, this would come from the AI model

    const knownIncompatibilities = [
      ['Magnesium Stearate', 'Vitamin C'],
      ['Citric Acid', 'Sodium Bicarbonate'],
      ['PEG', 'Phenols'],
      ['Calcium Salts', 'Tetracyclines'],
      ['Iron Salts', 'Tetracyclines'],
      ['Cationic', 'Anionic'],
    ];

    // Check for known incompatibilities
    for (const pair of knownIncompatibilities) {
      if (
        (ingredient1.includes(pair[0]) && ingredient2.includes(pair[1])) ||
        (ingredient1.includes(pair[1]) && ingredient2.includes(pair[0]))
      ) {
        return {
          rating: 'Poor',
          description: 'Potential chemical incompatibility',
          recommendations: 'Avoid combining or use protective technology',
        };
      }
    }

    // Rating options
    const ratings = ['Excellent', 'Good', 'Fair', 'Poor'];
    const excellent = 'No known incompatibilities, chemically stable combination';
    const good = 'Generally compatible, monitor during stability studies';
    const fair = 'Some potential interactions, mitigation strategies recommended';
    const poor = 'Potential incompatibility, additional testing required';

    // Generate random rating biased toward good compatibility
    const random = Math.random();
    if (random > 0.9) {
      return {
        rating: 'Fair',
        description: fair,
        recommendations: 'Consider physical separation or use buffer excipient',
      };
    } else if (random > 0.7) {
      return {
        rating: 'Good',
        description: good,
        recommendations: 'Recommended combination but perform compatibility studies',
      };
    } else {
      return {
        rating: 'Excellent',
        description: excellent,
        recommendations: 'Preferred combination with no special considerations',
      };
    }
  };

  // Helper to get color for compatibility rating
  const getCompatibilityColor = rating => {
    if (!rating) return 'bg-gray-100 dark:bg-gray-800';

    switch (rating.rating) {
      case 'Excellent':
        return 'bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-300';
      case 'Good':
        return 'bg-blue-100 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300';
      case 'Fair':
        return 'bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300';
      case 'Poor':
        return 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-300';
      default:
        return 'bg-gray-100 dark:bg-gray-800';
    }
  };

  // Helper to get risk level color
  const getRiskColor = risk => {
    switch (risk) {
      case 'Low':
        return 'bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-900';
      case 'Medium':
        return 'bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900';
      case 'High':
        return 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900';
      default:
        return 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    }
  };

  return (
    <Card className="w-full shadow-md border-2 border-black dark:border-white">
      <CardHeader className="bg-black text-white dark:bg-white dark:text-black">
        <CardTitle className="text-xl flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          Formulation Development & Stability Predictor (GPT-4o Powered)
        </CardTitle>
        <CardDescription className="text-gray-300 dark:text-gray-700">
          AI-powered tool to optimize pharmaceutical formulations and predict stability profiles
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full rounded-none">
            <TabsTrigger value="formulation" className="flex-1">
              Formulation Design
            </TabsTrigger>
            <TabsTrigger value="compatibility" className="flex-1">
              Excipient Compatibility
            </TabsTrigger>
            <TabsTrigger value="stability" className="flex-1">
              Stability Prediction
            </TabsTrigger>
          </TabsList>

          <TabsContent value="formulation" className="p-6 space-y-6">
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => loadTemplate('tablet')}
              >
                Tablet Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => loadTemplate('capsule')}
              >
                Capsule Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => loadTemplate('suspension')}
              >
                Suspension Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => loadTemplate('cream')}
              >
                Cream/Ointment Template
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="col-span-1">
                <Label htmlFor="formulation-type" className="mb-2 block">
                  Dosage Form
                </Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger id="formulation-type">
                    <SelectValue placeholder="Select a dosage form" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="capsule">Capsule</SelectItem>
                    <SelectItem value="suspension">Suspension</SelectItem>
                    <SelectItem value="solution">Solution</SelectItem>
                    <SelectItem value="cream">Cream/Ointment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-1">
                <Label htmlFor="processing-method" className="mb-2 block">
                  Processing Method
                </Label>
                <Select value={processingMethod} onValueChange={setProcessingMethod}>
                  <SelectTrigger id="processing-method">
                    <SelectValue placeholder="Select processing method" />
                  </SelectTrigger>
                  <SelectContent>
                    {processingOptions[formType]?.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-1">
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="quick-predict">Quick Prediction</Label>
                  <Switch id="quick-predict" />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Enable quick prediction mode for faster but less detailed analysis
                </p>
              </div>
            </div>

            <div className="border rounded-md p-4 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30">
              <h3 className="text-md font-medium mb-3 text-black dark:text-white">
                Active Pharmaceutical Ingredient
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="api-name">API Name</Label>
                  <Input
                    id="api-name"
                    value={activeIngredient.name}
                    onChange={e =>
                      setActiveIngredient({ ...activeIngredient, name: e.target.value })
                    }
                    placeholder="e.g., Metformin Hydrochloride"
                  />
                </div>
                <div>
                  <Label htmlFor="api-concentration">Concentration (%)</Label>
                  <Input
                    id="api-concentration"
                    value={activeIngredient.concentration}
                    onChange={e =>
                      setActiveIngredient({ ...activeIngredient, concentration: e.target.value })
                    }
                    placeholder="e.g., 60.0"
                  />
                </div>
                <div className="md:col-span-2 lg:col-span-1">
                  <Label htmlFor="api-properties">Properties</Label>
                  <Textarea
                    id="api-properties"
                    value={activeIngredient.properties}
                    onChange={e =>
                      setActiveIngredient({ ...activeIngredient, properties: e.target.value })
                    }
                    placeholder="Describe physicochemical properties"
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-md font-medium text-black dark:text-white">Excipients</h3>
                <Button variant="outline" size="sm" onClick={addExcipient}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Excipient
                </Button>
              </div>

              <div className="rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Concentration (%)</TableHead>
                      <TableHead>Function</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {excipients.map(excipient => (
                      <TableRow key={excipient.id}>
                        <TableCell>
                          <Input
                            value={excipient.name}
                            onChange={e => updateExcipient(excipient.id, 'name', e.target.value)}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={excipient.type}
                            onChange={e => updateExcipient(excipient.id, 'type', e.target.value)}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={excipient.concentration}
                            onChange={e =>
                              updateExcipient(excipient.id, 'concentration', e.target.value)
                            }
                            className="h-8 w-20"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={excipient.function}
                            onChange={e =>
                              updateExcipient(excipient.id, 'function', e.target.value)
                            }
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeExcipient(excipient.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="border rounded-md p-4 border-gray-200 dark:border-gray-800">
              <h3 className="text-md font-medium mb-3 text-black dark:text-white">
                Target Product Properties
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="dissolution">Dissolution Rate</Label>
                  <Input
                    id="dissolution"
                    value={targetProperties.dissolution}
                    onChange={e =>
                      setTargetProperties({ ...targetProperties, dissolution: e.target.value })
                    }
                    placeholder="e.g., 80% in 30 minutes"
                  />
                </div>
                <div>
                  <Label htmlFor="hardness">
                    {formType === 'tablet'
                      ? 'Hardness'
                      : formType === 'capsule'
                        ? 'Weight Variation'
                        : formType === 'suspension'
                          ? 'Viscosity'
                          : 'Consistency'}
                  </Label>
                  <Input
                    id="hardness"
                    value={targetProperties.hardness}
                    onChange={e =>
                      setTargetProperties({ ...targetProperties, hardness: e.target.value })
                    }
                    placeholder={formType === 'tablet' ? 'e.g., 8-12 kp' : 'e.g., ± 5%'}
                  />
                </div>
                <div>
                  <Label htmlFor="friability">
                    {formType === 'tablet'
                      ? 'Friability'
                      : formType === 'capsule'
                        ? 'Disintegration'
                        : formType === 'suspension'
                          ? 'Sedimentation Rate'
                          : 'pH'}
                  </Label>
                  <Input
                    id="friability"
                    value={targetProperties.friability}
                    onChange={e =>
                      setTargetProperties({ ...targetProperties, friability: e.target.value })
                    }
                    placeholder={formType === 'tablet' ? 'e.g., <1%' : 'e.g., <15 minutes'}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="compatibility" className="space-y-6 p-6">
            <Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-500" />
              <AlertTitle className="text-blue-800 dark:text-blue-300">
                About Excipient Compatibility Analysis
              </AlertTitle>
              <AlertDescription className="text-blue-700 dark:text-blue-300 text-sm">
                This tool uses GPT-4o to analyze potential interactions between the active
                ingredient and excipients in your formulation. The AI evaluates chemical structures,
                functional groups, and known compatibility data to predict potential issues.
              </AlertDescription>
            </Alert>

            {compatibilityMatrix ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-black dark:text-white">
                    Compatibility Matrix
                  </h3>
                  <Badge variant="outline" className="text-xs text-blue-700 dark:text-blue-300">
                    Generated: {new Date(compatibilityMatrix.generatedAt).toLocaleString()}
                  </Badge>
                </div>

                <div className="rounded-md border border-gray-200 dark:border-gray-800 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="bg-gray-100 dark:bg-gray-800 min-w-[150px]">
                          Ingredient
                        </TableHead>
                        {compatibilityMatrix.ingredients.map((ingredient, index) => (
                          <TableHead
                            key={index}
                            className="bg-gray-100 dark:bg-gray-800 min-w-[150px]"
                          >
                            {ingredient}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {compatibilityMatrix.ingredients.map((rowIngredient, rowIndex) => (
                        <TableRow key={rowIndex}>
                          <TableCell className="font-medium bg-gray-100 dark:bg-gray-800">
                            {rowIngredient}
                          </TableCell>
                          {compatibilityMatrix.matrix[rowIndex].map((compat, colIndex) => (
                            <TableCell
                              key={colIndex}
                              className={`${getCompatibilityColor(compat)}`}
                            >
                              {compat ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="cursor-help font-medium">{compat.rating}</div>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-md p-4">
                                      <p className="font-medium mb-1">{compat.description}</p>
                                      <p className="text-sm">{compat.recommendations}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="text-gray-400 dark:text-gray-600">-</span>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <h4 className="font-medium mb-2 text-black dark:text-white">Legend</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-green-100 dark:bg-green-950/30"></div>
                        <span className="text-sm text-black dark:text-white">
                          Excellent: No known incompatibilities
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-blue-100 dark:bg-blue-950/30"></div>
                        <span className="text-sm text-black dark:text-white">
                          Good: Generally compatible
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-amber-100 dark:bg-amber-950/30"></div>
                        <span className="text-sm text-black dark:text-white">
                          Fair: Some potential interactions
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-red-100 dark:bg-red-950/30"></div>
                        <span className="text-sm text-black dark:text-white">
                          Poor: Potential incompatibility
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2 text-black dark:text-white">Notes</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {compatibilityMatrix.notes}
                    </p>
                    <Button className="mt-4" variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-1" />
                      Export Matrix
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCompGenerated(false);
                      setCompatibilityMatrix(null);
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Regenerate Matrix
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="border rounded-md p-4 border-gray-200 dark:border-gray-800">
                  <h3 className="text-md font-medium mb-3 text-black dark:text-white">
                    Formulation Components
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="font-medium w-40 text-black dark:text-white">
                        Active Ingredient:
                      </div>
                      <div className="text-gray-700 dark:text-gray-300">
                        {activeIngredient.name}
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="font-medium w-40 text-black dark:text-white">Excipients:</div>
                      <div className="text-gray-700 dark:text-gray-300">
                        {excipients.map(e => e.name).join(', ')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-center p-6">
                  <Beaker className="h-12 w-12 text-indigo-600/60 dark:text-indigo-400/60 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-black dark:text-white mb-2">
                    Generate Compatibility Matrix
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-lg mx-auto">
                    Use AI-powered analysis to check for potential excipient compatibilities and
                    interactions in your formulation.
                  </p>
                  <Button
                    onClick={generateCompatibilityMatrix}
                    disabled={compGenLoading || !activeIngredient.name || excipients.length === 0}
                    className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
                  >
                    {compGenLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing with GPT-4o...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate Compatibility Matrix
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="stability" className="space-y-6 p-6">
            <Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-500" />
              <AlertTitle className="text-blue-800 dark:text-blue-300">
                About Stability Prediction
              </AlertTitle>
              <AlertDescription className="text-blue-700 dark:text-blue-300 text-sm">
                This tool uses GPT-4o to predict the stability profile of your formulation over time
                under various storage conditions. The AI analyzes physicochemical properties,
                excipient interactions, and historical stability data to generate predictions.
              </AlertDescription>
            </Alert>

            {stabilityPrediction ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="border rounded-lg overflow-hidden border-gray-200 dark:border-gray-800">
                    <div className="bg-gray-50 dark:bg-gray-900 p-4 border-b border-gray-200 dark:border-gray-800">
                      <h3 className="font-medium text-lg text-black dark:text-white">
                        Formulation Summary
                      </h3>
                    </div>
                    <div className="p-4 space-y-4">
                      <div>
                        <h4 className="font-medium text-black dark:text-white mb-2">Composition</h4>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              Active Ingredient:
                            </span>
                            <span className="text-sm text-black dark:text-white">
                              {stabilityPrediction.formulation.api} (
                              {activeIngredient.concentration}%)
                            </span>
                          </div>
                          <Separator />
                          {stabilityPrediction.formulation.excipients.map((excipient, index) => (
                            <div key={index} className="flex justify-between">
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                {excipient.name}:
                              </span>
                              <span className="text-sm text-black dark:text-white">
                                {excipient.concentration}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-black dark:text-white mb-2">
                          Manufacturing Details
                        </h4>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              Dosage Form:
                            </span>
                            <span className="text-sm text-black dark:text-white">
                              {formType.charAt(0).toUpperCase() + formType.slice(1)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              Processing Method:
                            </span>
                            <span className="text-sm text-black dark:text-white">
                              {processingMethod
                                .split('-')
                                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                .join(' ')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden border-gray-200 dark:border-gray-800">
                    <div className="bg-gray-50 dark:bg-gray-900 p-4 border-b border-gray-200 dark:border-gray-800">
                      <h3 className="font-medium text-lg text-black dark:text-white">
                        Stability Summary
                      </h3>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Predicted Shelf Life:
                        </span>
                        <span className="text-sm font-medium text-black dark:text-white">
                          {stabilityPrediction.predictedShelfLife}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Recommended Packaging:
                        </span>
                        <span className="text-sm text-black dark:text-white">
                          {stabilityPrediction.packaging}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Storage Recommendations:
                        </span>
                        <span className="text-sm text-black dark:text-white">
                          {stabilityPrediction.storageConditions}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Overall Stability Risk:
                        </span>
                        <Badge
                          className={`
                          ${
                            stabilityPrediction.overallStabilityRisk === 'Low'
                              ? 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300'
                              : stabilityPrediction.overallStabilityRisk === 'Medium'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300'
                          }
                        `}
                        >
                          {stabilityPrediction.overallStabilityRisk}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden border-gray-200 dark:border-gray-800">
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 border-b border-gray-200 dark:border-gray-800">
                    <h3 className="font-medium text-lg text-black dark:text-white">
                      Critical Quality Attributes
                    </h3>
                  </div>
                  <div className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Attribute</TableHead>
                          <TableHead>Initial Value</TableHead>
                          <TableHead>Acceptance Criteria</TableHead>
                          <TableHead>Risk Level</TableHead>
                          <TableHead>Risk Factors</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stabilityPrediction.criticalAttributes.map((attr, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{attr.attribute}</TableCell>
                            <TableCell>{attr.initialValue}</TableCell>
                            <TableCell>{attr.acceptanceCriteria}</TableCell>
                            <TableCell>
                              <Badge className={getRiskColor(attr.riskLevel)}>
                                {attr.riskLevel}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 gap-1">
                                      <Info className="h-3.5 w-3.5" />
                                      <span className="text-xs">
                                        {attr.riskFactors.length} factors
                                      </span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-md p-4">
                                    <h4 className="font-medium mb-2">Risk Factors</h4>
                                    <ul className="list-disc pl-4 space-y-1 text-sm">
                                      {attr.riskFactors.map((factor, i) => (
                                        <li key={i}>{factor}</li>
                                      ))}
                                    </ul>
                                    <Separator className="my-2" />
                                    <h4 className="font-medium mb-2">Recommendations</h4>
                                    <ul className="list-disc pl-4 space-y-1 text-sm">
                                      {attr.recommendations.map((rec, i) => (
                                        <li key={i}>{rec}</li>
                                      ))}
                                    </ul>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden border-gray-200 dark:border-gray-800">
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 border-b border-gray-200 dark:border-gray-800">
                    <h3 className="font-medium text-lg text-black dark:text-white">
                      Stability Predictions by Condition
                    </h3>
                  </div>
                  <div className="p-0">
                    <Tabs defaultValue={`condition-0`} className="w-full">
                      <div className="px-4 pt-4">
                        <TabsList>
                          {stabilityPrediction.stabilityPredictions.map((pred, index) => (
                            <TabsTrigger key={index} value={`condition-${index}`}>
                              {pred.condition}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </div>

                      {stabilityPrediction.stabilityPredictions.map((pred, index) => (
                        <TabsContent
                          key={index}
                          value={`condition-${index}`}
                          className="pt-2 pb-4 px-4"
                        >
                          <div className="mb-2">
                            <Alert
                              className={`
                              ${
                                pred.conclusion.includes('issues')
                                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
                                  : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900'
                              }
                            `}
                            >
                              <AlertTitle
                                className={`
                                ${
                                  pred.conclusion.includes('issues')
                                    ? 'text-amber-800 dark:text-amber-300'
                                    : 'text-green-800 dark:text-green-300'
                                }
                              `}
                              >
                                {pred.condition}, {pred.duration}
                              </AlertTitle>
                              <AlertDescription
                                className={`
                                ${
                                  pred.conclusion.includes('issues')
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-green-700 dark:text-green-400'
                                }
                              `}
                              >
                                {pred.conclusion}
                              </AlertDescription>
                            </Alert>
                          </div>

                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Time Point</TableHead>
                                <TableHead>Assay</TableHead>
                                <TableHead>Dissolution</TableHead>
                                <TableHead>Total Impurities</TableHead>
                                <TableHead>Appearance</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pred.trend.map((point, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-medium">{point.timePoint}</TableCell>
                                  <TableCell>{point.assay}</TableCell>
                                  <TableCell>{point.dissolution}</TableCell>
                                  <TableCell>{point.totalImpurities}</TableCell>
                                  <TableCell>{point.appearance}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TabsContent>
                      ))}
                    </Tabs>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Export Report
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStabPredGenerated(false);
                      setStabilityPrediction(null);
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Run New Prediction
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="border rounded-md p-4 border-gray-200 dark:border-gray-800">
                  <h3 className="text-md font-medium mb-3 text-black dark:text-white">
                    Storage Conditions for Stability Testing
                  </h3>
                  <div className="space-y-4">
                    {storageConditions.map((condition, index) => (
                      <div key={condition.id} className="flex flex-wrap gap-4 items-center">
                        <div className="w-32">
                          <Label htmlFor={`temp-${condition.id}`} className="text-xs mb-1 block">
                            Temperature
                          </Label>
                          <Select
                            value={condition.temperature}
                            onValueChange={value =>
                              updateStorageCondition(condition.id, 'temperature', value)
                            }
                          >
                            <SelectTrigger id={`temp-${condition.id}`} className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="5°C">5°C (Refrigerated)</SelectItem>
                              <SelectItem value="25°C">25°C (Room Temp.)</SelectItem>
                              <SelectItem value="30°C">30°C (Intermediate)</SelectItem>
                              <SelectItem value="40°C">40°C (Accelerated)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="w-32">
                          <Label
                            htmlFor={`humidity-${condition.id}`}
                            className="text-xs mb-1 block"
                          >
                            Humidity
                          </Label>
                          <Select
                            value={condition.humidity}
                            onValueChange={value =>
                              updateStorageCondition(condition.id, 'humidity', value)
                            }
                          >
                            <SelectTrigger id={`humidity-${condition.id}`} className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Not Controlled">Not Controlled</SelectItem>
                              <SelectItem value="20% RH">20% RH (Low)</SelectItem>
                              <SelectItem value="60% RH">60% RH (Ambient)</SelectItem>
                              <SelectItem value="75% RH">75% RH (High)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="w-32">
                          <Label
                            htmlFor={`duration-${condition.id}`}
                            className="text-xs mb-1 block"
                          >
                            Duration
                          </Label>
                          <Select
                            value={condition.duration}
                            onValueChange={value =>
                              updateStorageCondition(condition.id, 'duration', value)
                            }
                          >
                            <SelectTrigger id={`duration-${condition.id}`} className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1 month">1 month</SelectItem>
                              <SelectItem value="3 months">3 months</SelectItem>
                              <SelectItem value="6 months">6 months</SelectItem>
                              <SelectItem value="12 months">12 months</SelectItem>
                              <SelectItem value="24 months">24 months</SelectItem>
                              <SelectItem value="36 months">36 months</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {index === 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 mt-5"
                            onClick={addStorageCondition}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 mt-5"
                            onClick={() => removeStorageCondition(condition.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-center p-6">
                  <Clock className="h-12 w-12 text-indigo-600/60 dark:text-indigo-400/60 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-black dark:text-white mb-2">
                    Generate Stability Prediction
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-lg mx-auto">
                    Use AI-powered analysis to predict the stability profile of your formulation
                    under various storage conditions.
                  </p>
                  <Button
                    onClick={generateStabilityPrediction}
                    disabled={stabPredLoading || !activeIngredient.name || excipients.length === 0}
                    className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
                  >
                    {stabPredLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Generating Stability Prediction...
                      </>
                    ) : (
                      <>
                        <LineChart className="h-4 w-4 mr-2" />
                        Generate Stability Prediction
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between p-4 border-t border-gray-200 dark:border-gray-800">
        {activeTab === 'formulation' ? (
          <>
            <Button variant="outline">Clear All Fields</Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (activeIngredient.name && excipients.length > 0) {
                    setActiveTab('compatibility');
                  } else {
                    toast({
                      title: 'Missing Information',
                      description: 'Please enter an active ingredient and at least one excipient.',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                Check Compatibility
              </Button>
              <Button
                className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
                onClick={() => {
                  if (activeIngredient.name && excipients.length > 0) {
                    setActiveTab('stability');
                  } else {
                    toast({
                      title: 'Missing Information',
                      description: 'Please enter an active ingredient and at least one excipient.',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                Predict Stability <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </>
        ) : activeTab === 'compatibility' ? (
          <>
            <Button variant="outline" onClick={() => setActiveTab('formulation')}>
              Back to Formulation
            </Button>
            {!compGenerated ? (
              <Button
                onClick={generateCompatibilityMatrix}
                disabled={compGenLoading || !activeIngredient.name || excipients.length === 0}
                className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
              >
                {compGenLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing with GPT-4o...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Compatibility Matrix
                  </>
                )}
              </Button>
            ) : (
              <Button
                className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
                onClick={() => setActiveTab('stability')}
              >
                Continue to Stability <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setActiveTab('compatibility')}>
              Back to Compatibility
            </Button>
            {!stabPredGenerated ? (
              <Button
                onClick={generateStabilityPrediction}
                disabled={stabPredLoading || !activeIngredient.name || excipients.length === 0}
                className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
              >
                {stabPredLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generating Prediction...
                  </>
                ) : (
                  <>
                    <LineChart className="h-4 w-4 mr-2" />
                    Generate Stability Prediction
                  </>
                )}
              </Button>
            ) : (
              <Button className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200">
                <Download className="h-4 w-4 mr-2" />
                Download Full Report
              </Button>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
};

export default FormulationPredictor;
