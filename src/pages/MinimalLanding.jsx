import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function MinimalLanding() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Hero section */}
      <header className="w-full bg-gradient-to-br from-white to-blue-50 border-b border-gray-100">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16">
            <div className="flex flex-col justify-center">
              <div className="flex gap-3 mb-6">
                <div className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium bg-blue-50 text-blue-700">
                  <span>ICH Wiz</span>
                </div>
                <div className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium bg-blue-100 text-blue-800">
                  <span>IND Wizard</span>
                </div>
                <div className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium bg-green-50 text-green-700">
                  <span>CMDR</span>
                </div>
              </div>

              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
                <span className="text-blue-600">TrialSage</span>™ Platform
              </h1>
              <p className="mt-4 text-xl text-gray-500 max-w-lg">
                Revolutionizing clinical and pharmaceutical document workflows with AI-powered
                intelligence.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="w-full sm:w-auto">
                  Request Demo
                </Button>
                <Link href="/login">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">
                    Enterprise Login
                  </Button>
                </Link>
              </div>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">21 CFR Part 11 Compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">FDA Submission Ready</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">3,200+ Study Reports</span>
                </div>
              </div>
            </div>

            <div className="relative rounded-xl bg-white p-6 shadow-lg border border-gray-100">
              <div className="space-y-4">
                <div className="rounded-lg bg-blue-50 p-4">
                  <h3 className="font-medium text-blue-800 mb-1">CSR Intelligence™</h3>
                  <p className="text-sm text-blue-700">
                    Our AI has analyzed 3,217 clinical study reports to optimize your protocol
                    designs.
                  </p>
                </div>

                <div className="rounded-lg bg-green-50 p-4">
                  <h3 className="font-medium text-green-800 mb-1">IND Wizard™</h3>
                  <p className="text-sm text-green-700">
                    Expedite submission preparation with guided workflows and AI-assisted document
                    generation.
                  </p>
                </div>

                <div className="rounded-lg bg-purple-50 p-4">
                  <h3 className="font-medium text-purple-800 mb-1">ICH Wiz™</h3>
                  <p className="text-sm text-purple-700">
                    Digital compliance coach for regulatory requirements in pharmaceutical
                    development.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Stats section */}
      <section className="w-full bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col">
                  <p className="text-3xl font-bold">68%</p>
                  <p className="text-sm text-gray-500 mt-1">Faster Submission Time</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col">
                  <p className="text-3xl font-bold">3,217</p>
                  <p className="text-sm text-gray-500 mt-1">Clinical Study Reports</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col">
                  <p className="text-3xl font-bold">94%</p>
                  <p className="text-sm text-gray-500 mt-1">Submission Acceptance Rate</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col">
                  <p className="text-3xl font-bold">$2.4M</p>
                  <p className="text-sm text-gray-500 mt-1">Avg. Cost Savings</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Solutions section */}
      <section className="w-full bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold">Enterprise Solutions</h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Comprehensive tools to transform your regulatory documentation workflow
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <Card className="border-0 shadow-sm h-full">
              <CardContent className="p-6 h-full flex flex-col">
                <h3 className="text-lg font-semibold mb-2">IND Wizard™</h3>
                <p className="text-gray-500 text-sm mb-4 flex-grow">
                  Automated workflows for IND submission preparation, with AI-driven document
                  generation and regulatory guidance.
                </p>
                <Link href="/ind-wizard">
                  <div className="text-blue-600 hover:text-blue-700 text-sm font-medium cursor-pointer">
                    Learn more
                  </div>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm h-full">
              <CardContent className="p-6 h-full flex flex-col">
                <h3 className="text-lg font-semibold mb-2">CSR Intelligence™</h3>
                <p className="text-gray-500 text-sm mb-4 flex-grow">
                  Extract insights from past clinical study reports to optimize protocol design and
                  improve study success rates.
                </p>
                <Link href="/csr-library">
                  <div className="text-blue-600 hover:text-blue-700 text-sm font-medium cursor-pointer">
                    Learn more
                  </div>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm h-full">
              <CardContent className="p-6 h-full flex flex-col">
                <h3 className="text-lg font-semibold mb-2">Protocol Design™</h3>
                <p className="text-gray-500 text-sm mb-4 flex-grow">
                  AI-powered protocol optimization using precedent analysis and statistical
                  simulation for better outcomes.
                </p>
                <Link href="/protocol-optimization">
                  <div className="text-blue-600 hover:text-blue-700 text-sm font-medium cursor-pointer">
                    Learn more
                  </div>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm h-full">
              <CardContent className="p-6 h-full flex flex-col">
                <h3 className="text-lg font-semibold mb-2">Document Vault™</h3>
                <p className="text-gray-500 text-sm mb-4 flex-grow">
                  21 CFR Part 11 compliant document management with version control and electronic
                  signatures.
                </p>
                <Link href="/document-vault">
                  <div className="text-blue-600 hover:text-blue-700 text-sm font-medium cursor-pointer">
                    Learn more
                  </div>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm h-full">
              <CardContent className="p-6 h-full flex flex-col">
                <h3 className="text-lg font-semibold mb-2">CMC Insights™</h3>
                <p className="text-gray-500 text-sm mb-4 flex-grow">
                  Streamline Chemistry, Manufacturing and Controls documentation with templates and
                  best practices.
                </p>
                <Link href="/cmc-module">
                  <div className="text-blue-600 hover:text-blue-700 text-sm font-medium cursor-pointer">
                    Learn more
                  </div>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm h-full">
              <CardContent className="p-6 h-full flex flex-col">
                <h3 className="text-lg font-semibold mb-2">Clinical Metadata Repository</h3>
                <p className="text-gray-500 text-sm mb-4 flex-grow">
                  Centralized metadata management for studies, streamlining data standardization and
                  reuse.
                </p>
                <Link href="/clinical-metadata-repository">
                  <div className="text-blue-600 hover:text-blue-700 text-sm font-medium cursor-pointer">
                    Learn more
                  </div>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA section */}
      <section className="w-full bg-blue-600 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white">
              Ready to Transform Your Regulatory Process?
            </h2>
            <p className="mt-4 text-xl text-blue-100 max-w-2xl mx-auto">
              Join the top pharmaceutical companies using TrialSage™ to accelerate submission
              timelines.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                Request Demo
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto text-white border-white hover:bg-blue-700"
              >
                Contact Sales
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full bg-gray-900 text-gray-400 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <h3 className="text-white font-semibold mb-4">TrialSage™ Platform</h3>
              <p className="text-sm">
                Advanced AI-powered SaaS platform revolutionizing clinical and pharmaceutical
                document workflows.
              </p>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">Solutions</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="hover:text-white">
                    IND Wizard™
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    CSR Intelligence™
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Protocol Design™
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Document Vault™
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    CMC Insights™
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">Resources</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="hover:text-white">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Webinars
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    White Papers
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Case Studies
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Blog
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="hover:text-white">
                    About Us
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Careers
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Contact
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Terms of Service
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-gray-800 pt-8 text-sm text-center">
            <p>
              © {new Date().getFullYear()} C2C.AI, Inc. All rights reserved. TrialSage™ and all
              product names are trademarks of C2C.AI, Inc.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
