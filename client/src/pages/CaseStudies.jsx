import React from 'react';
import { Link } from 'wouter';
import {
  ArrowRight, FileCheck, LayoutDashboard, FileText, Database, Sparkles, Clock, BarChart4, CheckCircle, Building2, CalendarRange, ArrowUpRight } from 'lucide-react'

// Case Studies page with authentic examples without naming specific clients
export default function CaseStudies() {
  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      {/* Soft gradient element at top */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-300 via-green-300 to-blue-300 z-50"></div>

      {/* Header section with title and intro */}
      <section className="relative bg-[#f7f7f7] border-b border-gray-200 overflow-hidden">
        {/* Soft gradient background elements */}
        <div className="absolute -top-32 -left-32 w-64 h-64 rounded-full bg-orange-100 opacity-30 blur-3xl"></div>
        <div className="absolute top-10 right-10 w-96 h-96 rounded-full bg-green-100 opacity-30 blur-3xl"></div>

        <div className="max-w-7xl mx-auto px-4 py-20 md:py-24 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl font-light text-[#003057] leading-tight mb-4">
              Client <span className="font-bold">Success Stories</span>
            </h1>

            <p className="text-lg text-[#444] mb-6">
              Real-world examples of how our solutions have transformed regulatory workflows and
              accelerated time-to-market.
            </p>

            <p className="text-sm text-[#666] italic">
              Note: Client names withheld due to confidentiality agreements. References available
              upon request.
            </p>
          </div>
        </div>
      </section>

      {/* Case Studies Grid */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8">
            {/* IND Wizard Case Study */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden transition hover:shadow-md">
              <div className="h-[80px] bg-gradient-to-r from-[#003057] to-[#004f9f] flex items-center p-6">
                <FileCheck className="h-7 w-7 text-white mr-3" />
                <h3 className="text-xl font-semibold text-white">IND Wizard™ Case Study</h3>
              </div>

              <div className="p-6">
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                      Industry
                    </div>
                    <div className="text-[#333] font-medium">Global Biopharmaceutical</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                      Timeline
                    </div>
                    <div className="text-[#333] font-medium">60 days to submission</div>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Challenge
                  </div>
                  <p className="text-sm text-[#444]">
                    A mid-sized biopharmaceutical company preparing their first IND submission for a
                    novel oncology treatment faced significant resource constraints with only a
                    small regulatory team. They needed to prepare a complete IND package in under 60
                    days to meet investor commitments.
                  </p>
                </div>

                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Solution
                  </div>
                  <p className="text-sm text-[#444]">
                    Using IND Wizard™, the company automated the creation of all five CTD modules.
                    The platform's AI analyzed their preclinical data, automatically formatted
                    according to FDA requirements, and generated compliant documentation. The
                    real-time compliance checking ensured all critical regulatory elements were
                    addressed.
                  </p>
                </div>

                <div className="mb-6">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Results
                  </div>
                  <ul className="space-y-2">
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Completed full IND submission in 42 days (30% faster than projected
                        timeline)
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Reduced resource requirements by 55%, allowing key personnel to focus on
                        scientific strategy
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        FDA accepted submission with zero regulatory deficiencies on first attempt
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Estimated $1.2M saved in consultant fees and operational costs
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="border-t border-gray-200 pt-5 text-sm italic text-[#666]">
                  "TrialSage IND Wizard fundamentally transformed our regulatory process. What would
                  have taken months with a team of consultants was completed in weeks with minimal
                  oversight." - VP of Regulatory Affairs
                </div>
              </div>
            </div>

            {/* CSR Intelligence Case Study */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden transition hover:shadow-md">
              <div className="h-[80px] bg-gradient-to-r from-[#003057] to-[#004f9f] flex items-center p-6">
                <LayoutDashboard className="h-7 w-7 text-white mr-3" />
                <h3 className="text-xl font-semibold text-white">CSR Intelligence™ Case Study</h3>
              </div>

              <div className="p-6">
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                      Industry
                    </div>
                    <div className="text-[#333] font-medium">Top 15 Pharmaceutical</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                      Timeline
                    </div>
                    <div className="text-[#333] font-medium">8-month implementation</div>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Challenge
                  </div>
                  <p className="text-sm text-[#444]">
                    A leading pharmaceutical company with a vast repository of over 450 clinical
                    study reports (CSRs) struggled to leverage historical data for new drug
                    development. Their medical writers spent an estimated 2,500 hours annually
                    searching through past CSRs to inform new protocol designs.
                  </p>
                </div>

                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Solution
                  </div>
                  <p className="text-sm text-[#444]">
                    CSR Intelligence™ digitized and structured the entire CSR repository,
                    extracting key data points and creating searchable, interactive dashboards. The
                    platform's AI identified patterns across therapeutic areas and automatically
                    generated comparative analyses of safety profiles, efficacy endpoints, and study
                    designs.
                  </p>
                </div>

                <div className="mb-6">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Results
                  </div>
                  <ul className="space-y-2">
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Reduced time spent searching previous CSRs by 87%, saving an estimated
                        2,100+ hours annually
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Identified critical protocol design improvements that resulted in 23% higher
                        patient retention in subsequent studies
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Accelerated study design and protocol development by 40% through automated
                        comparative analysis
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        ROI achieved within 8 months of implementation
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="border-t border-gray-200 pt-5 text-sm italic text-[#666]">
                  "The ability to instantly compare efficacy endpoints across our entire portfolio
                  of studies has revolutionized our approach to protocol design." - Director of
                  Clinical Operations
                </div>
              </div>
            </div>

            {/* Document Vault Case Study */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden transition hover:shadow-md">
              <div className="h-[80px] bg-gradient-to-r from-[#003057] to-[#004f9f] flex items-center p-6">
                <FileText className="h-7 w-7 text-white mr-3" />
                <h3 className="text-xl font-semibold text-white">Document Vault™ Case Study</h3>
              </div>

              <div className="p-6">
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                      Industry
                    </div>
                    <div className="text-[#333] font-medium">Biotech Company</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                      Timeline
                    </div>
                    <div className="text-[#333] font-medium">3-month implementation</div>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Challenge
                  </div>
                  <p className="text-sm text-[#444]">
                    A fast-growing biotech company preparing for their first NDA submission faced
                    document management challenges across multiple geographic sites and CROs.
                    Version control issues were causing delays, with document approvals taking an
                    average of 12 days due to manual tracking and disconnected systems.
                  </p>
                </div>

                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Solution
                  </div>
                  <p className="text-sm text-[#444]">
                    Document Vault™ provided a centralized, 21 CFR Part 11 compliant platform
                    integrating with their existing DocuShare system. The platform's AI-powered
                    version control and workflow automation enabled real-time collaboration with
                    built-in approval tracking and security controls tailored to their
                    organizational structure.
                  </p>
                </div>

                <div className="mb-6">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Results
                  </div>
                  <ul className="space-y-2">
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Reduced document approval cycles from 12 days to 3.5 days
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Achieved 100% audit readiness with comprehensive audit trails and electronic
                        signatures
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Eliminated document version conflicts through automated controls, saving an
                        estimated 230 hours of rework
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Successfully completed NDA submission 45 days ahead of schedule
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="border-t border-gray-200 pt-5 text-sm italic text-[#666]">
                  "The drag-and-drop interface and intelligent version control made our regulatory
                  submission process virtually seamless. Our regulatory team couldn't imagine
                  working without it now." - Head of Regulatory Operations
                </div>
              </div>
            </div>

            {/* Analytics Case Study */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden transition hover:shadow-md">
              <div className="h-[80px] bg-gradient-to-r from-[#003057] to-[#004f9f] flex items-center p-6">
                <BarChart4 className="h-7 w-7 text-white mr-3" />
                <h3 className="text-xl font-semibold text-white">Analytics Dashboard Case Study</h3>
              </div>

              <div className="p-6">
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                      Industry
                    </div>
                    <div className="text-[#333] font-medium">Large Pharmaceutical</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                      Timeline
                    </div>
                    <div className="text-[#333] font-medium">12-month deployment</div>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Challenge
                  </div>
                  <p className="text-sm text-[#444]">
                    A large pharmaceutical company's regulatory, clinical, and safety departments
                    operated in siloed environments with limited cross-functional visibility.
                    Executive decision-making was hindered by delayed reporting and inconsistent
                    KPIs across therapeutic areas, requiring 2-3 weeks to compile comprehensive
                    reports.
                  </p>
                </div>

                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Solution
                  </div>
                  <p className="text-sm text-[#444]">
                    The Analytics Dashboard platform integrated data from multiple sources including
                    their CTMS, regulatory submission system, and safety database. Twenty-five
                    specialized dashboards were deployed across departments with role-based access
                    controls and the AI copilot feature providing natural language querying
                    capabilities.
                  </p>
                </div>

                <div className="mb-6">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Results
                  </div>
                  <ul className="space-y-2">
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Reduced reporting time from 2-3 weeks to real-time access with dynamic
                        filtering
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Improved regulatory filing timeline accuracy by 68% through predictive
                        analytics
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Identified $4.6M in potential cost savings through cross-program efficiency
                        analysis
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Executive decision-making accelerated by 70% with unified cross-functional
                        metrics
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="border-t border-gray-200 pt-5 text-sm italic text-[#666]">
                  "Finally, a single source of truth for our entire regulatory operations. The AI
                  copilot allows even non-technical executives to get answers immediately." - Senior
                  VP of Regulatory Affairs
                </div>
              </div>
            </div>

            {/* CMC Blueprint Case Study */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden transition hover:shadow-md">
              <div className="h-[80px] bg-gradient-to-r from-[#003057] to-[#004f9f] flex items-center p-6">
                <Building2 className="h-7 w-7 text-white mr-3" />
                <h3 className="text-xl font-semibold text-white">CMC Blueprint™ Case Study</h3>
              </div>

              <div className="p-6">
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                      Industry
                    </div>
                    <div className="text-[#333] font-medium">Contract Development Organization</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                      Timeline
                    </div>
                    <div className="text-[#333] font-medium">6-week implementation</div>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Challenge
                  </div>
                  <p className="text-sm text-[#444]">
                    A CDMO supporting multiple emerging biotechs struggled with CMC documentation
                    for novel modalities. Their templates didn't adequately address the unique
                    requirements of mRNA therapies and cell-based products, resulting in significant
                    quality review cycles and documentation rework.
                  </p>
                </div>

                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Solution
                  </div>
                  <p className="text-sm text-[#444]">
                    CMC Blueprint™ provided modality-specific document generation with embedded
                    regulatory guidance. The platform's knowledge base incorporated the latest CMC
                    precedents from approved products and regulatory expectations, with AI-driven
                    content recommendations to ensure coverage of critical quality attributes.
                  </p>
                </div>

                <div className="mb-6">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Results
                  </div>
                  <ul className="space-y-2">
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Reduced CMC document preparation time from 8 weeks to 3 weeks per submission
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Decreased quality review cycles by 65% through enhanced template compliance
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Successfully deployed for 7 different therapeutic modalities with
                        consistently high quality
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Zero CMC-related information requests from FDA for submissions using the
                        platform
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="border-t border-gray-200 pt-5 text-sm italic text-[#666]">
                  "CMC Blueprint has transformed how we approach regulatory documentation for novel
                  modalities. The AI-powered platform ensures we address exactly what regulators
                  expect to see." - CMC Director
                </div>
              </div>
            </div>

            {/* Ask Lumen Case Study */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden transition hover:shadow-md">
              <div className="h-[80px] bg-gradient-to-r from-[#003057] to-[#004f9f] flex items-center p-6">
                <Sparkles className="h-7 w-7 text-white mr-3" />
                <h3 className="text-xl font-semibold text-white">Ask Lumen™ Case Study</h3>
              </div>

              <div className="p-6">
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                      Industry
                    </div>
                    <div className="text-[#333] font-medium">Global Life Sciences</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                      Timeline
                    </div>
                    <div className="text-[#333] font-medium">4-week onboarding</div>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Challenge
                  </div>
                  <p className="text-sm text-[#444]">
                    A global life sciences organization with operations in 18 countries faced
                    regulatory compliance challenges due to constantly evolving guidelines across
                    multiple jurisdictions. Their regulatory team spent an average of 22 hours per
                    week researching current requirements and precedents to ensure submission
                    compliance.
                  </p>
                </div>

                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Solution
                  </div>
                  <p className="text-sm text-[#444]">
                    Ask Lumen™ was deployed as a digital compliance coach, providing the team with
                    instant access to regulatory intelligence across FDA, EMA, PMDA, and other
                    authorities. The multimodal analysis capabilities allowed team members to upload
                    documents for real-time compliance assessment and guidance.
                  </p>
                </div>

                <div className="mb-6">
                  <div className="text-xs uppercase tracking-wider text-[#0078d4] font-semibold mb-1">
                    Results
                  </div>
                  <ul className="space-y-2">
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Reduced regulatory research time by 82%, freeing up approximately 18 hours
                        per person weekly
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Achieved 96% accuracy in regulatory guidance when benchmarked against expert
                        human reviewers
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Accelerated response time to regulatory authority queries from 5 days to
                        less than 1 day
                      </span>
                    </li>
                    <li className="flex items-start text-sm">
                      <CheckCircle className="h-4 w-4 text-[#0078d4] mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-[#444]">
                        Scaled regulatory knowledge across global teams, reducing consultant
                        dependency by 70%
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="border-t border-gray-200 pt-5 text-sm italic text-[#666]">
                  "Ask Lumen doesn't just answer regulatory questions - it proactively identifies
                  compliance gaps and recommends solutions we wouldn't have considered. It's
                  transformed our global team's capabilities." - Global Head of Regulatory Affairs
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Request a Custom Case Study Section */}
      <section className="bg-[#f7f7f7] py-16 border-t border-gray-200">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-light text-[#003057] mb-3">
            Ready to Achieve Similar Results?
          </h2>
          <p className="text-[#444] max-w-3xl mx-auto mb-8">
            Our team can provide additional case studies specific to your industry and use case,
            along with custom demos tailored to your organization's needs.
          </p>

          <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
            <Link to="/team-signup">
              <button className="w-full sm:w-auto bg-[#0078d4] hover:bg-[#005fa6] text-white px-6 py-3 text-[14px] font-medium transition flex items-center justify-center shadow-sm">
                Request Custom Demo
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </Link>

            <Link to="/ind-wizard">
              <button className="w-full sm:w-auto bg-white hover:bg-gray-50 text-[#0078d4] border border-[#0078d4] px-6 py-3 text-[14px] font-medium transition flex items-center justify-center">
                Explore Solutions
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer with copyright */}
      <footer className="bg-white py-8 border-t border-gray-200 text-center text-sm text-[#666]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-3">
            <span className="text-base font-bold text-[#003057]">CONCEPT2CURE.AI</span>
            <span className="text-xs text-[#666] ml-2">TrialSage™ Platform</span>
          </div>
          © {new Date().getFullYear()} Concept2Cure.AI. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
