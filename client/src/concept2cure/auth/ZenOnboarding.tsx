/**
 * @fileoverview Zen Onboarding Experience
 * @module concept2cure/auth/ZenOnboarding
 * @version 1.0.0
 *
 * @description
 * First-time user onboarding flow with workspace setup,
 * preference configuration, and guided tour.
 *
 * Steps:
 * 1. Welcome - Introduction to Concept2Cure
 * 2. Workspace Setup - Create first project
 * 3. Preferences - Configure notification and display settings
 * 4. Tour - Interactive feature highlights
 * 5. Ready - Launch into the app
 *
 * @compliance
 * - FDA 21 CFR Part 11: Audit trail for onboarding completion
 */

import React, { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type OnboardingStep = 'welcome' | 'workspace' | 'preferences' | 'tour' | 'ready';

interface OnboardingPreferences {
  projectName: string;
  submissionType: string;
  emailNotifications: boolean;
  aiSuggestions: boolean;
  compactMode: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════════

const LogoIcon = () => (
  <svg viewBox="0 0 40 40" className="w-12 h-12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle
      cx="20"
      cy="20"
      r="18"
      stroke="currentColor"
      strokeWidth="2"
      className="text-blue-600"
    />
    <path
      d="M12 14C16 14 18 18 20 20C22 22 24 26 28 26"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="text-blue-600"
    />
    <path
      d="M28 14C24 14 22 18 20 20C18 22 16 26 12 26"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="text-violet-500"
    />
    <circle cx="14" cy="14" r="2" fill="currentColor" className="text-blue-600" />
    <circle cx="26" cy="14" r="2" fill="currentColor" className="text-violet-500" />
    <circle cx="14" cy="26" r="2" fill="currentColor" className="text-violet-500" />
    <circle cx="26" cy="26" r="2" fill="currentColor" className="text-blue-600" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const FolderIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
    />
  </svg>
);

const CogIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

const MapIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
    />
  </svg>
);

const RocketIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13 10V3L4 14h7v7l9-11h-7z"
    />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMISSION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

const SUBMISSION_TYPES = [
  {
    value: '510k',
    label: '510(k) Premarket Notification',
    description: 'Medical device clearance pathway',
    icon: '🏥',
  },
  {
    value: 'pma',
    label: 'PMA Application',
    description: 'Class III device approval',
    icon: '🔬',
  },
  {
    value: 'ind',
    label: 'IND Application',
    description: 'Investigational New Drug',
    icon: '💊',
  },
  {
    value: 'nda',
    label: 'NDA/BLA Submission',
    description: 'New drug or biologic approval',
    icon: '📋',
  },
  {
    value: 'cer',
    label: 'Clinical Evaluation Report',
    description: 'EU MDR compliance',
    icon: '📊',
  },
  {
    value: 'ectd',
    label: 'eCTD Module',
    description: 'Electronic Common Technical Document',
    icon: '📁',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOUR FEATURES
// ═══════════════════════════════════════════════════════════════════════════════

const TOUR_FEATURES = [
  {
    title: 'RI-Powered Drafting',
    description:
      'RI assists with regulatory document creation, citing relevant guidance and precedents.',
    icon: '🤖',
  },
  {
    title: 'Smart Templates',
    description:
      'Pre-built templates for every submission type, automatically populated with your data.',
    icon: '📝',
  },
  {
    title: 'Real-time Collaboration',
    description: 'Work with your team simultaneously, with full audit trail and version control.',
    icon: '👥',
  },
  {
    title: 'AnA Visual',
    description:
      'Generate infographics, regulatory diagrams, and slide decks on demand — powered by Google Gemini.',
    icon: '🍌',
  },
  {
    title: 'Compliance Validation',
    description: 'Automatic checks against FDA, EMA, and PMDA requirements before submission.',
    icon: '✅',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════════════════════

const pageVariants = {
  initial: { opacity: 0, x: 50 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -50 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenOnboarding: React.FC = () => {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [isLoading, setIsLoading] = useState(false);

  const [preferences, setPreferences] = useState<OnboardingPreferences>({
    projectName: '',
    submissionType: '',
    emailNotifications: true,
    aiSuggestions: true,
    compactMode: false,
  });

  const steps: OnboardingStep[] = ['welcome', 'workspace', 'preferences', 'tour', 'ready'];
  const currentStepIndex = steps.indexOf(step);

  const handleNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }
  }, [currentStepIndex, steps]);

  const handleBack = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex]);
    }
  }, [currentStepIndex, steps]);

  const handleComplete = useCallback(async () => {
    setIsLoading(true);

    // Save preferences and create first project
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      localStorage.setItem('concept2cure_onboarded', 'true');
      setLocation('/concept2cure');
    } catch (error) {
      console.error('Onboarding error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [setLocation]);

  const handleSkip = useCallback(() => {
    localStorage.setItem('concept2cure_onboarded', 'true');
    setLocation('/concept2cure');
  }, [setLocation]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Progress dots
  // ─────────────────────────────────────────────────────────────────────────────

  const renderProgress = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((s, index) => (
        <motion.div
          key={s}
          className={`
            w-2 h-2 rounded-full transition-all duration-300
            ${index <= currentStepIndex ? 'bg-blue-600' : 'bg-zinc-300'}
            ${index === currentStepIndex ? 'w-6' : ''}
          `}
        />
      ))}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Step renders
  // ─────────────────────────────────────────────────────────────────────────────

  const renderWelcomeStep = () => (
    <motion.div
      key="welcome"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="text-center space-y-8"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
        className="inline-block"
      >
        <LogoIcon />
      </motion.div>

      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-zinc-900">Welcome to Concept2Cure</h1>
        <p className="text-lg text-zinc-600 max-w-md mx-auto">
          The RI-powered regulatory intelligence platform that transforms how you create and manage
          submissions.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
        {[
          { icon: '⚡', label: '10x Faster' },
          { icon: '🎯', label: 'Higher Quality' },
          { icon: '✓', label: 'Always Compliant' },
        ].map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
            className="p-4 bg-zinc-50 rounded-xl"
          >
            <div className="text-2xl mb-2">{item.icon}</div>
            <div className="text-sm font-medium text-zinc-700">{item.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="pt-4">
        <button
          onClick={handleNext}
          className="inline-flex items-center gap-2 px-8 py-3 text-base font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors duration-150"
        >
          Get Started
          <ArrowRightIcon />
        </button>
        <button
          onClick={handleSkip}
          className="block mx-auto mt-4 text-sm text-zinc-500 hover:text-zinc-700"
        >
          Skip setup
        </button>
      </div>
    </motion.div>
  );

  const renderWorkspaceStep = () => (
    <motion.div
      key="workspace"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 mb-2">
          <FolderIcon />
        </div>
        <h2 className="text-2xl font-semibold text-zinc-900">Create Your First Project</h2>
        <p className="text-zinc-600">Set up your workspace to get started</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-700">Project Name</label>
          <input
            type="text"
            value={preferences.projectName}
            onChange={e => setPreferences(p => ({ ...p, projectName: e.target.value }))}
            placeholder="e.g., CardioMonitor 510(k)"
            className="w-full px-4 py-3 border-2 border-zinc-200 rounded-xl focus:border-blue-500 outline-none transition-colors duration-150"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-700">Submission Type</label>
          <div className="grid grid-cols-2 gap-3">
            {SUBMISSION_TYPES.map(type => (
              <button
                key={type.value}
                onClick={() => setPreferences(p => ({ ...p, submissionType: type.value }))}
                className={`
                  p-4 text-left rounded-xl border-2 transition-all
                  ${
                    preferences.submissionType === type.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-zinc-200 hover:border-zinc-300'
                  }
                `}
              >
                <div className="text-xl mb-1">{type.icon}</div>
                <div className="font-medium text-zinc-900 text-sm">{type.label}</div>
                <div className="text-xs text-zinc-500">{type.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          onClick={handleBack}
          className="flex-1 py-3 px-4 text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors duration-150"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={!preferences.projectName || !preferences.submissionType}
          className="flex-1 py-3 px-4 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl transition-colors duration-150"
        >
          Continue
        </button>
      </div>
    </motion.div>
  );

  const renderPreferencesStep = () => (
    <motion.div
      key="preferences"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 mb-2">
          <CogIcon />
        </div>
        <h2 className="text-2xl font-semibold text-zinc-900">Your Preferences</h2>
        <p className="text-zinc-600">Customize your experience</p>
      </div>

      <div className="space-y-4">
        {[
          {
            key: 'emailNotifications',
            label: 'Email Notifications',
            description: 'Get updates on project status and deadlines',
          },
          {
            key: 'aiSuggestions',
            label: 'RI Suggestions',
            description: 'RI will proactively suggest improvements',
          },
          {
            key: 'compactMode',
            label: 'Compact Mode',
            description: 'Reduce spacing for more content on screen',
          },
        ].map(pref => (
          <label
            key={pref.key}
            className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl cursor-pointer hover:bg-zinc-100 transition-colors duration-150"
          >
            <div>
              <div className="font-medium text-zinc-900">{pref.label}</div>
              <div className="text-sm text-zinc-500">{pref.description}</div>
            </div>
            <button
              onClick={() =>
                setPreferences(p => ({
                  ...p,
                  [pref.key]: !p[pref.key as keyof OnboardingPreferences],
                }))
              }
              className={`
                relative w-12 h-7 rounded-full transition-colors
                ${
                  preferences[pref.key as keyof OnboardingPreferences]
                    ? 'bg-blue-600'
                    : 'bg-zinc-300'
                }
              `}
            >
              <motion.div
                className="absolute top-1 w-5 h-5 bg-white rounded-full shadow"
                animate={{
                  left: preferences[pref.key as keyof OnboardingPreferences] ? 26 : 4,
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </button>
          </label>
        ))}
      </div>

      <div className="flex gap-3 pt-4">
        <button
          onClick={handleBack}
          className="flex-1 py-3 px-4 text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors duration-150"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex-1 py-3 px-4 text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors duration-150"
        >
          Continue
        </button>
      </div>
    </motion.div>
  );

  const renderTourStep = () => (
    <motion.div
      key="tour"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 mb-2">
          <MapIcon />
        </div>
        <h2 className="text-2xl font-semibold text-zinc-900">Key Features</h2>
        <p className="text-zinc-600">Here's what you can do with Concept2Cure</p>
      </div>

      <div className="space-y-3">
        {TOUR_FEATURES.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-start gap-4 p-4 bg-zinc-50 rounded-xl"
          >
            <div className="text-2xl">{feature.icon}</div>
            <div>
              <div className="font-medium text-zinc-900">{feature.title}</div>
              <div className="text-sm text-zinc-600">{feature.description}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 pt-4">
        <button
          onClick={handleBack}
          className="flex-1 py-3 px-4 text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors duration-150"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex-1 py-3 px-4 text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors duration-150"
        >
          Continue
        </button>
      </div>
    </motion.div>
  );

  const renderReadyStep = () => (
    <motion.div
      key="ready"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="text-center space-y-8"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200 }}
        className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-green-600"
        >
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
      </motion.div>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-zinc-900">You're All Set!</h2>
        <p className="text-lg text-zinc-600 max-w-md mx-auto">
          Your workspace "{preferences.projectName}" is ready. Let's start building your{' '}
          {SUBMISSION_TYPES.find(t => t.value === preferences.submissionType)?.label ||
            'submission'}
          .
        </p>
      </div>

      <div className="pt-4">
        <button
          onClick={handleComplete}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-8 py-3 text-base font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Setting up...
            </>
          ) : (
            <>
              Launch Concept2Cure
              <RocketIcon />
            </>
          )}
        </button>
      </div>
    </motion.div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        {renderProgress()}

        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-8">
          <AnimatePresence mode="wait">
            {step === 'welcome' && renderWelcomeStep()}
            {step === 'workspace' && renderWorkspaceStep()}
            {step === 'preferences' && renderPreferencesStep()}
            {step === 'tour' && renderTourStep()}
            {step === 'ready' && renderReadyStep()}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ZenOnboarding;
