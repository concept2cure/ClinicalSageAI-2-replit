import React, { createContext, useContext, useState, useCallback } from 'react';
import { HelpCircle } from 'lucide-react';

// Create the context
const TourContext = createContext(null);

// Custom hook to access the tour context
export const useTour = () => {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
};

export function TourProvider({ children }) {
  // State to track if tour is active
  const [isTourActive, setIsTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  // Start tour function
  const startTour = useCallback(() => {
    setTourStep(0);
    setIsTourActive(true);
  }, []);

  // Stop tour function
  const stopTour = useCallback(() => {
    setIsTourActive(false);
  }, []);

  // Next step function
  const nextStep = useCallback(() => {
    setTourStep(prev => prev + 1);
  }, []);

  // Previous step function
  const prevStep = useCallback(() => {
    setTourStep(prev => Math.max(0, prev - 1));
  }, []);

  // Context value
  const value = {
    isTourActive,
    tourStep,
    startTour,
    stopTour,
    nextStep,
    prevStep,
  };

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

// Help button component that starts the tour
export function TourHelpButton() {
  const { startTour } = useTour();

  return (
    <button
      onClick={startTour}
      className="bg-blue-600 text-white p-2 rounded-full shadow-lg hover:bg-blue-700 transition-colors"
      title="Start product tour"
      aria-label="Start interactive product tour"
    >
      <HelpCircle size={20} />
    </button>
  );
}
