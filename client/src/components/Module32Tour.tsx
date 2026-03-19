import React, { useState, useEffect } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';

const steps: Step[] = [
  {
    target: "button[data-tour='generate-button']",
    content:
      'Submit your molecular and manufacturing inputs here to generate a complete CMC document.',
  },
  {
    target: '#result-section',
    content:
      'Your AI-generated output will appear here. You can download it instantly in multiple formats.',
  },
  {
    target: "a[data-tour='download-pdf']",
    content: 'Click to export your finalized Module 3.2 as a formatted PDF.',
  },
];

export default function Module32Tour() {
  const [run, setRun] = useState(false);

  useEffect(() => {
    const shouldRun = localStorage.getItem('trialsage.seenModule32Tour') !== 'true';
    if (shouldRun) {
      setRun(true);
    }
  }, []);

  const handleCallback = (data: CallBackProps) => {
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(data.status)) {
      localStorage.setItem('trialsage.seenModule32Tour', 'true');
      setRun(false);
    }
  };

  return (
    <Joyride
      run={run}
      steps={steps}
      continuous
      showSkipButton
      scrollToFirstStep
      showProgress
      callback={handleCallback}
      styles={{ options: { zIndex: 9999, primaryColor: '#d97757' } }}
    />
  );
}
