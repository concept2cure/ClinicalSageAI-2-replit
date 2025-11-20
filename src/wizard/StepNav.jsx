import React from 'react';

// Simple implementation that doesn't depend on external libraries
const useTranslation = () => {
  return {
    t: key => key,
  };
};

const StepNav = ({ currentStep, totalSteps, onNext, onPrevious, onFinish }) => {
  const { t } = useTranslation();

  return (
    <div className="step-navigation">
      <div className="step-indicator">
        <span>
          {t('Step')}: {currentStep} / {totalSteps}
        </span>
      </div>

      <div className="nav-buttons">
        {currentStep > 1 && (
          <button className="btn-previous" onClick={onPrevious}>
            {t('Previous')}
          </button>
        )}

        {currentStep < totalSteps ? (
          <button className="btn-next" onClick={onNext}>
            {t('Next')}
          </button>
        ) : (
          <button className="btn-finish" onClick={onFinish}>
            {t('Finish')}
          </button>
        )}
      </div>
    </div>
  );
};

export default StepNav;
