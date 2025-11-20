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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertCircle, CheckCircle, XCircle, Search, FileText, AlertTriangle } from 'lucide-react';

const ExcipientCompatibilityAnalyzer = () => {
  const [activeTab, setActiveTab] = useState('analyzer');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [selectedExcipients, setSelectedExcipients] = useState([
    { id: 1, name: 'Microcrystalline Cellulose', function: 'Diluent', concentration: '30.0' },
    { id: 2, name: 'Lactose Monohydrate', function: 'Diluent', concentration: '35.5' },
    { id: 3, name: 'Croscarmellose Sodium', function: 'Disintegrant', concentration: '4.0' },
    { id: 4, name: 'Magnesium Stearate', function: 'Lubricant', concentration: '0.5' },
  ]);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  // Mock compatibility results
  const compatibilityResults = {
    'Microcrystalline Cellulose': {
      status: 'compatible',
      details: 'No known incompatibility issues.',
    },
    'Lactose Monohydrate': {
      status: 'caution',
      details:
        'Potential for Maillard reaction under elevated temperature/humidity. Monitor stability studies closely.',
    },
    'Croscarmellose Sodium': { status: 'compatible', details: 'No known incompatibility issues.' },
    'Magnesium Stearate': {
      status: 'compatible',
      details:
        'No known incompatibility issues with API, but limit blending time to prevent hydrophobic layer formation.',
    },
  };

  // Mock literature references
  const literatureReferences = [
    {
      id: 1,
      title: 'Handbook of Pharmaceutical Excipients, 9th Edition',
      description:
        'Comprehensive reference on excipient properties and compatibility considerations.',
    },
    {
      id: 2,
      title: 'Excipient-API Interactions in Solid Dosage Forms',
      journal: 'Journal of Pharmaceutical Sciences, 2024',
      description: 'Recent review of common excipient-drug interactions and mitigation strategies.',
    },
    {
      id: 3,
      title: 'Stability Considerations in Formulation Development',
      journal: 'International Journal of Pharmaceutics, 2023',
      description: 'Framework for evaluating excipient compatibility during development.',
    },
  ];

  // Mock case studies
  const caseStudies = [
    {
      id: 1,
      title: 'Impact of Moisture on Lactose-Containing Formulations',
      description:
        'Case study demonstrating increased degradation in high-humidity storage conditions.',
      relevance: 'high',
    },
    {
      id: 2,
      title: 'Effect of Mixing Time on Tablet Dissolution with Hydrophobic Lubricants',
      description: 'Demonstrates impact of overblending with magnesium stearate.',
      relevance: 'medium',
    },
    {
      id: 3,
      title: 'pH Microenvironment Effects with Acidic Excipients',
      description: 'Local pH effects causing degradation in tablet cores.',
      relevance: 'low',
    },
  ];

  const excipientOptions = [
    'Microcrystalline Cellulose',
    'Lactose Monohydrate',
    'Croscarmellose Sodium',
    'Magnesium Stearate',
    'Colloidal Silicon Dioxide',
    'Povidone',
    'Pregelatinized Starch',
    'Sodium Starch Glycolate',
    'Stearic Acid',
    'Hydroxypropyl Methylcellulose',
    'Polyethylene Glycol',
    'Titanium Dioxide',
  ];

  const handleAddExcipient = () => {
    if (selectedExcipients.length < 10) {
      setSelectedExcipients([
        ...selectedExcipients,
        {
          id: Date.now(),
          name: '',
          function: '',
          concentration: '',
        },
      ]);
    }
  };

  const handleRemoveExcipient = id => {
    setSelectedExcipients(selectedExcipients.filter(excipient => excipient.id !== id));
  };

  const handleExcipientChange = (id, field, value) => {
    setSelectedExcipients(
      selectedExcipients.map(excipient =>
        excipient.id === id ? { ...excipient, [field]: value } : excipient
      )
    );
  };

  const handleAnalyze = () => {
    // Simulate analysis
    setAnalysisComplete(true);
  };

  const getStatusIcon = status => {
    switch (status) {
      case 'compatible':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'caution':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'incompatible':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getRelevanceBadge = relevance => {
    const classes = {
      high: 'bg-red-100 text-red-800 border-red-200',
      medium: 'bg-amber-100 text-amber-800 border-amber-200',
      low: 'bg-blue-100 text-blue-800 border-blue-200',
    };

    return (
      <span className={`text-xs px-2 py-1 rounded-full border ${classes[relevance]}`}>
        {relevance}
      </span>
    );
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle>Excipient Compatibility Analyzer</CardTitle>
        <CardDescription>
          Analyze drug-excipient compatibility and identify potential formulation risks
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="analyzer">Compatibility Analyzer</TabsTrigger>
            <TabsTrigger value="results">Analysis Results</TabsTrigger>
            <TabsTrigger value="literature">Literature References</TabsTrigger>
            <TabsTrigger value="case-studies">Case Studies</TabsTrigger>
          </TabsList>

          <TabsContent value="analyzer">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="active-ingredient">Active Pharmaceutical Ingredient</Label>
                <Input
                  id="active-ingredient"
                  placeholder="Enter API name"
                  value={activeIngredient}
                  onChange={e => setActiveIngredient(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Excipients</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddExcipient}
                    disabled={selectedExcipients.length >= 10}
                  >
                    Add Excipient
                  </Button>
                </div>

                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">Name</TableHead>
                        <TableHead className="w-[30%]">Function</TableHead>
                        <TableHead className="w-[20%]">% w/w</TableHead>
                        <TableHead className="w-[10%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedExcipients.map(excipient => (
                        <TableRow key={excipient.id}>
                          <TableCell>
                            <Select
                              value={excipient.name}
                              onValueChange={value =>
                                handleExcipientChange(excipient.id, 'name', value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select excipient" />
                              </SelectTrigger>
                              <SelectContent>
                                {excipientOptions.map(option => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="Function"
                              value={excipient.function}
                              onChange={e =>
                                handleExcipientChange(excipient.id, 'function', e.target.value)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="% w/w"
                              value={excipient.concentration}
                              onChange={e =>
                                handleExcipientChange(excipient.id, 'concentration', e.target.value)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveExcipient(excipient.id)}
                              disabled={selectedExcipients.length <= 1}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="additional-info">Additional Information</Label>
                <Textarea
                  id="additional-info"
                  placeholder="Enter any additional information about the formulation, such as processing conditions, special considerations, etc."
                />
              </div>

              <div className="flex justify-center mt-4">
                <Button onClick={handleAnalyze} className="flex items-center gap-2">
                  <Search size={16} />
                  Analyze Compatibility
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="results">
            {analysisComplete ? (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
                  <h3 className="text-base font-medium text-blue-800">
                    Compatibility Analysis Summary
                  </h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Analysis completed for {activeIngredient || 'Active Ingredient'} with{' '}
                    {selectedExcipients.length} excipients. No critical incompatibilities detected.
                    One potential interaction noted with Lactose Monohydrate that should be
                    monitored during stability studies.
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-base font-medium">Detailed Results</h3>

                  {selectedExcipients.map(excipient => {
                    const result = compatibilityResults[excipient.name] || {
                      status: 'unknown',
                      details: 'No compatibility data available.',
                    };
                    return (
                      <div key={excipient.id} className="border rounded-md p-3">
                        <div className="flex items-start">
                          <div className="mr-3 mt-1">{getStatusIcon(result.status)}</div>
                          <div>
                            <h4 className="text-sm font-medium">{excipient.name}</h4>
                            <p className="text-xs text-gray-700 mt-1">
                              {excipient.function}, {excipient.concentration}% w/w
                            </p>
                            <p className="text-sm mt-2">{result.details}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                  <h3 className="text-base font-medium">Recommendations</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    <li className="flex items-start">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                      <span>
                        Include forced degradation studies to confirm compatibility under stress
                        conditions.
                      </span>
                    </li>
                    <li className="flex items-start">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                      <span>
                        Monitor potential Maillard reaction with lactose in stability studies,
                        especially at accelerated conditions.
                      </span>
                    </li>
                    <li className="flex items-start">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                      <span>
                        Optimize blending time to prevent hydrophobic layer formation from magnesium
                        stearate.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">Run compatibility analysis to see results</p>
                <Button onClick={() => setActiveTab('analyzer')} variant="outline" className="mt-4">
                  Go to Analyzer
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="literature">
            <div className="space-y-4">
              <div className="relative">
                <div className="flex items-center border rounded-md pl-3 overflow-hidden">
                  <Search className="h-4 w-4 text-gray-500" />
                  <Input
                    className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    placeholder="Search literature references"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {literatureReferences.map(reference => (
                  <div key={reference.id} className="border rounded-md p-3">
                    <div className="flex items-start">
                      <FileText className="h-5 w-5 text-blue-500 mr-3 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-medium">{reference.title}</h4>
                        {reference.journal && (
                          <p className="text-xs text-gray-700 mt-1">{reference.journal}</p>
                        )}
                        <p className="text-sm mt-2">{reference.description}</p>
                        <Button variant="link" className="h-8 px-0 text-sm">
                          View Reference
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="case-studies">
            <div className="space-y-3">
              {caseStudies.map(study => (
                <Card key={study.id} className="shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{study.title}</CardTitle>
                      {getRelevanceBadge(study.relevance)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{study.description}</p>
                  </CardContent>
                  <CardFooter>
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ExcipientCompatibilityAnalyzer;
