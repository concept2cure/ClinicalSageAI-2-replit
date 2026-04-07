import React, { useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, FileText, Brain, Beaker, BarChart2, Users, Shield } from 'lucide-react';

// Use Case Card Component
const UseCaseCard = ({
  icon: Icon,
  title,
  category,
  industry,
  description,
  link,
  bgColor = 'bg-emerald-100',
  textColor = 'text-emerald-500',
  tagBg = 'bg-emerald-100',
  tagText = 'text-emerald-700',
}) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-md h-full flex flex-col transition-transform duration-300 hover:translate-y-[-4px] hover:shadow-lg">
    <div className={`h-48 ${bgColor} dark:bg-opacity-20 flex items-center justify-center`}>
      <Icon size={48} className={textColor} />
    </div>
    <div className="p-6 flex flex-col flex-grow">
      <div className="flex justify-between items-center mb-4">
        <span
          className={`px-3 py-1 ${tagBg} dark:bg-opacity-30 ${tagText} dark:text-opacity-90 rounded-full text-xs font-medium`}
        >
          {category}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">{industry}</span>
      </div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-gray-600 dark:text-gray-400 mb-4 flex-grow text-sm leading-relaxed">
        {description}
      </p>
      <Link
        to={link}
        className={`${textColor} font-medium hover:underline flex items-center gap-1 mt-auto`}
      >
        Read Case Study <ArrowRight size={16} />
      </Link>
    </div>
  </div>
);

