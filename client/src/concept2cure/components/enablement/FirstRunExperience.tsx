/**
 * FirstRunExperience — Value-first onboarding.
 *
 * 4 screens:
 *   1. Welcome + client track (Pharma or Device)
 *   2. Quick setup (role + submission type + region)
 *   3. Create first project (name + product)
 *   4. You're set (confidence checkpoint + suggested first action)
 *
 * Design: calm, fast, no agent architecture, no auto-advance.
 * AnA is the single guide identity. No Dr. Sage.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiRequest } from '@/lib/queryClient';
import { Input } from '@/components/ui/input';

// ─── Props ──────────────────────────────────────────────────────────────────

interface FirstRunExperienceProps {
  onComplete: (selectedRole?: string, options?: { projectId?: string; action?: string }) => void;
  onSkip: () => void;
  existingProjects?: Array<{ id: string; name: string; type?: string }>;
  userName?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TOTAL_SCREENS = 4;

type ClientTrack = 'pharma' | 'device';

const PHARMA_ROLES = [
  { id: 'regulatory-writer', label: 'Regulatory Writer' },
  { id: 'regulatory-strategist', label: 'Strategist' },
  { id: 'quality-cmc', label: 'Quality / CMC' },
  { id: 'clinical-operations', label: 'Clinical Operations' },
  { id: 'executive-overview', label: 'Executive / PM' },
];

const DEVICE_ROLES = [
  { id: 'regulatory-writer', label: 'Regulatory Writer' },
  { id: 'regulatory-strategist', label: 'Strategist' },
  { id: 'quality-cmc', label: 'Quality / CMC' },
  { id: 'device-engineer', label: 'Device Engineer' },
  { id: 'executive-overview', label: 'Executive / PM' },
];

const PHARMA_TYPES = [
  { id: 'IND', label: 'IND', description: 'Investigational New Drug' },
  { id: 'NDA', label: 'NDA', description: 'New Drug Application' },
  { id: 'BLA', label: 'BLA', description: 'Biologics License' },
  { id: 'MAA', label: 'MAA', description: 'Marketing Authorization (EMA)' },
];

const DEVICE_TYPES = [
  { id: '510K', label: '510(k)', description: 'Premarket Notification' },
  { id: 'PMA', label: 'PMA', description: 'Premarket Approval' },
  { id: 'DE_NOVO', label: 'De Novo', description: 'Novel Device Classification' },
  { id: 'IVDR', label: 'IVDR', description: 'In Vitro Diagnostic Regulation' },
];

const REGIONS = [
  { id: 'FDA', label: 'FDA (US)' },
  { id: 'EMA', label: 'EMA (EU)' },
  { id: 'PMDA', label: 'PMDA (Japan)' },
  { id: 'Health Canada', label: 'Health Canada' },
  { id: 'TGA', label: 'TGA (Australia)' },
  { id: 'MHRA', label: 'MHRA (UK)' },
];

const fadeUp = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};

// ─── Screen 1: Welcome + Track ──────────────────────────────────────────────

function WelcomeScreen({
  userName,
  track,
  onSelectTrack,
}: {
  userName?: string;
  track: ClientTrack | null;
  onSelectTrack: (t: ClientTrack) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <h1 className="text-base font-semibold text-stone-900">
        {userName ? `Welcome, ${userName}` : 'Welcome to Concept2Cure'}
      </h1>
      <p className="text-sm text-stone-500 mt-2 max-w-md">
        We'll tailor your templates, compliance rules, and regulatory guidance based on your pathway.
      </p>

      <div className="mt-10 max-w-sm w-full space-y-3">
        <p className="text-xs font-medium text-stone-400 uppercase tracking-wider text-left">
          Your regulatory pathway
        </p>
        {([
          { id: 'pharma' as ClientTrack, label: 'Pharma & Biotech', description: 'IND, NDA, BLA — CTD Module 1-5 structure, ICH guidelines' },
          { id: 'device' as ClientTrack, label: 'Medical Device & Diagnostics', description: '510(k), PMA, De Novo, CER — FDA eSTAR, EU MDR compliance' },
        ]).map(option => (
          <button
            key={option.id}
            onClick={() => onSelectTrack(option.id)}
            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
              track === option.id
                ? 'border-stone-900 bg-stone-50'
                : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
            }`}
          >
            <span className="text-sm font-medium text-stone-900">{option.label}</span>
            <span className="text-xs text-stone-400 block mt-0.5">{option.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Screen 2: Quick Setup ──────────────────────────────────────────────────

function SetupScreen({
  track,
  role,
  submissionType,
  region,
  onSelectRole,
  onSelectType,
  onSelectRegion,
}: {
  track: ClientTrack;
  role: string | null;
  submissionType: string | null;
  region: string | null;
  onSelectRole: (id: string) => void;
  onSelectType: (id: string) => void;
  onSelectRegion: (id: string) => void;
}) {
  const roles = track === 'device' ? DEVICE_ROLES : PHARMA_ROLES;
  const types = track === 'device' ? DEVICE_TYPES : PHARMA_TYPES;

  return (
    <div className="flex flex-col items-center h-full px-8 pt-16 overflow-y-auto">
      <h2 className="text-base font-medium text-stone-900 mb-1">Quick setup</h2>
      <p className="text-sm text-stone-500 mb-8">Your role determines which templates and checklists appear first. Your submission type sets the regulatory structure. Your agency sets compliance rules.</p>

      <div className="max-w-sm w-full space-y-6">
        {/* Role */}
        <div>
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Your role</p>
          <div className="flex flex-wrap gap-2">
            {roles.map(r => (
              <button
                key={r.id}
                onClick={() => onSelectRole(r.id)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  role === r.id
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 text-stone-600 hover:border-stone-300'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submission type */}
        <div>
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Submission type</p>
          <div className="flex flex-wrap gap-2">
            {types.map(t => (
              <button
                key={t.id}
                onClick={() => onSelectType(t.id)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  submissionType === t.id
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 text-stone-600 hover:border-stone-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Region */}
        <div>
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Target agency</p>
          <div className="flex flex-wrap gap-2">
            {REGIONS.map(r => (
              <button
                key={r.id}
                onClick={() => onSelectRegion(r.id)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  region === r.id
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 text-stone-600 hover:border-stone-300'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 3: Create Project ───────────────────────────────────────────────

function CreateProjectScreen({
  projectName,
  productName,
  submissionType,
  onChangeProjectName,
  onChangeProductName,
  isCreating,
  createError,
}: {
  projectName: string;
  productName: string;
  submissionType: string | null;
  onChangeProjectName: (v: string) => void;
  onChangeProductName: (v: string) => void;
  isCreating: boolean;
  createError: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <h2 className="text-base font-medium text-stone-900 mb-1">Create your first project</h2>
      <p className="text-sm text-stone-500 mb-8">
        {submissionType
          ? `Your ${submissionType} project is where all regulatory documents, evidence, and review workflows live. AnA will help you build each section.`
          : 'Your project organizes all documents, evidence, and workflows for a single regulatory submission.'}
      </p>

      {createError && (
        <div className="max-w-sm w-full mb-4 px-4 py-3 rounded-lg bg-stone-100 text-stone-800 text-sm">
          Project creation failed. Check your connection and try again.
        </div>
      )}

      <div className="max-w-sm w-full space-y-4">
        <div>
          <label htmlFor="project-name" className="text-xs font-medium text-stone-500 block mb-1.5">
            Project name
          </label>
          <Input
            id="project-name"
            type="text"
            value={projectName}
            onChange={e => onChangeProjectName(e.target.value)}
            placeholder="e.g. Compound X IND Submission"
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="product-name" className="text-xs font-medium text-stone-500 block mb-1.5">
            Product or device name <span className="text-stone-300">(optional)</span>
          </label>
          <Input
            id="product-name"
            type="text"
            value={productName}
            onChange={e => onChangeProductName(e.target.value)}
            placeholder="e.g. Compound X, DeviceY Pro"
          />
        </div>
      </div>

      {isCreating && (
        <p className="text-xs text-stone-400 mt-6">Creating project...</p>
      )}
    </div>
  );
}

// ─── Screen 4: You're Set ───────────────────────────────────────────────────

function ConfidenceScreen({
  track,
  submissionType,
  onAction,
}: {
  track: ClientTrack;
  submissionType: string | null;
  onAction: (action: string) => void;
}) {
  const suggestions = track === 'device'
    ? [
        { id: 'work', label: 'Start in Work', description: 'Open the document workspace' },
        { id: 'medical-device', label: 'Open Medical Device Workspace', description: '510(k), PMA, De Novo, CER — adapts to your project type' },
        { id: 'vault', label: 'Open Vault', description: 'Browse files and evidence' },
      ]
    : [
        { id: 'work', label: 'Start in Work', description: 'Open the document workspace' },
        { id: 'apps', label: 'Browse AI Assistants', description: 'Explore builders and specialist tools' },
        { id: 'vault', label: 'Open Vault', description: 'Browse files and evidence' },
      ];

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center">
      <h2 className="text-base font-medium text-stone-900 mb-2">You're all set</h2>
      <p className="text-sm text-stone-500 max-w-md">
        Your project is ready. You'll land on your project home where AnA — your regulatory intelligence guide — is ready to help. Ask her to draft sections, check compliance, or guide you through the submission process.
      </p>

      <div className="mt-8 max-w-sm w-full space-y-2">
        <p className="text-xs font-medium text-stone-400 uppercase tracking-wider text-left mb-2">
          What would you like to do first?
        </p>
        {suggestions.map(s => (
          <button
            key={s.id}
            onClick={() => onAction(s.id)}
            className="w-full text-left px-4 py-3 rounded-lg border border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
          >
            <span className="text-sm font-medium text-stone-800">{s.label}</span>
            <span className="text-xs text-stone-400 block mt-0.5">{s.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function FirstRunExperience({
  onComplete,
  onSkip,
  existingProjects = [],
  userName,
}: FirstRunExperienceProps) {
  const [screen, setScreen] = useState(0);

  // Screen 1 state
  const [track, setTrack] = useState<ClientTrack | null>(null);

  // Screen 2 state
  const [role, setRole] = useState<string | null>(null);
  const [submissionType, setSubmissionType] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);

  // Screen 3 state
  const [projectName, setProjectName] = useState('');
  const [productName, setProductName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const canContinue = useCallback((): boolean => {
    if (screen === 0) return track !== null;
    if (screen === 1) return role !== null && submissionType !== null && region !== null;
    if (screen === 2) return projectName.trim().length > 0;
    return true;
  }, [screen, track, role, submissionType, region, projectName]);

  const goNext = useCallback(async () => {
    if (!canContinue()) return;

    // Screen 2 → 3: create the project
    if (screen === 2 && !createdProjectId) {
      setIsCreating(true);
      setCreateError(false);
      try {
        const res = await apiRequest('POST', '/api/concept2cure/projects', {
          name: projectName.trim(),
          submissionType: submissionType || 'IND',
          product: productName.trim() || undefined,
          region: region || 'FDA',
          description: `${submissionType || 'Regulatory'} project`,
        });
        if (res.ok) {
          const json = await res.json();
          const id = json.data?.id ?? json.id;
          if (id) {
            setCreatedProjectId(String(id));
          } else {
            setCreateError(true);
            setIsCreating(false);
            return; // Don't advance — show error on screen 3
          }
        } else {
          setCreateError(true);
          setIsCreating(false);
          return; // Don't advance — show error on screen 3
        }
      } catch {
        setCreateError(true);
        setIsCreating(false);
        return; // Don't advance — show error on screen 3
      }
      setIsCreating(false);
    }

    if (screen < TOTAL_SCREENS - 1) setScreen(s => s + 1);
  }, [screen, canContinue, createdProjectId, projectName, submissionType, productName, region]);

  const goPrev = useCallback(() => {
    if (screen > 0) {
      setScreen(s => {
        const previous = s - 1;
        if (s === 3 && previous === 2) {
          setCreatedProjectId(null);
          setCreateError(false);
        }
        return previous;
      });
    }
  }, [screen]);

  const handleFinish = useCallback((action?: string) => {
    localStorage.setItem('concept2cure_first_run_complete', 'true');
    if (role) localStorage.setItem('concept2cure_user_role', role);
    if (track) localStorage.setItem('concept2cure_client_track', track);
    onComplete(role ?? undefined, {
      projectId: createdProjectId ?? undefined,
      action,
    });
  }, [onComplete, role, track, createdProjectId]);

  const handleSkip = useCallback(() => {
    localStorage.setItem('concept2cure_first_run_complete', 'true');
    onSkip();
  }, [onSkip]);

  useEffect(() => {
    if (existingProjects.length > 0) {
      localStorage.setItem('concept2cure_first_run_complete', 'true');
      onSkip();
    }
  }, [existingProjects.length, onSkip]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSkip]);

  const isLastScreen = screen === TOTAL_SCREENS - 1;

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-white flex flex-col"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Screen content */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={screen} className="absolute inset-0" {...fadeUp}>
            {screen === 0 && (
              <WelcomeScreen userName={userName} track={track} onSelectTrack={setTrack} />
            )}
            {screen === 1 && track && (
              <SetupScreen
                track={track}
                role={role}
                submissionType={submissionType}
                region={region}
                onSelectRole={setRole}
                onSelectType={setSubmissionType}
                onSelectRegion={setRegion}
              />
            )}
            {screen === 2 && (
              <CreateProjectScreen
                projectName={projectName}
                productName={productName}
                submissionType={submissionType}
                onChangeProjectName={setProjectName}
                onChangeProductName={setProductName}
                isCreating={isCreating}
                createError={createError}
              />
            )}
            {screen === 3 && (
              <ConfidenceScreen
                track={track || 'pharma'}
                submissionType={submissionType}
                onAction={action => {
                  handleFinish(action);
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between px-8 pb-8 pt-4">
        <div>
          {screen > 0 && !isLastScreen && (
            <button
              onClick={goPrev}
              className="text-sm text-stone-500 hover:text-stone-700 transition-colors"
            >
              Back
            </button>
          )}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2">
          {Array.from({ length: TOTAL_SCREENS }, (_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === screen ? 'bg-stone-900' : i < screen ? 'bg-stone-400' : 'bg-stone-200'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSkip}
            className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
          >
            Skip
          </button>
          {!isLastScreen && (
            <button
              onClick={goNext}
              disabled={!canContinue() || isCreating}
              className={`text-sm font-medium transition-colors ${
                canContinue() && !isCreating
                  ? 'text-stone-900 hover:underline'
                  : 'text-stone-300 cursor-not-allowed'
              }`}
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
