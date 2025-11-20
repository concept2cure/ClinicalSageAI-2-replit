import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight, AlertCircle, CheckCircle, Download } from 'lucide-react';

const FormulationDecisionTree = () => {
  const [activeTab, setActiveTab] = useState('properties');
  const [formData, setFormData] = useState({
    drugProperties: {
      solubility: 'low',
      permeability: 'high',
      stability: {
        thermal: 'stable',
        oxidative: 'sensitive',
        hydrolytic: 'stable',
        photolytic: 'stable',
      },
      particleSize: '25',
      hygroscopicity: 'moderate',
      flowability: 'poor',
    },
    targetProduct: {
      dosageForm: 'tablet',
      releaseProfile: 'immediate',
      doseStrengths: ['10', '25', '50'],
      patientPopulation: 'adult',
      administrationRoute: 'oral',
    },
    manufacturingConstraints: {
      batchSize: 'medium',
      equipmentAvailable: ['blender', 'granulator', 'tablet-press'],
      processPreference: 'wet-granulation',
    },
  });

  const [recommendation, setRecommendation] = useState(null);

  const handlePropertyChange = (category, property, value) => {
    setFormData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [property]: value,
      },
    }));
  };

  const handleStabilityChange = (stabilityType, value) => {
    setFormData(prev => ({
      ...prev,
      drugProperties: {
        ...prev.drugProperties,
        stability: {
          ...prev.drugProperties.stability,
          [stabilityType]: value,
        },
      },
    }));
  };

  const handleArrayChange = (category, property, value) => {
    const valueArray = value.split(',').map(item => item.trim());
    setFormData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [property]: valueArray,
      },
    }));
  };

  const generateRecommendation = () => {
    // This is a simplified algorithm - in a real implementation, this would be more complex
    // or potentially call an API for AI-based recommendations

    const { drugProperties, targetProduct, manufacturingConstraints } = formData;
    let recommendation = {
      formulationApproach: '',
      excipients: [],
      processingMethod: '',
      criticalControlPoints: [],
      stabilityConsiderations: [],
      regulatoryConsiderations: [],
    };

    // Determine formulation approach based on BCS class
    if (drugProperties.solubility === 'low' && drugProperties.permeability === 'high') {
      // BCS Class II
      recommendation.formulationApproach = 'Solubility enhancement formulation';
      recommendation.excipients.push(
        'Surfactant (e.g., SLS, polysorbate 80)',
        'Solubilizer (e.g., PEG, povidone)',
        'Disintegrant (e.g., croscarmellose sodium)',
        'Diluent (e.g., lactose monohydrate)',
        'Binder (e.g., HPMC)',
        'Lubricant (e.g., magnesium stearate, low amount)'
      );
      recommendation.stabilityConsiderations.push(
        'Monitor for potential degradation due to surfactant interaction',
        'Evaluate need for antioxidant if oxidatively sensitive'
      );
    } else if (drugProperties.solubility === 'high' && drugProperties.permeability === 'high') {
      // BCS Class I
      recommendation.formulationApproach = 'Conventional immediate release formulation';
      recommendation.excipients.push(
        'Diluent (e.g., microcrystalline cellulose)',
        'Disintegrant (e.g., croscarmellose sodium)',
        'Binder (e.g., povidone)',
        'Lubricant (e.g., magnesium stearate)'
      );
    } else if (drugProperties.solubility === 'high' && drugProperties.permeability === 'low') {
      // BCS Class III
      recommendation.formulationApproach = 'Permeability-enhancing formulation';
      recommendation.excipients.push(
        'Permeation enhancer (e.g., sodium caprate)',
        'Microcrystalline cellulose',
        'Disintegrant (e.g., sodium starch glycolate)',
        'Lubricant (e.g., magnesium stearate)'
      );
    } else {
      // BCS Class IV
      recommendation.formulationApproach =
        'Complex formulation with both solubility and permeability enhancement';
      recommendation.excipients.push(
        'Cyclodextrin complex',
        'Surfactant (e.g., poloxamer)',
        'Permeation enhancer',
        'Disintegrant (super-disintegrant)',
        'Diluent (e.g., mannitol)'
      );
    }

    // Processing method based on constraints
    if (manufacturingConstraints.processPreference === 'direct-compression') {
      recommendation.processingMethod = 'Direct compression';
      recommendation.criticalControlPoints.push(
        'Particle size distribution of blend',
        'Blend uniformity',
        'Tablet hardness',
        'Disintegration time'
      );
    } else if (manufacturingConstraints.processPreference === 'wet-granulation') {
      recommendation.processingMethod = 'Wet granulation';
      recommendation.criticalControlPoints.push(
        'Granulation end point',
        'Drying temperature and time',
        'Granule size distribution',
        'Tablet hardness',
        'Dissolution profile'
      );
    } else {
      recommendation.processingMethod = 'Dry granulation (roller compaction)';
      recommendation.criticalControlPoints.push(
        'Ribbon density',
        'Granule size distribution',
        'Tablet hardness',
        'Content uniformity'
      );
    }

    // Stability considerations
    if (drugProperties.stability.oxidative === 'sensitive') {
      recommendation.excipients.push('Antioxidant (e.g., BHT, ascorbic acid)');
      recommendation.stabilityConsiderations.push(
        'Use nitrogen purging during processing',
        'Consider oxygen-barrier packaging'
      );
    }

    if (drugProperties.stability.hydrolytic === 'sensitive') {
      recommendation.excipients = recommendation.excipients.filter(e => !e.includes('lactose'));
      recommendation.excipients.push('Anhydrous diluent (e.g., anhydrous lactose, mannitol)');
      recommendation.stabilityConsiderations.push(
        'Control processing humidity',
        'Use desiccant in packaging'
      );
    }

    if (drugProperties.hygroscopicity === 'high') {
      recommendation.stabilityConsiderations.push(
        'Use low humidity processing environment',
        'Consider moisture-protective coating',
        'Use appropriate moisture barrier packaging'
      );
    }

    // Regulatory considerations
    recommendation.regulatoryConsiderations.push(
      'Ensure all excipients are GRAS listed or have DMF',
      'Document excipient compatibility studies',
      'Justify functional excipients with data'
    );

    if (targetProduct.patientPopulation === 'pediatric') {
      recommendation.regulatoryConsiderations.push(
        'Avoid certain colorants (e.g., azo dyes)',
        'Consider taste-masking requirements',
        'Document safety assessment of all excipients for pediatric use'
      );
    }

    setRecommendation(recommendation);
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle>Formulation Decision Tree Assistant</CardTitle>
        <CardDescription>
          Generate optimal formulation recommendations based on API properties and processing
          constraints
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="properties" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="properties">API Properties</TabsTrigger>
            <TabsTrigger value="target">Target Product</TabsTrigger>
            <TabsTrigger value="manufacturing">Manufacturing</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
          </TabsList>

          <TabsContent value="properties">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="solubility">Aqueous Solubility</Label>
                    <Select
                      value={formData.drugProperties.solubility}
                      onValueChange={value =>
                        handlePropertyChange('drugProperties', 'solubility', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select solubility" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High (more than 1 mg/mL)</SelectItem>
                        <SelectItem value="moderate">Moderate (0.1-1 mg/mL)</SelectItem>
                        <SelectItem value="low">Low (0.01-0.1 mg/mL)</SelectItem>
                        <SelectItem value="very-low">Very Low (less than 0.01 mg/mL)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="permeability">Permeability</Label>
                    <Select
                      value={formData.drugProperties.permeability}
                      onValueChange={value =>
                        handlePropertyChange('drugProperties', 'permeability', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select permeability" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High (more than 90% absorbed)</SelectItem>
                        <SelectItem value="moderate">Moderate (50-90% absorbed)</SelectItem>
                        <SelectItem value="low">Low (less than 50% absorbed)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="particleSize">Median Particle Size (μm)</Label>
                    <Input
                      id="particleSize"
                      type="number"
                      value={formData.drugProperties.particleSize}
                      onChange={e =>
                        handlePropertyChange('drugProperties', 'particleSize', e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">Stability Profile</h3>
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="thermal">Thermal Stability</Label>
                    <Select
                      value={formData.drugProperties.stability.thermal}
                      onValueChange={value => handleStabilityChange('thermal', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select stability" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stable">Stable</SelectItem>
                        <SelectItem value="sensitive">Sensitive</SelectItem>
                        <SelectItem value="very-sensitive">Very Sensitive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="oxidative">Oxidative Stability</Label>
                    <Select
                      value={formData.drugProperties.stability.oxidative}
                      onValueChange={value => handleStabilityChange('oxidative', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select stability" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stable">Stable</SelectItem>
                        <SelectItem value="sensitive">Sensitive</SelectItem>
                        <SelectItem value="very-sensitive">Very Sensitive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="hydrolytic">Hydrolytic Stability</Label>
                    <Select
                      value={formData.drugProperties.stability.hydrolytic}
                      onValueChange={value => handleStabilityChange('hydrolytic', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select stability" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stable">Stable</SelectItem>
                        <SelectItem value="sensitive">Sensitive</SelectItem>
                        <SelectItem value="very-sensitive">Very Sensitive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="hygroscopicity">Hygroscopicity</Label>
                <Select
                  value={formData.drugProperties.hygroscopicity}
                  onValueChange={value =>
                    handlePropertyChange('drugProperties', 'hygroscopicity', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select hygroscopicity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="non">Non-hygroscopic</SelectItem>
                    <SelectItem value="slight">Slightly hygroscopic</SelectItem>
                    <SelectItem value="moderate">Moderately hygroscopic</SelectItem>
                    <SelectItem value="high">Highly hygroscopic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="flowability">Powder Flowability</Label>
                <Select
                  value={formData.drugProperties.flowability}
                  onValueChange={value =>
                    handlePropertyChange('drugProperties', 'flowability', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select flowability" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excellent">Excellent</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                    <SelectItem value="very-poor">Very poor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={() => setActiveTab('target')}>
                Next <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="target">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="dosageForm">Dosage Form</Label>
                <Select
                  value={formData.targetProduct.dosageForm}
                  onValueChange={value =>
                    handlePropertyChange('targetProduct', 'dosageForm', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select dosage form" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="capsule">Capsule</SelectItem>
                    <SelectItem value="granules">Granules</SelectItem>
                    <SelectItem value="suspension">Suspension</SelectItem>
                    <SelectItem value="solution">Solution</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="releaseProfile">Release Profile</Label>
                <Select
                  value={formData.targetProduct.releaseProfile}
                  onValueChange={value =>
                    handlePropertyChange('targetProduct', 'releaseProfile', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select release profile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate Release</SelectItem>
                    <SelectItem value="modified">Modified Release</SelectItem>
                    <SelectItem value="extended">Extended Release</SelectItem>
                    <SelectItem value="delayed">Delayed Release</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="doseStrengths">Dose Strengths (mg, comma separated)</Label>
                <Input
                  id="doseStrengths"
                  value={formData.targetProduct.doseStrengths.join(', ')}
                  onChange={e =>
                    handleArrayChange('targetProduct', 'doseStrengths', e.target.value)
                  }
                />
              </div>

              <div>
                <Label htmlFor="patientPopulation">Target Patient Population</Label>
                <Select
                  value={formData.targetProduct.patientPopulation}
                  onValueChange={value =>
                    handlePropertyChange('targetProduct', 'patientPopulation', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select population" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adult">Adult</SelectItem>
                    <SelectItem value="geriatric">Geriatric</SelectItem>
                    <SelectItem value="pediatric">Pediatric</SelectItem>
                    <SelectItem value="all-ages">All Ages</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="administrationRoute">Administration Route</Label>
                <Select
                  value={formData.targetProduct.administrationRoute}
                  onValueChange={value =>
                    handlePropertyChange('targetProduct', 'administrationRoute', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select route" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oral">Oral</SelectItem>
                    <SelectItem value="sublingual">Sublingual</SelectItem>
                    <SelectItem value="buccal">Buccal</SelectItem>
                    <SelectItem value="topical">Topical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab('properties')}>
                Previous
              </Button>
              <Button onClick={() => setActiveTab('manufacturing')}>
                Next <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="manufacturing">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="batchSize">Production Batch Size</Label>
                <Select
                  value={formData.manufacturingConstraints.batchSize}
                  onValueChange={value =>
                    handlePropertyChange('manufacturingConstraints', 'batchSize', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select batch size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small (less than 10 kg)</SelectItem>
                    <SelectItem value="medium">Medium (10-100 kg)</SelectItem>
                    <SelectItem value="large">Large (more than 100 kg)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="processPreference">Preferred Manufacturing Process</Label>
                <Select
                  value={formData.manufacturingConstraints.processPreference}
                  onValueChange={value =>
                    handlePropertyChange('manufacturingConstraints', 'processPreference', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select process" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct-compression">Direct Compression</SelectItem>
                    <SelectItem value="wet-granulation">Wet Granulation</SelectItem>
                    <SelectItem value="dry-granulation">Dry Granulation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2">
                <Label htmlFor="equipmentAvailable">Equipment Available</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="blender"
                      checked={formData.manufacturingConstraints.equipmentAvailable.includes(
                        'blender'
                      )}
                    />
                    <label htmlFor="blender" className="text-sm font-medium">
                      High-Shear Blender
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="granulator"
                      checked={formData.manufacturingConstraints.equipmentAvailable.includes(
                        'granulator'
                      )}
                    />
                    <label htmlFor="granulator" className="text-sm font-medium">
                      Fluid Bed Granulator
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="roller"
                      checked={formData.manufacturingConstraints.equipmentAvailable.includes(
                        'roller'
                      )}
                    />
                    <label htmlFor="roller" className="text-sm font-medium">
                      Roller Compactor
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="tablet-press"
                      checked={formData.manufacturingConstraints.equipmentAvailable.includes(
                        'tablet-press'
                      )}
                    />
                    <label htmlFor="tablet-press" className="text-sm font-medium">
                      Tablet Press
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="coater"
                      checked={formData.manufacturingConstraints.equipmentAvailable.includes(
                        'coater'
                      )}
                    />
                    <label htmlFor="coater" className="text-sm font-medium">
                      Film Coater
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="encapsulator"
                      checked={formData.manufacturingConstraints.equipmentAvailable.includes(
                        'encapsulator'
                      )}
                    />
                    <label htmlFor="encapsulator" className="text-sm font-medium">
                      Encapsulator
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab('target')}>
                Previous
              </Button>
              <Button
                onClick={() => {
                  generateRecommendation();
                  setActiveTab('results');
                }}
              >
                Generate Recommendations
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="results">
            {!recommendation ? (
              <div className="flex flex-col items-center justify-center py-10">
                <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
                <p>Please generate recommendations first</p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    generateRecommendation();
                  }}
                >
                  Generate Recommendations
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-muted p-4 rounded-md">
                  <h3 className="text-lg font-medium">Recommended Formulation Approach</h3>
                  <p className="mt-2">{recommendation.formulationApproach}</p>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Recommended Excipients</h3>
                  <ul className="list-disc list-inside space-y-1">
                    {recommendation.excipients.map((excipient, index) => (
                      <li key={index}>{excipient}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Processing Method</h3>
                  <p>{recommendation.processingMethod}</p>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Critical Control Points</h3>
                  <ul className="list-disc list-inside space-y-1">
                    {recommendation.criticalControlPoints.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Stability Considerations</h3>
                  <ul className="list-disc list-inside space-y-1">
                    {recommendation.stabilityConsiderations.map((consideration, index) => (
                      <li key={index}>{consideration}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Regulatory Considerations</h3>
                  <ul className="list-disc list-inside space-y-1">
                    {recommendation.regulatoryConsiderations.map((consideration, index) => (
                      <li key={index}>{consideration}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab('manufacturing')}>
                Previous
              </Button>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export Recommendation
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default FormulationDecisionTree;
