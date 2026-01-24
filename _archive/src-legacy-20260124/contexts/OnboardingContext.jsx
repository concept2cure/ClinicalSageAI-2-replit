import React, { createContext, useState, useContext, useEffect } from 'react';
import { JoyrideProvider, useJoyride } from '../lightweight-wrappers.jsx';

// Create context
export const OnboardingContext = createContext();

// Custom hook to use the onboarding context
export const useOnboarding = () => useContext(OnboardingContext);

// Define the provider component
export const OnboardingProvider = ({ children }) => {
  // State to track if user has seen onboarding
  const [hasSeenModule32Onboarding, setHasSeenModule32Onboarding] = useState(false);
  const [hasSeenVersionsOnboarding, setHasSeenVersionsOnboarding] = useState(false);
  const [runModule32Tour, setRunModule32Tour] = useState(false);
  const [runVersionsTour, setRunVersionsTour] = useState(false);

  // Joyride steps for module32 page
  const module32Steps = [
    {
      target: '.form-container',
      content:
        'Welcome to the Module 3.2 Generator! This tool helps you create regulatory-ready documentation in minutes.',
      disableBeacon: true,
      placement: 'center',
    },
    {
      target: '.product-name-field',
      content: 'Start by entering your product name. This will be used throughout the document.',
      disableBeacon: true,
    },
    {
      target: '.form-control-fields',
      content:
        'Fill in these key details about your product, manufacturing process, and control strategy.',
      disableBeacon: true,
    },
    {
      target: '.ai-options',
      content:
        'Select intelligence levels for different sections. Higher levels provide more detailed regulatory language.',
      disableBeacon: true,
    },
    {
      target: '.generate-button',
      content:
        "When you're ready, click Generate to create your document. All versions are automatically saved.",
      disableBeacon: true,
    },
  ];

  // Joyride steps for versions page
  const versionsSteps = [
    {
      target: '.versions-container',
      content:
        'Welcome to Document History! Here you can view, compare, and export all your generated documents.',
      disableBeacon: true,
      placement: 'center',
    },
    {
      target: '.version-list',
      content: 'All your previously generated documents appear here, ordered by creation date.',
      disableBeacon: true,
    },
    {
      target: '.comparison-view',
      content:
        'Select any two versions to see exactly what changed between them, with additions and deletions highlighted.',
      disableBeacon: true,
    },
    {
      target: '.export-options',
      content:
        'Export your documents to PDF or Word format, with optional change tracking for regulatory submissions.',
      disableBeacon: true,
    },
  ];

  // Initialize from localStorage
  useEffect(() => {
    const seenModule32 = localStorage.getItem('hasSeenModule32Onboarding') === 'true';
    const seenVersions = localStorage.getItem('hasSeenVersionsOnboarding') === 'true';

    setHasSeenModule32Onboarding(seenModule32);
    setHasSeenVersionsOnboarding(seenVersions);
  }, []);

  // Handler for tour completion
  const handleJoyrideCallback = (data, tourType) => {
    const { status } = data;
    const finishedStatuses = ['FINISHED', 'SKIPPED'];

    if (finishedStatuses.includes(status)) {
      if (tourType === 'module32') {
        setHasSeenModule32Onboarding(true);
        localStorage.setItem('hasSeenModule32Onboarding', 'true');
        setRunModule32Tour(false);
      } else if (tourType === 'versions') {
        setHasSeenVersionsOnboarding(true);
        localStorage.setItem('hasSeenVersionsOnboarding', 'true');
        setRunVersionsTour(false);
      }
    }
  };

  // Function to start the module32 tour
  const startModule32Tour = () => {
    setRunModule32Tour(true);
  };

  // Function to start the versions tour
  const startVersionsTour = () => {
    setRunVersionsTour(true);
  };

  // Joyrider styles
  const joyrideStyles = {
    options: {
      primaryColor: '#2563eb', // blue-600
      backgroundColor: '#ffffff',
      textColor: '#374151', // gray-700
      arrowColor: '#ffffff',
      overlayColor: 'rgba(0, 0, 0, 0.5)',
    },
    tooltipContainer: {
      textAlign: 'left',
      padding: '20px',
    },
    buttonNext: {
      backgroundColor: '#2563eb',
      borderRadius: '0.375rem',
      color: '#ffffff',
      fontSize: '14px',
      padding: '8px 12px',
    },
    buttonBack: {
      color: '#6b7280',
      fontSize: '14px',
      marginRight: '10px',
    },
    buttonSkip: {
      color: '#6b7280',
      fontSize: '14px',
    },
  };

  return (
    <OnboardingContext.Provider
      value={{
        hasSeenModule32Onboarding,
        hasSeenVersionsOnboarding,
        startModule32Tour,
        startVersionsTour,
      }}
    >
      {/* Module32 Tour */}
      {runModule32Tour && <JoyrideProvider>{/* Mock Joyride component */}</JoyrideProvider>}

      {/* Versions Tour */}
      {runVersionsTour && <JoyrideProvider>{/* Mock Joyride component */}</JoyrideProvider>}

      {children}
    </OnboardingContext.Provider>
  );
};
