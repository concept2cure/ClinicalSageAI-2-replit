import React from 'react';
import { Link } from 'wouter';
import {
  Beaker,
  FileText,
  Microscope,
  BookOpen,
  Shield,
  Database,
  BarChart3,
  ArrowRight,
  Award,
  Line,
  Lightbulb,
  ClipboardCheck,
  FlaskConical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
// Inline layout components since we're having import issues
const PageContainer = ({ children, className }) => (
  <div className={`flex min-h-screen flex-col bg-slate-50 ${className || ''}`}>{children}</div>
);

const HeaderSection = ({ children, className }) => (
  <header className={`w-full bg-white shadow-sm ${className || ''}`}>{children}</header>
);

const ContentSection = ({ children, className }) => (
  <section className={`w-full py-8 ${className || ''}`}>{children}</section>
);

const CardGrid = ({ children, className }) => (
  <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 ${className || ''}`}>
    {children}
  </div>
);

const Footer = ({ children, className }) => (
  <footer className={`w-full bg-white shadow-sm border-t border-gray-200 ${className || ''}`}>
    {children}
  </footer>
);

// Premium product logos
const ProductLogo = ({ icon: Icon, title, variant = 'default' }) => {
  const baseClasses = 'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium';

  const variantClasses = {
    default: 'bg-blue-50 text-blue-700',
    primary: 'bg-blue-100 text-blue-800',
    secondary: 'bg-green-50 text-green-700',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-rose-50 text-rose-700',
    purple: 'bg-purple-50 text-purple-700',
    teal: 'bg-teal-50 text-teal-700',
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]}`}>
      <Icon className="h-4 w-4" />
      <span>{title}</span>
    </div>
  );
};

// Feature card with icon
const FeatureCard = ({ icon: Icon, title, description }) => {
  return (
    <Card className="border-0 shadow-sm transition-all hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="mb-2 rounded-full bg-blue-50 p-2 w-10 h-10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-blue-600" />
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-gray-500 text-sm">{description}</p>
      </CardContent>
    </Card>
  );
};