// Category Button Component
const CategoryButton = ({ label, isActive, onClick, color = 'emerald' }) => {
  const baseClasses =
    'px-4 py-2 rounded-full font-medium transition-colors duration-200 text-sm whitespace-nowrap';

  const activeClasses = {
    emerald: 'bg-emerald-600 text-white',
    sky: 'bg-sky-600 text-white',
    purple: 'bg-purple-600 text-white',
    amber: 'bg-amber-600 text-white',
    rose: 'bg-rose-600 text-white',
  };

  const inactiveClasses = {
    emerald:
      'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/20',
    sky: 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-sky-100 dark:hover:bg-sky-900/20',
    purple:
      'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-purple-100 dark:hover:bg-purple-900/20',
    amber:
      'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-amber-100 dark:hover:bg-amber-900/20',
    rose: 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-rose-100 dark:hover:bg-rose-900/20',
  };

  return (
    <button
      className={`${baseClasses} ${isActive ? activeClasses[color] : inactiveClasses[color]}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

// Main Use Case Library Component
const UseCaseLibrary = ({ t }) => {
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = [
    { id: 'all', label: t('All Use Cases'), color: 'emerald' },
    { id: 'regulatory', label: t('Regulatory Affairs'), color: 'rose' },
    { id: 'clinical', label: t('Clinical Development'), color: 'purple' },
    { id: 'medical', label: t('Medical Affairs'), color: 'sky' },
    { id: 'cro', label: t('CRO Solutions'), color: 'amber' },
  ];

  const useCases = [
    {
      id: 1,
      title: t('Accelerating IND Submissions'),
      category: 'regulatory',
      categoryLabel: t('Regulatory Affairs'),
      industry: t('Phase 3 • Oncology'),
      description: t(
        'How a mid-size biotech automated their IND submission process and cut preparation time by 40%.'
      ),
      link: '/cases/ind-automation',
      icon: FileText,
      bgColor: 'bg-rose-100',
      textColor: 'text-rose-500',
      tagBg: 'bg-rose-100',
      tagText: 'text-rose-700',
    },
    {
      id: 2,
      title: t('Streamlining EU MDR Compliance'),
      category: 'medical',
      categoryLabel: t('Medical Affairs'),
      industry: t('Medical Devices • EU'),
      description: t(
        'How a medical device company automated CER generation for 12 product lines and achieved 100% MDR compliance.'
      ),
      link: '/cases/mdr-compliance',
      icon: Brain,
      bgColor: 'bg-sky-100',
      textColor: 'text-sky-500',
      tagBg: 'bg-sky-100',
      tagText: 'text-sky-700',
    },
    {
      id: 3,
      title: t('Optimizing Protocol Design'),
      category: 'clinical',
      categoryLabel: t('Clinical Development'),
      industry: t('Phase 2 • CNS'),
      description: t(
        'How a CNS-focused biotech leveraged CSR intelligence to optimize their Phase 2 trial design and improve endpoint selection.'
      ),
      link: '/cases/protocol-optimization',
      icon: Beaker,
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-500',
      tagBg: 'bg-purple-100',
      tagText: 'text-purple-700',
    },
    {
      id: 4,
      title: t('Scaling Trial Operations'),
      category: 'cro',
      categoryLabel: t('CRO Solutions'),
      industry: t('Global • Multi-therapeutic'),
      description: t(
        'How a leading CRO used Concept2Cure to scale operations across 200+ trials while maintaining consistent quality and compliance.'
      ),
      link: '/cases/cro-scaling',
      icon: BarChart2,
      bgColor: 'bg-amber-100',
      textColor: 'text-amber-500',
      tagBg: 'bg-amber-100',
      tagText: 'text-amber-700',
    },
    {
      id: 5,
      title: t('Collaborative Trial Management'),
      category: 'cro',
      categoryLabel: t('CRO Solutions'),
      industry: t('Multi-sponsor • Phase 1-3'),
      description: t(
        "How a mid-size CRO implemented Concept2Cure's collaboration tools to streamline communication with sponsors and sites."
      ),
      link: '/cases/collaboration-tools',
      icon: Users,
      bgColor: 'bg-amber-100',
      textColor: 'text-amber-500',
      tagBg: 'bg-amber-100',
      tagText: 'text-amber-700',
    },
    {
      id: 6,
      title: t('Regulatory Submission Strategy'),
      category: 'regulatory',
      categoryLabel: t('Regulatory Affairs'),
      industry: t('NDA • Cardiovascular'),
      description: t(
        'How a cardiovascular therapeutics company used CSR analytics to strengthen their NDA submission and reduce review cycles.'
      ),
      link: '/cases/nda-strategy',
      icon: Shield,
      bgColor: 'bg-rose-100',
      textColor: 'text-rose-500',
      tagBg: 'bg-rose-100',
      tagText: 'text-rose-700',
    },
  ];

  // Filter use cases based on active category
  const filteredUseCases =
    activeCategory === 'all'
      ? useCases
      : useCases.filter(useCase => useCase.category === activeCategory);

  return (
    <section className="py-16 md:py-24 bg-gray-50 dark:bg-slate-800/30">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            {t('Use Case Library')}
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            {t(
              'Explore how pharmaceutical companies, biotechs, and medical device manufacturers leverage Concept2Cure in their workflows.'
            )}
          </p>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {categories.map(category => (
            <CategoryButton
              key={category.id}
              label={category.label}
              isActive={activeCategory === category.id}
              onClick={() => setActiveCategory(category.id)}
              color={category.color}
            />
          ))}
        </div>

        {/* Use Case Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {filteredUseCases.map(useCase => (
            <UseCaseCard
              key={useCase.id}
              icon={useCase.icon}
              title={useCase.title}
              category={useCase.categoryLabel}
              industry={useCase.industry}
              description={useCase.description}
              link={useCase.link}
              bgColor={useCase.bgColor}
              textColor={useCase.textColor}
              tagBg={useCase.tagBg}
              tagText={useCase.tagText}
            />
          ))}
        </div>

        {filteredUseCases.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              {t('No use cases found in this category.')}
            </p>
          </div>
        )}

        <div className="mt-12 text-center">
          <Link
            to="/use-cases"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-md hover:shadow-lg"
          >
            {t('View All Use Cases')} <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default UseCaseLibrary;
