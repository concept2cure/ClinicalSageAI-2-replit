import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Download, Play, BarChart4, BadgeCheck } from 'lucide-react';
import UseCaseDetail from './UseCaseDetail';
import { useToast } from '@/hooks/use-toast';
import { useCaseData } from './use-case-data';

export type UseCase = {
  id: string;
  title: string;
  audience: string;
  challenge: string;
  background: string;
  traditionalApproach: {
    cost: string;
    timeline: string;
    challenges: string;
  };
  trialSageSolution: {
    modules: string[];
    inputs: {
      indication: string;
      phase: string;
      sampleSize: number;
      duration: string;
      primaryEndpoint: string;
      [key: string]: string | number; // Index signature for any other properties
    };
    outcomes: {
      timeSaved: string;
      costAvoided: string;
      regulatoryAlignment: string;
      riskMitigation: string;
      [key: string]: string; // Index signature for any other properties
    };
  };
  deliverables: string[];
  interactiveDemo?: {
    sampleChartData?: any;
    sampleProtocolSection?: string;
  };
};

export default function UseCaseLibrary() {
  const [selectedUseCase, setSelectedUseCase] = useState<UseCase | null>(null);
  const [currentTab, setCurrentTab] = useState('biotech');
  const { toast } = useToast();

  const filteredUseCases = useCaseData.filter((useCase: UseCase) => {
    if (currentTab === 'all') return true;
    if (currentTab === 'biotech') return useCase.audience.toLowerCase().includes('biotech');
    if (currentTab === 'cro') return useCase.audience.toLowerCase().includes('cro');
    if (currentTab === 'regulatory') return useCase.audience.toLowerCase().includes('regulatory');
    return true;
  });

  const handleLaunchSimulation = (useCase: UseCase) => {
    // This would normally navigate to the appropriate page with context
    // toast call replaced
  // Original: toast({
      title: "Launching simulation",
      description: `Starting "${useCase.title}" simulation with pre-filled data`,
    })
  console.log('Toast would show:', {
      title: "Launching simulation",
      description: `Starting "${useCase.title}" simulation with pre-filled data`,
    });
    
    // In a real implementation, this might redirect to a specific route
    // navigate('/protocol-generator', { state: { useCaseData: useCase } });
  };

  const handleDownloadBundle = (useCase: UseCase) => {
    // toast call replaced
  // Original: toast({
      title: "Downloading bundle",
      description: `Preparing download for "${useCase.title}" assets`,
    })
  console.log('Toast would show:', {
      title: "Downloading bundle",
      description: `Preparing download for "${useCase.title}" assets`,
    });
    
    // In a real implementation, this would call an API to generate and download files
  };

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col space-y-2 mb-8">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
          Strategic Intelligence Launcher
        </h2>
        <p className="text-muted-foreground text-lg">
          Real-world scenario simulations for clinical trial design - not just information, but actionable intelligence
        </p>
      </div>
      
      <Tabs defaultValue="biotech" onValueChange={setCurrentTab} className="w-full">
        <TabsList className="grid grid-cols-4 mb-6 w-full sm:w-2/3 md:w-1/2">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="biotech">Biotech</TabsTrigger>
          <TabsTrigger value="cro">CRO</TabsTrigger>
          <TabsTrigger value="regulatory">Regulatory</TabsTrigger>
        </TabsList>
        
        {Object.keys(useCaseData).length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
            {filteredUseCases.map((useCase: UseCase) => (
              <Card 
                key={useCase.id} 
                className="overflow-hidden border-l-4 border-l-blue-500 shadow-md hover:shadow-lg transition-shadow"
              >
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-semibold">{useCase.title}</h3>
                        <p className="text-sm text-gray-600">🎯 {useCase.audience}</p>
                      </div>
                      <Badge variant="outline" className="bg-blue-50">
                        {useCase.trialSageSolution.inputs.phase}
                      </Badge>
                    </div>
                    
                    <div className="text-sm">
                      <p>{useCase.challenge}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Traditional Cost</p>
                        <p className="font-medium">{useCase.traditionalApproach.cost}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Timeline</p>
                        <p className="font-medium">{useCase.traditionalApproach.timeline}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Cost Savings</p>
                        <p className="font-medium text-green-600">{useCase.trialSageSolution.outcomes.costAvoided}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Time Saved</p>
                        <p className="font-medium text-green-600">{useCase.trialSageSolution.outcomes.timeSaved}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mb-2">
                      {useCase.trialSageSolution.modules.slice(0, 3).map((module: string, idx: number) => (
                        <Badge key={idx} variant="secondary" className="bg-blue-50">
                          {module}
                        </Badge>
                      ))}
                      {useCase.trialSageSolution.modules.length > 3 && (
                        <Badge variant="secondary" className="bg-blue-50">
                          +{useCase.trialSageSolution.modules.length - 3} more
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center pt-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            className="group"
                            onClick={() => setSelectedUseCase(useCase)}
                          >
                            View Details
                            <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                          {selectedUseCase && <UseCaseDetail 
                            useCase={selectedUseCase}
                            onLaunch={() => handleLaunchSimulation(selectedUseCase)}
                            onDownload={() => handleDownloadBundle(selectedUseCase)}
                          />}
                        </DialogContent>
                      </Dialog>
                      
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => handleDownloadBundle(useCase)}
                          title="Download bundle"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="default" 
                          size="icon"
                          onClick={() => handleLaunchSimulation(useCase)}
                          title="Launch simulation"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <p className="text-muted-foreground">No use cases found for this category.</p>
          </div>
        )}
      </Tabs>
      
      <div className="mt-10 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 shadow-sm">
        <h3 className="text-xl font-semibold mb-4">Why Use the Strategic Intelligence Launcher?</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex space-x-3">
            <div className="flex-shrink-0">
              <BarChart4 className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium">Data-Driven Decisions</h4>
              <p className="text-sm text-gray-600">Leverage real-world CSR data to inform protocol design</p>
            </div>
          </div>
          <div className="flex space-x-3">
            <div className="flex-shrink-0">
              <Play className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium">Pre-Configured Workflows</h4>
              <p className="text-sm text-gray-600">Start with optimized templates and inputs</p>
            </div>
          </div>
          <div className="flex space-x-3">
            <div className="flex-shrink-0">
              <BadgeCheck className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium">Regulatory Alignment</h4>
              <p className="text-sm text-gray-600">Ensure your protocols match successful precedents</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}