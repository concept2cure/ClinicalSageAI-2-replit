import { useRef } from 'react';
import { Link } from 'wouter';
import { motion, useInView } from 'framer-motion';
import {
  FileCheck,
  FileText,
  PenTool,
  FlaskConical,
  ShieldCheck,
  Users,
  ArrowRight,
  Check,
  ChevronRight,
  Zap,
  Star,
  Lock,
} from 'lucide-react';

/* ─────────────────────────── helpers ─────────────────────────── */

function useAnimateIn(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: threshold });
  return { ref, inView };
}

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.25, 0.4, 0.25, 1] },
  }),
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: (i: number = 0) => ({
    opacity: 1,
    transition: { duration: 0.5, delay: i * 0.08 },
  }),
};

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

/* ─────────────────────────── section wrapper ─────────────────── */

function Section({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`relative px-4 sm:px-6 lg:px-8 ${className}`}>
      <div className="mx-auto max-w-7xl">{children}</div>
    </section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function Hero() {
  return (
    <Section className="relative overflow-hidden pt-28 pb-24 sm:pt-36 sm:pb-32 lg:pt-44 lg:pb-40">
      {/* animated gradient orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(217,119,87,0.12) 0%, rgba(217,119,87,0) 70%)',
          }}
          animate={{ scale: [1, 1.15, 1], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-24 -left-32 h-[500px] w-[500px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(16,185,129,0.10) 0%, rgba(16,185,129,0) 70%)',
          }}
          animate={{ scale: [1, 1.1, 1], x: [0, -20, 0], y: [0, 15, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/3 left-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, rgba(139,92,246,0) 70%)',
          }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="text-center">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={0}
          className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200/60 bg-indigo-50/60 px-4 py-1.5 text-sm font-medium text-indigo-700 backdrop-blur-sm"
        >
          <Zap className="h-3.5 w-3.5" />
          Now Generally Available
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={1}
          className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl xl:text-7xl"
        >
          AI-Powered{' '}
          <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">
            Regulatory Intelligence
          </span>
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={2}
          className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl"
        >
          Collapse your regulatory submission timeline from{' '}
          <span className="font-semibold text-slate-800">14 months to 6</span>. Concept2Cure
          automates 510(k)&nbsp;eSTAR, eCTD authoring, CMC documentation, and clinical evaluation —
          so your team can focus on science, not paperwork.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={3}
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Link href="/concept2cure/signup">
            <span className="group inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-600/30">
              Start Free Trial
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
          <button
            onClick={() => scrollTo('pricing')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-7 py-3.5 text-base font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50"
          >
            View Pricing
            <ChevronRight className="h-4 w-4" />
          </button>
        </motion.div>
      </div>
    </Section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━ SOCIAL PROOF BAR ━━━━━━━━━━━━━━━━━━━━ */

function SocialProof() {
  const { ref, inView } = useAnimateIn();
  const logos = ['Pfizer', 'Roche', 'Novartis', 'Genentech', 'Moderna', 'BioNTech'];

  return (
    <Section className="py-16 sm:py-20">
      <motion.div
        ref={ref}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        variants={fadeIn}
        className="text-center"
      >
        <p className="text-sm font-medium uppercase tracking-widest text-slate-400">
          Trusted by leading life sciences companies
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-12 gap-y-6 sm:gap-x-16">
          {logos.map((name, i) => (
            <motion.span
              key={name}
              variants={fadeIn}
              custom={i}
              className="text-xl font-bold tracking-tight text-slate-300 transition-colors hover:text-slate-400 sm:text-2xl"
            >
              {name}
            </motion.span>
          ))}
        </div>
      </motion.div>
    </Section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━ FEATURES GRID ━━━━━━━━━━━━━━━━━━━━━━ */

const features = [
  {
    icon: FileCheck,
    title: '510(k) eSTAR Automation',
    description:
      'Auto-generate compliant eSTAR packages with AI-driven field mapping, predicate matching, and risk-based analysis.',
  },
  {
    icon: FileText,
    title: 'Clinical Evaluation Reports',
    description:
      'Produce MEDDEV 2.7/1 Rev 4 compliant CERs with automated literature search, appraisal, and analysis.',
  },
  {
    icon: PenTool,
    title: 'eCTD Co-Authoring',
    description:
      'Collaboratively author Module 2–5 eCTD submissions with AI suggestions, cross-references, and real-time validation.',
  },
  {
    icon: FlaskConical,
    title: 'CMC Document Generation',
    description:
      'Generate Module 3 CMC documentation including drug substance, drug product, and analytical method sections.',
  },
  {
    icon: ShieldCheck,
    title: 'AI-Powered Risk Analysis',
    description:
      'Identify submission risks before they become FDA deficiencies. Predictive analytics trained on 50,000+ past reviews.',
  },
  {
    icon: Users,
    title: 'Real-time Collaboration',
    description:
      'Multi-stakeholder review workflows with audit trails, role-based access, and 21\u00A0CFR Part\u00A011 compliant e-signatures.',
  },
];

function Features() {
  const { ref, inView } = useAnimateIn();

  return (
    <Section className="py-20 sm:py-28">
      <motion.div ref={ref} initial="hidden" animate={inView ? 'visible' : 'hidden'}>
        <motion.div variants={fadeUp} custom={0} className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">
            Platform
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need to file faster
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500">
            One platform replaces dozens of disconnected tools, consultants, and spreadsheets across
            your regulatory operations.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              custom={i + 1}
              className="group relative rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md"
            >
              <div className="mb-5 inline-flex rounded-xl bg-indigo-50 p-3 text-indigo-600 transition-colors group-hover:bg-indigo-100">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </Section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━ HOW IT WORKS ━━━━━━━━━━━━━━━━━━━━━━━ */

const steps = [
  {
    num: '01',
    title: 'Upload your data',
    description:
      'Import existing documents, device descriptions, clinical data, and prior submissions. Our AI understands 120+ document formats.',
  },
  {
    num: '02',
    title: 'AI drafts your submission',
    description:
      'Concept2Cure generates compliant regulatory documents, identifies predicate devices, maps requirements, and flags gaps — in minutes, not months.',
  },
  {
    num: '03',
    title: 'Review, sign & submit',
    description:
      'Your team reviews AI-generated content, applies electronic signatures, and exports submission-ready packages in eCTD or eSTAR format.',
  },
];

function HowItWorks() {
  const { ref, inView } = useAnimateIn();

  return (
    <Section className="py-20 sm:py-28 bg-slate-50/60">
      <motion.div ref={ref} initial="hidden" animate={inView ? 'visible' : 'hidden'}>
        <motion.div variants={fadeUp} custom={0} className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">
            How It Works
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Three steps to your next submission
          </h2>
        </motion.div>

        <div className="relative mt-16 grid gap-12 lg:grid-cols-3 lg:gap-8">
          {/* connecting line (desktop only) */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-14 left-[16.5%] right-[16.5%] hidden h-px bg-gradient-to-r from-indigo-200 via-indigo-300 to-indigo-200 lg:block"
          />

          {steps.map((s, i) => (
            <motion.div
              key={s.num}
              variants={fadeUp}
              custom={i + 1}
              className="relative text-center"
            >
              <div className="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-lg font-bold text-white shadow-lg shadow-indigo-600/20">
                {s.num}
              </div>
              <h3 className="mt-6 text-xl font-semibold text-slate-900">{s.title}</h3>
              <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-slate-500">
                {s.description}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </Section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━ PRICING ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const plans = [
  {
    name: 'Starter',
    audience: 'For virtual biotechs & startups',
    price: '$1,500',
    period: '/mo',
    popular: false,
    features: [
      'Up to 5 team members',
      '510(k) eSTAR automation',
      'AI document drafting (50 docs/mo)',
      'Predicate device search',
      'Standard support',
      'SOC 2 compliant infrastructure',
    ],
  },
  {
    name: 'Professional',
    audience: 'For growing regulatory teams',
    price: '$3,000',
    period: '/mo',
    popular: true,
    features: [
      'Up to 25 team members',
      'Everything in Starter, plus:',
      'eCTD co-authoring & export',
      'Clinical Evaluation Reports',
      'CMC document generation',
      'AI risk analysis & gap detection',
      'Priority support & onboarding',
      '21 CFR Part 11 e-signatures',
    ],
  },
  {
    name: 'Enterprise',
    audience: 'For pharma & large biotechs',
    price: 'Custom',
    period: '',
    popular: false,
    features: [
      'Unlimited team members',
      'Everything in Professional, plus:',
      'Dedicated success manager',
      'Custom AI model training',
      'SSO & SAML integration',
      'On-premise deployment option',
      'SLA-backed uptime guarantee',
      'Regulatory consulting hours',
    ],
  },
];

function Pricing() {
  const { ref, inView } = useAnimateIn();

  return (
    <Section id="pricing" className="py-20 sm:py-28">
      <motion.div ref={ref} initial="hidden" animate={inView ? 'visible' : 'hidden'}>
        <motion.div variants={fadeUp} custom={0} className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Pricing</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Plans that scale with your pipeline
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-500">
            Start small. Scale as you grow. Every plan includes a 14-day free trial with no credit
            card required.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {plans.map((plan, i) => {
            const isPopular = plan.popular;
            return (
              <motion.div
                key={plan.name}
                variants={fadeUp}
                custom={i + 1}
                className={`relative flex flex-col rounded-2xl border p-8 shadow-sm transition-shadow hover:shadow-md ${
                  isPopular ? 'border-indigo-600 ring-1 ring-indigo-600' : 'border-slate-200'
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold text-white">
                    <Star className="h-3 w-3" /> Most Popular
                  </span>
                )}

                <div>
                  <h3 className="text-xl font-semibold text-slate-900">{plan.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{plan.audience}</p>
                </div>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-slate-900">
                    {plan.price}
                  </span>
                  {plan.period && <span className="text-base text-slate-500">{plan.period}</span>}
                </div>

                <ul className="mt-8 flex-1 space-y-3">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-3 text-sm text-slate-600">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  {plan.name === 'Enterprise' ? (
                    <Link href="/concept2cure/signup">
                      <span className="block w-full rounded-xl border border-slate-300 bg-white py-3 text-center text-sm font-semibold text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-50">
                        Contact Sales
                      </span>
                    </Link>
                  ) : (
                    <Link href="/concept2cure/signup">
                      <span
                        className={`block w-full rounded-xl py-3 text-center text-sm font-semibold transition-all ${
                          isPopular
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        Start Free Trial
                      </span>
                    </Link>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </Section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━ TESTIMONIALS ━━━━━━━━━━━━━━━━━━━━━━━━ */

const testimonials = [
  {
    quote:
      'Concept2Cure cut our 510(k) preparation time from 11 months to under 4. The AI-generated eSTAR package was 95% ready on first pass — our RA team just reviewed and signed.',
    name: 'Dr. Sarah Chen',
    title: 'VP Regulatory Affairs',
    company: 'Apex MedTech',
  },
  {
    quote:
      'We used to spend $400K on regulatory consultants for every submission. With Concept2Cure, our in-house team handles it end-to-end. The ROI was clear within the first quarter.',
    name: 'James Hartley',
    title: 'Chief Operating Officer',
    company: 'Vanta Therapeutics',
  },
  {
    quote:
      'The eCTD co-authoring feature is a game-changer. Real-time collaboration with AI suggestions means our Module 2 summaries practically write themselves. FDA accepted on first review.',
    name: 'Dr. Priya Anand',
    title: 'Director of CMC',
    company: 'NovaCell Biologics',
  },
];

function Testimonials() {
  const { ref, inView } = useAnimateIn();

  return (
    <Section className="py-20 sm:py-28 bg-slate-50/60">
      <motion.div ref={ref} initial="hidden" animate={inView ? 'visible' : 'hidden'}>
        <motion.div variants={fadeUp} custom={0} className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">
            Testimonials
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Loved by regulatory teams
          </h2>
        </motion.div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.figure
              key={t.name}
              variants={fadeUp}
              custom={i + 1}
              className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm"
            >
              <div className="flex gap-1 text-amber-400">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-slate-600">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-4 border-t border-slate-100 pt-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                  {t.name
                    .split(' ')
                    .map(w => w[0])
                    .join('')}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500">
                    {t.title}, {t.company}
                  </p>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </motion.div>
    </Section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━ FINAL CTA ━━━━━━━━━━━━━━━━━━━━━━━ */

function FinalCTA() {
  const { ref, inView } = useAnimateIn();

  return (
    <Section className="py-20 sm:py-28">
      <motion.div
        ref={ref}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        variants={fadeUp}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 px-8 py-16 text-center shadow-2xl sm:px-16 sm:py-20"
      >
        {/* decorative shapes */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-white/10"
        />

        <h2 className="relative text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Ready to accelerate your submissions?
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg text-indigo-100">
          Join hundreds of regulatory teams who have cut their submission timelines in half. Start
          your 14-day free trial today.
        </p>
        <div className="relative mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/concept2cure/signup">
            <span className="group inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-indigo-700 shadow-lg transition-all hover:bg-indigo-50">
              Start Free Trial
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
          <button
            onClick={() => scrollTo('pricing')}
            className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-8 py-3.5 text-base font-semibold text-white transition-all hover:bg-white/10"
          >
            Compare Plans
          </button>
        </div>
      </motion.div>
    </Section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━ FOOTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function Footer() {
  const linkClass = 'text-sm text-slate-500 transition-colors hover:text-slate-700';
  const headingClass = 'text-xs font-semibold uppercase tracking-widest text-slate-400';

  return (
    <footer className="border-t border-slate-200/60 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {/* brand */}
          <div className="lg:col-span-1">
            <span className="text-xl font-bold tracking-tight text-slate-900">Concept2Cure</span>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              AI-powered regulatory intelligence for life sciences. A Concept2Cure product by
              ClinicalSageAI.
            </p>
            <div className="mt-6 flex items-center gap-3">
              {[
                { label: 'FDA 21 CFR Part 11', icon: ShieldCheck },
                { label: 'SOC 2', icon: Lock },
                { label: 'HIPAA', icon: ShieldCheck },
              ].map(b => (
                <span
                  key={b.label}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  <b.icon className="h-3 w-3" />
                  {b.label}
                </span>
              ))}
            </div>
          </div>

          {/* product */}
          <div>
            <h4 className={headingClass}>Product</h4>
            <ul className="mt-4 space-y-3">
              {[
                ['510(k) Automation', '#'],
                ['eCTD Authoring', '#'],
                ['CER Generation', '#'],
                ['Risk Analysis', '#'],
                ['Pricing', '#pricing'],
              ].map(([label, href]) => (
                <li key={label}>
                  {href.startsWith('#') ? (
                    <button onClick={() => scrollTo(href.slice(1))} className={linkClass}>
                      {label}
                    </button>
                  ) : (
                    <a href={href} className={linkClass}>
                      {label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* company */}
          <div>
            <h4 className={headingClass}>Company</h4>
            <ul className="mt-4 space-y-3">
              {([
                ['About', '/about'],
                ['Careers', '/careers'],
                ['Blog', '/blog'],
                ['Contact', '/contact'],
                ['Partners', '/partners'],
              ] as const).map(([label, path]) => (
                <li key={label}>
                  <a href={path} className={linkClass}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* legal */}
          <div>
            <h4 className={headingClass}>Legal</h4>
            <ul className="mt-4 space-y-3">
              {([
                ['Privacy Policy', '/legal/privacy'],
                ['Terms of Service', '/legal/terms'],
                ['Security', '/legal/security'],
                ['HIPAA Compliance', '/legal/hipaa'],
                ['Data Processing Agreement', '/legal/data-processing'],
              ] as const).map(([label, path]) => (
                <li key={label}>
                  <a href={path} className={linkClass}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-slate-200/60 pt-8 sm:flex-row">
          <p className="text-sm text-slate-400">
            &copy; {new Date().getFullYear()} ClinicalSageAI, Inc. All rights reserved.
          </p>
          <p className="text-xs text-slate-400">
            Concept2Cure&trade; is a registered trademark of ClinicalSageAI, Inc.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━ NAV BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function NavBar() {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 z-50 w-full border-b border-slate-200/60 bg-white/80 backdrop-blur-lg"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/">
          <span className="text-xl font-bold tracking-tight text-slate-900">
            Concept<span className="text-indigo-600">2Cure</span>
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {['Features', 'How It Works', 'Pricing', 'Testimonials'].map(label => {
            const id = label.toLowerCase().replace(/\s+/g, '-');
            return (
              <button
                key={label}
                onClick={() => {
                  const sectionId =
                    id === 'features'
                      ? 'features'
                      : id === 'how-it-works'
                      ? 'how-it-works'
                      : id === 'testimonials'
                      ? 'testimonials'
                      : id;
                  scrollTo(sectionId);
                }}
                className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <Link href="/concept2cure/login">
            <span className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">
              Sign In
            </span>
          </Link>
          <Link href="/concept2cure/signup">
            <span className="hidden rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-indigo-700 sm:inline-flex">
              Get Started
            </span>
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━ PAGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default function SalesLandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <NavBar />
      <main>
        <Hero />
        <SocialProof />
        <div id="features">
          <Features />
        </div>
        <div id="how-it-works">
          <HowItWorks />
        </div>
        <Pricing />
        <div id="testimonials">
          <Testimonials />
        </div>
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
