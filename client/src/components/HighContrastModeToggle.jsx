import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { SunMoon } from 'lucide-react'

const HighContrastModeToggle = () => {
  // Get initial state from localStorage if available
  const [highContrastEnabled, setHighContrastEnabled] = useState(() => {
    const saved = localStorage.getItem('high-contrast-mode');
    return saved === 'true';
  });

  // Update body class and localStorage when state changes
  useEffect(() => {
    if (highContrastEnabled) {
      document.body.classList.add('high-contrast-mode');
    } else {
      document.body.classList.remove('high-contrast-mode');
    }

    localStorage.setItem('high-contrast-mode', highContrastEnabled);
  }, [highContrastEnabled]);

  // Toggle high contrast mode
  const toggleHighContrast = () => {
    setHighContrastEnabled(prev => !prev);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleHighContrast}
      className="fixed top-4 right-4 z-50 bg-white text-black border border-black hover:bg-gray-100"
      title={highContrastEnabled ? 'Disable High Contrast Mode' : 'Enable High Contrast Mode'}
    >
      <SunMoon className="h-4 w-4 mr-2" />
      {highContrastEnabled ? 'Standard Mode' : 'High Contrast'}
    </Button>
  );
};

export default HighContrastModeToggle;
