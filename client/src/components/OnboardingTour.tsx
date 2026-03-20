import React, { useState } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';

const steps: Step[] = [
  {
    target: "button:has(span:contains('Start Generating'))",
    content: 'Click here to begin generating a Module 3.2 CMC document with AI.',
  },
  {
    target: "button:has(span:contains('View History'))",
    content: 'See and compare all past versions of generated documents.',
  },
  {
    target: "div:has(h3:contains('Regulatory-Ready Output'))",
    content: 'Every document is export-ready for FDA, EMA, and global submissions.',
  },
];

export default function OnboardingTour() {
  const [run, setRun] = useState(true);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finishedStatuses.includes(data.status)) {
      setRun(false);
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      scrollToFirstStep
      showProgress
      showSkipButton
      callback={handleJoyrideCallback}
      styles={{ options: { primaryColor: '#d97757', zIndex: 10000 } }}
    />
  );
}
