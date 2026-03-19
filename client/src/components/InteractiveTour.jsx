import React, { useEffect, useState } from 'react';
import { useTour } from './TourContext';
import Joyride, { STATUS } from 'react-joyride';

// Define the tour steps
const tourSteps = [
  {
    target: '[data-tour="solution-header"]',
    content:
      'Welcome to TrialSage! This section shows our complete regulatory intelligence platform.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="bundle-ind-nda"]',
    content:
      'The IND & NDA Submission Accelerator helps regulatory teams file 60% faster with zero formatting errors.',
    placement: 'top',
  },
  {
    target: '[data-tour="bundle-csr-intel"]',
    content:
      'Our Global CSR Intelligence Library gives you real-time trial performance insights and protocol optimization.',
    placement: 'top',
  },
  {
    target: '[data-tour="bundle-report-review"]',
    content:
      'The Report & Review Toolkit allows medical writers to draft compliant reports in hours with built-in GSPR mapping.',
    placement: 'top',
  },
  {
    target: '[data-tour="bundle-enterprise"]',
    content:
      'The Enterprise Command Center unifies your entire operation with centralized visibility and AI support.',
    placement: 'top',
  },
];

export default function InteractiveTour({ tourCompleted, setTourCompleted }) {
  const { isTourActive, startTour, stopTour } = useTour();
  const [runTour, setRunTour] = useState(false);

  // Sync tour state with the context
  useEffect(() => {
    setRunTour(isTourActive);
  }, [isTourActive]);

  // Handle tour completion and callbacks
  const handleJoyrideCallback = data => {
    const { status, type } = data;

    // Tour ended (either completed or skipped)
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      stopTour();
      setTourCompleted(true);
    }
  };

  // Custom styles for the tour
  const tourStyles = {
    options: {
      zIndex: 10000,
      arrowColor: '#fff',
      backgroundColor: '#fff',
      primaryColor: '#3B82F6',
      textColor: '#4a4a46',
      overlayColor: 'rgba(0, 0, 0, 0.5)',
    },
    tooltipContainer: {
      textAlign: 'left',
    },
    tooltipTitle: {
      fontSize: '16px',
      fontWeight: 'bold',
    },
    tooltipContent: {
      padding: '10px 0',
    },
    buttonBack: {
      marginRight: 10,
      backgroundColor: '#f4f3ee',
    },
    buttonNext: {
      backgroundColor: '#3B82F6',
    },
  };

  return (
    <div className="interactive-tour-container">
      <Joyride
        callback={handleJoyrideCallback}
        continuous
        hideCloseButton
        run={runTour}
        scrollToFirstStep
        showProgress
        showSkipButton
        steps={tourSteps}
        styles={tourStyles}
        disableCloseOnEsc={false}
        disableOverlayClose={false}
        spotlightClicks={false}
      />
    </div>
  );
}
