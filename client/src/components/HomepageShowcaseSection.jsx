import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import axios from 'axios';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  FileText, PieChart, LineChart, BookOpen, Award, Calendar, BarChart, FileCheck, Users, Star, FileDown, ExternalLink, Eye, BrainCircuit, Lightbulb } from 'lucide-react'

/**
 * Clinical Intelligence Showcase Section
 *
 * A dynamic, grid-based showcase of intelligence capabilities organized by persona.
 * Each tile represents a different intelligence output with real-world files and statistics.
 *
 * Features:
 * - Persona-based styling (colors match user role)
 * - Live file previews
 * - Real statistical outputs
 * - CSR citation badges
 * - Clear CTAs for both viewing examples and generating new reports
 */
const HomepageShowcaseSection = () => {
  // State for report index, manifests, and launch configuration
  const [reportIndex, setReportIndex] = useState([]);
  const [reportManifests, setReportManifests] = useState({});
  const [launchConfig, setLaunchConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activePreview, setActivePreview] = useState(null);

  // Fetch report data directly from static JSON files
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch report index
        const indexRes = await axios.get('/static/example_reports/report_index.json');
        setReportIndex(indexRes.data.available_subscriptions || []);

        // Fetch launch config
        const launchRes = await axios.get('/launch_config.json');
        setLaunchConfig(launchRes.data || {});

        // Fetch individual manifest files
        for (const sub of indexRes.data.available_subscriptions) {
          try {
            const manifestRes = await axios.get(sub.path);
            setReportManifests(prev => ({ ...prev, [sub.persona]: manifestRes.data }));
          } catch (err) {
            console.error('Failed to load manifest:', err);
          }
        }
      } catch (err) {
        console.error('Error loading showcase data:', err);
        setError('Failed to load showcase data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Helper function to get gradient based on persona
  const getPersonaGradient = persona => {
    switch (persona.toLowerCase()) {
      case 'planner':
      case 'study planner':
        return 'from-blue-500 to-indigo-600';
      case 'regulatory':
      case 'reg affairs':
        return 'from-purple-500 to-indigo-600';
      case 'biostats':
      case 'statistical':
        return 'from-emerald-500 to-teal-600';
      case 'ceo':
      case 'investor':
      case 'bd':
        return 'from-amber-500 to-orange-600';
      case 'clin ops':
      case 'operational':
        return 'from-rose-500 to-red-600';
      default:
        return 'from-gray-500 to-gray-700';
    }
  };

  // Helper function to get persona icon
  const getPersonaIcon = persona => {
    switch (persona.toLowerCase()) {
      case 'planner':
      case 'study planner':
        return <BrainCircuit className="h-5 w-5" />;
      case 'regulatory':
      case 'reg affairs':
        return <FileCheck className="h-5 w-5" />;
      case 'biostats':
      case 'statistical':
        return <BarChart className="h-5 w-5" />;
      case 'ceo':
      case 'investor':
      case 'bd':
        return <PieChart className="h-5 w-5" />;
      case 'clin ops':
      case 'operational':
        return <Users className="h-5 w-5" />;
      default:
        return <Lightbulb className="h-5 w-5" />;
    }
  };

  // Helper to format dates
  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Helper to render the CSR citation badges
  const renderCitations = citations => {
    if (!citations || citations.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-2 mt-3">
        {citations.slice(0, 2).map((citation, idx) => (
          <TooltipProvider key={idx}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-xs bg-white/70 hover:bg-white">
                  <BookOpen className="h-3 w-3 mr-1" />
                  CSR_{citation.id.substring(0, 8)}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{citation.title || 'Clinical Study Report'}</p>
                <p className="text-xs text-muted-foreground">
                  {citation.sponsor}, {citation.year}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
        {citations.length > 2 && (
          <Badge variant="outline" className="text-xs bg-white/70">
            +{citations.length - 2} more
          </Badge>
        )}
      </div>
    );
  };

  // Render loading state
  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">Clinical Intelligence Showcase</h2>
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-4 text-muted-foreground">Loading intelligence showcase...</p>
          </div>
        </div>
      </section>
    );
  }

  // Handle error state
  if (error && reportIndex.length === 0) {
    return (
      <section className="py-12 px-4">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">Clinical Intelligence Showcase</h2>
          <div className="text-center py-12">
            <p className="text-red-500">{error}</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // Function to create route based on persona
  const handleLaunch = persona => {
    const config = launchConfig[persona];
    if (config) {
      return `${config.route}&study_id=${config.study_id}`;
    }
    return '/planning';
  };

  return (
    <section className="py-12 px-4 bg-slate-50 dark:bg-gray-900">
      <div className="container mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold">Clinical Intelligence Showcase</h2>
          <p className="mt-2 text-lg text-muted-foreground max-w-3xl mx-auto">
            Real outputs from real trials, powered by LumenTrialGuide.AI
          </p>
        </div>

        {/* Intelligence Tiles Grid - Using Dynamic Data */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-10">
          {reportIndex.map(({ persona, title }) => {
            const manifest = reportManifests[persona];
            if (!manifest) return null;

            // Set styling based on persona
            const gradientClass = getPersonaGradient(persona);
            const icon = getPersonaIcon(persona);

            return (
              <Card key={persona} className="overflow-hidden border-0 shadow-lg">
                <div className={`bg-gradient-to-r ${gradientClass} text-white p-4`}>
                  <div className="flex justify-between items-start">
                    <Badge className="bg-white/20 hover:bg-white/30 border-none text-white">
                      {React.cloneElement(icon, { className: 'h-3.5 w-3.5 mr-1' })}
                      For {title.split(' ')[0]}
                    </Badge>
                    <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                      {manifest.version}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold mt-3 mb-0">{title}</h3>
                  <p className="text-sm opacity-90">{manifest.description}</p>
                </div>
                <CardContent className="p-4">
                  <ul className="text-sm list-disc pl-5 space-y-1 mt-2">
                    {manifest.includes.slice(0, 4).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                    {manifest.includes.length > 4 && <li>+ more in the full report</li>}
                  </ul>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm text-muted-foreground mb-1.5">
                      <span>Last updated</span>
                      <span className="font-medium">{formatDate(manifest.last_updated)}</span>
                    </div>
                    <Progress value={80} className="h-2" />
                  </div>
                </CardContent>
                <CardFooter className="px-4 py-3 bg-gray-50 border-t flex justify-between dark:bg-gray-900">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Eye className="h-3.5 w-3.5" />
                        View Package
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>{title} Preview</DialogTitle>
                        <DialogDescription>{manifest.description}</DialogDescription>
                      </DialogHeader>
                      <div className="bg-slate-50 p-4 rounded-md overflow-hidden">
                        <object
                          data={`/static/example_reports/${persona}/${manifest.files[0] || 'summary.pdf'}`}
                          type="application/pdf"
                          width="100%"
                          height="500px"
                          className="rounded border"
                        >
                          <p>PDF cannot be displayed</p>
                        </object>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Link href={handleLaunch(persona)}>
                    <Button
                      className={`bg-gradient-to-r ${gradientClass} text-white hover:opacity-90 gap-1.5`}
                    >
                      {React.cloneElement(icon, { className: 'h-3.5 w-3.5' })}
                      Generate Your Own
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })}

          {/* Fallback if no packages loaded */}
          {reportIndex.length === 0 && !loading && !error && (
            <div className="col-span-full text-center py-10">
              <p>No intelligence packages available. Please check back later.</p>
            </div>
          )}

          {/* TILE 3 — REGULATORY READINESS (REGULATORY AFFAIRS) */}
          <Card className="overflow-hidden border-0 shadow-lg">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-4">
              <div className="flex justify-between items-start">
                <Badge className="bg-white/20 hover:bg-white/30 border-none text-white">
                  <FileCheck className="h-3.5 w-3.5 mr-1" />
                  For Regulatory Affairs
                </Badge>
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  Regulatory Package
                </span>
              </div>
              <h3 className="text-xl font-bold mt-3 mb-0">Regulatory Readiness Package</h3>
              <p className="text-sm opacity-90">
                Complete IND-ready submission package with compliance verification
              </p>
            </div>
            <CardContent className="p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2 text-sm">
                <dt className="text-muted-foreground flex items-center">
                  <FileText className="h-3.5 w-3.5 mr-1.5" /> IND sections
                </dt>
                <dd className="font-medium">2.5 and 2.7</dd>

                <dt className="text-muted-foreground flex items-center">
                  <Award className="h-3.5 w-3.5 mr-1.5" /> Compliance score
                </dt>
                <dd className="font-medium text-emerald-600">94%</dd>

                <dt className="text-muted-foreground flex items-center">
                  <LineChart className="h-3.5 w-3.5 mr-1.5" /> Risk score
                </dt>
                <dd className="font-medium">Low (92/100)</dd>

                <dt className="text-muted-foreground flex items-center">
                  <BrainCircuit className="h-3.5 w-3.5 mr-1.5" /> AI traces
                </dt>
                <dd className="font-medium">Included</dd>

                <dt className="text-muted-foreground flex items-center">
                  <FileCheck className="h-3.5 w-3.5 mr-1.5" /> FDA/EMA
                </dt>
                <dd className="font-medium">Aligned</dd>
              </dl>

              {renderCitations([
                {
                  id: 'NCT05678901',
                  title: 'Regulatory Compliance',
                  sponsor: 'RegPharma',
                  year: 2023,
                },
                {
                  id: 'NCT06789012',
                  title: 'FDA Submission Checklist',
                  sponsor: 'FDA',
                  year: 2024,
                },
              ])}

              <div className="mt-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-1.5">
                  <span>Submission readiness</span>
                  <span className="font-medium">Excellent</span>
                </div>
                <Progress value={94} className="h-2" />
              </div>
            </CardContent>
            <CardFooter className="px-4 py-3 bg-gray-50 border-t flex justify-between dark:bg-gray-900">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    View Submission
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Regulatory Readiness Package Preview</DialogTitle>
                    <DialogDescription>
                      Complete IND-ready submission package with compliance verification
                    </DialogDescription>
                  </DialogHeader>
                  <div className="bg-slate-50 p-4 rounded-md overflow-hidden">
                    <object
                      data="/static/example_reports/regulatory/ind_summary.pdf"
                      type="application/pdf"
                      width="100%"
                      height="500px"
                      className="rounded border"
                    >
                      <p>PDF cannot be displayed</p>
                    </object>
                  </div>
                </DialogContent>
              </Dialog>

              <Link href="/planning?persona=regulatory&example=submission">
                <Button className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:from-purple-600 hover:to-indigo-700 gap-1.5">
                  <FileCheck className="h-3.5 w-3.5" />
                  Run Compliance Check
                </Button>
              </Link>
            </CardFooter>
          </Card>

          {/* TILE 4 — STATISTICAL READINESS (BIOSTATS) */}
          <Card className="overflow-hidden border-0 shadow-lg">
            <div className={`bg-gradient-to-r from-emerald-500 to-teal-600 text-white p-4`}>
              <div className="flex justify-between items-start">
                <Badge className="bg-white/20 hover:bg-white/30 border-none text-white">
                  <BarChart className="h-3.5 w-3.5 mr-1" />
                  For Biostatisticians
                </Badge>
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  Statistical Analysis
                </span>
              </div>
              <h3 className="text-xl font-bold mt-3 mb-0">Statistical Analysis Package</h3>
              <p className="text-sm opacity-90">Make every assumption defensible.</p>
            </div>
            <CardContent className="p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2 text-sm">
                <dt className="text-muted-foreground flex items-center">
                  <Users className="h-3.5 w-3.5 mr-1.5" /> Sample size
                </dt>
                <dd className="font-medium">428 (214 per arm)</dd>

                <dt className="text-muted-foreground flex items-center">
                  <LineChart className="h-3.5 w-3.5 mr-1.5" /> Power
                </dt>
                <dd className="font-medium">90%</dd>

                <dt className="text-muted-foreground flex items-center">
                  <LineChart className="h-3.5 w-3.5 mr-1.5" /> Dropout forecast
                </dt>
                <dd className="font-medium">15.2%</dd>

                <dt className="text-muted-foreground flex items-center">
                  <FileText className="h-3.5 w-3.5 mr-1.5" /> SAP draft
                </dt>
                <dd className="font-medium">Available</dd>

                <dt className="text-muted-foreground flex items-center">
                  <BarChart className="h-3.5 w-3.5 mr-1.5" /> Endpoint risks
                </dt>
                <dd className="font-medium text-amber-600">Medium (2)</dd>
              </dl>

              {renderCitations([
                {
                  id: 'NCT07890123',
                  title: 'Statistical Analysis Plan',
                  sponsor: 'StatResearch',
                  year: 2023,
                },
                {
                  id: 'NCT08901234',
                  title: 'Power Calculation Benchmark',
                  sponsor: 'BioStat Inc',
                  year: 2024,
                },
              ])}

              <div className="mt-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-1.5">
                  <span>SAP completeness</span>
                  <span className="font-medium">85%</span>
                </div>
                <Progress value={85} className="h-2" />
              </div>
            </CardContent>
            <CardFooter className="px-4 py-3 bg-gray-50 border-t flex justify-between dark:bg-gray-900">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    View Statistical Brief
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Statistical Analysis Package Preview</DialogTitle>
                    <DialogDescription>
                      Complete SAP draft with power calculations and endpoint risk analysis
                    </DialogDescription>
                  </DialogHeader>
                  <div className="bg-slate-50 p-4 rounded-md overflow-hidden">
                    <object
                      data="/static/example_reports/biostats/sap_draft.pdf"
                      type="application/pdf"
                      width="100%"
                      height="500px"
                      className="rounded border"
                    >
                      <p>PDF cannot be displayed</p>
                    </object>
                  </div>
                </DialogContent>
              </Dialog>

              <Link href="/planning?persona=biostats&example=stats">
                <Button className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 gap-1.5">
                  <BarChart className="h-3.5 w-3.5" />
                  Simulate Your Plan
                </Button>
              </Link>
            </CardFooter>
          </Card>

          {/* TILE 5 — OPERATIONAL EXECUTION (CLIN OPS) */}
          <Card className="overflow-hidden border-0 shadow-lg">
            <div className={`bg-gradient-to-r from-rose-500 to-red-600 text-white p-4`}>
              <div className="flex justify-between items-start">
                <Badge className="bg-white/20 hover:bg-white/30 border-none text-white">
                  <Users className="h-3.5 w-3.5 mr-1" />
                  For Clinical Ops
                </Badge>
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Study Execution</span>
              </div>
              <h3 className="text-xl font-bold mt-3 mb-0">Operational Execution Plan</h3>
              <p className="text-sm opacity-90">Run what can be executed, not just approved.</p>
            </div>
            <CardContent className="p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2 text-sm">
                <dt className="text-muted-foreground flex items-center">
                  <Calendar className="h-3.5 w-3.5 mr-1.5" /> Timeline
                </dt>
                <dd className="font-medium">18 months</dd>

                <dt className="text-muted-foreground flex items-center">
                  <Users className="h-3.5 w-3.5 mr-1.5" /> Site count
                </dt>
                <dd className="font-medium">32 sites</dd>

                <dt className="text-muted-foreground flex items-center">
                  <LineChart className="h-3.5 w-3.5 mr-1.5" /> Enrollment delay
                </dt>
                <dd className="font-medium text-amber-600">21% risk</dd>

                <dt className="text-muted-foreground flex items-center">
                  <Award className="h-3.5 w-3.5 mr-1.5" /> Execution risk
                </dt>
                <dd className="font-medium">Medium (63/100)</dd>

                <dt className="text-muted-foreground flex items-center">
                  <Calendar className="h-3.5 w-3.5 mr-1.5" /> Gantt chart
                </dt>
                <dd className="font-medium">Available</dd>
              </dl>

              {renderCitations([
                {
                  id: 'NCT09012345',
                  title: 'Operational Timeline',
                  sponsor: 'ClinOpsResearch',
                  year: 2024,
                },
                {
                  id: 'NCT09123456',
                  title: 'Site Burden Assessment',
                  sponsor: 'SiteExec Inc',
                  year: 2023,
                },
              ])}

              <div className="mt-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-1.5">
                  <span>Operational feasibility</span>
                  <span className="font-medium">Good</span>
                </div>
                <Progress value={76} className="h-2" />
              </div>
            </CardContent>
            <CardFooter className="px-4 py-3 bg-gray-50 border-t flex justify-between dark:bg-gray-900">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    View Timeline
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Operational Execution Plan Preview</DialogTitle>
                    <DialogDescription>
                      Complete execution timeline with site burden and enrollment forecasts
                    </DialogDescription>
                  </DialogHeader>
                  <div className="bg-slate-50 p-4 rounded-md overflow-hidden">
                    <object
                      data="/static/example_reports/clinops/timeline.pdf"
                      type="application/pdf"
                      width="100%"
                      height="500px"
                      className="rounded border"
                    >
                      <p>PDF cannot be displayed</p>
                    </object>
                  </div>
                </DialogContent>
              </Dialog>

              <Link href="/planning?persona=clinops&example=timeline">
                <Button className="bg-gradient-to-r from-rose-500 to-red-600 text-white hover:from-rose-600 hover:to-red-700 gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Forecast Your Timeline
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-16">
          <h3 className="text-2xl font-bold mb-4">Ready to generate your own intelligence?</h3>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Upload your protocol or start from scratch to generate full intelligence packages backed
            by real-world data.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/planning">
              <Button size="lg" className="bg-primary hover:bg-primary/90 gap-2">
                <BrainCircuit className="h-5 w-5" />
                Start Building Your Protocol
              </Button>
            </Link>
            <Link href="/example-reports">
              <Button size="lg" variant="outline" className="gap-2">
                <FileText className="h-5 w-5" />
                View All Example Reports
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomepageShowcaseSection;