// Testimonial card
const TestimonialCard = ({ quote, author, role, company }) => {
  return (
    <Card className="border-0 shadow-sm h-full">
      <CardContent className="pt-6 h-full flex flex-col">
        <blockquote className="text-gray-700 mb-4 flex-grow">"{quote}"</blockquote>
        <div className="mt-auto">
          <p className="font-semibold">{author}</p>
          <p className="text-sm text-gray-500">
            {role}, {company}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

// Stat card
const StatCard = ({ value, label, icon: Icon }) => {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold">{value}</p>
            <p className="text-sm text-gray-500 mt-1">{label}</p>
          </div>
          <div className="rounded-full bg-blue-50 p-3">
            <Icon className="h-6 w-6 text-blue-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Solution card
const SolutionCard = ({ title, description, icon: Icon, path }) => {
  return (
    <Card className="border-0 shadow-sm transition-all hover:shadow-md h-full">
      <CardContent className="p-6 h-full flex flex-col">
        <div className="mb-4 rounded-lg bg-blue-50 p-3 w-12 h-12 flex items-center justify-center">
          <Icon className="h-6 w-6 text-blue-600" />
        </div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-gray-500 text-sm mb-4 flex-grow">{description}</p>
        <Link href={path}>
          <div className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center mt-auto cursor-pointer">
            Learn more
            <ArrowRight className="ml-1 h-4 w-4" />
          </div>
        </Link>
      </CardContent>
    </Card>
  );
};

export default function PremiumLanding() {
  return (
    <PageContainer>
      {/* Hero section */}
      <HeaderSection className="bg-gradient-to-br from-white to-blue-50 border-b border-gray-100">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16">
            <div className="flex flex-col justify-center">
              <div className="flex gap-3 mb-6">
                <ProductLogo icon={Beaker} title="ICH Wiz" />
                <ProductLogo icon={FileText} title="IND Wizard" variant="primary" />
                <ProductLogo icon={Database} title="CMDR" variant="secondary" />
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
                  <Shield className="h-5 w-5 text-blue-600" />
                  <span className="text-sm text-gray-600">21 CFR Part 11 Compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-blue-600" />
                  <span className="text-sm text-gray-600">FDA Submission Ready</span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-blue-600" />
                  <span className="text-sm text-gray-600">3,200+ Study Reports</span>
                </div>
              </div>
            </div>

            <div className="relative rounded-xl bg-white p-6 shadow-lg border border-gray-100">
              <div className="absolute -left-3 -top-3 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Line className="h-4 w-4 text-blue-600" />
              </div>
              <div className="space-y-4">
                <div className="rounded-lg bg-blue-50 p-4">
                  <h3 className="font-medium text-blue-800 mb-1">CSR Intelligence™</h3>
                  <p className="text-sm text-blue-700">
                    Our AI has analyzed 3,217 clinical study reports to optimize your protocol
                    designs.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                      Protocol Design
                    </span>
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                      Statistical Power
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-green-50 p-4">
                  <h3 className="font-medium text-green-800 mb-1">IND Wizard™</h3>
                  <p className="text-sm text-green-700">
                    Expedite submission preparation with guided workflows and AI-assisted document
                    generation.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      FDA Submissions
                    </span>
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      Form 1571
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-purple-50 p-4">
                  <h3 className="font-medium text-purple-800 mb-1">ICH Wiz™</h3>
                  <p className="text-sm text-purple-700">
                    Digital compliance coach for regulatory requirements in pharmaceutical
                    development.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                      ICH Guidelines
                    </span>
                    <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                      Compliance
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </HeaderSection>

      {/* Stats section */}
      <ContentSection className="bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard value="68%" label="Faster Submission Time" icon={ArrowRight} />
            <StatCard value="3,217" label="Clinical Study Reports" icon={FileText} />
            <StatCard value="94%" label="Submission Acceptance Rate" icon={Award} />
            <StatCard value="$2.4M" label="Avg. Cost Savings" icon={BarChart3} />
          </div>
        </div>
      </ContentSection>

      {/* Solutions section */}
      <ContentSection className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold">Enterprise Solutions</h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Comprehensive tools to transform your regulatory documentation workflow
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <SolutionCard
              title="IND Wizard™"
              description="Automated workflows for IND submission preparation, with AI-driven document generation and regulatory guidance."
              icon={FileText}
              path="/ind-wizard"
            />
            <SolutionCard
              title="CSR Intelligence™"
              description="Extract insights from past clinical study reports to optimize protocol design and improve study success rates."
              icon={Microscope}
              path="/csr-library"
            />
            <SolutionCard
              title="Protocol Design™"
              description="AI-powered protocol optimization using precedent analysis and statistical simulation for better outcomes."
              icon={FlaskConical}
              path="/protocol-optimization"
            />
            <SolutionCard
              title="Document Vault™"
              description="21 CFR Part 11 compliant document management with version control and electronic signatures."
              icon={Database}
              path="/document-vault"
            />
            <SolutionCard
              title="CMC Insights™"
              description="Streamline Chemistry, Manufacturing and Controls documentation with templates and best practices."
              icon={Beaker}
              path="/cmc-module"
            />
            <SolutionCard
              title="Clinical Metadata Repository"
              description="Centralized metadata management for studies, streamlining data standardization and reuse."
              icon={Database}
              path="/clinical-metadata-repository"
            />
          </div>
        </div>
      </ContentSection>

      {/* Features section */}
      <ContentSection className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-center">Key Platform Features</h2>
            <p className="mt-4 text-lg text-gray-600 text-center max-w-2xl mx-auto">
              Built with enterprise-grade security, compliance, and performance in mind
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Shield}
              title="21 CFR Part 11 Compliance"
              description="Electronic signatures, audit trails, and access controls that meet FDA regulatory requirements."
            />
            <FeatureCard
              icon={BookOpen}
              title="Regulatory Intelligence"
              description="Built-in guidance and updates from FDA, EMA, PMDA, and other global regulatory authorities."
            />
            <FeatureCard
              icon={Database}
              title="eCTD Integration"
              description="Streamlined publishing and validation for Electronic Common Technical Document submissions."
            />
            <FeatureCard
              icon={Lightbulb}
              title="OpenAI GPT Integration"
              description="Advanced AI capabilities powered by GPT-4 for document analysis and content generation."
            />
            <FeatureCard
              icon={ClipboardCheck}
              title="Validation Support"
              description="Comprehensive validation documentation and support for GxP environments."
            />
            <FeatureCard
              icon={BarChart3}
              title="Analytics Dashboard"
              description="Real-time metrics and insights on submission progress, quality, and resource allocation."
            />
          </div>
        </div>
      </ContentSection>

      {/* Testimonials section */}
      <ContentSection className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold">Trusted by Industry Leaders</h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              See what pharmaceutical and biotech companies have to say about TrialSage™
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <TestimonialCard
              quote="TrialSage reduced our IND preparation time by 65% and significantly improved the quality of our submissions."
              author="Dr. Sarah Johnson"
              role="VP of Regulatory Affairs"
              company="BioPharma Inc."
            />
            <TestimonialCard
              quote="The CSR Intelligence module helped us identify critical protocol design improvements that increased our Phase 2 success rates."
              author="Michael Chen"
              role="Clinical Development Director"
              company="Novaris Therapeutics"
            />
            <TestimonialCard
              quote="TrialSage's Document Vault transformed our regulatory document management with 21 CFR Part 11 compliance built-in."
              author="Jennifer Williams"
              role="Head of Quality Assurance"
              company="GeneTherapy Solutions"
            />
          </div>
        </div>
      </ContentSection>

      {/* CTA section */}
      <ContentSection className="bg-blue-600 py-16">
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
      </ContentSection>

      {/* Footer */}
      <Footer className="bg-gray-900 text-gray-400 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <h3 className="text-white font-semibold mb-4">TrialSage™ Platform</h3>
              <p className="text-sm">
                Advanced AI-powered SaaS platform revolutionizing clinical and pharmaceutical
                document workflows.
              </p>
              <div className="mt-4 flex gap-4">
                <a href="#" className="text-gray-400 hover:text-white">
                  <span className="sr-only">LinkedIn</span>
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M19,3H5C3.895,3,3,3.895,3,5v14c0,1.105,0.895,2,2,2h14c1.105,0,2-0.895,2-2V5C21,3.895,20.105,3,19,3z M9,17H6.477v-7H9 V17z M7.694,8.717c-0.771,0-1.286-0.514-1.286-1.2s0.514-1.2,1.371-1.2c0.771,0,1.286,0.514,1.286,1.2S8.551,8.717,7.694,8.717z M18,17h-2.442v-3.826c0-1.058-0.651-1.302-0.895-1.302s-1.058,0.163-1.058,1.302c0,0.163,0,3.826,0,3.826h-2.523v-7h2.523v0.977 C13.93,10.407,14.581,10,15.802,10C17.023,10,18,10.977,18,13.174V17z" />
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  <span className="sr-only">Twitter</span>
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M22,5.8a8.49,8.49,0,0,1-2.36.64,4.13,4.13,0,0,0,1.81-2.27,8.21,8.21,0,0,1-2.61,1,4.1,4.1,0,0,0-7,3.74A11.64,11.64,0,0,1,3.39,4.62a4.16,4.16,0,0,0-.55,2.07A4.09,4.09,0,0,0,4.66,10.1,4.05,4.05,0,0,1,2.8,9.59v.05a4.1,4.1,0,0,0,3.3,4A3.93,3.93,0,0,1,5,13.81a4.9,4.9,0,0,1-.77-.07,4.11,4.11,0,0,0,3.83,2.84A8.22,8.22,0,0,1,3,18.34a7.93,7.93,0,0,1-1-.06,11.57,11.57,0,0,0,6.29,1.85A11.59,11.59,0,0,0,20,8.45c0-.17,0-.35,0-.53A8.43,8.43,0,0,0,22,5.8Z" />
                  </svg>
                </a>
              </div>
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
      </Footer>
    </PageContainer>
  );
}
