import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Calculator, BarChart3, RefreshCw, Users, ChevronDown, Info, BarChart2 } from "lucide-react";

export default function SampleSizeCalculator({ sessionId, onCalculationComplete = () => {} }) {
  const [calculationMode, setCalculationMode] = useState("standard");
  const [designType, setDesignType] = useState("parallel");
  const [alpha, setAlpha] = useState(0.05);
  const [power, setPower] = useState(0.8);
  const [effect, setEffect] = useState(0.5);
  const [dropoutRate, setDropoutRate] = useState(0.15);
  const [groups, setGroups] = useState(2);
  const [allocation, setAllocation] = useState(1);
  const [sampleSize, setSampleSize] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [calculationHistory, setCalculationHistory] = useState([]);
  const { toast } = useToast();

  // Load any previous calculations for this session
  useEffect(() => {
    if (sessionId) {
      fetch(`/api/sample-size/history?study_id=${sessionId}`)
        .then(response => {
          if (response.ok) return response.json();
          return { history: [] };
        })
        .then(data => {
          if (data.history?.length > 0) {
            setCalculationHistory(data.history);
            
            // Load the most recent calculation
            const latest = data.history[0];
            if (latest) {
              setCalculationMode(latest.mode || "standard");
              setDesignType(latest.designType || "parallel");
              setAlpha(latest.alpha || 0.05);
              setPower(latest.power || 0.8);
              setEffect(latest.effect || 0.5);
              setDropoutRate(latest.dropoutRate || 0.15);
              setGroups(latest.groups || 2);
              setAllocation(latest.allocation || 1);
              setSampleSize(latest.result || null);
            }
          }
        })
        .catch(error => {
          console.error("Error loading calculation history:", error);
        });
    }
  }, [sessionId]);

  const calculateSampleSize = async () => {
    if (!sessionId) {
      // toast call replaced
  // Original: toast({
        title: "No Study Session",
        description: "Please select a study session first",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "No Study Session",
        description: "Please select a study session first",
        variant: "destructive",
      });
      return;
    }

    setIsCalculating(true);

    try {
      // First, log this action to trace API for decision tracking
      try {
        await fetch('/api/wisdom/trace-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            study_id: sessionId,
            input: "Sample size calculation requested",
            reasoning: [
              "Analyzing statistical parameters (alpha, power, effect size)",
              "Considering study design type and group allocation",
              "Accounting for expected dropout rate",
              "Applying appropriate statistical formula"
            ],
            output: "Calculated optimal sample size for study design"
          })
        });
      } catch (traceError) {
        console.error("Failed to log wisdom trace:", traceError);
      }

      const response = await fetch("/api/sample-size/calculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          study_id: sessionId,
          mode: calculationMode,
          designType,
          alpha,
          power,
          effect,
          dropoutRate,
          groups,
          allocation,
        }),
      });

      if (!response.ok) {
        throw new Error("Calculation failed");
      }

      const data = await response.json();
      setSampleSize(data.result);
      
      // Update calculation history
      if (data.history) {
        setCalculationHistory(data.history);
      }

      // Log this calculation to memory
      try {
        await fetch('/api/insight/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            study_id: sessionId,
            title: "Sample Size Calculated",
            summary: `Calculated sample size of ${data.result.totalN} participants (${data.result.perGroup} per group) for ${designType} design with power=${power}, alpha=${alpha}, effect size=${effect}.`,
            status: "completed"
          })
        });
      } catch (memoryError) {
        console.error("Failed to log memory:", memoryError);
      }

      // Call the completion callback
      onCalculationComplete(data.result, [
        `Using ${designType} design with ${groups} groups`,
        `Alpha (significance level): ${alpha}`,
        `Power (1-β): ${power}`,
        `Effect size: ${effect}`,
        `Dropout adjustment: ${dropoutRate * 100}%`,
        `Allocation ratio: ${allocation}:1`
      ]);

      // toast call replaced
  // Original: toast({
        title: "Calculation Complete",
        description: `Sample size: ${data.result.totalN} participants (${data.result.perGroup} per group)
  console.log('Toast would show:', {
        title: "Calculation Complete",
        description: `Sample size: ${data.result.totalN} participants (${data.result.perGroup} per group)`,
      });
    } catch (error) {
      console.error("Calculation error:", error);
      // toast call replaced
  // Original: toast({
        title: "Calculation Failed",
        description: error.message || "An error occurred during sample size calculation.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Calculation Failed",
        description: error.message || "An error occurred during sample size calculation.",
        variant: "destructive",
      });
    } finally {
      setIsCalculating(false);
    }
  };

  // Format sample size result for display
  const formatSampleSizeResult = () => {
    if (!sampleSize) return null;
    
    const { totalN, perGroup, adjustedTotal, powerAchieved, notes } = sampleSize;
    
    return (
      <div className="space-y-3 p-3 bg-muted/20 rounded-md">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total Sample Size</p>
            <p className="text-2xl font-bold text-primary">{totalN}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Per Group</p>
            <p className="text-2xl font-bold">{perGroup}</p>
          </div>
          {adjustedTotal && (
            <>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">With Dropout Adjustment</p>
                <p className="text-xl font-medium text-primary">{adjustedTotal}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Power Achieved</p>
                <p className="text-xl font-medium">{(powerAchieved * 100).toFixed(1)}%</p>
              </div>
            </>
          )}
        </div>
        {notes && <p className="text-xs text-muted-foreground">{notes}</p>}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Calculator className="mr-2 h-5 w-5" />
          Sample Size Calculator
        </CardTitle>
        <CardDescription>
          Calculate the optimal sample size for your clinical trial
        </CardDescription>
      </CardHeader>
      
      <Tabs value={calculationMode} onValueChange={setCalculationMode} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="standard">Standard</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>
        
        <TabsContent value="standard" className="space-y-4 pt-4">
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="design-type">Study Design</Label>
              <Select value={designType} onValueChange={setDesignType}>
                <SelectTrigger id="design-type">
                  <SelectValue placeholder="Select design type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parallel">Parallel Groups</SelectItem>
                  <SelectItem value="crossover">Crossover</SelectItem>
                  <SelectItem value="superiority">Superiority Trial</SelectItem>
                  <SelectItem value="noninferiority">Non-inferiority Trial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="effect-size">Effect Size (Cohen's d)</Label>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Small</span>
                  <span>Medium</span>
                  <span>Large</span>
                </div>
                <Slider
                  id="effect-size"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={[effect]}
                  onValueChange={(values) => setEffect(values[0])}
                />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{effect.toFixed(2)}</span>
                  <Select value={effect.toString()} onValueChange={(value) => setEffect(parseFloat(value))}>
                    <SelectTrigger className="w-auto" aria-label="Select common effect size">
                      <SelectValue placeholder="Common values" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.2">Small (0.20)</SelectItem>
                      <SelectItem value="0.5">Medium (0.50)</SelectItem>
                      <SelectItem value="0.8">Large (0.80)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="alpha">Significance Level (α)</Label>
                <Select value={alpha.toString()} onValueChange={(value) => setAlpha(parseFloat(value))}>
                  <SelectTrigger id="alpha">
                    <SelectValue placeholder="Select alpha" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.01">0.01 (1%)</SelectItem>
                    <SelectItem value="0.05">0.05 (5%, standard)</SelectItem>
                    <SelectItem value="0.1">0.10 (10%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="power">Statistical Power</Label>
                <Select value={power.toString()} onValueChange={(value) => setPower(parseFloat(value))}>
                  <SelectTrigger id="power">
                    <SelectValue placeholder="Select power" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.8">0.80 (80%, standard)</SelectItem>
                    <SelectItem value="0.85">0.85 (85%)</SelectItem>
                    <SelectItem value="0.9">0.90 (90%, high)</SelectItem>
                    <SelectItem value="0.95">0.95 (95%, very high)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="dropout-rate">Expected Dropout Rate</Label>
              <div className="space-y-2">
                <Slider
                  id="dropout-rate"
                  min={0}
                  max={0.4}
                  step={0.01}
                  value={[dropoutRate]}
                  onValueChange={(values) => setDropoutRate(values[0])}
                />
                <div className="flex justify-between">
                  <span className="text-sm">{(dropoutRate * 100).toFixed(0)}%</span>
                  <div className="text-xs text-muted-foreground">
                    0% - 40% range
                  </div>
                </div>
              </div>
            </div>
            
            <div 
              className="flex items-center space-x-2 text-sm cursor-pointer"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
              <span>Advanced Options</span>
            </div>
            
            {showAdvanced && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="groups">Number of Groups</Label>
                  <Select value={groups.toString()} onValueChange={(value) => setGroups(parseInt(value))}>
                    <SelectTrigger id="groups">
                      <SelectValue placeholder="Select groups" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 (standard)</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="allocation">Allocation Ratio</Label>
                  <Select 
                    value={allocation.toString()} 
                    onValueChange={(value) => setAllocation(parseFloat(value))}
                  >
                    <SelectTrigger id="allocation">
                      <SelectValue placeholder="Select ratio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1:1 (equal)</SelectItem>
                      <SelectItem value="2">2:1</SelectItem>
                      <SelectItem value="3">3:1</SelectItem>
                      <SelectItem value="0.5">1:2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            
            {sampleSize && formatSampleSizeResult()}
            
            {calculationHistory.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center">
                  <BarChart3 className="h-4 w-4 mr-1" />
                  Previous Calculations
                </Label>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {calculationHistory.slice(0, 3).map((calc, index) => (
                    <Card key={index} className="p-2">
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="font-medium">{calc.designType} Design</span>
                          <span>{new Date(calc.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Effect: {calc.effect.toFixed(2)}, Power: {(calc.power * 100).toFixed(0)}%</span>
                          <span className="font-semibold">n = {calc.result.totalN}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
            
            <div className="text-sm text-muted-foreground">
              {sessionId ? (
                <span className="text-green-600 flex items-center">
                  <Info className="mr-1 h-4 w-4" />
                  Using Session: {sessionId}
                </span>
              ) : (
                <span className="text-amber-600">
                  Select a study session first to save calculations
                </span>
              )}
            </div>
          </CardContent>
        </TabsContent>
        
        <TabsContent value="advanced" className="pt-4">
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center p-8">
              <BarChart2 className="h-16 w-16 text-muted-foreground" />
            </div>
            <p className="text-center text-muted-foreground">
              Advanced mode provides specialized calculations for adaptive designs, time-to-event outcomes,
              and Bayesian methods. Consult with a biostatistician for complex designs.
            </p>
            <div className="text-center p-4">
              <Button disabled variant="outline" className="w-full">
                Contact Statistical Consultant
              </Button>
            </div>
          </CardContent>
        </TabsContent>
      </Tabs>
      
      <CardFooter>
        <Button 
          onClick={calculateSampleSize} 
          disabled={isCalculating || !sessionId || calculationMode === "advanced"}
          className="w-full"
        >
          {isCalculating ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Calculating...
            </>
          ) : (
            <>
              <Users className="mr-2 h-4 w-4" />
              Calculate Sample Size
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}