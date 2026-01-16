import React from 'react';
import { Beaker, Database, LineChart, PieChart, Search, FileText, Brain, Award, Microscope, Users, Clipboard, Zap } from 'lucide-react'

import { PageContainer, HeaderSection, ContentSection } from '@/components/layout';
import Navbar from '@/components/navbar';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';

export default function ProductFeatures() {
  return (
    <PageContainer>
      <HeaderSection>
        <Navbar />
        <div className="container px-4 md:px-6 flex flex-col items-center text-center space-y-4 py-8 md:py-12">
          <div className="space-y-2">
            <Badge variant="outline" className="text-primary border-primary px-3 py-1">
              Product Features
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tighter">
              TrialSage Features & Capabilities
            </h1>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Powerful tools for clinical study design and protocol optimization
            </p>
          </div>
        </div>
      </HeaderSection>

      <ContentSection>
        <div className="container px-4 md:px-6 py-8 md:py-12">
          <div className="space-y-12">
            {/* CSR Intelligence */}
            <div className="space-y-6">
              <div className="space-y-2">
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-300">
                  Core Platform
                </Badge>
                <h2 className="text-3xl font-bold tracking-tighter">CSR Intelligence</h2>
                <p className="text-muted-foreground text-lg">
                  Extract actionable insights from clinical study reports
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Link href="/csr-search" className="block">
                  <Card className="border-2 border-transparent hover:border-primary/30 transition-all h-full">
                    <CardHeader className="pb-3">
                      <Database className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>Structured Report Repository</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        Access a comprehensive library of processed CSRs with normalized data
                        formats and searchable fields
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button variant="ghost" size="sm" className="w-full">
                        Open Repository
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
                <Link href="/csr-search" className="block">
                  <Card className="border-2 border-transparent hover:border-primary/30 transition-all h-full">
                    <CardHeader className="pb-3">
                      <Search className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>Advanced Search & Filtering</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        Find relevant CSRs by indication, phase, endpoint type, target population,
                        and other key parameters
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button variant="ghost" size="sm" className="w-full">
                        Search CSRs
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
                <Link href="/competitive-intelligence" className="block">
                  <Card className="border-2 border-transparent hover:border-primary/30 transition-all h-full">
                    <CardHeader className="pb-3">
                      <PieChart className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>Comparative Analytics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        Compare study designs, statistical approaches, and outcomes across multiple
                        trials and sponsors
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button variant="ghost" size="sm" className="w-full">
                        Open Analytics
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
              </div>
            </div>

            <Separator />

            {/* Protocol Design */}
            <div className="space-y-6">
              <div className="space-y-2">
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300">
                  Study Design Suite
                </Badge>
                <h2 className="text-3xl font-bold tracking-tighter">Protocol Design</h2>
                <p className="text-muted-foreground text-lg">
                  Create evidence-based clinical trial protocols
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Link href="/protocol-builder" className="block">
                  <Card className="border-2 border-transparent hover:border-primary/30 transition-all h-full">
                    <CardHeader className="pb-3">
                      <Brain className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>AI Protocol Generator</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        Generate protocol templates based on successful precedent trials and
                        regulatory standards
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button variant="ghost" size="sm" className="w-full">
                        Open Protocol Generator
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
                <Link href="/study-design" className="block">
                  <Card className="border-2 border-transparent hover:border-primary/30 transition-all h-full">
                    <CardHeader className="pb-3">
                      <FileText className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>Study Design Agent</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        Interactive AI assistant that helps craft and optimize trial designs with
                        evidence-based recommendations
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button variant="ghost" size="sm" className="w-full">
                        Open Study Design Agent
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
                <Link href="/protocol/optimizer" className="block">
                  <Card className="border-2 border-transparent hover:border-primary/30 transition-all h-full">
                    <CardHeader className="pb-3">
                      <Clipboard className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>Protocol Optimizer</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        Review and enhance your existing protocol with targeted suggestions for
                        improvement
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button variant="ghost" size="sm" className="w-full">
                        Open Protocol Optimizer
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
              </div>
            </div>

            <Separator />

            {/* Analytics */}
            <div className="space-y-6">
              <div className="space-y-2">
                <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-900 dark:text-purple-300">
                  Advanced Analytics
                </Badge>
                <h2 className="text-3xl font-bold tracking-tighter">Biostatistics & Modeling</h2>
                <p className="text-muted-foreground text-lg">
                  Make data-driven decisions for trial design
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Link href="/advanced-biostatistics" className="block">
                  <Card className="border-2 border-transparent hover:border-primary/30 transition-all h-full">
                    <CardHeader className="pb-3">
                      <LineChart className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>Statistical Modeling</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        Explore sample size, power calculations, and endpoint selection with
                        interactive visualizations
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button variant="ghost" size="sm" className="w-full">
                        Open Statistical Modeling
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
                <Link href="/endpoint-recommender" className="block">
                  <Card className="border-2 border-transparent hover:border-primary/30 transition-all h-full">
                    <CardHeader className="pb-3">
                      <Microscope className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>Endpoint Analysis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        Analyze endpoint selection patterns and performance across similar trials
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button variant="ghost" size="sm" className="w-full">
                        Open Endpoint Analysis
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
                <Link href="/analytics" className="block">
                  <Card className="border-2 border-transparent hover:border-primary/30 transition-all h-full">
                    <CardHeader className="pb-3">
                      <Users className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>Patient Population Insights</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        Optimize inclusion/exclusion criteria with real-world evidence from similar
                        studies
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button variant="ghost" size="sm" className="w-full">
                        Open Population Insights
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
              </div>
            </div>

            <Separator />

            {/* Integration & Export */}
            <div className="space-y-6">
              <div className="space-y-2">
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-300">
                  Workflow Integration
                </Badge>
                <h2 className="text-3xl font-bold tracking-tighter">Collaboration & Export</h2>
                <p className="text-muted-foreground text-lg">
                  Share insights and integrate with your workflow
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Link href="/my-dossiers" className="block">
                  <Card className="border-2 border-transparent hover:border-primary/30 transition-all h-full">
                    <CardHeader className="pb-3">
                      <Award className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>Research Dossiers</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        Create and share curated collections of CSRs with annotations and team notes
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button variant="ghost" size="sm" className="w-full">
                        Open Research Dossiers
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
                <Link href="/api-documentation" className="block">
                  <Card className="border-2 border-transparent hover:border-primary/30 transition-all h-full">
                    <CardHeader className="pb-3">
                      <Zap className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>API Access</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        Integrate TrialSage data and insights directly into your existing tools and
                        systems
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button variant="ghost" size="sm" className="w-full">
                        View API Documentation
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
                <Link href="/client-intelligence" className="block">
                  <Card className="border-2 border-transparent hover:border-primary/30 transition-all h-full">
                    <CardHeader className="pb-3">
                      <Beaker className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>Client Intelligence</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        Customized analytics and reports tailored to your specific pipeline and
                        therapeutic areas
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button variant="ghost" size="sm" className="w-full">
                        Open Client Intelligence
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-16 text-center space-y-6">
            <h2 className="text-3xl font-bold">Ready to transform your clinical trial design?</h2>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link href="/pricing">
                <Button size="lg" className="h-11">
                  See Pricing
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button size="lg" variant="outline" className="h-11">
                  Try Demo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </ContentSection>
    </PageContainer>
  );
}
