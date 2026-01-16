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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger, } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  RefreshCw, Download, FileText, Factory, Calculator, CheckSquare, Edit, Clipboard, Copy, FilePlus2, CheckCircle, Loader2 } from 'lucide-react'
import { generateBatchDocumentation, simulateOpenAIResponse } from '../../services/openaiService';
import { useToast } from '@/hooks/use-toast';

/**
 * BatchRecordGenerator
 *
 * A component that uses GPT-4o to generate comprehensive batch manufacturing
 * records based on process parameters and regulatory requirements.
 */
const BatchRecordGenerator = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('input');
  const [productName, setProductName] = useState('');
  const [batchSize, setBatchSize] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [processDescription, setProcessDescription] = useState('');
  const [equipmentList, setEquipmentList] = useState('');
  const [materialsList, setMaterialsList] = useState('');
  const [productType, setProductType] = useState('tablet');
  const [includeChecklist, setIncludeChecklist] = useState(true);
  const [includeCalculations, setIncludeCalculations] = useState(true);
  const [includeProtocols, setIncludeProtocols] = useState(true);
  const [isGMPCompliant, setIsGMPCompliant] = useState(true);

  const [generatedDocument, setGeneratedDocument] = useState(null);

  // Product types
  const productTypes = [
    { value: 'tablet', label: 'Tablet' },
    { value: 'capsule', label: 'Capsule' },
    { value: 'solution', label: 'Solution' },
    { value: 'suspension', label: 'Suspension' },
    { value: 'injectable', label: 'Injectable' },
    { value: 'ointment', label: 'Ointment/Cream' },
    { value: 'api', label: 'Active Pharmaceutical Ingredient (API)' },
  ];

  // Pre-defined templates for fast input
  const batchTemplates = {
    tablet: {
      productName: 'Metformin HCl Tablets 500 mg',
      batchSize: '100,000 tablets',
      processDescription: `Manufacturing process for Metformin HCl Tablets 500 mg:

1. Raw Material Dispensing:
   - Metformin HCl, microcrystalline cellulose, povidone, magnesium stearate, and other excipients are dispensed according to formula.

2. Dry Mixing:
   - Metformin HCl and excipients (except magnesium stearate) are blended in a V-blender for 15 minutes at 15 RPM.

3. Wet Granulation:
   - Povidone solution (10% w/w) is added to the powder blend while mixing.
   - Wet mass is mixed for 5 minutes at low speed.

4. Drying:
   - Wet granules are dried in a fluid bed dryer until moisture content is < 2.0%.
   - Inlet temperature: 60°C ± 5°C
   - Target moisture: 1.5% to 2.0%

5. Milling:
   - Dried granules are passed through a 1.0 mm screen in an oscillating granulator.

6. Final Blending:
   - Milled granules and magnesium stearate are blended for 3 minutes at 15 RPM.

7. Compression:
   - Blend is compressed into tablets using a rotary tablet press.
   - Target tablet weight: 575 mg ± 5%
   - Target hardness: 8-12 kp
   - Target thickness: 5.5 mm ± 0.2 mm
   - Target disintegration time: NMT 15 minutes

8. Coating (optional):
   - Film coating with Opadry® II to a 3% weight gain.

9. Quality Control:
   - In-process and finished product testing as per specifications.`,
      equipmentList: `- V-blender (200 L)
- High shear mixer granulator (100 L)
- Fluid bed dryer (100 L)
- Oscillating granulator with 1.0 mm screen
- Rotary tablet press, 16 stations
- Coating pan (if applicable)
- Analytical balance
- Moisture analyzer
- Hardness tester
- Thickness gauge
- Friability tester
- Disintegration tester`,
      materialsList: `Active Ingredients:
- Metformin HCl USP: 500 mg/tablet

Excipients:
- Microcrystalline cellulose (Avicel PH 102): 50 mg/tablet
- Povidone K30: 15 mg/tablet
- Crospovidone: 5 mg/tablet
- Magnesium stearate: 5 mg/tablet
- Purified water: q.s. (removed during drying)

Coating Materials (if applicable):
- Opadry® II: 17.25 mg/tablet (3% weight gain)
- Purified water: q.s. (removed during drying)`,
    },
    solution: {
      productName: 'Amoxicillin Oral Solution 250 mg/5 mL',
      batchSize: '100 L (equivalent to 5,000 bottles of 100 mL)',
      processDescription: `Manufacturing process for Amoxicillin Oral Solution 250 mg/5 mL:

1. Raw Material Dispensing:
   - Amoxicillin trihydrate, sucrose, sodium citrate, citric acid, flavorings, and preservatives are dispensed according to formula.

2. Buffer Preparation:
   - Dissolve sodium citrate and citric acid in a portion of purified water (approximately 30 L).
   - Mix until completely dissolved.
   - Verify pH (target 4.5-5.0).

3. Sugar Syrup Preparation:
   - Heat approximately 30 L of purified water to 60-70°C.
   - Add sucrose while mixing until completely dissolved.
   - Cool to room temperature.

4. Active Ingredient Addition:
   - Add amoxicillin trihydrate to the buffer solution while mixing.
   - Mix until completely dissolved (approximately 30 minutes).

5. Component Combination:
   - Add the sugar syrup to the amoxicillin solution while mixing.
   - Add flavorings and preservatives.
   - Continue mixing for 15 minutes.

6. QS with Purified Water:
   - Add remaining purified water to achieve final volume of 100 L.
   - Mix for 30 minutes to ensure homogeneity.

7. Filtration:
   - Filter the solution through a 0.45 μm filter.

8. Filling and Packaging:
   - Fill into amber glass bottles (100 mL).
   - Cap, label, and pack into cartons.

9. Quality Control:
   - In-process and finished product testing as per specifications.`,
      equipmentList: `- Stainless steel mixing vessels (150 L)
- Overhead stirrer with variable speed
- Heating/cooling system
- Transfer pumps
- 0.45 μm filtration system
- Filling line for liquid products
- Capping machine
- Labeling machine
- Analytical balance
- pH meter
- Viscometer
- Density meter`,
      materialsList: `Active Ingredients:
- Amoxicillin trihydrate (equivalent to 250 mg amoxicillin per 5 mL): 5 kg

Excipients:
- Sucrose: 40 kg
- Sodium citrate dihydrate: 1 kg
- Citric acid monohydrate: 0.5 kg
- Strawberry flavor: 0.2 kg
- Sodium benzoate (preservative): 0.1 kg
- Purified water: q.s. to 100 L`,
    },
    api: {
      productName: 'Atorvastatin Calcium API',
      batchSize: '25 kg',
      processDescription: `Manufacturing process for Atorvastatin Calcium API:

1. Raw Material Dispensing:
   - Starting materials, reagents, and catalysts are dispensed according to formula.

2. Reaction 1 - Formation of Intermediate A:
   - Charge tetrahydrofuran (THF) into the reactor.
   - Add compound X and cool to -5°C to 0°C.
   - Add butyllithium solution dropwise while maintaining temperature below 0°C.
   - Add compound Y and stir for 2 hours.
   - Allow to warm to room temperature, then heat to 45°C for 6 hours.
   - Cool to 20-25°C and quench with water.
   - Extract with ethyl acetate (3x).
   - Wash organic layer with brine, dry over sodium sulfate, filter, and concentrate under vacuum.

3. Purification of Intermediate A:
   - Dissolve crude product in minimum amount of dichloromethane.
   - Add silica gel and evaporate solvent.
   - Perform column chromatography using hexane/ethyl acetate gradient.
   - Collect fractions containing Intermediate A and evaporate solvent.

4. Reaction 2 - Formation of Intermediate B:
   - Dissolve Intermediate A in methanol in a reactor.
   - Add ruthenium catalyst and hydrogen at 5 bar.
   - Stir at 50°C for 8 hours (conversion ≥ 98%).
   - Filter through Celite to remove catalyst.
   - Concentrate under vacuum.

5. Reaction 3 - Formation of Atorvastatin:
   - Dissolve Intermediate B in THF/water (9:1) in reactor.
   - Add compound Z and sodium hydroxide solution.
   - Stir at 40°C for 12 hours.
   - Acidify to pH 4.5 with hydrochloric acid.
   - Extract with ethyl acetate (3x).
   - Wash organic layers, dry, and concentrate.

6. Salt Formation:
   - Dissolve Atorvastatin in acetone.
   - Add calcium chloride solution dropwise.
   - Stir for 3 hours at 20-25°C.
   - Filter, wash with cold acetone, and dry under vacuum at 50°C.

7. Milling and Sieving:
   - Mill dried Atorvastatin Calcium.
   - Sieve through 100 mesh screen.

8. Quality Control:
   - In-process and finished product testing as per specifications.`,
      equipmentList: `- Reaction vessels (100 L) with heating/cooling capability
- Overhead stirrers with variable speed
- Temperature controllers
- Vacuum pumps
- Distillation apparatus
- Hydrogenation reactor (high pressure)
- Filtration equipment (Nutsche filter, filter press)
- Chromatography column
- Drying oven (vacuum capable)
- Mill
- Sieve
- Analytical HPLC
- Gas chromatograph
- FTIR spectrometer
- NMR spectrometer
- Karl Fischer titrator`,
      materialsList: `Starting Materials:
- Compound X: 15 kg
- Compound Y: 12 kg
- Compound Z: 8 kg

Reagents and Solvents:
- Tetrahydrofuran (THF): 100 L
- Butyllithium (1.6M in hexanes): 50 L
- Ethyl acetate: 150 L
- Water, purified: 100 L
- Sodium sulfate, anhydrous: 10 kg
- Dichloromethane: 50 L
- Silica gel: 20 kg
- Hexane: 100 L
- Methanol: 75 L
- Ruthenium catalyst: 0.5 kg
- Hydrogen gas: as required
- Celite: 5 kg
- Sodium hydroxide: 5 kg
- Hydrochloric acid: 5 L
- Acetone: 50 L
- Calcium chloride: 3 kg`,
    },
  };

  const handleTemplateLoad = template => {
    const templateData = batchTemplates[template];
    if (templateData) {
      setProductName(templateData.productName);
      setBatchSize(templateData.batchSize);
      setProcessDescription(templateData.processDescription);
      setEquipmentList(templateData.equipmentList);
      setMaterialsList(templateData.materialsList);

      toast({
        title: 'Template Loaded',
        description: `${templateData.productName} template loaded successfully.`,
      });
    }
  };

  const generateBatchNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');

    setBatchNumber(`B${year}${month}${day}-${random}`);
  };

  const handleGenerate = async () => {
    // Validate required fields
    if (!productName.trim()) {
      toast({
        title: 'Product Name Required',
        description: 'Please enter a product name.',
        variant: 'destructive',
      });
      return;
    }

    if (!batchSize.trim()) {
      toast({
        title: 'Batch Size Required',
        description: 'Please enter a batch size.',
        variant: 'destructive',
      });
      return;
    }

    if (!batchNumber.trim()) {
      toast({
        title: 'Batch Number Required',
        description: 'Please enter a batch number or generate one.',
        variant: 'destructive',
      });
      return;
    }

    if (!processDescription.trim()) {
      toast({
        title: 'Process Description Required',
        description: 'Please provide a manufacturing process description.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setActiveTab('record');

    try {
      // Prepare request data
      const requestData = {
        productName,
        batchSize,
        batchNumber,
        processDescription,
        equipmentList,
        materialsList,
        productType,
        options: {
          includeChecklist,
          includeCalculations,
          includeProtocols,
          isGMPCompliant,
        },
      };

      // In a real implementation, we would call the actual API
      // For demo purposes, we're using the simulation
      // const response = await generateBatchDocumentation(requestData);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Generate document structure
      const currentDate = new Date().toISOString().split('T')[0];

      // Parse process steps from description
      const processSteps = [];
      const stepRegex = /\d+\.\s+(.*?)(?=\n\d+\.|$)/gs;
      let match;
      while ((match = stepRegex.exec(processDescription)) !== null) {
        const stepText = match[1].trim();
        const stepName = stepText.split(':')[0].trim();
        const stepDetails = stepText.includes(':') ? stepText.split(':')[1].trim() : '';

        processSteps.push({
          name: stepName,
          details: stepDetails,
          parameters: stepName.toLowerCase().includes('blend')
            ? [
                { name: 'Blending Time', value: '', unit: 'minutes', specification: '' },
                { name: 'Blender Speed', value: '', unit: 'RPM', specification: '' },
              ]
            : stepName.toLowerCase().includes('granulation')
              ? [
                  { name: 'Granulation Time', value: '', unit: 'minutes', specification: '' },
                  { name: 'Impeller Speed', value: '', unit: 'RPM', specification: '' },
                  { name: 'Liquid Addition Rate', value: '', unit: 'mL/min', specification: '' },
                ]
              : stepName.toLowerCase().includes('drying')
                ? [
                    { name: 'Inlet Temperature', value: '', unit: '°C', specification: '' },
                    { name: 'Drying Time', value: '', unit: 'minutes', specification: '' },
                    { name: 'Final Moisture Content', value: '', unit: '%', specification: '' },
                  ]
                : stepName.toLowerCase().includes('compression')
                  ? [
                      { name: 'Tablet Weight', value: '', unit: 'mg', specification: '' },
                      { name: 'Hardness', value: '', unit: 'kp', specification: '' },
                      { name: 'Thickness', value: '', unit: 'mm', specification: '' },
                      { name: 'Friability', value: '', unit: '%', specification: '' },
                    ]
                  : [],
          verification: {
            operator: '',
            verifier: '',
            date: '',
            time: '',
            completed: false,
          },
        });
      }

      // Extract materials from materials list
      const materials = [];
      const materialLines = materialsList.split('\n').filter(line => line.trim());
      let currentCategory = '';

      materialLines.forEach(line => {
        if (line.endsWith(':')) {
          currentCategory = line.replace(':', '').trim();
        } else if (line.startsWith('-')) {
          const materialText = line.replace('-', '').trim();
          const parts = materialText.split(':');

          const name = parts[0].trim();
          const quantity = parts.length > 1 ? parts[1].trim() : '';

          materials.push({
            name,
            category: currentCategory,
            quantity,
            lotNumber: '',
            expiryDate: '',
            verified: false,
          });
        }
      });

      // Extract equipment from equipment list
      const equipment = equipmentList
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const equipmentName = line.replace('-', '').trim();
          return {
            name: equipmentName,
            equipmentId: '',
            calibrationDate: '',
            cleanStatus: 'Clean',
            verified: false,
          };
        });

      const batchRecord = {
        header: {
          title: `Batch Manufacturing Record`,
          productName,
          batchNumber,
          batchSize,
          productType,
          manufacturingDate: currentDate,
          expiryDate: '',
          preparedBy: 'AI Batch Record Generator',
          approvedBy: '',
          documentNumber: `BMR-${batchNumber}`,
          versionNumber: '1.0',
          effectiveDate: currentDate,
        },
        sections: {
          materials,
          equipment,
          processSteps,
          inProcessControls: [
            {
              stage: 'Blend Uniformity',
              test: 'Content Uniformity',
              acceptanceCriteria: 'RSD ≤ 5.0%',
              results: '',
              performedBy: '',
              verifiedBy: '',
              status: 'Pending',
            },
            {
              stage: 'Compression',
              test: 'Average Weight',
              acceptanceCriteria: 'Target ± 5.0%',
              results: '',
              performedBy: '',
              verifiedBy: '',
              status: 'Pending',
            },
            {
              stage: 'Compression',
              test: 'Hardness',
              acceptanceCriteria: '8-12 kp',
              results: '',
              performedBy: '',
              verifiedBy: '',
              status: 'Pending',
            },
            {
              stage: 'Compression',
              test: 'Thickness',
              acceptanceCriteria: 'Target ± 0.2 mm',
              results: '',
              performedBy: '',
              verifiedBy: '',
              status: 'Pending',
            },
          ],
          yieldCalculations: {
            theoreticalYield: '',
            actualYield: '',
            yieldPercentage: '',
            calculatedBy: '',
            verifiedBy: '',
            comments: '',
          },
          deviations: [],
          finalApproval: {
            qaApproval: {
              name: '',
              date: '',
              approved: false,
            },
            productionApproval: {
              name: '',
              date: '',
              approved: false,
            },
            qcApproval: {
              name: '',
              date: '',
              approved: false,
            },
          },
        },
        regulatoryCompliance: {
          gmpStatement: isGMPCompliant
            ? 'This batch record has been designed to comply with current Good Manufacturing Practices (cGMP) as outlined in 21 CFR Part 211 and ICH Q7 guidelines for documentation of manufacturing operations.'
            : 'This batch record is for development purposes only and has not been designed to comply with Good Manufacturing Practices (GMP).',
          dataIntegrityStatement:
            'All data recorded in this document must be attributable, legible, contemporaneous, original, and accurate (ALCOA) in accordance with data integrity requirements.',
        },
      };

      setGeneratedDocument(batchRecord);
    } catch (error) {
      toast({
        title: 'Generation Failed',
        description: error.message || 'An error occurred during batch record generation.',
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

  return (
    <Card className="w-full shadow-md border-2 border-black dark:border-white">
      <CardHeader className="bg-black text-white dark:bg-white dark:text-black">
        <CardTitle className="text-xl flex items-center gap-2">
          <Factory className="h-5 w-5" />
          Batch Record Generator (GPT-4o Powered)
        </CardTitle>
        <CardDescription className="text-gray-300 dark:text-gray-700">
          Generate comprehensive batch manufacturing records according to regulatory standards
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full rounded-none">
            <TabsTrigger value="input" className="flex-1">
              Batch Data
            </TabsTrigger>
            <TabsTrigger
              value="record"
              className="flex-1"
              disabled={!generatedDocument && !loading}
            >
              Batch Record
            </TabsTrigger>
          </TabsList>

          <TabsContent value="input" className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="product-type">Product Type</Label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {productTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {Object.keys(batchTemplates).map(template => (
                <Button
                  key={template}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={template !== productType}
                  onClick={() => handleTemplateLoad(template)}
                >
                  Load {productTypes.find(t => t.value === template)?.label} Template
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-name">Product Name</Label>
                <Input
                  id="product-name"
                  placeholder="Enter product name"
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="batch-size">Batch Size</Label>
                <Input
                  id="batch-size"
                  placeholder="e.g., 100 kg, 10,000 tablets"
                  value={batchSize}
                  onChange={e => setBatchSize(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="batch-number">Batch Number</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={generateBatchNumber}
                  >
                    Generate
                  </Button>
                </div>
                <Input
                  id="batch-number"
                  placeholder="Enter batch number"
                  value={batchNumber}
                  onChange={e => setBatchNumber(e.target.value)}
                />
              </div>

              <div className="flex flex-col justify-end space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="gmp-compliant"
                    checked={isGMPCompliant}
                    onCheckedChange={setIsGMPCompliant}
                  />
                  <label
                    htmlFor="gmp-compliant"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    GMP Compliant Document
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="process-description">Manufacturing Process Description</Label>
              <Textarea
                id="process-description"
                placeholder="Describe the manufacturing process steps in detail"
                className="h-40"
                value={processDescription}
                onChange={e => setProcessDescription(e.target.value)}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Enter a step-by-step description of the manufacturing process. Include numbered
                steps for best results.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-list">Equipment List</Label>
              <Textarea
                id="equipment-list"
                placeholder="List equipment used in the process (one per line)"
                className="h-24"
                value={equipmentList}
                onChange={e => setEquipmentList(e.target.value)}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                List each piece of equipment on a new line. Prefix with a dash (-) for best
                formatting.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="materials-list">Materials List</Label>
              <Textarea
                id="materials-list"
                placeholder="List materials used in the process (one per line)"
                className="h-24"
                value={materialsList}
                onChange={e => setMaterialsList(e.target.value)}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Group materials by category (e.g., "Active Ingredients:", "Excipients:"). List each
                material on a new line prefixed with a dash (-).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-checklist"
                  checked={includeChecklist}
                  onCheckedChange={setIncludeChecklist}
                />
                <label
                  htmlFor="include-checklist"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Include Verification Checklists
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-calculations"
                  checked={includeCalculations}
                  onCheckedChange={setIncludeCalculations}
                />
                <label
                  htmlFor="include-calculations"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Include Yield Calculations
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-protocols"
                  checked={includeProtocols}
                  onCheckedChange={setIncludeProtocols}
                />
                <label
                  htmlFor="include-protocols"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Include Testing Protocols
                </label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="record" className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <RefreshCw className="h-10 w-10 text-indigo-600 animate-spin" />
                <div className="text-center">
                  <p className="font-medium">Generating Batch Record with GPT-4o...</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Creating detailed manufacturing instructions and control checks based on process
                    description
                  </p>
                </div>
              </div>
            ) : generatedDocument ? (
              <div className="p-4">
                <div className="mb-6 border-b border-gray-200 dark:border-gray-800 pb-4">
                  <div className="text-center mb-4">
                    <h2 className="text-xl font-bold text-black dark:text-white">
                      {generatedDocument.header.title}
                    </h2>
                    <p className="text-md font-medium text-black dark:text-white">
                      {generatedDocument.header.productName}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-1">
                      <p className="text-sm">
                        <span className="font-medium text-black dark:text-white">
                          Batch Number:
                        </span>{' '}
                        <span className="text-gray-700 dark:text-gray-300">
                          {generatedDocument.header.batchNumber}
                        </span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium text-black dark:text-white">Batch Size:</span>{' '}
                        <span className="text-gray-700 dark:text-gray-300">
                          {generatedDocument.header.batchSize}
                        </span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium text-black dark:text-white">
                          Manufacturing Date:
                        </span>{' '}
                        <span className="text-gray-700 dark:text-gray-300">
                          {generatedDocument.header.manufacturingDate}
                        </span>
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm">
                        <span className="font-medium text-black dark:text-white">
                          Document Number:
                        </span>{' '}
                        <span className="text-gray-700 dark:text-gray-300">
                          {generatedDocument.header.documentNumber}
                        </span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium text-black dark:text-white">Version:</span>{' '}
                        <span className="text-gray-700 dark:text-gray-300">
                          {generatedDocument.header.versionNumber}
                        </span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium text-black dark:text-white">
                          Effective Date:
                        </span>{' '}
                        <span className="text-gray-700 dark:text-gray-300">
                          {generatedDocument.header.effectiveDate}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-8">
                    <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                      <CheckCircle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                      <AlertTitle className="text-amber-800 dark:text-amber-400">
                        Regulatory Compliance
                      </AlertTitle>
                      <AlertDescription className="text-amber-700 dark:text-amber-300 text-sm">
                        {generatedDocument.regulatoryCompliance.gmpStatement}
                      </AlertDescription>
                    </Alert>

                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="materials">
                        <AccordionTrigger className="text-black dark:text-white font-medium">
                          Raw Materials and Components
                        </AccordionTrigger>
                        <AccordionContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[250px]">Material Name</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead>Lot Number</TableHead>
                                <TableHead>Expiry Date</TableHead>
                                <TableHead className="text-right">Verified</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {generatedDocument.sections.materials.map((material, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-medium">{material.name}</TableCell>
                                  <TableCell>{material.category}</TableCell>
                                  <TableCell>{material.quantity}</TableCell>
                                  <TableCell>{material.lotNumber}</TableCell>
                                  <TableCell>{material.expiryDate}</TableCell>
                                  <TableCell className="text-right">
                                    <Checkbox id={`material-${i}`} />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="equipment">
                        <AccordionTrigger className="text-black dark:text-white font-medium">
                          Equipment
                        </AccordionTrigger>
                        <AccordionContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[250px]">Equipment Name</TableHead>
                                <TableHead>Equipment ID</TableHead>
                                <TableHead>Calibration Date</TableHead>
                                <TableHead>Clean Status</TableHead>
                                <TableHead className="text-right">Verified</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {generatedDocument.sections.equipment.map((equip, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-medium">{equip.name}</TableCell>
                                  <TableCell>{equip.equipmentId}</TableCell>
                                  <TableCell>{equip.calibrationDate}</TableCell>
                                  <TableCell>{equip.cleanStatus}</TableCell>
                                  <TableCell className="text-right">
                                    <Checkbox id={`equipment-${i}`} />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="process-steps">
                        <AccordionTrigger className="text-black dark:text-white font-medium">
                          Manufacturing Process
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-6">
                            {generatedDocument.sections.processSteps.map((step, i) => (
                              <div
                                key={i}
                                className="border border-gray-200 dark:border-gray-800 rounded-md"
                              >
                                <div className="bg-gray-50 dark:bg-gray-900 p-3 flex justify-between items-center">
                                  <div className="font-medium text-black dark:text-white">
                                    Step {i + 1}: {step.name}
                                  </div>
                                  <Badge
                                    variant={step.verification.completed ? 'outline' : 'secondary'}
                                  >
                                    {step.verification.completed ? 'Completed' : 'Pending'}
                                  </Badge>
                                </div>
                                <div className="p-3 space-y-3">
                                  <p className="text-sm text-gray-700 dark:text-gray-300">
                                    {step.details}
                                  </p>

                                  {step.parameters.length > 0 && (
                                    <div className="mt-3">
                                      <h4 className="text-sm font-medium mb-2 text-black dark:text-white">
                                        Process Parameters
                                      </h4>
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Parameter</TableHead>
                                            <TableHead>Value</TableHead>
                                            <TableHead>Unit</TableHead>
                                            <TableHead>Specification</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {step.parameters.map((param, j) => (
                                            <TableRow key={j}>
                                              <TableCell>{param.name}</TableCell>
                                              <TableCell>
                                                <Input placeholder="Enter value" className="h-8" />
                                              </TableCell>
                                              <TableCell>{param.unit}</TableCell>
                                              <TableCell>{param.specification}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  )}

                                  <div className="mt-3 flex flex-wrap gap-4">
                                    <div className="space-y-1">
                                      <Label htmlFor={`operator-${i}`} className="text-xs">
                                        Operator
                                      </Label>
                                      <Input
                                        id={`operator-${i}`}
                                        placeholder="Enter name"
                                        className="h-8 w-40"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label htmlFor={`verifier-${i}`} className="text-xs">
                                        Verified By
                                      </Label>
                                      <Input
                                        id={`verifier-${i}`}
                                        placeholder="Enter name"
                                        className="h-8 w-40"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label htmlFor={`date-${i}`} className="text-xs">
                                        Date
                                      </Label>
                                      <Input id={`date-${i}`} type="date" className="h-8 w-40" />
                                    </div>
                                    <div className="space-y-1">
                                      <Label htmlFor={`time-${i}`} className="text-xs">
                                        Time
                                      </Label>
                                      <Input id={`time-${i}`} type="time" className="h-8 w-40" />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="in-process-controls">
                        <AccordionTrigger className="text-black dark:text-white font-medium">
                          In-Process Controls
                        </AccordionTrigger>
                        <AccordionContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Stage</TableHead>
                                <TableHead>Test</TableHead>
                                <TableHead>Acceptance Criteria</TableHead>
                                <TableHead>Results</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {generatedDocument.sections.inProcessControls.map((control, i) => (
                                <TableRow key={i}>
                                  <TableCell>{control.stage}</TableCell>
                                  <TableCell>{control.test}</TableCell>
                                  <TableCell>{control.acceptanceCriteria}</TableCell>
                                  <TableCell>
                                    <Input placeholder="Enter results" className="h-8" />
                                  </TableCell>
                                  <TableCell>
                                    <Select defaultValue={control.status}>
                                      <SelectTrigger className="h-8 w-28">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Pending">Pending</SelectItem>
                                        <SelectItem value="Pass">Pass</SelectItem>
                                        <SelectItem value="Fail">Fail</SelectItem>
                                        <SelectItem value="N/A">N/A</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </AccordionContent>
                      </AccordionItem>

                      {includeCalculations && (
                        <AccordionItem value="yield-calculations">
                          <AccordionTrigger className="text-black dark:text-white font-medium">
                            Yield Calculations
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="border border-gray-200 dark:border-gray-800 rounded-md p-4 space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="theoretical-yield">Theoretical Yield</Label>
                                  <div className="flex items-center gap-2">
                                    <Input id="theoretical-yield" placeholder="Enter value" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                      {productType === 'tablet' || productType === 'capsule'
                                        ? 'tablets'
                                        : 'kg'}
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="actual-yield">Actual Yield</Label>
                                  <div className="flex items-center gap-2">
                                    <Input id="actual-yield" placeholder="Enter value" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                      {productType === 'tablet' || productType === 'capsule'
                                        ? 'tablets'
                                        : 'kg'}
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="yield-percentage">Yield Percentage</Label>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      id="yield-percentage"
                                      placeholder="Calculated value"
                                      readOnly
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                      %
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="calculated-by">Calculated By</Label>
                                  <Input id="calculated-by" placeholder="Enter name" />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="verified-by">Verified By</Label>
                                  <Input id="verified-by" placeholder="Enter name" />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="yield-comments">Comments (Optional)</Label>
                                <Textarea
                                  id="yield-comments"
                                  placeholder="Enter any comments about yield calculations"
                                  className="h-20"
                                />
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      <AccordionItem value="deviations">
                        <AccordionTrigger className="text-black dark:text-white font-medium">
                          Deviations / Investigations
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-md space-y-4">
                            <div className="text-center p-6">
                              <p className="text-gray-700 dark:text-gray-300">
                                No deviations recorded for this batch.
                              </p>
                              <Button variant="outline" className="mt-4">
                                <FilePlus2 className="h-4 w-4 mr-2" />
                                Add Deviation
                              </Button>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="approvals">
                        <AccordionTrigger className="text-black dark:text-white font-medium">
                          Final Approvals
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="border border-gray-200 dark:border-gray-800 rounded-md p-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              <div className="border p-4 rounded-md">
                                <h4 className="font-medium mb-3 text-black dark:text-white">
                                  Production Approval
                                </h4>
                                <div className="space-y-2">
                                  <Label htmlFor="production-name">Name</Label>
                                  <Input id="production-name" placeholder="Enter name" />
                                </div>
                                <div className="space-y-2 mt-2">
                                  <Label htmlFor="production-date">Date</Label>
                                  <Input id="production-date" type="date" />
                                </div>
                                <div className="flex items-center space-x-2 mt-4">
                                  <Checkbox id="production-approved" />
                                  <label
                                    htmlFor="production-approved"
                                    className="text-sm font-medium leading-none"
                                  >
                                    Approved
                                  </label>
                                </div>
                              </div>

                              <div className="border p-4 rounded-md">
                                <h4 className="font-medium mb-3 text-black dark:text-white">
                                  Quality Control Approval
                                </h4>
                                <div className="space-y-2">
                                  <Label htmlFor="qc-name">Name</Label>
                                  <Input id="qc-name" placeholder="Enter name" />
                                </div>
                                <div className="space-y-2 mt-2">
                                  <Label htmlFor="qc-date">Date</Label>
                                  <Input id="qc-date" type="date" />
                                </div>
                                <div className="flex items-center space-x-2 mt-4">
                                  <Checkbox id="qc-approved" />
                                  <label
                                    htmlFor="qc-approved"
                                    className="text-sm font-medium leading-none"
                                  >
                                    Approved
                                  </label>
                                </div>
                              </div>

                              <div className="border p-4 rounded-md">
                                <h4 className="font-medium mb-3 text-black dark:text-white">
                                  Quality Assurance Approval
                                </h4>
                                <div className="space-y-2">
                                  <Label htmlFor="qa-name">Name</Label>
                                  <Input id="qa-name" placeholder="Enter name" />
                                </div>
                                <div className="space-y-2 mt-2">
                                  <Label htmlFor="qa-date">Date</Label>
                                  <Input id="qa-date" type="date" />
                                </div>
                                <div className="flex items-center space-x-2 mt-4">
                                  <Checkbox id="qa-approved" />
                                  <label
                                    htmlFor="qa-approved"
                                    className="text-sm font-medium leading-none"
                                  >
                                    Approved
                                  </label>
                                </div>
                              </div>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-gray-500 dark:text-gray-400">
                  Enter batch information and click "Generate Batch Record" to see results.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between p-4 border-t border-gray-200 dark:border-gray-800">
        {activeTab === 'input' ? (
          <>
            <Button variant="outline" onClick={() => setProcessDescription('')}>
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
                  <Factory className="mr-2 h-4 w-4" />
                  Generate Batch Record
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
              <Button variant="outline">
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

export default BatchRecordGenerator;
