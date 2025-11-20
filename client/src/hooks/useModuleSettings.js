
import { useState, useEffect } from 'react';

export const useModuleSettings = () => {
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('moduleSettings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    const handleSettingsChange = (event) => {
      setSettings(event.detail.modules);
    };

    window.addEventListener('moduleSettingsChanged', handleSettingsChange);
    
    return () => {
      window.removeEventListener('moduleSettingsChanged', handleSettingsChange);
    };
  }, []);

  const isModuleEnabled = (moduleId) => {
    const module = settings.find(m => m.id === moduleId);
    return module ? module.enabled : true; // Default to true if not found
  };

  const getEnabledModules = () => {
    return settings.filter(m => m.enabled);
  };

  return {
    settings,
    isModuleEnabled,
    getEnabledModules
  };
};
