import React, { useState, useEffect } from 'react';
import { BarChart2, PlayCircle, ChevronRight, Users, ClipboardCheck, FileText, Building, TrendingUp } from 'lucide-react'

// Define button component for hero section
const HeroButton = ({ children, variant = 'primary', to, onClick, className = '' }) => {
  const baseClasses =
    'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm md:text-base font-medium transition focus:outline-none';
  const classes = {
    primary:
      'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow focus:ring-2 focus:ring-emerald-400',
    ghost:
      'bg-white dark:bg-slate-900/20 border border-emerald-600 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-900/50',
  }[variant];

  return (
    <a href={to} onClick={onClick} className={`${baseClasses} ${classes} ${className}`}>
      {children}
    </a>
  );
};

// Define persona tabs
const PersonaTab = ({ icon: Icon, label, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
        isActive
          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
      }`}
    >
      <Icon size={16} />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
};

// Main component
const HeroWithPersonas = ({ t }) => {
  // Define personas with their corresponding messaging
  const personas = [
    {
      id: 'executive',
      label: t('Executive'),
      icon: Building,
      headline: t('From Concepts to Cures — in Half the Time'),
      subhead: t(
        'TrialSage automates regulatory writing, submission assembly, and ESG delivery across FDA, EMA, PMDA, and more. Cut costs. Launch faster. Stay compliant.'
      ),
      cta: [
        {
          label: t('Calculate Your ROI'),
          to: '/roi-calculator',
          variant: 'primary',
          icon: BarChart2,
        },
        { label: t('Request a Strategic Demo'), to: '/demo', variant: 'ghost', icon: ChevronRight },
      ],
      statLabel: t('Average time savings'),
      statValue: '47%',
    },
    {
      id: 'regulatory',
      label: t('Regulatory'),
      icon: FileText,
      headline: t('Let the Assistant Draft Your IND While You Sleep'),
      subhead: t(
        'Generate Module 2 summaries, CERs, and CSRs in hours — not weeks. Track reviews, collect e-signatures, and stay always audit-ready.'
      ),
      cta: [
        {
          label: t('Try AI-Powered Drafting'),
          to: '/assistant',
          variant: 'primary',
          icon: PlayCircle,
        },
        {
          label: t('View Document Workflow'),
          to: '/workflow',
          variant: 'ghost',
          icon: ChevronRight,
        },
      ],
      statLabel: t('Documents processed'),
      statValue: '3,250+',
    },
    {
      id: 'clinical',
      label: t('Clinical Ops'),
      icon: Users,
      headline: t('Faster Documents, Smoother Approvals, Fewer Vendors'),
      subhead: t(
        'TrialSage centralizes protocol authoring, team reviews, and submission packaging into one platform — no handoffs, no delays.'
      ),
      cta: [
        { label: t('Launch a New Study'), to: '/new-study', variant: 'primary', icon: PlayCircle },
        {
          label: t('Schedule a CRO Replacement Briefing'),
          to: '/cro-demo',
          variant: 'ghost',
          icon: ChevronRight,
        },
      ],
      statLabel: t('Fewer vendor handoffs'),
      statValue: '92%',
    },
    {
      id: 'compliance',
      label: t('Compliance'),
      icon: ClipboardCheck,
      headline: t('Audit Trails Built for Inspectors. Not Just Checklists.'),
      subhead: t(
        'Secure, time-stamped logs. Immutable signatures. GxP-ready workflows. 21 CFR Part 11 compliance — built in from day one.'
      ),
      cta: [
        {
          label: t('Explore Our Validation Package'),
          to: '/validation',
          variant: 'primary',
          icon: ChevronRight,
        },
        {
          label: t('See Audit Tools in Action'),
          to: '/audit-demo',
          variant: 'ghost',
          icon: ChevronRight,
        },
      ],
      statLabel: t('FDA compliance score'),
      statValue: '98.7%',
    },
    {
      id: 'investor',
      label: t('Investor'),
      icon: TrendingUp,
      headline: t('AI for Biotech That Actually Moves the Needle'),
      subhead: t(
        'TrialSage automates the painful parts of development — INDs, CERs, CSRs — so your pipeline gets to patients sooner.'
      ),
      cta: [
        {
          label: t('Read How We Reduced Submission Time 78%'),
          to: '/case-studies',
          variant: 'primary',
          icon: ChevronRight,
        },
        { label: t('Explore the Platform'), to: '/platform', variant: 'ghost', icon: PlayCircle },
      ],
      statLabel: t('Avg market acceleration'),
      statValue: '7.3 mo',
    },
  ];

  // Default to executive persona
  const [activePersona, setActivePersona] = useState('executive');

  // Auto-rotate through personas every 8 seconds if no interaction
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    if (!autoRotate) return;

    const interval = setInterval(() => {
      setActivePersona(current => {
        const currentIndex = personas.findIndex(p => p.id === current);
        const nextIndex = (currentIndex + 1) % personas.length;
        return personas[nextIndex].id;
      });
    }, 8000);

    return () => clearInterval(interval);
  }, [autoRotate, personas.length]);

  const handlePersonaChange = personaId => {
    setAutoRotate(false);
    setActivePersona(personaId);
  };

  // Get current persona data
  const currentPersona = personas.find(p => p.id === activePersona);

  return (
    <header className="pt-16 pb-12 bg-gradient-to-br from-emerald-50 via-white to-sky-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden opacity-10">
        <div className="absolute -right-5 top-1/4 w-72 h-72 bg-emerald-500 rounded-full filter blur-3xl"></div>
        <div className="absolute -left-10 bottom-1/4 w-72 h-72 bg-sky-500 rounded-full filter blur-3xl"></div>
      </div>

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        {/* Persona selector */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {personas.map(persona => (
            <PersonaTab
              key={persona.id}
              icon={persona.icon}
              label={persona.label}
              isActive={activePersona === persona.id}
              onClick={() => handlePersonaChange(persona.id)}
            />
          ))}
        </div>

        <div className="grid md:grid-cols-5 gap-8 items-center">
          {/* Left content - 3 columns */}
          <div className="md:col-span-3 text-center md:text-left">
            <div className="inline-block px-3 py-1 mb-4 rounded-full border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm font-medium">
              {t('Trusted by 100+ Global Pharmaceutical Companies')}
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-6 leading-tight">
              <span className="text-emerald-700 dark:text-emerald-400">
                {currentPersona.headline}
              </span>
            </h1>

            <p className="text-lg mb-8 text-gray-700 dark:text-gray-300 leading-relaxed max-w-xl">
              {currentPersona.subhead}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 md:justify-start justify-center mb-8">
              {currentPersona.cta.map((button, index) => (
                <HeroButton
                  key={index}
                  to={button.to}
                  variant={button.variant}
                  className="text-base"
                >
                  {button.icon && <button.icon size={20} />} {button.label}
                </HeroButton>
              ))}
            </div>

            {/* Stat highlight */}
            <div className="inline-block rounded-lg border border-emerald-100 dark:border-emerald-900/50 p-3 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm">
              <div className="flex items-end gap-3">
                <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {currentPersona.statValue}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 pb-1">
                  {currentPersona.statLabel}
                </div>
              </div>
            </div>
          </div>

          {/* Right content - ROI Calculator Preview - 2 columns */}
          <div className="md:col-span-2">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-500/20 to-sky-500/20 blur-lg"></div>
              <div className="relative bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-gray-200 dark:border-slate-700 rounded-xl p-4 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded-md bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-bold text-xs">
                      T
                    </div>
                    <span className="font-semibold text-sm">TrialSage Platform</span>
                  </div>
                </div>

                <div className="space-y-3 mb-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-100 dark:bg-slate-700/50 p-2 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Annual Submissions
                      </div>
                      <div className="text-base font-semibold">12</div>
                    </div>
                    <div className="bg-gray-100 dark:bg-slate-700/50 p-2 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Avg. Cost per Sub.
                      </div>
                      <div className="text-base font-semibold">$175,000</div>
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 mb-3">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-sm font-medium">Annual Savings</div>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      $840,000
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: '40%' }}
                    ></div>
                  </div>
                  <div className="text-xs text-right mt-1 text-gray-500 dark:text-gray-400">
                    40% efficiency gain
                  </div>
                </div>

                <div className="flex flex-col space-y-2">
                  <div className="flex items-center text-sm">
                    <svg
                      className="w-4 h-4 text-emerald-500 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Reduced submission time: 14 → 8 weeks
                  </div>
                  <div className="flex items-center text-sm">
                    <svg
                      className="w-4 h-4 text-emerald-500 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    27% fewer FDA information requests
                  </div>
                  <div className="flex items-center text-sm">
                    <svg
                      className="w-4 h-4 text-emerald-500 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    98.7% document processing accuracy
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default HeroWithPersonas;
