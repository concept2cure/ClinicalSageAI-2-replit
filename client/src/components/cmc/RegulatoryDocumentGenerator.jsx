import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Download, CheckCircle2, Clipboard, ClipboardCheck } from 'lucide-react';

const RegulatoryDocumentGenerator = () => {
  const [activeTab, setActiveTab] = useState('module3');
  const [documentType, setDocumentType] = useState('specifications');
  const [productDetails, setProductDetails] = useState({
    productName: '',
    strengthDosage: '',
    dosageForm: '',
    routeOfAdmin: '',
    manufacturer: '',
    batchNumber: '',
  });
  const [sections, setSections] = useState({
    description: true,
    composition: true,
    manufacturingProcess: true,
    controlOfMaterials: true,
    controlOfCriticalSteps: true,
    processValidation: true,
    specifications: true,
    analyticalProcedures: true,
    batchAnalyses: true,
    characterizationOfImpurities: true,
    stabilityData: true,
  });
  const [generatedContent, setGeneratedContent] = useState('');
  const [generationComplete, setGenerationComplete] = useState(false);

  const handleProductDetailsChange = (field, value) => {
    setProductDetails(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const toggleSection = section => {
    setSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const generateDocument = () => {
    // This would typically connect to an API
    // For now, we'll simulate document generation
    setGeneratedContent('');
    setGenerationComplete(false);

    // Simulate processing time
    setTimeout(() => {
      const content = generateDocumentContent();
      setGeneratedContent(content);
      setGenerationComplete(true);
    }, 1500);
  };

  const generateDocumentContent = () => {
    const { productName, strengthDosage, dosageForm, routeOfAdmin, manufacturer, batchNumber } =
      productDetails;

    const documentTemplates = {
      specifications: `
# SPECIFICATIONS AND ANALYTICAL PROCEDURES

## ${productName} ${strengthDosage} ${dosageForm}

### 1. GENERAL INFORMATION
**Product Name:** ${productName}
**Strength/Dosage:** ${strengthDosage}
**Dosage Form:** ${dosageForm}
**Route of Administration:** ${routeOfAdmin}
**Manufacturer:** ${manufacturer}
**Batch Number:** ${batchNumber}

### 2. SPECIFICATIONS

#### 2.1 Drug Substance Specifications
| Test | Method | Acceptance Criteria |
|------|--------|---------------------|
| Description | Visual | White to off-white crystalline powder |
| Identification | HPLC | Retention time corresponds to standard |
| Identification | IR | Spectrum matches reference standard |
| Assay | HPLC | 98.0% - 102.0% |
| Impurities | HPLC | Individual: NMT 0.2%; Total: NMT 0.5% |
| Water Content | Karl Fischer | NMT 0.5% |
| Residual Solvents | GC | Meets ICH Q3C limits |
| Particle Size | Laser Diffraction | D90: NMT 50 μm |
| Heavy Metals | ICP-MS | NMT 10 ppm |

#### 2.2 Drug Product Specifications
| Test | Method | Acceptance Criteria |
|------|--------|---------------------|
| Description | Visual | Consistent with appearance of dosage form |
| Identification | HPLC | Retention time corresponds to standard |
| Assay | HPLC | 95.0% - 105.0% of label claim |
| Uniformity of Dosage Units | USP <905> | Meets USP requirements |
| Dissolution | USP <711> | NLT 80% (Q) in 30 minutes |
| Degradation Products | HPLC | Individual: NMT 0.2%; Total: NMT 1.0% |
| Water Content | Karl Fischer | NMT 3.0% |
| Microbial Limits | USP <61>, <62> | TAMC: NMT 103 CFU/g; TYMC: NMT 102 CFU/g |

### 3. ANALYTICAL PROCEDURES
Detailed analytical procedures are provided in Attachment 1.

### 4. JUSTIFICATION OF SPECIFICATIONS
The specifications have been established in accordance with ICH Q6A guidelines, considering the following:
- Chemical and physical properties of the drug substance
- Potential degradation pathways
- Manufacturing process and potential process-related impurities
- Stability data
- Pharmaceutical development studies
- Regulatory requirements
      `,

      manufacturing: `
# MANUFACTURING PROCESS DESCRIPTION AND CONTROLS

## ${productName} ${strengthDosage} ${dosageForm}

### 1. GENERAL INFORMATION
**Product Name:** ${productName}
**Strength/Dosage:** ${strengthDosage}
**Dosage Form:** ${dosageForm}
**Route of Administration:** ${routeOfAdmin}
**Manufacturer:** ${manufacturer}
**Batch Number:** ${batchNumber}

### 2. MANUFACTURING PROCESS FLOW DIAGRAM
[Process flow diagram would be inserted here]

### 3. MANUFACTURING PROCESS DESCRIPTION

#### 3.1 Materials
A complete list of materials, including API, excipients, and processing aids, is provided in Table 1.

**Table 1: List of Materials**
| Material | Function | Quality Standard |
|----------|----------|------------------|
| Active Pharmaceutical Ingredient | Active | In-house specification |
| Microcrystalline Cellulose | Diluent | NF/Ph.Eur. |
| Lactose Monohydrate | Diluent | NF/Ph.Eur. |
| Croscarmellose Sodium | Disintegrant | NF/Ph.Eur. |
| Magnesium Stearate | Lubricant | NF/Ph.Eur. |
| Purified Water | Processing aid | USP/Ph.Eur. |

#### 3.2 Process Description
The manufacturing process consists of the following steps:

1. **Dispensing and Weighing**
   - All components are dispensed and weighed according to the master formula.

2. **Dry Mixing**
   - The API is blended with microcrystalline cellulose and lactose monohydrate in a suitable mixer.
   - Mixing time: 15-20 minutes; mixer speed: 10-15 rpm.

3. **Wet Granulation**
   - Purified water is added to the dry mixture to form a wet mass.
   - Granulation end-point determined by power consumption.

4. **Drying**
   - The wet granules are dried in a fluid bed dryer.
   - Inlet temperature: 55-65°C.
   - Drying end-point: LOD ≤ 2.0%.

5. **Milling**
   - The dried granules are milled using a suitable mill.
   - Screen size: 1.0 mm.

6. **Final Blending**
   - Croscarmellose sodium is added to the milled granules and mixed.
   - Magnesium stearate is added and mixed for 3-5 minutes.

7. **Compression**
   - The final blend is compressed into tablets.
   - Target hardness: 5-10 kP.
   - Target weight: [Appropriate for strength].

8. **Coating (if applicable)**
   - Tablets are coated using an aqueous film coating.
   - Inlet temperature: 55-65°C.
   - Target weight gain: 2-4%.

9. **Packaging**
   - Tablets are packaged in suitable containers.

### 4. PROCESS CONTROLS

#### 4.1 Critical Process Parameters (CPPs)
The following parameters have been identified as critical:

**Table 2: Critical Process Parameters**
| Process Step | Parameter | Target Value/Range | Control Method |
|--------------|-----------|-------------------|----------------|
| Wet Granulation | Water Addition | 40-45% w/w | Calibrated pump |
| Wet Granulation | Mixing Time | 5-7 minutes | Timer |
| Drying | Inlet Temperature | 55-65°C | Temperature control |
| Drying | Loss on Drying | ≤ 2.0% w/w | LOD testing |
| Compression | Compression Force | 15-25 kN | Force monitoring |
| Compression | Tablet Hardness | 5-10 kP | In-process testing |

#### 4.2 In-Process Controls
In-process controls are established to ensure consistent product quality:

**Table 3: In-Process Controls**
| Process Step | Test | Acceptance Criteria | Sampling Frequency |
|--------------|------|---------------------|-------------------|
| Dry Mixing | Blend Uniformity | RSD ≤ 5.0% | Each batch |
| Drying | Loss on Drying | ≤ 2.0% w/w | Each batch |
| Final Blending | Blend Uniformity | RSD ≤ 5.0% | Each batch |
| Compression | Weight | Target ± 5.0% | Every 30 minutes |
| Compression | Hardness | 5-10 kP | Every 30 minutes |
| Compression | Thickness | Target ± 5.0% | Every 30 minutes |
| Compression | Friability | ≤ 1.0% | Each batch |
| Compression | Disintegration | ≤ 15 minutes | Each batch |

### 5. PROCESS VALIDATION SUMMARY
The manufacturing process has been validated using a 3-batch validation approach. All critical parameters were monitored and found to consistently meet the established acceptance criteria.
      `,

      stability: `
# STABILITY DATA AND EVALUATION

## ${productName} ${strengthDosage} ${dosageForm}

### 1. GENERAL INFORMATION
**Product Name:** ${productName}
**Strength/Dosage:** ${strengthDosage}
**Dosage Form:** ${dosageForm}
**Route of Administration:** ${routeOfAdmin}
**Manufacturer:** ${manufacturer}
**Batch Number:** ${batchNumber}

### 2. STABILITY PROTOCOLS

#### 2.1 Long-Term Stability Conditions
- Temperature: 25°C ± 2°C
- Relative Humidity: 60% ± 5% RH
- Testing Intervals: 0, 3, 6, 9, 12, 18, 24, 36 months

#### 2.2 Accelerated Stability Conditions
- Temperature: 40°C ± 2°C
- Relative Humidity: 75% ± 5% RH
- Testing Intervals: 0, 1, 2, 3, 6 months

#### 2.3 Intermediate Stability Conditions (if applicable)
- Temperature: 30°C ± 2°C
- Relative Humidity: 65% ± 5% RH
- Testing Intervals: 0, 6, 12 months

### 3. BATCHES PLACED ON STABILITY
Three production-scale batches were placed on stability. The batches were manufactured according to the commercial process and packaged in the proposed commercial packaging.

**Table 1: Stability Batches**
| Batch Number | Manufacturing Date | Batch Size | Primary Packaging |
|--------------|-------------------|------------|-------------------|
| XXXXX-001 | YYYY-MM-DD | XX kg | HDPE bottles with PP caps |
| XXXXX-002 | YYYY-MM-DD | XX kg | HDPE bottles with PP caps |
| XXXXX-003 | YYYY-MM-DD | XX kg | HDPE bottles with PP caps |

### 4. ANALYTICAL PROCEDURES
The stability-indicating analytical methods used for testing are listed below:
- Appearance: Visual examination
- Assay: HPLC method XXXX
- Related Substances: HPLC method XXXX
- Dissolution: USP <711>
- Water Content: Karl Fischer titration
- Microbial Limits: USP <61>, <62>

### 5. STABILITY RESULTS

#### 5.1 Long-Term Stability Data
**Table 2: Long-Term Stability Results - Batch XXXXX-001**
| Test | Specification | Initial | 3 months | 6 months | 9 months | 12 months |
|------|--------------|---------|----------|----------|----------|-----------|
| Appearance | Complies | Complies | Complies | Complies | Complies | Complies |
| Assay | 95.0-105.0% | 99.8% | 99.5% | 99.1% | 98.7% | 98.3% |
| Impurity A | ≤ 0.2% | 0.05% | 0.07% | 0.09% | 0.10% | 0.12% |
| Total Impurities | ≤ 1.0% | 0.2% | 0.3% | 0.4% | 0.5% | 0.6% |
| Dissolution | Q ≥ 80% in 30 min | 95% | 94% | 93% | 92% | 91% |
| Water Content | ≤ 3.0% | 2.1% | 2.2% | 2.2% | 2.3% | 2.3% |

[Similar tables would be included for other batches and conditions]

### 6. STABILITY EVALUATION

#### 6.1 Trend Analysis
A statistical analysis was performed on the assay results to evaluate trends and predict shelf-life. Linear regression analysis indicates minimal degradation under long-term storage conditions, with projected assay values remaining within specification throughout the proposed shelf-life.

#### 6.2 Out-of-Specification Results
No out-of-specification results were observed during the stability studies.

### 7. PROPOSED SHELF-LIFE AND STORAGE CONDITIONS

Based on the available stability data and statistical analysis, the following is proposed:

**Shelf-Life:** 24 months
**Storage Conditions:** Store at room temperature (not exceeding 25°C). Keep container tightly closed to protect from moisture.

### 8. POST-APPROVAL STABILITY COMMITMENT
One production batch per year will be placed on long-term stability as part of the ongoing stability program.
      `,
    };

    return documentTemplates[documentType] || 'Document template not found.';
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedContent);
    // Show a success message (could be improved with a toast notification)
    alert('Content copied to clipboard!');
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle>Regulatory Document Generator</CardTitle>
        <CardDescription>Generate common CMC regulatory documents for submission</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="module3">Module 3 CTD</TabsTrigger>
            <TabsTrigger value="document">Document</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="module3">
            <div className="space-y-6">
              <div>
                <Label htmlFor="documentType">Document Type</Label>
                <Select value={documentType} onValueChange={setDocumentType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select document type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="specifications">
                      3.2.P.5 Specifications and Analytical Procedures
                    </SelectItem>
                    <SelectItem value="manufacturing">
                      3.2.P.3 Manufacturing Process and Controls
                    </SelectItem>
                    <SelectItem value="stability">3.2.P.8 Stability Data and Evaluation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="productName">Product Name</Label>
                  <Input
                    id="productName"
                    value={productDetails.productName}
                    onChange={e => handleProductDetailsChange('productName', e.target.value)}
                    placeholder="e.g., Exampezole"
                  />
                </div>
                <div>
                  <Label htmlFor="strengthDosage">Strength/Dosage</Label>
                  <Input
                    id="strengthDosage"
                    value={productDetails.strengthDosage}
                    onChange={e => handleProductDetailsChange('strengthDosage', e.target.value)}
                    placeholder="e.g., 10 mg"
                  />
                </div>
                <div>
                  <Label htmlFor="dosageForm">Dosage Form</Label>
                  <Input
                    id="dosageForm"
                    value={productDetails.dosageForm}
                    onChange={e => handleProductDetailsChange('dosageForm', e.target.value)}
                    placeholder="e.g., Tablets"
                  />
                </div>
                <div>
                  <Label htmlFor="routeOfAdmin">Route of Administration</Label>
                  <Input
                    id="routeOfAdmin"
                    value={productDetails.routeOfAdmin}
                    onChange={e => handleProductDetailsChange('routeOfAdmin', e.target.value)}
                    placeholder="e.g., Oral"
                  />
                </div>
                <div>
                  <Label htmlFor="manufacturer">Manufacturer</Label>
                  <Input
                    id="manufacturer"
                    value={productDetails.manufacturer}
                    onChange={e => handleProductDetailsChange('manufacturer', e.target.value)}
                    placeholder="e.g., Pharma Company Ltd."
                  />
                </div>
                <div>
                  <Label htmlFor="batchNumber">Batch Number</Label>
                  <Input
                    id="batchNumber"
                    value={productDetails.batchNumber}
                    onChange={e => handleProductDetailsChange('batchNumber', e.target.value)}
                    placeholder="e.g., A12345"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="document">
            <div className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-md border border-blue-200 mb-4">
                <h3 className="text-md font-medium mb-2">Document Sections</h3>
                <p className="text-sm text-gray-600 mb-2">
                  Select the sections to include in the generated document
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="description"
                    checked={sections.description}
                    onCheckedChange={() => toggleSection('description')}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="description">Description</Label>
                    <p className="text-sm text-muted-foreground">
                      Physical properties and appearance
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="composition"
                    checked={sections.composition}
                    onCheckedChange={() => toggleSection('composition')}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="composition">Composition</Label>
                    <p className="text-sm text-muted-foreground">Formulation components</p>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="manufacturingProcess"
                    checked={sections.manufacturingProcess}
                    onCheckedChange={() => toggleSection('manufacturingProcess')}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="manufacturingProcess">Manufacturing Process</Label>
                    <p className="text-sm text-muted-foreground">Process description</p>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="controlOfMaterials"
                    checked={sections.controlOfMaterials}
                    onCheckedChange={() => toggleSection('controlOfMaterials')}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="controlOfMaterials">Control of Materials</Label>
                    <p className="text-sm text-muted-foreground">Raw material specifications</p>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="controlOfCriticalSteps"
                    checked={sections.controlOfCriticalSteps}
                    onCheckedChange={() => toggleSection('controlOfCriticalSteps')}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="controlOfCriticalSteps">Control of Critical Steps</Label>
                    <p className="text-sm text-muted-foreground">In-process controls</p>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="processValidation"
                    checked={sections.processValidation}
                    onCheckedChange={() => toggleSection('processValidation')}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="processValidation">Process Validation</Label>
                    <p className="text-sm text-muted-foreground">Validation approach</p>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="specifications"
                    checked={sections.specifications}
                    onCheckedChange={() => toggleSection('specifications')}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="specifications">Specifications</Label>
                    <p className="text-sm text-muted-foreground">Release and shelf-life criteria</p>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="analyticalProcedures"
                    checked={sections.analyticalProcedures}
                    onCheckedChange={() => toggleSection('analyticalProcedures')}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="analyticalProcedures">Analytical Procedures</Label>
                    <p className="text-sm text-muted-foreground">Test methods</p>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="stabilityData"
                    checked={sections.stabilityData}
                    onCheckedChange={() => toggleSection('stabilityData')}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="stabilityData">Stability Data</Label>
                    <p className="text-sm text-muted-foreground">Stability studies and results</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-center mt-8">
                <Button onClick={generateDocument} className="flex items-center gap-2">
                  <FileText size={16} />
                  Generate Document
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview">
            {generationComplete ? (
              <div className="space-y-4">
                <div className="bg-green-50 p-4 rounded-md border border-green-200 flex items-center gap-3 mb-4">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <h3 className="text-md font-medium text-green-800">
                      Document Generated Successfully
                    </h3>
                    <p className="text-sm text-green-700">
                      Your document is ready for review and export
                    </p>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 mb-4">
                  <Button
                    variant="outline"
                    onClick={copyToClipboard}
                    className="flex items-center gap-2"
                  >
                    <Clipboard size={16} />
                    Copy to Clipboard
                  </Button>
                  <Button variant="outline" className="flex items-center gap-2">
                    <Download size={16} />
                    Download as PDF
                  </Button>
                </div>

                <div className="bg-gray-50 p-4 rounded-md border border-gray-200 overflow-auto max-h-[500px] font-mono text-sm whitespace-pre-wrap">
                  {generatedContent}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="text-center">
                  <p className="text-lg text-gray-600 mb-4">No document generated yet</p>
                  <p className="text-sm text-gray-500 mb-6">
                    Enter product details and select sections to generate a document
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab('module3')}
                    className="flex items-center gap-2"
                  >
                    Go to Document Setup
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between bg-gray-50 rounded-b-md">
        <div className="text-sm text-gray-600">
          <span className="font-medium">ICH M4Q:</span> Common Technical Document for the
          Registration of Pharmaceuticals for Human Use
        </div>
        <div className="text-sm text-gray-600">
          Compliant with FDA, EMA, and other global regulatory authorities
        </div>
      </CardFooter>
    </Card>
  );
};

export default RegulatoryDocumentGenerator;
