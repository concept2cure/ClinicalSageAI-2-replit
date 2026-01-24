import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

// Define the context type
type ResearchCompanionContextType = {
  isEnabled: boolean;
  isVisible: boolean;
  showCompanion: () => void;
  hideCompanion: () => void;
  toggleCompanion: () => void;
  composeMessage: (message: string) => void;
  currentPageContext: string;
  apiKey: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
};

// Create the context with default values
const ResearchCompanionContext = createContext<ResearchCompanionContextType | undefined>(undefined);

// Local Storage Keys
const API_KEY_STORAGE_KEY = "research_companion_api_key";
const ENABLED_STORAGE_KEY = "research_companion_enabled";

// Provider component
export const ResearchCompanionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [currentPageContext, setCurrentPageContext] = useState<string>("");
  const [location] = useLocation();
  const { toast } = useToast();

  // Initialize state from localStorage
  useEffect(() => {
    try {
      const storedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      const storedEnabled = localStorage.getItem(ENABLED_STORAGE_KEY);

      if (storedApiKey) {
        setApiKeyState(storedApiKey);
        setIsEnabled(storedEnabled === "true");
      }
    } catch (error) {
      console.error("Error loading Research Companion settings:", error);
    }
  }, []);

  // Update page context when location changes
  useEffect(() => {
    const path = location.split("/").filter(Boolean);
    let context = "Dashboard";

    if (path.length > 0) {
      // Create a more human-readable context based on the current path
      if (path[0] === "csr-insights") {
        context = "CSR Insights";
      } else if (path[0] === "protocol-generator") {
        context = "Protocol Generator";
      } else if (path[0] === "study-design-agent") {
        context = "Study Design Agent";
      } else if (path[0] === "enhanced-cer-dashboard") {
        context = "Enhanced CER Dashboard";
      } else if (path[0] === "settings") {
        context = "Settings";
      } else {
        // Convert kebab-case to Title Case
        context = path[0]
          .split("-")
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
      }
    }

    setCurrentPageContext(context);
  }, [location]);

  const showCompanion = () => {
    if (!isEnabled) {
      // toast call replaced
  // Original: toast({
        title: "Research Companion Disabled",
        description: "Please add your API key in settings to enable the Research Companion.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Research Companion Disabled",
        description: "Please add your API key in settings to enable the Research Companion.",
        variant: "destructive",
      });
      return;
    }
    setIsVisible(true);
  };

  const hideCompanion = () => {
    setIsVisible(false);
  };

  const toggleCompanion = () => {
    if (isVisible) {
      hideCompanion();
    } else {
      showCompanion();
    }
  };

  const composeMessage = (message: string) => {
    // This is a placeholder for when we actually want to send a message
    // to the Research Companion programmatically
    if (isEnabled && message.trim()) {
      showCompanion();
      // In a real implementation, we would send the message to the companion
    }
  };

  const setApiKey = (key: string) => {
    try {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
      setApiKeyState(key);
      setIsEnabled(true);
      localStorage.setItem(ENABLED_STORAGE_KEY, "true");
      
      // toast call replaced
  // Original: toast({
        title: "API Key Saved",
        description: "Your Research Companion is now enabled.",
      })
  console.log('Toast would show:', {
        title: "API Key Saved",
        description: "Your Research Companion is now enabled.",
      });
    } catch (error) {
      console.error("Error saving Research Companion API key:", error);
      // toast call replaced
  // Original: toast({
        title: "Error Saving API Key",
        description: "There was a problem saving your API key. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error Saving API Key",
        description: "There was a problem saving your API key. Please try again.",
        variant: "destructive",
      });
    }
  };

  const clearApiKey = () => {
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      setApiKeyState(null);
      setIsEnabled(false);
      localStorage.setItem(ENABLED_STORAGE_KEY, "false");
      setIsVisible(false);
      
      // toast call replaced
  // Original: toast({
        title: "API Key Removed",
        description: "Research Companion has been disabled.",
      })
  console.log('Toast would show:', {
        title: "API Key Removed",
        description: "Research Companion has been disabled.",
      });
    } catch (error) {
      console.error("Error clearing Research Companion API key:", error);
    }
  };

  const value = {
    isEnabled,
    isVisible,
    showCompanion,
    hideCompanion,
    toggleCompanion,
    composeMessage,
    currentPageContext,
    apiKey,
    setApiKey,
    clearApiKey,
  };

  return (
    <ResearchCompanionContext.Provider value={value}>
      {children}
    </ResearchCompanionContext.Provider>
  );
};

// Hook to use the Research Companion context
export const useResearchCompanion = () => {
  const context = useContext(ResearchCompanionContext);
  
  if (context === undefined) {
    throw new Error("useResearchCompanion must be used within a ResearchCompanionProvider");
  }
  
  return context;
};