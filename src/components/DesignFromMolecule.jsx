import React, { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileText, Activity, BarChart, Beaker, Pill, CheckCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCurrentSession } from "@/utils/sessionUtils";

const DesignFromMolecule = () => {
  const [molecule, setMolecule] = useState({
    name: "",
    moa: "",
    type: "Small Molecule",
    origin: "Synthetic",
    class: "",
    indication: "",
    pk: { half_life: 24, route: "Oral" },
    pd: []
  });
  
  const [pdEffect, setPdEffect] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("molecule");
  const [error, setError] = useState(null);
  
  const { toast } = useToast();
  const { currentSession } = useCurrentSession();

  const handlePdEffectAdd = () => {
    if (pdEffect && !molecule.pd.includes(pdEffect)) {
      setMolecule({
        ...molecule,
        pd: [...molecule.pd, pdEffect]
      });
      setPdEffect("");
    }
  };

  const handlePdEffectRemove = (effect) => {
    setMolecule({
      ...molecule,
      pd: molecule.pd.filter(item => item !== effect)
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setMolecule({
        ...molecule,
        [parent]: {
          ...molecule[parent],
          [child]: value
        }
      });
    } else {
      setMolecule({
        ...molecule,
        [name]: value
      });
    }
  };

  const handleSelectChange = (name, value) => {
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setMolecule({
        ...molecule,
        [parent]: {
          ...molecule[parent],
          [child]: value
        }
      });
    } else {
      setMolecule({
        ...molecule,
        [name]: value
      });
    }
  };

  const validateMolecule = () => {
    const requiredFields = ['name', 'moa', 'type'];
    const missingFields = requiredFields.filter(field => !molecule[field]);
    
    if (missingFields.length > 0) {
      // toast call replaced
  // Original: toast({
        title: "Missing required fields",
        description: `Please provide: ${missingFields.join(", ")
  console.log('Toast would show:', {
        title: "Missing required fields",
        description: `Please provide: ${missingFields.join(", ")}`,
        variant: "destructive"
      });
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateMolecule()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/design/molecule-similarity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          molecule,
          sessionId: currentSession?.session_id
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to analyze molecule');
      }
      
      if (data.success) {
        setResults(data);
        setActiveTab("results");
        // toast call replaced
  // Original: toast({
          title: "Analysis complete",
          description: `Found ${data.similar_molecules?.length || 0} similar molecules`,
        })
  console.log('Toast would show:', {
          title: "Analysis complete",
          description: `Found ${data.similar_molecules?.length || 0} similar molecules`,
        });
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      console.error("Error analyzing molecule:", err);
      setError(err.message);
      // toast call replaced
  // Original: toast({
        title: "Analysis failed",
        description: err.message,
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Analysis failed",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const renderMoleculeInputForm = () => (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="space-y-2">
          <Label htmlFor="name">Molecule Name*</Label>
          <Input 
            id="name" 
            name="name" 
            value={molecule.name} 
            onChange={handleInputChange} 
            placeholder="e.g., Semaglutide"
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="moa">Mechanism of Action*</Label>
          <Input 
            id="moa" 
            name="moa" 
            value={molecule.moa} 
            onChange={handleInputChange} 
            placeholder="e.g., GLP-1 receptor agonist"
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="type">Molecule Type*</Label>
          <Select name="type" value={molecule.type} onValueChange={(value) => handleSelectChange("type", value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Small Molecule">Small Molecule</SelectItem>
              <SelectItem value="Biologic">Biologic</SelectItem>
              <SelectItem value="Peptide">Peptide</SelectItem>
              <SelectItem value="Antibody">Antibody</SelectItem>
              <SelectItem value="Oligonucleotide">Oligonucleotide</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="origin">Molecule Origin</Label>
          <Select name="origin" value={molecule.origin} onValueChange={(value) => handleSelectChange("origin", value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select origin" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Synthetic">Synthetic</SelectItem>
              <SelectItem value="Recombinant">Recombinant</SelectItem>
              <SelectItem value="Semi-synthetic">Semi-synthetic</SelectItem>
              <SelectItem value="Natural">Natural</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="class">Molecule Class</Label>
          <Input 
            id="class" 
            name="class" 
            value={molecule.class} 
            onChange={handleInputChange} 
            placeholder="e.g., GLP-1"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="indication">Target Indication</Label>
          <Input 
            id="indication" 
            name="indication" 
            value={molecule.indication} 
            onChange={handleInputChange} 
            placeholder="e.g., Obesity, NASH"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="pk.half_life">Half-life (hours)</Label>
          <Input 
            id="pk.half_life" 
            name="pk.half_life" 
            value={molecule.pk.half_life} 
            onChange={handleInputChange}
            type="number" 
            min="0"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="pk.route">Administration Route</Label>
          <Select 
            name="pk.route" 
            value={molecule.pk.route} 
            onValueChange={(value) => handleSelectChange("pk.route", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select route" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Oral">Oral</SelectItem>
              <SelectItem value="Subcutaneous">Subcutaneous</SelectItem>
              <SelectItem value="Intravenous">Intravenous</SelectItem>
              <SelectItem value="Intramuscular">Intramuscular</SelectItem>
              <SelectItem value="Topical">Topical</SelectItem>
              <SelectItem value="Inhalation">Inhalation</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="mb-6">
        <Label>Pharmacodynamic Effects</Label>
        <div className="flex items-center space-x-2 mt-2">
          <Input 
            value={pdEffect} 
            onChange={(e) => setPdEffect(e.target.value)} 
            placeholder="e.g., ALT reduction, Body weight loss"
          />
          <Button 
            type="button" 
            onClick={handlePdEffectAdd} 
            disabled={!pdEffect}
            size="sm"
          >
            Add
          </Button>
        </div>
        
        <div className="flex flex-wrap gap-2 mt-3">
          {molecule.pd.map((effect, index) => (
            <Badge key={index} variant="outline" className="flex items-center gap-1">
              {effect}
              <button 
                type="button" 
                onClick={() => handlePdEffectRemove(effect)}
                className="ml-1 hover:text-destructive"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      </div>
      
      <div className="flex justify-end">
        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...
            </>
          ) : (
            <>Analyze Molecule</>
          )}
        </Button>
      </div>
    </form>
  );

  const renderResultsSummary = () => {
    if (!results) return null;
    
    const { query_molecule, similar_molecules, design_recommendation } = results;
    
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4">
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Pill className="mr-2 h-5 w-5" />
                Molecule Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="text-lg font-semibold">{query_molecule?.name || molecule.name}</p>
                <p className="text-sm text-muted-foreground">{query_molecule?.moa || molecule.moa}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  <Badge variant="outline">{query_molecule?.type || molecule.type}</Badge>
                  <Badge variant="outline">{query_molecule?.origin || molecule.origin}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <BarChart className="mr-2 h-5 w-5" />
                Design Recommendation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Arms:</span>
                  <span className="font-semibold">{design_recommendation?.arms || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Duration:</span>
                  <span className="font-semibold">{design_recommendation?.duration_weeks || "N/A"} weeks</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Control:</span>
                  <span className="font-semibold">{design_recommendation?.control_type || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Success Probability:</span>
                  <Badge variant={design_recommendation?.success_probability >= 0.7 ? "success" : "warning"}>
                    {Math.round((design_recommendation?.success_probability || 0) * 100)}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Activity className="mr-2 h-5 w-5" />
              Primary Endpoint
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{design_recommendation?.primary_endpoint || "N/A"}</p>
            <Separator className="my-2" />
            <p className="text-sm font-semibold mb-1">Recommended Secondary Endpoints:</p>
            <div className="flex flex-wrap gap-2">
              {design_recommendation?.secondary_endpoints && design_recommendation.secondary_endpoints.length > 0 ? (
                design_recommendation.secondary_endpoints.map((endpoint, i) => (
                  <Badge key={i} variant="outline">{endpoint}</Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No secondary endpoints recommended</span>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Beaker className="mr-2 h-5 w-5" />
              Dosing Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Route:</span>
                <span className="font-semibold">{design_recommendation?.dose_estimation?.route || molecule.pk.route}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Frequency:</span>
                <span className="font-semibold">{design_recommendation?.dose_estimation?.frequency || "N/A"}</span>
              </div>
              <Separator className="my-2" />
              <p className="text-sm font-semibold mb-1">Recommended Doses:</p>
              <div className="flex flex-wrap gap-2">
                {design_recommendation?.dose_estimation?.doses && design_recommendation.dose_estimation.doses.length > 0 ? (
                  design_recommendation.dose_estimation.doses.map((dose, i) => (
                    <Badge key={i} variant="secondary">{dose}</Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No specific doses recommended</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <FileText className="mr-2 h-5 w-5" />
              Similar Molecules Evidence
            </CardTitle>
            <CardDescription>
              Based on {similar_molecules?.length || 0} similar molecules in our database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              {similar_molecules && similar_molecules.length > 0 ? (
                similar_molecules.map((mol, i) => (
                  <div key={i} className="mb-4 pb-4 border-b last:border-0">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold">{mol.name}</p>
                        <p className="text-sm">{mol.moa}</p>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge>{Math.round(mol.similarity * 100)}% match</Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Similarity score based on molecular properties
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Indication:</span>
                        <span>{mol.indication}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Success Rate:</span>
                        <span className="flex items-center">
                          {Math.round(mol.success_rate * 100)}%
                          {mol.success_rate >= 0.75 ? 
                            <CheckCircle className="ml-1 h-4 w-4 text-green-500" /> : 
                            <AlertCircle className="ml-1 h-4 w-4 text-amber-500" />
                          }
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">CSR Links:</span>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {mol.csr_links && mol.csr_links.map((csr, j) => (
                            <Badge key={j} variant="outline" className="text-xs">{csr}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  No similar molecules found
                </div>
              )}
            </ScrollArea>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="ghost" onClick={() => setActiveTab("molecule")}>
              Back to Molecule Input
            </Button>
            <Button onClick={() => window.print()} variant="outline">
              Export Report
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Design From Molecule</CardTitle>
          <CardDescription>
            Generate protocol design recommendations based on molecule characteristics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="molecule">Molecule Input</TabsTrigger>
              <TabsTrigger value="results" disabled={!results}>Results</TabsTrigger>
            </TabsList>
            
            <TabsContent value="molecule">
              {renderMoleculeInputForm()}
            </TabsContent>
            
            <TabsContent value="results">
              {renderResultsSummary()}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default DesignFromMolecule;