/**
 * @fileoverview Industry Mode Selector & Onboarding
 * @module concept2cure/components/onboarding/IndustryModeSelector
 * @version 1.0.0
 *
 * @description
 * First-run experience that asks users to identify their organization type
 * and role to customize the entire UX around their actual workflows.
 *
 * This is CRITICAL for the Claude.ai-style personalization:
 * - Organization type determines PRIMARY dashboard
 * - Role determines SPECIALIZED panels and shortcuts
 * - Both together create a tailored experience
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import type { IndustryMode, UserRole } from '../industry';
import {
  Building2,
  Pill,
  Flask,
  Briefcase,
  GraduationCap,
  FileText,
  Users,
  Shield,
  TestTube,
  Stethoscope,
  CheckCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface UserConfiguration {
  industryMode: IndustryMode;
  primaryRole: UserRole;
  secondaryRoles?: UserRole[];
  therapeuticAreas?: string[];
}

interface IndustryModeSelectorProps {
  onComplete: (config: UserConfiguration) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION DATA
// ═══════════════════════════════════════════════════════════════════════════════

const INDUSTRY_OPTIONS: Array<{
  id: IndustryMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  features: string[];
}> = [
  {
    id: 'biotech',
    label: 'Biotech',
    description: 'Small to mid-cap companies with focused pipeline',
    icon: <Flask className="w-8 h-8" />,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    features: [
      'Development pipeline tracking',
      'Funding milestone management',
      'Vendor deliverable oversight',
      'FDA meeting preparation',
    ],
  },
  {
    id: 'pharma',
    label: 'Pharma',
    description: 'Large enterprise with diverse portfolio',
    icon: <Pill className="w-8 h-8" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    features: [
      'Global portfolio management',
      'PDUFA date tracking',
      'Regulatory commitment oversight',
      'Therapeutic area roll-ups',
    ],
  },
  {
    id: 'cro',
    label: 'CRO',
    description: 'Contract research organization',
    icon: <Briefcase className="w-8 h-8" />,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    features: [
      'Client engagement portal',
      'SOW/deliverable management',
      'Resource utilization tracking',
      'Change order workflow',
    ],
  },
  {
    id: 'medtech',
    label: 'MedTech',
    description: 'Medical devices and diagnostics',
    icon: <Stethoscope className="w-8 h-8" />,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    features: [
      '510(k) / PMA workflow',
      'Design history file tracking',
      'Clinical evidence management',
      'Regulatory pathway planning',
    ],
  },
  {
    id: 'academic',
    label: 'Academic',
    description: 'Research institutions and universities',
    icon: <GraduationCap className="w-8 h-8" />,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    features: [
      'Grant/study management',
      'Publication tracking',
      'IRB/ethics workflow',
      'Collaboration tools',
    ],
  },
];

const ROLE_OPTIONS: Array<{
  id: UserRole;
  label: string;
  description: string;
  icon: React.ReactNode;
  defaultFor?: IndustryMode[];
}> = [
  {
    id: 'regulatory_affairs',
    label: 'Regulatory Affairs',
    description: 'Submissions, interactions, compliance',
    icon: <Shield className="w-6 h-6" />,
    defaultFor: ['biotech', 'pharma'],
  },
  {
    id: 'medical_writer',
    label: 'Medical Writer',
    description: 'Document authoring and review',
    icon: <FileText className="w-6 h-6" />,
    defaultFor: ['cro'],
  },
  {
    id: 'clinical_ops',
    label: 'Clinical Operations',
    description: 'Trial management and execution',
    icon: <TestTube className="w-6 h-6" />,
    defaultFor: ['biotech', 'cro'],
  },
  {
    id: 'medical_affairs',
    label: 'Medical Affairs',
    description: 'Scientific engagement and publications',
    icon: <Stethoscope className="w-6 h-6" />,
    defaultFor: ['pharma'],
  },
  {
    id: 'quality_assurance',
    label: 'Quality Assurance',
    description: 'Compliance and audit readiness',
    icon: <CheckCircle className="w-6 h-6" />,
    defaultFor: ['pharma', 'medtech'],
  },
  {
    id: 'project_manager',
    label: 'Project Manager',
    description: 'Cross-functional coordination',
    icon: <Users className="w-6 h-6" />,
    defaultFor: ['cro', 'biotech'],
  },
  {
    id: 'executive',
    label: 'Executive / Leadership',
    description: 'Strategic oversight and decision-making',
    icon: <Building2 className="w-6 h-6" />,
    defaultFor: ['biotech', 'pharma'],
  },
  {
    id: 'consultant',
    label: 'Consultant',
    description: 'Advisory and specialized expertise',
    icon: <Sparkles className="w-6 h-6" />,
    defaultFor: ['academic'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1: INDUSTRY SELECTION
// ═══════════════════════════════════════════════════════════════════════════════

const IndustryStep: React.FC<{
  selected?: IndustryMode;
  onSelect: (industry: IndustryMode) => void;
}> = ({ selected, onSelect }) => {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-zinc-900">Welcome to Concept2Cure</h2>
        <p className="mt-2 text-zinc-600">
          Let's personalize your workspace. What type of organization are you?
        </p>
      </div>
      
      <div className="grid grid-cols-2 gap-4 max-w-3xl mx-auto">
        {INDUSTRY_OPTIONS.map(industry => (
          <button
            key={industry.id}
            onClick={() => onSelect(industry.id)}
            className={cn(
              'p-5 rounded-xl border text-left transition-all duration-150',
              selected === industry.id
                ? `${industry.bgColor} border-current ${industry.color} ring-2 ring-offset-2`
                : 'bg-white border-zinc-200 hover:border-zinc-300 hover:shadow-md'
            )}
          >
            <div className={cn('mb-4', industry.color)}>{industry.icon}</div>
            <h3 className="text-lg font-semibold text-zinc-900">{industry.label}</h3>
            <p className="text-sm text-zinc-500 mt-1">{industry.description}</p>
            
            <ul className="mt-4 space-y-1">
              {industry.features.map(feature => (
                <li key={feature} className="text-xs text-zinc-500 flex items-center gap-2">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  {feature}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2: ROLE SELECTION
// ═══════════════════════════════════════════════════════════════════════════════

const RoleStep: React.FC<{
  industry: IndustryMode;
  selected?: UserRole;
  onSelect: (role: UserRole) => void;
}> = ({ industry, selected, onSelect }) => {
  // Sort roles by relevance to selected industry
  const sortedRoles = [...ROLE_OPTIONS].sort((a, b) => {
    const aDefault = a.defaultFor?.includes(industry) ? 0 : 1;
    const bDefault = b.defaultFor?.includes(industry) ? 0 : 1;
    return aDefault - bDefault;
  });
  
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-zinc-900">What's your primary role?</h2>
        <p className="mt-2 text-zinc-600">
          This helps us show you the most relevant tools and views.
        </p>
      </div>
      
      <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto">
        {sortedRoles.map(role => {
          const isRecommended = role.defaultFor?.includes(industry);
          
          return (
            <button
              key={role.id}
              onClick={() => onSelect(role.id)}
              className={cn(
                'p-4 rounded-lg border text-left transition-all flex items-start gap-4',
                selected === role.id
                  ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-200'
                  : 'bg-white border-zinc-200 hover:border-zinc-300'
              )}
            >
              <div className={cn(
                'p-2 rounded-lg',
                selected === role.id ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 text-zinc-600'
              )}>
                {role.icon}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-zinc-900">{role.label}</h3>
                  {isRecommended && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-500">{role.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3: CONFIRMATION
// ═══════════════════════════════════════════════════════════════════════════════

const ConfirmationStep: React.FC<{
  industry: IndustryMode;
  role: UserRole;
}> = ({ industry, role }) => {
  const industryConfig = INDUSTRY_OPTIONS.find(i => i.id === industry)!;
  const roleConfig = ROLE_OPTIONS.find(r => r.id === role)!;
  
  return (
    <div className="space-y-6 text-center">
      <div className="w-14 h-14 mx-auto rounded-lg bg-blue-600 flex items-center justify-center">
        <Sparkles className="w-10 h-10 text-white" />
      </div>
      
      <div>
        <h2 className="text-2xl font-semibold text-zinc-900">You're all set!</h2>
        <p className="mt-2 text-zinc-600">
          Your workspace is configured for optimal productivity.
        </p>
      </div>
      
      <div className="flex justify-center gap-4">
        <div className={cn(
          'px-6 py-4 rounded-xl',
          industryConfig.bgColor
        )}>
          <div className={cn('mb-2', industryConfig.color)}>{industryConfig.icon}</div>
          <p className={cn('font-semibold', industryConfig.color)}>{industryConfig.label}</p>
        </div>
        
        <div className="flex items-center">
          <ArrowRight className="w-6 h-6 text-zinc-400" />
        </div>
        
        <div className="px-6 py-4 rounded-xl bg-blue-50">
          <div className="mb-2 text-blue-600">{roleConfig.icon}</div>
          <p className="font-semibold text-blue-600">{roleConfig.label}</p>
        </div>
      </div>
      
      <div className="text-sm text-zinc-500">
        You can always change these settings later in your profile.
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const IndustryModeSelector: React.FC<IndustryModeSelectorProps> = ({
  onComplete,
  className,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [industry, setIndustry] = useState<IndustryMode>();
  const [role, setRole] = useState<UserRole>();
  
  const handleIndustrySelect = (selected: IndustryMode) => {
    setIndustry(selected);
    // Auto-advance after selection with a small delay
    setTimeout(() => setStep(2), 300);
  };
  
  const handleRoleSelect = (selected: UserRole) => {
    setRole(selected);
    setTimeout(() => setStep(3), 300);
  };
  
  const handleComplete = () => {
    if (industry && role) {
      onComplete({
        industryMode: industry,
        primaryRole: role,
      });
    }
  };
  
  return (
    <div className={cn(
      'min-h-screen bg-zinc-50 flex items-center justify-center p-8',
      className
    )}>
      <div className="w-full max-w-4xl">
        {/* Progress indicator */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(s => (
              <React.Fragment key={s}>
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors duration-150',
                  step >= s ? 'bg-blue-600 text-white' : 'bg-zinc-200 text-zinc-500'
                )}>
                  {step > s ? <CheckCircle className="w-4 h-4" /> : s}
                </div>
                {s < 3 && (
                  <div className={cn(
                    'w-12 h-1 rounded-full transition-colors duration-150',
                    step > s ? 'bg-blue-600' : 'bg-zinc-200'
                  )} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        
        {/* Content */}
        <div className="bg-white rounded-xl shadow-xl p-8">
          {step === 1 && (
            <IndustryStep
              selected={industry}
              onSelect={handleIndustrySelect}
            />
          )}
          
          {step === 2 && industry && (
            <RoleStep
              industry={industry}
              selected={role}
              onSelect={handleRoleSelect}
            />
          )}
          
          {step === 3 && industry && role && (
            <ConfirmationStep
              industry={industry}
              role={role}
            />
          )}
          
          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t border-zinc-200">
            <button
              onClick={() => setStep(Math.max(1, step - 1) as 1 | 2 | 3)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150',
                step === 1 ? 'invisible' : 'text-zinc-600 hover:bg-zinc-100'
              )}
            >
              Back
            </button>
            
            {step === 3 ? (
              <button
                onClick={handleComplete}
                className="px-6 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setStep(Math.min(3, step + 1) as 1 | 2 | 3)}
                disabled={(step === 1 && !industry) || (step === 2 && !role)}
                className={cn(
                  'px-6 py-2 text-sm font-medium rounded-lg flex items-center gap-2',
                  ((step === 1 && industry) || (step === 2 && role))
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                )}
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndustryModeSelector;
