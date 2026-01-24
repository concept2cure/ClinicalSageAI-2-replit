
import React, { useState } from "react";
import { motion } from "framer-motion";
import { 
  BarChart3, LineChart, PieChartIcon, TrendingUp, Check, Activity,
  ChevronDown, ChevronUp, ChevronRight, Code, Download, BarChart2, BrainCircuit,
  GitMerge, CornerUpRight, Calculator, LayoutGrid
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

export default function StatisticalModeling() {
  const { toast } = useToast();
  const [activeModel, setActiveModel] = useState("logistic");
  const [showCode, setShowCode] = useState(false);
  
  const runModel = () => {
    // toast call replaced
  // Original: toast({
      title: "Model run initiated",
      description: "Your statistical model is now running. Results will appear shortly.",
    })
  console.log('Toast would show:', {
      title: "Model run initiated",
      description: "Your statistical model is now running. Results will appear shortly.",
    });
    // In a real app, this would trigger an API call
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="bg-gradient-to-r from-purple-100 to-indigo-100 rounded-xl p-8 shadow-md border border-purple-200">
        <div className="flex flex-col lg:flex-row justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-3">Statistical Modeling Engine</h1>
            <p className="text-slate-700 max-w-2xl">
              Build, customize, and deploy advanced statistical models to analyze clinical trial data, predict outcomes, and optimize study designs.
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export Models
            </Button>
            <Button className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4" />
              New Analysis
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left sidebar - Model selection */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <LayoutGrid className="h-5 w-5 text-purple-600 mr-2" />
                Model Library
              </CardTitle>
              <CardDescription>
                Select a statistical model to analyze your trial data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className={`p-3 rounded-md cursor-pointer transition-colors ${activeModel === "logistic" ? "bg-purple-100 border border-purple-200" : "hover:bg-slate-100"}`}
                onClick={() => setActiveModel("logistic")}
              >
                <div className="flex justify-between">
                  <h3 className="font-medium">Logistic Regression</h3>
                  {activeModel === "logistic" && <Check className="h-5 w-5 text-purple-500" />}
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  Binary outcome prediction (success/failure)
                </p>
              </div>
              
              <div 
                className={`p-3 rounded-md cursor-pointer transition-colors ${activeModel === "survival" ? "bg-purple-100 border border-purple-200" : "hover:bg-slate-100"}`}
                onClick={() => setActiveModel("survival")}
              >
                <div className="flex justify-between">
                  <h3 className="font-medium">Survival Analysis</h3>
                  {activeModel === "survival" && <Check className="h-5 w-5 text-purple-500" />}
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  Time-to-event analysis with Cox regression
                </p>
              </div>
              
              <div 
                className={`p-3 rounded-md cursor-pointer transition-colors ${activeModel === "bayesian" ? "bg-purple-100 border border-purple-200" : "hover:bg-slate-100"}`}
                onClick={() => setActiveModel("bayesian")}
              >
                <div className="flex justify-between">
                  <h3 className="font-medium">Bayesian Inference</h3>
                  {activeModel === "bayesian" && <Check className="h-5 w-5 text-purple-500" />}
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  Probabilistic modeling with prior knowledge
                </p>
              </div>
              
              <div 
                className={`p-3 rounded-md cursor-pointer transition-colors ${activeModel === "subgroup" ? "bg-purple-100 border border-purple-200" : "hover:bg-slate-100"}`}
                onClick={() => setActiveModel("subgroup")}
              >
                <div className="flex justify-between">
                  <h3 className="font-medium">Subgroup Analysis</h3>
                  {activeModel === "subgroup" && <Check className="h-5 w-5 text-purple-500" />}
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  Identify responsive patient segments
                </p>
              </div>
              
              <div 
                className={`p-3 rounded-md cursor-pointer transition-colors ${activeModel === "mixed" ? "bg-purple-100 border border-purple-200" : "hover:bg-slate-100"}`}
                onClick={() => setActiveModel("mixed")}
              >
                <div className="flex justify-between">
                  <h3 className="font-medium">Mixed Effects Model</h3>
                  {activeModel === "mixed" && <Check className="h-5 w-5 text-purple-500" />}
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  For longitudinal and hierarchical data
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Activity className="h-5 w-5 text-purple-600 mr-2" />
                Recent Models
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm p-3 border rounded-md hover:bg-slate-50 cursor-pointer">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Responder Analysis Model</span>
                  <Badge variant="outline">Logistic</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">Modified 2 hours ago</p>
              </div>
              
              <div className="text-sm p-3 border rounded-md hover:bg-slate-50 cursor-pointer">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Survival Prediction</span>
                  <Badge variant="outline">Cox PH</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">Modified yesterday</p>
              </div>
              
              <div className="text-sm p-3 border rounded-md hover:bg-slate-50 cursor-pointer">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Biomarker Analysis</span>
                  <Badge variant="outline">Bayesian</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">Modified 3 days ago</p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Main content - Model configuration */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-xl">
                    {activeModel === "logistic" && "Logistic Regression Model"}
                    {activeModel === "survival" && "Survival Analysis Model"}
                    {activeModel === "bayesian" && "Bayesian Inference Model"}
                    {activeModel === "subgroup" && "Subgroup Analysis Model"}
                    {activeModel === "mixed" && "Mixed Effects Model"}
                  </CardTitle>
                  <CardDescription>
                    Configure model parameters and data inputs
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowCode(!showCode)}
                        >
                          <Code className="h-4 w-4 mr-1" />
                          {showCode ? "Hide Code" : "View Code"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View the statistical code for this model</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Data Source Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Data Source
                </label>
                <Select defaultValue="uploaded">
                  <SelectTrigger>
                    <SelectValue placeholder="Select data source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uploaded">Uploaded CSR Data</SelectItem>
                    <SelectItem value="extracted">Extracted Endpoints</SelectItem>
                    <SelectItem value="external">External Dataset</SelectItem>
                    <SelectItem value="synthetic">Synthetic Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Model Parameters */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Model Configuration
                  </label>
                  <Button variant="ghost" size="sm" className="text-xs flex items-center">
                    Reset to defaults <CornerUpRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
                
                <div className="p-4 bg-slate-50 rounded-md space-y-4">
                  {activeModel === "logistic" && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Outcome Variable</label>
                          <Select defaultValue="response">
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="response">Treatment Response</SelectItem>
                              <SelectItem value="adverse">Adverse Event</SelectItem>
                              <SelectItem value="completion">Study Completion</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Regularization</label>
                          <Select defaultValue="l1">
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="l1">L1 (Lasso)</SelectItem>
                              <SelectItem value="l2">L2 (Ridge)</SelectItem>
                              <SelectItem value="elastic">Elastic Net</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Predictor Variables</label>
                        <div className="p-3 bg-white border rounded-md">
                          <div className="flex flex-wrap gap-2">
                            <Badge className="bg-slate-200 text-slate-800 hover:bg-slate-300">
                              Age <span className="ml-1 text-slate-500">×</span>
                            </Badge>
                            <Badge className="bg-slate-200 text-slate-800 hover:bg-slate-300">
                              Treatment Arm <span className="ml-1 text-slate-500">×</span>
                            </Badge>
                            <Badge className="bg-slate-200 text-slate-800 hover:bg-slate-300">
                              Biomarker Level <span className="ml-1 text-slate-500">×</span>
                            </Badge>
                            <Badge className="bg-slate-200 text-slate-800 hover:bg-slate-300">
                              Gender <span className="ml-1 text-slate-500">×</span>
                            </Badge>
                            <Button variant="ghost" size="sm" className="h-6 text-xs text-primary">
                              + Add more
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {activeModel === "survival" && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Time Variable</label>
                          <Select defaultValue="progression">
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="progression">Time to Progression</SelectItem>
                              <SelectItem value="mortality">Time to Mortality</SelectItem>
                              <SelectItem value="event">Time to Event</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Model Type</label>
                          <Select defaultValue="cox">
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cox">Cox Proportional Hazards</SelectItem>
                              <SelectItem value="weibull">Weibull</SelectItem>
                              <SelectItem value="kaplan">Kaplan-Meier</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Censoring Variable</label>
                          <Select defaultValue="completion">
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="completion">Study Completion</SelectItem>
                              <SelectItem value="dropout">Study Dropout</SelectItem>
                              <SelectItem value="cutoff">Data Cutoff</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Stratification</label>
                          <Select defaultValue="treatment">
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="treatment">Treatment Arm</SelectItem>
                              <SelectItem value="biomarker">Biomarker Status</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {/* Other model types would have similar but different config options */}
                  {(activeModel !== "logistic" && activeModel !== "survival") && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Primary Variable</label>
                        <Select defaultValue="outcome">
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="outcome">Clinical Outcome</SelectItem>
                            <SelectItem value="biomarker">Biomarker</SelectItem>
                            <SelectItem value="safety">Safety Event</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Model Complexity</label>
                        <Select defaultValue="medium">
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="simple">Simple</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="complex">Complex</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  
                  {/* Advanced Options Accordion */}
                  <Accordion type="single" collapsible className="w-full border-t pt-2">
                    <AccordionItem value="advanced" className="border-b-0">
                      <AccordionTrigger className="text-sm py-2">Advanced Options</AccordionTrigger>
                      <AccordionContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-slate-600 mb-1">
                              Cross-Validation
                            </label>
                            <Select defaultValue="kfold">
                              <SelectTrigger className="text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="kfold">K-Fold (k=5)</SelectItem>
                                <SelectItem value="loocv">Leave-One-Out</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-600 mb-1">
                              Random Seed
                            </label>
                            <Input type="number" defaultValue="42" className="text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">
                            Model Notes
                          </label>
                          <Textarea 
                            placeholder="Add notes about this model configuration..."
                            className="text-sm h-20"
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </div>
              
              {/* Code View */}
              {showCode && (
                <div className="bg-slate-900 text-slate-50 p-4 rounded-md overflow-x-auto text-sm font-mono">
                  {activeModel === "logistic" && (
                    <pre>{`# Logistic Regression Model with L1 Regularization
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
import numpy as np

# Load predictors and outcome
X = data[['age', 'treatment_arm', 'biomarker_level', 'gender']]
y = data['treatment_response']

# Initialize model with L1 regularization
model = LogisticRegression(
    penalty='l1',
    solver='liblinear',
    random_state=42
)

# Perform 5-fold cross-validation
cv_scores = cross_val_score(model, X, y, cv=5)
print(f"Cross-validation accuracy: {np.mean(cv_scores):.3f} ± {np.std(cv_scores):.3f}")

# Fit the model on the full dataset
model.fit(X, y)

# Report coefficients and p-values
coefs = pd.DataFrame({
    'Variable': X.columns,
    'Coefficient': model.coef_[0],
    'Odds Ratio': np.exp(model.coef_[0])
})
print(coefs.sort_values('Coefficient', ascending=False))`}</pre>
                  )}
                  
                  {activeModel === "survival" && (
                    <pre>{`# Cox Proportional Hazards Survival Analysis
from lifelines import CoxPHFitter
import pandas as pd

# Prepare the data
data = pd.DataFrame({
    'time': survival_data['time_to_progression'],
    'event': survival_data['progression_event'],
    'treatment_arm': survival_data['treatment_arm'],
    'age': survival_data['age'],
    'gender': survival_data['gender'],
    'biomarker': survival_data['biomarker_status']
})

# Initialize and fit the Cox model
cph = CoxPHFitter()
cph.fit(
    data, 
    duration_col='time', 
    event_col='event',
    strata=['treatment_arm'],
    robust=True
)

# Print summary
cph.print_summary()

# Plot survival curves
from lifelines import KaplanMeierFitter
kmf = KaplanMeierFitter()

for arm in data['treatment_arm'].unique():
    mask = data['treatment_arm'] == arm
    kmf.fit(
        data.loc[mask, 'time'],
        data.loc[mask, 'event'],
        label=f'Treatment Arm {arm}'
    )
    kmf.plot_survival_function()`}</pre>
                  )}
                  
                  {activeModel === "bayesian" && (
                    <pre>{`# Bayesian Inference Model
import pymc3 as pm
import numpy as np
import arviz as az

# Define the model
with pm.Model() as bayesian_model:
    # Define priors
    alpha = pm.Normal('alpha', mu=0, sd=10)
    beta = pm.Normal('beta', mu=0, sd=10, shape=X.shape[1])
    sigma = pm.HalfNormal('sigma', sd=1)
    
    # Define likelihood
    mu = alpha + pm.math.dot(X, beta)
    y_obs = pm.Normal('y_obs', mu=mu, sigma=sigma, observed=y)
    
    # Inference
    trace = pm.sample(2000, tune=1000, cores=2, return_inferencedata=True)
    
# Results analysis
az.plot_trace(trace)
az.summary(trace)

# Posterior predictive checks
with bayesian_model:
    posterior_pred = pm.sample_posterior_predictive(trace)
    
az.plot_ppc(az.from_pymc3(posterior_pred=posterior_pred, model=bayesian_model))`}</pre>
                  )}
                  
                  {activeModel === "subgroup" && (
                    <pre>{`# Subgroup Analysis with Decision Trees
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import GridSearchCV

# Initialize decision tree
dt = DecisionTreeClassifier(random_state=42)

# Define parameter grid
param_grid = {
    'max_depth': [3, 5, 7, 10],
    'min_samples_split': [2, 5, 10],
    'min_samples_leaf': [1, 2, 4]
}

# Grid search with cross-validation
grid_search = GridSearchCV(
    dt, param_grid, cv=5,
    scoring='roc_auc',
    return_train_score=True
)

# Fit the model
grid_search.fit(X, y)
best_model = grid_search.best_estimator_

# Extract and visualize subgroups
from sklearn.tree import export_graphviz
import graphviz

dot_data = export_graphviz(
    best_model,
    out_file=None,
    feature_names=X.columns,
    class_names=['Non-responder', 'Responder'],
    filled=True,
    rounded=True
)
graph = graphviz.Source(dot_data)
graph.render("subgroup_tree")`}</pre>
                  )}
                  
                  {activeModel === "mixed" && (
                    <pre>{`# Mixed Effects Model for Longitudinal Data
import statsmodels.api as sm
import statsmodels.formula.api as smf

# Define the mixed effects model
mixed_model = smf.mixedlm(
    "outcome ~ treatment + time + treatment:time",
    data=longitudinal_data,
    groups=longitudinal_data["subject_id"]
)

# Fit the model
mixed_model_fit = mixed_model.fit()

# Print summary
print(mixed_model_fit.summary())

# Visualize fixed effects
import seaborn as sns
import matplotlib.pyplot as plt

fixed_effects = pd.DataFrame({
    'parameter': mixed_model_fit.params.index,
    'estimate': mixed_model_fit.params.values,
    'lower_ci': mixed_model_fit.conf_int()[0],
    'upper_ci': mixed_model_fit.conf_int()[1]
})

plt.figure(figsize=(10, 6))
sns.pointplot(
    x='estimate', y='parameter',
    data=fixed_effects,
    join=False, color='steelblue'
)
plt.errorbar(
    fixed_effects['estimate'], fixed_effects.index,
    xerr=fixed_effects['upper_ci'] - fixed_effects['estimate'],
    fmt='none', color='steelblue'
)
plt.axvline(0, color='red', linestyle='--')
plt.title('Fixed Effects with 95% Confidence Intervals')`}</pre>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t pt-6 flex justify-between">
              <Button variant="outline">Save Model</Button>
              <div className="space-x-2">
                <Button variant="outline">Preview Results</Button>
                <Button onClick={runModel}>Run Model</Button>
              </div>
            </CardFooter>
          </Card>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center text-lg">
                  <GitMerge className="h-5 w-5 text-purple-600 mr-2" />
                  Model Integration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 mb-4">
                  Integrate this model with other TrialSage components
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between border p-3 rounded-md hover:bg-slate-50 cursor-pointer transition-colors">
                    <span className="text-sm font-medium">Protocol Generator</span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="flex items-center justify-between border p-3 rounded-md hover:bg-slate-50 cursor-pointer transition-colors">
                    <span className="text-sm font-medium">Study Design Agent</span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="flex items-center justify-between border p-3 rounded-md hover:bg-slate-50 cursor-pointer transition-colors">
                    <span className="text-sm font-medium">Virtual Trial Simulator</span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center text-lg">
                  <Calculator className="h-5 w-5 text-purple-600 mr-2" />
                  Sample Size Calculator
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 mb-4">
                  Calculate required sample size based on model parameters
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1 flex justify-between">
                      <span>Effect Size</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-blue-500 cursor-help">?</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="w-60">The expected difference between treatment groups. Smaller effect sizes require larger sample sizes.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </label>
                    <Input type="number" placeholder="0.5" className="text-sm" min="0.05" max="2.0" step="0.05" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1 flex justify-between">
                      <span>Power (1-β)</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-blue-500 cursor-help">?</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="w-60">Probability of detecting an effect when it exists. Standard is 0.8 (80%) or 0.9 (90%).</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </label>
                    <Input type="number" placeholder="0.8" className="text-sm" min="0.7" max="0.99" step="0.01" />
                    <div className="mt-1 flex">
                      <span className="flex-1 text-center text-xs text-slate-500 px-2 py-1 hover:bg-slate-100 cursor-pointer rounded-l">70%</span>
                      <span className="flex-1 text-center text-xs bg-purple-100 text-purple-700 px-2 py-1 font-medium">80%</span>
                      <span className="flex-1 text-center text-xs text-slate-500 px-2 py-1 hover:bg-slate-100 cursor-pointer">90%</span>
                      <span className="flex-1 text-center text-xs text-slate-500 px-2 py-1 hover:bg-slate-100 cursor-pointer rounded-r">95%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1 flex justify-between">
                      <span>Significance Level (α)</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-blue-500 cursor-help">?</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="w-60">Threshold for statistical significance. Standard is 0.05 (5%).</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </label>
                    <Select defaultValue="0.05">
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.01">0.01 (1%)</SelectItem>
                        <SelectItem value="0.05">0.05 (5%)</SelectItem>
                        <SelectItem value="0.10">0.10 (10%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      Allocation Ratio (T:C)
                    </label>
                    <Select defaultValue="1">
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1:1</SelectItem>
                        <SelectItem value="2">2:1</SelectItem>
                        <SelectItem value="3">3:1</SelectItem>
                        <SelectItem value="0.5">1:2</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" className="w-full">Calculate Sample Size</Button>
                </div>
              </CardContent>
              <CardFooter className="pt-0 text-xs text-slate-500 italic">
                Based on two-sample t-test calculation
              </CardFooter>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <BarChart3 className="h-5 w-5 text-purple-600 mr-2" />
                Visualization Options
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="border rounded-lg p-3 hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-colors">
                  <div className="flex justify-center mb-2">
                    <BarChart2 className="h-8 w-8 text-purple-600" />
                  </div>
                  <h4 className="text-sm font-medium text-center">Bar Charts</h4>
                  <p className="text-xs text-slate-500 text-center mt-1">Compare values across categories</p>
                </div>
                
                <div className="border rounded-lg p-3 hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-colors">
                  <div className="flex justify-center mb-2">
                    <LineChart className="h-8 w-8 text-purple-600" />
                  </div>
                  <h4 className="text-sm font-medium text-center">Line Charts</h4>
                  <p className="text-xs text-slate-500 text-center mt-1">Show trends over time</p>
                </div>
                
                <div className="border rounded-lg p-3 hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-colors">
                  <div className="flex justify-center mb-2">
                    <PieChartIcon className="h-8 w-8 text-purple-600" />
                  </div>
                  <h4 className="text-sm font-medium text-center">Pie Charts</h4>
                  <p className="text-xs text-slate-500 text-center mt-1">Display proportion of categories</p>
                </div>
                
                <div className="border rounded-lg p-3 hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-colors">
                  <div className="flex justify-center mb-2">
                    <Activity className="h-8 w-8 text-purple-600" />
                  </div>
                  <h4 className="text-sm font-medium text-center">Scatter Plots</h4>
                  <p className="text-xs text-slate-500 text-center mt-1">Visualize correlations</p>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-slate-50 rounded-md">
                <h4 className="text-sm font-medium mb-2">Export Options</h4>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="text-xs">
                    <Download className="h-3 w-3 mr-1" /> PNG
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs">
                    <Download className="h-3 w-3 mr-1" /> SVG
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs">
                    <Download className="h-3 w-3 mr-1" /> PDF
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs">
                    <Download className="h-3 w-3 mr-1" /> CSV Data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
