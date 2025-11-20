import React, { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { motion } from 'framer-motion';

export default function PersonaPages() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute('/persona/:role');
  const [activeTab, setActiveTab] = useState('founder');

  // Set the active tab based on the URL parameter
  useEffect(() => {
    if (match && params.role) {
      const validRoles = ['founder', 'regops', 'clinops', 'writer'];
      if (validRoles.includes(params.role)) {
        setActiveTab(params.role);
      }
    }
  }, [match, params]);

  // Update the URL when the tab changes
  const handleTabChange = value => {
    setActiveTab(value);
    setLocation(`/persona/${value}`);
  };

  return (
    <Container className="py-20">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold gradient-heading">TrialSage Personas</h1>
        <Link href="/">
          <Button variant="outline" className="flex items-center gap-2">
            <span>← Back to Home</span>
          </Button>
        </Link>
      </div>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="founder">Founder</TabsTrigger>
          <TabsTrigger value="regops">RegOps</TabsTrigger>
          <TabsTrigger value="clinops">ClinOps</TabsTrigger>
          <TabsTrigger value="writer">Writer</TabsTrigger>
        </TabsList>

        {/* Founder Persona */}
        <TabsContent value="founder" className="mt-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-4xl font-extrabold mb-4">For Biotech Founders & CXOs</h2>
            <p className="mb-6 text-lg text-gray-700">
              Gain control and visibility across your pipeline while slashing time-to-IND by up to
              60%.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  title: 'Strategic Dashboard',
                  desc: 'Real-time status of every program, submission risk heatmaps, and ROI forecasting.',
                },
                {
                  title: 'Investor-Ready Reports',
                  desc: 'Auto-generated executive summaries and Board-ready slides aligned to key KPIs.',
                },
                {
                  title: 'Cost Savings',
                  desc: 'Eliminate $300K+ in consulting fees annually with automated document generation.',
                },
                {
                  title: 'Competitive Lead',
                  desc: 'Get to clinical phases months faster and stay ahead of the competition.',
                },
              ].map((card, i) => (
                <Card key={i} className="shadow-lg">
                  <CardContent>
                    <CardTitle className="text-xl mb-2">{card.title}</CardTitle>
                    <CardDescription>{card.desc}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="text-center mt-8">
              <Button size="lg">Request Founder Bundle Pricing</Button>
            </div>
          </motion.div>
        </TabsContent>

        {/* RegOps Persona */}
        <TabsContent value="regops" className="mt-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-4xl font-extrabold mb-4">For Regulatory Affairs Leaders</h2>
            <p className="mb-6 text-lg text-gray-700">
              Automate IND and eCTD preparation with built-in compliance checks and fully trackable
              audit trails.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  title: 'Auto eCTD Builder',
                  desc: 'Modules 1–5 generated with AO style, validating compliance in real-time.',
                },
                {
                  title: 'ESG Integration',
                  desc: 'Direct FDA ESG SFTP pipeline for test & production submissions.',
                },
                {
                  title: 'Gap Analysis',
                  desc: 'Preflight checks highlight missing sections, metadata, or data anomalies.',
                },
                {
                  title: 'Audit Trails',
                  desc: 'Detailed logs for every change and AI suggestion to support 21 CFR Part 11.',
                },
              ].map((card, i) => (
                <Card key={i} className="shadow-lg">
                  <CardContent>
                    <CardTitle className="text-xl mb-2">{card.title}</CardTitle>
                    <CardDescription>{card.desc}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="text-center mt-8">
              <Button size="lg">Get RegOps Suite Details</Button>
            </div>
          </motion.div>
        </TabsContent>

        {/* ClinOps Persona */}
        <TabsContent value="clinops" className="mt-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-4xl font-extrabold mb-4">For Clinical Operations Teams</h2>
            <p className="mb-6 text-lg text-gray-700">
              Monitor study performance and safety signals live, and optimize protocols with
              data-driven insights.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  title: 'Live CSR Dashboard',
                  desc: 'Track enrollment, AEs, and deviations in real-time from a single view.',
                },
                {
                  title: 'Protocol Simulation',
                  desc: 'What-if modeling to forecast enrollment timelines and endpoint attainment.',
                },
                {
                  title: 'Comparator Library',
                  desc: 'Instantly compare safety/efficacy profiles across similar trials.',
                },
                {
                  title: 'Automated Alerts',
                  desc: 'Set thresholds for risk flags; get notified before issues escalate.',
                },
              ].map((card, i) => (
                <Card key={i} className="shadow-lg">
                  <CardContent>
                    <CardTitle className="text-xl mb-2">{card.title}</CardTitle>
                    <CardDescription>{card.desc}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="text-center mt-8">
              <Button size="lg">Explore ClinOps Advantage</Button>
            </div>
          </motion.div>
        </TabsContent>

        {/* Writer Persona */}
        <TabsContent value="writer" className="mt-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-4xl font-extrabold mb-4">For Medical Writers</h2>
            <p className="mb-6 text-lg text-gray-700">
              Turn raw CSR and trial data into polished, compliant reports in hours—not days.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  title: 'AI Writing Assist',
                  desc: 'Draft summaries, conclusions, and rationales with AI suggestions at your fingertips.',
                },
                {
                  title: 'Template Library',
                  desc: 'Prebuilt CER, protocol, and section templates optimized for regulatory review.',
                },
                {
                  title: 'Source Traceability',
                  desc: 'All citations and data links automatically generated and verified.',
                },
                {
                  title: 'Formatting Automator',
                  desc: 'Consistent styling and document structure guaranteed for any agency.',
                },
              ].map((card, i) => (
                <Card key={i} className="shadow-lg">
                  <CardContent>
                    <CardTitle className="text-xl mb-2">{card.title}</CardTitle>
                    <CardDescription>{card.desc}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="text-center mt-8">
              <Button size="lg">Unlock WriterPro Accelerator</Button>
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>
    </Container>
  );
}
