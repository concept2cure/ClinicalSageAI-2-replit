import React from 'react';
import { User } from 'lucide-react';

// Testimonial Component with improved styling
const Testimonial = ({
  quote,
  name,
  title,
  avatarBackground = 'bg-emerald-100',
  avatarTextColor = 'text-emerald-700',
  starsColor = 'text-emerald-500',
}) => (
  <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md h-full flex flex-col">
    <div className="flex mb-4 text-sm sm:text-base">
      {[...Array(5)].map((_, i) => (
        <svg
          key={i}
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`mr-1 ${starsColor}`}
        >
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ))}
    </div>

    <p className="text-gray-700 dark:text-gray-300 mb-6 flex-grow text-sm sm:text-base leading-relaxed italic">
      "{quote}"
    </p>

    <div className="flex items-center mt-auto">
      <div
        className={`w-12 h-12 rounded-full ${avatarBackground} dark:bg-opacity-30 flex items-center justify-center ${avatarTextColor} dark:text-opacity-80`}
      >
        <User size={20} />
      </div>
      <div className="ml-3">
        <div className="font-medium">{name}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">{title}</div>
      </div>
    </div>
  </div>
);

// Stat Card Component
const StatCard = ({ value, label, description, valueColor = 'text-emerald-600' }) => (
  <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md h-full flex flex-col">
    <div className={`text-3xl sm:text-4xl font-bold ${valueColor} dark:text-opacity-90 mb-2`}>
      {value}
    </div>
    <div className="text-lg font-medium mb-2">{label}</div>
    <p className="text-sm text-gray-600 dark:text-gray-400 mt-auto">{description}</p>
  </div>
);

// Company Logo Placeholder with improved animation
const LogoPlaceholder = () => (
  <div className="h-12 flex items-center justify-center">
    <div className="w-32 h-8 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-slate-700 dark:to-slate-600 rounded-md relative overflow-hidden">
      <div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer"
        style={{ backgroundSize: '200% 100%', animation: 'shimmer 2s infinite' }}
      ></div>
    </div>
  </div>
);

// Main Customer Validation Component
const CustomerValidation = ({ t }) => {
  const testimonials = [
    {
      quote: t(
        'Concept2Cure has transformed how we approach regulatory submissions. The AI-driven IND module saved us 6 weeks on our last submission, and the CSR intelligence gives us insights we never had before.'
      ),
      name: 'Sarah Johnson',
      title: t('VP Regulatory Affairs, BioAdvance'),
      avatarBackground: 'bg-emerald-100',
      avatarTextColor: 'text-emerald-700',
      starsColor: 'text-emerald-500',
    },
    {
      quote: t(
        'As a CRO managing hundreds of trials, the Concept2Cure platform helps us deliver superior value to sponsors. Their AI-powered CSR analytics has become our secret weapon for designing better protocols.'
      ),
      name: 'Michael Chen',
      title: t('Clinical Operations Director, GlobalTrials'),
      avatarBackground: 'bg-sky-100',
      avatarTextColor: 'text-sky-700',
      starsColor: 'text-sky-500',
    },
    {
      quote: t(
        'The CER Generator has completely transformed our MDR compliance workflow. What used to take 3-4 weeks now takes days, and the reports are more comprehensive than our manually created ones.'
      ),
      name: 'Elena Rodriguez',
      title: t('Medical Director, EuroMed Devices'),
      avatarBackground: 'bg-purple-100',
      avatarTextColor: 'text-purple-700',
      starsColor: 'text-purple-500',
    },
  ];

  const stats = [
    {
      value: '38%',
      label: t('Faster Submissions'),
      description: t(
        'Average time savings on regulatory submissions with our AI-assisted workflows.'
      ),
      valueColor: 'text-emerald-600',
    },
    {
      value: '98.7%',
      label: t('Document Accuracy'),
      description: t(
        'Validated document processing accuracy across thousands of clinical documents.'
      ),
      valueColor: 'text-sky-600',
    },
    {
      value: '3,250+',
      label: t('Clinical Documents'),
      description: t('Structured CSRs and clinical documents in our intelligence platform.'),
      valueColor: 'text-purple-600',
    },
    {
      value: '42%',
      label: t('ROI Improvement'),
      description: t('Average return on investment improvement reported by enterprise customers.'),
      valueColor: 'text-amber-600',
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-gradient-to-b from-white to-gray-50 dark:from-slate-900 dark:to-slate-800/90">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            {t('Trusted by Industry Leaders')}
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            {t(
              'Concept2Cure is the trusted clinical intelligence platform for pharmaceutical companies, biotechs, and CROs worldwide.'
            )}
          </p>
        </div>

        {/* Client Logos */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 items-center justify-items-center mb-16 opacity-80">
          {Array(6)
            .fill(0)
            .map((_, i) => (
              <LogoPlaceholder key={i} />
            ))}
        </div>

        {/* Testimonials */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 mt-12">
          {testimonials.map((testimonial, index) => (
            <Testimonial
              key={index}
              quote={testimonial.quote}
              name={testimonial.name}
              title={testimonial.title}
              avatarBackground={testimonial.avatarBackground}
              avatarTextColor={testimonial.avatarTextColor}
              starsColor={testimonial.starsColor}
            />
          ))}
        </div>

        {/* Validation Metrics */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {stats.map((stat, index) => (
            <StatCard
              key={index}
              value={stat.value}
              label={stat.label}
              description={stat.description}
              valueColor={stat.valueColor}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default CustomerValidation;
