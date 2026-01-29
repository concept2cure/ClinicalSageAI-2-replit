import React from 'react';
import { Link } from 'wouter';

// This landing page uses NO external dependencies to ensure it always works
// Enterprise-grade UI inspired by premium SaaS platforms like Certara, Veeva, and IQVIA

export default function PremiumEnterpriseLanding() {
  // Section data defined directly inside the component to avoid any external dependencies
  const solutions = [
    {
      title: 'IND Wizard™',
      description:
        'Accelerate FDA submissions with AI-guided IND preparation that reduces submission time by 60%.',
      icon: () => (
        <svg
          className="w-12 h-12 text-slate-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          ></path>
        </svg>
      ),
      link: '/ind/wizard',
      gradient: 'from-slate-50 to-slate-100',
      buttonClass: 'bg-slate-900 hover:bg-slate-800',
    },
    {
      title: 'CSR Intelligence™',
      description:
        'Extract actionable insights from 3,217+ clinical study reports to optimize your trial design.',
      icon: () => (
        <svg
          className="w-12 h-12 text-slate-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
          ></path>
        </svg>
      ),
      link: '/csr-intelligence',
      gradient: 'from-slate-50 to-slate-100',
      buttonClass: 'bg-slate-900 hover:bg-slate-800',
    },
    {
      title: 'Clinical Metadata Repository',
      description:
        'Centralize and standardize your clinical study metadata with our advanced CMDR platform.',
      icon: () => (
        <svg
          className="w-12 h-12 text-slate-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
          ></path>
        </svg>
      ),
      link: '/metadata',
      gradient: 'from-slate-50 to-slate-100',
      buttonClass: 'bg-slate-900 hover:bg-slate-800',
    },
    {
      title: 'Protocol Optimizer',
      description:
        'Design better protocols with AI-driven insights from historical trial data and predictive analytics.',
      icon: () => (
        <svg
          className="w-12 h-12 text-slate-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
          ></path>
        </svg>
      ),
      link: '/protocol-review',
      gradient: 'from-slate-50 to-slate-100',
      buttonClass: 'bg-slate-900 hover:bg-slate-800',
    },
  ];

  const features = [
    {
      title: 'ICH Wiz™ Digital Compliance Coach',
      description:
        'Global guidance alignment with ICH E6(R3), FDA, EMA, PMDA and NMPA requirements.',
      icon: () => (
        <div className="rounded-full bg-slate-100 p-3 inline-flex items-center justify-center">
          <svg
            className="w-7 h-7 text-slate-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            ></path>
          </svg>
        </div>
      ),
    },
    {
      title: 'Vault™ Workspace',
      description:
        'Secure document management with enterprise-grade version control and eTMF capabilities.',
      icon: () => (
        <div className="rounded-full bg-slate-100 p-3 inline-flex items-center justify-center">
          <svg
            className="w-7 h-7 text-slate-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            ></path>
          </svg>
        </div>
      ),
    },
    {
      title: 'Study Architect™',
      description:
        'AI-driven protocol design with Monte Carlo simulation capabilities for statistical optimization.',
      icon: () => (
        <div className="rounded-full bg-slate-100 p-3 inline-flex items-center justify-center">
          <svg
            className="w-7 h-7 text-slate-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            ></path>
          </svg>
        </div>
      ),
    },
    {
      title: 'ECTD Builder',
      description:
        'Streamlined assembly and validation of submission-ready electronic Common Technical Documents.',
      icon: () => (
        <div className="rounded-full bg-slate-100 p-3 inline-flex items-center justify-center">
          <svg
            className="w-7 h-7 text-slate-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            ></path>
          </svg>
        </div>
      ),
    },
  ];

  const metrics = [
    { value: '67%', label: 'Reduction in preparation time', color: 'bg-slate-900' },
    { value: '98%', label: 'First-time acceptance rate', color: 'bg-slate-900' },
    { value: '3,217+', label: 'Clinical study reports analyzed', color: 'bg-slate-900' },
    { value: '140+', label: 'Regulatory authorities supported', color: 'bg-slate-900' },
  ];

  const testimonials = [
    {
      quote:
        'TrialSage has revolutionized our regulatory submission process. What used to take months now takes weeks.',
      author: 'Clinical Operations Director',
      company: 'Top 10 Pharma Company',
    },
    {
      quote:
        'The CSR Intelligence module helped us identify critical patterns across historical studies that shaped our Phase III protocol.',
      author: 'VP of Regulatory Affairs',
      company: 'Leading Biotech Firm',
    },
  ];

  return (
    <div className="min-h-screen font-sans">
      {/* Premium sticky header bar */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-slate-200/60 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <span className="text-2xl font-bold text-slate-900">
                  TrialSage™
                </span>
              </Link>

              <nav className="hidden md:ml-10 md:flex md:space-x-8">
                <Link
                  href="/solutions"
                  className="text-base font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Solutions
                </Link>
                <Link
                  href="/csr-intelligence"
                  className="text-base font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  CSR Intelligence
                </Link>
                <Link
                  href="/metadata"
                  className="text-base font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Metadata Repository
                </Link>
                <Link
                  href="/protocol-review"
                  className="text-base font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Protocol Optimizer
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/concept2cure/login"
                className="hidden md:inline-flex rounded-md shadow-sm font-medium px-4 py-2 text-sm bg-white/80 border border-slate-200/70 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/builder"
                className="inline-flex items-center rounded-md shadow-sm font-medium px-4 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800 transition-colors"
              >
                Start Building
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-white">
        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-medium text-sm mb-6">
              The Clinical Intelligence Platform
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-6 lg:mb-8 text-slate-900">
              Transforming Regulatory Intelligence for Life Sciences
            </h1>

            <p className="text-xl md:text-2xl text-slate-600 mb-8 md:mb-10 max-w-3xl mx-auto">
              TrialSage™ delivers intelligent regulatory solutions that reduce submission times by
              up to 67% with AI-powered document creation and validation.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/ind/wizard"
                className="px-6 py-3 rounded-md bg-slate-900 text-white hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all font-medium flex items-center space-x-2"
              >
                <span>Start IND Wizard</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  ></path>
                </svg>
              </Link>
              <Link
                href="/solutions"
                className="px-6 py-3 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-md transition-all font-medium"
              >
                Explore Solutions
              </Link>
            </div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-16 max-w-5xl mx-auto">
            {metrics.map((metric, i) => (
              <div
                key={i}
                className="bg-white/80 rounded-xl shadow-sm border border-slate-200/70 p-6 text-center transform transition hover:scale-105 hover:shadow-lg"
              >
                <div className={`${metric.color} w-12 h-1 mx-auto mb-4 rounded-full`}></div>
                <h3 className="text-3xl font-bold text-slate-900 mb-2">{metric.value}</h3>
                <p className="text-slate-600">{metric.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solutions Section */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-slate-900">
              Comprehensive Regulatory Solutions
            </h2>
            <p className="text-xl text-slate-600">
              Our AI-powered platform streamlines every aspect of your regulatory workflow with
              intelligent, evidence-driven guidance.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
            {solutions.map((solution, i) => (
              <div
                key={i}
                className={`bg-gradient-to-b ${solution.gradient} rounded-xl shadow-sm border border-slate-200/70 overflow-hidden transform transition hover:shadow-lg`}
              >
                <div className="p-6">
                  <div className="mb-5">{solution.icon()}</div>
                  <h3 className="text-xl font-bold mb-3 text-slate-900">{solution.title}</h3>
                  <p className="text-slate-700 mb-6">{solution.description}</p>
                  <Link
                    to={solution.link}
                    className={`${solution.buttonClass} inline-flex items-center text-white rounded-md px-4 py-2 text-sm font-medium shadow-sm`}
                  >
                    <span>Learn More</span>
                    <svg
                      className="ml-2 w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 5l7 7-7 7"
                      ></path>
                    </svg>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 sm:py-20 bg-slate-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-slate-900">
              Advanced Platform Capabilities
            </h2>
            <p className="text-xl text-slate-600">
              Our comprehensive suite of tools provides end-to-end support for your clinical
              development lifecycle.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {features.map((feature, i) => (
              <div key={i} className="bg-white/80 rounded-xl shadow-sm border border-slate-200/70 p-6 flex items-start space-x-5">
                {feature.icon()}
                <div>
                  <h3 className="text-xl font-bold mb-2 text-slate-900">{feature.title}</h3>
                  <p className="text-slate-700">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-slate-900">
              Trusted by Industry Leaders
            </h2>
            <p className="text-xl text-slate-600">
              See why top pharmaceutical and biotech companies choose TrialSage.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {testimonials.map((testimonial, i) => (
              <div key={i} className="bg-slate-50/70 rounded-xl shadow-sm border border-slate-200/70 p-8">
                <svg
                  className="w-10 h-10 text-slate-300 mb-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                </svg>
                <p className="text-lg text-slate-800 mb-6 font-medium italic">
                  "{testimonial.quote}"
                </p>
                <div>
                  <p className="font-bold text-slate-900">{testimonial.author}</p>
                  <p className="text-slate-600">{testimonial.company}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-20 bg-slate-900 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              Ready to Transform Your Regulatory Process?
            </h2>
            <p className="text-xl opacity-90 mb-8 max-w-3xl mx-auto">
              Join over 140 leading life sciences organizations that have accelerated their
              regulatory submissions and gained valuable insights.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/ind/wizard"
                className="px-6 py-3 rounded-md bg-white text-slate-900 hover:bg-slate-100 shadow-lg font-medium"
              >
                Start Your Journey
              </Link>
              <Link
                href="/demo-request"
                className="px-6 py-3 rounded-md bg-slate-800 text-white border border-white/20 hover:bg-slate-700 font-medium"
              >
                Request Demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <h3 className="text-xl font-bold mb-4">TrialSage™</h3>
              <p className="text-slate-400 mb-4">
                Transforming regulatory intelligence for life sciences with AI-powered solutions.
              </p>
              <p className="text-slate-400">© 2025 Concept2Cure.AI. All rights reserved.</p>
            </div>

            <div>
              <h4 className="text-lg font-semibold mb-4">Solutions</h4>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/ind/wizard"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    IND Wizard™
                  </Link>
                </li>
                <li>
                  <Link
                    href="/csr-intelligence"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    CSR Intelligence™
                  </Link>
                </li>
                <li>
                  <Link
                    href="/metadata"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Metadata Repository
                  </Link>
                </li>
                <li>
                  <Link
                    href="/protocol-review"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Protocol Optimizer
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-lg font-semibold mb-4">Company</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/about" className="text-slate-400 hover:text-white transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <Link
                    href="/case-studies"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Case Studies
                  </Link>
                </li>
                <li>
                  <Link href="/blog" className="text-slate-400 hover:text-white transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contact"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Contact
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-lg font-semibold mb-4">Legal</h4>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/privacy"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-slate-400 hover:text-white transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link
                    href="/cookies"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Cookie Policy
                  </Link>
                </li>
                <li>
                  <Link href="/gdpr" className="text-slate-400 hover:text-white transition-colors">
                    GDPR Compliance
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </footer>

      <style jsx>{`
        .bg-grid-pattern {
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }
      `}</style>
    </div>
  );
}
