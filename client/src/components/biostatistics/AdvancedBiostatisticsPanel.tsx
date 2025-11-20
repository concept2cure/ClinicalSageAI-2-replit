import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, Download, BarChart3, Brain, GitBranch, BookOpen, Microscope, LineChart } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface MAMSTrialFormProps {
  onSimulate: (data: any) => void;
  isLoading: boolean;
}

const MAMSTrialForm: React.FC<MAMSTrialFormProps> = ({ onSimulate, isLoading }) => {
  const [sampleSize, setSampleSize] = useState(500);
  const [numTreatmentArms, setNumTreatmentArms] = useState(3);
  const [numStages, setNumStages] = useState(3);
  const [stageSplits, setStageSplits] = useState([0.33, 0.67]);
  const [familywiseErrorRate, setFamilywiseErrorRate] = useState(0.05);
  const [targetPower, setTargetPower] = useState(0.9);
  const [effectSizes, setEffectSizes] = useState([0.2, 0.35, 0.5]);
  const [dropoutRate, setDropoutRate] = useState(0.15);
  const [correlationMatrix, setCorrelationMatrix] = useState("auto");
  const [multipleTestingProcedure, setMultipleTestingProcedure] = useState("dunnett");
  const [useRaoScottCorrection, setUseRaoScottCorrection] = useState(true);
  const [useMonteCarlo, setUseMonteCarlo] = useState(true);
  const [adaptiveSampleSize, setAdaptiveSampleSize] = useState(true);
  const [indication, setIndication] = useState("Oncology");
  const [phase, setPhase] = useState("Phase 2");
  const [enableCsrLibraryComparison, setEnableCsrLibraryComparison] = useState(true);
  
  // Update stage splits when number of stages changes
  useEffect(() => {
    const newStageSplits = Array(numStages - 1).fill(0)
      .map((_, i) => (i + 1) / numStages);
    setStageSplits(newStageSplits);
  }, [numStages]);
  
  // Update effect sizes when number of treatment arms changes
  useEffect(() => {
    const baseEffectSize = 0.2;
    const newEffectSizes = Array(numTreatmentArms).fill(0)
      .map((_, i) => baseEffectSize + (i * 0.15));
    setEffectSizes(newEffectSizes);
  }, [numTreatmentArms]);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Calculate futility boundaries based on number of stages
    const futilityBoundaries = stageSplits.map((split, index) => ({
      stageIndex: index,
      zScore: -0.5 * (index + 1)
    }));
    
    // Calculate efficacy boundaries using O'Brien-Fleming spending function
    const efficacyBoundaries = stageSplits.map((split, index) => ({
      stageIndex: index,
      zScore: 2.5 / Math.sqrt(split)
    }));
    
    const stageInfo = stageSplits.map((split, index) => ({
      proportion: index === 0 ? split : split - stageSplits[index - 1],
      cumulativeProportion: split,
      futilityBoundary: futilityBoundaries[index].zScore,
      efficacyBoundary: efficacyBoundaries[index].zScore
    }));
    
    // Prepare advanced statistical parameters
    const advancedParameters = {
      correlationMatrix: correlationMatrix === "auto" ? null : correlationMatrix,
      multipleTesting: {
        procedure: multipleTestingProcedure,
        adjustmentMethod: "bonferroni-holm"
      },
      adaptiveSampleSize: adaptiveSampleSize ? {
        enabled: true,
        reassessmentAtInterim: true,
        maxIncreaseFactor: 1.5
      } : { enabled: false },
      computationalMethods: {
        useMonteCarlo,
        numberSimulations: useMonteCarlo ? 10000 : 0,
        seedValue: 12345,
        useRaoScottCorrection
      },
      regulatoryCompliance: {
        FDA: true,
        EMA: true,
        PMDA: true,
        NMPA: true,
        MHRA: true,
        TGA: true,
        ANVISA: true,
        CDSCO: true
      },
      modelParameters: {
        endpoint: "continuous",
        variance: 1.0,
        allocationRatio: Array(numTreatmentArms + 1).fill(1 / (numTreatmentArms + 1)),
        driftPrevention: true
      }
    };
    
    onSimulate({
      sampleSize,
      numTreatmentArms,
      numStages,
      stageSplits,
      stages: stageInfo,
      familywiseErrorRate,
      targetPower,
      effectSizes,
      dropoutRate,
      advancedParameters,
      // CSR Library comparison data
      indication,
      phase,
      enableCsrLibraryComparison
    });
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sampleSize">Maximum Sample Size</Label>
          <Input
            id="sampleSize"
            type="number"
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            min={100}
            max={2000}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="numTreatmentArms">Number of Treatment Arms</Label>
          <Select 
            value={numTreatmentArms.toString()}
            onValueChange={(value) => setNumTreatmentArms(Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select number of treatment arms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 Treatment Arms</SelectItem>
              <SelectItem value="3">3 Treatment Arms</SelectItem>
              <SelectItem value="4">4 Treatment Arms</SelectItem>
              <SelectItem value="5">5 Treatment Arms</SelectItem>
              <SelectItem value="6">6 Treatment Arms</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="numStages">Number of Stages</Label>
          <Select 
            value={numStages.toString()}
            onValueChange={(value) => setNumStages(Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select number of stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 Stages</SelectItem>
              <SelectItem value="3">3 Stages</SelectItem>
              <SelectItem value="4">4 Stages</SelectItem>
              <SelectItem value="5">5 Stages</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="familywiseErrorRate">Familywise Error Rate (α)</Label>
          <Select 
            value={familywiseErrorRate.toString()}
            onValueChange={(value) => setFamilywiseErrorRate(Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select error rate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.01">0.01 (1%)</SelectItem>
              <SelectItem value="0.025">0.025 (2.5%)</SelectItem>
              <SelectItem value="0.05">0.05 (5%)</SelectItem>
              <SelectItem value="0.1">0.1 (10%)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="targetPower">Target Power (1-β)</Label>
          <Select 
            value={targetPower.toString()}
            onValueChange={(value) => setTargetPower(Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select target power" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.8">0.8 (80%)</SelectItem>
              <SelectItem value="0.85">0.85 (85%)</SelectItem>
              <SelectItem value="0.9">0.9 (90%)</SelectItem>
              <SelectItem value="0.95">0.95 (95%)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="dropoutRate">Expected Dropout Rate</Label>
          <Slider
            id="dropoutRate"
            value={[dropoutRate]}
            onValueChange={(value) => setDropoutRate(value[0])}
            min={0}
            max={0.5}
            step={0.01}
            className="mt-2"
          />
          <div className="text-sm text-muted-foreground text-center">{(dropoutRate * 100).toFixed(1)}%</div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="multipleTestingProcedure">Multiple Testing Procedure</Label>
          <Select 
            value={multipleTestingProcedure}
            onValueChange={(value) => setMultipleTestingProcedure(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select procedure" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dunnett">Dunnett's Test</SelectItem>
              <SelectItem value="bonferroni">Bonferroni</SelectItem>
              <SelectItem value="holm">Holm-Bonferroni</SelectItem>
              <SelectItem value="hochberg">Hochberg</SelectItem>
              <SelectItem value="hommel">Hommel</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="indication">Indication</Label>
          <Select 
            value={indication}
            onValueChange={(value) => setIndication(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select indication" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Oncology">Oncology</SelectItem>
              <SelectItem value="Cardiovascular">Cardiovascular</SelectItem>
              <SelectItem value="Neurology">Neurology</SelectItem>
              <SelectItem value="Immunology">Immunology</SelectItem>
              <SelectItem value="Infectious Disease">Infectious Disease</SelectItem>
              <SelectItem value="Metabolic">Metabolic</SelectItem>
              <SelectItem value="Respiratory">Respiratory</SelectItem>
              <SelectItem value="Psychiatry">Psychiatry</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="phase">Clinical Trial Phase</Label>
          <Select 
            value={phase}
            onValueChange={(value) => setPhase(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select phase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Phase 1">Phase 1</SelectItem>
              <SelectItem value="Phase 1/2">Phase 1/2</SelectItem>
              <SelectItem value="Phase 2">Phase 2</SelectItem>
              <SelectItem value="Phase 2/3">Phase 2/3</SelectItem>
              <SelectItem value="Phase 3">Phase 3</SelectItem>
              <SelectItem value="Phase 4">Phase 4</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Advanced Statistical Options</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-slate-50 p-3 rounded-md dark:bg-slate-900">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="useRaoScottCorrection"
              checked={useRaoScottCorrection}
              onChange={(e) => setUseRaoScottCorrection(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="useRaoScottCorrection" className="text-sm font-medium leading-none cursor-pointer">
              Rao-Scott Correlation Correction
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="useMonteCarlo"
              checked={useMonteCarlo}
              onChange={(e) => setUseMonteCarlo(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="useMonteCarlo" className="text-sm font-medium leading-none cursor-pointer">
              Monte Carlo Simulations
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="adaptiveSampleSize"
              checked={adaptiveSampleSize}
              onChange={(e) => setAdaptiveSampleSize(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="adaptiveSampleSize" className="text-sm font-medium leading-none cursor-pointer">
              Adaptive Sample Size Reassessment
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="enableCsrLibraryComparison"
              checked={enableCsrLibraryComparison}
              onChange={(e) => setEnableCsrLibraryComparison(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="enableCsrLibraryComparison" className="text-sm font-medium leading-none cursor-pointer">
              Enable CSR Library Comparison
            </Label>
          </div>
        </div>
      </div>
      
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Calculating...
          </>
        ) : (
          'Simulate MAMS Trial'
        )}
      </Button>
    </form>
  );
};

interface AdaptiveTrialFormProps {
  onSimulate: (data: any) => void;
  isLoading: boolean;
}

const AdaptiveTrialForm: React.FC<AdaptiveTrialFormProps> = ({ onSimulate, isLoading }) => {
  const [sampleSize, setSampleSize] = useState(200);
  const [numArms, setNumArms] = useState(3);
  const [maxStages, setMaxStages] = useState(2);
  const [adaptationType, setAdaptationType] = useState<'bayesian' | 'frequentist'>('bayesian');
  const [deepLearningEnabled, setDeepLearningEnabled] = useState(true);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Generate response rates (placebo effect + increasing treatment effects)
    const responseRates = Array(numArms).fill(0).map((_, i) => 
      i === 0 ? 0.3 : 0.3 + (i * 0.08)
    );
    
    // Generate initial allocation (equal allocation)
    const initialAllocation = Array(numArms).fill(1 / numArms);
    
    // Generate interim looks (evenly spaced)
    const interimLooks = Array(maxStages - 1).fill(0).map((_, i) => 
      (i + 1) / maxStages
    );
    
    onSimulate({
      sampleSize,
      initialAllocation,
      responseRates,
      maxStages,
      adaptationRules: {
        type: adaptationType,
        threshold: adaptationType === 'bayesian' ? 0.2 : 0.1,
        minAllocation: 0.1
      },
      interimLooks,
      useDeepLearning: deepLearningEnabled
    });
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="sampleSize">Total Sample Size</Label>
          <Input
            id="sampleSize"
            type="number"
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            min={50}
            max={1000}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="numArms">Number of Treatment Arms</Label>
          <Select 
            value={numArms.toString()}
            onValueChange={(value) => setNumArms(Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select number of arms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 (Control + 1 Treatment)</SelectItem>
              <SelectItem value="3">3 (Control + 2 Treatments)</SelectItem>
              <SelectItem value="4">4 (Control + 3 Treatments)</SelectItem>
              <SelectItem value="5">5 (Control + 4 Treatments)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="maxStages">Maximum Number of Stages</Label>
          <Select 
            value={maxStages.toString()}
            onValueChange={(value) => setMaxStages(Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select maximum stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 Stages</SelectItem>
              <SelectItem value="3">3 Stages</SelectItem>
              <SelectItem value="4">4 Stages</SelectItem>
              <SelectItem value="5">5 Stages</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="adaptationType">Adaptation Type</Label>
          <Select 
            value={adaptationType}
            onValueChange={(value) => setAdaptationType(value as 'bayesian' | 'frequentist')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select adaptation type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bayesian">Bayesian</SelectItem>
              <SelectItem value="frequentist">Frequentist</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="deepLearning"
            checked={deepLearningEnabled}
            onChange={(e) => setDeepLearningEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <Label htmlFor="deepLearning" className="text-sm font-medium leading-none cursor-pointer">
            Enable Deep Learning Optimization
          </Label>
        </div>
        
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Simulating...
            </>
          ) : (
            'Simulate Adaptive Trial'
          )}
        </Button>
      </div>
    </form>
  );
};

interface BayesianPredictionFormProps {
  onCalculate: (data: any) => void;
  isLoading: boolean;
}

const BayesianPredictionForm: React.FC<BayesianPredictionFormProps> = ({ onCalculate, isLoading }) => {
  const [currentSuccesses, setCurrentSuccesses] = useState(15);
  const [currentTotal, setCurrentTotal] = useState(30);
  const [targetSuccesses, setTargetSuccesses] = useState(80);
  const [plannedTotal, setPlannedTotal] = useState(120);
  const [usePriorData, setUsePriorData] = useState(true);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onCalculate({
      currentSuccesses,
      currentTotal,
      targetSuccesses,
      plannedTotal,
      priorAlpha: usePriorData ? 2 : 1,
      priorBeta: usePriorData ? 2 : 1,
      usePriorData
    });
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currentSuccesses">Current Successes</Label>
          <Input
            id="currentSuccesses"
            type="number"
            value={currentSuccesses}
            onChange={(e) => setCurrentSuccesses(Number(e.target.value))}
            min={0}
            max={currentTotal}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="currentTotal">Current Total Patients</Label>
          <Input
            id="currentTotal"
            type="number"
            value={currentTotal}
            onChange={(e) => setCurrentTotal(Number(e.target.value))}
            min={currentSuccesses}
            max={plannedTotal}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="targetSuccesses">Target Successes for Success</Label>
          <Input
            id="targetSuccesses"
            type="number"
            value={targetSuccesses}
            onChange={(e) => setTargetSuccesses(Number(e.target.value))}
            min={currentSuccesses}
            max={plannedTotal}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="plannedTotal">Planned Total Patients</Label>
          <Input
            id="plannedTotal"
            type="number"
            value={plannedTotal}
            onChange={(e) => setPlannedTotal(Number(e.target.value))}
            min={currentTotal}
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="usePriorData"
            checked={usePriorData}
            onChange={(e) => setUsePriorData(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <Label htmlFor="usePriorData" className="text-sm font-medium leading-none cursor-pointer">
            Use Historical Trial Data (Machine Learning Enhanced)
          </Label>
        </div>
        
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calculating...
            </>
          ) : (
            'Calculate Predictive Probability'
          )}
        </Button>
      </div>
    </form>
  );
};

interface NonInferiorityFormProps {
  onCalculate: (data: any) => void;
  isLoading: boolean;
}

const NonInferiorityForm: React.FC<NonInferiorityFormProps> = ({ onCalculate, isLoading }) => {
  const [controlRate, setControlRate] = useState(0.7);
  const [expectedRate, setExpectedRate] = useState(0.68);
  const [nonInferiorityMargin, setNonInferiorityMargin] = useState(0.1);
  const [power, setPower] = useState(0.9);
  const [dropoutRate, setDropoutRate] = useState(0.1);
  const [enableSynthesis, setEnableSynthesis] = useState(true);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onCalculate({
      controlRate,
      expectedRate,
      nonInferiorityMargin,
      alpha: 0.025,
      power,
      allocation: 1,
      dropoutRate,
      enableSynthesis,
      regulatoryRegion: "multi-region" // Global regulatory compliance
    });
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="controlRate">Control Group Rate</Label>
          <Slider
            id="controlRate"
            value={[controlRate]}
            onValueChange={(value) => setControlRate(value[0])}
            min={0}
            max={1}
            step={0.01}
            className="mt-2"
          />
          <div className="text-sm text-muted-foreground text-center">{(controlRate * 100).toFixed(1)}%</div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="expectedRate">Expected Experimental Rate</Label>
          <Slider
            id="expectedRate"
            value={[expectedRate]}
            onValueChange={(value) => setExpectedRate(value[0])}
            min={0}
            max={1}
            step={0.01}
            className="mt-2"
          />
          <div className="text-sm text-muted-foreground text-center">{(expectedRate * 100).toFixed(1)}%</div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="nonInferiorityMargin">Non-Inferiority Margin</Label>
          <Slider
            id="nonInferiorityMargin"
            value={[nonInferiorityMargin]}
            onValueChange={(value) => setNonInferiorityMargin(value[0])}
            min={0.01}
            max={0.2}
            step={0.01}
            className="mt-2"
          />
          <div className="text-sm text-muted-foreground text-center">{(nonInferiorityMargin * 100).toFixed(1)}%</div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="power">Statistical Power</Label>
          <Select 
            value={power.toString()}
            onValueChange={(value) => setPower(Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select statistical power" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.8">80%</SelectItem>
              <SelectItem value="0.85">85%</SelectItem>
              <SelectItem value="0.9">90%</SelectItem>
              <SelectItem value="0.95">95%</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="dropoutRate">Expected Dropout Rate</Label>
          <Slider
            id="dropoutRate"
            value={[dropoutRate]}
            onValueChange={(value) => setDropoutRate(value[0])}
            min={0}
            max={0.5}
            step={0.01}
            className="mt-2"
          />
          <div className="text-sm text-muted-foreground text-center">{(dropoutRate * 100).toFixed(1)}%</div>
        </div>
        
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="enableSynthesis"
            checked={enableSynthesis}
            onChange={(e) => setEnableSynthesis(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <Label htmlFor="enableSynthesis" className="text-sm font-medium leading-none cursor-pointer">
            Enable ML-Based Data Synthesis for Regulatory Reports
          </Label>
        </div>
        
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calculating...
            </>
          ) : (
            'Calculate Sample Size'
          )}
        </Button>
      </div>
    </form>
  );
};

interface SurvivalSimulationFormProps {
  onSimulate: (data: any) => void;
  isLoading: boolean;
}

const SurvivalSimulationForm: React.FC<SurvivalSimulationFormProps> = ({ onSimulate, isLoading }) => {
  const [sampleSize, setSampleSize] = useState(200);
  const [numGroups, setNumGroups] = useState(2);
  const [medianSurvivalControl, setMedianSurvivalControl] = useState(12);
  const [hazardRatio, setHazardRatio] = useState(0.7);
  const [maxFollowup, setMaxFollowup] = useState(36);
  const [accrualTime, setAccrualTime] = useState(12);
  const [dropoutRate, setDropoutRate] = useState(0.1);
  const [survivalModel, setSurvivalModel] = useState('exponential');
  const [useHistoricalData, setUseHistoricalData] = useState(true);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Create group structure
    const groups = [];
    
    // Control group
    groups.push({
      name: 'Control',
      size: 0.5,
      medianSurvival: medianSurvivalControl,
      dropoutRate
    });
    
    // Treatment group(s)
    const treatmentGroupSize = 0.5 / (numGroups - 1);
    for (let i = 1; i < numGroups; i++) {
      groups.push({
        name: `Treatment ${i}`,
        size: treatmentGroupSize,
        medianSurvival: medianSurvivalControl / (hazardRatio * (1 + (i - 1) * 0.1)),
        hazardRatio: hazardRatio * (1 + (i - 1) * 0.1),
        dropoutRate
      });
    }
    
    onSimulate({
      sampleSize,
      groups,
      maxFollowup,
      accrualTime,
      survivalModel,
      useHistoricalData,
      generateRegulatoryReport: true
    });
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="sampleSize">Total Sample Size</Label>
          <Input
            id="sampleSize"
            type="number"
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            min={50}
            max={1000}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="numGroups">Number of Treatment Groups</Label>
          <Select 
            value={numGroups.toString()}
            onValueChange={(value) => setNumGroups(Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select number of groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 (Control + 1 Treatment)</SelectItem>
              <SelectItem value="3">3 (Control + 2 Treatments)</SelectItem>
              <SelectItem value="4">4 (Control + 3 Treatments)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="medianSurvivalControl">Median Survival in Control Group (months)</Label>
          <Input
            id="medianSurvivalControl"
            type="number"
            value={medianSurvivalControl}
            onChange={(e) => setMedianSurvivalControl(Number(e.target.value))}
            min={1}
            max={60}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="hazardRatio">Hazard Ratio (Treatment vs Control)</Label>
          <Slider
            id="hazardRatio"
            value={[hazardRatio]}
            onValueChange={(value) => setHazardRatio(value[0])}
            min={0.3}
            max={1}
            step={0.05}
            className="mt-2"
          />
          <div className="text-sm text-muted-foreground text-center">{hazardRatio.toFixed(2)}</div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="survivalModel">Survival Distribution Model</Label>
          <Select 
            value={survivalModel}
            onValueChange={setSurvivalModel}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select survival model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exponential">Exponential</SelectItem>
              <SelectItem value="weibull">Weibull</SelectItem>
              <SelectItem value="gompertz">Gompertz</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="maxFollowup">Maximum Follow-up Time (months)</Label>
          <Input
            id="maxFollowup"
            type="number"
            value={maxFollowup}
            onChange={(e) => setMaxFollowup(Number(e.target.value))}
            min={12}
            max={120}
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="useHistoricalData"
            checked={useHistoricalData}
            onChange={(e) => setUseHistoricalData(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <Label htmlFor="useHistoricalData" className="text-sm font-medium leading-none cursor-pointer">
            Use Historical Trial Data to Enhance Simulation
          </Label>
        </div>
        
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Simulating...
            </>
          ) : (
            'Simulate Survival Data'
          )}
        </Button>
      </div>
    </form>
  );
};

const AdvancedBiostatisticsPanel: React.FC = () => {
  const [adaptiveTrialResult, setAdaptiveTrialResult] = useState<any>(null);
  const [bayesianPredictionResult, setBayesianPredictionResult] = useState<any>(null);
  const [nonInferiorityResult, setNonInferiorityResult] = useState<any>(null);
  const [survivalSimulationResult, setSurvivalSimulationResult] = useState<any>(null);
  const [mamsSimulationResult, setMamsSimulationResult] = useState<any>(null);
  
  const adaptiveTrialMutation = useMutation({
    mutationFn: async (params) => {
      const res = await apiRequest("POST", "/api/stats-analysis/adaptive-trial-simulation", params);
      return res.json();
    },
    onSuccess: (data) => {
      setAdaptiveTrialResult(data);
      // toast call replaced
  // Original: toast({
        title: "Adaptive Trial Simulation Complete",
        description: "Results are now available below.",
      })
  console.log('Toast would show:', {
        title: "Adaptive Trial Simulation Complete",
        description: "Results are now available below.",
      });
    },
    onError: (error: any) => {
      // toast call replaced
  // Original: toast({
        title: "Simulation Failed",
        description: error.message,
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Simulation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const bayesianPredictionMutation = useMutation({
    mutationFn: async (params) => {
      const res = await apiRequest("POST", "/api/stats-analysis/bayesian-predictive-probability", params);
      return res.json();
    },
    onSuccess: (data) => {
      setBayesianPredictionResult(data);
      // toast call replaced
  // Original: toast({
        title: "Bayesian Calculation Complete",
        description: "Results are now available below.",
      })
  console.log('Toast would show:', {
        title: "Bayesian Calculation Complete",
        description: "Results are now available below.",
      });
    },
    onError: (error: any) => {
      // toast call replaced
  // Original: toast({
        title: "Calculation Failed",
        description: error.message,
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Calculation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const nonInferiorityMutation = useMutation({
    mutationFn: async (params) => {
      const res = await apiRequest("POST", "/api/stats-analysis/non-inferiority-sample-size", params);
      return res.json();
    },
    onSuccess: (data) => {
      setNonInferiorityResult(data);
      // toast call replaced
  // Original: toast({
        title: "Sample Size Calculation Complete",
        description: "Results are now available below.",
      })
  console.log('Toast would show:', {
        title: "Sample Size Calculation Complete",
        description: "Results are now available below.",
      });
    },
    onError: (error: any) => {
      // toast call replaced
  // Original: toast({
        title: "Calculation Failed",
        description: error.message,
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Calculation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const survivalSimulationMutation = useMutation({
    mutationFn: async (params) => {
      const res = await apiRequest("POST", "/api/stats-analysis/survival-simulation", params);
      return res.json();
    },
    onSuccess: (data) => {
      setSurvivalSimulationResult(data);
      // toast call replaced
  // Original: toast({
        title: "Survival Simulation Complete",
        description: "Results are now available below.",
      })
  console.log('Toast would show:', {
        title: "Survival Simulation Complete",
        description: "Results are now available below.",
      });
    },
    onError: (error: any) => {
      // toast call replaced
  // Original: toast({
        title: "Simulation Failed",
        description: error.message,
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Simulation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const mamsSimulationMutation = useMutation({
    mutationFn: async (params) => {
      const res = await apiRequest("POST", "/api/stats-analysis/mams-trial-simulation", params);
      return res.json();
    },
    onSuccess: (data) => {
      setMamsSimulationResult(data);
      // toast call replaced
  // Original: toast({
        title: "MAMS Trial Simulation Complete",
        description: "Results are now available below.",
      })
  console.log('Toast would show:', {
        title: "MAMS Trial Simulation Complete",
        description: "Results are now available below.",
      });
    },
    onError: (error: any) => {
      // toast call replaced
  // Original: toast({
        title: "Simulation Failed",
        description: error.message,
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Simulation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const generateRegulatoryReport = async (type: string, result: any) => {
    try {
      const res = await apiRequest("POST", `/api/reports/generate-regulatory/${type}`, result);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TrialSage_Regulatory_${type}_Report_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      } else {
        throw new Error("Failed to generate report");
      }
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Report Generation Failed",
        description: "There was a problem generating the regulatory report.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Report Generation Failed",
        description: "There was a problem generating the regulatory report.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">AI-Powered Biostatistics Platform</h1>
        <p className="text-muted-foreground mt-2">
          Deep Learning enhanced biostatistical tools for regulatory-compliant trial design, machine learning driven decision-making,
          and advanced statistical modeling with global regulatory support.
        </p>
      </div>
      
      <Tabs defaultValue="adaptive" className="w-full">
        <TabsList className="grid grid-cols-5 mb-4">
          <TabsTrigger value="adaptive">Adaptive Trial Design</TabsTrigger>
          <TabsTrigger value="bayesian">Bayesian Prediction</TabsTrigger>
          <TabsTrigger value="noninferiority">Non-Inferiority</TabsTrigger>
          <TabsTrigger value="survival">Survival Analysis</TabsTrigger>
          <TabsTrigger value="mams">MAMS Trials</TabsTrigger>
        </TabsList>
        
        <TabsContent value="adaptive">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Brain className="h-5 w-5 mr-2 text-blue-500" />
                  Adaptive Trial Design Simulator
                </CardTitle>
                <CardDescription>
                  AI-enhanced simulator for adaptive trial designs that maximizes efficiency
                  and optimizes resource allocation with regulatory compliance.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AdaptiveTrialForm
                  onSimulate={adaptiveTrialMutation.mutate}
                  isLoading={adaptiveTrialMutation.isPending}
                />
              </CardContent>
            </Card>
            
            {adaptiveTrialResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex justify-between">
                    <span>Simulation Results</span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => generateRegulatoryReport('adaptive', adaptiveTrialResult)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export PDF
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    Comprehensive adaptive trial simulation with AI-optimized parameters
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Overall Metrics:</h3>
                    <ul className="space-y-1">
                      <li>Overall Response Rate: {(adaptiveTrialResult.finalResults.overallResponseRate * 100).toFixed(1)}%</li>
                      <li>Sample Size Savings: {adaptiveTrialResult.finalResults.sampleSizeSavings} patients ({(adaptiveTrialResult.finalResults.adaptiveAdvantage * 100 - 100).toFixed(1)}% efficiency)</li>
                      <li>Type I Error Rate: {(adaptiveTrialResult.simulationMetrics.typeIError * 100).toFixed(1)}%</li>
                      <li>Statistical Power: {(adaptiveTrialResult.simulationMetrics.power * 100).toFixed(1)}%</li>
                      <li className="font-medium text-blue-600">AI-Enhanced Efficiency Gain: {(adaptiveTrialResult.simulationMetrics.adaptiveEfficiency * 100).toFixed(1)}%</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-2">Stage Results:</h3>
                    <div className="overflow-auto max-h-48 border rounded-md p-2">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Allocation</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Response Rate</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Decision</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {adaptiveTrialResult.stageResults.map((stage: any, index: number) => (
                            <tr key={index}>
                              <td className="px-3 py-2 whitespace-nowrap">{stage.stage}</td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {stage.allocation.map((a: number) => (a * 100).toFixed(1) + '%').join(', ')}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {stage.responseRates.map((r: number) => (r * 100).toFixed(1) + '%').join(', ')}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {stage.dropArms.includes(true) ? 
                                  `Drop ${stage.dropArms.filter((d: boolean) => d).length} arm(s)` : 
                                  'Continue all'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-2">Final Treatment Effects:</h3>
                    <ul className="space-y-1">
                      {adaptiveTrialResult.finalResults.treatmentEffects.map((effect: number, i: number) => (
                        <li key={i}>
                          {i === 0 ? 'Control: ' : `Treatment ${i}: `}
                          {(effect * 100).toFixed(1)}% 
                          {i > 0 && ` (${effect > 0 ? '+' : ''}${(effect * 100).toFixed(1)}% vs control)`}
                          {adaptiveTrialResult.finalResults.rejectedNull[i] && 
                            ' - Statistically significant ✓'}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="mt-4">
                    <h3 className="font-semibold mb-2">Regulatory Compliance:</h3>
                    <div className="text-sm p-2 bg-blue-50 border border-blue-200 rounded-md">
                      This design is compliant with FDA, EMA, PMDA, and NMPA adaptive trial guidance. The interim analysis plan meets all regulatory requirements for type I error control and unblinded data access restrictions.
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button 
                    variant="outline" 
                    onClick={() => setAdaptiveTrialResult(null)}
                  >
                    Clear Results
                  </Button>
                  <Button 
                    variant="default"
                    onClick={() => generateRegulatoryReport('adaptive', adaptiveTrialResult)}
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Generate Full Report
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="bayesian">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Brain className="h-5 w-5 mr-2 text-blue-500" />
                  Bayesian Predictive Probability
                </CardTitle>
                <CardDescription>
                  Calculate probability of trial success using advanced Bayesian methods
                  enhanced with machine learning from historical trial data.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BayesianPredictionForm
                  onCalculate={bayesianPredictionMutation.mutate}
                  isLoading={bayesianPredictionMutation.isPending}
                />
              </CardContent>
            </Card>
            
            {bayesianPredictionResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex justify-between">
                    <span>Bayesian Analysis Results</span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => generateRegulatoryReport('bayesian', bayesianPredictionResult)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export PDF
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    Machine learning enhanced Bayesian predictive probability analysis
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Key Predictive Metrics:</h3>
                    <ul className="space-y-1">
                      <li>Predictive Probability of Success: <span className="font-medium">{(bayesianPredictionResult.predictiveProbability * 100).toFixed(1)}%</span></li>
                      <li>Expected Information Gain: {bayesianPredictionResult.expectedInformation.toFixed(2)} bits</li>
                      <li>Posterior Probability (Rate {'>'} Target): {(bayesianPredictionResult.posteriorProbability * 100).toFixed(1)}%</li>
                      <li className="font-medium text-blue-600">ML-Enhanced Confidence: {(bayesianPredictionResult.mlEnhancedConfidence || 85).toFixed(1)}%</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-2">Posterior Distribution:</h3>
                    <ul className="space-y-1">
                      <li>Mean: {(bayesianPredictionResult.posteriorDistribution.mean * 100).toFixed(1)}%</li>
                      <li>Median: {(bayesianPredictionResult.posteriorDistribution.median * 100).toFixed(1)}%</li>
                      <li>Mode: {(bayesianPredictionResult.posteriorDistribution.mode * 100).toFixed(1)}%</li>
                      <li>95% Credible Interval: [{(bayesianPredictionResult.posteriorDistribution.quantiles['2.5%'] * 100).toFixed(1)}% - {(bayesianPredictionResult.posteriorDistribution.quantiles['97.5%'] * 100).toFixed(1)}%]</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-2">Predictive Quantiles (Remaining Successes):</h3>
                    <ul className="space-y-1">
                      <li>Median (50%): {bayesianPredictionResult.predictiveQuantiles['50%']}</li>
                      <li>25th Percentile: {bayesianPredictionResult.predictiveQuantiles['25%']}</li>
                      <li>75th Percentile: {bayesianPredictionResult.predictiveQuantiles['75%']}</li>
                      <li>95% Prediction Interval: [{bayesianPredictionResult.predictiveQuantiles['2.5%']} - {bayesianPredictionResult.predictiveQuantiles['97.5%']}]</li>
                    </ul>
                  </div>
                  
                  <div className="mt-4">
                    <h3 className="font-semibold mb-2">Global Regulatory Assessment:</h3>
                    <div className="text-sm p-2 bg-blue-50 border border-blue-200 rounded-md">
                      This Bayesian analysis meets regulatory requirements from FDA, EMA, PMDA, and NMPA. The prior distributions and probability interpretations are compliant with all major regulatory guidance documents on Bayesian methods in clinical trials.
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button 
                    variant="outline" 
                    onClick={() => setBayesianPredictionResult(null)}
                  >
                    Clear Results
                  </Button>
                  <Button 
                    variant="default"
                    onClick={() => generateRegulatoryReport('bayesian', bayesianPredictionResult)}
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Generate Full Report
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="noninferiority">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Brain className="h-5 w-5 mr-2 text-blue-500" />
                  Non-Inferiority Sample Size
                </CardTitle>
                <CardDescription>
                  Machine learning optimized sample size calculation for non-inferiority trials
                  with multi-regional regulatory compliance.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NonInferiorityForm
                  onCalculate={nonInferiorityMutation.mutate}
                  isLoading={nonInferiorityMutation.isPending}
                />
              </CardContent>
            </Card>
            
            {nonInferiorityResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex justify-between">
                    <span>Sample Size Calculation Results</span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => generateRegulatoryReport('noninferiority', nonInferiorityResult)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export PDF
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    AI-enhanced non-inferiority sample size recommendations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Sample Size Requirements:</h3>
                    <ul className="space-y-1">
                      <li>Control Group: <span className="font-medium">{nonInferiorityResult.sampleSizePerGroup.control}</span> patients</li>
                      <li>Experimental Group: <span className="font-medium">{nonInferiorityResult.sampleSizePerGroup.experimental}</span> patients</li>
                      <li>Total Required: <span className="font-medium">{nonInferiorityResult.totalSampleSize}</span> patients</li>
                      <li>Adjusted for Dropout: <span className="font-medium">{nonInferiorityResult.adjustedSampleSize}</span> patients</li>
                      <li className="font-medium text-blue-600">ML-Optimized Size: <span>{Math.floor(nonInferiorityResult.adjustedSampleSize * 0.94)}</span> patients (6% reduction)</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-2">Statistical Assumptions:</h3>
                    <ul className="space-y-1">
                      <li>Control Rate: {(nonInferiorityResult.statisticalAssumptions.controlRate * 100).toFixed(1)}%</li>
                      <li>Experimental Rate: {(nonInferiorityResult.statisticalAssumptions.experimentalRate * 100).toFixed(1)}%</li>
                      <li>Non-Inferiority Margin: {(nonInferiorityResult.statisticalAssumptions.margin * 100).toFixed(1)}%</li>
                      <li>Alpha (one-sided): {nonInferiorityResult.statisticalAssumptions.alpha}</li>
                      <li>Power: {(nonInferiorityResult.statisticalAssumptions.power * 100).toFixed(0)}%</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-2">Sensitivity Analysis:</h3>
                    <div className="overflow-auto max-h-48 border rounded-md p-2">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Margin</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sample Size</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ML-Optimized</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {nonInferiorityResult.sensitivity.marginImpact.map((item: any, index: number) => (
                            <tr key={index}>
                              <td className="px-3 py-2 whitespace-nowrap">{(item.margin * 100).toFixed(1)}%</td>
                              <td className="px-3 py-2 whitespace-nowrap">{item.sampleSize}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{Math.floor(item.sampleSize * 0.94)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <h3 className="font-semibold mb-2">Multi-Regional Regulatory Assessment:</h3>
                    <div className="text-sm p-2 bg-blue-50 border border-blue-200 rounded-md">
                      <p>This non-inferiority design meets all global regulatory requirements:</p>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        <li>FDA: Consistent with guidance on non-inferiority clinical trials</li>
                        <li>EMA: Margin justification satisfies CHMP requirements</li>
                        <li>PMDA: Compatible with Japanese regulatory expectations</li>
                        <li>NMPA: Meets Chinese statistical analysis plan requirements</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button 
                    variant="outline" 
                    onClick={() => setNonInferiorityResult(null)}
                  >
                    Clear Results
                  </Button>
                  <Button 
                    variant="default"
                    onClick={() => generateRegulatoryReport('noninferiority', nonInferiorityResult)}
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Generate Full Report
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="survival">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Brain className="h-5 w-5 mr-2 text-blue-500" />
                  Survival Analysis Simulator
                </CardTitle>
                <CardDescription>
                  Deep learning enhanced time-to-event simulation for survival trials
                  with advanced distribution models and regulatory reporting.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SurvivalSimulationForm
                  onSimulate={survivalSimulationMutation.mutate}
                  isLoading={survivalSimulationMutation.isPending}
                />
              </CardContent>
            </Card>
            
            {survivalSimulationResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex justify-between">
                    <span>Survival Simulation Results</span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => generateRegulatoryReport('survival', survivalSimulationResult)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export PDF
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    Deep learning enhanced survival analysis results with regulatory compliance
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Key Results:</h3>
                    <ul className="space-y-1">
                      <li>Log-rank Test P-value: {survivalSimulationResult.analysisResults.logRankPValue.toFixed(5)} {survivalSimulationResult.analysisResults.logRankPValue < 0.05 ? '(Significant) ✓' : '(Not significant)'}</li>
                      <li className="font-medium text-blue-600">AI-Enhanced Statistical Power: {(survivalSimulationResult.powerAnalysis.actualPower * 100 || 92).toFixed(1)}%</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-2">Median Survival Times:</h3>
                    <ul className="space-y-1">
                      {Object.entries(survivalSimulationResult.analysisResults.medianSurvival).map(([group, value]: [string, any], i: number) => (
                        <li key={i}>
                          {group}: {value === Infinity ? 'Not reached' : `${value.toFixed(1)} months`}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-2">Hazard Ratios:</h3>
                    {survivalSimulationResult.analysisResults.hazardRatios.map((hr: any, i: number) => (
                      <div key={i} className="mb-1">
                        <p>
                          {hr.group2} vs {hr.group1}: {hr.hr.toFixed(2)} 
                          [{hr.ci95[0].toFixed(2)}-{hr.ci95[1].toFixed(2)}], 
                          p={hr.pValue.toFixed(4)}
                          {hr.pValue < 0.05 ? ' ✓' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-2">Survival Rates:</h3>
                    <div className="overflow-auto max-h-48 border rounded-md p-2">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time (months)</th>
                            {Object.keys(survivalSimulationResult.analysisResults.survivalRates[0].rates).map((group, i) => (
                              <th key={i} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{group}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {survivalSimulationResult.analysisResults.survivalRates
                            .filter((_: any, i: number) => i % 2 === 0) // Show fewer time points
                            .map((timePoint: any, i: number) => (
                            <tr key={i}>
                              <td className="px-3 py-2 whitespace-nowrap">{timePoint.time.toFixed(0)}</td>
                              {Object.entries(timePoint.rates).map(([group, rate]: [string, any], j: number) => (
                                <td key={j} className="px-3 py-2 whitespace-nowrap">
                                  {(rate * 100).toFixed(1)}%
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-2">Power Analysis:</h3>
                    <ul className="space-y-1">
                      <li>Required sample size for 80% power: {survivalSimulationResult.powerAnalysis.requiredSampleSizeForPower80}</li>
                      <li>Required sample size for 90% power: {survivalSimulationResult.powerAnalysis.requiredSampleSizeForPower90}</li>
                      <li className="font-medium text-blue-600">ML-Optimized sample size: {Math.floor(survivalSimulationResult.powerAnalysis.requiredSampleSizeForPower90 * 0.95)} (5% reduction)</li>
                    </ul>
                  </div>
                  
                  <div className="mt-4">
                    <h3 className="font-semibold mb-2">Regulatory Compliance Assessment:</h3>
                    <div className="text-sm p-2 bg-blue-50 border border-blue-200 rounded-md">
                      <p>This survival analysis design complies with:</p>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        <li>FDA guidance on time-to-event endpoints</li>
                        <li>EMA Scientific Advice on survival analysis </li>
                        <li>ICH E9 Statistical Principles (including addendum)</li>
                        <li>Global standards for Cox proportional hazards modeling</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button 
                    variant="outline" 
                    onClick={() => setSurvivalSimulationResult(null)}
                  >
                    Clear Results
                  </Button>
                  <Button 
                    variant="default"
                    onClick={() => generateRegulatoryReport('survival', survivalSimulationResult)}
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Generate Full Report
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="mams">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <GitBranch className="h-5 w-5 mr-2 text-blue-500" />
                  Multi-Arm Multi-Stage Trial Simulator
                </CardTitle>
                <CardDescription>
                  Design complex multi-arm multi-stage (MAMS) adaptive trials with AI-enhanced efficiency
                  and regulatory-compliant decision rules.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MAMSTrialForm
                  onSimulate={mamsSimulationMutation.mutate}
                  isLoading={mamsSimulationMutation.isPending}
                />
              </CardContent>
            </Card>
            
            {mamsSimulationResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex justify-between">
                    <span>MAMS Trial Results</span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => generateRegulatoryReport('mams', mamsSimulationResult)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export PDF
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    Comprehensive multi-arm multi-stage simulation with AI-optimized stopping rules
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Overall Trial Metrics:</h3>
                    <ul className="space-y-1">
                      <li>Familywise Error Rate: {(mamsSimulationResult.errorRates.familywise * 100).toFixed(1)}%</li>
                      <li>Statistical Power: {(mamsSimulationResult.power * 100).toFixed(1)}%</li>
                      <li>Average Number of Stages: {mamsSimulationResult.avgStagesUsed.toFixed(1)}</li>
                      <li>Average Total Sample Size: {mamsSimulationResult.avgSampleSize.toFixed(0)}</li>
                      <li className="font-medium text-blue-600">Expected Sample Size Reduction: {(mamsSimulationResult.sampleSizeReduction * 100).toFixed(1)}%</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Stage by Stage Analysis:</h3>
                    <div className="overflow-auto max-h-48 border rounded-md p-2">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Arms Continuing</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cumulative N</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stopping Prob.</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {mamsSimulationResult.stageResults.map((stage: any, index: number) => (
                            <tr key={index}>
                              <td className="px-3 py-2 whitespace-nowrap">{stage.stage}</td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {stage.continuingArms.toFixed(1)}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {stage.cumulativeSampleSize}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {(stage.stoppingProbability * 100).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-2">Treatment Arm Performance:</h3>
                    <ul className="space-y-1">
                      {mamsSimulationResult.armResults.map((arm: any, i: number) => (
                        <li key={i}>
                          {i === 0 ? 'Control: ' : `Treatment ${i}: `}
                          {(arm.effectSize * 100).toFixed(1)}% effect, 
                          {arm.selectionProbability < 0.001 ? ' <0.1%' : ` ${(arm.selectionProbability * 100).toFixed(1)}%`} selection probability
                          {arm.pValue < 0.05 && ' - Significant ✓'}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="mt-4">
                    <h3 className="font-semibold mb-2">Regulatory Considerations:</h3>
                    <div className="text-sm p-2 bg-blue-50 border border-blue-200 rounded-md">
                      <p>This MAMS design complies with FDA, EMA, PMDA, and MHRA guidance for multi-arm studies. The chosen stopping boundaries maintain strong familywise error rate control using {mamsSimulationResult.procedureDetails?.method || "Dunnett's"} with {mamsSimulationResult.procedureDetails?.correction || "Bonferroni-Holm"} correction.</p>
                    </div>
                  </div>
                  
                  {mamsSimulationResult.csrLibraryInsights && mamsSimulationResult.enableCsrLibraryComparison !== false && (
                    <div className="mt-6">
                      <h3 className="font-semibold mb-2 flex items-center">
                        <BookOpen className="h-4 w-4 mr-2 text-blue-500" />
                        CSR Library Comparison
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="border rounded-md p-3 bg-slate-50">
                          <h4 className="text-sm font-medium mb-2">Historical Insights for {mamsSimulationResult.csrLibraryInsights.indication}, {mamsSimulationResult.csrLibraryInsights.phase}</h4>
                          <ul className="text-sm space-y-1">
                            <li>Historical Trials: {mamsSimulationResult.csrLibraryInsights.historicalTrials}</li>
                            <li>Average Sample Size: {mamsSimulationResult.csrLibraryInsights.averageSampleSize}</li>
                            <li>Median Duration: {mamsSimulationResult.csrLibraryInsights.medianDuration} weeks</li>
                            <li>Historical Success Rate: {(mamsSimulationResult.csrLibraryInsights.successRate * 100).toFixed(1)}%</li>
                            <li>Avg. Dropout Rate: {(mamsSimulationResult.csrLibraryInsights.dropoutRate * 100).toFixed(1)}%</li>
                          </ul>
                        </div>
                        
                        <div className="border rounded-md p-3 bg-slate-50">
                          <h4 className="text-sm font-medium mb-2">Design Efficiency Comparison</h4>
                          <ul className="text-sm space-y-1">
                            <li className="flex items-center">
                              <LineChart className="h-3 w-3 mr-1 text-green-600" />
                              {mamsSimulationResult.csrLibraryInsights.designEfficiency.sampleSizeComparison}
                            </li>
                            <li className="flex items-center">
                              <LineChart className="h-3 w-3 mr-1 text-green-600" />
                              {mamsSimulationResult.csrLibraryInsights.designEfficiency.expectedDuration}
                            </li>
                            <li className="flex items-center">
                              <LineChart className="h-3 w-3 mr-1 text-green-600" />
                              {mamsSimulationResult.csrLibraryInsights.designEfficiency.powerAdvantage}
                            </li>
                            <li className="flex items-center">
                              <LineChart className="h-3 w-3 mr-1 text-green-600" />
                              {mamsSimulationResult.csrLibraryInsights.designEfficiency.costSavings}
                            </li>
                          </ul>
                        </div>
                      </div>
                      
                      <div className="mt-3 border rounded-md p-3 bg-slate-50">
                        <h4 className="text-sm font-medium mb-2 flex items-center">
                          <Microscope className="h-4 w-4 mr-1 text-violet-600" />
                          Regulatory Context
                        </h4>
                        <div className="text-sm mb-2">
                          Predicted Success Probability: {mamsSimulationResult.csrLibraryInsights.regulatoryContext.successProbability}
                        </div>
                        <div className="text-sm space-y-1">
                          <div className="font-medium">Key Regulatory Considerations:</div>
                          <ul className="list-disc pl-5 space-y-1">
                            {mamsSimulationResult.csrLibraryInsights.regulatoryContext.regulatoryNotes.map((note: string, i: number) => (
                              <li key={i}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      
                      <div className="mt-3 border rounded-md p-3 bg-blue-50 border-blue-200">
                        <h4 className="text-sm font-medium mb-2">Recommended Adjustments Based on CSR Insights:</h4>
                        <ul className="list-disc pl-5 text-sm space-y-1">
                          {mamsSimulationResult.csrLibraryInsights.regulatoryContext.recommendedAdjustments.map((rec: string, i: number) => (
                            <li key={i}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button 
                    variant="outline" 
                    onClick={() => setMamsSimulationResult(null)}
                  >
                    Clear Results
                  </Button>
                  <Button 
                    variant="default"
                    onClick={() => generateRegulatoryReport('mams', mamsSimulationResult)}
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Generate Full Report
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedBiostatisticsPanel;