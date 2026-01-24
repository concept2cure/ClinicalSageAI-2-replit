import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { Separator } from '@/components/ui/separator';
import { Link } from 'wouter';

export default function ImprovedLandingPage() {
  return (
    <div className="font-sans text-gray-800 bg-white">
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-gray-200 shadow-sm py-3 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center px-4">
          <div className="flex items-center space-x-2 mb-2 md:mb-0">
            <Link to="/">
              <div className="flex items-center space-x-2">
                <img
                  src="/assets/trialsage-logo.svg"
                  alt="TrialSage"
                  className="h-10 w-auto"
                  onError={e => {
                    e.target.onerror = null;
                    e.target.src = 'https://placeholder.pics/svg/180x60/DEDEDE/555555/TrialSage';
                  }}
                />
                <span className="text-sm text-gray-500">by Concept2Cures.AI</span>
              </div>
            </Link>
          </div>

          <div className="flex flex-wrap items-center space-x-1 md:space-x-2">
            <Link to="/ind-architect">
              <Button
                variant="ghost"
                className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
              >
                IND Architect™
              </Button>
            </Link>
            <Link to="/csr-intelligence">
              <Button
                variant="ghost"
                className="text-green-600 hover:text-green-800 hover:bg-green-50"
              >
                CSR Oracle™
              </Button>
            </Link>
            <Link to="/solutions">
              <Button
                variant="ghost"
                className="text-purple-600 hover:text-purple-800 hover:bg-purple-50"
              >
                SmartDocs™
              </Button>
            </Link>
            <Link to="/solutions">
              <Button
                variant="ghost"
                className="text-gray-600 hover:text-gray-800 hover:bg-gray-50"
              >
                InsightVault™
              </Button>
            </Link>
            <Link to="/walkthroughs">
              <Button
                variant="ghost"
                className="text-amber-600 hover:text-amber-800 hover:bg-amber-50"
              >
                Walkthroughs
              </Button>
            </Link>
            <Link to="/portal">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">Client Portal</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section with Vision Statement */}
      <section className="bg-gradient-to-r from-blue-50 to-indigo-50 py-16">
        <Container className="text-center px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-4 text-gray-900 leading-tight">
            The Clinical Intelligence System
            <br />
            That Thinks Like a Biotech Founder
          </h1>
          <p className="text-xl text-gray-700 max-w-4xl mx-auto mb-8">
            TrialSage is a real-time, AI-powered platform that automates the parts of clinical and
            regulatory development that don't need to be manual anymore—and enhances the parts that
            do, with precision insight and smart, embedded copilots.
          </p>
          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <Link to="/persona/regops">
              <Button
                size="lg"
                className="bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md hover:shadow-lg px-6"
              >
                See 6‑Month IND Demo
              </Button>
            </Link>
            <Link to="/walkthroughs">
              <Button
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md hover:shadow-lg px-6"
              >
                Video Walkthroughs
              </Button>
            </Link>
            <Link to="/persona/founder">
              <Button
                size="lg"
                variant="outline"
                className="border-blue-500 text-blue-600 hover:bg-blue-50 shadow-md px-6"
              >
                Calculate ROI
              </Button>
            </Link>
          </div>

          <div className="mt-12 text-center">
            <p className="text-gray-500 font-medium mb-3">TRUSTED BY BIOTECH INNOVATORS</p>
            <div className="flex flex-wrap justify-center gap-8 opacity-70">
              {/* Placeholder for client logos */}
              <div className="h-12 w-32 bg-gray-200 rounded-md"></div>
              <div className="h-12 w-32 bg-gray-200 rounded-md"></div>
              <div className="h-12 w-32 bg-gray-200 rounded-md"></div>
              <div className="h-12 w-32 bg-gray-200 rounded-md"></div>
            </div>
          </div>
        </Container>
      </section>

      {/* What We're Changing Section */}
      <section className="py-16 bg-white">
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-gray-900">What We're Changing</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Today's model is failing you. We're rebuilding clinical and regulatory data systems
              from the ground up.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="bg-white border border-red-100 shadow-md">
              <CardContent className="pt-6">
                <div className="text-red-500 text-xl mb-3 font-bold">❌ Today's Reality</div>
                <ul className="space-y-3 text-gray-700">
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>CSRs are massive PDFs nobody reads in time</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>CERs are manually rebuilt every cycle</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>INDs take 12 months and $1M in consulting</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Protocol design is guesswork, not data</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Every tool is a silo. Every submission is a war room</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-white border border-amber-100 shadow-md">
              <CardContent className="pt-6">
                <div className="text-amber-600 text-xl mb-3 font-bold">🔄 Our Approach</div>
                <ul className="space-y-3 text-gray-700">
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>One unified system – not plugins or bolt-ons</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Role-based copilots + explainable AI models</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Built by biotech founders + AI experts</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Every workflow is actionable, explainable, and auditable</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Strategic: Aligned to your trial, risk profile, and success</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-white border border-green-100 shadow-md">
              <CardContent className="pt-6">
                <div className="text-green-600 text-xl mb-3 font-bold">✅ Your Results</div>
                <ul className="space-y-3 text-gray-700">
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Save $250K+ in external consulting & medical writing</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Reduce submission prep time by 60%</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Cut document revision cycles by 90%</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Identify trial risk signals 4–8 weeks earlier</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Eliminate fragmented vendor costs (5 platforms → 1)</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </Container>
      </section>

      <Separator className="border-gray-200" />

      {/* CSR Oracle Counter Intelligence Spotlight */}
      <section className="py-20 bg-gradient-to-r from-green-50 to-emerald-100">
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block bg-green-100 rounded-full px-4 py-1 text-green-800 text-sm font-medium mb-4">
                POWERED BY THOUSANDS OF CSRs
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-gray-900">
                CSR Oracle™: Clinical Counter-Intelligence Engine
              </h2>
              <p className="text-lg text-gray-700 mb-6">
                Turn static 500-page reports into dynamic, searchable intelligence. Our platform has
                processed and learned from
                <span className="font-bold text-green-700"> 4,000+ CSRs</span> across diverse
                therapeutic areas, giving you unprecedented comparative insights.
              </p>

              <div className="bg-white rounded-xl shadow-md p-6 mb-8 border border-green-200">
                <h3 className="text-xl font-bold text-green-700 mb-4">Ask Questions Like:</h3>
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <span className="mr-2 text-green-500 font-bold">→</span>
                    <span className="text-gray-800">
                      "Show all Phase II oncology trials with &gt;60% efficacy in patients over 65"
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2 text-green-500 font-bold">→</span>
                    <span className="text-gray-800">
                      "Compare adverse events across all TNF inhibitors in our database"
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2 text-green-500 font-bold">→</span>
                    <span className="text-gray-800">
                      "Find all studies where a specific AE exceeded 5% in treatment groups"
                    </span>
                  </li>
                </ul>
              </div>

              <Link to="/csr-intelligence">
                <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white px-6">
                  Explore the CSR Oracle
                </Button>
              </Link>
            </div>

            <div className="relative">
              <div className="absolute -top-5 -left-5 bg-white rounded-full shadow-lg w-32 h-32 flex flex-col items-center justify-center z-10 border-4 border-green-100">
                <div className="text-3xl font-bold text-green-600">4,000+</div>
                <div className="text-sm text-gray-600">CSRs Analyzed</div>
              </div>

              <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-green-200">
                <div className="bg-green-600 text-white py-3 px-4 text-lg font-medium">
                  CSR Intelligence Dashboard
                </div>
                <div className="p-4">
                  <img
                    src="/assets/csr-dashboard.svg"
                    alt="CSR Dashboard"
                    className="rounded-lg w-full h-64 object-cover bg-gray-100"
                    onError={e => {
                      e.target.onerror = null;
                      e.target.src =
                        'https://placeholder.pics/svg/600x400/EAFAF1/34D399/CSR%20Intelligence%20Dashboard';
                    }}
                  />
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="text-sm text-gray-500">Safety Signals</div>
                      <div className="text-2xl font-bold text-green-600">17</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="text-sm text-gray-500">Efficacy</div>
                      <div className="text-2xl font-bold text-blue-600">73%</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="text-sm text-gray-500">Protocol Matches</div>
                      <div className="text-2xl font-bold text-purple-600">12</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Core Systems Section */}
      <section className="py-16 bg-white">
        <Container>
          <h2 className="text-3xl font-bold text-center mb-14 text-gray-900">
            The Core Systems That Power TrialSage
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                name: 'IND Architect™',
                subtitle: 'Build an IND in ⅓ the time—with zero guesswork',
                color: 'bg-blue-600',
                textColor: 'text-blue-600',
                borderColor: 'border-blue-200',
                icon: '/assets/icons/architect.svg',
                features: [
                  'FDA, EMA, PMDA ready',
                  'Auto-generate Modules 1–5',
                  'AI-guided summaries',
                  'Prebuilt compliance rules',
                  'Direct FDA ESG submission',
                ],
              },
              {
                name: 'CSR Oracle™',
                subtitle: 'Turn 500-page reports into live intelligence',
                color: 'bg-green-600',
                textColor: 'text-green-600',
                borderColor: 'border-green-200',
                icon: '/assets/icons/oracle.svg',
                features: [
                  'Structured JSON from any CSR',
                  'Compare trials by AE, MoA',
                  'Natural language queries',
                  'Safety signal monitoring',
                  'Auto-summarize content',
                ],
              },
              {
                name: 'SmartDocs™',
                subtitle: 'CERs, protocols—drafted in hours, not weeks',
                color: 'bg-purple-600',
                textColor: 'text-purple-600',
                borderColor: 'border-purple-200',
                icon: '/assets/icons/docs.svg',
                features: [
                  'Auto-generate CERs',
                  'Extract evidence instantly',
                  'GSPR rationale completion',
                  'Write-ready narratives',
                  'Full reference traceability',
                ],
              },
              {
                name: 'InsightVault™',
                subtitle: 'A DMS that understands your trial',
                color: 'bg-gray-700',
                textColor: 'text-gray-700',
                borderColor: 'border-gray-200',
                icon: '/assets/icons/vault.svg',
                features: [
                  'Full version control',
                  'Smart tagging systems',
                  'Risk visualization',
                  'AI audit checks',
                  '21 CFR Part 11 compliant',
                ],
              },
            ].map((mod, idx) => (
              <Link
                to={`/persona/${
                  idx === 0 ? 'regops' : idx === 1 ? 'clinops' : idx === 2 ? 'writer' : 'founder'
                }`}
                key={idx}
              >
                <Card
                  className={`bg-white shadow-md hover:shadow-lg transition-all h-full border ${mod.borderColor}`}
                >
                  <CardContent className="pt-6">
                    <div className="mb-4 flex items-center">
                      <div
                        className={`${mod.color} w-10 h-10 rounded-full flex items-center justify-center mr-3`}
                      >
                        <img src={mod.icon} alt="" className="w-5 h-5 text-white" />
                      </div>
                      <h3 className={`text-xl font-bold ${mod.textColor}`}>{mod.name}</h3>
                    </div>
                    <p className="text-gray-600 italic mb-4">{mod.subtitle}</p>
                    <ul className="text-gray-700 space-y-2">
                      {mod.features.map((feature, i) => (
                        <li key={i} className="flex items-start text-sm">
                          <span className={`mr-2 ${mod.textColor}`}>•</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <div
                        className={`${mod.textColor} text-sm flex items-center cursor-pointer font-medium`}
                      >
                        <span>Explore {mod.name}</span>
                        <span className="ml-1">→</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* ROI Section */}
      <section className="py-16 bg-white">
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3 text-gray-900">Real ROI Metrics</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Here's how we compare to traditional approaches in biotech regulatory and clinical
              operations
            </p>
          </div>

          <div className="overflow-hidden shadow-md rounded-xl mb-8 border border-gray-200">
            <div className="grid grid-cols-4 text-center bg-blue-600 text-white py-3 font-semibold">
              <div>Metric</div>
              <div>Traditional</div>
              <div>With TrialSage</div>
              <div>Improvement</div>
            </div>
            {[
              ['IND Prep Time', '14 mo', '5–7 mo', '50–64%'],
              ['Protocol Revisions', '2.3/study', '0.9/study', '61%'],
              ['Query Response', '8–12 d', '24–48 h', '↑83%'],
              ['Publishing Cost', '$54K', '$17.5K', '↓68%'],
            ].map((row, idx) => (
              <div
                key={idx}
                className={`grid grid-cols-4 text-center py-4 ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
              >
                <div className="text-gray-800 font-medium">{row[0]}</div>
                <div className="text-gray-600">{row[1]}</div>
                <div className="text-green-600 font-medium">{row[2]}</div>
                <div className="text-green-600 font-bold">{row[3]}</div>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link to="/persona/founder">
              <Button
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg px-6"
              >
                Calculate Your Specific ROI
              </Button>
            </Link>
          </div>
        </Container>
      </section>

      {/* Role-Based Selling - Persona Experience Section */}
      <section className="py-16 bg-gradient-to-r from-indigo-50 to-blue-50">
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-gray-900">Tailored for Your Role</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              TrialSage delivers specialized experiences for every stakeholder in the clinical
              development process
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 mb-12">
            <div className="bg-white shadow-md rounded-xl overflow-hidden border border-blue-200">
              <div className="grid grid-cols-1 md:grid-cols-3">
                <div className="bg-blue-600 text-white p-8 md:p-12 flex flex-col justify-center">
                  <h3 className="text-2xl font-bold mb-4">Regulatory Affairs</h3>
                  <p className="text-lg opacity-90">
                    Streamline submissions, automate documentation, and maintain perfect compliance
                  </p>
                  <Link to="/persona/regops" className="mt-6 inline-block">
                    <Button className="bg-white text-blue-700 hover:bg-blue-50">
                      View Regulatory Experience
                    </Button>
                  </Link>
                </div>
                <div className="col-span-2 p-8">
                  <div className="font-medium text-gray-500 mb-3">KEY BENEFITS</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start">
                      <div className="bg-blue-100 rounded-full p-1 mr-3 mt-1">
                        <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">FDA/EMA/PMDA Compliance</div>
                        <p className="text-sm text-gray-600">
                          Automatic validation against latest regulatory standards
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className="bg-blue-100 rounded-full p-1 mr-3 mt-1">
                        <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Automatic eCTD Publishing</div>
                        <p className="text-sm text-gray-600">
                          Create submission-ready packages in a fraction of the time
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className="bg-blue-100 rounded-full p-1 mr-3 mt-1">
                        <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">21 CFR Part 11 Verified</div>
                        <p className="text-sm text-gray-600">
                          Complete audit trails and electronic signature integration
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className="bg-blue-100 rounded-full p-1 mr-3 mt-1">
                        <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Insights Dashboard</div>
                        <p className="text-sm text-gray-600">
                          Monitor submission readiness across all modules
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-gray-100 pt-6">
                    <div className="font-medium text-gray-500 mb-3">TESTIMONIAL</div>
                    <blockquote className="text-gray-700 italic">
                      "We completed our IND in under 5 months using TrialSage—with a team half the
                      size we budgeted for. The automated validation alone saved us weeks of review
                      time."
                    </blockquote>
                    <div className="mt-2 text-sm text-gray-600">
                      — VP Regulatory Affairs, Emerging Biotech
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                role: 'Clinical Operations',
                benefit: 'Real-time study risk and protocol benchmarking',
                color: 'bg-green-600',
                borderColor: 'border-green-200',
                linkTo: '/persona/clinops',
                features: [
                  'Real-time safety signal detection',
                  'Protocol optimization with CSR data',
                  'Site performance analytics',
                  'Cross-study comparisons',
                ],
              },
              {
                role: 'Medical Writing',
                benefit: 'Automated narratives and evidence extraction',
                color: 'bg-purple-600',
                borderColor: 'border-purple-200',
                linkTo: '/persona/writer',
                features: [
                  'AI-generated CER sections',
                  'Automatic evidence synthesis',
                  'Citation and reference management',
                  'Multi-source data extraction',
                ],
              },
              {
                role: 'Executive/Investor',
                benefit: 'Strategic insights and portfolio optimization',
                color: 'bg-amber-600',
                borderColor: 'border-amber-200',
                linkTo: '/persona/founder',
                features: [
                  'Submission timeline acceleration',
                  'Portfolio risk monitoring',
                  'Development cost predictions',
                  'Competitive intelligence',
                ],
              },
            ].map((persona, idx) => (
              <Link to={persona.linkTo} key={idx}>
                <Card
                  className={`bg-white shadow-md hover:shadow-lg transition-all h-full border ${persona.borderColor} cursor-pointer`}
                >
                  <CardContent className="pt-6">
                    <div className={`${persona.color} w-12 h-1 mb-4`}></div>
                    <h3 className="font-bold text-xl mb-2 text-gray-800">{persona.role}</h3>
                    <p className="text-gray-600 mb-4">{persona.benefit}</p>

                    <ul className="space-y-2">
                      {persona.features.map((feature, i) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start">
                          <span className="mr-2 text-gray-400">•</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-5 text-sm font-medium" style={{ color: persona.color }}>
                      See {persona.role} Experience →
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <Container className="text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Redefine Clinical Development?
          </h2>
          <p className="text-xl mb-8 max-w-3xl mx-auto">
            TrialSage is how tomorrow's biotech gets built: faster, safer, smarter. If you're tired
            of waiting on consultants, wrangling PDFs, or crossing your fingers at submission— this
            is your moment.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/persona/clinops">
              <Button
                size="lg"
                className="bg-white text-blue-600 hover:bg-gray-100 shadow-md hover:shadow-lg px-8"
              >
                Book Your Strategy Demo
              </Button>
            </Link>
            <Link to="/walkthroughs">
              <Button
                size="lg"
                className="bg-blue-700 bg-opacity-50 text-white hover:bg-opacity-70 shadow-md px-8"
              >
                See Video Walkthroughs
              </Button>
            </Link>
          </div>
        </Container>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-white font-medium mb-4">TrialSage</h3>
              <p className="text-sm">
                The Clinical Intelligence System that thinks like a biotech founder.
              </p>
              <p className="text-sm mt-4">© {new Date().getFullYear()} Concept2Cures.AI</p>
            </div>
            <div>
              <h3 className="text-white font-medium mb-4">Solutions</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/ind-architect">IND Architect™</Link>
                </li>
                <li>
                  <Link to="/csr-intelligence">CSR Oracle™</Link>
                </li>
                <li>
                  <Link to="/solutions">SmartDocs™</Link>
                </li>
                <li>
                  <Link to="/solutions">InsightVault™</Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-medium mb-4">Resources</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/walkthroughs">Video Walkthroughs</Link>
                </li>
                <li>
                  <Link to="/persona/founder">ROI Calculator</Link>
                </li>
                <li>
                  <Link to="/persona/clinops">Strategy Demo</Link>
                </li>
                <li>
                  <Link to="/investor-assets">Investor Assets</Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-medium mb-4">Legal</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/">Privacy Policy</Link>
                </li>
                <li>
                  <Link to="/">Terms of Service</Link>
                </li>
                <li>
                  <Link to="/">Security</Link>
                </li>
                <li>
                  <Link to="/">Compliance</Link>
                </li>
              </ul>
            </div>
          </div>
        </Container>
      </footer>
    </div>
  );
}
